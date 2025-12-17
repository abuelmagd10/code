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
 * 📌 النمط المحاسبي الصارم لدورة حياة الفاتورة (MANDATORY SPECIFICATION)
 *
 * | الحالة           | مخزون | قيد AR/Revenue | COGS | مدفوعات | مرتجع (قيد) |
 * |------------------|-------|----------------|------|---------|-------------|
 * | Draft            | ❌    | ❌             | ❌   | ❌      | ❌          |
 * | Sent             | ✅    | ✅             | ❌   | ✔️      | ❌ (مخزون فقط) |
 * | Partially Paid   | ✅    | ✅             | ❌   | ✅      | ✅          |
 * | Paid             | ✅    | ✅             | ❌   | ✅      | ✅          |
 * | Cancelled        | ❌    | ❌             | ❌   | ❌      | ❌          |
 *
 * 📒 ملاحظات:
 * - ❌ لا COGS في أي حالة (لا قيد تكلفة البضاعة المباعة)
 * - قيد AR/Revenue يُنشأ عند Sent (Debit AR / Credit Revenue)
 * - قيد السداد يُنشأ عند الدفع (Debit Cash / Credit AR)
 * - مرتجع Sent: مخزون فقط، لا قيد محاسبي
 * - مرتجع Paid/Partial: مخزون + قيد محاسبي عكسي + Customer Credit
 */
