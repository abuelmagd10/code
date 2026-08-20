/**
 * ERB Currency Utilities
 * Professional currency handling for the application
 */

import { readAppCurrency } from './currency-service'

// Currency definitions with symbols and names
/**
 * v3.75.75 — «وعددُ الخاناتِ يُقرَأُ ولا يُفترَض».
 *
 * هذا الجردُ كان يحملُ اثنتَى عشرةَ عملةً بينما شاشةُ التسجيلِ تعرضُ أربعاً
 * وعشرين — فكلُّ عملةٍ خارجَه كانت تُنسَّقُ بجردِ الجنيهِ المصرىِّ (رمزُه
 * وخاناتُه) لأنَّ `formatCurrency` ترتدُّ إلى `CURRENCIES.EGP` عندَ الغياب.
 * فاكتملَ الجردُ ليُغطّىَ كلَّ عملةٍ يعرضُها المشروعُ على عميل.
 *
 * وعددُ الخاناتِ منقولٌ من المعيارِ الدولىِّ ISO 4217 (الوحدةُ الصغرى)، لا
 * من تقدير. وصُحِّحَ به خطأٌ قائم: الليرةُ اللبنانيّةُ كانت مكتوبةً هنا بلا
 * خانات (0) والمعيارُ يقولُ خانتان (2) — وهو أوّلُ دليلٍ على أنَّ جردَين
 * مكتوبَينِ باليدِ يتناقضانِ حتماً؛ ولذلك صارَ للقاعدةِ بيتُها الواحد
 * (`public.currency_minor_units` و`erp_currency_decimals`) وحارسٌ يُطابقُ
 * هذا الجردَ بالمعيارِ وبالقاعدةِ فى كلِّ إصدار.
 *
 * تنبيه: هذا الجردُ اليومَ **للعرضِ والتنسيقِ فقط**. الدفترُ نفسُه لا يتّسعُ
 * بعدُ لأكثرَ من خانتين (`journal_entry_lines` بمقياسِ 2)، فالعملاتُ ذاتُ
 * الثلاثِ خاناتٍ أو بلا خانات **معروضةٌ مقفولةً** على شاشةِ التسجيلِ حتى
 * يتّسعَ الدفتر — والحارسُ يقرأُ سعةَ الدفترِ من لقطةِ القاعدةِ ويفرضُ
 * القفلَ ما دامت ضيّقة، ويفرضُ رفعَه فورَ أن تتّسع.
 */
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
  LBP: { symbol: 'ل.ل', nameEn: 'Lebanese Pound', nameAr: 'الليرة اللبنانية', decimals: 2 },
  MAD: { symbol: 'د.م', nameEn: 'Moroccan Dirham', nameAr: 'الدرهم المغربي', decimals: 2 },
  TND: { symbol: 'د.ت', nameEn: 'Tunisian Dinar', nameAr: 'الدينار التونسي', decimals: 3 },
  DZD: { symbol: 'د.ج', nameEn: 'Algerian Dinar', nameAr: 'الدينار الجزائري', decimals: 2 },
  IQD: { symbol: 'د.ع', nameEn: 'Iraqi Dinar', nameAr: 'الدينار العراقي', decimals: 3 },
  SYP: { symbol: 'ل.س', nameEn: 'Syrian Pound', nameAr: 'الليرة السورية', decimals: 2 },
  YER: { symbol: '﷼', nameEn: 'Yemeni Rial', nameAr: 'الريال اليمني', decimals: 2 },
  SDG: { symbol: 'ج.س', nameEn: 'Sudanese Pound', nameAr: 'الجنيه السوداني', decimals: 2 },
  LYD: { symbol: 'ل.د', nameEn: 'Libyan Dinar', nameAr: 'الدينار الليبي', decimals: 3 },
  TRY: { symbol: '₺', nameEn: 'Turkish Lira', nameAr: 'الليرة التركية', decimals: 2 },
  INR: { symbol: '₹', nameEn: 'Indian Rupee', nameAr: 'الروبية الهندية', decimals: 2 },
  CNY: { symbol: '¥', nameEn: 'Chinese Yuan', nameAr: 'اليوان الصيني', decimals: 2 },
  JPY: { symbol: '¥', nameEn: 'Japanese Yen', nameAr: 'الين الياباني', decimals: 0 },
}

/**
 * العملاتُ التى لا يتّسعُ لها الدفترُ اليومَ — **محسوبةٌ لا مكتوبةٌ باليد**.
 *
 * الدفترُ يحفظُ خانتين، فكلُّ عملةٍ عددُ خاناتِها ليس اثنتين لا يستطيعُ
 * النظامُ حفظَ مبالغِها بلا قصٍّ أو اختراع. تُشتَقُّ القائمةُ من الجردِ
 * أعلاه، فإن صُحِّحَ عددُ خاناتِ عملةٍ تبعَتْها القائمةُ من نفسِها، ولا يبقى
 * جردٌ ثانٍ يُنسى تحديثُه.
 *
 * تُرفَعُ هذه القائمةُ كلُّها (فتصيرُ فارغة) فى الدفعةِ التى يتّسعُ فيها
 * الدفترُ فعلاً — والحارسُ يفرضُ ذلك ولا يتركُه للذاكرة.
 */
export const CURRENCIES_NOT_YET_SERVICEABLE: readonly string[] = Object.entries(CURRENCIES)
  .filter(([, v]) => v.decimals !== 2)
  .map(([code]) => code)

/**
 * Get the current app currency from localStorage or cookie
 *
 * v3.75.66 — **وسؤالُ الاسمِ ليس سؤالَ الباب**: هذه الدالّةُ لم تعُدْ تقرأُ
 * الجيبَ بنفسِها، بل تنادى **بيتَ الشاشةِ الواحد** `readAppCurrency()` من
 * `lib/currency-service.ts` — **ولا يُبنى بيتٌ ثانٍ**. وتُبقى على عقدِها
 * القديمِ مع مستدعيها (الرجوعُ إلى `'EGP'` عندَ الغياب) إلى أن تُحوَّلَ
 * الشاشاتُ نفسُها لنداءِ البيتِ مباشرةً (v3.75.66 الدفعةُ الثانية).
 */
export function getAppCurrency(): string {
  return readAppCurrency() || 'EGP'
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

