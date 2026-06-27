/**
 * POST /api/billing/seats/swap
 *
 * Owner-only: swap seat_number between two members of the same company.
 * Used by /settings/seats up/down arrows to reorder seat assignments.
 *
 * Body: { seat_a: number, seat_b: number }
 * Returns: { success: true, swapped: { a, b } }
 */

import { NextRequest } from 'next/server'
import { requireOwnerOrAdmin } from '@/lib/api-security'
import { apiError, apiSuccess, internalError, HTTP_STATUS } from '@/lib/api-error-handler'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const { user, companyId, member, error } = await requireOwnerOrAdmin(req)
    if (error) return error
    if (!companyId || !user) {
      return apiError(HTTP_STATUS.NOT_FOUND, 'لم يتم العثور على الشركة', 'company_not_found')
    }

    // Owner-only (admins/managers can't reorder seats — billing concern)
    if (member?.role !== 'owner') {
      return apiError(
        HTTP_STATUS.FORBIDDEN,
        'المالك فقط يمكنه إعادة ترتيب المقاعد',
        'owner_only_action'
      )
    }

    const body = await req.json()
    const seatA = Number(body?.seat_a)
    const seatB = Number(body?.seat_b)

    if (!Number.isFinite(seatA) || !Number.isFinite(seatB)) {
      return apiError(HTTP_STATUS.BAD_REQUEST, 'seat_a و seat_b مطلوبين كأرقام', 'invalid_seats')
    }
    if (seatA === 0 || seatB === 0) {
      return apiError(
        HTTP_STATUS.BAD_REQUEST,
        'لا يمكن تبديل مقعد المالك (المقعد 0)',
        'cannot_swap_owner_seat'
      )
    }
    if (seatA < 0 || seatB < 0) {
      return apiError(HTTP_STATUS.BAD_REQUEST, 'أرقام المقاعد يجب أن تكون موجبة', 'invalid_seat_values')
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    // v3.74.379 — RPC now records the actor in the audit log entry.
    // Owner-only is already enforced at the route, so the actor is
    // always the owner; we still pass it explicitly so log queries
    // by user_id work.
    const { data, error: rpcErr } = await admin.rpc('swap_seat_numbers', {
      p_company_id: companyId,
      p_seat_a: seatA,
      p_seat_b: seatB,
      p_actor_user_id: user.id,
    })

    if (rpcErr) {
      console.error('[seats/swap] RPC error:', rpcErr)
      return internalError('فشل فى تبديل المقاعد', rpcErr.message)
    }

    const result = data as { success?: boolean; error?: string; no_op?: boolean; swapped?: any }
    if (!result?.success) {
      return apiError(HTTP_STATUS.BAD_REQUEST, result?.error || 'فشل التبديل', 'swap_failed')
    }

    return apiSuccess(result)
  } catch (e: any) {
    return internalError('خطأ فى تبديل المقاعد', e.message)
  }
}
