/**
 * وظائف التحقق من صحة البيانات
 * Validation utilities for form inputs and data validation
 */

/**
 * التحقق من صحة البريد الإلكتروني
 * @param email البريد الإلكتروني للتحقق
 * @returns true إذا كان البريد الإلكتروني صحيحاً
 */
export const validateEmail = (email: string): boolean => {
  if (!email) return false;
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
};

/**
 * التحقق من صحة رقم الهاتف
 * @param phone رقم الهاتف للتحقق
 * @returns true إذا كان رقم الهاتف صحيحاً
 */
export const validatePhone = (phone: string): boolean => {
  if (!phone) return false;
  
  // إزالة جميع الأحرف غير الرقمية
  const cleanPhone = phone.replace(/[^\d]/g, '');
  
  // التحقق من أن الرقم يحتوي على 10-15 رقماً
  return cleanPhone.length >= 10 && cleanPhone.length <= 15;
};

/**
 * التحقق من صحة الرقم
 * @param value القيمة للتحقق
 * @returns true إذا كانت القيمة رقماً صحيحاً
 */
export const validateNumber = (value: string | number): boolean => {
  if (typeof value === 'number') return !isNaN(value);
  if (typeof value === 'string') {
    const cleanValue = value.replace(/[^\d.-]/g, '');
    return !isNaN(Number(cleanValue)) && cleanValue !== '';
  }
  return false;
};

/**
 * التحقق من صحة المبلغ المالي
 * @param amount المبلغ للتحقق
 * @returns true إذا كان المبلغ صحيحاً
 */
export const validateAmount = (amount: string | number): boolean => {
  if (typeof amount === 'number') return amount >= 0;
  if (typeof amount === 'string') {
    const cleanAmount = amount.replace(/[^\d.]/g, '');
    const num = Number(cleanAmount);
    return !isNaN(num) && num >= 0;
  }
  return false;
};

/**
 * التحقق من صحة التاريخ
 * @param date التاريخ للتحقق
 * @returns true إذا كان التاريخ صحيحاً
 */
export const validateDate = (date: string): boolean => {
  if (!date) return false;
  
  const dateObj = new Date(date);
  return !isNaN(dateObj.getTime());
};

/**
 * التحقق من صحة الرقم التعريفي الضريبي
 * @param taxId الرقم التعريفي الضريبي للتحقق
 * @returns true إذا كان الرقم صحيحاً
 */
export const validateTaxId = (taxId: string): boolean => {
  if (!taxId) return false;
  
  // إزالة جميع الأحرف غير الرقمية
  const cleanTaxId = taxId.replace(/[^\d]/g, '');
  
  // التحقق من أن الرقم يحتوي على 9-15 رقماً
  return cleanTaxId.length >= 9 && cleanTaxId.length <= 15;
};

/**
 * الحصول على رسالة خطأ التحقق
 * @param fieldName اسم الحقل
 * @param value القيمة
 * @param type نوع التحقق
 * @returns رسالة الخطأ أو null إذا كانت القيمة صحيحة
 */
export const getValidationError = (fieldName: string, value: string, type: 'email' | 'phone' | 'number' | 'amount' | 'date' | 'taxId'): string | null => {
  if (!value || value.trim() === '') {
    return `يرجى إدخال ${fieldName}`;
  }
  
  switch (type) {
    case 'email':
      if (!validateEmail(value)) {
        return `يرجى إدخال ${fieldName} صحيح`;
      }
      break;
    case 'phone':
      if (!validatePhone(value)) {
        return `يرجى إدخال ${fieldName} صحيح`;
      }
      break;
    case 'number':
      if (!validateNumber(value)) {
        return `يرجى إدخال ${fieldName} رقماً صحيحاً`;
      }
      break;
    case 'amount':
      if (!validateAmount(value)) {
        return `يرجى إدخال ${fieldName} مبلغاً صحيحاً`;
      }
      break;
    case 'date':
      if (!validateDate(value)) {
        return `يرجى إدخال ${fieldName} تاريخاً صحيحاً`;
      }
      break;
    case 'taxId':
      if (!validateTaxId(value)) {
        return `يرجى إدخال ${fieldName} صحيح`;
      }
      break;
  }
  
  return null;
};

