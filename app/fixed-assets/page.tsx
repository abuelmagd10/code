"use client"

import { useState, useEffect, useCallback, useTransition } from "react"
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
import { canAction, canAdvancedAction } from "@/lib/authz"
import { type UserContext } from "@/lib/validation"
import {
  Plus, Search, Building2, Package, TrendingDown, DollarSign,
  Filter, RefreshCcw, Eye, Edit2, Calculator, FileText,
  Car, Monitor, Sofa, Home, MapPin, Wrench, X, Calendar, AlertCircle
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

  // 🚀 تحسين الأداء - استخدام useTransition للفلاتر
  const [isPending, startTransition] = useTransition()

  const [stats, setStats] = useState<Stats>({
    totalAssets: 0, totalCost: 0, totalDepreciation: 0,
    totalBookValue: 0, activeAssets: 0, fullyDepreciated: 0
  })
  const [pendingDepreciationCount, setPendingDepreciationCount] = useState(0)
  const [isPostingDepreciation, setIsPostingDepreciation] = useState(false)

  // === صلاحيات الأصول الثابتة ===
  const [permWrite, setPermWrite] = useState(false)
  const [permUpdate, setPermUpdate] = useState(false)
  const [permDelete, setPermDelete] = useState(false)
  const [permPostDepreciation, setPermPostDepreciation] = useState(false)

  // 🔐 ERP Access Control - سياق المستخدم
  const [userContext, setUserContext] = useState<UserContext | null>(null)

  // التحقق من الصلاحيات
  useEffect(() => {
    const checkPerms = async () => {
      const [write, update, del, postDep] = await Promise.all([
        canAction(supabase, "fixed_assets", "write"),
        canAction(supabase, "fixed_assets", "update"),
        canAction(supabase, "fixed_assets", "delete"),
        canAdvancedAction(supabase, "fixed_assets", "post_depreciation"),
      ])
      setPermWrite(write)
      setPermUpdate(update)
      setPermDelete(del)
      setPermPostDepreciation(postDep)
    }
    checkPerms()

    // الاستماع لتحديثات الصلاحيات
    const handler = () => { checkPerms() }
    if (typeof window !== 'undefined') window.addEventListener('permissions_updated', handler)
    return () => { if (typeof window !== 'undefined') window.removeEventListener('permissions_updated', handler) }
  }, [supabase])

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

      // 🔐 ERP Access Control - جلب سياق المستخدم
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: member } = await supabase
        .from("company_members")
        .select("role, branch_id, cost_center_id, warehouse_id")
        .eq("company_id", companyId)
        .eq("user_id", user.id)
        .single()

      const role = member?.role || "staff"
      const context: UserContext = {
        user_id: user.id,
        company_id: companyId,
        branch_id: member?.branch_id || null,
        cost_center_id: member?.cost_center_id || null,
        warehouse_id: member?.warehouse_id || null,
        role: role
      }
      setUserContext(context)

      const isCanOverride = ["owner", "admin"].includes(role)
      const isAccountantOrManager = ["accountant", "manager"].includes(role)
      const userBranchId = context.branch_id || null
      const userCostCenterId = context.cost_center_id || null
      const userWarehouseId = context.warehouse_id || null

      // Load categories
      const { data: categoriesData } = await supabase
        .from("asset_categories")
        .select("*")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name")
      setCategories(categoriesData || [])

      // جلب المخازن في الفرع للمحاسب/المدير
      let allowedWarehouseIds: string[] = []
      if (isAccountantOrManager && userBranchId) {
        const { data: branchWarehouses } = await supabase
          .from("warehouses")
          .select("id")
          .eq("company_id", companyId)
          .eq("branch_id", userBranchId)
          .eq("is_active", true)
        
        allowedWarehouseIds = (branchWarehouses || []).map((w: any) => w.id)
      }

      // Load assets with filtering based on user context
      let assetsQuery = supabase
        .from("fixed_assets")
        .select(`
          *,
          asset_categories(name, code),
          branches(name, branch_name),
          cost_centers(cost_center_name)
        `)
        .eq("company_id", companyId)

      // 🔐 فلترة حسب الفرع ومركز التكلفة والمخزن والدور
      if (!isCanOverride) {
        if (isAccountantOrManager && userBranchId) {
          // للمحاسب والمدير: فلترة حسب الفرع أولاً
          assetsQuery = assetsQuery.eq("branch_id", userBranchId)
          
          // فلترة حسب المخزن إذا كان محدداً أو حسب المخازن في الفرع
          if (userWarehouseId && allowedWarehouseIds.length > 0 && allowedWarehouseIds.includes(userWarehouseId)) {
            // إذا كان هناك warehouse_id محدد وينتمي لفرع المستخدم
            assetsQuery = assetsQuery.eq("warehouse_id", userWarehouseId)
          } else if (allowedWarehouseIds.length > 0) {
            // إذا لم يكن هناك warehouse_id محدد، فلترة حسب جميع المخازن في الفرع
            assetsQuery = assetsQuery.in("warehouse_id", allowedWarehouseIds)
          }
        } else if (userBranchId) {
          // للموظف: فلترة حسب الفرع
          assetsQuery = assetsQuery.eq("branch_id", userBranchId)
          
          // فلترة حسب المخزن إذا كان محدداً
          if (userWarehouseId) {
            assetsQuery = assetsQuery.eq("warehouse_id", userWarehouseId)
          }
        }

        // فلترة حسب مركز التكلفة إذا كان محدداً
        if (userCostCenterId) {
          assetsQuery = assetsQuery.eq("cost_center_id", userCostCenterId)
        }
      }

      const { data: assetsData, error: assetsError } = await assetsQuery
        .order("created_at", { ascending: false })

      if (assetsError) {
        console.error("Error loading assets:", assetsError)
        throw assetsError
      }

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

      // Check for pending depreciation for current month
      // Only if there are assets
      if (assetsList.length > 0) {
        const now = new Date()
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)

        const assetIds = assetsList.map((a: any) => a.id).filter(Boolean)

        if (assetIds.length > 0) {
          const { count: pendingCount } = await supabase
            .from('depreciation_schedules')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', companyId)
            .eq('status', 'approved')
            .gte('period_date', monthStart.toISOString().split('T')[0])
            .lte('period_date', monthEnd.toISOString().split('T')[0])
            .in('asset_id', assetIds)

          setPendingDepreciationCount(pendingCount || 0)
        } else {
          setPendingDepreciationCount(0)
        }
      } else {
        setPendingDepreciationCount(0)
      }
    } catch (error: any) {
      console.error("Error loading assets:", error)
      const errorMessage = error?.message || error?.toString() || 'Unknown error'
      console.error("Full error details:", error)
      toast({
        title: appLang === 'en' ? "Error loading data" : "خطأ في تحميل البيانات",
        description: appLang === 'en'
          ? `Error: ${errorMessage}`
          : `الخطأ: ${errorMessage}`,
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }, [supabase, toast, appLang])

  useEffect(() => { loadData() }, [loadData])

  // ترحيل الإهلاك الشهري التلقائي
  const handleAutoPostMonthlyDepreciation = async () => {
    if (!permPostDepreciation) {
      toast({
        title: appLang === 'en' ? 'Access Denied' : 'رفض الوصول',
        description: appLang === 'en' ? 'You do not have permission to post depreciation' : 'ليس لديك صلاحية لترحيل الإهلاك',
        variant: "destructive"
      })
      return
    }

    setIsPostingDepreciation(true)
    try {
      const response = await fetch('/api/fixed-assets/auto-post-depreciation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to post depreciation')
      }

      const result = await response.json()

      // Safe access with default values
      const postedCount = result?.posted_count ?? 0
      const totalDepreciation = result?.total_depreciation ?? 0
      const errors = result?.errors ?? []

      if (errors.length > 0) {
        toast({
          title: appLang === 'en' ? 'Partial Success' : 'نجاح جزئي',
          description: appLang === 'en'
            ? `Posted ${postedCount} schedules. ${errors.length} errors occurred.`
            : `تم ترحيل ${postedCount} فترة. حدث ${errors.length} خطأ.`,
          variant: "default"
        })
      } else {
        // Use locale based on appLang for consistent number formatting
        // en-EG for English (Western numerals), ar-EG for Arabic (Eastern Arabic numerals)
        const locale = appLang === 'en' ? 'en-EG' : 'ar-EG'
        const formattedTotal = totalDepreciation.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

        toast({
          title: appLang === 'en' ? 'Success' : 'نجح',
          description: appLang === 'en'
            ? `Posted ${postedCount} depreciation schedules for this month (Total: ${formattedTotal})`
            : `تم ترحيل ${postedCount} فترة إهلاك لهذا الشهر (الإجمالي: ${formattedTotal})`,
          variant: "default"
        })
      }

      await loadData() // Reload to refresh stats
    } catch (error: any) {
      console.error('Error posting depreciation:', error)
      toast({
        title: appLang === 'en' ? 'Error' : 'خطأ',
        description: error.message || (appLang === 'en' ? 'Failed to post monthly depreciation' : 'فشل ترحيل الإهلاك الشهري'),
        variant: "destructive"
      })
    } finally {
      setIsPostingDepreciation(false)
    }
  }

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
                <div className="flex gap-2 flex-wrap">
                  {permPostDepreciation && pendingDepreciationCount > 0 && (
                    <Button
                      variant="default"
                      onClick={handleAutoPostMonthlyDepreciation}
                      disabled={isPostingDepreciation}
                      className="bg-green-600 hover:bg-green-700 text-white"
                      title={appLang === 'en' ? `Post ${pendingDepreciationCount} depreciation schedules for this month` : `ترحيل ${pendingDepreciationCount} فترة إهلاك لهذا الشهر`}
                    >
                      <Calendar className="w-4 h-4 mr-2" />
                      {isPostingDepreciation
                        ? (appLang === 'en' ? 'Posting...' : 'جاري الترحيل...')
                        : (appLang === 'en' ? `Post Monthly Depreciation (${pendingDepreciationCount})` : `ترحيل الإهلاك الشهري (${pendingDepreciationCount})`)
                      }
                    </Button>
                  )}
                  <Button variant="outline" onClick={loadData} disabled={isLoading}>
                    <RefreshCcw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                  </Button>
                  {permWrite && (
                    <Link href="/fixed-assets/new">
                      <Button className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800">
                        <Plus className="w-4 h-4 mr-2" />
                        {appLang === 'en' ? 'Add Asset' : 'إضافة أصل'}
                      </Button>
                    </Link>
                  )}
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
                      onChange={(e) => {
                        const val = e.target.value
                        startTransition(() => setSearchTerm(val))
                      }}
                      placeholder={appLang === 'en' ? 'Search by name or code...' : 'ابحث بالاسم أو الكود...'}
                      className={`pr-10 h-11 text-sm bg-gray-50 dark:bg-slate-800/50 border-gray-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-800 ${isPending ? 'opacity-70' : ''}`}
                    />
                    {searchTerm && (
                      <button
                        onClick={() => startTransition(() => setSearchTerm(""))}
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
                    <Select value={filterStatus} onValueChange={(val) => startTransition(() => setFilterStatus(val))}>
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
                    <Select value={filterCategory} onValueChange={(val) => startTransition(() => setFilterCategory(val))}>
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
                            <th className="px-3 py-3 text-center font-semibold text-gray-900 dark:text-white hidden md:table-cell">{appLang === 'en' ? 'Branch' : 'الفرع'}</th>
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
                                <td className="px-3 py-3 text-center hidden md:table-cell">
                                  {(asset as any).branches?.name ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                                      {(asset as any).branches.name}
                                    </span>
                                  ) : (
                                    <span className="text-gray-400 dark:text-gray-500">{appLang === 'en' ? 'Main' : 'رئيسي'}</span>
                                  )}
                                </td>
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
                                    {permUpdate && (
                                      <Link href={`/fixed-assets/${asset.id}/edit`}>
                                        <Button variant="outline" size="sm" title={appLang === 'en' ? 'Edit asset' : 'تعديل الأصل'}>
                                          <Edit2 className="w-4 h-4" />
                                        </Button>
                                      </Link>
                                    )}
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
