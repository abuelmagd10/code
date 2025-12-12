/**
 * Phone number normalization utilities for handling Arabic and international phone numbers
 */

/**
 * Normalize phone number by converting Arabic/Hindi numerals to English and removing formatting
 * @param phone - The phone number to normalize
 * @returns Normalized phone number string
 */
export function normalizePhone(phone: string): string {
  if (!phone) return ''

  // Convert Arabic numerals (٠-٩) to English
  const arabicNums = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩']
  let normalized = phone
  arabicNums.forEach((num, idx) => {
    normalized = normalized.replace(new RegExp(num, 'g'), String(idx))
  })

  // Convert Hindi numerals (۰-۹) to English
  const hindiNums = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']
  hindiNums.forEach((num, idx) => {
    normalized = normalized.replace(new RegExp(num, 'g'), String(idx))
  })

  // Remove all spaces and non-numeric characters except + at the beginning
  normalized = normalized.replace(/[\s\-\(\)]/g, '')

  // Handle Egyptian phone number formats
  if (normalized.startsWith('002')) {
    normalized = normalized.substring(3)
  } else if (normalized.startsWith('02') && normalized.length > 10) {
    normalized = normalized.substring(2)
  } else if (normalized.startsWith('2') && normalized.length === 12) {
    normalized = normalized.substring(1)
  }

  // Ensure Egyptian numbers start with 0
  if (normalized.length === 10 && normalized.startsWith('1')) {
    normalized = '0' + normalized
  }

  return normalized
}

/**
 * Format phone number for display
 * @param phone - The phone number to format
 * @param country - The country code (default: 'EG')
 * @returns Formatted phone number string
 */
export function formatPhone(phone: string, country: string = 'EG'): string {
  const normalized = normalizePhone(phone)
  
  if (!normalized) return ''
  
  // Egyptian phone formatting
  if (country === 'EG') {
    if (normalized.startsWith('01') && normalized.length === 11) {
      // Mobile: 01X-XXXX-XXXX
      return `${normalized.slice(0, 3)}-${normalized.slice(3, 7)}-${normalized.slice(7)}`
    } else if (normalized.startsWith('0') && normalized.length === 10) {
      // Landline: 0X-XXXX-XXXX
      return `${normalized.slice(0, 2)}-${normalized.slice(2, 6)}-${normalized.slice(6)}`
    } else if (normalized.startsWith('2') && normalized.length === 8) {
      // Cairo landline without leading 0: 2-XXXX-XXXX
      return `${normalized.slice(0, 1)}-${normalized.slice(1, 5)}-${normalized.slice(5)}`
    }
  }
  
  // International format with country code
  if (normalized.startsWith('+')) {
    return normalized
  }
  
  // Default: return as is
  return normalized
}

/**
 * Validate if a phone number is potentially valid for a given country
 * @param phone - The phone number to validate
 * @param country - The country code (default: 'EG')
 * @returns Object with isValid boolean and message
 */
export function validatePhoneBasic(phone: string, country: string = 'EG'): { isValid: boolean; message: string } {
  const normalized = normalizePhone(phone)
  
  if (!normalized) {
    return { isValid: false, message: 'Phone number is required' }
  }
  
  // Remove leading + for length checks
  const digitsOnly = normalized.replace(/^\+/, '')
  
  if (country === 'EG') {
    // Egyptian mobile numbers: must start with 01 and be 11 digits
    if (normalized.startsWith('01')) {
      if (digitsOnly.length === 11) {
        return { isValid: true, message: 'Valid Egyptian mobile number' }
      } else {
        return { isValid: false, message: 'Egyptian mobile number must be 11 digits' }
      }
    }
    
    // Egyptian landline numbers: must start with 0 and be 10 digits
    if (normalized.startsWith('0')) {
      if (digitsOnly.length === 10) {
        return { isValid: true, message: 'Valid Egyptian landline number' }
      } else {
        return { isValid: false, message: 'Egyptian landline number must be 10 digits' }
      }
    }
    
    return { isValid: false, message: 'Egyptian numbers must start with 0' }
  }
  
  // Generic validation for other countries
  if (digitsOnly.length < 7 || digitsOnly.length > 15) {
    return { isValid: false, message: 'Phone number must be between 7 and 15 digits' }
  }
  
  return { isValid: true, message: 'Valid phone number format' }
}