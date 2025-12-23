"use client"

import { useState, useEffect, useCallback } from 'react'
import { apiGet, apiPost, type ApiResponse, type ApiClientOptions } from '@/lib/api-client'
import { toast } from 'sonner'

interface UseApiOptions extends ApiClientOptions {
  enabled?: boolean
  onSuccess?: (data: any) => void
  onError?: (error: ApiResponse) => void
  showSuccessToast?: boolean
  successMessage?: string
}

interface UseApiResult<T> {
  data: T | null
  isLoading: boolean
  error: ApiResponse | null
  refetch: () => Promise<void>
  mutate: (newData: T | null) => void
}

/**
 * Hook لجلب البيانات من API مع معالجة احترافية للأخطاء
 * 
 * @example
 * ```tsx
 * const { data, isLoading, error, refetch } = useApi<Company>('/api/my-company', {
 *   enabled: true,
 *   retry: false
 * })
 * ```
 */
export function useApi<T = any>(
  url: string | null,
  options: UseApiOptions = {}
): UseApiResult<T> {
  const {
    enabled = true,
    onSuccess,
    onError,
    showSuccessToast = false,
    successMessage,
    showErrorToast = true,
    ...apiOptions
  } = options

  const [data, setData] = useState<T | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<ApiResponse | null>(null)

  const fetchData = useCallback(async () => {
    if (!url || !enabled) return

    setIsLoading(true)
    setError(null)

    try {
      const response = await apiGet<T>(url, apiOptions)

      if (response.success) {
        // استخراج البيانات من الاستجابة
        const responseData = response.data || response
        setData(responseData as T)
        
        if (onSuccess) {
          onSuccess(responseData)
        }

        if (showSuccessToast && successMessage) {
          toast.success(successMessage)
        }
      } else {
        setError(response)
        
        if (onError) {
          onError(response)
        }

        if (showErrorToast) {
          toast.error(response.message || 'حدث خطأ أثناء جلب البيانات')
        }
      }
    } catch (err: any) {
      const errorResponse: ApiResponse = {
        success: false,
        code: 'FETCH_ERROR',
        message: err.message || 'حدث خطأ غير متوقع',
        error: err.toString()
      }
      
      setError(errorResponse)
      
      if (onError) {
        onError(errorResponse)
      }

      if (showErrorToast) {
        toast.error(errorResponse.message)
      }
    } finally {
      setIsLoading(false)
    }
  }, [url, enabled, onSuccess, onError, showSuccessToast, successMessage, showErrorToast, apiOptions])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const mutate = useCallback((newData: T | null) => {
    setData(newData)
  }, [])

  return {
    data,
    isLoading,
    error,
    refetch: fetchData,
    mutate
  }
}

/**
 * Hook لإرسال البيانات إلى API
 * 
 * @example
 * ```tsx
 * const { mutate, isLoading } = useApiMutation('/api/invoices', {
 *   onSuccess: () => toast.success('تم الحفظ'),
 *   method: 'POST'
 * })
 * 
 * await mutate({ name: 'Invoice 1' })
 * ```
 */
export function useApiMutation<T = any, R = any>(
  url: string,
  options: UseApiOptions & { method?: 'POST' | 'PUT' | 'PATCH' | 'DELETE' } = {}
) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<ApiResponse | null>(null)

  const mutate = useCallback(async (body?: T): Promise<R | null> => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await apiPost<R>(url, body, options)

      if (response.success) {
        if (options.onSuccess) {
          options.onSuccess(response.data || response)
        }

        if (options.showSuccessToast && options.successMessage) {
          toast.success(options.successMessage)
        }

        return response.data || response as R
      } else {
        setError(response)
        
        if (options.onError) {
          options.onError(response)
        }

        if (options.showErrorToast !== false) {
          toast.error(response.message || 'حدث خطأ')
        }

        return null
      }
    } catch (err: any) {
      const errorResponse: ApiResponse = {
        success: false,
        code: 'MUTATION_ERROR',
        message: err.message || 'حدث خطأ غير متوقع'
      }
      
      setError(errorResponse)
      
      if (options.onError) {
        options.onError(errorResponse)
      }

      if (options.showErrorToast !== false) {
        toast.error(errorResponse.message)
      }

      return null
    } finally {
      setIsLoading(false)
    }
  }, [url, options])

  return { mutate, isLoading, error }
}

