/**
 * ERPPageHeader Component - Unified Professional Page Header
 * مكون رأس الصفحة الموحد الاحترافي
 * 
 * 🎯 Features:
 * - Consistent layout across all 146+ pages
 * - Smart back button (shows only on detail/form/report pages)
 * - RTL/LTR automatic support
 * - Responsive design (mobile, tablet, desktop)
 * - Multi-company/branch badge support
 * - Accessibility compliant (ARIA labels, keyboard nav)
 * - No direct router.back() usage (controlled navigation)
 * 
 * 🔒 Constraints:
 * - Financial pages MUST use backHref (no router.back())
 * - No standalone ArrowLeft/ArrowRight outside this component
 * - Consistent spacing (no layout breaks)
 * 
 * @version 2.0.0
 * @author ERP Team
 * @date 2026-02-15
 */

"use client"

import { ReactNode } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { SmartBreadcrumbs } from "@/components/SmartBreadcrumbs"

// ============================================================================
// TypeScript Interfaces
// ============================================================================

export interface ERPPageHeaderProps {
    /**
     * عنوان الصفحة (إلزامي)
     * Page title (required)
     */
    title: string

    /**
     * وصف مختصر للصفحة (اختياري)
     * Brief page description (optional)
     */
    description?: string

    /**
     * نوع الصفحة - يحدد سلوك زر العودة
     * Page variant - determines back button behavior
     * 
     * - list: صفحة قائمة (لا يظهر زر عودة) / List page (no back button)
     * - detail: صفحة تفاصيل (يظهر زر عودة) / Detail page (shows back button)
     * - form: صفحة إنشاء/تعديل (يظهر زر عودة) / Create/Edit page (shows back button)
     * - report: صفحة تقرير (يظهر زر عودة) / Report page (shows back button)
     * 
     * @default "list"
     */
    variant?: "list" | "detail" | "form" | "report"

    /**
     * مسار العودة (إلزامي للصفحات المالية)
     * Back navigation path (mandatory for financial pages)
     * 
     * ⚠️ IMPORTANT: Financial pages (invoices, journal entries, payroll, etc.)
     * MUST provide backHref. Do not rely on router.back() for critical pages.
     * 
     * If not provided for non-financial pages, will use router.back()
     */
    backHref?: string

    /**
     * نص زر العودة (اختياري)
     * Back button label (optional)
     * 
     * @default "رجوع" / "Back" (based on language)
     */
    backLabel?: string

    /**
     * إخفاء زر العودة حتى لو كان variant يتطلبه
     * Hide back button even if variant requires it
     * 
     * @default false
     */
    hideBackButton?: boolean

    /**
     * أزرار الإجراءات (اختياري)
     * Action buttons (optional)
     * 
     * Examples: Save, Print, Export, Edit, Delete, etc.
     */
    actions?: ReactNode

    /**
     * محتوى إضافي في الرأس (اختياري)
     * Additional header content (optional)
     * 
     * 🎯 Use for:
     * - Status badges (Draft, Approved, Posted, etc.)
     * - Company/Branch badges
     * - Breadcrumbs
     * - Custom metadata
     * 
     * Example:
     * ```tsx
     * extra={
     *   <>
     *     <Badge variant="success">معتمد</Badge>
     *     <Badge variant="outline">الفرع الرئيسي</Badge>
     *   </>
     * }
     * ```
     */
    extra?: ReactNode

    /**
     * اللغة الحالية
     * Current language
     * 
     * @default "ar"
     */
    lang?: "ar" | "en"

    /**
     * CSS classes إضافية
     * Additional CSS classes
     */
    className?: string

    /**
     * إخفاء مُؤشّر مسار التَنقّل (Breadcrumbs)
     * Hide auto-generated breadcrumbs trail
     *
     * Defaults to false — breadcrumbs are shown automatically based on URL.
     * Set to true for pages where breadcrumbs are not desired
     * (e.g., dashboard, auth pages, full-screen reports).
     *
     * @default false
     */
    hideBreadcrumbs?: boolean
}

