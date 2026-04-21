import type { SupabaseClient } from '@supabase/supabase-js'
import { buildNotificationEventKey, normalizeNotificationSeverity } from '@/lib/notification-workflow'
import {
  NotificationRecipientResolverService,
  type ResolvedNotificationRecipient,
} from '@/lib/services/notification-recipient-resolver.service'

type NotifyParams = {
  companyId: string
  requestId: string
  invoiceNumber: string
  createdBy: string
  branchId?: string | null
  warehouseId?: string | null
}

async function dispatchNotifications(
  supabase: SupabaseClient<any, 'public', any>,
  params: NotifyParams & {
    recipients: ResolvedNotificationRecipient[]
    title: string
    message: string
    priority?: 'normal' | 'high' | 'urgent'
    severity?: 'info' | 'warning' | 'error' | 'critical'
    category?: string
    eventAction: string
  }
) {
  const resolver = new NotificationRecipientResolverService(supabase)
  for (const recipient of params.recipients) {
    await supabase.rpc('create_notification', {
      p_company_id: params.companyId,
      p_reference_type: 'sales_return_request',
      p_reference_id: params.requestId,
      p_title: params.title,
      p_message: params.message,
      p_created_by: params.createdBy,
      p_branch_id: recipient.branchId ?? params.branchId ?? null,
      p_cost_center_id: recipient.costCenterId ?? null,
      p_warehouse_id: recipient.warehouseId ?? params.warehouseId ?? null,
      p_assigned_to_role: recipient.kind === 'role' ? recipient.role : null,
      p_assigned_to_user: recipient.kind === 'user' ? recipient.userId : null,
      p_priority: params.priority || 'normal',
      p_event_key: buildNotificationEventKey(
        'sales',
        'sales_return_request',
        params.requestId,
        params.eventAction,
        ...resolver.buildRecipientScopeSegments(recipient)
      ),
      p_severity: normalizeNotificationSeverity(params.severity),
      p_category: params.category || 'sales'
    })
  }
}

export async function notifySalesReturnLevel1Requested(
  supabase: SupabaseClient<any, 'public', any>,
  params: NotifyParams & { returnType: 'partial' | 'full' }
) {
  const resolver = new NotificationRecipientResolverService(supabase)
  const typeLabel = params.returnType === 'full' ? 'كامل' : 'جزئي'
  const title = 'طلب مرتجع مبيعات جديد'
  const message = `تم إنشاء طلب مرتجع ${typeLabel} للفاتورة ${params.invoiceNumber} وهو بانتظار اعتماد الإدارة.`

  await dispatchNotifications(supabase, {
    ...params,
    recipients: [
      ...resolver.resolveRoleRecipients(['admin', 'general_manager', 'manager'], null, null, null),
      ...resolver.resolveBranchAccountantRecipients(params.branchId || null, null)
    ],
    title,
    message,
    priority: 'high',
    severity: 'warning',
    category: 'approvals',
    eventAction: 'level_1_requested'
  })
}

export async function notifySalesReturnWarehouseRequested(
  supabase: SupabaseClient<any, 'public', any>,
  params: NotifyParams
) {
  const resolver = new NotificationRecipientResolverService(supabase)
  const title = 'طلب مرتجع مبيعات بانتظار اعتماد المخزن'
  const message = `اعتمدت الإدارة طلب المرتجع للفاتورة ${params.invoiceNumber}. يرجى تأكيد استلام المرتجع فعلياً بالمخزن.`

  await dispatchNotifications(supabase, {
    ...params,
    recipients: resolver.resolveRoleRecipients(
      ['store_manager', 'warehouse_manager'],
      params.branchId || null,
      params.warehouseId || null,
      null
    ),
    title,
    message,
    priority: 'high',
    severity: 'warning',
    category: 'inventory',
    eventAction: 'warehouse_receipt_pending'
  })
}

export async function notifySalesReturnRequesterRejected(
  supabase: SupabaseClient<any, 'public', any>,
  params: NotifyParams & {
    requesterUserId: string
    reason: string
    stage: 'level_1' | 'warehouse'
  }
) {
  const title = params.stage === 'warehouse'
    ? 'تم رفض طلب المرتجع من المخزن'
    : 'تم رفض طلب المرتجع من الإدارة'
  const message = params.stage === 'warehouse'
    ? `تم رفض طلب المرتجع للفاتورة ${params.invoiceNumber} من مسؤول المخزن. السبب: ${params.reason}`
    : `تم رفض طلب المرتجع للفاتورة ${params.invoiceNumber} من الإدارة. السبب: ${params.reason}`

  await dispatchNotifications(supabase, {
    ...params,
    recipients: [new NotificationRecipientResolverService(supabase).resolveUserRecipient(
      params.requesterUserId,
      null,
      params.branchId || null,
      params.warehouseId || null,
      null
    )],
    title,
    message,
    priority: 'high',
    severity: 'error',
    category: 'approvals',
    eventAction: params.stage === 'warehouse' ? 'warehouse_rejected_requester' : 'level_1_rejected_requester'
  })
}

export async function notifySalesReturnCompleted(
  supabase: SupabaseClient<any, 'public', any>,
  params: NotifyParams & { requesterUserId: string }
) {
  const title = 'اكتمل مرتجع المبيعات'
  const message = `تم اعتماد وتنفيذ مرتجع الفاتورة ${params.invoiceNumber} بعد تأكيد المخزن، وتم تطبيق الأثر المحاسبي والمخزني.`

  await dispatchNotifications(supabase, {
    ...params,
    recipients: [new NotificationRecipientResolverService(supabase).resolveUserRecipient(
      params.requesterUserId,
      null,
      params.branchId || null,
      params.warehouseId || null,
      null
    )],
    title,
    message,
    priority: 'normal',
    severity: 'info',
    category: 'approvals',
    eventAction: 'completed_requester'
  })
}

export async function notifySalesReturnManagementCompleted(
  supabase: SupabaseClient<any, 'public', any>,
  params: NotifyParams
) {
  const resolver = new NotificationRecipientResolverService(supabase)
  const title = 'اكتمل اعتماد مرتجع المبيعات'
  const message = `تم اعتماد وتنفيذ مرتجع الفاتورة ${params.invoiceNumber} بعد تأكيد المخزن.`

  await dispatchNotifications(supabase, {
    ...params,
    recipients: [
      ...resolver.resolveRoleRecipients(['admin', 'general_manager', 'manager'], null, null, null),
      ...resolver.resolveBranchAccountantRecipients(params.branchId || null, null)
    ],
    title,
    message,
    priority: 'normal',
    severity: 'info',
    category: 'approvals',
    eventAction: 'completed_management'
  })
}

export async function notifySalesReturnManagementRejectedByWarehouse(
  supabase: SupabaseClient<any, 'public', any>,
  params: NotifyParams & { reason: string }
) {
  const resolver = new NotificationRecipientResolverService(supabase)
  const title = 'رفض المخزن طلب مرتجع مبيعات'
  const message = `رفض مسؤول المخزن طلب المرتجع للفاتورة ${params.invoiceNumber}. السبب: ${params.reason}`

  await dispatchNotifications(supabase, {
    ...params,
    recipients: [
      ...resolver.resolveRoleRecipients(['admin', 'general_manager', 'manager'], null, null, null),
      ...resolver.resolveBranchAccountantRecipients(params.branchId || null, null)
    ],
    title,
    message,
    priority: 'high',
    severity: 'warning',
    category: 'approvals',
    eventAction: 'warehouse_rejected_management'
  })
}
