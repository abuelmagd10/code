import { useState, useEffect, useCallback } from 'react'

interface UseSafeQueryOptions<T> {
  queryFn: () => Promise<T>
  dependencies?: any[]
  enabled?: boolean
  onSuccess?: (data: T) => void
  onError?: (error: Error) => void
  retry?: number
  retryDelay?: number
  retryOn4xx?: boolean // ✅ جديد: التحكم في retry على 4xx
  retryOn5xx?: boolean // ✅ جديد: التحكم في retry على 5xx
}

interface UseSafeQueryResult<T> {
  data: T | null
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
  reset: () => void
}

/**
 * Hook آمن لجلب البيانات مع منع infinite retry
 *
 * @param retry - عدد مرات إعادة المحاولة (افتراضي: 0 = لا إعادة محاولة)
 * @param retryOn4xx - إعادة المحاولة على 4xx (افتراضي: false)
 * @param retryOn5xx - إعادة المحاولة على 5xx (افتراضي: false)
 */
export function useSafeQuery<T>({
  queryFn,
  dependencies = [],
  enabled = true,
  onSuccess,
  onError,
  retry = 0, // ✅ افتراضي: لا إعادة محاولة
  retryDelay = 1000,
  retryOn4xx = false, // ✅ افتراضي: لا إعادة محاولة على 4xx
  retryOn5xx = false  // ✅ افتراضي: لا إعادة محاولة على 5xx
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
      console.error('[useSafeQuery] Error:', error)
      setError(error)

      if (onError) {
        onError(error)
      }

      // ✅ منع retry على أخطاء معينة
      let shouldRetry = retryCount < retry

      // التحقق من نوع الخطأ
      if (shouldRetry && error.message) {
        // منع retry على 401 (Unauthorized)
        if (error.message.includes('401') || error.message.toLowerCase().includes('unauthorized')) {
          console.warn('[useSafeQuery] 401 Unauthorized - No retry')
          shouldRetry = false
        }

        // منع retry على 403 (Forbidden)
        if (error.message.includes('403') || error.message.toLowerCase().includes('forbidden')) {
          console.warn('[useSafeQuery] 403 Forbidden - No retry')
          shouldRetry = false
        }

        // منع retry على 4xx إلا إذا تم تفعيله صراحة
        if (!retryOn4xx && /4\d{2}/.test(error.message)) {
          console.warn('[useSafeQuery] 4xx Client Error - No retry')
          shouldRetry = false
        }

        // منع retry على 5xx إلا إذا تم تفعيله صراحة
        if (!retryOn5xx && /5\d{2}/.test(error.message)) {
          console.warn('[useSafeQuery] 5xx Server Error - No retry')
          shouldRetry = false
        }
      }

      // Retry logic
      if (shouldRetry) {
        console.log(`[useSafeQuery] Retrying (${retryCount + 1}/${retry})...`)
        setTimeout(() => {
          setRetryCount(prev => prev + 1)
        }, retryDelay)
      } else {
        console.log('[useSafeQuery] No retry - showing error to user')
      }
    } finally {
      setIsLoading(false)
    }
  }, [queryFn, enabled, onSuccess, onError, retry, retryDelay, retryCount, retryOn4xx, retryOn5xx])

  useEffect(() => {
    executeQuery()
  }, [...dependencies, retryCount])

  const refetch = useCallback(async () => {
    setRetryCount(0) // ✅ إعادة تعيين retry count عند refetch يدوي
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