export const INVOICE_LIFECYCLE_RULES = {
  draft: { inventory: false, accounting: false, payments: false, returns: false, returnJournal: false },
  sent: { inventory: true, accounting: true, payments: true, returns: true, returnJournal: false },
  partially_paid: { inventory: true, accounting: true, payments: true, returns: true, returnJournal: true },
  paid: { inventory: true, accounting: true, payments: true, returns: true, returnJournal: true },
  cancelled: { inventory: false, accounting: false, payments: false, returns: false, returnJournal: false },
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

// =====================================================
// 📘 Purchase Invoice (Bill) Lifecycle - دورة حياة فواتير الشراء
// =====================================================

/**
 * حالات فاتورة الشراء المسموح بها
 */
export type BillStatus = 'draft' | 'sent' | 'received' | 'partially_paid' | 'paid' | 'cancelled' | 'fully_returned' | 'partially_returned';

/**
 * الحالات التي تم استلامها (لها أثر فعلي في المخزون)
 * 🔒 القاعدة: فقط هذه الحالات يُسمح لها بالمرتجع
 */
export const BILL_EXECUTABLE_STATUSES: BillStatus[] = ['sent', 'received', 'partially_paid', 'paid'];

/**
 * الحالات التي لا يُسمح بأي عملية عليها
 */
export const BILL_NON_EXECUTABLE_STATUSES: BillStatus[] = ['draft', 'cancelled'];

/**
 * التحقق مما إذا كانت فاتورة الشراء قابلة للتنفيذ (لها أثر فعلي)
 * 🔒 القاعدة الذهبية: أي حالة لا تُنشئ أثرًا فعليًا → لا يُسمح لها بأي مرتجع
 *
 * @param status حالة فاتورة الشراء
 * @returns true إذا كانت الفاتورة منفذة (sent/received/partially_paid/paid)
 */
export const isExecutableBill = (status: string | null | undefined): boolean => {
  if (!status) return false;
  return BILL_EXECUTABLE_STATUSES.includes(status as BillStatus);
};

/**
 * التحقق مما إذا كانت فاتورة الشراء تسمح بالمرتجع
 * ✔️ يُسمح بالمرتجع فقط إذا: الحالة = Sent / Received / Partially Paid / Paid
 * ❌ يُمنع المرتجع إذا: Draft / Cancelled
 *
 * @param status حالة فاتورة الشراء
 * @returns true إذا كان المرتجع مسموحاً
 */
export const canReturnBill = (status: string | null | undefined): boolean => {
  return isExecutableBill(status);
};

/**
 * التحقق مما إذا كانت فاتورة الشراء تحتاج قيود محاسبية
 * 📒 القيود المحاسبية فقط للفواتير المدفوعة/المدفوعة جزئياً
 *
 * @param status حالة فاتورة الشراء
 * @returns true إذا كانت تحتاج قيود محاسبية
 */
export const billRequiresJournalEntries = (status: string | null | undefined): boolean => {
  if (!status) return false;
  return status === 'paid' || status === 'partially_paid';
};

/**
 * التحقق مما إذا كانت فاتورة الشراء تحتاج حركات مخزون (Stock In)
 * 🔄 حركات المخزون لكل الفواتير المستلمة (sent/received/partially_paid/paid)
 *
 * @param status حالة فاتورة الشراء
 * @returns true إذا كانت تحتاج حركات مخزون
 */
export const billRequiresInventoryTransactions = (status: string | null | undefined): boolean => {
  return isExecutableBill(status);
};

/**
 * الحصول على رسالة الخطأ للعمليات غير المسموحة على فواتير الشراء
 *
 * @param status حالة فاتورة الشراء
 * @param operation العملية المطلوبة
 * @param lang اللغة
 * @returns رسالة الخطأ
 */
export const getBillOperationError = (
  status: string | null | undefined,
  operation: 'return' | 'repair' | 'payment',
  lang: 'en' | 'ar' = 'ar'
): { title: string; description: string } | null => {
  if (!status) {
    return {
      title: lang === 'en' ? 'Invalid Bill' : 'فاتورة غير صالحة',
      description: lang === 'en' ? 'Bill status is unknown' : 'حالة الفاتورة غير معروفة'
    };
  }

  if (status === 'draft') {
    const messages = {
      return: {
        en: { title: 'Cannot Return', description: 'Draft bills cannot be returned. Delete or edit the bill instead.' },
        ar: { title: 'لا يمكن المرتجع', description: 'فواتير المسودة لا يمكن إرجاعها. احذف أو عدّل الفاتورة بدلاً من ذلك.' }
      },
      repair: {
        en: { title: 'Cannot Repair', description: 'Draft bills have no data to repair.' },
        ar: { title: 'لا يمكن الإصلاح', description: 'فواتير المسودة ليس لها بيانات للإصلاح.' }
      },
      payment: {
        en: { title: 'Cannot Pay', description: 'Draft bills cannot receive payments. Send the bill first.' },
        ar: { title: 'لا يمكن الدفع', description: 'فواتير المسودة لا يمكن استلام دفعات لها. أرسل الفاتورة أولاً.' }
      }
    };
    return messages[operation][lang];
  }

  if (status === 'cancelled') {
    const messages = {
      return: {
        en: { title: 'Cannot Return', description: 'Cancelled bills cannot be returned.' },
        ar: { title: 'لا يمكن المرتجع', description: 'الفواتير الملغاة لا يمكن إرجاعها.' }
      },
      repair: {
        en: { title: 'Cannot Repair', description: 'Cancelled bills have no data to repair.' },
        ar: { title: 'لا يمكن الإصلاح', description: 'الفواتير الملغاة ليس لها بيانات للإصلاح.' }
      },
      payment: {
        en: { title: 'Cannot Pay', description: 'Cancelled bills cannot receive payments.' },
        ar: { title: 'لا يمكن الدفع', description: 'الفواتير الملغاة لا يمكن استلام دفعات لها.' }
      }
    };
    return messages[operation][lang];
  }

  return null; // العملية مسموحة
};

/**
 * 📌 النمط المحاسبي الصارم لدورة حياة فاتورة الشراء (MANDATORY SPECIFICATION)
 *
 * | الحالة           | مخزون (Stock In) | قيد Inventory/AP | مدفوعات | مرتجع (قيد) |
 * |------------------|------------------|------------------|---------|-------------|
 * | Draft            | ❌               | ❌               | ❌      | ❌          |
 * | Sent/Received    | ✅               | ✅               | ✔️      | ❌ (مخزون فقط) |
 * | Partially Paid   | ✅               | ✅               | ✅      | ✅          |
 * | Paid             | ✅               | ✅               | ✅      | ✅          |
 * | Cancelled        | ❌               | ❌               | ❌      | ❌          |
 *
 * 📒 ملاحظات:
 * - قيد Inventory/AP يُنشأ عند Sent/Received (Debit Inventory / Credit AP)
 * - قيد السداد يُنشأ عند الدفع (Debit AP / Credit Cash)
 * - مرتجع Received: مخزون فقط، لا قيد محاسبي
 * - مرتجع Paid/Partial: مخزون + قيد محاسبي عكسي + Supplier Debit Credit
 */
export const BILL_LIFECYCLE_RULES = {
  draft: { inventory: false, accounting: false, payments: false, returns: false, returnJournal: false },
  sent: { inventory: true, accounting: true, payments: true, returns: true, returnJournal: false },
  received: { inventory: true, accounting: true, payments: true, returns: true, returnJournal: false },
  partially_paid: { inventory: true, accounting: true, payments: true, returns: true, returnJournal: true },
  paid: { inventory: true, accounting: true, payments: true, returns: true, returnJournal: true },
  cancelled: { inventory: false, accounting: false, payments: false, returns: false, returnJournal: false },
} as const;

// =====================================================
// 📘 Purchase Returns - مرتجعات المشتريات
// =====================================================

/**
 * حالات مرتجع الشراء
 */
export type PurchaseReturnStatus = 'draft' | 'pending' | 'completed' | 'cancelled';

/**
 * التحقق من إمكانية إنشاء مرتجع لفاتورة شراء
 *
 * @param billStatus حالة فاتورة الشراء
 * @param returnedAmount المبلغ المرتجع سابقاً
 * @param totalAmount إجمالي الفاتورة
 * @returns كائن يحتوي على إمكانية الإنشاء ورسالة الخطأ
 */
export const canCreatePurchaseReturn = (
  billStatus: string | null | undefined,
  returnedAmount: number = 0,
  totalAmount: number = 0
): { canCreate: boolean; error?: { title: string; description: string } } => {
  // التحقق من حالة الفاتورة
  if (!canReturnBill(billStatus)) {
    return {
      canCreate: false,
      error: getBillOperationError(billStatus, 'return', 'ar') || undefined
    };
  }

  // التحقق من عدم استنفاذ كامل الفاتورة
  if (returnedAmount >= totalAmount && totalAmount > 0) {
    return {
      canCreate: false,
      error: {
        title: 'لا يمكن المرتجع',
        description: 'تم إرجاع كامل الفاتورة مسبقاً'
      }
    };
  }

  return { canCreate: true };
};

/**
 * حساب تأثير مرتجع المشتريات
 *
 * @param billStatus حالة فاتورة الشراء
 * @param returnAmount مبلغ المرتجع
 * @param paidAmount المبلغ المدفوع
 * @param totalAmount إجمالي الفاتورة
 * @returns كائن يحتوي على التأثيرات المتوقعة
 */
export const calculatePurchaseReturnEffects = (
  billStatus: string | null | undefined,
  returnAmount: number,
  paidAmount: number,
  totalAmount: number
): {
  shouldCreateInventoryMovement: boolean;  // خصم من المخزون (Stock Out)
  shouldCreateJournalEntry: boolean;        // قيد محاسبي عكسي
  shouldCreateSupplierDebitCredit: boolean; // رصيد مدين للمورد
  supplierDebitCreditAmount: number;        // مبلغ الرصيد المدين
  newRemainingAmount: number;               // المتبقي على الفاتورة
} => {
  const netAfterReturn = totalAmount - returnAmount;
  const isPaid = billStatus === 'paid' || billStatus === 'partially_paid';

  // المخزون يُخصم دائماً للحالات المنفذة
  const shouldCreateInventoryMovement = isExecutableBill(billStatus);

  // القيد المحاسبي فقط للفواتير المدفوعة
  const shouldCreateJournalEntry = isPaid;

  // رصيد مدين للمورد إذا كان المدفوع أكبر من صافي الفاتورة بعد المرتجع
  const excessPaid = paidAmount - netAfterReturn;
  const shouldCreateSupplierDebitCredit = isPaid && excessPaid > 0;
  const supplierDebitCreditAmount = shouldCreateSupplierDebitCredit ? excessPaid : 0;

  // المتبقي الجديد
  const newRemainingAmount = Math.max(0, netAfterReturn - paidAmount);

  return {
    shouldCreateInventoryMovement,
    shouldCreateJournalEntry,
    shouldCreateSupplierDebitCredit,
    supplierDebitCreditAmount,
    newRemainingAmount
  };
};

/**
 * مثال على حساب تأثير المرتجع:
 *
 * الفاتورة: 900 جنيه
 * المدفوع: 300 جنيه
 * المرتجع: 300 جنيه
 * ─────────────────
 * الصافي: 600 جنيه
 * المتبقي: 300 جنيه (600 - 300)
 * رصيد المورد: 0 (لأن المدفوع < الصافي)
 *
 * مثال آخر:
 * الفاتورة: 900 جنيه
 * المدفوع: 900 جنيه (مدفوعة بالكامل)
 * المرتجع: 500 جنيه
 * ─────────────────
 * الصافي: 400 جنيه
 * المتبقي: 0 جنيه
 * رصيد المورد: 500 جنيه (900 - 400 = 500 زيادة في المدفوع)
 */

// =====================================================
// 📘 Branch & Cost Center Validation - الفروع ومراكز التكلفة
// =====================================================

/**
 * 📌 قواعد الفروع ومراكز التكلفة (MANDATORY SPECIFICATION)
 *
 * 1️⃣ كل سجل مرتبط بـ: Company → Branch → Cost Center
 * 2️⃣ كل مستخدم مرتبط بفرع واحد ومركز تكلفة واحد فقط
 * 3️⃣ يمنع أي تداخل بين الشركات أو الفروع أو مستخدميها
 * 4️⃣ كل العمليات المحاسبية والمخزنية مرتبطة بالفرع ومركز التكلفة
 */

export interface BranchCostCenterContext {
  company_id: string;
  branch_id?: string | null;
  cost_center_id?: string | null;
  user_id?: string;
}

/**
 * التحقق من صحة سياق الفرع ومركز التكلفة
 * Validate that branch and cost center belong to the same company
 *
 * @param context سياق الفرع ومركز التكلفة
 * @param userBranchId فرع المستخدم (للتحقق من الصلاحيات)
 * @param userCostCenterId مركز تكلفة المستخدم
 * @returns null إذا كان صحيحاً، أو رسالة خطأ
 */
export function validateBranchCostCenterContext(
  context: BranchCostCenterContext,
  userBranchId?: string | null,
  userCostCenterId?: string | null
): { isValid: boolean; error?: string } {
  // 1. التحقق من وجود company_id
  if (!context.company_id) {
    return { isValid: false, error: 'معرف الشركة مطلوب' };
  }

  // 2. التحقق من تطابق الفرع مع فرع المستخدم (إذا كان المستخدم مقيداً بفرع)
  if (userBranchId && context.branch_id && context.branch_id !== userBranchId) {
    return {
      isValid: false,
      error: 'لا يمكنك إنشاء سجلات في فرع غير فرعك المحدد'
    };
  }

  // 3. التحقق من تطابق مركز التكلفة مع مركز المستخدم (إذا كان مقيداً)
  if (userCostCenterId && context.cost_center_id && context.cost_center_id !== userCostCenterId) {
    return {
      isValid: false,
      error: 'لا يمكنك إنشاء سجلات في مركز تكلفة غير مركزك المحدد'
    };
  }

  return { isValid: true };
}

/**
 * التحقق من عدم تداخل البيانات بين الشركات
 * Validate that data doesn't cross company boundaries
 *
 * @param sourceCompanyId معرف شركة المصدر
 * @param targetCompanyId معرف شركة الهدف
 * @param operationType نوع العملية
 * @returns null إذا كان صحيحاً، أو رسالة خطأ
 */
export function validateCompanyBoundary(
  sourceCompanyId: string,
  targetCompanyId: string,
  operationType: 'invoice' | 'bill' | 'payment' | 'return' | 'journal' | 'inventory'
): { isValid: boolean; error?: string } {
  if (sourceCompanyId !== targetCompanyId) {
    const operationNames: Record<string, string> = {
      invoice: 'الفاتورة',
      bill: 'فاتورة الشراء',
      payment: 'الدفع',
      return: 'المرتجع',
      journal: 'القيد المحاسبي',
      inventory: 'حركة المخزون'
    };
    return {
      isValid: false,
      error: `لا يمكن ربط ${operationNames[operationType]} بسجلات من شركة أخرى`
    };
  }
  return { isValid: true };
}

/**
 * إنشاء سياق افتراضي للفرع ومركز التكلفة
 * Create default context inheriting from user settings
 *
 * @param companyId معرف الشركة
 * @param userBranchId فرع المستخدم
 * @param userCostCenterId مركز تكلفة المستخدم
 * @param overrideBranchId فرع محدد (اختياري)
 * @param overrideCostCenterId مركز تكلفة محدد (اختياري)
 */
export function createBranchCostCenterContext(
  companyId: string,
  userBranchId?: string | null,
  userCostCenterId?: string | null,
  overrideBranchId?: string | null,
  overrideCostCenterId?: string | null
): BranchCostCenterContext {
  return {
    company_id: companyId,
    branch_id: overrideBranchId || userBranchId || null,
    cost_center_id: overrideCostCenterId || userCostCenterId || null,
  };
}

/**
 * 📌 قواعد صارمة للعمليات المحاسبية والمخزنية
 *
 * كل قيد يحتوي على: reference_type, reference_id, branch_id, cost_center_id
 * كل حركة مخزون تحتوي: source_document, document_id, branch_id, cost_center_id
 * جميع التقارير تعتمد فقط على القيود المحاسبية
 */
export interface AccountingOperationContext extends BranchCostCenterContext {
  reference_type: string;
  reference_id: string;
  entry_date: string;
  description?: string;
}

/**
 * التحقق من اكتمال سياق العملية المحاسبية
 */
export function validateAccountingOperationContext(
  context: AccountingOperationContext
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!context.company_id) errors.push('معرف الشركة مطلوب');
  if (!context.reference_type) errors.push('نوع المرجع مطلوب');
  if (!context.reference_id) errors.push('معرف المرجع مطلوب');
  if (!context.entry_date) errors.push('تاريخ القيد مطلوب');

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * أنواع المراجع المسموحة للقيود المحاسبية
 * 📌 النمط المحاسبي الصارم: لا invoice_cogs
 */
export const VALID_REFERENCE_TYPES = [
  'invoice',           // فاتورة مبيعات (AR/Revenue)
  'invoice_payment',   // سداد فاتورة مبيعات
  'bill',              // فاتورة مشتريات (Inventory/AP)
  'bill_payment',      // سداد فاتورة مشتريات
  'sales_return',      // مرتجع مبيعات
  'purchase_return',   // مرتجع مشتريات
  'customer_credit',   // رصيد دائن للعميل
  'supplier_debit_credit', // رصيد مدين للمورد
  'payment',           // سند قبض
  'expense',           // سند صرف
  'adjustment',        // تسوية
  'opening_balance',   // رصيد افتتاحي
  'manual',            // قيد يدوي
] as const;

export type ValidReferenceType = typeof VALID_REFERENCE_TYPES[number];

/**
 * التحقق من صحة نوع المرجع
 */
export function isValidReferenceType(type: string): type is ValidReferenceType {
  return VALID_REFERENCE_TYPES.includes(type as ValidReferenceType);
}

// =====================================================
// 📘 ERP Access Control - قواعد التحكم في وصول المستخدم
// =====================================================

/**
 * 📌 قاعدة ربط المستخدم بالفرع ومركز التكلفة والمخزن (ERP Professional Access Control)
 *
 * المستخدم لا يعمل في النظام بشكل عام،
 * المستخدم يعمل داخل فرع + مركز تكلفة + مخزن محدد.
 *
 * Company → Branch → Cost Center → Warehouse
 */

/**
 * سياق المستخدم الكامل (User Context)
 */
export interface UserContext {
  user_id: string;
  company_id: string;
  branch_id?: string | null;      // null = جميع الفروع
  cost_center_id?: string | null; // null = جميع مراكز التكلفة
  warehouse_id?: string | null;   // null = جميع المخازن
  role?: string;
}

/**
 * سياق المستند/العملية (Document Context)
 */
export interface DocumentContext {
  company_id: string;
  branch_id?: string | null;
  cost_center_id?: string | null;
  warehouse_id?: string | null;
}

/**
 * نتيجة التحقق
 */
export interface ValidationResult {
  isValid: boolean;
  error?: {
    title: string;
    description: string;
    code: string;
  };
}

/**
 * 2️⃣ قاعدة ربط المستخدم (User Assignment Rule)
 * التحقق من صحة تعيين الفرع ومركز التكلفة والمخزن للمستخدم
 *
 * ❌ لا يجوز ربط المستخدم:
 * - بمركز تكلفة لا يتبع الفرع المحدد
 * - أو بمخزن لا يتبع نفس الفرع
 */
export function validateUserAssignment(
  branchId: string | null,
  costCenterId: string | null,
  costCenterBranchId: string | null,
  warehouseId: string | null,
  warehouseBranchId: string | null,
  lang: 'ar' | 'en' = 'ar'
): ValidationResult {
  // التحقق من أن مركز التكلفة يتبع نفس الفرع
  if (branchId && costCenterId && costCenterBranchId && costCenterBranchId !== branchId) {
    return {
      isValid: false,
      error: {
        title: lang === 'en' ? 'Invalid Cost Center' : 'مركز تكلفة غير صالح',
        description: lang === 'en'
          ? 'Cost center must belong to the assigned branch'
          : 'مركز التكلفة يجب أن يتبع نفس الفرع المحدد',
        code: 'COST_CENTER_BRANCH_MISMATCH'
      }
    };
  }

  // التحقق من أن المخزن يتبع نفس الفرع
  if (branchId && warehouseId && warehouseBranchId && warehouseBranchId !== branchId) {
    return {
      isValid: false,
      error: {
        title: lang === 'en' ? 'Invalid Warehouse' : 'مخزن غير صالح',
        description: lang === 'en'
          ? 'Warehouse must belong to the assigned branch'
          : 'المخزن يجب أن يتبع نفس الفرع المحدد',
        code: 'WAREHOUSE_BRANCH_MISMATCH'
      }
    };
  }

  return { isValid: true };
}

/**
 * 3️⃣ قاعدة المطابقة (Validation Rule)
 * التحقق من تطابق سياق المستند مع سياق المستخدم
 *
 * User.company_id = Document.company_id
 * User.branch_id = Document.branch_id (إذا كان المستخدم مقيداً)
 * User.cost_center_id = Document.cost_center_id (إذا كان المستخدم مقيداً)
 * User.warehouse_id = Document.warehouse_id (إذا كان المستخدم مقيداً)
 *
 * ❌ أي عدم تطابق = رفض العملية فورًا
 */
export function validateUserDocumentAccess(
  userContext: UserContext,
  documentContext: DocumentContext,
  _operationType: 'create' | 'read' | 'update' | 'delete' = 'read',
  lang: 'ar' | 'en' = 'ar'
): ValidationResult {
  // _operationType reserved for future permission-based access control
  // 1. التحقق من تطابق الشركة (إلزامي دائماً)
  if (userContext.company_id !== documentContext.company_id) {
    return {
      isValid: false,
      error: {
        title: lang === 'en' ? 'Access Denied' : 'تم رفض الوصول',
        description: lang === 'en'
          ? 'You cannot access records from another company'
          : 'لا يمكنك الوصول لسجلات من شركة أخرى',
        code: 'COMPANY_MISMATCH'
      }
    };
  }

  // 2. التحقق من تطابق الفرع (إذا كان المستخدم مقيداً بفرع)
  if (userContext.branch_id && documentContext.branch_id && userContext.branch_id !== documentContext.branch_id) {
    return {
      isValid: false,
      error: {
        title: lang === 'en' ? 'Branch Access Denied' : 'لا صلاحية للفرع',
        description: lang === 'en'
          ? 'You are not authorized to access records from this branch'
          : 'ليست لديك صلاحية للوصول لسجلات هذا الفرع',
        code: 'BRANCH_MISMATCH'
      }
    };
  }

  // 3. التحقق من تطابق مركز التكلفة (إذا كان المستخدم مقيداً)
  if (userContext.cost_center_id && documentContext.cost_center_id && userContext.cost_center_id !== documentContext.cost_center_id) {
    return {
      isValid: false,
      error: {
        title: lang === 'en' ? 'Cost Center Access Denied' : 'لا صلاحية لمركز التكلفة',
        description: lang === 'en'
          ? 'You are not authorized to access records from this cost center'
          : 'ليست لديك صلاحية للوصول لسجلات مركز التكلفة هذا',
        code: 'COST_CENTER_MISMATCH'
      }
    };
  }

  // 4. التحقق من تطابق المخزن (إذا كان المستخدم مقيداً)
  if (userContext.warehouse_id && documentContext.warehouse_id && userContext.warehouse_id !== documentContext.warehouse_id) {
    return {
      isValid: false,
      error: {
        title: lang === 'en' ? 'Warehouse Access Denied' : 'لا صلاحية للمخزن',
        description: lang === 'en'
          ? 'You are not authorized to access records from this warehouse'
          : 'ليست لديك صلاحية للوصول لسجلات هذا المخزن',
        code: 'WAREHOUSE_MISMATCH'
      }
    };
  }

  return { isValid: true };
}

/**
 * 4️⃣ العمليات المالية (Financial Transactions)
 * التحقق من صلاحية إنشاء عملية مالية
 *
 * عند إنشاء: فاتورة مبيعات / مشتريات / مرتجع / سند قبض / صرف / قيد يومية
 * - يتم تحديد الفرع + مركز التكلفة تلقائيًا من المستخدم
 * - منع التغيير اليدوي إلا للمستخدم المخوّل
 * - ربط جميع القيود بنفس الفرع ومركز التكلفة
 */
export function validateFinancialTransaction(
  userContext: UserContext,
  transactionBranchId: string | null,
  transactionCostCenterId: string | null,
  allowOverride: boolean = false,
  lang: 'ar' | 'en' = 'ar'
): ValidationResult {
  // إذا كان المستخدم مقيداً بفرع ولم يُسمح بالتجاوز
  if (!allowOverride && userContext.branch_id && transactionBranchId && transactionBranchId !== userContext.branch_id) {
    return {
      isValid: false,
      error: {
        title: lang === 'en' ? 'Invalid Branch' : 'فرع غير صالح',
        description: lang === 'en'
          ? 'Transaction must be created in your assigned branch'
          : 'يجب إنشاء العملية في فرعك المحدد',
        code: 'FINANCIAL_BRANCH_RESTRICTED'
      }
    };
  }

  // إذا كان المستخدم مقيداً بمركز تكلفة
  if (!allowOverride && userContext.cost_center_id && transactionCostCenterId && transactionCostCenterId !== userContext.cost_center_id) {
    return {
      isValid: false,
      error: {
        title: lang === 'en' ? 'Invalid Cost Center' : 'مركز تكلفة غير صالح',
        description: lang === 'en'
          ? 'Transaction must be created in your assigned cost center'
          : 'يجب إنشاء العملية في مركز التكلفة المحدد لك',
        code: 'FINANCIAL_COST_CENTER_RESTRICTED'
      }
    };
  }

  return { isValid: true };
}

/**
 * 5️⃣ العمليات المخزنية (Inventory Transactions)
 * التحقق من صلاحية إجراء عملية مخزنية
 *
 * عند أي حركة مخزون: بيع / شراء / تحويل / مرتجع / تسوية
 * - اختيار مخزن تابع للفرع المصرح به للمستخدم
 * - ربط الحركة بمركز التكلفة الخاص بالفرع
 * - منع السحب أو الإضافة لمخزن خارج صلاحيات المستخدم
 */
export function validateInventoryTransaction(
  userContext: UserContext,
  transactionBranchId: string | null,
  transactionWarehouseId: string | null,
  allowOverride: boolean = false,
  lang: 'ar' | 'en' = 'ar'
): ValidationResult {
  // إذا كان المستخدم مقيداً بفرع ولم يُسمح بالتجاوز
  if (!allowOverride && userContext.branch_id && transactionBranchId && transactionBranchId !== userContext.branch_id) {
    return {
      isValid: false,
      error: {
        title: lang === 'en' ? 'Invalid Branch' : 'فرع غير صالح',
        description: lang === 'en'
          ? 'Inventory operation must be in your assigned branch'
          : 'يجب إجراء عملية المخزون في فرعك المحدد',
        code: 'INVENTORY_BRANCH_RESTRICTED'
      }
    };
  }

  // التحقق من أن المخزن هو المخزن المحدد للمستخدم (إذا كان مقيداً)
  if (!allowOverride && userContext.warehouse_id && transactionWarehouseId && transactionWarehouseId !== userContext.warehouse_id) {
    return {
      isValid: false,
      error: {
        title: lang === 'en' ? 'Warehouse Access Denied' : 'لا صلاحية للمخزن',
        description: lang === 'en'
          ? 'You can only perform inventory operations in your assigned warehouse'
          : 'يمكنك إجراء عمليات المخزون فقط في المخزن المحدد لك',
        code: 'INVENTORY_WAREHOUSE_RESTRICTED'
      }
    };
  }

  return { isValid: true };
}

/**
 * 6️⃣ الحسابات المصرفية والصندوق (Bank & Cash Accounts)
 * التحقق من صلاحية استخدام حساب بنكي أو صندوق نقدي
 *
 * كل حساب بنكي أو صندوق نقدي مرتبط بفرع ومركز تكلفة
 * المستخدم لا يستطيع استخدام حساب:
 * ❌ من فرع آخر
 * ❌ من مركز تكلفة غير مصرح له
 */
export function validateBankAccountAccess(
  userContext: UserContext,
  accountBranchId: string | null,
  accountCostCenterId: string | null,
  lang: 'ar' | 'en' = 'ar'
): ValidationResult {
  // التحقق من أن الحساب يتبع فرع المستخدم
  if (userContext.branch_id && accountBranchId && accountBranchId !== userContext.branch_id) {
    return {
      isValid: false,
      error: {
        title: lang === 'en' ? 'Account Access Denied' : 'لا صلاحية للحساب',
        description: lang === 'en'
          ? 'You cannot use bank accounts from another branch'
          : 'لا يمكنك استخدام حسابات بنكية من فرع آخر',
        code: 'BANK_ACCOUNT_BRANCH_RESTRICTED'
      }
    };
  }

  // التحقق من أن الحساب يتبع مركز تكلفة المستخدم
  if (userContext.cost_center_id && accountCostCenterId && accountCostCenterId !== userContext.cost_center_id) {
    return {
      isValid: false,
      error: {
        title: lang === 'en' ? 'Account Access Denied' : 'لا صلاحية للحساب',
        description: lang === 'en'
          ? 'You cannot use bank accounts from another cost center'
          : 'لا يمكنك استخدام حسابات بنكية من مركز تكلفة آخر',
        code: 'BANK_ACCOUNT_COST_CENTER_RESTRICTED'
      }
    };
  }

  return { isValid: true };
}

/**
 * إنشاء سياق المستند من سياق المستخدم
 * Auto-populate document context from user context
 */
export function createDocumentContextFromUser(
  userContext: UserContext,
  overrides?: Partial<DocumentContext>
): DocumentContext {
  return {
    company_id: overrides?.company_id || userContext.company_id,
    branch_id: overrides?.branch_id !== undefined ? overrides.branch_id : userContext.branch_id,
    cost_center_id: overrides?.cost_center_id !== undefined ? overrides.cost_center_id : userContext.cost_center_id,
    warehouse_id: overrides?.warehouse_id !== undefined ? overrides.warehouse_id : userContext.warehouse_id,
  };
}

/**
 * مساعد: الحصول على اسم نوع العملية المخزنية
 */
function getTransactionTypeName(type: string, lang: 'ar' | 'en'): string {
  const names: Record<string, { ar: string; en: string }> = {
    'stock_in': { ar: 'إضافة للمخزون', en: 'Stock In' },
    'stock_out': { ar: 'سحب من المخزون', en: 'Stock Out' },
    'transfer': { ar: 'تحويل', en: 'Transfer' },
    'adjustment': { ar: 'تسوية', en: 'Adjustment' },
  };
  return names[type]?.[lang] || type;
}

/**
 * 📌 ملخص القواعد الذهبية للـ ERP
 *
 * 1️⃣ المستخدم = Company + Branch + Cost Center + Warehouse
 * 2️⃣ لا عملية بدون سياق محدد
 * 3️⃣ التحقق من التطابق في كل عملية
 * 4️⃣ العمليات المالية = فرع + مركز تكلفة المستخدم
 * 5️⃣ العمليات المخزنية = مخزن المستخدم فقط
 * 6️⃣ الحسابات البنكية = فرع + مركز تكلفة المستخدم
 * 7️⃣ التقارير = تصفية حسب السياق
 */
export const ERP_ACCESS_CONTROL_RULES = {
  // المستخدم يعمل داخل سياق محدد
  USER_CONTEXT_REQUIRED: true,

  // التحقق من التطابق في كل عملية
  VALIDATE_ALL_OPERATIONS: true,

  // null = وصول لجميع الكيانات (للمدراء فقط)
  NULL_MEANS_ALL_ACCESS: true,

  // منع التغيير اليدوي للسياق للمستخدمين العاديين
  RESTRICT_CONTEXT_OVERRIDE: true,

  // الأدوار المسموح لها بتجاوز القيود
  OVERRIDE_ALLOWED_ROLES: ['owner', 'admin', 'manager'] as const,
} as const;