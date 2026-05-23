/**
 * POST /api/billing/subscription/cancel
 *
 * Cancels auto-renewal for the company's paid subscription.
 * - Existing paid seats remain active until the end of the current billing period.
 * - No refund is processed (cancellation = stop renewal; subscription_status='canceled').
 * - Only the company OWNER can cancel (admins/managers cannot).
 *
 * To reactivate, the user must purchase new seats via /api/billing/seats.
 */

import { NextRequest } from 'next/server'
import { requireOwnerOrAdmin } from '@/lib/api-security'
import { apiError, apiSuccess, internalError, HTTP_STATUS } from '@/lib/api-error-handler'
import { cancelSubscription, getSubscription } from '@/lib/billing/subscription-service'
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

    // Only owner can cancel (defensive — requireOwnerOrAdmin already allows admin/manager,
    // but cancellation is owner-only).
    if (member?.role !== 'owner') {
      return apiError(
        HTTP_STATUS.FORBIDDEN,
        'المالك فقط يمكنه إلغاء الاشتراك',
        'owner_only_action'
      )
    }

    // Verify there's an active subscription to cancel
    const subscription = await getSubscription(companyId)
    if (subscription.subscription_status === 'canceled') {
      return apiSuccess({
        already_canceled: true,
        subscription,
      })
    }
    if (subscription.subscription_status === 'free') {
      return apiError(
        HTTP_STATUS.BAD_REQUEST,
        'لا يوجد اشتراك مدفوع لإلغائه',
        'no_paid_subscription'
      )
    }

    // Perform cancellation
    await cancelSubscription(companyId, user.id)

    // Return updated state
    const updated = await getSubscription(companyId)
    return apiSuccess({
      canceled: true,
      subscription: updated,
      message: 'تم إلغاء التجديد التلقائى. المقاعد ستبقى نشطة حتى انتهاء الفترة الحالية.',
    })
  } catch (e: any) {
    return internalError('فشل فى إلغاء الاشتراك', e.message)
  }
}
