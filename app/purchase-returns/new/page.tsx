"use client"

import { useEffect, useState, useMemo } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useSupabase } from "@/lib/supabase/hooks"
import { useRouter } from "next/navigation"
import { Trash2, Plus, Warehouse, AlertTriangle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { toastActionError, toastActionSuccess } from "@/lib/notifications"
import { getExchangeRate, getActiveCurrencies, type Currency } from "@/lib/currency-service"
import { getActiveCompanyId } from "@/lib/company"
import { canReturnBill, getBillOperationError, billRequiresJournalEntries } from "@/lib/validation"
import { validatePurchaseReturnStock, formatStockShortageMessage } from "@/lib/purchase-return-validation"
import { processPurchaseReturnFIFOReversal } from "@/lib/purchase-return-fifo-reversal"
import { notifyPurchaseReturnPendingApproval } from "@/lib/notification-helpers"

type Supplier = { id: string; name: string; phone?: string | null }
type Bill = { id: string; bill_number: string; supplier_id: string; total_amount: number; status: string; branch_id?: string | null; cost_center_id?: string | null; warehouse_id?: string | null }
type BillItem = { id: string; product_id: string | null; quantity: number; unit_price: number; tax_rate: number; discount_percent: number; line_total: number; returned_quantity?: number; products?: { name: string; cost_price: number } }
type Product = { id: string; name: string; cost_price: number; item_type?: 'product' | 'service' }
type Warehouse = { id: string; name: string; branch_id: string | null; branches?: { name: string } | null }

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

const PRIVILEGED_ROLES = ['owner', 'admin', 'general_manager']

export default function NewPurchaseReturnPage() {
  const supabase = useSupabase()
  const router = useRouter()
  const { toast } = useToast()
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')

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

      // جلب جميع المخازن للمالك/المدير العام
      if (PRIVILEGED_ROLES.includes(role.toLowerCase())) {
        const { data: warehousesData } = await supabase
          .from("warehouses")
          .select("id, name, branch_id, branches(name)")
          .eq("company_id", loadedCompanyId)
          .eq("is_active", true)
        setAllWarehouses((warehousesData || []) as Warehouse[])
      }

      // 🔐 بناء استعلام الفواتير حسب الصلاحيات
      const isPrivilegedRole = PRIVILEGED_ROLES.includes(role.toLowerCase())
      let billQuery = supabase
        .from("bills")
        .select("id, bill_number, supplier_id, total_amount, status, branch_id, cost_center_id, warehouse_id")
        .eq("company_id", loadedCompanyId)
        .in("status", ["paid", "partially_paid", "sent", "received"])

      // الأدوار العادية (محاسب/مدير فرع/موظف): ترى فواتير فرعها فقط
      if (!isPrivilegedRole && userBranchId) {
        billQuery = billQuery.eq("branch_id", userBranchId)
      }

      const [suppRes, billRes, prodRes] = await Promise.all([
        supabase.from("suppliers").select("id, name, phone").eq("company_id", loadedCompanyId),
        billQuery,
        supabase.from("products").select("id, name, cost_price").eq("company_id", loadedCompanyId)
      ])

      setSuppliers((suppRes.data || []) as Supplier[])
      setBills((billRes.data || []) as Bill[])
      setProducts((prodRes.data || []) as Product[])

      // Load currencies
      const curr = await getActiveCurrencies(supabase, loadedCompanyId)
      if (curr.length > 0) setCurrencies(curr)
      setForm(f => ({ ...f, currency: baseCurrency }))
    })()
  }, [supabase])

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

  // جلب رصيد كل منتج في جميع المخازن (للمالك/المدير العام فقط)
  useEffect(() => {
    if (!isPrivileged || !companyId || allWarehouses.length === 0 || items.length === 0) {
      setAllWarehouseStocks({})
      return
    }
    const productIds = items.filter(i => i.product_id).map(i => i.product_id as string)
    if (productIds.length === 0) return

    ; (async () => {
      const { data } = await supabase
        .from("inventory_transactions")
        .select("product_id, warehouse_id, quantity_change")
        .eq("company_id", companyId)
        .in("product_id", productIds)
        .eq("is_deleted", false)

      const stocksMap: Record<string, Record<string, number>> = {}
      for (const wh of allWarehouses) {
        stocksMap[wh.id] = {}
        for (const pid of productIds) stocksMap[wh.id][pid] = 0
      }
      for (const row of (data || [])) {
        if (stocksMap[row.warehouse_id]) {
          stocksMap[row.warehouse_id][row.product_id] = (stocksMap[row.warehouse_id][row.product_id] || 0) + Number(row.quantity_change)
        }
      }
      setAllWarehouseStocks(stocksMap)
    })()
  }, [isPrivileged, companyId, allWarehouses, items])

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

  // Load bill items when bill is selected + تهيئة المخزن الافتراضي
  useEffect(() => {
    if (!form.bill_id) {
      setBillItems([])
      setItems([])
      setSelectedWarehouseId('')
      setWarehouseStocks({})
      return
    }
    ; (async () => {
      const { data } = await supabase
        .from("bill_items")
        .select("id, product_id, quantity, unit_price, tax_rate, discount_percent, line_total, returned_quantity, products(name, cost_price)")
        .eq("bill_id", form.bill_id)

      const billItemsData = (data || []) as any[]
      setBillItems(billItemsData)

      // Auto-populate return items
      setItems(billItemsData.map(item => ({
        bill_item_id: item.id,
        product_id: item.product_id,
        product_name: item.products?.name || "—",
        quantity: 0,
        max_quantity: Number(item.quantity) - Number(item.returned_quantity || 0),
        unit_price: Number(item.unit_price),
        tax_rate: Number(item.tax_rate || 0),
        discount_percent: Number(item.discount_percent || 0),
        line_total: 0
      })))

      // للمالك/المدير: تعيين مخزن الفاتورة الافتراضي
      const selectedBill = bills.find(b => b.id === form.bill_id)
      if (selectedBill?.warehouse_id) {
        setSelectedWarehouseId(selectedBill.warehouse_id)
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
      if (items.filter(i => i.quantity > 0).length === 0) {
        toastActionError(toast, "الحفظ", "المرتجع", appLang === 'en' ? "Please enter return quantities" : "يرجى إدخال كميات المرتجع")
        return
      }

      // ===================== التحقق من الفاتورة =====================
      let billStatus: string | null = null
      let billPaidAmount = 0
      let billTotalAmount = 0
      let billPreviousReturnedAmount = 0

      if (form.bill_id) {
        const { data: billCheck } = await supabase
          .from("bills")
          .select("status, paid_amount, total_amount, returned_amount")
          .eq("id", form.bill_id)
          .single()

        billStatus = billCheck?.status || null
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

      const validItems = items.filter(i => i.quantity > 0)
      const needsJournalEntry = billStatus === 'paid' || billStatus === 'partially_paid'
      const returnMethod = form.settlement_method

      // ===================== الحوكمة (الفرع / المخزن / مركز التكلفة) =====================
      const selectedBill = bills.find(b => b.id === form.bill_id)
      let billBranchId = selectedBill?.branch_id || null
      let billCostCenterId = selectedBill?.cost_center_id || null
      let billWarehouseId = selectedBill?.warehouse_id || null

      // للمالك/المدير: استخدام المخزن المختار (قد يختلف عن مخزن الفاتورة)
      const effectiveWarehouseId = (isPrivileged && selectedWarehouseId) ? selectedWarehouseId : billWarehouseId
      const selectedWarehouse = isPrivileged ? allWarehouses.find(w => w.id === effectiveWarehouseId) : null

      // إذا اختار المالك/المدير مخزن مختلف، نجلب بيانات فرعه
      if (isPrivileged && selectedWarehouseId && selectedWarehouseId !== billWarehouseId && selectedWarehouse?.branch_id) {
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
      // إذا اختار المالك/المدير مخزن مختلف عن مخزن الفاتورة → pending_approval
      // شرط ضروري: يجب أن تكون الفاتورة محددة لتفعيل pending_approval
      const isDifferentWarehouse = isPrivileged && !!form.bill_id && !!selectedWarehouseId && !!selectedBill && selectedWarehouseId !== (selectedBill.warehouse_id || '')
      const workflowStatus = isDifferentWarehouse ? 'pending_approval' : 'confirmed'

      // ===================== التحقق من المخزون (UX pre-check) =====================
      // للمرتجعات المعلقة: التحقق من المخزن المختار
      const stockCheckWarehouseId = effectiveWarehouseId || billWarehouseId
      if (stockCheckWarehouseId && workflowStatus === 'confirmed') {
        const stockValidation = await validatePurchaseReturnStock(supabase, validItems, stockCheckWarehouseId, companyId)
        if (!stockValidation.success) {
          toastActionError(toast, "الحفظ", "المرتجع", formatStockShortageMessage(stockValidation.shortages, appLang))
          return
        }
      }

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
        const isPaidBill = billStatus === 'paid' || billStatus === 'partially_paid'

        if (isPaidBill) {
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
            status: 'completed',
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
            original_subtotal: subtotal,
            original_tax_amount: taxAmount,
            original_total_amount: total,
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
            status: 'posted',
            validation_status: 'valid',
          } : null,
          p_journal_lines: (needsJournalEntry && journalLines.length > 0) ? journalLines : null,
          p_vendor_credit: vendorCreditData,
          p_vendor_credit_items: vendorCreditItemsData,
          p_bill_update: workflowStatus === 'pending_approval' ? null : billUpdateData,
          p_workflow_status: workflowStatus,
          p_created_by: currentUserId || null,
        }
      )

      if (rpcError) {
        throw new Error(`فشل حفظ المرتجع: ${rpcError.message}`)
      }

      const purchaseReturnId = (rpcResult as any)?.purchase_return_id
      console.log(`✅ تم حفظ المرتجع بنجاح (Atomic): ${purchaseReturnId}, workflow: ${workflowStatus}`)

      // ===================== 🔔 إشعارات (pending_approval) =====================
      if (workflowStatus === 'pending_approval' && purchaseReturnId) {
        try {
          const selectedSupplier = suppliers.find(s => s.id === form.supplier_id)
          await notifyPurchaseReturnPendingApproval({
            companyId,
            purchaseReturnId,
            returnNumber: form.return_number,
            supplierName: selectedSupplier?.name || form.supplier_id,
            totalAmount: finalBaseTotal,
            currency: baseCurrency,
            warehouseId: effectiveWarehouseId || billWarehouseId || '',
            branchId: billBranchId || undefined,
            createdBy: currentUserId || '',
            createdByName: currentUserName,
            appLang,
          })
        } catch (notifyErr) {
          console.warn('⚠️ Notification failed (non-critical):', notifyErr)
        }

        toast({
          title: appLang === 'en' ? '📋 Return Created - Pending Approval' : '📋 تم إنشاء المرتجع - بانتظار الاعتماد',
          description: appLang === 'en'
            ? 'Warehouse manager has been notified to confirm delivery. Stock will be deducted after approval.'
            : 'تم إشعار مسؤول المخزن لتأكيد التسليم. سيتم خصم المخزون بعد الاعتماد.',
        })
        router.push("/purchase-returns")
        return
      }

      // ===================== 🔄 FIFO Reversal (post-commit، best-effort) =====================
      // يُنفَّذ بعد commit الـ Transaction الأساسي - الفشل يُظهر تحذيراً فقط
      if (purchaseReturnId && form.bill_id && billBranchId && billWarehouseId && billCostCenterId) {
        const returnItemsForFIFO = validItems
          .filter(item => item.product_id && item.quantity > 0)
          .map(item => ({
            productId: item.product_id!,
            quantity: item.quantity,
            billItemId: item.bill_item_id || undefined,
          }))

        if (returnItemsForFIFO.length > 0) {
          try {
            const fifoResult = await processPurchaseReturnFIFOReversal(supabase, {
              billId: form.bill_id,
              purchaseReturnId,
              returnItems: returnItemsForFIFO,
              companyId,
              branchId: billBranchId,
              costCenterId: billCostCenterId,
              warehouseId: billWarehouseId,
            })

            if (!fifoResult.success) {
              console.warn("⚠️ FIFO reversal failed (non-critical):", fifoResult.error)
              toast({
                title: appLang === 'en' ? "⚠️ Warning" : "⚠️ تنبيه",
                description: appLang === 'en'
                  ? "Return saved successfully. FIFO cost adjustment failed — please contact your accountant."
                  : "تم حفظ المرتجع بنجاح. تسوية تكلفة FIFO لم تكتمل — يرجى مراجعة المحاسب.",
              })
            } else {
              console.log(`✅ FIFO reversed: ${fifoResult.reversedLots} lots, cost: ${fifoResult.totalReversedCost}`)
            }
          } catch (fifoErr) {
            console.warn("⚠️ FIFO reversal exception (non-critical):", fifoErr)
          }
        }
      }

      // ===================== Legacy: Supplier Debit Credit (للفواتير غير المدفوعة) =====================
      if (form.settlement_method === "debit_note" && total > 0 && form.bill_id && !needsJournalEntry && purchaseReturnId) {
        const previousReturns = billPreviousReturnedAmount
        const remainingPayable = billTotalAmount - billPaidAmount - previousReturns
        const excessReturn = finalBaseTotal - remainingPayable

        if (excessReturn > 0) {
          await supabase.from("supplier_debit_credits").insert({
            company_id: companyId,
            supplier_id: form.supplier_id,
            purchase_return_id: purchaseReturnId,
            debit_number: "SD-" + form.return_number,
            debit_date: form.return_date,
            amount: excessReturn,
            applied_amount: 0,
            status: "active",
            notes: `إشعار مدين للمرتجع ${form.return_number} (المرتجع ${total} > المتبقي ${remainingPayable})`,
          })
          console.log(`✅ Supplier Debit Credit created: ${excessReturn}`)
        }
      }

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
      <Sidebar />
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">{appLang === 'en' ? 'New Purchase Return' : 'مرتجع مشتريات جديد'}</CardTitle>
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

            {/* 🏪 اختيار المخزن (للمالك/المدير العام فقط) */}
            {isPrivileged && allWarehouses.length > 0 && form.bill_id && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Warehouse className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  <h3 className="font-semibold text-amber-800 dark:text-amber-200">
                    {appLang === 'en' ? 'Return Warehouse Selection' : 'اختيار مخزن المرتجع'}
                  </h3>
                  <span className="text-xs bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full">
                    {appLang === 'en' ? 'Owner / Manager Only' : 'المالك / المدير العام فقط'}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-amber-700 dark:text-amber-300">
                      {appLang === 'en' ? 'Select Warehouse' : 'اختر المخزن'}
                    </Label>
                    <select
                      className="w-full border border-amber-300 rounded px-2 py-2 bg-white dark:bg-slate-800"
                      value={selectedWarehouseId}
                      onChange={e => setSelectedWarehouseId(e.target.value)}
                    >
                      <option value="">{appLang === 'en' ? 'Select...' : 'اختر المخزن...'}</option>
                      {allWarehouses.map(w => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                          {(w as any).branches?.name ? ` — ${(w as any).branches.name}` : ''}
                          {w.id === (bills.find(b => b.id === form.bill_id)?.warehouse_id) ? (appLang === 'en' ? ' (Bill Warehouse)' : ' (مخزن الفاتورة)') : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end">
                    {selectedWarehouseId && selectedWarehouseId !== (bills.find(b => b.id === form.bill_id)?.warehouse_id) ? (
                      <div className="flex items-start gap-2 p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg w-full">
                        <AlertTriangle className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                        <div className="text-xs text-orange-700 dark:text-orange-300">
                          <p className="font-medium">
                            {appLang === 'en' ? 'Approval Workflow Active' : 'سير عمل الاعتماد مفعّل'}
                          </p>
                          <p className="mt-0.5">
                            {appLang === 'en'
                              ? 'Stock will be deducted after warehouse manager confirms delivery.'
                              : 'سيتم خصم المخزون بعد اعتماد مسؤول المخزن.'}
                          </p>
                        </div>
                      </div>
                    ) : selectedWarehouseId ? (
                      <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg w-full text-xs text-green-700 dark:text-green-300">
                        ✅ {appLang === 'en' ? 'Same as bill warehouse — immediate processing.' : 'نفس مخزن الفاتورة — معالجة فورية.'}
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* 📊 جدول توزيع المخزون على الفروع */}
                {items.filter(i => i.product_id).length > 0 && allWarehouses.length > 0 && (
                  <div className="mt-3 border border-amber-200 dark:border-amber-700 rounded-lg overflow-hidden">
                    <div className="bg-amber-100 dark:bg-amber-900/40 px-3 py-2 flex items-center gap-2">
                      <span className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                        📊 {appLang === 'en' ? 'Stock Distribution Across Branches' : 'توزيع المخزون على الفروع'}
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-700">
                            <th className="text-right p-2 font-medium text-amber-800 dark:text-amber-300 whitespace-nowrap min-w-[140px]">
                              {appLang === 'en' ? 'Branch / Warehouse' : 'الفرع / المخزن'}
                            </th>
                            {items.filter(i => i.product_id).map((it, idx) => (
                              <th key={idx} className="text-center p-2 font-medium text-amber-800 dark:text-amber-300 whitespace-nowrap">
                                {it.product_name}
                              </th>
                            ))}
                            <th className="text-center p-2 font-medium text-amber-800 dark:text-amber-300 whitespace-nowrap">
                              {appLang === 'en' ? 'Total' : 'الإجمالي'}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {allWarehouses.map(wh => {
                            const whStocks = allWarehouseStocks[wh.id] || {}
                            const productsInItems = items.filter(i => i.product_id)
                            const rowTotal = productsInItems.reduce((sum, it) => sum + (whStocks[it.product_id!] || 0), 0)
                            const isBillWarehouse = wh.id === bills.find(b => b.id === form.bill_id)?.warehouse_id
                            const isSelectedWarehouse = wh.id === selectedWarehouseId
                            return (
                              <tr
                                key={wh.id}
                                className={`border-b border-amber-100 dark:border-amber-800 ${
                                  isSelectedWarehouse
                                    ? 'bg-amber-100 dark:bg-amber-900/40'
                                    : 'hover:bg-amber-50/50 dark:hover:bg-amber-900/10'
                                }`}
                              >
                                <td className="p-2 whitespace-nowrap">
                                  <div className="flex items-center gap-1">
                                    {isSelectedWarehouse && <span className="text-amber-600">▶</span>}
                                    <div>
                                      <div className="font-medium text-gray-800 dark:text-gray-200">
                                        {(wh as any).branches?.name || (appLang === 'en' ? 'No Branch' : 'بدون فرع')}
                                      </div>
                                      <div className="text-gray-500 dark:text-gray-400 text-[10px]">
                                        {wh.name}
                                        {isBillWarehouse && (
                                          <span className="mr-1 text-blue-600 dark:text-blue-400">
                                            ({appLang === 'en' ? 'Bill' : 'الفاتورة'})
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                {productsInItems.map((it, idx) => {
                                  const qty = whStocks[it.product_id!] || 0
                                  const isShortage = it.quantity > 0 && qty < it.quantity
                                  return (
                                    <td key={idx} className="p-2 text-center">
                                      <span className={`font-semibold ${qty <= 0 ? 'text-gray-400' : isShortage ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}>
                                        {qty}
                                      </span>
                                    </td>
                                  )
                                })}
                                <td className="p-2 text-center font-bold text-amber-800 dark:text-amber-300">
                                  {rowTotal}
                                </td>
                              </tr>
                            )
                          })}
                          {/* صف مجموع الشركة */}
                          <tr className="bg-amber-100 dark:bg-amber-900/30 font-bold">
                            <td className="p-2 text-amber-800 dark:text-amber-200">
                              🏢 {appLang === 'en' ? 'Company Total' : 'إجمالي الشركة'}
                            </td>
                            {items.filter(i => i.product_id).map((it, idx) => {
                              const companyTotal = allWarehouses.reduce((sum, wh) => sum + (allWarehouseStocks[wh.id]?.[it.product_id!] || 0), 0)
                              return (
                                <td key={idx} className="p-2 text-center text-amber-900 dark:text-amber-100">
                                  {companyTotal}
                                </td>
                              )
                            })}
                            <td className="p-2 text-center text-amber-900 dark:text-amber-100">
                              {items.filter(i => i.product_id).reduce((sum, it) =>
                                sum + allWarehouses.reduce((ws, wh) => ws + (allWarehouseStocks[wh.id]?.[it.product_id!] || 0), 0), 0
                              )}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label>{appLang === 'en' ? 'Settlement Method' : 'طريقة التسوية'}</Label>
                <select className="w-full border rounded px-2 py-2" value={form.settlement_method} onChange={e => setForm({ ...form, settlement_method: e.target.value as any })}>
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

            {form.currency !== baseCurrency && total > 0 && (
              <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded text-sm">
                <div>{appLang === 'en' ? 'Exchange Rate' : 'سعر الصرف'}: <strong>1 {form.currency} = {exchangeRate.rate.toFixed(4)} {baseCurrency}</strong> ({exchangeRate.source})</div>
                <div>{appLang === 'en' ? 'Base Amount' : 'المبلغ الأساسي'}: <strong>{(total * exchangeRate.rate).toFixed(2)} {baseCurrency}</strong></div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-600 border-b">
                    <th className="text-right p-2">{appLang === 'en' ? 'Product' : 'المنتج'}</th>
                    <th className="text-right p-2">{appLang === 'en' ? 'Available in Bill' : 'المتاح من الفاتورة'}</th>
                    {isPrivileged && selectedWarehouseId && (
                      <th className="text-right p-2 text-amber-600 dark:text-amber-400">
                        {appLang === 'en' ? 'Stock in Warehouse' : 'المخزون الفعلي'}
                      </th>
                    )}
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
                      {isPrivileged && selectedWarehouseId && (
                        <td className="p-2 text-center">
                          {it.product_id ? (
                            <span className={`font-medium ${(warehouseStocks[it.product_id] ?? 0) < it.quantity ? 'text-red-600' : 'text-amber-700 dark:text-amber-300'}`}>
                              {warehouseStocks[it.product_id] ?? '—'}
                            </span>
                          ) : <span className="text-gray-400">—</span>}
                        </td>
                      )}
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
              {false && (
                <div className="mt-3"><Button variant="outline" onClick={addManualItem}><Plus className="w-4 h-4 mr-2" /> {appLang === 'en' ? 'Add Item' : 'إضافة بند'}</Button></div>
              )}
            </div>

            <div className="border-t pt-4">
              <div className="flex flex-col items-end gap-2 text-sm">
                <div>{appLang === 'en' ? 'Subtotal' : 'المجموع'}: {subtotal.toFixed(2)}</div>
                <div>{appLang === 'en' ? 'Tax' : 'الضريبة'}: {taxAmount.toFixed(2)}</div>
                <div className="text-lg font-bold">{appLang === 'en' ? 'Total' : 'الإجمالي'}: {total.toFixed(2)}</div>
              </div>
            </div>

            <div>
              <Label>{appLang === 'en' ? 'Notes' : 'ملاحظات'}</Label>
              <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>

            <div className="flex justify-end gap-2 items-center">
              {(() => {
                const currentBill = bills.find(b => b.id === form.bill_id)
                const isPendingApprovalMode = isPrivileged && !!form.bill_id && !!currentBill && !!selectedWarehouseId && selectedWarehouseId !== currentBill.warehouse_id
                return (
                  <>
                    {isPendingApprovalMode && (
                      <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 px-3 py-1.5 rounded-lg">
                        📋 {appLang === 'en' ? 'Will send for approval' : 'سيُرسَل للاعتماد'}
                      </span>
                    )}
                    <Button variant="outline" onClick={() => router.back()}>{appLang === 'en' ? 'Cancel' : 'إلغاء'}</Button>
                    <Button onClick={saveReturn} disabled={saving || !form.supplier_id || !form.bill_id}>
                      {saving
                        ? (appLang === 'en' ? 'Saving...' : 'جاري الحفظ...')
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

