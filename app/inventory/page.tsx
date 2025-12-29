"use client"

import { useState, useEffect, useCallback } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import { toastActionError } from "@/lib/notifications"
import { getActiveCompanyId } from "@/lib/company"
import { ArrowUp, ArrowDown, RefreshCcw, AlertCircle, Package, TrendingUp, TrendingDown, Calendar, Filter, BarChart3, Box, ShoppingCart, Truck, CheckCircle2, FileText, Warehouse, Building2 } from "lucide-react"
import { TableSkeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { type UserContext } from "@/lib/validation"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface InventoryTransaction {
  id: string
  product_id: string
  transaction_type: string
  quantity_change: number
  notes: string
  created_at: string
  reference_id?: string
  warehouse_id?: string
  products?: { name: string; sku: string }
  journal_entries?: { id: string; reference_type: string; entry_date?: string; description?: string }
}

interface Product {
  id: string
  sku: string
  name: string
  quantity_on_hand: number
}

interface WarehouseData {
  id: string
  name: string
  code?: string
  branch_id?: string
  is_main?: boolean
  branches?: { name?: string; branch_name?: string }
}

interface BranchData {
  id: string
  name?: string
  branch_name?: string
  code?: string
}

export default function InventoryPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
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
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [computedQty, setComputedQty] = useState<Record<string, number>>({})
  const [purchaseTotals, setPurchaseTotals] = useState<Record<string, number>>({})
  const [soldTotals, setSoldTotals] = useState<Record<string, number>>({})
  const [writeOffTotals, setWriteOffTotals] = useState<Record<string, number>>({})
  const [saleReturnTotals, setSaleReturnTotals] = useState<Record<string, number>>({})
  const [purchaseReturnTotals, setPurchaseReturnTotals] = useState<Record<string, number>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [movementFilter, setMovementFilter] = useState<'all' | 'purchase' | 'sale'>('all')
  const [movementProductId, setMovementProductId] = useState<string>('')
  const [fromDate, setFromDate] = useState<string>('')
  const [toDate, setToDate] = useState<string>('')

  // 🔐 ERP Access Control - سياق المستخدم
  const [userContext, setUserContext] = useState<UserContext | null>(null)

  // 🏭 المخازن والفروع
  const [warehouses, setWarehouses] = useState<WarehouseData[]>([])
  const [branches, setBranches] = useState<BranchData[]>([])
  const [allowedBranchIds, setAllowedBranchIds] = useState<string[]>([])
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('all')
  const [canOverride, setCanOverride] = useState(false)

  // فلترة المخازن حسب الفروع المصرح بها
  const filteredWarehouses = warehouses.filter(w => {
    if (canOverride) return true // المدراء يرون كل المخازن
    if (!w.branch_id) return true // المخازن بدون فرع متاحة للجميع
    return allowedBranchIds.includes(w.branch_id)
  })

  useEffect(() => {
    loadData()
  }, [])

  // إعادة تحميل البيانات عند تغيير المخزن
  useEffect(() => {
    if (userContext) {
      loadInventoryData(userContext)
    }
  }, [selectedWarehouseId])

  const loadData = async () => {
    try {
      setIsLoading(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) {
        toastActionError(toast, "الوصول", "المخزون", "لا توجد شركة فعّالة. يرجى إنشاء/اختيار شركة من الإعدادات.")
        return
      }

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

      const isCanOverride = ["owner", "admin", "manager"].includes(role)
      setCanOverride(isCanOverride)

      // 🏭 تحميل المخازن والفروع
      const [warehousesRes, branchesRes, branchAccessRes] = await Promise.all([
        supabase.from("warehouses")
          .select("id, name, code, branch_id, is_main, branches(name, branch_name)")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .order("is_main", { ascending: false })
          .order("name"),
        supabase.from("branches")
          .select("id, name, branch_name, code")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .order("name"),
        // جلب الفروع المصرح بها للمستخدم
        supabase.from("user_branch_access")
          .select("branch_id")
          .eq("company_id", companyId)
          .eq("user_id", user.id)
          .eq("is_active", true)
      ])

      setWarehouses(warehousesRes.data || [])
      setBranches(branchesRes.data || [])

      // تحديد الفروع المصرح بها
      const accessedBranchIds = (branchAccessRes.data || []).map(a => a.branch_id)
      // إذا كان للمستخدم فرع محدد في company_members، أضفه
      if (member?.branch_id && !accessedBranchIds.includes(member.branch_id)) {
        accessedBranchIds.push(member.branch_id)
      }
      setAllowedBranchIds(accessedBranchIds)

      // تعيين المخزن الافتراضي
      if (member?.warehouse_id && !isCanOverride) {
        setSelectedWarehouseId(member.warehouse_id)
      }

      // Load products
      const { data: productsData } = await supabase
        .from("products")
        .select("id, sku, name, quantity_on_hand")
        .eq("company_id", companyId)
      setProducts(productsData || [])

      // تحميل بيانات المخزون
      await loadInventoryData(context)
    } catch (error) {
      console.error("Error loading data:", error)
    } finally {
      setIsLoading(false)
    }
  }

  // دالة تحميل بيانات المخزون حسب المخزن المختار
  const loadInventoryData = async (context: UserContext) => {
    try {
      const companyId = context.company_id
      const isCanOverride = ["owner", "admin", "manager"].includes(context.role)

      // Load recent transactions with filtering by warehouse
      let transactionsQuery = supabase
        .from("inventory_transactions")
        .select("*, products(name, sku), journal_entries(id, reference_type, entry_date, description)")
        .eq("company_id", companyId)
        .neq("is_deleted", true)

      // تصفية حسب المخزن المختار
      if (selectedWarehouseId !== 'all') {
        transactionsQuery = transactionsQuery.eq("warehouse_id", selectedWarehouseId)
      } else if (!isCanOverride && context.warehouse_id) {
        transactionsQuery = transactionsQuery.eq("warehouse_id", context.warehouse_id)
      }

      const { data: transactionsData } = await transactionsQuery
        .order("created_at", { ascending: false })
        .limit(200)

      const txs = (transactionsData || [])
      const saleIds = Array.from(new Set(txs.filter((t: any) => String(t.transaction_type || '').startsWith('sale') && t.reference_id).map((t: any) => String(t.reference_id))))
      const purchaseIds = Array.from(new Set(txs.filter((t: any) => String(t.transaction_type || '').startsWith('purchase') && t.reference_id).map((t: any) => String(t.reference_id))))
      const { data: invsById } = saleIds.length > 0 ? await supabase.from('invoices').select('id,status').in('id', saleIds) : { data: [] as any[] }
      const { data: billsById } = purchaseIds.length > 0 ? await supabase.from('bills').select('id,status').in('id', purchaseIds) : { data: [] as any[] }
      const validInvIds = new Set((invsById || []).map((i: any) => String(i.id)))
      const validBillIds = new Set((billsById || []).map((i: any) => String(i.id)))
      const filteredTxs = txs.filter((t: any) => {
        const type = String(t.transaction_type || '')
        const hasJournal = Boolean((t as any)?.journal_entries?.id)
        const rid = String(t.reference_id || '')
        // فقط فلترة البيع والشراء الأساسيين (ليس المرتجعات أو التعديلات)
        if (type === 'sale') {
          return hasJournal || (rid && validInvIds.has(rid))
        }
        if (type === 'purchase') {
          return hasJournal || (rid && validBillIds.has(rid))
        }
        // باقي الأنواع (return, adjustment, sale_return, purchase_return, write_off) تمر مباشرة
        return true
      })

      const sorted = filteredTxs.slice().sort((a: any, b: any) => {
        const ad = String(a?.journal_entries?.entry_date || a?.created_at || '')
        const bd = String(b?.journal_entries?.entry_date || b?.created_at || '')
        return bd.localeCompare(ad)
      })
      setTransactions(sorted)

      // حساب الكميات من inventory_transactions
      let allTransactionsQuery = supabase
        .from("inventory_transactions")
        .select("product_id, quantity_change, transaction_type, warehouse_id")
        .eq("company_id", companyId)
        .neq("is_deleted", true)

      // تصفية حسب المخزن المختار
      if (selectedWarehouseId !== 'all') {
        allTransactionsQuery = allTransactionsQuery.eq("warehouse_id", selectedWarehouseId)
      } else if (!isCanOverride && context.warehouse_id) {
        allTransactionsQuery = allTransactionsQuery.eq("warehouse_id", context.warehouse_id)
      }

      const { data: allTransactions } = await allTransactionsQuery

      const agg: Record<string, number> = {}
      const purchasesAgg: Record<string, number> = {}
      const soldAgg: Record<string, number> = {}
      const writeOffsAgg: Record<string, number> = {}
      const saleReturnsAgg: Record<string, number> = {}
      const purchaseReturnsAgg: Record<string, number> = {}

        ; (allTransactions || []).forEach((t: any) => {
          const pid = String(t.product_id || '')
          const q = Number(t.quantity_change || 0)
          const type = String(t.transaction_type || '')

          agg[pid] = (agg[pid] || 0) + q

          if (type === 'purchase') {
            purchasesAgg[pid] = (purchasesAgg[pid] || 0) + Math.abs(q)
          } else if (type === 'sale') {
            soldAgg[pid] = (soldAgg[pid] || 0) + Math.abs(q)
          } else if (type === 'write_off' || type === 'adjustment') {
            writeOffsAgg[pid] = (writeOffsAgg[pid] || 0) + Math.abs(q)
          } else if (type === 'sale_return' || type === 'return') {
            saleReturnsAgg[pid] = (saleReturnsAgg[pid] || 0) + Math.abs(q)
          } else if (type === 'purchase_return' || type === 'purchase_reversal') {
            purchaseReturnsAgg[pid] = (purchaseReturnsAgg[pid] || 0) + Math.abs(q)
          }
        })

      setComputedQty(agg)
      setPurchaseTotals(purchasesAgg)
      setSoldTotals(soldAgg)
      setWriteOffTotals(writeOffsAgg)
      setSaleReturnTotals(saleReturnsAgg)
      setPurchaseReturnTotals(purchaseReturnsAgg)
    } catch (error) {
      console.error("Error loading inventory data:", error)
    }
  }

  // حساب إجمالي المشتريات والمبيعات
  const totalPurchased = Object.values(purchaseTotals).reduce((a, b) => a + b, 0)
  const totalSold = Object.values(soldTotals).reduce((a, b) => a + b, 0)
  const lowStockCount = products.filter(p => (computedQty[p.id] ?? p.quantity_on_hand ?? 0) < 5).length

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />

      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
          {/* رأس الصفحة - تحسين للهاتف */}
          <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
            <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="p-2 sm:p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg sm:rounded-xl shadow-lg shadow-blue-500/20 flex-shrink-0">
                  <Package className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-2xl md:text-3xl font-bold text-gray-900 dark:text-white truncate">
                    {appLang === 'en' ? 'Inventory' : 'المخزون'}
                  </h1>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">
                    {appLang === 'en' ? 'Track inventory movements' : 'تتبع حركات المخزون'}
                  </p>
                </div>
              </div>

              {/* 🏭 فلتر المخازن */}
              {filteredWarehouses.length > 0 && (
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                    <Warehouse className="w-4 h-4" />
                    <span className="hidden sm:inline">{appLang === 'en' ? 'Warehouse:' : 'المخزن:'}</span>
                  </div>
                  <Select
                    value={selectedWarehouseId}
                    onValueChange={(value) => setSelectedWarehouseId(value)}
                  >
                    <SelectTrigger className="w-[180px] sm:w-[220px] bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700">
                      <SelectValue placeholder={appLang === 'en' ? 'Select warehouse' : 'اختر المخزن'} />
                    </SelectTrigger>
                    <SelectContent>
                      {canOverride && (
                        <SelectItem value="all">
                          <div className="flex items-center gap-2">
                            <Package className="w-4 h-4 text-blue-500" />
                            <span>{appLang === 'en' ? 'All Warehouses' : 'كل المخازن'}</span>
                          </div>
                        </SelectItem>
                      )}
                      {filteredWarehouses.map((warehouse) => (
                        <SelectItem key={warehouse.id} value={warehouse.id}>
                          <div className="flex items-center gap-2">
                            {warehouse.is_main ? (
                              <Building2 className="w-4 h-4 text-amber-500" />
                            ) : (
                              <Warehouse className="w-4 h-4 text-gray-400" />
                            )}
                            <span>{warehouse.name}</span>
                            {warehouse.branches?.name && (
                              <span className="text-xs text-gray-400">
                                ({warehouse.branches.name})
                              </span>
                            )}
                            {warehouse.branches?.branch_name && !warehouse.branches?.name && (
                              <span className="text-xs text-gray-400">
                                ({warehouse.branches.branch_name})
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>

          {/* بطاقات الإحصائيات */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      {appLang === 'en' ? 'Total Products' : 'إجمالي المنتجات'}
                    </p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{products.length}</p>
                  </div>
                  <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                    <Package className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      {appLang === 'en' ? 'Stock on Hand' : 'المخزون المتاح'}
                    </p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                      {products.reduce((sum, p) => sum + (computedQty[p.id] ?? p.quantity_on_hand ?? 0), 0)}
                    </p>
                  </div>
                  <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-xl">
                    <BarChart3 className="w-6 h-6 text-green-600 dark:text-green-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      {appLang === 'en' ? 'Total Purchased' : 'إجمالي المشتريات'}
                    </p>
                    <p className="text-3xl font-bold text-emerald-600 mt-2">+{totalPurchased}</p>
                  </div>
                  <div className="p-3 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl">
                    <Truck className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      {appLang === 'en' ? 'Total Sold' : 'إجمالي المبيعات'}
                    </p>
                    <p className="text-3xl font-bold text-orange-600 mt-2">-{totalSold}</p>
                  </div>
                  <div className="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-xl">
                    <ShoppingCart className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* جدول حالة المخزون */}
          <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
            <CardHeader className="border-b border-gray-100 dark:border-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                    <BarChart3 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <CardTitle className="text-lg">{appLang === 'en' ? 'Inventory Status' : 'حالة المخزون'}</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  {lowStockCount > 0 && (
                    <Badge variant="destructive" className="gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {lowStockCount} {appLang === 'en' ? 'Low Stock' : 'مخزون منخفض'}
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <TableSkeleton
                  cols={7}
                  rows={8}
                  className="mt-4"
                />
              ) : products.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
                  <Package className="w-12 h-12 mb-3 text-gray-300 dark:text-gray-600" />
                  <p>{appLang === 'en' ? 'No products yet' : 'لا توجد منتجات حتى الآن'}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[800px] w-full text-sm">
                    <thead>
                      <tr className="bg-gradient-to-r from-slate-50 to-gray-100 dark:from-slate-800 dark:to-slate-800/80">
                        <th className="px-4 py-4 text-right font-semibold text-gray-700 dark:text-gray-200 border-b-2 border-gray-200 dark:border-slate-700">
                          <div className="flex items-center gap-2 justify-end">
                            <Box className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                            <span>{appLang === 'en' ? 'Code' : 'الرمز'}</span>
                          </div>
                        </th>
                        <th className="px-4 py-4 text-right font-semibold text-gray-700 dark:text-gray-200 border-b-2 border-gray-200 dark:border-slate-700">
                          <div className="flex items-center gap-2 justify-end">
                            <Package className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                            <span>{appLang === 'en' ? 'Product Name' : 'اسم المنتج'}</span>
                          </div>
                        </th>
                        <th className="px-4 py-4 text-center font-semibold text-gray-700 dark:text-gray-200 border-b-2 border-gray-200 dark:border-slate-700">
                          <div className="flex items-center gap-2 justify-center">
                            <Truck className="w-4 h-4 text-emerald-600" />
                            <span>{appLang === 'en' ? 'Total Purchased' : 'إجمالي المشتريات'}</span>
                          </div>
                        </th>
                        <th className="px-4 py-4 text-center font-semibold text-gray-700 dark:text-gray-200 border-b-2 border-gray-200 dark:border-slate-700">
                          <div className="flex items-center gap-2 justify-center">
                            <ShoppingCart className="w-4 h-4 text-orange-600" />
                            <span>{appLang === 'en' ? 'Total Sold' : 'إجمالي المبيعات'}</span>
                          </div>
                        </th>
                        <th className="px-4 py-4 text-center font-semibold text-gray-700 dark:text-gray-200 border-b-2 border-gray-200 dark:border-slate-700">
                          <div className="flex items-center gap-2 justify-center">
                            <RefreshCcw className="w-4 h-4 text-purple-600" />
                            <span>{appLang === 'en' ? 'Sales Returns' : 'مرتجعات المبيعات'}</span>
                          </div>
                        </th>
                        <th className="px-4 py-4 text-center font-semibold text-gray-700 dark:text-gray-200 border-b-2 border-gray-200 dark:border-slate-700">
                          <div className="flex items-center gap-2 justify-center">
                            <RefreshCcw className="w-4 h-4 text-cyan-600" />
                            <span>{appLang === 'en' ? 'Purchase Returns' : 'مرتجعات المشتريات'}</span>
                          </div>
                        </th>
                        <th className="px-4 py-4 text-center font-semibold text-gray-700 dark:text-gray-200 border-b-2 border-gray-200 dark:border-slate-700">
                          <div className="flex items-center gap-2 justify-center">
                            <AlertCircle className="w-4 h-4 text-red-600" />
                            <span>{appLang === 'en' ? 'Write-offs' : 'الهالك'}</span>
                          </div>
                        </th>
                        <th className="px-4 py-4 text-center font-semibold text-gray-700 dark:text-gray-200 border-b-2 border-gray-200 dark:border-slate-700">
                          <div className="flex items-center gap-2 justify-center">
                            <BarChart3 className="w-4 h-4 text-blue-600" />
                            <span>{appLang === 'en' ? 'Available Stock' : 'المخزون المتاح'}</span>
                          </div>
                        </th>
                        <th className="px-4 py-4 text-center font-semibold text-gray-700 dark:text-gray-200 border-b-2 border-gray-200 dark:border-slate-700">
                          <div className="flex items-center gap-2 justify-center">
                            <span>{appLang === 'en' ? 'Status' : 'الحالة'}</span>
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                      {products.map((product, index) => {
                        const purchased = purchaseTotals[product.id] ?? 0
                        const sold = soldTotals[product.id] ?? 0
                        const saleReturn = saleReturnTotals[product.id] ?? 0
                        const purchaseReturn = purchaseReturnTotals[product.id] ?? 0
                        const writeOff = writeOffTotals[product.id] ?? 0
                        // استخدام الكمية المحسوبة بدلاً من quantity_on_hand مباشرة
                        const shown = computedQty[product.id] ?? product.quantity_on_hand ?? 0
                        const isLowStock = shown > 0 && shown < 5
                        const isOutOfStock = shown <= 0
                        const stockPercentage = purchased > 0 ? Math.round((shown / purchased) * 100) : 0

                        return (
                          <tr
                            key={product.id}
                            className={`hover:bg-blue-50/50 dark:hover:bg-slate-800/70 transition-all duration-200 ${index % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-gray-50/50 dark:bg-slate-900/50'
                              }`}
                          >
                            {/* الرمز */}
                            <td className="px-4 py-4">
                              <Badge variant="outline" className="font-mono text-xs bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600">
                                {product.sku || '-'}
                              </Badge>
                            </td>

                            {/* اسم المنتج */}
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 flex items-center justify-center flex-shrink-0">
                                  <Package className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                </div>
                                <div>
                                  <p className="font-semibold text-gray-900 dark:text-white">{product.name}</p>
                                  <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {appLang === 'en' ? 'Stock Rate' : 'نسبة المخزون'}: {stockPercentage}%
                                  </p>
                                </div>
                              </div>
                            </td>

                            {/* إجمالي المشتريات */}
                            <td className="px-4 py-4 text-center">
                              <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                                <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                <span className="font-bold text-emerald-700 dark:text-emerald-300 text-base">
                                  {purchased.toLocaleString()}
                                </span>
                              </div>
                            </td>

                            {/* إجمالي المبيعات */}
                            <td className="px-4 py-4 text-center">
                              <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
                                <TrendingDown className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                                <span className="font-bold text-orange-700 dark:text-orange-300 text-base">
                                  {sold.toLocaleString()}
                                </span>
                              </div>
                            </td>

                            {/* مرتجعات المبيعات */}
                            <td className="px-4 py-4 text-center">
                              <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg ${saleReturn > 0
                                ? 'bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800'
                                : 'bg-gray-50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-800'
                                }`}>
                                <RefreshCcw className={`w-4 h-4 ${saleReturn > 0 ? 'text-purple-600 dark:text-purple-400' : 'text-gray-400 dark:text-gray-500'}`} />
                                <span className={`font-bold text-base ${saleReturn > 0 ? 'text-purple-700 dark:text-purple-300' : 'text-gray-500 dark:text-gray-400'}`}>
                                  {saleReturn.toLocaleString()}
                                </span>
                              </div>
                            </td>

                            {/* مرتجعات المشتريات */}
                            <td className="px-4 py-4 text-center">
                              <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg ${purchaseReturn > 0
                                ? 'bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-800'
                                : 'bg-gray-50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-800'
                                }`}>
                                <RefreshCcw className={`w-4 h-4 ${purchaseReturn > 0 ? 'text-cyan-600 dark:text-cyan-400' : 'text-gray-400 dark:text-gray-500'}`} />
                                <span className={`font-bold text-base ${purchaseReturn > 0 ? 'text-cyan-700 dark:text-cyan-300' : 'text-gray-500 dark:text-gray-400'}`}>
                                  {purchaseReturn.toLocaleString()}
                                </span>
                              </div>
                            </td>

                            {/* الهالك */}
                            <td className="px-4 py-4 text-center">
                              <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg ${writeOff > 0
                                ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                                : 'bg-gray-50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-800'
                                }`}>
                                <AlertCircle className={`w-4 h-4 ${writeOff > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'}`} />
                                <span className={`font-bold text-base ${writeOff > 0 ? 'text-red-700 dark:text-red-300' : 'text-gray-500 dark:text-gray-400'}`}>
                                  {writeOff.toLocaleString()}
                                </span>
                              </div>
                            </td>

                            {/* المخزون المتاح */}
                            <td className="px-4 py-4 text-center">
                              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-lg ${isOutOfStock
                                ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-700'
                                : isLowStock
                                  ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700'
                                  : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700'
                                }`}>
                                {shown.toLocaleString()}
                              </div>
                            </td>

                            {/* الحالة */}
                            <td className="px-4 py-4 text-center">
                              {isOutOfStock ? (
                                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                                  <AlertCircle className="w-4 h-4" />
                                  <span className="text-sm font-medium">{appLang === 'en' ? 'Out of Stock' : 'نفذ المخزون'}</span>
                                </div>
                              ) : isLowStock ? (
                                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                                  <AlertCircle className="w-4 h-4" />
                                  <span className="text-sm font-medium">{appLang === 'en' ? 'Low Stock' : 'مخزون منخفض'}</span>
                                </div>
                              ) : (
                                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                                  <CheckCircle2 className="w-4 h-4" />
                                  <span className="text-sm font-medium">{appLang === 'en' ? 'In Stock' : 'متوفر'}</span>
                                </div>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    {/* Footer Summary */}
                    <tfoot>
                      <tr className="bg-gradient-to-r from-slate-100 to-gray-100 dark:from-slate-800 dark:to-slate-700 border-t-2 border-gray-300 dark:border-slate-600">
                        <td colSpan={2} className="px-4 py-4 text-right">
                          <span className="font-bold text-gray-700 dark:text-gray-200 text-base">
                            {appLang === 'en' ? 'Total' : 'الإجمالي'} ({products.length} {appLang === 'en' ? 'products' : 'منتج'})
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-200 dark:bg-emerald-800 border border-emerald-400 dark:border-emerald-600">
                            <TrendingUp className="w-5 h-5 text-emerald-700 dark:text-emerald-300" />
                            <span className="font-bold text-emerald-800 dark:text-emerald-200 text-lg">
                              {totalPurchased.toLocaleString()}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-200 dark:bg-orange-800 border border-orange-400 dark:border-orange-600">
                            <TrendingDown className="w-5 h-5 text-orange-700 dark:text-orange-300" />
                            <span className="font-bold text-orange-800 dark:text-orange-200 text-lg">
                              {totalSold.toLocaleString()}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl ${Object.values(saleReturnTotals).reduce((a, b) => a + b, 0) > 0
                            ? 'bg-purple-200 dark:bg-purple-800 border border-purple-400 dark:border-purple-600'
                            : 'bg-gray-200 dark:bg-gray-800 border border-gray-400 dark:border-gray-600'
                            }`}>
                            <RefreshCcw className={`w-5 h-5 ${Object.values(saleReturnTotals).reduce((a, b) => a + b, 0) > 0 ? 'text-purple-700 dark:text-purple-300' : 'text-gray-500 dark:text-gray-400'}`} />
                            <span className={`font-bold text-lg ${Object.values(saleReturnTotals).reduce((a, b) => a + b, 0) > 0 ? 'text-purple-800 dark:text-purple-200' : 'text-gray-600 dark:text-gray-300'}`}>
                              {Object.values(saleReturnTotals).reduce((a, b) => a + b, 0).toLocaleString()}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl ${Object.values(purchaseReturnTotals).reduce((a, b) => a + b, 0) > 0
                            ? 'bg-cyan-200 dark:bg-cyan-800 border border-cyan-400 dark:border-cyan-600'
                            : 'bg-gray-200 dark:bg-gray-800 border border-gray-400 dark:border-gray-600'
                            }`}>
                            <RefreshCcw className={`w-5 h-5 ${Object.values(purchaseReturnTotals).reduce((a, b) => a + b, 0) > 0 ? 'text-cyan-700 dark:text-cyan-300' : 'text-gray-500 dark:text-gray-400'}`} />
                            <span className={`font-bold text-lg ${Object.values(purchaseReturnTotals).reduce((a, b) => a + b, 0) > 0 ? 'text-cyan-800 dark:text-cyan-200' : 'text-gray-600 dark:text-gray-300'}`}>
                              {Object.values(purchaseReturnTotals).reduce((a, b) => a + b, 0).toLocaleString()}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl ${Object.values(writeOffTotals).reduce((a, b) => a + b, 0) > 0
                            ? 'bg-red-200 dark:bg-red-800 border border-red-400 dark:border-red-600'
                            : 'bg-gray-200 dark:bg-gray-800 border border-gray-400 dark:border-gray-600'
                            }`}>
                            <AlertCircle className={`w-5 h-5 ${Object.values(writeOffTotals).reduce((a, b) => a + b, 0) > 0 ? 'text-red-700 dark:text-red-300' : 'text-gray-500 dark:text-gray-400'}`} />
                            <span className={`font-bold text-lg ${Object.values(writeOffTotals).reduce((a, b) => a + b, 0) > 0 ? 'text-red-800 dark:text-red-200' : 'text-gray-600 dark:text-gray-300'}`}>
                              {Object.values(writeOffTotals).reduce((a, b) => a + b, 0).toLocaleString()}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-200 dark:bg-blue-800 border border-blue-400 dark:border-blue-600">
                            <BarChart3 className="w-5 h-5 text-blue-700 dark:text-blue-300" />
                            <span className="font-bold text-blue-800 dark:text-blue-200 text-lg">
                              {products.reduce((sum, p) => sum + (computedQty[p.id] ?? p.quantity_on_hand ?? 0), 0).toLocaleString()}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <div className="flex items-center justify-center gap-3">
                            {lowStockCount > 0 && (
                              <Badge variant="destructive" className="gap-1 px-2 py-1">
                                <AlertCircle className="w-3 h-3" />
                                {lowStockCount}
                              </Badge>
                            )}
                            <Badge className="gap-1 px-2 py-1 bg-green-600">
                              <CheckCircle2 className="w-3 h-3" />
                              {products.length - lowStockCount - products.filter(p => (computedQty[p.id] ?? p.quantity_on_hand ?? 0) <= 0).length}
                            </Badge>
                          </div>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* قسم حركات المخزون */}
          <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
            <CardHeader className="border-b border-gray-100 dark:border-slate-800">
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                    <FileText className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <CardTitle className="text-lg">{appLang === 'en' ? 'Inventory Movements' : 'حركات المخزون'}</CardTitle>
                </div>

                {/* شريط الفلاتر */}
                <div className="flex flex-wrap items-center gap-3 p-4 bg-gray-50 dark:bg-slate-800/50 rounded-xl">
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                    <span className="text-sm text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Filters:' : 'الفلاتر:'}</span>
                  </div>

                  {/* فلتر النوع */}
                  <select
                    value={movementFilter}
                    onChange={(e) => setMovementFilter(e.target.value === 'purchase' ? 'purchase' : (e.target.value === 'sale' ? 'sale' : 'all'))}
                    className="px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="all">{appLang === 'en' ? 'All Types' : 'كل الأنواع'}</option>
                    <option value="purchase">{appLang === 'en' ? 'Purchases' : 'المشتريات'}</option>
                    <option value="sale">{appLang === 'en' ? 'Sales' : 'المبيعات'}</option>
                  </select>

                  {/* فلتر المنتج */}
                  <select
                    value={movementProductId}
                    onChange={(e) => setMovementProductId(e.target.value)}
                    className="px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 max-w-[200px]"
                  >
                    <option value="">{appLang === 'en' ? 'All Products' : 'كل المنتجات'}</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>

                  {/* فلتر التاريخ */}
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                    <Input
                      type="date"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                      className="text-sm w-36 bg-white dark:bg-slate-900"
                    />
                    <span className="text-gray-400 dark:text-gray-500">-</span>
                    <Input
                      type="date"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                      className="text-sm w-36 bg-white dark:bg-slate-900"
                    />
                  </div>

                  {/* إجمالي الكمية */}
                  <Badge variant="secondary" className="gap-1 px-3 py-1.5">
                    <BarChart3 className="w-3 h-3" />
                    {appLang === 'en' ? 'Total:' : 'الإجمالي:'} {(() => {
                      const sum = transactions.reduce((acc, t) => {
                        const typeOk = movementFilter === 'all' ? true : movementFilter === 'purchase' ? String(t.transaction_type || '').startsWith('purchase') : String(t.transaction_type || '').startsWith('sale')
                        if (!typeOk) return acc
                        if (movementProductId && String(t.product_id || '') !== movementProductId) return acc
                        const dStr = String((t as any)?.journal_entries?.entry_date || t.created_at || '').slice(0, 10)
                        if (fromDate && dStr < fromDate) return acc
                        if (toDate && dStr > toDate) return acc
                        return acc + Number(t.quantity_change || 0)
                      }, 0)
                      return sum
                    })()}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <TableSkeleton
                  cols={6}
                  rows={8}
                  className="mt-4"
                />
              ) : (() => {
                const filtered = transactions.filter((t) => {
                  const typeOk = movementFilter === 'all' ? true : movementFilter === 'purchase' ? String(t.transaction_type || '').startsWith('purchase') : String(t.transaction_type || '').startsWith('sale')
                  if (!typeOk) return false
                  if (!movementProductId) return true
                  const pidOk = String(t.product_id || '') === movementProductId
                  if (!pidOk) return false
                  const dStr = String((t as any)?.journal_entries?.entry_date || t.created_at || '').slice(0, 10)
                  if (fromDate && dStr < fromDate) return false
                  if (toDate && dStr > toDate) return false
                  return true
                })
                if (filtered.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
                      <FileText className="w-12 h-12 mb-3 text-gray-300 dark:text-gray-600" />
                      <p>{appLang === 'en' ? 'No movements found' : 'لا توجد حركات'}</p>
                    </div>
                  )
                }
                return (
                  <div className="divide-y divide-gray-100 dark:divide-slate-800">
                    {filtered.slice(0, 20).map((transaction) => {
                      const isPositive = transaction.quantity_change > 0
                      const transType = String(transaction.transaction_type || '')
                      return (
                        <div
                          key={transaction.id}
                          className="flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors"
                        >
                          <div className="flex items-center gap-4">
                            <div className={`p-2.5 rounded-xl ${isPositive ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                              {isPositive ? (
                                <ArrowUp className="w-5 h-5 text-green-600 dark:text-green-400" />
                              ) : (
                                <ArrowDown className="w-5 h-5 text-red-600 dark:text-red-400" />
                              )}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900 dark:text-white">{transaction.products?.name}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" className="text-xs font-mono">{transaction.products?.sku}</Badge>
                                <Badge
                                  variant="secondary"
                                  className={`text-xs ${transType.startsWith('purchase') ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                                    transType.startsWith('sale') ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                                      'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                                    }`}
                                >
                                  {transType === 'sale' ? (appLang === 'en' ? 'Sale' : 'بيع') :
                                    transType === 'sale_reversal' ? (appLang === 'en' ? 'Sale Return' : 'مرتجع بيع') :
                                      transType === 'purchase' ? (appLang === 'en' ? 'Purchase' : 'شراء') :
                                        transType === 'purchase_reversal' ? (appLang === 'en' ? 'Purchase Return' : 'مرتجع شراء') :
                                          transType === 'adjustment' ? (appLang === 'en' ? 'Adjustment' : 'تعديل') : transType}
                                </Badge>
                              </div>
                              {transaction.reference_id && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                  {transType.startsWith('purchase') ? (
                                    <Link href={`/bills/${transaction.reference_id}`} className="text-blue-600 hover:underline flex items-center gap-1">
                                      <FileText className="w-3 h-3" />
                                      {appLang === 'en' ? 'View Bill' : 'عرض الفاتورة'}
                                    </Link>
                                  ) : transType.startsWith('sale') ? (
                                    <Link href={`/invoices/${transaction.reference_id}`} className="text-blue-600 hover:underline flex items-center gap-1">
                                      <FileText className="w-3 h-3" />
                                      {appLang === 'en' ? 'View Invoice' : 'عرض الفاتورة'}
                                    </Link>
                                  ) : null}
                                </p>
                              )}
                              {transaction.notes && (
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 max-w-md truncate">{transaction.notes}</p>
                              )}
                            </div>
                          </div>
                          <div className="text-left">
                            <p className={`text-lg font-bold ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                              {isPositive ? '+' : ''}{transaction.quantity_change}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {new Date(transaction.created_at).toLocaleDateString(appLang === 'en' ? 'en' : 'ar', { year: 'numeric', month: 'short', day: 'numeric' })}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
