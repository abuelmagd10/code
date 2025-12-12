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