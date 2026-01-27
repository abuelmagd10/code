/**
 * 🔗 Notification Routing - Deep Linking للإشعارات
 * 
 * يحول reference_type و reference_id إلى مسار الصفحة الصحيحة
 */

import { useRouter } from "next/navigation"

export type ReferenceType = 
  | 'write_off'
  | 'invoice'
  | 'bill'
  | 'purchase_order'
  | 'sales_order'
  | 'inventory_transfer'
  | 'approval_request'
  | 'refund_request'
  | 'depreciation'
  | 'journal_entry'
  | 'payment'
  | 'customer_debit_note'
  | 'vendor_credit'
  | 'customer_credit_refund'
  | 'supplier_debit_receipt'
  | 'customer_voucher'

/**
 * خريطة reference_type إلى route
 */
const REFERENCE_TYPE_TO_ROUTE: Record<string, (id: string, eventKey?: string, category?: string) => string> = {
  // المخزون
  'write_off': (id) => `/inventory/write-offs?highlight=${id}`,
  'inventory_write_off': (id) => `/inventory/write-offs?highlight=${id}`,
  'inventory_transfer': (id) => `/inventory-transfers/${id}`,
  
  // المبيعات
  'invoice': (id) => `/invoices/${id}`,
  'sales_order': (id) => `/sales-orders/${id}`,
  'customer_debit_note': (id) => `/customer-debit-notes?highlight=${id}`,
  'customer_credit_refund': (id) => `/customers?highlight=refund-${id}`,
  'customer_voucher': (id) => `/payments?highlight=${id}`,
  
  // المشتريات
  'bill': (id, eventKey, category) => {
    // ✅ إذا كان الإشعار خاص باعتماد الاستلام (approved_waiting_receipt)، نوجه إلى صفحة اعتماد الاستلام مع معرف الفاتورة
    if (eventKey && eventKey.includes('approved_waiting_receipt')) {
      return `/inventory/goods-receipt?billId=${id}`
    }
    // وإلا نوجه إلى صفحة الفاتورة العادية
    return `/bills/${id}`
  },
  'purchase_order': (id) => `/purchase-orders/${id}`,
  'vendor_credit': (id) => `/vendor-credits?highlight=${id}`,
  'supplier_debit_receipt': (id) => `/suppliers?highlight=receipt-${id}`,
  
  // المالية
  'payment': (id) => `/payments?highlight=${id}`,
  'journal_entry': (id) => `/journal-entries/${id}`,
  'depreciation': (id) => `/fixed-assets?highlight=depreciation-${id}`,
  
  // الموافقات
  'approval_request': (id) => `/approvals?highlight=${id}`,
  'refund_request': (id) => `/payments?highlight=refund-${id}`,
  
  // الحوكمة والإعدادات
  'user_branch_change': (id) => `/settings/users?highlight=${id}`,
  'user_warehouse_change': (id) => `/settings/users?highlight=${id}`,
  'user_role_change': (id) => `/settings/users?highlight=${id}`,
  'permission_change': (id) => `/settings/users?highlight=${id}`,
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
