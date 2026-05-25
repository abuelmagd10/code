/**
 * StatusBadge — Unified Status Color Component
 * مكون مُوحَّد لعرض الحالات بألوان dark-mode-safe
 *
 * v3.43.0 — UI Phase 1 Step 4
 *
 * Replaces 180+ scattered hardcoded color usages like:
 *   - text-green-600 bg-green-100        → use <StatusBadge variant="success">
 *   - text-red-600 bg-red-100            → use <StatusBadge variant="error">
 *   - text-orange-600 bg-orange-100      → use <StatusBadge variant="warning">
 *   - text-blue-600 bg-blue-100          → use <StatusBadge variant="info">
 *
 * Built on CSS variables (--success, --warning, --info, --destructive)
 * defined in app/globals.css with proper dark-mode counterparts.
 *
 * Usage:
 *   <StatusBadge variant="success">معتمد</StatusBadge>
 *   <StatusBadge variant="warning" size="sm">قيد المراجعة</StatusBadge>
 *   <StatusBadge variant="error" outline>مرفوض</StatusBadge>
 */

import * as React from "react"
import { cn } from "@/lib/utils"
import {
  CheckCircle2, XCircle, AlertTriangle, Info, Clock,
  type LucideIcon,
} from "lucide-react"

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type StatusVariant = "success" | "error" | "warning" | "info" | "neutral" | "pending"
export type StatusSize = "xs" | "sm" | "md" | "lg"

export interface StatusBadgeProps {
  /** Visual variant — determines color + icon */
  variant?: StatusVariant
  /** Size */
  size?: StatusSize
  /** Outline style instead of filled background */
  outline?: boolean
  /** Show icon (default true for filled, false for outline) */
  withIcon?: boolean
  /** Override icon */
  icon?: LucideIcon
  /** Custom className */
  className?: string
  /** Pulse animation (e.g. for "live" / "processing" states) */
  pulse?: boolean
  /** Content */
  children: React.ReactNode
}

// ─────────────────────────────────────────────────────────────────────────────
// Variant configs — using CSS variables from globals.css
// ─────────────────────────────────────────────────────────────────────────────

const VARIANT_STYLES: Record<StatusVariant, { filled: string; outline: string; icon: LucideIcon }> = {
  success: {
    filled: "bg-success-muted text-success border-success/20",
    outline: "border-success/40 text-success",
    icon: CheckCircle2,
  },
  error: {
    filled: "bg-destructive/10 text-destructive border-destructive/20",
    outline: "border-destructive/40 text-destructive",
    icon: XCircle,
  },
  warning: {
    filled: "bg-warning-muted text-warning border-warning/20",
    outline: "border-warning/40 text-warning",
    icon: AlertTriangle,
  },
  info: {
    filled: "bg-info-muted text-info border-info/20",
    outline: "border-info/40 text-info",
    icon: Info,
  },
  neutral: {
    filled: "bg-muted text-muted-foreground border-border",
    outline: "border-border text-muted-foreground",
    icon: Info,
  },
  pending: {
    filled: "bg-warning-muted text-warning border-warning/20",
    outline: "border-warning/40 text-warning",
    icon: Clock,
  },
}

const SIZE_STYLES: Record<StatusSize, { container: string; icon: string }> = {
  xs: { container: "text-[10px] px-1.5 py-0.5 gap-1", icon: "h-3 w-3" },
  sm: { container: "text-xs px-2 py-0.5 gap-1", icon: "h-3.5 w-3.5" },
  md: { container: "text-sm px-2.5 py-1 gap-1.5", icon: "h-4 w-4" },
  lg: { container: "text-base px-3 py-1.5 gap-2", icon: "h-5 w-5" },
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function StatusBadge({
  variant = "neutral",
  size = "sm",
  outline = false,
  withIcon,
  icon,
  className = "",
  pulse = false,
  children,
}: StatusBadgeProps) {
  const config = VARIANT_STYLES[variant]
  const sizeStyle = SIZE_STYLES[size]
  const showIcon = withIcon ?? !outline
  const Icon = icon || config.icon

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border font-medium whitespace-nowrap transition-colors",
        outline ? config.outline + " bg-transparent" : config.filled,
        sizeStyle.container,
        pulse && "animate-pulse",
        className,
      )}
    >
      {showIcon && <Icon className={cn(sizeStyle.icon, "flex-shrink-0")} aria-hidden />}
      <span>{children}</span>
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience helpers — map common Arabic status text to a variant
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_TEXT_MAP: Record<string, StatusVariant> = {
  // success
  "معتمد": "success", "مدفوع": "success", "مكتمل": "success", "نشط": "success",
  "مسلَّم": "success", "موافق": "success", "مفعَّل": "success",
  approved: "success", paid: "success", completed: "success", active: "success",
  delivered: "success", success: "success",
  // error
  "مرفوض": "error", "ملغى": "error", "ملغاة": "error", "فشل": "error",
  "خطأ": "error", "معلَّق": "error", "موقوف": "error",
  rejected: "error", canceled: "error", cancelled: "error", failed: "error",
  error: "error", suspended: "error",
  // warning
  "تحذير": "warning", "تجاوز": "warning", "مستحق": "warning", "متأخر": "warning",
  warning: "warning", overdue: "warning", "past_due": "warning",
  // pending
  "قيد المراجعة": "pending", "قيد الانتظار": "pending", "مسودة": "pending",
  "قيد التنفيذ": "pending",
  pending: "pending", draft: "pending", processing: "pending", "pending_approval": "pending",
  // info
  "مَعلومة": "info", "جديد": "info",
  info: "info", new: "info",
}

/**
 * Infer a variant from a status string.
 * Falls back to "neutral" if no match.
 */
export function inferStatusVariant(status: string | null | undefined): StatusVariant {
  if (!status) return "neutral"
  const key = status.toLowerCase().trim()
  return STATUS_TEXT_MAP[key] || STATUS_TEXT_MAP[status] || "neutral"
}

export default StatusBadge
