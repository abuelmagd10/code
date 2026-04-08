import type { SupabaseClient } from '@supabase/supabase-js'

type NotifyParams = {
  companyId: string
  requestId: string
  invoiceNumber: string
  createdBy: string
  branchId?: string | null
  warehouseId?: string | null
}

async function createRoleNotification(
  supabase: SupabaseClient<any, 'public', any>,
  params: NotifyParams & {
    role: string
    title: string
    message: string
    priority?: 'normal' | 'high' | 'urgent'
    severity?: 'info' | 'warning' | 'error' | 'success'
    category?: string
    eventSuffix: string
  }
) {
  await supabase.rpc('create_notification', {
    p_company_id: params.companyId,
    p_reference_type: 'sales_return_request',
    p_reference_id: params.requestId,
    p_title: params.title,
    p_message: params.message,
    p_created_by: params.createdBy,
    p_branch_id: params.branchId || null,
    p_cost_center_id: null,
    p_warehouse_id: params.warehouseId || null,
    p_assigned_to_role: params.role,
    p_assigned_to_user: null,
    p_priority: params.priority || 'normal',
    p_event_key: `sales_return_request:${params.requestId}:${params.eventSuffix}:${params.role}:${Date.now()}`,
    p_severity: params.severity || 'info',
    p_category: params.category || 'sales'
  })
}

async function createUserNotification(
  supabase: SupabaseClient<any, 'public', any>,
  params: NotifyParams & {
    userId: string
    title: string
    message: string
    priority?: 'normal' | 'high' | 'urgent'
    severity?: 'info' | 'warning' | 'error' | 'success'
    category?: string
    eventSuffix: string
  }
) {
  await supabase.rpc('create_notification', {
    p_company_id: params.companyId,
    p_reference_type: 'sales_return_request',
    p_reference_id: params.requestId,
    p_title: params.title,
    p_message: params.message,
    p_created_by: params.createdBy,
    p_branch_id: params.branchId || null,
    p_cost_center_id: null,
    p_warehouse_id: params.warehouseId || null,
    p_assigned_to_role: null,
    p_assigned_to_user: params.userId,
    p_priority: params.priority || 'normal',
    p_event_key: `sales_return_request:${params.requestId}:${params.eventSuffix}:user:${params.userId}:${Date.now()}`,
    p_severity: params.severity || 'info',
    p_category: params.category || 'sales'
  })
}

export async function notifySalesReturnLevel1Requested(
  supabase: SupabaseClient<any, 'public', any>,
  params: NotifyParams & { returnType: 'partial' | 'full' }
) {
  const typeLabel = params.returnType === 'full' ? 'كامل' : 'جزئي'
  const title = 'طلب مرتجع مبيعات جديد'
  const message = `تم إنشاء طلب مرتجع ${typeLabel} للفاتورة ${params.invoiceNumber} وهو بانتظار اعتماد الإدارة.`

  for (const role of ['admin', 'general_manager', 'manager', 'accountant']) {
    await createRoleNotification(supabase, {
      ...params,
      role,
      title,
      message,
      priority: 'high',
      severity: 'warning',
      category: 'approvals',
      eventSuffix: 'created'
    })
  }
}

export async function notifySalesReturnWarehouseRequested(
  supabase: SupabaseClient<any, 'public', any>,
  params: NotifyParams
) {
  const title = 'طلب مرتجع مبيعات بانتظار اعتماد المخزن'
  const message = `اعتمدت الإدارة طلب المرتجع للفاتورة ${params.invoiceNumber}. يرجى تأكيد استلام المرتجع فعلياً بالمخزن.`

  for (const role of ['store_manager', 'warehouse_manager']) {
    await createRoleNotification(supabase, {
      ...params,
      role,
      title,
      message,
      priority: 'high',
      severity: 'warning',
      category: 'inventory',
      eventSuffix: 'pending_warehouse'
    })
  }
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

  await createUserNotification(supabase, {
    ...params,
    userId: params.requesterUserId,
    title,
    message,
    priority: 'high',
    severity: 'error',
    category: 'approvals',
    eventSuffix: params.stage === 'warehouse' ? 'warehouse_rejected' : 'level_1_rejected'
  })
}

export async function notifySalesReturnCompleted(
  supabase: SupabaseClient<any, 'public', any>,
  params: NotifyParams & { requesterUserId: string }
) {
  const title = 'اكتمل مرتجع المبيعات'
  const message = `تم اعتماد وتنفيذ مرتجع الفاتورة ${params.invoiceNumber} بعد تأكيد المخزن، وتم تطبيق الأثر المحاسبي والمخزني.`

  await createUserNotification(supabase, {
    ...params,
    userId: params.requesterUserId,
    title,
    message,
    priority: 'normal',
    severity: 'success',
    category: 'approvals',
    eventSuffix: 'completed_requester'
  })
}

export async function notifySalesReturnManagementCompleted(
  supabase: SupabaseClient<any, 'public', any>,
  params: NotifyParams
) {
  const title = 'اكتمل اعتماد مرتجع المبيعات'
  const message = `تم اعتماد وتنفيذ مرتجع الفاتورة ${params.invoiceNumber} بعد تأكيد المخزن.`

  for (const role of ['admin', 'general_manager', 'manager', 'accountant']) {
    await createRoleNotification(supabase, {
      ...params,
      role,
      title,
      message,
      priority: 'normal',
      severity: 'success',
      category: 'approvals',
      eventSuffix: 'completed_management'
    })
  }
}

export async function notifySalesReturnManagementRejectedByWarehouse(
  supabase: SupabaseClient<any, 'public', any>,
  params: NotifyParams & { reason: string }
) {
  const title = 'رفض المخزن طلب مرتجع مبيعات'
  const message = `رفض مسؤول المخزن طلب المرتجع للفاتورة ${params.invoiceNumber}. السبب: ${params.reason}`

  for (const role of ['admin', 'general_manager', 'manager', 'accountant']) {
    await createRoleNotification(supabase, {
      ...params,
      role,
      title,
      message,
      priority: 'high',
      severity: 'warning',
      category: 'approvals',
      eventSuffix: 'warehouse_rejected_management'
    })
  }
}
