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
import { formatNumber } from "@/lib/utils"
import {
  ArrowLeft, Edit2, Calculator, CheckCircle, Play,
  Building2, Package, TrendingDown, DollarSign,
  Car, Monitor, Sofa, Home, MapPin, Wrench
} from "lucide-react"

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

      // Load asset details
      const { data: assetData } = await supabase
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

      if (assetData) {
        setAsset(assetData)
      }

      // Load depreciation schedules
      const { data: schedulesData } = await supabase
        .from('depreciation_schedules')
        .select('*')
        .eq('company_id', companyId)
        .eq('asset_id', params.id)
        .order('period_number')

      setSchedules(schedulesData || [])
    } catch (error) {
      console.error('Error loading asset details:', error)
      toast({ title: appLang === 'en' ? "Error loading data" : "خطأ في تحميل البيانات", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  const handleApproveSchedules = async () => {
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
    try {
      const approvedSchedules = schedules.filter(s => s.status === 'approved')
      if (approvedSchedules.length === 0) return

      const response = await fetch(`/api/fixed-assets/${params.id}/depreciation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'post',
          schedule_ids: approvedSchedules.map(s => s.id),
          user_id: (await supabase.auth.getUser()).data.user?.id
        })
      })

      if (!response.ok) throw new Error('Failed to post depreciation')

      toast({ title: appLang === 'en' ? "Depreciation posted" : "تم ترحيل الإهلاك" })
      loadData()
    } catch (error) {
      console.error('Error posting depreciation:', error)
      toast({ title: appLang === 'en' ? "Error posting depreciation" : "خطأ في ترحيل الإهلاك", variant: "destructive" })
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <Sidebar />
        <main className="flex-1 p-4 md:p-6 lg:p-8">
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
        <main className="flex-1 p-4 md:p-6 lg:p-8">
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

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={() => router.back()}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              {appLang === 'en' ? 'Back' : 'رجوع'}
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <CategoryIcon className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
                    {asset.name}
                  </h1>
                  <p className="text-gray-500 dark:text-gray-400">
                    {asset.asset_code} • {asset.asset_categories?.name}
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push(`/fixed-assets/${asset.id}/edit`)}>
              <Edit2 className="w-4 h-4 mr-2" />
              {appLang === 'en' ? 'Edit' : 'تعديل'}
            </Button>
            {hasPendingSchedules && (
              <Button onClick={handleApproveSchedules} className="bg-blue-600 hover:bg-blue-700">
                <CheckCircle className="w-4 h-4 mr-2" />
                {appLang === 'en' ? 'Approve Schedules' : 'اعتماد الجداول'}
              </Button>
            )}
            {hasApprovedSchedules && (
              <Button onClick={handlePostDepreciation} className="bg-green-600 hover:bg-green-700">
                <Play className="w-4 h-4 mr-2" />
                {appLang === 'en' ? 'Post Depreciation' : 'ترحيل الإهلاك'}
              </Button>
            )}
          </div>
        </div>

        {/* Asset Overview */}
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

        {/* Asset Details */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <Card className="dark:bg-slate-900">
            <CardHeader>
              <CardTitle>{appLang === 'en' ? 'Asset Information' : 'معلومات الأصل'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-500">{appLang === 'en' ? 'Category:' : 'الفئة:'}</span>
                <span>{asset.asset_categories?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">{appLang === 'en' ? 'Purchase Date:' : 'تاريخ الشراء:'}</span>
                <span>{new Date(asset.purchase_date).toLocaleDateString(appLang === 'en' ? 'en-US' : 'ar-EG')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">{appLang === 'en' ? 'Useful Life:' : 'العمر الإنتاجي:'}</span>
                <span>{asset.useful_life_months} {appLang === 'en' ? 'months' : 'شهر'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">{appLang === 'en' ? 'Depreciation Method:' : 'طريقة الإهلاك:'}</span>
                <span>{asset.depreciation_method === 'straight_line' ? (appLang === 'en' ? 'Straight Line' : 'قسط ثابت') :
                      asset.depreciation_method === 'declining_balance' ? (appLang === 'en' ? 'Declining Balance' : 'قسط متناقص') :
                      asset.depreciation_method}</span>
              </div>
              {asset.description && (
                <div className="flex justify-between">
                  <span className="text-gray-500">{appLang === 'en' ? 'Description:' : 'الوصف:'}</span>
                  <span className="text-right">{asset.description}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="dark:bg-slate-900">
            <CardHeader>
              <CardTitle>{appLang === 'en' ? 'Organization' : 'التنظيم'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {asset.branches && (
                <div className="flex justify-between">
                  <span className="text-gray-500">{appLang === 'en' ? 'Branch:' : 'الفرع:'}</span>
                  <span>{asset.branches.branch_name || asset.branches.name}</span>
                </div>
              )}
              {asset.cost_centers && (
                <div className="flex justify-between">
                  <span className="text-gray-500">{appLang === 'en' ? 'Cost Center:' : 'مركز التكلفة:'}</span>
                  <span>{asset.cost_centers.cost_center_name}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Depreciation Schedule */}
        <Card className="dark:bg-slate-900">
          <CardHeader>
            <CardTitle>{appLang === 'en' ? 'Depreciation Schedule' : 'جدول الإهلاك'}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{appLang === 'en' ? 'Period' : 'الفترة'}</TableHead>
                  <TableHead>{appLang === 'en' ? 'Date' : 'التاريخ'}</TableHead>
                  <TableHead>{appLang === 'en' ? 'Depreciation' : 'الإهلاك'}</TableHead>
                  <TableHead>{appLang === 'en' ? 'Accumulated' : 'المجمع'}</TableHead>
                  <TableHead>{appLang === 'en' ? 'Book Value' : 'القيمة الدفترية'}</TableHead>
                  <TableHead>{appLang === 'en' ? 'Status' : 'الحالة'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map((schedule) => (
                  <TableRow key={schedule.id}>
                    <TableCell>{schedule.period_number}</TableCell>
                    <TableCell>{new Date(schedule.period_date).toLocaleDateString(appLang === 'en' ? 'en-US' : 'ar-EG')}</TableCell>
                    <TableCell>{formatNumber(schedule.depreciation_amount)}</TableCell>
                    <TableCell>{formatNumber(schedule.accumulated_depreciation)}</TableCell>
                    <TableCell>{formatNumber(schedule.book_value)}</TableCell>
                    <TableCell>
                      <Badge className={scheduleStatusColors[schedule.status] || scheduleStatusColors.pending}>
                        {appLang === 'en' ? schedule.status : {
                          pending: 'معلق',
                          approved: 'معتمد',
                          posted: 'مُرحل',
                          cancelled: 'ملغي'
                        }[schedule.status] || schedule.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {schedules.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-gray-500">
                      {appLang === 'en' ? 'No depreciation schedules found' : 'لا توجد جداول إهلاك'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}