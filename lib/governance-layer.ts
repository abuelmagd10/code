/**
 * 🏛️ Governance Layer - TypeScript Helpers
 * نظام الحوكمة الشامل - دوال مساعدة للواجهة الأمامية
 * 
 * IFRS + SOX + Anti-Fraud Compliant
 */

import { createClient } from '@/lib/supabase/client'

// =====================================================
// Types
// =====================================================

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent'
export type NotificationStatus = 'unread' | 'read' | 'archived' | 'actioned'
export type NotificationSeverity = 'info' | 'warning' | 'error' | 'critical'
export type NotificationCategory = 'finance' | 'inventory' | 'sales' | 'approvals' | 'system'

export type ApprovalStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'executed' | 'cancelled'
export type WorkflowType = 'financial' | 'inventory' | 'refund' | 'transfer' | 'adjustment'

export type RefundStatus =
  | 'draft'
  | 'pending_branch_approval'
  | 'pending_final_approval'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'cancelled'

export interface Notification {
  id: string
  company_id: string
  branch_id?: string
  cost_center_id?: string
  warehouse_id?: string
  reference_type: string
  reference_id: string
  created_by: string
  assigned_to_role?: string
  assigned_to_user?: string
  title: string
  message: string
  priority: NotificationPriority
  status: NotificationStatus
  read_at?: string
  actioned_at?: string
  created_at: string
  expires_at?: string
  // ✅ الحقول الجديدة (Enterprise-grade)
  event_key?: string
  severity?: NotificationSeverity
  category?: NotificationCategory
  branch_name?: string
  warehouse_name?: string
}

export interface ApprovalWorkflow {
  id: string
  company_id: string
  branch_id?: string
  cost_center_id?: string
  warehouse_id?: string
  workflow_type: WorkflowType
  resource_type: string
  resource_id: string
  amount?: number
  currency_code?: string
  requested_by: string
  requested_at: string
  approver_id?: string
  approved_at?: string
  rejected_by?: string
  rejected_at?: string
  rejection_reason?: string
  executed_by?: string
  executed_at?: string
  status: ApprovalStatus
  notes?: string
  metadata?: Record<string, any>
  created_at: string
  updated_at: string
}

export interface RefundRequest {
  id: string
  company_id: string
  branch_id: string
  cost_center_id?: string
  request_number: string
  request_date: string
  source_type: string
  source_id: string
  customer_id?: string
  supplier_id?: string
  requested_amount: number
  approved_amount?: number
  currency_code: string
  reason: string
  notes?: string
  attachments?: any[]
  created_by: string
  branch_manager_approved_by?: string
  branch_manager_approved_at?: string
  final_approved_by?: string
  final_approved_at?: string
  rejected_by?: string
  rejected_at?: string
  rejection_reason?: string
  status: RefundStatus
  payment_id?: string
  payment_method?: string
  executed_by?: string
  executed_at?: string
  created_at: string
  updated_at: string
}

// =====================================================
// Notification Functions
// =====================================================

/**
 * إنشاء إشعار جديد
 * ✅ يدعم الآن: event_key (idempotency), severity, category
 */
export async function createNotification(params: {
  companyId: string
  referenceType: string
  referenceId: string
  title: string
  message: string
  createdBy: string
  branchId?: string
  costCenterId?: string
  warehouseId?: string
  assignedToRole?: string
  assignedToUser?: string
  priority?: NotificationPriority
  // ✅ المعاملات الجديدة (اختيارية للحفاظ على التوافق)
  eventKey?: string
  severity?: NotificationSeverity
  category?: NotificationCategory
}) {
  const supabase = createClient()

  console.log('📤 Calling create_notification RPC:', {
    companyId: params.companyId,
    referenceType: params.referenceType,
    referenceId: params.referenceId,
    branchId: params.branchId,
    warehouseId: params.warehouseId,
    costCenterId: params.costCenterId,
    assignedToRole: params.assignedToRole,
    assignedToUser: params.assignedToUser,
    eventKey: params.eventKey
  })

  const { data, error } = await supabase.rpc('create_notification', {
    p_company_id: params.companyId,
    p_reference_type: params.referenceType,
    p_reference_id: params.referenceId,
    p_title: params.title,
    p_message: params.message,
    p_created_by: params.createdBy,
    p_branch_id: params.branchId?.trim() || null,
    p_cost_center_id: params.costCenterId?.trim() || null,
    p_warehouse_id: params.warehouseId?.trim() || null,
    p_assigned_to_role: params.assignedToRole || null,
    p_assigned_to_user: params.assignedToUser?.trim() || null,
    p_priority: params.priority || 'normal',
    // ✅ المعاملات الجديدة
    p_event_key: params.eventKey || null,
    p_severity: params.severity || 'info',
    p_category: params.category || 'system'
  })

  if (error) {
    console.error('❌ Error in create_notification RPC:', error)
    throw error
  }

  console.log('✅ create_notification RPC succeeded:', data)
  return data
}

