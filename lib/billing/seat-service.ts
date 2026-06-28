/**
 * SeatService — 7ESAB ERP
 * Manages company seat logic: availability, reservation, activation, release.
 *
 * Design principles:
 * - All heavy logic lives in DB functions (get_seat_status, reserve_seat, etc.)
 * - This service is a clean TypeScript wrapper around those RPCs
 * - Never call this from client components — server only (API routes)
 * - Owner (companies.user_id) is always free and never counted
 */

import { createClient } from '@supabase/supabase-js'

// Price config — change here only, not scattered across the codebase
export const SEAT_PRICE_EGP = parseInt(process.env.SEAT_PRICE_EGP || '500', 10)

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !key) throw new Error('Supabase admin credentials missing')
  return createClient(url, key, { auth: { persistSession: false } })
}

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

export interface SeatStatus {
  total_paid_seats: number
  used_seats: number
  reserved_seats: number
  available_seats: number
  can_invite: boolean
  owner_id: string
  subscription_status: string
  /** True when subscription_status = 'payment_failed' (account suspended) */
  is_suspended?: boolean
  price_per_seat_egp: number
}

export interface SeatResult {
  success: boolean
  error?: string
  idempotent?: boolean
  message?: string
}

// ─────────────────────────────────────────
// getSeatStatus
// Returns real-time seat state for a company
// ─────────────────────────────────────────
export async function getSeatStatus(companyId: string): Promise<SeatStatus> {
  const admin = getAdminClient()
  const { data, error } = await admin.rpc('get_seat_status', { p_company_id: companyId })

  if (error) {
    console.error('[SeatService] getSeatStatus error:', error)
    throw new Error(error.message)
  }

  if (data?.error) {
    throw new Error(data.error)
  }

  return data as SeatStatus
}

// ─────────────────────────────────────────
// canInviteUser
// Quick boolean check — use before creating invitation
// ─────────────────────────────────────────
export async function canInviteUser(companyId: string): Promise<boolean> {
  try {
    const status = await getSeatStatus(companyId)
    return status.can_invite === true
  } catch {
    return false
  }
}

// ─────────────────────────────────────────
// reserveSeat
// Called atomically after creating the invitation record
// Uses DB advisory lock to prevent race conditions
// ─────────────────────────────────────────
export async function reserveSeat(
  companyId: string,
  inviteId: string
): Promise<SeatResult> {
  const admin = getAdminClient()
  const { data, error } = await admin.rpc('reserve_seat', {
    p_company_id: companyId,
    p_invite_id: inviteId,
  })

  if (error) {
    console.error('[SeatService] reserveSeat error:', error)
    return { success: false, error: error.message }
  }

  return data as SeatResult
}

// ─────────────────────────────────────────
// releaseSeat
// Called when an invitation is cancelled
// Frees the reserved seat back into the pool
// ─────────────────────────────────────────
export async function releaseSeat(
  companyId: string,
  inviteId: string,
  byUserId?: string
): Promise<SeatResult> {
  const admin = getAdminClient()
  const { data, error } = await admin.rpc('release_seat', {
    p_company_id: companyId,
    p_invite_id: inviteId,
    p_by_user_id: byUserId ?? null,
  })

  if (error) {
    console.error('[SeatService] releaseSeat error:', error)
    return { success: false, error: error.message }
  }

  return data as SeatResult
}

// ─────────────────────────────────────────
// activateSeat
// Called when invitation is accepted
// Converts reserved → active member seat
// ─────────────────────────────────────────
export async function activateSeat(
  companyId: string,
  inviteId: string
): Promise<SeatResult> {
  const admin = getAdminClient()
  const { data, error } = await admin.rpc('activate_seat', {
    p_company_id: companyId,
    p_invite_id: inviteId,
  })

  if (error) {
    console.error('[SeatService] activateSeat error:', error)
    return { success: false, error: error.message }
  }

  return data as SeatResult
}

