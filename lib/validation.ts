// Enhanced validation utilities for phone, email, and prices

export interface ValidationResult {
  isValid: boolean
  error?: string
  errorAr?: string
}

// Email validation with comprehensive regex
export function validateEmail(email: string): ValidationResult {
  if (!email) {
    return {
      isValid: false,
      error: 'Email is required',
      errorAr: 'البريد الإلكتروني مطلوب'
    }
  }

  // Comprehensive email regex that handles most valid email formats
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
  
  if (!emailRegex.test(email)) {
    return {
      isValid: false,
      error: 'Please enter a valid email address',
      errorAr: 'يرجى إدخال بريد إلكتروني صحيح'
    }
  }

  // Additional checks for common invalid patterns
  if (email.length > 254) {
    return {
      isValid: false,
      error: 'Email is too long (maximum 254 characters)',
      errorAr: 'البريد الإلكتروني طويل جداً (الحد الأقصى 254 حرف)'
    }
  }

  if (email.includes('..') || email.startsWith('.') || email.endsWith('.')) {
    return {
      isValid: false,
      error: 'Email cannot contain consecutive dots or start/end with a dot',
      errorAr: 'البريد الإلكتروني لا يمكن أن يحتوي على نقاط متتالية أو يبدأ/ينتهي بنقطة'
    }
  }

  return { isValid: true }
}

// Enhanced phone validation for Egyptian and international numbers
export function validatePhone(phone: string, country: string = 'EG'): ValidationResult {
  if (!phone) {
    return {
      isValid: false,
      error: 'Phone number is required',
      errorAr: 'رقم الهاتف مطلوب'
    }
  }

  // Normalize phone number (remove spaces, dashes, parentheses)
  const normalized = phone.replace(/[\s\-\(\)\+]/g, '')

  // Convert Arabic and Hindi numerals to English
  const arabicNums = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩']
  const hindiNums = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']
  
  let converted = normalized
  arabicNums.forEach((num, idx) => {
    converted = converted.replace(new RegExp(num, 'g'), String(idx))
  })
  hindiNums.forEach((num, idx) => {
    converted = converted.replace(new RegExp(num, 'g'), String(idx))
  })

  // Check if contains only digits after conversion
  if (!/^\d+$/.test(converted)) {
    return {
      isValid: false,
      error: 'Phone number must contain only digits',
      errorAr: 'رقم الهاتف يجب أن يحتوي على أرقام فقط'
    }
  }

  // Country-specific validation
  if (country === 'EG') {
    // Egyptian phone validation
    // Mobile: 010, 011, 012, 015 (11 digits total)
    // Landline: 0[2-9]xxxxxxxxx (11 digits total)
    const egyptianMobileRegex = /^(?:010|011|012|015)\d{8}$/
    const egyptianLandlineRegex = /^(?:0[2-9])\d{8}$/
    
    if (converted.length === 11) {
      if (egyptianMobileRegex.test(converted) || egyptianLandlineRegex.test(converted)) {
        return { isValid: true }
      }
    } else if (converted.length === 10 && converted.startsWith('1')) {
      // Handle case where user forgot the leading 0
      const withZero = '0' + converted
      if (egyptianMobileRegex.test(withZero) || egyptianLandlineRegex.test(withZero)) {
        return { isValid: true }
      }
    } else if (converted.length === 12 && converted.startsWith('2')) {
      // Handle case with country code +20
      const localFormat = '0' + converted.substring(1)
      if (egyptianMobileRegex.test(localFormat) || egyptianLandlineRegex.test(localFormat)) {
        return { isValid: true }
      }
    }

    return {
      isValid: false,
      error: 'Please enter a valid Egyptian phone number (11 digits)',
      errorAr: 'يرجى إدخال رقم هاتف مصري صحيح (11 رقم)'
    }
  } else {
    // International phone validation
    if (converted.length < 8 || converted.length > 15) {
      return {
        isValid: false,
        error: 'Phone number must be between 8 and 15 digits',
        errorAr: 'رقم الهاتف يجب أن يكون بين 8 و 15 رقم'
      }
    }
    return { isValid: true }
  }
}