/**
 * الحصول على إشعارات المستخدم
 * ✅ محدث: يدعم الفلترة عبر الخادم (Server-side Filtering) للبحث والأولوية
 */
export async function getUserNotifications(params: {
  userId: string
  companyId: string
  branchId?: string
  warehouseId?: string
  status?: NotificationStatus
  severity?: NotificationSeverity
  category?: NotificationCategory
  searchQuery?: string
  priority?: string
  referenceType?: string
}) {
  const supabase = createClient()

  console.log('📥 [GET_NOTIFICATIONS] Fetching notifications:', {
    userId: params.userId,
    companyId: params.companyId,
    branchId: params.branchId ?? null,
    warehouseId: params.warehouseId ?? null,
    status: params.status ?? null,
    severity: params.severity ?? null,
    category: params.category ?? null,
    searchQuery: params.searchQuery ?? null,
    priority: params.priority ?? null,
    referenceType: params.referenceType ?? null
  })

  const { data, error } = await supabase.rpc('get_user_notifications', {
    p_user_id: params.userId,
    p_company_id: params.companyId,
    p_branch_id: params.branchId,
    p_warehouse_id: params.warehouseId,
    p_status: params.status,
    p_severity: params.severity || null,
    p_category: params.category || null,
    p_search_query: params.searchQuery || null,
    p_priority: params.priority || null,
    p_reference_type: params.referenceType || null
  })

  if (error) {
    console.error('❌ [GET_NOTIFICATIONS] Error fetching notifications:', error)
    throw error
  }

  console.log(`✅ [GET_NOTIFICATIONS] Fetched ${data?.length || 0} notifications`)
  if (data && data.length > 0) {
    console.log('📋 [GET_NOTIFICATIONS] Sample notifications:', data.slice(0, 3).map((n: any) => ({
      id: n.id,
      title: n.title,
      assigned_to_role: n.assigned_to_role,
      status: n.status
    })))
  }

  return data as Notification[]
}

/**
 * تحديد إشعار كمقروء
 */
export async function markNotificationAsRead(notificationId: string, userId: string) {
  const supabase = createClient()

  const { data, error } = await supabase.rpc('mark_notification_as_read', {
    p_notification_id: notificationId,
    p_user_id: userId
  })

  if (error) throw error
  return data
}

/**
 * ✅ تحديث حالة الإشعار (موحد)
 * الحالات المدعومة: 'unread', 'read', 'actioned', 'archived'
 */
export async function updateNotificationStatus(
  notificationId: string,
  newStatus: NotificationStatus,
  userId: string
): Promise<{ success: boolean; error?: string; notification_id?: string; old_status?: string; new_status?: string }> {
  const supabase = createClient()

  const { data, error } = await supabase.rpc('update_notification_status', {
    p_notification_id: notificationId,
    p_status: newStatus,      // ✅ اسم المعامل الصحيح في DB (كان p_new_status خطأً)
    p_user_id: userId
  })

  if (error) {
    console.error('❌ [UPDATE_NOTIFICATION_STATUS] Error:', error)
    throw error
  }

  // ✅ data هو JSONB object
  if (data && typeof data === 'object' && 'success' in data) {
    return data as { success: boolean; error?: string; notification_id?: string; old_status?: string; new_status?: string }
  }

  return { success: false, error: 'Invalid response from server' }
}

/**
 * ✅ تحديد مجموعة إشعارات كمقروءة دفعة واحدة (Batch API)
 */
export async function batchMarkNotificationsAsRead(
  notificationIds: string[],
  userId: string
): Promise<boolean> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('batch_mark_notifications_as_read', {
    p_notification_ids: notificationIds,
    p_user_id: userId
  })
  if (error) {
    console.error('❌ [BATCH_MARK_READ] Error:', error)
    throw error
  }
  return data
}

/**
 * ✅ تحديث حالة مجموعة إشعارات دفعة واحدة (Batch API)
 */
export async function batchUpdateNotificationStatus(
  notificationIds: string[],
  newStatus: NotificationStatus,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('batch_update_notification_status', {
    p_notification_ids: notificationIds,
    p_status: newStatus,
    p_user_id: userId
  })
  if (error) {
    console.error('❌ [BATCH_UPDATE_STATUS] Error:', error)
    throw error
  }
  return { success: true }
}

