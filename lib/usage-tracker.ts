/**
 * 📊 Usage Tracker — lib/usage-tracker.ts
 * Phase 7: Atomic usage metric increments without race conditions
 *
 * Uses increment_usage_metric() RPC (INSERT ... ON CONFLICT DO UPDATE)
 * Integration: called from event bus listeners and API middleware
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Types ────────────────────────────────────────────────────
export type UsageMetric =
  | 'api_calls'
  | 'invoices_created'
  | 'bills_created'
  | 'po_created'
  | 'active_users'
  | 'storage_gb'

/**
 * Atomic increment of a usage metric for the current period
 * Uses DB-level upsert — safe for concurrent requests
 *
 * @param supabase  Server-side supabase client
 * @param companyId Company to track
 * @param metric    Metric name
 * @param amount    Amount to add (default: 1)
 * @param period    'YYYY-MM' for monthly (default: current month), 'YYYY-MM-DD' for daily
 */
export async function incrementUsage(
  supabase: SupabaseClient,
  params: {
    companyId: string
    metric: UsageMetric
    amount?: number
    period?: string
  }
): Promise<void> {
  const { companyId, metric, amount = 1, period } = params
  const activePeriod = period ?? new Date().toISOString().slice(0, 7) // YYYY-MM

  try {
    const { error } = await supabase.rpc('increment_usage_metric', {
      p_company_id: companyId,
      p_metric: metric,
      p_period: activePeriod,
      p_amount: amount,
    })

    if (error) {
      // Non-critical: log but don't throw
      console.error('[UsageTracker] increment failed (non-blocking):', error.message)
    }
  } catch (err: any) {
    console.error('[UsageTracker] unexpected error (non-blocking):', err?.message)
  }
}

/**
 * Get current usage for a metric in the current period
 */
export async function getUsage(
  supabase: SupabaseClient,
  companyId: string,
  metric: UsageMetric,
  period?: string
): Promise<number> {
  const activePeriod = period ?? new Date().toISOString().slice(0, 7)

  const { data } = await supabase
    .from('usage_metrics')
    .select('value')
    .eq('company_id', companyId)
    .eq('metric', metric)
    .eq('period', activePeriod)
    .maybeSingle()

  return Number(data?.value ?? 0)
}

/**
 * Get all usage metrics for a company in a period
 */
export async function getAllUsage(
  supabase: SupabaseClient,
  companyId: string,
  period?: string
): Promise<Record<UsageMetric, number>> {
  const activePeriod = period ?? new Date().toISOString().slice(0, 7)

  const { data } = await supabase
    .from('usage_metrics')
    .select('metric, value')
    .eq('company_id', companyId)
    .eq('period', activePeriod)

  const result = {} as Record<UsageMetric, number>
  for (const row of data ?? []) {
    result[row.metric as UsageMetric] = Number(row.value)
  }
  return result
}

/**
 * Track API call usage (called from middleware or API routes)
 * Non-blocking: errors are swallowed to never block API responses
 */
export function trackApiCall(
  supabase: SupabaseClient,
  companyId: string
): void {
  // Fire and forget — intentionally no await
  incrementUsage(supabase, { companyId, metric: 'api_calls' }).catch(() => {})
}

// ─── Event Bus Integration ────────────────────────────────────
// Register these listeners in your Edge Function or worker init

export function registerUsageListeners(
  registerListener: (event: string, fn: (supabase: SupabaseClient, event: any) => Promise<void>) => void
): void {
  registerListener('bill.created', async (supabase, event) => {
    await incrementUsage(supabase, {
      companyId: event.company_id,
      metric: 'bills_created',
    })
  })

  registerListener('po.created', async (supabase, event) => {
    await incrementUsage(supabase, {
      companyId: event.company_id,
      metric: 'po_created',
    })
  })
}
