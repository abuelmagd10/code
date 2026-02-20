#!/usr/bin/env tsx
/**
 * ERB Load Test Script - Phase 4
 * اختبار تحمل حقيقي للـ APIs الرئيسية
 *
 * الاستخدام:
 *   npx tsx scripts/load-test.ts --url http://localhost:3000 --users 10 --duration 30
 *
 * المتطلبات:
 *   - خادم التطبيق يعمل
 *   - متغيرات بيئة: LOAD_TEST_TOKEN (JWT token للمصادقة)
 */

const BASE_URL  = process.env.LOAD_TEST_URL      || "http://localhost:3000"
const TOKEN     = process.env.LOAD_TEST_TOKEN    || ""
const USERS     = parseInt(process.env.LOAD_TEST_USERS    || "5",  10)
const DURATION  = parseInt(process.env.LOAD_TEST_DURATION || "30", 10) // seconds

// ── Endpoints to test ──────────────────────────────────────────────
const ENDPOINTS = [
  { name: "Dashboard Stats",    path: "/api/dashboard-stats",                weight: 5 },
  { name: "GL Summary",        path: "/api/general-ledger?summary=true&from=2026-01-01&to=2026-12-31", weight: 3 },
  { name: "Trial Balance",     path: "/api/reports/trial-balance",           weight: 2 },
  { name: "Invoices List",     path: "/api/invoices?page=1&limit=20",        weight: 4 },
  { name: "Accounting Val.",   path: "/api/accounting-validation",           weight: 1 },
]

interface TestResult {
  endpoint: string
  requests: number
  success: number
  failed: number
  totalMs: number
  minMs: number
  maxMs: number
  p50Ms: number
  p95Ms: number
  p99Ms: number
  rps: number
}

// ── Single request ─────────────────────────────────────────────────
async function request(path: string): Promise<{ ok: boolean; ms: number; status: number }> {
  const start = Date.now()
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: {
        "Authorization": TOKEN ? `Bearer ${TOKEN}` : "",
        "Accept":        "application/json",
        "x-company-id": process.env.LOAD_TEST_COMPANY_ID || "",
      },
      signal: AbortSignal.timeout(10000)
    })
    const ms = Date.now() - start
    return { ok: res.ok, ms, status: res.status }
  } catch (e) {
    return { ok: false, ms: Date.now() - start, status: 0 }
  }
}

// ── Worker (virtual user) ──────────────────────────────────────────
async function worker(
  endpointIndex: number,
  results: Map<string, number[]>,
  failures: Map<string, number>,
  stopAt: number
) {
  const ep = ENDPOINTS[endpointIndex]
  const latencies = results.get(ep.name)!

  while (Date.now() < stopAt) {
    const { ok, ms } = await request(ep.path)
    latencies.push(ms)
    if (!ok) failures.set(ep.name, (failures.get(ep.name) || 0) + 1)
    // small jitter
    await new Promise(r => setTimeout(r, Math.random() * 200))
  }
}

