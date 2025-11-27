"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

type StatusType = 
  | "draft" | "sent" | "paid" | "partially_paid" | "overdue" | "cancelled" | "void"
  | "pending" | "approved" | "rejected" | "completed" | "in_progress"
  | "active" | "inactive" | "expired"
  | "open" | "closed"
  | "delivered" | "shipped" | "processing"
  | string

interface StatusBadgeProps {
  status: StatusType
  lang?: "ar" | "en"
  className?: string
  showDot?: boolean
}

// ألوان الحالات
const statusColors: Record<string, string> = {
  // حالات الفواتير والمدفوعات
  draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  sent: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  paid: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  partially_paid: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300",
  overdue: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  void: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  
  // حالات عامة
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  approved: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  completed: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  in_progress: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  
  // حالات النشاط
  active: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  inactive: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  expired: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300",
  
  // حالات أخرى
  open: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  closed: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  delivered: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  shipped: "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300",
  processing: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
}

// ترجمة الحالات
const statusLabels: Record<string, { ar: string; en: string }> = {
  draft: { ar: "مسودة", en: "Draft" },
  sent: { ar: "مرسلة", en: "Sent" },
  paid: { ar: "مدفوعة", en: "Paid" },
  partially_paid: { ar: "مدفوعة جزئياً", en: "Partially Paid" },
  overdue: { ar: "متأخرة", en: "Overdue" },
  cancelled: { ar: "ملغاة", en: "Cancelled" },
  void: { ar: "ملغاة", en: "Void" },
  pending: { ar: "قيد الانتظار", en: "Pending" },
  approved: { ar: "موافق عليه", en: "Approved" },
  rejected: { ar: "مرفوض", en: "Rejected" },
  completed: { ar: "مكتمل", en: "Completed" },
  in_progress: { ar: "قيد التنفيذ", en: "In Progress" },
  active: { ar: "نشط", en: "Active" },
  inactive: { ar: "غير نشط", en: "Inactive" },
  expired: { ar: "منتهي", en: "Expired" },
  open: { ar: "مفتوح", en: "Open" },
  closed: { ar: "مغلق", en: "Closed" },
  delivered: { ar: "تم التسليم", en: "Delivered" },
  shipped: { ar: "تم الشحن", en: "Shipped" },
  processing: { ar: "جاري المعالجة", en: "Processing" },
}

// ألوان النقاط
const dotColors: Record<string, string> = {
  draft: "bg-gray-400",
  sent: "bg-blue-500",
  paid: "bg-green-500",
  partially_paid: "bg-yellow-500",
  overdue: "bg-red-500",
  cancelled: "bg-red-500",
  void: "bg-gray-400",
  pending: "bg-amber-500",
  approved: "bg-green-500",
  rejected: "bg-red-500",
  completed: "bg-green-500",
  in_progress: "bg-blue-500",
  active: "bg-green-500",
  inactive: "bg-gray-400",
  expired: "bg-orange-500",
  open: "bg-blue-500",
  closed: "bg-gray-400",
  delivered: "bg-green-500",
  shipped: "bg-purple-500",
  processing: "bg-blue-500",
}

export function StatusBadge({ status, lang = "ar", className, showDot = false }: StatusBadgeProps) {
  const normalizedStatus = status?.toLowerCase().replace(/ /g, "_") || "draft"
  const colorClass = statusColors[normalizedStatus] || statusColors.draft
  const label = statusLabels[normalizedStatus]?.[lang] || status
  const dotColor = dotColors[normalizedStatus] || "bg-gray-400"

  return (
    <Badge 
      variant="secondary" 
      className={cn(
        "font-medium px-2.5 py-0.5 text-xs rounded-full",
        colorClass,
        className
      )}
    >
      {showDot && (
        <span className={cn("w-1.5 h-1.5 rounded-full mr-1.5", dotColor)} />
      )}
      {label}
    </Badge>
  )
}

// دالة مساعدة للحصول على لون الحالة (للاستخدام خارج المكون)
export function getStatusColor(status: string): string {
  const normalizedStatus = status?.toLowerCase().replace(/ /g, "_") || "draft"
  return statusColors[normalizedStatus] || statusColors.draft
}

// دالة مساعدة للحصول على تسمية الحالة
export function getStatusLabel(status: string, lang: "ar" | "en" = "ar"): string {
  const normalizedStatus = status?.toLowerCase().replace(/ /g, "_") || "draft"
  return statusLabels[normalizedStatus]?.[lang] || status
}