// =====================================================
// Approval Workflow Functions
// =====================================================

/**
 * إنشاء طلب موافقة
 */
export async function createApprovalRequest(params: {
  companyId: string
  resourceType: string
  resourceId: string
  workflowType: WorkflowType
  requestedBy: string
  branchId?: string
  costCenterId?: string
  warehouseId?: string
  amount?: number
  notes?: string
}) {
  const supabase = createClient()

  const { data, error } = await supabase.rpc('create_approval_request', {
    p_company_id: params.companyId,
    p_resource_type: params.resourceType,
    p_resource_id: params.resourceId,
    p_workflow_type: params.workflowType,
    p_requested_by: params.requestedBy,
    p_branch_id: params.branchId,
    p_cost_center_id: params.costCenterId,
    p_warehouse_id: params.warehouseId,
    p_amount: params.amount,
    p_notes: params.notes
  })

  if (error) throw error
  return data
}

/**
 * الموافقة على طلب
 */
export async function approveRequest(approvalId: string, approverId: string, notes?: string) {
  const supabase = createClient()

  const { data, error } = await supabase.rpc('approve_request', {
    p_approval_id: approvalId,
    p_approver_id: approverId,
    p_notes: notes
  })

  if (error) throw error
  return data
}

/**
 * رفض طلب
 */
export async function rejectRequest(approvalId: string, rejectedBy: string, rejectionReason: string) {
  const supabase = createClient()

  const { data, error } = await supabase.rpc('reject_request', {
    p_approval_id: approvalId,
    p_rejected_by: rejectedBy,
    p_rejection_reason: rejectionReason
  })

  if (error) throw error
  return data
}

// =====================================================
// Refund Request Functions
// =====================================================

/**
 * إنشاء طلب استرداد نقدي
 */
export async function createRefundRequest(params: {
  companyId: string
  branchId: string
  sourceType: string
  sourceId: string
  requestedAmount: number
  reason: string
  createdBy: string
  customerId?: string
  supplierId?: string
  costCenterId?: string
  notes?: string
}) {
  const supabase = createClient()

  const { data, error } = await supabase.rpc('create_refund_request', {
    p_company_id: params.companyId,
    p_branch_id: params.branchId,
    p_source_type: params.sourceType,
    p_source_id: params.sourceId,
    p_requested_amount: params.requestedAmount,
    p_reason: params.reason,
    p_created_by: params.createdBy,
    p_customer_id: params.customerId,
    p_supplier_id: params.supplierId,
    p_cost_center_id: params.costCenterId,
    p_notes: params.notes
  })

  if (error) throw error
  return data
}

/**
 * تقديم طلب استرداد للموافقة
 */
export async function submitRefundForApproval(refundId: string, submittedBy: string) {
  const supabase = createClient()

  const { data, error } = await supabase.rpc('submit_refund_for_approval', {
    p_refund_id: refundId,
    p_submitted_by: submittedBy
  })

  if (error) throw error
  return data
}

/**
 * موافقة مدير الفرع على طلب الاسترداد
 */
export async function approveRefundBranchManager(
  refundId: string,
  approverId: string,
  approvedAmount?: number
) {
  const supabase = createClient()

  const { data, error } = await supabase.rpc('approve_refund_branch_manager', {
    p_refund_id: refundId,
    p_approver_id: approverId,
    p_approved_amount: approvedAmount
  })

  if (error) throw error
  return data
}

/**
 * الموافقة النهائية على طلب الاسترداد (Owner)
 */
export async function approveRefundFinal(refundId: string, approverId: string) {
  const supabase = createClient()

  const { data, error } = await supabase.rpc('approve_refund_final', {
    p_refund_id: refundId,
    p_approver_id: approverId
  })

  if (error) throw error
  return data
}

/**
 * رفض طلب الاسترداد
 */
export async function rejectRefundRequest(
  refundId: string,
  rejectedBy: string,
  rejectionReason: string
) {
  const supabase = createClient()

  const { data, error } = await supabase.rpc('reject_refund_request', {
    p_refund_id: refundId,
    p_rejected_by: rejectedBy,
    p_rejection_reason: rejectionReason
  })

  if (error) throw error
  return data
}

// =====================================================
// Query Functions
// =====================================================

/**
 * الحصول على طلبات الاسترداد
 */
export async function getRefundRequests(params: {
  companyId: string
  branchId?: string
  status?: RefundStatus
  limit?: number
}) {
  const supabase = createClient()

  let query = supabase
    .from('refund_requests')
    .select('*, customer:customers(name), supplier:suppliers(name)')
    .eq('company_id', params.companyId)
    .order('created_at', { ascending: false })

  if (params.branchId) {
    query = query.eq('branch_id', params.branchId)
  }

  if (params.status) {
    query = query.eq('status', params.status)
  }

  if (params.limit) {
    query = query.limit(params.limit)
  }

  const { data, error } = await query

  if (error) throw error
  return data as RefundRequest[]
}

