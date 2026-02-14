"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import { getActiveCompanyId } from "@/lib/company"
import { canAction, canAdvancedAction } from "@/lib/authz"
import { ListErrorBoundary } from "@/components/list-error-boundary"

// Utility function for number formatting
const formatNumber = (num: number) => {
  return num.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
import {
  ArrowLeft, Edit2, Calculator, CheckCircle, Play, X,
  Building2, Package, TrendingDown, DollarSign,
  Car, Monitor, Sofa, Home, MapPin, Wrench
} from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { AddCapitalDialog } from "@/components/fixed-assets/add-capital-dialog"
import { DisposeAssetDialog } from "@/components/fixed-assets/dispose-asset-dialog"
import { AssetHistory } from "@/components/fixed-assets/asset-history"

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

interface DepreciationSchedule {
  id: string
  period_number: number
  period_date: string
  depreciation_amount: number
  accumulated_depreciation: number
  book_value: number
  status: string
}

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  suspended: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  sold: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  disposed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  fully_depreciated: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
}

const scheduleStatusColors: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  approved: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  posted: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
}

const categoryIcons: Record<string, any> = {
  EQP: Wrench,
  VEH: Car,
  IT: Monitor,
  FUR: Sofa,
  BLD: Home,
  LND: MapPin
}

