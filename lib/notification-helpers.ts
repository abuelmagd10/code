/**
 * 🔔 Notification Helpers
 * دوال مساعدة لإنشاء إشعارات تلقائية عند الأحداث المهمة
 */

import { createNotification, type NotificationPriority } from '@/lib/governance-layer'
import { createClient } from '@/lib/supabase/client'

// ✅ Import Supabase client للفحص من التكرار

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
    severity: 'warning',
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
    severity: 'warning',
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
 * إشعار إنشاء مرتجع شراء يحتاج اعتماد (للمالك/المدير العام)
 * يُرسل إلى: مسؤول المخزن المعني + محاسب الفرع
 */
export async function notifyPurchaseReturnPendingApproval(params: {
  companyId: string
  purchaseReturnId: string
  returnNumber: string
  supplierName: string
  totalAmount: number
  currency: string
  warehouseId: string
  branchId?: string
  createdBy: string
  createdByName?: string
  appLang?: 'ar' | 'en'
}) {
  const { companyId, purchaseReturnId, returnNumber, supplierName, totalAmount, currency,
    warehouseId, branchId, createdBy, createdByName, appLang = 'ar' } = params

  const title = appLang === 'en'
    ? `Purchase Return Requires Your Approval`
    : `مرتجع مشتريات يحتاج اعتمادك`

  const message = appLang === 'en'
    ? `Return #${returnNumber} for supplier ${supplierName} (${totalAmount} ${currency}) requires your confirmation to deliver goods to supplier.`
    : `مرتجع رقم ${returnNumber} للمورد ${supplierName} (${totalAmount} ${currency}) يحتاج تأكيدك بتسليم البضاعة للمورد.`

  // نضمّن warehouse_id في event_key لتجنب الدمج بين إشعارات مخازن مختلفة
  const warehouseSuffix = warehouseId ? `:${warehouseId}` : ''
  const eventKey = `purchase_return:${purchaseReturnId}:pending_approval${warehouseSuffix}`

  // إشعار لمسؤول المخزن
  await createNotification({
    companyId,
    referenceType: 'purchase_return',
    referenceId: purchaseReturnId,
    title,
    message,
    createdBy,
    branchId,
    warehouseId,
    assignedToRole: 'store_manager',
    priority: 'high' as NotificationPriority,
    eventKey: `${eventKey}:store_manager`,
    severity: 'warning',
    category: 'inventory',
  })

  // إشعار لمحاسب الفرع
  await createNotification({
    companyId,
    referenceType: 'purchase_return',
    referenceId: purchaseReturnId,
    title: appLang === 'en' ? `Purchase Return Created - Pending Delivery` : `مرتجع مشتريات جديد - بانتظار التسليم`,
    message: appLang === 'en'
      ? `Return #${returnNumber} created by ${createdByName || 'Management'} pending warehouse manager confirmation.`
      : `مرتجع رقم ${returnNumber} أنشأه ${createdByName || 'الإدارة'} في انتظار اعتماد مسؤول المخزن.`,
    createdBy,
    branchId,
    warehouseId,
    assignedToRole: 'accountant',
    priority: 'normal' as NotificationPriority,
    eventKey: `${eventKey}:accountant`,
    severity: 'info',
    category: 'inventory',
  })
}

/**
 * إشعار اعتماد تسليم مرتجع المشتريات
 * يُرسل إلى: المالك / المدير العام الذي أنشأ المرتجع
 */
export async function notifyPurchaseReturnConfirmed(params: {
  companyId: string
  purchaseReturnId: string
  returnNumber: string
  supplierName: string
  totalAmount: number
  currency: string
  confirmedByName?: string
  createdBy: string
  appLang?: 'ar' | 'en'
}) {
  const { companyId, purchaseReturnId, returnNumber, supplierName, totalAmount, currency,
    confirmedByName, createdBy, appLang = 'ar' } = params

  const title = appLang === 'en' ? `Purchase Return Confirmed` : `تم اعتماد مرتجع المشتريات`

  const message = appLang === 'en'
    ? `Return #${returnNumber} for ${supplierName} (${totalAmount} ${currency}) has been confirmed and goods delivered to supplier${confirmedByName ? ` by ${confirmedByName}` : ''}.`
    : `تم اعتماد مرتجع رقم ${returnNumber} للمورد ${supplierName} (${totalAmount} ${currency}) وتسليم البضاعة${confirmedByName ? ` بواسطة ${confirmedByName}` : ''}.`

  await createNotification({
    companyId,
    referenceType: 'purchase_return',
    referenceId: purchaseReturnId,
    title,
    message,
    createdBy,
    assignedToUser: createdBy,
    priority: 'normal' as NotificationPriority,
    eventKey: `purchase_return:${purchaseReturnId}:confirmed`,
    severity: 'info',
    category: 'inventory',
  })
}

/**
 * إشعار اعتماد تخصيص مخزن واحد في مرتجع متعدد المخازن (المرحلة الثانية)
 * يُرسل إلى: المالك / المدير العام الذي أنشأ المرتجع
 * - عند الاعتماد الجزئي: يُعلم بالحالة الجزئية
 * - عند الاعتماد الكامل: يُعلم باكتمال الاعتماد
 */
