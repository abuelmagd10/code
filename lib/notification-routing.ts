/**
 * 🔗 Notification Routing - Deep Linking للإشعارات
 * 
 * يحول reference_type و reference_id إلى مسار الصفحة الصحيحة
 */

export type ReferenceType =
  | 'write_off'
  | 'invoice'
  | 'bill'
  | 'purchase_order'
  | 'purchase_return'
  | 'sales_order'
  | 'inventory_transfer'
  | 'approval_request'
  | 'refund_request'
  | 'customer_refund_request'
  | 'vendor_refund_request'
  | 'vendor_payment_correction_request'
  | 'depreciation'
  | 'journal_entry'
  | 'payment'
  | 'customer_debit_note'
  | 'vendor_credit'
  | 'customer_credit_refund'
  | 'supplier_debit_receipt'
  | 'customer_voucher'
  | 'expense'
  | 'bank_voucher'
  | 'sales_return_request'
  | 'sales_return'
  | 'manufacturing_material_issue_approval'
  | 'manufacturing_product_receive_approval'
  | 'manufacturing_production_order'
  | 'booking'
  | 'subscription'

/**
 * خريطة reference_type إلى route
 */
const REFERENCE_TYPE_TO_ROUTE: Record<string, (id: string, eventKey?: string, category?: string) => string> = {
  // ───────────────────────────────────────
  // الفوترة والاشتراكات (Phase J)
  // ───────────────────────────────────────
  // يفتح صفحة إدارة الاشتراك مع تبويب مناسب حسب نوع الحدث
  'subscription': (_id, eventKey) => {
    // event_key أمثلة:
    //   subscription:reminder:{cid}:{date}     → /settings/billing
    //   subscription:past_due:{cid}:{date}     → /settings/billing
    //   subscription:suspended:{cid}:{date}    → /settings/billing
    //   subscription:reactivated:{cid}:{date}  → /settings/billing
    //   subscription:payment:{cid}:{ts}        → /settings/billing (tab: invoices)
    if (eventKey?.includes(':payment:') || eventKey?.includes(':reactivated:')) {
      return '/settings/billing?tab=invoices'
    }
    return '/settings/billing'
  },

  // المخزون
  'write_off': (id) => `/inventory/write-offs?highlight=${id}`,
  'inventory_write_off': (id) => `/inventory/write-offs?highlight=${id}`,
  'inventory_transfer': (id) => `/inventory-transfers/${id}`,
  'stock_transfer': (id) => `/inventory-transfers/${id}`, // ✅ إضافة alias

  // المبيعات
  'invoice': (id, eventKey) => {
    // v3.74.484 — dispatch pending notifications now route to the
    // unified approvals inbox (tab=dispatch). The dedicated
    // /inventory/dispatch-approvals page stays reachable via URL for
    // the advanced approve-with-shipping flow.
    if (eventKey && (
      eventKey.includes(':sent:') ||
      eventKey.includes('warehouse_dispatch_pending') ||
      eventKey.includes('dispatch_pending')
    )) {
      return `/approvals?tab=disp&highlight=${id}`
    }
    return `/invoices/${id}`
  },
  'sales_order': (id) => `/sales-orders/${id}`,
  // v3.74.493 — sales return request notifications now route to the
  // unified approvals inbox (tab=sret). The dedicated
  // /sales-return-requests page is reachable via URL as a fallback.
  'sales_return_request': (id) => `/approvals?tab=sret&highlight=${id}`,
  'sales_return': (id) => `/sales-returns/${id}`,                           // ✅ مرتجع مبيعات مؤكد
  'customer_debit_note': (id) => `/customer-debit-notes?highlight=${id}`,
  'customer_credit_refund': (id) => `/customers?highlight=refund-${id}`,
  'customer_voucher': (id) => `/payments?highlight=${id}`,

  // المشتريات
  'bill': (id, eventKey, _category) => {
    // v3.74.484 — goods receipt pending notifications now route to
    // the unified approvals inbox (tab=recv). Warehouse manager sees
    // the receipt card with items panel (v3.74.483) and confirms
    // without leaving the inbox. The dedicated
    // /inventory/goods-receipt page stays reachable via URL.
    if (eventKey && (eventKey.includes('approved_waiting_receipt') || eventKey.includes('sent_pending_receipt') || eventKey.includes('warehouse_receipt_pending'))) {
      return `/approvals?tab=recv&highlight=${id}`
    }
    return `/bills/${id}`
  },
  'purchase_order': (id) => `/purchase-orders/${id}`,
  'purchase_approval': (id) => `/bills/${id}`, // ✅ إضافة route لموافقات المشتريات
  'purchase_return': (id) => `/purchase-returns/${id}`, // ✅ صفحة تفاصيل المرتجع
  'vendor_credit': (id) => `/vendor-credits?highlight=${id}`,
  'supplier_debit_receipt': (id) => `/suppliers?highlight=receipt-${id}`,
  'vendor_refund_request': (id) => `/suppliers?tab=refunds&highlight=${id}`, // ✅ طلب استرداد سلفة مورد
  // v3.74.106 - notifications for the payment-correction workflow + the regular
  // customer refund workflow both use reference_type='customer_refund_request'.
  // The destination is the central approvals page.
  // v3.74.115 - choose the status filter that matches the recipient's job. If
  // the approver opens a pending-approval ping, the page lands on Pending; if
  // the requester opens an approved-for-execution ping, the page lands on
  // Approved so they immediately see the row they need to execute; executed
  // confirmations land on Executed.
  'customer_refund_request': (id, eventKey) => {
    const ek = eventKey || ''
    let status: 'pending' | 'approved' | 'executed' | 'cancelled' | null = null
    if (/:approved(_|$)/.test(ek)) status = 'approved'
    else if (/:executed(:|$)/.test(ek)) status = 'executed'
    else if (/:rejected(:|$)/.test(ek)) status = 'cancelled'
    else if (/:requested(:|$)/.test(ek)) status = 'pending'
    const qs = status ? `status=${status}&` : ''
    return `/customer-refund-requests?${qs}highlight=${id}`
  },
  // v3.74.127 — vendor payment correction workflow mirrors customer side.
  'vendor_payment_correction_request': (id, eventKey) => {
    const ek = eventKey || ''
    let status: 'pending' | 'approved' | 'executed' | 'cancelled' | null = null
    if (/:approved(_|$)/.test(ek)) status = 'approved'
    else if (/:executed(:|$)/.test(ek)) status = 'executed'
    else if (/:rejected(:|$)/.test(ek)) status = 'cancelled'
    else if (/:requested(:|$)/.test(ek)) status = 'pending'
    const qs = status ? `status=${status}&` : ''
    return `/vendor-payment-correction-requests?${qs}highlight=${id}`
  },

  // المالية
  'payment': (id) => `/payments?highlight=${id}`,
  'payment_approval': (id) => `/payments?highlight=${id}`,       // ✅ اعتماد دفعة المورد
  'payment_pending_approval': (id) => `/payments?highlight=${id}`, // ✅ alias
  'payment_approved': (id) => `/payments?highlight=${id}`,       // ✅ تمت الموافقة
  'payment_rejected': (id) => `/payments?highlight=${id}`,       // ✅ تم الرفض
  'journal_entry': (id) => `/journal-entries/${id}`,
  'depreciation': (id) => `/fixed-assets?highlight=depreciation-${id}`,
  'expense': (id) => `/expenses/${id}`,
  'bank_voucher': (id) => `/banking?request=${id}`,

  // الموافقات
  'approval_request': (id) => `/approvals?highlight=${id}`,
  'refund_request': (id) => `/payments?highlight=refund-${id}`,

  // الحوكمة والإعدادات
  'user_branch_change': (id) => `/settings/users?highlight=${id}`,
  'user_warehouse_change': (id) => `/settings/users?highlight=${id}`,
  'user_role_change': (id) => `/settings/users?highlight=${id}`,
  'permission_change': (id) => `/settings/users?highlight=${id}`,
  // v3.74.66 — routes the approver to the users settings page;
  // the row is highlighted in the Permission transfers section.
  'permission_transfer': (id) => `/settings/users?highlight=transfer-${id}`,

  // الحجوزات
  'booking': (id) => `/bookings/${id}`,

  // التصنيع
  // v3.74.493 — material issue notifications (Stage 1 or Stage 2) all
  // land on the unified inbox mi tab. The card is stage-aware
  // (v3.74.491) so it renders "Management Approve" or "Approve
  // Warehouse Dispatch" based on the row's status.
  'manufacturing_material_issue_approval': (id, eventKey) => {
    const approvalId = getMaterialIssueApprovalIdFromEventKey(eventKey) || id
    return `/approvals?tab=mi&highlight=${approvalId}`
  },
  // v3.74.493 — product receive pending has its own tab now (pr).
  'manufacturing_product_receive_approval': (id) => {
    return `/approvals?tab=pr&highlight=${id}`
  },
  'manufacturing_production_order': (id) => `/manufacturing/production-orders/${id}`,
}

