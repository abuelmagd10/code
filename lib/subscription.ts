/**
 * 📦 Subscription Manager — lib/subscription.ts
 * Phase 7: Plan lookup, feature gating, quota enforcement
 *
 * Usage:
 *   const sub = await getCompanySubscription(supabase, companyId)
 *   if (!sub.allowed('analytics')) return forbiddenError()
 *   const quota = await checkQuota(supabase, companyId, 'monthly_invoices')
 *   if (quota.exceeded) return quotaError()
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Types ────────────────────────────────────────────────────
export type PlanId = 'trial' | 'basic' | 'pro' | 'enterprise'
export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'cancelled' | 'expired'

export interface Plan {
  id: PlanId
  name: string
  max_users: number | null
  max_branches: number | null
  max_monthly_invoices: number | null
  max_monthly_bills: number | null
  max_storage_gb: number | null
  price_monthly: number
  features: Record<string, boolean>
}

export interface Subscription {
  id: string
  company_id: string
  plan_id: PlanId
  status: SubscriptionStatus
  trial_ends_at: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  plan: Plan
  /** Check if a named feature is enabled in the current plan */
  allowed: (feature: keyof Plan['features']) => boolean
  /** Check if subscription is currently active (trial or active) */
  isActive: boolean
  /** Check if in trial period */
  isTrial: boolean
}

export interface QuotaResult {
  exceeded: boolean
  current: number
  limit: number | null      // null = unlimited
  remaining: number | null  // null = unlimited
  metric: string
  period: string
}

// ─── Core Functions ───────────────────────────────────────────

/**
 * Get company subscription with plan details
 * Returns a trial subscription if none exists (graceful)
 */
export async function getCompanySubscription(
  supabase: SupabaseClient,
  companyId: string
): Promise<Subscription> {
  const { data: sub, error } = await supabase
    .from('subscriptions')
    .select(`
      *,
      plan:subscription_plans(*)
    `)
    .eq('company_id', companyId)
    .maybeSingle()

  // Graceful: if no subscription found, return default trial
  if (error || !sub) {
    const plan = PLANS.trial
    return buildSubscription({ id: 'default', company_id: companyId, plan_id: 'trial', status: 'trial', trial_ends_at: null, current_period_end: null, cancel_at_period_end: false, plan })
  }

  return buildSubscription(sub as any)
}

function buildSubscription(raw: any): Subscription {
  const plan: Plan = raw.plan ?? PLANS.trial
  const status: SubscriptionStatus = raw.status ?? 'trial'
  const now = new Date()

  const isActive =
    status === 'active' ||
    (status === 'trial' && (!raw.trial_ends_at || new Date(raw.trial_ends_at) > now))

  return {
    ...raw,
    plan,
    isActive,
    isTrial: status === 'trial',
    allowed: (feature: string) => {
      if (!isActive) return false
      if (plan.id === 'enterprise') return true
      return !!plan.features?.[feature]
    }
  }
}

/**
 * Check if a usage quota is within limits for the current period
 */
export async function checkQuota(
  supabase: SupabaseClient,
  companyId: string,
  metric: 'monthly_invoices' | 'monthly_bills' | 'users' | 'branches'
): Promise<QuotaResult> {
  const sub = await getCompanySubscription(supabase, companyId)
  const period = new Date().toISOString().slice(0, 7) // YYYY-MM

  let limit: number | null = null
  if (metric === 'monthly_invoices') limit = sub.plan.max_monthly_invoices
  else if (metric === 'monthly_bills') limit = sub.plan.max_monthly_bills
  else if (metric === 'users') limit = sub.plan.max_users
  else if (metric === 'branches') limit = sub.plan.max_branches

  // Unlimited plan
  if (limit === null) {
    return { exceeded: false, current: 0, limit: null, remaining: null, metric, period }
  }

  // Get current usage from usage_metrics
  const { data: usageRow } = await supabase
    .from('usage_metrics')
    .select('value')
    .eq('company_id', companyId)
    .eq('metric', metric === 'monthly_invoices' ? 'invoices_created' : metric)
    .eq('period', period)
    .maybeSingle()

  const current = Number(usageRow?.value ?? 0)
  const remaining = Math.max(0, limit - current)

  return {
    exceeded: current >= limit,
    current,
    limit,
    remaining,
    metric,
    period,
  }
}

// ─── Fallback Plan Definitions ────────────────────────────────
// Used when DB is unavailable or subscription not found
const PLANS: Record<PlanId, Plan> = {
  trial: {
    id: 'trial', name: 'Trial',
    max_users: 3, max_branches: 1,
    max_monthly_invoices: 50, max_monthly_bills: 50,
    max_storage_gb: 1, price_monthly: 0,
    features: { analytics: false, api_access: false, priority_support: false }
  },
  basic: {
    id: 'basic', name: 'Basic',
    max_users: 10, max_branches: 2,
    max_monthly_invoices: 500, max_monthly_bills: 500,
    max_storage_gb: 10, price_monthly: 99,
    features: { analytics: true, api_access: false, priority_support: false }
  },
  pro: {
    id: 'pro', name: 'Pro',
    max_users: 50, max_branches: 10,
    max_monthly_invoices: 5000, max_monthly_bills: 5000,
    max_storage_gb: 100, price_monthly: 299,
    features: { analytics: true, api_access: true, priority_support: false }
  },
  enterprise: {
    id: 'enterprise', name: 'Enterprise',
    max_users: null, max_branches: null,
    max_monthly_invoices: null, max_monthly_bills: null,
    max_storage_gb: null, price_monthly: 999,
    features: { analytics: true, api_access: true, priority_support: true }
  }
}
