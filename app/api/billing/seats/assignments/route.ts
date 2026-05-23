/**
 * GET /api/billing/seats/assignments
 *
 * Owner-only view: lists every seat (numbered) with the member assigned
 * to it + their status (active vs over-quota). Drives /settings/seats.
 *
 * Response shape:
 * {
 *   total_paid_seats: 9,
 *   current_period_end: "2026-06-23T...",
 *   subscription_status: "active",
 *   billing_period: "monthly",
 *   owner: { user_id, email, name },
 *   seats: [
 *     { seat_number: 0, role: "free_owner", member: { user_id, email, name }, is_over_quota: false },
 *     { seat_number: 1, role: "paid", member: { user_id, email, name }, is_over_quota: false },
 *     { seat_number: 2, role: "paid", member: { ... },                    is_over_quota: false },
 *     ...
 *     { seat_number: 9, role: "paid", member: null,                       is_over_quota: false }, // empty paid seat
 *     { seat_number: 10, role: "over_quota", member: { ... },             is_over_quota: true }   // employee on a non-paid seat
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

interface SeatAssignment {
  seat_number: number
  /** 'free_owner' | 'paid' | 'over_quota' | 'empty' */
  role: 'free_owner' | 'paid' | 'over_quota' | 'empty'
  member: MemberInfo | null
  is_over_quota: boolean
}

export async function GET(req: NextRequest) {
  try {
    const { user, companyId, member, error } = await requireOwnerOrAdmin(req)
    if (error) return error
    if (!companyId || !user) {
      return apiError(HTTP_STATUS.NOT_FOUND, 'لم يتم العثور على الشركة', 'company_not_found')
    }

    // Owner-only (defensive — admins can view too actually, since they manage users)
    const isOwner = member?.role === 'owner'

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    // ── 1. Fetch company + subscription metadata ──
    const { data: company } = await admin
      .from('companies')
      .select('id, name, user_id, subscription_status, current_period_start, current_period_end, suspended_at')
      .eq('id', companyId)
      .single()

    if (!company) {
      return apiError(HTTP_STATUS.NOT_FOUND, 'الشركة غير موجودة', 'company_not_found')
    }

    // ── 2. Fetch paid seats count ──
    const { data: seatsRow } = await admin
      .from('company_seats')
      .select('total_paid_seats, status')
      .eq('company_id', companyId)
      .maybeSingle()

    const totalPaidSeats = (seatsRow?.total_paid_seats as number) ?? 0

    // ── 3. Fetch last invoice for billing_period ──
    const { data: lastInvoice } = await admin
      .from('billing_invoices')
      .select('billing_period, paid_at')
      .eq('company_id', companyId)
      .eq('status', 'paid')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const billingPeriod = (lastInvoice?.billing_period as 'monthly' | 'annual' | null) ?? 'monthly'

    // ── 4. Fetch all members + their seat_number ──
    const { data: members } = await admin
      .from('company_members')
      .select('user_id, role, created_at, seat_number, email')
      .eq('company_id', companyId)
      .order('seat_number', { ascending: true, nullsFirst: false })

    // ── 5. Resolve member emails/names from auth ──
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

    // ── 6. Build seat-by-seat view ──
    // Owner gets seat 0 (free). Other members fill numbered seats.
    // We also surface any over-quota seats (seat_number > total_paid_seats).

    const ownerInfo = memberInfos.find((m) => m.user_id === company.user_id) || null
    const nonOwnerMembers = memberInfos.filter((m) => m.user_id !== company.user_id)

    // Build seats: 0 (owner free), 1..total_paid_seats (paid), + any over-quota seats found
    const seats: SeatAssignment[] = []

    // Seat 0 — owner (free)
    seats.push({
      seat_number: 0,
      role: 'free_owner',
      member: ownerInfo,
      is_over_quota: false,
    })

    // Map members by seat_number for lookup
    const membersBySeat = new Map<number, MemberInfo>()
    let unassignedMembers: MemberInfo[] = []
    const maxObservedSeat = nonOwnerMembers.reduce((max, m) => {
      const sn = members?.find((mm) => mm.user_id === m.user_id)?.seat_number as number | null
      if (sn != null) {
        membersBySeat.set(sn, m)
        return Math.max(max, sn)
      } else {
        unassignedMembers.push(m)
        return max
      }
    }, 0)

    // Show all paid seats (1..total_paid_seats) — assigned or empty
    for (let n = 1; n <= totalPaidSeats; n++) {
      const m = membersBySeat.get(n) || null
      seats.push({
        seat_number: n,
        role: m ? 'paid' : 'empty',
        member: m,
        is_over_quota: false,
      })
    }

    // Show over-quota seats (member at seat_number > total_paid_seats)
    if (maxObservedSeat > totalPaidSeats) {
      for (let n = totalPaidSeats + 1; n <= maxObservedSeat; n++) {
        const m = membersBySeat.get(n) || null
        if (m) {
          seats.push({
            seat_number: n,
            role: 'over_quota',
            member: m,
            is_over_quota: true,
          })
        }
      }
    }

    // Append unassigned members (shouldn't normally exist, but defensive)
    for (const um of unassignedMembers) {
      seats.push({
        seat_number: -1,
        role: 'over_quota',
        member: um,
        is_over_quota: true,
      })
    }

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
      paid_seats_used: Math.min(totalPaidSeats, membersBySeat.size),
      paid_seats_empty: Math.max(0, totalPaidSeats - membersBySeat.size),
      over_quota_count: seats.filter((s) => s.is_over_quota).length,
      owner: ownerInfo,
      is_caller_owner: isOwner,
      seats,
    })
  } catch (e: any) {
    return internalError('خطأ فى جلب بيانات المقاعد', e.message)
  }
}