/**
 * التحقق من صحة النموذج بالكامل
 * @param formData بيانات النموذج
 * @param validationRules قواعد التحقق
 * @returns كائن يحتوي على الأخطاء
 */
export const validateForm = (formData: Record<string, any>, validationRules: Record<string, { type: 'email' | 'phone' | 'number' | 'amount' | 'date' | 'taxId'; required?: boolean }>): Record<string, string> => {
  const errors: Record<string, string> = {};
  
  Object.keys(validationRules).forEach(field => {
    const rule = validationRules[field];
    const value = formData[field];
    
    if (rule.required && (!value || value.toString().trim() === '')) {
      errors[field] = `حقل ${field} مطلوب`;
    } else if (value && value.toString().trim() !== '') {
      const error = getValidationError(field, value.toString(), rule.type);
      if (error) {
        errors[field] = error;
      }
    }
  });
  
  return errors;
};

/**
 * التحقق من صحة السعر
 * @param price السعر للتحقق
 * @returns true إذا كان السعر صحيحاً
 */
export const validatePrice = (price: string | number): boolean => {
  return validateAmount(price);
};

/**
 * التحقق من صافة الحد الائتماني
 * @param creditLimit الحد الائتماني للتحقق
 * @returns true إذا كان الحد الائتماني صحيحاً
 */
export const validateCreditLimit = (creditLimit: string | number): boolean => {
  return validateAmount(creditLimit);
};

/**
 * التحقق من صحة شروط الدفع
 * @param paymentTerms شروط الدفع للتحقق
 * @returns true إذا كانت شروط الدفع صحيحة
 */
export const validatePaymentTerms = (paymentTerms: string | number): boolean => {
  if (typeof paymentTerms === 'number') return paymentTerms >= 0 && Number.isInteger(paymentTerms);
  if (typeof paymentTerms === 'string') {
    const num = Number(paymentTerms);
    return !isNaN(num) && num >= 0 && Number.isInteger(num);
  }
  return false;
};

/**
 * نسخة بديلة من getValidationError لتتوافق مع الاستخدامات المختلفة
 * @param value القيمة
 * @param type نوع التحقق
 * @returns كائن يحتوي على حالة التحقق ورسالة الخطأ
 */
export const validateField = (value: string, type: 'email' | 'phone' | 'number' | 'amount' | 'date' | 'taxId'): { isValid: boolean; error: string | null } => {
  const error = getValidationError('', value, type);
  return {
    isValid: !error,
    error: error
  };
};

// =====================================================
// 📘 Invoice Lifecycle - قواعد دورة حياة الفاتورة
// =====================================================

/**
 * حالات الفاتورة المسموح بها
 */
export type InvoiceStatus = 'draft' | 'sent' | 'partially_paid' | 'paid' | 'cancelled' | 'fully_returned' | 'partially_returned';

/**
 * الحالات التي تم تنفيذها (لها أثر فعلي في المخزون)
 * 🔒 القاعدة: فقط هذه الحالات يُسمح لها بالمرتجع والإصلاح
 */
export const EXECUTABLE_STATUSES: InvoiceStatus[] = ['sent', 'partially_paid', 'paid'];

/**
 * الحالات التي لا يُسمح بأي عملية عليها
 */
export const NON_EXECUTABLE_STATUSES: InvoiceStatus[] = ['draft', 'cancelled'];

/**
 * التحقق مما إذا كانت الفاتورة قابلة للتنفيذ (لها أثر فعلي)
 * 🔒 القاعدة الذهبية: أي حالة لا تُنشئ أثرًا فعليًا → لا يُسمح لها بأي إصلاح أو مرتجع
 *
 * @param status حالة الفاتورة
 * @returns true إذا كانت الفاتورة منفذة (sent/partially_paid/paid)
 *
 * @example
 * isExecutableInvoice('sent') // true - تم تنفيذ المخزون
 * isExecutableInvoice('paid') // true - تم تنفيذ المخزون والقيود
 * isExecutableInvoice('draft') // false - لم يتم تنفيذ أي شيء
 * isExecutableInvoice('cancelled') // false - ملغية
 */
export const isExecutableInvoice = (status: string | null | undefined): boolean => {
  if (!status) return false;
  return EXECUTABLE_STATUSES.includes(status as InvoiceStatus);
};

