/**
 * 🗃️ Canonical Database Types
 * ────────────────────────────────────────────────────────────────────────────
 * هذا الملف هو المصدر الوحيد للحقيقة (Single Source of Truth) لأنواع البيانات
 * المشتركة عبر الوحدات المختلفة في التطبيق.
 *
 * القاعدة الإلزامية:
 *   - لا يُعرَّف interface/type خاص بكيان من هذه الكيانات داخل أي صفحة أو component
 *   - أي حقل جديد من Supabase يُضاف هنا أولاً
 *   - الأنواع الخاصة بالصفحة فقط (لا تُشارَك) تبقى داخل الصفحة
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

// ════════════════════════════════════════════════════════
// § 1. SHARED BASE TYPES
// ════════════════════════════════════════════════════════

export interface Supplier {
  id: string
  name: string
  email?: string
  address?: string
  phone?: string | null
}

export interface Product {
  id: string
  name: string
  sku?: string
  cost_price?: number
  item_type?: 'product' | 'service'
  quantity_on_hand?: number
}

export interface Branch {
  id: string
  name: string
  branch_name?: string
  code?: string
  default_cost_center_id?: string
  default_warehouse_id?: string
}

// ════════════════════════════════════════════════════════
// § 2. PURCHASE ORDERS
// ════════════════════════════════════════════════════════

/**
 * الكيان الرئيسي لأوامر الشراء
 * يُستخدم في: purchase-orders/page.tsx, purchase-orders/[id]/page.tsx, api/v2/purchase-orders
 */
export interface PurchaseOrder {
  id: string
  company_id: string
  supplier_id: string
  po_number: string
  po_date: string
  due_date: string | null
  subtotal: number
  tax_amount: number
  total_amount: number
  total?: number
  received_amount?: number
  status: string
  notes?: string | null
  currency?: string
  discount_type?: string
  discount_value?: number
  shipping?: number
  shipping_tax_rate?: number
  adjustment?: number
  bill_id?: string | null
  branch_id?: string
  cost_center_id?: string
  warehouse_id?: string
  created_by_user_id?: string
  rejection_reason?: string
  rejected_by?: string
  approved_by?: string
  created_at?: string
  // Relations (joined from Supabase)
  suppliers?: Supplier
  branches?: Pick<Branch, 'name'>
}

/**
 * بند واحد من أمر الشراء
 */
export interface PurchaseOrderItem {
  id: string
  purchase_order_id: string
  product_id: string
  quantity: number
  unit_price: number
  tax_rate: number
  discount_percent?: number
  line_total: number
  received_quantity: number
  billed_quantity?: number
  approved_billed_quantity?: number
  products?: Pick<Product, 'name' | 'sku'>
}

/**
 * بند محسوب (للعرض فقط — مشتق من PurchaseOrderItem)
 */
export type POItemWithProduct = {
  purchase_order_id: string
  quantity: number
  product_id?: string | null
  product_name?: string | null
}

/**
 * كميات مرتجعة لكل منتج داخل فاتورة
 */
export type ReturnedQuantity = {
  bill_id: string
  product_id: string
  quantity: number
}

/**
 * ملخص منتج للعرض في القائمة
 */
export type ProductSummary = {
  name: string
  quantity: number
  returned?: number
}

// ════════════════════════════════════════════════════════
// § 3. BILLS (LINKED TO PURCHASE ORDERS)
// ════════════════════════════════════════════════════════

/**
 * الفاتورة المرتبطة بأمر الشراء
 * (نسخة خفيفة للعرض في قائمة أوامر الشراء)
 */
export interface LinkedBill {
  id: string
  status: string
  total_amount?: number
  paid_amount?: number
  returned_amount?: number
  return_status?: string
  /** حقول إضافية تظهر في صفحة التفاصيل */
  bill_number?: string
  bill_date?: string
  due_date?: string | null
}

/**
 * دفعة مرتبطة بفاتورة
 */
export interface LinkedPayment {
  id: string
  reference_number: string
  payment_date: string
  amount: number
  payment_method: string
  notes?: string
  bill_id?: string
}

/**
 * مرتجع مرتبط بفاتورة
 */
export interface LinkedReturn {
  id: string
  return_number: string
  return_date: string
  total_amount: number
  status: string
  reason?: string
  bill_id?: string
}

// ════════════════════════════════════════════════════════
// § 3b. BILLS (STANDALONE — MAIN ENTITY)
// ════════════════════════════════════════════════════════

/**
 * الكيان الرئيسي للفاتورة
 * يُستخدم في: bills/page.tsx, api/v2/bills
 */
export interface Bill {
  id: string
  supplier_id: string
  bill_number: string
  bill_date: string
  total_amount: number
  paid_amount?: number
  returned_amount?: number
  return_status?: string
  status: string
  receipt_status?: string | null
  receipt_rejection_reason?: string | null
  currency_code?: string
  original_currency?: string
  original_total?: number
  original_paid?: number
  display_currency?: string
  display_total?: number
  display_paid?: number
  company_id?: string
  branch_id?: string
  cost_center_id?: string
  purchase_order_id?: string | null
  goods_receipt_id?: string | null
  // Relations (joined from Supabase)
  suppliers?: Pick<Supplier, 'name' | 'phone'>
  branches?: Pick<Branch, 'name'>
  goods_receipts?: { id: string; grn_number: string } | null
}

/**
 * بند واحد من فاتورة مع اسم المنتج
 */
export type BillItemWithProduct = {
  bill_id: string
  quantity: number
  product_id?: string | null
  products?: { name: string } | null
  returned_quantity?: number
}

// ════════════════════════════════════════════════════════
// § 4. INVENTORY
// ════════════════════════════════════════════════════════

/**
 * حركة مخزون
 */
export interface InventoryTransaction {
  id: string
  company_id?: string
  product_id: string
  transaction_type: string
  quantity_change: number
  notes?: string | null
  created_at?: string
  reference_id?: string | null
  warehouse_id: string
  branch_id?: string
  cost_center_id?: string
  is_deleted?: boolean | null
  products?: Pick<Product, 'name' | 'sku'>
}

// ════════════════════════════════════════════════════════
// § 5. API V2 RESPONSE SHAPES (STANDARDIZED)
// ════════════════════════════════════════════════════════

/**
 * الشكل الموحد لأي رد من /api/v2/*
 * يضمن consistency عبر كل الوحدات
 */
export interface PaginatedResponse<T> {
  success: boolean
  data: T[]
  meta: {
    totalCount: number
    page: number
    pageSize: number
    totalPages: number
    from: number
    to: number
    role?: string
    isPrivileged?: boolean
  }
  error?: string
  error_ar?: string
}
