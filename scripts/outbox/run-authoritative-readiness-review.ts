import { config as loadDotenv } from "dotenv"
import { createClient } from "@supabase/supabase-js"

import { NotificationOutboxAuthoritativeReadinessService } from "../../lib/outbox/notification-outbox-authoritative-readiness.service"

loadDotenv({ path: ".env.local" })

type SupabaseLike = any

type Args = {
  companyId: string
  eventType: string | null
  limit: number
  createdAfter: string | null
}

const DEFAULT_TEST_COMPANY_ID = "8ef6338c-1713-4202-98ac-863633b76526"

function getArg(flag: string) {
  const index = process.argv.indexOf(flag)
  if (index === -1) return null
  return String(process.argv[index + 1] || "").trim() || null
}

function parseArgs(): Args {
  const limit = Number(getArg("--limit") || 200)
  return {
    companyId: getArg("--company-id") || DEFAULT_TEST_COMPANY_ID,
    eventType: getArg("--event-type"),
    createdAfter: getArg("--created-after"),
    limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 500) : 200,
  }
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

async function resolveCompanyName(supabase: SupabaseLike, companyId: string) {
  const { data, error } = await supabase
    .from("companies")
    .select("id, name")
    .eq("id", companyId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message || "Failed to resolve company name for authoritative readiness")
  }

  return String(data?.name || "").trim() || null
}

async function main() {
  const args = parseArgs()
  const supabase = createServiceSupabase()
  const companyName = await resolveCompanyName(supabase, args.companyId)
  const readiness = new NotificationOutboxAuthoritativeReadinessService(supabase)

  const result = await readiness.evaluate({
    companyId: args.companyId,
    eventType: args.eventType,
    createdAfter: args.createdAfter,
    limit: args.limit,
  })

  console.log(
    JSON.stringify(
      {
        company: {
          id: args.companyId,
          name: companyName,
        },
        readinessScope: {
          eventType: args.eventType,
          createdAfter: args.createdAfter,
          limit: args.limit,
        },
        summary: result.summary,
        canaryHealthSummary: result.canaryHealthSummary,
        gateSummary: result.gateSummary,
        driftSummary: result.driftSummary,
        families: result.families,
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
