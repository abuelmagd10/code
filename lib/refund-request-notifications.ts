/**
 * v3.74.254 — Notifications for the pre-shipment / pre-receipt refund
 * approval workflow (v3.74.253).
 *
 * Pattern mirrors lib/sales-return-request-notifications.ts:
 *   - When a regular role creates a refund request → notify owner + GM
 *   - When owner/GM approves → notify the requester (positive)
 *   - When owner/GM rejects  → notify the requester (with reason)
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildNotificationEventKey } from '@/lib/notification-workflow'
import {
  NotificationRecipientResolverService,
  type ResolvedNotificationRecipient,
} from '@/lib/services/notification-recipient-resolver.service'

type BaseParams = {
  companyId: string
  requestId: string
  sourceType: 'invoice' | 'bill'
  sourceNumber: string
  branchId?: string | null
  createdBy: string
}

async function dispatch(
  supabase: SupabaseClient<any, 'public', any>,
  params: BaseParams & {
    recipients: ResolvedNotificationRecipient[]
    title: string
    message: string
    priority: 'normal' | 'high' | 'urgent'
    severity: 'info' | 'warning' | 'error' | 'critical'
    category: string
    eventAction: string
  }
) {
  const resolver = new NotificationRecipientResolverService(supabase)
  for (const recipient of params.recipients) {
    try {
      await supabase.rpc('create_notification', {
        p_company_id: params.companyId,
        p_reference_type: 'refund_request',
        p_reference_id: params.requestId,
        p_title: params.title,
        p_message: params.message,
        p_created_by: params.createdBy,
        p_branch_id: recipient.branchId ?? params.branchId ?? null,
        p_cost_center_id: recipient.costCenterId ?? null,
        p_warehouse_id: recipient.warehouseId ?? null,
        p_assigned_to_role: recipient.kind === 'role' ? recipient.role : null,
        p_assigned_to_user: recipient.kind === 'user' ? recipient.userId : null,
        p_priority: params.priority,
        p_event_key: buildNotificationEventKey(
          params.sourceType === 'invoice' ? 'sales' : 'purchases',
          'refund_request',
          params.requestId,
          params.eventAction,
          ...resolver.buildRecipientScopeSegments(recipient)
        ),
      })
    } catch (e) {
      // Notifications are best-effort. Don't break the refund flow if
      // RLS / a missing recipient column flips the RPC.
      console.warn('[refund-notify] dispatch failed:', e)
    }
  }
}

/**
 * A regular role just created a refund_request. Notify owner + general_manager.
 */
export async function notifyRefundRequestSubmitted(
  supabase: SupabaseClient<any, 'public', any>,
  params: BaseParams & { amount: number; modeLabel: string }
) {
  const resolver = new NotificationRecipientResolverService(supabase)
  const sourceLabel = params.sourceType === 'invoice' ? 'فاتورة بيع' : 'فاتورة شراء'
  const title = 'طلب استرداد جديد بانتظار اعتمادك'
  const message =
    `تم إنشاء طلب استرداد على ${sourceLabel} ${params.sourceNumber} بقيمة ` +
    `${Number(params.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} ` +
    `(${params.modeLabel}). يرجى المراجعة والاعتماد.`

  await dispatch(supabase, {
    ...params,
    recipients: resolver.resolveRoleRecipients(
      ['owner', 'general_manager'],
      params.branchId || null,
      null,
      null
    ),
    title,
    message,
    priority: 'high',
    severity: 'warning',
    category: 'approvals',
    eventAction: 'refund_request_submitted',
  })
}

/**
 * Owner/GM approved a refund request — notify the requester.
 */
export async function notifyRefundRequestApproved(
  supabase: SupabaseClient<any, 'public', any>,
  params: BaseParams & { requesterUserId: string | null; amount: number }
) {
  if (!params.requesterUserId) return
  const resolver = new NotificationRecipientResolverService(supabase)
  const sourceLabel = params.sourceType === 'invoice' ? 'فاتورة بيع' : 'فاتورة شراء'
  const title = 'تم اعتماد طلب الاسترداد'
  const message =
    `تم اعتماد طلب الاسترداد على ${sourceLabel} ${params.sourceNumber} ` +
    `بقيمة ${Number(params.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}. ` +
    `تم تنفيذ القيود المحاسبية فوراً.`

  await dispatch(supabase, {
    ...params,
    recipients: [
      resolver.resolveUserRecipient(
        params.requesterUserId,
        null,
        params.branchId || null,
        null,
        null
      ),
    ],
    title,
    message,
    priority: 'normal',
    severity: 'info',
    category: 'approvals',
    eventAction: 'refund_request_approved',
  })
}

/**
 * Owner/GM rejected a refund request — notify the requester with reason.
 */
export async function notifyRefundRequestRejected(
  supabase: SupabaseClient<any, 'public', any>,
  params: BaseParams & { requesterUserId: string | null; reason: string | null }
) {
  if (!params.requesterUserId) return
  const resolver = new NotificationRecipientResolverService(supabase)
  const sourceLabel = params.sourceType === 'invoice' ? 'فاتورة بيع' : 'فاتورة شراء'
  const title = 'تم رفض طلب الاسترداد'
  const message = params.reason
    ? `تم رفض طلب الاسترداد على ${sourceLabel} ${params.sourceNumber}. السبب: ${params.reason}`
    : `تم رفض طلب الاسترداد على ${sourceLabel} ${params.sourceNumber}.`

  await dispatch(supabase, {
    ...params,
    recipients: [
      resolver.resolveUserRecipient(
        params.requesterUserId,
        null,
        params.branchId || null,
        null,
        null
      ),
    ],
    title,
    message,
    priority: 'high',
    severity: 'warning',
    category: 'approvals',
    eventAction: 'refund_request_rejected',
  })
}
