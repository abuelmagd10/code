// supabase/functions/update-exchange-rates/index.ts
//
// Daily Exchange Rate Auto-Update (v3.17.0)
// ──────────────────────────────────────────
// Fetches latest exchange rates from exchangerate-api.com for all supported
// currencies and stores them in the exchange_rates table with source='api'.
//
// Triggered by:
//   - Supabase Cron (daily at 00:00 UTC) — configured via Supabase Dashboard
//   - Manual invocation via Functions tab for testing
//   - Optional: HTTP POST with secret key for external triggers
//
// What it does:
//   For each base currency that any company uses (typically 'EGP'):
//     For each of the 12 supported foreign currencies:
//       1. Call exchangerate-api.com/v4/latest/{FC}
//       2. Extract the rate for FC → base
//       3. INSERT into exchange_rates (source='api', rate_date=today)
//
// Idempotent: Yes — if a rate for (from, to, date) already exists for today,
//             it is updated instead of duplicated.
//
// API used: https://api.exchangerate-api.com/v4/latest/{currency}
//           Free tier: 1500 requests/month (~50/day) — well within our needs

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Currencies that the system officially supports
const SUPPORTED_CURRENCIES = [
  "USD", "EUR", "GBP", "SAR", "AED",
  "KWD", "QAR", "BHD", "OMR", "JOD", "LBP",
] as const

interface UpdateResult {
  base_currency: string
  succeeded: Array<{ currency: string; rate: number }>
  failed: Array<{ currency: string; error: string }>
  skipped: Array<{ currency: string; reason: string }>
}

Deno.serve(async (req: Request) => {
  // Allow only POST or GET (cron sends GET by default)
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    })
  }

  // Validate cron secret if set (for external triggers via cron-job.org etc.)
  const expectedSecret = Deno.env.get("CRON_SECRET")
  if (expectedSecret) {
    const provided = req.headers.get("X-Cron-Secret") || new URL(req.url).searchParams.get("secret")
    if (provided !== expectedSecret) {
      return new Response(JSON.stringify({ error: "Invalid or missing secret" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    }
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // 1. Discover all unique base currencies in use across companies
  const { data: companies, error: compErr } = await supabase
    .from("companies")
    .select("base_currency")
    .not("base_currency", "is", null)

  if (compErr) {
    return new Response(
      JSON.stringify({ error: "Failed to load companies", details: compErr.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    )
  }

  const baseCurrencies = Array.from(
    new Set((companies || []).map((c: any) => String(c.base_currency || "EGP").toUpperCase())),
  )

  // 2. For each base currency, fetch rates from API and store
  const today = new Date().toISOString().slice(0, 10)
  const results: UpdateResult[] = []

  for (const base of baseCurrencies) {
    const result: UpdateResult = { base_currency: base, succeeded: [], failed: [], skipped: [] }

    for (const fc of SUPPORTED_CURRENCIES) {
      if (fc === base) {
        result.skipped.push({ currency: fc, reason: "same as base" })
        continue
      }
      try {
        // Fetch latest rates for the foreign currency
        const apiUrl = `https://api.exchangerate-api.com/v4/latest/${fc}`
        const resp = await fetch(apiUrl)
        if (!resp.ok) {
          result.failed.push({ currency: fc, error: `HTTP ${resp.status}` })
          continue
        }
        const data = await resp.json()
        const rate = data?.rates?.[base]
        if (!rate || typeof rate !== "number" || rate <= 0) {
          result.failed.push({ currency: fc, error: `No rate for ${fc}→${base} in API response` })
          continue
        }

        // Check if a rate for today already exists (source='api') and update vs insert
        const { data: existing } = await supabase
          .from("exchange_rates")
          .select("id")
          .eq("from_currency", fc)
          .eq("to_currency", base)
          .eq("rate_date", today)
          .eq("source", "api")
          .maybeSingle()

        if (existing?.id) {
          // Update existing rate for today (in case API value changed during the day)
          const { error: updErr } = await supabase
            .from("exchange_rates")
            .update({
              rate,
              rate_timestamp: new Date().toISOString(),
              source_detail: "exchangerate-api.com (auto)",
              is_active: true,
            })
            .eq("id", existing.id)
          if (updErr) {
            result.failed.push({ currency: fc, error: `Update failed: ${updErr.message}` })
            continue
          }
        } else {
          // Insert new rate for today
          const { error: insErr } = await supabase
            .from("exchange_rates")
            .insert({
              from_currency: fc,
              to_currency: base,
              rate,
              rate_date: today,
              rate_timestamp: new Date().toISOString(),
              source: "api",
              source_detail: "exchangerate-api.com (auto)",
              is_manual_override: false,
              is_active: true,
            })
          if (insErr) {
            result.failed.push({ currency: fc, error: `Insert failed: ${insErr.message}` })
            continue
          }
        }

        result.succeeded.push({ currency: fc, rate })
      } catch (err: any) {
        result.failed.push({ currency: fc, error: err?.message || "Unknown error" })
      }
    }

    results.push(result)
  }

  // 3. Return summary
  return new Response(
    JSON.stringify({
      success: true,
      run_date: today,
      bases_processed: baseCurrencies.length,
      results,
    }, null, 2),
    { status: 200, headers: { "Content-Type": "application/json" } },
  )
})