// Price validation with currency support
export function validatePrice(price: string | number, min: number = 0, max?: number): ValidationResult {
  if (price === '' || price === null || price === undefined) {
    return {
      isValid: false,
      error: 'Price is required',
      errorAr: 'السعر مطلوب'
    }
  }

  const numPrice = typeof price === 'string' ? parseFloat(price) : price

  if (isNaN(numPrice)) {
    return {
      isValid: false,
      error: 'Price must be a valid number',
      errorAr: 'السعر يجب أن يكون رقماً صحيحاً'
    }
  }

  if (numPrice < min) {
    return {
      isValid: false,
      error: `Price must be at least ${min}`,
      errorAr: `السعر يجب أن يكون على الأقل ${min}`
    }
  }

  if (max !== undefined && numPrice > max) {
    return {
      isValid: false,
      error: `Price must not exceed ${max}`,
      errorAr: `السعر يجب ألا يتجاوز ${max}`
    }
  }

  // Check for reasonable decimal places (max 4)
  const decimalPlaces = price.toString().split('.')[1]?.length || 0
  if (decimalPlaces > 4) {
    return {
      isValid: false,
      error: 'Price can have maximum 4 decimal places',
      errorAr: 'السعر يمكن أن يحتوي على 4 منازل عشرية كحد أقصى'
    }
  }

  return { isValid: true }
}

// Quantity validation
export function validateQuantity(quantity: string | number, allowZero: boolean = false): ValidationResult {
  if (quantity === '' || quantity === null || quantity === undefined) {
    return {
      isValid: false,
      error: 'Quantity is required',
      errorAr: 'الكمية مطلوبة'
    }
  }

  const numQuantity = typeof quantity === 'string' ? parseFloat(quantity) : quantity

  if (isNaN(numQuantity)) {
    return {
      isValid: false,
      error: 'Quantity must be a valid number',
      errorAr: 'الكمية يجب أن تكون رقماً صحيحاً'
    }
  }

  if (!allowZero && numQuantity <= 0) {
    return {
      isValid: false,
      error: 'Quantity must be greater than 0',
      errorAr: 'الكمية يجب أن تكون أكبر من 0'
    }
  }

  if (numQuantity < 0) {
    return {
      isValid: false,
      error: 'Quantity cannot be negative',
      errorAr: 'الكمية لا يمكن أن تكون سالبة'
    }
  }

  // Check for reasonable decimal places (max 3)
  const decimalPlaces = quantity.toString().split('.')[1]?.length || 0
  if (decimalPlaces > 3) {
    return {
      isValid: false,
      error: 'Quantity can have maximum 3 decimal places',
      errorAr: 'الكمية يمكن أن تحتوي على 3 منازل عشرية كحد أقصى'
    }
  }

  return { isValid: true }
}

// Tax ID validation for Egyptian tax IDs
export function validateTaxID(taxId: string): ValidationResult {
  if (!taxId) {
    return {
      isValid: false,
      error: 'Tax ID is required',
      errorAr: 'الرقم الضريبي مطلوب'
    }
  }

  // Remove spaces and dashes
  const cleanTaxId = taxId.replace(/[\s\-]/g, '')

  // Egyptian Tax ID validation (should be 9 digits)
  if (!/^\d{9}$/.test(cleanTaxId)) {
    return {
      isValid: false,
      error: 'Tax ID must be exactly 9 digits',
      errorAr: 'الرقم الضريبي يجب أن يكون 9 أرقام'
    }
  }

  return { isValid: true }
}

// Credit limit validation
export function validateCreditLimit(limit: string | number): ValidationResult {
  return validatePrice(limit, 0) // Credit limit can be 0 or positive
}

// Payment terms validation
export function validatePaymentTerms(terms: string): ValidationResult {
  if (!terms) {
    return {
      isValid: false,
      error: 'Payment terms are required',
      errorAr: 'شروط الدفع مطلوبة'
    }
  }

  // Common payment terms patterns
  const validPatterns = [
    /^Net \d+$/i,           // Net 30, Net 60, etc.
    /^\d+ days?$/i,        // 30 days, 60 days, etc.
    /^COD$/i,               // Cash on Delivery
    /^Cash$/i,              // Cash
    /^Immediate$/i,         // Immediate payment
    /^Upon receipt$/i        // Upon receipt
  ]

  const isValidPattern = validPatterns.some(pattern => pattern.test(terms))
  
  if (!isValidPattern) {
    return {
      isValid: false,
      error: 'Please enter valid payment terms (e.g., Net 30, 30 days, COD)',
      errorAr: 'يرجى إدخال شروط دفع صحيحة (مثال: Net 30، 30 يوم، COD)'
    }
  }

  return { isValid: true }
}

// Helper function to get error message in preferred language
export function getValidationError(result: ValidationResult, lang: 'en' | 'ar' = 'ar'): string | undefined {
  if (result.isValid) return undefined
  return lang === 'en' ? result.error : result.errorAr
}