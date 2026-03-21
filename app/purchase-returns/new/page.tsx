"use client"

import { useEffect, useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useSupabase } from "@/lib/supabase/hooks"
import { useRouter, useSearchParams } from "next/navigation"
import { Trash2, Plus, Warehouse, AlertTriangle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { toastActionError, toastActionSuccess } from "@/lib/notifications"
import { getExchangeRate, getActiveCurrencies, type Currency } from "@/lib/currency-service"
import { getActiveCompanyId } from "@/lib/company"
import { canReturnBill, getBillOperationError, billRequiresJournalEntries } from "@/lib/validation"
import { validatePurchaseReturnStock, formatStockShortageMessage } from "@/lib/purchase-return-validation"
import { notifyPRApprovalRequest } from "@/lib/notification-helpers"

type Supplier = { id: string; name: string; phone?: string | null }
type Bill = { id: string; bill_number: string; supplier_id: string; total_amount: number; status: string; receipt_status?: string | null; branch_id?: string | null; cost_center_id?: string | null; warehouse_id?: string | null }
type BillItem = { id: string; product_id: string | null; quantity: number; unit_price: number; tax_rate: number; discount_percent: number; line_total: number; returned_quantity?: number; products?: { name: string; cost_price: number } }
type Product = { id: string; name: string; cost_price: number; item_type?: 'product' | 'service' }
type Warehouse = { id: string; name: string; branch_id: string | null; branches?: { name: string } | null }
type AccountOption = { id: string; account_code: string | null; account_name: string; sub_type: string | null }

type ItemRow = {
  bill_item_id: string | null
  product_id: string | null
  product_name: string
  quantity: number
  max_quantity: number
  unit_price: number
  tax_rate: number
  discount_percent: number
  line_total: number
}

// المرحلة الثانية: تخصيصات متعددة المخازن
type WhAllocationItem = {
  bill_item_id: string | null
  product_id: string | null
  product_name: string
  quantity: number
  max_quantity: number
  unit_price: number
  tax_rate: number
  discount_percent: number
}

type WarehouseAllocation = {
  localId: string           // معرّف محلي للـ React key
  warehouseId: string
  items: WhAllocationItem[]
}

const PRIVILEGED_ROLES = ['owner', 'admin', 'general_manager']

export default function NewPurchaseReturnPage() {
  const supabase = useSupabase()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')

  // Edit mode: ?edit=<returnId>
  const editReturnId = searchParams.get('edit')
  const isEditMode = !!editReturnId
  const [editReturnLoaded, setEditReturnLoaded] = useState(false)

  // تهيئة اللغة بعد hydration
  useEffect(() => {
    try { setAppLang((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') } catch { }
  }, [])

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [bills, setBills] = useState<Bill[]>([])
  const [billItems, setBillItems] = useState<BillItem[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [companyId, setCompanyId] = useState<string | null>(null)

  // صلاحيات المستخدم
  const [currentUserRole, setCurrentUserRole] = useState<string>('accountant')
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentUserName, setCurrentUserName] = useState<string>('')
  const isPrivileged = PRIVILEGED_ROLES.includes(currentUserRole.toLowerCase())

  // المخازن (للمالك/المدير العام)
  const [allWarehouses, setAllWarehouses] = useState<Warehouse[]>([])
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('')
  // رصيد كل منتج في المخزن المختار (productId → stock)
  const [warehouseStocks, setWarehouseStocks] = useState<Record<string, number>>({})
  // رصيد كل منتج في كل مخزن (warehouseId → productId → stock)
  const [allWarehouseStocks, setAllWarehouseStocks] = useState<Record<string, Record<string, number>>>({})

  // المرحلة الثانية: تخصيصات متعددة المخازن (للمالك/المدير فقط)
  const [warehouseAllocations, setWarehouseAllocations] = useState<WarehouseAllocation[]>([])
  const isMultiWarehouse = warehouseAllocations.length > 1

  const [form, setForm] = useState({
    supplier_id: "",
    bill_id: "",
    return_number: "PRET-" + Math.floor(Math.random() * 100000),
    return_date: new Date().toISOString().slice(0, 10),
    settlement_method: "debit_note" as "cash" | "debit_note" | "bank_transfer" | "credit",
    reason: "",
    notes: "",
    currency: "EGP"
  })

  const [items, setItems] = useState<ItemRow[]>([])
  const [saving, setSaving] = useState(false)

  // حسابات النقدية والبنوك (لاختيار المستخدم عند الاسترداد النقدي/البنكي)
  const [cashBankAccounts, setCashBankAccounts] = useState<AccountOption[]>([])
  const [selectedRefundAccountId, setSelectedRefundAccountId] = useState<string>('')

  // Multi-currency support
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [exchangeRate, setExchangeRate] = useState<{ rate: number; rateId: string | null; source: string }>({ rate: 1, rateId: null, source: 'same_currency' })
  const baseCurrency = typeof window !== 'undefined' ? localStorage.getItem('app_currency') || 'EGP' : 'EGP'
  const currencySymbols: Record<string, string> = { EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ' }

  useEffect(() => {
    ; (async () => {
      const loadedCompanyId = await getActiveCompanyId(supabase)
      if (!loadedCompanyId) return
      setCompanyId(loadedCompanyId)

      // جلب بيانات المستخدم والدور
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setCurrentUserId(user.id)

      const { data: companyData } = await supabase
        .from("companies").select("user_id").eq("id", loadedCompanyId).single()
      const { data: memberData } = await supabase
        .from("company_members")
        .select("role, branch_id")
        .eq("company_id", loadedCompanyId)
        .eq("user_id", user.id)
        .single()

      const isOwner = companyData?.user_id === user.id
      const role = isOwner ? "owner" : (memberData?.role || "accountant")
      const userBranchId = memberData?.branch_id || null
      setCurrentUserRole(role)
      setCurrentUserName(user.email || '')

      // 🔐 بناء استعلام الفواتير حسب الصلاحيات
      const isPrivilegedRole = PRIVILEGED_ROLES.includes(role.toLowerCase())
      let billQuery = supabase
        .from("bills")
        .select("id, bill_number, supplier_id, total_amount, status, receipt_status, branch_id, cost_center_id, warehouse_id")
        .eq("company_id", loadedCompanyId)
        .in("status", ["paid", "partially_paid", "received"])
        .eq("receipt_status", "received") // ✅ يجب أن تكون البضاعة مستلمة فعلياً قبل السماح بالمرتجع

      // الأدوار العادية (محاسب/مدير فرع/موظف): ترى فواتير فرعها فقط
      if (!isPrivilegedRole && userBranchId) {
        billQuery = billQuery.eq("branch_id", userBranchId)
      }

      // 🔐 Enterprise Governance: Filter suppliers and products by branch for non-admin users
      const isPrivilegedForSuppliers = PRIVILEGED_ROLES.includes(role.toLowerCase())
      let suppQuery = supabase.from("suppliers").select("id, name, phone").eq("company_id", loadedCompanyId)
      let prodQuery = supabase.from("products").select("id, name, cost_price").eq("company_id", loadedCompanyId)
      if (!isPrivilegedForSuppliers && userBranchId) {
        suppQuery = suppQuery.eq("branch_id", userBranchId)
        prodQuery = prodQuery.or(`branch_id.eq.${userBranchId},branch_id.is.null`)
      }

      const [suppRes, billRes, prodRes] = await Promise.all([
        suppQuery,
        billQuery,
        prodQuery
      ])

      setSuppliers((suppRes.data || []) as Supplier[])
      setBills((billRes.data || []) as Bill[])
      setProducts((prodRes.data || []) as Product[])

      // ملاحظة: allWarehouses تُبنى ديناميكياً في useEffect الخاص بـ allWarehouseStocks
      // من خلال inventory_transactions مع join، لتجاوز RLS على جدول warehouses

      // Load currencies
      const curr = await getActiveCurrencies(supabase, loadedCompanyId)
      if (curr.length > 0) setCurrencies(curr)
      setForm(f => ({ ...f, currency: baseCurrency }))

      // جلب حسابات النقدية والبنوك لاختيار حساب الاسترداد
      const { data: acctData } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name, sub_type")
        .eq("company_id", loadedCompanyId)
        .in("sub_type", ["cash", "bank"])
      setCashBankAccounts((acctData || []) as AccountOption[])
    })()
  }, [supabase])

  // وضع التعديل: تحميل بيانات المرتجع المرفوض وملء النموذج
  useEffect(() => {
    if (!editReturnId || !companyId || editReturnLoaded) return
    ;(async () => {
      const { data: pr } = await supabase
        .from('purchase_returns')
        .select(`
          id, return_number, return_date, settlement_method, reason, notes,
          supplier_id, bill_id, branch_id, cost_center_id, warehouse_id,
          original_currency, workflow_status, status,
          purchase_return_items(
            id, bill_item_id, product_id, quantity, unit_price,
            tax_rate, discount_percent, line_total,
            products(name, cost_price)
          )
        `)
        .eq('id', editReturnId)
        .single()

      if (!pr) return
      if (!['rejected', 'warehouse_rejected'].includes(pr.workflow_status)) {
        toast({ title: '⚠️ لا يمكن تعديل هذا المرتجع', description: 'يمكن التعديل فقط على المرتجعات المرفوضة', variant: 'destructive' })
        router.push('/purchase-returns')
        return
      }

      // ملء النموذج ببيانات المرتجع
      setForm(f => ({
        ...f,
        supplier_id: pr.supplier_id || '',
        bill_id: pr.bill_id || '',
        return_number: pr.return_number || f.return_number,
        return_date: pr.return_date || f.return_date,
        settlement_method: (pr.settlement_method || 'debit_note') as any,
        reason: pr.reason || '',
        notes: pr.notes || '',
        currency: pr.original_currency || 'EGP',
      }))

      // ملء بنود المرتجع
      if (pr.purchase_return_items && pr.purchase_return_items.length > 0) {
        const loadedItems: ItemRow[] = pr.purchase_return_items.map((item: any) => ({
          bill_item_id: item.bill_item_id,
          product_id: item.product_id,
          product_name: item.products?.name || '',
          quantity: item.quantity,
          max_quantity: item.quantity,
          unit_price: item.unit_price,
          tax_rate: item.tax_rate,
          discount_percent: item.discount_percent,
          line_total: item.line_total,
        }))
        setItems(loadedItems)
      }

      setEditReturnLoaded(true)
    })()
  }, [editReturnId, companyId, editReturnLoaded, supabase])

  // جلب رصيد المخزن المختار لكل منتج في بنود المرتجع
  useEffect(() => {
    if (!selectedWarehouseId || !companyId || items.length === 0) {
      setWarehouseStocks({})
      return
    }
    const productIds = items
      .filter(i => i.product_id)
      .map(i => i.product_id as string)
    if (productIds.length === 0) return

      ; (async () => {
        const { data } = await supabase
          .from("inventory_transactions")
          .select("product_id, quantity_change")
          .eq("company_id", companyId)
          .eq("warehouse_id", selectedWarehouseId)
          .in("product_id", productIds)
          .eq("is_deleted", false)

        const stocks: Record<string, number> = {}
        for (const pid of productIds) stocks[pid] = 0
        for (const row of (data || [])) {
          stocks[row.product_id] = (stocks[row.product_id] || 0) + Number(row.quantity_change)
        }
        setWarehouseStocks(stocks)
      })()
  }, [selectedWarehouseId, companyId, items])

  // جلب رصيد كل منتج في جميع المخازن + بناء قائمة المخازن
  // خطوتان منفصلتان لتجنب مشاكل FK/RLS مع الـ join
  useEffect(() => {
    if (!isPrivileged || !companyId || !form.bill_id) {
      setAllWarehouseStocks({})
      setAllWarehouses([])
      return
    }
    const productIds = billItems
      .map((i: any) => i.product_id as string)
      .filter(Boolean)
    if (productIds.length === 0) {
      setAllWarehouseStocks({})
      setAllWarehouses([])
      return
    }

    ; (async () => {
      // الخطوة 1: جلب حركات المخزون بدون join (يعمل دائماً بغض النظر عن RLS)
      const { data: txData } = await supabase
        .from("inventory_transactions")
        .select("product_id, warehouse_id, quantity_change")
        .eq("company_id", companyId)
        .in("product_id", productIds)
        .eq("is_deleted", false)

      if (!txData || txData.length === 0) {
        setAllWarehouseStocks({})
        setAllWarehouses([])
        return
      }

      // بناء خريطة المخزون وجمع معرّفات المخازن
      const stocksMap: Record<string, Record<string, number>> = {}
      const warehouseIds = new Set<string>()
      for (const row of txData) {
        const whId = row.warehouse_id
        if (!whId) continue
        warehouseIds.add(whId)
        if (!stocksMap[whId]) {
          stocksMap[whId] = {}
          for (const pid of productIds) stocksMap[whId][pid] = 0
        }
        stocksMap[whId][row.product_id] = (stocksMap[whId][row.product_id] || 0) + Number(row.quantity_change)
      }

      // الخطوة 2: جلب أسماء المخازن بشكل منفصل
      const warehouseIdArr = Array.from(warehouseIds)
      const warehouseMap: Record<string, Warehouse> = {}

      if (warehouseIdArr.length === 0) {
        setAllWarehouses([])
        setAllWarehouseStocks({})
        return
      }

      const { data: whData } = await supabase
        .from("warehouses")
        .select("id, name, branch_id")
        .in("id", warehouseIdArr)

      for (const wh of (whData || [])) {
        warehouseMap[wh.id] = {
          id: wh.id,
          name: wh.name,
          branch_id: wh.branch_id,
          branches: null,
        }
      }

      // جلب أسماء الفروع بشكل منفصل لتجنب مشاكل الـ nested join
      const branchIds = [...new Set(Object.values(warehouseMap).map(w => w.branch_id).filter(Boolean))] as string[]
      if (branchIds.length > 0) {
        const { data: branchData } = await supabase
          .from("branches")
          .select("id, name")
          .in("id", branchIds)
        const branchMap = Object.fromEntries((branchData || []).map((b: { id: string; name: string }) => [b.id, b.name]))
        for (const wh of Object.values(warehouseMap)) {
          if (wh.branch_id && branchMap[wh.branch_id]) {
            wh.branches = { name: branchMap[wh.branch_id] }
          }
        }
      }

      // احتياطي للمخازن التي لم تُوجد في قاعدة البيانات
      let counter = 1
      for (const whId of warehouseIdArr) {
        if (!warehouseMap[whId]) {
          warehouseMap[whId] = { id: whId, name: `مخزن ${counter++}`, branch_id: null, branches: null }
        }
      }

      setAllWarehouses(Object.values(warehouseMap) as Warehouse[])
      setAllWarehouseStocks(stocksMap)
    })()
  }, [isPrivileged, companyId, billItems, form.bill_id])

  // Update exchange rate when currency changes
  useEffect(() => {
    const updateRate = async () => {
      if (form.currency === baseCurrency) {
        setExchangeRate({ rate: 1, rateId: null, source: 'same_currency' })
      } else if (companyId) {
        const result = await getExchangeRate(supabase, form.currency, baseCurrency, undefined, companyId)
        setExchangeRate({ rate: result.rate, rateId: result.rateId || null, source: result.source })
      }
    }
    updateRate()
  }, [form.currency, companyId, baseCurrency])

  // Load bill items when bill is selected + تهيئة المخزن الافتراضي والتخصيصات
  useEffect(() => {
    if (!form.bill_id) {
      setBillItems([])
      setItems([])
      setSelectedWarehouseId('')
      setWarehouseStocks({})
      setWarehouseAllocations([])
      return
    }
    ; (async () => {
      const { data } = await supabase
        .from("bill_items")
        .select("id, product_id, quantity, unit_price, tax_rate, discount_percent, line_total, returned_quantity, products(name, cost_price)")
        .eq("bill_id", form.bill_id)

      const billItemsData = (data || []) as any[]
      setBillItems(billItemsData)

      // Auto-populate return items (للمستخدمين غير المميزين)
      const baseItems = billItemsData.map(item => ({
        bill_item_id: item.id,
        product_id: item.product_id,
        product_name: item.products?.name || "—",
        quantity: 0,
        max_quantity: Number(item.quantity) - Number(item.returned_quantity || 0),
        unit_price: Number(item.unit_price),
        tax_rate: Number(item.tax_rate || 0),
        discount_percent: Number(item.discount_percent || 0),
        line_total: 0
      }))
      setItems(baseItems)

      // للمالك/المدير: تعيين مخزن الفاتورة الافتراضي وتهيئة تخصيص واحد
      const selectedBill = bills.find(b => b.id === form.bill_id)
      const billWarehouseId = selectedBill?.warehouse_id || ''
      if (billWarehouseId) {
        setSelectedWarehouseId(billWarehouseId)
        // تهيئة تخصيص واحد بمخزن الفاتورة
        setWarehouseAllocations([{
          localId: `alloc-${Date.now()}`,
          warehouseId: billWarehouseId,
          items: billItemsData.map(item => ({
            bill_item_id: item.id,
            product_id: item.product_id,
            product_name: item.products?.name || "—",
            quantity: 0,
            max_quantity: Number(item.quantity) - Number(item.returned_quantity || 0),
            unit_price: Number(item.unit_price),
            tax_rate: Number(item.tax_rate || 0),
            discount_percent: Number(item.discount_percent || 0),
          }))
        }])
      } else {
        setWarehouseAllocations([])
      }
    })()
  }, [form.bill_id, supabase])

  const filteredBills = useMemo(() =>
    form.supplier_id ? bills.filter(b => b.supplier_id === form.supplier_id) : bills
    , [form.supplier_id, bills])

  const updateItem = (idx: number, patch: Partial<ItemRow>) => {
    setItems(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], ...patch }
      const qty = Math.min(Number(next[idx].quantity || 0), next[idx].max_quantity)
      next[idx].quantity = qty
      const price = Number(next[idx].unit_price || 0)
      const disc = Number(next[idx].discount_percent || 0)
      const gross = qty * price
      const net = gross - (gross * disc / 100)
      next[idx].line_total = Number(net.toFixed(2))
      return next
    })
  }

  const subtotal = useMemo(() => items.reduce((sum, it) => sum + Number(it.line_total || 0), 0), [items])
  const taxAmount = useMemo(() => items.reduce((sum, it) => sum + (Number(it.line_total || 0) * Number(it.tax_rate || 0) / 100), 0), [items])
  const total = subtotal + taxAmount

  const addManualItem = () => {
    setItems(prev => [...prev, {
      bill_item_id: null,
      product_id: null,
      product_name: "",
      quantity: 1,
      max_quantity: 9999,
      unit_price: 0,
      tax_rate: 0,
      discount_percent: 0,
      line_total: 0
    }])
  }

  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx))

  // ===== دوال مساعدة للتخصيصات متعددة المخازن =====

  // إضافة تخصيص مخزن جديد
  const addWarehouseAllocation = () => {
    setWarehouseAllocations(prev => [...prev, {
      localId: `alloc-${Date.now()}`,
      warehouseId: '',
      items: billItems.map(item => ({
        bill_item_id: item.id,
        product_id: item.product_id,
        product_name: (item as any).products?.name || "—",
        quantity: 0,
        max_quantity: Number(item.quantity) - Number(item.returned_quantity || 0),
        unit_price: Number(item.unit_price),
        tax_rate: Number(item.tax_rate || 0),
        discount_percent: Number(item.discount_percent || 0),
      }))
    }])
  }

  // حذف تخصيص
  const removeAllocation = (localId: string) => {
    setWarehouseAllocations(prev => prev.filter(a => a.localId !== localId))
  }

  // تغيير مخزن التخصيص
  const updateAllocationWarehouse = (localId: string, warehouseId: string) => {
    setWarehouseAllocations(prev => prev.map(a =>
      a.localId === localId ? { ...a, warehouseId } : a
    ))
  }

  // تغيير كمية منتج في تخصيص
  const updateAllocationItemQty = (localId: string, itemIdx: number, qty: number) => {
    setWarehouseAllocations(prev => prev.map(a => {
      if (a.localId !== localId) return a
      const newItems = [...a.items]
      const item = newItems[itemIdx]
      const clampedQty = Math.min(Math.max(0, qty), item.max_quantity)
      // التحقق من أن الإجمالي عبر جميع التخصيصات لا يتجاوز المتاح
      const otherAllocsQty = prev
        .filter(oa => oa.localId !== localId)
        .reduce((sum, oa) => sum + (oa.items[itemIdx]?.quantity || 0), 0)
      const maxAllowed = Math.min(clampedQty, item.max_quantity - otherAllocsQty)
      newItems[itemIdx] = { ...item, quantity: Math.max(0, maxAllowed) }
      return { ...a, items: newItems }
    }))
  }

  // حساب إجمالي التخصيصات
  const allocSubtotal = warehouseAllocations.reduce((sum, alloc) =>
    sum + alloc.items.reduce((s, it) => {
      const gross = it.quantity * it.unit_price
      const net = gross - (gross * it.discount_percent / 100)
      return s + net
    }, 0), 0)

  const allocTaxAmount = warehouseAllocations.reduce((sum, alloc) =>
    sum + alloc.items.reduce((s, it) => {
      const gross = it.quantity * it.unit_price
      const net = gross - (gross * it.discount_percent / 100)
      return s + (net * it.tax_rate / 100)
    }, 0), 0)

  const allocTotal = allocSubtotal + allocTaxAmount

  // إجمالي كمية كل منتج عبر كل التخصيصات
  const allocTotalQtyPerItem = (itemIdx: number) =>
    warehouseAllocations.reduce((sum, alloc) => sum + (alloc.items[itemIdx]?.quantity || 0), 0)

  // ===== حفظ المرتجع متعدد المخازن (المرحلة الثانية) =====
  const saveMultiWarehouseReturn = async () => {
    if (!companyId) return

    // التحقق من أن كل تخصيص له مخزن
    const missingWarehouse = warehouseAllocations.find(a => !a.warehouseId)
    if (missingWarehouse) {
      toastActionError(toast, "الحفظ", "المرتجع", appLang === 'en' ? 'Please select a warehouse for each allocation.' : 'يرجى اختيار مخزن لكل تخصيص.')
      return
    }

    // التحقق من عدم تكرار المخزن
    const whIds = warehouseAllocations.map(a => a.warehouseId)
    if (new Set(whIds).size !== whIds.length) {
      toastActionError(toast, "الحفظ", "المرتجع", appLang === 'en' ? 'Duplicate warehouses are not allowed.' : 'لا يمكن تكرار نفس المخزن.')
      return
    }

    // التحقق من وجود كميات
    const hasAnyQty = warehouseAllocations.some(a => a.items.some(it => it.quantity > 0))
    if (!hasAnyQty) {
      toastActionError(toast, "الحفظ", "المرتجع", appLang === 'en' ? 'Please enter return quantities.' : 'يرجى إدخال كميات المرتجع.')
      return
    }

    // التحقق من الفاتورة
    const { data: billCheck } = await supabase
      .from("bills").select("status, paid_amount, total_amount, returned_amount").eq("id", form.bill_id).single()

    if (!canReturnBill(billCheck?.status || null)) {
      const err = getBillOperationError(billCheck?.status || null, 'return', appLang as 'en' | 'ar')
      if (err) toastActionError(toast, "الحفظ", "المرتجع", err.description)
      return
    }

    // التحقق من الفترة المحاسبية
    try {
      const { assertPeriodNotLocked } = await import("@/lib/accounting-period-lock")
      const { createClient } = await import("@supabase/supabase-js")
      const periodSupabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
      await assertPeriodNotLocked(periodSupabase, { companyId, date: form.return_date })
    } catch (lockError: any) {
      toast({ title: "❌ الفترة المحاسبية مقفلة", description: lockError.message, variant: "destructive" })
      return
    }

    // جلب الحسابات
    const { data: accounts } = await supabase
      .from("chart_of_accounts").select("id, account_code, account_name, account_type, sub_type").eq("company_id", companyId)

    type AccountRow = { id: string; account_code: string | null; account_name: string; account_type: string; sub_type: string | null }
    const findAcct = (subType: string, fallback: string) =>
      (accounts as AccountRow[] | null)?.find(a => a.sub_type === subType)?.id ||
      (accounts as AccountRow[] | null)?.find(a => a.account_name?.includes(fallback))?.id
    const apAccount = findAcct("accounts_payable", "دائن")
    const purchaseAccount = findAcct("purchases", "مشتريات") || findAcct("expense", "مصروف")
    const inventoryAccount = findAcct("inventory", "مخزون")
    const vatAccount = findAcct("vat_input", "ضريب")
    const vendorCreditAccount = findAcct("vendor_credit_liability", "إشعار دائن") || findAcct("ap_contra", "ap contra") || apAccount

    const needsJournalEntry = billCheck?.status === 'paid' || billCheck?.status === 'partially_paid'

    // بناء مجموعات المخازن
    const warehouseGroups = await Promise.all(warehouseAllocations.map(async (alloc) => {
      const allocItems = alloc.items.filter(it => it.quantity > 0)
      if (allocItems.length === 0) return null

      const allocSub = allocItems.reduce((s, it) => {
        const gross = it.quantity * it.unit_price
        return s + (gross - (gross * it.discount_percent / 100))
      }, 0)
      const allocTax = allocItems.reduce((s, it) => {
        const gross = it.quantity * it.unit_price
        const net = gross - (gross * it.discount_percent / 100)
        return s + (net * it.tax_rate / 100)
      }, 0)
      const allocTot = allocSub + allocTax

      const finalSub = form.currency === baseCurrency ? allocSub : Math.round(allocSub * exchangeRate.rate * 10000) / 10000
      const finalTax = form.currency === baseCurrency ? allocTax : Math.round(allocTax * exchangeRate.rate * 10000) / 10000
      const finalTot = finalSub + finalTax

      // جلب بيانات الفرع/مركز التكلفة للمخزن
      let whBranchId: string | null = null
      let whCostCenterId: string | null = null
      const { data: whData } = await supabase.from("warehouses").select("branch_id").eq("id", alloc.warehouseId).single()
      whBranchId = (whData as any)?.branch_id || null
      if (whBranchId) {
        const { getBranchDefaults } = await import("@/lib/governance-branch-defaults")
        const defaults = await getBranchDefaults(supabase, whBranchId)
        whCostCenterId = defaults.default_cost_center_id
      }

      // بناء سطور القيد لهذا التخصيص
      const journalLines: any[] = []
      if (needsJournalEntry && finalTot > 0) {
        if (form.settlement_method === 'cash' || form.settlement_method === 'bank_transfer') {
          const cashAcct = findAcct("cash", "نقد")
          const bankAcct = findAcct("bank", "بنك")
          const refundAcct = selectedRefundAccountId || (form.settlement_method === 'cash' ? (cashAcct || bankAcct) : (bankAcct || cashAcct))
          if (refundAcct) journalLines.push({
            account_id: refundAcct, debit_amount: finalTot, credit_amount: 0,
            description: appLang === 'en' ? 'Refund received from supplier' : 'استرداد مستلم من المورد',
            original_debit: allocTot, original_credit: 0, original_currency: form.currency,
            exchange_rate_used: exchangeRate.rate, exchange_rate_id: exchangeRate.rateId, rate_source: exchangeRate.source
          })
        } else {
          if (vendorCreditAccount) journalLines.push({
            account_id: vendorCreditAccount, debit_amount: finalTot, credit_amount: 0,
            description: appLang === 'en' ? 'Reduce AP - Debit Note' : 'تخفيض الموردين - إشعار مدين',
            original_debit: allocTot, original_credit: 0, original_currency: form.currency,
            exchange_rate_used: exchangeRate.rate, exchange_rate_id: exchangeRate.rateId, rate_source: exchangeRate.source
          })
        }
        const invAcct = inventoryAccount || purchaseAccount
        if (invAcct && finalSub > 0) journalLines.push({
          account_id: invAcct, debit_amount: 0, credit_amount: finalSub,
          description: appLang === 'en' ? 'Inventory returned to supplier' : 'مخزون مرتجع للمورد',
          original_debit: 0, original_credit: allocSub, original_currency: form.currency,
          exchange_rate_used: exchangeRate.rate, exchange_rate_id: exchangeRate.rateId, rate_source: exchangeRate.source
        })
        if (vatAccount && finalTax > 0) journalLines.push({
          account_id: vatAccount, debit_amount: 0, credit_amount: finalTax,
          description: appLang === 'en' ? 'Reverse VAT' : 'عكس ضريبة المشتريات',
          original_debit: 0, original_credit: allocTax, original_currency: form.currency,
          exchange_rate_used: exchangeRate.rate, exchange_rate_id: exchangeRate.rateId, rate_source: exchangeRate.source
        })
      }

      return {
        warehouse_id: alloc.warehouseId,
        branch_id: whBranchId,
        cost_center_id: whCostCenterId,
        subtotal: finalSub,
        tax_amount: finalTax,
        total_amount: finalTot,
        journal_entry: needsJournalEntry ? {
          entry_date: form.return_date,
          description: `مرتجع مشتريات ${form.return_number} — مخزن ${alloc.warehouseId}`,
        } : null,
        journal_lines: needsJournalEntry ? journalLines : null,
        items: allocItems.map(it => ({
          bill_item_id: it.bill_item_id,
          product_id: it.product_id,
          description: it.product_name,
          quantity: it.quantity,
          unit_price: it.unit_price,
          tax_rate: it.tax_rate,
          discount_percent: it.discount_percent,
          line_total: (() => { const g = it.quantity * it.unit_price; return g - (g * it.discount_percent / 100) })(),
        }))
      }
    }))

    const filteredGroups = warehouseGroups.filter(Boolean)
    if (filteredGroups.length < 2) {
      toastActionError(toast, "الحفظ", "المرتجع", appLang === 'en' ? 'At least 2 warehouses with quantities are required.' : 'يجب وجود كميات في مخزنين على الأقل.')
      return
    }

    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      'process_purchase_return_multi_warehouse',
      {
        p_company_id: companyId,
        p_supplier_id: form.supplier_id,
        p_bill_id: form.bill_id,
        p_purchase_return: {
          return_number: form.return_number,
          return_date: form.return_date,
          status: 'pending_approval',
          subtotal: filteredGroups.reduce((s, g) => s + (g?.subtotal || 0), 0),
          tax_amount: filteredGroups.reduce((s, g) => s + (g?.tax_amount || 0), 0),
          total_amount: filteredGroups.reduce((s, g) => s + (g?.total_amount || 0), 0),
          settlement_method: form.settlement_method,
          reason: form.reason,
          notes: form.notes,
          original_currency: form.currency,
          original_subtotal: allocSubtotal,
          original_tax_amount: allocTaxAmount,
          original_total_amount: allocTotal,
          exchange_rate_used: exchangeRate.rate,
          exchange_rate_id: exchangeRate.rateId || null,
        },
        p_warehouse_groups: filteredGroups,
        p_created_by: currentUserId || null,
      }
    )

    if (rpcError) throw new Error(`فشل حفظ المرتجع متعدد المخازن: ${rpcError.message}`)

    const purchaseReturnId = (rpcResult as any)?.purchase_return_id
    const allocationIds: string[] = (rpcResult as any)?.allocation_ids || []

    // إشعار للإدارة العليا (pending_admin_approval — نفس سياسة المرتجع الفردي)
    const selectedSupplier = suppliers.find(s => s.id === form.supplier_id)
    if (purchaseReturnId) {
      try {
        const totalAmt = filteredGroups.reduce((s: number, g: any) => s + (g?.total_amount || 0), 0)
        await notifyPRApprovalRequest({
          companyId,
          prId: purchaseReturnId,
          prNumber: form.return_number,
          supplierName: selectedSupplier?.name || form.supplier_id,
          amount: totalAmt,
          currency: baseCurrency,
          createdBy: currentUserId || '',
          appLang,
        })
      } catch (notifyErr) {
        console.warn('⚠️ Multi-warehouse admin notification failed (non-critical):', notifyErr)
      }
    }

    toast({
      title: appLang === 'en' ? '📋 Multi-Warehouse Return Submitted for Admin Approval' : '📋 تم إرسال المرتجع متعدد المخازن للاعتماد الإداري',
      description: appLang === 'en'
        ? `Return ${form.return_number} for ${filteredGroups.length} warehouses is pending admin approval.`
        : `مرتجع ${form.return_number} لـ ${filteredGroups.length} مخازن بانتظار موافقة الإدارة العليا.`,
    })
    router.push("/purchase-returns")
  }

  const saveReturn = async () => {
    try {
      setSaving(true)
      if (!companyId || !form.supplier_id) {
        toastActionError(toast, "الحفظ", "المرتجع", appLang === 'en' ? "Please select a supplier" : "يرجى اختيار المورد")
        return
      }
      if (!form.bill_id) {
        toastActionError(toast, "الحفظ", "المرتجع", appLang === 'en' ? "A purchase bill must be selected to create a return" : "يجب تحديد فاتورة شراء لإنشاء المرتجع")
        return
      }
      if ((form.settlement_method === 'cash' || form.settlement_method === 'bank_transfer') && !selectedRefundAccountId) {
        toastActionError(toast, "الحفظ", "المرتجع", appLang === 'en' ? "Please select the refund account (cash/bank)" : "يرجى اختيار حساب الاسترداد (نقدية/بنك)")
        return
      }

      // ===================== مسار التخصيصات المتعددة (المرحلة الثانية) =====================
      if (isMultiWarehouse) {
        await saveMultiWarehouseReturn()
        return
      }

      // للمستخدمين المميزين ذوي التخصيص الواحد: استخدام كميات التخصيص مباشرة
      // (state updates are async, so we use local variables throughout)
      const singleAllocItems: ItemRow[] = (isPrivileged && warehouseAllocations.length === 1)
        ? warehouseAllocations[0].items.map(it => {
          const gross = it.quantity * it.unit_price
          const net = gross - (gross * it.discount_percent / 100)
          return {
            bill_item_id: it.bill_item_id,
            product_id: it.product_id,
            product_name: it.product_name,
            quantity: it.quantity,
            max_quantity: it.max_quantity,
            unit_price: it.unit_price,
            tax_rate: it.tax_rate,
            discount_percent: it.discount_percent,
            line_total: Number(net.toFixed(2)),
          }
        })
        : []
      const singleAllocWarehouseId = (isPrivileged && warehouseAllocations.length === 1)
        ? warehouseAllocations[0].warehouseId
        : selectedWarehouseId

      // مصدر البنود الفعّال
      const effectiveItems = singleAllocItems.length > 0 ? singleAllocItems : items
      const effectiveSelectedWarehouseId = singleAllocItems.length > 0 ? singleAllocWarehouseId : selectedWarehouseId

      // إجماليات فعّالة (تأخذ في الاعتبار التخصيصات للمالك/المدير)
      const effectiveSubtotal = effectiveItems.reduce((sum, it) => sum + Number(it.line_total || 0), 0)
      const effectiveTaxAmount = effectiveItems.reduce((sum, it) => sum + (Number(it.line_total || 0) * Number(it.tax_rate || 0) / 100), 0)
      const effectiveTotal = effectiveSubtotal + effectiveTaxAmount

      if (effectiveItems.filter(i => i.quantity > 0).length === 0) {
        toastActionError(toast, "الحفظ", "المرتجع", appLang === 'en' ? "Please enter return quantities" : "يرجى إدخال كميات المرتجع")
        return
      }

      // ===================== التحقق من الفاتورة =====================
      let billStatus: string | null = null
      let billReceiptStatus: string | null = null
      let billPaidAmount = 0
      let billTotalAmount = 0
      let billPreviousReturnedAmount = 0

      if (form.bill_id) {
        const { data: billCheck } = await supabase
          .from("bills")
          .select("status, paid_amount, total_amount, returned_amount, receipt_status")
          .eq("id", form.bill_id)
          .single()

        billStatus = billCheck?.status || null
        billReceiptStatus = billCheck?.receipt_status || null
        billPaidAmount = Number(billCheck?.paid_amount || 0)
        billTotalAmount = Number(billCheck?.total_amount || 0)
        billPreviousReturnedAmount = Number(billCheck?.returned_amount || 0)

        if (!canReturnBill(billStatus)) {
          const error = getBillOperationError(billStatus, 'return', appLang as 'en' | 'ar')
          if (error) toastActionError(toast, "الحفظ", "المرتجع", error.description)
          return
        }

        if (billRequiresJournalEntries(billStatus)) {
          const { data: existingBillEntry } = await supabase
            .from("journal_entries")
            .select("id")
            .eq("reference_id", form.bill_id)
            .eq("reference_type", "bill")
            .single()

          if (!existingBillEntry) {
            toastActionError(toast, "الحفظ", "المرتجع", appLang === 'en' ? "Cannot return paid bill without journal entries." : "لا يمكن عمل مرتجع لفاتورة مدفوعة بدون قيود محاسبية.")
            return
          }
        }
      }

      const validItems = effectiveItems.filter(i => i.quantity > 0)
      
      // الفاتورة تعتبر نهائية (لا يمكن تعديل إجمالياتها) إذا كانت مدفوعة كلياً/جزئياً أو تم استلام بضاعتها
      const isFinalizedBill = billStatus === 'paid' || billStatus === 'partially_paid' || billReceiptStatus === 'received'
      const needsJournalEntry = isFinalizedBill
      const returnMethod = form.settlement_method

      // ===================== الحوكمة (الفرع / المخزن / مركز التكلفة) =====================
      const selectedBill = bills.find(b => b.id === form.bill_id)
      let billBranchId = selectedBill?.branch_id || null
      let billCostCenterId = selectedBill?.cost_center_id || null
      let billWarehouseId = selectedBill?.warehouse_id || null

      // للمالك/المدير: استخدام المخزن المختار (قد يختلف عن مخزن الفاتورة)
      const effectiveWarehouseId = (isPrivileged && effectiveSelectedWarehouseId) ? effectiveSelectedWarehouseId : billWarehouseId
      const selectedWarehouse = isPrivileged ? allWarehouses.find(w => w.id === effectiveWarehouseId) : null

      // إذا اختار المالك/المدير مخزن مختلف، نجلب بيانات فرعه
      if (isPrivileged && effectiveSelectedWarehouseId && effectiveSelectedWarehouseId !== billWarehouseId && selectedWarehouse?.branch_id) {
        const { getBranchDefaults } = await import("@/lib/governance-branch-defaults")
        const altDefaults = await getBranchDefaults(supabase, selectedWarehouse.branch_id)
        billBranchId = selectedWarehouse.branch_id
        billWarehouseId = effectiveWarehouseId
        billCostCenterId = altDefaults.default_cost_center_id
      }

      if (needsJournalEntry && form.bill_id) {
        if (!billBranchId && billWarehouseId) {
          const { data: wh } = await supabase
            .from("warehouses")
            .select("branch_id")
            .eq("company_id", companyId)
            .eq("id", billWarehouseId)
            .single()
          billBranchId = (wh as any)?.branch_id || null
        }
        if (billBranchId && (!billWarehouseId || !billCostCenterId)) {
          const { getBranchDefaults } = await import("@/lib/governance-branch-defaults")
          const defaults = await getBranchDefaults(supabase, billBranchId)
          if (!billWarehouseId) billWarehouseId = defaults.default_warehouse_id
          if (!billCostCenterId) billCostCenterId = defaults.default_cost_center_id
        }
        if (!billBranchId || !billWarehouseId || !billCostCenterId) {
          toastActionError(toast, "الحفظ", "المرتجع", appLang === 'en' ? 'Branch, Warehouse, and Cost Center are required for paid bills' : 'الفرع والمخزن ومركز التكلفة مطلوبة للفواتير المدفوعة')
          return
        }
      }

      // ===================== تحديد workflow_status =====================
      // جميع المرتجعات بدون استثناء تبدأ بـ pending_admin_approval
      // لا يوجد خصم مخزون أو أثر مالي حتى موافقة الإدارة ثم المخزن
      const workflowStatus = 'pending_admin_approval'

      // ملاحظة: التحقق من المخزون يتم في مرحلة اعتماد المخزن (confirm_purchase_return_delivery_v2)
      // لا حاجة لفحص مسبق هنا لأن المرتجع يُحفظ كـ pending ولا يُنفَّذ فوراً

      // ===================== جلب الحسابات =====================
      const { data: accounts } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name, account_type, sub_type")
        .eq("company_id", companyId)

      type AccountRow = { id: string; account_code: string | null; account_name: string; account_type: string; sub_type: string | null }
      const findAccount = (subType: string, fallbackName: string) =>
        (accounts as AccountRow[] | null)?.find((a: AccountRow) => a.sub_type === subType)?.id ||
        (accounts as AccountRow[] | null)?.find((a: AccountRow) => a.account_name?.includes(fallbackName))?.id

      const apAccount = findAccount("accounts_payable", "دائن")
      const purchaseAccount = findAccount("purchases", "مشتريات") || findAccount("expense", "مصروف")
      const inventoryAccount = findAccount("inventory", "مخزون")
      const vatAccount = findAccount("vat_input", "ضريب")
      const vendorCreditLiability = findAccount("vendor_credit_liability", "إشعار دائن") ||
        findAccount("ap_contra", "ap contra") || null

      // ===================== حساب المبالغ =====================
      const finalBaseSubtotal = form.currency === baseCurrency ? subtotal : Math.round(subtotal * exchangeRate.rate * 10000) / 10000
      const finalBaseTax = form.currency === baseCurrency ? taxAmount : Math.round(taxAmount * exchangeRate.rate * 10000) / 10000
      const finalBaseTotal = form.currency === baseCurrency ? total : Math.round(total * exchangeRate.rate * 10000) / 10000

      // ===================== التحقق من الفترة المحاسبية =====================
      try {
        const { assertPeriodNotLocked } = await import("@/lib/accounting-period-lock")
        const { createClient } = await import("@supabase/supabase-js")
        const periodSupabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
        await assertPeriodNotLocked(periodSupabase, { companyId, date: form.return_date })
      } catch (lockError: any) {
        toast({ title: "❌ الفترة المحاسبية مقفلة", description: lockError.message || "لا يمكن تسجيل مرتجع في فترة محاسبية مغلقة", variant: "destructive" })
        setSaving(false)
        return
      }

      // ===================== بناء سطور القيد المحاسبي =====================
      const journalLines: any[] = []
      if (needsJournalEntry) {
        const invOrExp = inventoryAccount || purchaseAccount
        const inventoryCost = finalBaseSubtotal  // سعر الشراء = القيمة الصحيحة للمرتجع

        if (returnMethod === 'cash' || returnMethod === 'bank_transfer') {
          const cashAccount = findAccount("cash", "نقد")
          const bankAccount = findAccount("bank", "بنك")
          const refundAccount = returnMethod === 'cash' ? (cashAccount || bankAccount) : (bankAccount || cashAccount)
          if (refundAccount && finalBaseTotal > 0) {
            journalLines.push({
              account_id: refundAccount,
              debit_amount: finalBaseTotal,
              credit_amount: 0,
              description: returnMethod === 'cash'
                ? (appLang === 'en' ? 'Cash refund received from supplier' : 'استرداد نقدي مستلم من المورد')
                : (appLang === 'en' ? 'Bank transfer refund received' : 'استرداد بنكي مستلم من المورد'),
              original_debit: total,
              original_credit: 0,
              original_currency: form.currency,
              exchange_rate_used: exchangeRate.rate,
              exchange_rate_id: exchangeRate.rateId,
              rate_source: exchangeRate.source,
            })
          }
        } else {
          // debit_note: تخفيض حساب الموردين (AP)
          const vendorCreditAccount = vendorCreditLiability || apAccount
          if (vendorCreditAccount && finalBaseTotal > 0) {
            journalLines.push({
              account_id: vendorCreditAccount,
              debit_amount: finalBaseTotal,
              credit_amount: 0,
              description: appLang === 'en' ? 'Reduce AP - Debit Note to supplier' : 'تخفيض الموردين - إشعار مدين للمورد',
              original_debit: total,
              original_credit: 0,
              original_currency: form.currency,
              exchange_rate_used: exchangeRate.rate,
              exchange_rate_id: exchangeRate.rateId,
              rate_source: exchangeRate.source,
            })
          }
        }

        if (invOrExp && inventoryCost > 0) {
          journalLines.push({
            account_id: invOrExp,
            debit_amount: 0,
            credit_amount: inventoryCost,
            description: appLang === 'en' ? 'Inventory returned to supplier' : 'مخزون مرتجع للمورد',
            original_debit: 0,
            original_credit: subtotal,
            original_currency: form.currency,
            exchange_rate_used: exchangeRate.rate,
            exchange_rate_id: exchangeRate.rateId,
            rate_source: exchangeRate.source,
          })
        }

        if (vatAccount && finalBaseTax > 0) {
          journalLines.push({
            account_id: vatAccount,
            debit_amount: 0,
            credit_amount: finalBaseTax,
            description: appLang === 'en' ? 'Reverse VAT - purchase return' : 'عكس ضريبة المشتريات',
            original_debit: 0,
            original_credit: taxAmount,
            original_currency: form.currency,
            exchange_rate_used: exchangeRate.rate,
            exchange_rate_id: exchangeRate.rateId,
            rate_source: exchangeRate.source,
          })
        }
      }

      // ===================== بناء بيانات تحديث الفاتورة =====================
      let billUpdateData: Record<string, unknown> | null = null
      if (form.bill_id) {
        const newReturnedAmount = billPreviousReturnedAmount + finalBaseTotal
        const newReturnStatus = newReturnedAmount >= billTotalAmount ? 'full' : 'partial'

        if (isFinalizedBill) {
          billUpdateData = { returned_amount: newReturnedAmount, return_status: newReturnStatus }
        } else {
          const newTotal = Math.max(billTotalAmount - finalBaseTotal, 0)
          billUpdateData = {
            returned_amount: newReturnedAmount,
            return_status: newReturnStatus,
            status: newTotal === 0 ? 'fully_returned' : (billStatus || 'sent'),
            ...(newTotal === 0 ? {} : { total_amount: newTotal }),
          }
        }
      }

      // ===================== بناء بيانات Vendor Credit =====================
      const needsVendorCredit = needsJournalEntry && returnMethod === 'debit_note' && finalBaseTotal > 0
      const vendorCreditData = needsVendorCredit ? {
        credit_number: `VC-${form.return_number.replace('PRET-', '')}`,
        credit_date: form.return_date,
        subtotal: finalBaseSubtotal,
        tax_amount: finalBaseTax,
        total_amount: finalBaseTotal,
        notes: `إشعار دائن تلقائي - ${form.return_number}`,
        original_currency: form.currency,
        exchange_rate_used: exchangeRate.rate,
        exchange_rate_id: exchangeRate.rateId || null,
      } : null

      const vendorCreditItemsData = needsVendorCredit ? validItems.map(item => ({
        product_id: item.product_id,
        description: item.product_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        tax_rate: item.tax_rate,
        discount_percent: item.discount_percent,
        line_total: item.line_total,
      })) : null

      // ===================== 🔥 وضع التعديل: تحديث المرتجع المرفوض وإعادة إرساله =====================
      if (isEditMode && editReturnId) {
        const returnItems = validItems.map(item => ({
          bill_item_id: item.bill_item_id,
          product_id: item.product_id,
          description: item.product_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          tax_rate: item.tax_rate,
          discount_percent: item.discount_percent,
          line_total: item.line_total,
        }))

        const { data: resubmitResult, error: resubmitError } = await supabase.rpc(
          'resubmit_purchase_return',
          {
            p_return_id: editReturnId,
            p_user_id: currentUserId,
            p_purchase_return: {
              reason: form.reason,
              notes: form.notes,
              settlement_method: form.settlement_method,
              return_date: form.return_date,
              subtotal: finalBaseSubtotal,
              tax_amount: finalBaseTax,
              total_amount: finalBaseTotal,
              original_subtotal: effectiveSubtotal,
              original_tax_amount: effectiveTaxAmount,
              original_total_amount: effectiveTotal,
            },
            p_return_items: returnItems,
          }
        )

        if (resubmitError || !(resubmitResult as any)?.success) {
          throw new Error(`فشل إعادة إرسال المرتجع: ${resubmitError?.message || (resubmitResult as any)?.error || 'خطأ غير معروف'}`)
        }

        const selectedSupplier = suppliers.find(s => s.id === form.supplier_id)
        try {
          await notifyPRApprovalRequest({
            companyId,
            prId: editReturnId,
            prNumber: form.return_number,
            supplierName: selectedSupplier?.name || form.supplier_id,
            amount: finalBaseTotal,
            currency: baseCurrency,
            createdBy: currentUserId || '',
            branchId: billBranchId || undefined,
            costCenterId: billCostCenterId || undefined,
            appLang,
            isResubmit: true,
          })
        } catch (notifyErr) {
          console.warn('⚠️ Admin resubmit notification failed (non-critical):', notifyErr)
        }

        toast({
          title: appLang === 'en' ? '✅ Return Resubmitted for Approval' : '✅ تمت إعادة إرسال المرتجع للاعتماد',
          description: appLang === 'en'
            ? 'Management has been notified to review the updated return.'
            : 'تم إشعار الإدارة العليا لمراجعة المرتجع المعدّل.',
        })
        router.push('/purchase-returns')
        return
      }

      // ===================== 🔥 الاستدعاء الأتومي (Transaction واحدة) =====================
      // pending_approval: ينشئ المرتجع والقيد (draft) بدون خصم مخزون
      // confirmed: ينشئ كل شيء فوراً
      const { data: rpcResult, error: rpcError } = await supabase.rpc(
        'process_purchase_return_atomic',
        {
          p_company_id: companyId,
          p_supplier_id: form.supplier_id,
          p_bill_id: form.bill_id || null,
          p_purchase_return: {
            return_number: form.return_number,
            return_date: form.return_date,
            status: 'pending_approval',
            subtotal: finalBaseSubtotal,
            tax_amount: finalBaseTax,
            total_amount: finalBaseTotal,
            settlement_method: form.settlement_method,
            reason: form.reason,
            notes: form.notes,
            branch_id: billBranchId,
            cost_center_id: billCostCenterId,
            warehouse_id: effectiveWarehouseId || billWarehouseId,
            original_currency: form.currency,
            original_subtotal: effectiveSubtotal,
            original_tax_amount: effectiveTaxAmount,
            original_total_amount: effectiveTotal,
            exchange_rate_used: exchangeRate.rate,
            exchange_rate_id: exchangeRate.rateId || null,
          },
          p_return_items: validItems.map(item => ({
            bill_item_id: item.bill_item_id,
            product_id: item.product_id,
            description: item.product_name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            tax_rate: item.tax_rate,
            discount_percent: item.discount_percent,
            line_total: item.line_total,
          })),
          p_journal_entry: needsJournalEntry ? {
            entry_date: form.return_date,
            description: `مرتجع مشتريات رقم ${form.return_number}`,
            status: 'draft',
          } : null,
          p_journal_lines: (needsJournalEntry && journalLines.length > 0) ? journalLines : null,
          p_vendor_credit: vendorCreditData,
          p_vendor_credit_items: vendorCreditItemsData,
          p_bill_update: null,
          p_workflow_status: workflowStatus,
          p_created_by: currentUserId || null,
        }
      )

      if (rpcError) {
        throw new Error(`فشل حفظ المرتجع: ${rpcError.message}`)
      }

      const purchaseReturnId = (rpcResult as any)?.purchase_return_id
      console.log(`✅ تم حفظ المرتجع بنجاح (Atomic): ${purchaseReturnId}, workflow: ${workflowStatus}`)

      // ===================== 🔍 Audit Log: purchase_return_created =====================
      if (purchaseReturnId && companyId && currentUserId) {
        try {
          await supabase.from('audit_logs').insert({
            company_id: companyId,
            user_id: currentUserId,
            action: 'purchase_return_created',
            entity_type: 'purchase_return',
            entity_id: purchaseReturnId,
            new_values: {
              return_number: form.return_number,
              supplier_id: form.supplier_id,
              total_amount: finalBaseTotal,
              status: 'pending_approval',
            },
          })
        } catch (auditErr) {
          console.warn('Audit log failed (non-critical):', auditErr)
        }
      }

      // ===================== 🔔 إشعارات الإدارة (pending_admin_approval) =====================
      // جميع المرتجعات تُرسل إشعاراً للإدارة العليا فقط - لا إشعار للمخزن في هذه المرحلة
      if (purchaseReturnId) {
        try {
          const selectedSupplier = suppliers.find(s => s.id === form.supplier_id)
          await notifyPRApprovalRequest({
            companyId,
            prId: purchaseReturnId,
            prNumber: form.return_number,
            supplierName: selectedSupplier?.name || form.supplier_id,
            amount: finalBaseTotal,
            currency: baseCurrency,
            createdBy: currentUserId || '',
            branchId: billBranchId || undefined,
            costCenterId: billCostCenterId || undefined,
            appLang,
          })
        } catch (notifyErr) {
          console.warn('⚠️ Admin notification failed (non-critical):', notifyErr)
        }
      }

      toast({
        title: appLang === 'en' ? '📋 Return Submitted for Admin Approval' : '📋 تم إرسال المرتجع للاعتماد الإداري',
        description: appLang === 'en'
          ? 'Management has been notified. Inventory will only be deducted after admin approval + warehouse confirmation.'
          : 'تم إشعار الإدارة العليا. سيتم خصم المخزون فقط بعد موافقة الإدارة ثم اعتماد مسؤول المخزن.',
      })

      toastActionSuccess(toast, "الإنشاء", "المرتجع")
      router.push("/purchase-returns")
    } catch (err) {
      console.error("Error saving return:", err)
      toastActionError(toast, "الحفظ", "المرتجع", String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">
              {isEditMode
                ? (appLang === 'en' ? '✏️ Edit & Resubmit Return' : '✏️ تعديل وإعادة إرسال المرتجع')
                : (appLang === 'en' ? 'New Purchase Return' : 'مرتجع مشتريات جديد')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label>{appLang === 'en' ? 'Supplier' : 'المورد'}</Label>
                <select className="w-full border rounded px-2 py-2" value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value, bill_id: "" })}>
                  <option value="">{appLang === 'en' ? 'Select Supplier' : 'اختر المورد'}</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <Label className="flex items-center gap-1">
                  {appLang === 'en' ? 'Purchase Bill' : 'فاتورة الشراء'}
                  <span className="text-red-500 text-xs">*</span>
                </Label>
                <select
                  className={`w-full border rounded px-2 py-2 ${!form.bill_id ? 'border-red-300 dark:border-red-700' : 'border-gray-300 dark:border-gray-600'}`}
                  value={form.bill_id}
                  onChange={e => {
                    const newBillId = e.target.value
                    setForm({ ...form, bill_id: newBillId })
                    // إذا تم مسح الفاتورة، نمسح المخزن المختار أيضاً
                    if (!newBillId) {
                      setSelectedWarehouseId('')
                    }
                  }}
                >
                  <option value="">{appLang === 'en' ? '— Select Bill —' : '— اختر الفاتورة —'}</option>
                  {filteredBills.map(b => <option key={b.id} value={b.id}>{b.bill_number}</option>)}
                </select>
                {!form.supplier_id && (
                  <p className="text-xs text-gray-400 mt-1">
                    {appLang === 'en' ? 'Select a supplier first' : 'اختر المورد أولاً'}
                  </p>
                )}
              </div>
              <div>
                <Label>{appLang === 'en' ? 'Return Number' : 'رقم المرتجع'}</Label>
                <Input value={form.return_number} onChange={e => setForm({ ...form, return_number: e.target.value })} />
              </div>
              <div>
                <Label>{appLang === 'en' ? 'Date' : 'التاريخ'}</Label>
                <Input type="date" value={form.return_date} onChange={e => setForm({ ...form, return_date: e.target.value })} />
              </div>
            </div>

            {/* 🏪 تخصيصات المخازن (للمالك/المدير العام فقط) */}
            {isPrivileged && form.bill_id && (
              <>
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Warehouse className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                      <h3 className="font-semibold text-amber-800 dark:text-amber-200">
                        {appLang === 'en' ? 'Warehouse Allocations' : 'تخصيصات المخازن'}
                      </h3>
                      <span className="text-xs bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full">
                        {appLang === 'en' ? 'Owner / Manager Only' : 'المالك / المدير العام فقط'}
                      </span>
                      {isMultiWarehouse && (
                        <span className="text-xs bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 px-2 py-0.5 rounded-full font-semibold">
                          {warehouseAllocations.length} {appLang === 'en' ? 'warehouses' : 'مخازن'}
                        </span>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addWarehouseAllocation}
                      className="border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-300"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      {appLang === 'en' ? 'Add Warehouse' : 'إضافة مخزن'}
                    </Button>
                  </div>

                  {/* رسالة توضيحية عند المخازن المتعددة */}
                  {isMultiWarehouse && (
                    <div className="flex items-start gap-2 p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg">
                      <AlertTriangle className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                      <div className="text-xs text-orange-700 dark:text-orange-300">
                        <p className="font-semibold">{appLang === 'en' ? 'Multi-Warehouse Approval Workflow' : 'سير عمل الاعتماد متعدد المخازن'}</p>
                        <p className="mt-0.5">
                          {appLang === 'en'
                            ? 'Each warehouse manager will approve their allocation independently. Stock is deducted upon each manager\'s confirmation.'
                            : 'كل مسؤول مخزن يعتمد تخصيصه باستقلالية. يُخصم المخزون عند اعتماد كل مسؤول.'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* صفوف التخصيصات */}
                  <div className="space-y-4">
                    {warehouseAllocations.map((alloc, allocIdx) => {
                      const allocSub = alloc.items.reduce((s, it) => {
                        const g = it.quantity * it.unit_price; return s + (g - (g * it.discount_percent / 100))
                      }, 0)
                      const allocTax = alloc.items.reduce((s, it) => {
                        const g = it.quantity * it.unit_price; const n = g - (g * it.discount_percent / 100); return s + (n * it.tax_rate / 100)
                      }, 0)
                      const allocTot = allocSub + allocTax
                      const billWh = bills.find(b => b.id === form.bill_id)?.warehouse_id || ''
                      const isDiff = alloc.warehouseId && alloc.warehouseId !== billWh

                      return (
                        <div key={alloc.localId} className={`border rounded-lg p-3 space-y-2 ${isDiff ? 'border-orange-300 dark:border-orange-700 bg-orange-50/30 dark:bg-orange-900/10' : 'border-amber-200 dark:border-amber-700 bg-white dark:bg-slate-900'}`}>
                          <div className="flex items-center gap-3">
                            <div className="flex-1">
                              <Label className="text-xs text-amber-700 dark:text-amber-300 mb-0.5 block">
                                {appLang === 'en' ? `Warehouse ${allocIdx + 1}` : `المخزن ${allocIdx + 1}`}
                                {isDiff && (
                                  <span className="mr-2 text-[10px] text-orange-600 dark:text-orange-400">
                                    ({appLang === 'en' ? 'pending approval' : 'بانتظار الاعتماد'})
                                  </span>
                                )}
                              </Label>
                              <select
                                className="w-full border border-amber-300 dark:border-amber-600 rounded px-2 py-1.5 bg-white dark:bg-slate-800 text-sm"
                                value={alloc.warehouseId}
                                onChange={e => updateAllocationWarehouse(alloc.localId, e.target.value)}
                              >
                                <option value="">{appLang === 'en' ? 'Select Warehouse...' : 'اختر المخزن...'}</option>
                                {allWarehouses.map(w => (
                                  <option key={w.id} value={w.id}
                                    disabled={warehouseAllocations.some(a => a.localId !== alloc.localId && a.warehouseId === w.id)}>
                                    {(w as any).branches?.name ? `${(w as any).branches.name} — ` : ''}{w.name}
                                    {w.id === billWh ? (appLang === 'en' ? ' (Bill)' : ' (الفاتورة)') : ''}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="text-right min-w-[90px]">
                              <div className="text-xs text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Total' : 'الإجمالي'}</div>
                              <div className="font-bold text-sm text-amber-800 dark:text-amber-200">{allocTot.toFixed(2)}</div>
                            </div>
                            {warehouseAllocations.length > 1 && (
                              <Button
                                type="button" variant="ghost" size="sm"
                                onClick={() => removeAllocation(alloc.localId)}
                                className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 flex-shrink-0"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>

                          {/* كميات المنتجات لهذا التخصيص */}
                          {billItems.filter((bi: any) => bi.product_id).length > 0 && (
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-gray-500 border-b border-amber-100 dark:border-amber-800">
                                    <th className="text-right py-1 pr-1 font-medium">{appLang === 'en' ? 'Product' : 'المنتج'}</th>
                                    <th className="text-center py-1 font-medium">{appLang === 'en' ? 'Avail.' : 'المتاح'}</th>
                                    {allWarehouses.length > 0 && (
                                      <th className="text-center py-1 font-medium text-blue-600 dark:text-blue-400">
                                        {appLang === 'en' ? 'Stock' : 'المخزون'}
                                      </th>
                                    )}
                                    <th className="text-center py-1 font-medium">{appLang === 'en' ? 'Qty' : 'الكمية'}</th>
                                    <th className="text-center py-1 font-medium">{appLang === 'en' ? 'Used' : 'المُوزَّع'}</th>
                                    <th className="text-right py-1 font-medium">{appLang === 'en' ? 'Line Total' : 'الإجمالي'}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {alloc.items.map((it, itemIdx) => {
                                    const totalQtyThisProduct = allocTotalQtyPerItem(itemIdx)
                                    const overAllocated = totalQtyThisProduct > it.max_quantity
                                    const lineGross = it.quantity * it.unit_price
                                    const lineNet = lineGross - (lineGross * it.discount_percent / 100)
                                    const stockInThisWh = alloc.warehouseId ? (allWarehouseStocks[alloc.warehouseId]?.[it.product_id!] ?? '—') : '—'
                                    return (
                                      <tr key={itemIdx} className="border-b border-amber-50 dark:border-amber-900/30">
                                        <td className="py-1 pr-1 font-medium truncate max-w-[120px]" title={it.product_name}>{it.product_name}</td>
                                        <td className="py-1 text-center text-gray-500">{it.max_quantity}</td>
                                        {allWarehouses.length > 0 && (
                                          <td className={`py-1 text-center font-medium ${typeof stockInThisWh === 'number' && stockInThisWh <= 0 ? 'text-red-500' : 'text-blue-600 dark:text-blue-400'}`}>
                                            {stockInThisWh}
                                          </td>
                                        )}
                                        <td className="py-1 text-center">
                                          <Input
                                            type="number" min={0} max={it.max_quantity}
                                            value={it.quantity}
                                            onChange={e => updateAllocationItemQty(alloc.localId, itemIdx, Number(e.target.value))}
                                            className={`w-16 h-6 text-center text-xs ${overAllocated ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : ''}`}
                                          />
                                        </td>
                                        <td className={`py-1 text-center font-medium ${overAllocated ? 'text-red-600 dark:text-red-400' : totalQtyThisProduct > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-gray-400'}`}>
                                          {totalQtyThisProduct}
                                          {overAllocated && <span className="text-red-500 mr-1">!</span>}
                                        </td>
                                        <td className="py-1 text-right font-medium">{lineNet.toFixed(2)}</td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* ملخص إجمالي التخصيصات */}
                  {isMultiWarehouse && (
                    <div className="border-t border-amber-200 dark:border-amber-700 pt-2 flex justify-end gap-6 text-xs text-amber-800 dark:text-amber-200">
                      <span>{appLang === 'en' ? 'Subtotal' : 'المجموع'}: <strong>{allocSubtotal.toFixed(2)}</strong></span>
                      <span>{appLang === 'en' ? 'Tax' : 'الضريبة'}: <strong>{allocTaxAmount.toFixed(2)}</strong></span>
                      <span className="text-base font-bold">{appLang === 'en' ? 'Total' : 'الإجمالي'}: {allocTotal.toFixed(2)}</span>
                    </div>
                  )}
                </div>

                {/* 📊 جدول توزيع المخزون على الفروع (للمرجع) */}
                {allWarehouses.length > 0 && billItems.filter((i: any) => i.product_id).length > 0 && (
                  <div className="border border-blue-200 dark:border-blue-700 rounded-xl overflow-hidden mt-1">
                    <div className="bg-blue-50 dark:bg-blue-900/30 px-4 py-2.5 flex items-center gap-2 border-b border-blue-200 dark:border-blue-700">
                      <span className="text-sm font-semibold text-blue-800 dark:text-blue-200">
                        📊 {appLang === 'en' ? 'Stock Distribution Across Branches' : 'توزيع المخزون على الفروع'}
                      </span>
                      <span className="text-xs text-blue-500 dark:text-blue-400">
                        {appLang === 'en' ? '(reference)' : '(للمرجع)'}
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-blue-50/70 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-700">
                            <th className="text-right p-2.5 font-semibold text-blue-800 dark:text-blue-300 whitespace-nowrap min-w-[160px]">
                              {appLang === 'en' ? 'Branch / Warehouse' : 'الفرع / المخزن'}
                            </th>
                            {billItems.filter(i => i.product_id).map((it: any, idx: number) => (
                              <th key={idx} className="text-center p-2.5 font-semibold text-blue-800 dark:text-blue-300 whitespace-nowrap">
                                {it.products?.name || '—'}
                                <div className="text-[10px] font-normal text-blue-500 dark:text-blue-400">
                                  {appLang === 'en'
                                    ? `Available: ${Number(it.quantity) - Number(it.returned_quantity || 0)}`
                                    : `المتاح: ${Number(it.quantity) - Number(it.returned_quantity || 0)}`}
                                </div>
                              </th>
                            ))}
                            <th className="text-center p-2.5 font-semibold text-blue-800 dark:text-blue-300 whitespace-nowrap">
                              {appLang === 'en' ? 'Total' : 'الإجمالي'}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {allWarehouses.map(wh => {
                            const whStocks = allWarehouseStocks[wh.id] || {}
                            const productsInBill = billItems.filter((i: any) => i.product_id)
                            const rowTotal = productsInBill.reduce((sum: number, it: any) => sum + (whStocks[it.product_id] || 0), 0)
                            const isBillWarehouse = wh.id === bills.find(b => b.id === form.bill_id)?.warehouse_id
                            const isAllocated = warehouseAllocations.some(a => a.warehouseId === wh.id)
                            return (
                              <tr
                                key={wh.id}
                                className={`border-b border-blue-100 dark:border-blue-800 transition-colors ${isAllocated
                                  ? 'bg-amber-50 dark:bg-amber-900/30 ring-1 ring-inset ring-amber-300 dark:ring-amber-700'
                                  : 'hover:bg-blue-50/40 dark:hover:bg-blue-900/10'
                                  }`}
                              >
                                <td className="p-2.5">
                                  <div className="flex items-center gap-1.5">
                                    {isAllocated && <span className="text-amber-500 text-base">▶</span>}
                                    <div>
                                      <div className="font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-1">
                                        {(wh as any).branches?.name || (appLang === 'en' ? 'No Branch' : 'بدون فرع')}
                                        {isBillWarehouse && (
                                          <span className="text-[10px] bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded-full">
                                            {appLang === 'en' ? 'Bill' : 'الفاتورة'}
                                          </span>
                                        )}
                                        {isAllocated && (
                                          <span className="text-[10px] bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded-full">
                                            {appLang === 'en' ? 'Allocated' : 'مخصص'}
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-gray-400 dark:text-gray-500 text-[10px]">{wh.name}</div>
                                    </div>
                                  </div>
                                </td>
                                {billItems.filter((i: any) => i.product_id).map((it: any, idx: number) => {
                                  const qty = whStocks[it.product_id] || 0
                                  return (
                                    <td key={idx} className="p-2.5 text-center">
                                      <span className={`font-bold text-sm ${qty <= 0 ? 'text-gray-300 dark:text-gray-600' : 'text-green-700 dark:text-green-400'
                                        }`}>
                                        {qty}
                                      </span>
                                    </td>
                                  )
                                })}
                                <td className="p-2.5 text-center">
                                  <span className={`font-bold ${rowTotal === 0 ? 'text-gray-300 dark:text-gray-600' : 'text-blue-700 dark:text-blue-300'}`}>
                                    {rowTotal}
                                  </span>
                                </td>
                              </tr>
                            )
                          })}
                          <tr className="bg-blue-100 dark:bg-blue-900/40 font-bold border-t-2 border-blue-300 dark:border-blue-600">
                            <td className="p-2.5 text-blue-800 dark:text-blue-200">
                              🏢 {appLang === 'en' ? 'Company Total' : 'إجمالي الشركة'}
                            </td>
                            {billItems.filter((i: any) => i.product_id).map((it: any, idx: number) => {
                              const companyTotal = allWarehouses.reduce((sum, wh) => sum + (allWarehouseStocks[wh.id]?.[it.product_id] || 0), 0)
                              return (
                                <td key={idx} className="p-2.5 text-center">
                                  <span className="text-sm text-green-700 dark:text-green-400">{companyTotal}</span>
                                </td>
                              )
                            })}
                            <td className="p-2.5 text-center text-blue-900 dark:text-blue-100 text-sm">
                              {billItems.filter((i: any) => i.product_id).reduce((sum: number, it: any) =>
                                sum + allWarehouses.reduce((ws, wh) => ws + (allWarehouseStocks[wh.id]?.[it.product_id] || 0), 0), 0
                              )}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label>{appLang === 'en' ? 'Settlement Method' : 'طريقة التسوية'}</Label>
                <select className="w-full border rounded px-2 py-2" value={form.settlement_method} onChange={e => { setForm({ ...form, settlement_method: e.target.value as any }); setSelectedRefundAccountId('') }}>
                  <option value="debit_note">{appLang === 'en' ? 'Debit Note' : 'إشعار مدين'}</option>
                  <option value="cash">{appLang === 'en' ? 'Cash Refund' : 'استرداد نقدي'}</option>
                  <option value="bank_transfer">{appLang === 'en' ? 'Bank Transfer' : 'تحويل بنكي'}</option>
                </select>
              </div>
              <div>
                <Label>{appLang === 'en' ? 'Currency' : 'العملة'}</Label>
                <select className="w-full border rounded px-2 py-2" value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}>
                  {currencies.length > 0 ? (
                    currencies.map(c => <option key={c.code} value={c.code}>{c.code}</option>)
                  ) : (
                    <>
                      <option value="EGP">EGP</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                      <option value="SAR">SAR</option>
                    </>
                  )}
                </select>
              </div>
              <div className="md:col-span-2">
                <Label>{appLang === 'en' ? 'Reason' : 'السبب'}</Label>
                <Input value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder={appLang === 'en' ? 'Return reason...' : 'سبب المرتجع...'} />
              </div>
            </div>

            {/* حساب الاسترداد: يظهر فقط عند اختيار نقدي أو بنكي */}
            {(form.settlement_method === 'cash' || form.settlement_method === 'bank_transfer') && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="flex items-center gap-1">
                    {appLang === 'en' ? 'Refund Account' : 'حساب الاسترداد'}
                    <span className="text-red-500">*</span>
                  </Label>
                  <select
                    className="w-full border rounded px-2 py-2"
                    value={selectedRefundAccountId}
                    onChange={e => setSelectedRefundAccountId(e.target.value)}
                  >
                    <option value="">{appLang === 'en' ? '-- Select account --' : '-- اختر الحساب --'}</option>
                    {cashBankAccounts
                      .filter(a => form.settlement_method === 'cash' ? a.sub_type === 'cash' : a.sub_type === 'bank')
                      .map(a => (
                        <option key={a.id} value={a.id}>
                          {a.account_code ? `${a.account_code} - ` : ''}{a.account_name}
                        </option>
                      ))}
                    {/* عرض الحسابات الأخرى كاحتياطي */}
                    {cashBankAccounts.filter(a => form.settlement_method === 'cash' ? a.sub_type === 'cash' : a.sub_type === 'bank').length === 0 &&
                      cashBankAccounts.map(a => (
                        <option key={a.id} value={a.id}>
                          {a.account_code ? `${a.account_code} - ` : ''}{a.account_name}
                        </option>
                      ))}
                  </select>
                  {cashBankAccounts.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">
                      {appLang === 'en'
                        ? 'No cash/bank accounts found. Please add them in Chart of Accounts.'
                        : 'لا توجد حسابات نقدية/بنكية. يرجى إضافتها في دليل الحسابات.'}
                    </p>
                  )}
                </div>
              </div>
            )}

            {form.currency !== baseCurrency && (isPrivileged ? allocTotal : total) > 0 && (
              <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded text-sm">
                <div>{appLang === 'en' ? 'Exchange Rate' : 'سعر الصرف'}: <strong>1 {form.currency} = {exchangeRate.rate.toFixed(4)} {baseCurrency}</strong> ({exchangeRate.source})</div>
                <div>{appLang === 'en' ? 'Base Amount' : 'المبلغ الأساسي'}: <strong>{((isPrivileged ? allocTotal : total) * exchangeRate.rate).toFixed(2)} {baseCurrency}</strong></div>
              </div>
            )}

            {/* جدول البنود: للمالك/المدير يُظهر ملخصاً فقط، لغير المميزين يُظهر إدخال الكميات */}
            {isPrivileged ? (
              /* للمالك/المدير: جدول ملخص الكميات الإجمالية من التخصيصات */
              warehouseAllocations.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-600 border-b">
                        <th className="text-right p-2">{appLang === 'en' ? 'Product' : 'المنتج'}</th>
                        <th className="text-right p-2">{appLang === 'en' ? 'Available in Bill' : 'المتاح من الفاتورة'}</th>
                        {allWarehouses.length > 0 && (
                          <th className="text-right p-2 text-blue-700 dark:text-blue-300 min-w-[180px]">
                            {appLang === 'en' ? 'Stock per Warehouse' : 'المخزون في المخازن'}
                          </th>
                        )}
                        <th className="text-right p-2">{appLang === 'en' ? 'Total Return Qty' : 'إجمالي الكمية المرتجعة'}</th>
                        <th className="text-right p-2">{appLang === 'en' ? 'Price' : 'السعر'}</th>
                        <th className="text-right p-2">{appLang === 'en' ? 'Tax%' : 'الضريبة%'}</th>
                        <th className="text-right p-2">{appLang === 'en' ? 'Total' : 'الإجمالي'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {warehouseAllocations[0].items.map((it, itemIdx) => {
                        const totalQty = allocTotalQtyPerItem(itemIdx)
                        const gross = totalQty * it.unit_price
                        const net = gross - (gross * it.discount_percent / 100)
                        const tax = net * it.tax_rate / 100
                        const lineTotal = net + tax
                        const overAllocated = totalQty > it.max_quantity
                        return (
                          <tr key={itemIdx} className="border-b">
                            <td className="p-2 font-medium">{it.product_name}</td>
                            <td className="p-2 text-center">{it.max_quantity}</td>
                            {allWarehouses.length > 0 && (
                              <td className="p-2">
                                {it.product_id ? (
                                  <div className="space-y-0.5">
                                    {allWarehouses.map(wh => {
                                      const qty = allWarehouseStocks[wh.id]?.[it.product_id!] ?? 0
                                      const isBillWh = wh.id === bills.find(b => b.id === form.bill_id)?.warehouse_id
                                      const isAllocatedWh = warehouseAllocations.some(a => a.warehouseId === wh.id)
                                      return (
                                        <div key={wh.id} className={`flex items-center justify-between gap-2 px-1.5 py-0.5 rounded text-xs ${isAllocatedWh ? 'bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                                          <span className="text-gray-600 dark:text-gray-400 truncate max-w-[110px]" title={`${(wh as any).branches?.name || ''} — ${wh.name}`}>
                                            {(wh as any).branches?.name || wh.name}
                                            {isBillWh && <span className="mr-1 text-blue-500">●</span>}
                                          </span>
                                          <span className={`font-bold tabular-nums ${qty <= 0 ? 'text-gray-300 dark:text-gray-600' : 'text-green-700 dark:text-green-400'}`}>{qty}</span>
                                        </div>
                                      )
                                    })}
                                    <div className="flex items-center justify-between gap-2 px-1.5 py-0.5 border-t border-gray-200 dark:border-gray-700 mt-0.5 pt-0.5">
                                      <span className="text-xs text-gray-500 font-medium">{appLang === 'en' ? 'Total' : 'الإجمالي'}</span>
                                      <span className="text-xs font-bold text-blue-700 dark:text-blue-300 tabular-nums">{allWarehouses.reduce((s, wh) => s + (allWarehouseStocks[wh.id]?.[it.product_id!] ?? 0), 0)}</span>
                                    </div>
                                  </div>
                                ) : <span className="text-gray-400 text-xs">—</span>}
                              </td>
                            )}
                            <td className="p-2 text-center">
                              <span className={`font-bold text-lg ${overAllocated ? 'text-red-600' : totalQty > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-gray-400'}`}>
                                {totalQty}
                                {overAllocated && <span className="text-xs mr-1 text-red-500">(!</span>}
                              </span>
                            </td>
                            <td className="p-2">{it.unit_price.toFixed(2)}</td>
                            <td className="p-2">{it.tax_rate}%</td>
                            <td className="p-2 font-medium">{lineTotal.toFixed(2)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              /* للمستخدمين العاديين: جدول إدخال الكميات */
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-600 border-b">
                      <th className="text-right p-2">{appLang === 'en' ? 'Product' : 'المنتج'}</th>
                      <th className="text-right p-2">{appLang === 'en' ? 'Available in Bill' : 'المتاح من الفاتورة'}</th>
                      <th className="text-right p-2">{appLang === 'en' ? 'Return Qty' : 'كمية المرتجع'}</th>
                      <th className="text-right p-2">{appLang === 'en' ? 'Price' : 'السعر'}</th>
                      <th className="text-right p-2">{appLang === 'en' ? 'Tax%' : 'الضريبة%'}</th>
                      <th className="text-right p-2">{appLang === 'en' ? 'Total' : 'الإجمالي'}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, idx) => (
                      <tr key={idx} className="border-b">
                        <td className="p-2">
                          {it.bill_item_id ? (
                            <span className="font-medium">{it.product_name}</span>
                          ) : (
                            <select className="w-full border rounded px-2 py-1" value={it.product_id || ""} onChange={e => {
                              const prod = products.find(p => p.id === e.target.value)
                              updateItem(idx, { product_id: e.target.value || null, product_name: prod?.name || "", unit_price: prod?.cost_price || 0 })
                            }}>
                              <option value="">—</option>
                              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          )}
                        </td>
                        <td className="p-2 text-center">{it.max_quantity}</td>
                        <td className="p-2"><Input type="number" min={0} max={it.max_quantity} value={it.quantity} onChange={e => updateItem(idx, { quantity: Number(e.target.value) })} className="w-20" /></td>
                        <td className="p-2">{it.unit_price.toFixed(2)}</td>
                        <td className="p-2">{it.tax_rate}%</td>
                        <td className="p-2 font-medium">{it.line_total.toFixed(2)}</td>
                        <td className="p-2">
                          {!it.bill_item_id && <Button variant="ghost" size="sm" onClick={() => removeItem(idx)}><Trash2 className="w-4 h-4" /></Button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="border-t pt-4">
              <div className="flex flex-col items-end gap-2 text-sm">
                {isPrivileged ? (
                  <>
                    <div>{appLang === 'en' ? 'Subtotal' : 'المجموع'}: {allocSubtotal.toFixed(2)}</div>
                    <div>{appLang === 'en' ? 'Tax' : 'الضريبة'}: {allocTaxAmount.toFixed(2)}</div>
                    <div className="text-lg font-bold">{appLang === 'en' ? 'Total' : 'الإجمالي'}: {allocTotal.toFixed(2)}</div>
                  </>
                ) : (
                  <>
                    <div>{appLang === 'en' ? 'Subtotal' : 'المجموع'}: {subtotal.toFixed(2)}</div>
                    <div>{appLang === 'en' ? 'Tax' : 'الضريبة'}: {taxAmount.toFixed(2)}</div>
                    <div className="text-lg font-bold">{appLang === 'en' ? 'Total' : 'الإجمالي'}: {total.toFixed(2)}</div>
                  </>
                )}
              </div>
            </div>

            <div>
              <Label>{appLang === 'en' ? 'Notes' : 'ملاحظات'}</Label>
              <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>

            <div className="flex justify-end gap-2 items-center flex-wrap">
              {(() => {
                const currentBill = bills.find(b => b.id === form.bill_id)
                const firstAllocWh = warehouseAllocations[0]?.warehouseId || ''
                const isPendingApprovalMode = isPrivileged && !!form.bill_id && !!currentBill &&
                  !isMultiWarehouse && !!firstAllocWh && firstAllocWh !== currentBill.warehouse_id
                return (
                  <>
                    {isMultiWarehouse && (
                      <span className="text-xs text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 px-3 py-1.5 rounded-lg">
                        🏭 {warehouseAllocations.length} {appLang === 'en' ? 'warehouses — each manager approves independently' : 'مخازن — كل مسؤول يعتمد بشكل مستقل'}
                      </span>
                    )}
                    {isPendingApprovalMode && !isMultiWarehouse && (
                      <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 px-3 py-1.5 rounded-lg">
                        📋 {appLang === 'en' ? 'Will send for approval' : 'سيُرسَل للاعتماد'}
                      </span>
                    )}
                    <Button variant="outline" onClick={() => router.back()}>{appLang === 'en' ? 'Cancel' : 'إلغاء'}</Button>
                    <Button onClick={saveReturn} disabled={saving || !form.supplier_id || !form.bill_id || (isPrivileged ? allocTotal : total) === 0}>
                      {saving
                        ? (appLang === 'en' ? 'Saving...' : 'جاري الحفظ...')
                        : isMultiWarehouse
                          ? (appLang === 'en' ? 'Submit Multi-Warehouse Return' : 'إرسال المرتجع متعدد المخازن')
                          : isPendingApprovalMode
                            ? (appLang === 'en' ? 'Submit for Approval' : 'إرسال للاعتماد')
                            : (appLang === 'en' ? 'Save Return' : 'حفظ المرتجع')
                      }
                    </Button>
                  </>
                )
              })()}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

