"use client"

import React from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Building2 } from "lucide-react"
import { useBranchFilter, type Branch } from "@/hooks/use-branch-filter"

export interface BranchFilterProps {
  /** اللغة */
  lang?: 'ar' | 'en'
  /** إظهار التسمية */
  showLabel?: boolean
  /** عرض الفلتر */
  width?: string
  /** تخصيص الـ className */
  className?: string
  /** callback عند تغيير الفرع */
  onBranchChange?: (branchId: string | null) => void
  /** استخدام hook خارجي (اختياري) */
  externalHook?: ReturnType<typeof useBranchFilter>
}

/**
 * 🔐 مكون فلتر الفروع الموحد
 * 
 * يظهر فقط للمستخدمين المصرح لهم (Owner / Admin / General Manager)
 * ويختفي تلقائياً للمستخدمين العاديين
 * 
 * @example
 * // استخدام بسيط
 * <BranchFilter onBranchChange={(branchId) => console.log(branchId)} />
 * 
 * // استخدام مع hook خارجي
 * const branchFilter = useBranchFilter()
 * <BranchFilter externalHook={branchFilter} />
 */
export function BranchFilter({
  lang = 'ar',
  showLabel = true,
  width = 'w-48',
  className = '',
  onBranchChange,
  externalHook,
}: BranchFilterProps) {
  // استخدام hook خارجي أو إنشاء واحد جديد
  const internalHook = useBranchFilter()
  const hook = externalHook || internalHook

  const {
    branches,
    selectedBranchId,
    setSelectedBranchId,
    canFilterByBranch,
    loading,
  } = hook

  // لا تظهر الفلتر إذا لم يكن المستخدم مصرحاً له
  if (!canFilterByBranch) {
    return null
  }

  const handleChange = (value: string) => {
    const branchId = value === 'all' ? null : value
    setSelectedBranchId(branchId)
    onBranchChange?.(branchId)
  }

  const labels = {
    ar: {
      label: 'الفرع',
      all: 'جميع الفروع',
      loading: 'جاري التحميل...',
    },
    en: {
      label: 'Branch',
      all: 'All Branches',
      loading: 'Loading...',
    }
  }

  const t = labels[lang]

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {showLabel && (
        <Label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
          <Building2 className="h-4 w-4" />
          {t.label}
        </Label>
      )}
      <Select
        value={selectedBranchId || 'all'}
        onValueChange={handleChange}
        disabled={loading}
      >
        <SelectTrigger className={`${width} bg-white dark:bg-slate-800`}>
          <SelectValue placeholder={loading ? t.loading : t.all} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">
            <span className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-gray-400" />
              {t.all}
            </span>
          </SelectItem>
          {branches.map((branch) => (
            <SelectItem key={branch.id} value={branch.id}>
              <span className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-blue-500" />
                {branch.name}
                {branch.code && (
                  <span className="text-xs text-gray-400">({branch.code})</span>
                )}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/**
 * مكون Badge لعرض اسم الفرع في الجداول
 */
export interface BranchBadgeProps {
  branchName: string | null | undefined
  color?: 'blue' | 'purple' | 'green' | 'orange' | 'pink' | 'cyan' | 'amber' | 'teal' | 'indigo'
  lang?: 'ar' | 'en'
}

const colorClasses = {
  blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  purple: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  green: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  orange: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  pink: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300',
  cyan: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  teal: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
  indigo: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
}

export function BranchBadge({ branchName, color = 'blue', lang = 'ar' }: BranchBadgeProps) {
  const defaultName = lang === 'en' ? 'Main' : 'رئيسي'
  
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colorClasses[color]}`}>
      {branchName || defaultName}
    </span>
  )
}

