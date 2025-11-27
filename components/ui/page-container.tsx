"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Sidebar } from "@/components/sidebar"

interface PageContainerProps {
  children: React.ReactNode
  className?: string
  withSidebar?: boolean
}

export function PageContainer({
  children,
  className,
  withSidebar = true,
}: PageContainerProps) {
  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      {withSidebar && <Sidebar />}
      <main className={cn(
        "flex-1 p-4 md:p-8",
        withSidebar && "md:mr-64",
        className
      )}>
        <div className="space-y-6">
          {children}
        </div>
      </main>
    </div>
  )
}

// مكون فرعي للمحتوى الرئيسي داخل Card
interface PageContentProps {
  children: React.ReactNode
  className?: string
}

export function PageContent({ children, className }: PageContentProps) {
  return (
    <div className={cn("bg-white dark:bg-slate-900 rounded-xl border shadow-sm", className)}>
      {children}
    </div>
  )
}

// مكون للتنبيهات والإشعارات في أعلى الصفحة
interface PageAlertProps {
  children: React.ReactNode
  variant?: "warning" | "error" | "success" | "info"
  icon?: React.ReactNode
  className?: string
}

const alertVariants = {
  warning: "border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/50 dark:to-yellow-950/50 dark:border-amber-800",
  error: "border-red-200 bg-gradient-to-r from-red-50 to-pink-50 dark:from-red-950/50 dark:to-pink-950/50 dark:border-red-800",
  success: "border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/50 dark:to-emerald-950/50 dark:border-green-800",
  info: "border-blue-200 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950/50 dark:to-cyan-950/50 dark:border-blue-800",
}

export function PageAlert({ children, variant = "info", icon, className }: PageAlertProps) {
  return (
    <div className={cn(
      "rounded-xl border p-5",
      alertVariants[variant],
      className
    )}>
      <div className="flex items-center gap-3">
        {icon}
        <div>{children}</div>
      </div>
    </div>
  )
}

// مكون لإحصائيات سريعة
interface StatsGridProps {
  children: React.ReactNode
  columns?: 2 | 3 | 4
  className?: string
}

export function StatsGrid({ children, columns = 4, className }: StatsGridProps) {
  const gridCols = {
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-2 lg:grid-cols-4",
  }
  
  return (
    <div className={cn("grid gap-4", gridCols[columns], className)}>
      {children}
    </div>
  )
}

