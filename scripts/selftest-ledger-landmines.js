#!/usr/bin/env node
/**
 * selftest-ledger-landmines.js
 * ---------------------------------------------------------------------------
 * v3.74.869 — يجب أن يُرى الحارس وهو يرفض، **وأن يُسمّى ما زُرع**، وألّا
 * يُنذر عن الأشكال التى صُمِّم ليتجاوزها.
 *
 * وهذا الفخّ يحمل عبئاً إضافياً: **يجب أن يُثبت أن مُحلِّل الوصول نفسه
 * يرى الاستيراد الديناميكى النسبى** — فذاك بعينه ما فاتنى فى ٨٦٨ وجعلنى
 * أصف وحدةً حيّة بأنها ميتة.
 *
 *   (أ) وحدةٌ غير موصولة تكتب فى `journal_entries`  ← يجب أن يسقط
 *   (ب) نفسها وقد وُصلت بـ`await import("./…")` نسبى ← يجب ألّا يسقط
 *   (ج) نفسها وقد وُصلت بـ`import … from "@/…"`      ← يجب ألّا يسقط
 *   (د) وحدةٌ غير موصولة لا تكتب فى الدفاتر           ← يجب ألّا يسقط
 *
 * وتُزرع فى `lib/zz-probe-869/` و`app/api/zz-probe-869/`، وتُحذف فى
 * `finally`. لا تمسّ قاعدة بيانات ولا ملفاً قائماً.
 *
 * Usage: node scripts/selftest-ledger-landmines.js
 * ---------------------------------------------------------------------------
 */
const fs = require("fs")
const path = require("path")
const { spawnSync } = require("child_process")

const root = path.resolve(__dirname, "..")
const libDir = path.join(root, "lib", "zz-probe-869")
const apiDir = path.join(root, "app", "api", "zz-probe-869")
const mineFile = path.join(libDir, "mine.ts")
const cleanFile = path.join(libDir, "clean.ts")
const routeFile = path.join(apiDir, "route.ts")

const MINE = `
export async function writeLedger(supabase: any, companyId: string) {
  await supabase.from("journal_entries").insert({ company_id: companyId })
}
`

const CLEAN = `
export function formatSomething(value: number) {
  return value.toFixed(2)
}
`

/** يصل الوحدة عبر استيرادٍ **ديناميكىٍّ نسبى** — الشكل الذى فات بحثى فى ٨٦٨. */
const ROUTE_DYNAMIC = `
export async function GET() {
  const { writeLedger } = await import("../../../lib/zz-probe-869/mine")
  return new Response(String(typeof writeLedger))
}
`

/** يصلها عبر المسار المُستعار الساكن. */
const ROUTE_ALIAS = `
import { writeLedger } from "@/lib/zz-probe-869/mine"
export async function GET() {
  return new Response(String(typeof writeLedger))
}
`

function runGuard() {
  const r = spawnSync(process.execPath, ["scripts/check-ledger-landmines.js", "--list"], {
    encoding: "utf8",
    cwd: root,
    // v3.74.873 — تبع خط الأساس الحقيقى (٣ ← ١ ← صفر) بعد وصل آخر وحدة.
    // ولو بقى ٣ لصار الفخّ يقبل عودة لغمين دون أن يسقط — أى **فخٌّ يحرس رقماً
    // لم يعد قائماً**.
    env: { ...process.env, LEDGER_LANDMINE_BASELINE: "0" },
  })
  return { failed: r.status !== 0, output: `${r.stdout || ""}${r.stderr || ""}` }
}

const cases = [
  {
    name: "وحدةٌ غير موصولة تكتب فى الدفاتر",
    route: null,
    expectFail: true,
    needle: "zz-probe-869/mine",
  },
  {
    name: "وُصلت باستيرادٍ ديناميكىٍّ نسبى (عطب ٨٦٨)",
    route: ROUTE_DYNAMIC,
    expectFail: false,
  },
  {
    name: "وُصلت بمسارٍ مُستعار ساكن",
    route: ROUTE_ALIAS,
    expectFail: false,
  },
]

let ok = true
try {
  fs.mkdirSync(libDir, { recursive: true })
  fs.mkdirSync(apiDir, { recursive: true })
  // وحدةٌ غير موصولة لا تمسّ الدفاتر — يجب ألّا تُحسب أبداً (الحالة د).
  fs.writeFileSync(cleanFile, CLEAN, "utf8")

  for (const c of cases) {
    fs.writeFileSync(mineFile, MINE, "utf8")
    if (c.route) fs.writeFileSync(routeFile, c.route, "utf8")
    else if (fs.existsSync(routeFile)) fs.rmSync(routeFile, { force: true })

    const r = runGuard()

    if (c.expectFail && !r.failed) {
      console.error(`X الحارس لم يرفض: ${c.name}\n  ---- خرج الحارس ----\n${r.output}`)
      ok = false
    } else if (c.expectFail && c.needle && !r.output.includes(c.needle)) {
      console.error(
        `X الحارس سقط على «${c.name}» ولم يذكر «${c.needle}» — فهذا انهيارٌ لا رفض.\n` +
          `  ---- خرج الحارس ----\n${r.output}`
      )
      ok = false
    } else if (!c.expectFail && r.failed) {
      console.error(
        `X الحارس سقط على «${c.name}» وكان يجب ألّا يسقط —\n` +
          `  فمُحلِّل الوصول لا يرى هذا الشكل من الاستيراد.\n` +
          `  ---- خرج الحارس ----\n${r.output}`
      )
      ok = false
    } else {
      console.log(`+ ${c.name}: ${c.expectFail ? "رُفض كما يجب" : "لم يُبلَّغ عنه كما يجب"}`)
    }

    // الحالة (د) داخل كل دورة: الوحدة النظيفة غير الموصولة لا تُذكر أبداً.
    if (r.output.includes("zz-probe-869/clean")) {
      console.error("X الحارس أنذر عن وحدةٍ غير موصولة لا تمسّ الدفاتر — إنذارٌ كاذب.")
      ok = false
    }
  }
} finally {
  for (const d of [libDir, apiDir]) {
    try { fs.rmSync(d, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}

if (!ok) process.exit(1)
console.log(
  "+ ledger-landmine guard proven to refuse an unreachable ledger writer, and to see it\n" +
    "  as reachable through BOTH a relative dynamic import and a static alias import."
)
