/**
 * Currency Synchronization Utility
 * 
 * Ensures invited users always see the company's base currency
 * while allowing owners to customize their display currency.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { getActiveCompanyId } from './company'

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
  try {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return 'EGP'

    // Get active company
    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) return 'EGP'

    // Get company details
    const { data: company } = await supabase
      .from('companies')
      .select('user_id, base_currency')
      .eq('id', companyId)
      .maybeSingle()

    if (!company) return 'EGP'

    const companyCurrency = company.base_currency || 'EGP'
    const isOwner = company.user_id === user.id

    // For invited users, always force company currency
    if (!isOwner) {
      // Update localStorage and cookie
      if (typeof window !== 'undefined') {
        try {
          const currentCurrency = localStorage.getItem('app_currency') || 'EGP'
          
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
      const storedCurrency = localStorage.getItem('app_currency')
      if (storedCurrency) {
        return storedCurrency
      }
    }

    return companyCurrency
  } catch (error: any) {
    // ✅ معالجة AbortError بشكل صحيح
    if (error?.name === 'AbortError' || error?.message?.includes('aborted')) {
      console.warn('⚠️ [CurrencySync] Syncing user currency aborted (component unmounted)')
      return 'EGP'
    }
    console.error('Error syncing user currency:', error)
    return 'EGP'
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

