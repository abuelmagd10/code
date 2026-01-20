/**
 * 🔔 Notification Helpers
 * دوال مساعدة لإنشاء إشعارات تلقائية عند الأحداث المهمة
 */

import { createNotification, type NotificationPriority } from '@/lib/governance-layer'
import { createClient } from '@/lib/supabase/client'

/**
 * إنشاء إشعار عند إنشاء طلب استرداد نقدي
 * ✅ محدث: يدعم event_key و severity و category
 */
export async function notifyRefundRequestCreated(params: {
  companyId: string
  refundRequestId: string
  branchId?: string
  costCenterId?: string
  amount: number
  currency: string
  createdBy: string
  appLang?: 'ar' | 'en'
}) {
  const { companyId, refundRequestId, branchId, costCenterId, amount, currency, createdBy, appLang = 'ar' } = params

  const title = appLang === 'en' 
    ? 'New Refund Request' 
    : 'طلب استرداد نقدي جديد'
  
  const message = appLang === 'en'
    ? `A new refund request of ${amount} ${currency} requires your approval`
    : `طلب استرداد نقدي جديد بقيمة ${amount} ${currency} يحتاج إلى موافقتك`

  const eventKey = `refund_request:${refundRequestId}:created`

  // إشعار لمدير الفرع والمالك/المدير
  await createNotification({
    companyId,
    referenceType: 'refund_request',
    referenceId: refundRequestId,
    title,
    message,
    createdBy,
    branchId,
    costCenterId,
    assignedToRole: 'manager',
    priority: 'high' as NotificationPriority,
    eventKey: `${eventKey}:manager`,
    severity: 'high',
    category: 'finance'
  })

  await createNotification({
    companyId,
    referenceType: 'refund_request',
    referenceId: refundRequestId,
    title,
    message,
    createdBy,
    branchId,
    costCenterId,
    assignedToRole: 'owner',
    priority: 'high' as NotificationPriority,
    eventKey: `${eventKey}:owner`,
    severity: 'high',
    category: 'finance'
  })
}

/**
 * إنشاء إشعار عند الموافقة على طلب استرداد (الموافقة الأولى)
 * ✅ محدث: يدعم event_key و severity و category
 */
export async function notifyRefundApproved(params: {
  companyId: string
  refundRequestId: string
  branchId?: string
  costCenterId?: string
  approvedBy: string
  appLang?: 'ar' | 'en'
}) {
  const { companyId, refundRequestId, branchId, costCenterId, approvedBy, appLang = 'ar' } = params

  const title = appLang === 'en'
    ? 'Refund Request Approved'
    : 'تمت الموافقة على طلب الاسترداد'
  
  const message = appLang === 'en'
    ? 'A refund request has been approved and requires final approval'
    : 'تمت الموافقة على طلب الاسترداد ويحتاج إلى موافقة نهائية'

  // إشعار للمالك/المدير للموافقة النهائية
  await createNotification({
    companyId,
    referenceType: 'refund_request',
    referenceId: refundRequestId,
    title,
    message,
    createdBy: approvedBy,
    branchId,
    costCenterId,
    assignedToRole: 'owner',
    priority: 'urgent' as NotificationPriority,
    eventKey: `refund_request:${refundRequestId}:approved`,
    severity: 'warning',
    category: 'finance'
  })
}

/**
 * إنشاء إشعار عند طلب نقل مخزون
 * ✅ محدث: يدعم event_key و severity و category
 */
export async function notifyStockTransferRequest(params: {
  companyId: string
  transferId: string
  sourceBranchId?: string
  destinationBranchId?: string
  destinationWarehouseId?: string
  createdBy: string
  appLang?: 'ar' | 'en'
}) {
  const { companyId, transferId, destinationBranchId, destinationWarehouseId, createdBy, appLang = 'ar' } = params

  const title = appLang === 'en'
    ? 'New Stock Transfer Request'
    : 'طلب نقل مخزون جديد'
  
  const message = appLang === 'en'
    ? 'A new stock transfer request requires your approval'
    : 'طلب نقل مخزون جديد يحتاج إلى موافقتك'

  // إشعار لمسؤول المخزن الوجهة
  await createNotification({
    companyId,
    referenceType: 'stock_transfer',
    referenceId: transferId,
    title,
    message,
    createdBy,
    branchId: destinationBranchId,
    warehouseId: destinationWarehouseId,
    assignedToRole: 'store_manager',
    priority: 'high' as NotificationPriority,
    eventKey: `stock_transfer_request:${transferId}:created`,
    severity: 'info',
    category: 'inventory'
  })
}

/**
 * إنشاء إشعار عند إنشاء إشعار دائن المورد
 * ✅ محدث: يدعم event_key و severity و category
 */
export async function notifyVendorCreditCreated(params: {
  companyId: string
  vendorCreditId: string
  branchId?: string
  costCenterId?: string
  createdBy: string
  appLang?: 'ar' | 'en'
}) {
  const { companyId, vendorCreditId, branchId, costCenterId, createdBy, appLang = 'ar' } = params

  const title = appLang === 'en'
    ? 'New Vendor Credit'
    : 'إشعار دائن مورد جديد'
  
  const message = appLang === 'en'
    ? 'A new vendor credit has been created and requires review'
    : 'تم إنشاء إشعار دائن مورد جديد ويحتاج إلى مراجعة'

  const eventKey = `vendor_credit:${vendorCreditId}:created`

  // إشعار للمحاسب والمدير
  await createNotification({
    companyId,
    referenceType: 'vendor_credit',
    referenceId: vendorCreditId,
    title,
    message,
    createdBy,
    branchId,
    costCenterId,
    assignedToRole: 'accountant',
    priority: 'normal' as NotificationPriority,
    eventKey: `${eventKey}:accountant`,
    severity: 'info',
    category: 'finance'
  })

  await createNotification({
    companyId,
    referenceType: 'vendor_credit',
    referenceId: vendorCreditId,
    title,
    message,
    createdBy,
    branchId,
    costCenterId,
    assignedToRole: 'manager',
    priority: 'normal' as NotificationPriority,
    eventKey: `${eventKey}:manager`,
    severity: 'info',
    category: 'finance'
  })
}

