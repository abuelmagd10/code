"use client"

import React, { useMemo } from "react"
import { DataTable, type DataTableColumn, type DataTableProps, type DataTableFooterProps } from "@/components/DataTable"
import { BranchFilter, BranchBadge, type BranchBadgeProps } from "@/components/BranchFilter"
import { useBranchFilter, type UseBranchFilterReturn } from "@/hooks/use-branch-filter"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search, RefreshCw, Download, Plus, Filter, X } from "lucide-react"

export interface BranchAwareDataTableProps<T = any> extends Omit<DataTableProps<T>, 'data'> {
  /** البيانات الأصلية */
  data: T[]
  /** عنوان الجدول */
  title?: string
  /** أيقونة العنوان */
  titleIcon?: React.ReactNode
  /** إظهار فلتر الفروع */
  showBranchFilter?: boolean
  /** إظهار حقل البحث */
  showSearch?: boolean
  /** placeholder للبحث */
  searchPlaceholder?: string
  /** دالة البحث المخصصة */
  onSearch?: (query: string) => void
  /** قيمة البحث الحالية */
  searchValue?: string
  /** إظهار زر التحديث */
  showRefresh?: boolean
  /** دالة التحديث */
  onRefresh?: () => void
  /** إظهار زر التصدير */
  showExport?: boolean
  /** دالة التصدير */
  onExport?: () => void
  /** إظهار زر الإضافة */
  showAdd?: boolean
  /** نص زر الإضافة */
  addButtonText?: string
  /** دالة الإضافة */
  onAdd?: () => void
  /** لون badge الفرع */
  branchBadgeColor?: BranchBadgeProps['color']
  /** حقل الفرع في البيانات */
  branchField?: string
  /** حقل اسم الفرع في البيانات (للعلاقات) */
  branchNameField?: string
  /** فلترة البيانات حسب الفرع المحدد */
  filterBySelectedBranch?: boolean
  /** hook خارجي للفروع */
  branchFilterHook?: UseBranchFilterReturn
  /** إظهار عدد النتائج */
  showCount?: boolean
  /** محتوى إضافي في الـ header */
  headerExtra?: React.ReactNode
  /** محتوى إضافي في الفلاتر */
  filtersExtra?: React.ReactNode
  /** حالة التحميل */
  loading?: boolean
  /** رسالة التحميل */
  loadingMessage?: string
}

/**
 * 🔐 جدول بيانات موحد مع دعم فلترة الفروع
 * 
 * يدمج:
 * - DataTable الأساسي
 * - فلتر الفروع (يظهر فقط للمصرح لهم)
 * - حقل البحث
 * - أزرار الإجراءات (تحديث، تصدير، إضافة)
 * - عمود الفرع تلقائياً
 * 
 * @example
 * <BranchAwareDataTable
 *   title="فواتير البيع"
 *   data={invoices}
 *   columns={columns}
 *   keyField="id"
 *   showBranchFilter
 *   showSearch
 *   onSearch={setSearchQuery}
 *   showAdd
 *   onAdd={() => router.push('/invoices/new')}
 * />
 */
