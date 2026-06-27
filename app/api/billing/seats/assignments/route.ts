/**
 * GET /api/billing/seats/assignments
 * v3.74.378 — Stage 2 of 6: now reads from company_seat_licenses.
 *
 * The new model has one row per purchased seat with its own purchase
 * date and expiry. The page shows:
 *   - seat number (stable identifier per company)
 *   - assigned employee (if any)
 *   - purchase + expiry dates
 *   - active / expired status (computed from expires_at vs now)
 *
 * This stage is READ-ONLY surface — no behavior changes. The
 * middleware that decides "non-owner suspended" still consults the
 * old get_user_company_status RPC. The arrow buttons still call the
 * legacy swap_seat_numbers RPC. Stage 3 will flip the swap to move
 * users between licenses instead of swapping seat numbers.
 *
 * Response shape (kept backward-compatible — added fields, didn't
 * rename or drop):
 * {
 *   company_id, company_name,
 *   subscription_status, current_period_start, current_period_end,
 *   suspended_at, billing_period, last_paid_at,
 *   total_paid_seats, paid_seats_used, paid_seats_empty,
 *   over_quota_count, owner, is_caller_owner,
 *   seats: [
 *     {
 *       seat_number: 0, role: "free_owner",
 *       member: { ... } | null,
 *       is_over_quota: false,
 *       // v3.74.378 - new per-seat fields
 *       license_id: null,
 *       purchased_at: null,
 *       expires_at: null,
 *       is_expired: false
 *     },
 *     {
 *       seat_number: 1, role: "paid" | "empty" | "expired",
 *       member: { ... } | null,
 *       is_over_quota: false,
 *       license_id: "uuid",
 *       purchased_at: "2026-03-15T00:00:00Z",
 *       expires_at:   "2026-04-15T00:00:00Z",
 *       is_expired: true
 *     },
 *     ...
 *   ]
 * }
 */

import { NextRequest } from 'next/server'
import { requireOwnerOrAdmin } from '@/lib/api-security'
import { apiError, apiSuccess, internalError, HTTP_STATUS } from '@/lib/api-error-handler'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface MemberInfo {
  user_id: string
  email: string | null
  name: string | null
  role: string
  created_at: string | null
}

type SeatRole = 'free_owner' | 'paid' | 'expired' | 'over_quota' | 'empty'

interface SeatAssignment {
  seat_number: number
  role: SeatRole
  member: MemberInfo | null
  is_over_quota: boolean
  // v3.74.378 — per-seat license fields. NULL for the owner row (seat 0)
  // and for any over-quota rows that don't have a license backing them.
  license_id: string | null
  purchased_at: string | null
  expires_at: string | null
  is_expired: boolean
}

