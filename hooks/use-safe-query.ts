import { useState, useEffect, useCallback } from 'react'

interface UseSafeQueryOptions<T> {
  queryFn: () => Promise<T>
  dependencies?: any[]
  enabled?: boolean
  onSuccess?: (data: T) => void
  onError?: (error: Error) => void
  retry?: number
  retryDelay?: number
}

interface UseSafeQueryResult<T> {
  data: T | null
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
  reset: () => void
}

export function useSafeQuery<T>({
  queryFn,
  dependencies = [],
  enabled = true,
  onSuccess,
  onError,
  retry = 0,
  retryDelay = 1000
}: UseSafeQueryOptions<T>): UseSafeQueryResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  const executeQuery = useCallback(async () => {
    if (!enabled) return

    try {
      setIsLoading(true)
      setError(null)
      
      const result = await queryFn()
      setData(result)
      
      if (onSuccess) {
        onSuccess(result)
      }
      
      // Reset retry count on success
      setRetryCount(0)
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error occurred')
      console.error('useSafeQuery error:', error)
      setError(error)
      
      if (onError) {
        onError(error)
      }

      // Retry logic
      if (retryCount < retry) {
        setTimeout(() => {
          setRetryCount(prev => prev + 1)
        }, retryDelay)
      }
    } finally {
      setIsLoading(false)
    }
  }, [queryFn, enabled, onSuccess, onError, retry, retryDelay, retryCount])

  useEffect(() => {
    executeQuery()
  }, [...dependencies, retryCount])

  const refetch = useCallback(async () => {
    await executeQuery()
  }, [executeQuery])

  const reset = useCallback(() => {
    setData(null)
    setError(null)
    setIsLoading(false)
    setRetryCount(0)
  }, [])

  return {
    data,
    isLoading,
    error,
    refetch,
    reset
  }
}

export default useSafeQuery