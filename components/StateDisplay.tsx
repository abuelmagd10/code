/**
 * StateDisplay — Unified Empty/Error/Loading states
 * شاشات موحدة لحالات: لا بيانات / خطأ / جارى التحميل
 *
 * v3.49.0 — UI Phase 1 Step 10 (FINAL)
 *
 * Replaces scattered patterns across 209 pages:
 *   - inline `<div>لا توجد بيانات</div>`
 *   - silent error swallowing in try/catch
 *   - bare `<Loader2 spinning />` everywhere
 *   - `return null` blank screens
 *
 * Provides 3 composable components + a generic wrapper:
 *   <EmptyState>   for empty lists / no results
 *   <ErrorState>   for fetch/render failures with retry
 *   <LoadingState> for in-flight skeletons
 *   <StateDisplay> auto-picks based on { loading, error, data }
 */

"use client"

import * as React from "react"
import {
  Inbox, AlertTriangle, Loader2, RefreshCw, Plus, Search,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// ─────────────────────────────────────────────────────────────────────────────
// EmptyState
// ─────────────────────────────────────────────────────────────────────────────

export interface EmptyStateProps {
  /** Icon (defaults to Inbox) */
  icon?: LucideIcon
  /** Main heading */
  title: string
  /** Supporting description */
  description?: string
  /** Optional primary action */
  action?: {
    label: string
    onClick?: () => void
    href?: string
    icon?: LucideIcon
  }
  /** Optional secondary action */
  secondaryAction?: {
    label: string
    onClick?: () => void
    href?: string
  }
  /** Visual variant */
  variant?: "default" | "search" | "no-permission"
  /** Compact mode (less vertical padding) */
  compact?: boolean
  className?: string
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  variant = "default",
  compact = false,
  className = "",
}: EmptyStateProps) {
  const Icon = icon || (variant === "search" ? Search : Inbox)
  const ActionIcon = action?.icon || (variant === "default" ? Plus : undefined)

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center px-4",
        compact ? "py-8" : "py-16 sm:py-20",
        className,
      )}
    >
      <div className="rounded-full bg-muted p-4 mb-4">
        <Icon className="h-10 w-10 text-muted-foreground" aria-hidden />
      </div>
      <h3 className="text-lg sm:text-xl font-semibold text-foreground mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-md mb-6">{description}</p>
      )}
      {(action || secondaryAction) && (
        <div className="flex flex-col sm:flex-row gap-2 items-center">
          {action && (
            action.href ? (
              <a
                href={action.href}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity tap-target"
              >
                {ActionIcon && <ActionIcon className="h-4 w-4" />}
                <span>{action.label}</span>
              </a>
            ) : (
              <Button onClick={action.onClick} className="tap-target">
                {ActionIcon && <ActionIcon className="h-4 w-4 mr-2" />}
                {action.label}
              </Button>
            )
          )}
          {secondaryAction && (
            secondaryAction.href ? (
              <a
                href={secondaryAction.href}
                className="inline-flex items-center px-5 py-2.5 rounded-lg border border-border bg-card text-foreground font-medium hover:bg-accent tap-target"
              >
                {secondaryAction.label}
              </a>
            ) : (
              <Button variant="outline" onClick={secondaryAction.onClick} className="tap-target">
                {secondaryAction.label}
              </Button>
            )
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ErrorState
// ─────────────────────────────────────────────────────────────────────────────

export interface ErrorStateProps {
  /** Main heading */
  title?: string
  /** Detailed description (defaults to error.message) */
  description?: string
  /** The error object (used to extract message if description not provided) */
  error?: Error | { message?: string } | null
  /** Retry handler — shows a retry button if provided */
  onRetry?: () => void
  /** Language */
  lang?: "ar" | "en"
  /** Compact mode */
  compact?: boolean
  className?: string
}

export function ErrorState({
  title,
  description,
  error,
  onRetry,
  lang = "ar",
  compact = false,
  className = "",
}: ErrorStateProps) {
  const labels = {
    ar: {
      title: "حَدَث خَطأ غير مُتوَقَّع",
      desc: "تَعذَّر تَحميل البيانات. يُمكنك المُحاولة مرة أُخرى.",
      retry: "إعادة المُحاولة",
    },
    en: {
      title: "Something went wrong",
      desc: "We couldn't load the data. Please try again.",
      retry: "Retry",
    },
  }[lang]

  const finalTitle = title || labels.title
  const finalDesc = description || (error?.message) || labels.desc

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center px-4",
        compact ? "py-8" : "py-16 sm:py-20",
        className,
      )}
      role="alert"
    >
      <div className="rounded-full bg-destructive/10 p-4 mb-4">
        <AlertTriangle className="h-10 w-10 text-destructive" aria-hidden />
      </div>
      <h3 className="text-lg sm:text-xl font-semibold text-foreground mb-2">{finalTitle}</h3>
      <p className="text-sm text-muted-foreground max-w-md mb-6">{finalDesc}</p>
      {onRetry && (
        <Button onClick={onRetry} variant="outline" className="tap-target gap-2">
          <RefreshCw className="h-4 w-4" />
          {labels.retry}
        </Button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// LoadingState
// ─────────────────────────────────────────────────────────────────────────────

export interface LoadingStateProps {
  /** Custom label (defaults to "جارى التحميل...") */
  label?: string
  /** Compact mode */
  compact?: boolean
  /** Variant — spinner | skeleton-rows | skeleton-cards */
  variant?: "spinner" | "skeleton-rows" | "skeleton-cards"
  /** Number of skeleton items (only for skeleton variants) */
  count?: number
  lang?: "ar" | "en"
  className?: string
}

export function LoadingState({
  label,
  compact = false,
  variant = "spinner",
  count = 5,
  lang = "ar",
  className = "",
}: LoadingStateProps) {
  const defaultLabel = lang === "ar" ? "جارى التَحميل..." : "Loading..."
  const finalLabel = label ?? defaultLabel

  if (variant === "skeleton-rows") {
    return (
      <div className={cn("space-y-2", className)} aria-busy="true" aria-label={finalLabel}>
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="h-12 rounded-md bg-muted animate-pulse"
            style={{ animationDelay: `${i * 50}ms` }}
          />
        ))}
      </div>
    )
  }

  if (variant === "skeleton-cards") {
    return (
      <div
        className={cn("grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4", className)}
        aria-busy="true"
        aria-label={finalLabel}
      >
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="h-32 rounded-lg bg-muted animate-pulse"
            style={{ animationDelay: `${i * 75}ms` }}
          />
        ))}
      </div>
    )
  }

  // Spinner variant (default)
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 text-muted-foreground",
        compact ? "py-8" : "py-16",
        className,
      )}
      aria-busy="true"
      aria-label={finalLabel}
    >
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      {finalLabel && <p className="text-sm">{finalLabel}</p>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// StateDisplay — smart wrapper
// ─────────────────────────────────────────────────────────────────────────────

export interface StateDisplayProps {
  loading?: boolean
  error?: Error | { message?: string } | null
  /** Whether the data list/object is empty */
  isEmpty?: boolean
  /** Props forwarded to <EmptyState /> when isEmpty */
  emptyProps?: EmptyStateProps
  /** Props forwarded to <ErrorState /> when error */
  errorProps?: Omit<ErrorStateProps, "error">
  /** Props forwarded to <LoadingState /> when loading */
  loadingProps?: LoadingStateProps
  /** Content to render when not empty, no error, not loading */
  children: React.ReactNode
}

/**
 * Auto-pick the right state component based on flags.
 * Order: loading > error > empty > children.
 *
 * Usage:
 *   <StateDisplay
 *     loading={isLoading}
 *     error={error}
 *     isEmpty={items.length === 0}
 *     emptyProps={{ title: "لا توجد فواتير", action: { label: "إنشاء فاتورة", href: "/invoices/new" } }}
 *     errorProps={{ onRetry: () => refetch() }}
 *   >
 *     <InvoiceTable items={items} />
 *   </StateDisplay>
 */
export function StateDisplay({
  loading,
  error,
  isEmpty,
  emptyProps,
  errorProps,
  loadingProps,
  children,
}: StateDisplayProps) {
  if (loading) return <LoadingState {...loadingProps} />
  if (error) return <ErrorState error={error} {...errorProps} />
  if (isEmpty && emptyProps) return <EmptyState {...emptyProps} />
  return <>{children}</>
}

export default StateDisplay
