/**
 * Write-off Governance and Validation
 * =====================================================
 * 
 * وظائف التحقق من إهلاك المخزون والحوكمة
 */

export interface WriteOffItemValidation {
  product_id: string
  product_name?: string
  product_sku?: string
  quantity: number
  warehouse_id?: string | null
  branch_id?: string | null
  cost_center_id?: string | null
}

export interface WriteOffValidationResult {
  isValid: boolean
  errors?: string[]
  warnings?: string[]
}

/**
 * التحقق من عناصر الإهلاك
 * @param items - عناصر الإهلاك للتحقق منها
 * @returns نتيجة التحقق
 */
export function validateWriteOffItems(
  items: WriteOffItemValidation[]
): WriteOffValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // التحقق من وجود عناصر
  if (!items || items.length === 0) {
    errors.push('يجب إضافة منتجات للإهلاك')
    return { isValid: false, errors, warnings }
  }

  // التحقق من كل عنصر
  items.forEach((item, index) => {
    if (!item.product_id) {
      errors.push(`العنصر ${index + 1}: يجب اختيار منتج`)
    }

    if (!item.quantity || item.quantity <= 0) {
      errors.push(`العنصر ${index + 1}: الكمية يجب أن تكون أكبر من صفر`)
    }

    // التحقق من الحوكمة (اختياري - يمكن أن يكون null)
    // لكن إذا كان موجوداً، يجب أن يكون صحيحاً
  })

  // تحذيرات
  if (items.length > 100) {
    warnings.push('عدد العناصر كبير جداً (أكثر من 100) - قد يؤثر على الأداء')
  }

  return {
    isValid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
    warnings: warnings.length > 0 ? warnings : undefined
  }
}
