"use client"

import { useState, useEffect, useMemo } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { Building2, MapPin, DollarSign, Package, TrendingUp, TrendingDown, FileText, Download, ArrowLeft, ArrowRight, Warehouse } from "lucide-react"
import Link from "next/link"

type Branch = { id: string; name: string; code: string }
type CostCenter = { id: string; cost_center_name: string; cost_center_code: string; branch_id: string }
type WarehouseData = { id: string; name: string; code: string; branch_id: string; cost_center_id: string | null }

type ReportData = {
  totalSales: number
  totalPurchases: number
  totalReturns: number
  netRevenue: number
  inventoryValue: number
  invoiceCount: number
  billCount: number
}

export default function BranchCostCenterReportPage() {
  const supabase = useSupabase()
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [branches, setBranches] = useState<Branch[]>([])
  const [costCenters, setCostCenters] = useState<CostCenter[]>([])
  const [warehouses, setWarehouses] = useState<WarehouseData[]>([])
  const [selectedBranch, setSelectedBranch] = useState<string>("all")
  const [selectedCostCenter, setSelectedCostCenter] = useState<string>("all")
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>("all")
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 1)
    return d.toISOString().slice(0, 10)
  })
  const [dateTo, setDateTo] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [loading, setLoading] = useState(true)
  const [reportData, setReportData] = useState<ReportData | null>(null)
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')

  useEffect(() => {
    const handler = () => {
      try {
        const v = localStorage.getItem('app_language') || 'ar'
        setAppLang(v === 'en' ? 'en' : 'ar')
      } catch {}
    }
    handler()
    window.addEventListener('app_language_changed', handler)
    return () => window.removeEventListener('app_language_changed', handler)
  }, [])

  const t = (en: string, ar: string) => (appLang === 'en' ? en : ar)

  // Load initial data
  useEffect(() => {
    ;(async () => {
      const cid = await getActiveCompanyId(supabase)
      if (!cid) return
      setCompanyId(cid)

      const [branchRes, ccRes, whRes] = await Promise.all([
        supabase.from("branches").select("id, name, code").eq("company_id", cid).eq("is_active", true),
        supabase.from("cost_centers").select("id, cost_center_name, cost_center_code, branch_id").eq("company_id", cid).eq("is_active", true),
        supabase.from("warehouses").select("id, name, code, branch_id, cost_center_id").eq("company_id", cid).eq("is_active", true),
      ])

      setBranches((branchRes.data || []) as Branch[])
      setCostCenters((ccRes.data || []) as CostCenter[])
      setWarehouses((whRes.data || []) as WarehouseData[])
      setLoading(false)
    })()
  }, [supabase])

  // Filter cost centers by selected branch
  const filteredCostCenters = useMemo(() => {
    if (selectedBranch === "all") return costCenters
    return costCenters.filter(cc => cc.branch_id === selectedBranch)
  }, [costCenters, selectedBranch])

  // Filter warehouses by selected branch and cost center
  const filteredWarehouses = useMemo(() => {
    let filtered = warehouses
    if (selectedBranch !== "all") {
      filtered = filtered.filter(w => w.branch_id === selectedBranch)
    }
    if (selectedCostCenter !== "all") {
      filtered = filtered.filter(w => w.cost_center_id === selectedCostCenter)
    }
    return filtered
  }, [warehouses, selectedBranch, selectedCostCenter])

  // Load report data
  const loadReport = async () => {
    if (!companyId) return
    setLoading(true)

    try {
      // Build filters
      let invoiceQuery = supabase
        .from("invoices")
        .select("total_amount, subtotal, tax_amount")
        .eq("company_id", companyId)
        .gte("invoice_date", dateFrom)
        .lte("invoice_date", dateTo)
        .in("status", ["sent", "paid", "partially_paid"])

      let billQuery = supabase
        .from("bills")
        .select("total_amount, subtotal, tax_amount")
        .eq("company_id", companyId)
        .gte("bill_date", dateFrom)
        .lte("bill_date", dateTo)
        .in("status", ["sent", "received", "paid", "partially_paid"])

      let salesReturnQuery = supabase
        .from("sales_returns")
        .select("total_amount")
        .eq("company_id", companyId)
        .gte("return_date", dateFrom)
        .lte("return_date", dateTo)

      // Apply branch filter
      if (selectedBranch !== "all") {
        invoiceQuery = invoiceQuery.eq("branch_id", selectedBranch)
        billQuery = billQuery.eq("branch_id", selectedBranch)
        salesReturnQuery = salesReturnQuery.eq("branch_id", selectedBranch)
      }

      // Apply cost center filter
      if (selectedCostCenter !== "all") {
        invoiceQuery = invoiceQuery.eq("cost_center_id", selectedCostCenter)
        billQuery = billQuery.eq("cost_center_id", selectedCostCenter)
        salesReturnQuery = salesReturnQuery.eq("cost_center_id", selectedCostCenter)
      }

      // Apply warehouse filter
      if (selectedWarehouse !== "all") {
        invoiceQuery = invoiceQuery.eq("warehouse_id", selectedWarehouse)
        billQuery = billQuery.eq("warehouse_id", selectedWarehouse)
        salesReturnQuery = salesReturnQuery.eq("warehouse_id", selectedWarehouse)
      }

      const [invoicesRes, billsRes, returnsRes] = await Promise.all([
        invoiceQuery,
        billQuery,
        salesReturnQuery,
      ])

      const invoices = invoicesRes.data || []
      const bills = billsRes.data || []
      const returns = returnsRes.data || []

      const totalSales = invoices.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0)
      const totalPurchases = bills.reduce((sum, bill) => sum + Number(bill.total_amount || 0), 0)
      const totalReturns = returns.reduce((sum, ret) => sum + Number(ret.total_amount || 0), 0)

      setReportData({
        totalSales,
        totalPurchases,
        totalReturns,
        netRevenue: totalSales - totalReturns,
        inventoryValue: totalPurchases, // Simplified
        invoiceCount: invoices.length,
        billCount: bills.length,
      })
    } catch (err) {
      console.error("Error loading report:", err)
    } finally {
      setLoading(false)
    }
  }

  // Reset cost center and warehouse when branch changes
  useEffect(() => {
    setSelectedCostCenter("all")
    setSelectedWarehouse("all")
  }, [selectedBranch])

  // Reset warehouse when cost center changes
  useEffect(() => {
    setSelectedWarehouse("all")
  }, [selectedCostCenter])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat(appLang === 'en' ? 'en-US' : 'ar-EG', {
      style: 'currency',
      currency: 'EGP',
      minimumFractionDigits: 2,
    }).format(amount)
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
          {/* Header */}
          <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="p-2 sm:p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg sm:rounded-xl flex-shrink-0">
                  <Building2 className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">
                    {t('Branch & Cost Center Report', 'تقرير الفروع ومراكز التكلفة')}
                  </h1>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">
                    {t('Financial analysis by branch, cost center, and warehouse', 'تحليل مالي حسب الفرع ومركز التكلفة والمخزن')}
                  </p>
                </div>
              </div>
              <Link href="/reports">
                <Button variant="outline" size="sm">
                  {appLang === 'en' ? <ArrowLeft className="w-4 h-4 mr-2" /> : <ArrowRight className="w-4 h-4 ml-2" />}
                  {t('Back to Reports', 'العودة للتقارير')}
                </Button>
              </Link>
            </div>
          </div>

          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('Filters', 'الفلاتر')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {/* Branch */}
                <div>
                  <label className="block text-sm font-medium mb-1">{t('Branch', 'الفرع')}</label>
                  <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('All Branches', 'جميع الفروع')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('All Branches', 'جميع الفروع')}</SelectItem>
                      {branches.map(b => (
                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Cost Center */}
                <div>
                  <label className="block text-sm font-medium mb-1">{t('Cost Center', 'مركز التكلفة')}</label>
                  <Select value={selectedCostCenter} onValueChange={setSelectedCostCenter}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('All Cost Centers', 'جميع مراكز التكلفة')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('All Cost Centers', 'جميع مراكز التكلفة')}</SelectItem>
                      {filteredCostCenters.map(cc => (
                        <SelectItem key={cc.id} value={cc.id}>{cc.cost_center_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Warehouse */}
                <div>
                  <label className="block text-sm font-medium mb-1">{t('Warehouse', 'المخزن')}</label>
                  <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('All Warehouses', 'جميع المخازن')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('All Warehouses', 'جميع المخازن')}</SelectItem>
                      {filteredWarehouses.map(w => (
                        <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Date From */}
                <div>
                  <label className="block text-sm font-medium mb-1">{t('From Date', 'من تاريخ')}</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>

                {/* Date To */}
                <div>
                  <label className="block text-sm font-medium mb-1">{t('To Date', 'إلى تاريخ')}</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <Button onClick={loadReport} disabled={loading}>
                  <FileText className="w-4 h-4 mr-2" />
                  {loading ? t('Loading...', 'جاري التحميل...') : t('Generate Report', 'إنشاء التقرير')}
                </Button>
                <Button variant="outline" disabled={!reportData}>
                  <Download className="w-4 h-4 mr-2" />
                  {t('Export', 'تصدير')}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Report Results */}
          {reportData && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Total Sales */}
              <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 border-green-200 dark:border-green-800">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-green-600 dark:text-green-400 font-medium">{t('Total Sales', 'إجمالي المبيعات')}</p>
                      <p className="text-2xl font-bold text-green-700 dark:text-green-300 mt-1">{formatCurrency(reportData.totalSales)}</p>
                      <p className="text-xs text-green-500 mt-1">{reportData.invoiceCount} {t('invoices', 'فاتورة')}</p>
                    </div>
                    <div className="p-3 bg-green-200 dark:bg-green-800 rounded-full">
                      <TrendingUp className="w-6 h-6 text-green-600 dark:text-green-400" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Total Purchases */}
              <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-blue-200 dark:border-blue-800">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">{t('Total Purchases', 'إجمالي المشتريات')}</p>
                      <p className="text-2xl font-bold text-blue-700 dark:text-blue-300 mt-1">{formatCurrency(reportData.totalPurchases)}</p>
                      <p className="text-xs text-blue-500 mt-1">{reportData.billCount} {t('bills', 'فاتورة')}</p>
                    </div>
                    <div className="p-3 bg-blue-200 dark:bg-blue-800 rounded-full">
                      <Package className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Returns */}
              <Card className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 border-orange-200 dark:border-orange-800">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-orange-600 dark:text-orange-400 font-medium">{t('Sales Returns', 'مرتجعات المبيعات')}</p>
                      <p className="text-2xl font-bold text-orange-700 dark:text-orange-300 mt-1">{formatCurrency(reportData.totalReturns)}</p>
                    </div>
                    <div className="p-3 bg-orange-200 dark:bg-orange-800 rounded-full">
                      <TrendingDown className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Net Revenue */}
              <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 border-purple-200 dark:border-purple-800">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-purple-600 dark:text-purple-400 font-medium">{t('Net Revenue', 'صافي الإيرادات')}</p>
                      <p className="text-2xl font-bold text-purple-700 dark:text-purple-300 mt-1">{formatCurrency(reportData.netRevenue)}</p>
                    </div>
                    <div className="p-3 bg-purple-200 dark:bg-purple-800 rounded-full">
                      <DollarSign className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Summary Info */}
          {reportData && (
            <Card>
              <CardHeader>
                <CardTitle>{t('Report Summary', 'ملخص التقرير')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="text-gray-600 dark:text-gray-400">{t('Selected Branch', 'الفرع المحدد')}</span>
                    <span className="font-medium">
                      {selectedBranch === "all" ? t('All Branches', 'جميع الفروع') : branches.find(b => b.id === selectedBranch)?.name}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="text-gray-600 dark:text-gray-400">{t('Selected Cost Center', 'مركز التكلفة المحدد')}</span>
                    <span className="font-medium">
                      {selectedCostCenter === "all" ? t('All Cost Centers', 'جميع مراكز التكلفة') : costCenters.find(cc => cc.id === selectedCostCenter)?.cost_center_name}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="text-gray-600 dark:text-gray-400">{t('Selected Warehouse', 'المخزن المحدد')}</span>
                    <span className="font-medium">
                      {selectedWarehouse === "all" ? t('All Warehouses', 'جميع المخازن') : warehouses.find(w => w.id === selectedWarehouse)?.name}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="text-gray-600 dark:text-gray-400">{t('Period', 'الفترة')}</span>
                    <span className="font-medium">{dateFrom} - {dateTo}</span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-gray-600 dark:text-gray-400">{t('Gross Profit', 'إجمالي الربح')}</span>
                    <span className={`font-bold text-lg ${reportData.netRevenue - reportData.totalPurchases >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(reportData.netRevenue - reportData.totalPurchases)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  )
}

