import { config as loadDotenv } from "dotenv"
import { createClient } from "@supabase/supabase-js"

import { NotificationOutboxDispatcherService } from "../../lib/outbox/notification-outbox-dispatcher.service"
import { NotificationOutboxCanaryHealthService } from "../../lib/outbox/notification-outbox-canary-health.service"
import {
  GOVERNANCE_REPLAY_CANARY_EVENT_TYPES,
  SUPPORTED_NOTIFICATION_OUTBOX_CANARY_EVENT_TYPES,
} from "../../lib/outbox/notification-outbox-activation-policy"

loadDotenv({ path: ".env.local" })

type SupabaseLike = any

type Args = {
  companyId: string
  eventType: string | null
  limit: number
}

const DEFAULT_TEST_COMPANY_ID = "8ef6338c-1713-4202-98ac-863633b76526"

function getArg(flag: string) {
  const index = process.argv.indexOf(flag)
  if (index === -1) return null
  return String(process.argv[index + 1] || "").trim() || null
}

function parseArgs(): Args {
  const limit = Number(getArg("--limit") || 25)
  return {
    companyId: getArg("--company-id") || DEFAULT_TEST_COMPANY_ID,
    eventType: getArg("--event-type"),
    limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 25,
  }
}

function requireEnv(name: string) {
  const value = String(process.env[name] || "").trim()
  if (!value) {
    throw new Error(`MISSING_ENV: ${name}`)
  }
  return value
}

function setCanaryEnv(companyId: string) {
  process.env.NOTIFICATION_OUTBOX_CANARY_COMPANY_IDS =
    process.env.NOTIFICATION_OUTBOX_CANARY_COMPANY_IDS || companyId
}

function setCanaryEventTypes(eventType: string | null) {
  if (process.env.NOTIFICATION_OUTBOX_CANARY_EVENT_TYPES) return
  process.env.NOTIFICATION_OUTBOX_CANARY_EVENT_TYPES = eventType
    ? eventType
    : GOVERNANCE_REPLAY_CANARY_EVENT_TYPES.join(",")
}

function createServiceSupabase() {
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

async function resolveCanaryActorId(supabase: SupabaseLike, companyId: string) {
  const { data, error } = await supabase
    .from("company_members")
    .select("user_id, role")
    .eq("company_id", companyId)
    .in("role", ["owner", "admin", "general_manager"])

  if (error) {
    throw new Error(error.message || "Failed to resolve governance canary actor")
  }

  const rolePriority: Record<string, number> = {
    owner: 1,
    admin: 2,
    general_manager: 3,
  }

  const members = Array.isArray(data) ? data : []
  members.sort(
    (left, right) =>
      (rolePriority[String(left.role || "")] || 99) -
      (rolePriority[String(right.role || "")] || 99)
  )

  const actorId = String(members[0]?.user_id || "").trim()
  if (!actorId) {
    throw new Error(
      "CANARY_ACTOR_NOT_FOUND: no owner/admin/general_manager membership was found for the requested company"
    )
  }

  return {
    actorId,
    actorRole: String(members[0]?.role || "").trim() || null,
  }
}

async function resolveCompanyName(supabase: SupabaseLike, companyId: string) {
  const { data, error } = await supabase
    .from("companies")
    .select("id, name")
    .eq("id", companyId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message || "Failed to resolve company name for canary wave")
  }

  return String(data?.name || "").trim() || null
}

function buildRecommendation(input: {
  dispatchFailed: number
  health: Awaited<ReturnType<NotificationOutboxCanaryHealthService["analyze"]>>
}) {
  const { health, dispatchFailed } = input
  const isGo =
    dispatchFailed === 0 &&
    health.summary.failedEvents === 0 &&
    health.summary.deadLetterEvents === 0 &&
    health.summary.stuckProcessingEvents === 0 &&
    health.summary.orphanNotifications === 0 &&
    health.summary.duplicateDeliveries === 0 &&
    health.summary.driftDetectedEvents === 0 &&
    health.summary.stableLifecycle === true

  return {
    decision: isGo ? "GO" : "STOP",
    rationale: isGo
      ? "No failures, no duplicates, no orphan notifications, and lifecycle/drift stayed stable in the first canary wave."
      : "One or more production canary safety conditions failed; keep canary constrained and do not promote to a wider wave yet.",
  }
}

async function main() {
  const args = parseArgs()
  setCanaryEnv(args.companyId)
  setCanaryEventTypes(args.eventType)

  if (
    args.eventType &&
    !SUPPORTED_NOTIFICATION_OUTBOX_CANARY_EVENT_TYPES.includes(
      args.eventType as (typeof SUPPORTED_NOTIFICATION_OUTBOX_CANARY_EVENT_TYPES)[number]
    )
  ) {
    throw new Error(`OUTBOX_CANARY_EVENT_TYPE_NOT_SUPPORTED: ${args.eventType}`)
  }

  const supabase = createServiceSupabase()
  const companyName = await resolveCompanyName(supabase, args.companyId)
  const actor = await resolveCanaryActorId(supabase, args.companyId)

  const dispatcher = new NotificationOutboxDispatcherService(supabase)
  const healthService = new NotificationOutboxCanaryHealthService(supabase)

  let dispatchResult: Awaited<
    ReturnType<NotificationOutboxDispatcherService["dispatchCanary"]>
  > | null = null
  let dispatchError: string | null = null

  try {
    dispatchResult = await dispatcher.dispatchCanary({
      companyId: args.companyId,
      eventType: args.eventType,
      limit: args.limit,
      actorId: actor.actorId,
    })
  } catch (error: any) {
    dispatchError = String(error?.message || "Failed to execute governance canary dispatch")
  }

  const health = await healthService.analyze({
    companyId: args.companyId,
    eventType: args.eventType,
    limit: Math.max(args.limit, 200),
  })

  const recommendation = buildRecommendation({
    dispatchFailed:
      dispatchResult?.failedEvents ||
      (dispatchError ? 1 : 0),
    health,
  })

  const output = {
    company: {
      id: args.companyId,
      name: companyName,
    },
    actor,
    canaryScope: {
      mode: "active_canary",
      eventFamilies: args.eventType
        ? [args.eventType]
        : Array.from(GOVERNANCE_REPLAY_CANARY_EVENT_TYPES),
    },
    dispatch: dispatchResult
      ? {
          processed: dispatchResult.processedEvents,
          claimed: dispatchResult.claimedExistingNotifications,
          created: dispatchResult.createdNotifications,
          failed: dispatchResult.failedEvents,
          skipped: dispatchResult.skippedEvents,
          deadLetter: health.summary.deadLetterEvents,
        }
      : {
          processed: 0,
          claimed: 0,
          created: 0,
          failed: 0,
          skipped: 0,
          deadLetter: health.summary.deadLetterEvents,
          error: dispatchError,
        },
    health: {
      avgLatencyMs: health.summary.averageDispatchLatencyMs,
      maxLatencyMs: health.summary.maxDispatchLatencyMs,
      driftSnapshot: health.driftSummary,
      gateSnapshot: health.gateSummary,
      stableLifecycle: health.summary.stableLifecycle,
      families: health.families,
    },
    recommendation,
  }

  console.log(JSON.stringify(output, null, 2))

  if (recommendation.decision !== "GO") {
    process.exitCode = 2
  }
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