export async function notifyWarehouseAllocationConfirmed(params: {
  companyId: string
  purchaseReturnId: string
  returnNumber: string
  supplierName: string
  allocationId: string
  warehouseId: string
  warehouseName: string
  totalAmount: number
  currency: string
  pendingAllocations: number
  isFullyConfirmed: boolean
  confirmedByName?: string
  createdBy: string
  appLang?: 'ar' | 'en'
}) {
  const {
    companyId, purchaseReturnId, returnNumber, supplierName,
    allocationId, warehouseId, warehouseName, totalAmount, currency,
    pendingAllocations, isFullyConfirmed, confirmedByName, createdBy, appLang = 'ar'
  } = params

  if (isFullyConfirmed) {
    const title = appLang === 'en' ? `Purchase Return Fully Confirmed` : `تم اعتماد مرتجع المشتريات كاملاً`
    const message = appLang === 'en'
      ? `All warehouses confirmed. Return #${returnNumber} for ${supplierName} (${totalAmount} ${currency}) is fully processed${confirmedByName ? ` — last confirmed by ${confirmedByName}` : ''}.`
      : `اعتمدت جميع المخازن. مرتجع #${returnNumber} للمورد ${supplierName} (${totalAmount} ${currency}) مكتمل${confirmedByName ? ` — آخر اعتماد بواسطة ${confirmedByName}` : ''}.`

    await createNotification({
      companyId,
      referenceType: 'purchase_return',
      referenceId: purchaseReturnId,
      title,
      message,
      createdBy,
      assignedToUser: createdBy,
      priority: 'normal' as NotificationPriority,
      eventKey: `purchase_return:${purchaseReturnId}:confirmed`,
      severity: 'info',
      category: 'inventory',
    })
  } else {
    const title = appLang === 'en'
      ? `Warehouse Confirmed — Return Partially Approved`
      : `تم اعتماد مخزن — مرتجع معتمد جزئياً`
    const message = appLang === 'en'
      ? `Warehouse "${warehouseName}" confirmed for Return #${returnNumber}${confirmedByName ? ` by ${confirmedByName}` : ''}. ${pendingAllocations} warehouse(s) still pending.`
      : `اعتمد المخزن "${warehouseName}" للمرتجع #${returnNumber}${confirmedByName ? ` بواسطة ${confirmedByName}` : ''}. ${pendingAllocations} مخزن لا يزال بانتظار الاعتماد.`

    await createNotification({
      companyId,
      referenceType: 'purchase_return',
      referenceId: purchaseReturnId,
      title,
      message,
      createdBy,
      assignedToUser: createdBy,
      warehouseId,
      priority: 'normal' as NotificationPriority,
      eventKey: `purchase_return:${purchaseReturnId}:allocation:${allocationId}:confirmed`,
      severity: 'info',
      category: 'inventory',
    })
  }
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

// =====================================================
// 🔔 Inventory Write-Off Approval Notifications
// =====================================================

/**
 * إنشاء إشعار عند إنشاء إهلاك جديد بحالة Pending
 * ✅ يتم إرسال الإشعار إلى Admin فقط (Owner يرى إشعارات Admin تلقائياً - تجنب التكرار)
 */
export async function notifyWriteOffApprovalRequest(params: {
  companyId: string
  writeOffId: string
  writeOffNumber: string
  branchId?: string
  warehouseId?: string
  costCenterId?: string
  createdBy: string
  appLang?: 'ar' | 'en'
}) {
  const { companyId, writeOffId, writeOffNumber, branchId, warehouseId, costCenterId, createdBy, appLang = 'ar' } = params

  const title = appLang === 'en'
    ? 'New Write-Off Approval Request'
    : 'طلب اعتماد إهلاك جديد'

  const message = appLang === 'en'
    ? `A new write-off ${writeOffNumber} is pending your approval`
    : `يوجد إهلاك جديد رقم ${writeOffNumber} في انتظار اعتمادك`

  const eventKey = `write_off:${writeOffId}:approval_request`

  // ✅ حماية من التكرار: فحص إذا كان الإشعار موجوداً بالفعل
  // نستخدم RPC call للتحقق من وجود إشعار بنفس event_key
  const supabase = createClient()
  try {
    console.log('🔍 [NOTIFY] Checking for existing notification with event_key:', eventKey)

    // استخدام RPC للتحقق من التكرار (أكثر أماناً من RLS)
    const { data: existingCheck, error: checkError } = await supabase.rpc('check_notification_exists', {
      p_company_id: companyId,
      p_event_key: eventKey
    }).single()

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.warn('⚠️ [NOTIFY] Error checking for existing notifications:', checkError)
    } else if (existingCheck && existingCheck.notification_exists) {
      console.log('⚠️ [NOTIFY] Notification already exists with event_key:', eventKey, 'Skipping creation.')
      console.log('⚠️ [NOTIFY] Existing notification ID:', existingCheck.notification_id)
      return // ✅ منع التكرار - الإشعار موجود بالفعل
    } else {
      console.log('✅ [NOTIFY] No existing notification found, proceeding with creation')
    }
  } catch (checkErr: any) {
    // إذا لم تكن الدالة موجودة، نستخدم فحص مباشر
    console.warn('⚠️ [NOTIFY] RPC check failed, using direct query:', checkErr?.message)
    try {
      const { data: existingNotifications, error: directError } = await supabase
        .from('notifications')
        .select('id, event_key, created_at')
        .eq('company_id', companyId)
        .eq('event_key', eventKey)
        .neq('status', 'archived')
        .limit(1)

      if (!directError && existingNotifications && existingNotifications.length > 0) {
        console.log('⚠️ [NOTIFY] Notification already exists (direct check). Skipping creation.')
        console.log('⚠️ [NOTIFY] Existing notification ID:', existingNotifications[0].id)
        return
      }
    } catch (directErr: any) {
      console.warn('⚠️ [NOTIFY] Direct check also failed:', directErr)
      // نستمر في الإنشاء رغم الخطأ في الفحص
    }
  }

  // إشعار لـ Admin
  try {
    // ✅ ERP Standard: ننشئ إشعار admin فقط لأن owner يرى إشعارات admin (تجنب التكرار)
    console.log('🔔 [NOTIFY] Creating notification for Admin (owner will also see it):', {
      companyId,
      writeOffId,
      writeOffNumber,
      eventKey,
      branchId: branchId || 'null',
      warehouseId: warehouseId || 'null',
      costCenterId: costCenterId || 'null'
    })

    const notificationId = await createNotification({
      companyId,
      referenceType: 'inventory_write_off',
      referenceId: writeOffId,
      title,
      message,
      createdBy,
      branchId,
      warehouseId,
      costCenterId,
      assignedToRole: 'admin',
      priority: 'high' as NotificationPriority,
      eventKey,
      severity: 'warning',
      category: 'inventory'
    })

    console.log('✅ [NOTIFY] Admin notification created successfully. ID:', notificationId)
  } catch (error: any) {
    console.error('❌ [NOTIFY] CRITICAL: Error creating Admin notification')
    console.error('❌ [NOTIFY] Error details:', {
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
      stack: error?.stack
    })

    // ⚠️ إذا فشل كلاهما، نرمي خطأ
    throw new Error(`Failed to create notifications for write-off ${writeOffNumber}. Please ensure QUICK_FIX_NOTIFICATIONS.sql has been run in Supabase. Error: ${error?.message || 'Unknown error'}`)
  }
}

