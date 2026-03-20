/**
 * ⚡ SERVER-SIDE PAGINATION UTILITIES
 * Enterprise Data Fetching Architecture — Progressive Enhancement
 *
 * هذا الملف إضافي ولا يعدّل أو يحذف usePagination الحالي في lib/pagination.ts
 *
 * يوفر:
 * 1. useServerPagination — hook لإدارة التنقل بين الصفحات مع جلب من السيرفر
 * 2. buildPaginatedUrl — دالة مساعدة لبناء URL مع params للـ API Route
 * 3. ServerPaginationState — نوع مشترك للحالة
 */

import { useState, useCallback, useRef } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ServerPaginationState {
  currentPage: number
  pageSize: number
  totalCount: number
  isLoading: boolean
  error: string | null
}

export interface ServerPaginationResult<T> {
  // البيانات الحالية
  data: T[]
  // حالة الـ Pagination
  currentPage: number
  pageSize: number
  totalCount: number
  totalPages: number
  hasNext: boolean
  hasPrevious: boolean
  isLoading: boolean
  error: string | null
  // الدوال
  goToPage: (page: number) => void
  nextPage: () => void
  previousPage: () => void
  setPageSize: (size: number) => void
  refresh: () => void
}

export interface UseServerPaginationOptions<TFilters = Record<string, any>> {
  /** دالة الجلب — يجب أن تُعيد { data, totalCount } */
  fetchFn: (params: ServerFetchParams<TFilters>) => Promise<ServerFetchResult<any>>
  /** الحجم الابتدائي للصفحة */
  initialPageSize?: number
  /** الفلاتر الحالية */
  filters?: TFilters
  /** تشغيل الجلب تلقائياً أو انتظار trigger */
  enabled?: boolean
}

export interface ServerFetchParams<TFilters = Record<string, any>> {
  page: number
  pageSize: number
  from: number
  to: number
  filters: TFilters
}

export interface ServerFetchResult<T> {
  data: T[]
  totalCount: number
  error?: string | null
}

// ─── Hook: useServerPagination ─────────────────────────────────────────────

/**
 * Hook لإدارة Server-Side Pagination
 *
 * متوافق مع DataPagination الحالي — يُمرَّر currentPage, totalPages, totalItems, pageSize, onPageChange
 *
 * @example
 * const { data, currentPage, totalPages, totalCount, isLoading, goToPage, setPageSize } =
 *   useServerPagination({
 *     fetchFn: async ({ from, to, filters }) => {
 *       const res = await fetch(`/api/v2/purchase-orders?page=${filters.page}&pageSize=${filters.pageSize}&...`)
 *       const json = await res.json()
 *       return { data: json.data, totalCount: json.meta.totalCount }
 *     },
 *     initialPageSize: 20,
 *     filters: { search, status, supplier },
 *     enabled: true
 *   })
 */
export function useServerPagination<T, TFilters = Record<string, any>>(
  options: UseServerPaginationOptions<TFilters>
): ServerPaginationResult<T> {
  const { fetchFn, initialPageSize = 20, filters, enabled = true } = options

  const [data, setData] = useState<T[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSizeState] = useState(initialPageSize)
  const [totalCount, setTotalCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ref لإلغاء الطلبات القديمة عند التنقل السريع
  const abortControllerRef = useRef<AbortController | null>(null)

  const fetchPage = useCallback(async (page: number, size: number, currentFilters: TFilters) => {
    if (!enabled) return

    // إلغاء الطلب السابق إذا كان لا يزال جارياً
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()

    setIsLoading(true)
    setError(null)

    const from = (page - 1) * size
    const to = from + size - 1

    try {
      const result = await fetchFn({
        page,
        pageSize: size,
        from,
        to,
        filters: currentFilters
      })

      if (result.error) {
        setError(result.error)
      } else {
        setData(result.data)
        setTotalCount(result.totalCount)
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return // تجاهل الطلبات الملغاة
      setError(err?.message || 'خطأ في جلب البيانات')
    } finally {
      setIsLoading(false)
    }
  }, [fetchFn, enabled])

  // إعادة الجلب عند تغيير الفلاتر → إعادة للصفحة الأولى
  const refresh = useCallback(() => {
    setCurrentPage(1)
    fetchPage(1, pageSize, filters as TFilters)
  }, [fetchPage, pageSize, filters])

  const goToPage = useCallback((page: number) => {
    const total = Math.ceil(totalCount / pageSize)
    const validPage = Math.max(1, Math.min(page, total || 1))
    setCurrentPage(validPage)
    fetchPage(validPage, pageSize, filters as TFilters)
  }, [fetchPage, pageSize, totalCount, filters])

  const nextPage = useCallback(() => {
    const total = Math.ceil(totalCount / pageSize)
    if (currentPage < total) {
      goToPage(currentPage + 1)
    }
  }, [currentPage, totalCount, pageSize, goToPage])

  const previousPage = useCallback(() => {
    if (currentPage > 1) {
      goToPage(currentPage - 1)
    }
  }, [currentPage, goToPage])

  const setPageSize = useCallback((size: number) => {
    setPageSizeState(size)
    setCurrentPage(1)
    fetchPage(1, size, filters as TFilters)
  }, [fetchPage, filters])

  const totalPages = Math.ceil(totalCount / pageSize) || 1

  return {
    data,
    currentPage,
    pageSize,
    totalCount,
    totalPages,
    hasNext: currentPage < totalPages,
    hasPrevious: currentPage > 1,
    isLoading,
    error,
    goToPage,
    nextPage,
    previousPage,
    setPageSize,
    refresh,
  }
}

// ─── Helper: buildPaginatedUrl ──────────────────────────────────────────────

/**
 * بناء URL مع params للـ API Route
 *
 * @example
 * buildPaginatedUrl('/api/v2/purchase-orders', {
 *   page: 1, pageSize: 20, search: 'PO-001', status: ['approved']
 * })
 * // → '/api/v2/purchase-orders?page=1&pageSize=20&search=PO-001&status=approved'
 */
export function buildPaginatedUrl(
  baseUrl: string,
  params: Record<string, any>
): string {
  const url = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue
    if (Array.isArray(value)) {
      if (value.length === 0) continue
      value.forEach(v => url.append(key, String(v)))
    } else {
      url.set(key, String(value))
    }
  }
  const qs = url.toString()
  return qs ? `${baseUrl}?${qs}` : baseUrl
}
