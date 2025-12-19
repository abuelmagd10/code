"use client"

import { useState, useEffect, useCallback } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import { getActiveCompanyId } from "@/lib/company"
import { canAccessPage } from "@/lib/authz"
import { formatNumber } from "@/lib/utils"
import {
  FileText, Download, Building2, Calculator, TrendingDown,
  Package, DollarSign, Calendar, BarChart3
} from "lucide-react"

interface AssetReport {
  id: string
  asset_code: string
  name: string
  category_name: string
  branch_name?: string
  cost_center_name?: string
  purchase_cost: number
  accumulated_depreciation: number
  book_value: number
  status: string
  depreciation_method: string
  useful_life_months: number
}

interface DepreciationReport {
  asset_id: string
  asset_name: string
  period_number: number
  period_date: string
  depreciation_amount: number
  accumulated_depreciation: number
  book_value: number
  status: string
}

export default function FixedAssetsReportsPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [isLoading, setIsLoading] = useState(false)
  const [reportType, setReportType] = useState('assets_list')
  const [assets, setAssets] = useState<AssetReport[]>([])

  // === صلاحيات تقارير الأصول الثابتة ===
  const [canAccess, setCanAccess] = useState(false)

  // التحقق من الصلاحيات
  useEffect(() => {
    const checkPerms = async () => {
      const access = await canAccessPage(supabase, "fixed_assets_reports")
      setCanAccess(access)
      
      if (!access) {
        toast({
          title: appLang === 'en' ? 'Access Denied' : 'رفض الوصول',
          description: appLang === 'en' ? 'You do not have permission to view fixed assets reports' : 'ليس لديك صلاحية لعرض تقارير الأصول الثابتة',
          variant: "destructive"
        })
      }
    }
    checkPerms()
    
    // الاستماع لتحديثات الصلاحيات
    const handler = () => { checkPerms() }
    if (typeof window !== 'undefined') window.addEventListener('permissions_updated', handler)
    return () => { if (typeof window !== 'undefined') window.removeEventListener('permissions_updated', handler) }
  }, [supabase, toast, appLang])
  const [depreciationData, setDepreciationData] = useState<DepreciationReport[]>([])
  const [branchFilter, setBranchFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setAppLang((localStorage.getItem('app_language') as 'ar' | 'en') || 'ar')
    }
  }, [])

  const loadAssetsReport = useCallback(async () => {
    try {
      setIsLoading(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      let query = supabase
        .from('fixed_assets')
        .select(`
          id, asset_code, name, purchase_cost, accumulated_depreciation, book_value,
          status, depreciation_method, useful_life_months,
          asset_categories(name),
          branches(name, branch_name),
          cost_centers(cost_center_name)
        `)
        .eq('company_id', companyId)

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      }

      if (categoryFilter !== 'all') {
        query = query.eq('category_id', categoryFilter)
      }

      if (branchFilter !== 'all') {
        query = query.eq('branch_id', branchFilter)
      }

      const { data, error } = await query.order('name')

      if (error) throw error

      const formattedData = (data || []).map((asset: any) => ({
        id: asset.id,
        asset_code: asset.asset_code,
        name: asset.name,
        category_name: asset.asset_categories?.name || '',
        branch_name: asset.branches?.branch_name || asset.branches?.name || '',
        cost_center_name: asset.cost_centers?.cost_center_name || '',
        purchase_cost: asset.purchase_cost || 0,
        accumulated_depreciation: asset.accumulated_depreciation || 0,
        book_value: asset.book_value || 0,
        status: asset.status,
        depreciation_method: asset.depreciation_method,
        useful_life_months: asset.useful_life_months
      }))

      setAssets(formattedData)
    } catch (error) {
      console.error('Error loading assets report:', error)
      toast({ title: appLang === 'en' ? "Error loading report" : "خطأ في تحميل التقرير", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }, [supabase, toast, appLang, branchFilter, categoryFilter, statusFilter])

  const loadDepreciationReport = useCallback(async () => {
    try {
      setIsLoading(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      const { data, error } = await supabase
        .from('depreciation_schedules')
        .select(`
          asset_id, period_number, period_date, depreciation_amount,
          accumulated_depreciation, book_value, status,
          fixed_assets(name)
        `)
        .eq('company_id', companyId)
        .order('period_date')

      if (error) throw error

      const formattedData = (data || []).map((item: any) => ({
        asset_id: item.asset_id,
        asset_name: item.fixed_assets?.name || '',
        period_number: item.period_number,
        period_date: item.period_date,
        depreciation_amount: item.depreciation_amount,
        accumulated_depreciation: item.accumulated_depreciation,
        book_value: item.book_value,
        status: item.status
      }))

      setDepreciationData(formattedData)
    } catch (error) {
      console.error('Error loading depreciation report:', error)
      toast({ title: appLang === 'en' ? "Error loading report" : "خطأ في تحميل التقرير", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }, [supabase, toast, appLang])

  const loadReport = useCallback(() => {
    if (reportType === 'assets_list' || reportType === 'assets_by_branch' || reportType === 'assets_by_category') {
      loadAssetsReport()
    } else if (reportType === 'depreciation_schedule' || reportType === 'depreciation_by_period') {
      loadDepreciationReport()
    }
  }, [reportType, loadAssetsReport, loadDepreciationReport])

  useEffect(() => {
    loadReport()
  }, [loadReport])

  const exportToCSV = () => {
    let csvContent = ''
    let filename = ''

    if (reportType === 'assets_list') {
      csvContent = [
        ['Asset Code', 'Name', 'Category', 'Branch', 'Cost Center', 'Purchase Cost', 'Accumulated Dep', 'Book Value', 'Status'].join(','),
        ...assets.map(asset => [
          asset.asset_code,
          `"${asset.name}"`,
          asset.category_name,
          asset.branch_name,
          asset.cost_center_name,
          asset.purchase_cost,
          asset.accumulated_depreciation,
          asset.book_value,
          asset.status
        ].join(','))
      ].join('\n')
      filename = 'assets_list.csv'
    } else if (reportType === 'depreciation_schedule') {
      csvContent = [
        ['Asset Name', 'Period', 'Date', 'Depreciation Amount', 'Accumulated Dep', 'Book Value', 'Status'].join(','),
        ...depreciationData.map(item => [
          `"${item.asset_name}"`,
          item.period_number,
          item.period_date.split('T')[0],
          item.depreciation_amount,
          item.accumulated_depreciation,
          item.book_value,
          item.status
        ].join(','))
      ].join('\n')
      filename = 'depreciation_schedule.csv'
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = filename
    link.click()
  }

  const getReportTitle = () => {
    const titles = {
      assets_list: appLang === 'en' ? 'Assets List' : 'قائمة الأصول',
      assets_by_branch: appLang === 'en' ? 'Assets by Branch' : 'الأصول حسب الفرع',
      assets_by_category: appLang === 'en' ? 'Assets by Category' : 'الأصول حسب الفئة',
      depreciation_schedule: appLang === 'en' ? 'Depreciation Schedule' : 'جدول الإهلاك',
      depreciation_by_period: appLang === 'en' ? 'Depreciation by Period' : 'الإهلاك حسب الفترة'
    }
    return titles[reportType as keyof typeof titles] || titles.assets_list
  }

  if (!canAccess) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <Sidebar />
        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto flex items-center justify-center">
          <Card className="max-w-md">
            <CardHeader>
              <CardTitle>{appLang === 'en' ? 'Access Denied' : 'رفض الوصول'}</CardTitle>
            </CardHeader>
            <CardContent>
              <p>{appLang === 'en' ? 'You do not have permission to view fixed assets reports' : 'ليس لديك صلاحية لعرض تقارير الأصول الثابتة'}</p>
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
              {appLang === 'en' ? 'Fixed Assets Reports' : 'تقارير الأصول الثابتة'}
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              {appLang === 'en' ? 'Comprehensive reports for fixed assets management' : 'تقارير شاملة لإدارة الأصول الثابتة'}
            </p>
          </div>
          <Button onClick={exportToCSV} className="bg-green-600 hover:bg-green-700">
            <Download className="w-4 h-4 mr-2" />
            {appLang === 'en' ? 'Export CSV' : 'تصدير CSV'}
          </Button>
        </div>

        {/* Report Type Selection */}
        <Card className="mb-6 dark:bg-slate-900">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">{appLang === 'en' ? 'Report Type' : 'نوع التقرير'}</label>
                <Select value={reportType} onValueChange={setReportType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="assets_list">{appLang === 'en' ? 'Assets List' : 'قائمة الأصول'}</SelectItem>
                    <SelectItem value="assets_by_branch">{appLang === 'en' ? 'Assets by Branch' : 'الأصول حسب الفرع'}</SelectItem>
                    <SelectItem value="assets_by_category">{appLang === 'en' ? 'Assets by Category' : 'الأصول حسب الفئة'}</SelectItem>
                    <SelectItem value="depreciation_schedule">{appLang === 'en' ? 'Depreciation Schedule' : 'جدول الإهلاك'}</SelectItem>
                    <SelectItem value="depreciation_by_period">{appLang === 'en' ? 'Depreciation by Period' : 'الإهلاك حسب الفترة'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(reportType.includes('assets')) && (
                <>
                  <div>
                    <label className="text-sm font-medium mb-2 block">{appLang === 'en' ? 'Status Filter' : 'فلتر الحالة'}</label>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{appLang === 'en' ? 'All Statuses' : 'كل الحالات'}</SelectItem>
                        <SelectItem value="active">{appLang === 'en' ? 'Active' : 'نشط'}</SelectItem>
                        <SelectItem value="suspended">{appLang === 'en' ? 'Suspended' : 'معلق'}</SelectItem>
                        <SelectItem value="sold">{appLang === 'en' ? 'Sold' : 'مباع'}</SelectItem>
                        <SelectItem value="disposed">{appLang === 'en' ? 'Disposed' : 'مستبعد'}</SelectItem>
                        <SelectItem value="fully_depreciated">{appLang === 'en' ? 'Fully Depreciated' : 'مهلك بالكامل'}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">{appLang === 'en' ? 'Branch Filter' : 'فلتر الفرع'}</label>
                    <Select value={branchFilter} onValueChange={setBranchFilter}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{appLang === 'en' ? 'All Branches' : 'كل الفروع'}</SelectItem>
                        {/* Add branch options dynamically */}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Report Content */}
        <Card className="dark:bg-slate-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              {getReportTitle()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(reportType === 'assets_list' || reportType === 'assets_by_branch' || reportType === 'assets_by_category') && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{appLang === 'en' ? 'Asset Code' : 'كود الأصل'}</TableHead>
                    <TableHead>{appLang === 'en' ? 'Name' : 'الاسم'}</TableHead>
                    <TableHead>{appLang === 'en' ? 'Category' : 'الفئة'}</TableHead>
                    <TableHead>{appLang === 'en' ? 'Branch' : 'الفرع'}</TableHead>
                    <TableHead>{appLang === 'en' ? 'Purchase Cost' : 'قيمة الشراء'}</TableHead>
                    <TableHead>{appLang === 'en' ? 'Accumulated Dep' : 'مجمع الإهلاك'}</TableHead>
                    <TableHead>{appLang === 'en' ? 'Book Value' : 'القيمة الدفترية'}</TableHead>
                    <TableHead>{appLang === 'en' ? 'Status' : 'الحالة'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assets.map((asset) => (
                    <TableRow key={asset.id}>
                      <TableCell className="font-mono">{asset.asset_code}</TableCell>
                      <TableCell>{asset.name}</TableCell>
                      <TableCell>{asset.category_name}</TableCell>
                      <TableCell>{asset.branch_name}</TableCell>
                      <TableCell>{formatNumber(asset.purchase_cost)}</TableCell>
                      <TableCell>{formatNumber(asset.accumulated_depreciation)}</TableCell>
                      <TableCell className="font-bold">{formatNumber(asset.book_value)}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          asset.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                          asset.status === 'sold' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                          asset.status === 'disposed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                          'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                        }`}>
                          {asset.status === 'active' ? (appLang === 'en' ? 'Active' : 'نشط') :
                           asset.status === 'sold' ? (appLang === 'en' ? 'Sold' : 'مباع') :
                           asset.status === 'disposed' ? (appLang === 'en' ? 'Disposed' : 'مستبعد') :
                           asset.status === 'suspended' ? (appLang === 'en' ? 'Suspended' : 'معلق') :
                           asset.status === 'fully_depreciated' ? (appLang === 'en' ? 'Fully Dep' : 'مهلك كامل') :
                           asset.status}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                  {assets.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-gray-500">
                        {appLang === 'en' ? 'No assets found' : 'لا توجد أصول'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}

            {(reportType === 'depreciation_schedule' || reportType === 'depreciation_by_period') && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{appLang === 'en' ? 'Asset Name' : 'اسم الأصل'}</TableHead>
                    <TableHead>{appLang === 'en' ? 'Period' : 'الفترة'}</TableHead>
                    <TableHead>{appLang === 'en' ? 'Date' : 'التاريخ'}</TableHead>
                    <TableHead>{appLang === 'en' ? 'Depreciation Amount' : 'قيمة الإهلاك'}</TableHead>
                    <TableHead>{appLang === 'en' ? 'Accumulated Dep' : 'مجمع الإهلاك'}</TableHead>
                    <TableHead>{appLang === 'en' ? 'Book Value' : 'القيمة الدفترية'}</TableHead>
                    <TableHead>{appLang === 'en' ? 'Status' : 'الحالة'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {depreciationData.map((item, index) => (
                    <TableRow key={`${item.asset_id}-${item.period_number}`}>
                      <TableCell>{item.asset_name}</TableCell>
                      <TableCell>{item.period_number}</TableCell>
                      <TableCell>{new Date(item.period_date).toLocaleDateString(appLang === 'en' ? 'en-US' : 'ar-EG')}</TableCell>
                      <TableCell>{formatNumber(item.depreciation_amount)}</TableCell>
                      <TableCell>{formatNumber(item.accumulated_depreciation)}</TableCell>
                      <TableCell className="font-bold">{formatNumber(item.book_value)}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          item.status === 'posted' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                          item.status === 'approved' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                          'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                        }`}>
                          {item.status === 'posted' ? (appLang === 'en' ? 'Posted' : 'مُرحل') :
                           item.status === 'approved' ? (appLang === 'en' ? 'Approved' : 'معتمد') :
                           item.status === 'pending' ? (appLang === 'en' ? 'Pending' : 'معلق') :
                           item.status}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                  {depreciationData.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-gray-500">
                        {appLang === 'en' ? 'No depreciation data found' : 'لا توجد بيانات إهلاك'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}