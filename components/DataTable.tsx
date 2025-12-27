/**
 * DataTable Component - Unified table component for ERP system
 * 
 * Features:
 * - Consistent column alignment (text/numbers/dates/status/actions)
 * - Responsive design with horizontal scroll
 * - Sticky header
 * - Hover states
 * - Bilingual support (Arabic RTL / English LTR)
 * - Type-safe column definitions
 */

import React from 'react'

// Column alignment types
export type ColumnAlign = 'left' | 'right' | 'center'

// Column data types for automatic formatting
export type ColumnType = 'text' | 'number' | 'currency' | 'date' | 'percentage' | 'status' | 'actions' | 'custom'

// Column definition interface
export interface DataTableColumn<T = any> {
  key: string
  header: string
  align?: ColumnAlign
  type?: ColumnType
  width?: string // e.g., 'w-32', 'w-48', 'min-w-[200px]', 'flex-1'
  className?: string
  hidden?: 'sm' | 'md' | 'lg' | 'xl' // Hide on specific breakpoints
  format?: (value: any, row: T) => React.ReactNode
  sortable?: boolean
}

export interface DataTableFooterProps {
  render?: (data: any[]) => React.ReactNode
  className?: string
}

export interface DataTableProps<T = any> {
  columns: DataTableColumn<T>[]
  data: T[]
  keyField: string
  onRowClick?: (row: T) => void
  emptyMessage?: string
  lang?: 'ar' | 'en'
  stickyHeader?: boolean
  minWidth?: string // e.g., 'min-w-[640px]'
  className?: string
  rowClassName?: string | ((row: T) => string)
  footer?: DataTableFooterProps
}

/**
 * Get default alignment based on column type
 */
const getDefaultAlign = (type: ColumnType = 'text'): ColumnAlign => {
  switch (type) {
    case 'number':
    case 'currency':
    case 'percentage':
    case 'date':
      return 'right'
    case 'status':
    case 'actions':
      return 'center'
    case 'text':
    case 'custom':
    default:
      return 'left'
  }
}

/**
 * Get alignment class for table cells
 */
const getAlignClass = (align: ColumnAlign): string => {
  switch (align) {
    case 'left':
      return 'text-left'
    case 'right':
      return 'text-right'
    case 'center':
      return 'text-center'
  }
}

/**
 * Get responsive hidden class
 */
const getHiddenClass = (hidden?: 'sm' | 'md' | 'lg' | 'xl'): string => {
  if (!hidden) return ''
  return `hidden ${hidden}:table-cell`
}

/**
 * Format value based on column type
 */
const formatValue = (value: any, type: ColumnType = 'text', lang: 'ar' | 'en' = 'ar'): React.ReactNode => {
  if (value === null || value === undefined) return '-'

  switch (type) {
    case 'number':
      return Number(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    
    case 'currency':
      return Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    
    case 'percentage':
      return `${Number(value).toFixed(2)}%`
    
    case 'date':
      if (typeof value === 'string') {
        return value // Already formatted date string (YYYY-MM-DD)
      }
      return new Date(value).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US')
    
    case 'text':
    case 'status':
    case 'actions':
    case 'custom':
    default:
      return value
  }
}

/**
 * DataTable Component
 */
export function DataTable<T = any>({
  columns,
  data,
  keyField,
  onRowClick,
  emptyMessage,
  lang = 'ar',
  stickyHeader = true,
  minWidth = 'min-w-[640px]',
  className = '',
  rowClassName = '',
  footer
}: DataTableProps<T>) {
  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        {emptyMessage || (lang === 'en' ? 'No data available' : 'لا توجد بيانات')}
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className={`${minWidth} w-full text-sm ${className}`}>
        <thead className={`border-b bg-gray-50 dark:bg-slate-800 ${stickyHeader ? 'sticky top-0 z-10' : ''}`}>
          <tr>
            {columns.map((column, index) => {
              const align = column.align || getDefaultAlign(column.type)
              const alignClass = getAlignClass(align)
              const hiddenClass = getHiddenClass(column.hidden)
              
              return (
                <th
                  key={`header-${column.key}-${index}`}
                  className={`px-3 py-3 font-semibold text-gray-900 dark:text-white ${alignClass} ${hiddenClass} ${column.className || ''}`}
                >
                  {column.header}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {data.map((row: any) => {
            const rowKey = row[keyField]
            const computedRowClassName = typeof rowClassName === 'function' ? rowClassName(row) : rowClassName

            return (
              <tr
                key={rowKey}
                className={`border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-slate-800/50 ${onRowClick ? 'cursor-pointer' : ''} ${computedRowClassName}`}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((column, index) => {
                  const align = column.align || getDefaultAlign(column.type)
                  const alignClass = getAlignClass(align)
                  const hiddenClass = getHiddenClass(column.hidden)

                  // Get cell value
                  const value = column.key.includes('.')
                    ? column.key.split('.').reduce((obj, key) => obj?.[key], row)
                    : row[column.key]

                  // Format cell content
                  const content = column.format
                    ? column.format(value, row)
                    : formatValue(value, column.type, lang)

                  return (
                    <td
                      key={`cell-${rowKey}-${column.key}-${index}`}
                      className={`px-3 py-3 ${alignClass} ${hiddenClass} ${column.className || ''}`}
                    >
                      {content}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
        {footer && footer.render && (
          <tfoot className={footer.className || 'font-bold bg-gradient-to-r from-gray-100 to-slate-100 dark:from-slate-800 dark:to-slate-700 border-t-2 border-gray-300 dark:border-slate-600'}>
            {footer.render(data)}
          </tfoot>
        )}
      </table>
    </div>
  )
}

