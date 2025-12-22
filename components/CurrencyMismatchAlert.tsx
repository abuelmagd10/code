/**
 * Currency Mismatch Alert Component
 * 
 * Shows a warning when user's display currency differs from company's base currency
 * Provides a quick fix button to sync currencies
 */

'use client'

import { useState, useEffect } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useSupabase } from '@/lib/supabase/hooks'
import { getActiveCompanyId } from '@/lib/company'
import { syncUserCurrency, isCompanyOwner } from '@/lib/currency-sync'

interface CurrencyMismatchAlertProps {
  lang?: 'ar' | 'en'
}

export function CurrencyMismatchAlert({ lang = 'ar' }: CurrencyMismatchAlertProps) {
  const supabase = useSupabase()
  const [showAlert, setShowAlert] = useState(false)
  const [companyCurrency, setCompanyCurrency] = useState<string>('')
  const [displayCurrency, setDisplayCurrency] = useState<string>('')
  const [isOwner, setIsOwner] = useState(false)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    checkCurrencyMismatch()
  }, [])

  const checkCurrencyMismatch = async () => {
    try {
      // Get company currency
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      const { data: company } = await supabase
        .from('companies')
        .select('base_currency, currency')
        .eq('id', companyId)
        .maybeSingle()

      if (!company) return

      const baseCurrency = company.base_currency || company.currency || 'EGP'
      setCompanyCurrency(baseCurrency)

      // Get display currency
      const storedCurrency = typeof window !== 'undefined' 
        ? localStorage.getItem('app_currency') || 'EGP'
        : 'EGP'
      setDisplayCurrency(storedCurrency)

      // Check if user is owner
      const owner = await isCompanyOwner(supabase)
      setIsOwner(owner)

      // Show alert if currencies don't match and user is not owner
      if (baseCurrency !== storedCurrency && !owner) {
        setShowAlert(true)
      }
    } catch (error) {
      console.error('Error checking currency mismatch:', error)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      await syncUserCurrency(supabase)
      setShowAlert(false)
      
      // Reload page to apply changes
      window.location.reload()
    } catch (error) {
      console.error('Error syncing currency:', error)
    } finally {
      setSyncing(false)
    }
  }

  if (!showAlert) return null

  return (
    <Alert className="mb-4 border-amber-500 bg-amber-50 dark:bg-amber-950/20">
      <AlertTriangle className="h-4 w-4 text-amber-600" />
      <AlertDescription className="flex items-center justify-between gap-4">
        <div className="flex-1">
          {lang === 'ar' ? (
            <>
              <p className="font-semibold text-amber-800 dark:text-amber-200">
                تحذير: عدم تطابق العملة
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                عملة الشركة: <strong>{companyCurrency}</strong> | 
                عملة العرض الحالية: <strong>{displayCurrency}</strong>
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                كمستخدم مدعو، يجب أن تستخدم عملة الشركة الأساسية لضمان دقة البيانات.
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold text-amber-800 dark:text-amber-200">
                Warning: Currency Mismatch
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                Company Currency: <strong>{companyCurrency}</strong> | 
                Current Display: <strong>{displayCurrency}</strong>
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                As an invited user, you should use the company's base currency for data accuracy.
              </p>
            </>
          )}
        </div>
        <Button
          size="sm"
          onClick={handleSync}
          disabled={syncing}
          className="bg-amber-600 hover:bg-amber-700 text-white"
        >
          {syncing ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-2" />
              {lang === 'ar' ? 'مزامنة العملة' : 'Sync Currency'}
            </>
          )}
        </Button>
      </AlertDescription>
    </Alert>
  )
}