// ============================================================================
// Main Component
// ============================================================================

export function ERPPageHeader({
    title,
    description,
    variant = "list",
    backHref,
    backLabel,
    hideBackButton = false,
    actions,
    extra,
    lang = "ar",
    className = "",
    hideBreadcrumbs = false,
}: ERPPageHeaderProps) {
    const router = useRouter()

    // ============================================================================
    // Back Button Logic
    // ============================================================================

    // تحديد ما إذا كان يجب إظهار زر العودة
    // Determine if back button should be shown
    const showBackButton = !hideBackButton && variant !== "list"

    // تحديد اتجاه السهم حسب اللغة
    // Determine arrow direction based on language
    const BackIcon = lang === "ar" ? ArrowRight : ArrowLeft

    // تحديد نص زر العودة
    // Determine back button label
    const defaultBackLabel = lang === "ar" ? "رجوع" : "Back"
    const finalBackLabel = backLabel || defaultBackLabel

    // معالج زر العودة
    // Back button handler
    const handleBack = () => {
        if (backHref) {
            // ✅ Preferred: Navigate to specific path
            router.push(backHref)
        } else {
            // ⚠️ Fallback: Use router.back() (not recommended for financial pages)
            router.back()
        }
    }

    // ============================================================================
    // Render
    // ============================================================================

    return (
        <div className={`flex flex-col gap-3 mb-6 ${className}`}>
            {/* الصف العلوى: مُؤشّر مسار التَنقّل (Breadcrumbs) */}
            {/* Top row: Breadcrumbs trail */}
            {!hideBreadcrumbs && <SmartBreadcrumbs lang={lang} />}

            {/* الصف الأول: زر العودة + العنوان + الإجراءات */}
            {/* Row 1: Back button + Title + Actions */}
            <div className="flex items-center justify-between gap-4">

                {/* الجانب الأيمن/الأيسر: زر العودة + العنوان */}
                {/* Left/Right side: Back button + Title */}
                <div className="flex items-center gap-3 min-w-0 flex-1">

                    {/* زر العودة */}
                    {/* Back Button */}
                    {showBackButton && (
                        backHref ? (
                            // ✅ Link-based navigation (preferred)
                            <Link href={backHref}>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="flex-shrink-0"
                                    aria-label={finalBackLabel}
                                    title={finalBackLabel}
                                >
                                    <BackIcon className="h-5 w-5" />
                                </Button>
                            </Link>
                        ) : (
                            // ⚠️ router.back() fallback
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={handleBack}
                                className="flex-shrink-0"
                                aria-label={finalBackLabel}
                                title={finalBackLabel}
                            >
                                <BackIcon className="h-5 w-5" />
                            </Button>
                        )
                    )}

                    {/* العنوان والوصف */}
                    {/* Title and Description */}
                    <div className="min-w-0 flex-1">
                        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white truncate">
                            {title}
                        </h1>
                        {description && (
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                                {description}
                            </p>
                        )}
                    </div>
                </div>

                {/* الجانب الأيسر/الأيمن: الإجراءات */}
                {/* Right/Left side: Actions */}
                {actions && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                        {actions}
                    </div>
                )}
            </div>

            {/* الصف الثاني: محتوى إضافي (badges, breadcrumbs, etc.) */}
            {/* Row 2: Additional content (badges, breadcrumbs, etc.) */}
            {extra && (
                <div className="flex items-center gap-2 flex-wrap">
                    {extra}
                </div>
            )}
        </div>
    )
}

// ============================================================================
// Utility Hook for Language Detection
// ============================================================================

/**
 * Hook to detect current language from localStorage
 * يستخدم للحصول على اللغة الحالية من localStorage
 */
export function useERPLanguage(): "ar" | "en" {
    if (typeof window === "undefined") return "ar"

    try {
        const stored = localStorage.getItem("appLang")
        return (stored === "en" ? "en" : "ar") as "ar" | "en"
    } catch {
        return "ar"
    }
}

// ============================================================================
// Export
// ============================================================================

export default ERPPageHeader
