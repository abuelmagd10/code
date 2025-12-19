"use client"

import { useState, useEffect, useCallback } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FilterContainer } from "@/components/ui/filter-container"
import { LoadingState } from "@/components/ui/loading-state"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import { getActiveCompanyId } from "@/lib/company"
import { usePagination } from "@/lib/pagination"
import { DataPagination } from "@/components/data-pagination"
import { ListErrorBoundary } from "@/components/list-error-boundary"
import {
  Plus, Search, Building2, Package, TrendingDown, DollarSign,
  Filter, RefreshCcw, Eye, Edit2, Calculator, FileText,
  Car, Monitor, Sofa, Home, MapPin, Wrench, X
} from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import Link from "next/link"

// Utility function for number formatting
const formatNumber = (num: number) => {
  return num.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface AssetCategory {
  id: string
  code: string
  name: string
  default_useful_life_months: number
}

interface FixedAsset {
  id: string
  asset_code: string
  name: string
  description?: string
  purchase_date: string
  purchase_cost: number
  salvage_value: number
  useful_life_months: number
  depreciation_method: string
  status: string
  accumulated_depreciation: number
  book_value: number
  category_id: string
  branch_id?: string
  cost_center_id?: string
  asset_categories?: { name: string; code: string }
  branches?: { name?: string; branch_name?: string }
  cost_centers?: { cost_center_name?: string }
}

interface Stats {
  totalAssets: number
  totalCost: number
  totalDepreciation: number
  totalBookValue: number
  activeAssets: number
  fullyDepreciated: number
}

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  suspended: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  sold: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  disposed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  fully_depreciated: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
}

const statusLabels: Record<string, { ar: string; en: string }> = {
  draft: { ar: "مسودة", en: "Draft" },
  active: { ar: "نشط", en: "Active" },
  suspended: { ar: "معلق", en: "Suspended" },
  sold: { ar: "مباع", en: "Sold" },
  disposed: { ar: "مستبعد", en: "Disposed" },
  fully_depreciated: { ar: "مهلك بالكامل", en: "Fully Depreciated" }
}

const categoryIcons: Record<string, any> = {
  EQP: Wrench,
  VEH: Car,
  IT: Monitor,
  FUR: Sofa,
  BLD: Home,
  LND: MapPin
}

