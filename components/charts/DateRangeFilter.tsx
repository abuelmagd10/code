"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { CalendarDays, ChevronDown, Calendar, Clock, BarChart2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface DateRangeFilterProps {
  appLang?: 'ar' | 'en'
  className?: string
}

type PresetKey = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'this_quarter' | 'last_quarter' | 'this_year' | 'last_year' | 'custom'

const getDateRange = (preset: PresetKey): { from: string; to: string } => {
  const today = new Date()
  const formatDate = (d: Date) => d.toISOString().slice(0, 10)
  
  switch (preset) {
    case 'today':
      return { from: formatDate(today), to: formatDate(today) }
    case 'yesterday': {
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)
      return { from: formatDate(yesterday), to: formatDate(yesterday) }
    }
    case 'this_week': {
      const dayOfWeek = today.getDay()
      const startOfWeek = new Date(today)
      startOfWeek.setDate(today.getDate() - dayOfWeek)
      return { from: formatDate(startOfWeek), to: formatDate(today) }
    }
    case 'last_week': {
      const dayOfWeek = today.getDay()
      const endOfLastWeek = new Date(today)
      endOfLastWeek.setDate(today.getDate() - dayOfWeek - 1)
      const startOfLastWeek = new Date(endOfLastWeek)
      startOfLastWeek.setDate(endOfLastWeek.getDate() - 6)
      return { from: formatDate(startOfLastWeek), to: formatDate(endOfLastWeek) }
    }
    case 'this_month': {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
      return { from: formatDate(startOfMonth), to: formatDate(today) }
    }
    case 'last_month': {
      const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0)
      return { from: formatDate(startOfLastMonth), to: formatDate(endOfLastMonth) }
    }
    case 'this_quarter': {
      const quarter = Math.floor(today.getMonth() / 3)
      const startOfQuarter = new Date(today.getFullYear(), quarter * 3, 1)
      return { from: formatDate(startOfQuarter), to: formatDate(today) }
    }
    case 'last_quarter': {
      const quarter = Math.floor(today.getMonth() / 3)
      const startOfLastQuarter = new Date(today.getFullYear(), (quarter - 1) * 3, 1)
      const endOfLastQuarter = new Date(today.getFullYear(), quarter * 3, 0)
      return { from: formatDate(startOfLastQuarter), to: formatDate(endOfLastQuarter) }
    }
    case 'this_year': {
      const startOfYear = new Date(today.getFullYear(), 0, 1)
      return { from: formatDate(startOfYear), to: formatDate(today) }
    }
    case 'last_year': {
      const startOfLastYear = new Date(today.getFullYear() - 1, 0, 1)
      const endOfLastYear = new Date(today.getFullYear() - 1, 11, 31)
      return { from: formatDate(startOfLastYear), to: formatDate(endOfLastYear) }
    }
    default:
      return { from: '', to: '' }
  }
}

