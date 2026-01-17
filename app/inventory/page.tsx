"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import { getActiveCompanyId } from "@/lib/company"
import { Package, Warehouse, Building2, Search, AlertTriangle, TrendingDown } from "lucide-react"
import { useUserContext } from "@/hooks/use-user-context"

interface InventoryItem {
  product_id: string
  product_name: string
  product_sku: string
  warehouse_id: string
  warehouse_name: string
  branch_name: string
  quantity: number
  cost_price: number
  total_value: number
  reorder_level: number
  is_low_stock: boolean
}

interface Warehouse {
  id: string
  name: string
  code: string
  branch_id: string | null
}

interface Branch {
  id: string
  name?: string | null
  branch_name?: string | null
}

export default function InventoryPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const { userContext, loading: userContextLoading } = useUserContext()
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>("")
  const [selectedBranch, setSelectedBranch] = useState<string>("")
  const [searchQuery, setSearchQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')

  useEffect(() => {
    const handler = () => {
      try {
        setAppLang(localStorage.getItem('app_language') === 'en' ? 'en' : 'ar')
      } catch {}
    }
    handler()
    window.addEventListener('app_language_changed', handler)
    return () => window.removeEventListener('app_language_changed', handler)
  }, [])

  const t = (en: string, ar: string) => (appLang === 'en' ? en : ar)

  useEffect(() => {
    loadInitialData()
  }, [supabase, userContextLoading, userContext])

  const loadInitialData = async () => {
    try {
      setLoading(true)
      if (userContextLoading) return
      if (!userContext) return

      const cid = await getActiveCompanyId(supabase)
      if (!cid) return
      setCompanyId(cid)

      // Load warehouses and branches
      const [warehousesRes, branchesRes] = await Promise.all([
        supabase
          .from("warehouses")
          .select("id, name, code, branch_id")
          .eq("company_id", cid)
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("branches")
          .select("id, name, branch_name")
          .eq("company_id", cid)
          .eq("is_active", true)
          .order("name")
      ])

      setWarehouses((warehousesRes.data || []) as Warehouse[])
      setBranches((branchesRes.data || []) as Branch[])

      // Set default warehouse/branch based on user context
      if (userContext.warehouse_id) {
        setSelectedWarehouse(userContext.warehouse_id)
      } else if (warehousesRes.data && warehousesRes.data.length > 0) {
        setSelectedWarehouse(warehousesRes.data[0].id)
      }

      if (userContext.branch_id) {
        setSelectedBranch(userContext.branch_id)
      }

      await loadInventory(cid)
    } catch (err: any) {
      console.error("Error loading initial data:", err)
      toast({ variant: "destructive", title: t("Error", "خطأ"), description: err.message })
    } finally {
      setLoading(false)
    }
  }

  const loadInventory = async (cid: string) => {
    try {
      if (!selectedWarehouse) {
        setInventory([])
        return
      }

      // Get warehouse details
      const { data: warehouse } = await supabase
        .from("warehouses")
        .select("branch_id")
        .eq("id", selectedWarehouse)
        .eq("company_id", cid)
        .single()

      if (!warehouse?.branch_id) {
        setInventory([])
        return
      }

      const branchId = warehouse.branch_id

      // Get branch defaults
      const { getBranchDefaults } = await import("@/lib/governance-branch-defaults")
      const defaults = await getBranchDefaults(supabase, branchId)
      const costCenterId = defaults.default_cost_center_id

      if (!costCenterId) {
        toast({ variant: "destructive", title: t("Error", "خطأ"), description: t("Branch missing cost center", "الفرع لا يحتوي على مركز تكلفة") })
        setInventory([])
        return
      }

      // Load products
      const { data: products } = await supabase
        .from("products")
        .select("id, name, sku, cost_price, reorder_level, item_type")
        .eq("company_id", cid)
        .or("item_type.is.null,item_type.eq.product")

      if (!products || products.length === 0) {
        setInventory([])
        return
      }

      // Load inventory transactions
      const { data: transactions } = await supabase
        .from("inventory_transactions")
        .select("product_id, quantity_change, is_deleted")
        .eq("company_id", cid)
        .eq("branch_id", branchId)
        .eq("warehouse_id", selectedWarehouse)
        .eq("cost_center_id", costCenterId)
        .or("is_deleted.is.null,is_deleted.eq.false")

      // Calculate stock per product
      const stockByProduct: Record<string, number> = {}
      for (const tx of transactions || []) {
        if (tx.is_deleted) continue
        const pid = String(tx.product_id)
        stockByProduct[pid] = (stockByProduct[pid] || 0) + Number(tx.quantity_change || 0)
      }

      // Get branch name
      const { data: branch } = await supabase
        .from("branches")
        .select("name, branch_name")
        .eq("id", branchId)
        .single()

      const branchName = branch?.name || branch?.branch_name || ""

      // Get warehouse name
      const { data: wh } = await supabase
        .from("warehouses")
        .select("name")
        .eq("id", selectedWarehouse)
        .single()

      const warehouseName = wh?.name || ""

      // Build inventory items
      const items: InventoryItem[] = products
        .map((p: any) => {
          const pid = String(p.id)
          const qty = Math.max(0, stockByProduct[pid] || 0)
          const cost = Number(p.cost_price || 0)
          const reorderLevel = Number(p.reorder_level || 0)

          return {
            product_id: pid,
            product_name: p.name || "",
            product_sku: p.sku || "",
            warehouse_id: selectedWarehouse,
            warehouse_name: warehouseName,
            branch_name: branchName,
            quantity: qty,
            cost_price: cost,
            total_value: qty * cost,
            reorder_level: reorderLevel,
            is_low_stock: qty < reorderLevel && reorderLevel > 0
          }
        })
        .filter((item: InventoryItem) => item.quantity > 0 || searchQuery) // Show all if searching, otherwise only items with stock

      // Apply branch filter if selected
      const filteredItems = selectedBranch && warehouse?.branch_id !== selectedBranch
        ? []
        : items

      setInventory(filteredItems)
    } catch (err: any) {
      console.error("Error loading inventory:", err)
      toast({ variant: "destructive", title: t("Error", "خطأ"), description: err.message })
    }
  }

  useEffect(() => {
    if (companyId && selectedWarehouse) {
      loadInventory(companyId)
    }
  }, [selectedWarehouse, selectedBranch, companyId])

  const filteredInventory = inventory.filter(item => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      item.product_name.toLowerCase().includes(query) ||
      item.product_sku.toLowerCase().includes(query) ||
      item.warehouse_name.toLowerCase().includes(query)
    )
  })

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(num)
  }

  const lowStockCount = filteredInventory.filter(item => item.is_low_stock).length
  const totalValue = filteredInventory.reduce((sum, item) => sum + item.total_value, 0)
  const totalItems = filteredInventory.length

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-6 w-6" />
              {t("Inventory", "المخزون")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Filters */}
            <div className="grid gap-4 mb-6 md:grid-cols-3">
              <div>
                <label className="text-sm font-medium mb-2 block">{t("Warehouse", "المخزن")}</label>
                <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("Select warehouse", "اختر المخزن")} />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.map((wh) => (
                      <SelectItem key={wh.id} value={wh.id}>
                        {wh.name} {wh.code && `(${wh.code})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">{t("Branch", "الفرع")}</label>
                <Select value={selectedBranch || "all"} onValueChange={(value) => setSelectedBranch(value === "all" ? "" : value)}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("All branches", "كل الفروع")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("All branches", "كل الفروع")}</SelectItem>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name || b.branch_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">{t("Search", "بحث")}</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder={t("Search products...", "بحث عن منتجات...")}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid gap-4 mb-6 md:grid-cols-3">
              <Card>
                <CardContent className="p-4">
                  <div className="text-sm text-gray-600 dark:text-gray-400">{t("Total Items", "إجمالي الأصناف")}</div>
                  <div className="text-2xl font-bold">{formatNumber(totalItems)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-sm text-gray-600 dark:text-gray-400">{t("Low Stock Items", "أصناف منخفضة الكمية")}</div>
                  <div className="text-2xl font-bold text-orange-600">{formatNumber(lowStockCount)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-sm text-gray-600 dark:text-gray-400">{t("Total Value", "القيمة الإجمالية")}</div>
                  <div className="text-2xl font-bold text-green-600">{formatNumber(totalValue)}</div>
                </CardContent>
              </Card>
            </div>

            {/* Inventory Table */}
            {loading ? (
              <div className="text-center py-8 text-gray-500">{t("Loading...", "جاري التحميل...")}</div>
            ) : filteredInventory.length === 0 ? (
              <div className="text-center py-8 text-gray-500">{t("No inventory found", "لا يوجد مخزون")}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b bg-gray-50 dark:bg-slate-800">
                      <th className="p-3 text-left text-sm font-medium">{t("#", "#")}</th>
                      <th className="p-3 text-left text-sm font-medium">{t("Product", "المنتج")}</th>
                      <th className="p-3 text-left text-sm font-medium">{t("SKU", "الكود")}</th>
                      <th className="p-3 text-left text-sm font-medium">{t("Warehouse", "المخزن")}</th>
                      <th className="p-3 text-left text-sm font-medium">{t("Branch", "الفرع")}</th>
                      <th className="p-3 text-right text-sm font-medium">{t("Quantity", "الكمية")}</th>
                      <th className="p-3 text-right text-sm font-medium">{t("Unit Cost", "تكلفة الوحدة")}</th>
                      <th className="p-3 text-right text-sm font-medium">{t("Total Value", "القيمة الإجمالية")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInventory.map((item, index) => (
                      <tr
                        key={`${item.product_id}-${item.warehouse_id}`}
                        className={`border-b hover:bg-gray-50 dark:hover:bg-slate-800/50 ${item.is_low_stock ? 'bg-orange-50 dark:bg-orange-900/10' : ''}`}
                      >
                        <td className="p-3">{index + 1}</td>
                        <td className="p-3 font-medium">
                          <div className="flex items-center gap-2">
                            {item.is_low_stock && <AlertTriangle className="h-4 w-4 text-orange-500" />}
                            {item.product_name}
                          </div>
                        </td>
                        <td className="p-3 text-gray-600">{item.product_sku}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-1">
                            <Warehouse className="w-4 h-4 text-gray-400" />
                            {item.warehouse_name}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1">
                            <Building2 className="w-4 h-4 text-gray-400" />
                            {item.branch_name}
                          </div>
                        </td>
                        <td className={`p-3 text-right font-medium ${item.is_low_stock ? 'text-orange-600' : ''}`}>
                          {formatNumber(item.quantity)}
                        </td>
                        <td className="p-3 text-right">{formatNumber(item.cost_price)}</td>
                        <td className="p-3 text-right font-semibold">{formatNumber(item.total_value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
