import { createClient } from '@/lib/supabase/server'

export interface ValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
}

export async function validateInvoiceData(invoiceData: any): Promise<ValidationResult> {
  const errors: string[] = []
  const warnings: string[] = []

  // التحقق من البيانات الأساسية
  if (!invoiceData.customer_id) {
    errors.push('معرف العميل مطلوب')
  }

  if (!invoiceData.branch_id) {
    errors.push('معرف الفرع مطلوب')
  }

  if (!invoiceData.cost_center_id) {
    errors.push('معرف مركز التكلفة مطلوب')
  }

  if (!invoiceData.warehouse_id) {
    errors.push('معرف المخزن مطلوب')
  }

  // التحقق من الأصناف
  if (!invoiceData.items || invoiceData.items.length === 0) {
    errors.push('يجب إضافة صنف واحد على الأقل')
  }

  // التحقق من الكميات والأسعار
  if (invoiceData.items) {
    invoiceData.items.forEach((item: any, index: number) => {
      if (!item.product_id) {
        errors.push(`الصنف رقم ${index + 1}: معرف المنتج مطلوب`)
      }

      if (!item.quantity || item.quantity <= 0) {
        errors.push(`الصنف رقم ${index + 1}: الكمية يجب أن تكون أكبر من صفر`)
      }

      if (!item.unit_price || item.unit_price < 0) {
        errors.push(`الصنف رقم ${index + 1}: سعر الوحدة يجب أن يكون أكبر من أو يساوي صفر`)
      }
    })
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  }
}

export async function validateInventoryAvailability(
  items: any[],
  warehouseId: string
): Promise<ValidationResult> {
  const supabase = await createClient()
  const errors: string[] = []
  const warnings: string[] = []

  for (const item of items) {
    // التحقق من نوع المنتج
    const { data: product } = await supabase
      .from('products')
      .select('type, name')
      .eq('id', item.product_id)
      .single()

    if (!product) {
      errors.push(`المنتج غير موجود: ${item.product_id}`)
      continue
    }

    // تخطي الخدمات
    if (product.type === 'service') {
      continue
    }

    // التحقق من المخزون المتاح
    const { data: inventory } = await supabase
      .from('inventory_transactions')
      .select('quantity, transaction_type')
      .eq('product_id', item.product_id)
      .eq('warehouse_id', warehouseId)

    if (inventory) {
      const totalQuantity = inventory.reduce((sum: number, trans: { quantity: number; transaction_type: string }) => {
        return trans.transaction_type === 'purchase' || trans.transaction_type === 'return'
          ? sum + trans.quantity
          : sum - trans.quantity
      }, 0)

      if (totalQuantity < item.quantity) {
        errors.push(`المخزون غير كافي للمنتج: ${product.name}. المتاح: ${totalQuantity}, المطلوب: ${item.quantity}`)
      } else if (totalQuantity - item.quantity < 5) {
        warnings.push(`المخزون منخفض للمنتج: ${product.name}. سيتبقى: ${totalQuantity - item.quantity}`)
      }
    } else {
      errors.push(`لا يوجد مخزون للمنتج: ${product.name}`)
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  }
}

export async function validateJournalEntryBalance(lines: any[]): Promise<ValidationResult> {
  const errors: string[] = []
  const warnings: string[] = []

  if (!lines || lines.length === 0) {
    errors.push('يجب إضافة سطر واحد على الأقل للقيد')
    return { isValid: false, errors, warnings }
  }

  let totalDebit = 0
  let totalCredit = 0

  lines.forEach((line, index) => {
    if (!line.account_id) {
      errors.push(`السطر ${index + 1}: معرف الحساب مطلوب`)
    }

    if (!line.debit && !line.credit) {
      errors.push(`السطر ${index + 1}: يجب إدخال مبلغ في المدين أو الدائن`)
    }

    if (line.debit && line.credit) {
      errors.push(`السطر ${index + 1}: لا يمكن إدخال مبلغ في المدين والدائن معاً`)
    }

    if (line.debit < 0 || line.credit < 0) {
      errors.push(`السطر ${index + 1}: المبالغ يجب أن تكون موجبة`)
    }

    totalDebit += line.debit || 0
    totalCredit += line.credit || 0
  })

  // التحقق من التوازن
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    errors.push(`القيد غير متوازن. المدين: ${totalDebit}, الدائن: ${totalCredit}`)
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  }
}

export async function validateAccountingPeriod(
  date: string,
  companyId: string
): Promise<ValidationResult> {
  const supabase = await createClient()
  const errors: string[] = []
  const warnings: string[] = []

  // التحقق من إقفال الفترة المحاسبية
  const { data: period } = await supabase
    .from('accounting_periods')
    .select('is_closed, name')
    .eq('company_id', companyId)
    .lte('start_date', date)
    .gte('end_date', date)
    .single()

  if (period?.is_closed) {
    errors.push(`الفترة المحاسبية مقفلة: ${period.name}`)
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  }
}