"use client"

import { useState, useEffect, useMemo } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { Warehouse, Building2, Package, FileText, Download, ArrowLeft, ArrowRight, Box, TrendingUp, TrendingDown } from "lucide-react"
import Link from "next/link"
import { useUserContext } from "@/hooks/use-user-context"

type Branch = { id: string; name?: string | null; branch_name?: string | null; code?: string | null }
type WarehouseData = { id: string; name: string; code: string; branch_id: string }

type WarehouseInventory = {
  warehouseId: string
  warehouseName: string
  warehouseCode: string
  branchName: string
  totalProducts: number
  totalQuantity: number
  totalValue: number
  inboundQty: number
  outboundQty: number
  netMovement: number
}

export default function WarehouseInventoryReportPage() {
  const supabase = useSupabase()
  const { userContext, loading: userContextLoading, error: userContextError } = useUserContext()
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [branches, setBranches] = useState<Branch[]>([])
  const [warehouses, setWarehouses] = useState<WarehouseData[]>([])
  const [selectedBranch, setSelectedBranch] = useState<string>("")
  const [selectedCostCenterId, setSelectedCostCenterId] = useState<string>("")
  const [userBranchId, setUserBranchId] = useState<string>("")
  const [canOverride, setCanOverride] = useState(false)
  const [inventoryData, setInventoryData] = useState<WarehouseInventory[]>([])
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 1)
    return d.toISOString().slice(0, 10)
  })
  const [dateTo, setDateTo] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [loading, setLoading] = useState(true)
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')

  useEffect(() => {
    const handler = () => {
      try {
        const v = localStorage.getItem('app_language') || 'ar'
        setAppLang(v === 'en' ? 'en' : 'ar')
      } catch { }
    }
    handler()
    window.addEventListener('app_language_changed', handler)
    return () => window.removeEventListener('app_language_changed', handler)
  }, [])

  const t = (en: string, ar: string) => (appLang === 'en' ? en : ar)

  // Load initial data
  useEffect(() => {
    ; (async () => {
      if (userContextLoading) return
      if (userContextError) return
      if (!userContext) return
      const cid = await getActiveCompanyId(supabase)
      if (!cid) return
      setCompanyId(cid)

      const role = String(userContext.role || "viewer")
      const normalizedRole = role.trim().toLowerCase().replace(/\s+/g, "_")
      const isCanOverride = ["super_admin", "admin", "general_manager", "gm", "owner", "generalmanager", "superadmin"].includes(normalizedRole)
      setCanOverride(isCanOverride)

      const ub = String(userContext.branch_id || "")
      setUserBranchId(ub)
      if (!selectedBranch && ub) setSelectedBranch(ub)

      if (ub) {
        const { getBranchDefaults } = await import("@/lib/governance-branch-defaults")
        const defaults = await getBranchDefaults(supabase, ub)
        setSelectedCostCenterId(defaults.default_cost_center_id || "")
      }

      const [branchRes, whRes] = await Promise.all([
        supabase.from("branches").select("id, name, branch_name, code").eq("company_id", cid).eq("is_active", true),
        supabase.from("warehouses").select("id, name, code, branch_id").eq("company_id", cid).eq("is_active", true),
      ])

      setBranches((branchRes.data || []) as Branch[])
      setWarehouses((whRes.data || []) as WarehouseData[])
      setLoading(false)
    })()
  }, [supabase, userContextLoading, userContextError, userContext])

  // Filter warehouses by selected branch and user permissions
  const filteredWarehouses = useMemo(() => {
    let filtered = warehouses

    if (!selectedBranch) return []
    filtered = filtered.filter(w => w.branch_id === selectedBranch)

    return filtered
  }, [warehouses, selectedBranch])

  // فلترة الفروع المتاحة للمستخدم
  const filteredBranches = useMemo(() => {
    if (canOverride) return branches
    if (!userBranchId) return []
    return branches.filter(b => b.id === userBranchId)
  }, [branches, canOverride, userBranchId])

  /**
   * ✅ تحميل بيانات مخزون المخازن
   * ⚠️ OPERATIONAL REPORT - تقرير تشغيلي (من inventory_transactions مباشرة)
   * راجع: docs/OPERATIONAL_REPORTS_GUIDE.md
   */
  const loadInventoryReport = async () => {
    if (!companyId) return
    if (!selectedBranch || !selectedCostCenterId) return
    setLoading(true)

    try {
      const data: WarehouseInventory[] = []
      const whsToAnalyze = filteredWarehouses

      for (const wh of whsToAnalyze) {
        const branch = branches.find(b => b.id === wh.branch_id)

        // ✅ جلب حركات المخزون (تقرير تشغيلي - من inventory_transactions مباشرة)
        // ⚠️ ملاحظة: هذا تقرير تشغيلي وليس محاسبي رسمي
        const { data: transactions } = await supabase
          .from("inventory_transactions")
          .select("quantity_change, transaction_type")
          .eq("company_id", companyId)
          .eq("branch_id", selectedBranch)
          .eq("warehouse_id", wh.id)
          .eq("cost_center_id", selectedCostCenterId)
          .or("is_deleted.is.null,is_deleted.eq.false") // ✅ استثناء الحركات المحذوفة
          .gte("created_at", dateFrom)
          .lte("created_at", dateTo + "T23:59:59")

        // Get unique products in this warehouse
        const { data: productCount } = await supabase
          .from("inventory_transactions")
          .select("product_id")
          .eq("company_id", companyId)
          .eq("branch_id", selectedBranch)
          .eq("warehouse_id", wh.id)
          .eq("cost_center_id", selectedCostCenterId)

        const uniqueProducts = new Set((productCount || []).map((p: any) => p.product_id)).size

        // Calculate inbound and outbound
        let inboundQty = 0
        let outboundQty = 0
        let totalQuantity = 0

        for (const tx of transactions || []) {
          const qty = Number(tx.quantity_change) || 0
          if (qty > 0) {
            inboundQty += qty
          } else {
            outboundQty += Math.abs(qty)
          }
          totalQuantity += qty
        }

        data.push({
          warehouseId: wh.id,
          warehouseName: wh.name,
          warehouseCode: wh.code,
          branchName: branch?.name || '-',
          totalProducts: uniqueProducts,
          totalQuantity,
          totalValue: 0, // Would need product prices to calculate
          inboundQty,
          outboundQty,
          netMovement: inboundQty - outboundQty,
        })
      }

      data.sort((a, b) => b.totalQuantity - a.totalQuantity)
      setInventoryData(data)
    } catch (err) {
      console.error("Error loading inventory:", err)
    } finally {
      setLoading(false)
    }
  }

  const formatNumber = (num: number) => new Intl.NumberFormat(appLang === 'en' ? 'en-US' : 'ar-EG').format(num)

  const totals = inventoryData.reduce((acc, inv) => ({
    totalProducts: acc.totalProducts + inv.totalProducts,
    totalQuantity: acc.totalQuantity + inv.totalQuantity,
    inboundQty: acc.inboundQty + inv.inboundQty,
    outboundQty: acc.outboundQty + inv.outboundQty,
    netMovement: acc.netMovement + inv.netMovement,
  }), { totalProducts: 0, totalQuantity: 0, inboundQty: 0, outboundQty: 0, netMovement: 0 })

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
          {/* Header */}
          <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="p-2 sm:p-3 bg-amber-100 dark:bg-amber-900/30 rounded-lg sm:rounded-xl flex-shrink-0">
                  <Warehouse className="w-5 h-5 sm:w-6 sm:h-6 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">
                    {t('Warehouse Inventory Report', 'تقرير مخزون المخازن')}
                  </h1>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">
                    {t('Inventory levels and movements by warehouse', 'مستويات المخزون والحركات حسب المخزن')}
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
              <div className={`grid grid-cols-1 ${canOverride ? 'sm:grid-cols-4' : 'sm:grid-cols-3'} gap-4`}>
                {canOverride && (
                  <div>
                    <label className="block text-sm font-medium mb-1">{t('Branch', 'الفرع')}</label>
                    <Select
                      value={selectedBranch}
                      onValueChange={(value) => {
                        setSelectedBranch(value)
                        ;(async () => {
                          try {
                            const { getBranchDefaults } = await import("@/lib/governance-branch-defaults")
                            const defaults = await getBranchDefaults(supabase, value)
                            setSelectedCostCenterId(defaults.default_cost_center_id || "")
                          } catch (e: any) {
                            setSelectedCostCenterId("")
                          }
                        })()
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('Select branch', 'اختر الفرع')} />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredBranches.map(b => (
                          <SelectItem key={b.id} value={b.id}>{b.name || b.branch_name || ''}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium mb-1">{t('From Date', 'من تاريخ')}</label>
                  <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('To Date', 'إلى تاريخ')}</label>
                  <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div className="flex items-end gap-2">
                  <Button onClick={loadInventoryReport} disabled={loading} className="flex-1">
                    <FileText className="w-4 h-4 mr-2" />
                    {loading ? t('Loading...', 'جاري التحميل...') : t('Generate', 'إنشاء')}
                  </Button>
                  <Button variant="outline" disabled={inventoryData.length === 0}>
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Summary Cards */}
          {inventoryData.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Card className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/20 dark:to-amber-800/20">
                <CardContent className="pt-4">
                  <p className="text-xs text-amber-600 dark:text-amber-400">{t('Total Warehouses', 'إجمالي المخازن')}</p>
                  <p className="text-xl font-bold text-amber-700 dark:text-amber-300">{inventoryData.length}</p>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20">
                <CardContent className="pt-4">
                  <p className="text-xs text-green-600 dark:text-green-400">{t('Inbound', 'الوارد')}</p>
                  <p className="text-xl font-bold text-green-700 dark:text-green-300">+{formatNumber(totals.inboundQty)}</p>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20">
                <CardContent className="pt-4">
                  <p className="text-xs text-red-600 dark:text-red-400">{t('Outbound', 'الصادر')}</p>
                  <p className="text-xl font-bold text-red-700 dark:text-red-300">-{formatNumber(totals.outboundQty)}</p>
                </CardContent>
              </Card>
              <Card className={`bg-gradient-to-br ${totals.netMovement >= 0 ? 'from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20' : 'from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20'}`}>
                <CardContent className="pt-4">
                  <p className={`text-xs ${totals.netMovement >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-orange-600 dark:text-orange-400'}`}>{t('Net Movement', 'صافي الحركة')}</p>
                  <p className={`text-xl font-bold ${totals.netMovement >= 0 ? 'text-blue-700 dark:text-blue-300' : 'text-orange-700 dark:text-orange-300'}`}>{totals.netMovement >= 0 ? '+' : ''}{formatNumber(totals.netMovement)}</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Results Table */}
          {inventoryData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{t('Warehouse Inventory Summary', 'ملخص مخزون المخازن')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 dark:bg-slate-800">
                        <th className="text-right p-3 font-medium">#</th>
                        <th className="text-right p-3 font-medium">{t('Warehouse', 'المخزن')}</th>
                        <th className="text-right p-3 font-medium">{t('Branch', 'الفرع')}</th>
                        <th className="text-right p-3 font-medium">{t('Products', 'المنتجات')}</th>
                        <th className="text-right p-3 font-medium">{t('Inbound', 'الوارد')}</th>
                        <th className="text-right p-3 font-medium">{t('Outbound', 'الصادر')}</th>
                        <th className="text-right p-3 font-medium">{t('Net Movement', 'صافي الحركة')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventoryData.map((inv, index) => (
                        <tr key={inv.warehouseId} className="border-b hover:bg-gray-50 dark:hover:bg-slate-800/50">
                          <td className="p-3">{index + 1}</td>
                          <td className="p-3 font-medium">
                            <div className="flex items-center gap-2">
                              <Box className="w-4 h-4 text-amber-500" />
                              {inv.warehouseName}
                              <span className="text-xs text-gray-400">({inv.warehouseCode})</span>
                            </div>
                          </td>
                          <td className="p-3 text-gray-600">
                            <div className="flex items-center gap-1">
                              <Building2 className="w-3 h-3" />
                              {inv.branchName}
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-1">
                              <Package className="w-3 h-3 text-gray-400" />
                              {formatNumber(inv.totalProducts)}
                            </div>
                          </td>
                          <td className="p-3 text-green-600 font-medium">+{formatNumber(inv.inboundQty)}</td>
                          <td className="p-3 text-red-600 font-medium">-{formatNumber(inv.outboundQty)}</td>
                          <td className={`p-3 font-bold ${inv.netMovement >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                            <div className="flex items-center gap-1">
                              {inv.netMovement >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                              {inv.netMovement >= 0 ? '+' : ''}{formatNumber(inv.netMovement)}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-100 dark:bg-slate-800 font-bold">
                        <td className="p-3" colSpan={3}>{t('Total', 'الإجمالي')}</td>
                        <td className="p-3">{formatNumber(totals.totalProducts)}</td>
                        <td className="p-3 text-green-600">+{formatNumber(totals.inboundQty)}</td>
                        <td className="p-3 text-red-600">-{formatNumber(totals.outboundQty)}</td>
                        <td className={`p-3 ${totals.netMovement >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>{totals.netMovement >= 0 ? '+' : ''}{formatNumber(totals.netMovement)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* No Data */}
          {!loading && inventoryData.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <Warehouse className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
                <p className="text-gray-500 dark:text-gray-400">
                  {t('Click "Generate" to view warehouse inventory report', 'اضغط "إنشاء" لعرض تقرير مخزون المخازن')}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  )
}
