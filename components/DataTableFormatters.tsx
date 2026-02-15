/**
 * DataTable Formatters - Common formatting functions for DataTable
 * 
 * Provides consistent formatting for:
 * - Currency amounts
 * - Status badges
 * - Dates
 * - Numbers
 * - Percentages
 */

import React from 'react'
import { Badge } from '@/components/ui/badge'

/**
 * Format currency with symbol
 */
export const formatCurrency = (
  amount: number,
  currencySymbol: string = '£',
  options?: {
    minimumFractionDigits?: number
    maximumFractionDigits?: number
    showZero?: boolean
  }
) => {
  const { minimumFractionDigits = 2, maximumFractionDigits = 2, showZero = true } = options || {}

  if (!showZero && amount === 0) return '-'

  return `${currencySymbol}${amount.toLocaleString('en-US', {
    minimumFractionDigits,
    maximumFractionDigits
  })}`
}

/**
 * Format currency with color based on value
 */
export const CurrencyCell = ({
  amount,
  currencySymbol = '£',
  colorize = false,
  positiveColor = 'text-green-600 dark:text-green-400',
  negativeColor = 'text-red-600 dark:text-red-400',
  zeroColor = 'text-gray-400 dark:text-gray-500',
  className = ''
}: {
  amount: number
  currencySymbol?: string
  colorize?: boolean
  positiveColor?: string
  negativeColor?: string
  zeroColor?: string
  className?: string
}) => {
  const color = colorize
    ? amount > 0
      ? positiveColor
      : amount < 0
        ? negativeColor
        : zeroColor
    : ''

  return (
    <span className={`font-medium ${color} ${className}`}>
      {formatCurrency(amount, currencySymbol)}
    </span>
  )
}

/**
 * Status badge configurations
 */
export const statusConfigs: Record<string, {
  variant: 'default' | 'secondary' | 'destructive' | 'outline'
  className?: string
  label: { ar: string; en: string }
}> = {
  // Invoice statuses
  draft: {
    variant: 'secondary',
    className: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
    label: { ar: 'مسودة', en: 'Draft' }
  },
  sent: {
    variant: 'default',
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    label: { ar: 'مرسلة', en: 'Sent' }
  },
  partially_paid: {
    variant: 'outline',
    className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    label: { ar: 'مدفوعة جزئياً', en: 'Partially Paid' }
  },
  paid: {
    variant: 'default',
    className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    label: { ar: 'مدفوعة', en: 'Paid' }
  },
  cancelled: {
    variant: 'destructive',
    className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    label: { ar: 'ملغاة', en: 'Cancelled' }
  },
  // Sales order statuses
  invoiced: {
    variant: 'default',
    className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    label: { ar: 'تم التحويل لفاتورة', en: 'Invoiced' }
  },
  // Purchase order statuses
  billed: {
    variant: 'default',
    className: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    label: { ar: 'تم التحويل لفاتورة', en: 'Billed' }
  },
  received: {
    variant: 'default',
    className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    label: { ar: 'مُستلم', en: 'Received' }
  },
  returned: {
    variant: 'destructive',
    className: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    label: { ar: 'مرتجع', en: 'Returned' }
  },
  partially_returned: {
    variant: 'outline',
    className: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    label: { ar: 'مرتجع جزئياً', en: 'Partially Returned' }
  },
  // Return statuses for invoices
  fully_returned: {
    variant: 'destructive',
    className: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    label: { ar: 'مرتجع بالكامل', en: 'Fully Returned' }
  },
  // Generic statuses
  active: {
    variant: 'default',
    className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    label: { ar: 'نشط', en: 'Active' }
  },
  inactive: {
    variant: 'secondary',
    className: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
    label: { ar: 'غير نشط', en: 'Inactive' }
  },
  pending: {
    variant: 'outline',
    className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    label: { ar: 'قيد الانتظار', en: 'Pending' }
  },
  pending_approval: {
    variant: 'outline',
    className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    label: { ar: 'قيد الموافقة', en: 'Pending Approval' }
  },
  approved: {
    variant: 'default',
    className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    label: { ar: 'موافق عليه', en: 'Approved' }
  },
  rejected: {
    variant: 'destructive',
    className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    label: { ar: 'مرفوض', en: 'Rejected' }
  },
  applied: {
    variant: 'default',
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    label: { ar: 'مطبق', en: 'Applied' }
  },
  completed: {
    variant: 'default',
    className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    label: { ar: 'مكتمل', en: 'Completed' }
  },
  // Attendance statuses
  present: {
    variant: 'default',
    className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    label: { ar: 'حضور', en: 'Present' }
  },
  absent: {
    variant: 'destructive',
    className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    label: { ar: 'غياب', en: 'Absent' }
  },
  leave: {
    variant: 'outline',
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    label: { ar: 'إجازة', en: 'Leave' }
  },
  sick: {
    variant: 'secondary',
    className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    label: { ar: 'مرضية', en: 'Sick' }
  },
  late: {
    variant: 'outline',
    className: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    label: { ar: 'تأخير', en: 'Late' }
  },
  early_leave: {
    variant: 'outline',
    className: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    label: { ar: 'انصراف مبكر', en: 'Early Leave' }
  },
  // Write-off statuses
  locked: {
    variant: 'secondary',
    className: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
    label: { ar: 'مقفل', en: 'Locked' }
  }
  // Note: 'cancelled' is already defined above
}

/**
 * Status Badge Component
 */
export const StatusBadge = ({
  status,
  lang = 'ar',
  className = ''
}: {
  status: string
  lang?: 'ar' | 'en'
  className?: string
}) => {
  const config = statusConfigs[status] || {
    variant: 'secondary' as const,
    className: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
    label: { ar: status, en: status }
  }

  return (
    <Badge
      variant={config.variant}
      className={`${config.className} ${className}`}
    >
      {config.label[lang]}
    </Badge>
  )
}

/**
 * Format date string
 */
export const formatDate = (date: string | Date, lang: 'ar' | 'en' = 'ar'): string => {
  if (!date) return '-'

  if (typeof date === 'string') {
    // If already in YYYY-MM-DD format, return as is
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return date
    }
  }

  return new Date(date).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US')
}

