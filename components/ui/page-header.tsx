"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { LucideIcon } from "lucide-react"

interface PageHeaderProps {
  title: string
  titleEn?: string
  description?: string
  descriptionEn?: string
  icon?: LucideIcon
  iconColor?: "blue" | "green" | "purple" | "orange" | "red" | "teal" | "indigo" | "pink"
  children?: React.ReactNode
  className?: string
  lang?: "ar" | "en"
}

const iconColors = {
  blue: "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
  green: "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400",
  purple: "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400",
  orange: "bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400",
  red: "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400",
  teal: "bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400",
  indigo: "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400",
  pink: "bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400",
}

export function PageHeader({
  title,
  titleEn,
  description,
  descriptionEn,
  icon: Icon,
  iconColor = "blue",
  children,
  className,
  lang = "ar",
}: PageHeaderProps) {
  const displayTitle = lang === "en" && titleEn ? titleEn : title
  const displayDescription = lang === "en" && descriptionEn ? descriptionEn : description

  return (
    <div className={cn("flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4", className)}>
      <div className="flex items-center gap-4">
        {Icon && (
          <div className={cn("p-3 rounded-xl", iconColors[iconColor])}>
            <Icon className="w-6 h-6" />
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {displayTitle}
          </h1>
          {displayDescription && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {displayDescription}
            </p>
          )}
        </div>
      </div>
      {children && (
        <div className="flex items-center gap-2 flex-wrap">
          {children}
        </div>
      )}
    </div>
  )
}

// مكون فرعي لمجموعة الأزرار
interface PageHeaderActionsProps {
  children: React.ReactNode
  className?: string
}

export function PageHeaderActions({ children, className }: PageHeaderActionsProps) {
  return (
    <div className={cn("flex items-center gap-2 flex-wrap", className)}>
      {children}
    </div>
  )
}

