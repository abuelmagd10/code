/**
 * 🔐 Tenant Guard — lib/tenant-guard.ts
 * Phase 7: Multi-tenant isolation enforcement
 *
 * Ensures the caller has access to the requested company_id.
 * Used in API routes before any company-scoped operation.
 *
 * Error code: 'TENANT_ACCESS_DENIED' → maps to HTTP 403
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Request-scope cache ───────────────────────────────────────
// WeakMap key = supabase instance (unique per request in Next.js)
// Avoids repeated DB queries within the same request lifecycle
const _tenantCache = new WeakMap<object, Set<string>>()

async function getUserCompanyIds(supabase: SupabaseClient): Promise<Set<string>> {
  // Return cached result if already fetched in this request
  const cached = _tenantCache.get(supabase)
  if (cached) return cached

  const { data, error } = await supabase.rpc('fn_user_company_ids')
  if (error) {
    console.error('[TenantGuard] fn_user_company_ids error:', error.message)
    throw new Error('TENANT_ACCESS_DENIED')
  }

  const ids = new Set<string>((data as string[]) ?? [])
  _tenantCache.set(supabase, ids)
  return ids
}

/**
 * Assert that the current authenticated user has access to the given company.
 * Throws 'TENANT_ACCESS_DENIED' (maps to HTTP 403) if not.
 *
 * Usage:
 *   await assertTenantAccess(supabase, companyId)
 *   // continues only if authorized
 */
export async function assertTenantAccess(
  supabase: SupabaseClient,
  companyId: string
): Promise<void> {
  if (!companyId) {
    throw new Error('TENANT_ACCESS_DENIED')
  }

  const companyIds = await getUserCompanyIds(supabase)

  if (!companyIds.has(companyId)) {
    console.warn('[TenantGuard] Access denied — companyId not in user scope:', companyId)
    throw new Error('TENANT_ACCESS_DENIED')
  }
}

/**
 * Check without throwing — returns boolean
 */
export async function hasTenantAccess(
  supabase: SupabaseClient,
  companyId: string
): Promise<boolean> {
  try {
    await assertTenantAccess(supabase, companyId)
    return true
  } catch {
    return false
  }
}

/**
 * Get all company IDs the user belongs to (cached per request)
 */
export async function getUserCompanyIdsForRequest(
  supabase: SupabaseClient
): Promise<string[]> {
  const ids = await getUserCompanyIds(supabase)
  return Array.from(ids)
}

/**
 * Convert TENANT_ACCESS_DENIED error to NextResponse 403
 * Usage in catch block:
 *   const res = tenantDeniedResponse(err)
 *   if (res) return res
 */
export function tenantDeniedResponse(
  err: unknown
): Response | null {
  if (err instanceof Error && err.message === 'TENANT_ACCESS_DENIED') {
    return new Response(
      JSON.stringify({ success: false, error: 'Access denied: invalid company scope' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    )
  }
  return null
}
