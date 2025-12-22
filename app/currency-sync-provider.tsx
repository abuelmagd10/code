/**
 * Currency Sync Provider
 * 
 * Automatically syncs user's display currency with company's base currency
 * for invited users on every page load.
 */

'use client'

import { useEffect } from 'react'
import { useSupabase } from '@/lib/supabase/hooks'
import { syncUserCurrency } from '@/lib/currency-sync'

export function CurrencySyncProvider({ children }: { children: React.ReactNode }) {
  const supabase = useSupabase()

  useEffect(() => {
    // Sync currency on mount
    const syncCurrency = async () => {
      try {
        await syncUserCurrency(supabase)
      } catch (error) {
        console.error('Currency sync error:', error)
      }
    }

    syncCurrency()

    // Re-sync when user changes or company changes
    const handleAuthChange = () => {
      syncCurrency()
    }

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(handleAuthChange)

    return () => {
      subscription.unsubscribe()
    }
  }, [supabase])

  return <>{children}</>
}

