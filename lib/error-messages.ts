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

export default commonErrorMessages