export interface ErrorMessage {
  ar: string
  en: string
}

export interface ErrorMessages {
  [key: string]: ErrorMessage
}

export const commonErrorMessages: ErrorMessages = {
  // Network and API errors
  NETWORK_ERROR: {
    ar: 'فشل الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت والمحاولة مرة أخرى.',
    en: 'Failed to connect to server. Please check your internet connection and try again.'
  },
  
  SERVER_ERROR: {
    ar: 'حدث خطأ في الخادم. فريقنا يعمل على حل المشكلة.',
    en: 'Server error occurred. Our team is working to resolve the issue.'
  },
  
  TIMEOUT_ERROR: {
    ar: 'انتهت مهلة الطلب. يرجى المحاولة مرة أخرى.',
    en: 'Request timeout. Please try again.'
  },
  
  // Authentication and authorization
  UNAUTHORIZED: {
    ar: 'غير مصرح لك بالوصول إلى هذا المورد.',
    en: 'You are not authorized to access this resource.'
  },

  FORBIDDEN: {
    ar: 'ليس لديك الصلاحيات اللازمة لهذا الإجراء.',
    en: 'You do not have the required permissions for this action.'
  },

  SESSION_EXPIRED: {
    ar: 'انتهت جلسة العمل. يرجى تسجيل الدخول مرة أخرى.',
    en: 'Session expired. Please log in again.'
  },

  // 🔐 RLS Permission Errors - with contact guidance
  RLS_INVENTORY_TRANSFER: {
    ar: 'ليس لديك صلاحية إنشاء تحويلات المخزون. يرجى التواصل مع المدير (Manager) أو مسؤول النظام (Admin) لتنفيذ هذا الإجراء.',
    en: 'You do not have permission to create inventory transfers. Please contact the Manager or Admin to perform this action.'
  },

  RLS_INVOICE_CREATE: {
    ar: 'ليس لديك صلاحية إنشاء الفواتير. يرجى التواصل مع المدير (Manager) أو المحاسب (Accountant) لتنفيذ هذا الإجراء.',
    en: 'You do not have permission to create invoices. Please contact the Manager or Accountant to perform this action.'
  },

  RLS_PAYMENT_CREATE: {
    ar: 'ليس لديك صلاحية تسجيل المدفوعات. يرجى التواصل مع المحاسب (Accountant) أو المدير (Manager) لتنفيذ هذا الإجراء.',
    en: 'You do not have permission to record payments. Please contact the Accountant or Manager to perform this action.'
  },

  RLS_JOURNAL_ENTRY: {
    ar: 'ليس لديك صلاحية إنشاء القيود المحاسبية. يرجى التواصل مع المحاسب (Accountant) لتنفيذ هذا الإجراء.',
    en: 'You do not have permission to create journal entries. Please contact the Accountant to perform this action.'
  },

  RLS_PRODUCT_CREATE: {
    ar: 'ليس لديك صلاحية إضافة المنتجات. يرجى التواصل مع المدير (Manager) أو مسؤول المخزن (Warehouse Keeper) لتنفيذ هذا الإجراء.',
    en: 'You do not have permission to add products. Please contact the Manager or Warehouse Keeper to perform this action.'
  },

  RLS_GENERIC: {
    ar: 'ليس لديك صلاحية لتنفيذ هذا الإجراء. يرجى التواصل مع المدير أو مسؤول النظام.',
    en: 'You do not have permission to perform this action. Please contact the Manager or Admin.'
  },
  
  // Data validation errors
  INVALID_INPUT: {
    ar: 'البيانات المدخلة غير صحيحة. يرجى التحقق والمحاولة مرة أخرى.',
    en: 'Invalid input data. Please check and try again.'
  },
  
  REQUIRED_FIELD: {
    ar: 'هذا الحقل مطلوب.',
    en: 'This field is required.'
  },
  
  INVALID_EMAIL: {
    ar: 'صيغة البريد الإلكتروني غير صحيحة.',
    en: 'Invalid email format.'
  },
  
  INVALID_PHONE: {
    ar: 'صيغة رقم الهاتف غير صحيحة.',
    en: 'Invalid phone number format.'
  },
  
  INVALID_PRICE: {
    ar: 'السعر المدخل غير صحيح.',
    en: 'Invalid price entered.'
  },
  
  INVALID_QUANTITY: {
    ar: 'الكمية المدخلة غير صحيحة.',
    en: 'Invalid quantity entered.'
  },
  
  // Business logic errors
  INSUFFICIENT_STOCK: {
    ar: 'الكمية المطلوبة غير متوفرة في المخزون.',
    en: 'Requested quantity is not available in stock.'
  },
  
  DUPLICATE_ENTRY: {
    ar: 'هذا السجل موجود مسبقًا.',
    en: 'This entry already exists.'
  },
  
  RECORD_NOT_FOUND: {
    ar: 'السجل المطلوب غير موجود.',
    en: 'The requested record was not found.'
  },
  
  // File and upload errors
  FILE_TOO_LARGE: {
    ar: 'حجم الملف كبير جدًا. يرجى اختيار ملف أصغر.',
    en: 'File size is too large. Please choose a smaller file.'
  },
  
  INVALID_FILE_TYPE: {
    ar: 'نوع الملف غير مدعوم.',
    en: 'File type is not supported.'
  },
  
  UPLOAD_FAILED: {
    ar: 'فشل تحميل الملف. يرجى المحاولة مرة أخرى.',
    en: 'File upload failed. Please try again.'
  },
  
  // General errors
  UNEXPECTED_ERROR: {
    ar: 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.',
    en: 'An unexpected error occurred. Please try again.'
  },
  
  OPERATION_FAILED: {
    ar: 'فشلت العملية. يرجى المحاولة مرة أخرى.',
    en: 'Operation failed. Please try again.'
  },
  
  OPERATION_SUCCESSFUL: {
    ar: 'تمت العملية بنجاح.',
    en: 'Operation completed successfully.'
  },
  
  // Loading and processing
  LOADING: {
    ar: 'جاري التحميل...',
    en: 'Loading...'
  },
  
  PROCESSING: {
    ar: 'جاري المعالجة...',
    en: 'Processing...'
  },
  
  SAVING: {
    ar: 'جاري الحفظ...',
    en: 'Saving...'
  },
  
  DELETING: {
    ar: 'جاري الحذف...',
    en: 'Deleting...'
  }
}

