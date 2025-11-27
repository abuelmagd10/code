"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search, Download, Filter, RefreshCw, LucideIcon } from "lucide-react"

interface Column<T> {
  key: keyof T | string
  title: string
  titleEn?: string
  render?: (item: T, index: number) => React.ReactNode
  className?: string
  align?: "right" | "left" | "center"
}

interface DataTableProps<T> {
  data: T[]
  columns: Column<T>[]
  title?: string
  titleEn?: string
  icon?: LucideIcon
  iconColor?: string
  isLoading?: boolean
  emptyMessage?: string
  emptyMessageEn?: string
  searchable?: boolean
  searchPlaceholder?: string
  searchPlaceholderEn?: string
  onSearch?: (query: string) => void
  searchValue?: string
  onRefresh?: () => void
  onExport?: () => void
  lang?: "ar" | "en"
  className?: string
  headerActions?: React.ReactNode
  keyExtractor?: (item: T, index: number) => string
}

export function DataTable<T extends Record<string, any>>({
  data,
  columns,
  title,
  titleEn,
  icon: Icon,
  iconColor = "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
  isLoading = false,
  emptyMessage = "لا توجد بيانات",
  emptyMessageEn = "No data available",
  searchable = false,
  searchPlaceholder = "بحث...",
  searchPlaceholderEn = "Search...",
  onSearch,
  searchValue = "",
  onRefresh,
  onExport,
  lang = "ar",
  className,
  headerActions,
  keyExtractor,
}: DataTableProps<T>) {
  const displayTitle = lang === "en" && titleEn ? titleEn : title
  const displayEmpty = lang === "en" ? emptyMessageEn : emptyMessage
  const displaySearchPlaceholder = lang === "en" ? searchPlaceholderEn : searchPlaceholder

  return (
    <Card className={cn("bg-white dark:bg-slate-900 border-0 shadow-sm", className)}>
      {(title || searchable || headerActions) && (
        <CardHeader className="border-b border-gray-100 dark:border-slate-800 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            {/* العنوان */}
            {displayTitle && (
              <div className="flex items-center gap-3">
                {Icon && (
                  <div className={cn("p-2 rounded-lg", iconColor)}>
                    <Icon className="w-5 h-5" />
                  </div>
                )}
                <CardTitle className="text-lg">{displayTitle}</CardTitle>
              </div>
            )}
            
            {/* أدوات البحث والإجراءات */}
            <div className="flex items-center gap-2 flex-wrap">
              {searchable && (
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder={displaySearchPlaceholder}
                    value={searchValue}
                    onChange={(e) => onSearch?.(e.target.value)}
                    className="pr-9 w-[200px]"
                  />
                </div>
              )}
              {onRefresh && (
                <Button variant="outline" size="icon" onClick={onRefresh}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              )}
              {onExport && (
                <Button variant="outline" size="icon" onClick={onExport}>
                  <Download className="h-4 w-4" />
                </Button>
              )}
              {headerActions}
            </div>
          </div>
        </CardHeader>
      )}
      
      <CardContent className={title ? "pt-0" : ""}>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : data.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            {displayEmpty}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b bg-gray-50 dark:bg-slate-800/50">
                <tr>
                  {columns.map((col, i) => (
                    <th
                      key={String(col.key) + i}
                      className={cn(
                        "px-4 py-3 font-semibold text-gray-600 dark:text-gray-300",
                        col.align === "left" ? "text-left" : col.align === "center" ? "text-center" : "text-right",
                        col.className
                      )}
                    >
                      {lang === "en" && col.titleEn ? col.titleEn : col.title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                {data.map((item, index) => (
                  <tr
                    key={keyExtractor ? keyExtractor(item, index) : item.id || index}
                    className="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    {columns.map((col, colIndex) => (
                      <td
                        key={String(col.key) + colIndex}
                        className={cn(
                          "px-4 py-3",
                          col.align === "left" ? "text-left" : col.align === "center" ? "text-center" : "text-right",
                          col.className
                        )}
                      >
                        {col.render 
                          ? col.render(item, index) 
                          : item[col.key as keyof T] as React.ReactNode}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