// ─────────────────────────────────────────
// increaseSeats
// Called from Paymob webhook — idempotent
// Safe to call multiple times with same txnId
// ─────────────────────────────────────────
export async function increaseSeats(
  companyId: string,
  seatsCount: number,
  paymobTxnId: string,
  amountEgp?: number,
  performedBy?: string,
  billingPeriod: 'monthly' | 'annual' = 'monthly'
): Promise<SeatResult & { reactivation?: { previous_status?: string; was_reactivated?: boolean } }> {
  const admin = getAdminClient()
  const { data, error } = await admin.rpc('increase_seats', {
    p_company_id:       companyId,
    p_seats_count:      seatsCount,
    p_paymob_txn_id:    paymobTxnId,
    p_amount_egp:       amountEgp ?? null,
    p_performed_by:     performedBy ?? null,
    p_billing_period:   billingPeriod,
  })

  if (error) {
    console.error('[SeatService] increaseSeats error:', error)
    return { success: false, error: error.message }
  }

  return data as SeatResult & { reactivation?: { previous_status?: string; was_reactivated?: boolean } }
}

// ─────────────────────────────────────────
// createSeatLicensesForPurchase
// v3.74.381 — Stage 4 of 6.
// After increaseSeats has bumped the legacy total_paid_seats counter,
// this helper inserts N rows into company_seat_licenses with their
// own purchased_at + expires_at. Idempotent on billing_invoice_id
// so the Paymob webhook can re-fire safely.
//
// Pass billingInvoiceId AFTER the invoice has been created. If the
// invoice creation fails or hasn't happened yet (free-grant path),
// pass undefined — the rows still get created but lose the dedup
// guarantee, so the caller must not retry.
// ─────────────────────────────────────────
export interface CreateLicensesResult {
  success: boolean
  idempotent?: boolean
  created_count?: number
  first_seat?: number
  last_seat?: number
  license_ids?: string[]
  purchased_at?: string
  expires_at?: string
  billing_period?: 'monthly' | 'annual'
  error?: string
}

export async function createSeatLicensesForPurchase(
  companyId: string,
  seatsCount: number,
  billingPeriod: 'monthly' | 'annual' = 'monthly',
  billingInvoiceId?: string | null,
): Promise<CreateLicensesResult> {
  const admin = getAdminClient()
  const { data, error } = await admin.rpc('create_seat_licenses_for_purchase', {
    p_company_id:         companyId,
    p_seats_count:        seatsCount,
    p_billing_period:     billingPeriod,
    p_billing_invoice_id: billingInvoiceId ?? null,
  })

  if (error) {
    console.error('[SeatService] createSeatLicensesForPurchase error:', error)
    return { success: false, error: error.message }
  }

  return data as CreateLicensesResult
}

// ─────────────────────────────────────────
// renewSeatLicenses
// v3.74.382 — Stage 5 of 6.
// Renews a set of seat licenses by extending their expires_at. Idempotent
// on billing_invoice_id (the renewing payment). For expired seats the
// new period starts at NOW; for active seats it extends from the current
// expires_at so the customer doesn't lose days they already paid for.
// ─────────────────────────────────────────
export interface RenewLicensesResult {
  success: boolean
  idempotent?: boolean
  renewed_count?: number
  license_ids?: string[]
  billing_period?: 'monthly' | 'annual'
  requested?: number
  unmatched?: number
  error?: string
}

export async function renewSeatLicenses(
  companyId: string,
  seatLicenseIds: string[],
  billingPeriod: 'monthly' | 'annual' = 'monthly',
  billingInvoiceId?: string | null,
  performedBy?: string | null,
): Promise<RenewLicensesResult> {
  const admin = getAdminClient()
  const { data, error } = await admin.rpc('renew_seat_licenses', {
    p_company_id:         companyId,
    p_seat_license_ids:   seatLicenseIds,
    p_billing_period:     billingPeriod,
    p_billing_invoice_id: billingInvoiceId ?? null,
    p_performed_by:       performedBy ?? null,
  })

  if (error) {
    console.error('[SeatService] renewSeatLicenses error:', error)
    return { success: false, error: error.message }
  }
  return data as RenewLicensesResult
}

export async function getExpiredSeatLicenseIds(companyId: string): Promise<string[]> {
  const admin = getAdminClient()
  const { data, error } = await admin.rpc('get_expired_seat_license_ids', {
    p_company_id: companyId,
  })
  if (error) {
    console.error('[SeatService] getExpiredSeatLicenseIds error:', error)
    return []
  }
  return (data as string[]) || []
}

// ─────────────────────────────────────────
// getSeatTransactions
// Returns audit history for seat changes
// ─────────────────────────────────────────
export async function getSeatTransactions(companyId: string) {
  const admin = getAdminClient()
  const { data, error } = await admin
    .from('seat_transactions')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) throw new Error(error.message)
  return data || []
}