export const getErrorMessage = (errorKey: string, lang: 'ar' | 'en' = 'ar'): string => {
  const message = commonErrorMessages[errorKey]
  return message ? message[lang] : commonErrorMessages.UNEXPECTED_ERROR[lang]
}

export const formatSupabaseError = (
  error: {
    message?: string | null
    details?: string | null
    hint?: string | null
    code?: string | null
  } | null | undefined,
  lang: 'ar' | 'en' = 'ar'
): string => {
  if (!error) return getErrorMessage('UNEXPECTED_ERROR', lang)

  const parts = [error.message, error.details, error.hint]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)

  const uniqueParts = parts.filter((part, index) => parts.indexOf(part) === index)
  const message = uniqueParts.join(' | ')

  if (!message) {
    return error.code
      ? `${getErrorMessage('OPERATION_FAILED', lang)} (${error.code})`
      : getErrorMessage('OPERATION_FAILED', lang)
  }

  return error.code && !message.includes(error.code)
    ? `${message} (${error.code})`
    : message
}

export const formatValidationError = (field: string, errorType: string, lang: 'ar' | 'en' = 'ar'): string => {
  const fieldNames = {
    ar: {
      email: 'البريد الإلكتروني',
      phone: 'رقم الهاتف',
      price: 'السعر',
      quantity: 'الكمية',
      name: 'الاسم',
      description: 'الوصف',
      total: 'المجموع',
      amount: 'المبلغ',
      date: 'التاريخ',
      customer: 'العميل',
      supplier: 'المورد',
      product: 'المنتج',
      invoice: 'الفاتورة',
      bill: 'الفاتورة'
    },
    en: {
      email: 'email',
      phone: 'phone number',
      price: 'price',
      quantity: 'quantity',
      name: 'name',
      description: 'description',
      total: 'total',
      amount: 'amount',
      date: 'date',
      customer: 'customer',
      supplier: 'supplier',
      product: 'product',
      invoice: 'invoice',
      bill: 'bill'
    }
  }

  const fieldName = fieldNames[lang][field as keyof typeof fieldNames.ar] || field
  
  if (errorType === 'required') {
    return lang === 'ar' ? `${fieldName} مطلوب` : `${fieldName} is required`
  }
  
  if (errorType === 'invalid') {
    return lang === 'ar' ? `${fieldName} غير صحيح` : `Invalid ${fieldName}`
  }

  return getErrorMessage('INVALID_INPUT', lang)
}

/**
 * 🔐 Check if error is RLS (Row Level Security) permission error
 */
export const isRLSError = (error: any): boolean => {
  if (!error) return false
  return error?.code === '42501' ||
         error?.message?.includes('row-level security') ||
         error?.message?.includes('violates row-level security policy')
}

/**
 * 🔐 Get appropriate RLS error message based on the table/operation
 * @param tableName - The table that caused the RLS error
 * @param lang - Language ('ar' or 'en')
 * @returns Formatted error message with contact guidance
 */
export const getRLSErrorMessage = (tableName: string, lang: 'ar' | 'en' = 'ar'): { title: string; description: string } => {
  const tableToErrorKey: Record<string, string> = {
    'inventory_transfers': 'RLS_INVENTORY_TRANSFER',
    'inventory_transfer_items': 'RLS_INVENTORY_TRANSFER',
    'invoices': 'RLS_INVOICE_CREATE',
    'invoice_items': 'RLS_INVOICE_CREATE',
    'payments': 'RLS_PAYMENT_CREATE',
    'journal_entries': 'RLS_JOURNAL_ENTRY',
    'journal_entry_lines': 'RLS_JOURNAL_ENTRY',
    'products': 'RLS_PRODUCT_CREATE',
  }

  const errorKey = tableToErrorKey[tableName] || 'RLS_GENERIC'
  const message = commonErrorMessages[errorKey]

  return {
    title: lang === 'ar' ? 'غير مصرح لك' : 'Permission Denied',
    description: message ? message[lang] : commonErrorMessages.RLS_GENERIC[lang]
  }
}

/**
 * 🔐 Handle Supabase error and return appropriate message
 * Automatically detects RLS errors and provides helpful guidance
 */
export const handleSupabaseError = (
  error: any,
  tableName: string,
  lang: 'ar' | 'en' = 'ar',
  defaultErrorKey: string = 'OPERATION_FAILED'
): { title: string; description: string; isRLS: boolean } => {
  if (isRLSError(error)) {
    return {
      ...getRLSErrorMessage(tableName, lang),
      isRLS: true
    }
  }

  return {
    title: lang === 'ar' ? 'خطأ' : 'Error',
    description: getErrorMessage(defaultErrorKey, lang),
    isRLS: false
  }
}

export default commonErrorMessages