/**
 * إنشاء إشعار عند إنشاء إشعار مدين العميل
 * ✅ محدث: يدعم event_key و severity و category
 */
export async function notifyCustomerDebitNoteCreated(params: {
  companyId: string
  debitNoteId: string
  branchId?: string
  costCenterId?: string
  createdBy: string
  appLang?: 'ar' | 'en'
}) {
  const { companyId, debitNoteId, branchId, costCenterId, createdBy, appLang = 'ar' } = params

  const title = appLang === 'en'
    ? 'New Customer Debit Note'
    : 'إشعار مدين عميل جديد'
  
  const message = appLang === 'en'
    ? 'A new customer debit note has been created and requires review'
    : 'تم إنشاء إشعار مدين عميل جديد ويحتاج إلى مراجعة'

  const eventKey = `customer_debit_note:${debitNoteId}:created`

  // إشعار للمحاسب والمدير
  await createNotification({
    companyId,
    referenceType: 'customer_debit_note',
    referenceId: debitNoteId,
    title,
    message,
    createdBy,
    branchId,
    costCenterId,
    assignedToRole: 'accountant',
    priority: 'normal' as NotificationPriority,
    eventKey: `${eventKey}:accountant`,
    severity: 'info',
    category: 'finance'
  })

  await createNotification({
    companyId,
    referenceType: 'customer_debit_note',
    referenceId: debitNoteId,
    title,
    message,
    createdBy,
    branchId,
    costCenterId,
    assignedToRole: 'manager',
    priority: 'normal' as NotificationPriority,
    eventKey: `${eventKey}:manager`,
    severity: 'info',
    category: 'finance'
  })
}

/**
 * إنشاء إشعار عند تغيير دور المستخدم
 * ✅ محدث: يدعم event_key و severity و category
 */
export async function notifyUserRoleChanged(params: {
  companyId: string
  userId: string
  oldRole: string
  newRole: string
  changedBy: string
  appLang?: 'ar' | 'en'
}) {
  const { companyId, userId, oldRole, newRole, changedBy, appLang = 'ar' } = params

  const title = appLang === 'en'
    ? 'Your Role Has Changed'
    : 'تم تغيير دورك'
  
  const message = appLang === 'en'
    ? `Your role has been changed from ${oldRole} to ${newRole}`
    : `تم تغيير دورك من ${oldRole} إلى ${newRole}`

  // إشعار للمستخدم نفسه
  await createNotification({
    companyId,
    referenceType: 'user_role_change',
    referenceId: userId,
    title,
    message,
    createdBy: changedBy,
    assignedToUser: userId,
    priority: 'normal' as NotificationPriority,
    eventKey: `user_role_change:${userId}:${newRole}`,
    severity: 'info',
    category: 'system'
  })
}

/**
 * إنشاء إشعار عند تغيير فرع المستخدم
 * ✅ محدث: يدعم event_key و severity و category
 */
export async function notifyUserBranchChanged(params: {
  companyId: string
  userId: string
  branchId?: string
  changedBy: string
  appLang?: 'ar' | 'en'
}) {
  const { companyId, userId, branchId, changedBy, appLang = 'ar' } = params

  const title = appLang === 'en'
    ? 'Your Branch Has Changed'
    : 'تم تغيير فرعك'
  
  const message = appLang === 'en'
    ? 'Your assigned branch has been changed'
    : 'تم تغيير الفرع المخصص لك'

  // إشعار للمستخدم نفسه
  await createNotification({
    companyId,
    referenceType: 'user_branch_change',
    referenceId: userId,
    title,
    message,
    createdBy: changedBy,
    branchId,
    assignedToUser: userId,
    priority: 'normal' as NotificationPriority,
    eventKey: `user_branch_change:${userId}:${branchId || 'none'}`,
    severity: 'info',
    category: 'system'
  })
}

/**
 * إنشاء إشعار عند طلب موافقة على فاتورة مشتريات
 * ✅ محدث: يدعم event_key و severity و category
 */
export async function notifyPurchaseApprovalRequest(params: {
  companyId: string
  billId: string
  branchId?: string
  costCenterId?: string
  amount: number
  currency: string
  createdBy: string
  appLang?: 'ar' | 'en'
}) {
  const { companyId, billId, branchId, costCenterId, amount, currency, createdBy, appLang = 'ar' } = params

  const title = appLang === 'en'
    ? 'Purchase Bill Approval Required'
    : 'طلب موافقة على فاتورة مشتريات'
  
  const message = appLang === 'en'
    ? `A purchase bill of ${amount} ${currency} requires your approval`
    : `فاتورة مشتريات بقيمة ${amount} ${currency} تحتاج إلى موافقتك`

  // إشعار لمدير الفرع
  await createNotification({
    companyId,
    referenceType: 'purchase_approval',
    referenceId: billId,
    title,
    message,
    createdBy,
    branchId,
    costCenterId,
    assignedToRole: 'manager',
    priority: 'high' as NotificationPriority,
    eventKey: `purchase_approval:${billId}:created`,
    severity: 'warning',
    category: 'approvals'
  })
}
