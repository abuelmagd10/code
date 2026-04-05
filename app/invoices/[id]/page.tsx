// =====================================================
// 📌 SALES INVOICE ACCOUNTING PATTERN – MANDATORY SPECIFICATION
// =====================================================
// 📌 النمط المحاسبي الصارم: Cash Basis (أساس النقدية)
// 📌 المرجع الأعلى: docs/ACCOUNTING_PATTERN.md
//
// 1️⃣ Draft:    ❌ لا مخزون ❌ لا قيود
// 2️⃣ Sent:     ✅ خصم مخزون (sale) فقط
//              ❌ لا قيود محاسبية (القيود تُنشأ عند الدفع فقط)
// 3️⃣ Paid:     ✅ قيد AR/Revenue (عند أول دفعة) + قيد السداد (Cash/AR)
//              ❌ لا حركات مخزون جديدة
// 4️⃣ مرتجع Sent:    ✅ استرجاع مخزون (sale_return)
//                   ✅ تحديث بيانات الفاتورة (الكميات، الصافي، الإجمالي)
//                   ❌ لا قيود محاسبية (لأنه لا يوجد قيود أصلاً)
//                   ❌ لا Customer Credit
// 5️⃣ مرتجع Paid:    ✅ استرجاع مخزون (sale_return)
//                   ✅ قيد sales_return (عكس AR/Revenue)
//                   ✅ Customer Credit إذا المدفوع > الصافي
// 6️⃣ عكس من Sent للمسودة: ✅ عكس مخزون (sale_reversal)
//                        ❌ لا قيود لحذفها (لأنه لا يوجد قيود عند Sent)
//
// 📌 أي كود يخالف هذا النمط يُعد خطأ جسيم ويجب تعديله فورًا

"use client"

import { useState, useEffect, useRef, useMemo, useTransition, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NumericInput } from "@/components/ui/numeric-input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { useSupabase } from "@/lib/supabase/hooks"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { DollarSign, CreditCard, Banknote, FileText, CheckCircle, AlertCircle, RotateCcw, Package, Truck, MapPin, Phone, User, ExternalLink } from "lucide-react"
import { getActiveCompanyId } from "@/lib/company"
import { canAction } from "@/lib/authz"
import { useToast } from "@/hooks/use-toast"
import { toastActionError, toastActionSuccess } from "@/lib/notifications"
import { checkInventoryAvailability, getShortageToastContent } from "@/lib/inventory-check"
import { ERPPageHeader } from "@/components/erp-page-header"
import {
  transferToThirdParty,
  clearThirdPartyInventory,
  validateShippingProvider
} from "@/lib/third-party-inventory"
import { consumeFIFOLotsWithCOGS } from "@/lib/fifo-engine"
import { useRealtimeTable } from "@/hooks/use-realtime-table"
import { checkDuplicateJournalEntry } from "@/lib/journal-entry-governance"
import { CustomerRefundDialog } from "@/components/customers/customer-refund-dialog"
import { getActiveCurrencies, type Currency, DEFAULT_CURRENCIES } from "@/lib/currency-service"
import { useAccess } from "@/lib/access-context"

interface Invoice {
  id: string
  company_id: string
  invoice_number: string
  invoice_date: string
  due_date: string
  subtotal: number
  tax_amount: number
  total_amount: number
  paid_amount: number
  status: string
  customer_id?: string
  customers?: { name: string; email: string; phone?: string; address: string; city?: string; country?: string; tax_id?: string }
  companies?: { name: string; email: string; phone: string; address: string; city?: string; country?: string }
  // Advanced fields
  discount_type?: "percent" | "amount"
  discount_value?: number
  discount_position?: "before_tax" | "after_tax"
  tax_inclusive?: boolean
  shipping?: number
  shipping_tax_rate?: number
  shipping_provider_id?: string
  adjustment?: number
  // Multi-currency fields
  currency_code?: string
  exchange_rate?: number
  base_currency_total?: number
  // Branch, Cost Center, Warehouse
  branch_id?: string | null
  cost_center_id?: string | null
  warehouse_id?: string | null
  // Linked Sales Order
  sales_order_id?: string | null
  // Returns
  returned_amount?: number
  return_status?: string | null
  // 📸 Customer Snapshot: نسخة من بيانات العميل وقت إنشاء/إرسال الفاتورة
  customer_name_snapshot?: string | null
  customer_email_snapshot?: string | null
  customer_phone_snapshot?: string | null
  customer_address_snapshot?: string | null
  customer_city_snapshot?: string | null
  customer_country_snapshot?: string | null
  customer_tax_id_snapshot?: string | null
  customer_governorate_snapshot?: string | null
  customer_detailed_address_snapshot?: string | null
  // Warehouse Approval Status
  warehouse_status?: string
}

interface InvoiceItem {
  id: string
  product_id?: string | null
  quantity: number
  returned_quantity?: number
  unit_price: number
  tax_rate: number
  discount_percent?: number
  line_total: number
  products?: { name: string; sku: string; cost_price?: number }
}

