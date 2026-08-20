/**
 * Currency Synchronization Utility
 * 
 * Ensures invited users always see the company's base currency
 * while allowing owners to customize their display currency.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { getActiveCompanyId } from './company'
import { getBaseCurrency, readAppCurrency } from "@/lib/currency-service"

/**
 * Sync user's display currency with company's base currency
 * 
 * Rules:
 * - Invited users (non-owners): Always use company base currency
 * - Company owners: Can use custom display currency
 * 
 * @param supabase - Supabase client
 * @returns The currency code that should be used
 */
export async function syncUserCurrency(supabase: SupabaseClient): Promise<string> {
  // v3.75.72 — **فالعملةُ الأساسيّةُ لا تُقرَأُ إلا من بيتِها الواحد**:
  // كانت مساراتُ الفشلِ الخمسةُ هنا (لا مستخدمَ · لا شركةَ نشطة · لا صفَّ
  // شركةٍ · إلغاءُ الطلب · أىُّ خطإٍ آخر) كلُّها ترتدُّ إلى 'EGP' حرفاً —
  // وهذه الدالّةُ تعملُ فى **كلِّ تحميلِ صفحةٍ** عبر CurrencySyncProvider
  // المُثبَّتِ على مستوى التطبيقِ كلِّه. فمستخدمٌ مدعوٌّ فى شركةٍ عملتُها
  // الأساسيّةُ ليست جنيهاً، لو حدث عطبٌ عابرٌ فى الشبكةِ، كان يُفرَضُ عليه
  // جنيهٌ مصرىٌّ خطأً بصمت. لا مستدعيًا لهذه الدالّةِ (لا فى هذا الملفّ ولا
  // فى CurrencySyncProvider ولا فى CurrencyMismatchAlert) يستعملُ قيمةَ
  // الإرجاعِ عندَ الفشل — فالصراخُ هنا آمنٌ تماماً: مِن دونِ خسارةِ سلوكٍ
  // كان يُعتمَدُ عليه.
  try {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('لا مستخدمَ مسجَّلَ الدخولِ لمزامنةِ عملتِه')

    // Get active company
    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) throw new Error('لا شركةَ نشطةً للمستخدمِ لمزامنةِ عملتِها')

    // Get company details
    const { data: company } = await supabase
      .from('companies')
      .select('user_id, base_currency')
      .eq('id', companyId)
      .maybeSingle()

    if (!company) throw new Error('لم توجَدْ شركةٌ بهذا الرقمِ لمزامنةِ عملتِها')

    const companyCurrency = await getBaseCurrency(supabase, companyId)
    const isOwner = company.user_id === user.id

    // For invited users, always force company currency
    if (!isOwner) {
      // Update localStorage and cookie
      if (typeof window !== 'undefined') {
        try {
          const currentCurrency = readAppCurrency()
          
          // ✅ إطلاق event فقط إذا تغيرت العملة فعلياً
          if (currentCurrency !== companyCurrency) {
            localStorage.setItem('app_currency', companyCurrency)
            document.cookie = `app_currency=${companyCurrency}; path=/; max-age=31536000`
            
            // Dispatch event to notify other components
            window.dispatchEvent(new Event('app_currency_changed'))
          }
        } catch (error) {
          console.error('Failed to sync currency:', error)
        }
      }
      
      return companyCurrency
    }

    // For owners, use their preference or company currency
    if (typeof window !== 'undefined') {
      const storedCurrency = readAppCurrency()
      if (storedCurrency) {
        return storedCurrency
      }
    }

    return companyCurrency
  } catch (error: any) {
    // ✅ معالجة AbortError بشكل صحيح
    if (error?.name === 'AbortError' || error?.message?.includes('aborted')) {
      console.warn('⚠️ [CurrencySync] Syncing user currency aborted (component unmounted)')
      throw error
    }
    console.error('Error syncing user currency:', error)
    throw error
  }
}

/**
 * Check if current user is company owner
 */
export async function isCompanyOwner(supabase: SupabaseClient): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false

    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) return false

    const { data: company } = await supabase
      .from('companies')
      .select('user_id')
      .eq('id', companyId)
      .maybeSingle()

    return company?.user_id === user.id
  } catch {
    return false
  }
}

/**
 * Get the appropriate currency for the current user
 * - Invited users: Company base currency
 * - Owners: Their preference or company base currency
 */
export async function getUserCurrency(supabase: SupabaseClient): Promise<string> {
  return await syncUserCurrency(supabase)
}

/**
 * Force update currency for all components
 */
export function broadcastCurrencyChange(currency: string): void {
  if (typeof window === 'undefined') return

  try {
    localStorage.setItem('app_currency', currency)
    document.cookie = `app_currency=${currency}; path=/; max-age=31536000`
    window.dispatchEvent(new Event('app_currency_changed'))
  } catch (error) {
    console.error('Failed to broadcast currency change:', error)
  }
}