export function BranchAwareDataTable<T extends Record<string, any> = any>({
  data,
  columns,
  title,
  titleIcon,
  showBranchFilter = true,
  showSearch = false,
  searchPlaceholder,
  onSearch,
  searchValue = '',
  showRefresh = false,
  onRefresh,
  showExport = false,
  onExport,
  showAdd = false,
  addButtonText,
  onAdd,
  branchBadgeColor = 'blue',
  branchField = 'branch_id',
  branchNameField = 'branches.name',
  filterBySelectedBranch = true,
  branchFilterHook,
  showCount = true,
  headerExtra,
  filtersExtra,
  loading = false,
  loadingMessage,
  lang = 'ar',
  ...tableProps
}: BranchAwareDataTableProps<T>) {
  // استخدام hook خارجي أو إنشاء واحد جديد
  const internalHook = useBranchFilter()
  const branchHook = branchFilterHook || internalHook

  const { selectedBranchId, canFilterByBranch, getFilteredBranchId, getBranchName } = branchHook

  // فلترة البيانات حسب الفرع المحدد
  const filteredData = useMemo(() => {
    if (!filterBySelectedBranch) return data
    
    const branchIdToFilter = getFilteredBranchId()
    if (!branchIdToFilter) return data
    
    return data.filter((item) => {
      const itemBranchId = item[branchField]
      return itemBranchId === branchIdToFilter
    })
  }, [data, filterBySelectedBranch, getFilteredBranchId, branchField])

  // إضافة عمود الفرع تلقائياً إذا لم يكن موجوداً
  const enhancedColumns = useMemo(() => {
    const hasBranchColumn = columns.some(col => col.key === branchField || col.key === branchNameField)
    
    if (hasBranchColumn) return columns
    
    // إضافة عمود الفرع بعد العمود الأول
    const branchColumn: DataTableColumn<T> = {
      key: branchNameField,
      header: lang === 'en' ? 'Branch' : 'الفرع',
      type: 'custom',
      width: 'w-28',
      format: (value, row) => {
        const branchName = branchNameField.includes('.')
          ? branchNameField.split('.').reduce((obj: any, key) => obj?.[key], row)
          : row[branchNameField]
        return <BranchBadge branchName={branchName} color={branchBadgeColor} lang={lang} />
      }
    }
    
    return [columns[0], branchColumn, ...columns.slice(1)]
  }, [columns, branchField, branchNameField, branchBadgeColor, lang])

  const labels = {
    ar: {
      search: 'بحث...',
      refresh: 'تحديث',
      export: 'تصدير',
      add: 'إضافة',
      count: 'عدد النتائج',
      loading: 'جاري التحميل...',
      clearFilters: 'مسح الفلاتر',
    },
    en: {
      search: 'Search...',
      refresh: 'Refresh',
      export: 'Export',
      add: 'Add',
      count: 'Results',
      loading: 'Loading...',
      clearFilters: 'Clear Filters',
    }
  }

  const t = labels[lang]

  return (
    <Card>
      {/* Header */}
      {(title || showBranchFilter || showSearch || showRefresh || showExport || showAdd || headerExtra) && (
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            {/* العنوان */}
            {title && (
              <CardTitle className="flex items-center gap-2 text-lg">
                {titleIcon}
                {title}
                {showCount && (
                  <span className="text-sm font-normal text-gray-500">
                    ({filteredData.length} {t.count})
                  </span>
                )}
              </CardTitle>
            )}
            
            {/* الأزرار */}
            <div className="flex items-center gap-2">
              {showRefresh && onRefresh && (
                <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
              )}
              {showExport && onExport && (
                <Button variant="outline" size="sm" onClick={onExport}>
                  <Download className="h-4 w-4" />
                </Button>
              )}
              {showAdd && onAdd && (
                <Button size="sm" onClick={onAdd}>
                  <Plus className="h-4 w-4 mr-1" />
                  {addButtonText || t.add}
                </Button>
              )}
              {headerExtra}
            </div>
          </div>
        </CardHeader>
      )}
      
      <CardContent>
        {/* الفلاتر */}
        {(showBranchFilter || showSearch || filtersExtra) && (
          <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              {/* فلتر الفروع */}
              {showBranchFilter && (
                <BranchFilter
                  lang={lang}
                  externalHook={branchHook}
                />
              )}
              
              {/* فلاتر إضافية */}
              {filtersExtra}
            </div>
            
            {/* حقل البحث */}
            {showSearch && onSearch && (
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder={searchPlaceholder || t.search}
                  value={searchValue}
                  onChange={(e) => onSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            )}
          </div>
        )}
        
        {/* الجدول */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
            <span className="ml-2 text-gray-500">{loadingMessage || t.loading}</span>
          </div>
        ) : (
          <DataTable
            {...tableProps}
            columns={enhancedColumns}
            data={filteredData}
            lang={lang}
          />
        )}
      </CardContent>
    </Card>
  )
}