/**
 * إنشاء إشعار عند تعديل إهلاك قبل الاعتماد
 * يتم إرسال الإشعار إلى Owner و Admin لإعادة المراجعة
 */
export async function notifyWriteOffModified(params: {
  companyId: string
  writeOffId: string
  writeOffNumber: string
  branchId?: string
  warehouseId?: string
  costCenterId?: string
  modifiedBy: string
  appLang?: 'ar' | 'en'
}) {
  const { companyId, writeOffId, writeOffNumber, branchId, warehouseId, costCenterId, modifiedBy, appLang = 'ar' } = params

  const title = appLang === 'en'
    ? 'Write-Off Modified - Re-approval Required'
    : 'تم تعديل إهلاك في انتظار الاعتماد'

  const message = appLang === 'en'
    ? `Write-off ${writeOffNumber} has been modified and requires re-review and approval`
    : `تم تعديل الإهلاك رقم ${writeOffNumber} ويحتاج إعادة مراجعة واعتماد`

  const eventKey = `write_off:${writeOffId}:modified`

  // ✅ حماية من التكرار: فحص إذا كان الإشعار موجوداً بالفعل
  const supabase = createClient()
  try {
    console.log('🔍 [NOTIFY] Checking for existing modification notification with event_key:', eventKey)

    // استخدام RPC للتحقق من التكرار (أكثر أماناً من RLS)
    const { data: existingCheck, error: checkError } = await supabase.rpc('check_notification_exists', {
      p_company_id: companyId,
      p_event_key: eventKey
    }).single()

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.warn('⚠️ [NOTIFY] Error checking for existing modification notifications:', checkError)
    } else if (existingCheck && existingCheck.notification_exists) {
      console.log('⚠️ [NOTIFY] Modification notification already exists with event_key:', eventKey, 'Skipping creation.')
      console.log('⚠️ [NOTIFY] Existing notification ID:', existingCheck.notification_id)
      return // ✅ منع التكرار - الإشعار موجود بالفعل
    } else {
      console.log('✅ [NOTIFY] No existing modification notification found, proceeding with creation')
    }
  } catch (checkErr: any) {
    // إذا لم تكن الدالة موجودة، نستخدم فحص مباشر
    console.warn('⚠️ [NOTIFY] RPC check failed, using direct query:', checkErr?.message)
    try {
      const { data: existingNotifications, error: directError } = await supabase
        .from('notifications')
        .select('id, event_key, created_at')
        .eq('company_id', companyId)
        .eq('event_key', eventKey)
        .neq('status', 'archived')
        .limit(1)

      if (!directError && existingNotifications && existingNotifications.length > 0) {
        console.log('⚠️ [NOTIFY] Modification notification already exists (direct check). Skipping creation.')
        console.log('⚠️ [NOTIFY] Existing notification ID:', existingNotifications[0].id)
        return
      }
    } catch (directErr: any) {
      console.warn('⚠️ [NOTIFY] Direct check also failed:', directErr)
      // نستمر في الإنشاء رغم الخطأ في الفحص
    }
  }

  try {
    // إشعار لـ Admin
    // ✅ ERP Standard: ننشئ إشعار admin فقط لأن owner يرى إشعارات admin (تجنب التكرار)
    console.log('🔔 [NOTIFY] Creating modification notification for Admin (owner will also see it):', {
      companyId,
      writeOffId,
      writeOffNumber,
      eventKey
    })
    const notificationId = await createNotification({
      companyId,
      referenceType: 'inventory_write_off',
      referenceId: writeOffId,
      title,
      message,
      createdBy: modifiedBy,
      branchId,
      warehouseId,
      costCenterId,
      assignedToRole: 'admin',
      priority: 'high' as NotificationPriority,
      eventKey,
      severity: 'warning',
      category: 'inventory'
    })
    console.log('✅ [NOTIFY] Admin modification notification created successfully. ID:', notificationId)
  } catch (error: any) {
    console.error('❌ Error creating Admin modification notification:', error)
    throw error
  }
}

/**
 * إنشاء إشعار عند اعتماد الإهلاك
 * ✅ يتم إرسال الإشعار للمنشئ الأصلي فقط
 */
