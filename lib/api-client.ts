/**
 * API Client مع Error Handling احترافي
 * يمنع التكرار اللانهائي ويوفر تجربة مستخدم أفضل
 */

export interface ApiResponse<T = any> {
  success: boolean
  code?: string
  message?: string
  data?: T
  error?: string
  [key: string]: any
}

export interface ApiClientOptions {
  retry?: boolean
  retryCount?: number
  retryDelay?: number
  timeout?: number
  showErrorToast?: boolean
}

const DEFAULT_OPTIONS: ApiClientOptions = {
  retry: false, // ✅ تعطيل retry افتراضياً
  retryCount: 0,
  retryDelay: 1000,
  timeout: 30000,
  showErrorToast: true
}

/**
 * معالج الأخطاء المركزي
 */
function handleApiError(error: any, url: string): ApiResponse {
  console.error(`[API Error] ${url}:`, error)

  // Network errors
  if (error.name === 'TypeError' && error.message.includes('fetch')) {
    return {
      success: false,
      code: 'NETWORK_ERROR',
      message: 'فشل الاتصال بالسيرفر. تحقق من اتصال الإنترنت.',
      error: 'Network connection failed'
    }
  }

  // Timeout errors
  if (error.name === 'AbortError') {
    return {
      success: false,
      code: 'TIMEOUT',
      message: 'انتهت مهلة الطلب. حاول مرة أخرى.',
      error: 'Request timeout'
    }
  }

  // Generic error
  return {
    success: false,
    code: 'UNKNOWN_ERROR',
    message: 'حدث خطأ غير متوقع',
    error: error.message || 'Unknown error'
  }
}

/**
 * API Client مع معالجة احترافية للأخطاء
 */
export async function apiClient<T = any>(
  url: string,
  options: RequestInit & ApiClientOptions = {}
): Promise<ApiResponse<T>> {
  const {
    retry,
    retryCount,
    retryDelay,
    timeout,
    showErrorToast,
    ...fetchOptions
  } = { ...DEFAULT_OPTIONS, ...options }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...fetchOptions.headers
      }
    })

    clearTimeout(timeoutId)

    // Parse response
    let data: any
    const contentType = response.headers.get('content-type')
    
    if (contentType?.includes('application/json')) {
      data = await response.json()
    } else {
      data = await response.text()
    }

    // Handle HTTP errors
    if (!response.ok) {
      const errorResponse: ApiResponse = {
        success: false,
        code: data.code || `HTTP_${response.status}`,
        message: data.message || data.error || `HTTP Error ${response.status}`,
        error: data.error || response.statusText,
        status: response.status
      }

      // ✅ لا نعيد المحاولة في حالة 4xx (Client Errors)
      if (response.status >= 400 && response.status < 500) {
        console.warn(`[API Client] Client error ${response.status} for ${url}`)
        return errorResponse
      }

      // ✅ لا نعيد المحاولة في حالة 5xx إلا إذا تم تفعيل retry صراحة
      if (response.status >= 500 && !retry) {
        console.error(`[API Client] Server error ${response.status} for ${url}`)
        return errorResponse
      }

      return errorResponse
    }

    // Success response
    return {
      success: true,
      ...data
    }

  } catch (error: any) {
    clearTimeout(timeoutId)
    return handleApiError(error, url)
  }
}

/**
 * GET request
 */
export async function apiGet<T = any>(
  url: string,
  options?: ApiClientOptions
): Promise<ApiResponse<T>> {
  return apiClient<T>(url, { ...options, method: 'GET' })
}

/**
 * POST request
 */
export async function apiPost<T = any>(
  url: string,
  body?: any,
  options?: ApiClientOptions
): Promise<ApiResponse<T>> {
  return apiClient<T>(url, {
    ...options,
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined
  })
}