/**
 * التحقق مما إذا كانت الفاتورة تسمح بالمرتجع
 * ✔️ يُسمح بالمرتجع فقط إذا: الحالة = Sent / Partially Paid / Paid
 * ❌ يُمنع المرتجع إذا: Draft / Cancelled
 *
 * @param status حالة الفاتورة
 * @returns true إذا كان المرتجع مسموحاً
 */
export const canReturnInvoice = (status: string | null | undefined): boolean => {
  return isExecutableInvoice(status);
};

/**
 * التحقق مما إذا كانت الفاتورة تسمح بالإصلاح
 * 🔧 Draft / Cancelled → تنظيف فقط (لا إنشاء مخزون أو قيود)
 * 🔧 Sent / Paid / Partially Paid → إصلاح كامل
 *
 * @param status حالة الفاتورة
 * @returns نوع الإصلاح المسموح به
 */
export const getRepairType = (status: string | null | undefined): 'cleanup_only' | 'full_repair' | 'none' => {
  if (!status) return 'none';
  if (isExecutableInvoice(status)) return 'full_repair';
  if (NON_EXECUTABLE_STATUSES.includes(status as InvoiceStatus)) return 'cleanup_only';
  return 'none';
};

/**
 * التحقق مما إذا كانت الفاتورة تحتاج قيود محاسبية
 * 📒 القيود المحاسبية فقط للفواتير المدفوعة/المدفوعة جزئياً
 *
 * @param status حالة الفاتورة
 * @returns true إذا كانت تحتاج قيود محاسبية
 */
export const requiresJournalEntries = (status: string | null | undefined): boolean => {
  if (!status) return false;
  return status === 'paid' || status === 'partially_paid';
};

/**
 * التحقق مما إذا كانت الفاتورة تحتاج حركات مخزون
 * 🔄 حركات المخزون لكل الفواتير المنفذة (sent/partially_paid/paid)
 *
 * @param status حالة الفاتورة
 * @returns true إذا كانت تحتاج حركات مخزون
 */
export const requiresInventoryTransactions = (status: string | null | undefined): boolean => {
  return isExecutableInvoice(status);
};

/**
 * الحصول على رسالة الخطأ للعمليات غير المسموحة
 *
 * @param status حالة الفاتورة
 * @param operation العملية المطلوبة
 * @param lang اللغة
 * @returns رسالة الخطأ
 */
export const getInvoiceOperationError = (
  status: string | null | undefined,
  operation: 'return' | 'repair' | 'payment',
  lang: 'en' | 'ar' = 'ar'
): { title: string; description: string } | null => {
  if (!status) {
    return {
      title: lang === 'en' ? 'Invalid Invoice' : 'فاتورة غير صالحة',
      description: lang === 'en' ? 'Invoice status is unknown' : 'حالة الفاتورة غير معروفة'
    };
  }

  if (status === 'draft') {
    const messages = {
      return: {
        en: { title: 'Cannot Return', description: 'Draft invoices cannot be returned. Delete or edit the invoice instead.' },
        ar: { title: 'لا يمكن المرتجع', description: 'فواتير المسودة لا يمكن إرجاعها. احذف أو عدّل الفاتورة بدلاً من ذلك.' }
      },
      repair: {
        en: { title: 'Cannot Repair', description: 'Draft invoices have no data to repair.' },
        ar: { title: 'لا يمكن الإصلاح', description: 'فواتير المسودة ليس لها بيانات للإصلاح.' }
      },
      payment: {
        en: { title: 'Cannot Pay', description: 'Draft invoices cannot receive payments. Send the invoice first.' },
        ar: { title: 'لا يمكن الدفع', description: 'فواتير المسودة لا يمكن استلام دفعات لها. أرسل الفاتورة أولاً.' }
      }
    };
    return messages[operation][lang];
  }

  if (status === 'cancelled') {
    const messages = {
      return: {
        en: { title: 'Cannot Return', description: 'Cancelled invoices cannot be returned.' },
        ar: { title: 'لا يمكن المرتجع', description: 'الفواتير الملغاة لا يمكن إرجاعها.' }
      },
      repair: {
        en: { title: 'Cannot Repair', description: 'Cancelled invoices have no data to repair.' },
        ar: { title: 'لا يمكن الإصلاح', description: 'الفواتير الملغاة ليس لها بيانات للإصلاح.' }
      },
      payment: {
        en: { title: 'Cannot Pay', description: 'Cancelled invoices cannot receive payments.' },
        ar: { title: 'لا يمكن الدفع', description: 'الفواتير الملغاة لا يمكن استلام دفعات لها.' }
      }
    };
    return messages[operation][lang];
  }

  return null; // العملية مسموحة
};

