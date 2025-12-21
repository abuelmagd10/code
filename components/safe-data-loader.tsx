"use client"

import React, { useState, useEffect, ReactNode } from 'react'
import { LoadingState } from '@/components/ui/loading-state'
import { ErrorFallback } from '@/components/error-fallback'

interface SafeDataLoaderProps {
  children: ReactNode
  loadData: () => Promise<void>
  dependencies?: any[]
  loadingType?: 'spinner' | 'skeleton' | 'table'
  loadingRows?: number
  errorTitle?: string
  errorDescription?: string
  lang?: 'ar' | 'en'
  retryable?: boolean
}

export function SafeDataLoader({
  children,
  loadData,
  dependencies = [],
  loadingType = 'skeleton',
  loadingRows = 5,
  errorTitle,
  errorDescription,
  lang = 'ar',
  retryable = true
}: SafeDataLoaderProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  const executeLoad = async () => {
    try {
      setIsLoading(true)
      setError(null)
      await loadData()
    } catch (err) {
      console.error('SafeDataLoader error:', err)
      setError(err instanceof Error ? err : new Error('Unknown error occurred'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    executeLoad()
  }, [...dependencies, retryCount])

  const handleRetry = () => {
    setRetryCount(prev => prev + 1)
  }

  if (error) {
    return (
      <ErrorFallback
        error={error}
        resetError={retryable ? handleRetry : undefined}
        title={errorTitle}
        description={errorDescription}
        showDetails={process.env.NODE_ENV === 'development'}
        lang={lang}
      />
    )
  }

  if (isLoading) {
    return <LoadingState type={loadingType} rows={loadingRows} />
  }

  return <>{children}</>
}

export default SafeDataLoader