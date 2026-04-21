import { config as loadDotenv } from "dotenv"
import { createClient } from "@supabase/supabase-js"

import { NotificationOutboxShadowDispatcherService } from "../../lib/outbox/notification-outbox-shadow-dispatcher.service"
import { NotificationOutboxDriftAnalyzerService } from "../../lib/outbox/notification-outbox-drift-analyzer.service"
import { NotificationOutboxActivationGateService } from "../../lib/outbox/notification-outbox-activation-gate.service"

loadDotenv({ path: ".env.local" })

type SupabaseLike = any

const DEFAULT_TEST_COMPANY_ID = "8ef6338c-1713-4202-98ac-863633b76526"
const BILL_RECEIPT_EVENT_TYPE = "procurement.bill_receipt_posted"

function getArg(flag: string) {
  const index = process.argv.indexOf(flag)
  if (index === -1) return null
  return String(process.argv[index + 1] || "").trim() || null
}

function requireEnv(name: string) {
  const value = String(process.env[name] || "").trim()
  if (!value) {
    throw new Error(`MISSING_ENV: ${name}`)
  }
  return value
}

function createServiceSupabase(): SupabaseLike {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL")
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY")

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    },
  })
}

async function main() {
  const companyId = getArg("--company-id") || DEFAULT_TEST_COMPANY_ID
  const limit = Math.min(Math.max(Number(getArg("--limit") || 50), 1), 200)
  const createdAfter = getArg("--created-after")
  const supabase = createServiceSupabase()

  const shadow = new NotificationOutboxShadowDispatcherService(supabase)
  const drift = new NotificationOutboxDriftAnalyzerService(supabase)
  const gate = new NotificationOutboxActivationGateService(supabase)

  const [shadowResult, driftResult, gateResult] = await Promise.all([
    shadow.simulate({
      companyId,
      eventType: BILL_RECEIPT_EVENT_TYPE,
      createdAfter,
      limit,
      includeUnsupported: true,
    }),
    drift.analyze({
      companyId,
      eventType: BILL_RECEIPT_EVENT_TYPE,
      createdAfter,
      limit,
      includeUnsupported: true,
    }),
    gate.evaluate({
      companyId,
      eventType: BILL_RECEIPT_EVENT_TYPE,
      createdAfter,
      limit,
      includeUnsupported: true,
    }),
  ])

  const gatePolicy = gateResult.policies[0] || null
  const sampleItems = driftResult.items.slice(0, 10).map((item) => ({
    eventId: item.shadow.eventId,
    aggregateId: item.shadow.aggregateId,
    createdAt: item.shadow.createdAt,
    simulationStatus: item.shadow.simulationStatus,
    comparisonStatus: item.comparisonStatus,
    expectedIntentCount: item.expectedIntentCount,
    actualNotificationCount: item.actualNotificationCount,
    matchedIntentCount: item.matchedIntentCount,
    mismatches: item.mismatches.map((mismatch) => mismatch.code),
  }))

  console.log(
    JSON.stringify(
      {
        success: true,
        companyId,
        eventType: BILL_RECEIPT_EVENT_TYPE,
        createdAfter,
        shadowSummary: shadowResult.summary,
        driftSummary: driftResult.summary,
        gateSummary: gateResult.summary,
        gatePolicy,
        sampleItems,
      },
      null,
      2
    )
  )
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        success: false,
        error: String(error instanceof Error ? error.message : error),
      },
      null,
      2
    )
  )
  process.exit(1)
})