export async function notifyWriteOffApproved(params: {
  companyId: string
  writeOffId: string
  writeOffNumber: string
  createdBy: string // المنشئ الأصلي
  approvedBy: string
  approvedByName?: string // اسم من قام بالاعتماد (اختياري)
  branchId?: string
  warehouseId?: string
  costCenterId?: string
  appLang?: 'ar' | 'en'
}) {
  const { companyId, writeOffId, writeOffNumber, createdBy, approvedBy, approvedByName, branchId, warehouseId, costCenterId, appLang = 'ar' } = params

  const title = appLang === 'en'
    ? 'Write-Off Approved'
    : 'تم اعتماد الإهلاك'

  const approvedByText = approvedByName
    ? (appLang === 'en' ? ` by ${approvedByName}` : ` بواسطة ${approvedByName}`)
    : ''

  const message = appLang === 'en'
    ? `Write-off ${writeOffNumber} has been approved successfully${approvedByText}`
    : `تم اعتماد الإهلاك رقم ${writeOffNumber} بنجاح${approvedByText}`

  // إشعار للمنشئ فقط
  await createNotification({
    companyId,
    referenceType: 'inventory_write_off',
    referenceId: writeOffId,
    title,
    message,
    createdBy: approvedBy,
    branchId,
    warehouseId,
    costCenterId,
    assignedToUser: createdBy, // إرسال للمنشئ الأصلي
    priority: 'normal' as NotificationPriority,
    eventKey: `write_off:${writeOffId}:approved`,
    severity: 'info',
    category: 'inventory'
  })
}

/**
 * إغلاق/أرشفة إشعارات الاعتماد السابقة عند اعتماد الإهلاك
 * يتم تحديث جميع إشعارات approval_request لهذا الإهلاك إلى actioned
 */
export async function archiveWriteOffApprovalNotifications(params: {
  companyId: string
  writeOffId: string
}) {
  const { companyId, writeOffId } = params
  const supabase = createClient()

  // تحديث جميع إشعارات approval_request و modified لهذا الإهلاك
  const { error } = await supabase
    .from('notifications')
    .update({
      status: 'actioned',
      actioned_at: new Date().toISOString()
    })
    .eq('company_id', companyId)
    .eq('reference_type', 'inventory_write_off')
    .eq('reference_id', writeOffId)
    .in('status', ['unread', 'read']) // فقط الإشعارات غير المؤرشفة

  if (error) {
    console.error('Error archiving write-off approval notifications:', error)
    // لا نرمي خطأ لأن هذا ليس حرجاً
  }
}

/**
 * إنشاء إشعار عند رفض الإهلاك
 * ✅ يتم إرسال الإشعار للمنشئ الأصلي فقط
 */
export async function notifyWriteOffRejected(params: {
  companyId: string
  writeOffId: string
  writeOffNumber: string
  createdBy: string // المنشئ الأصلي
  rejectedBy: string
  rejectedByName?: string // اسم من قام بالرفض (اختياري)
  rejectionReason?: string
  branchId?: string
  warehouseId?: string
  costCenterId?: string
  appLang?: 'ar' | 'en'
}) {
  const { companyId, writeOffId, writeOffNumber, createdBy, rejectedBy, rejectedByName, rejectionReason, branchId, warehouseId, costCenterId, appLang = 'ar' } = params

  const title = appLang === 'en'
    ? 'Write-Off Rejected'
    : 'تم رفض الإهلاك'

  const reasonText = rejectionReason
    ? (appLang === 'en' ? ` Reason: ${rejectionReason}` : ` السبب: ${rejectionReason}`)
    : ''

  const rejectedByText = rejectedByName
    ? (appLang === 'en' ? ` by ${rejectedByName}` : ` بواسطة ${rejectedByName}`)
    : ''

  const message = appLang === 'en'
    ? `Write-off ${writeOffNumber} has been rejected${rejectedByText}. Please review the data and resubmit for approval.${reasonText}`
    : `تم رفض الإهلاك رقم ${writeOffNumber}${rejectedByText}. يرجى مراجعة البيانات وإعادة الإرسال للاعتماد.${reasonText}`

  // إشعار للمنشئ فقط
  await createNotification({
    companyId,
    referenceType: 'inventory_write_off',
    referenceId: writeOffId,
    title,
    message,
    createdBy: rejectedBy,
    branchId,
    warehouseId,
    costCenterId,
    assignedToUser: createdBy, // إرسال للمنشئ الأصلي
    priority: 'high' as NotificationPriority,
    eventKey: `write_off:${writeOffId}:rejected`,
    severity: 'error',
    category: 'inventory'
  })
}

/**
 * إنشاء إشعار عند إلغاء الإهلاك المعتمد
 * ✅ يتم إرسال الإشعار للمنشئ الأصلي فقط
 */
export async function notifyWriteOffCancelled(params: {
  companyId: string
  writeOffId: string
  writeOffNumber: string
  createdBy: string // المنشئ الأصلي
  cancelledBy: string
  cancelledByName?: string // اسم من قام بالإلغاء (اختياري)
  cancellationReason?: string
  branchId?: string
  warehouseId?: string
  costCenterId?: string
  appLang?: 'ar' | 'en'
}) {
  const { companyId, writeOffId, writeOffNumber, createdBy, cancelledBy, cancelledByName, cancellationReason, branchId, warehouseId, costCenterId, appLang = 'ar' } = params

  const title = appLang === 'en'
    ? 'Write-Off Cancelled'
    : 'تم إلغاء الإهلاك'

  const reasonText = cancellationReason
    ? (appLang === 'en' ? ` Reason: ${cancellationReason}` : ` السبب: ${cancellationReason}`)
    : ''

  const cancelledByText = cancelledByName
    ? (appLang === 'en' ? ` by ${cancelledByName}` : ` بواسطة ${cancelledByName}`)
    : ''

  const message = appLang === 'en'
    ? `Write-off ${writeOffNumber} has been cancelled${cancelledByText}. A reversal entry has been created to restore inventory.${reasonText}`
    : `تم إلغاء الإهلاك رقم ${writeOffNumber}${cancelledByText}. تم إنشاء قيد عكسي لاستعادة المخزون.${reasonText}`

  // إشعار للمنشئ فقط
  await createNotification({
    companyId,
    referenceType: 'inventory_write_off',
    referenceId: writeOffId,
    title,
    message,
    createdBy: cancelledBy,
    branchId,
    warehouseId,
    costCenterId,
    assignedToUser: createdBy, // إرسال للمنشئ الأصلي
    priority: 'high' as NotificationPriority,
    eventKey: `write_off:${writeOffId}:cancelled`,
    severity: 'warning',
    category: 'inventory'
  })
}