function getMaterialIssueApprovalIdFromEventKey(eventKey?: string) {
  if (!eventKey) return null

  const uuid = "([0-9a-fA-F-]{36})"
  const patterns = [
    new RegExp(`^mmia_request_(?:sm|wm|owner)_${uuid}$`),
    new RegExp(`^mmia_shortage_${uuid}_`),
    new RegExp(`^mmia_(?:approved|partially_approved|rejected)_${uuid}_`),
    new RegExp(`^mmia_partial_${uuid}_`),
  ]

  for (const pattern of patterns) {
    const match = eventKey.match(pattern)
    if (match?.[1]) return match[1]
  }

  return null
}

/**
 * الحصول على route للإشعار
 */
export function getNotificationRoute(
  referenceType: string,
  referenceId: string,
  eventKey?: string,
  category?: string
): string | null {
  const routeBuilder = REFERENCE_TYPE_TO_ROUTE[referenceType]
  if (!routeBuilder) {
    console.warn(`⚠️ [NotificationRouting] Unknown reference_type: ${referenceType}`)
    return null
  }
  return routeBuilder(referenceId, eventKey, category)
}

/**
 * Hook للتنقل إلى صفحة الإشعار
 * 
 * @deprecated Use getNotificationRoute directly with router.push
 */
export function useNotificationNavigation() {
  const navigateToNotification = (notification: { reference_type: string; reference_id: string }) => {
    const route = getNotificationRoute(notification.reference_type, notification.reference_id)
    if (!route) {
      console.warn(`⚠️ [NotificationNavigation] Cannot navigate to notification: ${notification.reference_type}`)
    }
    return route
  }

  return { navigateToNotification }
}
