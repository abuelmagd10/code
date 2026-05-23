/**
 * GET  /api/billing/subscription   — current company subscription state
 * POST /api/billing/subscription/cancel — cancel auto-renewal
 *                                          (handled in /cancel/route.ts)
 *
 * Returns: plan, status, current period, can_invite, grace_period info,
 *          seat counts (paid/used/available), price_per_seat_egp.
 */

import { NextRequest } from 'next/server'
import { requireOwnerOrAdmin } from '@/lib/api-security'
import { apiError, apiSuccess, internalError, HTTP_STATUS } from '@/lib/api-error-handler'
import { getSubscription } from '@/lib/billing/subscription-service'
import { getSeatStatus, SEAT_PRICE_EGP } from '@/lib/billing/seat-service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const { user, companyId, error } = await requireOwnerOrAdmin(req)
    if (error) return error
    if (!companyId || !user) {
      return apiError(HTTP_STATUS.NOT_FOUND, 'لم يتم العثور على الشركة', 'company_not_found')
    }

    const [subscription, seats] = await Promise.all([
      getSubscription(companyId),
      getSeatStatus(companyId),
    ])

    return apiSuccess({
      subscription,
      seats: { ...seats, price_per_seat_egp: SEAT_PRICE_EGP },
    })
  } catch (e: any) {
    return internalError('خطأ فى جلب بيانات الاشتراك', e.message)
  }
}