// ============================================
// 🔐 إشعارات دورة اعتماد نقل المخزون للمحاسب
// ============================================

/**
 * إشعار طلب اعتماد نقل مخزون من المحاسب
 * يُرسل إلى: Owner, Admin, General Manager
 */
export async function notifyTransferApprovalRequest(params: {
  companyId: string
  transferId: string
  transferNumber: string
  sourceBranchId?: string
  destinationBranchId?: string
  createdBy: string
  createdByName?: string
  appLang?: 'ar' | 'en'
}) {
  const { companyId, transferId, transferNumber, sourceBranchId, createdBy, createdByName, appLang = 'ar' } = params

  const title = appLang === 'en'
    ? 'Transfer Request Pending Approval'
    : 'طلب نقل مخزون يحتاج اعتماد'

  const message = appLang === 'en'
    ? `Transfer request ${transferNumber} created by ${createdByName || 'Accountant'} requires your approval`
    : `طلب نقل ${transferNumber} من ${createdByName || 'المحاسب'} يحتاج إلى موافقتك`

  const eventKey = `transfer_approval:${transferId}:requested`

  // ✅ إشعار واحد فقط - بدون تحديد دور
  // سيظهر لكل من لديه صلاحية في الشركة
  // ثم نعتمد على منطق الفلترة في الـ frontend لإظهاره للأدوار المناسبة
  //
  // ملاحظة: عندما assigned_to_role = NULL:
  // - دالة get_user_notifications تعيد الإشعار لكل الأدوار
  // - لكن الـ frontend يفلتر حسب الدور
  //
  // الحل: نستخدم category = 'approval' للتمييز
  // ونعدل منطق الفلترة لاحقاً إذا لزم الأمر
  await createNotification({
    companyId,
    referenceType: 'stock_transfer',
    referenceId: transferId,
    title,
    message,
    createdBy,
    branchId: sourceBranchId,
    // ✅ بدون assignedToRole - سيظهر للجميع في الشركة
    // لكن فقط owner/admin/general_manager سيهتمون به (طلب اعتماد)
    priority: 'high' as NotificationPriority,
    eventKey, // eventKey موحد لمنع التكرار
    severity: 'warning',
    category: 'approvals' // ✅ تصنيف خاص لطلبات الاعتماد
  })
}

/**
 * إشعار اعتماد طلب نقل المخزون
 * يُرسل إلى: المحاسب المنشئ
 */
export async function notifyTransferApproved(params: {
  companyId: string
  transferId: string
  transferNumber: string
  branchId?: string
  approvedBy: string
  approvedByName?: string
  createdBy: string // المحاسب المنشئ
  appLang?: 'ar' | 'en'
}) {
  const { companyId, transferId, transferNumber, branchId, approvedBy, approvedByName, createdBy, appLang = 'ar' } = params

  const title = appLang === 'en'
    ? 'Transfer Request Approved'
    : 'تم اعتماد طلب النقل'

  const message = appLang === 'en'
    ? `Your transfer request ${transferNumber} has been approved by ${approvedByName || 'Management'}`
    : `تم اعتماد طلب النقل ${transferNumber} بواسطة ${approvedByName || 'الإدارة'}`

  // إشعار للمحاسب المنشئ
  await createNotification({
    companyId,
    referenceType: 'stock_transfer',
    referenceId: transferId,
    title,
    message,
    createdBy: approvedBy,
    branchId,
    assignedToUser: createdBy,
    priority: 'normal' as NotificationPriority,
    eventKey: `transfer_approval:${transferId}:approved`,
    severity: 'info',
    category: 'inventory'
  })
}

/**
 * إشعار رفض طلب نقل المخزون
 * يُرسل إلى: المحاسب المنشئ
 */
export async function notifyTransferRejected(params: {
  companyId: string
  transferId: string
  transferNumber: string
  branchId?: string
  rejectedBy: string
  rejectedByName?: string
  rejectionReason?: string
  createdBy: string // المحاسب المنشئ
  appLang?: 'ar' | 'en'
}) {
  const { companyId, transferId, transferNumber, rejectedBy, rejectedByName, rejectionReason, createdBy, appLang = 'ar' } = params

  const title = appLang === 'en'
    ? 'Transfer Request Rejected'
    : 'تم رفض طلب النقل'

  const reasonText = rejectionReason
    ? (appLang === 'en' ? `\nReason: ${rejectionReason}` : `\nالسبب: ${rejectionReason}`)
    : ''

  const message = appLang === 'en'
    ? `Your transfer request ${transferNumber} has been rejected by ${rejectedByName || 'Management'}${reasonText}`
    : `تم رفض طلب النقل ${transferNumber} بواسطة ${rejectedByName || 'الإدارة'}${reasonText}`

  // إشعار للمحاسب المنشئ
  // ⚠️ لا نرسل branchId لأن الإشعار شخصي (assigned_to_user)
  // وقد يكون المحاسب في فرع مختلف عن فرع المخزن المصدر
  await createNotification({
    companyId,
    referenceType: 'stock_transfer',
    referenceId: transferId,
    title,
    message,
    createdBy: rejectedBy,
    // ⚠️ لا نرسل branchId - الإشعار شخصي للمستخدم
    assignedToUser: createdBy,
    priority: 'high' as NotificationPriority,
    eventKey: `transfer_approval:${transferId}:rejected`,
    severity: 'error',
    category: 'inventory'
  })
}