/**
 * ملخص حالات الفاتورة وما يُسمح به لكل حالة
 *
 * | الحالة           | مخزون | محاسبة | مدفوعات | مرتجع |
 * |------------------|-------|--------|---------|-------|
 * | Draft            | ❌    | ❌     | ❌      | ❌    |
 * | Sent             | ✅    | ❌     | ✔️      | ✅    |
 * | Partially Paid   | ✅    | ✅     | ✅      | ✅    |
 * | Paid             | ✅    | ✅     | ✅      | ✅    |
 * | Cancelled        | ❌    | ❌     | ❌      | ❌    |
 */
export const INVOICE_LIFECYCLE_RULES = {
  draft: { inventory: false, accounting: false, payments: false, returns: false },
  sent: { inventory: true, accounting: false, payments: true, returns: true },
  partially_paid: { inventory: true, accounting: true, payments: true, returns: true },
  paid: { inventory: true, accounting: true, payments: true, returns: true },
  cancelled: { inventory: false, accounting: false, payments: false, returns: false },
} as const;

// =============================================
// Journal Entry Validation
// =============================================

export interface JournalEntryLineInput {
  account_id: string;
  debit_amount: number;
  credit_amount: number;
  description?: string;
}

/**
 * التحقق من توازن القيد المحاسبي
 * Validate that journal entry lines are balanced (total debit = total credit)
 *
 * @param lines سطور القيد
 * @param lang لغة رسالة الخطأ
 * @returns null إذا كان متوازناً، أو رسالة خطأ
 */
export function validateJournalEntryBalance(
  lines: JournalEntryLineInput[],
  lang: 'ar' | 'en' = 'ar'
): string | null {
  if (!lines || lines.length === 0) {
    return lang === 'en'
      ? 'Journal entry must have at least one line'
      : 'القيد يجب أن يحتوي على سطر واحد على الأقل';
  }

  const totalDebit = lines.reduce((sum, line) => sum + Number(line.debit_amount || 0), 0);
  const totalCredit = lines.reduce((sum, line) => sum + Number(line.credit_amount || 0), 0);
  const difference = Math.abs(totalDebit - totalCredit);

  // Allow small rounding difference (0.01)
  if (difference > 0.01) {
    return lang === 'en'
      ? `Entry is not balanced! Debit: ${totalDebit.toFixed(2)}, Credit: ${totalCredit.toFixed(2)}, Difference: ${difference.toFixed(2)}`
      : `القيد غير متوازن! المدين: ${totalDebit.toFixed(2)}، الدائن: ${totalCredit.toFixed(2)}، الفرق: ${difference.toFixed(2)}`;
  }

  // Ensure at least one debit and one credit
  const hasDebit = lines.some(line => Number(line.debit_amount || 0) > 0);
  const hasCredit = lines.some(line => Number(line.credit_amount || 0) > 0);

  if (!hasDebit || !hasCredit) {
    return lang === 'en'
      ? 'Entry must have at least one debit and one credit line'
      : 'القيد يجب أن يحتوي على طرف مدين وطرف دائن على الأقل';
  }

  return null;
}

/**
 * حساب إجماليات القيد المحاسبي
 * Calculate totals for journal entry lines
 */
export function calculateJournalEntryTotals(lines: JournalEntryLineInput[]): {
  totalDebit: number;
  totalCredit: number;
  difference: number;
  isBalanced: boolean;
} {
  const totalDebit = lines.reduce((sum, line) => sum + Number(line.debit_amount || 0), 0);
  const totalCredit = lines.reduce((sum, line) => sum + Number(line.credit_amount || 0), 0);
  const difference = Math.abs(totalDebit - totalCredit);
  const isBalanced = difference <= 0.01;

  return { totalDebit, totalCredit, difference, isBalanced };
}