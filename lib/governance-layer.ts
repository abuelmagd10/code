/**
 * 🏛️ Governance Layer - TypeScript Helpers
 * نظام الحوكمة الشامل - دوال مساعدة للواجهة الأمامية
 * 
 * IFRS + SOX + Anti-Fraud Compliant
 */

import { createClient } from '@/lib/supabase/client'
import { normalizeNotificationSeverity } from '@/lib/notification-workflow'

// =====================================================
// Types
// =====================================================

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent' | 'critical'
export type NotificationStatus = 'unread' | 'read' | 'archived' | 'actioned'
export type NotificationSeverity = 'info' | 'warning' | 'error' | 'critical'
export type NotificationCategory =
  | 'finance' | 'inventory' | 'sales' | 'approvals' | 'system'
  | 'billing' | 'hr' | 'manufacturing'
// v3.74.588 — تصنيف صريح عند الإنشاء: 'action' = مطلوب قرار/تنفيذ، 'info' = للعلم فقط
export type NotificationKind = 'action' | 'info'

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
  // v3.74.588 — نوع الإشعار (إجراء مطلوب / للعلم)
  kind?: NotificationKind
  branch_name?: string
  warehouse_name?: string
}

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
  // v3.74.588 — تصنيف صريح: 'action' لطلبات الاعتماد/التنفيذ، الافتراضي 'info'
  kind?: NotificationKind
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
    p_severity: normalizeNotificationSeverity(params.severity),
    p_category: params.category || 'system',
    // v3.74.588 — تمرير نوع الإشعار (المعامل له DEFAULT 'info' في قاعدة البيانات)
    p_kind: params.kind || 'info'
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

  const rows = (data || []) as Notification[]

  // v3.74.588 — دالة get_user_notifications في قاعدة البيانات لا تُعيد عمود kind،
  // فنُكمله بقراءة مباشرة خفيفة (best-effort) عبر RLS حتى تعمل شارة «إجراء مطلوب»
  // والأرشفة التلقائية الذكية عند فتح المرجع. أي فشل هنا لا يؤثر على عرض الإشعارات.
  if (rows.length > 0) {
    try {
      const { data: kindRows } = await supabase
        .from('notifications')
        .select('id, kind')
        .in('id', rows.map((r) => r.id))
      if (kindRows) {
        const kindMap = new Map<string, string>(
          (kindRows as { id: string; kind: string | null }[]).map((r) => [r.id, r.kind || 'info'])
        )
        for (const r of rows) {
          const k = kindMap.get(r.id)
          if (k === 'action' || k === 'info') r.kind = k
        }
      }
    } catch (kindErr) {
      console.warn('⚠️ [GET_NOTIFICATIONS] kind enrichment failed (non-fatal):', kindErr)
    }
  }

  return rows
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

  // ✅ الدالة في SQL تعيد boolean
  if (data === true) {
    return { success: true }
  } else if (data && typeof data === 'object' && 'success' in data) {
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
