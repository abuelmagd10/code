'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TableSkeleton } from '@/components/ui/skeleton'

interface LoadingStateProps {
  type?: 'spinner' | 'skeleton' | 'table'
  message?: string
  className?: string
  rows?: number
}

export function LoadingState({
  type = 'spinner',
  message,
  className,
  rows = 5
}: LoadingStateProps) {
  const appLang = typeof window !== 'undefined' 
    ? ((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar')
    : 'ar'

  const defaultMessage = appLang === 'en' ? 'Loading...' : 'جاري التحميل...'

  if (type === 'table') {
    return <TableSkeleton rows={rows} />
  }

  if (type === 'skeleton') {
    return (
      <div className={cn('space-y-4', className)}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-16 bg-muted rounded animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col items-center justify-center py-12', className)}>
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
      {message && (
        <p className="text-sm text-muted-foreground">{message}</p>
      )}
      {!message && (
        <p className="text-sm text-muted-foreground">{defaultMessage}</p>
      )}
    </div>
  )
}
