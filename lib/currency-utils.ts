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
 * سجلُّ سعةِ الدفترِ — يُضافُ إليه ولا يُعدَّلُ ما مضى:
 *
 *   • v3.75.75 (2026-08-20): الدفترُ يحفظُ **خانتين** (`journal_entry_lines`
 *     بمقياسِ 2)، فالعملاتُ ذاتُ الثلاثِ خاناتٍ أو بلا خانات معروضةٌ مقفولةً
 *     على شاشةِ التسجيلِ حتى يتّسعَ الدفتر.
 *   • v3.75.76 (2026-08-21): اتّسعَ الدفترُ إلى **أربعِ خانات** بتوسيعِ 226
 *     عمودَ مالٍ فى 77 جدولاً، فارتفعَ القفلُ عن العملاتِ كلِّها — لا بقرارٍ
 *     يُكتَبُ باليد، بل لأنَّ القائمةَ تُقاسُ بسعةِ الدفترِ فصارت فارغةً من
 *     نفسِها.
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
 * v3.75.76 — **سعةُ الدفترِ رقمٌ واحدٌ يُقرَأُ هنا**.
 *
 * عددُ الخاناتِ العشريّةِ التى يحفظُها عمودُ المدينِ فى `journal_entry_lines`
 * فعلاً. كان اثنتَين، وصارَ أربعاً فى هذه الدفعةِ بعدَ توسيعِ 226 عمودَ مالٍ.
 *
 * ولا يُكتَبُ هنا رقمٌ لا يُطابقُ القاعدة: حارسُ
 * `check-the-ledger-is-as-wide-as-the-currency.js` يقرأُ المقياسَ من لقطةِ
 * المخطَّطِ ويرفضُ البناءَ إن خالفَه هذا الثابت — فالكذبُ هنا لا يعيشُ إصداراً.
 */
export const LEDGER_DECIMAL_PLACES = 4

/**
 * العملاتُ التى لا يتّسعُ لها الدفترُ — **محسوبةٌ لا مكتوبةٌ باليد، ومقيسةٌ
 * بسعةِ الدفترِ لا برقمٍ ثابت**.
 *
 * كانت تُحسَبُ (v3.75.75) بأنَّ خاناتِ العملةِ «ليست اثنتين»، وذلك كان دقيقاً
 * ما دامَ الدفترُ يحفظُ خانتين — لكنّه خلطَ مسألتين: الينُّ اليابانىُّ بلا
 * خاناتٍ كان يُقفَلُ بلا سبب، فالصفرُ يتّسعُ له دفترٌ ذو خانتين بلا أىِّ فقد.
 *
 * والقانونُ الصحيحُ واحد: **العملةُ غيرُ مخدومةٍ إذا كانت خاناتُها أكثرَ ممّا
 * يحفظُه الدفتر**. وبهذا لا يبقى بابٌ يُفتَحُ باليد ولا قفلٌ يُنسى: يتّسعُ
 * الدفترُ فيرتفعُ القفلُ من نفسِه، وتظهرُ عملةٌ أوسعُ فينزلُ القفلُ من نفسِه.
 *
 * وهى اليومَ **فارغة**: أوسعُ عملةٍ يعرضُها المشروعُ ثلاثُ خانات، والدفترُ
 * يحفظُ أربعاً.
 */
export const CURRENCIES_NOT_YET_SERVICEABLE: readonly string[] = Object.entries(CURRENCIES)
  .filter(([, v]) => v.decimals > LEDGER_DECIMAL_PLACES)
  .map(([code]) => code)

/**
 * v3.75.77 — **بيتُ التقريبِ الواحدُ فى التطبيق**، وأخوه فى القاعدة
 * `erp_round_money`.
 *
 * كم خانةً تُحفَظُ لهذه العملة؟ الجوابُ من الجردِ المحكومِ أعلاه (المطابَقِ
 * بالمعيارِ الدولىِّ وببذرةِ القاعدةِ فى كلِّ إصدار)، **لا من رقمٍ مكتوبٍ فى
 * موضعِ الاستعمال**، ولا يزيدُ أبداً عمّا يتّسعُ له الدفتر.
 *
 * ويصرخُ إن سُئلَ عن عملةٍ لا يعرفُها ولا يرتدُّ إلى اثنتين — فالارتدادُ
 * الصامتُ هو بعينِه ما جعلَ الدينارَ الكويتىَّ يُقَصُّ إلى خانتَين سنواتٍ
 * وأحدٌ لا يرى.
 */
export function moneyDecimals(currencyCode: string): number {
  const code = (currencyCode || '').trim().toUpperCase()
  const curr = CURRENCIES[code]
  if (!curr) {
    throw new Error(
      `CURRENCY_DECIMALS_UNKNOWN: لا أعرفُ عددَ خاناتِ [${code || '—'}]. ` +
        `تُضافُ العملةُ إلى جردِ CURRENCIES بعددِ وحدتِها الصغرى من ISO 4217 — ولا يُفترَضُ لها رقم.`
    )
  }
  return Math.min(curr.decimals, LEDGER_DECIMAL_PLACES)
}

/**
 * v3.75.77 — يُقرِّبُ مبلغاً بعددِ خاناتِ **عملتِه**.
 *
 * والصيغةُ هى الصيغةُ القائمةُ فى المشروعِ حرفاً بحرف
 * (`Math.round(v * 10^d) / 10^d`)، فلكلِّ عملةٍ بخانتَين — وهى كلُّ عملةٍ فى
 * الإنتاجِ اليوم — **لا يتغيَّرُ رقمٌ واحد**. التغييرُ الوحيدُ يقعُ لعملةٍ
 * خاناتُها ليست اثنتين، وهو الدواءُ المقصودُ لا أثرٌ جانبىّ.
 *
 * ولا يُصلَحُ هنا انحرافُ الفاصلةِ العائمةِ المعروف (مثل 1.005 التى تُقرَّبُ
 * إلى 1.00 لأنَّ 1.005×100 تساوى 100.49999… فى الثنائىّ): إصلاحُه **يُغيِّرُ
 * أرقاماً قائمة**، فهو دفعةٌ مستقلّةٌ تُقاسُ بذاتِها ولا تُهرَّبُ داخلَ هذه.
 */
export function roundMoney(value: number, currencyCode: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value
  const factor = Math.pow(10, moneyDecimals(currencyCode))
  return Math.round(value * factor) / factor
}

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