export default function InvoiceDetailPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [appCurrency, setAppCurrency] = useState<string>('EGP')
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [items, setItems] = useState<InvoiceItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showPayment, setShowPayment] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState<number>(0)
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [paymentMethod, setPaymentMethod] = useState<string>("cash")
  const [paymentRef, setPaymentRef] = useState<string>("")
  const [paymentAccountId, setPaymentAccountId] = useState<string>("")
  const [cashBankAccounts, setCashBankAccounts] = useState<any[]>([])
  const [savingPayment, setSavingPayment] = useState(false)
  // ❌ تم إزالة showCredit و creditDate - استخدم المرتجع الجزئي/الكامل بدلاً من مذكرة الدائن الكاملة

  // Partial return state
  const [showPartialReturn, setShowPartialReturn] = useState(false)
  const [returnItems, setReturnItems] = useState<{ item_id: string; product_id: string | null; product_name: string; max_qty: number; return_qty: number; unit_price: number; tax_rate: number; discount_percent: number }[]>([])
  const [returnMethod, setReturnMethod] = useState<'cash' | 'credit_note' | 'bank_transfer'>('credit_note')
  const [returnAccountId, setReturnAccountId] = useState<string>('')
  const [returnNotes, setReturnNotes] = useState<string>('')
  const [returnProcessing, setReturnProcessing] = useState(false)
  const [changingStatus, setChangingStatus] = useState(false)
  const [isPending, startTransition] = useTransition()

  const [nextInvoiceId, setNextInvoiceId] = useState<string | null>(null)
  const [prevInvoiceId, setPrevInvoiceId] = useState<string | null>(null)

  // Shipping state
  const [showShipmentDialog, setShowShipmentDialog] = useState(false)
  const [shippingProviders, setShippingProviders] = useState<any[]>([])
  const [selectedProviderId, setSelectedProviderId] = useState<string>("")
  const [shipmentData, setShipmentData] = useState({
    recipient_name: "",
    recipient_phone: "",
    recipient_address: "",
    recipient_city: "",
    weight: "",
    notes: ""
  })
  const [creatingShipment, setCreatingShipment] = useState(false)
  const [existingShipment, setExistingShipment] = useState<any>(null)
  const [permShipmentWrite, setPermShipmentWrite] = useState(false)
  const printAreaRef = useRef<HTMLDivElement | null>(null)
  const invoiceContentRef = useRef<HTMLDivElement | null>(null)
  const params = useParams()
  const router = useRouter()
  const invoiceId = params.id as string
  const [permRead, setPermRead] = useState<boolean | null>(null) // null = loading, false = no access, true = has access
  const [permUpdate, setPermUpdate] = useState<boolean>(false)
  const [permDelete, setPermDelete] = useState<boolean>(false)
  const [permPayWrite, setPermPayWrite] = useState<boolean>(false)
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string>("")

  // Payments and Returns history
  const [invoicePayments, setInvoicePayments] = useState<any[]>([])
  const [invoiceReturns, setInvoiceReturns] = useState<any[]>([])
  const [permPayView, setPermPayView] = useState<boolean>(false)

  // Branch and Cost Center
  const [branchName, setBranchName] = useState<string | null>(null)
  const [costCenterName, setCostCenterName] = useState<string | null>(null)

  // Linked Sales Order
  const [linkedSalesOrder, setLinkedSalesOrder] = useState<{ id: string; so_number: string } | null>(null)

  // 🔐 صرف رصيد العميل الدائن من الفاتورة
  // 💰 الرصيد الفعلي من جدول customer_credits (المصدر الموثوق)
  const [customerCreditFromDB, setCustomerCreditFromDB] = useState(0)
  // 💸 إجمالي الرصيد الدائن الذي صُرف فعلاً للعميل (used_amount) - مرجع توضيحي
  const [customerCreditDisbursed, setCustomerCreditDisbursed] = useState(0)
  const [showCustomerRefund, setShowCustomerRefund] = useState(false)
  const [refundAmount, setRefundAmount] = useState(0)
  const [refundCurrency, setRefundCurrency] = useState('EGP')
  const [refundDate, setRefundDate] = useState(new Date().toISOString().slice(0, 10))
  const [refundMethod, setRefundMethod] = useState('cash')
  const [refundAccountId, setRefundAccountId] = useState('')
  const [refundNotes, setRefundNotes] = useState('')
  const [refundExRate, setRefundExRate] = useState<{ rate: number; rateId: string | null; source: string }>({ rate: 1, rateId: null, source: 'same_currency' })
  const [refundAccounts, setRefundAccounts] = useState<{ id: string; account_code: string; account_name: string; account_type: string }[]>([])
  const [refundCurrencies, setRefundCurrencies] = useState<Currency[]>([])
  const [allBranches, setAllBranches] = useState<{ id: string; name: string; defaultCostCenterId?: string | null }[]>([])
  const [allCostCenters, setAllCostCenters] = useState<{ id: string; name: string; code?: string }[]>([])
  const { profile: accessProfile } = useAccess()
  const currentUserRole = accessProfile?.role || ''
  const userBranchId = accessProfile?.branch_id || null
  const userCostCenterId = accessProfile?.cost_center_id || null
  const PRIVILEGED_ROLES = ['owner', 'admin', 'general_manager']
  const isPrivilegedUser = PRIVILEGED_ROLES.includes(currentUserRole)
  // 🔐 الأدوار التي يمكنها رؤية وتنفيذ زر صرف رصيد العميل
  const CREDIT_REFUND_ROLES = ['owner', 'admin', 'general_manager', 'accountant', 'manager']
  const canSeeCreditRefundButton = CREDIT_REFUND_ROLES.includes(currentUserRole) || permPayWrite

  // 💳 رصيد العميل الدائن من customer_credit_ledger (المصدر الجديد)
  const [ledgerCreditBalance, setLedgerCreditBalance] = useState(0)
  const [showApplyCreditDialog, setShowApplyCreditDialog] = useState(false)
  const [applyingCredit, setApplyingCredit] = useState(false)
  const [creditApplyAmount, setCreditApplyAmount] = useState('')


  // Currency symbols map
  const currencySymbols: Record<string, string> = {
    EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ',
    KWD: 'د.ك', QAR: '﷼', BHD: 'د.ب', OMR: '﷼', JOD: 'د.أ', LBP: 'ل.ل'
  }
  const currencySymbol = currencySymbols[appCurrency] || appCurrency

  // Listen for language and currency changes
  useEffect(() => {
    const langHandler = () => {
      try { setAppLang(localStorage.getItem('app_language') === 'en' ? 'en' : 'ar') } catch { }
    }
    const currHandler = () => {
      try { setAppCurrency(localStorage.getItem('app_currency') || 'EGP') } catch { }
    }
    langHandler(); currHandler()
    window.addEventListener('app_language_changed', langHandler)
    window.addEventListener('app_currency_changed', currHandler)
    return () => {
      window.removeEventListener('app_language_changed', langHandler)
      window.removeEventListener('app_currency_changed', currHandler)
    }
  }, [])


  useEffect(() => {
    loadInvoice()
  }, [])

  useEffect(() => {
    (async () => {
      let readCheckCompleted = false
      try {
        // التحقق من صلاحية القراءة أولاً
        const readOk = await canAction(supabase, "invoices", "read")
        setPermRead(!!readOk)
        readCheckCompleted = true

        if (!readOk) return // إذا لم يكن للمستخدم صلاحية القراءة، لا داعي للتحقق من الباقي

        const ok = await canAction(supabase, "invoices", "update")
        setPermUpdate(!!ok)
        const delOk = await canAction(supabase, "invoices", "delete")
        setPermDelete(!!delOk)
        const payWrite = await canAction(supabase, "payments", "write")
        setPermPayWrite(!!payWrite)
        const payView = await canAction(supabase, "payments", "read")
        setPermPayView(!!payView)
        const shipWrite = await canAction(supabase, "shipments", "write")
        setPermShipmentWrite(!!shipWrite)
      } catch {
        // فقط إذا فشل التحقق من صلاحية القراءة نفسها، نعتبر أن المستخدم غير مصرح له
        // أما إذا نجحت القراءة وفشلت صلاحيات أخرى، فلا نغير صلاحية القراءة
        if (!readCheckCompleted) {
          setPermRead(false)
        }
      }
    })()
  }, [supabase])

  useEffect(() => {
    ; (async () => {
      if (!showPayment) return
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        // استخدام getActiveCompanyId لدعم المستخدمين المدعوين
        const { getActiveCompanyId } = await import("@/lib/company")
        const paymentCompanyId = await getActiveCompanyId(supabase)
        if (!paymentCompanyId) return

        const { data: accounts } = await supabase
          .from("chart_of_accounts")
          .select("id, account_code, account_name, account_type, sub_type, branch_id")
          .eq("company_id", paymentCompanyId)
        const list = (accounts || []).filter((a: any) => {
          const st = String(a.sub_type || "").toLowerCase()
          const nm = String(a.account_name || "")
          const nmLower = nm.toLowerCase()
          const isCashOrBankSubtype = st === "cash" || st === "bank"
          const nameSuggestsCashOrBank = nmLower.includes("bank") || nmLower.includes("cash") || /بنك|بنكي|مصرف|خزينة|نقد/.test(nm)
          const isCashBank = isCashOrBankSubtype || nameSuggestsCashOrBank
          
          if (!isCashBank) return false
          if (isPrivilegedUser) return true
          return a.branch_id === userBranchId
        })
        setCashBankAccounts(list)
        // اختَر افتراضياً أول حساب بنكي إن وُجِد
        if (!paymentAccountId && list && list.length > 0) {
          const preferred = list.find((a: any) => String(a.sub_type || '').toLowerCase() === 'bank' || /بنك|بنكي|مصرف/.test(String(a.account_name || '')))
          setPaymentAccountId((preferred || list[0]).id)
        }
      } catch (e) {
        /* ignore */
      }
    })()
  }, [showPayment])

  // 🔐 تحميل بيانات صرف رصيد العميل الدائن
  useEffect(() => {
    ; (async () => {
      if (!showCustomerRefund || !invoice?.company_id) return
      try {
        // تحميل الحسابات النقدية/البنكية + حسابات رصيد العملاء الدائن
        // (حسابات customer_credit مطلوبة داخل الحوار لإنشاء قيد محاسبي متوازن)
        const { data: accounts } = await supabase
          .from("chart_of_accounts")
          .select("id, account_code, account_name, account_type, sub_type, branch_id")
          .eq("company_id", invoice.company_id)
        const list = (accounts || []).filter((a: any) => {
          const st = String(a.sub_type || "").toLowerCase()
          const nm = String(a.account_name || "")
          const nmLower = nm.toLowerCase()
          const isCashOrBankSubtype = st === "cash" || st === "bank"
          const nameSuggestsCashOrBank = nmLower.includes("bank") || nmLower.includes("cash") || /بنك|بنكي|مصرف|خزينة|نقد/.test(nm)
          const isCustomerCreditAccount = st === "customer_credit" || st === "customer_advance"
          const isMatch = isCashOrBankSubtype || nameSuggestsCashOrBank || isCustomerCreditAccount
          
          if (!isMatch) return false
          if (isPrivilegedUser) return true
          return a.branch_id === userBranchId
        })
        setRefundAccounts(list)
        if (!refundAccountId && list.length > 0) {
          const cashBankList = list.filter((a: any) => {
            const st = String(a.sub_type || '').toLowerCase()
            return st === 'cash' || st === 'bank' || /صندوق|خزينة|نقد|cash|bank/i.test(String(a.account_name || ''))
          })
          const sourceList = cashBankList.length > 0 ? cashBankList : list
          const preferred = sourceList.find((a: any) => String(a.sub_type || '').toLowerCase() === 'cash' || /صندوق|خزينة|نقد|cash/i.test(String(a.account_name || '')))
          setRefundAccountId((preferred || sourceList[0]).id)
        }

        // تحميل العملات
        const currencies = await getActiveCurrencies(supabase, invoice.company_id)
        setRefundCurrencies(currencies.length > 0 ? currencies : DEFAULT_CURRENCIES.map(c => ({
          ...c,
          id: c.code,
          symbol: c.code,
          decimals: 2,
          is_active: true,
          is_base: c.code === appCurrency
        })))
        setRefundCurrency(appCurrency)

        // تحميل الفروع ومراكز التكلفة (للأدوار المميزة)
        if (isPrivilegedUser) {
          const { data: branchesData } = await supabase
            .from("branches")
            .select("id, branch_name, default_cost_center_id")
            .eq("company_id", invoice.company_id)
            .eq("is_active", true)
            .order("branch_name")
          setAllBranches((branchesData || []).map((b: any) => ({
            id: b.id,
            name: b.branch_name || '',
            defaultCostCenterId: b.default_cost_center_id
          })))

          const { data: costCentersData } = await supabase
            .from("cost_centers")
            .select("id, cost_center_name, cost_center_code")
            .eq("company_id", invoice.company_id)
            .eq("is_active", true)
            .order("cost_center_name")
          setAllCostCenters((costCentersData || []).map((cc: any) => ({
            id: cc.id,
            name: cc.cost_center_name || '',
            code: cc.cost_center_code || ''
          })))
        }
      } catch (e) {
        console.warn("Error loading refund data:", e)
      }
    })()
  }, [showCustomerRefund, invoice?.company_id, isPrivilegedUser, supabase, appCurrency])

  const loadInvoice = async () => {
    try {
      setIsLoading(true)
      const { data: invoiceData } = await supabase
        .from("invoices")
        .select("*, customers(*), companies(*), shipping_providers(provider_name)")
        .eq("id", invoiceId)
        .single()

      if (invoiceData) {
        setInvoice(invoiceData)
        
        // 📸 استخدام Snapshot إذا كان موجوداً، وإلا استخدام البيانات الحية
        // هذا يضمن عرض البيانات الأصلية وقت إنشاء الفاتورة

        // Load branch and cost center names
        if (invoiceData.branch_id) {
          const { data: branchData } = await supabase
            .from("branches")
            .select("name, branch_name")
            .eq("id", invoiceData.branch_id)
            .single()
          setBranchName(branchData?.name || branchData?.branch_name || null)
        }
        if (invoiceData.cost_center_id) {
          try {
            const { data: ccData, error: ccError } = await supabase
              .from("cost_centers")
              .select("cost_center_name")
              .eq("id", invoiceData.cost_center_id)
              .maybeSingle()
            if (!ccError && ccData) {
              setCostCenterName(ccData?.cost_center_name || null)
            } else {
              setCostCenterName(null)
            }
          } catch (e) {
            console.warn("Failed to load cost center:", e)
            setCostCenterName(null)
          }
        }

        // Load linked sales order if exists
        if (invoiceData.sales_order_id) {
          const { data: soData } = await supabase
            .from("sales_orders")
            .select("id, so_number")
            .eq("id", invoiceData.sales_order_id)
            .single()
          if (soData) {
            setLinkedSalesOrder(soData)
          }
        } else {
          setLinkedSalesOrder(null)
        }

        const { data: itemsData } = await supabase
          .from("invoice_items")
          .select("*, products(name, sku, cost_price)")
          .eq("invoice_id", invoiceId)

        console.log("📦 Invoice items loaded:", itemsData?.map((item: InvoiceItem) => ({
          id: item.id,
          product: item.products?.name,
          quantity: item.quantity,
          returned_quantity: item.returned_quantity,
          discount_percent: item.discount_percent
        })))

        setItems(itemsData || [])

        // Load payments for this invoice
        const { data: paymentsData } = await supabase
          .from("payments")
          .select("*")
          .eq("invoice_id", invoiceId)
          .order("payment_date", { ascending: false })
        setInvoicePayments(paymentsData || [])

        // 💰 تحميل رصيد العميل الدائن من جدول customer_credits (المصدر الموثوق)
        if (invoiceData.customer_id && invoiceData.company_id) {
          try {
            const { data: creditsData } = await supabase
              .from("customer_credits")
              .select("amount, used_amount, applied_amount, status")
              .eq("company_id", invoiceData.company_id)
              .eq("customer_id", invoiceData.customer_id)
            // الرصيد المتاح (active فقط)
            const totalCreditBalance = (creditsData || []).reduce((sum: number, c: any) => {
              if (String(c.status || '') !== 'active') return sum
              const available = Number(c.amount || 0) - Number(c.used_amount || 0) - Number(c.applied_amount || 0)
              return sum + Math.max(0, available)
            }, 0)
            // إجمالي المُصرَف (used_amount عبر جميع السجلات)
            const totalDisbursed = (creditsData || []).reduce((sum: number, c: any) => {
              return sum + Number(c.used_amount || 0)
            }, 0)
            setCustomerCreditFromDB(totalCreditBalance)
            setCustomerCreditDisbursed(totalDisbursed)
          } catch {
            setCustomerCreditFromDB(0)
            setCustomerCreditDisbursed(0)
          }
        }

        // 💳 جلب رصيد العميل من customer_credit_ledger (المصدر الجديد)
        if (invoiceData?.customer_id) {
          try {
            const ledgerRes = await fetch(`/api/customer-credits/${invoiceData.customer_id}`)
            const ledgerJson = await ledgerRes.json()
            if (ledgerJson.success) setLedgerCreditBalance(Number(ledgerJson.data.balance || 0))
          } catch { /* non-critical */ }
        }

        // Load returns (sales_returns) for this invoice
        const { data: returnsData } = await supabase
          .from("sales_returns")
          .select("*, sales_return_items(*, products(name, sku))")
          .eq("invoice_id", invoiceId)
          .order("return_date", { ascending: false })
        setInvoiceReturns(returnsData || [])

        // Load existing shipment for this invoice
        const { data: shipmentData } = await supabase
          .from("shipments")
          .select("*, shipping_providers(provider_name)")
          .eq("invoice_id", invoiceId)
          .maybeSingle()
        setExistingShipment(shipmentData)

        // 🔐 تحميل التنقل يُؤجَّل إلى useEffect منفصل يعتمد على الفاتورة + صلاحيات المستخدم
        // (انظر useEffect [invoice, isPrivilegedUser, userBranchId] أدناه)
      }
    } catch (error) {
      console.error("Error loading invoice:", error)
    } finally {
      setIsLoading(false)
    }
  }

  // 🔄 Realtime: تحديث تفاصيل الفاتورة تلقائياً عند أي تغيير
  const loadInvoiceRef = useRef(loadInvoice)
  loadInvoiceRef.current = loadInvoice

  const handleInvoiceRealtimeEvent = useCallback((record: any) => {
    // فقط إذا كان التحديث لهذه الفاتورة
    if (record?.id === invoiceId) {
      console.log('🔄 [Invoice Detail] Realtime event received, refreshing invoice data...')
      loadInvoiceRef.current()
    }
  }, [invoiceId])

  useRealtimeTable({
    table: 'invoices',
    enabled: !!invoiceId,
    onUpdate: handleInvoiceRealtimeEvent,
    onDelete: (record: any) => {
      if (record?.id === invoiceId) {
        console.log('🗑️ [Invoice Detail] Invoice deleted, redirecting...')
        router.push('/invoices')
      }
    },
  })

  // 🔐 تحميل روابط التنقل (السابق / التالي) مع فلتر الفرع للأدوار المقيّدة
  useEffect(() => {
    if (!invoice) return
      ; (async () => {
        try {
          const companyId = (invoice as any).company_id || await getActiveCompanyId(supabase)
          if (!companyId) { setNextInvoiceId(null); setPrevInvoiceId(null); return }

          // الأدوار المميزة ترى جميع فواتير الشركة - غيرها مقيّدة بفرعها
          const branchFilter = isPrivilegedUser ? null : (userBranchId || null)

          let nextQ = supabase
            .from("invoices")
            .select("id, invoice_number")
            .eq("company_id", companyId)
            .gt("invoice_number", (invoice as any).invoice_number)
            .order("invoice_number", { ascending: true })
            .limit(1)
          if (branchFilter) nextQ = nextQ.eq("branch_id", branchFilter)

          let prevQ = supabase
            .from("invoices")
            .select("id, invoice_number")
            .eq("company_id", companyId)
            .lt("invoice_number", (invoice as any).invoice_number)
            .order("invoice_number", { ascending: false })
            .limit(1)
          if (branchFilter) prevQ = prevQ.eq("branch_id", branchFilter)

          const [{ data: nextData }, { data: prevData }] = await Promise.all([nextQ, prevQ])
          setNextInvoiceId((nextData && nextData[0]?.id) || null)
          setPrevInvoiceId((prevData && prevData[0]?.id) || null)
        } catch {
          setNextInvoiceId(null)
          setPrevInvoiceId(null)
        }
      })()
  }, [invoice, isPrivilegedUser, userBranchId])

  useEffect(() => {
    (async () => {
      try {
        const lu = String(((invoice as any)?.companies?.logo_url) || (typeof window !== 'undefined' ? (localStorage.getItem('company_logo_url') || '') : ''))
        if (lu) { setCompanyLogoUrl(lu); return }
        const r = await fetch('/api/my-company')
        if (r.ok) {
          const j = await r.json()
          // API response structure: { success, data: { company, accounts } }
          const lu2 = String(j?.data?.company?.logo_url || j?.company?.logo_url || '')
          if (lu2) setCompanyLogoUrl(lu2)
        }
      } catch { }
    })()
  }, [invoice])



  const handlePrint = () => {
    handleDownloadPDF()
  }

  const handleDownloadPDF = async () => {
    try {
      const el = invoiceContentRef.current
      if (!el) return

      // اقتباس المحتوى المطلوب فقط مع الحفاظ على التنسيق
      // Clone the element to manipulate it without affecting the UI
      const clone = el.cloneNode(true) as HTMLElement

      // Remove non-printable elements from clone if any legacy classes remain
      // Enhanced cleanup: remove buttons, inputs, actions, and specific print-hidden elements
      const toRemove = clone.querySelectorAll('.no-print, .print\\:hidden, button, .btn, [role="button"], input, select, textarea, .actions')
      toRemove.forEach(e => e.remove())

      const content = clone.innerHTML
      const appLang = typeof window !== 'undefined'
        ? ((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar')
        : 'ar'

      // Prepare Company Data for Header
      const companyName = invoice?.companies?.name || 'Company Name'
      // Try to get logo from invoice company, or fall back to state
      const logo = (invoice as any)?.companies?.logo_url || companyLogoUrl
      const address = (invoice as any)?.companies?.address || ''
      const phone = (invoice as any)?.companies?.phone || ''
      const email = (invoice as any)?.companies?.email || ''

      const { openPrintWindow } = await import('@/lib/print-utils')

      openPrintWindow(content, {
        lang: appLang as 'ar' | 'en',
        direction: appLang === 'ar' ? 'rtl' : 'ltr',
        title: appLang === 'en' ? `Invoice ${invoice?.invoice_number || ''}` : `فاتورة ${invoice?.invoice_number || ''}`,
        fontSize: 10,
        pageSize: 'A4',
        margin: '15mm',
        companyName: companyName,
        companyAddress: address,
        companyPhone: phone,
        printedBy: 'System User', // In a real app, this would come from auth context
        showHeader: true,
        showFooter: true
      })
    } catch (err) {
      console.error("Error generating PDF:", err)
      toastActionError(toast, appLang === 'en' ? 'Download' : 'تنزيل', appLang === 'en' ? 'Invoice PDF' : 'ملف الفاتورة', String((err as any)?.message || ''))
    }
  }



  const handleChangeStatus = async (newStatus: string) => {
    console.log("🚀 handleChangeStatus called:", { newStatus, invoiceId })

    // ⚡ INP Fix: إظهار loading state فوراً قبل أي await
    setChangingStatus(true)

    // ⚡ INP Fix: تأجيل العمليات الثقيلة باستخدام setTimeout
    setTimeout(async () => {
      try {
        console.log("⏰ Inside setTimeout - starting status change logic")

        // 📌 التحقق من المتطلبات قبل الإرسال
        if (newStatus === "sent") {
          console.log("📦 Starting pre-send validation...")

          // 1️⃣ التحقق من وجود شركة شحن (اختياري - إذا موجود يُستخدم نظام بضاعة لدى الغير)
          const shippingValidation = await validateShippingProvider(supabase, invoiceId)
          const hasShippingProvider = shippingValidation.valid && shippingValidation.shippingProviderId
          if (hasShippingProvider) {
            console.log(`✅ Shipping provider found: ${shippingValidation.providerName} - using third-party goods tracking`)
          } else {
            console.log("📦 No shipping provider - using direct inventory deduction model")
          }

          // 2️⃣ التحقق من توفر المخزون
          console.log("📦 Checking inventory availability...")

          // ✅ التحقق من وجود جميع البيانات المطلوبة للفحص
          if (!invoice?.company_id || !invoice?.branch_id || !invoice?.warehouse_id || !invoice?.cost_center_id) {
            const missingFields = []
            if (!invoice?.company_id) missingFields.push("الشركة")
            if (!invoice?.branch_id) missingFields.push("الفرع")
            if (!invoice?.warehouse_id) missingFields.push("المخزن")
            if (!invoice?.cost_center_id) missingFields.push("مركز التكلفة")

            startTransition(() => {
              setChangingStatus(false)
            })
            toast({
              variant: "destructive",
              title: appLang === 'en' ? "Missing Required Information" : "بيانات ناقصة",
              description: appLang === 'en'
                ? `Cannot check inventory. Missing: ${missingFields.join(", ")}. Please complete the invoice data first.`
                : `لا يمكن فحص المخزون. البيانات الناقصة: ${missingFields.join("، ")}. يرجى إكمال بيانات الفاتورة أولاً.`,
              duration: 8000,
            })
            return
          }

          const { data: invoiceItems } = await supabase
            .from("invoice_items")
            .select("product_id, quantity")
            .eq("invoice_id", invoiceId)

          const itemsToCheck = (invoiceItems || []).map((item: any) => ({
            product_id: item.product_id,
            quantity: Number(item.quantity || 0)
          }))

          // Pass invoice context for proper inventory filtering (all fields are required)
          const inventoryContext = {
            company_id: invoice.company_id,
            branch_id: invoice.branch_id!,
            warehouse_id: invoice.warehouse_id!,
            cost_center_id: invoice.cost_center_id!,
          }

          const { success, shortages } = await checkInventoryAvailability(supabase, itemsToCheck, undefined, inventoryContext)

          if (!success) {
            const { title, description } = getShortageToastContent(shortages, appLang as 'en' | 'ar')
            startTransition(() => {
              setChangingStatus(false)
            })
            toast({
              variant: "destructive",
              title,
              description,
              duration: 8000,
            })
            return
          }
          console.log("✅ Inventory availability confirmed")
        }

        // ✅ ERP-Grade: Period Lock Check - منع تسجيل فاتورة في فترة مغلقة
        if (newStatus === "sent" || newStatus === "paid" || newStatus === "partially_paid") {
          try {
            const { assertPeriodNotLocked } = await import("@/lib/accounting-period-lock")
            const { createClient } = await import("@supabase/supabase-js")
            const serviceSupabase = createClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
            )
            const invoiceDate = invoice?.invoice_date || new Date().toISOString().split("T")[0]
            await assertPeriodNotLocked(serviceSupabase, {
              companyId: invoice?.company_id || "",
              date: invoiceDate,
            })
          } catch (lockError: any) {
            startTransition(() => {
              setChangingStatus(false)
            })
            toast({
              variant: "destructive",
              title: appLang === 'en' ? "Accounting Period Locked" : "❌ الفترة المحاسبية مقفلة",
              description: lockError.message || (appLang === 'en'
                ? "Cannot change invoice status in a locked accounting period"
                : "لا يمكن تغيير حالة الفاتورة في فترة محاسبية مقفلة"),
              duration: 8000,
            })
            return
          }
        }

        console.log("💾 Updating invoice status in database...")
        const { error } = await supabase.from("invoices").update({ status: newStatus }).eq("id", invoiceId)

        if (error) {
          console.error("❌ Failed to update invoice status:", error)
          throw error
        }
        console.log("✅ Invoice status updated successfully")

        // ✅ إرسال حدث لتحديث صفحة بضائع لدى الغير
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('invoice_status_changed', {
            detail: { invoiceId, newStatus }
          }))
        }

        // ===== 📌 ERP Accounting & Inventory Core Logic (MANDATORY FINAL SPECIFICATION) =====
        // 📌 النمط المحاسبي الصارم:
        // Sent: خصم المخزون فقط (Stock Out) - ❌ لا قيد محاسبي
        // Paid: إنشاء قيد AR/Revenue + قيد السداد
        console.log("🔍 Status change logic:", {
          hasInvoice: !!invoice,
          newStatus,
          invoiceId
        })

        if (invoice) {
          const { data: { user } } = await supabase.auth.getUser()
          const auditUserId = user?.id || null

          if (newStatus === "sent") {
            console.log("📌 Calling deductInventoryOnly()...")
            // 1️⃣ خصم المخزون + نقل إلى بضاعة لدى الغير
            await deductInventoryOnly()
            // ❌ لا قيد محاسبي عند Sent - القيد يُنشأ عند الدفع فقط
            console.log(`✅ INV Sent: تم خصم المخزون ونقله إلى بضاعة لدى الغير`)

            // 📸 حفظ Snapshot بيانات العميل عند الإرسال (إذا لم يكن موجوداً)
            if (!invoice.customer_name_snapshot && invoice.customer_id) {
              const { data: customerData } = await supabase
                .from("customers")
                .select("name, email, phone, address, city, country, tax_id, governorate, detailed_address")
                .eq("id", invoice.customer_id)
                .single()

              if (customerData) {
                await supabase
                  .from("invoices")
                  .update({
                    customer_name_snapshot: customerData.name || null,
                    customer_email_snapshot: customerData.email || null,
                    customer_phone_snapshot: customerData.phone || null,
                    customer_address_snapshot: customerData.address || null,
                    customer_city_snapshot: customerData.city || null,
                    customer_country_snapshot: customerData.country || null,
                    customer_tax_id_snapshot: customerData.tax_id || null,
                    customer_governorate_snapshot: customerData.governorate || null,
                    customer_detailed_address_snapshot: customerData.detailed_address || null,
                  })
                  .eq("id", invoiceId)
                console.log("📸 Customer snapshot saved on invoice sent")
              }
            }

            // 📝 Audit Log: تسجيل عملية الإرسال
            if (auditUserId && invoice.company_id) {
              const { error: auditErr } = await supabase.from("audit_logs").insert({
                company_id: invoice.company_id,
                user_id: auditUserId,
                action: "UPDATE",
                target_table: "invoices",
                record_id: invoiceId,
                record_identifier: invoice.invoice_number,
                old_data: { status: invoice.status },
                new_data: {
                  status: "sent",
                  shipping_provider_id: invoice.shipping_provider_id,
                  total_amount: invoice.total_amount
                }
              })
              if (auditErr) console.warn("Audit log failed:", auditErr)
            }

            // 🔔 إشعار مسؤولي المخزن في الفرع عند تحويل الفاتورة إلى مرسلة
            if (invoice.company_id && invoice.branch_id) {
              try {
                const warehouseRoles = ['warehouse_manager', 'store_manager']
                const { data: warehouseManagers } = await supabase
                  .from('company_members')
                  .select('user_id, role')
                  .eq('company_id', invoice.company_id)
                  .in('role', warehouseRoles)
                  .eq('branch_id', invoice.branch_id)

                if (warehouseManagers && warehouseManagers.length > 0) {
                  for (const manager of warehouseManagers) {
                    await supabase.rpc('create_notification', {
                      p_company_id: invoice.company_id,
                      p_reference_type: 'invoice',
                      p_reference_id: invoiceId,
                      p_title: 'فاتورة جاهزة للشحن',
                      p_message: `الفاتورة رقم (${invoice.invoice_number || invoiceId}) اعتُمدت من المحاسبة — يرجى تجهيز البضاعة وتأكيد الإخراج من المخزن`,
                      p_created_by: auditUserId || invoice.company_id,
                      p_branch_id: invoice.branch_id,
                      p_cost_center_id: null,
                      p_warehouse_id: null,
                      p_assigned_to_role: manager.role,
                      p_assigned_to_user: manager.user_id,
                      p_priority: 'high',
                      p_event_key: `invoice:${invoiceId}:sent:${manager.user_id}`,
                      p_severity: 'warning',
                      p_category: 'inventory'
                    })
                    console.log(`✅ [SENT] Notification sent to ${manager.role} (${manager.user_id})`)
                  }
                } else {
                  // Fallback: إرسال بالدور فقط إن لم يوجد مستخدم محدد
                  console.warn(`⚠️ [SENT] No store/warehouse manager found in branch ${invoice.branch_id}. Sending role fallback.`)
                  await supabase.rpc('create_notification', {
                    p_company_id: invoice.company_id,
                    p_reference_type: 'invoice',
                    p_reference_id: invoiceId,
                    p_title: 'فاتورة جاهزة للشحن',
                    p_message: `الفاتورة رقم (${invoice.invoice_number || invoiceId}) اعتُمدت من المحاسبة — يرجى تجهيز البضاعة وتأكيد الإخراج من المخزن`,
                    p_created_by: auditUserId || invoice.company_id,
                    p_branch_id: invoice.branch_id,
                    p_cost_center_id: null,
                    p_warehouse_id: null,
                    p_assigned_to_role: 'store_manager',
                    p_assigned_to_user: null,
                    p_priority: 'high',
                    p_event_key: `invoice:${invoiceId}:sent:store_manager`,
                    p_severity: 'warning',
                    p_category: 'inventory'
                  })
                }
              } catch (notifErr: any) {
                console.warn('⚠️ [SENT] Warehouse notification failed:', notifErr?.message)
              }
            }

          } else if (newStatus === "paid" || newStatus === "partially_paid") {
            // ✅ إذا كانت الفاتورة في حالة "paid" مباشرة (بدون المرور بـ "sent")
            // يجب خصم المخزون وإنشاء COGS إذا لم يتم ذلك من قبل
            const { data: existingCOGS } = await supabase
              .from("cogs_transactions")
              .select("id")
              .eq("source_id", invoiceId)
              .eq("source_type", "invoice")
              .limit(1)

            if (!existingCOGS || existingCOGS.length === 0) {
              console.log("📌 Invoice paid directly - calling deductInventoryOnly()...")
              // إنشاء COGS إذا لم يكن موجوداً
              await deductInventoryOnly()
              console.log(`✅ INV Paid (direct): تم خصم المخزون وإنشاء COGS`)
            } else {
              console.log(`✅ INV Paid: COGS already exists, skipping inventory deduction`)
            }

          } else if (newStatus === "draft" || newStatus === "cancelled") {
            await reverseInventoryForInvoice()
            // عكس القيود المحاسبية إن وجدت (للفواتير المدفوعة سابقاً)
            await reverseInvoiceJournals()

            // 📝 Audit Log: تسجيل عملية الإلغاء/الإرجاع لمسودة
            if (auditUserId && invoice.company_id) {
              const { error: auditErr2 } = await supabase.from("audit_logs").insert({
                company_id: invoice.company_id,
                user_id: auditUserId,
                action: "UPDATE",
                target_table: "invoices",
                record_id: invoiceId,
                record_identifier: invoice.invoice_number,
                old_data: { status: invoice.status },
                new_data: { status: newStatus }
              })
              if (auditErr2) console.warn("Audit log failed:", auditErr2)
            }
          }
        }

        startTransition(() => {
          loadInvoice()
          setChangingStatus(false)
        })
        toastActionSuccess(toast, "التحديث", "الفاتورة")
      } catch (error) {
        console.error("Error updating status:", error)
        startTransition(() => {
          setChangingStatus(false)
        })
        toastActionError(toast, "التحديث", "الفاتورة", "تعذر تحديث حالة الفاتورة")
      }
    }, 0)
  }

  const findAccountIds = async (companyId?: string) => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null

    // استخدام getActiveCompanyId لدعم المستخدمين المدعوين
    const { getActiveCompanyId } = await import("@/lib/company")
    const resolvedCompanyId = companyId || await getActiveCompanyId(supabase)
    if (!resolvedCompanyId) return null

    const { data: accounts } = await supabase
      .from("chart_of_accounts")
      .select("id, account_code, account_type, account_name, sub_type, parent_id")
      .eq("company_id", resolvedCompanyId)
      .eq("is_active", true) // 📌 فلترة الحسابات النشطة فقط - تجنب الحسابات المؤرشفة/المعطلة

    if (!accounts) return null

    // اعمل على الحسابات الورقية فقط (ليست آباء لغيرها)
    const parentIds = new Set((accounts || []).map((a: any) => a.parent_id).filter(Boolean))
    const leafAccounts = (accounts || []).filter((a: any) => !parentIds.has(a.id))

    const byCode = (code: string) => leafAccounts.find((a: any) => String(a.account_code || "").toUpperCase() === code)?.id
    const byType = (type: string) => leafAccounts.find((a: any) => String(a.account_type || "") === type)?.id
    const byNameIncludes = (name: string) =>
      leafAccounts.find((a: any) => String(a.account_name || "").toLowerCase().includes(name.toLowerCase()))?.id
    const bySubType = (st: string) => leafAccounts.find((a: any) => String(a.sub_type || "").toLowerCase() === st.toLowerCase())?.id

    const ar =
      bySubType("accounts_receivable") ||
      byCode("AR") ||
      byNameIncludes("receivable") ||
      byNameIncludes("الحسابات المدينة") ||
      byCode("1100") ||
      byType("asset")
    const revenue =
      bySubType("sales_revenue") ||
      byCode("REV") ||
      byNameIncludes("revenue") ||
      byNameIncludes("المبيعات") ||
      byCode("4000") ||
      byType("income")
    const vatPayable =
      bySubType("vat_output") ||
      byCode("VAT") ||
      byCode("VATOUT") ||
      byNameIncludes("vat") ||
      byNameIncludes("ضريبة") ||
      byType("liability")
    // تجنب fallback عام إلى نوع "أصول" عند تحديد النقد/البنك
    const cash =
      bySubType("cash") ||
      byCode("CASH") ||
      byNameIncludes("cash") ||
      byNameIncludes("خزينة") ||
      byNameIncludes("نقد") ||
      byNameIncludes("صندوق") ||
      null
    const bank =
      bySubType("bank") ||
      byNameIncludes("bank") ||
      byNameIncludes("بنك") ||
      byNameIncludes("مصرف") ||
      null
    const inventory =
      bySubType("inventory") ||
      byCode("INV") ||
      byNameIncludes("inventory") ||
      byNameIncludes("المخزون") ||
      byCode("1200") ||
      byCode("1201") ||
      byCode("1202") ||
      byCode("1203") ||
      null
    const cogs =
      bySubType("cogs") ||
      byCode("COGS") ||
      byNameIncludes("cost of goods") ||
      byNameIncludes("cogs") ||
      byNameIncludes("تكلفة البضاعة المباعة") ||
      byCode("5000") ||
      byType("expense")

    const shippingAccount =
      byCode("7000") ||
      byNameIncludes("بوسطة") ||
      byNameIncludes("byosta") ||
      byNameIncludes("الشحن") ||
      byNameIncludes("shipping") ||
      null

    return { companyId: resolvedCompanyId, ar, revenue, vatPayable, cash, bank, inventory, cogs, shippingAccount }
  }

  // === دالة تحديث أمر البيع المرتبط بالفاتورة ===
  const updateLinkedSalesOrderStatus = async (invoiceId: string) => {
    try {
      // جلب الفاتورة للحصول على sales_order_id والبيانات المالية
      const { data: invoiceData } = await supabase
        .from("invoices")
        .select("sales_order_id, status, subtotal, tax_amount, total_amount, returned_amount, return_status")
        .eq("id", invoiceId)
        .single()

      if (!invoiceData?.sales_order_id) return // لا يوجد أمر بيع مرتبط

      const soId = invoiceData.sales_order_id

      // تحديث أمر البيع بالبيانات من الفاتورة
      const { error: updateErr } = await supabase
        .from("sales_orders")
        .update({
          subtotal: invoiceData.subtotal,
          tax_amount: invoiceData.tax_amount,
          total: invoiceData.total_amount,
          returned_amount: invoiceData.returned_amount || 0,
          return_status: invoiceData.return_status,
          status: invoiceData.status === 'fully_returned' ? 'cancelled' :
            invoiceData.status === 'paid' ? 'paid' :
              invoiceData.status === 'partially_paid' ? 'invoiced' :
                invoiceData.status === 'sent' ? 'invoiced' : 'invoiced',
          updated_at: new Date().toISOString()
        })
        .eq("id", soId)

      if (updateErr) {
        console.warn("Failed to update linked SO:", updateErr)
      } else {
        console.log(`✅ Updated linked SO ${soId} with invoice data`)
      }
    } catch (err) {
      console.warn("Failed to update linked SO status:", err)
    }
  }

  // ===== 📌 نظام النقدية (Cash Basis): قيد المبيعات والذمم عند الدفع =====
  // 📌 المرجع: ACCOUNTING_PATTERN.md (Single Source of Truth)
  // عند Paid: Debit AR / Credit Revenue + VAT + Shipping
  // هذا يسجل الإيراد عند الدفع فقط (وليس عند الإرسال)
  // ❌ لا يتم استدعاء هذه الدالة عند Sent
  const postARRevenueJournal = async () => {
    try {
      if (!invoice) return

      const mapping = await findAccountIds()
      if (!mapping || !mapping.ar || !mapping.revenue) {
        console.warn("Account mapping incomplete: AR/Revenue not found. Skipping AR/Revenue journal.")
        return
      }

      // 🔐 GOVERNANCE: تجنب التكرار - التحقق من عدم وجود قيد سابق
      const duplicateCheck = await checkDuplicateJournalEntry(
        supabase,
        mapping.companyId,
        "invoice",
        invoiceId
      )
      if (duplicateCheck.exists) {
        console.log(`🔐 GOVERNANCE: Invoice journal already exists for ${invoiceId}`)
        return
      }

      // ===== 1) قيد المبيعات والذمم المدينة (draft → أسطر → ترحيل لتجنب منع إضافة أسطر لقالب مرحّل) =====
      const { data: entry, error: entryError } = await supabase
        .from("journal_entries")
        .insert({
          company_id: mapping.companyId,
          reference_type: "invoice", // قيد الفاتورة - Cash Basis
          reference_id: invoiceId,
          entry_date: invoice.invoice_date,
          description: `فاتورة مبيعات ${invoice.invoice_number}`,
          status: "draft",
          branch_id: invoice.branch_id || null,
          cost_center_id: invoice.cost_center_id || null,
          warehouse_id: invoice.warehouse_id || null,
        })
        .select()
        .single()

      if (entryError) throw entryError

      // القيد: Debit AR / Credit Revenue + VAT + Shipping
      const lines: any[] = [
        {
          journal_entry_id: entry.id,
          account_id: mapping.ar,
          debit_amount: invoice.total_amount,
          credit_amount: 0,
          description: "الذمم المدينة (العملاء)",
          branch_id: invoice.branch_id || null,
          cost_center_id: invoice.cost_center_id || null,
        },
        {
          journal_entry_id: entry.id,
          account_id: mapping.revenue,
          debit_amount: 0,
          credit_amount: invoice.subtotal,
          description: "إيراد المبيعات",
          branch_id: invoice.branch_id || null,
          cost_center_id: invoice.cost_center_id || null,
        },
      ]

      // إضافة الشحن إن وجد
      if (Number(invoice.shipping || 0) > 0) {
        lines.push({
          journal_entry_id: entry.id,
          account_id: mapping.shippingAccount || mapping.revenue,
          debit_amount: 0,
          credit_amount: Number(invoice.shipping || 0),
          description: "إيراد الشحن",
        })
      }

      // إضافة ضريبة القيمة المضافة إن وجدت
      if (mapping.vatPayable && invoice.tax_amount && invoice.tax_amount > 0) {
        lines.push({
          journal_entry_id: entry.id,
          account_id: mapping.vatPayable,
          debit_amount: 0,
          credit_amount: invoice.tax_amount,
          description: "ضريبة القيمة المضافة المستحقة",
        })
      }

      const { error: linesError } = await supabase.from("journal_entry_lines").insert(lines)
      if (linesError) throw linesError

      await supabase.from("journal_entries").update({ status: "posted" }).eq("id", entry.id)

      // ===== 📌 ملاحظة: لا قيد COGS =====
      // حسب النمط المطلوب (Cash Basis): لا COGS في النظام المحاسبي
      // COGS يُحسب فقط للتقارير الإدارية (خارج القيود المحاسبية)

      console.log(`✅ تم إنشاء قيد المبيعات والذمم للفاتورة ${invoice.invoice_number} (Cash Basis)`)
    } catch (err) {
      console.error("Error posting AR/Revenue journal:", err)
    }
  }

  // ===== 📌 ملاحظة: لا قيد COGS في النظام =====
  // حسب النمط المطلوب (Cash Basis): لا COGS في القيود المحاسبية
  // COGS يُحسب فقط للتقارير الإدارية (خارج القيود)

  // ❌ تم إزالة issueFullCreditNote - استخدم المرتجع الجزئي/الكامل من صفحة الفواتير بدلاً منه
  // السبب: المرتجع الجزئي/الكامل يدعم FIFO, COGS, التالف، وينشئ سجلات sales_returns

  // Open partial return dialog
  const openPartialReturnDialog = () => {
    if (!invoice || !items.length) return
    const returnableItems = items.map(it => ({
      item_id: it.id,
      product_id: it.product_id || null,
      product_name: it.products?.name || '—',
      max_qty: it.quantity - (it.returned_quantity || 0),
      return_qty: 0,
      unit_price: it.unit_price,
      tax_rate: it.tax_rate || 0,
      discount_percent: it.discount_percent || 0
    })).filter(it => it.max_qty > 0)
    setReturnItems(returnableItems)
    setReturnMethod('credit_note')
    setReturnAccountId('')
    setReturnNotes('')
    setShowPartialReturn(true)
  }

  // Open shipment dialog
  const openShipmentDialog = async () => {
    if (!invoice) return
    try {
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      // Load shipping providers
      const { data: providers } = await supabase
        .from("shipping_providers")
        .select("*")
        .eq("company_id", companyId)
        .eq("is_active", true)
      setShippingProviders(providers || [])
      if (providers && providers.length > 0) {
        setSelectedProviderId(providers[0].id)
      }

      // Pre-fill recipient data from customer
      setShipmentData({
        recipient_name: invoice.customer_name_snapshot || invoice.customers?.name || "",
        recipient_phone: invoice.customer_phone_snapshot || invoice.customers?.phone || "",
        recipient_address: invoice.customer_address_snapshot || invoice.customers?.address || "",
        recipient_city: invoice.customer_city_snapshot || invoice.customers?.city || "",
        weight: "",
        notes: ""
      })
      setShowShipmentDialog(true)
    } catch (err) {
      console.error("Error opening shipment dialog:", err)
    }
  }

  // Create shipment
  const createShipment = async () => {
    if (!invoice || !selectedProviderId) return
    try {
      setCreatingShipment(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) throw new Error("Company not found")

      const { data: { user } } = await supabase.auth.getUser()
      const provider = shippingProviders.find(p => p.id === selectedProviderId)

      // Generate shipment number
      const { data: lastShipment } = await supabase
        .from("shipments")
        .select("shipment_number")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      let nextNum = 1
      if (lastShipment?.shipment_number) {
        const match = lastShipment.shipment_number.match(/(\d+)$/)
        if (match) nextNum = parseInt(match[1]) + 1
      }
      const shipmentNumber = `SHP-${String(nextNum).padStart(4, '0')}`

      // Create shipment record
      const { data: newShipment, error } = await supabase
        .from("shipments")
        .insert({
          company_id: companyId,
          invoice_id: invoice.id,
          shipping_provider_id: selectedProviderId,
          shipment_number: shipmentNumber,
          status: "pending",
          shipping_cost: provider?.default_service ? 0 : 0,
          weight: shipmentData.weight ? parseFloat(shipmentData.weight) : null,
          recipient_name: shipmentData.recipient_name,
          recipient_phone: shipmentData.recipient_phone,
          recipient_address: shipmentData.recipient_address,
          recipient_city: shipmentData.recipient_city,
          notes: shipmentData.notes,
          created_by: user?.id
        })
        .select()
        .single()

      if (error) throw error

      // استدعاء API الشحن عبر الـ Server Route (لا نستدعي API شركة الشحن مباشرة من الواجهة)
      if (provider?.api_key && provider?.base_url && !['manual', 'internal', 'pickup'].includes(provider.provider_code || '')) {
        try {
          // استدعاء API Route الخاص بنا
          const response = await fetch('/api/shipping/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              shipment_id: newShipment.id,
              provider_id: provider.id,
              shipment_data: {
                shipper: {
                  name: invoice.companies?.name || 'Company',
                  phone: invoice.companies?.phone || '',
                  address: invoice.companies?.address || '',
                  city: invoice.companies?.city || '',
                  country: 'Egypt',
                },
                consignee: {
                  name: shipmentData.recipient_name || invoice.customer_name_snapshot || invoice.customers?.name || '',
                  phone: shipmentData.recipient_phone || invoice.customer_phone_snapshot || invoice.customers?.phone || '',
                  address: shipmentData.recipient_address || invoice.customer_address_snapshot || invoice.customers?.address || '',
                  city: shipmentData.recipient_city || invoice.customer_city_snapshot || invoice.customers?.city || '',
                  country: 'Egypt',
                },
                shipment: {
                  weight: shipmentData.weight ? parseFloat(shipmentData.weight) : 1,
                  description: shipmentData.notes || `Invoice ${invoice.invoice_number}`,
                  reference: newShipment.shipment_number,
                  cod_amount: invoice.total_amount,
                },
              }
            })
          })

          const result = await response.json()

          if (result.success) {
            // تم تحديث الشحنة من الـ API Route
            console.log('Shipment created via API:', result)
          } else {
            // فشل API - الشحنة موجودة بحالة pending
            console.warn('API call failed, shipment in pending state:', result.error)
          }
        } catch (apiErr) {
          console.error("API call failed:", apiErr)
          // الشحنة موجودة بحالة pending - يمكن إعادة المحاولة لاحقاً
        }
      } else {
        // شحن يدوي - إنشاء رقم تتبع داخلي
        const trackingNumber = `INT-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
        await supabase
          .from("shipments")
          .update({
            tracking_number: trackingNumber,
            status: "created",
          })
          .eq("id", newShipment.id)
      }

      toastActionSuccess(toast, appLang === 'en' ? 'Create' : 'إنشاء', appLang === 'en' ? 'Shipment' : 'الشحنة')
      setShowShipmentDialog(false)
      await loadInvoice()
    } catch (err: any) {
      console.error("Error creating shipment:", err)
      toastActionError(toast, appLang === 'en' ? 'Create' : 'إنشاء', appLang === 'en' ? 'Shipment' : 'الشحنة', err?.message)
    } finally {
      setCreatingShipment(false)
    }
  }

  // Calculate return total
  const returnTotal = useMemo(() => {
    return returnItems.reduce((sum, it) => {
      const gross = it.return_qty * it.unit_price
      const net = gross - (gross * (it.discount_percent || 0) / 100)
      const tax = net * (it.tax_rate || 0) / 100
      return sum + net + tax
    }, 0)
  }, [returnItems])

  // Process partial sales return
  const processPartialReturn = async () => {
    if (!invoice || returnTotal <= 0) return
    try {
      setReturnProcessing(true)

      // ===== التحقق الموحد من حالة الفاتورة (باستخدام الدالة الموحدة) =====
      const { canReturnInvoice, getInvoiceOperationError, requiresJournalEntries } = await import("@/lib/validation")

      // 🔒 التحقق الموحد: هل يُسمح بالمرتجع لهذه الحالة؟
      if (!canReturnInvoice(invoice.status)) {
        const error = getInvoiceOperationError(invoice.status, 'return', appLang as 'en' | 'ar')
        if (error) {
          toastActionError(toast, appLang === 'en' ? 'Return' : 'المرتجع', appLang === 'en' ? 'Invoice' : 'الفاتورة', error.description)
        }
        return
      }

      const mapping = await findAccountIds()
      if (!mapping) {
        toastActionError(toast, appLang === 'en' ? 'Return' : 'المرتجع', appLang === 'en' ? 'Invoice' : 'الفاتورة', appLang === 'en' ? 'Account settings not found' : 'لم يتم العثور على إعدادات الحسابات')
        return
      }

      // ===== تحقق مهم: للفواتير المدفوعة فقط - التأكد من وجود قيود محاسبية أصلية =====
      // الفواتير المرسلة (sent) لا تحتوي على قيود مالية - فقط حركات مخزون
      if (requiresJournalEntries(invoice.status)) {
        const { data: existingInvoiceEntry } = await supabase
          .from("journal_entries")
          .select("id")
          .eq("reference_id", invoice.id)
          .eq("reference_type", "invoice")
          .single()

        if (!existingInvoiceEntry) {
          toastActionError(toast, appLang === 'en' ? 'Return' : 'المرتجع', appLang === 'en' ? 'Invoice' : 'الفاتورة', appLang === 'en' ? 'Cannot return paid invoice without journal entries.' : 'لا يمكن عمل مرتجع لفاتورة مدفوعة بدون قيود محاسبية.')
          return
        }
      }

      // ===== تحقق مهم: التأكد من وجود حركات بيع أصلية قبل إنشاء المرتجع =====
      // هذا يمنع إنشاء sale_return بدون وجود sale مقابل
      const productIdsToReturn = returnItems.filter(it => it.return_qty > 0 && it.product_id).map(it => it.product_id)
      if (productIdsToReturn.length > 0) {
        const { data: existingSales } = await supabase
          .from("inventory_transactions")
          .select("product_id, quantity_change")
          .eq("reference_id", invoice.id)
          .eq("transaction_type", "sale")
          .in("product_id", productIdsToReturn)

        // التحقق من أن كل منتج له حركة بيع
        const salesByProduct = new Map((existingSales || []).map((s: any) => [s.product_id, Math.abs(s.quantity_change)]))
        const missingProducts = productIdsToReturn.filter(pid => !salesByProduct.has(pid))

        if (missingProducts.length > 0) {
          // إنشاء حركات البيع المفقودة تلقائياً قبل المرتجع
          console.warn("⚠️ Missing sale transactions detected, creating them now...")
          const missingTx = returnItems
            .filter(it => it.return_qty > 0 && it.product_id && missingProducts.includes(it.product_id))
            .map(it => {
              const originalItem = items.find(i => i.id === it.item_id)
              return {
                company_id: mapping.companyId,
                product_id: it.product_id,
                transaction_type: "sale",
                quantity_change: -Number(originalItem?.quantity || it.max_qty + it.return_qty),
                reference_id: invoice.id,
                notes: `بيع ${invoice.invoice_number} (إصلاح تلقائي)`,
              }
            })
          if (missingTx.length > 0) {
            await supabase.from("inventory_transactions").insert(missingTx)
            console.log("✅ Created missing sale transactions:", missingTx.length)
          }
        }
      }

      // ===== منطق المرتجع حسب حالة الفاتورة =====
      // 📌 sent = تحديث الفاتورة فقط + تحديث AR (بدون Revenue/VAT/Cash)
      // 📌 paid/partially_paid = عكس المخزون + القيود المالية الكاملة

      let returnEntryId: string | null = null
      let originalInvoiceEntryId: string | null = null // للفواتير المرسلة: القيد الأصلي للفاتورة

      // Calculate subtotal and tax
      const returnSubtotal = returnItems.reduce((sum, it) => {
        const gross = it.return_qty * it.unit_price
        return sum + gross - (gross * (it.discount_percent || 0) / 100)
      }, 0)
      const returnTax = returnItems.reduce((sum, it) => {
        const gross = it.return_qty * it.unit_price
        const net = gross - (gross * (it.discount_percent || 0) / 100)
        return sum + (net * (it.tax_rate || 0) / 100)
      }, 0)

      // ===== للفواتير المرسلة (Sent): Accrual Basis — عكس كامل لقيد الفاتورة الأصلي =====
      // بما أن الفاتورة المرسلة الآن لها قيد AR/Revenue/VAT كامل (أُنشئ عند الإرسال)،
      // فإن المرتجع يحتاج إلى عكس كامل (Dr Revenue / Dr VAT / Cr AR + Dr Inventory / Cr COGS)
      if (invoice.status === 'sent') {
        const { data: originalEntry } = await supabase
          .from("journal_entries")
          .select("id")
          .eq("company_id", mapping.companyId)
          .eq("reference_type", "invoice")
          .eq("reference_id", invoice.id)
          .maybeSingle()

        if (originalEntry) {
          originalInvoiceEntryId = originalEntry.id
          // قيد المرتجع الكامل (Dr Revenue + Dr VAT / Cr AR + Dr Inventory / Cr COGS) سيُنشأ أدناه
          console.log(`✅ Accrual: Found invoice journal for sent invoice ${invoice.invoice_number} — will create full reversal journal`)
        } else {
          originalInvoiceEntryId = null
          console.warn(`⚠️ Sent invoice ${invoice.invoice_number} has no invoice journal (pre-Accrual). Return will update amounts only.`)
        }
      }

      // ===== 🔧 إصلاح: إنشاء سجل sales_return أولاً ثم القيد المحاسبي =====
      // إنشاء سجل المرتجع أولاً للحصول على sales_return.id
      const returnNumber = `SR-${Date.now().toString().slice(-8)}`
      const { data: salesReturnRecord, error: srErr } = await supabase
        .from("sales_returns")
        .insert({
          company_id: mapping.companyId,
          customer_id: invoice.customer_id,
          invoice_id: invoice.id,
          return_number: returnNumber,
          return_date: new Date().toISOString().slice(0, 10),
          subtotal: returnSubtotal,
          tax_amount: returnTax,
          total_amount: returnTotal,
          refund_amount: 0,
          refund_method: returnMethod || 'credit_note',
          status: 'completed',
          reason: returnNotes || (appLang === 'en' ? 'Partial return' : 'مرتجع جزئي'),
          notes: appLang === 'en' ? `Return for invoice ${invoice.invoice_number}` : `مرتجع للفاتورة ${invoice.invoice_number}`,
        })
        .select()
        .single()
      if (srErr) throw srErr
      const salesReturnId = salesReturnRecord.id

      // إنشاء بنود المرتجع
      const returnItemsData = returnItems.filter(it => it.return_qty > 0).map(it => ({
        sales_return_id: salesReturnId,
        product_id: it.product_id,
        description: it.product_name,
        quantity: it.return_qty,
        unit_price: it.unit_price,
        tax_rate: it.tax_rate || 0,
        line_total: it.return_qty * it.unit_price,
      }))
      if (returnItemsData.length > 0) {
        await supabase.from("sales_return_items").insert(returnItemsData)
      }

      // ===== إنشاء قيود مالية كاملة: للفواتير المدفوعة + الفواتير المرسلة ذات القيود (Accrual Basis) =====
      const shouldCreateReturnJournal = requiresJournalEntries(invoice.status) ||
        (invoice.status === 'sent' && originalInvoiceEntryId !== null)
      if (shouldCreateReturnJournal) {
        // Create journal entry for the return (reverse AR and Revenue)
        // 🔧 إصلاح: استخدام sales_return.id بدلاً من invoice.id
        const { data: entry, error: entryErr } = await supabase
          .from("journal_entries")
          .insert({
            company_id: mapping.companyId,
            reference_type: "sales_return",
            reference_id: salesReturnId, // ✅ استخدام sales_return.id
            entry_date: new Date().toISOString().slice(0, 10),
            description: appLang === 'en' ? `Sales return ${returnNumber} for invoice ${invoice.invoice_number}` : `مرتجع مبيعات ${returnNumber} للفاتورة ${invoice.invoice_number}`,
            status: "draft",
            branch_id: invoice.branch_id || null,
            cost_center_id: invoice.cost_center_id || null,
            warehouse_id: invoice.warehouse_id || null,
          })
          .select()
          .single()
        if (entryErr) throw entryErr
        returnEntryId = entry.id

        // ربط القيد بسجل المرتجع
        await supabase.from("sales_returns").update({ journal_entry_id: returnEntryId }).eq("id", salesReturnId)

        // Journal entry lines: Debit Revenue, Credit AR
        const lines: any[] = []

        // Debit Revenue (reduce sales)
        if (mapping.revenue) {
          lines.push({
            journal_entry_id: entry.id,
            branch_id: invoice.branch_id || null,
            cost_center_id: invoice.cost_center_id || null,
            account_id: mapping.revenue,
            debit_amount: returnSubtotal,
            credit_amount: 0,
            description: appLang === 'en' ? 'Sales return - Revenue reversal' : 'مرتجع مبيعات - عكس الإيراد',
          })
        }

        // Debit VAT Payable (if tax exists)
        if (returnTax > 0 && mapping.vatPayable) {
          lines.push({
            journal_entry_id: entry.id,
            account_id: mapping.vatPayable,
            debit_amount: returnTax,
            credit_amount: 0,
            description: appLang === 'en' ? 'Sales return - VAT reversal' : 'مرتجع مبيعات - عكس الضريبة',
          })
        }

        // Credit AR (reduce receivable)
        if (mapping.ar) {
          lines.push({
            journal_entry_id: entry.id,
            account_id: mapping.ar,
            debit_amount: 0,
            credit_amount: returnTotal,
            description: appLang === 'en' ? 'Sales return - AR reduction' : 'مرتجع مبيعات - تخفيض الذمم',
          })
        }

        // ===== قيد عكس COGS (Debit Inventory / Credit COGS) =====
        // عند مرتجع البيع: نعكس تكلفة البضاعة بنسبة الكمية المرتجعة
        if (mapping.inventory && mapping.cogs) {
          try {
            const { getCOGSByInvoice } = await import("@/lib/cogs-transactions")
            const originalCOGSRecords = await getCOGSByInvoice(supabase, invoice.id)

            let totalCOGSToReverse = 0
            for (const returnItem of returnItems.filter(it => it.return_qty > 0 && it.product_id)) {
              const productCOGS = originalCOGSRecords.filter(
                (ct: any) => ct.product_id === returnItem.product_id
              )
              const originalItem = items.find(i => i.id === returnItem.item_id)
              const originalQty = Number(originalItem?.quantity || 0)
              if (originalQty > 0 && productCOGS.length > 0) {
                const totalProductCOGS = productCOGS.reduce((sum: number, ct: any) => sum + Number(ct.total_cost || 0), 0)
                const returnRatio = returnItem.return_qty / originalQty
                totalCOGSToReverse += totalProductCOGS * returnRatio
              }
            }

            if (totalCOGSToReverse > 0.01) {
              // Debit Inventory (restore inventory asset at original cost)
              lines.push({
                journal_entry_id: entry.id,
                branch_id: invoice.branch_id || null,
                cost_center_id: invoice.cost_center_id || null,
                account_id: mapping.inventory,
                debit_amount: Math.round(totalCOGSToReverse * 100) / 100,
                credit_amount: 0,
                description: appLang === 'en' ? 'Sales return - Inventory restoration' : 'مرتجع مبيعات - استعادة المخزون بالتكلفة',
              })
              // Credit COGS (reduce cost of goods sold)
              lines.push({
                journal_entry_id: entry.id,
                branch_id: invoice.branch_id || null,
                cost_center_id: invoice.cost_center_id || null,
                account_id: mapping.cogs,
                debit_amount: 0,
                credit_amount: Math.round(totalCOGSToReverse * 100) / 100,
                description: appLang === 'en' ? 'Sales return - COGS reversal' : 'مرتجع مبيعات - عكس تكلفة البضاعة المباعة',
              })
              console.log(`✅ COGS reversal: ${totalCOGSToReverse.toFixed(2)} للفاتورة ${invoice.invoice_number}`)
            }
          } catch (cogsErr) {
            console.warn("⚠️ تعذر حساب COGS للمرتجع (لن يمنع إتمام المرتجع):", cogsErr)
          }
        }

        if (lines.length > 0) {
          const { error: linesErr } = await supabase.from("journal_entry_lines").insert(lines)
          if (linesErr) throw linesErr
        }

        await supabase.from("journal_entries").update({ status: "posted" }).eq("id", entry.id)
        console.log(`✅ تم إنشاء قيد المرتجع مع عكس COGS للفاتورة ${invoice.invoice_number}`)
      }

      // Update invoice_items returned_quantity
      for (const it of returnItems) {
        if (it.return_qty > 0) {
          const originalItem = items.find(i => i.id === it.item_id)
          const newReturnedQty = (originalItem?.returned_quantity || 0) + it.return_qty
          await supabase.from("invoice_items").update({ returned_quantity: newReturnedQty }).eq("id", it.item_id)
        }
      }

      // ✅ تحديث third_party_inventory.returned_quantity (للفواتير المرسلة عبر شركات الشحن)
      for (const it of returnItems) {
        if (it.return_qty > 0 && it.product_id) {
          // جلب السجل الحالي من third_party_inventory
          const { data: tpiRecord } = await supabase
            .from("third_party_inventory")
            .select("id, returned_quantity")
            .eq("invoice_id", invoice.id)
            .eq("product_id", it.product_id)
            .maybeSingle()

          if (tpiRecord) {
            const newTpiReturned = (Number(tpiRecord.returned_quantity) || 0) + it.return_qty
            await supabase
              .from("third_party_inventory")
              .update({ returned_quantity: newTpiReturned })
              .eq("id", tpiRecord.id)
            console.log(`✅ Updated third_party_inventory returned_quantity for product ${it.product_id}: ${newTpiReturned}`)
          }
        }
      }

      // ===== إنشاء حركات المخزون (لجميع الحالات: sent, paid, partially_paid) =====
      // 📌 للفواتير المرسلة: نربط حركات المخزون بالقيد الأصلي للفاتورة (إن وجد)
      // 📌 للفواتير المدفوعة: نربطها بقيد المرتجع الجديد
      const inventoryJournalEntryId = invoice.status === 'sent' ? originalInvoiceEntryId : returnEntryId
      const invTx = returnItems.filter(it => it.return_qty > 0 && it.product_id).map(it => ({
        company_id: mapping.companyId,
        product_id: it.product_id,
        transaction_type: "sale_return",
        quantity_change: it.return_qty, // positive for incoming
        reference_id: invoice.id,
        journal_entry_id: inventoryJournalEntryId, // للفواتير المرسلة: القيد الأصلي، للفواتير المدفوعة: قيد المرتجع
        notes: appLang === 'en' ? `Sales return for invoice ${invoice.invoice_number}` : `مرتجع مبيعات للفاتورة ${invoice.invoice_number}`,
        branch_id: invoice.branch_id || null,
        cost_center_id: invoice.cost_center_id || null,
        warehouse_id: invoice.warehouse_id || null,
      }))
      if (invTx.length > 0) {
        await supabase.from("inventory_transactions").insert(invTx)
        // ملاحظة: لا حاجة لتحديث products.quantity_on_hand يدوياً
        // لأن الـ Database Trigger (trg_apply_inventory_insert) يفعل ذلك تلقائياً
      }

      // Update invoice returned_amount and return_status
      const currentReturnedAmount = Number((invoice as any).returned_amount || 0)
      const newReturnedAmount = currentReturnedAmount + returnTotal
      // ✅ استخدام original_total للمقارنة الصحيحة (وليس total_amount المُعدَّل)
      const originalTotal = Number((invoice as any).original_total || invoice.total_amount || 0)
      const currentPaidAmount = Number(invoice.paid_amount || 0)
      const newReturnStatus = newReturnedAmount >= originalTotal ? 'full' : 'partial'

      // ✅ حساب المبلغ الجديد للفاتورة بعد المرتجع
      const newInvoiceTotal = Math.max(0, originalTotal - newReturnedAmount)

      // ✅ حساب الصافي والضريبة الجديدة للفاتورة
      const currentSubtotal = Number(invoice.subtotal || 0)
      const currentTax = Number(invoice.tax_amount || 0)
      const newSubtotal = Math.max(0, currentSubtotal - returnSubtotal)
      const newTax = Math.max(0, currentTax - returnTax)

      // ✅ حساب المبلغ الزائد المدفوع (الذي يجب إرجاعه للعميل)
      // 📌 للفواتير المرسلة: لا يوجد مدفوعات، لذلك excessPayment = 0
      const excessPayment = invoice.status === 'sent' ? 0 : Math.max(0, currentPaidAmount - newInvoiceTotal)

      // ✅ تحديث الفاتورة: للفواتير المرسلة، نحدث subtotal و tax_amount و total_amount و status
      if (invoice.status === 'sent') {
        // ✅ تحديد الحالة الصحيحة بناءً على المرتجع
        const newStatus = newInvoiceTotal === 0 ? 'fully_returned' : 'partially_returned'

        const { error: updateInvoiceErr } = await supabase.from("invoices").update({
          subtotal: newSubtotal,
          tax_amount: newTax,
          total_amount: newInvoiceTotal,
          returned_amount: newReturnedAmount,
          return_status: newReturnStatus,
          status: newStatus // ✅ إضافة تحديث الحالة
        }).eq("id", invoice.id)

        if (updateInvoiceErr) {
          console.error("❌ Failed to update sent invoice after return:", updateInvoiceErr)
          throw new Error(`فشل تحديث الفاتورة المرسلة: ${updateInvoiceErr.message}`)
        }
        console.log("✅ Sent invoice updated (amounts corrected):", { invoiceId: invoice.id, newSubtotal, newTax, newInvoiceTotal, newReturnedAmount, newStatus })
      }

      // ✅ عكس المدفوعات الزائدة إذا كان العميل قد دفع أكثر من المبلغ الجديد (للفواتير المدفوعة فقط)
      if (excessPayment > 0 && invoice.status !== 'sent') {
        // إنشاء قيد عكسي للمدفوعات فقط عند الإرجاع النقدي (لتجنب قيود draft بدون أسطر)
        const { data: originalPayments } = await supabase
          .from("payments")
          .select("account_id")
          .eq("invoice_id", invoice.id)
          .not("is_deleted", "eq", true)
          .limit(1)

        const paymentAccountId = originalPayments?.[0]?.account_id || mapping.cash || mapping.bank

        // Create payment reversal journal for all ACTUAL money-out methods (cash + bank_transfer).
        // credit_note: no cash leaves the business — AR naturally holds the credit balance, and
        // customer_credits table records it. No separate payment_reversal journal needed.
        if ((returnMethod === 'cash' || returnMethod === 'bank_transfer') && paymentAccountId) {
          const isBank = returnMethod === 'bank_transfer'
          const { data: paymentReversalEntry, error: prvErr } = await supabase
            .from("journal_entries")
            .insert({
              company_id: mapping.companyId,
              reference_type: "payment_reversal",
              reference_id: invoice.id,
              entry_date: new Date().toISOString().slice(0, 10),
              description: appLang === 'en'
                ? `${isBank ? 'Bank transfer' : 'Cash'} refund for return - Invoice ${invoice.invoice_number} (${excessPayment.toLocaleString()} EGP)`
                : `استرداد ${isBank ? 'بنكي' : 'نقدي'} للمرتجع - الفاتورة ${invoice.invoice_number} (${excessPayment.toLocaleString()} جنيه)`,
              status: "draft",
            })
            .select()
            .single()

          if (!prvErr && paymentReversalEntry) {
            await supabase.from("journal_entry_lines").insert([
              {
                journal_entry_id: paymentReversalEntry.id,
                account_id: mapping.ar,
                debit_amount: excessPayment,
                credit_amount: 0,
                description: appLang === 'en' ? 'AR reversal for customer refund' : 'عكس الذمم المدينة لاسترداد العميل'
              },
              {
                journal_entry_id: paymentReversalEntry.id,
                account_id: paymentAccountId,
                debit_amount: 0,
                credit_amount: excessPayment,
                description: appLang === 'en'
                  ? `${isBank ? 'Bank transfer' : 'Cash'} refund to customer`
                  : `استرداد ${isBank ? 'بنكي' : 'نقدي'} للعميل`
              },
            ])
            await supabase.from("journal_entries").update({ status: "posted" }).eq("id", paymentReversalEntry.id)
          }
        }

        // تحديث paid_amount في الفاتورة (تقليله بمقدار المبلغ الزائد)
        const newPaidAmount = Math.max(0, currentPaidAmount - excessPayment)

        const { error: updateErr1 } = await supabase.from("invoices").update({
          returned_amount: newReturnedAmount,
          return_status: newReturnStatus,
          paid_amount: newPaidAmount,
          status: newInvoiceTotal === 0 ? 'fully_returned' : // ✅ إصلاح: fully_returned بدلاً من cancelled
            newPaidAmount >= newInvoiceTotal ? 'paid' :
              newPaidAmount > 0 ? 'partially_paid' :
                newReturnedAmount > 0 ? 'partially_returned' : 'sent' // ✅ إصلاح: partially_returned
        }).eq("id", invoice.id)

        if (updateErr1) {
          console.error("❌ Failed to update invoice after return:", updateErr1)
          throw new Error(`فشل تحديث الفاتورة: ${updateErr1.message}`)
        }
        console.log("✅ Invoice updated (with excess payment):", { invoiceId: invoice.id, newReturnedAmount, newReturnStatus, newPaidAmount })
      } else if (invoice.status !== 'sent') {
        // لا يوجد مبلغ زائد، تحديث returned_amount و return_status و status
        // 📌 للفواتير المرسلة: تم التحديث مسبقاً في الكود أعلاه
        // ✅ إصلاح: تحديث الحالة تلقائياً بناءً على paid_amount و total_amount و المرتجع
        const newStatus = newInvoiceTotal === 0 ? 'fully_returned' :
          currentPaidAmount >= newInvoiceTotal ? 'paid' :
            currentPaidAmount > 0 ? 'partially_paid' :
              newReturnedAmount > 0 ? 'partially_returned' : 'sent' // ✅ إصلاح: partially_returned للفواتير المرتجعة جزئياً

        const { error: updateErr2 } = await supabase.from("invoices").update({
          returned_amount: newReturnedAmount,
          return_status: newReturnStatus,
          status: newStatus
        }).eq("id", invoice.id)

        if (updateErr2) {
          console.error("❌ Failed to update invoice after return:", updateErr2)
          throw new Error(`فشل تحديث الفاتورة: ${updateErr2.message}`)
        }
        console.log("✅ Invoice updated (no excess payment):", { invoiceId: invoice.id, newReturnedAmount, newReturnStatus, newStatus })
      }

      // ===== Net AR Balance Engine (Enterprise Standard) =====
      // بعد اكتمال المرتجع، نحسب الرصيد الصافي الحقيقي للعميل عبر جميع فواتيره ومدفوعاته
      // ونُنشئ customer_credit فقط إذا أصبح الرصيد دائناً فعلياً (< 0)
      // المرجع: SAP/Oracle AR Subledger standard
      const invoiceCustomerId = invoice.customer_id
      if (returnMethod === 'credit_note' && invoiceCustomerId) {
        try {
          const { syncCustomerCredit } = await import('@/lib/customer-balance')
          const creditResult = await syncCustomerCredit(
            supabase,
            mapping.companyId,
            invoiceCustomerId,
            invoice.id,
            returnNotes || (appLang === 'en'
              ? `Sales return ${returnNumber} - net credit balance`
              : `مرتجع مبيعات ${returnNumber} - رصيد دائن صافٍ`)
          )
          if (creditResult.creditCreated) {
            console.log(`✅ [Net Balance] Customer credit created: ${creditResult.creditAmount.toFixed(2)} ج (net balance: ${creditResult.netBalance.toFixed(2)} ج)`)
          } else {
            console.log(`✅ [Net Balance] No customer credit needed — customer net balance: ${creditResult.netBalance.toFixed(2)} ج (still in debit)`)
          }
        } catch (creditErr) {
          console.warn('⚠️ syncCustomerCredit failed (non-blocking):', creditErr)
        }
      }

      // ===== عكس البونص في حالة المرتجع الكلي =====
      if (newReturnStatus === 'full' && mapping?.companyId) {
        try {
          await fetch("/api/bonuses/reverse", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              invoiceId: invoice.id,
              companyId: mapping.companyId,
              reason: appLang === 'en' ? 'Full sales return' : 'مرتجع مبيعات كامل'
            })
          })
        } catch (bonusErr) {
          console.warn("تعذر عكس البونص:", bonusErr)
        }
      }

      // ===== 🔄 مزامنة أمر البيع المرتبط =====
      await updateLinkedSalesOrderStatus(invoice.id)

      toastActionSuccess(toast, appLang === 'en' ? 'Return' : 'المرتجع', appLang === 'en' ? 'Sales return processed successfully' : 'تم معالجة المرتجع بنجاح')
      setShowPartialReturn(false)
      await loadInvoice()
    } catch (err: any) {
      console.error("Error processing sales return:", err)
      toastActionError(toast, appLang === 'en' ? 'Return' : 'المرتجع', appLang === 'en' ? 'Invoice' : 'الفاتورة', err?.message || '')
    } finally {
      setReturnProcessing(false)
    }
  }

  // ===== 📌 recordInvoicePayment: Atomic API-Driven Payment =====
  // الدفع يتم عبر API محمية تستدعي process_invoice_payment_atomic RPC في قاعدة البيانات.
  // كل العمليات (payment INSERT + AR/Revenue journal + invoice UPDATE) في معاملة DB واحدة.
  // COGS يُعالج بعد نجاح العملية الأساسية (حساب FIFO معقد، لا يمكن دمجه في RPC).
  const recordInvoicePayment = async (amount: number, dateStr: string, method: string, reference: string) => {
    try {
      if (!invoice) return
      if (savingPayment) return
      setSavingPayment(true)

      if (!paymentAccountId) {
        toast({ title: "بيانات غير مكتملة", description: "يرجى اختيار حساب النقد/البنك للدفعة", variant: "destructive" })
        setSavingPayment(false)
        return
      }

      await supabase.auth.refreshSession()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        toast({ title: "انتهت الجلسة", description: "يرجى تسجيل الدخول مرة أخرى", variant: "destructive" })
        setSavingPayment(false)
        window.location.href = "/auth/login"
        return
      }

      // ✅ STEP 1: Atomic core — payment + AR/Revenue journal + invoice update (single DB transaction)
      const atomicRes = await fetch(`/api/invoices/${invoice.id}/record-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          paymentDate: dateStr,
          paymentMethod: method,
          referenceNumber: reference || null,
          accountId: paymentAccountId || null,
          companyId: invoice.company_id || null,
          branchId: invoice.branch_id || null,
          costCenterId: invoice.cost_center_id || null,
          warehouseId: invoice.warehouse_id || null,
        }),
      })

      const atomicResult = await atomicRes.json()

      if (!atomicRes.ok || !atomicResult.success) {
        const errMsg = atomicResult?.error || "فشل تسجيل الدفعة"
        throw new Error(errMsg)
      }

      const newStatus: string = atomicResult.newStatus

      // ✅ STEP 2: COGS (post-atomic — complex FIFO, best-effort)
      // لا تؤثر على الدفعة إذا فشلت (الدفعة والقيود الأساسية تمت بنجاح)
      try {
        const mapping = await findAccountIds()
        if (mapping) {
          const paidRatio = Number(amount) / Number(invoice.total_amount || 1)
          const clearResult = await clearThirdPartyInventory({
            supabase,
            companyId: mapping.companyId,
            invoiceId: invoice.id,
            paidRatio,
            branchId: invoice.branch_id || null,
            costCenterId: invoice.cost_center_id || null
          })

          if (clearResult.success && clearResult.totalCOGS > 0) {
            const cogsCheck = await checkDuplicateJournalEntry(supabase, mapping.companyId, "invoice_cogs", invoice.id)
            if (!cogsCheck.exists) {
              const { data: cogsEntry, error: cogsEntryError } = await supabase
                .from("journal_entries")
                .insert({
                  company_id: mapping.companyId,
                  reference_type: "invoice_cogs",
                  reference_id: invoice.id,
                  entry_date: dateStr,
                  description: `تكلفة البضاعة المباعة - ${invoice.invoice_number}`,
                  status: "draft",
                  branch_id: invoice.branch_id || null,
                  cost_center_id: invoice.cost_center_id || null,
                })
                .select().single()

              if (!cogsEntryError && cogsEntry && mapping.cogs && mapping.inventory) {
                await supabase.from("journal_entry_lines").insert([
                  { journal_entry_id: cogsEntry.id, account_id: mapping.cogs, debit_amount: clearResult.totalCOGS, credit_amount: 0, description: "تكلفة البضاعة المباعة", branch_id: invoice.branch_id || null, cost_center_id: invoice.cost_center_id || null },
                  { journal_entry_id: cogsEntry.id, account_id: mapping.inventory, debit_amount: 0, credit_amount: clearResult.totalCOGS, description: "خصم من المخزون", branch_id: invoice.branch_id || null, cost_center_id: invoice.cost_center_id || null },
                ])
                await supabase.from("journal_entries").update({ status: "posted" }).eq("id", cogsEntry.id)
              }
            }
          }

          const { data: existingCOGS } = await supabase
            .from("cogs_transactions").select("id")
            .eq("source_id", invoice.id).eq("source_type", "invoice").limit(1)

          if (!existingCOGS || existingCOGS.length === 0) {
            const { data: thirdPartyItems } = await supabase
              .from("third_party_inventory").select("id")
              .eq("invoice_id", invoice.id).eq("company_id", mapping.companyId).limit(1)

            if (!thirdPartyItems || thirdPartyItems.length === 0) {
              await deductInventoryOnly()
            }
          }

          // Bonus (fully paid)
          if (newStatus === "paid") {
            try {
              const bonusRes = await fetch("/api/bonuses", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ invoiceId: invoice.id, companyId: mapping.companyId })
              })
              const bonusData = await bonusRes.json()
              if (bonusRes.ok && bonusData.bonus) {
                console.log("✅ تم حساب البونص:", bonusData.bonus.bonus_amount)
              }
            } catch (bonusErr) {
              console.warn("تحذير: تعذر حساب البونص (غير حرج):", bonusErr)
            }
          }
        }
      } catch (cogsErr: any) {
        console.warn("⚠️ COGS post-processing failed (non-blocking — payment succeeded):", cogsErr?.message)
      }

      await loadInvoice()
      setShowPayment(false)
      setPaymentAccountId("")
      toast({ title: "تم تسجيل الدفعة بنجاح", description: "تم إضافة قيد الدفع (Cash/AR) ذرياً" })
    } catch (err: any) {
      console.error("خطأ أثناء تسجيل الدفعة:", err)
      const errMsg = err?.message || err?.error_description || "تعذر تسجيل الدفعة"
      toast({ title: "خطأ", description: errMsg, variant: "destructive" })
    } finally {
      setSavingPayment(false)
    }
  }

  const reverseInventoryForInvoice = async () => {
    try {
      if (!invoice) return
      const mapping = await findAccountIds()
      if (!mapping || !mapping.inventory || !mapping.cogs) return

      const { data: invItems } = await supabase
        .from("invoice_items")
        .select("product_id, quantity, products(cost_price, item_type)")
        .eq("invoice_id", invoiceId)

      // فلترة المنتجات فقط (وليس الخدمات)
      const productItems = (invItems || []).filter(
        (it: any) => !!it.product_id && it.products?.item_type !== "service",
      )

      // عكس حركة المخزون دائماً عند الرجوع من sent/paid إلى draft/cancelled
      const reversalTx = productItems.map((it: any) => ({
        company_id: mapping.companyId,
        product_id: it.product_id,
        transaction_type: "sale_reversal",
        quantity_change: Number(it.quantity || 0),
        reference_id: invoiceId,
        notes: `عكس بيع للفاتورة ${invoice.invoice_number}`,
      }))

      if (reversalTx.length > 0) {
        const { error: invErr } = await supabase
          .from("inventory_transactions")
          .insert(reversalTx)
        if (invErr) console.warn("Failed inserting sale reversal inventory transactions", invErr)
        // ملاحظة: لا حاجة لتحديث products.quantity_on_hand يدوياً
        // لأن الـ Database Trigger (trg_apply_inventory_insert) يفعل ذلك تلقائياً
      }

      // 📌 النمط المحاسبي الصارم: لا COGS Reversal
      // COGS يُحسب عند الحاجة من cost_price × quantity المباع
      // لا قيد COGS في أي مرحلة، لذلك لا حاجة لعكسه
    } catch (e) {
      console.warn("Error reversing inventory for invoice", e)
    }
  }

  // ===== دالة خصم المخزون فقط بدون قيود محاسبية =====
  // 📌 نظام بضائع لدى الغير (Goods with Third Party)
  // تُستخدم عند إرسال الفاتورة (حالة sent)
  // النظام الجديد: يقوم باستدعاء الـ API الخاص بالترحيل الذري
  // والذي يتحقق من شركة الشحن، ويرسل الإشعارات، ويقوم بترحيل الإيراد (ويؤجل خصم المخزون إن تطلب اعتماد مدير المخزن).
  const deductInventoryOnly = async () => {
    try {
      if (!invoice) return

      console.log("📌 Calling Atomic Posting API...")
      const response = await fetch(`/api/invoices/${invoiceId}/post`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        console.error("❌ Atomic Posting Failed:", result.error)
        throw new Error(result.error || "فشل ترحيل الفاتورة ذرياً")
      }

      console.log("✅ Atomic Posting Successful:", result.data)

    } catch (err) {
      console.error("Error executing atomic posting for invoice:", err)
    }
  }

  // ===== دالة عكس جميع القيود المحاسبية للفاتورة =====
  // تُستخدم عند إلغاء الفاتورة أو إعادتها لمسودة
  // ✅ Soft Delete: يتم تعيين is_deleted=true و deleted_at بدلاً من الحذف الدائم
  // ✅ Audit Trail: البيانات محفوظة للتدقيق - لا حذف نهائي
  const reverseInvoiceJournals = async () => {
    try {
      if (!invoice) return
      const mapping = await findAccountIds()
      if (!mapping) return

      // جلب قيود الفاتورة الأصلية (جميع الأنواع) بما فيها قيد COGS
      const { data: invoiceEntries } = await supabase
        .from("journal_entries")
        .select("id, description, entry_date, reference_type")
        .eq("company_id", mapping.companyId)
        .eq("reference_id", invoiceId)
        .in("reference_type", ["invoice", "invoice_payment", "invoice_ar", "invoice_cogs", "sales_return", "payment_reversal"])
        .is("deleted_at", null) // فقط القيود غير المحذوفة سابقاً

      if (invoiceEntries && invoiceEntries.length > 0) {
        const entryIds = invoiceEntries.map((e: any) => e.id)
        const deletedAt = new Date().toISOString()

        // ✅ Soft Delete: تعيين is_deleted=true و deleted_at (للحفاظ على Audit Trail)
        await supabase
          .from("journal_entries")
          .update({ is_deleted: true, deleted_at: deletedAt })
          .in("id", entryIds)

        // ✅ Audit Log: تسجيل عملية الإلغاء/الإرجاع
        const { data: { user } } = await supabase.auth.getUser()
        if (user?.id && invoice.company_id) {
          try {
            await supabase.from("audit_logs").insert({
              company_id: invoice.company_id,
              user_id: user.id,
              action: "SOFT_DELETE",
              target_table: "journal_entries",
              record_id: invoiceId,
              record_identifier: invoice.invoice_number,
              old_data: {
                reversed_entries: entryIds.length,
                entry_types: invoiceEntries.map((e: any) => e.reference_type),
                reason: "invoice_cancelled_or_reverted_to_draft"
              },
              new_data: { is_deleted: true, deleted_at: deletedAt }
            })
          } catch (auditErr) {
            console.warn("Audit log failed (non-blocking):", auditErr)
          }
        }

        console.log(`✅ Soft-deleted ${entryIds.length} journal entries for invoice ${invoice.invoice_number}`)
      }
    } catch (err) {
      console.error("Error reversing invoice journals:", err)
    }
  }

  // ===== 📌 دالة إنشاء جميع القيود المحاسبية للفاتورة عند الدفع =====
  // ===== 📌 Cash Basis (أساس النقدية) =====
  // الإيراد يُسجل عند الدفع فقط (وليس عند Sent)
  // هذه الدالة للتوافق مع البيانات القديمة التي ليس لها قيود
  const postAllInvoiceJournals = async (paymentAmount: number, paymentDate: string, paymentAccountId: string) => {
    try {
      if (!invoice) return
      const mapping = await findAccountIds()
      if (!mapping || !mapping.ar || !mapping.revenue) {
        console.warn("Account mapping incomplete. Skipping journal posting.")
        return
      }

      // 🔐 GOVERNANCE: التحقق من عدم وجود قيد إيراد سابق للفاتورة
      const invoiceEntryCheck = await checkDuplicateJournalEntry(
        supabase,
        mapping.companyId,
        "invoice",
        invoiceId
      )

      // ===== 1) قيد المبيعات والذمم (للتوافق مع البيانات القديمة) =====
      // Debit: AR / Credit: Revenue + VAT + Shipping
      // هذا يحدث فقط إذا لم يكن هناك قيد فاتورة سابق (بيانات قديمة)
      if (!invoiceEntryCheck.exists) {
        const { data: entry, error: entryError } = await supabase
          .from("journal_entries")
          .insert({
            company_id: mapping.companyId,
            reference_type: "invoice",
            reference_id: invoiceId,
            entry_date: invoice.invoice_date, // تاريخ الفاتورة وليس الدفع
            description: `فاتورة مبيعات ${invoice.invoice_number}`,
            status: "draft",
            branch_id: invoice.branch_id || null,
            cost_center_id: invoice.cost_center_id || null,
            warehouse_id: invoice.warehouse_id || null,
          })
          .select()
          .single()

        if (!entryError && entry) {
          const lines: any[] = [
            // من ح/ الذمم المدينة (العملاء)
            {
              journal_entry_id: entry.id,
              account_id: mapping.ar,
              debit_amount: invoice.total_amount,
              credit_amount: 0,
              description: "الذمم المدينة (العملاء)",
              branch_id: invoice.branch_id || null,
              cost_center_id: invoice.cost_center_id || null,
            },
            // إلى ح/ المبيعات (الإيراد)
            {
              journal_entry_id: entry.id,
              account_id: mapping.revenue,
              debit_amount: 0,
              credit_amount: invoice.subtotal,
              description: "إيراد المبيعات",
              branch_id: invoice.branch_id || null,
              cost_center_id: invoice.cost_center_id || null,
            },
          ]

          // ===== 2) إيراد الشحن (إن وجد) =====
          if (Number(invoice.shipping || 0) > 0 && mapping.shippingAccount) {
            lines.push({
              journal_entry_id: entry.id,
              account_id: mapping.shippingAccount,
              debit_amount: 0,
              credit_amount: Number(invoice.shipping || 0),
              description: "إيراد الشحن",
            })
          } else if (Number(invoice.shipping || 0) > 0) {
            lines[1].credit_amount += Number(invoice.shipping || 0)
          }

          // ===== 3) ضريبة القيمة المضافة (إن وجدت) =====
          if (mapping.vatPayable && invoice.tax_amount && invoice.tax_amount > 0) {
            lines.push({
              journal_entry_id: entry.id,
              account_id: mapping.vatPayable,
              debit_amount: 0,
              credit_amount: invoice.tax_amount,
              description: "ضريبة القيمة المضافة",
            })
          }

          await supabase.from("journal_entry_lines").insert(lines)
          await supabase.from("journal_entries").update({ status: "posted" }).eq("id", entry.id)
          console.log(`✅ تم إنشاء قيد الإيراد للفاتورة ${invoice.invoice_number} (توافق مع بيانات قديمة)`)
        }
      }

      // 📌 النمط المحاسبي الصارم: لا COGS
      // COGS يُحسب عند الحاجة من cost_price × quantity المباع

      // ===== 4) قيد الدفع: يُنشأ من trigger عند INSERT في payments — لا إنشاء يدوي هنا =====
    } catch (err) {
      console.error("Error posting all invoice journals:", err)
    }
  }

  // التحقق من صلاحية القراءة أولاً (الأولوية للأمان)
  if (permRead === false) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 dark:bg-red-900 mb-4">
              <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
            <p className="text-lg font-semibold text-red-600 dark:text-red-400">
              {appLang === 'en' ? 'Access Denied' : 'غير مصرح بالوصول'}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              {appLang === 'en'
                ? 'You do not have permission to view this invoice.'
                : 'ليس لديك صلاحية لعرض هذه الفاتورة.'}
            </p>
            <Button asChild className="mt-4" variant="outline">
              <Link href="/invoices">
                {appLang === 'en' ? 'Go to Invoices' : 'الذهاب للفواتير'}
              </Link>
            </Button>
          </div>
        </main>
      </div>
    )
  }

  // عرض شاشة التحميل فقط إذا كانت الصلاحيات لم تُحدد بعد أو البيانات لا تزال تُحمَّل
  if (isLoading || permRead === null) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 print-area overflow-x-hidden">
          <p className="text-center py-8">جاري التحميل...</p>
        </main>
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
          <p className="text-center py-8 text-red-600">{appLang === 'en' ? 'Invoice not found' : 'لم يتم العثور على الفاتورة'}</p>
        </main>
      </div>
    )
  }

  // Calculate totals for payments and returns
  // 🔧 الدفعات الموجبة = المدفوع للفاتورة، الدفعات السالبة = الصرف للعميل
  const totalPaidAmount = invoicePayments.reduce((sum, p) => {
    const amt = Number(p.amount || 0)
    return sum + (amt > 0 ? amt : 0)  // فقط الدفعات الموجبة
  }, 0)
  const totalRefundedToCustomer = invoicePayments.reduce((sum, p) => {
    const amt = Number(p.amount || 0)
    return sum + (amt < 0 ? Math.abs(amt) : 0)  // الدفعات السالبة = صرف للعميل
  }, 0)
  // 🔧 إصلاح: المرتجعات تؤخذ من invoices.returned_amount (المصدر الموثوق)
  // لأن invoice.total_amount أصلاً تم تقليله بقيمة المرتجع
  const totalReturnsAmount = Number((invoice as any).returned_amount || 0)
  // صافي المستحق = إجمالي الفاتورة - المرتجعات (مع مراعاة فواتير "sent" التي يُخفَّض total_amount فيها مباشرة)
  const netDueAmount = (totalReturnsAmount > 0 && invoice.total_amount < totalReturnsAmount)
    ? invoice.total_amount                                          // total_amount مُخفَّض سابقاً (فواتير sent)
    : Math.max(0, invoice.total_amount - totalReturnsAmount)        // total_amount أصلي (فواتير paid/partially_paid)
  // صافي المتبقي = صافي المستحق - إجمالي المدفوع
  const netRemainingAmount = Math.max(0, netDueAmount - totalPaidAmount)

  // 💰 رصيد العميل الدائن المتاح:
  // المصدر الوحيد الموثوق هو جدول customer_credits (status='active') لأنه:
  // 1. يعكس المبالغ المُصرَفة فعلاً (used_amount) حتى لو كانت دفعة الصرف غير مرتبطة بـ invoice_id
  // 2. يمنع عرض رصيد صُرف سابقاً بسبب خطأ حسابي في totalRefundedToCustomer
  const customerCreditAmount = customerCreditFromDB

  // Derive display breakdowns similar to creation page
  const safeItems = Array.isArray(items) ? items : []
  const netItemsSubtotal = safeItems.reduce((sum, it) => sum + Number(it.line_total || 0), 0)
  const discountBeforeTax = invoice.discount_position === "before_tax" ? Math.max(0, netItemsSubtotal - Number(invoice.subtotal || 0)) : 0
  const shipping = Number(invoice.shipping || 0)
  const adjustment = Number(invoice.adjustment || 0)
  const shippingTaxRate = Math.max(0, Number(invoice.shipping_tax_rate || 0))
  const shippingTaxAmount = shipping > 0 && shippingTaxRate > 0 ? (shipping * shippingTaxRate) / 100 : 0
  const discountAfterTax = invoice.discount_position === "after_tax"
    ? Math.max(0, netItemsSubtotal + Number(invoice.tax_amount || 0) + shipping + adjustment - Number(invoice.total_amount || 0))
    : 0

  // Tax summary grouped by rate for items
  const taxSummary: { rate: number; amount: number }[] = []
  const taxMap: Record<number, number> = {}
  safeItems.forEach((it) => {
    const rate = Math.max(0, Number(it.tax_rate || 0))
    const net = Math.max(0, Number(it.line_total || 0))
    const taxAmt = (net * rate) / 100
    taxMap[rate] = (taxMap[rate] || 0) + taxAmt
  })
  Object.entries(taxMap)
    .sort(([a], [b]) => Number(a) - Number(b))
    .forEach(([rate, amt]) => taxSummary.push({ rate: Number(rate), amount: amt }))
  if (shippingTaxAmount > 0) {
    taxSummary.push({ rate: shippingTaxRate, amount: shippingTaxAmount })
  }

  const companyLogo = companyLogoUrl
  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      {/* Main Content - تحسين للهاتف */}
      <main ref={printAreaRef} className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 print-area overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 print:space-y-4 max-w-full">
          {/* ✅ Unified Page Header */}
          <ERPPageHeader
            title={appLang === 'en' ? `Invoice #${invoice.invoice_number}` : `الفاتورة #${invoice.invoice_number}`}
            description={appLang === 'en' ? `Issue date: ${new Date(invoice.invoice_date).toLocaleDateString('en')}` : `تاريخ الإصدار: ${new Date(invoice.invoice_date).toLocaleDateString('ar')}`}
            variant="detail"
            backHref="/invoices"
            backLabel={appLang === 'en' ? 'Back to Invoices' : 'العودة للفواتير'}
            lang={appLang}
            actions={
              <div className="flex items-center gap-2 flex-wrap">
                {/* Previous/Next Navigation */}
                {prevInvoiceId && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/invoices/${prevInvoiceId}`}>
                      {appLang === 'en' ? '← Previous' : 'السابق ←'}
                    </Link>
                  </Button>
                )}
                {nextInvoiceId && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/invoices/${nextInvoiceId}`}>
                      {appLang === 'en' ? 'Next →' : '→ التالي'}
                    </Link>
                  </Button>
                )}

                {/* Edit Button */}
                <Button
                  asChild={permUpdate && invoice.status !== 'paid' && invoice.status !== 'partially_paid'}
                  variant="outline"
                  size="sm"
                  disabled={!permUpdate || invoice.status === 'paid' || invoice.status === 'partially_paid'}
                  title={
                    !permUpdate
                      ? (appLang === 'en' ? 'No permission to edit' : 'لا توجد صلاحية للتعديل')
                      : (invoice.status === 'paid' || invoice.status === 'partially_paid')
                        ? (appLang === 'en' ? 'Cannot edit paid invoice. Use Returns instead.' : 'لا يمكن تعديل الفاتورة المدفوعة. استخدم المرتجعات بدلاً من ذلك.')
                        : undefined
                  }
                >
                  {permUpdate && invoice.status !== 'paid' && invoice.status !== 'partially_paid' ? (
                    <Link href={`/invoices/${invoice.id}/edit`}>
                      {appLang === 'en' ? 'Edit' : 'تعديل'}
                    </Link>
                  ) : (
                    <span>{appLang === 'en' ? 'Edit' : 'تعديل'}</span>
                  )}
                </Button>

                {/* Print Button */}
                <Button onClick={handlePrint} variant="outline" size="sm">
                  {appLang === 'en' ? 'Print' : 'طباعة'}
                </Button>

                {/* Download PDF Button */}
                <Button onClick={handleDownloadPDF} variant="outline" size="sm">
                  {appLang === 'en' ? 'Download PDF' : 'تنزيل PDF'}
                </Button>
              </div>
            }
          />

          <Card ref={invoiceContentRef} className="print:shadow-none print:border-0 bg-white">
            <CardContent className="pt-6 space-y-6 print:p-0">
              {/* رأس الفاتورة - Invoice Header */}
              <div className="border-b-2 border-gray-200 pb-6 print:pb-4">
                <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                  {/* معلومات الشركة */}
                  <div className="flex items-start gap-4">
                    {companyLogo ? (
                      <img src={companyLogo} crossOrigin="anonymous" alt="Company Logo" className="h-20 w-20 rounded object-cover border print:h-16 print:w-16" style={{ width: '80px', height: '80px', objectFit: 'cover' }} />
                    ) : (
                      <div className="h-20 w-20 rounded bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 dark:text-gray-500 print:h-16 print:w-16">
                        <span className="text-2xl font-bold">{invoice.companies?.name?.charAt(0) || 'C'}</span>
                      </div>
                    )}
                    <div>
                      <h2 className="text-xl font-bold text-gray-900 dark:text-white print:text-black">{invoice.companies?.name}</h2>
                      <p className="text-sm text-gray-600 dark:text-gray-400 print:text-gray-800">{invoice.companies?.email}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400 print:text-gray-800">{invoice.companies?.phone}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400 print:text-gray-800">{invoice.companies?.address}</p>
                    </div>
                  </div>

                  {/* عنوان الفاتورة ورقمها */}
                  <div className="text-right md:text-left">
                    <h1 className="text-3xl font-bold text-blue-600 print:text-blue-800">{appLang === 'en' ? 'INVOICE' : 'فاتورة'}</h1>
                    <p className="text-xl font-semibold mt-1">#{invoice.invoice_number}</p>
                  </div>
                </div>
              </div>

              {/* معلومات الفاتورة والعميل */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 print:gap-4">
                {/* معلومات العميل */}
                <div className="md:col-span-2 bg-gray-50 dark:bg-slate-800 rounded-lg p-4 print:bg-gray-100 print:p-3">
                  <h3 className="font-semibold mb-3 text-gray-700 dark:text-gray-300 print:text-gray-800 border-b pb-2">{appLang === 'en' ? 'Bill To:' : 'فاتورة إلى:'}</h3>
                  <div className="space-y-2">
                    {/* 📸 استخدام Snapshot إذا كان موجوداً، وإلا استخدام البيانات الحية */}
                    {(() => {
                      const customerName = invoice.customer_name_snapshot || invoice.customers?.name || '-'
                      const customerPhone = invoice.customer_phone_snapshot || invoice.customers?.phone
                      const customerEmail = invoice.customer_email_snapshot || invoice.customers?.email
                      const customerAddress = invoice.customer_address_snapshot || invoice.customers?.address
                      const customerCity = invoice.customer_city_snapshot || invoice.customers?.city
                      const customerCountry = invoice.customer_country_snapshot || invoice.customers?.country
                      const customerTaxId = invoice.customer_tax_id_snapshot || invoice.customers?.tax_id
                      
                      return (
                        <>
                          {/* اسم العميل */}
                          <div className="flex items-center gap-2">
                            <span className="text-lg font-bold text-gray-900 dark:text-white print:text-black">{customerName}</span>
                          </div>
                          {/* رقم التليفون */}
                          {customerPhone && (
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-gray-500 dark:text-gray-400 print:text-gray-600">{appLang === 'en' ? 'Phone:' : 'الهاتف:'}</span>
                              <span className="font-medium text-gray-700 dark:text-gray-300 print:text-gray-800 dir-ltr">{customerPhone}</span>
                            </div>
                          )}
                          {/* البريد الإلكتروني */}
                          {customerEmail && (
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-gray-500 dark:text-gray-400 print:text-gray-600">{appLang === 'en' ? 'Email:' : 'البريد:'}</span>
                              <span className="font-medium text-gray-700 dark:text-gray-300 print:text-gray-800">{customerEmail}</span>
                            </div>
                          )}
                          {/* العنوان */}
                          {customerAddress && (
                            <div className="flex items-start gap-2 text-sm">
                              <span className="text-gray-500 dark:text-gray-400 print:text-gray-600">{appLang === 'en' ? 'Address:' : 'العنوان:'}</span>
                              <span className="font-medium text-gray-700 dark:text-gray-300 print:text-gray-800">
                                {customerAddress}
                                {customerCity && `, ${customerCity}`}
                                {customerCountry && `, ${customerCountry}`}
                              </span>
                            </div>
                          )}
                          {/* الرقم الضريبي */}
                          {customerTaxId && (
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-gray-500 dark:text-gray-400 print:text-gray-600">{appLang === 'en' ? 'Tax ID:' : 'الرقم الضريبي:'}</span>
                              <span className="font-medium text-gray-700 dark:text-gray-300 print:text-gray-800">{customerTaxId}</span>
                            </div>
                          )}
                        </>
                      )
                    })()}
                  </div>
                </div>

                {/* تفاصيل الفاتورة */}
                <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-4 print:bg-gray-100 print:p-3">
                  <table className="w-full text-sm">
                    <tbody>
                      <tr>
                        <td className="py-1 font-medium text-gray-600 dark:text-gray-400 print:text-gray-700">{appLang === 'en' ? 'Invoice Number:' : 'رقم الفاتورة:'}</td>
                        <td className="py-1 text-right font-semibold">{invoice.invoice_number}</td>
                      </tr>
                      <tr>
                        <td className="py-1 font-medium text-gray-600 dark:text-gray-400 print:text-gray-700">{appLang === 'en' ? 'Invoice Date:' : 'تاريخ الفاتورة:'}</td>
                        <td className="py-1 text-right">{new Date(invoice.invoice_date).toLocaleDateString(appLang === 'en' ? 'en-GB' : 'ar-EG')}</td>
                      </tr>
                      <tr>
                        <td className="py-1 font-medium text-gray-600 dark:text-gray-400 print:text-gray-700">{appLang === 'en' ? 'Due Date:' : 'تاريخ الاستحقاق:'}</td>
                        <td className="py-1 text-right">{new Date(invoice.due_date).toLocaleDateString(appLang === 'en' ? 'en-GB' : 'ar-EG')}</td>
                      </tr>
                      <tr>
                        <td className="py-1 font-medium text-gray-600 dark:text-gray-400 print:text-gray-700">{appLang === 'en' ? 'Status:' : 'الحالة:'}</td>
                        <td className="py-1 text-right">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${invoice.status === 'paid' ? 'bg-green-100 text-green-800 print:bg-green-50' :
                            invoice.status === 'sent' ? 'bg-blue-100 text-blue-800 print:bg-blue-50' :
                              invoice.status === 'overdue' ? 'bg-red-100 text-red-800 print:bg-red-50' :
                                invoice.status === 'cancelled' ? 'bg-red-100 text-red-800 print:bg-red-50' :
                                  invoice.status === 'invoiced' ? 'bg-gray-100 text-gray-800 print:bg-gray-50' :
                                    invoice.status === 'fully_returned' ? 'bg-purple-100 text-purple-800 print:bg-purple-50' :
                                      invoice.status === 'partially_returned' ? 'bg-orange-100 text-orange-800 print:bg-orange-50' :
                                        invoice.status === 'partially_paid' ? 'bg-yellow-100 text-yellow-800 print:bg-yellow-50' :
                                          'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200 print:bg-gray-50'
                            }`}>
                            {invoice.status === 'paid' ? (appLang === 'en' ? 'Paid' : 'مدفوعة') :
                              invoice.status === 'sent' ? (appLang === 'en' ? 'Sent' : 'مرسلة') :
                                invoice.status === 'overdue' ? (appLang === 'en' ? 'Overdue' : 'متأخرة') :
                                  invoice.status === 'draft' ? (appLang === 'en' ? 'Draft' : 'مسودة') :
                                    invoice.status === 'invoiced' ? (appLang === 'en' ? 'Invoiced' : 'تم إنشاء فاتورة') :
                                      invoice.status === 'cancelled' ? (appLang === 'en' ? 'Cancelled' : 'ملغاة') :
                                        invoice.status === 'fully_returned' ? (appLang === 'en' ? 'Fully Returned' : 'مرتجع بالكامل') :
                                          invoice.status === 'partially_returned' ? (appLang === 'en' ? 'Partially Returned' : 'مرتجع جزئياً') :
                                            invoice.status === 'partially_paid' ? (appLang === 'en' ? 'Partially Paid' : 'مدفوعة جزئياً') :
                                              invoice.status}
                          </span>
                        </td>
                      </tr>
                      {branchName && (
                        <tr>
                          <td className="py-1 font-medium text-gray-600 dark:text-gray-400 print:text-gray-700">{appLang === 'en' ? 'Branch:' : 'الفرع:'}</td>
                          <td className="py-1 text-right">{branchName}</td>
                        </tr>
                      )}
                      {costCenterName && (
                        <tr className="print:hidden">
                          <td className="py-1 font-medium text-gray-600 dark:text-gray-400 print:text-gray-700">{appLang === 'en' ? 'Cost Center:' : 'مركز التكلفة:'}</td>
                          <td className="py-1 text-right">{costCenterName}</td>
                        </tr>
                      )}
                      {linkedSalesOrder && (
                        <tr className="print:hidden">
                          <td className="py-1 font-medium text-gray-600 dark:text-gray-400 print:text-gray-700">{appLang === 'en' ? 'Sales Order:' : 'أمر البيع:'}</td>
                          <td className="py-1 text-right">
                            <Link href={`/sales-orders/${linkedSalesOrder.id}`} className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline flex items-center gap-1 justify-end">
                              <ExternalLink className="w-3 h-3" />
                              <span>{linkedSalesOrder.so_number}</span>
                            </Link>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* جدول المنتجات - Items Table */}
              <div className="overflow-x-auto print:overflow-visible">
                <table className="min-w-full w-full text-xs sm:text-sm print:text-xs border-collapse">
                  <thead>
                    <tr className="bg-blue-600 text-white print:bg-gray-100 print:text-black print:border-b-2 print:border-gray-300">
                      <th className="px-3 py-2 text-center border border-blue-500 print:border-gray-300 w-[50px]">#</th>
                      <th className="px-3 py-2 text-right border border-blue-500 print:border-gray-300">{appLang === 'en' ? 'Product' : 'المنتج'}</th>
                      <th className="px-3 py-2 text-center border border-blue-500 print:border-gray-300 w-[70px]">{appLang === 'en' ? 'Qty' : 'الكمية'}</th>
                      <th className="px-3 py-2 text-center border border-blue-500 print:border-gray-300 w-[70px]">{appLang === 'en' ? 'Returned' : 'المرتجع'}</th>
                      <th className="px-3 py-2 text-center border border-blue-500 print:border-gray-300 w-[70px]">{appLang === 'en' ? 'Net Qty' : 'الصافي'}</th>
                      <th className="px-3 py-2 text-right border border-blue-500 print:border-gray-300 w-[100px]">{appLang === 'en' ? 'Unit Price' : 'سعر الوحدة'}</th>
                      <th className="px-3 py-2 text-center border border-blue-500 print:border-gray-300 w-[70px]">{appLang === 'en' ? 'Disc%' : 'خصم%'}</th>
                      <th className="px-3 py-2 text-center border border-blue-500 print:border-gray-300 w-[70px]">{appLang === 'en' ? 'Tax%' : 'ضريبة%'}</th>
                      <th className="px-3 py-2 text-right border border-blue-500 print:border-gray-300 w-[120px]">{appLang === 'en' ? 'Total' : 'الإجمالي'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, index) => {
                      const returnedQty = Number(item.returned_quantity || 0)
                      const effectiveQty = item.quantity - returnedQty
                      // حساب الإجمالي الأصلي من الكمية الأصلية
                      const originalTotal = (item.quantity * item.unit_price * (1 - (item.discount_percent || 0) / 100)) * (1 + item.tax_rate / 100)
                      // حساب الإجمالي الصافي من الكمية الصافية
                      const netTotal = (effectiveQty * item.unit_price * (1 - (item.discount_percent || 0) / 100)) * (1 + item.tax_rate / 100)
                      return (
                        <tr key={item.id} className={`border ${index % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-gray-50 dark:bg-slate-900'} print:bg-white`}>
                          <td className="px-3 py-2 text-center border border-gray-200 text-gray-500 dark:text-gray-400 print:text-black w-[50px]">{index + 1}</td>
                          <td className="px-3 py-2 border border-gray-200">
                            <div className="font-medium print:text-black">{item.products?.name}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 print:text-gray-600">SKU: {item.products?.sku}</div>
                          </td>
                          <td className="px-3 py-2 text-center border border-gray-200 print:text-black w-[70px]">{item.quantity}</td>
                          <td className="px-3 py-2 text-center border border-gray-200 w-[70px]">
                            {returnedQty > 0 ? (
                              <span className="text-red-600 font-medium print:text-black">-{returnedQty}</span>
                            ) : (
                              <span className="text-gray-400 dark:text-gray-500 print:text-gray-300">-</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center border border-gray-200 font-medium print:text-black w-[70px]">
                            {returnedQty > 0 ? effectiveQty : item.quantity}
                          </td>
                          <td className="px-3 py-2 text-right border border-gray-200 print:text-black w-[100px]">{item.unit_price.toFixed(2)}</td>
                          <td className="px-3 py-2 text-center border border-gray-200 print:text-black w-[70px]">{(item.discount_percent || 0) > 0 ? `${(item.discount_percent || 0).toFixed(1)}%` : '-'}</td>
                          <td className="px-3 py-2 text-center border border-gray-200 print:text-black w-[70px]">{item.tax_rate > 0 ? `${item.tax_rate}%` : '-'}</td>
                          <td className="px-3 py-2 text-right border border-gray-200 font-semibold print:text-black w-[120px]">
                            {returnedQty > 0 ? (
                              <>
                                <span className="line-through text-gray-400 dark:text-gray-500 text-xs print:text-gray-400">{originalTotal.toFixed(2)}</span>
                                <div className="text-green-600 print:text-black">{netTotal.toFixed(2)}</div>
                              </>
                            ) : (
                              originalTotal.toFixed(2)
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* ملخص الفاتورة - Invoice Summary */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t pt-6 print:pt-4">
                {/* الملاحظات أو الشروط */}
                <div className="print:text-xs">
                  {invoice.tax_inclusive && (
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded border border-yellow-200 print:bg-yellow-50 print:p-2">
                      <p className="text-xs text-yellow-800 dark:text-yellow-200 print:text-yellow-900">
                        {appLang === 'en' ? 'Prices shown are tax inclusive' : 'الأسعار المعروضة شاملة الضريبة'}
                      </p>
                    </div>
                  )}
                  <div className="mt-4 text-xs text-gray-500 dark:text-gray-400 print:text-gray-700">
                    <p className="font-medium mb-1">{appLang === 'en' ? 'Terms & Conditions:' : 'الشروط والأحكام:'}</p>
                    <p>{appLang === 'en' ? 'Payment is due within the specified period.' : 'الدفع مستحق خلال الفترة المحددة.'}</p>
                  </div>
                </div>

                {/* ملخص المبالغ - عرض محسّن للمرتجعات (Invoice Lifecycle UI Rules) */}
                <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-4 print:bg-transparent print:p-0 print:border print:border-gray-200 print:mt-4">
                  {(() => {
                    // حسابات العرض فقط (UI Only) - بدون تغيير في DB
                    const returnedAmount = Number((invoice as any).returned_amount || 0)
                    const hasReturnsDisplay = returnedAmount > 0

                    // حساب مجموع البنود من الكميات الأصلية (قبل المرتجعات)
                    const itemsSubtotalOriginal = items.reduce((sum, item) => {
                      const originalTotal = (item.quantity * item.unit_price * (1 - (item.discount_percent || 0) / 100)) * (1 + item.tax_rate / 100)
                      return sum + originalTotal
                    }, 0)

                    // حساب الإجمالي الأصلي للفاتورة (مع الخصم والشحن والتعديل)
                    // نستخدم نفس منطق الخصم المخزن في الفاتورة
                    const invoiceDiscountValue = Number(invoice.discount_value || 0)
                    const invoiceDiscountType = invoice.discount_type
                    const invoiceShipping = Number(invoice.shipping || 0)
                    const invoiceShippingTax = invoiceShipping * (Number(invoice.shipping_tax_rate || 0) / 100)
                    const invoiceAdjustment = Number(invoice.adjustment || 0)

                    // حساب الخصم على مستوى الفاتورة
                    let invoiceLevelDiscount = 0
                    if (invoiceDiscountType === 'percent') {
                      invoiceLevelDiscount = itemsSubtotalOriginal * (invoiceDiscountValue / 100)
                    } else if (invoiceDiscountType === 'amount') {
                      invoiceLevelDiscount = invoiceDiscountValue
                    }

                    // الإجمالي الأصلي الصحيح:
                    // 1. استخدم original_total المخزن إذا كان متاحاً (الأكثر دقة)
                    // 2. وإلا احسب من البنود
                    const calculatedOriginalTotal = itemsSubtotalOriginal - invoiceLevelDiscount + invoiceShipping + invoiceShippingTax + invoiceAdjustment
                    const storedOriginalTotal = Number((invoice as any).original_total || 0)
                    const originalInvoiceTotal = storedOriginalTotal > 0 ? storedOriginalTotal : calculatedOriginalTotal

                    const totalDiscount = discountBeforeTax + discountAfterTax
                    // صافي الفاتورة بعد المرتجعات = الإجمالي الأصلي - المرتجعات
                    const netInvoiceAfterReturns = originalInvoiceTotal - returnedAmount
                    // رصيد العميل الدائن: نستخدم customerCreditAmount من الحالة الخارجية لأنه
                    // يرجع إلى قاعدة البيانات ويعكس المبالغ المُصرَفة فعلاً (used_amount).
                    // الحساب المحلي (paid - net) يُظهر الرصيد الإجمالي قبل الصرف وهو مُضلِّل.
                    const customerCreditDisplay = customerCreditAmount
                    // المتبقي الفعلي للدفع (إذا كان موجباً)
                    const actualRemaining = Math.max(0, netInvoiceAfterReturns - invoice.paid_amount)

                    return (
                      <table className="w-full text-sm">
                        <tbody>
                          {/* إجمالي الفاتورة الأصلي - مع خط عليه في حالة المرتجع (strikethrough) */}
                          <tr>
                            <td className="py-1 text-gray-600 dark:text-gray-400 print:text-gray-700">
                              {hasReturnsDisplay
                                ? (appLang === 'en' ? 'Original Invoice Total:' : 'إجمالي الفاتورة الأصلي:')
                                : (appLang === 'en' ? 'Subtotal:' : 'المجموع الفرعي:')}
                            </td>
                            <td className={`py-1 text-right ${hasReturnsDisplay ? 'line-through text-gray-400 dark:text-gray-500' : ''}`}>
                              {hasReturnsDisplay ? originalInvoiceTotal.toFixed(2) : invoice.subtotal.toFixed(2)}
                            </td>
                          </tr>

                          {/* المجموع الفرعي (فقط إذا لا يوجد مرتجعات) */}
                          {!hasReturnsDisplay && discountBeforeTax > 0 && (
                            <tr className="text-orange-600 print:text-orange-700">
                              <td className="py-1">{appLang === 'en' ? `Pre-tax Discount${invoice.discount_type === 'percent' ? ` (${Number(invoice.discount_value || 0).toFixed(1)}%)` : ''}:` : `خصم قبل الضريبة${invoice.discount_type === "percent" ? ` (${Number(invoice.discount_value || 0).toFixed(1)}%)` : ""}:`}</td>
                              <td className="py-1 text-right">-{discountBeforeTax.toFixed(2)}</td>
                            </tr>
                          )}

                          {/* الخصم (للفواتير مع مرتجعات - عرض مبسط) */}
                          {hasReturnsDisplay && totalDiscount > 0 && (
                            <tr className="text-orange-600 print:text-orange-700">
                              <td className="py-1">{appLang === 'en' ? 'Discount:' : 'خصم:'}</td>
                              <td className="py-1 text-right">-{totalDiscount.toFixed(2)}</td>
                            </tr>
                          )}

                          {/* الضريبة (فقط إذا لا يوجد مرتجعات) */}
                          {!hasReturnsDisplay && (
                            <tr>
                              <td className="py-1 text-gray-600 dark:text-gray-400 print:text-gray-700">{appLang === 'en' ? 'Tax:' : 'الضريبة:'}</td>
                              <td className="py-1 text-right">{invoice.tax_amount.toFixed(2)}</td>
                            </tr>
                          )}
                          {!hasReturnsDisplay && taxSummary.length > 0 && taxSummary.map((t, idx) => (
                            <tr key={idx} className="text-xs text-gray-500 dark:text-gray-400">
                              <td className="py-0.5 pr-4">&nbsp;&nbsp;{appLang === 'en' ? `└ VAT ${t.rate}%:` : `└ ضريبة ${t.rate}%:`}</td>
                              <td className="py-0.5 text-right">{t.amount.toFixed(2)}</td>
                            </tr>
                          ))}

                          {/* الشحن (فقط إذا لا يوجد مرتجعات) */}
                          {!hasReturnsDisplay && shipping > 0 && (
                            <>
                              <tr>
                                <td className="py-1 text-gray-600 dark:text-gray-400 print:text-gray-700">{appLang === 'en' ? 'Shipping Company:' : 'شركة الشحن:'}</td>
                                <td className="py-1 text-right text-sm">{(invoice as any).shipping_providers?.provider_name || '-'}</td>
                              </tr>
                              <tr>
                                <td className="py-1 text-gray-600 dark:text-gray-400 print:text-gray-700">{appLang === 'en' ? `Shipping${shippingTaxRate > 0 ? ` (+${shippingTaxRate}% tax)` : ''}:` : `الشحن${shippingTaxRate > 0 ? ` (+${shippingTaxRate}% ضريبة)` : ''}:`}</td>
                                <td className="py-1 text-right">{(shipping + shippingTaxAmount).toFixed(2)}</td>
                              </tr>
                            </>
                          )}

                          {/* خصم بعد الضريبة (فقط إذا لا يوجد مرتجعات) */}
                          {!hasReturnsDisplay && discountAfterTax > 0 && (
                            <tr className="text-orange-600 print:text-orange-700">
                              <td className="py-1">{appLang === 'en' ? `Post-tax Discount${invoice.discount_type === 'percent' ? ` (${Number(invoice.discount_value || 0).toFixed(1)}%)` : ''}:` : `خصم بعد الضريبة${invoice.discount_type === "percent" ? ` (${Number(invoice.discount_value || 0).toFixed(1)}%)` : ""}:`}</td>
                              <td className="py-1 text-right">-{discountAfterTax.toFixed(2)}</td>
                            </tr>
                          )}

                          {/* التعديل (فقط إذا لا يوجد مرتجعات) */}
                          {!hasReturnsDisplay && adjustment !== 0 && (
                            <tr>
                              <td className="py-1 text-gray-600 dark:text-gray-400 print:text-gray-700">{appLang === 'en' ? 'Adjustment:' : 'التعديل:'}</td>
                              <td className="py-1 text-right">{adjustment > 0 ? '+' : ''}{adjustment.toFixed(2)}</td>
                            </tr>
                          )}

                          {/* ======= عرض المرتجعات (إذا وجدت) ======= */}
                          {hasReturnsDisplay && (
                            <tr className="text-orange-600 print:text-orange-700">
                              <td className="py-1">{appLang === 'en' ? 'Total Returns:' : 'إجمالي المرتجعات:'}</td>
                              <td className="py-1 text-right">-{returnedAmount.toFixed(2)}</td>
                            </tr>
                          )}

                          {/* خط فاصل + صافي الفاتورة بعد المرتجعات */}
                          {hasReturnsDisplay && (
                            <tr className="border-t border-gray-300 dark:border-gray-600">
                              <td className="py-2 font-semibold text-gray-800 dark:text-gray-200 print:text-gray-800">
                                {appLang === 'en' ? 'Net Invoice After Returns:' : 'صافي الفاتورة بعد المرتجعات:'}
                              </td>
                              <td className="py-2 text-right font-semibold text-blue-600 print:text-blue-800">
                                {netInvoiceAfterReturns.toFixed(2)} <span className="text-sm">{currencySymbol}</span>
                              </td>
                            </tr>
                          )}

                          {/* المدفوع (في حالة وجود مرتجعات - عرض ضمن الجدول) */}
                          {hasReturnsDisplay && invoice.paid_amount > 0 && (
                            <tr>
                              <td className="py-1 text-gray-600 dark:text-gray-400 print:text-gray-700">
                                {appLang === 'en' ? 'Amount Paid:' : 'المدفوع:'}
                              </td>
                              <td className="py-1 text-right text-green-600 print:text-green-700">
                                {invoice.paid_amount.toFixed(2)}
                              </td>
                            </tr>
                          )}

                          {/* ======= رصيد دائن للعميل (إذا كان موجباً) - باللون الأخضر ======= */}
                          {hasReturnsDisplay && customerCreditDisplay > 0 && (
                            <tr className="border-t border-green-300 dark:border-green-600 bg-green-50 dark:bg-green-900/20">
                              <td className="py-2 font-semibold text-green-700 dark:text-green-400 print:text-green-700">
                                {appLang === 'en' ? '💰 Customer Credit:' : '💰 رصيد دائن للعميل:'}
                              </td>
                              <td className="py-2 text-right font-bold text-green-600 print:text-green-700">
                                {customerCreditDisplay.toFixed(2)} <span className="text-sm">{currencySymbol}</span>
                              </td>
                            </tr>
                          )}

                          {/* المتبقي للدفع (إذا كان موجباً) */}
                          {hasReturnsDisplay && actualRemaining > 0 && (
                            <tr className="border-t border-red-200 dark:border-red-600">
                              <td className="py-1 text-gray-600 dark:text-gray-400 print:text-gray-700">
                                {appLang === 'en' ? 'Balance Due:' : 'المتبقي للدفع:'}
                              </td>
                              <td className="py-1 text-right font-bold text-red-600 print:text-red-700">
                                {actualRemaining.toFixed(2)} <span className="text-sm">{currencySymbol}</span>
                              </td>
                            </tr>
                          )}

                          {/* الإجمالي (فقط إذا لا يوجد مرتجعات) */}
                          {!hasReturnsDisplay && (
                            <tr className="border-t-2 border-gray-300">
                              <td className="py-2 font-bold text-lg text-gray-900 dark:text-white print:text-black border-t-2 border-gray-800">{appLang === 'en' ? 'Total:' : 'الإجمالي:'}</td>
                              <td className="py-2 text-right font-bold text-lg text-blue-600 print:text-black border-t-2 border-gray-800">
                                <span className="double-underline">{invoice.total_amount.toFixed(2)} <span className="text-sm">{currencySymbol}</span></span>
                              </td>
                            </tr>
                          )}

                          {/* عرض القيمة المحولة إذا كانت العملة مختلفة */}
                          {invoice.currency_code && invoice.currency_code !== appCurrency && invoice.base_currency_total && (
                            <tr className="bg-gray-50 dark:bg-gray-800">
                              <td className="py-1 text-xs text-gray-500 dark:text-gray-400">{appLang === 'en' ? `Equivalent in ${appCurrency}:` : `المعادل بـ ${appCurrency}:`}</td>
                              <td className="py-1 text-right text-xs text-gray-600 dark:text-gray-400 font-medium">{invoice.base_currency_total.toFixed(2)} {appCurrency}</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    )
                  })()}

                  {/* حالة الدفع - للفواتير بدون مرتجعات (الفواتير مع مرتجعات تعرض في الجدول أعلاه) */}
                  {(() => {
                    const returnedAmount = Number((invoice as any).returned_amount || 0)
                    const hasReturns = returnedAmount > 0
                    // لا نعرض هذا القسم إذا كان هناك مرتجعات (تم عرضها في الجدول)
                    if (hasReturns) return null

                    const actualRemaining = Math.max(0, invoice.total_amount - invoice.paid_amount)

                    return (
                      <div className={`mt-4 p-3 rounded-lg border ${actualRemaining === 0
                        ? 'bg-green-50 border-green-200 print:bg-green-50'
                        : 'bg-yellow-50 border-yellow-200 print:bg-yellow-50'
                        }`}>
                        {/* المدفوع */}
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-600 dark:text-gray-400 print:text-gray-700">{appLang === 'en' ? 'Amount Paid:' : 'المدفوع:'}</span>
                          <span className="font-medium text-green-600 print:text-green-700">{invoice.paid_amount.toFixed(2)} {currencySymbol}</span>
                        </div>

                        {/* المتبقي للدفع (فقط إذا كان موجباً) */}
                        {actualRemaining > 0 && (
                          <div className="flex justify-between items-center text-sm mt-1">
                            <span className="text-gray-600 dark:text-gray-400 print:text-gray-700">{appLang === 'en' ? 'Balance Due:' : 'المتبقي للدفع:'}</span>
                            <span className="font-bold text-red-600 print:text-red-700">
                              {actualRemaining.toFixed(2)} {currencySymbol}
                            </span>
                          </div>
                        )}

                        {/* تم السداد بالكامل */}
                        {actualRemaining === 0 && (
                          <div className="flex justify-between items-center text-sm mt-1">
                            <span className="text-gray-600 dark:text-gray-400 print:text-gray-700">{appLang === 'en' ? 'Status:' : 'الحالة:'}</span>
                            <span className="font-bold text-green-600 print:text-green-700">
                              ✅ {appLang === 'en' ? 'Fully Paid' : 'مدفوعة بالكامل'}
                            </span>
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              </div>

              {/* تذييل الفاتورة للطباعة */}
              <div className="hidden print:block border-t pt-4 mt-6 text-center text-xs text-gray-500 dark:text-gray-400">
                <p>{appLang === 'en' ? 'Thank you for your business!' : 'شكراً لتعاملكم معنا!'}</p>
                <p className="mt-1">{invoice.companies?.name} | {invoice.companies?.phone} | {invoice.companies?.email}</p>
              </div>
            </CardContent>
          </Card>

          {/* ==================== قسم الملخص الشامل للفاتورة ==================== */}
          <div className="print:hidden space-y-4 mt-6">
            {/* بطاقات الإجماليات */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* إجمالي الفاتورة */}
              <Card className="p-4 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-800 rounded-lg">
                    <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-xs text-blue-600 dark:text-blue-400">{appLang === 'en' ? 'Invoice Total' : 'إجمالي الفاتورة'}</p>
                    <p className="text-lg font-bold text-blue-700 dark:text-blue-300">{currencySymbol}{invoice.total_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                  </div>
                </div>
              </Card>

              {/* إجمالي المدفوع */}
              <Card className="p-4 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 dark:bg-green-800 rounded-lg">
                    <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-xs text-green-600 dark:text-green-400">{appLang === 'en' ? 'Total Paid' : 'إجمالي المدفوع'}</p>
                    <p className="text-lg font-bold text-green-700 dark:text-green-300">{currencySymbol}{totalPaidAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                  </div>
                </div>
              </Card>

              {/* إجمالي المرتجعات */}
              <Card className="p-4 bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-100 dark:bg-orange-800 rounded-lg">
                    <RotateCcw className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <p className="text-xs text-orange-600 dark:text-orange-400">{appLang === 'en' ? 'Total Returns' : 'إجمالي المرتجعات'}</p>
                    <p className="text-lg font-bold text-orange-700 dark:text-orange-300">{currencySymbol}{totalReturnsAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                  </div>
                </div>
              </Card>

              {/* صافي المتبقي */}
              <Card className={`p-4 ${netRemainingAmount > 0 ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'}`}>
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${netRemainingAmount > 0 ? 'bg-red-100 dark:bg-red-800' : 'bg-green-100 dark:bg-green-800'}`}>
                    {netRemainingAmount > 0 ? (
                      <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                    ) : (
                      <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                    )}
                  </div>
                  <div>
                    <p className={`text-xs ${netRemainingAmount > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>{appLang === 'en' ? 'Net Remaining' : 'صافي المتبقي'}</p>
                    <p className={`text-lg font-bold ${netRemainingAmount > 0 ? 'text-red-700 dark:text-red-300' : 'text-green-700 dark:text-green-300'}`}>{currencySymbol}{netRemainingAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                  </div>
                </div>
              </Card>
            </div>

            {/* مرجع توضيحي: الرصيد الدائن المُصرَف للعميل */}
            {customerCreditDisbursed > 0 && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
                <div className="p-2 bg-purple-100 dark:bg-purple-800 rounded-lg shrink-0">
                  <span className="text-lg">💸</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-purple-600 dark:text-purple-400 font-medium">
                    {appLang === 'en' ? 'Disbursed Customer Credit (Reference)' : 'رصيد دائن مُصرَف للعميل (مرجع توضيحي)'}
                  </p>
                  <p className="text-sm font-bold text-purple-700 dark:text-purple-300">
                    {currencySymbol}{customerCreditDisbursed.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <span className="text-xs text-purple-500 dark:text-purple-400 shrink-0 italic">
                  {appLang === 'en' ? 'Already refunded to customer' : 'تم ردّه للعميل مسبقاً'}
                </span>
              </div>
            )}

            {/* ======= بانر رصيد العميل الدائن من customer_credit_ledger ======= */}
            {ledgerCreditBalance > 0.009 && ['sent', 'partially_paid'].includes(invoice.status) && canSeeCreditRefundButton && (
              <div className={`print:hidden rounded-xl border-2 border-emerald-300 dark:border-emerald-700 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-100 dark:bg-emerald-900/40 rounded-xl flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                  </div>
                  <div>
                    <p className="font-semibold text-emerald-800 dark:text-emerald-300 text-sm">
                      {appLang === 'en' ? '💰 Customer has an available credit balance!' : '💰 لدى العميل رصيد دائن متاح!'}
                    </p>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                      {appLang === 'en' ? 'Available credit from approved return: ' : 'رصيد متاح من مرتجع معتمد: '}
                      <span className="font-bold text-base">{currencySymbol}{ledgerCreditBalance.toFixed(2)}</span>
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => {
                      const remaining = Math.max(0, invoice.total_amount - invoice.paid_amount)
                      setCreditApplyAmount(String(Math.min(ledgerCreditBalance, remaining).toFixed(2)))
                      setShowApplyCreditDialog(true)
                    }}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 shadow-sm"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    {appLang === 'en' ? 'Apply Credit' : 'تطبيق الرصيد'}
                  </button>
                  <a href={`/customer-credits/${invoice.customer_id}`} target="_blank" rel="noreferrer"
                    className="px-3 py-2 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 text-sm rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                    {appLang === 'en' ? 'Ledger' : 'السجل'}
                  </a>
                </div>
              </div>
            )}

            {/* Apply Credit Dialog */}
            {showApplyCreditDialog && (
              <div className="print:hidden fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 p-6 w-full max-w-md mx-4">
                  <h3 className="font-bold text-lg text-emerald-700 dark:text-emerald-400 flex items-center gap-2 mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    {appLang === 'en' ? 'Apply Credit to Invoice' : 'تطبيق الرصيد على الفاتورة'}
                  </h3>
                  <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-4 border border-emerald-200 dark:border-emerald-800 mb-4">
                    <p className="text-xs text-emerald-600 dark:text-emerald-400">{appLang === 'en' ? 'Available Credit' : 'الرصيد المتاح'}</p>
                    <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{currencySymbol}{ledgerCreditBalance.toFixed(2)}</p>
                  </div>
                  <div className="space-y-2 mb-4">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {appLang === 'en' ? 'Amount to Apply' : 'المبلغ المراد تطبيقه'}
                    </label>
                    <div className="relative">
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">{currencySymbol}</span>
                      <input
                        type="number" min="0.01" step="0.01"
                        value={creditApplyAmount}
                        onChange={e => setCreditApplyAmount(e.target.value)}
                        className="w-full h-10 px-4 pr-9 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                      />
                    </div>
                    <p className="text-xs text-gray-400">
                      {appLang === 'en'
                        ? `Remaining balance: ${currencySymbol}${Math.max(0, invoice.total_amount - invoice.paid_amount).toFixed(2)}`
                        : `المتبقي في الفاتورة: ${currencySymbol}${Math.max(0, invoice.total_amount - invoice.paid_amount).toFixed(2)}`}
                    </p>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setShowApplyCreditDialog(false)} disabled={applyingCredit}
                      className="px-4 py-2 border rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800">
                      {appLang === 'en' ? 'Cancel' : 'إلغاء'}
                    </button>
                    <button
                      onClick={async () => {
                        if (!creditApplyAmount || Number(creditApplyAmount) <= 0) return
                        setApplyingCredit(true)
                        try {
                          const res = await fetch(`/api/customer-credits/${invoice.customer_id}/apply`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ invoiceId: invoice.id, amount: Number(creditApplyAmount) })
                          })
                          const json = await res.json()
                          if (json.success) {
                            setShowApplyCreditDialog(false)
                            setLedgerCreditBalance(0)
                            await loadInvoice()
                          } else {
                            alert(json.error || (appLang === 'en' ? 'Failed to apply credit' : 'فشل تطبيق الرصيد'))
                          }
                        } catch { alert(appLang === 'en' ? 'Network error' : 'خطأ في الشبكة') }
                        finally { setApplyingCredit(false) }
                      }}
                      disabled={applyingCredit || !creditApplyAmount}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg flex items-center gap-2 disabled:opacity-50">
                      {applyingCredit
                        ? <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                        : <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                      {appLang === 'en' ? 'Apply Credit' : 'تطبيق الرصيد'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* جدول المدفوعات */}
            {permPayView && (
              <Card className="dark:bg-slate-900 dark:border-slate-800">
                <div className="p-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-green-600" />
                    <h3 className="font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Payments' : 'المدفوعات'}</h3>
                    <span className="bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-300 text-xs px-2 py-0.5 rounded-full">{invoicePayments.length}</span>
                  </div>
                </div>
                <div className="p-4">
                  {invoicePayments.length === 0 ? (
                    <div className="text-center py-8">
                      <DollarSign className="h-10 w-10 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'No payments recorded yet' : 'لا توجد مدفوعات بعد'}</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-slate-800">
                          <tr>
                            <th className="px-3 py-2 text-right font-medium text-gray-700 dark:text-gray-300">#</th>
                            <th className="px-3 py-2 text-right font-medium text-gray-700 dark:text-gray-300">{appLang === 'en' ? 'Date' : 'التاريخ'}</th>
                            <th className="px-3 py-2 text-right font-medium text-gray-700 dark:text-gray-300">{appLang === 'en' ? 'Method' : 'طريقة الدفع'}</th>
                            <th className="px-3 py-2 text-right font-medium text-gray-700 dark:text-gray-300">{appLang === 'en' ? 'Reference' : 'المرجع'}</th>
                            <th className="px-3 py-2 text-right font-medium text-gray-700 dark:text-gray-300">{appLang === 'en' ? 'Amount' : 'المبلغ'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {invoicePayments.map((payment, idx) => (
                            <tr key={payment.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-slate-800/50">
                              <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                              <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{payment.payment_date}</td>
                              <td className="px-3 py-2">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${payment.payment_method === 'cash' ? 'bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-300' :
                                  payment.payment_method === 'bank_transfer' ? 'bg-blue-100 text-blue-700 dark:bg-blue-800 dark:text-blue-300' :
                                    payment.payment_method === 'card' ? 'bg-purple-100 text-purple-700 dark:bg-purple-800 dark:text-purple-300' :
                                      'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                                  }`}>
                                  {payment.payment_method === 'cash' && <Banknote className="h-3 w-3" />}
                                  {payment.payment_method === 'bank_transfer' && <CreditCard className="h-3 w-3" />}
                                  {payment.payment_method === 'card' && <CreditCard className="h-3 w-3" />}
                                  {payment.payment_method === 'cash' ? (appLang === 'en' ? 'Cash' : 'نقدي') :
                                    payment.payment_method === 'bank_transfer' ? (appLang === 'en' ? 'Transfer' : 'تحويل') :
                                      payment.payment_method === 'card' ? (appLang === 'en' ? 'Card' : 'بطاقة') :
                                        payment.payment_method === 'cheque' ? (appLang === 'en' ? 'Cheque' : 'شيك') : payment.payment_method}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{payment.reference_number || '-'}</td>
                              <td className="px-3 py-2 font-semibold text-green-600 dark:text-green-400">{currencySymbol}{Number(payment.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-green-50 dark:bg-green-900/20">
                          <tr>
                            <td colSpan={4} className="px-3 py-2 font-semibold text-gray-700 dark:text-gray-300">{appLang === 'en' ? 'Total Paid' : 'إجمالي المدفوع'}</td>
                            <td className="px-3 py-2 font-bold text-green-600 dark:text-green-400">{currencySymbol}{totalPaidAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* جدول المرتجعات */}
            <Card className="dark:bg-slate-900 dark:border-slate-800">
              <div className="p-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RotateCcw className="h-5 w-5 text-orange-600" />
                  <h3 className="font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Returns' : 'المرتجعات'}</h3>
                  <span className="bg-orange-100 dark:bg-orange-800 text-orange-700 dark:text-orange-300 text-xs px-2 py-0.5 rounded-full">{invoiceReturns.length}</span>
                </div>
              </div>
              <div className="p-4">
                {invoiceReturns.length === 0 ? (
                  <div className="text-center py-8">
                    <Package className="h-10 w-10 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'No returns recorded yet' : 'لا توجد مرتجعات بعد'}</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {invoiceReturns.map((ret, idx) => (
                      <div key={ret.id} className="border border-orange-200 dark:border-orange-800 rounded-lg overflow-hidden">
                        {/* رأس المرتجع */}
                        <div className="bg-orange-50 dark:bg-orange-900/20 p-3 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">#{idx + 1}</span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ret.return_type === 'full' ? 'bg-red-100 text-red-700 dark:bg-red-800 dark:text-red-300' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-800 dark:text-yellow-300'
                              }`}>
                              {ret.return_type === 'full' ? (appLang === 'en' ? 'Full Return' : 'مرتجع كامل') : (appLang === 'en' ? 'Partial Return' : 'مرتجع جزئي')}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-sm">
                            <span className="text-gray-500 dark:text-gray-400">{ret.return_date}</span>
                            <span className="font-semibold text-orange-600 dark:text-orange-400">{currencySymbol}{Number(ret.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                          </div>
                        </div>
                        {/* تفاصيل المنتجات المرتجعة */}
                        {ret.sales_return_items && ret.sales_return_items.length > 0 && (
                          <div className="p-3">
                            <table className="w-full text-sm">
                              <thead className="text-xs text-gray-500 dark:text-gray-400">
                                <tr>
                                  <th className="text-right pb-2">{appLang === 'en' ? 'Product' : 'المنتج'}</th>
                                  <th className="text-right pb-2">{appLang === 'en' ? 'Qty' : 'الكمية'}</th>
                                  <th className="text-right pb-2">{appLang === 'en' ? 'Unit Price' : 'سعر الوحدة'}</th>
                                  <th className="text-right pb-2">{appLang === 'en' ? 'Total' : 'الإجمالي'}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {ret.sales_return_items.map((item: any) => (
                                  <tr key={item.id} className="border-t border-gray-100 dark:border-gray-800">
                                    <td className="py-2 text-gray-700 dark:text-gray-300">{item.products?.name || '-'}</td>
                                    <td className="py-2 text-gray-600 dark:text-gray-400">{item.quantity}</td>
                                    <td className="py-2 text-gray-600 dark:text-gray-400">{currencySymbol}{Number(item.unit_price || 0).toFixed(2)}</td>
                                    <td className="py-2 font-medium text-orange-600 dark:text-orange-400">{currencySymbol}{Number(item.line_total || 0).toFixed(2)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {ret.notes && (
                              <div className="mt-2 p-2 bg-gray-50 dark:bg-slate-800 rounded text-xs text-gray-500 dark:text-gray-400">
                                <span className="font-medium">{appLang === 'en' ? 'Note:' : 'ملاحظة:'}</span> {ret.notes}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                    {/* إجمالي المرتجعات */}
                    <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded-lg flex justify-between items-center">
                      <span className="font-semibold text-gray-700 dark:text-gray-300">{appLang === 'en' ? 'Total Returns' : 'إجمالي المرتجعات'}</span>
                      <span className="font-bold text-orange-600 dark:text-orange-400">{currencySymbol}{totalReturnsAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>
          {/* ==================== نهاية قسم الملخص الشامل ==================== */}

          <div className="flex gap-3 print:hidden mt-4">
            {invoice.status !== "paid" && (
              <>
                {/* ✅ زر تحديد كمرسلة يظهر للفواتير draft أو invoiced (المحولة من أمر بيع) */}
                {(invoice.status === "draft" || invoice.status === "invoiced") && permUpdate ? (
                  <Button onClick={() => handleChangeStatus("sent")} className="bg-blue-600 hover:bg-blue-700" disabled={changingStatus || isPending}>
                    {changingStatus || isPending ? (appLang === 'en' ? 'Updating...' : 'جاري التحديث...') : (appLang === 'en' ? 'Mark as Sent' : 'تحديد كمرسلة')}
                  </Button>
                ) : null}
                {/* 🔒 زر الدفع يظهر فقط للفواتير المنفذة (sent/partially_paid) - ليس للمسودات */}
                {netRemainingAmount > 0 && permPayWrite && invoice.status !== "draft" && invoice.status !== "invoiced" && invoice.status !== "cancelled" ? (
                  <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => {
                    setPaymentAmount(netRemainingAmount)
                    setShowPayment(true)
                  }}>
                    {appLang === 'en' ? 'Record Payment' : 'تسجيل دفعة'}
                  </Button>
                ) : null}
                {/* 🔒 زر المرتجع: فقط للفواتير المنفذة (sent/partially_paid/paid) - ليس للمسودات أو الملغاة */}
                {(() => {
                  const returnableItems = items.map(it => ({
                    ...it,
                    max_qty: Math.max(0, it.quantity - (it.returned_quantity || 0))
                  })).filter(it => it.max_qty > 0)

                  const canPartialReturn = returnableItems.length > 1 || (returnableItems.length === 1 && returnableItems[0].max_qty > 1)

                  return invoice.status !== "cancelled" && invoice.status !== "draft" && invoice.status !== "invoiced" && invoice.status !== "fully_returned" && permUpdate && canPartialReturn && invoice.warehouse_status === 'approved' ? (
                    <Button variant="outline" className="border-orange-500 text-orange-600 hover:bg-orange-50" onClick={openPartialReturnDialog}>
                      {appLang === 'en' ? 'Partial Return' : 'مرتجع جزئي'}
                    </Button>
                  ) : null
                })()}
                {/* 📌 تم إلغاء زر "إنشاء شحنة" - الوظيفة مدمجة في "تحديد كمرسلة" */}
                {/* View Shipment Button - if shipment/third party goods exists */}
                {existingShipment ? (
                  <Button variant="outline" className="border-cyan-500 text-cyan-600 hover:bg-cyan-50" onClick={() => window.open(`/shipments/${existingShipment.id}`, '_blank')}>
                    <Truck className="w-4 h-4 ml-2" />
                    {appLang === 'en' ? `Shipment: ${existingShipment.shipment_number}` : `الشحنة: ${existingShipment.shipment_number}`}
                    {existingShipment.tracking_number && <ExternalLink className="w-3 h-3 mr-1" />}
                  </Button>
                ) : null}
                {/* ❌ تم إزالة زر "إصدار مذكرة دائن كاملة" - استخدم "مرتجع جزئي" بدلاً منه للتحكم الكامل */}
                {/* ❌ تم إزالة زر "تحديد كمدفوعة" - الحالة تتحدث تلقائياً عند الدفع أو المرتجع */}
              </>
            )}
            {/* 💰 زر صرف رصيد العميل الدائن - يظهر لـ: owner/admin/general_manager (اختيار الفرع) و accountant (فرعه فقط) */}
            {customerCreditAmount > 0 && canSeeCreditRefundButton && invoice.customer_id && invoice.status !== "cancelled" && invoice.status !== "draft" ? (
              <Button
                variant="outline"
                className="border-green-500 text-green-600 hover:bg-green-50"
                onClick={() => {
                  setRefundAmount(customerCreditAmount)
                  setRefundDate(new Date().toISOString().slice(0, 10))
                  setRefundNotes(appLang === 'en' ? `Credit refund from invoice #${invoice.invoice_number}` : `صرف رصيد دائن من الفاتورة #${invoice.invoice_number}`)
                  setShowCustomerRefund(true)
                }}
              >
                <DollarSign className="w-4 h-4 ml-2" />
                {appLang === 'en' ? 'Refund Customer Credit' : 'صرف رصيد العميل'}
              </Button>
            ) : null}
          </div>

          {/* Dialog: Receive Payment */}
          <Dialog open={showPayment} onOpenChange={setShowPayment}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{appLang === 'en' ? `Record payment for invoice #${invoice.invoice_number}` : `تسجيل دفعة للفاتورة #${invoice.invoice_number}`}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>{appLang === 'en' ? 'Amount' : 'المبلغ'}</Label>
                  <NumericInput
                    value={paymentAmount}
                    min={0}
                    step="0.01"
                    onChange={(val) => setPaymentAmount(val)}
                    decimalPlaces={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{appLang === 'en' ? 'Payment Date' : 'تاريخ الدفع'}</Label>
                  <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{appLang === 'en' ? 'Payment Method' : 'طريقة الدفع'}</Label>
                  <Input value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} placeholder="cash" />
                </div>
                <div className="space-y-2">
                  <Label>{appLang === 'en' ? 'Account (Cash/Bank)' : 'الحساب (نقد/بنك)'}</Label>
                  <select
                    className="w-full border rounded px-3 py-2 bg-white dark:bg-slate-900"
                    value={paymentAccountId}
                    onChange={(e) => setPaymentAccountId(e.target.value)}
                  >
                    <option value="">{appLang === 'en' ? 'Select account' : 'اختر الحساب'}</option>
                    {cashBankAccounts.map((a: any) => (
                      <option key={a.id} value={a.id}>
                        {(a.account_code ? `${a.account_code} - ` : "") + a.account_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>{appLang === 'en' ? 'Reference/Receipt No. (optional)' : 'مرجع/رقم إيصال (اختياري)'}</Label>
                  <Input value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowPayment(false)} disabled={savingPayment}>{appLang === 'en' ? 'Cancel' : 'إلغاء'}</Button>
                <Button
                  onClick={() => recordInvoicePayment(paymentAmount, paymentDate, paymentMethod, paymentRef)}
                  disabled={savingPayment || paymentAmount <= 0 || !paymentAccountId}
                >
                  {appLang === 'en' ? 'Save Payment' : 'حفظ الدفعة'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* ❌ تم إزالة Dialog: Full Credit Note - استخدم المرتجع الجزئي/الكامل بدلاً منه */}

          {/* Dialog: Partial Return */}
          <Dialog open={showPartialReturn} onOpenChange={setShowPartialReturn}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{appLang === 'en' ? 'Partial Sales Return' : 'مرتجع مبيعات جزئي'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                {/* ملخص مالي للفاتورة */}
                {invoice && (
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-blue-800 dark:text-blue-200">{appLang === 'en' ? 'Invoice Financial Summary' : 'ملخص الفاتورة المالي'}</h4>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${invoice.status === 'paid' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                        invoice.status === 'partially_paid' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                          invoice.status === 'cancelled' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                            invoice.status === 'fully_returned' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' :
                              invoice.status === 'partially_returned' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' :
                                'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                        }`}>
                        {invoice.status === 'paid' ? (appLang === 'en' ? 'Paid' : 'مدفوعة') :
                          invoice.status === 'partially_paid' ? (appLang === 'en' ? 'Partially Paid' : 'مدفوعة جزئياً') :
                            invoice.status === 'cancelled' ? (appLang === 'en' ? 'Cancelled' : 'ملغاة') :
                              invoice.status === 'fully_returned' ? (appLang === 'en' ? 'Fully Returned' : 'مرتجع بالكامل') :
                                invoice.status === 'partially_returned' ? (appLang === 'en' ? 'Partially Returned' : 'مرتجع جزئياً') :
                                  invoice.status === 'sent' ? (appLang === 'en' ? 'Sent' : 'مرسلة') :
                                    (appLang === 'en' ? 'Draft' : 'مسودة')}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div className="bg-white dark:bg-slate-800 p-2 rounded">
                        <p className="text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Total' : 'الإجمالي'}</p>
                        <p className="font-semibold">{invoice.total_amount.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} {currencySymbol}</p>
                      </div>
                      <div className="bg-white dark:bg-slate-800 p-2 rounded">
                        <p className="text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Paid' : 'المدفوع'}</p>
                        <p className="font-semibold text-green-600">{invoice.paid_amount.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} {currencySymbol}</p>
                      </div>
                      <div className="bg-white dark:bg-slate-800 p-2 rounded">
                        <p className="text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Returns' : 'المرتجعات'}</p>
                        <p className="font-semibold text-orange-600">{((invoice as any).returned_amount || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2 })} {currencySymbol}</p>
                      </div>
                      <div className="bg-white dark:bg-slate-800 p-2 rounded">
                        <p className="text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Net Remaining' : 'صافي المتبقي'}</p>
                        <p className={`font-semibold ${(invoice.total_amount - invoice.paid_amount) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {Math.max(0, invoice.total_amount - invoice.paid_amount).toLocaleString('ar-EG', { minimumFractionDigits: 2 })} {currencySymbol}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                      {appLang === 'en' ? 'Customer' : 'العميل'}: <span className="font-medium">{invoice.customer_name_snapshot || invoice.customers?.name || '—'}</span>
                    </div>
                  </div>
                )}

                {/* Return Items Table */}
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 dark:bg-slate-800">
                      <tr>
                        <th className="px-3 py-2 text-right">{appLang === 'en' ? 'Product' : 'المنتج'}</th>
                        <th className="px-3 py-2 text-center">{appLang === 'en' ? 'Max Qty' : 'الحد الأقصى'}</th>
                        <th className="px-3 py-2 text-center">{appLang === 'en' ? 'Return Qty' : 'كمية المرتجع'}</th>
                        <th className="px-3 py-2 text-right">{appLang === 'en' ? 'Unit Price' : 'سعر الوحدة'}</th>
                        <th className="px-3 py-2 text-right">{appLang === 'en' ? 'Total' : 'الإجمالي'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {returnItems.map((item, idx) => {
                        const gross = item.return_qty * item.unit_price
                        const net = gross - (gross * (item.discount_percent || 0) / 100)
                        const tax = net * (item.tax_rate || 0) / 100
                        const lineTotal = net + tax
                        return (
                          <tr key={item.item_id} className="border-t hover:bg-gray-50 dark:hover:bg-slate-900">
                            <td className="px-3 py-2">{item.product_name}</td>
                            <td className="px-3 py-2 text-center text-gray-500">{item.max_qty}</td>
                            <td className="px-3 py-2 text-center">
                              <NumericInput
                                min={0}
                                max={item.max_qty}
                                value={item.return_qty}
                                onChange={(val) => {
                                  const v = Math.min(Math.max(0, Math.round(val)), item.max_qty)
                                  setReturnItems(prev => prev.map((it, i) => i === idx ? { ...it, return_qty: v } : it))
                                }}
                                className="w-20 text-center"
                              />
                            </td>
                            <td className="px-3 py-2 text-right">{item.unit_price.toFixed(2)}</td>
                            <td className="px-3 py-2 text-right font-medium text-orange-600">{lineTotal.toFixed(2)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot className="bg-gray-50 dark:bg-slate-900">
                      <tr>
                        <td colSpan={4} className="px-3 py-2 text-left font-bold">{appLang === 'en' ? 'Total Return Amount:' : 'إجمالي المرتجع:'}</td>
                        <td className="px-3 py-2 text-right font-bold text-red-600">{returnTotal.toFixed(2)} {currencySymbol}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* معاينة ما بعد المرتجع */}
                {returnTotal > 0 && invoice && (() => {
                  const currentTotal = invoice.total_amount
                  const currentPaid = invoice.paid_amount
                  const newTotal = Math.max(currentTotal - returnTotal, 0)
                  const customerCreditAmount = Math.max(0, currentPaid - newTotal)
                  const newStatus = newTotal === 0 ? (appLang === 'en' ? 'Fully Returned' : 'مرتجع بالكامل') :
                    customerCreditAmount > 0 ? (appLang === 'en' ? 'Partially Returned' : 'مرتجع جزئي') :
                      currentPaid >= newTotal ? (appLang === 'en' ? 'Paid' : 'مدفوعة') :
                        currentPaid > 0 ? (appLang === 'en' ? 'Partially Paid' : 'مدفوعة جزئياً') : (appLang === 'en' ? 'Sent' : 'مرسلة')

                  // حساب تكلفة البضاعة
                  const totalCOGS = returnItems.reduce((sum, it) => {
                    const prod = items.find(i => i.id === it.item_id)
                    return sum + (it.return_qty * (prod?.products?.cost_price || 0))
                  }, 0)

                  // حساب المكونات
                  const returnSubtotal = returnItems.reduce((sum, it) => {
                    const gross = it.return_qty * it.unit_price
                    return sum + gross - (gross * (it.discount_percent || 0) / 100)
                  }, 0)
                  const returnTax = returnItems.reduce((sum, it) => {
                    const gross = it.return_qty * it.unit_price
                    const net = gross - (gross * (it.discount_percent || 0) / 100)
                    return sum + net * (it.tax_rate || 0) / 100
                  }, 0)

                  return (
                    <>
                      <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                        <h4 className="font-semibold text-orange-800 dark:text-orange-200 mb-3">{appLang === 'en' ? 'Post-Return Preview' : 'معاينة ما بعد المرتجع'}</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                          <div className="bg-white dark:bg-slate-800 p-2 rounded">
                            <p className="text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Return Amount' : 'قيمة المرتجع'}</p>
                            <p className="font-semibold text-orange-600">{returnTotal.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} {currencySymbol}</p>
                          </div>
                          <div className="bg-white dark:bg-slate-800 p-2 rounded">
                            <p className="text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'New Total' : 'الإجمالي الجديد'}</p>
                            <p className="font-semibold">{newTotal.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} {currencySymbol}</p>
                          </div>
                          <div className="bg-white dark:bg-slate-800 p-2 rounded">
                            <p className="text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Customer Credit' : 'رصيد العميل الدائن'}</p>
                            <p className="font-semibold text-green-600">{customerCreditAmount.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} {currencySymbol}</p>
                          </div>
                          <div className="bg-white dark:bg-slate-800 p-2 rounded">
                            <p className="text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Expected Status' : 'الحالة المتوقعة'}</p>
                            <p className="font-semibold">{newStatus}</p>
                          </div>
                        </div>
                      </div>

                      {/* القيود المحاسبية المتوقعة */}
                      <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                        <h4 className="font-semibold text-purple-800 dark:text-purple-200 mb-3">{appLang === 'en' ? 'Accounting Entries Preview' : 'معاينة القيود المحاسبية'}</h4>
                        <div className="space-y-3 text-sm">
                          {/* قيد عكس تكلفة البضاعة */}
                          {totalCOGS > 0 && (
                            <div className="bg-white dark:bg-slate-800 p-3 rounded">
                              <p className="font-medium text-purple-700 dark:text-purple-300 mb-2">{appLang === 'en' ? '1. COGS Reversal Entry' : '1. قيد عكس تكلفة البضاعة المباعة'}</p>
                              <div className="grid grid-cols-3 gap-2 text-xs">
                                <div className="font-medium">{appLang === 'en' ? 'Account' : 'الحساب'}</div>
                                <div className="text-center font-medium">{appLang === 'en' ? 'Debit' : 'مدين'}</div>
                                <div className="text-center font-medium">{appLang === 'en' ? 'Credit' : 'دائن'}</div>
                                <div>{appLang === 'en' ? 'Inventory' : 'المخزون'}</div>
                                <div className="text-center text-green-600">{totalCOGS.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}</div>
                                <div className="text-center">-</div>
                                <div>{appLang === 'en' ? 'COGS' : 'تكلفة البضاعة المباعة'}</div>
                                <div className="text-center">-</div>
                                <div className="text-center text-red-600">{totalCOGS.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}</div>
                              </div>
                            </div>
                          )}
                          {/* قيد مرتجع المبيعات */}
                          <div className="bg-white dark:bg-slate-800 p-3 rounded">
                            <p className="font-medium text-purple-700 dark:text-purple-300 mb-2">{appLang === 'en' ? '2. Sales Return Entry' : '2. قيد مرتجع المبيعات'}</p>
                            <div className="grid grid-cols-3 gap-2 text-xs">
                              <div className="font-medium">{appLang === 'en' ? 'Account' : 'الحساب'}</div>
                              <div className="text-center font-medium">{appLang === 'en' ? 'Debit' : 'مدين'}</div>
                              <div className="text-center font-medium">{appLang === 'en' ? 'Credit' : 'دائن'}</div>
                              <div>{appLang === 'en' ? 'Sales Returns / Revenue' : 'مردودات المبيعات / الإيرادات'}</div>
                              <div className="text-center text-green-600">{returnSubtotal.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}</div>
                              <div className="text-center">-</div>
                              {returnTax > 0 && (
                                <>
                                  <div>{appLang === 'en' ? 'VAT Payable' : 'ضريبة المبيعات المستحقة'}</div>
                                  <div className="text-center text-green-600">{returnTax.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}</div>
                                  <div className="text-center">-</div>
                                </>
                              )}
                              <div>{appLang === 'en' ? 'Customer Credit' : 'رصيد العميل الدائن'}</div>
                              <div className="text-center">-</div>
                              <div className="text-center text-red-600">{returnTotal.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}</div>
                            </div>
                          </div>
                        </div>
                        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                          {appLang === 'en'
                            ? '* Customer credit will be added to the customer account and can be disbursed from the Customers page.'
                            : '* سيتم إضافة رصيد دائن للعميل ويمكن صرفه من صفحة العملاء.'}
                        </p>
                      </div>
                    </>
                  )
                })()}

                {/* Refund Method */}
                <div className="space-y-2">
                  <Label>{appLang === 'en' ? 'Refund Method' : 'طريقة الاسترداد'}</Label>
                  <select
                    className="w-full border rounded px-3 py-2 bg-white dark:bg-slate-900"
                    value={returnMethod}
                    onChange={(e) => setReturnMethod(e.target.value as any)}
                  >
                    <option value="credit_note">{appLang === 'en' ? 'Credit Note (Customer Credit)' : 'مذكرة دائن (رصيد للعميل)'}</option>
                    <option value="cash">{appLang === 'en' ? 'Cash Refund' : 'استرداد نقدي'}</option>
                    <option value="bank_transfer">{appLang === 'en' ? 'Bank Transfer' : 'تحويل بنكي'}</option>
                  </select>
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <Label>{appLang === 'en' ? 'Notes' : 'ملاحظات'}</Label>
                  <Input
                    value={returnNotes}
                    onChange={(e) => setReturnNotes(e.target.value)}
                    placeholder={appLang === 'en' ? 'Return reason...' : 'سبب المرتجع...'}
                  />
                </div>

                <p className="text-sm text-orange-600">{appLang === 'en' ? 'This will reverse the revenue, tax, and receivables for the returned items, and return the inventory to stock.' : 'سيتم عكس الإيراد والضريبة والذمم للأصناف المرتجعة، وإرجاع المخزون للمستودع.'}</p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowPartialReturn(false)}>{appLang === 'en' ? 'Cancel' : 'إلغاء'}</Button>
                <Button
                  className="bg-orange-600 hover:bg-orange-700"
                  onClick={processPartialReturn}
                  disabled={returnProcessing || returnTotal <= 0}
                >
                  {returnProcessing ? (appLang === 'en' ? 'Processing...' : 'جاري المعالجة...') : (appLang === 'en' ? 'Process Return' : 'معالجة المرتجع')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Create Shipment Dialog */}
          <Dialog open={showShipmentDialog} onOpenChange={setShowShipmentDialog}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Truck className="w-5 h-5 text-cyan-600" />
                  {appLang === 'en' ? 'Create Shipment' : 'إنشاء شحنة'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                {/* Provider Selection */}
                <div className="space-y-2">
                  <Label>{appLang === 'en' ? 'Shipping Provider' : 'شركة الشحن'}</Label>
                  {shippingProviders.length === 0 ? (
                    <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-amber-700 dark:text-amber-300 text-sm">
                      {appLang === 'en' ? 'No shipping providers configured. Please add one in Settings → Shipping.' : 'لم يتم إعداد شركات شحن. يرجى إضافة واحدة من الإعدادات ← الشحن.'}
                    </div>
                  ) : (
                    <select
                      className="w-full border rounded-md p-2 dark:bg-slate-800 dark:border-slate-700"
                      value={selectedProviderId}
                      onChange={(e) => setSelectedProviderId(e.target.value)}
                    >
                      {shippingProviders.map(p => (
                        <option key={p.id} value={p.id}>{p.provider_name}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Recipient Info */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {appLang === 'en' ? 'Recipient Name' : 'اسم المستلم'}
                    </Label>
                    <Input
                      value={shipmentData.recipient_name}
                      onChange={(e) => setShipmentData({ ...shipmentData, recipient_name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      {appLang === 'en' ? 'Phone' : 'الهاتف'}
                    </Label>
                    <Input
                      value={shipmentData.recipient_phone}
                      onChange={(e) => setShipmentData({ ...shipmentData, recipient_phone: e.target.value })}
                      dir="ltr"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {appLang === 'en' ? 'Address' : 'العنوان'}
                  </Label>
                  <Input
                    value={shipmentData.recipient_address}
                    onChange={(e) => setShipmentData({ ...shipmentData, recipient_address: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>{appLang === 'en' ? 'City' : 'المدينة'}</Label>
                    <Input
                      value={shipmentData.recipient_city}
                      onChange={(e) => setShipmentData({ ...shipmentData, recipient_city: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{appLang === 'en' ? 'Weight (kg)' : 'الوزن (كجم)'}</Label>
                    <NumericInput
                      step="0.1"
                      value={Number(shipmentData.weight) || 0}
                      onChange={(val) => setShipmentData({ ...shipmentData, weight: String(val) })}
                      decimalPlaces={1}
                      dir="ltr"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>{appLang === 'en' ? 'Notes' : 'ملاحظات'}</Label>
                  <Input
                    value={shipmentData.notes}
                    onChange={(e) => setShipmentData({ ...shipmentData, notes: e.target.value })}
                    placeholder={appLang === 'en' ? 'Special instructions...' : 'تعليمات خاصة...'}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowShipmentDialog(false)}>
                  {appLang === 'en' ? 'Cancel' : 'إلغاء'}
                </Button>
                <Button
                  onClick={createShipment}
                  disabled={creatingShipment || !selectedProviderId || shippingProviders.length === 0}
                  className="bg-cyan-600 hover:bg-cyan-700"
                >
                  <Truck className="w-4 h-4 ml-2" />
                  {creatingShipment ? (appLang === 'en' ? 'Creating...' : 'جاري الإنشاء...') : (appLang === 'en' ? 'Create Shipment' : 'إنشاء الشحنة')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* 💰 Dialog: صرف رصيد العميل الدائن */}
          {invoice.customer_id && (
            <CustomerRefundDialog
              open={showCustomerRefund}
              onOpenChange={setShowCustomerRefund}
              customerId={invoice.customer_id}
              customerName={invoice.customer_name_snapshot || invoice.customers?.name || ''}
              maxAmount={customerCreditAmount}
              accounts={refundAccounts}
              appCurrency={appCurrency}
              currencies={refundCurrencies}
              refundAmount={refundAmount}
              setRefundAmount={setRefundAmount}
              refundCurrency={refundCurrency}
              setRefundCurrency={setRefundCurrency}
              refundDate={refundDate}
              setRefundDate={setRefundDate}
              refundMethod={refundMethod}
              setRefundMethod={setRefundMethod}
              refundAccountId={refundAccountId}
              setRefundAccountId={setRefundAccountId}
              refundNotes={refundNotes}
              setRefundNotes={setRefundNotes}
              refundExRate={refundExRate}
              onRefundComplete={() => {
                setShowCustomerRefund(false)
                loadInvoice()
              }}
              userRole={currentUserRole}
              userBranchId={userBranchId}
              userCostCenterId={userCostCenterId}
              branches={allBranches}
              costCenters={allCostCenters}
              invoiceId={invoice.id}
              invoiceNumber={invoice.invoice_number}
              invoiceBranchId={invoice.branch_id || null}
              invoiceCostCenterId={invoice.cost_center_id || null}
            />
          )}
        </div>
      </main>
    </div>
  )
}