export default function DateRangeFilter({ appLang = 'ar', className }: DateRangeFilterProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  
  const [isOpen, setIsOpen] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState<PresetKey>('this_month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  
  const currentFrom = searchParams.get('from') || ''
  const currentTo = searchParams.get('to') || ''

  const L = appLang === 'en' ? {
    filterBy: 'Filter by',
    today: 'Today',
    yesterday: 'Yesterday',
    thisWeek: 'This Week',
    lastWeek: 'Last Week',
    thisMonth: 'This Month',
    lastMonth: 'Last Month',
    thisQuarter: 'This Quarter',
    lastQuarter: 'Last Quarter',
    thisYear: 'This Year',
    lastYear: 'Last Year',
    custom: 'Custom Range',
    from: 'From',
    to: 'To',
    apply: 'Apply',
    clear: 'Clear',
    quickFilters: 'Quick Filters',
    periods: 'Periods',
  } : {
    filterBy: 'تصفية حسب',
    today: 'اليوم',
    yesterday: 'أمس',
    thisWeek: 'هذا الأسبوع',
    lastWeek: 'الأسبوع الماضي',
    thisMonth: 'هذا الشهر',
    lastMonth: 'الشهر الماضي',
    thisQuarter: 'هذا الربع',
    lastQuarter: 'الربع الماضي',
    thisYear: 'هذه السنة',
    lastYear: 'السنة الماضية',
    custom: 'نطاق مخصص',
    from: 'من',
    to: 'إلى',
    apply: 'تطبيق',
    clear: 'مسح',
    quickFilters: 'فلاتر سريعة',
    periods: 'الفترات',
  }

  const presets: { key: PresetKey; label: string; icon?: any }[] = [
    { key: 'today', label: L.today },
    { key: 'yesterday', label: L.yesterday },
    { key: 'this_week', label: L.thisWeek },
    { key: 'last_week', label: L.lastWeek },
    { key: 'this_month', label: L.thisMonth },
    { key: 'last_month', label: L.lastMonth },
    { key: 'this_quarter', label: L.thisQuarter },
    { key: 'last_quarter', label: L.lastQuarter },
    { key: 'this_year', label: L.thisYear },
    { key: 'last_year', label: L.lastYear },
  ]

  const applyFilter = (from: string, to: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (from) params.set('from', from)
    else params.delete('from')
    if (to) params.set('to', to)
    else params.delete('to')
    router.push(`${pathname}?${params.toString()}`)
    setIsOpen(false)
  }

  const handlePresetClick = (preset: PresetKey) => {
    setSelectedPreset(preset)
    if (preset === 'custom') return
    const { from, to } = getDateRange(preset)
    applyFilter(from, to)
  }

  const handleCustomApply = () => {
    applyFilter(customFrom, customTo)
  }

  const clearFilter = () => {
    applyFilter('', '')
    setCustomFrom('')
    setCustomTo('')
  }

  const getDisplayText = () => {
    if (currentFrom && currentTo) {
      return `${currentFrom} → ${currentTo}`
    }
    if (currentFrom) return `${L.from}: ${currentFrom}`
    if (currentTo) return `${L.to}: ${currentTo}`
    return L.thisMonth
  }

  return (
    <div className={cn("relative", className)}>
      {/* Quick Filter Buttons */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
          <Clock className="w-4 h-4" />
          <span className="text-sm font-medium">{L.quickFilters}:</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {presets.slice(0, 6).map((preset) => (
            <button
              key={preset.key}
              onClick={() => handlePresetClick(preset.key)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-full transition-all duration-200",
                "border hover:shadow-md",
                selectedPreset === preset.key && currentFrom
                  ? "bg-gradient-to-r from-blue-500 to-indigo-500 text-white border-transparent shadow-lg shadow-blue-500/25"
                  : "bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600"
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Advanced Filter Dropdown */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative">
          <Button
            variant="outline"
            onClick={() => setIsOpen(!isOpen)}
            className="gap-2 bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700"
          >
            <CalendarDays className="w-4 h-4 text-blue-500" />
            <span className="text-sm">{getDisplayText()}</span>
            <ChevronDown className={cn("w-4 h-4 transition-transform", isOpen && "rotate-180")} />
          </Button>

          {isOpen && (
            <div className="absolute top-full mt-2 z-50 w-80 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 overflow-hidden">
              {/* Periods Grid */}
              <div className="p-4 border-b border-gray-100 dark:border-slate-800">
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 mb-3">
                  <BarChart2 className="w-4 h-4" />
                  <span className="text-sm font-medium">{L.periods}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {presets.map((preset) => (
                    <button
                      key={preset.key}
                      onClick={() => handlePresetClick(preset.key)}
                      className={cn(
                        "px-3 py-2 text-sm rounded-lg transition-all duration-200 text-right",
                        selectedPreset === preset.key
                          ? "bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-md"
                          : "bg-gray-50 dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700"
                      )}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Range */}
              <div className="p-4">
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 mb-3">
                  <Calendar className="w-4 h-4" />
                  <span className="text-sm font-medium">{L.custom}</span>
                </div>
                <div className="flex gap-2 mb-3">
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">{L.from}</label>
                    <input
                      type="date"
                      value={customFrom}
                      onChange={(e) => setCustomFrom(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">{L.to}</label>
                    <input
                      type="date"
                      value={customTo}
                      onChange={(e) => setCustomTo(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleCustomApply}
                    className="flex-1 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white shadow-lg shadow-blue-500/25"
                    size="sm"
                  >
                    {L.apply}
                  </Button>
                  <Button
                    onClick={clearFilter}
                    variant="outline"
                    className="flex-1"
                    size="sm"
                  >
                    {L.clear}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Active Filter Badge */}
        {(currentFrom || currentTo) && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg text-sm">
            <CalendarDays className="w-4 h-4" />
            <span>{currentFrom || '...'} → {currentTo || '...'}</span>
            <button
              onClick={clearFilter}
              className="ml-1 hover:bg-blue-100 dark:hover:bg-blue-800/50 rounded-full p-0.5"
            >
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
