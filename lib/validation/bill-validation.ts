/**
 * Bill Validation Library
 * ========================
 * Centralized validation logic for bills to prevent data integrity issues
 */

export interface BillItem {
  product_id: string
  quantity: number
  unit_price: number
  tax_rate?: number
}

export interface BillValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Validate bill before creation/update
 */
export function validateBill(
  supplierId: string | null,
  items: BillItem[],
  status: string = 'draft'
): BillValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // 1. Supplier is required
  if (!supplierId) {
    errors.push('يجب اختيار مورد')
  }

  // 2. Items are required (CRITICAL - prevents our issue)
  if (!items || items.length === 0) {
    errors.push('يجب إضافة عناصر للفاتورة - لا يمكن إنشاء فاتورة بدون أصناف')
  }

  // 3. Validate each item
  items.forEach((item, index) => {
    if (!item.product_id) {
      errors.push(`الصنف ${index + 1}: يجب اختيار منتج`)
    }
    
    if (!item.quantity || item.quantity <= 0) {
      errors.push(`الصنف ${index + 1}: الكمية يجب أن تكون أكبر من صفر`)
    }
    
    if (!item.unit_price || item.unit_price < 0) {
      errors.push(`الصنف ${index + 1}: السعر يجب أن يكون صفر أو أكبر`)
    }
  })

  // 4. Status-specific validations
  if (status === 'received' || status === 'paid') {
    if (items.length === 0) {
      errors.push('لا يمكن تحويل الفاتورة إلى حالة "مستلمة" أو "مدفوعة" بدون أصناف')
    }
  }

  // 5. Warnings for best practices
  if (items.length > 100) {
    warnings.push('عدد الأصناف كبير جداً (أكثر من 100) - قد يؤثر على الأداء')
  }

  const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0)
  if (totalAmount > 1000000) {
    warnings.push('قيمة الفاتورة كبيرة جداً (أكثر من مليون) - يرجى المراجعة')
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  }
}

/**
 * Validate bill status transition
 */
export function validateBillStatusChange(
  currentStatus: string,
  newStatus: string,
  hasItems: boolean
): BillValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Cannot change to received/paid without items
  if ((newStatus === 'received' || newStatus === 'paid') && !hasItems) {
    errors.push('لا يمكن تحويل الفاتورة إلى حالة "مستلمة" أو "مدفوعة" بدون أصناف')
  }

  // Cannot go back from paid to draft
  if (currentStatus === 'paid' && newStatus === 'draft') {
    errors.push('لا يمكن إرجاع فاتورة مدفوعة إلى مسودة')
  }

  // Warning for status changes
  if (currentStatus === 'received' && newStatus === 'draft') {
    warnings.push('تحويل فاتورة مستلمة إلى مسودة سيحذف حركات المخزون')
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  }
}

/**
 * Check if bill can be deleted
 */
export function canDeleteBill(
  status: string,
  hasPayments: boolean,
  hasInventoryTransactions: boolean
): BillValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (status === 'paid') {
    errors.push('لا يمكن حذف فاتورة مدفوعة')
  }

  if (hasPayments) {
    errors.push('لا يمكن حذف فاتورة لها دفعات مسجلة')
  }

  if (hasInventoryTransactions) {
    warnings.push('حذف الفاتورة سيحذف حركات المخزون المرتبطة بها')
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  }
}

/**
 * Validate bill item
 */
export function validateBillItem(item: Partial<BillItem>): BillValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!item.product_id) {
    errors.push('يجب اختيار منتج')
  }

  if (!item.quantity || item.quantity <= 0) {
    errors.push('الكمية يجب أن تكون أكبر من صفر')
  }

  if (item.quantity && item.quantity > 10000) {
    warnings.push('الكمية كبيرة جداً - يرجى التحقق')
  }

  if (item.unit_price === undefined || item.unit_price === null || item.unit_price < 0) {
    errors.push('السعر يجب أن يكون صفر أو أكبر')
  }

  if (item.unit_price && item.unit_price > 1000000) {
    warnings.push('السعر مرتفع جداً - يرجى التحقق')
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  }
}