// ── Percentile helper ──────────────────────────────────────────────
function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const idx    = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${"═".repeat(60)}`)
  console.log(`  ERB Load Test - Phase 4`)
  console.log(`${"═".repeat(60)}`)
  console.log(`  Base URL:  ${BASE_URL}`)
  console.log(`  Users:     ${USERS} concurrent`)
  console.log(`  Duration:  ${DURATION}s`)
  console.log(`  Endpoints: ${ENDPOINTS.length}`)
  console.log(`${"═".repeat(60)}\n`)

  if (!TOKEN) {
    console.warn("⚠️  No LOAD_TEST_TOKEN set — unauthenticated requests will likely fail with 401")
  }

  const results  = new Map<string, number[]>()
  const failures = new Map<string, number>()
  ENDPOINTS.forEach(ep => { results.set(ep.name, []); failures.set(ep.name, 0) })

  const stopAt = Date.now() + DURATION * 1000

  // ── Dispatch workers ──
  const workers: Promise<void>[] = []
  for (let i = 0; i < USERS; i++) {
    const epIndex = i % ENDPOINTS.length
    workers.push(worker(epIndex, results, failures, stopAt))
  }

  // ── Progress display ──
  const progressInterval = setInterval(() => {
    const elapsed  = Math.round((Date.now() - (stopAt - DURATION * 1000)) / 1000)
    const total    = [...results.values()].reduce((s, arr) => s + arr.length, 0)
    process.stdout.write(`\r  Progress: ${elapsed}s / ${DURATION}s | Requests: ${total}   `)
  }, 500)

  await Promise.all(workers)
  clearInterval(progressInterval)
  console.log("\n")

  // ── Report ──
  const report: TestResult[] = ENDPOINTS.map(ep => {
    const latencies = results.get(ep.name)!
    const failCount = failures.get(ep.name) || 0
    const success   = latencies.length - failCount
    const totalMs   = latencies.reduce((s, v) => s + v, 0)

    return {
      endpoint:  ep.name,
      requests:  latencies.length,
      success,
      failed:    failCount,
      totalMs,
      minMs:     latencies.length ? Math.min(...latencies) : 0,
      maxMs:     latencies.length ? Math.max(...latencies) : 0,
      p50Ms:     percentile(latencies, 50),
      p95Ms:     percentile(latencies, 95),
      p99Ms:     percentile(latencies, 99),
      rps:       latencies.length / DURATION
    }
  })

  // ── Print table ──
  console.log(`${"─".repeat(100)}`)
  console.log(
    "  Endpoint".padEnd(22) +
    "Reqs".padStart(7)    +
    "OK".padStart(7)      +
    "Fail".padStart(7)    +
    "Min ms".padStart(9)  +
    "P50 ms".padStart(9)  +
    "P95 ms".padStart(9)  +
    "P99 ms".padStart(9)  +
    "Max ms".padStart(9)  +
    "RPS".padStart(8)
  )
  console.log(`${"─".repeat(100)}`)

  let totalReqs = 0
  let totalFail = 0

  for (const r of report) {
    totalReqs += r.requests
    totalFail += r.failed
    const failRate = r.requests > 0 ? ((r.failed / r.requests) * 100).toFixed(1) : "0.0"
    const marker   = r.p95Ms > 3000 ? "⚠️" : r.p95Ms > 1000 ? "🟡" : "✅"
    console.log(
      `  ${marker} ${r.endpoint}`.padEnd(24) +
      String(r.requests).padStart(7) +
      String(r.success).padStart(7)  +
      `${r.failed}(${failRate}%)`.padStart(10) +
      `${r.minMs}ms`.padStart(9)     +
      `${r.p50Ms}ms`.padStart(9)     +
      `${r.p95Ms}ms`.padStart(9)     +
      `${r.p99Ms}ms`.padStart(9)     +
      `${r.maxMs}ms`.padStart(9)     +
      r.rps.toFixed(1).padStart(8)
    )
  }

  console.log(`${"─".repeat(100)}`)
  console.log(`  TOTAL: ${totalReqs} requests | ${totalFail} failed (${totalReqs > 0 ? ((totalFail / totalReqs) * 100).toFixed(1) : 0}% failure rate)`)
  console.log(`${"═".repeat(100)}\n`)

  // ── Assessment ──
  const worstP95 = Math.max(...report.map(r => r.p95Ms))
  const failRate  = totalReqs > 0 ? (totalFail / totalReqs) * 100 : 0

  console.log("  📊 Assessment:")
  if (worstP95 < 500 && failRate < 1) {
    console.log("  ✅ EXCELLENT: P95 < 500ms, Failure rate < 1% — Production ready\n")
  } else if (worstP95 < 1000 && failRate < 5) {
    console.log("  🟡 GOOD: P95 < 1s, Failure rate < 5% — Acceptable for most workloads\n")
  } else if (worstP95 < 3000 && failRate < 10) {
    console.log("  🟠 FAIR: P95 < 3s, Failure rate < 10% — Needs optimization\n")
  } else {
    console.log("  🔴 POOR: P95 > 3s or Failure rate > 10% — Critical performance issue\n")
  }

  // ── Recommendations ──
  const slow = report.filter(r => r.p95Ms > 1000)
  if (slow.length > 0) {
    console.log("  🔧 Slow endpoints (P95 > 1s):")
    slow.forEach(r => console.log(`     - ${r.endpoint}: P95=${r.p95Ms}ms → consider DB indexes or caching`))
    console.log()
  }

  process.exit(failRate > 20 ? 1 : 0)
}

main().catch(e => {
  console.error("Load test error:", e)
  process.exit(1)
})