/**
 * إشعار تعديل طلب النقل (بعد الرفض)
 * يُرسل إلى: Owner, Admin, General Manager للاعتماد مرة أخرى
 */
export async function notifyTransferModified(params: {
  companyId: string
  transferId: string
  transferNumber: string
  sourceBranchId?: string
  modifiedBy: string
  modifiedByName?: string
  appLang?: 'ar' | 'en'
}) {
  const { companyId, transferId, transferNumber, sourceBranchId, modifiedBy, modifiedByName, appLang = 'ar' } = params

  const title = appLang === 'en'
    ? 'Transfer Request Modified'
    : 'تم تعديل طلب النقل'

  const message = appLang === 'en'
    ? `Transfer request ${transferNumber} has been modified and requires approval${modifiedByName ? ` (by ${modifiedByName})` : ''}`
    : `تم تعديل طلب النقل ${transferNumber} ويحتاج إلى اعتماد${modifiedByName ? ` (بواسطة ${modifiedByName})` : ''}`

  // إشعار للإدارة (Owner/Admin/GM)
  await createNotification({
    companyId,
    referenceType: 'stock_transfer',
    referenceId: transferId,
    title,
    message,
    createdBy: modifiedBy,
    branchId: sourceBranchId,
    priority: 'high' as NotificationPriority,
    eventKey: `transfer_approval:${transferId}:modified:${Date.now()}`,
    severity: 'warning',
    category: 'approvals'
  })
}

/**
 * إشعار بدء نقل المخزون (in_transit)
 * يُرسل إلى: المنشئ الأصلي للطلب
 */
export async function notifyTransferStarted(params: {
  companyId: string
  transferId: string
  transferNumber: string
  createdBy: string // المنشئ الأصلي
  startedBy: string
  startedByName?: string
  appLang?: 'ar' | 'en'
}) {
  const { companyId, transferId, transferNumber, createdBy, startedBy, startedByName, appLang = 'ar' } = params

  // لا نرسل إشعار للمستخدم نفسه
  if (createdBy === startedBy) return

  const title = appLang === 'en'
    ? 'Transfer Started'
    : 'تم بدء النقل'

  const message = appLang === 'en'
    ? `Transfer ${transferNumber} has been started${startedByName ? ` by ${startedByName}` : ''}`
    : `تم بدء نقل الطلب ${transferNumber}${startedByName ? ` بواسطة ${startedByName}` : ''}`

  await createNotification({
    companyId,
    referenceType: 'stock_transfer',
    referenceId: transferId,
    title,
    message,
    createdBy: startedBy,
    assignedToUser: createdBy,
    priority: 'normal' as NotificationPriority,
    eventKey: `transfer:${transferId}:started`,
    severity: 'info',
    category: 'inventory'
  })
}

/**
 * إشعار استلام نقل المخزون
 * يُرسل إلى: المنشئ الأصلي للطلب
 */
export async function notifyTransferReceived(params: {
  companyId: string
  transferId: string
  transferNumber: string
  createdBy: string // المنشئ الأصلي
  receivedBy: string
  receivedByName?: string
  appLang?: 'ar' | 'en'
}) {
  const { companyId, transferId, transferNumber, createdBy, receivedBy, receivedByName, appLang = 'ar' } = params

  // لا نرسل إشعار للمستخدم نفسه
  if (createdBy === receivedBy) return

  const title = appLang === 'en'
    ? 'Transfer Received'
    : 'تم استلام النقل'

  const message = appLang === 'en'
    ? `Transfer ${transferNumber} has been received successfully${receivedByName ? ` by ${receivedByName}` : ''}`
    : `تم استلام طلب النقل ${transferNumber} بنجاح${receivedByName ? ` بواسطة ${receivedByName}` : ''}`

  await createNotification({
    companyId,
    referenceType: 'stock_transfer',
    referenceId: transferId,
    title,
    message,
    createdBy: receivedBy,
    assignedToUser: createdBy,
    priority: 'normal' as NotificationPriority,
    eventKey: `transfer:${transferId}:received`,
    severity: 'info',
    category: 'inventory'
  })
}

// =====================================================
// 🔔 Bank Voucher Requests Notifications
// =====================================================

export async function notifyBankVoucherRequestCreated(params: {
  companyId: string
  requestId: string
  voucherType: 'deposit' | 'withdraw'
  amount: number
  currency: string
  branchId?: string
  costCenterId?: string
  createdBy: string
  appLang?: 'ar' | 'en'
}) {
  const { companyId, requestId, voucherType, amount, currency, branchId, costCenterId, createdBy, appLang = 'ar' } = params

  const typeNamesAr: Record<string, string> = { deposit: 'إيداع', withdraw: 'سحب' }
  const typeNamesEn: Record<string, string> = { deposit: 'Deposit', withdraw: 'Withdrawal' }

  const title = appLang === 'en'
    ? `New ${typeNamesEn[voucherType]} Request`
    : `طلب ${typeNamesAr[voucherType]} جديد`

  const message = appLang === 'en'
    ? `A new ${typeNamesEn[voucherType]} request for ${amount} ${currency} requires your approval.`
    : `طلب ${typeNamesAr[voucherType]} جديد بقيمة ${amount} ${currency} يحتاج لاعتمادك.`

  const eventKey = `bank_voucher:${requestId}:created`

  // Send to Manager
  await createNotification({
    companyId,
    referenceType: 'bank_voucher',
    referenceId: requestId,
    title,
    message,
    createdBy,
    branchId,
    costCenterId,
    assignedToRole: 'manager',
    priority: 'high',
    eventKey: `${eventKey}:manager`,
    severity: 'warning',
    category: 'approvals'
  })

  // Send to Owner
  await createNotification({
    companyId,
    referenceType: 'bank_voucher',
    referenceId: requestId,
    title,
    message,
    createdBy,
    branchId,
    costCenterId,
    assignedToRole: 'owner',
    priority: 'high',
    eventKey: `${eventKey}:owner`,
    severity: 'warning',
    category: 'approvals'
  })
}

