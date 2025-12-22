/**
 * PageHeader Component - Unified header for all pages
 * مكون رأس الصفحة الموحد - لجميع صفحات النظام
 * 
 * Features:
 * - Consistent layout across all pages
 * - Responsive design (mobile, tablet, desktop)
 * - Bilingual support (Arabic/English)
 * - Flexible action buttons
 * - Print and PDF support
 * - Navigation support (Previous/Next)
 */

"use client"

import { Button } from "@/components/ui/button"
import { ReactNode } from "react"
import { LucideIcon } from "lucide-react"
import Link from "next/link"

export interface PageHeaderAction {
  label: string
  onClick?: () => void
  href?: string
  icon?: LucideIcon
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive"
  disabled?: boolean
  title?: string
  className?: string
}

export interface PageHeaderProps {
  // Title and description
  title: string
  description?: string
  icon?: LucideIcon
  
  // Actions (buttons on the right)
  actions?: PageHeaderAction[]
  
  // Additional content (custom elements)
  children?: ReactNode
  
  // Styling
  className?: string
  
  // Hide on print
  hidePrint?: boolean
}

export function PageHeader({
  title,
  description,
  icon: Icon,
  actions = [],
  children,
  className = "",
  hidePrint = true,
}: PageHeaderProps) {
  return (
    <div className={`flex flex-col sm:flex-row sm:justify-between items-start gap-3 ${hidePrint ? 'print:hidden' : ''} ${className}`}>
      {/* Left side: Title and description */}
      <div className="flex items-start gap-3 min-w-0 flex-1">
        {Icon && (
          <div className="hidden sm:flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700 flex-shrink-0">
            <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 dark:text-white truncate">
            {title}
          </h1>
          {description && (
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1 sm:mt-2 truncate">
              {description}
            </p>
          )}
          {children}
        </div>
      </div>

      {/* Right side: Action buttons */}
      {actions.length > 0 && (
        <div className="flex gap-2 flex-wrap items-center self-start sm:self-auto">
          {actions.map((action, index) => {
            const ActionIcon = action.icon
            const buttonContent = (
              <>
                {ActionIcon && <ActionIcon className="w-4 h-4 mr-2" />}
                {action.label}
              </>
            )

            const buttonProps = {
              variant: action.variant || "outline",
              disabled: action.disabled,
              title: action.title,
              className: `h-10 sm:h-11 text-sm sm:text-base px-3 sm:px-4 ${action.className || ""}`,
            }

            if (action.href) {
              return (
                <Link key={index} href={action.href}>
                  <Button {...buttonProps}>
                    {buttonContent}
                  </Button>
                </Link>
              )
            }

            return (
              <Button
                key={index}
                {...buttonProps}
                onClick={action.onClick}
              >
                {buttonContent}
              </Button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * PageHeaderDetail - Specialized header for detail pages (view/edit)
 * رأس صفحة مخصص لصفحات التفاصيل (عرض/تعديل)
 *
 * Includes common actions: PDF, Print, Previous, Next, Edit, Back
 */
export interface PageHeaderDetailProps {
  title: string
  description?: string

  // PDF and Print
  onDownloadPDF?: () => void
  onPrint?: () => void

  // Navigation
  previousHref?: string
  previousLabel?: string
  nextHref?: string
  nextLabel?: string

  // Edit
  editHref?: string
  editLabel?: string
  editDisabled?: boolean
  editTitle?: string

  // Back to list
  backHref?: string
  backLabel?: string

  // Additional actions
  additionalActions?: PageHeaderAction[]

  // Language
  lang?: 'ar' | 'en'

  // Styling
  className?: string
}

export function PageHeaderDetail({
  title,
  description,
  onDownloadPDF,
  onPrint,
  previousHref,
  previousLabel,
  nextHref,
  nextLabel,
  editHref,
  editLabel,
  editDisabled = false,
  editTitle,
  backHref,
  backLabel,
  additionalActions = [],
  lang = 'ar',
  className = "",
}: PageHeaderDetailProps) {
  const actions: PageHeaderAction[] = []

  // PDF Download
  if (onDownloadPDF) {
    const { FileDown } = require("lucide-react")
    actions.push({
      label: lang === 'en' ? 'Download PDF' : 'تنزيل PDF',
      onClick: onDownloadPDF,
      icon: FileDown,
      variant: "outline",
    })
  }

  // Print
  if (onPrint) {
    const { Printer } = require("lucide-react")
    actions.push({
      label: lang === 'en' ? 'Print' : 'طباعة',
      onClick: onPrint,
      icon: Printer,
      variant: "outline",
    })
  }

  // Previous
  if (previousHref !== undefined) {
    const { ArrowLeft } = require("lucide-react")
    actions.push({
      label: previousLabel || (lang === 'en' ? 'Previous' : 'السابق'),
      href: previousHref || undefined,
      icon: ArrowLeft,
      variant: "outline",
      disabled: !previousHref,
    })
  }

  // Next
  if (nextHref !== undefined) {
    const { ArrowRight } = require("lucide-react")
    actions.push({
      label: nextLabel || (lang === 'en' ? 'Next' : 'التالي'),
      href: nextHref || undefined,
      icon: ArrowRight,
      variant: "outline",
      disabled: !nextHref,
    })
  }

  // Edit
  if (editHref) {
    const { Pencil } = require("lucide-react")
    actions.push({
      label: editLabel || (lang === 'en' ? 'Edit' : 'تعديل'),
      href: editDisabled ? undefined : editHref,
      icon: Pencil,
      variant: "outline",
      disabled: editDisabled,
      title: editTitle,
      className: editDisabled ? "opacity-50" : "",
    })
  }

  // Additional actions
  actions.push(...additionalActions)

  // Back to list
  if (backHref) {
    const { ArrowRight } = require("lucide-react")
    actions.push({
      label: backLabel || (lang === 'en' ? 'Back' : 'العودة'),
      href: backHref,
      icon: ArrowRight,
      variant: "outline",
    })
  }

  return (
    <PageHeader
      title={title}
      description={description}
      actions={actions}
      className={className}
    />
  )
}

/**
 * PageHeaderList - Specialized header for list pages
 * رأس صفحة مخصص لصفحات القوائم
 *
 * Includes: Icon, Title, Description, Create button
 */
export interface PageHeaderListProps {
  title: string
  description?: string
  icon?: LucideIcon

  // Create button
  createHref?: string
  createLabel?: string
  createDisabled?: boolean
  createTitle?: string

  // Additional actions
  additionalActions?: PageHeaderAction[]

  // Language
  lang?: 'ar' | 'en'

  // Styling
  className?: string
}

export function PageHeaderList({
  title,
  description,
  icon,
  createHref,
  createLabel,
  createDisabled = false,
  createTitle,
  additionalActions = [],
  lang = 'ar',
  className = "",
}: PageHeaderListProps) {
  const actions: PageHeaderAction[] = []

  // Additional actions first
  actions.push(...additionalActions)

  // Create button (primary action - last)
  if (createHref) {
    const { Plus } = require("lucide-react")
    actions.push({
      label: createLabel || (lang === 'en' ? 'New' : 'جديد'),
      href: createDisabled ? undefined : createHref,
      icon: Plus,
      variant: "default",
      disabled: createDisabled,
      title: createTitle,
      className: "bg-blue-600 hover:bg-blue-700",
    })
  }

  return (
    <PageHeader
      title={title}
      description={description}
      icon={icon}
      actions={actions}
      className={className}
    />
  )
}

/**
 * PageHeaderReport - Specialized header for report pages
 * رأس صفحة مخصص لصفحات التقارير
 *
 * Includes: Print, Export CSV, Back
 */
export interface PageHeaderReportProps {
  title: string
  description?: string

  // Print
  onPrint?: () => void

  // Export
  onExportCSV?: () => void
  onExportPDF?: () => void

  // Back
  backHref?: string
  backLabel?: string

  // Additional actions
  additionalActions?: PageHeaderAction[]

  // Language
  lang?: 'ar' | 'en'

  // Styling
  className?: string
}

export function PageHeaderReport({
  title,
  description,
  onPrint,
  onExportCSV,
  onExportPDF,
  backHref,
  backLabel,
  additionalActions = [],
  lang = 'ar',
  className = "",
}: PageHeaderReportProps) {
  const actions: PageHeaderAction[] = []

  // Print
  if (onPrint) {
    const { Printer } = require("lucide-react")
    actions.push({
      label: lang === 'en' ? 'Print' : 'طباعة',
      onClick: onPrint,
      icon: Printer,
      variant: "outline",
    })
  }

  // Export CSV
  if (onExportCSV) {
    const { Download } = require("lucide-react")
    actions.push({
      label: lang === 'en' ? 'Export CSV' : 'تصدير CSV',
      onClick: onExportCSV,
      icon: Download,
      variant: "outline",
    })
  }

  // Export PDF
  if (onExportPDF) {
    const { FileDown } = require("lucide-react")
    actions.push({
      label: lang === 'en' ? 'Export PDF' : 'تصدير PDF',
      onClick: onExportPDF,
      icon: FileDown,
      variant: "outline",
    })
  }

  // Additional actions
  actions.push(...additionalActions)

  // Back
  if (backHref) {
    const { ArrowRight } = require("lucide-react")
    actions.push({
      label: backLabel || (lang === 'en' ? 'Back' : 'العودة'),
      href: backHref,
      icon: ArrowRight,
      variant: "outline",
    })
  }

  return (
    <PageHeader
      title={title}
      description={description}
      actions={actions}
      className={className}
    />
  )
}

/**
 * Utility functions for PDF and Print
 * دوال مساعدة للطباعة وتحميل PDF
 */

export interface UsePrintPDFOptions {
  contentRef: React.RefObject<HTMLElement>
  documentTitle: string
  lang?: 'ar' | 'en'
  onError?: (error: Error) => void
}

export function usePrintPDF({
  contentRef,
  documentTitle,
  lang = 'ar',
  onError,
}: UsePrintPDFOptions) {
  const handlePrint = () => {
    window.print()
  }

  const handleDownloadPDF = async () => {
    try {
      const el = contentRef.current
      if (!el) {
        throw new Error(lang === 'en' ? 'Content not found' : 'المحتوى غير موجود')
      }

      const content = el.innerHTML
      const { openPrintWindow } = await import('@/lib/print-utils')

      openPrintWindow(content, {
        lang,
        direction: lang === 'ar' ? 'rtl' : 'ltr',
        title: documentTitle,
        fontSize: 11,
        pageSize: 'A4',
        margin: '5mm'
      })
    } catch (err) {
      console.error("Error generating PDF:", err)
      if (onError) {
        onError(err as Error)
      }
    }
  }

  return {
    handlePrint,
    handleDownloadPDF,
  }
}

