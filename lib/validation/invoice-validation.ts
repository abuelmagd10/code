/**
 * Invoice Validation Library
 * ===========================
 * Centralized validation logic for invoices to prevent data integrity issues
 */

export interface InvoiceLine {
  product_id: string
  quantity: number
  unit_price: number
  tax_rate?: number
}

export interface InvoiceValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Validate invoice before creation/update
 */
export function validateInvoice(
  customerId: string | null,
  lines: InvoiceLine[],
  status: string = 'draft',
  salesOrderId?: string | null
): InvoiceValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // 1. Customer is required
  if (!customerId) {
    errors.push('يجب اختيار عميل')
  }

  // 2. Sales order is required (business rule)
  if (!salesOrderId) {
    errors.push('يجب اختيار أمر بيع - لا يمكن إنشاء فاتورة بدون أمر بيع')
  }

  // 3. Lines are required (CRITICAL - prevents our issue)
  if (!lines || lines.length === 0) {
    errors.push('يجب إضافة أصناف للفاتورة - لا يمكن إنشاء فاتورة بدون أصناف')
  }

  // 4. Validate each line
  lines.forEach((line, index) => {
    if (!line.product_id) {
      errors.push(`الصنف ${index + 1}: يجب اختيار منتج`)
    }
    
    if (!line.quantity || line.quantity <= 0) {
      errors.push(`الصنف ${index + 1}: الكمية يجب أن تكون أكبر من صفر`)
    }
    
    if (!line.unit_price || line.unit_price < 0) {
      errors.push(`الصنف ${index + 1}: السعر يجب أن يكون صفر أو أكبر`)
    }
  })

  // 5. Status-specific validations
  if (status === 'sent' || status === 'paid') {
    if (lines.length === 0) {
      errors.push('لا يمكن تحويل الفاتورة إلى حالة "مرسلة" أو "مدفوعة" بدون أصناف')
    }
  }

  // 6. Warnings for best practices
  if (lines.length > 100) {
    warnings.push('عدد الأصناف كبير جداً (أكثر من 100) - قد يؤثر على الأداء')
  }

  const totalAmount = lines.reduce((sum, line) => sum + (line.quantity * line.unit_price), 0)
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
 * Validate invoice status transition
 */
export function validateInvoiceStatusChange(
  currentStatus: string,
  newStatus: string,
  hasLines: boolean
): InvoiceValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Cannot change to sent/paid without lines
  if ((newStatus === 'sent' || newStatus === 'paid') && !hasLines) {
    errors.push('لا يمكن تحويل الفاتورة إلى حالة "مرسلة" أو "مدفوعة" بدون أصناف')
  }

  // Cannot go back from paid to draft
  if (currentStatus === 'paid' && newStatus === 'draft') {
    errors.push('لا يمكن إرجاع فاتورة مدفوعة إلى مسودة')
  }

  // Warning for status changes
  if (currentStatus === 'sent' && newStatus === 'draft') {
    warnings.push('تحويل فاتورة مرسلة إلى مسودة سيحذف قيود COGS وحركات المخزون')
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  }
}

/**
 * Check if invoice can be deleted
 */
export function canDeleteInvoice(
  status: string,
  hasPayments: boolean,
  hasInventoryTransactions: boolean
): InvoiceValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (status === 'paid') {
    errors.push('لا يمكن حذف فاتورة مدفوعة')
  }

  if (hasPayments) {
    errors.push('لا يمكن حذف فاتورة لها دفعات مسجلة')
  }

  if (hasInventoryTransactions) {
    warnings.push('حذف الفاتورة سيحذف حركات المخزون وقيود COGS المرتبطة بها')
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  }
}

/**
 * Validate invoice line
 */
export function validateInvoiceLine(line: Partial<InvoiceLine>): InvoiceValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!line.product_id) {
    errors.push('يجب اختيار منتج')
  }

  if (!line.quantity || line.quantity <= 0) {
    errors.push('الكمية يجب أن تكون أكبر من صفر')
  }

  if (line.quantity && line.quantity > 10000) {
    warnings.push('الكمية كبيرة جداً - يرجى التحقق')
  }

  if (line.unit_price === undefined || line.unit_price === null || line.unit_price < 0) {
    errors.push('السعر يجب أن يكون صفر أو أكبر')
  }

  if (line.unit_price && line.unit_price > 1000000) {
    warnings.push('السعر مرتفع جداً - يرجى التحقق')
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  }
}