export async function notifyBankVoucherApproved(params: {
  companyId: string
  requestId: string
  voucherType: 'deposit' | 'withdraw'
  amount: number
  currency: string
  branchId?: string
  costCenterId?: string
  createdBy: string // requested by
  approvedBy: string
  appLang?: 'ar' | 'en'
}) {
  const { companyId, requestId, voucherType, amount, currency, branchId, costCenterId, createdBy, approvedBy, appLang = 'ar' } = params

  const typeNamesAr: Record<string, string> = { deposit: 'إيداع', withdraw: 'سحب' }
  const typeNamesEn: Record<string, string> = { deposit: 'Deposit', withdraw: 'Withdrawal' }

  const title = appLang === 'en'
    ? `${typeNamesEn[voucherType]} Request Approved`
    : `تم اعتماد طلب الـ ${typeNamesAr[voucherType]}`

  const message = appLang === 'en'
    ? `Your ${typeNamesEn[voucherType]} request for ${amount} ${currency} has been approved.`
    : `تمت الموافقة على طلب الـ ${typeNamesAr[voucherType]} الخاص بك بقيمة ${amount} ${currency}.`

  await createNotification({
    companyId,
    referenceType: 'bank_voucher',
    referenceId: requestId,
    title,
    message,
    createdBy: approvedBy,
    assignedToUser: createdBy,
    branchId,
    costCenterId,
    priority: 'normal',
    eventKey: `bank_voucher:${requestId}:approved`,
    severity: 'info',
    category: 'approvals'
  })
}

export async function notifyBankVoucherRejected(params: {
  companyId: string
  requestId: string
  voucherType: 'deposit' | 'withdraw'
  amount: number
  currency: string
  branchId?: string
  costCenterId?: string
  createdBy: string // requested by
  rejectedBy: string
  reason: string
  appLang?: 'ar' | 'en'
}) {
  const { companyId, requestId, voucherType, amount, currency, branchId, costCenterId, createdBy, rejectedBy, reason, appLang = 'ar' } = params

  const typeNamesAr: Record<string, string> = { deposit: 'إيداع', withdraw: 'سحب' }
  const typeNamesEn: Record<string, string> = { deposit: 'Deposit', withdraw: 'Withdrawal' }

  const title = appLang === 'en'
    ? `${typeNamesEn[voucherType]} Request Rejected`
    : `تم رفض طلب الـ ${typeNamesAr[voucherType]}`

  const message = appLang === 'en'
    ? `Your ${typeNamesEn[voucherType]} request for ${amount} ${currency} was rejected. Reason: ${reason}`
    : `تم رفض طلب الـ ${typeNamesAr[voucherType]} الخاص بك بقيمة ${amount} ${currency}. السبب: ${reason}`

  await createNotification({
    companyId,
    referenceType: 'bank_voucher',
    referenceId: requestId,
    title,
    message,
    createdBy: rejectedBy,
    assignedToUser: createdBy,
    branchId,
    costCenterId,
    priority: 'high',
    eventKey: `bank_voucher:${requestId}:rejected`,
    severity: 'error',
    category: 'approvals'
  })
}

// =====================================================
// 🔔 Purchase Order Approval Notifications
// =====================================================

export async function notifyPOApprovalRequest(params: {
  companyId: string
  poId: string
  poNumber: string
  supplierName: string
  amount: number
  currency: string
  branchId?: string
  costCenterId?: string
  createdBy: string
  appLang?: 'ar' | 'en'
}) {
  const { companyId, poId, poNumber, supplierName, amount, currency, branchId, costCenterId, createdBy, appLang = 'ar' } = params

  const title = appLang === 'en'
    ? 'Purchase Order Approval Required'
    : 'طلب موافقة على أمر شراء'

  const message = appLang === 'en'
    ? `Purchase Order ${poNumber} for ${supplierName} (${amount} ${currency}) requires your approval`
    : `أمر شراء ${poNumber} للمورد ${supplierName} بقيمة ${amount} ${currency} يحتاج إلى موافقتك`

  await createNotification({
    companyId,
    referenceType: 'purchase_order',
    referenceId: poId,
    title,
    message,
    createdBy,
    branchId,
    costCenterId,
    assignedToRole: 'admin',
    priority: 'high',
    eventKey: `purchase_order:${poId}:approval_request`,
    severity: 'warning',
    category: 'approvals'
  })
}

export async function notifyPOApproved(params: {
  companyId: string
  poId: string
  poNumber: string
  supplierName: string
  amount: number
  currency: string
  branchId?: string
  costCenterId?: string
  createdBy: string // requested by
  approvedBy: string
  appLang?: 'ar' | 'en'
}) {
  const { companyId, poId, poNumber, supplierName, amount, currency, branchId, costCenterId, createdBy, approvedBy, appLang = 'ar' } = params

  const title = appLang === 'en'
    ? `Purchase Order Approved`
    : `تم اعتماد أمر الشراء`

  const message = appLang === 'en'
    ? `Your Purchase Order ${poNumber} for ${supplierName} (${amount} ${currency}) has been approved.`
    : `تمت الموافقة على أمر الشراء ${poNumber} للمورد ${supplierName} بقيمة ${amount} ${currency}.`

  await createNotification({
    companyId,
    referenceType: 'purchase_order',
    referenceId: poId,
    title,
    message,
    createdBy: approvedBy,
    assignedToUser: createdBy,
    branchId,
    costCenterId,
    priority: 'normal',
    eventKey: `purchase_order:${poId}:approved`,
    severity: 'info',
    category: 'approvals'
  })
}

