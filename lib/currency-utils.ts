/**
 * ERB Currency Utilities
 * Professional currency handling for the application
 */

// Currency definitions with symbols and names
export const CURRENCIES: Record<string, { symbol: string; nameEn: string; nameAr: string; decimals: number }> = {
  EGP: { symbol: '£', nameEn: 'Egyptian Pound', nameAr: 'الجنيه المصري', decimals: 2 },
  USD: { symbol: '$', nameEn: 'US Dollar', nameAr: 'الدولار الأمريكي', decimals: 2 },
  EUR: { symbol: '€', nameEn: 'Euro', nameAr: 'اليورو', decimals: 2 },
  GBP: { symbol: '£', nameEn: 'British Pound', nameAr: 'الجنيه الإسترليني', decimals: 2 },
  SAR: { symbol: '﷼', nameEn: 'Saudi Riyal', nameAr: 'الريال السعودي', decimals: 2 },
  AED: { symbol: 'د.إ', nameEn: 'UAE Dirham', nameAr: 'الدرهم الإماراتي', decimals: 2 },
  KWD: { symbol: 'د.ك', nameEn: 'Kuwaiti Dinar', nameAr: 'الدينار الكويتي', decimals: 3 },
  QAR: { symbol: '﷼', nameEn: 'Qatari Riyal', nameAr: 'الريال القطري', decimals: 2 },
  BHD: { symbol: 'د.ب', nameEn: 'Bahraini Dinar', nameAr: 'الدينار البحريني', decimals: 3 },
  OMR: { symbol: '﷼', nameEn: 'Omani Rial', nameAr: 'الريال العماني', decimals: 3 },
  JOD: { symbol: 'د.أ', nameEn: 'Jordanian Dinar', nameAr: 'الدينار الأردني', decimals: 3 },
  LBP: { symbol: 'ل.ل', nameEn: 'Lebanese Pound', nameAr: 'الليرة اللبنانية', decimals: 0 },
}

/**
 * Get the current app currency from localStorage or cookie
 */
export function getAppCurrency(): string {
  if (typeof window === 'undefined') return 'EGP'
  try {
    return localStorage.getItem('app_currency') || 'EGP'
  } catch {
    return 'EGP'
  }
}

/**
 * Get currency symbol by code
 */
export function getCurrencySymbol(code: string): string {
  return CURRENCIES[code]?.symbol || code
}

/**
 * Get currency name by code and language
 */
export function getCurrencyName(code: string, lang: 'en' | 'ar' = 'ar'): string {
  const curr = CURRENCIES[code]
  if (!curr) return code
  return lang === 'en' ? curr.nameEn : curr.nameAr
}

/**
 * Format amount with currency
 */
export function formatCurrency(
  amount: number,
  currencyCode: string = 'EGP',
  lang: 'en' | 'ar' = 'ar',
  showSymbol: boolean = true
): string {
  const curr = CURRENCIES[currencyCode] || CURRENCIES.EGP
  const locale = lang === 'en' ? 'en-EG' : 'ar-EG'
  
  try {
    const formatted = new Intl.NumberFormat(locale, {
      minimumFractionDigits: curr.decimals,
      maximumFractionDigits: curr.decimals,
    }).format(amount)
    
    if (showSymbol) {
      return lang === 'en' 
        ? `${curr.symbol} ${formatted}` 
        : `${formatted} ${curr.symbol}`
    }
    return formatted
  } catch {
    return `${amount.toFixed(curr.decimals)} ${showSymbol ? curr.symbol : ''}`
  }
}

/**
 * Format amount with currency code (e.g., "1,000.00 EGP")
 */
export function formatWithCode(
  amount: number,
  currencyCode: string = 'EGP',
  lang: 'en' | 'ar' = 'ar'
): string {
  const curr = CURRENCIES[currencyCode] || CURRENCIES.EGP
  const locale = lang === 'en' ? 'en-EG' : 'ar-EG'
  
  try {
    const formatted = new Intl.NumberFormat(locale, {
      minimumFractionDigits: curr.decimals,
      maximumFractionDigits: curr.decimals,
    }).format(amount)
    
    return `${formatted} ${currencyCode}`
  } catch {
    return `${amount.toFixed(curr.decimals)} ${currencyCode}`
  }
}

