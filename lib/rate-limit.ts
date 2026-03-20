/**
 * 🚦 Rate Limiter — lib/rate-limit.ts
 * Phase 7: API abuse protection with DB-based counters
 *
 * Architecture: Redis-ready abstraction
 *   - Currently: Supabase DB (api_rate_limits table)
 *   - Future swap: Replace RateLimitBackend with Upstash Redis implementaion
 *     without changing any call sites
 *
 * Defaults:
 *   100 req/min per user
 *   500 req/min per company
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Config ───────────────────────────────────────────────────
export const RATE_LIMIT_DEFAULTS = {
  userPerMinute: 100,
  companyPerMinute: 500,
  windowSeconds: 60,
} as const

// ─── Types ────────────────────────────────────────────────────
export interface RateLimitResult {
  allowed: boolean
  remaining: number
  limit: number
  resetAt: Date
  retryAfterSeconds?: number
}

export interface RateLimitCheckParams {
  supabase: SupabaseClient
  userId?: string
  companyId?: string
  route?: string
  maxPerMinuteUser?: number
  maxPerMinuteCompany?: number
}

// ─── Core: DB-based implementation ────────────────────────────

async function checkIdentifier(
  supabase: SupabaseClient,
  identifier: string,
  route: string,
  maxRequests: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const now = new Date()

  // Atomic upsert: insert or update counter within sliding window
  const { data, error } = await supabase.rpc('check_and_increment_rate_limit', {
    p_identifier: identifier,
    p_route: route,
    p_max_requests: maxRequests,
    p_window_seconds: windowSeconds,
  })

  if (error) {
    // On DB error: fail open (allow request) to avoid blocking users
    console.error('[RateLimit] DB error (fail-open):', error.message)
    return {
      allowed: true,
      remaining: maxRequests,
      limit: maxRequests,
      resetAt: new Date(now.getTime() + windowSeconds * 1000),
    }
  }

  const result = data as {
    allowed: boolean
    request_count: number
    window_start: string
    blocked_until: string | null
  }

  const resetAt = new Date(
    new Date(result.window_start).getTime() + windowSeconds * 1000
  )
  const remaining = Math.max(0, maxRequests - (result.request_count ?? 0))
  const retryAfterSeconds = result.blocked_until
    ? Math.ceil((new Date(result.blocked_until).getTime() - now.getTime()) / 1000)
    : undefined

  return {
    allowed: result.allowed,
    remaining,
    limit: maxRequests,
    resetAt,
    retryAfterSeconds,
  }
}

/**
 * Check rate limit for a request
 * Returns { allowed, remaining, limit, resetAt, retryAfterSeconds }
 *
 * Usage in API route:
 *   const limit = await checkRateLimit({ supabase, userId, companyId })
 *   if (!limit.allowed) return rateLimitResponse(limit)
 */
export async function checkRateLimit(
  params: RateLimitCheckParams
): Promise<RateLimitResult> {
  const {
    supabase,
    userId,
    companyId,
    route = '*',
    maxPerMinuteUser = RATE_LIMIT_DEFAULTS.userPerMinute,
    maxPerMinuteCompany = RATE_LIMIT_DEFAULTS.companyPerMinute,
  } = params

  // Check user-level limit first (most granular)
  if (userId) {
    const userResult = await checkIdentifier(
      supabase,
      `user:${userId}`,
      route,
      maxPerMinuteUser,
      RATE_LIMIT_DEFAULTS.windowSeconds
    )
    if (!userResult.allowed) return userResult
  }

  // Check company-level limit
  if (companyId) {
    const companyResult = await checkIdentifier(
      supabase,
      `company:${companyId}`,
      route,
      maxPerMinuteCompany,
      RATE_LIMIT_DEFAULTS.windowSeconds
    )
    if (!companyResult.allowed) return companyResult
  }

  // Both passed — return the more restrictive remaining count
  return {
    allowed: true,
    remaining: Math.min(maxPerMinuteUser, maxPerMinuteCompany),
    limit: maxPerMinuteUser,
    resetAt: new Date(Date.now() + RATE_LIMIT_DEFAULTS.windowSeconds * 1000),
  }
}

/**
 * Build HTTP 429 response with proper headers
 * Usage:
 *   if (!limit.allowed) return rateLimitResponse(limit)
 */
export function rateLimitResponse(result: RateLimitResult): Response {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': '0',
    'X-RateLimit-Reset': String(Math.floor(result.resetAt.getTime() / 1000)),
  }

  if (result.retryAfterSeconds) {
    headers['Retry-After'] = String(result.retryAfterSeconds)
  }

  return new Response(
    JSON.stringify({
      success: false,
      error: 'Too Many Requests',
      retryAfter: result.retryAfterSeconds ?? Math.ceil((result.resetAt.getTime() - Date.now()) / 1000),
    }),
    { status: 429, headers }
  )
}

/**
 * Build rate limit headers for successful responses
 * Usage: add to NextResponse headers
 */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.floor(result.resetAt.getTime() / 1000)),
  }
}