/**
 * الحصول على طلبات الموافقة
 */
export async function getApprovalWorkflows(params: {
  companyId: string
  branchId?: string
  status?: ApprovalStatus
  resourceType?: string
  limit?: number
}) {
  const supabase = createClient()

  let query = supabase
    .from('approval_workflows')
    .select('*')
    .eq('company_id', params.companyId)
    .order('requested_at', { ascending: false })

  if (params.branchId) {
    query = query.eq('branch_id', params.branchId)
  }

  if (params.status) {
    query = query.eq('status', params.status)
  }

  if (params.resourceType) {
    query = query.eq('resource_type', params.resourceType)
  }

  if (params.limit) {
    query = query.limit(params.limit)
  }

  const { data, error } = await query

  if (error) throw error
  return data as ApprovalWorkflow[]
}

/**
 * الحصول على سجل التدقيق
 */
export async function getAuditTrail(params: {
  companyId: string
  resourceType?: string
  resourceId?: string
  userId?: string
  actionType?: string
  limit?: number
}) {
  const supabase = createClient()

  let query = supabase
    .from('audit_trail')
    .select('*')
    .eq('company_id', params.companyId)
    .order('created_at', { ascending: false })

  if (params.resourceType) {
    query = query.eq('resource_type', params.resourceType)
  }

  if (params.resourceId) {
    query = query.eq('resource_id', params.resourceId)
  }

  if (params.userId) {
    query = query.eq('user_id', params.userId)
  }

  if (params.actionType) {
    query = query.eq('action_type', params.actionType)
  }

  if (params.limit) {
    query = query.limit(params.limit)
  }

  const { data, error } = await query

  if (error) throw error
  return data
}

// =====================================================
// Utility Functions
// =====================================================

/**
 * التحقق من صلاحية إنشاء سند صرف
 */
export async function canCreateRefundPayment(params: {
  customerId?: string
  supplierId?: string
  amount: number
}): Promise<{ allowed: boolean; reason?: string; refundRequestId?: string }> {
  const supabase = createClient()

  let query = supabase
    .from('refund_requests')
    .select('id, approved_amount, status')
    .eq('status', 'approved')
    .is('payment_id', null)

  if (params.customerId) {
    query = query.eq('customer_id', params.customerId)
  } else if (params.supplierId) {
    query = query.eq('supplier_id', params.supplierId)
  } else {
    return { allowed: false, reason: 'Either customerId or supplierId must be provided' }
  }

  const { data, error } = await query

  if (error) {
    return { allowed: false, reason: error.message }
  }

  if (!data || data.length === 0) {
    return { allowed: false, reason: 'No approved refund request found' }
  }

  const refund = data.find((r: { approved_amount?: number; id: string }) => r.approved_amount && r.approved_amount >= params.amount)

  if (!refund) {
    return { allowed: false, reason: 'No refund request with sufficient approved amount' }
  }

  return { allowed: true, refundRequestId: refund.id }
}

/**
 * الحصول على عدد الإشعارات غير المقروءة
 * مع Security Rules: يعرض فقط الإشعارات المخصصة للمستخدم أو لدوره
 * ✅ محدث: يطابق منطق getUserNotifications() بالضبط
 */
export async function getUnreadNotificationCount(
  userId: string,
  companyId: string,
  branchId?: string,
  userRole?: string
): Promise<number> {
  const supabase = createClient()

  // ✅ استخدام نفس دالة SQL المستخدمة في getUserNotifications
  // لضمان التطابق الكامل في المنطق
  const { data, error } = await supabase.rpc('get_user_notifications', {
    p_user_id: userId,
    p_company_id: companyId,
    p_branch_id: branchId || null,
    p_warehouse_id: null,
    p_status: 'unread',
    // ✅ إرسال المعاملات الجديدة (null للفلترة الكاملة)
    p_severity: null,
    p_category: null
  })

  if (error) throw error

  // ✅ فلترة حسب expires_at و archived (مثل getUserNotifications)
  const validNotifications = (data || []).filter((n: Notification) => {
    // التحقق من انتهاء الصلاحية
    if (n.expires_at) {
      const expiresAt = new Date(n.expires_at)
      if (expiresAt <= new Date()) {
        return false
      }
    }
    // التحقق من الأرشيف
    if (n.status === 'archived') {
      return false
    }
    return true
  })

  return validNotifications.length
}
