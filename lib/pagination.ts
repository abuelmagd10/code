/**
 * Pagination utilities for main lists
 * Provides hooks and functions for client-side pagination
 */

import { useState, useMemo, useEffect } from 'react'

export interface PaginationOptions {
  pageSize?: number
  initialPage?: number
}

export interface PaginationResult<T> {
  currentPage: number
  totalPages: number
  totalItems: number
  pageSize: number
  paginatedItems: T[]
  hasNext: boolean
  hasPrevious: boolean
  goToPage: (page: number) => void
  nextPage: () => void
  previousPage: () => void
  setPageSize: (size: number) => void
}

/**
 * Hook for client-side pagination
 * @param items - Array of items to paginate
 * @param options - Pagination options
 */
export function usePagination<T>(
  items: T[],
  options: PaginationOptions = {}
): PaginationResult<T> {
  const {
    pageSize = 10,
    initialPage = 1
  } = options

  const [currentPage, setCurrentPage] = useState(initialPage)
  const [currentPageSize, setCurrentPageSize] = useState(pageSize)

  // ✅ Bug Fix: Update currentPageSize when pageSize prop changes
  useEffect(() => {
    if (pageSize !== undefined && pageSize !== currentPageSize) {
      setCurrentPageSize(pageSize)
      setCurrentPage(1) // Reset to first page when page size changes externally
    }
  }, [pageSize, currentPageSize])

  const totalItems = items.length
  const totalPages = Math.ceil(totalItems / currentPageSize)
  const hasNext = currentPage < totalPages
  const hasPrevious = currentPage > 1

  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * currentPageSize
    const endIndex = startIndex + currentPageSize
    return items.slice(startIndex, endIndex)
  }, [items, currentPage, currentPageSize])

  const goToPage = (page: number) => {
    const validPage = Math.max(1, Math.min(page, totalPages))
    setCurrentPage(validPage)
  }

  const nextPage = () => {
    if (hasNext) {
      setCurrentPage(currentPage + 1)
    }
  }

  const previousPage = () => {
    if (hasPrevious) {
      setCurrentPage(currentPage - 1)
    }
  }

  const setPageSize = (size: number) => {
    setCurrentPageSize(size)
    setCurrentPage(1) // Reset to first page when changing page size
  }

  return {
    currentPage,
    totalPages,
    totalItems,
    pageSize: currentPageSize,
    paginatedItems,
    hasNext,
    hasPrevious,
    goToPage,
    nextPage,
    previousPage,
    setPageSize
  }
}

/**
 * Generate page numbers for pagination display
 * @param currentPage - Current page number
 * @param totalPages - Total number of pages
 * @param maxVisible - Maximum number of visible page buttons
 */
export function generatePageNumbers(
  currentPage: number,
  totalPages: number,
  maxVisible: number = 5
): (number | string)[] {
  if (totalPages <= maxVisible) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  const pages: (number | string)[] = []
  const halfVisible = Math.floor(maxVisible / 2)

  if (currentPage <= halfVisible + 1) {
    // Near the beginning
    pages.push(...Array.from({ length: maxVisible - 1 }, (_, i) => i + 1))
    pages.push('...', totalPages)
  } else if (currentPage >= totalPages - halfVisible) {
    // Near the end
    pages.push(1, '...')
    pages.push(...Array.from({ length: maxVisible - 1 }, (_, i) => totalPages - maxVisible + 2 + i))
  } else {
    // In the middle
    pages.push(1, '...')
    pages.push(...Array.from({ length: maxVisible - 2 }, (_, i) => currentPage - halfVisible + 1 + i))
    pages.push('...', totalPages)
  }

  return pages
}

/**
 * Get pagination text for different languages
 */
export function getPaginationText(lang: 'ar' | 'en' = 'ar') {
  return {
    showing: lang === 'en' ? 'Showing' : 'عرض',
    of: lang === 'en' ? 'of' : 'من',
    items: lang === 'en' ? 'items' : 'عنصر',
    page: lang === 'en' ? 'Page' : 'صفحة',
    previous: lang === 'en' ? 'Previous' : 'السابق',
    next: lang === 'en' ? 'Next' : 'التالي',
    pageSize: lang === 'en' ? 'Items per page' : 'عناصر لكل صفحة',
    noItems: lang === 'en' ? 'No items found' : 'لا توجد عناصر',
    loading: lang === 'en' ? 'Loading...' : 'جاري التحميل...'
  }
}