/**
 * Company Info Hook
 * =================
 * Production-ready hook for fetching company information
 * 
 * Features:
 * - Uses API endpoint instead of direct Supabase queries
 * - Automatic caching and revalidation
 * - Type-safe responses
 * - Error handling
 * 
 * @example
 * ```tsx
 * const { company, isLoading, error, refresh } = useCompanyInfo()
 * 
 * if (isLoading) return <LoadingSpinner />
 * if (error) return <ErrorMessage error={error} />
 * if (!company) return <NoCompanyFound />
 * 
 * return <div>{company.name} - {company.base_currency}</div>
 * ```
 */

'use client'

import { useState, useEffect, useCallback } from 'react'

// =====================================================
// Types
// =====================================================

export interface CompanyInfo {
  id: string
  user_id: string
  name: string
  email: string
  phone: string | null
  address: string | null
  city: string | null
  country: string | null
  tax_id: string | null
  base_currency: string
  fiscal_year_start: number
  logo_url: string | null
  created_at: string
  updated_at: string
}

export interface UseCompanyInfoResult {
  company: CompanyInfo | null
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
}

// =====================================================
// Hook
// =====================================================

export function useCompanyInfo(companyId?: string): UseCompanyInfoResult {
  const [company, setCompany] = useState<CompanyInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchCompanyInfo = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      // ✅ Call API endpoint instead of direct Supabase query
      const url = companyId 
        ? `/api/company-info?companyId=${companyId}`
        : '/api/company-info'
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        // ✅ Disable automatic retry to prevent infinite loops
        cache: 'no-store',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(
          errorData.message || 
          errorData.message_en || 
          `HTTP ${response.status}: ${response.statusText}`
        )
      }

      const data = await response.json()
      
      if (!data.success) {
        throw new Error(data.message || data.message_en || 'Failed to fetch company info')
      }

      setCompany(data.company)
    } catch (err: any) {
      console.error('[useCompanyInfo] Error:', err)
      setError(err.message || 'خطأ في جلب بيانات الشركة')
      setCompany(null)
    } finally {
      setIsLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    fetchCompanyInfo()
  }, [fetchCompanyInfo])

  return {
    company,
    isLoading,
    error,
    refresh: fetchCompanyInfo,
  }
}

// =====================================================
// Utility Functions
// =====================================================

/**
 * Get company info once (not reactive)
 * Useful for one-time fetches in event handlers
 */
export async function getCompanyInfo(companyId?: string): Promise<CompanyInfo | null> {
  try {
    const url = companyId 
      ? `/api/company-info?companyId=${companyId}`
      : '/api/company-info'
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json()
    
    if (!data.success) {
      throw new Error(data.message || 'Failed to fetch company info')
    }

    return data.company
  } catch (error) {
    console.error('[getCompanyInfo] Error:', error)
    return null
  }
}