export default function FixedAssetsPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [currency, setCurrency] = useState('SAR')
  const [isLoading, setIsLoading] = useState(true)
  const [assets, setAssets] = useState<FixedAsset[]>([])
  const [categories, setCategories] = useState<AssetCategory[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [filterCategory, setFilterCategory] = useState<string>("all")
  const [stats, setStats] = useState<Stats>({
    totalAssets: 0, totalCost: 0, totalDepreciation: 0,
    totalBookValue: 0, activeAssets: 0, fullyDepreciated: 0
  })

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setAppLang((localStorage.getItem('app_language') as 'ar' | 'en') || 'ar')
      setCurrency(localStorage.getItem('company_currency') || 'SAR')
    }
  }, [])

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      // Load categories
      const { data: categoriesData } = await supabase
        .from("asset_categories")
        .select("*")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name")
      setCategories(categoriesData || [])

      // Load assets
      const { data: assetsData } = await supabase
        .from("fixed_assets")
        .select(`
          *,
          asset_categories(name, code),
          branches(name, branch_name),
          cost_centers(cost_center_name)
        `)
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
      setAssets(assetsData || [])

      // Calculate stats
      const assetsList = assetsData || []
      setStats({
        totalAssets: assetsList.length,
        totalCost: assetsList.reduce((sum: number, a: any) => sum + (a.purchase_cost || 0), 0),
        totalDepreciation: assetsList.reduce((sum: number, a: any) => sum + (a.accumulated_depreciation || 0), 0),
        totalBookValue: assetsList.reduce((sum: number, a: any) => sum + (a.book_value || 0), 0),
        activeAssets: assetsList.filter((a: any) => a.status === 'active').length,
        fullyDepreciated: assetsList.filter((a: any) => a.status === 'fully_depreciated').length
      })
    } catch (error) {
      console.error("Error loading assets:", error)
      toast({ title: appLang === 'en' ? "Error loading data" : "خطأ في تحميل البيانات", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }, [supabase, toast, appLang])

  useEffect(() => { loadData() }, [loadData])

  const filteredAssets = assets.filter((asset: any) => {
    if (filterStatus !== "all" && asset.status !== filterStatus) return false
    if (filterCategory !== "all" && asset.category_id !== filterCategory) return false
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      return asset.name.toLowerCase().includes(term) ||
             asset.asset_code.toLowerCase().includes(term) ||
             asset.asset_categories?.name?.toLowerCase().includes(term)
    }
    return true
  })

  if (isLoading) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <Sidebar />
        <main className="flex-1 p-4 md:p-6 lg:p-8">
          <LoadingState type="table" rows={8} />
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />

      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <ListErrorBoundary listType="generic" lang={appLang}>
        <div className="space-y-4 sm:space-y-6 max-w-full">
          {/* رأس الصفحة - تحسين للهاتف */}
          <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="p-2 sm:p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg sm:rounded-xl flex-shrink-0">
                  <Package className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">
                    {appLang === 'en' ? 'Fixed Assets' : 'الأصول الثابتة'}
                  </h1>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">
                    {appLang === 'en' ? 'Manage your company fixed assets and depreciation' : 'إدارة الأصول الثابتة والإهلاك'}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={loadData} disabled={isLoading}>
                  <RefreshCcw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                </Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      const response = await fetch('/api/fixed-assets/fix-database', {
                        method: 'POST'
                      })
                      if (response.ok) {
                        toast({ title: appLang === 'en' ? "Database fixed successfully" : "تم إصلاح قاعدة البيانات بنجاح" })
                      } else {
                        toast({ title: appLang === 'en' ? "Failed to fix database" : "فشل في إصلاح قاعدة البيانات", variant: "destructive" })
                      }
                    } catch (error) {
                      toast({ title: appLang === 'en' ? "Error fixing database" : "خطأ في إصلاح قاعدة البيانات", variant: "destructive" })
                    }
                  }}
                >
                  🔧 {appLang === 'en' ? 'Fix DB' : 'إصلاح DB'}
                </Button>
                <Link href="/fixed-assets/new">
                  <Button className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800">
                    <Plus className="w-4 h-4 mr-2" />
                    {appLang === 'en' ? 'Add Asset' : 'إضافة أصل'}
                  </Button>
                </Link>
              </div>
            </div>
          </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          <Card className="p-4 dark:bg-slate-900">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500">{appLang === 'en' ? 'Total Assets' : 'إجمالي الأصول'}</p>
                <p className="text-xl font-bold">{stats.totalAssets}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 dark:bg-slate-900">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500">{appLang === 'en' ? 'Total Cost' : 'إجمالي التكلفة'}</p>
                <p className="text-lg font-bold">{formatNumber(stats.totalCost)}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 dark:bg-slate-900">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500">{appLang === 'en' ? 'Depreciation' : 'مجمع الإهلاك'}</p>
                <p className="text-lg font-bold">{formatNumber(stats.totalDepreciation)}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 dark:bg-slate-900">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <Calculator className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500">{appLang === 'en' ? 'Book Value' : 'القيمة الدفترية'}</p>
                <p className="text-lg font-bold">{formatNumber(stats.totalBookValue)}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 dark:bg-slate-900">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                <Building2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500">{appLang === 'en' ? 'Active' : 'نشط'}</p>
                <p className="text-xl font-bold">{stats.activeAssets}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 dark:bg-slate-900">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <FileText className="h-5 w-5 text-gray-600 dark:text-gray-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500">{appLang === 'en' ? 'Fully Depreciated' : 'مهلك بالكامل'}</p>
                <p className="text-xl font-bold">{stats.fullyDepreciated}</p>
              </div>
            </div>
          </Card>
        </div>

          {/* Search Bar and Filters */}
          <FilterContainer
            title={appLang === 'en' ? 'Filters' : 'الفلاتر'}
            activeCount={[filterStatus !== "all", filterCategory !== "all", !!searchTerm].filter(Boolean).length}
            onClear={() => {
              setFilterStatus("all")
              setFilterCategory("all")
              setSearchTerm("")
            }}
            defaultOpen={false}
          >
            <div className="space-y-4">
              {/* Quick Search Bar */}
              <div>
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder={appLang === 'en' ? 'Search by name or code...' : 'ابحث بالاسم أو الكود...'}
                    className="pr-10 h-11 text-sm bg-gray-50 dark:bg-slate-800/50 border-gray-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-800"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm("")}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Filter Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* فلتر الحالة */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                    <Package className="w-4 h-4 text-blue-500" />
                    {appLang === 'en' ? 'Status' : 'الحالة'}
                  </label>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="h-10 text-sm bg-white dark:bg-slate-800">
                      <SelectValue placeholder={appLang === 'en' ? 'All Statuses' : 'كل الحالات'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{appLang === 'en' ? 'All Statuses' : 'كل الحالات'}</SelectItem>
                      {Object.entries(statusLabels).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{appLang === 'en' ? label.en : label.ar}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* فلتر الفئة */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                    <Building2 className="w-4 h-4 text-purple-500" />
                    {appLang === 'en' ? 'Category' : 'الفئة'}
                  </label>
                  <Select value={filterCategory} onValueChange={setFilterCategory}>
                    <SelectTrigger className="h-10 text-sm bg-white dark:bg-slate-800">
                      <SelectValue placeholder={appLang === 'en' ? 'All Categories' : 'كل الفئات'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{appLang === 'en' ? 'All Categories' : 'كل الفئات'}</SelectItem>
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* عرض الفلتر النشط - الحالة */}
              {filterStatus !== "all" && (
                <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-md">
                  <Package className="w-4 h-4" />
                  <span>
                    {appLang === 'en' ? 'Showing status: ' : 'عرض الحالة: '}
                    <strong>{statusLabels[filterStatus]?.[appLang === 'en' ? 'en' : 'ar'] || filterStatus}</strong>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFilterStatus("all")}
                    className="h-6 px-2 text-xs text-blue-600 hover:text-blue-800"
                  >
                    {appLang === 'en' ? 'Show All' : 'عرض الكل'}
                  </Button>
                </div>
              )}

              {/* عرض الفلتر النشط - الفئة */}
              {filterCategory !== "all" && (
                <div className="flex items-center gap-2 text-sm text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 px-3 py-2 rounded-md">
                  <Building2 className="w-4 h-4" />
                  <span>
                    {appLang === 'en' ? 'Showing category: ' : 'عرض الفئة: '}
                    <strong>{categories.find(c => c.id === filterCategory)?.name || filterCategory}</strong>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFilterCategory("all")}
                    className="h-6 px-2 text-xs text-purple-600 hover:text-purple-800"
                  >
                    {appLang === 'en' ? 'Show All' : 'عرض الكل'}
                  </Button>
                </div>
              )}
            </div>
          </FilterContainer>

          {/* Assets Table */}
          <Card>
            <CardHeader>
              <CardTitle>{appLang === 'en' ? 'Assets List' : 'قائمة الأصول'}</CardTitle>
            </CardHeader>
            <CardContent>
              {filteredAssets.length === 0 ? (
                <EmptyState
                  icon={Package}
                  title={appLang === 'en' ? 'No assets yet' : 'لا توجد أصول حتى الآن'}
                  description={appLang === 'en' ? 'Create your first fixed asset to get started' : 'أنشئ أول أصل ثابت للبدء'}
                />
              ) : (
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <table className="min-w-[600px] w-full text-sm">
                      <thead className="border-b bg-gray-50 dark:bg-slate-800">
                        <tr>
                          <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Code' : 'الكود'}</th>
                          <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Name' : 'الاسم'}</th>
                          <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white hidden sm:table-cell">{appLang === 'en' ? 'Category' : 'الفئة'}</th>
                          <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white hidden md:table-cell">{appLang === 'en' ? 'Cost' : 'التكلفة'}</th>
                          <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white hidden lg:table-cell">{appLang === 'en' ? 'Book Value' : 'القيمة الدفترية'}</th>
                          <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Status' : 'الحالة'}</th>
                          <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Actions' : 'الإجراءات'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredAssets.map((asset) => {
                          const CategoryIcon = categoryIcons[asset.asset_categories?.code || ''] || Package
                          return (
                            <tr key={asset.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-slate-800/50">
                              <td className="px-3 py-3 font-mono text-gray-900 dark:text-white">{asset.asset_code}</td>
                              <td className="px-3 py-3">
                                <div className="flex items-center gap-2">
                                  <CategoryIcon className="w-4 h-4 text-blue-500 flex-shrink-0" />
                                  <span className="font-medium text-gray-900 dark:text-white truncate">{asset.name}</span>
                                </div>
                              </td>
                              <td className="px-3 py-3 text-gray-600 dark:text-gray-400 hidden sm:table-cell">{asset.asset_categories?.name}</td>
                              <td className="px-3 py-3 text-gray-700 dark:text-gray-300 hidden md:table-cell">{formatNumber(asset.purchase_cost)}</td>
                              <td className="px-3 py-3 font-bold text-gray-900 dark:text-white hidden lg:table-cell">{formatNumber(asset.book_value)}</td>
                              <td className="px-3 py-3">
                                <Badge className={statusColors[asset.status] || statusColors.draft}>
                                  {statusLabels[asset.status]?.[appLang === 'en' ? 'en' : 'ar'] || asset.status}
                                </Badge>
                              </td>
                              <td className="px-3 py-3">
                                <div className="flex gap-1 flex-wrap">
                                  <Link href={`/fixed-assets/${asset.id}`}>
                                    <Button variant="outline" size="sm" title={appLang === 'en' ? 'View details' : 'عرض التفاصيل'}>
                                      <Eye className="w-4 h-4" />
                                    </Button>
                                  </Link>
                                  <Link href={`/fixed-assets/${asset.id}/edit`}>
                                    <Button variant="outline" size="sm" title={appLang === 'en' ? 'Edit asset' : 'تعديل الأصل'}>
                                      <Edit2 className="w-4 h-4" />
                                    </Button>
                                  </Link>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        </ListErrorBoundary>
      </main>
    </div>
  )
}

