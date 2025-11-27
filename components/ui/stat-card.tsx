"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react"

interface StatCardProps {
  title: string
  titleEn?: string
  value: string | number
  subtitle?: string
  subtitleEn?: string
  icon?: LucideIcon
  iconColor?: "blue" | "green" | "purple" | "orange" | "red" | "teal" | "indigo" | "pink" | "amber"
  trend?: {
    value: number
    isPositive?: boolean
    label?: string
    labelEn?: string
  }
  className?: string
  lang?: "ar" | "en"
}

const iconColors = {
  blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  green: "bg-green-500/10 text-green-600 dark:text-green-400",
  purple: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  orange: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  red: "bg-red-500/10 text-red-600 dark:text-red-400",
  teal: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
  indigo: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  pink: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
}

const gradientColors = {
  blue: "from-blue-500/10 to-transparent",
  green: "from-green-500/10 to-transparent",
  purple: "from-purple-500/10 to-transparent",
  orange: "from-orange-500/10 to-transparent",
  red: "from-red-500/10 to-transparent",
  teal: "from-teal-500/10 to-transparent",
  indigo: "from-indigo-500/10 to-transparent",
  pink: "from-pink-500/10 to-transparent",
  amber: "from-amber-500/10 to-transparent",
}

export function StatCard({
  title,
  titleEn,
  value,
  subtitle,
  subtitleEn,
  icon: Icon,
  iconColor = "blue",
  trend,
  className,
  lang = "ar",
}: StatCardProps) {
  const displayTitle = lang === "en" && titleEn ? titleEn : title
  const displaySubtitle = lang === "en" && subtitleEn ? subtitleEn : subtitle
  const trendLabel = trend?.label && lang === "en" && trend.labelEn ? trend.labelEn : trend?.label

  return (
    <Card className={cn(
      "bg-white dark:bg-slate-900 border-0 shadow-sm hover:shadow-md transition-all overflow-hidden relative",
      className
    )}>
      {/* Gradient decoration */}
      <div className={cn(
        "absolute top-0 right-0 w-32 h-32 bg-gradient-to-br rounded-bl-full",
        gradientColors[iconColor]
      )} />
      
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {displayTitle}
            </p>
            <p className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white">
              {value}
            </p>
            {displaySubtitle && (
              <p className="text-xs text-gray-400">{displaySubtitle}</p>
            )}
            {trend && (
              <div className="flex items-center gap-1 mt-1">
                {trend.isPositive ? (
                  <TrendingUp className="w-4 h-4 text-green-500" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-red-500" />
                )}
                <span className={cn(
                  "text-xs font-medium",
                  trend.isPositive ? "text-green-600" : "text-red-600"
                )}>
                  {trend.value > 0 ? "+" : ""}{trend.value}%
                </span>
                {trendLabel && (
                  <span className="text-xs text-gray-400">{trendLabel}</span>
                )}
              </div>
            )}
          </div>
          
          {Icon && (
            <div className={cn("p-3 rounded-xl", iconColors[iconColor])}>
              <Icon className="w-6 h-6" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// مكون بسيط للإحصائيات الصغيرة
interface MiniStatProps {
  label: string
  value: string | number
  icon?: LucideIcon
  color?: "blue" | "green" | "red" | "amber"
  className?: string
}

const miniColors = {
  blue: "text-blue-600",
  green: "text-green-600",
  red: "text-red-600",
  amber: "text-amber-600",
}

export function MiniStat({ label, value, icon: Icon, color = "blue", className }: MiniStatProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {Icon && <Icon className={cn("w-4 h-4", miniColors[color])} />}
      <span className="text-sm text-gray-500">{label}:</span>
      <span className={cn("font-semibold", miniColors[color])}>{value}</span>
    </div>
  )
}

