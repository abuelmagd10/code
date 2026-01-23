"use client"

import { useState, useEffect, useCallback, useTransition } from "react"
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
import { type UserContext, getRoleAccessLevel } from "@/lib/validation"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useUserContext } from "@/hooks/use-user-context"
import { buildDataVisibilityFilter, applyDataVisibilityFilter } from "@/lib/data-visibility-control"
import { useRealtimeTable } from "@/hooks/use-realtime-table"

interface InventoryTransaction {
  id: string
  company_id?: string
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
  const [hydrated, setHydrated] = useState(false)
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [computedQty, setComputedQty] = useState<Record<string, number>>({})
  const [purchaseTotals, setPurchaseTotals] = useState<Record<string, number>>({})
  const [soldTotals, setSoldTotals] = useState<Record<string, number>>({})
  const [writeOffTotals, setWriteOffTotals] = useState<Record<string, number>>({})
  const [saleReturnTotals, setSaleReturnTotals] = useState<Record<string, number>>({})
  const [purchaseReturnTotals, setPurchaseReturnTotals] = useState<Record<string, number>>({})
  const [productsWithMovements, setProductsWithMovements] = useState<Set<string>>(new Set()) // 🆕 المنتجات التي لها حركات في المخزن
  
  // ✅ بيانات النقل (Incoming/Outgoing Transfers)
  // incomingTransfers: { productId: [{ quantity: number, warehouseName: string, warehouseId: string }] }
  const [incomingTransfers, setIncomingTransfers] = useState<Record<string, Array<{ quantity: number; warehouseName: string; warehouseId: string }>>>({})
  // outgoingTransfers: { productId: [{ quantity: number, warehouseName: string, warehouseId: string }] }
  const [outgoingTransfers, setOutgoingTransfers] = useState<Record<string, Array<{ quantity: number; warehouseName: string; warehouseId: string }>>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingInventory, setIsLoadingInventory] = useState(false) // 🆕 تحميل عند تغيير المخزن
  const [movementFilter, setMovementFilter] = useState<'all' | 'purchase' | 'sale'>('all')
  const [movementProductId, setMovementProductId] = useState<string>('')
  const [fromDate, setFromDate] = useState<string>('')
  const [toDate, setToDate] = useState<string>('')

  // 🚀 تحسين الأداء - استخدام useTransition للفلاتر
  const [isPending, startTransition] = useTransition()

  const { userContext, loading: userContextLoading, error: userContextError } = useUserContext()
  const [isAdmin, setIsAdmin] = useState(false)
  const [selectedBranchId, setSelectedBranchId] = useState<string>("")
  const [selectedCostCenterId, setSelectedCostCenterId] = useState<string>("")
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("")
  const [visibilityRules, setVisibilityRules] = useState<any>(null)

  const [warehouses, setWarehouses] = useState<WarehouseData[]>([])
  const [branches, setBranches] = useState<BranchData[]>([])

  useEffect(() => {
    setHydrated(true)
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

  const filteredWarehouses = warehouses

  // 🆕 فلترة المنتجات حسب المخزن المحدد
  // إذا تم اختيار مخزن معين، نعرض فقط المنتجات التي لها حركات في هذا المخزن
  const displayedProducts = selectedWarehouseId
    ? products.filter(p => productsWithMovements.has(p.id))
    : products

  useEffect(() => {
    if (userContextLoading) return
    if (userContextError) {
      toastActionError(toast, "الحوكمة", "المخزون", userContextError)
      return
    }
    if (!userContext) return
    loadData(userContext)
  }, [userContextLoading, userContextError, userContext])

  useEffect(() => {
    if (!userContext) return
    if (!selectedBranchId || !selectedWarehouseId || !selectedCostCenterId) return
    loadInventoryData(userContext, selectedBranchId, selectedWarehouseId, selectedCostCenterId)
  }, [userContext, selectedBranchId, selectedWarehouseId, selectedCostCenterId])

  // ✅ Realtime: الاشتراك في تحديثات حركات المخزون
  useRealtimeTable<InventoryTransaction>({
    table: 'inventory_transactions',
    enabled: !!userContext?.company_id && !!selectedWarehouseId,
    onInsert: (newTransaction) => {
      // ✅ فحص التكرار قبل الإضافة
      setTransactions(prev => {
        if (prev.find(t => t.id === newTransaction.id)) {
          return prev; // السجل موجود بالفعل
        }
        // ✅ إضافة فقط إذا كان في نفس المخزن المحدد
        if (selectedWarehouseId && newTransaction.warehouse_id === selectedWarehouseId) {
          return [newTransaction, ...prev];
        }
        return prev;
      });
      
      // ✅ تحديث الأرصدة إذا كان المنتج في نفس المخزن
      if (selectedWarehouseId && newTransaction.warehouse_id === selectedWarehouseId && newTransaction.product_id) {
        // إعادة تحميل البيانات لتحديث الأرصدة
        if (userContext) {
          loadInventoryData(userContext, selectedBranchId, selectedWarehouseId, selectedCostCenterId);
        }
      }
    },
    onUpdate: (newTransaction) => {
      // ✅ تحديث السجل في القائمة
      setTransactions(prev => prev.map(transaction => 
        transaction.id === newTransaction.id ? newTransaction : transaction
      ));
      
      // ✅ تحديث الأرصدة إذا لزم الأمر
      if (selectedWarehouseId && newTransaction.warehouse_id === selectedWarehouseId && newTransaction.product_id) {
        if (userContext) {
          loadInventoryData(userContext, selectedBranchId, selectedWarehouseId, selectedCostCenterId);
        }
      }
    },
    onDelete: (oldTransaction) => {
      // ✅ حذف السجل من القائمة
      setTransactions(prev => prev.filter(transaction => transaction.id !== oldTransaction.id));
      
      // ✅ تحديث الأرصدة
      if (selectedWarehouseId && oldTransaction.warehouse_id === selectedWarehouseId && oldTransaction.product_id) {
        if (userContext) {
          loadInventoryData(userContext, selectedBranchId, selectedWarehouseId, selectedCostCenterId);
        }
      }
    },
    filter: (event) => {
      // ✅ فلتر إضافي: التحقق من company_id و warehouse_id
      const record = (event.new || event.old) as InventoryTransaction & { company_id?: string };
      if (!record || !userContext?.company_id || !record.company_id) {
        return false;
      }
      // ✅ فقط الحركات في نفس الشركة والمخزن المحدد
      return record.company_id === userContext.company_id && 
             (!selectedWarehouseId || record.warehouse_id === selectedWarehouseId);
    }
  });

  // ✅ Realtime: الاشتراك في تحديثات النقل بين المخازن
  useRealtimeTable<{ id: string; company_id?: string; source_warehouse_id?: string; destination_warehouse_id?: string; status?: string }>({
    table: 'inventory_transfers',
    enabled: !!userContext?.company_id && !!selectedWarehouseId,
    onInsert: (newTransfer) => {
      // ✅ إعادة تحميل بيانات النقل عند إضافة نقل جديد
      if (userContext && selectedBranchId && selectedWarehouseId && selectedCostCenterId) {
        loadTransferData(userContext, selectedBranchId, selectedWarehouseId, userContext.company_id);
      }
    },
    onUpdate: (newTransfer, oldTransfer) => {
      // ✅ إعادة تحميل بيانات النقل عند تحديث نقل
      // خاصة عند تغيير الحالة (pending → in_transit → received)
      if (newTransfer.status !== oldTransfer.status || 
          newTransfer.source_warehouse_id !== oldTransfer.source_warehouse_id ||
          newTransfer.destination_warehouse_id !== oldTransfer.destination_warehouse_id) {
        if (userContext && selectedBranchId && selectedWarehouseId && selectedCostCenterId) {
          loadTransferData(userContext, selectedBranchId, selectedWarehouseId, userContext.company_id);
        }
      }
    },
    onDelete: (oldTransfer) => {
      // ✅ إعادة تحميل بيانات النقل عند حذف نقل
      if (userContext && selectedBranchId && selectedWarehouseId && selectedCostCenterId) {
        loadTransferData(userContext, selectedBranchId, selectedWarehouseId, userContext.company_id);
      }
    },
    filter: (event) => {
      // ✅ فلتر إضافي: التحقق من company_id و warehouse_id
      const record = event.new || event.old;
      if (!record || !userContext?.company_id || !record.company_id) {
        return false;
      }
      // ✅ فقط النقل في نفس الشركة والمخزن المحدد (مصدر أو وجهة)
      return record.company_id === userContext.company_id && 
             (!selectedWarehouseId || 
              record.source_warehouse_id === selectedWarehouseId || 
              record.destination_warehouse_id === selectedWarehouseId);
    }
  });

  const applyBranchDefaults = useCallback(async (companyId: string, branchId: string) => {
    const { getBranchDefaults } = await import("@/lib/governance-branch-defaults")
    const defaults = await getBranchDefaults(supabase, branchId)

    setSelectedBranchId(branchId)
    setSelectedWarehouseId(defaults.default_warehouse_id || "")
    setSelectedCostCenterId(defaults.default_cost_center_id || "")

    // 🔐 جلب المخازن الخاصة بالفرع فقط (لا يُسمح بمزج فرع مع مخزن فرع آخر)
    const { data: warehousesRes } = await supabase
      .from("warehouses")
      .select("id, name, code, branch_id, is_main, branches(name, branch_name)")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .eq("branch_id", branchId) // 🔐 إلزامي: فقط مخازن هذا الفرع
      .order("is_main", { ascending: false })
      .order("name")

    setWarehouses(warehousesRes || [])
    return defaults
  }, [supabase])

  const loadData = async (context: UserContext) => {
    try {
      setIsLoading(true)
      const companyId = context.company_id
      if (!companyId) return

      // 🔐 بناء قواعد الحوكمة الموحدة
      const rules = buildDataVisibilityFilter(context)
      setVisibilityRules(rules)

      const role = String(context.role || "")
      const normalizedRole = role.trim().toLowerCase().replace(/\s+/g, "_")
      const accessLevel = getRoleAccessLevel(normalizedRole)
      const adminCheck = accessLevel === 'company' || accessLevel === 'all'
      setIsAdmin(adminCheck)

      if (adminCheck) {
        // Admin/General Manager - يمكنهم اختيار أي فرع
        const { data: branchesRes, error: branchesError } = await supabase
          .from("branches")
          .select("id, name, branch_name, code, default_cost_center_id, default_warehouse_id")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .order("name")
        if (branchesError) throw branchesError
        setBranches(branchesRes || [])
        const branchIdFromContext = String(context.branch_id || "")
        const firstBranchId = String((branchesRes || [])[0]?.id || "")
        const branchIdToUse = branchIdFromContext || firstBranchId
        if (!branchIdToUse) {
          toastActionError(toast, "الحوكمة", "المخزون", "لا توجد فروع مفعلة للشركة")
          return
        }
        await applyBranchDefaults(companyId, branchIdToUse)
      } else {
        // Employee/Accountant/Branch Manager - فرعهم فقط
        const branchId = String(context.branch_id || "")
        if (!branchId) {
          toastActionError(toast, "الحوكمة", "المخزون", "المستخدم بدون فرع")
          return
        }

        const { data: branchRow } = await supabase
          .from("branches")
          .select("id, name, branch_name, code, default_cost_center_id, default_warehouse_id")
          .eq("company_id", companyId)
          .eq("id", branchId)
          .maybeSingle()
        setBranches(branchRow ? [branchRow] : [])
        
        // 🔐 تطبيق الافتراضيات من user.branch تلقائياً
        await applyBranchDefaults(companyId, branchId)
      }

      const { data: productsData } = await supabase
        .from("products")
        .select("id, sku, name, quantity_on_hand")
        .eq("company_id", companyId)
      setProducts(productsData || [])
    } catch (error) {
      console.error("Error loading data:", error)
      toastActionError(toast, "الحوكمة", "المخزون", error instanceof Error ? error.message : "خطأ في تحميل البيانات")
    } finally {
      setIsLoading(false)
    }
  }

  // دالة تحميل بيانات المخزون حسب المخزن المختار
  const loadInventoryData = async (context: UserContext, branchId: string, warehouseId: string, costCenterId: string) => {
    try {
      setIsLoadingInventory(true) // 🆕 بدء التحميل
      const companyId = context.company_id
      
      // 🔐 التأكد من أن warehouse ينتمي للفرع المحدد
      if (warehouseId) {
        const { data: warehouse } = await supabase
          .from("warehouses")
          .select("id, branch_id")
          .eq("id", warehouseId)
          .single()
        
        if (warehouse && warehouse.branch_id !== branchId) {
          toastActionError(toast, "الحوكمة", "المخزون", "المخزن المحدد لا ينتمي للفرع المحدد")
          setIsLoadingInventory(false)
          return
        }
      }

      // 🔐 بناء قواعد الحوكمة
      const rules = buildDataVisibilityFilter(context)
      
      // 🔐 قواعد الحوكمة للمخزون:
      // - نعطل filterByCostCenter لأننا نتعامل مع transfer_in/transfer_out في JavaScript
      // - نعطل filterByWarehouse لأننا نستخدم warehouseId المحدد من selector
      // - نعطل filterByCreatedBy لأن الموظف يجب أن يرى كل حركات المخزون في فرعه/مخزنه
      //   (هذا مختلف عن Sales Orders حيث الموظف يرى فقط طلباته)
      const rulesWithoutCostCenter = { 
        ...rules, 
        filterByCostCenter: false,
        filterByWarehouse: false,
        warehouseId: null,
        filterByCreatedBy: false, // 🔐 المخزون: الموظف يرى كل حركات فرعه/مخزنه
        createdByUserId: null
      }
      
      // 🔐 تطبيق الفلاتر الإلزامية على استعلامات المخزون
      // 📌 ملاحظة: لحركات transfer_in و transfer_out، نأخذها بغض النظر عن cost_center_id
      let transactionsQuery = supabase
        .from("inventory_transactions")
        .select("*, products(name, sku)")
      
      // تطبيق قواعد الحوكمة الموحدة (تطبق company_id, branch_id تلقائياً)
      // لكن بدون cost_center_id و warehouse_id لأننا سنتعامل معهما يدوياً
      transactionsQuery = applyDataVisibilityFilter(transactionsQuery, rulesWithoutCostCenter, "inventory_transactions")
      
      // 🔐 إضافة فلتر warehouse_id يدوياً باستخدام القيمة المحددة من selector
      transactionsQuery = (transactionsQuery as any).eq("warehouse_id", warehouseId)
      
      const { data: transactionsData } = await transactionsQuery
        .order("created_at", { ascending: false })
        .limit(200)

      // 🔐 فلترة في JavaScript: نأخذ جميع الحركات في نفس cost_center_id المحدد
      // + جميع حركات transfer_in و transfer_out (لأنها قد تكون في cost_center_id مختلف لكن في نفس الفرع)
      // 📌 ملاحظة: لا نفلتر بـ created_by_user_id لأن الموظف يرى كل حركات فرعه/مخزنه
      const txs = (transactionsData || []).filter((t: any) => {
        const txCostCenterId = String(t.cost_center_id || '')
        const txType = String(t.transaction_type || '')
        // نأخذ الحركات في نفس cost_center_id
        if (txCostCenterId === costCenterId) return true
        // نأخذ حركات transfer_in و transfer_out بغض النظر عن cost_center_id (لكن في نفس الفرع والمخزن)
        if (txType === 'transfer_in' || txType === 'transfer_out') return true
        return false
      })

      const sorted = txs.slice().sort((a: any, b: any) => {
        const ad = String(a?.created_at || '')
        const bd = String(b?.created_at || '')
        return bd.localeCompare(ad)
      })
      setTransactions(sorted)

      // 🔐 حساب الكميات من inventory_transactions مع تطبيق الفلاتر الإلزامية
      // 📌 ملاحظة مهمة: لحركات transfer_in و transfer_out، يجب أن نأخذها بغض النظر عن cost_center_id
      // لأن المخزون المحول قد يكون في cost_center_id مختلف لكن في نفس الفرع والمخزن
      // الحل: نأخذ جميع الحركات في نفس المخزن والفرع، ثم نفلتر في JavaScript
      let allTransactionsQuery = supabase
        .from("inventory_transactions")
        .select("product_id, quantity_change, transaction_type, cost_center_id")
      
      // تطبيق قواعد الحوكمة الموحدة (تطبق company_id, branch_id تلقائياً)
      // لكن بدون cost_center_id و warehouse_id لأننا سنتعامل معهما يدوياً
      allTransactionsQuery = applyDataVisibilityFilter(allTransactionsQuery, rulesWithoutCostCenter, "inventory_transactions")
      
      // 🔐 إضافة فلتر warehouse_id يدوياً باستخدام القيمة المحددة من selector
      allTransactionsQuery = (allTransactionsQuery as any).eq("warehouse_id", warehouseId)
      
      const { data: allTransactionsRaw } = await allTransactionsQuery
      
      // 🔐 فلترة في JavaScript: نأخذ جميع الحركات في نفس cost_center_id المحدد
      // + جميع حركات transfer_in و transfer_out (لأنها قد تكون في cost_center_id مختلف لكن في نفس الفرع)
      // 📌 ملاحظة: لا نفلتر بـ created_by_user_id لأن الموظف يرى كل حركات فرعه/مخزنه
      const allTransactions = (allTransactionsRaw || []).filter((t: any) => {
        const txCostCenterId = String(t.cost_center_id || '')
        const txType = String(t.transaction_type || '')
        // نأخذ الحركات في نفس cost_center_id
        if (txCostCenterId === costCenterId) return true
        // نأخذ حركات transfer_in و transfer_out بغض النظر عن cost_center_id (لكن في نفس الفرع والمخزن)
        if (txType === 'transfer_in' || txType === 'transfer_out') return true
        return false
      })

      const agg: Record<string, number> = {}
      const purchasesAgg: Record<string, number> = {}
      const soldAgg: Record<string, number> = {}
      const writeOffsAgg: Record<string, number> = {}
      const saleReturnsAgg: Record<string, number> = {}
      const purchaseReturnsAgg: Record<string, number> = {}

      allTransactions.forEach((t: any) => {
        const pid = String(t.product_id || '')
        const q = Number(t.quantity_change || 0)
        const type = String(t.transaction_type || '')

        // 🔐 حساب المخزون: نجمع جميع الحركات (transfer_in يزيد، transfer_out ينقص)
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
        // 🔐 transfer_in و transfer_out يتم حسابها تلقائياً في agg لأن quantity_change يحتوي على القيمة الصحيحة
      })

      setComputedQty(agg)
      setPurchaseTotals(purchasesAgg)
      setSoldTotals(soldAgg)
      setWriteOffTotals(writeOffsAgg)
      setSaleReturnTotals(saleReturnsAgg)
      setPurchaseReturnTotals(purchaseReturnsAgg)

      // 🆕 تحديد المنتجات التي لها حركات في المخزن المحدد
      const productsSet = new Set<string>(Object.keys(agg))
      setProductsWithMovements(productsSet)

      // ✅ جلب بيانات النقل (Incoming/Outgoing Transfers)
      await loadTransferData(context, branchId, warehouseId, companyId)
    } catch (error) {
      console.error("Error loading inventory data:", error)
    } finally {
      setIsLoadingInventory(false) // 🆕 إنهاء التحميل
    }
  }

  // ✅ دالة لجلب بيانات النقل (Incoming/Outgoing Transfers)
  const loadTransferData = async (context: UserContext, branchId: string, warehouseId: string, companyId: string) => {
    try {
      if (!warehouseId) {
        setIncomingTransfers({})
        setOutgoingTransfers({})
        return
      }

      const role = String(context.role || "").trim().toLowerCase().replace(/\s+/g, "_")
      const isOwnerOrAdmin = ['owner', 'admin'].includes(role)
      const isManager = ['manager', 'accountant'].includes(role)
      const isStoreManager = role === 'store_manager'

      // ✅ جلب النقل الواردة (Incoming) - حيث destination_warehouse_id = warehouseId
      let incomingQuery = supabase
        .from("inventory_transfers")
        .select(`
          id,
          status,
          destination_warehouse_id,
          source_warehouse_id,
          source_warehouses:warehouses!inventory_transfers_source_warehouse_id_fkey(id, name),
          inventory_transfer_items!inner(
            product_id,
            quantity_sent,
            quantity_received,
            products(id, name)
          )
        `)
        .eq("company_id", companyId)
        .eq("destination_warehouse_id", warehouseId)
        .is("deleted_at", null)
        .in("status", ["pending", "in_transit", "received"]) // فقط النقل النشطة

      // ✅ فلترة حسب الصلاحيات
      if (!isOwnerOrAdmin) {
        if (isManager && context.branch_id) {
          // Manager: يرى فقط النقل في فرعه
          incomingQuery = incomingQuery.eq("destination_branch_id", context.branch_id)
        } else if (isStoreManager && context.warehouse_id) {
          // Store Manager: يرى فقط النقل الموجهة لمخزنه
          incomingQuery = incomingQuery.eq("destination_warehouse_id", context.warehouse_id)
        } else {
          // Staff: لا يرى النقل (أو حسب الصلاحيات المحددة)
          setIncomingTransfers({})
          setOutgoingTransfers({})
          return
        }
      }

      const { data: incomingTransfersData } = await incomingQuery

      // ✅ جلب النقل الصادرة (Outgoing) - حيث source_warehouse_id = warehouseId
      let outgoingQuery = supabase
        .from("inventory_transfers")
        .select(`
          id,
          status,
          source_warehouse_id,
          destination_warehouse_id,
          destination_warehouses:warehouses!inventory_transfers_destination_warehouse_id_fkey(id, name),
          inventory_transfer_items!inner(
            product_id,
            quantity_sent,
            quantity_received,
            products(id, name)
          )
        `)
        .eq("company_id", companyId)
        .eq("source_warehouse_id", warehouseId)
        .is("deleted_at", null)
        .in("status", ["pending", "in_transit", "received"]) // فقط النقل النشطة

      // ✅ فلترة حسب الصلاحيات
      if (!isOwnerOrAdmin) {
        if (isManager && context.branch_id) {
          // Manager: يرى فقط النقل في فرعه
          outgoingQuery = outgoingQuery.eq("source_branch_id", context.branch_id)
        } else if (isStoreManager && context.warehouse_id) {
          // Store Manager: يرى فقط النقل من مخزنه
          outgoingQuery = outgoingQuery.eq("source_warehouse_id", context.warehouse_id)
        } else {
          // Staff: لا يرى النقل
          setOutgoingTransfers({})
          return
        }
      }

      const { data: outgoingTransfersData } = await outgoingQuery

      // ✅ تجميع بيانات النقل الواردة حسب المنتج
      const incomingMap: Record<string, Array<{ quantity: number; warehouseName: string; warehouseId: string }>> = {}
      if (incomingTransfersData) {
        incomingTransfersData.forEach((transfer: any) => {
          const sourceWarehouseName = transfer.source_warehouses?.name || 'مخزن غير معروف'
          const sourceWarehouseId = transfer.source_warehouse_id
          
          transfer.inventory_transfer_items?.forEach((item: any) => {
            const productId = item.product_id
            // استخدام quantity_sent إذا كان موجوداً، وإلا quantity_received
            const quantity = item.quantity_sent || item.quantity_received || 0
            
            if (!incomingMap[productId]) {
              incomingMap[productId] = []
            }
            
            // التحقق من عدم التكرار (نفس المخزن)
            const existing = incomingMap[productId].find(t => t.warehouseId === sourceWarehouseId)
            if (existing) {
              existing.quantity += quantity
            } else {
              incomingMap[productId].push({
                quantity,
                warehouseName: sourceWarehouseName,
                warehouseId: sourceWarehouseId
              })
            }
          })
        })
      }

      // ✅ تجميع بيانات النقل الصادرة حسب المنتج
      const outgoingMap: Record<string, Array<{ quantity: number; warehouseName: string; warehouseId: string }>> = {}
      if (outgoingTransfersData) {
        outgoingTransfersData.forEach((transfer: any) => {
          const destWarehouseName = transfer.destination_warehouses?.name || (appLang === 'en' ? 'Unknown Warehouse' : 'مخزن غير معروف')
          const destWarehouseId = transfer.destination_warehouse_id
          
          transfer.inventory_transfer_items?.forEach((item: any) => {
            const productId = item.product_id
            // استخدام quantity_sent (الكمية المرسلة)
            const quantity = item.quantity_sent || item.quantity_received || 0
            
            if (!outgoingMap[productId]) {
              outgoingMap[productId] = []
            }
            
            // التحقق من عدم التكرار (نفس المخزن)
            const existing = outgoingMap[productId].find(t => t.warehouseId === destWarehouseId)
            if (existing) {
              existing.quantity += quantity
            } else {
              outgoingMap[productId].push({
                quantity,
                warehouseName: destWarehouseName,
                warehouseId: destWarehouseId
              })
            }
          })
        })
      }

      setIncomingTransfers(incomingMap)
      setOutgoingTransfers(outgoingMap)
    } catch (error) {
      console.error("Error loading transfer data:", error)
      // لا نعرض خطأ للمستخدم، فقط نترك البيانات فارغة
      setIncomingTransfers({})
      setOutgoingTransfers({})
    }
  }

  // حساب إجمالي المشتريات والمبيعات - حسب المخزن المحدد
  const totalPurchased = Object.values(purchaseTotals).reduce((a, b) => a + b, 0)
  const totalSold = Object.values(soldTotals).reduce((a, b) => a + b, 0)
  // عد المنتجات منخفضة المخزون فقط من المنتجات المعروضة (حسب المخزن المحدد)
  const lowStockCount = displayedProducts.filter(p => (computedQty[p.id] ?? 0) < 5 && (computedQty[p.id] ?? 0) > 0).length

  // منع hydration mismatch - عرض محتوى افتراضي حتى يتم hydration
  if (!hydrated) {
    return (
      <div className="flex h-screen">
        <Sidebar />
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          </div>
        </main>
      </div>
    )
  }

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

              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                {/* 🔐 Branch Selector
                    - Admin / General Manager: يمكنه اختيار أي فرع
                    - Employee / Accountant / Store Manager: يظهر فرعه فقط (حقل قراءة فقط) */}
                {userContext && (
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                      <Building2 className="w-4 h-4" />
                      <span className="hidden sm:inline">{appLang === 'en' ? 'Branch:' : 'الفرع:'}</span>
                    </div>

                    {isAdmin ? (
                      <Select
                        value={selectedBranchId}
                        onValueChange={(value) => {
                          applyBranchDefaults(userContext.company_id, value).catch((e) => {
                            toastActionError(toast, "الحوكمة", "المخزون", e?.message || "تعذر تطبيق افتراضيات الفرع")
                          })
                        }}
                        disabled={branches.length === 0}
                      >
                        <SelectTrigger className="w-[180px] sm:w-[220px] bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700">
                          <SelectValue placeholder={appLang === 'en' ? 'Select branch' : 'اختر الفرع'} />
                        </SelectTrigger>
                        <SelectContent>
                          {branches.map((branch) => (
                            <SelectItem key={branch.id} value={branch.id}>
                              <span>{branch.name || branch.branch_name || ''}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={
                          (branches[0]?.name ||
                            branches[0]?.branch_name ||
                            (appLang === 'en' ? 'Your branch' : 'فرعك')) as string
                        }
                        disabled
                        className="w-[180px] sm:w-[220px] bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-300 h-9 text-sm cursor-not-allowed"
                      />
                    )}
                  </div>
                )}

                {/* 🔐 Warehouse Selector - للمستخدمين العاديين: disabled، للـ Admin: enabled */}
                {filteredWarehouses.length > 0 && (
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                      <Warehouse className="w-4 h-4" />
                      <span className="hidden sm:inline">{appLang === 'en' ? 'Warehouse:' : 'المخزن:'}</span>
                    </div>
                    <Select
                      value={selectedWarehouseId}
                      onValueChange={(value) => {
                        // 🔐 التأكد من أن المخزن ينتمي للفرع المحدد
                        const warehouse = filteredWarehouses.find(w => w.id === value)
                        if (warehouse && warehouse.branch_id !== selectedBranchId) {
                          toastActionError(toast, "الحوكمة", "المخزون", "المخزن المحدد لا ينتمي للفرع المحدد")
                          return
                        }
                        setSelectedWarehouseId(value)
                      }}
                      disabled={!isAdmin || !selectedBranchId} // 🔐 disabled للمستخدمين العاديين
                    >
                      <SelectTrigger className="w-[180px] sm:w-[220px] bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700">
                        <SelectValue placeholder={appLang === 'en' ? 'Select warehouse' : 'اختر المخزن'} />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredWarehouses.map((warehouse) => (
                          <SelectItem key={warehouse.id} value={warehouse.id}>
                            <div className="flex items-center gap-2">
                              {warehouse.is_main ? (
                                <Building2 className="w-4 h-4 text-amber-500" />
                              ) : (
                                <Warehouse className="w-4 h-4 text-gray-400" />
                              )}
                              <span>{warehouse.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* بطاقات الإحصائيات */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      {appLang === 'en' ? 'Products in Warehouse' : 'منتجات المخزن'}
                    </p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{displayedProducts.length}</p>
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
                      {appLang === 'en' ? 'Warehouse Stock' : 'مخزون المخزن'}
                    </p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                      {displayedProducts.reduce((sum, p) => sum + (computedQty[p.id] ?? 0), 0)}
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
              {isLoading || isLoadingInventory ? (
                <TableSkeleton
                  cols={9}
                  rows={8}
                  className="mt-4"
                />
              ) : displayedProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
                  <Package className="w-12 h-12 mb-3 text-gray-300 dark:text-gray-600" />
                  <p>{appLang === 'en' ? 'No products in this warehouse' : 'لا توجد منتجات في هذا المخزن'}</p>
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
                            <ArrowDown className="w-4 h-4 text-green-600" />
                            <span>{appLang === 'en' ? 'Incoming Transfers' : 'النقل الواردة'}</span>
                          </div>
                        </th>
                        <th className="px-4 py-4 text-center font-semibold text-gray-700 dark:text-gray-200 border-b-2 border-gray-200 dark:border-slate-700">
                          <div className="flex items-center gap-2 justify-center">
                            <ArrowUp className="w-4 h-4 text-blue-600" />
                            <span>{appLang === 'en' ? 'Outgoing Transfers' : 'النقل الصادرة'}</span>
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
                      {displayedProducts.map((product, index) => {
                        const purchased = purchaseTotals[product.id] ?? 0
                        const sold = soldTotals[product.id] ?? 0
                        const saleReturn = saleReturnTotals[product.id] ?? 0
                        const purchaseReturn = purchaseReturnTotals[product.id] ?? 0
                        const writeOff = writeOffTotals[product.id] ?? 0
                        // استخدام الكمية المحسوبة بدلاً من quantity_on_hand مباشرة
                        const shown = computedQty[product.id] ?? 0 // عند فلترة مخزن معين، لا نستخدم quantity_on_hand الإجمالي
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

                            {/* ✅ النقل الواردة (Incoming Transfers) */}
                            <td className="px-4 py-4 text-center">
                              {(() => {
                                const incoming = incomingTransfers[product.id] || []
                                const totalIncoming = incoming.reduce((sum, t) => sum + t.quantity, 0)
                                
                                if (totalIncoming === 0) {
                                  return (
                                    <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-800">
                                      <ArrowDown className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                                      <span className="font-bold text-base text-gray-500 dark:text-gray-400">
                                        0
                                      </span>
                                    </div>
                                  )
                                }
                                
                                return (
                                  <div className="flex flex-col gap-1">
                                    <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                                      <ArrowDown className="w-4 h-4 text-green-600 dark:text-green-400" />
                                      <span className="font-bold text-base text-green-700 dark:text-green-300">
                                        {totalIncoming.toLocaleString()}
                                      </span>
                                    </div>
                                    {/* عرض تفاصيل المخازن */}
                                    <div className="flex flex-col gap-0.5 text-xs text-gray-600 dark:text-gray-400">
                                      {incoming.map((transfer, idx) => (
                                        <div key={idx} className="text-right px-2">
                                          {transfer.quantity.toLocaleString()} {appLang === 'en' ? 'from' : 'من'} {transfer.warehouseName}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )
                              })()}
                            </td>

                            {/* ✅ النقل الصادرة (Outgoing Transfers) */}
                            <td className="px-4 py-4 text-center">
                              {(() => {
                                const outgoing = outgoingTransfers[product.id] || []
                                const totalOutgoing = outgoing.reduce((sum, t) => sum + t.quantity, 0)
                                
                                if (totalOutgoing === 0) {
                                  return (
                                    <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-800">
                                      <ArrowUp className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                                      <span className="font-bold text-base text-gray-500 dark:text-gray-400">
                                        0
                                      </span>
                                    </div>
                                  )
                                }
                                
                                return (
                                  <div className="flex flex-col gap-1">
                                    <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                                      <ArrowUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                      <span className="font-bold text-base text-blue-700 dark:text-blue-300">
                                        {totalOutgoing.toLocaleString()}
                                      </span>
                                    </div>
                                    {/* عرض تفاصيل المخازن */}
                                    <div className="flex flex-col gap-0.5 text-xs text-gray-600 dark:text-gray-400">
                                      {outgoing.map((transfer, idx) => (
                                        <div key={idx} className="text-right px-2">
                                          {transfer.quantity.toLocaleString()} {appLang === 'en' ? 'to' : 'إلى'} {transfer.warehouseName}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )
                              })()}
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
                            {appLang === 'en' ? 'Total' : 'الإجمالي'} ({displayedProducts.length} {appLang === 'en' ? 'products' : 'منتج'})
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
                              {displayedProducts.reduce((sum, p) => sum + (computedQty[p.id] ?? 0), 0).toLocaleString()}
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
                              {displayedProducts.length - lowStockCount - displayedProducts.filter(p => (computedQty[p.id] ?? 0) <= 0).length}
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
                    onChange={(e) => {
                      const val = e.target.value
                      startTransition(() => {
                        setMovementFilter(val === 'purchase' ? 'purchase' : (val === 'sale' ? 'sale' : 'all'))
                      })
                    }}
                    className="px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="all">{appLang === 'en' ? 'All Types' : 'كل الأنواع'}</option>
                    <option value="purchase">{appLang === 'en' ? 'Purchases' : 'المشتريات'}</option>
                    <option value="sale">{appLang === 'en' ? 'Sales' : 'المبيعات'}</option>
                  </select>

                  {/* فلتر المنتج */}
                  <select
                    value={movementProductId}
                    onChange={(e) => {
                      const val = e.target.value
                      startTransition(() => {
                        setMovementProductId(val)
                      })
                    }}
                    className="px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 max-w-[200px]"
                  >
                    <option value="">{appLang === 'en' ? 'All Products' : 'كل المنتجات'}</option>
                    {displayedProducts.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>

                  {/* فلتر التاريخ */}
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                    <Input
                      type="date"
                      value={fromDate}
                      onChange={(e) => {
                        const val = e.target.value
                        startTransition(() => setFromDate(val))
                      }}
                      className="text-sm w-36 bg-white dark:bg-slate-900"
                    />
                    <span className="text-gray-400 dark:text-gray-500">-</span>
                    <Input
                      type="date"
                      value={toDate}
                      onChange={(e) => {
                        const val = e.target.value
                        startTransition(() => setToDate(val))
                      }}
                      className="text-sm w-36 bg-white dark:bg-slate-900"
                    />
                  </div>

                  {/* إجماليات الحركات */}
                  {(() => {
                    const filtered = transactions.filter((t) => {
                      const type = String(t.transaction_type || '')
                      if (movementFilter === 'purchase') {
                        if (!type.startsWith('purchase')) return false
                      } else if (movementFilter === 'sale') {
                        if (!type.startsWith('sale') && type !== 'return' && type !== 'write_off' && type !== 'adjustment') return false
                      }
                      if (movementProductId && String(t.product_id || '') !== movementProductId) return false
                      const dStr = String(t.created_at || '').slice(0, 10)
                      if (fromDate && dStr < fromDate) return false
                      if (toDate && dStr > toDate) return false
                      return true
                    })
                    const totalIn = filtered.reduce((acc, t) => acc + (Number(t.quantity_change || 0) > 0 ? Number(t.quantity_change) : 0), 0)
                    const totalOut = filtered.reduce((acc, t) => acc + (Number(t.quantity_change || 0) < 0 ? Math.abs(Number(t.quantity_change)) : 0), 0)
                    const netChange = totalIn - totalOut
                    return (
                      <div className={`flex flex-wrap items-center gap-2 ${isPending ? 'opacity-50' : ''}`}>
                        {isPending && <RefreshCcw className="w-4 h-4 animate-spin text-blue-500" />}
                        <Badge variant="outline" className="gap-1 px-3 py-1.5">
                          <Package className="w-3 h-3" />
                          {appLang === 'en' ? 'Count:' : 'العدد:'} {filtered.length}
                        </Badge>
                        <Badge className="gap-1 px-3 py-1.5 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-100">
                          <ArrowUp className="w-3 h-3" />
                          {appLang === 'en' ? 'In:' : 'وارد:'} {totalIn}
                        </Badge>
                        <Badge className="gap-1 px-3 py-1.5 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-100">
                          <ArrowDown className="w-3 h-3" />
                          {appLang === 'en' ? 'Out:' : 'صادر:'} {totalOut}
                        </Badge>
                        <Badge variant="secondary" className={`gap-1 px-3 py-1.5 ${netChange >= 0 ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'}`}>
                          <BarChart3 className="w-3 h-3" />
                          {appLang === 'en' ? 'Net:' : 'الصافي:'} {netChange >= 0 ? '+' : ''}{netChange}
                        </Badge>
                      </div>
                    )
                  })()}
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
                  const type = String(t.transaction_type || '')
                  // فلترة حسب النوع
                  if (movementFilter === 'purchase') {
                    if (!type.startsWith('purchase')) return false
                  } else if (movementFilter === 'sale') {
                    if (!type.startsWith('sale') && type !== 'return' && type !== 'write_off' && type !== 'adjustment') return false
                  }
                  // فلترة حسب المنتج
                  if (movementProductId && String(t.product_id || '') !== movementProductId) return false
                  // فلترة حسب التاريخ
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