export async function GET(req: NextRequest) {
  try {
    const { user, companyId, member, error } = await requireOwnerOrAdmin(req)
    if (error) return error
    if (!companyId || !user) {
      return apiError(HTTP_STATUS.NOT_FOUND, 'لم يتم العثور على الشركة', 'company_not_found')
    }

    const isOwner = member?.role === 'owner'

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    // ── 1. Company + subscription metadata ──
    const { data: company } = await admin
      .from('companies')
      .select('id, name, user_id, subscription_status, current_period_start, current_period_end, suspended_at')
      .eq('id', companyId)
      .single()

    if (!company) {
      return apiError(HTTP_STATUS.NOT_FOUND, 'الشركة غير موجودة', 'company_not_found')
    }

    // ── 2. Total paid seats (legacy column — still authoritative
    // for the count display) ──
    const { data: seatsRow } = await admin
      .from('company_seats')
      .select('total_paid_seats, status, billing_cycle')
      .eq('company_id', companyId)
      .maybeSingle()

    const totalPaidSeats = (seatsRow?.total_paid_seats as number) ?? 0

    // ── 3. Last paid invoice for billing_period + last_paid_at ──
    const { data: lastInvoice } = await admin
      .from('billing_invoices')
      .select('billing_period, paid_at')
      .eq('company_id', companyId)
      .eq('status', 'paid')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const billingPeriod =
      (lastInvoice?.billing_period as 'monthly' | 'annual' | null) ??
      ((seatsRow?.billing_cycle as 'monthly' | 'annual' | null) ?? 'monthly')

    // ── 4. Per-seat licenses (the new Stage-1 table) ──
    const { data: licenses } = await admin
      .from('company_seat_licenses')
      .select('id, seat_number, purchased_at, expires_at, assigned_user_id, billing_period')
      .eq('company_id', companyId)
      .order('seat_number', { ascending: true })

    const licensesBySeat = new Map<number, {
      id: string
      purchased_at: string
      expires_at: string
      assigned_user_id: string | null
    }>()
    for (const l of licenses || []) {
      licensesBySeat.set(l.seat_number as number, {
        id: l.id as string,
        purchased_at: l.purchased_at as string,
        expires_at: l.expires_at as string,
        assigned_user_id: (l.assigned_user_id as string | null) ?? null,
      })
    }

    // ── 5. All members + seat_number ──
    const { data: members } = await admin
      .from('company_members')
      .select('user_id, role, created_at, seat_number, email')
      .eq('company_id', companyId)
      .order('seat_number', { ascending: true, nullsFirst: false })

    // ── 6. Resolve member emails/names ──
    const memberInfos: MemberInfo[] = []
    for (const m of members || []) {
      let email: string | null = (m.email as string) || null
      let name: string | null = null
      try {
        const { data: userData } = await admin.auth.admin.getUserById(m.user_id as string)
        email = userData?.user?.email || email
        name = userData?.user?.user_metadata?.full_name || null
      } catch { /* non-fatal */ }

      memberInfos.push({
        user_id: m.user_id as string,
        email,
        name,
        role: (m.role as string) || 'staff',
        created_at: m.created_at as string | null,
      })
    }

    const ownerInfo = memberInfos.find((m) => m.user_id === company.user_id) || null
    const nonOwnerMembers = memberInfos.filter((m) => m.user_id !== company.user_id)

    // Map members by seat_number for fallback when license has no
    // assigned_user_id yet (legacy data). The license's
    // assigned_user_id is preferred when present.
    const membersByUserId = new Map<string, MemberInfo>()
    for (const m of memberInfos) membersByUserId.set(m.user_id, m)

    const membersBySeat = new Map<number, MemberInfo>()
    let unassignedMembers: MemberInfo[] = []
    const memberSeats = new Map<string, number | null>()
    let maxObservedSeat = 0
    for (const m of nonOwnerMembers) {
      const seatNum = members?.find((mm) => mm.user_id === m.user_id)?.seat_number as number | null
      memberSeats.set(m.user_id, seatNum)
      if (seatNum != null) {
        membersBySeat.set(seatNum, m)
        if (seatNum > maxObservedSeat) maxObservedSeat = seatNum
      } else {
        unassignedMembers.push(m)
      }
    }

    // ── 7. Build the seat-by-seat response ──
    const seats: SeatAssignment[] = []
    const nowMs = Date.now()

    // Seat 0 — owner (free, virtual, no license row)
    seats.push({
      seat_number: 0,
      role: 'free_owner',
      member: ownerInfo,
      is_over_quota: false,
      license_id: null,
      purchased_at: null,
      expires_at: null,
      is_expired: false,
    })

    // Seats 1..totalPaidSeats — driven by license records when
    // present, fall back to member-only display when license is
    // missing (shouldn't happen after the Stage 1 backfill, but
    // defensive).
    for (let n = 1; n <= totalPaidSeats; n++) {
      const license = licensesBySeat.get(n) || null

      // Prefer the license's assigned_user_id; if NULL on the
      // license but a member is sitting on seat_number=n in the
      // legacy column, surface them so the row isn't blank.
      let m: MemberInfo | null = null
      if (license?.assigned_user_id) {
        m = membersByUserId.get(license.assigned_user_id) ?? null
      } else {
        m = membersBySeat.get(n) || null
      }

      const isExpired = !!license && new Date(license.expires_at).getTime() <= nowMs

      let role: SeatRole = 'empty'
      if (m && isExpired) role = 'expired'
      else if (m) role = 'paid'
      else role = 'empty'

      seats.push({
        seat_number: n,
        role,
        member: m,
        is_over_quota: false,
        license_id: license?.id ?? null,
        purchased_at: license?.purchased_at ?? null,
        expires_at: license?.expires_at ?? null,
        is_expired: isExpired,
      })
    }

    // Over-quota rows: members at seat_number > totalPaidSeats.
    // These never have a license backing them in the new model.
    if (maxObservedSeat > totalPaidSeats) {
      for (let n = totalPaidSeats + 1; n <= maxObservedSeat; n++) {
        const m = membersBySeat.get(n) || null
        if (m) {
          seats.push({
            seat_number: n,
            role: 'over_quota',
            member: m,
            is_over_quota: true,
            license_id: null,
            purchased_at: null,
            expires_at: null,
            is_expired: false,
          })
        }
      }
    }

    // Defensive: surface unassigned members (no seat_number)
    for (const um of unassignedMembers) {
      seats.push({
        seat_number: -1,
        role: 'over_quota',
        member: um,
        is_over_quota: true,
        license_id: null,
        purchased_at: null,
        expires_at: null,
        is_expired: false,
      })
    }

    // ── 8. Headline numbers ──
    const paidSeatsUsed = seats
      .filter((s) => s.seat_number >= 1 && s.seat_number <= totalPaidSeats && s.member !== null)
      .length
    const paidSeatsEmpty = Math.max(0, totalPaidSeats - paidSeatsUsed)
    const overQuotaCount = seats.filter((s) => s.is_over_quota).length

    // v3.74.378 — new aggregate: how many paid seats are EXPIRED?
    // The UI can show "X من Y مقاعد منتهية" alongside the existing
    // "X محظور" indicator without breaking older clients.
    const expiredSeatCount = seats
      .filter((s) => s.seat_number > 0 && s.is_expired)
      .length

    return apiSuccess({
      company_id: company.id,
      company_name: company.name,
      subscription_status: company.subscription_status,
      current_period_start: company.current_period_start,
      current_period_end: company.current_period_end,
      suspended_at: company.suspended_at,
      billing_period: billingPeriod,
      last_paid_at: lastInvoice?.paid_at ?? null,
      total_paid_seats: totalPaidSeats,
      paid_seats_used: paidSeatsUsed,
      paid_seats_empty: paidSeatsEmpty,
      over_quota_count: overQuotaCount,
      // v3.74.378 — new in Stage 2.
      expired_seat_count: expiredSeatCount,
      owner: ownerInfo,
      is_caller_owner: isOwner,
      seats,
    })
  } catch (e: any) {
    return internalError('خطأ فى جلب بيانات المقاعد', e.message)
  }
}
