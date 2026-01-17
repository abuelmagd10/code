"use client"

import { useState, useEffect, useMemo } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import { getActiveCompanyId } from "@/lib/company"
import { Warehouse, Building2, Package, Box, TrendingUp, TrendingDown } from "lucide-react"
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

export default function InventoryPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const { userContext, loading: userContextLoading, error: userContextError } = useUserContext()
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [branches, setBranches] = useState<Branch[]>([])
  const [warehouses, setWarehouses] = useState<WarehouseData[]>([])
  const [selectedBranch, setSelectedBranch] = useState<string>("")
  const [selectedCostCenterId, setSelectedCostCenterId] = useState<string>("")
  const [userBranchId, setUserBranchId] = useState<string>("")
  const [canOverride, setCanOverride] = useState(false)
  const [inventoryData, setInventoryData] = useState<WarehouseInventory[]>([])
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
    if (!canOverride && userBranchId) {
      return warehouses.filter(wh => wh.branch_id === userBranchId)
    }
    if (selectedBranch) {
      return warehouses.filter(wh => wh.branch_id === selectedBranch)
    }
    return warehouses
  }, [warehouses, canOverride, userBranchId, selectedBranch])

  const filteredBranches = useMemo(() => {
    if (!canOverride && userBranchId) {
      return branches.filter(b => b.id === userBranchId)
    }
    return branches
  }, [branches, canOverride, userBranchId])

  // Load inventory data
  const loadInventoryReport = async () => {
    if (!companyId) return
    if (!selectedBranch || !selectedCostCenterId) {
      toast({ variant: "destructive", title: t("Error", "خطأ"), description: t("Please select branch and cost center", "يرجى اختيار الفرع ومركز التكلفة") })
      return
    }
    setLoading(true)

    try {
      const data: WarehouseInventory[] = []
      const whsToAnalyze = filteredWarehouses

      for (const wh of whsToAnalyze) {
        const branch = branches.find(b => b.id === wh.branch_id)

        // Get all inventory transactions for this warehouse (current stock)
        const { data: transactions } = await supabase
          .from("inventory_transactions")
          .select("product_id, quantity_change, transaction_type, is_deleted")
          .eq("company_id", companyId)
          .eq("branch_id", selectedBranch)
          .eq("warehouse_id", wh.id)
          .eq("cost_center_id", selectedCostCenterId)
          .or("is_deleted.is.null,is_deleted.eq.false")

        // Get unique products in this warehouse
        const uniqueProducts = new Set((transactions || []).map((p: any) => p.product_id)).size

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

        // Calculate total value
        const { data: products } = await supabase
          .from("products")
          .select("id, cost_price")
          .eq("company_id", companyId)
          .in("id", Array.from(new Set((transactions || []).map((t: any) => t.product_id))))

        const productCostMap = new Map((products || []).map((p: any) => [p.id, Number(p.cost_price || 0)]))
        let totalValue = 0
        const qtyByProduct: Record<string, number> = {}
        for (const tx of transactions || []) {
          const pid = String(tx.product_id)
          qtyByProduct[pid] = (qtyByProduct[pid] || 0) + Number(tx.quantity_change || 0)
        }
        for (const [pid, qty] of Object.entries(qtyByProduct)) {
          const cost = productCostMap.get(pid) || 0
          totalValue += Math.max(0, qty) * cost
        }

        data.push({
          warehouseId: wh.id,
          warehouseName: wh.name,
          warehouseCode: wh.code || "",
          branchName: branch?.name || branch?.branch_name || "",
          totalProducts: uniqueProducts,
          totalQuantity: Math.max(0, totalQuantity),
          totalValue: totalValue,
          inboundQty: inboundQty,
          outboundQty: outboundQty,
          netMovement: totalQuantity
        })
      }

      setInventoryData(data)
    } catch (err: any) {
      console.error("Error loading inventory:", err)
      toast({ variant: "destructive", title: t("Error", "خطأ"), description: err.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (companyId && selectedBranch && selectedCostCenterId) {
      loadInventoryReport()
    }
  }, [companyId, selectedBranch, selectedCostCenterId, filteredWarehouses])

  const totals = useMemo(() => {
    return inventoryData.reduce((acc, inv) => ({
      inboundQty: acc.inboundQty + inv.inboundQty,
      outboundQty: acc.outboundQty + inv.outboundQty,
      netMovement: acc.netMovement + inv.netMovement,
      totalValue: acc.totalValue + inv.totalValue
    }), { inboundQty: 0, outboundQty: 0, netMovement: 0, totalValue: 0 })
  }, [inventoryData])

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(num)
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
          {/* Header */}
          <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="p-2 sm:p-3 bg-amber-100 dark:bg-amber-900/30 rounded-lg sm:rounded-xl flex-shrink-0">
                <Warehouse className="w-5 h-5 sm:w-6 sm:h-6 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">
                  {t('Inventory', 'المخزون')}
                </h1>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">
                  {t('Current inventory levels by warehouse', 'مستويات المخزون الحالية حسب المخزن')}
                </p>
              </div>
            </div>
          </div>

          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('Filters', 'الفلاتر')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`grid grid-cols-1 ${canOverride ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-4`}>
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
                <div className="flex items-end gap-2">
                  <Button onClick={loadInventoryReport} disabled={loading || !selectedBranch || !selectedCostCenterId} className="flex-1">
                    <Package className="w-4 h-4 mr-2" />
                    {loading ? t('Loading...', 'جاري التحميل...') : t('Refresh', 'تحديث')}
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
                  <p className={`text-xs ${totals.netMovement >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-orange-600 dark:text-orange-400'}`}>{t('Total Stock', 'إجمالي المخزون')}</p>
                  <p className={`text-xl font-bold ${totals.netMovement >= 0 ? 'text-blue-700 dark:text-blue-300' : 'text-orange-700 dark:text-orange-300'}`}>{formatNumber(totals.netMovement)}</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Results Table */}
          {loading ? (
            <Card>
              <CardContent className="py-8 text-center text-gray-500">{t('Loading...', 'جاري التحميل...')}</CardContent>
            </Card>
          ) : inventoryData.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-gray-500">{t('No inventory data found', 'لا توجد بيانات مخزون')}</CardContent>
            </Card>
          ) : (
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
                        <th className="text-right p-3 font-medium">{t('Current Stock', 'المخزون الحالي')}</th>
                        <th className="text-right p-3 font-medium">{t('Total Value', 'القيمة الإجمالية')}</th>
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
                              {inv.warehouseCode && <span className="text-xs text-gray-400">({inv.warehouseCode})</span>}
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
                              {formatNumber(inv.totalQuantity)}
                            </div>
                          </td>
                          <td className="p-3 text-right font-semibold">{formatNumber(inv.totalValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  )
}
