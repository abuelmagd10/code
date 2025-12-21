"use client"

import { ReactNode, useEffect, useState } from 'react'
import { isSupabaseConfigured } from '@/lib/supabase/hooks'
import { SupabaseConfigError } from './supabase-config-error'

interface SupabaseWrapperProps {
  children: ReactNode
  lang?: 'ar' | 'en'
}

export function SupabaseWrapper({ children, lang = 'ar' }: SupabaseWrapperProps) {
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null)

  useEffect(() => {
    try {
      const configured = isSupabaseConfigured()
      setIsConfigured(configured)
    } catch (error) {
      console.error('Supabase configuration check failed:', error)
      setIsConfigured(false)
    }
  }, [])

  // Loading state
  if (isConfigured === null) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  // Configuration error
  if (!isConfigured) {
    return <SupabaseConfigError lang={lang} />
  }

  // All good, render children
  return <>{children}</>
}