export async function notifyPORejected(params: {
  companyId: string
  poId: string
  poNumber: string
  supplierName: string
  amount: number
  currency: string
  branchId?: string
  costCenterId?: string
  createdBy: string // requested by
  rejectedBy: string
  reason: string
  appLang?: 'ar' | 'en'
}) {
  const { companyId, poId, poNumber, supplierName, amount, currency, branchId, costCenterId, createdBy, rejectedBy, reason, appLang = 'ar' } = params

  const title = appLang === 'en'
    ? `Purchase Order Rejected`
    : `تم رفض أمر الشراء`

  const message = appLang === 'en'
    ? `Your Purchase Order ${poNumber} for ${supplierName} (${amount} ${currency}) was rejected. Reason: ${reason}`
    : `تم رفض أمر الشراء ${poNumber} للمورد ${supplierName} بقيمة ${amount} ${currency}. السبب: ${reason}`

  await createNotification({
    companyId,
    referenceType: 'purchase_order',
    referenceId: poId,
    title,
    message,
    createdBy: rejectedBy,
    assignedToUser: createdBy,
    branchId,
    costCenterId,
    priority: 'high',
    eventKey: `purchase_order:${poId}:rejected`,
    severity: 'error',
    category: 'approvals'
  })
}

// ===========================================================
// 📦 Enterprise Purchase Return Workflow Notifications
// ===========================================================

/**
 * Notify approvers when a Purchase Return is submitted for approval
 */
export async function notifyPRApprovalRequest(params: {
  companyId: string
  prId: string
  prNumber: string
  supplierName: string
  amount: number
  currency: string
  createdBy: string
  branchId?: string
  costCenterId?: string
  appLang?: 'ar' | 'en'
}) {
  const { companyId, prId, prNumber, supplierName, amount, currency, createdBy, branchId, costCenterId, appLang = 'ar' } = params

  const title = appLang === 'en'
    ? 'Purchase Return Pending Approval'
    : 'مرتجع مشتريات بانتظار الموافقة'

  const message = appLang === 'en'
    ? `Purchase return ${prNumber} from supplier ${supplierName} for ${amount} ${currency} requires your approval`
    : `مرتجع مشتريات ${prNumber} من المورد ${supplierName} بقيمة ${amount} ${currency} يحتاج اعتمادك`

  const roles = ['admin', 'owner', 'general_manager']
  for (const role of roles) {
    await createNotification({
      companyId,
      referenceType: 'purchase_return',
      referenceId: prId,
      title,
      message,
      createdBy,
      branchId,
      costCenterId,
      assignedToRole: role,
      priority: 'high' as NotificationPriority,
      eventKey: `purchase_return:${prId}:pending:${role}`,
      severity: 'warning',
      category: 'approvals'
    })
  }
}

/**
 * Notify creator when a Purchase Return is approved
 */
export async function notifyPRApproved(params: {
  companyId: string
  prId: string
  prNumber: string
  supplierName: string
  amount: number
  currency: string
  createdBy: string
  approvedBy: string
  branchId?: string
  costCenterId?: string
  appLang?: 'ar' | 'en'
}) {
  const { companyId, prId, prNumber, supplierName, amount, currency, createdBy, approvedBy, branchId, costCenterId, appLang = 'ar' } = params

  const title = appLang === 'en'
    ? '✅ Purchase Return Approved'
    : '✅ تم اعتماد مرتجع المشتريات'

  const message = appLang === 'en'
    ? `Purchase return ${prNumber} from supplier ${supplierName} for ${amount} ${currency} has been approved`
    : `تم اعتماد مرتجع المشتريات ${prNumber} من المورد ${supplierName} بقيمة ${amount} ${currency}`

  await createNotification({
    companyId,
    referenceType: 'purchase_return',
    referenceId: prId,
    title,
    message,
    createdBy: approvedBy,
    assignedToUser: createdBy,
    branchId,
    costCenterId,
    priority: 'normal' as NotificationPriority,
    eventKey: `purchase_return:${prId}:approved`,
    severity: 'success' as any,
    category: 'approvals'
  })
}

/**
 * Notify creator when a Purchase Return is rejected
 */
export async function notifyPRRejected(params: {
  companyId: string
  prId: string
  prNumber: string
  supplierName: string
  amount: number
  currency: string
  reason: string
  createdBy: string
  rejectedBy: string
  branchId?: string
  costCenterId?: string
  appLang?: 'ar' | 'en'
}) {
  const { companyId, prId, prNumber, supplierName, amount, currency, reason, createdBy, rejectedBy, branchId, costCenterId, appLang = 'ar' } = params

  const title = appLang === 'en'
    ? '❌ Purchase Return Rejected'
    : '❌ تم رفض مرتجع المشتريات'

  const message = appLang === 'en'
    ? `Purchase return ${prNumber} from supplier ${supplierName} for ${amount} ${currency} was rejected. Reason: ${reason}`
    : `تم رفض مرتجع المشتريات ${prNumber} من المورد ${supplierName} بقيمة ${amount} ${currency}. السبب: ${reason}`

  await createNotification({
    companyId,
    referenceType: 'purchase_return',
    referenceId: prId,
    title,
    message,
    createdBy: rejectedBy,
    assignedToUser: createdBy,
    branchId,
    costCenterId,
    priority: 'high' as NotificationPriority,
    eventKey: `purchase_return:${prId}:rejected`,
    severity: 'error',
    category: 'approvals'
  })
}