export default function FixedAssetDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = useSupabase()
  const { toast } = useToast()
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [isLoading, setIsLoading] = useState(true)
  const [asset, setAsset] = useState<FixedAsset | null>(null)

  // === صلاحيات الأصول الثابتة ===
  const [permUpdate, setPermUpdate] = useState(false)
  const [permPostDepreciation, setPermPostDepreciation] = useState(false)
  const [permApproveDepreciation, setPermApproveDepreciation] = useState(false)

  // === حالة الإلغاء ===
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [cancelType, setCancelType] = useState<'approved' | 'posted'>('approved')
  const [selectedScheduleIds, setSelectedScheduleIds] = useState<string[]>([])
  const [userRole, setUserRole] = useState<string>('viewer')

  // التحقق من الصلاحيات والدور
  useEffect(() => {
    const checkPerms = async () => {
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      const [update, postDep, approveDep] = await Promise.all([
        canAction(supabase, "fixed_assets", "update"),
        canAdvancedAction(supabase, "fixed_assets", "post_depreciation"),
        canAdvancedAction(supabase, "fixed_assets", "approve_depreciation"),
      ])
      setPermUpdate(update)
      setPermPostDepreciation(postDep)
      setPermApproveDepreciation(approveDep)

      // ✅ جلب دور المستخدم (لإلغاء الإهلاك)
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError) {
        console.error('Error getting user:', authError)
        return
      }
      const user = authData?.user
      if (user) {
        const { data: memberData } = await supabase
          .from("company_members")
          .select("role")
          .eq("company_id", companyId)
          .eq("user_id", user.id)
          .maybeSingle()

        const { data: companyData } = await supabase
          .from("companies")
          .select("user_id")
          .eq("id", companyId)
          .single()

        const isOwner = companyData?.user_id === user.id
        setUserRole(isOwner ? "owner" : (memberData?.role || "viewer"))
      }
    }
    checkPerms()

    // الاستماع لتحديثات الصلاحيات وتغيير الشركة
    const handler = () => { checkPerms() }
    const companyChangeHandler = () => { checkPerms() }

    if (typeof window !== 'undefined') {
      window.addEventListener('permissions_updated', handler)
      window.addEventListener('company-changed', companyChangeHandler)
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('permissions_updated', handler)
        window.removeEventListener('company-changed', companyChangeHandler)
      }
    }
  }, [supabase])
  const [schedules, setSchedules] = useState<DepreciationSchedule[]>([])
  const [currency, setCurrency] = useState('SAR')

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setAppLang((localStorage.getItem('app_language') as 'ar' | 'en') || 'ar')
      setCurrency(localStorage.getItem('company_currency') || 'SAR')
    }
    loadData()
  }, [params.id])

  const loadData = async () => {
    try {
      setIsLoading(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      // ✅ Load asset details - جلب البيانات الجديدة بدون cache
      // تضمن أن accumulated_depreciation و book_value محدثة بعد الإلغاء
      const { data: assetData, error: assetError } = await supabase
        .from('fixed_assets')
        .select(`
          *,
          asset_categories(name, code),
          branches(name, branch_name),
          cost_centers(cost_center_name)
        `)
        .eq('company_id', companyId)
        .eq('id', params.id)
        .single()

      if (assetError) {
        console.error('Error loading asset:', assetError)
        throw assetError
      }

      if (assetData) {
        // ✅ تحديث state مع البيانات الجديدة من قاعدة البيانات
        setAsset(assetData)
      }

      // ✅ Load depreciation schedules - جلب الجداول المحدثة
      const { data: schedulesData, error: schedulesError } = await supabase
        .from('depreciation_schedules')
        .select('*')
        .eq('company_id', companyId)
        .eq('asset_id', params.id)
        .order('period_number')

      if (schedulesError) {
        console.error('Error loading schedules:', schedulesError)
        throw schedulesError
      }

      setSchedules(schedulesData || [])
    } catch (error) {
      console.error('Error loading asset details:', error)
      toast({ title: appLang === 'en' ? "Error loading data" : "خطأ في تحميل البيانات", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  const handleApproveSchedules = async () => {
    // التحقق من الصلاحيات
    if (!permApproveDepreciation) {
      toast({
        title: appLang === 'en' ? 'Access Denied' : 'رفض الوصول',
        description: appLang === 'en' ? 'You do not have permission to approve depreciation schedules' : 'ليس لديك صلاحية لاعتماد جداول الإهلاك',
        variant: "destructive"
      })
      return
    }

    try {
      const pendingSchedules = schedules.filter(s => s.status === 'pending')
      if (pendingSchedules.length === 0) return

      const response = await fetch(`/api/fixed-assets/${params.id}/depreciation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          schedule_ids: pendingSchedules.map(s => s.id),
          user_id: (await supabase.auth.getUser()).data.user?.id
        })
      })

      if (!response.ok) throw new Error('Failed to approve schedules')

      toast({ title: appLang === 'en' ? "Schedules approved" : "تم اعتماد الجداول" })
      loadData()
    } catch (error) {
      console.error('Error approving schedules:', error)
      toast({ title: appLang === 'en' ? "Error approving schedules" : "خطأ في اعتماد الجداول", variant: "destructive" })
    }
  }

  const handlePostDepreciation = async () => {
    // التحقق من الصلاحيات
    if (!permPostDepreciation) {
      toast({
        title: appLang === 'en' ? 'Access Denied' : 'رفض الوصول',
        description: appLang === 'en' ? 'You do not have permission to post depreciation' : 'ليس لديك صلاحية لترحيل الإهلاك',
        variant: "destructive"
      })
      return
    }

    try {
      // ⚠️ ERP Professional Pattern: Only post current month or past months
      // منع ترحيل الفترات المستقبلية (مثل Zoho, Odoo, ERPNext)
      const currentMonthStart = new Date()
      currentMonthStart.setDate(1)
      currentMonthStart.setHours(0, 0, 0, 0)

      const approvedSchedules = schedules.filter(s => s.status === 'approved')
      if (approvedSchedules.length === 0) {
        toast({
          title: appLang === 'en' ? 'No Approved Schedules' : 'لا توجد فترات معتمدة',
          description: appLang === 'en' ? 'Please approve schedules first' : 'يرجى اعتماد الفترات أولاً',
          variant: "default"
        })
        return
      }

      // Filter out future periods - only allow current month or past months
      const validSchedules = approvedSchedules.filter(s => {
        const periodDate = new Date(s.period_date)
        periodDate.setHours(0, 0, 0, 0)
        return periodDate <= currentMonthStart
      })

      const futureSchedules = approvedSchedules.filter(s => {
        const periodDate = new Date(s.period_date)
        periodDate.setHours(0, 0, 0, 0)
        return periodDate > currentMonthStart
      })

      if (futureSchedules.length > 0) {
        toast({
          title: appLang === 'en' ? 'Cannot Post Future Periods' : 'لا يمكن ترحيل الفترات المستقبلية',
          description: appLang === 'en'
            ? `${futureSchedules.length} future period(s) cannot be posted. Only current month or past months can be posted.`
            : `لا يمكن ترحيل ${futureSchedules.length} فترة مستقبلية. يمكن ترحيل الشهر الحالي أو الأشهر الماضية فقط.`,
          variant: "destructive"
        })
      }

      if (validSchedules.length === 0) {
        toast({
          title: appLang === 'en' ? 'No Valid Schedules' : 'لا توجد فترات صالحة للترحيل',
          description: appLang === 'en'
            ? 'All approved schedules are in the future. Please wait until their period date.'
            : 'جميع الفترات المعتمدة مستقبلية. يرجى الانتظار حتى تاريخ الفترة.',
          variant: "default"
        })
        return
      }

      const response = await fetch(`/api/fixed-assets/${params.id}/depreciation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'post',
          schedule_ids: validSchedules.map(s => s.id),
          user_id: (await supabase.auth.getUser()).data.user?.id
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to post depreciation')
      }

      const result = await response.json()
      toast({
        title: appLang === 'en' ? "Depreciation Posted" : "تم ترحيل الإهلاك",
        description: appLang === 'en'
          ? `Posted ${result.posted_count || validSchedules.length} schedule(s)`
          : `تم ترحيل ${result.posted_count || validSchedules.length} فترة`
      })
      loadData()
    } catch (error: any) {
      console.error('Error posting depreciation:', error)
      toast({
        title: appLang === 'en' ? "Error posting depreciation" : "خطأ في ترحيل الإهلاك",
        description: error.message || (appLang === 'en' ? 'Failed to post depreciation' : 'فشل ترحيل الإهلاك'),
        variant: "destructive"
      })
    }
  }

  // ✅ إلغاء إهلاك معتمد (Approved)
  const handleCancelApproved = (scheduleIds: string[]) => {
    const canCancel = userRole === 'owner' || userRole === 'admin'
    if (!canCancel) {
      toast({
        title: appLang === 'en' ? 'Access Denied' : 'رفض الوصول',
        description: appLang === 'en'
          ? 'Only Owner and Admin can cancel approved depreciation'
          : 'فقط المالك والمدير العام يمكنهم إلغاء الإهلاك المعتمد',
        variant: "destructive"
      })
      return
    }
    setCancelType('approved')
    setSelectedScheduleIds(scheduleIds)
    setCancelDialogOpen(true)
  }

  // ✅ إلغاء إهلاك مرحل (Posted) - مع قيد عكسي
  const handleCancelPosted = (scheduleIds: string[]) => {
    const canCancel = userRole === 'owner' || userRole === 'admin'
    if (!canCancel) {
      toast({
        title: appLang === 'en' ? 'Access Denied' : 'رفض الوصول',
        description: appLang === 'en'
          ? 'Only Owner and Admin can cancel posted depreciation'
          : 'فقط المالك والمدير العام يمكنهم إلغاء الإهلاك المرحل',
        variant: "destructive"
      })
      return
    }
    setCancelType('posted')
    setSelectedScheduleIds(scheduleIds)
    setCancelDialogOpen(true)
  }

  // تنفيذ الإلغاء بعد التأكيد
  const confirmCancel = async () => {
    try {
      const action = cancelType === 'approved' ? 'cancel' : 'cancel_posted'

      const response = await fetch(`/api/fixed-assets/${params.id}/depreciation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          schedule_ids: selectedScheduleIds,
          user_id: (await supabase.auth.getUser()).data.user?.id
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error_ar || errorData.error || 'Failed to cancel depreciation')
      }

      const result = await response.json()

      // ✅ تحديث فوري لـ accumulated_depreciation و book_value من response API
      // لضمان التزامن الفوري قبل إعادة تحميل البيانات الكاملة
      // ⚠️ لا نعدل status التشغيلية (suspended, sold, disposed) - فقط active/fully_depreciated
      if (result.new_accumulated_depreciation !== undefined && result.new_book_value !== undefined && asset) {
        const updateData: any = {
          ...asset,
          accumulated_depreciation: result.new_accumulated_depreciation,
          book_value: result.new_book_value
        }

        // ✅ تحديث status فقط إذا كانت الحالة الحالية active أو fully_depreciated
        // منع الكتابة على الحالات التشغيلية (suspended, sold, disposed)
        const currentStatus = asset.status
        if (currentStatus === 'active' || currentStatus === 'fully_depreciated') {
          updateData.status = result.new_book_value <= Number(asset.salvage_value || 0)
            ? 'fully_depreciated'
            : 'active'
        }
        // إذا كانت الحالة suspended, sold, disposed → نحتفظ بها كما هي

        setAsset(updateData)
      }

      toast({
        title: appLang === 'en' ? "Depreciation Cancelled" : "تم إلغاء الإهلاك",
        description: appLang === 'en'
          ? `Cancelled ${result.cancelled_count || selectedScheduleIds.length} schedule(s)`
          : `تم إلغاء ${result.cancelled_count || selectedScheduleIds.length} فترة`
      })

      setCancelDialogOpen(false)
      // ✅ إعادة تحميل البيانات الكاملة لضمان التزامن مع قاعدة البيانات
      await loadData()
    } catch (error: any) {
      console.error('Error cancelling depreciation:', error)
      toast({
        title: appLang === 'en' ? "Error cancelling depreciation" : "خطأ في إلغاء الإهلاك",
        description: error.message || (appLang === 'en' ? 'Failed to cancel depreciation' : 'فشل إلغاء الإهلاك'),
        variant: "destructive"
      })
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <Sidebar />
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
            <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded"></div>
          </div>
        </main>
      </div>
    )
  }

  if (!asset) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <Sidebar />
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {appLang === 'en' ? 'Asset not found' : 'الأصل غير موجود'}
            </h1>
          </div>
        </main>
      </div>
    )
  }

  const CategoryIcon = categoryIcons[asset.asset_categories?.code || ''] || Package
  const hasPendingSchedules = schedules.some(s => s.status === 'pending')
  const hasApprovedSchedules = schedules.some(s => s.status === 'approved')

  const [addCapitalOpen, setAddCapitalOpen] = useState(false)
  const [disposeOpen, setDisposeOpen] = useState(false)
  const [transactions, setTransactions] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState<'schedule' | 'history'>('schedule')

  // Load Transactions
  useEffect(() => {
    if (asset) {
      const loadTransactions = async () => {
        const { data } = await supabase
          .from('asset_transactions')
          .select('*')
          .eq('asset_id', asset.id)
          .order('transaction_date', { ascending: false })

        if (data) setTransactions(data)
      }
      loadTransactions()
    }
  }, [asset, supabase])

  // Import components dynamically or at top?
  // Since I can't easily add imports to top with replace_file_content unless I replace whole file, 
  // I will assume imports are added. 
  // Wait, I need to add imports.
  // I will replace the whole file content in next step or use multi_replace.
  // Let's use multi_replace for imports + body.
  // Actually, replace_file_content with huge chunk is risky.
  // I will just return the "rest of the file" here? 
  // No, I need to structure this properly.

  // Strategy:
  // 1. Add imports at the top.
  // 2. Add state variables inside component.
  // 3. Add "Operations" dropdown in header.
  // 4. Add Tabs for Schedule/History.
  // 5. Render Dialogs.

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <ListErrorBoundary listType="generic" lang={appLang}>
          <div className="space-y-4 sm:space-y-6 max-w-full">
            {/* Header */}
            <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4">
                <div className="flex items-center gap-3 sm:gap-4">
                  <Button variant="outline" onClick={() => router.back()}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    {appLang === 'en' ? 'Back' : 'رجوع'}
                  </Button>
                  <div>
                    <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">
                      {asset.name}
                    </h1>
                    <div className="flex gap-2 text-xs text-gray-500">
                      <span>{asset.asset_code}</span>
                      <span>•</span>
                      <span>{asset.asset_categories?.name}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {permUpdate && (
                    <Button variant="outline" onClick={() => router.push(`/fixed-assets/${asset.id}/edit`)}>
                      <Edit2 className="w-4 h-4 mr-2" />
                      {appLang === 'en' ? 'Edit' : 'تعديل'}
                    </Button>
                  )}

                  {/* Operations Menu */}
                  {(userRole === 'owner' || userRole === 'admin') && asset.status === 'active' && (
                    <>
                      <Button variant="secondary" onClick={() => setAddCapitalOpen(true)}>
                        <DollarSign className="w-4 h-4 mr-2" />
                        {appLang === 'en' ? 'Add Capital' : 'إضافة رأسمالية'}
                      </Button>
                      <Button variant="destructive" onClick={() => setDisposeOpen(true)}>
                        <X className="w-4 h-4 mr-2" />
                        {appLang === 'en' ? 'Dispose' : 'استبعاد'}
                      </Button>
                    </>
                  )}

                  {hasPendingSchedules && permApproveDepreciation && (
                    <Button onClick={handleApproveSchedules} className="bg-blue-600 hover:bg-blue-700">
                      <CheckCircle className="w-4 h-4 mr-2" />
                      {appLang === 'en' ? 'Approve' : 'اعتماد'}
                    </Button>
                  )}
                  {hasApprovedSchedules && permPostDepreciation && (
                    <Button onClick={handlePostDepreciation} className="bg-green-600 hover:bg-green-700">
                      <Play className="w-4 h-4 mr-2" />
                      {appLang === 'en' ? 'Post' : 'ترحيل'}
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Asset Overview Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Card className="p-4 dark:bg-slate-900">
                <div className="flex items-center gap-3">
                  <DollarSign className="h-8 w-8 text-green-600 dark:text-green-400" />
                  <div>
                    <p className="text-xs text-gray-500">{appLang === 'en' ? 'Purchase Cost' : 'قيمة الشراء'}</p>
                    <p className="text-xl font-bold">{formatNumber(asset.purchase_cost)}</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4 dark:bg-slate-900">
                <div className="flex items-center gap-3">
                  <TrendingDown className="h-8 w-8 text-red-600 dark:text-red-400" />
                  <div>
                    <p className="text-xs text-gray-500">{appLang === 'en' ? 'Accumulated Dep' : 'مجمع الإهلاك'}</p>
                    <p className="text-xl font-bold">{formatNumber(asset.accumulated_depreciation)}</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4 dark:bg-slate-900">
                <div className="flex items-center gap-3">
                  <Calculator className="h-8 w-8 text-purple-600 dark:text-purple-400" />
                  <div>
                    <p className="text-xs text-gray-500">{appLang === 'en' ? 'Book Value' : 'القيمة الدفترية'}</p>
                    <p className="text-xl font-bold">{formatNumber(asset.book_value)}</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4 dark:bg-slate-900">
                <div className="flex items-center gap-3">
                  <Badge className={statusColors[asset.status] || statusColors.draft}>
                    {appLang === 'en' ? asset.status : {
                      draft: 'مسودة',
                      active: 'نشط',
                      suspended: 'معلق',
                      sold: 'مباع',
                      disposed: 'مستبعد',
                      fully_depreciated: 'مهلك بالكامل'
                    }[asset.status] || asset.status}
                  </Badge>
                </div>
              </Card>
            </div>

            {/* Details & Org (Same as before, hidden for brevity in this snippet if not changed) */}
            {/* ... keeping details cards ... */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <Card className="dark:bg-slate-900">
                <CardHeader><CardTitle>{appLang === 'en' ? 'Details' : 'التفاصيل'}</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">{appLang === 'en' ? 'Life' : 'العمر'}:</span><span>{asset.useful_life_months} m</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">{appLang === 'en' ? 'Date' : 'تاريخ'}:</span><span>{new Date(asset.purchase_date).toLocaleDateString()}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">{appLang === 'en' ? 'Method' : 'الطريقة'}:</span><span>{asset.depreciation_method}</span></div>
                </CardContent>
              </Card>
              <Card className="dark:bg-slate-900">
                <CardHeader><CardTitle>{appLang === 'en' ? 'Location' : 'الموقع'}</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">{appLang === 'en' ? 'Branch' : 'الفرع'}:</span><span>{asset.branches?.name}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">{appLang === 'en' ? 'Center' : 'المركز'}:</span><span>{asset.cost_centers?.cost_center_name}</span></div>
                </CardContent>
              </Card>
            </div>

            {/* Tabs for Schedule / History */}
            <div className="flex gap-4 border-b border-gray-200 dark:border-gray-800 mb-4">
              <button
                className={`pb-2 px-4 ${activeTab === 'schedule' ? 'border-b-2 border-blue-500 text-blue-600 font-bold' : 'text-gray-500'}`}
                onClick={() => setActiveTab('schedule')}
              >
                {appLang === 'en' ? 'Depreciation Schedule' : 'جدول الإهلاك'}
              </button>
              <button
                className={`pb-2 px-4 ${activeTab === 'history' ? 'border-b-2 border-blue-500 text-blue-600 font-bold' : 'text-gray-500'}`}
                onClick={() => setActiveTab('history')}
              >
                {appLang === 'en' ? 'History' : 'السجل'}
              </button>
            </div>

            {activeTab === 'schedule' ? (
              <Card className="dark:bg-slate-900">
                <CardContent className="p-0 sm:p-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>{appLang === 'en' ? 'Date' : 'التاريخ'}</TableHead>
                        <TableHead>{appLang === 'en' ? 'Amount' : 'المبلغ'}</TableHead>
                        <TableHead>{appLang === 'en' ? 'Accumulated' : 'المجمع'}</TableHead>
                        <TableHead>{appLang === 'en' ? 'Book Value' : 'الدفترية'}</TableHead>
                        <TableHead>{appLang === 'en' ? 'Status' : 'الحالة'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {schedules.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell>{s.period_number}</TableCell>
                          <TableCell>{new Date(s.period_date).toLocaleDateString(appLang === 'en' ? 'en-US' : 'ar-EG')}</TableCell>
                          <TableCell>{formatNumber(s.depreciation_amount)}</TableCell>
                          <TableCell>{formatNumber(s.accumulated_depreciation)}</TableCell>
                          <TableCell>{formatNumber(s.book_value)}</TableCell>
                          <TableCell>
                            <Badge className={scheduleStatusColors[s.status]}>{s.status}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ) : (
              <AssetHistory transactions={transactions} lang={appLang} />
            )}

          </div>
        </ListErrorBoundary>

        <AddCapitalDialog
          open={addCapitalOpen}
          onOpenChange={setAddCapitalOpen}
          assetId={asset.id}
          onSuccess={loadData}
          lang={appLang}
        />

        <DisposeAssetDialog
          open={disposeOpen}
          onOpenChange={setDisposeOpen}
          assetId={asset.id}
          onSuccess={loadData}
          lang={appLang}
        />

        {/* Cancel Dialog (Existing) */}
        <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{appLang === 'en' ? 'Confirm Cancellation' : 'تأكيد الإلغاء'}</AlertDialogTitle>
              <AlertDialogDescription>
                {appLang === 'en' ? 'Are you sure you want to cancel this depreciation?' : 'هل أنت متأكد من إلغاء هذا الإهلاك؟'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{appLang === 'en' ? 'No' : 'لا'}</AlertDialogCancel>
              <AlertDialogAction onClick={confirmCancel}>{appLang === 'en' ? 'Yes' : 'نعم'}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </main>
    </div>
  )
}

