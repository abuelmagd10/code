// =====================================================
// 📌 PAYMENTS ACCOUNTING PATTERN – MANDATORY SPECIFICATION
// =====================================================
// 📌 المرجع: docs/ACCOUNTING_PATTERN.md
// هذا النمط المحاسبي الصارم (ERP Professional):
//
// 📌 فواتير المبيعات:
// - Sent: ✅ خصم مخزون فقط - ❌ لا قيد محاسبي
// - Payment (أول دفعة): ✅ قيد الفاتورة (AR/Revenue) + ✅ قيد السداد (Cash/AR)
// - Payment (دفعات لاحقة): ✅ قيد السداد فقط (Cash/AR)
// - ❌ لا COGS في أي مرحلة
//
// 📌 فواتير المشتريات:
// - Received: ✅ قيد الفاتورة (Inventory/AP) + ✅ زيادة مخزون
// - Payment: ✅ قيد السداد فقط (AP/Cash أو AP/Supplier Advance)
// - ❌ لا يجوز إنشاء قيد فاتورة المشتريات عند الدفع
//
// 📌 أي كود يخالف هذا النمط يُعد خطأ جسيم ويجب تعديله فورًا
// =====================================================

"use client"

import { useEffect, useState, useTransition, useCallback, useRef, useMemo } from "react"
import { FilterContainer } from "@/components/ui/filter-container"
import { MultiSelect } from "@/components/ui/multi-select"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { NumericInput } from "@/components/ui/numeric-input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { useSupabase } from "@/lib/supabase/hooks"
import Link from "next/link"
import { useToast } from "@/hooks/use-toast"
import { toastActionError, toastActionSuccess } from "@/lib/notifications"
import { CreditCard } from "lucide-react"
import { ERPPageHeader } from "@/components/erp-page-header"
import { getExchangeRate, getActiveCurrencies, type Currency } from "@/lib/currency-service"
import { CustomerSearchSelect } from "@/components/CustomerSearchSelect"
import { getActiveCompanyId } from "@/lib/company"
import { computeLeafAccountBalancesAsOf } from "@/lib/ledger"
import { canAction } from "@/lib/authz"
import { validateBankAccountAccess, type UserContext, getAccessFilter } from "@/lib/validation"
import { useBranchFilter } from "@/hooks/use-branch-filter"
import { BranchFilter } from "@/components/BranchFilter"
import { useRealtimeTable } from "@/hooks/use-realtime-table"
import { useAutoRefresh } from "@/hooks/use-auto-refresh"
import { SupplierPaymentAllocationUI } from "@/components/payments/SupplierPaymentAllocationUI"
import { CustomerPaymentAllocationUI } from "@/components/payments/CustomerPaymentAllocationUI"
import { PaymentDetailsModal } from "@/components/payments/PaymentDetailsModal"
import { ExchangeRateSelector } from "@/components/ExchangeRateSelector"
import { Eye } from "lucide-react"

// v3.74.78 — مكون صَغير يَعرِض رَصيد العَميل الدائن عِندَ اختياره فى نَموذَج الدَّفع.
// يَجلِب الرَّصيد من /api/customer-credits/[customerId] وَيَختَفى لَو لا يوجَد رَصيد.
function CustomerCreditBalanceHint({ customerId, appLang, currencySymbol }: { customerId: string; appLang: 'ar' | 'en'; currencySymbol: string }) {
  const [balance, setBalance] = useState(0)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    if (!customerId) { setBalance(0); setLoaded(false); return }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/customer-credits/${customerId}`)
        const json = await res.json()
        if (!cancelled && json.success) {
          setBalance(Number(json.data?.balance || 0))
          setLoaded(true)
        }
      } catch { /* non-critical */ }
    })()
    return () => { cancelled = true }
  }, [customerId])
  if (!loaded || balance < 0.01) return null
  return (
    <div className="text-[11px] mt-1 px-2 py-1.5 rounded bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between gap-2">
      <span>
        💰 {appLang === 'en' ? 'Available credit:' : 'رصيد دائن متاح:'}{' '}
        <span className="font-bold">{currencySymbol}{balance.toFixed(2)}</span>
      </span>
      <a href={`/customer-credits/${customerId}`} target="_blank" rel="noreferrer" className="underline hover:no-underline text-[10px]">
        {appLang === 'en' ? 'Apply to invoice' : 'تطبيق على فاتورة'}
      </a>
    </div>
  )
}

interface Customer { 
  id: string; 
  name: string; 
  phone?: string | null;
  branch_id?: string | null;
  cost_center_id?: string | null;
}
interface Supplier { id: string; name: string }
interface Payment {
  id: string;
  customer_id?: string;
  supplier_id?: string;
  invoice_id?: string | null;
  purchase_order_id?: string | null;
  bill_id?: string | null;
  payment_date: string;
  amount: number;
  payment_method?: string;
  reference_number?: string;
  notes?: string;
  account_id?: string | null;
  display_currency?: string;
  display_amount?: number;
  original_currency?: string;
  original_amount?: number;
  currency_code?: string;
  exchange_rate_used?: number;
  exchange_rate?: number;
  base_currency_amount?: number;
  branch_id?: string | null;
  cost_center_id?: string | null;
  branches?: { name: string } | null;
  // ✅ Approval Workflow
  status?: string; // 'pending_approval' | 'approved' | 'rejected'
  created_by?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  rejected_by?: string | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
}

interface Branch { id: string; name: string }
interface InvoiceRow {
  id: string;
  invoice_number: string;
  invoice_date?: string;
  total_amount: number;
  paid_amount: number;
  status: string;
  branch_id?: string | null;
  branches?: { name: string } | null;
}
interface PORow {
  id: string;
  po_number: string;
  total_amount: number;
  received_amount: number;
  status: string;
  branch_id?: string | null;
  branches?: { name: string } | null;
}
interface BillRow {
  id: string;
  bill_number: string;
  bill_date?: string;
  total_amount: number;
  paid_amount: number;
  returned_amount?: number;
  status: string;
  branch_id?: string | null;
  branches?: { name: string } | null;
}
interface Account {
  id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  sub_type?: string | null;
  // v3.25.3: native currency of the account (USD/EUR/etc) — null = base
  original_currency?: string | null;
}

type SupplierPaymentApiResult = {
  success: boolean
  paymentId: string
  status: string
  approved: boolean
  posted: boolean
  transactionId: string | null
  journalEntryId: string | null
  eventType: string
}

export default function PaymentsPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [selectedPaymentDetailsId, setSelectedPaymentDetailsId] = useState<string | null>(null)
  const [online, setOnline] = useState<boolean>(true)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  // v3.26.0: account balances cache for available-balance display + overdraft warning
  const [accountBalances, setAccountBalances] = useState<Record<string, number>>({})
  // v3.74.516 — مطابقة عملة الدفع مع عملة الحساب (owner spec):
  // القائمة تُفلتر تلقائياً لحسابات نفس العملة؛ "إظهار الكل" استثناء بتأكيد صريح
  const [showAllPayAccounts, setShowAllPayAccounts] = useState(false)
  const accountCurrencyOf = (a: any) => (String(a?.original_currency || '').toUpperCase() || (baseCurrency || 'EGP').toUpperCase())
  const [accounts, setAccounts] = useState<Account[]>([])
  const [customerPayments, setCustomerPayments] = useState<Payment[]>([])
  const [supplierPayments, setSupplierPayments] = useState<Payment[]>([])
  // 🔐 المدفوعات الخام (قبل الفلترة بناءً على فرع الفاتورة) - للمستخدمين العاديين
  const [rawCustomerPayments, setRawCustomerPayments] = useState<Payment[]>([])
  const [rawSupplierPayments, setRawSupplierPayments] = useState<Payment[]>([])
  const [invoiceNumbers, setInvoiceNumbers] = useState<Record<string, string>>({})
  const [billNumbers, setBillNumbers] = useState<Record<string, string>>({})
  const [poNumbers, setPoNumbers] = useState<Record<string, string>>({})
  const [billToPoMap, setBillToPoMap] = useState<Record<string, string>>({})
  const [billAmountsMap, setBillAmountsMap] = useState<Record<string, {total: number, returned: number}>>({})
  const [accountNames, setAccountNames] = useState<Record<string, string>>({}) // Map bill_id -> purchase_order_id
  const [branches, setBranches] = useState<Branch[]>([])
  const [branchNames, setBranchNames] = useState<Record<string, string>>({})
  const [invoiceToSalesOrderMap, setInvoiceToSalesOrderMap] = useState<Record<string, { id: string; so_number: string }>>({}) // Map invoice_id -> sales_order
  const [invoiceBranchMap, setInvoiceBranchMap] = useState<Record<string, string>>({}) // Map invoice_id -> branch_id
  const [billBranchMap, setBillBranchMap] = useState<Record<string, string>>({}) // Map bill_id -> branch_id
  // 🔐 حفظ سياق الفلترة للاستخدام في useEffect لاحقاً
  const [pendingBranchFilter, setPendingBranchFilter] = useState<{ userBranchId: string | null; isPrivileged: boolean } | null>(null)

  // ─── v3.74.160 — unified filter state (mirrors the pattern used on
  // /invoices, /bills, /customers, /sales-orders). Customer payments and
  // supplier payments each get their own filter set since the user works
  // in one section at a time.
  const [cpSearch, setCpSearch] = useState<string>("")
  const [cpStatus, setCpStatus] = useState<string[]>([])
  const [cpDateFrom, setCpDateFrom] = useState<string>("")
  const [cpDateTo, setCpDateTo] = useState<string>("")
  // v3.74.162 — searchable customer multi-select + "unlinked only" toggle
  const [cpCustomerIds, setCpCustomerIds] = useState<string[]>([])
  const [cpUnlinkedOnly, setCpUnlinkedOnly] = useState<boolean>(false)
  const [spSearch, setSpSearch] = useState<string>("")
  const [spStatus, setSpStatus] = useState<string[]>([])
  const [spDateFrom, setSpDateFrom] = useState<string>("")
  const [spDateTo, setSpDateTo] = useState<string>("")
  // v3.74.162 — searchable supplier multi-select + "unlinked only" toggle
  const [spSupplierIds, setSpSupplierIds] = useState<string[]>([])
  const [spUnlinkedOnly, setSpUnlinkedOnly] = useState<boolean>(false)
  const [loading, setLoading] = useState(true)

  // Currency support - using CurrencyService
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [paymentCurrency, setPaymentCurrency] = useState<string>(() => {
    if (typeof window === 'undefined') return 'EGP'
    try { return localStorage.getItem('app_currency') || 'EGP' } catch { return 'EGP' }
  })
  const [baseCurrency, setBaseCurrency] = useState<string>(() => {
    if (typeof window === 'undefined') return 'EGP'
    try { return localStorage.getItem('app_currency') || 'EGP' } catch { return 'EGP' }
  })
  const [exchangeRate, setExchangeRate] = useState<number>(1)
  const [exchangeRateId, setExchangeRateId] = useState<string | undefined>(undefined)
  const [rateSource, setRateSource] = useState<string>('api')
  const [fetchingRate, setFetchingRate] = useState<boolean>(false)
  const [companyId, setCompanyId] = useState<string | null>(null)

  const currencySymbols: Record<string, string> = {
    EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ',
    KWD: 'د.ك', QAR: '﷼', BHD: 'د.ب', OMR: '﷼', JOD: 'د.أ', LBP: 'ل.ل'
  }
  // v3.74.518 — فصل عملة العرض (الجدول/الأرصدة) عن عملة نموذج الدفع:
  // كان اختيار الدولار فى النموذج يقلب رمز الجدول كله إلى $ بينما
  // الأرقام معادلات بالعملة الأساسية.
  const [displayCurrency, setDisplayCurrency] = useState<string>(() => {
    if (typeof window === 'undefined') return 'EGP'
    try { return localStorage.getItem('app_currency') || 'EGP' } catch { return 'EGP' }
  })
  const currencySymbol = currencySymbols[displayCurrency] || displayCurrency

  // Helper: Get display amount (use converted if available)
  const getDisplayAmount = (payment: Payment): number => {
    if (payment.display_currency === displayCurrency && payment.display_amount != null) {
      return payment.display_amount
    }
    // v3.11.0: For FX payments, prefer base_currency_amount (the correct EGP value)
    if (payment.base_currency_amount != null && payment.base_currency_amount > 0) {
      return payment.base_currency_amount
    }
    return payment.amount
  }

  // v3.11.0: Smart amount display — shows currency code + base equivalent for FX payments
  // v3.74.225: use Math.abs on the magnitude check so refund rows
  // (amount < 0) also surface their FC context. The displayed number
  // keeps its original sign so refunds still show as -0.01 $.
  const renderPaymentAmount = (payment: Payment, baseCur: string) => {
    const baseAmount = getDisplayAmount(payment)
    const origAmt = Number(payment.original_amount || 0)
    const origCur = String(payment.original_currency || payment.currency_code || '').toUpperCase()
    const baseCurUpper = baseCur.toUpperCase()
    const isFC = !!origCur && origCur !== baseCurUpper && Math.abs(origAmt) > 0
    if (isFC) {
      const origSymbol = currencySymbols[origCur] || origCur
      return (
        <span className="inline-flex flex-col">
          <span className="font-medium">{origAmt.toFixed(2)} {origSymbol}</span>
          <span className="text-[10px] text-gray-500">≈ {baseAmount.toFixed(2)} {currencySymbol}</span>
        </span>
      )
    }
    return <>{baseAmount.toFixed(2)} {currencySymbol}</>
  }

  // New payment form states
  const [newCustPayment, setNewCustPayment] = useState({ customer_id: "", amount: 0, date: new Date().toISOString().slice(0, 10), method: "cash", ref: "", notes: "", account_id: "" })
  const [newSuppPayment, setNewSuppPayment] = useState({ supplier_id: "", amount: 0, date: new Date().toISOString().slice(0, 10), method: "cash", ref: "", notes: "", account_id: "" })
  // v3.74.159 — when the user picks a supplier we surface any unallocated
  // advance balance so they don't accidentally pay cash on top of money
  // we've already advanced to that supplier.
  const [selectedSupplierAdvance, setSelectedSupplierAdvance] = useState<number>(0)
  const [supplierQuery, setSupplierQuery] = useState("")
  // متغيرات اختيارية كانت مستخدمة ضمن ربط تلقائي للدفع بالفواتير
  const [selectedFormBillId, setSelectedFormBillId] = useState<string>("")
  // v3.74.145 — explicit "save as advance with no bill link" opt-in.
  // Required when the supplier has outstanding bills, to prevent the
  // accountant from silently creating a vendor payment that should
  // have settled an existing bill.
  const [confirmAdvanceUnlinked, setConfirmAdvanceUnlinked] = useState<boolean>(false)
  // v3.74.146 — payment_id → bill_id resolved from payment_allocations.
  // The display logic on the supplier-payment row only checked
  // payments.bill_id, which is NULL when the link is stored via the
  // newer payment_allocations table. As a result a freshly-recorded
  // payment with an allocation showed "غير مرتبط" / "Not linked"
  // until the row was manually reapplied. We now read both: if
  // payments.bill_id is null but an allocation row points to a bill,
  // we use that bill for display.
  const [allocBillByPayment, setAllocBillByPayment] = useState<Record<string, string>>({})
  const [selectedFormInvoiceId, setSelectedFormInvoiceId] = useState<string>("")
  const [newSuppAccountType] = useState<string>("")
  const [formCustomerInvoices, setFormCustomerInvoices] = useState<InvoiceRow[]>([])
  const [formSupplierBills, setFormSupplierBills] = useState<BillRow[]>([])

  // Apply dialogs
  const [applyInvoiceOpen, setApplyInvoiceOpen] = useState(false)
  const [applyPoOpen, setApplyPoOpen] = useState(false)
  const [applyBillOpen, setApplyBillOpen] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const [customerInvoices, setCustomerInvoices] = useState<InvoiceRow[]>([])
  const [supplierPOs, setSupplierPOs] = useState<PORow[]>([])
  const [supplierBills, setSupplierBills] = useState<BillRow[]>([])
  const [applyAmount, setApplyAmount] = useState<number>(0)
  const [applyDocId, setApplyDocId] = useState<string>("")
  const [saving, setSaving] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Edit/Delete dialogs
  const [editOpen, setEditOpen] = useState(false)
  // v3.74.114 - Request correction dialog state
  const [correctionOpen, setCorrectionOpen] = useState(false)
  const [correctionPayment, setCorrectionPayment] = useState<Payment | null>(null)
  const [correctionReason, setCorrectionReason] = useState("")
  // v3.74.524 — added `original_currency` and `exchange_rate` so the
  // accountant can fix a payment that was rejected because it was
  // recorded in the wrong currency. Payment was in USD, owner wanted
  // EGP → previously the correction dialog offered no way to change
  // the currency at all.
  const [correctionFields, setCorrectionFields] = useState<{
    amount: string; payment_date: string; account_id: string;
    payment_method: string; reference_number: string; notes: string;
    original_currency: string; exchange_rate: string;
  }>({
    amount: "", payment_date: "", account_id: "",
    payment_method: "", reference_number: "", notes: "",
    original_currency: "", exchange_rate: "",
  })
  const [correctionSubmitting, setCorrectionSubmitting] = useState(false)
  // v3.74.526 — exception mode for the correction dialog's account list,
  // mirroring showAllPayAccounts in the supplier-payment form. When false
  // the account dropdown shows only accounts matching the chosen currency.
  const [showAllCorrectionAccounts, setShowAllCorrectionAccounts] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null)
  const [deletingPayment, setDeletingPayment] = useState<Payment | null>(null)
  const [editFields, setEditFields] = useState({ payment_date: "", payment_method: "", reference_number: "", notes: "", account_id: "" })

  // ✅ Approval Workflow state
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectionReason, setRejectionReason] = useState("")
  const [approvingPaymentId, setApprovingPaymentId] = useState<string | null>(null)
  const [rejectingPayment, setRejectingPayment] = useState<Payment | null>(null)

  // === إصلاح أمني: صلاحيات التعديل والحذف ===
  const [permUpdate, setPermUpdate] = useState(false)
  const [permDelete, setPermDelete] = useState(false)
  const [permWrite, setPermWrite] = useState(false)

  // 🔐 ERP Access Control - سياق المستخدم
  const [userContext, setUserContext] = useState<UserContext | null>(null)
  const [canOverrideContext, setCanOverrideContext] = useState(false)

  // 🔐 فلتر الفروع الموحد - يظهر فقط للأدوار المميزة (Owner/Admin/General Manager)
  const branchFilter = useBranchFilter()

  // 🔐 ERP Governance: التحقق من صلاحية الدفع على فاتورة/فاتورة مورد
  // Owner/Admin/General Manager: يمكنهم الدفع على أي فاتورة
  // باقي المستخدمين: يمكنهم الدفع فقط على فواتير فرعهم
  const canPayOnDocument = useCallback((documentBranchId: string | null): boolean => {
    if (!userContext) return false

    // Owner, Admin, General Manager يمكنهم الدفع على أي فاتورة
    const privilegedRoles = ['owner', 'admin', 'general_manager']
    if (userContext.role && privilegedRoles.includes(userContext.role)) {
      return true
    }

    // باقي المستخدمين: يجب أن تكون الفاتورة من نفس الفرع
    // إذا لم يكن للمستخدم فرع محدد، يمكنه الدفع على الفواتير بدون فرع فقط
    if (!userContext.branch_id) {
      return !documentBranchId // يمكنه الدفع فقط على الفواتير بدون فرع
    }

    // إذا كان للمستخدم فرع، يجب أن تكون الفاتورة من نفس الفرع أو بدون فرع
    return !documentBranchId || documentBranchId === userContext.branch_id
  }, [userContext])

  // تهيئة القيم بعد hydration + الاستماع لتغيير اللغة
  useEffect(() => {
    const read = () => { try { setAppLang((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') } catch { } }
    read()
    try { setOnline(navigator.onLine) } catch { }
    window.addEventListener('app_language_changed', read)
    window.addEventListener('storage', read)
    return () => { window.removeEventListener('app_language_changed', read); window.removeEventListener('storage', read) }
  }, [])

  useEffect(() => {
    const checkPerms = async () => {
      const [write, update, del] = await Promise.all([
        canAction(supabase, "payments", "write"),
        canAction(supabase, "payments", "update"),
        canAction(supabase, "payments", "delete"),
      ])
      setPermWrite(write)
      setPermUpdate(update)
      setPermDelete(del)
    }
    checkPerms()
  }, [supabase])

  // مراقبة الاتصال بالإنترنت
  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => {
      setOnline(false)
      toast({ title: "انقطاع الاتصال", description: "لا يوجد اتصال بالإنترنت. بعض الإجراءات ستتوقف.", variant: "default" })
    }
    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [toast])

  // Listen for currency changes
  useEffect(() => {
    let isHandling = false // منع معالجة متعددة في نفس الوقت
    const handleCurrencyChange = () => {
      if (isHandling) return // تجاهل إذا كانت المعالجة جارية
      isHandling = true
      
      const newCurrency = localStorage.getItem('app_currency') || 'EGP'
      if (newCurrency !== paymentCurrency) {
      setPaymentCurrency(newCurrency)
        // ✅ تحديث العملة فقط بدون إعادة تحميل كامل للصفحة
        // البيانات ستُحدث تلقائياً عند تغيير paymentCurrency
      }
      // v3.74.518 — عملة عرض الجدول تتبع عملة التطبيق فقط (لا النموذج)
      setDisplayCurrency(newCurrency)
      
      // إعادة تعيين flag بعد تأخير قصير
      setTimeout(() => {
        isHandling = false
      }, 1000)
    }
    window.addEventListener('app_currency_changed', handleCurrencyChange)
    return () => window.removeEventListener('app_currency_changed', handleCurrencyChange)
  }, [paymentCurrency])

  useEffect(() => {
    ; (async () => {
      try {
        setLoading(true)
        const activeCompanyId = await getActiveCompanyId(supabase)
        if (!activeCompanyId) return
        setCompanyId(activeCompanyId)

        // 🔐 ERP Access Control - جلب سياق المستخدم
        const { data: { user } } = await supabase.auth.getUser()
        let currentRole = 'viewer'
        let currentBranchId: string | null = null
        let currentCostCenterId: string | null = null
        let currentWarehouseId: string | null = null
        
        if (user) {
          const { data: memberData } = await supabase
            .from("company_members")
            .select("role, branch_id, cost_center_id, warehouse_id")
            .eq("company_id", activeCompanyId)
            .eq("user_id", user.id)
            .maybeSingle()

          const { data: companyData } = await supabase
            .from("companies")
            .select("user_id")
            .eq("id", activeCompanyId)
            .single()

          const isOwner = companyData?.user_id === user.id
          currentRole = isOwner ? "owner" : (memberData?.role || "viewer")
          currentBranchId = isOwner ? null : (memberData?.branch_id || null)
          currentCostCenterId = isOwner ? null : (memberData?.cost_center_id || null)
          currentWarehouseId = isOwner ? null : (memberData?.warehouse_id || null)

          const context: UserContext = {
            user_id: user.id,
            company_id: activeCompanyId,
            branch_id: currentBranchId,
            cost_center_id: currentCostCenterId,
            warehouse_id: currentWarehouseId,
            role: currentRole,
          }
          setUserContext(context)
          setCanOverrideContext(["owner", "admin", "manager"].includes(currentRole))
        }

        // Load currencies from database
        const dbCurrencies = await getActiveCurrencies(supabase, activeCompanyId)
        if (dbCurrencies.length > 0) {
          setCurrencies(dbCurrencies)
          const base = dbCurrencies.find(c => c.is_base)
          if (base) setBaseCurrency(base.code)
        }

        // 🔐 ERP Access Control - جلب العملاء مع تطبيق الصلاحيات
        // استخدام القيم المحلية بدلاً من userContext لأن setState غير متزامن
        const accessFilter = getAccessFilter(
          currentRole,
          user?.id || '',
          currentBranchId,
          currentCostCenterId
        );

        let allCustomers: Customer[] = [];
        if (accessFilter.filterByCreatedBy && accessFilter.createdByUserId) {
          // موظف عادي: يرى فقط العملاء الذين أنشأهم
          let query = supabase.from("customers").select("id, name, phone").eq("company_id", activeCompanyId).eq("created_by_user_id", accessFilter.createdByUserId);
          const { data: ownCust } = await query;
          allCustomers = ownCust || [];
          // جلب العملاء المشتركين
          const { data: sharedPerms } = await supabase.from("permission_sharing").select("grantor_user_id").eq("grantee_user_id", user?.id || '').eq("company_id", activeCompanyId).eq("is_active", true).or("resource_type.eq.all,resource_type.eq.customers");
          if (sharedPerms && sharedPerms.length > 0) {
            const grantorIds = sharedPerms.map((p: any) => p.grantor_user_id);
            const { data: sharedCust } = await supabase.from("customers").select("id, name, phone").eq("company_id", activeCompanyId).in("created_by_user_id", grantorIds);
            const existingIds = new Set(allCustomers.map(c => c.id));
            (sharedCust || []).forEach((c: Customer) => { if (!existingIds.has(c.id)) allCustomers.push(c); });
          }
        } else if (accessFilter.filterByBranch) {
          // مدير/محاسب: يرى عملاء الفرع
          if (accessFilter.branchId) {
            // ✅ جلب عملاء الفرع
            const { data: branchCust, error: branchCustError } = await supabase
              .from("customers")
              .select("id, name, phone, branch_id, cost_center_id")
              .eq("company_id", activeCompanyId)
              .eq("branch_id", accessFilter.branchId);
            
            if (branchCustError) {
              console.error("[Payments] Error fetching branch customers:", branchCustError);
              allCustomers = [];
            } else {
          allCustomers = branchCust || [];
              
              // ✅ إضافة فلتر مركز التكلفة إذا كان مفعلاً
              if (accessFilter.filterByCostCenter && accessFilter.costCenterId) {
                allCustomers = allCustomers.filter((c: any) => 
                  !c.cost_center_id || c.cost_center_id === accessFilter.costCenterId
                );
              }
              
              // ✅ إضافة العملاء بدون branch_id (NULL) - قد يكونون عملاء عامين
              // جلبهم بشكل منفصل ودمجهم مع عملاء الفرع
              const { data: nullBranchCust } = await supabase
                .from("customers")
                .select("id, name, phone, branch_id, cost_center_id")
                .eq("company_id", activeCompanyId)
                .is("branch_id", null);
              
              if (nullBranchCust && nullBranchCust.length > 0) {
                // دمج العملاء بدون branch_id مع عملاء الفرع
                const existingIds = new Set(allCustomers.map((c: Customer) => c.id));
                (nullBranchCust as Customer[]).forEach((c: Customer) => {
                  if (!existingIds.has(c.id)) {
                    // ✅ إضافة فقط إذا لم يكن هناك فلتر مركز التكلفة أو إذا كان cost_center_id null أو متطابق
                    if (!accessFilter.filterByCostCenter || !accessFilter.costCenterId ||
                        !c.cost_center_id || c.cost_center_id === accessFilter.costCenterId) {
                      allCustomers.push(c);
                    }
                  }
                });
              }

              // ✅ استثناء (v3.74.621): عملاء لديهم فاتورة في فرع هذا المستخدم —
              // حتى لو كان العميل مسجّلاً على فرع آخر. محاسب الفرع يجب أن يتمكن من
              // تحصيل فواتير فرعه أيًّا كان الفرع الأصلي للعميل.
              const { data: branchInvCust } = await supabase
                .from("invoices")
                .select("customer_id")
                .eq("company_id", activeCompanyId)
                .eq("branch_id", accessFilter.branchId)
                .not("customer_id", "is", null);

              const existingAfterNull = new Set<string>(allCustomers.map((c: Customer) => c.id));
              const branchInvCustomerIds = Array.from(
                new Set(
                  ((branchInvCust || []) as { customer_id: string | null }[])
                    .map((r) => r.customer_id)
                    .filter((id): id is string => !!id && !existingAfterNull.has(id))
                )
              );

              if (branchInvCustomerIds.length > 0) {
                const { data: invLinkedCust } = await supabase
                  .from("customers")
                  .select("id, name, phone, branch_id, cost_center_id")
                  .eq("company_id", activeCompanyId)
                  .in("id", branchInvCustomerIds);

                ((invLinkedCust as Customer[]) || []).forEach((c: Customer) => {
                  if (!existingAfterNull.has(c.id)) {
                    allCustomers.push(c);
                    existingAfterNull.add(c.id);
                  }
                });
              }
            }
        } else {
            // إذا لم يكن هناك branch_id محدد، جلب جميع العملاء (fallback)
            // هذا يحدث عندما يكون المستخدم مدير/محاسب لكن بدون فرع محدد
            const { data: allCust } = await supabase.from("customers").select("id, name, phone").eq("company_id", activeCompanyId);
            allCustomers = allCust || [];
          }
        } else {
          // owner/admin: جميع العملاء
          const { data: allCust } = await supabase.from("customers").select("id, name, phone").eq("company_id", activeCompanyId);
          allCustomers = allCust || [];
        }
        setCustomers(allCustomers)
        // 🔐 ERP Access Control - جلب الموردين مع تطبيق الصلاحيات (نفس منطق العملاء)
        let allSuppliers: Supplier[] = [];
        if (accessFilter.filterByCreatedBy && accessFilter.createdByUserId) {
          // موظف عادي: يرى فقط الموردين الذين أنشأهم
          const { data: ownSupps } = await supabase
            .from("suppliers")
            .select("id, name")
            .eq("company_id", activeCompanyId)
            .eq("created_by_user_id", accessFilter.createdByUserId);
          allSuppliers = ownSupps || [];
          // جلب الموردين المشتركين
          const { data: sharedPerms } = await supabase
            .from("permission_sharing")
            .select("grantor_user_id")
            .eq("grantee_user_id", user?.id || '')
            .eq("company_id", activeCompanyId)
            .eq("is_active", true)
            .or("resource_type.eq.all,resource_type.eq.suppliers");
          if (sharedPerms && sharedPerms.length > 0) {
            const grantorIds = sharedPerms.map((p: any) => p.grantor_user_id);
            const { data: sharedSupps } = await supabase
              .from("suppliers")
              .select("id, name")
              .eq("company_id", activeCompanyId)
              .in("created_by_user_id", grantorIds);
            const existingIds = new Set(allSuppliers.map((s: Supplier) => s.id));
            (sharedSupps || []).forEach((s: Supplier) => { if (!existingIds.has(s.id)) allSuppliers.push(s); });
          }
        } else if (accessFilter.filterByBranch && accessFilter.branchId) {
          // مدير/محاسب: يرى موردين الفرع + الموردين بدون فرع
          const { data: branchSupps } = await supabase
            .from("suppliers")
            .select("id, name")
            .eq("company_id", activeCompanyId)
            .eq("branch_id", accessFilter.branchId);
          allSuppliers = branchSupps || [];
          // إضافة الموردين بدون branch_id
          const { data: nullBranchSupps } = await supabase
            .from("suppliers")
            .select("id, name")
            .eq("company_id", activeCompanyId)
            .is("branch_id", null);
          const existingIds = new Set(allSuppliers.map((s: Supplier) => s.id));
          (nullBranchSupps || []).forEach((s: Supplier) => { if (!existingIds.has(s.id)) allSuppliers.push(s); });
        } else {
          // owner/admin: جميع الموردين
          const { data: supps, error: suppsErr } = await supabase.from("suppliers").select("id, name").eq("company_id", activeCompanyId)
          if (suppsErr) {
            toastActionError(toast, "الجلب", "الموردين", "تعذر جلب قائمة الموردين")
          }
          allSuppliers = supps || [];
        }
        setSuppliers(allSuppliers)
        // 🔐 ERP Access Control - جلب الحسابات مع تصفية حسب سياق المستخدم
        let accountsQuery = supabase
          .from("chart_of_accounts")
          // v3.25.3: include original_currency so we can hint payment forms about FC accounts
          .select("id, account_code, account_name, account_type, sub_type, branch_id, cost_center_id, parent_id, original_currency")
          .eq("company_id", activeCompanyId)
          .eq("is_active", true)

        const { data: accs, error: accsErr } = await accountsQuery
        if (accsErr) {
          toastActionError(toast, "الجلب", "شجرة الحسابات", "تعذر جلب الحسابات")
        }

        // ✅ استخدام filterCashBankAccounts للحصول على حسابات النقد والبنك
        const { filterCashBankAccounts } = await import("@/lib/accounts")
        let cashBankAccounts = filterCashBankAccounts(accs || [], true)

        // ✅ فلترة حسابات النقد والبنك للأدوار العادية لتظهر التابعة لفرعهم فقط
        if (currentRole !== "owner" && currentRole !== "admin" && currentRole !== "general_manager" && currentBranchId) {
          cashBankAccounts = cashBankAccounts.filter((a: any) => a.branch_id === currentBranchId)
        }

        setAccounts(cashBankAccounts as any)

        // v3.26.0: compute balances for cash/bank accounts for available-balance UI
        try {
          const today = new Date().toISOString().slice(0, 10)
          const balances = await computeLeafAccountBalancesAsOf(supabase, activeCompanyId, today)
          const accBalMap: Record<string, number> = {}
          for (const b of balances) {
            accBalMap[b.account_id] = b.balance
          }
          setAccountBalances(accBalMap)
        } catch (err) {
          console.warn("Failed to compute account balances:", err)
        }

        // 🔐 ERP Access Control - جلب المدفوعات مع تطبيق الصلاحيات
        // Owner/Admin/General Manager: يرون جميع المدفوعات
        // باقي المستخدمين: يرون فقط مدفوعات فرعهم
        const { buildDataVisibilityFilter, applyDataVisibilityFilter } = await import("@/lib/data-visibility-control")
        const context: UserContext = {
          user_id: user?.id || '',
          company_id: activeCompanyId,
          branch_id: currentBranchId,
          cost_center_id: currentCostCenterId,
          warehouse_id: currentWarehouseId,
          role: currentRole,
        }
        const visibilityRules = buildDataVisibilityFilter(context)

        // 🔐 الأدوار المميزة التي يمكنها فلترة الفروع
        const PRIVILEGED_ROLES = ['owner', 'admin', 'general_manager']
        const isPrivileged = PRIVILEGED_ROLES.includes(currentRole.toLowerCase())
        const selectedBranchId = branchFilter.getFilteredBranchId()
        const userBranchId = visibilityRules.branchId || null

        // جلب مدفوعات العملاء
        // v3.74.210 — exclude soft-voided rows so v3.74.209's compensating
        // cleanup actually hides them from the page.
        let custPaysQuery = supabase
          .from("payments")
          .select("*, branches:branch_id(name)")
          .eq("company_id", activeCompanyId)
          .not("customer_id", "is", null)
          .or("is_deleted.is.null,is_deleted.eq.false")

        // 🔐 المستخدم المميز: يمكنه فلترة بفرع معين (اختياري)
        // المستخدم العادي: نجلب كل المدفوعات ونفلترها لاحقاً بناءً على فرع الفاتورة
        if (isPrivileged && selectedBranchId) {
          custPaysQuery = custPaysQuery.eq("branch_id", selectedBranchId)
        }
        // ملاحظة: للمستخدم العادي، لا نفلتر هنا - سنفلتر لاحقاً بناءً على فرع الفاتورة

        const { data: custPays, error: custPaysErr } = await custPaysQuery
          .order("payment_date", { ascending: false })
        if (custPaysErr) {
          toastActionError(toast, "الجلب", "مدفوعات العملاء", "تعذر جلب مدفوعات العملاء")
        }

        // 🔐 للمستخدم العادي: حفظ المدفوعات الخام للفلترة لاحقاً
        if (!isPrivileged && userBranchId) {
          setRawCustomerPayments(custPays || [])
          setPendingBranchFilter({ userBranchId, isPrivileged: false })
          // لا نعرض شيء حتى يتم الفلترة بناءً على فرع الفاتورة
          setCustomerPayments([])
        } else {
          setCustomerPayments(custPays || [])
          setRawCustomerPayments([])
        }

        // جلب مدفوعات الموردين
        // v3.74.210 — same is_deleted filter as the customer query above.
        let suppPaysQuery = supabase
          .from("payments")
          .select("*, branches:branch_id(name)")
          .eq("company_id", activeCompanyId)
          .not("supplier_id", "is", null)
          .or("is_deleted.is.null,is_deleted.eq.false")

        // 🔐 الأدوار المميزة: فلترة اختيارية بالفرع المحدد
        if (isPrivileged && selectedBranchId) {
          suppPaysQuery = suppPaysQuery.eq("branch_id", selectedBranchId)
        }
        // 🔐 الأدوار العادية: فلترة مباشرة بفرع المستخدم في القاعدة (ERP standard)
        if (!isPrivileged && userBranchId) {
          suppPaysQuery = suppPaysQuery.eq("branch_id", userBranchId)
        }

        const { data: suppPays, error: suppPaysErr } = await suppPaysQuery
          .order("payment_date", { ascending: false })
        if (suppPaysErr) {
          toastActionError(toast, "الجلب", "مدفوعات الموردين", "تعذر جلب مدفوعات الموردين")
        }

        // ✅ دائماً نعرض المدفوعات مباشرة (مفلترة في القاعدة)
        setSupplierPayments(suppPays || [])
        setRawSupplierPayments([])

        // 🔐 جلب قائمة الفروع للعرض في الجداول
        const { data: branchesData } = await supabase
          .from("branches")
          .select("id, name")
          .eq("company_id", activeCompanyId)
          .order("name")
        setBranches(branchesData || [])

        // إنشاء خريطة أسماء الفروع للوصول السريع
        const branchNameMap: Record<string, string> = {}
        ;(branchesData || []).forEach((b: Branch) => { branchNameMap[b.id] = b.name })
        setBranchNames(branchNameMap)
      } finally {
        setLoading(false)
      }
    })()
  }, [branchFilter.selectedBranchId]) // إعادة تحميل البيانات عند تغيير الفرع المحدد

  // 🔄 الاستماع لتغيير الشركة وإعادة تحميل الصفحة
  useEffect(() => {
    let isReloading = false // منع reload متعدد
    const handleCompanyChange = () => {
      if (isReloading) return // تجاهل إذا كان reload جارياً
      isReloading = true
      // تأخير قصير قبل reload لمنع reload متعدد
      setTimeout(() => {
      window.location.reload();
      }, 100)
    };
    window.addEventListener('company_updated', handleCompanyChange);
    return () => window.removeEventListener('company_updated', handleCompanyChange);
  }, []);

  // 🔄 Realtime: تحديث قائمة المدفوعات تلقائياً عند أي تغيير
  const reloadPaymentsRef = useRef<() => void>(() => {})

  // 🔄 دالة مشتركة لإعادة تحميل المدفوعات مع تطبيق الفلترة الصحيحة
  // v3.74.57 - تَحديث تِلقائى عِندَ العَودَة للنّافِذَة/التَّبويب
  useAutoRefresh({ onRefresh: () => reloadPaymentsWithFilters() })

  const reloadPaymentsWithFilters = useCallback(async () => {
    if (!companyId || !userContext) return
    try {
      const { buildDataVisibilityFilter } = await import("@/lib/data-visibility-control")
      const visibilityRules = buildDataVisibilityFilter(userContext)

      const PRIVILEGED_ROLES = ['owner', 'admin', 'general_manager']
      const isPrivileged = PRIVILEGED_ROLES.includes((userContext.role || '').toLowerCase())
      const selectedBranchId = branchFilter.getFilteredBranchId()
      const userBranchId = visibilityRules.branchId || null

      // جلب مدفوعات العملاء
      // v3.74.210 — exclude soft-voided rows here too (this is the realtime
      // refresh path).
      let custPaysQuery = supabase
        .from("payments")
        .select("*, branches:branch_id(name)")
        .eq("company_id", companyId)
        .not("customer_id", "is", null)
        .or("is_deleted.is.null,is_deleted.eq.false")

      // 🔐 المستخدم المميز: يمكنه فلترة بفرع معين (اختياري)
      if (isPrivileged && selectedBranchId) {
        custPaysQuery = custPaysQuery.eq("branch_id", selectedBranchId)
      }

      const { data: custPays } = await custPaysQuery.order("payment_date", { ascending: false })

      // 🔐 للمستخدم العادي: حفظ المدفوعات الخام للفلترة لاحقاً
      if (!isPrivileged && userBranchId) {
        setRawCustomerPayments(custPays || [])
        setPendingBranchFilter({ userBranchId, isPrivileged: false })
        setCustomerPayments([])
      } else {
        setCustomerPayments(custPays || [])
        setRawCustomerPayments([])
      }

      // جلب مدفوعات الموردين مع فرع الفاتورة وأمر الشراء مباشرةً
      // v3.74.210 — exclude soft-voided rows.
      let suppPaysQuery = supabase
        .from("payments")
        .select("*, branches:branch_id(name)")
        .eq("company_id", companyId)
        .not("supplier_id", "is", null)
        .or("is_deleted.is.null,is_deleted.eq.false")

      // 🔐 المستخدم المميز: يمكنه فلترة بفرع معين (اختياري)
      if (isPrivileged && selectedBranchId) {
        suppPaysQuery = suppPaysQuery.eq("branch_id", selectedBranchId)
      }

      // 🔐 المستخدم العادي: تطبيق فلتر الفرع مباشرة في الاستعلام (ERP standard)
      if (!isPrivileged && userBranchId) {
        suppPaysQuery = suppPaysQuery.eq("branch_id", userBranchId)
      }

      const { data: suppPays } = await suppPaysQuery.order("payment_date", { ascending: false })

      // ✅ المستخدم العادي يرى مدفوعات فرعه فقط (مفلترة في القاعدة)
      setSupplierPayments(suppPays || [])
      setRawSupplierPayments([])
    } catch (err) {
      console.error("Error reloading payments with filters:", err)
    }
  }, [companyId, userContext, branchFilter, supabase])

  // تعيين الريفرينس للدالة الأحدث بدون التسبب في إعادة إنشاء handlePaymentsRealtimeEvent
  useEffect(() => {
    reloadPaymentsRef.current = reloadPaymentsWithFilters
  }, [reloadPaymentsWithFilters])

  const handlePaymentsRealtimeEvent = useCallback(() => {
    console.log('🔄 [Payments] Realtime event received, refreshing payments list...')
    reloadPaymentsRef.current()
  }, [])

  useRealtimeTable({
    table: 'payments',
    enabled: true,
    onInsert: handlePaymentsRealtimeEvent,
    onUpdate: handlePaymentsRealtimeEvent,
    onDelete: handlePaymentsRealtimeEvent,
  })

  // Load invoice numbers, branch_ids and related sales orders for displayed customer payments
  // 🔐 للمستخدم العادي: نجلب بيانات الفواتير من المدفوعات الخام ثم نفلتر
  // ✅ إصلاح: إزالة customerPayments من dependencies لمنع infinite loop
  useEffect(() => {
    ; (async () => {
      try {
        // استخدام المدفوعات الخام للمستخدم العادي، أو المدفوعات المفلترة للمستخدم المميز
        const paymentsToProcess = rawCustomerPayments.length > 0 ? rawCustomerPayments : customerPayments
        const ids = Array.from(new Set((paymentsToProcess || []).map((p) => p.invoice_id).filter(Boolean))) as string[]
        if (!ids.length) {
          setInvoiceNumbers({})
          setInvoiceToSalesOrderMap({})
          setInvoiceBranchMap({})
          // 🔐 للمستخدم العادي: إذا لا توجد فواتير، نعرض قائمة فارغة
          if (rawCustomerPayments.length > 0 && pendingBranchFilter) {
            setCustomerPayments([])
          }
          return
        }
        // ✅ جلب branch_id مع بيانات الفاتورة لعرض الفرع الصحيح في قائمة المدفوعات
        const { data: invs } = await supabase.from("invoices").select("id, invoice_number, sales_order_id, branch_id").in("id", ids)
        const map: Record<string, string> = {}
        const branchMap: Record<string, string> = {} // invoice_id -> branch_id
        const salesOrderIds: string[] = []
        ; (invs || []).forEach((r: any) => {
          map[r.id] = r.invoice_number
          if (r.branch_id) branchMap[r.id] = r.branch_id
          if (r.sales_order_id) salesOrderIds.push(r.sales_order_id)
        })
        setInvoiceNumbers(map)
        setInvoiceBranchMap(branchMap)

        // 🔐 للمستخدم العادي: فلترة المدفوعات بناءً على فرع الفاتورة
        if (rawCustomerPayments.length > 0 && pendingBranchFilter && pendingBranchFilter.userBranchId) {
          const userBranchId = pendingBranchFilter.userBranchId
          const filteredPayments = rawCustomerPayments.filter((p) => {
            // 1. إذا الدفعة لها branch_id ويطابق فرع المستخدم
            if (p.branch_id === userBranchId) return true
            // 2. إذا الفاتورة المرتبطة من فرع المستخدم
            if (p.invoice_id && branchMap[p.invoice_id] === userBranchId) return true
            // 3. إذا الدفعة بدون branch_id والفاتورة بدون branch_id (fallback)
            if (!p.branch_id && p.invoice_id && !branchMap[p.invoice_id]) return true
            return false
          })
          setCustomerPayments(filteredPayments)
        }

        // جلب بيانات أوامر البيع المرتبطة
        if (salesOrderIds.length > 0) {
          const uniqueSoIds = Array.from(new Set(salesOrderIds))
          const { data: salesOrders } = await supabase.from("sales_orders").select("id, so_number").in("id", uniqueSoIds)
          const soMap: Record<string, { id: string; so_number: string }> = {}
          // ربط الفاتورة بأمر البيع
          ; (invs || []).forEach((inv: any) => {
            if (inv.sales_order_id) {
              const so = (salesOrders || []).find((s: any) => s.id === inv.sales_order_id)
              if (so) {
                soMap[inv.id] = { id: so.id, so_number: so.so_number }
              }
            }
          })
          setInvoiceToSalesOrderMap(soMap)
        } else {
          setInvoiceToSalesOrderMap({})
        }
      } catch (e) { /* ignore */ }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawCustomerPayments, pendingBranchFilter, supabase])

  // Load bill numbers and branch_ids for displayed supplier payments
  // ✅ يدعم كلاً من: bill_id مباشر على الدفعة + payment_allocations (نظام التوزيع الجديد)
  useEffect(() => {
    ;(async () => {
      try {
        const paymentsToProcess = rawSupplierPayments.length > 0 ? rawSupplierPayments : supplierPayments
        if (!paymentsToProcess.length) {
          setBillNumbers({})
          setBillBranchMap({})
          setBillToPoMap({})
          setPoNumbers({})
          setBillAmountsMap({})
          return
        }

        // 1. bill_ids المباشرة على الدفعة (النظام القديم)
        const directBillIds = Array.from(new Set(paymentsToProcess.map((p) => p.bill_id).filter(Boolean))) as string[]

        // 2. bill_ids من payment_allocations (نظام التوزيع الجديد)
        const paymentIds = paymentsToProcess.map((p) => p.id)
        let allocBillIds: string[] = []
        const newAllocBillByPayment: Record<string, string> = {}
        if (paymentIds.length > 0) {
          const { data: allocs } = await supabase
            .from("payment_allocations")
            .select("payment_id, bill_id")
            .in("payment_id", paymentIds)
            .not("bill_id", "is", null)
          ;(allocs || []).forEach((a: any) => {
            // v3.74.146 — keep the first bill we see per payment for the
            // display table. Multi-bill allocations still settle every
            // bill in the allocations row; the table just shows one for
            // brevity (clicking the link opens that bill).
            if (a.payment_id && a.bill_id && !newAllocBillByPayment[a.payment_id]) {
              newAllocBillByPayment[a.payment_id] = a.bill_id
            }
          })
          allocBillIds = Array.from(new Set(Object.values(newAllocBillByPayment))) as string[]
        }
        setAllocBillByPayment(newAllocBillByPayment)

        const ids = Array.from(new Set([...directBillIds, ...allocBillIds]))
        if (!ids.length) {
          setBillNumbers({})
          setBillBranchMap({})
          setBillToPoMap({})
          setPoNumbers({})
          setBillAmountsMap({})
          // 🔐 للمستخدم العادي: إذا لا توجد فواتير مرتبطة → قائمة فارغة
          if (rawSupplierPayments.length > 0) setSupplierPayments([])
          return
        }

        // ✅ جلب branch_id مع بيانات الفاتورة
        const { data: bills } = await supabase
          .from("bills")
          .select("id, bill_number, purchase_order_id, branch_id, total_amount, returned_amount")
          .in("id", ids)
        const map: Record<string, string> = {}
        const branchMap: Record<string, string> = {} // bill_id -> branch_id
        const billPoMap: Record<string, string> = {}  // bill_id -> purchase_order_id
        const amountsMap: Record<string, {total: number, returned: number}> = {} // bill_id -> amounts
        ;(bills || []).forEach((r: any) => {
          map[r.id] = r.bill_number
          if (r.branch_id) branchMap[r.id] = r.branch_id
          if (r.purchase_order_id) billPoMap[r.id] = r.purchase_order_id
          amountsMap[r.id] = { total: Number(r.total_amount || 0), returned: Number(r.returned_amount || 0) }
        })
        setBillNumbers(map)
        setBillBranchMap(branchMap)
        setBillToPoMap(billPoMap)
        setBillAmountsMap(amountsMap)

        // ✅ جلب أرقام أوامر الشراء
        const poIds = Array.from(new Set((bills || []).map((b: any) => b.purchase_order_id).filter(Boolean))) as string[]
        if (poIds.length > 0) {
          const { data: pos } = await supabase.from("purchase_orders").select("id, po_number").in("id", poIds)
          const poMap: Record<string, string> = {}
          ;(pos || []).forEach((po: any) => { poMap[po.id] = po.po_number })
          setPoNumbers(poMap)
        } else {
          setPoNumbers({})
        }

      } catch (e) { /* ignore */ }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierPayments, supabase])

  // Load account names for displayed supplier payments
  useEffect(() => {
    ; (async () => {
      try {
        const accountIds = Array.from(new Set((supplierPayments || []).map((p) => p.account_id).filter(Boolean))) as string[]
        if (!accountIds.length) { setAccountNames({}); return }
        const { data: accs } = await supabase.from("chart_of_accounts").select("id, account_name, account_code").in("id", accountIds)
        const map: Record<string, string> = {}
        ; (accs || []).forEach((a: any) => { 
          map[a.id] = `${a.account_name} (${a.account_code})`
        })
        setAccountNames(map)
      } catch (e) { /* ignore */ }
    })()
  }, [supplierPayments, supabase])

  // جلب فواتير العميل غير المسددة بالكامل عند اختيار عميل في نموذج إنشاء دفعة
  // 🔐 ERP Governance: فلترة حسب الفرع للمستخدمين غير المميزين
  useEffect(() => {
    ; (async () => {
      try {
        setSelectedFormInvoiceId("")
        if (!newCustPayment.customer_id) { setFormCustomerInvoices([]); return }

        let query = supabase
          .from("invoices")
          .select("id, invoice_number, invoice_date, total_amount, paid_amount, status, branch_id, branches:branch_id(name)")
          .eq("customer_id", newCustPayment.customer_id)
          .in("status", ["sent", "partially_paid", "partially_returned"]) // غير مسددة بالكامل (بما فيها المرتجعة جزئياً)

        // 🔐 ERP Governance: فلترة حسب الفرع للمستخدمين غير المميزين
        if (userContext && !canOverrideContext && userContext.branch_id) {
          query = query.eq("branch_id", userContext.branch_id)
        }

        const { data: invs } = await query.order("invoice_date", { ascending: false })
        setFormCustomerInvoices(invs || [])
      } catch (e) { /* ignore */ }
    })()
  }, [newCustPayment.customer_id, userContext, canOverrideContext])

  // جلب فواتير المورد غير المسددة بالكامل عند اختيار مورد في نموذج إنشاء دفعة
  // 🔐 ERP Governance: فلترة حسب الفرع للمستخدمين غير المميزين
  useEffect(() => {
    ; (async () => {
      try {
        setSelectedFormBillId("")
        if (!newSuppPayment.supplier_id) { setFormSupplierBills([]); return }
        if (!companyId) return

        let query = supabase
          .from("bills")
          .select("id, bill_number, bill_date, total_amount, paid_amount, returned_amount, status, branch_id, branches:branch_id(name)")
          .eq("supplier_id", newSuppPayment.supplier_id)
          .eq("company_id", companyId)
          .in("status", ["received", "partially_paid", "partially_returned"]) // ✅ فقط بعد الاستلام المخزني

        // 🔐 ERP Governance: فلترة حسب الفرع للمستخدمين غير المميزين
        if (userContext && !canOverrideContext && userContext.branch_id) {
          // ✅ يرى فواتير فرعه + الفواتير بدون branch_id (فواتير عامة للشركة)
          query = query.or(`branch_id.eq.${userContext.branch_id},branch_id.is.null`)
        }

        const { data: bills, error: billsFetchErr } = await query.order("bill_date", { ascending: false })
        if (billsFetchErr) console.error("Error loading supplier bills:", billsFetchErr)
        setFormSupplierBills(bills || [])
      } catch (e) {
        console.error("Error loading supplier bills:", e)
        setFormSupplierBills([])
      }
    })()
  }, [newSuppPayment.supplier_id, companyId, supabase, userContext, canOverrideContext])

  // 🔍 دالة للتحقق من كفاية رصيد الحساب البنكي/الخزنة
  const checkAccountBalance = async (accountId: string | null, amount: number, paymentDate: string): Promise<{ sufficient: boolean; currentBalance: number; accountName?: string }> => {
    if (!accountId || !companyId) {
      // إذا لم يتم اختيار حساب، نعتبر أن الرصيد كافٍ (سيستخدم الحساب الافتراضي)
      return { sufficient: true, currentBalance: 0 }
    }

    try {
      // جلب معلومات الحساب
      const { data: accountData } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name, account_type, opening_balance, sub_type")
        .eq("id", accountId)
        .eq("company_id", companyId)
        .single()

      if (!accountData) {
        return { sufficient: false, currentBalance: 0 }
      }

      // حساب الرصيد الحالي حتى تاريخ الدفع
      const balances = await computeLeafAccountBalancesAsOf(supabase, companyId, paymentDate)
      const accountBalance = balances.find(b => b.account_id === accountId)

      if (!accountBalance) {
        // إذا لم يتم العثور على الرصيد، نستخدم opening_balance
        const currentBalance = Number(accountData.opening_balance || 0)
        return {
          sufficient: currentBalance >= amount,
          currentBalance,
          accountName: accountData.account_name
        }
      }

      // التحقق من كفاية الرصيد
      // للحسابات البنكية/الخزنة (أصول): الرصيد الطبيعي مدين، يجب أن يكون >= المبلغ
      const currentBalance = accountBalance.balance

      // للحسابات البنكية/الخزنة: الرصيد يجب أن يكون >= المبلغ المطلوب
      return {
        sufficient: currentBalance >= amount,
        currentBalance,
        accountName: accountData.account_name
      }
    } catch (error) {
      console.error("Error checking account balance:", error)
      // 🔒 في حالة الخطأ، نمنع الدفع للحماية من الأخطاء المحاسبية
      // إذا لم نتمكن من التحقق من الرصيد، من الأفضل منع العملية
      return { sufficient: false, currentBalance: 0 }
    }
  }

  const createCustomerPayment = async () => {
    try {
      setSaving(true)

      // 🚫 منع المبالغ السالبة - المرتجعات يجب أن تكون في sales_returns
      if (newCustPayment.amount < 0) {
        toast({
          title: appLang === 'en' ? 'Invalid Amount' : 'مبلغ غير صحيح',
          description: appLang === 'en'
            ? 'Payment amount cannot be negative. For returns, use the Returns feature in the invoice page.'
            : 'لا يمكن أن يكون مبلغ الدفعة سالباً. للمرتجعات، استخدم ميزة المرتجعات في صفحة الفاتورة.',
          variant: 'destructive'
        })
        setSaving(false)
        return
      }

      if (!newCustPayment.customer_id || newCustPayment.amount <= 0) return
      if (!companyId) return

      // v3.74.516 — تأكيد صريح عند اختلاف عملة الدفع عن عملة الحساب (استثناء واعٍ)
      {
        const selAcc = accounts.find((a) => a.id === newCustPayment.account_id) as any
        const accCcy = accountCurrencyOf(selAcc)
        const payCcy = paymentCurrency.toUpperCase()
        if (selAcc && accCcy !== payCcy) {
          const equiv = (Number(newCustPayment.amount || 0) * (exchangeRate || 0)).toFixed(2)
          const ok = window.confirm(appLang === 'en'
            ? `Exception: payment currency (${payCcy}) differs from the account "${selAcc.account_name}" currency (${accCcy}).\nThe account will be affected by the equivalent ${equiv} ${baseCurrency}. Continue?`
            : `تأكيد استثنائى: عملة الدفع (${payCcy}) تختلف عن عملة الحساب "${selAcc.account_name}" (${accCcy}).\nسيتأثر الحساب بالمعادل ${equiv} ${baseCurrency} بسعر الصرف المختار. هل تريد المتابعة؟`)
          if (!ok) { setSaving(false); return }
        }
      }

      // ✅ دفعات العملاء هي مقبوضات (مدخلات) - لا نحتاج للتحقق من الرصيد
      // المال يدخل للحساب، لذا لا يوجد مشكلة في الرصيد

      // 🔐 ERP Access Control - التحقق من صلاحية استخدام الحساب البنكي
      if (userContext && newCustPayment.account_id) {
        // جلب معلومات الحساب للتحقق من الفرع ومركز التكلفة
        const { data: accountData } = await supabase
          .from("chart_of_accounts")
          .select("branch_id, cost_center_id")
          .eq("id", newCustPayment.account_id)
          .single()

        if (accountData) {
          const accessResult = validateBankAccountAccess(
            userContext,
            accountData.branch_id,
            accountData.cost_center_id,
            appLang
          )
          if (!accessResult.isValid && accessResult.error) {
            toast({
              title: accessResult.error.title,
              description: accessResult.error.description,
              variant: "destructive"
            })
            setSaving(false)
            return
          }
        }
      }

      const savedAmount = newCustPayment.amount
      const allocations = selectedFormInvoiceId
        ? [{ invoiceId: selectedFormInvoiceId, amount: savedAmount }]
        : []
      const response = await fetch("/api/customer-payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": globalThis.crypto?.randomUUID?.() || `customer-payment-create-${newCustPayment.customer_id}-${Date.now()}`,
        },
        body: JSON.stringify({
          customerId: newCustPayment.customer_id,
          amount: savedAmount,
          paymentDate: newCustPayment.date,
          paymentMethod: newCustPayment.method,
          accountId: newCustPayment.account_id || null,
          referenceNumber: newCustPayment.ref || null,
          notes: newCustPayment.notes || null,
          currencyCode: paymentCurrency,
          exchangeRate,
          baseCurrencyAmount: paymentCurrency !== baseCurrency ? savedAmount * exchangeRate : savedAmount,
          originalAmount: savedAmount,
          originalCurrency: paymentCurrency,
          exchangeRateId: exchangeRateId || null,
          rateSource,
          allocations,
          uiSurface: selectedFormInvoiceId ? "payments_page_customer_form_auto_invoice" : "payments_page_customer_form",
        }),
      })

      const result = await response.json().catch(() => ({})) as { success?: boolean; error?: string }
      if (!response.ok || !result.success) {
        throw new Error(result.error || (appLang === 'en' ? 'Failed to create customer payment' : 'فشل إنشاء دفعة العميل'))
      }

      setNewCustPayment({ customer_id: "", amount: 0, date: newCustPayment.date, method: "cash", ref: "", notes: "", account_id: "" })
      toastActionSuccess(toast, "الإنشاء", "الدفعة")
      // 🔐 إعادة تحميل المدفوعات مع تطبيق الفلترة الصحيحة
      await reloadPaymentsWithFilters()
    } catch (err: any) {
      console.error("Error creating customer payment:", { message: err?.message, details: err })
      toastActionError(toast, "الإنشاء", "الدفعة", "فشل إنشاء الدفعة")
    } finally {
      setSaving(false)
    }
  }

  const createSupplierPayment = async () => {
    try {
      setSaving(true)

      // 🚫 منع المبالغ السالبة - المرتجعات يجب أن تكون في purchase_returns
      if (newSuppPayment.amount < 0) {
        toast({
          title: appLang === 'en' ? 'Invalid Amount' : 'مبلغ غير صحيح',
          description: appLang === 'en'
            ? 'Payment amount cannot be negative. For returns, use the Returns feature in the bill page.'
            : 'لا يمكن أن يكون مبلغ الدفعة سالباً. للمرتجعات، استخدم ميزة المرتجعات في صفحة الفاتورة.',
          variant: 'destructive'
        })
        setSaving(false)
        return
      }

      // ❗ Guard: reset saving if supplier/amount/company missing
      if (!newSuppPayment.supplier_id || newSuppPayment.amount <= 0 || !companyId) {
        toast({
          title: appLang === 'en' ? 'Missing Fields' : 'حقول مفقودة',
          description: appLang === 'en'
            ? 'Please select a supplier, enter an amount greater than 0, and ensure you are connected.'
            : 'يرجى اختيار مورد، وإدخال مبلغ أكبر من صفر.',
          variant: 'destructive'
        })
        setSaving(false)
        return
      }

      // v3.74.145 — Mandatory bill-link guard. If the supplier has at
      // least one outstanding bill and the accountant didn't pick one,
      // make them explicitly confirm "save as advance" via the dedicated
      // checkbox/button below the bill table. Without this we silently
      // produced orphan supplier payments with no bill link, which the
      // user reported in testing ("غير مرتبط" on a payment that should
      // have settled BILL-0002).
      const hasOutstandingBills = (formSupplierBills || []).some((b: any) => {
        const returnedAmt = Number((b as any).returned_amount || 0)
        const net = Math.max(Number(b.total_amount || 0) - returnedAmt - Number(b.paid_amount || 0), 0)
        return net > 0
      })
      if (hasOutstandingBills && !selectedFormBillId && !confirmAdvanceUnlinked) {
        toast({
          title: appLang === 'en' ? 'Pick a bill' : 'اختر فاتورة',
          description: appLang === 'en'
            ? 'This supplier has outstanding bills. Pick one from the list above, or tick "Advance payment with no bill link" first.'
            : 'لهذا المورد فواتير غير مسددة. اختر فاتورة من الجدول أعلاه، أو فعّل "دفعة سُلفة بدون ربط بفاتورة" أولاً.',
          variant: 'destructive'
        })
        setSaving(false)
        return
      }

      // v3.74.516 — تأكيد صريح عند اختلاف عملة الدفع عن عملة الحساب (استثناء واعٍ)
      {
        const selAcc = accounts.find((a) => a.id === newSuppPayment.account_id) as any
        const accCcy = accountCurrencyOf(selAcc)
        const payCcy = paymentCurrency.toUpperCase()
        if (selAcc && accCcy !== payCcy) {
          const equiv = (Number(newSuppPayment.amount || 0) * (exchangeRate || 0)).toFixed(2)
          const ok = window.confirm(appLang === 'en'
            ? `Exception: payment currency (${payCcy}) differs from the account "${selAcc.account_name}" currency (${accCcy}).\nThe account will be affected by the equivalent ${equiv} ${baseCurrency}. Continue?`
            : `تأكيد استثنائى: عملة الدفع (${payCcy}) تختلف عن عملة الحساب "${selAcc.account_name}" (${accCcy}).\nسيتأثر الحساب بالمعادل ${equiv} ${baseCurrency} بسعر الصرف المختار. هل تريد المتابعة؟`)
          if (!ok) { setSaving(false); return }
        }
      }

      // 🔍 التحقق من كفاية الرصيد قبل إنشاء الدفعة
      const balanceCheck = await checkAccountBalance(
        newSuppPayment.account_id || null,
        newSuppPayment.amount,
        newSuppPayment.date
      )

      if (!balanceCheck.sufficient) {
        toast({
          title: appLang === 'en' ? 'Insufficient Balance' : 'رصيد غير كافٍ',
          description: appLang === 'en'
            ? `The account "${balanceCheck.accountName || 'Selected Account'}" has insufficient balance. Current balance: ${balanceCheck.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. Required: ${newSuppPayment.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`
            : `رصيد الحساب "${balanceCheck.accountName || 'الحساب المختار'}" غير كافٍ. الرصيد الحالي: ${balanceCheck.currentBalance.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. المطلوب: ${newSuppPayment.amount.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
          variant: 'destructive'
        })
        setSaving(false)
        return
      }

      // Validate selected cash/bank account belongs to company and exists
      if (newSuppPayment.account_id) {
        const { data: acct, error: acctErr } = await supabase
          .from("chart_of_accounts")
          .select("id, company_id, branch_id, cost_center_id")
          .eq("id", newSuppPayment.account_id)
          .eq("company_id", companyId)
          .single()
        if (acctErr || !acct) {
          toastActionError(toast, "التحقق", "الحساب", "الحساب المختار غير موجود أو لا يتبع الشركة")
          return
        }

        // 🔐 ERP Access Control - التحقق من صلاحية استخدام الحساب البنكي
        if (userContext) {
          const accessResult = validateBankAccountAccess(
            userContext,
            acct.branch_id,
            acct.cost_center_id,
            appLang
          )
          if (!accessResult.isValid && accessResult.error) {
            toast({
              title: accessResult.error.title,
              description: accessResult.error.description,
              variant: "destructive"
            })
            setSaving(false)
            return
          }
        }
      }
      // ✅ Get the bill's branch_id if a bill is selected (use it over user's branch for accuracy)
      const selectedBillData = selectedFormBillId
        ? formSupplierBills.find((b: any) => b.id === selectedFormBillId)
        : null
      const billBranchId = (selectedBillData as any)?.branch_id || null

      const supplierPaymentPayload = {
        supplierId: newSuppPayment.supplier_id,
        amount: newSuppPayment.amount,
        paymentDate: newSuppPayment.date,
        paymentMethod: newSuppPayment.method,
        referenceNumber: newSuppPayment.ref || null,
        notes: newSuppPayment.notes || null,
        accountId: newSuppPayment.account_id || null,
        currencyCode: paymentCurrency,
        exchangeRate,
        exchangeRateId: exchangeRateId || null,
        rateSource,
        baseCurrencyAmount: paymentCurrency !== baseCurrency ? newSuppPayment.amount * exchangeRate : newSuppPayment.amount,
        originalAmount: newSuppPayment.amount,
        originalCurrency: paymentCurrency,
        branchId: billBranchId || userContext?.branch_id || null,
        allocations: selectedFormBillId
          ? [{ billId: selectedFormBillId, amount: newSuppPayment.amount }]
          : [],
        uiSurface: selectedFormBillId ? "payments_page_single_bill" : "payments_page_single_advance",
        appLang,
      }

      const response = await fetch("/api/supplier-payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": globalThis.crypto?.randomUUID?.() || `supplier-payment-${Date.now()}`,
        },
        body: JSON.stringify(supplierPaymentPayload),
      })

      const result = await response.json() as SupplierPaymentApiResult & { error?: string }
      if (!response.ok || !result.success) {
        throw new Error(result.error || "فشل إنشاء دفعة المورد")
      }

      if (!result.approved) {
        // Reset form and refresh list
        setNewSuppPayment({ supplier_id: "", amount: 0, date: newSuppPayment.date, method: "cash", ref: "", notes: "", account_id: "" })
        setSelectedFormBillId("")
        // 🔐 إعادة تحميل المدفوعات مع تطبيق الفلترة الصحيحة لجلب Joins
        await reloadPaymentsWithFilters()
        toast({
          title: appLang === 'en' ? '⏳ Pending Approval' : '⏳ في انتظار الاعتماد',
          description: appLang === 'en'
            ? 'Your payment request has been submitted and is awaiting approval from a manager.'
            : 'تم تقديم طلب الدفع وهو في انتظار اعتماد المدير. لن تتأثر الفاتورة حتى يتم الاعتماد.',
        })
        setSaving(false)
        return
      }

      setNewSuppPayment({ supplier_id: "", amount: 0, date: newSuppPayment.date, method: "cash", ref: "", notes: "", account_id: "" })
      setSelectedFormBillId("")
      await reloadPaymentsWithFilters()
      toast({
        title: appLang === 'en' ? '✅ Payment Created' : '✅ تم إنشاء الدفعة',
        description: result.posted
          ? (appLang === 'en' ? 'Supplier payment posted successfully.' : 'تم ترحيل دفعة المورد محاسبياً بنجاح.')
          : (appLang === 'en' ? 'Payment created and advanced to the next approval stage.' : 'تم إنشاء الدفعة وتحويلها لمسار الاعتماد.'),
      })
    } catch (err: any) {
      // اطبع الكائن الأصلي للخطأ لتسهيل التشخيص
      console.error("Error creating supplier payment:", err)
      const msg = typeof err === "string"
        ? err
        : (err?.message || err?.hint || err?.details || err?.error || "فشل إنشاء الدفعة")
      toastActionError(toast, "الإنشاء", "دفعة المورد", String(msg))
    } finally {
      setSaving(false)
    }
  }

  // ✅ APPROVAL WORKFLOW: Approve a pending payment (Multi-Level)
  const approvePayment = async (payment: Payment) => {
    if (!companyId) return
    try {
      setSaving(true)
      const response = await fetch(`/api/supplier-payments/${payment.id}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": globalThis.crypto?.randomUUID?.() || `supplier-payment-approve-${payment.id}-${Date.now()}`,
        },
        body: JSON.stringify({
          action: "APPROVE",
          uiSurface: "payments_page",
          appLang,
        }),
      })

      const updatedPayment = await response.json() as SupplierPaymentApiResult & { error?: string }
      if (!response.ok || !updatedPayment.success) {
        throw new Error(updatedPayment.error || "فشل اعتماد دفعة المورد")
      }

      // 4. Refresh list
      await reloadPaymentsWithFilters()
      setApprovingPaymentId(null)
      toast({
        title: appLang === 'en' ? '✅ Stage Approved' : '✅ تمت الموافقة',
        description: updatedPayment.status === 'approved'
          ? (appLang === 'en' ? 'Payment posted to accounts.' : 'تم تسجيل القيود المحاسبية.')
          : (appLang === 'en' ? 'Stage approved successfully.' : 'تم إتمام مرحلة الاعتماد بنجاح.'),
      })
    } catch (err: any) {
      toastActionError(toast, "الاعتماد", "الدفعة", String(err?.message || err))
    } finally {
      setSaving(false)
    }
  }

  // ✅ APPROVAL WORKFLOW: Reject a pending payment (privileged roles only)
  const rejectPayment = async () => {
    if (!rejectingPayment || !companyId || !rejectionReason.trim()) return
    try {
      setSaving(true)
      const response = await fetch(`/api/supplier-payments/${rejectingPayment.id}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": globalThis.crypto?.randomUUID?.() || `supplier-payment-reject-${rejectingPayment.id}-${Date.now()}`,
        },
        body: JSON.stringify({
          action: "REJECT",
          rejectionReason: rejectionReason.trim(),
          uiSurface: "payments_page",
          appLang,
        }),
      })

      const result = await response.json() as SupplierPaymentApiResult & { error?: string }
      if (!response.ok || !result.success) {
        throw new Error(result.error || "فشل رفض دفعة المورد")
      }

      await reloadPaymentsWithFilters()
      setRejectOpen(false)
      setRejectingPayment(null)
      setRejectionReason("")
      toast({
        title: appLang === 'en' ? '❌ Payment Rejected' : '❌ تم رفض الدفعة',
        description: appLang === 'en' ? 'The payment has been rejected.' : 'تم رفض الدفعة وإشعار المنشئ.',
      })
    } catch (err: any) {
      toastActionError(toast, "الرفض", "الدفعة", String(err?.message || err))
    } finally {
      setSaving(false)
    }
  }

  // === دالة تحديث حالة أمر الشراء المرتبط بالفاتورة ===
  const updateLinkedPurchaseOrderStatus = async (billId: string) => {
    try {
      // جلب الفاتورة للحصول على purchase_order_id
      const { data: billData } = await supabase
        .from("bills")
        .select("purchase_order_id")
        .eq("id", billId)
        .single()

      if (!billData?.purchase_order_id) return // لا يوجد أمر شراء مرتبط

      const poId = billData.purchase_order_id

      // جلب بنود أمر الشراء
      const { data: poItems } = await supabase
        .from("purchase_order_items")
        .select("product_id, quantity")
        .eq("purchase_order_id", poId)

      // جلب جميع الفواتير المرتبطة بأمر الشراء
      const { data: linkedBills } = await supabase
        .from("bills")
        .select("id")
        .eq("purchase_order_id", poId)

      const billIds = (linkedBills || []).map((b: { id: string }) => b.id)

      // جلب بنود كل الفواتير المرتبطة
      const { data: allBillItems } = await supabase
        .from("bill_items")
        .select("product_id, quantity")
        .in("bill_id", billIds.length > 0 ? billIds : [''])

      // حساب الكميات المفوترة لكل منتج
      const billedQtyMap: Record<string, number> = {}
      for (const item of (allBillItems || []) as any[]) {
        billedQtyMap[item.product_id] = (billedQtyMap[item.product_id] || 0) + Number(item.quantity || 0)
      }

      // تحديد الحالة الجديدة
      let newStatus = 'draft'
      if (billIds.length > 0) {
        const allFullyBilled = (poItems || []).every((item: any) => {
          const ordered = Number(item.quantity || 0)
          const billed = billedQtyMap[item.product_id] || 0
          return billed >= ordered
        })

        const anyBilled = Object.values(billedQtyMap).some(qty => qty > 0)

        if (allFullyBilled) {
          newStatus = 'billed'
        } else if (anyBilled) {
          newStatus = 'partially_billed'
        }
      }

      // تحديث حالة أمر الشراء
      await supabase
        .from("purchase_orders")
        .update({ status: newStatus })
        .eq("id", poId)

      console.log(`✅ Updated linked PO ${poId} status to: ${newStatus}`)
    } catch (err) {
      console.warn("Failed to update linked PO status:", err)
    }
  }

  const openApplyToInvoice = async (p: Payment) => {
    setSelectedPayment(p)
    setApplyAmount(p.amount)
    setApplyDocId("")
    const { data: invs } = await supabase
      .from("invoices")
      .select("id, invoice_number, total_amount, paid_amount, status")
      .eq("customer_id", p.customer_id)
      .in("status", ["sent", "partially_paid"])
      .order("invoice_date", { ascending: false })
    setCustomerInvoices(invs || [])
    setApplyInvoiceOpen(true)
  }

  const openApplyToPO = async (p: Payment) => {
    setSelectedPayment(p)
    setApplyAmount(p.amount)
    setApplyDocId("")
    const { data: pos } = await supabase
      .from("purchase_orders")
      .select("id, po_number, total_amount, received_amount, status")
      .eq("supplier_id", p.supplier_id)
      .in("status", ["received_partial", "received"])
    setSupplierPOs(pos || [])
    setApplyPoOpen(true)
  }

  const openApplyToBill = async (p: Payment) => {
    setSelectedPayment(p)
    setApplyAmount(p.amount)
    setApplyDocId("")
    const { data: bills } = await supabase
      .from("bills")
      .select("id, bill_number, total_amount, paid_amount, returned_amount, status")
      .eq("supplier_id", p.supplier_id)
      .in("status", ["sent", "received", "partially_paid"]) // قابلة للدفع - لا تشمل draft
      .order("bill_date", { ascending: false })
    setSupplierBills(bills || [])
    setApplyBillOpen(true)
  }

  // تنفيذ ربط دفع عميل بفاتورة عميل باستخدام معطيات محددة دون الاعتماد على حالة الواجهة
  const applyPaymentToInvoiceWithOverrides = async (payment: Payment, invoiceId: string, rawAmount: number) => {
    try {
      if (!payment || !invoiceId || rawAmount <= 0) return
      // ✅ منع التكرار
      if (saving) {
        console.log("جاري الحفظ بالفعل...")
        return
      }
      setSaving(true)
      const { data: inv } = await supabase.from("invoices").select("*").eq("id", invoiceId).single()
      if (!inv) return

      // 🔐 ERP Governance: التحقق من صلاحية الدفع على هذه الفاتورة
      if (!canPayOnDocument(inv.branch_id)) {
        toast({
          title: appLang === 'en' ? 'Access Denied' : 'غير مصرح',
          description: appLang === 'en'
            ? 'You cannot make payments on invoices from other branches. Please contact your administrator.'
            : 'لا يمكنك إجراء دفعات على فواتير من فروع أخرى. يرجى التواصل مع المسؤول.',
          variant: 'destructive'
        })
        setSaving(false)
        return
      }
      const remaining = Math.max(Number(inv.total_amount || 0) - Number(inv.paid_amount || 0), 0)
      const amount = Math.min(rawAmount, remaining)
      const response = await fetch(`/api/customer-payments/${encodeURIComponent(payment.id)}/apply-invoice`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": globalThis.crypto?.randomUUID?.() || `customer-payment-apply-invoice-${payment.id}-${invoiceId}-${amount}`,
        },
        body: JSON.stringify({
          invoiceId: inv.id,
          amount,
          uiSurface: "payments_page_auto_apply_invoice",
        }),
      })

      const result = await response.json().catch(() => ({})) as { success?: boolean; error?: string }
      if (!response.ok || !result.success) {
        throw new Error(result.error || (appLang === 'en' ? 'Failed to apply payment to invoice' : 'فشل تطبيق الدفعة على الفاتورة'))
      }

      await reloadPaymentsWithFilters()
      return
    } catch (err) {
      console.error("Error applying payment to invoice (overrides):", err)
    } finally {
      setSaving(false)
    }
  }

  const applyPaymentToInvoice = async () => {
    if (!selectedPayment || !applyDocId || applyAmount <= 0) return

    // ✅ منع التكرار
    if (saving) {
      console.log("جاري الحفظ بالفعل...")
      return
    }

    // ⚡ INP Fix: إظهار loading state فوراً قبل أي await
    setSaving(true)

    // ⚡ INP Fix: تأجيل العمليات الثقيلة باستخدام setTimeout
    setTimeout(async () => {
      try {
        // Load invoice to compute remaining
        const { data: inv } = await supabase.from("invoices").select("*").eq("id", applyDocId).single()
        if (!inv) return

        // 🔐 ERP Governance: التحقق من صلاحية الدفع على هذه الفاتورة
        if (!canPayOnDocument(inv.branch_id)) {
          toast({
            title: appLang === 'en' ? 'Access Denied' : 'غير مصرح',
            description: appLang === 'en'
              ? 'You cannot make payments on invoices from other branches. Please contact your administrator.'
              : 'لا يمكنك إجراء دفعات على فواتير من فروع أخرى. يرجى التواصل مع المسؤول.',
            variant: 'destructive'
          })
          startTransition(() => {
            setSaving(false)
          })
          return
        }
        const remaining = Math.max(Number(inv.total_amount || 0) - Number(inv.paid_amount || 0), 0)
        const amount = Math.min(applyAmount, remaining)
        const response = await fetch(`/api/customer-payments/${encodeURIComponent(selectedPayment.id)}/apply-invoice`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": globalThis.crypto?.randomUUID?.() || `customer-payment-apply-invoice-${selectedPayment.id}-${inv.id}-${amount}`,
          },
          body: JSON.stringify({
            invoiceId: inv.id,
            amount,
            uiSurface: "payments_page_apply_invoice_dialog",
          }),
        })

        const result = await response.json().catch(() => ({})) as { success?: boolean; error?: string }
        if (!response.ok || !result.success) {
          throw new Error(result.error || (appLang === 'en' ? 'Failed to apply payment to invoice' : 'فشل تطبيق الدفعة على الفاتورة'))
        }

        startTransition(() => {
          setApplyInvoiceOpen(false)
          setSelectedPayment(null)
          setApplyDocId("")
          setApplyAmount(0)
        })
        await reloadPaymentsWithFilters()
        startTransition(() => {
          setSaving(false)
        })
        toastActionSuccess(toast, "التحديث", "الفاتورة")
        return
      } catch (err) {
        console.error("Error applying payment to invoice:", err)
        startTransition(() => {
          setSaving(false)
        })
        toastActionError(toast, "التحديث", "الفاتورة", "فشل تطبيق الدفعة على الفاتورة")
      }
    }, 0)
  }

  const applyPaymentToPO = async () => {
    try {
      if (!selectedPayment || !applyDocId || applyAmount <= 0) return
      setSaving(true)
      const { data: po } = await supabase.from("purchase_orders").select("*").eq("id", applyDocId).single()
      if (!po) return

      if (!canPayOnDocument(po.branch_id)) {
        toast({
          title: appLang === 'en' ? 'Access Denied' : 'غير مصرح',
          description: appLang === 'en'
            ? 'You cannot make payments on purchase orders from other branches. Please contact your administrator.'
            : 'لا يمكنك إجراء دفعات على أوامر شراء من فروع أخرى. يرجى التواصل مع المسؤول.',
          variant: 'destructive'
        })
        setSaving(false)
        return
      }

      const remaining = Math.max(Number(po.total_amount || 0) - Number(po.received_amount || 0), 0)
      const amount = Math.min(applyAmount, remaining)
      const response = await fetch(`/api/supplier-payments/${encodeURIComponent(selectedPayment.id)}/apply-po`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": globalThis.crypto?.randomUUID?.() || `supplier-payment-apply-po-${selectedPayment.id}-${applyDocId}-${amount}`,
        },
        body: JSON.stringify({
          purchaseOrderId: po.id,
          amount,
          uiSurface: "payments_page_apply_po",
        }),
      })

      const result = await response.json().catch(() => ({})) as { success?: boolean; error?: string; posted?: boolean }
      if (!response.ok || !result.success) {
        throw new Error(result.error || (appLang === 'en' ? 'Failed to apply payment to purchase order' : 'فشل تطبيق الدفعة على أمر الشراء'))
      }

      setApplyPoOpen(false)
      setSelectedPayment(null)
      setApplyDocId("")
      setApplyAmount(0)
      await reloadPaymentsWithFilters()
      toast({
        title: appLang === 'en' ? '✅ Payment Applied' : '✅ تم تطبيق الدفعة',
        description: result.posted
          ? (appLang === 'en' ? 'The purchase order settlement was synced successfully.' : 'تمت مزامنة تسوية أمر الشراء بنجاح.')
          : (appLang === 'en' ? 'The purchase order allocation was recorded successfully.' : 'تم تسجيل تخصيص أمر الشراء بنجاح.'),
      })
    } catch (err) {
      console.error("Error applying payment to PO:", err)
      toastActionError(toast, "التحديث", "أمر الشراء", String((err as any)?.message || err || "فشل تطبيق الدفعة على أمر الشراء"))
    } finally {
      setSaving(false)
    }
  }

  const applyPaymentToBill = async () => {
    try {
      if (!selectedPayment || !applyDocId || applyAmount <= 0) return
      setSaving(true)
      const { data: bill } = await supabase.from("bills").select("*").eq("id", applyDocId).single()
      if (!bill) return

      // 🔐 ERP Governance: التحقق من صلاحية الدفع على هذه الفاتورة
      if (!canPayOnDocument(bill.branch_id)) {
        toast({
          title: appLang === 'en' ? 'Access Denied' : 'غير مصرح',
          description: appLang === 'en'
            ? 'You cannot make payments on bills from other branches. Please contact your administrator.'
            : 'لا يمكنك إجراء دفعات على فواتير من فروع أخرى. يرجى التواصل مع المسؤول.',
          variant: 'destructive'
        })
        setSaving(false)
        return
      }

      // 🔐 Net Outstanding = total - returned - paid (overpayment guard)
      const netOutstanding = Math.max(
        Number(bill.total_amount || 0) - Number(bill.returned_amount || 0) - Number(bill.paid_amount || 0),
        0
      )
      const remaining = netOutstanding
      const amount = Math.min(applyAmount, remaining)
      const response = await fetch(`/api/supplier-payments/${encodeURIComponent(selectedPayment.id)}/apply-bill`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": globalThis.crypto?.randomUUID?.() || `supplier-payment-apply-bill-${selectedPayment.id}-${applyDocId}-${amount}`,
        },
        body: JSON.stringify({
          billId: bill.id,
          amount,
          uiSurface: "payments_page_apply_bill",
        }),
      })

      const result = await response.json().catch(() => ({})) as { success?: boolean; error?: string; posted?: boolean; approved?: boolean }
      if (!response.ok || !result.success) {
        throw new Error(result.error || (appLang === 'en' ? 'Failed to apply payment to bill' : 'فشل تطبيق الدفعة على الفاتورة'))
      }

      setApplyBillOpen(false)
      setSelectedPayment(null)
      setApplyDocId("")
      setApplyAmount(0)
      await reloadPaymentsWithFilters()
      toast({
        title: appLang === 'en' ? '✅ Payment Applied' : '✅ تم تطبيق الدفعة',
        description: result.posted
          ? (appLang === 'en' ? 'The bill settlement was posted successfully.' : 'تم ترحيل تسوية الفاتورة محاسبياً بنجاح.')
          : (appLang === 'en' ? 'The allocation was recorded and will post after approval.' : 'تم تسجيل التخصيص وسيُرحّل بعد الاعتماد.'),
      })
    } catch (err: any) {
      console.error("Error applying payment to bill:", { message: String(err?.message || err || ""), details: err?.details ?? err })
      toastActionError(toast, "التحديث", "فاتورة المورد", String(err?.message || err || "فشل تطبيق الدفعة على الفاتورة"))
    } finally { setSaving(false) }
  }

  // ─── v3.74.160 hotfix — these useMemo hooks MUST run before the early
  // `if (loading) return ...` below, otherwise React sees a different hook
  // count between the loading and loaded renders and crashes the page.
  // Helper + memos hoisted above the early-return for that reason.
  const applyPaymentFilters = (
    rows: Payment[],
    search: string,
    status: string[],
    from: string,
    to: string,
    nameFor: (p: Payment) => string,
    // v3.74.162 — party multi-select + unlinked filter
    partyIds: string[],
    partyIdFor: (p: Payment) => string,
    unlinkedOnly: boolean,
    isLinkedFor: (p: Payment) => boolean,
  ) => {
    const q = search.trim().toLowerCase()
    return rows.filter((p) => {
      if (status.length > 0 && !status.includes(String((p as any).status || ""))) return false
      if (from && p.payment_date && p.payment_date < from) return false
      if (to && p.payment_date && p.payment_date > to) return false
      if (partyIds.length > 0 && !partyIds.includes(partyIdFor(p))) return false
      if (unlinkedOnly && isLinkedFor(p)) return false
      if (q) {
        const hay = [
          (p as any).payment_number,
          p.reference_number,
          p.notes,
          nameFor(p),
        ].filter(Boolean).join(" ").toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }
  const filteredCustomerPayments = useMemo(
    () => applyPaymentFilters(
      customerPayments, cpSearch, cpStatus, cpDateFrom, cpDateTo,
      (p) => String(customers.find((c) => c.id === (p as any).customer_id)?.name || ""),
      cpCustomerIds,
      (p) => String((p as any).customer_id || ""),
      cpUnlinkedOnly,
      // Customer payment is "linked" if it points to an invoice directly
      (p) => Boolean((p as any).invoice_id),
    ),
    [customerPayments, cpSearch, cpStatus, cpDateFrom, cpDateTo, customers, cpCustomerIds, cpUnlinkedOnly],
  )
  const filteredSupplierPayments = useMemo(
    () => applyPaymentFilters(
      supplierPayments, spSearch, spStatus, spDateFrom, spDateTo,
      (p) => String(suppliers.find((s) => s.id === (p as any).supplier_id)?.name || ""),
      spSupplierIds,
      (p) => String((p as any).supplier_id || ""),
      spUnlinkedOnly,
      // Supplier payment is "linked" if it points to a bill directly OR via payment_allocations
      (p) => Boolean((p as any).bill_id) || Boolean(allocBillByPayment[p.id]),
    ),
    [supplierPayments, spSearch, spStatus, spDateFrom, spDateTo, suppliers, spSupplierIds, spUnlinkedOnly, allocBillByPayment],
  )

  if (loading) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8">
          <p className="py-8 text-center">{appLang === 'en' ? 'Loading...' : 'جاري التحميل...'}</p>
        </main>
      </div>
    )
  }

  // ✅ دالة مساعدة لتحديد ما إذا كان الحساب نقدياً
  const isCashAccount = (accountId?: string | null) => {
    if (!accountId) return false;
    const acc = accounts.find((a: any) => a.id === accountId);
    if (!acc) return false;
    const st = String((acc as any).sub_type || '').toLowerCase();
    if (st === 'cash') return true;
    if (st === 'bank') return false;
    const nmLower = String((acc as any).account_name || '').toLowerCase();
    if (nmLower.includes('cash') || /خزينة|نقد|صندوق|كاش/.test(nmLower)) return true;
    return false;
  };

  // ─── v3.74.160 — filter helpers (memos hoisted above early-return) ──
  const cpActive = (cpSearch ? 1 : 0) + (cpStatus.length > 0 ? 1 : 0) + (cpDateFrom ? 1 : 0) + (cpDateTo ? 1 : 0)
    + (cpCustomerIds.length > 0 ? 1 : 0) + (cpUnlinkedOnly ? 1 : 0)
  const spActive = (spSearch ? 1 : 0) + (spStatus.length > 0 ? 1 : 0) + (spDateFrom ? 1 : 0) + (spDateTo ? 1 : 0)
    + (spSupplierIds.length > 0 ? 1 : 0) + (spUnlinkedOnly ? 1 : 0)
  const clearCpFilters = () => { setCpSearch(""); setCpStatus([]); setCpDateFrom(""); setCpDateTo(""); setCpCustomerIds([]); setCpUnlinkedOnly(false) }
  const clearSpFilters = () => { setSpSearch(""); setSpStatus([]); setSpDateFrom(""); setSpDateTo(""); setSpSupplierIds([]); setSpUnlinkedOnly(false) }

  const statusOptionsAr: Record<string, string> = {
    approved: "مُعتَمَدَة",
    pending_approval: "بانتظار الاعتماد",
    rejected: "مَرفوضَة",
    voided: "مُلغاة بتَصحيح",
    cancelled: "مَلغية",
  }
  const statusOptionsEn: Record<string, string> = {
    approved: "Approved",
    pending_approval: "Pending approval",
    rejected: "Rejected",
    voided: "Voided",
    cancelled: "Cancelled",
  }

  // Small render helper for the filter panel so the two sections stay
  // identical except for which state they bind to.
  const renderPaymentFilters = (params: {
    search: string; setSearch: (v: string) => void
    status: string[]; setStatus: (v: string[]) => void
    dateFrom: string; setDateFrom: (v: string) => void
    dateTo: string; setDateTo: (v: string) => void
    active: number; onClear: () => void
    searchPlaceholder: string
    // v3.74.162 — party multi-select + unlinked toggle
    partyOptions: { value: string; label: string }[]
    partyIds: string[]
    setPartyIds: (ids: string[]) => void
    partyLabel: string
    partyPlaceholder: string
    partySearchPlaceholder: string
    partyEmptyMessage: string
    unlinkedOnly: boolean
    setUnlinkedOnly: (v: boolean) => void
    unlinkedLabel: string
  }) => {
    const statusMap = appLang === 'en' ? statusOptionsEn : statusOptionsAr
    const toggleStatus = (val: string) => {
      params.setStatus(params.status.includes(val)
        ? params.status.filter((s) => s !== val)
        : [...params.status, val])
    }
    return (
      <FilterContainer
        title={appLang === 'en' ? 'Filters' : 'الفلاتر'}
        activeCount={params.active}
        onClear={params.onClear}
        defaultOpen={false}
      >
        <div className="space-y-4">
          <Input
            type="text"
            placeholder={params.searchPlaceholder}
            value={params.search}
            onChange={(e) => params.setSearch(e.target.value)}
            className="dark:bg-slate-800 dark:border-slate-700"
          />
          {/* v3.74.162 — party multi-select (searchable dropdown, same
              pattern as /invoices). Put on its own row above the
              status/date grid so the long party label has room. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">
                {params.partyLabel}
              </label>
              <MultiSelect
                options={params.partyOptions}
                selected={params.partyIds}
                onChange={params.setPartyIds}
                placeholder={params.partyPlaceholder}
                searchPlaceholder={params.partySearchPlaceholder}
                emptyMessage={params.partyEmptyMessage}
                className="h-10 text-sm"
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant={params.unlinkedOnly ? "default" : "outline"}
                size="sm"
                className="h-10 text-xs"
                onClick={() => params.setUnlinkedOnly(!params.unlinkedOnly)}
              >
                {params.unlinkedOnly ? '✓ ' : ''}{params.unlinkedLabel}
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">
                {appLang === 'en' ? 'Status' : 'الحالة'}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {Object.keys(statusMap).map((val) => {
                  const selected = params.status.includes(val)
                  return (
                    <Button
                      key={val}
                      type="button"
                      variant={selected ? "default" : "outline"}
                      size="sm"
                      className="h-7 text-xs px-2"
                      onClick={() => toggleStatus(val)}
                    >
                      {statusMap[val]}
                    </Button>
                  )
                })}
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">
                {appLang === 'en' ? 'From date' : 'من تاريخ'}
              </label>
              <Input
                type="date"
                value={params.dateFrom}
                onChange={(e) => params.setDateFrom(e.target.value)}
                className="dark:bg-slate-800 dark:border-slate-700"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">
                {appLang === 'en' ? 'To date' : 'إلى تاريخ'}
              </label>
              <Input
                type="date"
                value={params.dateTo}
                onChange={(e) => params.setDateTo(e.target.value)}
                className="dark:bg-slate-800 dark:border-slate-700"
              />
            </div>
          </div>
        </div>
      </FilterContainer>
    )
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">
        {/* رأس الصفحة — Migrated to ERPPageHeader (v3.54.0) */}
        <ERPPageHeader
          title={appLang === 'en' ? 'Payments' : 'المدفوعات'}
          description={appLang === 'en' ? 'Manage customer and supplier payments' : 'إدارة مدفوعات العملاء والموردين'}
          variant="list"
          lang={appLang}
          extra={
            <>
              {(userContext?.role === 'manager' || userContext?.role === 'accountant') && (
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  {appLang === 'en' ? '🏢 Showing payments from your branch only' : '🏢 تعرض المدفوعات الخاصة بفرعك فقط'}
                </p>
              )}
              {(userContext?.role === 'staff' || userContext?.role === 'sales' || userContext?.role === 'employee') && (
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  {appLang === 'en' ? '👨‍💼 Showing payments you created only' : '👨‍💼 تعرض المدفوعات التي أنشأتها فقط'}
                </p>
              )}
              {!online && (
                <div className="p-2 sm:p-3 rounded border border-amber-300 bg-amber-50 text-amber-700 text-xs sm:text-sm">
                  {appLang === 'en' ? 'Offline - Save actions disabled' : 'غير متصل - التخزين معطّل'}
                </div>
              )}
            </>
          }
        />

        {/* 🔐 فلتر الفروع الموحد - يظهر فقط للأدوار المميزة (Owner/Admin/General Manager) */}
        <Card>
          <CardContent className="pt-6">
            <BranchFilter
              lang={appLang}
              externalHook={branchFilter}
              className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800"
            />
          </CardContent>
        </Card>

        {/* v3.74.160 — unified filter bar above the Customer Payments
            table, mirroring the pattern on /invoices, /bills, /customers. */}
        {renderPaymentFilters({
          search: cpSearch, setSearch: setCpSearch,
          status: cpStatus, setStatus: setCpStatus,
          dateFrom: cpDateFrom, setDateFrom: setCpDateFrom,
          dateTo: cpDateTo, setDateTo: setCpDateTo,
          active: cpActive, onClear: clearCpFilters,
          searchPlaceholder: appLang === 'en'
            ? 'Search by payment #, reference, customer name, notes...'
            : 'بحث برَقم الدَّفعَة، المَرجع، اسم العَميل، المُلاحَظات...',
          partyOptions: customers.map((c) => ({ value: c.id, label: c.name })),
          partyIds: cpCustomerIds,
          setPartyIds: setCpCustomerIds,
          partyLabel: appLang === 'en' ? 'Customer' : 'العَميل',
          partyPlaceholder: appLang === 'en' ? 'All customers' : 'جَميع العُملاء',
          partySearchPlaceholder: appLang === 'en' ? 'Search customers...' : 'بَحث فى العُملاء...',
          partyEmptyMessage: appLang === 'en' ? 'No customers found' : 'لا يُوجَد عُملاء',
          unlinkedOnly: cpUnlinkedOnly,
          setUnlinkedOnly: setCpUnlinkedOnly,
          unlinkedLabel: appLang === 'en' ? 'Unlinked only (no invoice)' : 'غَير المُرتَبِطَة بفاتورَة فَقَط',
        })}

        <Card>
          <CardContent className="pt-6 space-y-6">
            <div className="flex justify-between items-center gap-4">
              <h2 className="text-xl font-semibold">{appLang === 'en' ? 'Customer Payments' : 'مدفوعات العملاء'}</h2>
              {permWrite && (
                <CustomerPaymentAllocationUI
                  appLang={appLang}
                  customers={customers}
                  accounts={accounts}
                  currencies={currencies}
                  baseCurrency={baseCurrency}
                  currencySymbols={currencySymbols}
                  onSuccess={async () => {
                    const { data: custPays } = await supabase
                      .from("payments").select("*")
                      .eq("company_id", companyId || "")
                      .not("customer_id", "is", null)
                      .order("payment_date", { ascending: false })
                    setCustomerPayments(custPays || [])
                  }}
                />
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
              <div>
                <Label>{appLang === 'en' ? 'Customer' : 'العميل'}</Label>
                <CustomerSearchSelect
                  customers={customers}
                  value={newCustPayment.customer_id}
                  onValueChange={(v) => setNewCustPayment({ ...newCustPayment, customer_id: v })}
                  placeholder={appLang === 'en' ? 'Select a customer' : 'اختر عميلًا'}
                  searchPlaceholder={appLang === 'en' ? 'Search by name or phone...' : 'ابحث بالاسم أو الهاتف...'}
                />
                {/* v3.74.78 — تَنبيه إِذا العَميل لَديه رَصيد دائن مُتاح */}
                <CustomerCreditBalanceHint customerId={newCustPayment.customer_id} appLang={appLang} currencySymbol={currencySymbol} />
              </div>
              <div>
                <Label>{appLang === 'en' ? 'Account (Cash/Bank)' : 'الحساب (نقد/بنك)'}</Label>
                <select 
                  className="w-full border rounded px-2 py-1" 
                  value={newCustPayment.account_id} 
                  onChange={(e) => {
                    const accId = e.target.value;
                    const cashOnly = isCashAccount(accId);
                    setNewCustPayment({
                      ...newCustPayment,
                      account_id: accId,
                      method: cashOnly && newCustPayment.method !== 'cash' ? 'cash' : newCustPayment.method
                    });
                    // v3.74.516 — اختيار الحساب يضبط عملة الدفع لعملته تلقائياً
                    // (إلا فى وضع الاستثناء حيث الاختلاف مقصود)
                    if (!showAllPayAccounts && accId) {
                      const acc = accounts.find((a) => a.id === accId)
                      const accCcy = accountCurrencyOf(acc)
                      if (accCcy !== paymentCurrency.toUpperCase()) {
                        setPaymentCurrency(accCcy)
                        if (accCcy === baseCurrency.toUpperCase()) {
                          setExchangeRate(1); setExchangeRateId(undefined); setRateSource('same_currency')
                        }
                      }
                    }
                  }}
                >
                  <option value="">{appLang === 'en' ? 'Select payment account' : 'اختر حساب الدفع'}</option>
                  {/* v3.74.516 — الحسابات المطابقة لعملة الدفع فقط (إلا فى وضع الاستثناء) */}
                  {(showAllPayAccounts ? accounts : accounts.filter((a: any) => accountCurrencyOf(a) === paymentCurrency.toUpperCase())).map((a) => {
                    const ccy = String((a as any).original_currency || '').toUpperCase()
                    const ccySuffix = ccy && ccy !== baseCurrency.toUpperCase() ? ` — ${ccy}` : ''
                    return (
                      <option key={a.id} value={a.id}>{a.account_name} ({a.account_code}){ccySuffix}</option>
                    )
                  })}
                </select>
                {/* v3.74.516 — رابط الاستثناء الواعى */}
                {!showAllPayAccounts && accounts.some((a: any) => accountCurrencyOf(a) !== paymentCurrency.toUpperCase()) && (
                  <button type="button" className="text-[11px] text-blue-600 hover:underline mt-0.5" onClick={() => setShowAllPayAccounts(true)}>
                    {appLang === 'en' ? 'Show accounts in other currencies (exception)' : 'إظهار الحسابات بعملات أخرى (استثناء)'}
                  </button>
                )}
                {/* v3.25.3: warn when account currency ≠ payment currency */}
                {(() => {
                  const selectedAcc = accounts.find((a) => a.id === newCustPayment.account_id) as any
                  const accCcy = String(selectedAcc?.original_currency || '').toUpperCase() || baseCurrency.toUpperCase()
                  const payCcy = paymentCurrency.toUpperCase()
                  if (!selectedAcc || accCcy === payCcy) return null
                  return (
                    <div className="text-[11px] mt-1 px-2 py-1 rounded bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                      ℹ️ {appLang === 'en'
                        ? `Account currency: ${accCcy} — different from payment currency (${payCcy}). Conversion applied via Exchange Rates.`
                        : `عملة الحساب: ${accCcy} — مختلفة عن عملة الدفع (${payCcy}). سيتم التحويل تلقائياً من صفحة أسعار الصرف.`}
                    </div>
                  )
                })()}
              </div>
              <div>
                <Label>{appLang === 'en' ? 'Amount' : 'المبلغ'}</Label>
                <NumericInput min={0} step={0.01} value={newCustPayment.amount} onChange={(val) => setNewCustPayment({ ...newCustPayment, amount: val })} decimalPlaces={2} />
              </div>
              <div>
                <Label>{appLang === 'en' ? 'Date' : 'تاريخ'}</Label>
                <Input type="date" value={newCustPayment.date} onChange={(e) => setNewCustPayment({ ...newCustPayment, date: e.target.value })} />
              </div>
              <div>
                <Label>{appLang === 'en' ? 'Method' : 'طريقة'}</Label>
                <select className="w-full border rounded px-2 py-1" value={newCustPayment.method} onChange={(e) => setNewCustPayment({ ...newCustPayment, method: e.target.value })}>
                  <option value="cash">{appLang === 'en' ? 'Cash' : 'كاش'}</option>
                  {!isCashAccount(newCustPayment.account_id) && (
                    <>
                      <option value="transfer">{appLang === 'en' ? 'Transfer' : 'تحويل'}</option>
                      <option value="check">{appLang === 'en' ? 'Check' : 'شيك'}</option>
                    </>
                  )}
                </select>
              </div>
              {(newCustPayment.method === 'transfer' || newCustPayment.method === 'check') && (
                <div>
                  <Label>{appLang === 'en' ? 'Transfer/Check No. (Optional)' : 'رقم التحويل/الشيك (اختياري)'}</Label>
                  <Input value={newCustPayment.ref} onChange={(e) => setNewCustPayment({ ...newCustPayment, ref: e.target.value })} placeholder="..." />
                </div>
              )}
              {/* v3.21.0: Currency picker + ExchangeRateSelector (api/manual dropdown) */}
              <div>
                <Label>{appLang === 'en' ? 'Currency' : 'العملة'}</Label>
                <select className="w-full border rounded px-2 py-1" value={paymentCurrency} onChange={(e) => {
                  const v = e.target.value
                  setPaymentCurrency(v)
                  if (v === baseCurrency) {
                    setExchangeRate(1)
                    setExchangeRateId(undefined)
                    setRateSource('same_currency')
                  }
                  // v3.74.516 — تغيير عملة الدفع يعيد ضبط الحساب تلقائياً
                  // لأول حساب بنفس العملة (ويغلق وضع الاستثناء)
                  setShowAllPayAccounts(false)
                  const vU = v.toUpperCase()
                  const firstMatchedId = (accounts.find((a: any) => accountCurrencyOf(a) === vU) as any)?.id || ''
                  const custAcc = accounts.find((a) => a.id === newCustPayment.account_id)
                  if (!custAcc || accountCurrencyOf(custAcc) !== vU) {
                    setNewCustPayment((p: any) => ({ ...p, account_id: firstMatchedId }))
                  }
                  const suppAcc = accounts.find((a) => a.id === newSuppPayment.account_id)
                  if (!suppAcc || accountCurrencyOf(suppAcc) !== vU) {
                    setNewSuppPayment((p: any) => ({ ...p, account_id: firstMatchedId }))
                  }
                }}>
                  {currencies.length > 0 ? (
                    currencies.map((c) => (
                      <option key={c.code} value={c.code}>{c.symbol} {c.code}</option>
                    ))
                  ) : (
                    Object.entries(currencySymbols).map(([code, symbol]) => (
                      <option key={code} value={code}>{symbol} {code}</option>
                    ))
                  )}
                </select>
              </div>
              {paymentCurrency !== baseCurrency && (
                <div>
                  <Label>{appLang === 'en' ? 'Exchange rate' : 'سعر الصرف'}</Label>
                  <ExchangeRateSelector
                    fromCurrency={paymentCurrency}
                    baseCurrency={baseCurrency}
                    value={exchangeRate}
                    onChange={setExchangeRate}
                    onRateMetaChange={(meta) => {
                      setExchangeRateId(meta?.rateId)
                      setRateSource(meta?.source || 'manual')
                    }}
                    hideLabel
                    showPreview
                    amount={Number(newCustPayment.amount || 0)}
                  />
                </div>
              )}
              <div className="flex gap-2">
                <Button onClick={createCustomerPayment} disabled={saving || !online || !newCustPayment.customer_id || newCustPayment.amount <= 0 || !newCustPayment.account_id}>{appLang === 'en' ? 'Create' : 'إنشاء'}</Button>
              </div>
            </div>

            {newCustPayment.customer_id && (
              <div className="mt-4 border rounded p-3">
                <h3 className="text-base font-semibold mb-2">{appLang === 'en' ? 'Customer invoices not fully paid' : 'فواتير العميل غير المسددة بالكامل'}</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 dark:bg-slate-900">
                      <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Invoice No.' : 'رقم الفاتورة'}</th>
                      <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Date' : 'التاريخ'}</th>
                      <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Branch' : 'الفرع'}</th>
                      <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Total' : 'المبلغ'}</th>
                      <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Paid' : 'المدفوع'}</th>
                      <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Remaining' : 'المتبقي'}</th>
                      <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Select' : 'اختيار'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formCustomerInvoices.map((inv) => {
                      const outstanding = Math.max(Number(inv.total_amount || 0) - Number(inv.paid_amount || 0), 0)
                      if (outstanding <= 0) return null
                      return (
                        <tr key={inv.id} className="border-b">
                          <td className="px-2 py-2">{inv.invoice_number}</td>
                          <td className="px-2 py-2">{inv.invoice_date || "-"}</td>
                          <td className="px-2 py-2">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                              {inv.branches?.name || (inv.branch_id ? branchNames[inv.branch_id] : null) || (appLang === 'en' ? 'Main' : 'رئيسي')}
                            </span>
                          </td>
                          <td className="px-2 py-2">{Number(inv.total_amount || 0).toFixed(2)} {currencySymbols[baseCurrency] || baseCurrency}</td>
                          <td className="px-2 py-2">{Number(inv.paid_amount || 0).toFixed(2)} {currencySymbols[baseCurrency] || baseCurrency}</td>
                          <td className="px-2 py-2 font-semibold">{outstanding.toFixed(2)} {currencySymbols[baseCurrency] || baseCurrency}</td>
                          <td className="px-2 py-2">
                            <Button variant={selectedFormInvoiceId === inv.id ? "default" : "outline"} size="sm" onClick={() => {
                              setSelectedFormInvoiceId(inv.id)
                              setNewCustPayment({ ...newCustPayment, amount: outstanding })
                            }}>{appLang === 'en' ? 'Select' : 'اختيار'}</Button>
                          </td>
                        </tr>
                      )
                    })}
                    {formCustomerInvoices.length === 0 && (
                      <tr><td colSpan={7} className="px-2 py-2 text-center text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'No unpaid invoices for this customer' : 'لا توجد فواتير غير مسددة بالكامل لهذا العميل'}</td></tr>
                    )}
                  </tbody>
                </table>
                {selectedFormInvoiceId && (
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Invoice selected; amount auto-filled with remaining.' : 'تم اختيار الفاتورة، وتم تعبئة خانة المبلغ تلقائيًا بالمبلغ المتبقي.'}</p>
                )}
              </div>
            )}

            <div className="border-t pt-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 dark:bg-slate-900">
                    <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Date' : 'التاريخ'}</th>
                    {/* v3.74.211 — Customer name + cash/bank account columns. */}
                    <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Customer' : 'اسم العميل'}</th>
                    <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Branch' : 'الفرع'}</th>
                    <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Amount' : 'المبلغ'}</th>
                    <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Account' : 'الحساب (نقد/بنك)'}</th>
                    <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Reference' : 'مرجع'}</th>
                    <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Linked Invoice' : 'الفاتورة المرتبطة'}</th>
                    <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Sales Order' : 'أمر البيع'}</th>
                    <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Action' : 'إجراء'}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomerPayments.map((p) => {
                    // v3.74.211 — look up customer name + account from the
                    // already-loaded lists. Falls back to a "-" placeholder
                    // when the row references a customer or account we
                    // could not resolve (e.g. shared visibility).
                    const customerName = customers.find((c: any) => c.id === (p as any).customer_id)?.name
                      || (appLang === 'en' ? '-' : '—')
                    const accountRow = accounts.find((a: any) => a.id === (p as any).account_id) as any
                    const accountLabel = accountRow
                      ? (accountRow.account_code ? `${accountRow.account_code} - ` : '') + (accountRow.account_name || '')
                      : (appLang === 'en' ? '-' : '—')
                    return (
                    <tr key={p.id} className="border-b">
                      <td className="px-2 py-2">{p.payment_date}</td>
                      <td className="px-2 py-2 font-medium text-gray-800 dark:text-gray-200">{customerName}</td>
                      <td className="px-2 py-2">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                          {/* ✅ عرض الفرع: من الفاتورة المرتبطة (invoiceBranchMap) → من الدفعة → fallback */}
                          {(p.invoice_id && invoiceBranchMap[p.invoice_id] ? branchNames[invoiceBranchMap[p.invoice_id]] : null) || p.branches?.name || (p.branch_id ? branchNames[p.branch_id] : null) || (appLang === 'en' ? 'Main' : 'رئيسي')}
                        </span>
                      </td>
                      <td className="px-2 py-2">{renderPaymentAmount(p, baseCurrency)}</td>
                      <td className="px-2 py-2 text-xs text-gray-700 dark:text-gray-300">{accountLabel}</td>
                      <td className="px-2 py-2">{p.reference_number || "-"}</td>
                      <td className="px-2 py-2">
                        {(() => {
                          // v3.74.122 - customer payments always trace to a source
                          // (an invoice, a sales return, an overpayment, or a void
                          // of one of the above). Render the trace so nothing in
                          // this column ever falls back to a meaningless
                          // "Not linked" — that was misleading the operator
                          // looking at correction (void) rows.

                          // Helper: extract the "from return/overpayment INV-N" suffix
                          // out of a refund payment's notes. Reused for both pure
                          // refund rows and the void rows that point at them.
                          const refundSuffix = (rawNotes: string) => {
                            const m = rawNotes.match(/INV-\d+/)
                            const srcInv = m ? m[0] : null
                            if (!srcInv) return ''
                            const isOverpay = rawNotes.includes('زيادَة دَفع') || rawNotes.includes('overpayment')
                            const isReturn  = rawNotes.includes('مَرتَجَع') || rawNotes.includes('return')
                            if (isOverpay && !isReturn) return appLang === 'en' ? `(from overpayment on ${srcInv})` : `(من زيادَة دَفع عَلى ${srcInv})`
                            if (isReturn  && !isOverpay) return appLang === 'en' ? `(from return ${srcInv})`        : `(من مَرتَجَع ${srcInv})`
                            return appLang === 'en' ? `(source: ${srcInv})` : `(المَصدَر: ${srcInv})`
                          }

                          // 1) Direct invoice link — the common case.
                          if (p.invoice_id) {
                            return (
                              <Link href={`/invoices/${p.invoice_id}`} className="text-blue-600 hover:underline">
                                {invoiceNumbers[p.invoice_id] || p.invoice_id}
                              </Link>
                            )
                          }

                          // 2) Void / correction row (voids_payment_id is set).
                          // Inherit the label from the payment it voids so the
                          // operator sees exactly what was undone.
                          const voidsId = (p as any).voids_payment_id as string | undefined
                          if (voidsId) {
                            const orig = customerPayments.find(x => x.id === voidsId) as any
                            // Case A: original was tied to an invoice.
                            if (orig?.invoice_id) {
                              return (
                                <span className="text-amber-600 dark:text-amber-400 text-xs" title={String(p.notes || '')}>
                                  {appLang === 'en' ? 'Correction of payment on' : 'تَصحيح دَفعَة على'}
                                  <Link href={`/invoices/${orig.invoice_id}`} className="text-blue-600 hover:underline mx-1">
                                    {invoiceNumbers[orig.invoice_id] || orig.invoice_id}
                                  </Link>
                                </span>
                              )
                            }
                            // Case B: original was a credit refund (negative, no invoice).
                            if (orig && Number(orig.amount || 0) < 0) {
                              const suffix = refundSuffix(String(orig.notes || ''))
                              return (
                                <span className="text-amber-600 dark:text-amber-400 text-xs" title={String(p.notes || '')}>
                                  {appLang === 'en' ? 'Correction of credit refund' : 'تَصحيح صَرف رَصيد دائن'}
                                  {suffix && <span className="text-gray-500 dark:text-gray-400 mx-1">{suffix}</span>}
                                </span>
                              )
                            }
                            // Case C: original not in the loaded list — generic
                            // correction label so we still don't say "not linked".
                            return (
                              <span className="text-amber-600 dark:text-amber-400 text-xs" title={String(p.notes || '')}>
                                {appLang === 'en' ? 'Payment correction' : 'تَصحيح دَفعَة'}
                              </span>
                            )
                          }

                          // 3) Credit refund row (negative amount, no invoice, not a void).
                          if (Number(p.amount || 0) < 0) {
                            const notes = String(p.notes || '')
                            const suffix = refundSuffix(notes)
                            return (
                              <span className="text-purple-600 dark:text-purple-400 text-xs" title={notes || (appLang === 'en' ? 'Refund of customer credit' : 'صَرف رَصيد دائن')}>
                                {appLang === 'en' ? 'Credit refund' : 'صَرف رَصيد دائن'}
                                {suffix && <span className="text-gray-500 dark:text-gray-400 mx-1">{suffix}</span>}
                              </span>
                            )
                          }

                          // 4) Catch-all (rare): nothing to trace, surface the
                          // notes as a hint so the row isn't a dead end.
                          return (
                            <span className="text-gray-400 text-xs" title={String(p.notes || '')}>
                              {appLang === 'en' ? 'Not linked' : 'غير مرتبط'}
                            </span>
                          )
                        })()}
                      </td>
                      <td className="px-2 py-2">
                        {p.invoice_id && invoiceToSalesOrderMap[p.invoice_id] ? (
                          <Link href={`/sales-orders/${invoiceToSalesOrderMap[p.invoice_id].id}`} className="text-green-600 hover:underline">
                            {invoiceToSalesOrderMap[p.invoice_id].so_number}
                          </Link>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex gap-2">
                          <Button variant="ghost" size="icon" title={appLang === 'en' ? 'View Details' : 'عرض التفاصيل'} onClick={() => setSelectedPaymentDetailsId(p.id)}>
                            <Eye className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          </Button>
                          {/* v3.74.122 - VOID/correction rows (voids_payment_id is set) are
                              themselves audit records. They MUST NOT be applied to an invoice
                              or sent through another correction workflow; either action would
                              corrupt the audit trail. Show a read-only badge + (optionally)
                              Edit notes so an auditor can annotate, and stop there. The
                              "Apply to Invoice" button used to leak in here because amount > 0. */}
                          {(p as any).voids_payment_id ? (
                            <>
                              <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                {appLang === 'en' ? 'Correction / Void' : 'تَصحيح / إِلغاء'}
                              </span>
                              {permUpdate && (
                                <Button variant="ghost" disabled={!online} onClick={() => {
                                  setEditingPayment(p)
                                  setEditFields({
                                    payment_date: p.payment_date,
                                    payment_method: p.payment_method || "cash",
                                    reference_number: p.reference_number || "",
                                    notes: p.notes || "",
                                    account_id: p.account_id || "",
                                  })
                                  setEditOpen(true)
                                }} title={appLang === 'en' ? 'Edit notes / reference only' : 'تَعديل الملاحظات والمَرجع فَقَط'}>
                                  {appLang === 'en' ? 'Edit notes' : 'تَعديل وَصفى'}
                                </Button>
                              )}
                            </>
                          ) : (p as any).voided_by_payment_id ? (
                            // The original of a VOID — already reversed. Read-only too, with a
                            // distinct gray badge so it doesn't get confused with an active row.
                            <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                              {appLang === 'en' ? 'Voided' : 'مُلغاة بتَصحيح'}
                            </span>
                          ) : Number(p.amount || 0) < 0 ? (
                            <>
                              <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                                {appLang === 'en' ? 'Credit refund' : 'صَرف رَصيد'}
                              </span>
                              {/* v3.74.110 - a refund disbursement may also have been recorded
                                  by mistake. Surface the same governance-managed correction
                                  flow (Edit notes + Request correction) here so it can be
                                  reversed via the workflow instead of a direct delete. */}
                              {permUpdate && (
                                <Button variant="ghost" disabled={!online} onClick={() => {
                                  setEditingPayment(p)
                                  setEditFields({
                                    payment_date: p.payment_date,
                                    payment_method: p.payment_method || "cash",
                                    reference_number: p.reference_number || "",
                                    notes: p.notes || "",
                                    account_id: p.account_id || "",
                                  })
                                  setEditOpen(true)
                                }} title={appLang === 'en' ? 'Edit notes / reference only' : 'تَعديل الملاحظات والمَرجع فَقَط'}>
                                  {appLang === 'en' ? 'Edit notes' : 'تَعديل وَصفى'}
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                className="border-amber-400 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                                disabled={!online}
                                title={appLang === 'en' ? 'Request a reversal of this refund (needs owner/general manager approval)' : 'طَلَب تَصحيح / إِلغاء هذا الصَّرف — يَحتاج اعتماد المالِك/المُدير العام'}
                                onClick={() => {
                                  // v3.74.114 - open full dialog instead of prompt
                                  setCorrectionPayment(p)
                                  setCorrectionReason("")
                                  setCorrectionFields({
                                    amount: String(Math.abs(Number(p.amount || 0))),
                                    payment_date: p.payment_date || "",
                                    account_id: p.account_id || "",
                                    payment_method: p.payment_method || "cash",
                                    reference_number: p.reference_number || "",
                                    notes: p.notes || "",
                                    original_currency: "",
                                    exchange_rate: "",
                                  })
                                  setShowAllCorrectionAccounts(false)
                                  setCorrectionOpen(true)
                                }}
                              >
                                {appLang === 'en' ? 'Request correction' : 'طَلَب تَصحيح'}
                              </Button>
                            </>
                          ) : (
                            <>
                              {!p.invoice_id && permWrite && (
                                <Button variant="outline" onClick={() => openApplyToInvoice(p)} disabled={!online}>{appLang === 'en' ? 'Apply to Invoice' : 'تطبيق على فاتورة'}</Button>
                              )}
                              {/* v3.74.105 - Edit is allowed only for notes/reference_number.
                                  Sensitive fields (amount/account/invoice/date) must go through
                                  Request Correction so the change leaves an audit trail. */}
                              {permUpdate && (
                                <Button variant="ghost" disabled={!online} onClick={() => {
                                  setEditingPayment(p)
                                  setEditFields({
                                    payment_date: p.payment_date,
                                    payment_method: p.payment_method || "cash",
                                    reference_number: p.reference_number || "",
                                    notes: p.notes || "",
                                    account_id: p.account_id || "",
                                  })
                                  setEditOpen(true)
                                }} title={appLang === 'en' ? 'Edit notes / reference only' : 'تَعديل الملاحظات والمَرجع فَقَط'}>
                                  {appLang === 'en' ? 'Edit notes' : 'تَعديل وَصفى'}
                                </Button>
                              )}
                              {/* v3.74.105 - Delete is no longer offered on posted payments.
                                  Use Request Correction instead so an owner/general_manager can
                                  review the Reversal before it touches the GL. */}
                              <Button
                                variant="outline"
                                className="border-amber-400 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                                disabled={!online}
                                title={appLang === 'en' ? 'Request a reversal of this payment (needs owner/general manager approval)' : 'طَلَب تَصحيح / إِلغاء هذه الدَّفعَة — يَحتاج اعتماد المالِك/المُدير العام'}
                                onClick={() => {
                                  // v3.74.114 - open full dialog instead of prompt
                                  setCorrectionPayment(p)
                                  setCorrectionReason("")
                                  setCorrectionFields({
                                    amount: String(Math.abs(Number(p.amount || 0))),
                                    payment_date: p.payment_date || "",
                                    account_id: p.account_id || "",
                                    payment_method: p.payment_method || "cash",
                                    reference_number: p.reference_number || "",
                                    notes: p.notes || "",
                                    original_currency: "",
                                    exchange_rate: "",
                                  })
                                  setShowAllCorrectionAccounts(false)
                                  setCorrectionOpen(true)
                                }}
                              >
                                {appLang === 'en' ? 'Request correction' : 'طَلَب تَصحيح'}
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* v3.74.160 — same unified filter bar above Supplier Payments. */}
        {renderPaymentFilters({
          search: spSearch, setSearch: setSpSearch,
          status: spStatus, setStatus: setSpStatus,
          dateFrom: spDateFrom, setDateFrom: setSpDateFrom,
          dateTo: spDateTo, setDateTo: setSpDateTo,
          active: spActive, onClear: clearSpFilters,
          searchPlaceholder: appLang === 'en'
            ? 'Search by payment #, reference, supplier name, notes...'
            : 'بحث برَقم الدَّفعَة، المَرجع، اسم المُورِّد، المُلاحَظات...',
          partyOptions: suppliers.map((s) => ({ value: s.id, label: s.name })),
          partyIds: spSupplierIds,
          setPartyIds: setSpSupplierIds,
          partyLabel: appLang === 'en' ? 'Supplier' : 'المُورِّد',
          partyPlaceholder: appLang === 'en' ? 'All suppliers' : 'جَميع المُورِّدين',
          partySearchPlaceholder: appLang === 'en' ? 'Search suppliers...' : 'بَحث فى المُورِّدين...',
          partyEmptyMessage: appLang === 'en' ? 'No suppliers found' : 'لا يُوجَد مُورِّدون',
          unlinkedOnly: spUnlinkedOnly,
          setUnlinkedOnly: setSpUnlinkedOnly,
          unlinkedLabel: appLang === 'en' ? 'Unlinked only (no bill)' : 'غَير المُرتَبِطَة بفاتورَة فَقَط',
        })}

        <Card>
          <CardContent className="pt-6 space-y-6">
            <h2 className="text-xl font-semibold">{appLang === 'en' ? 'Supplier Payments' : 'مدفوعات الموردين'}</h2>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
              <div>
                <Label>{appLang === 'en' ? 'Supplier' : 'المورد'}</Label>
                <Select value={newSuppPayment.supplier_id} onValueChange={async (v) => {
                  setNewSuppPayment({ ...newSuppPayment, supplier_id: v })
                  // v3.74.159 — fetch available vendor advance for this supplier
                  setSelectedSupplierAdvance(0)
                  if (v) {
                    try {
                      const { data: advRows } = await supabase
                        .from("payments")
                        .select("amount, unallocated_amount")
                        .eq("supplier_id", v)
                        .is("bill_id", null)
                        .is("invoice_id", null)
                        .eq("status", "approved")
                        .neq("is_deleted", true)
                      let total = 0
                      ;(advRows || []).forEach((r: any) => {
                        const avail = r.unallocated_amount != null
                          ? Number(r.unallocated_amount || 0)
                          : Math.abs(Number(r.amount || 0))
                        if (avail > 0.005) total += avail
                      })
                      setSelectedSupplierAdvance(total)
                    } catch { /* non-fatal */ }
                  }
                }}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={appLang === 'en' ? 'Select a supplier' : 'اختر مورّدًا'} />
                  </SelectTrigger>
                  <SelectContent className="min-w-[260px]">
                    <div className="p-2">
                      <Input value={supplierQuery} onChange={(e) => setSupplierQuery(e.target.value)} placeholder={appLang === 'en' ? 'Search suppliers...' : 'ابحث عن مورد...'} className="text-sm" />
                    </div>
                    {suppliers.filter((s) => {
                      const q = supplierQuery.trim().toLowerCase()
                      if (!q) return true
                      return String(s.name || '').toLowerCase().includes(q)
                    }).map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* v3.74.159 — advance alert. Keeps the accountant from
                    paying cash to a supplier we've already advanced money
                    to without first applying the existing balance. */}
                {newSuppPayment.supplier_id && selectedSupplierAdvance > 0.005 && (
                  <div className="text-[12px] mt-1 px-2 py-1.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                    {appLang === 'en'
                      ? `ℹ️ This supplier has an unapplied advance of ${selectedSupplierAdvance.toFixed(2)} ${baseCurrency}. Apply it to an open bill from the payment row before paying cash.`
                      : `ℹ️ هذا المورد لَدَيه سُلفَة مُتاحَة بقيمَة ${selectedSupplierAdvance.toFixed(2)} ${baseCurrency}. طَبِّقها على فاتورَة مَفتوحَة من سَطر الدَّفعَة قَبل دَفع نَقد.`}
                  </div>
                )}
              </div>
              <div>
                <Label>{appLang === 'en' ? 'Account (Cash/Bank)' : 'الحساب (نقد/بنك)'}</Label>
                <select 
                  className="w-full border rounded px-2 py-1" 
                  value={newSuppPayment.account_id} 
                  onChange={(e) => {
                    const accId = e.target.value;
                    const cashOnly = isCashAccount(accId);
                    setNewSuppPayment({
                      ...newSuppPayment,
                      account_id: accId,
                      method: cashOnly && newSuppPayment.method !== 'cash' ? 'cash' : newSuppPayment.method
                    });
                    // v3.74.516 — اختيار الحساب يضبط عملة الدفع لعملته تلقائياً
                    // (إلا فى وضع الاستثناء حيث الاختلاف مقصود)
                    if (!showAllPayAccounts && accId) {
                      const acc = accounts.find((a) => a.id === accId)
                      const accCcy = accountCurrencyOf(acc)
                      if (accCcy !== paymentCurrency.toUpperCase()) {
                        setPaymentCurrency(accCcy)
                        if (accCcy === baseCurrency.toUpperCase()) {
                          setExchangeRate(1); setExchangeRateId(undefined); setRateSource('same_currency')
                        }
                      }
                    }
                  }}
                >
                  <option value="">{appLang === 'en' ? 'Select payment account' : 'اختر حساب السداد'}</option>
                  {/* v3.74.516 — الحسابات المطابقة لعملة الدفع فقط (إلا فى وضع الاستثناء) */}
                  {(showAllPayAccounts ? accounts : accounts.filter((a: any) => accountCurrencyOf(a) === paymentCurrency.toUpperCase())).map((a) => {
                    const ccy = String((a as any).original_currency || '').toUpperCase()
                    const ccySuffix = ccy && ccy !== baseCurrency.toUpperCase() ? ` — ${ccy}` : ''
                    return (
                      <option key={a.id} value={a.id}>{a.account_name} ({a.account_code}){ccySuffix}</option>
                    )
                  })}
                </select>
                {/* v3.74.516 — رابط الاستثناء الواعى */}
                {!showAllPayAccounts && accounts.some((a: any) => accountCurrencyOf(a) !== paymentCurrency.toUpperCase()) && (
                  <button type="button" className="text-[11px] text-blue-600 hover:underline mt-0.5" onClick={() => setShowAllPayAccounts(true)}>
                    {appLang === 'en' ? 'Show accounts in other currencies (exception)' : 'إظهار الحسابات بعملات أخرى (استثناء)'}
                  </button>
                )}
                {/* v3.25.3: hint when account currency ≠ payment currency */}
                {(() => {
                  const selectedAcc = accounts.find((a) => a.id === newSuppPayment.account_id) as any
                  const accCcy = String(selectedAcc?.original_currency || '').toUpperCase() || baseCurrency.toUpperCase()
                  const payCcy = paymentCurrency.toUpperCase()
                  if (!selectedAcc || accCcy === payCcy) return null
                  return (
                    <div className="text-[11px] mt-1 px-2 py-1 rounded bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                      ℹ️ {appLang === 'en'
                        ? `Account currency: ${accCcy} — different from payment currency (${payCcy}). Conversion applied via Exchange Rates.`
                        : `عملة الحساب: ${accCcy} — مختلفة عن عملة الدفع (${payCcy}). سيتم التحويل تلقائياً من صفحة أسعار الصرف.`}
                    </div>
                  )
                })()}
                {/* v3.26.0: show available balance + overdraft warning for SUPPLIER (cash outflow) */}
                {/* v3.74.516 — المقارنة بعملة الأساس الموحدة: الرصيد محسوب بالأساس،
                    والمبلغ يُحوَّل بسعر الصرف قبل المقارنة (كانت تقارن عملتين مختلفتين) */}
                {(() => {
                  const selectedAcc = accounts.find((a) => a.id === newSuppPayment.account_id) as any
                  if (!selectedAcc) return null
                  const accBal = accountBalances[newSuppPayment.account_id] ?? 0
                  const baseCcy = baseCurrency.toUpperCase()
                  const accSymbol = currencySymbols[baseCcy] || baseCcy
                  const amountBase = Number(newSuppPayment.amount || 0) * (paymentCurrency.toUpperCase() === baseCcy ? 1 : (exchangeRate || 0))
                  const willOverdraft = amountBase > 0 && (accBal - amountBase) < -0.01
                  return (
                    <div className={`text-[11px] mt-1 px-2 py-1 rounded border ${willOverdraft ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800' : 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800'}`}>
                      💰 {appLang === 'en' ? 'Available' : 'الرصيد المتاح'}:{' '}
                      <strong>{accBal.toLocaleString('en-US', { minimumFractionDigits: 2 })} {accSymbol}</strong>
                      {willOverdraft && (
                        <span className="ms-2 font-bold">
                          ⚠️ {appLang === 'en' ? 'INSUFFICIENT FUNDS' : 'الرصيد غير كافٍ'}
                        </span>
                      )}
                    </div>
                  )
                })()}
              </div>
              <div>
                <Label>{appLang === 'en' ? 'Amount' : 'المبلغ'}</Label>
                <NumericInput min={0} step={0.01} value={newSuppPayment.amount} onChange={(val) => setNewSuppPayment({ ...newSuppPayment, amount: val })} decimalPlaces={2} />
              </div>
              <div>
                <Label>{appLang === 'en' ? 'Date' : 'تاريخ'}</Label>
                <Input type="date" value={newSuppPayment.date} onChange={(e) => setNewSuppPayment({ ...newSuppPayment, date: e.target.value })} />
              </div>
              <div>
                <Label>{appLang === 'en' ? 'Method' : 'طريقة'}</Label>
                <select className="w-full border rounded px-2 py-1" value={newSuppPayment.method} onChange={(e) => setNewSuppPayment({ ...newSuppPayment, method: e.target.value })}>
                  <option value="cash">{appLang === 'en' ? 'Cash' : 'كاش'}</option>
                  {!isCashAccount(newSuppPayment.account_id) && (
                    <>
                      <option value="transfer">{appLang === 'en' ? 'Transfer' : 'تحويل'}</option>
                      <option value="check">{appLang === 'en' ? 'Check' : 'شيك'}</option>
                    </>
                  )}
                </select>
              </div>
              {(newSuppPayment.method === 'transfer' || newSuppPayment.method === 'check') && (
                <div>
                  <Label>{appLang === 'en' ? 'Transfer/Check No. (Optional)' : 'رقم التحويل/الشيك (اختياري)'}</Label>
                  <Input value={newSuppPayment.ref} onChange={(e) => setNewSuppPayment({ ...newSuppPayment, ref: e.target.value })} placeholder="..." />
                </div>
              )}
              {/* v3.21.0: Currency picker + ExchangeRateSelector (api/manual dropdown) */}
              <div>
                <Label>{appLang === 'en' ? 'Currency' : 'العملة'}</Label>
                <select className="w-full border rounded px-2 py-1" value={paymentCurrency} onChange={(e) => {
                  const v = e.target.value
                  setPaymentCurrency(v)
                  if (v === baseCurrency) {
                    setExchangeRate(1)
                    setExchangeRateId(undefined)
                    setRateSource('same_currency')
                  }
                  // v3.74.516 — تغيير عملة الدفع يعيد ضبط الحساب تلقائياً
                  // لأول حساب بنفس العملة (ويغلق وضع الاستثناء)
                  setShowAllPayAccounts(false)
                  const vU = v.toUpperCase()
                  const firstMatchedId = (accounts.find((a: any) => accountCurrencyOf(a) === vU) as any)?.id || ''
                  const custAcc = accounts.find((a) => a.id === newCustPayment.account_id)
                  if (!custAcc || accountCurrencyOf(custAcc) !== vU) {
                    setNewCustPayment((p: any) => ({ ...p, account_id: firstMatchedId }))
                  }
                  const suppAcc = accounts.find((a) => a.id === newSuppPayment.account_id)
                  if (!suppAcc || accountCurrencyOf(suppAcc) !== vU) {
                    setNewSuppPayment((p: any) => ({ ...p, account_id: firstMatchedId }))
                  }
                }}>
                  {currencies.length > 0 ? (
                    currencies.map((c) => (
                      <option key={c.code} value={c.code}>{c.symbol} {c.code}</option>
                    ))
                  ) : (
                    Object.entries(currencySymbols).map(([code, symbol]) => (
                      <option key={code} value={code}>{symbol} {code}</option>
                    ))
                  )}
                </select>
              </div>
              {paymentCurrency !== baseCurrency && (
                <div>
                  <Label>{appLang === 'en' ? 'Exchange rate' : 'سعر الصرف'}</Label>
                  <ExchangeRateSelector
                    fromCurrency={paymentCurrency}
                    baseCurrency={baseCurrency}
                    value={exchangeRate}
                    onChange={setExchangeRate}
                    onRateMetaChange={(meta) => {
                      setExchangeRateId(meta?.rateId)
                      setRateSource(meta?.source || 'manual')
                    }}
                    hideLabel
                    showPreview
                    amount={Number(newSuppPayment.amount || 0)}
                  />
                </div>
              )}
              <div className="flex gap-2 w-full md:col-span-5 mt-2">
                <Button onClick={createSupplierPayment} disabled={saving || !online || !newSuppPayment.supplier_id || newSuppPayment.amount <= 0 || !newSuppPayment.account_id}>{appLang === 'en' ? 'Create Single Payment' : 'إنشاء دفعة لمورد'}</Button>
                
                <div className="mr-auto">
                  <SupplierPaymentAllocationUI
                    appLang={appLang}
                    suppliers={suppliers}
                    accounts={accounts}
                    currencies={currencies}
                    baseCurrency={baseCurrency}
                    currencySymbols={currencySymbols}
                    onSuccess={reloadPaymentsWithFilters}
                  />
                </div>
              </div>
            </div>

            {newSuppPayment.supplier_id && (
              <div className="mt-4 border rounded p-3">
                <h3 className="text-base font-semibold mb-2">{appLang === 'en' ? 'Supplier bills not fully paid' : 'فواتير المورد غير المسددة بالكامل'}</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 dark:bg-slate-900">
                      <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Bill No.' : 'رقم الفاتورة'}</th>
                      <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Date' : 'التاريخ'}</th>
                      <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Branch' : 'الفرع'}</th>
                      <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Total' : 'المبلغ'}</th>
                      <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Paid' : 'المدفوع'}</th>
                      <th className="px-2 py-2 text-right text-orange-600">{appLang === 'en' ? 'Returns' : 'المرتجعات'}</th>
                      <th className="px-2 py-2 text-right text-red-600">{appLang === 'en' ? 'Net Outstanding' : 'الصافي المستحق'}</th>
                      <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Select' : 'اختيار'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formSupplierBills.map((b) => {
                      // ✅ Net Outstanding = total - returned - paid (ERP standard)
                      const returnedAmt = Number((b as any).returned_amount || 0)
                      const netOutstanding = Math.max(
                        Number(b.total_amount || 0) - returnedAmt - Number(b.paid_amount || 0),
                        0
                      )
                      // Only show bills with net outstanding > 0
                      if (netOutstanding <= 0) return null
                      return (
                        <tr key={b.id} className="border-b">
                          <td className="px-2 py-2">{b.bill_number}</td>
                          <td className="px-2 py-2">{b.bill_date || "-"}</td>
                          <td className="px-2 py-2">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                              {b.branches?.name || (b.branch_id ? branchNames[b.branch_id] : null) || (appLang === 'en' ? 'Main' : 'رئيسي')}
                            </span>
                          </td>
                          <td className="px-2 py-2">{Number(b.total_amount || 0).toFixed(2)} {currencySymbols[baseCurrency] || baseCurrency}</td>
                          <td className="px-2 py-2">{Number(b.paid_amount || 0).toFixed(2)} {currencySymbols[baseCurrency] || baseCurrency}</td>
                          <td className="px-2 py-2 text-orange-600">
                            {returnedAmt > 0 ? `-${returnedAmt.toFixed(2)} ${currencySymbols[baseCurrency] || baseCurrency}` : '-'}
                          </td>
                          <td className="px-2 py-2 font-semibold text-red-600">{netOutstanding.toFixed(2)} {currencySymbols[baseCurrency] || baseCurrency}</td>
                          <td className="px-2 py-2">
                            <Button variant={selectedFormBillId === b.id ? "default" : "outline"} size="sm" onClick={() => {
                              setSelectedFormBillId(b.id)
                              // ✅ Auto-fill with net outstanding (not gross remaining)
                              setNewSuppPayment({ ...newSuppPayment, amount: netOutstanding })
                            }}>{appLang === 'en' ? 'Select' : 'اختيار'}</Button>
                          </td>
                        </tr>
                      )
                    })}
                    {formSupplierBills.length === 0 && (
                      <tr><td colSpan={8} className="px-2 py-2 text-center text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'No unpaid bills for this supplier' : 'لا توجد فواتير غير مسددة بالكامل لهذا المورد'}</td></tr>
                    )}
                  </tbody>
                </table>
                {selectedFormBillId && (
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Bill selected; amount auto-filled with net outstanding.' : 'تم اختيار الفاتورة، وتم تعبئة خانة المبلغ تلقائيًا بالصافي المستحق.'}</p>
                )}
                {/* v3.74.145 — explicit "advance with no bill link" opt-in.
                    Only shown when there's at least one outstanding bill that
                    the accountant skipped. Without ticking this, save is
                    blocked with a "pick a bill" toast. */}
                {!selectedFormBillId && formSupplierBills.some((b: any) => {
                  const returnedAmt = Number((b as any).returned_amount || 0)
                  const net = Math.max(Number(b.total_amount || 0) - returnedAmt - Number(b.paid_amount || 0), 0)
                  return net > 0
                }) && (
                  <label className="mt-3 flex items-start gap-2 text-sm cursor-pointer p-2 border border-amber-300 dark:border-amber-700 rounded bg-amber-50 dark:bg-amber-950/30">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={confirmAdvanceUnlinked}
                      onChange={(e) => setConfirmAdvanceUnlinked(e.target.checked)}
                    />
                    <span className="text-amber-900 dark:text-amber-100">
                      {appLang === 'en'
                        ? 'Advance payment with no bill link — I confirm this is a prepayment to the supplier, not a settlement of an existing bill.'
                        : 'دَفعَة سُلفَة بدون ربط بفاتورَة — أُؤَكِّد أَنَّ هذه دَفعَة مُقَدَّمَة للمورد ولَيست تَسديداً لفاتورَة قائِمَة.'}
                    </span>
                  </label>
                )}
              </div>
            )}

            <div className="border-t pt-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 dark:bg-slate-900">
                    <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Date' : 'التاريخ'}</th>
                    {/* v3.74.212 — supplier name column, mirrors the customer-side change in v3.74.211. */}
                    <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Supplier' : 'اسم المورد'}</th>
                    <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Branch' : 'الفرع'}</th>
                    <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Paid Amount' : 'المدفوع'}</th>
                    <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Net Bill' : 'صافي الفاتورة'}</th>
                    <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Reference' : 'مرجع'}</th>
                    <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Account (Cash/Bank)' : 'الحساب (نقد/بنك)'}</th>
                    <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Linked Supplier Bill' : 'فاتورة المورد المرتبطة'}</th>
                    <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Linked Purchase Order' : 'أمر الشراء المرتبط'}</th>
                    <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Status' : 'الحالة'}</th>
                    <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Action' : 'إجراء'}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSupplierPayments.map((p) => {
                    const userRole = userContext?.role || ''
                    // ✅ Multi-Level Approval check
                    let canApprove = false;
                    if (p.status === 'pending_approval' && ['owner', 'admin', 'general_manager', 'manager'].includes(userRole)) canApprove = true;
                    if (p.status === 'pending_manager' && ['owner', 'admin', 'general_manager', 'manager'].includes(userRole)) canApprove = true;
                    if (p.status === 'pending_director' && ['owner', 'admin', 'general_manager'].includes(userRole)) canApprove = true;

                    const isPending = p.status?.startsWith('pending_')
                    const isRejected = p.status === 'rejected'

                    // ✅ Net Bill Amount & Overpayment detection
                    // v3.74.146 — also look through payment_allocations
                    // when payments.bill_id is null (allocation-only link).
                    const paidAmt = getDisplayAmount(p)
                    const effectiveBillIdForAmount = p.bill_id || allocBillByPayment[p.id] || null
                    const billAmtInfo = effectiveBillIdForAmount ? billAmountsMap[effectiveBillIdForAmount] : null
                    const billTotalAmt = billAmtInfo?.total ?? null
                    const billReturnedAmt = billAmtInfo?.returned ?? 0
                    const netBillAmt = billTotalAmt !== null ? Math.max(0, billTotalAmt - billReturnedAmt) : null
                    const isOverpayment = netBillAmt !== null && paidAmt > netBillAmt + 0.001
                    const advanceAmt = isOverpayment ? paidAmt - (netBillAmt ?? 0) : 0

                    // v3.74.212 — supplier name lookup, mirrors v3.74.211 on the customer side.
                    const supplierName = suppliers.find((s: any) => s.id === (p as any).supplier_id)?.name
                      || (appLang === 'en' ? '-' : '—')

                    return (
                    <tr key={p.id} className={`border-b ${isPending ? 'bg-yellow-50 dark:bg-yellow-900/10' : isRejected ? 'bg-red-50 dark:bg-red-900/10 opacity-60' : ''}`}>
                      <td className="px-2 py-2">{p.payment_date}</td>
                      <td className="px-2 py-2 font-medium text-gray-800 dark:text-gray-200">{supplierName}</td>
                      <td className="px-2 py-2">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                          {/* ✅ priority: bill.branch → PO.branch → billBranchMap → payment.branch
                              v3.74.146 — also check allocation-linked bill_id. */}
                          {((p as any).bill?.bill_branches?.name)
                            || ((p as any).bill?.branch_id ? branchNames[(p as any).bill.branch_id] : null)
                            || ((p as any).bill?.purchase_order?.po_branches?.name)
                            || ((p as any).bill?.purchase_order?.branch_id ? branchNames[(p as any).bill.purchase_order.branch_id] : null)
                            || (p.bill_id && billBranchMap[p.bill_id] ? branchNames[billBranchMap[p.bill_id]] : null)
                            || (allocBillByPayment[p.id] && billBranchMap[allocBillByPayment[p.id]] ? branchNames[billBranchMap[allocBillByPayment[p.id]]] : null)
                            || (p.branch_id ? branchNames[p.branch_id] : null)
                            || p.branches?.name
                            || (appLang === 'en' ? 'Main' : 'رئيسي')}
                        </span>
                      </td>
                      {/* ✅ Paid Amount with Overpayment badge — v3.11.0 FX-aware */}
                      <td className="px-2 py-2">
                        <div className="flex flex-col gap-0.5 items-end">
                          {renderPaymentAmount(p, baseCurrency)}
                          {isOverpayment && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 whitespace-nowrap">
                              +{advanceAmt.toFixed(2)} {currencySymbol} {appLang === 'en' ? 'Advance' : 'سلفة'}
                            </span>
                          )}
                        </div>
                      </td>
                      {/* ✅ Net Bill Amount column */}
                      <td className="px-2 py-2 text-right">
                        {netBillAmt !== null ? (
                          <span className={`font-medium ${isOverpayment ? 'text-amber-700 dark:text-amber-400' : 'text-gray-700 dark:text-gray-300'}`}>
                            {netBillAmt.toFixed(2)} {currencySymbol}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2">{p.reference_number || "-"}</td>
                      <td className="px-2 py-2">{p.account_id ? (accountNames[p.account_id] || "-") : "-"}</td>
                      <td className="px-2 py-2">
                        {(() => {
                          // v3.74.126 — mirror the customer-side logic (v3.74.122):
                          //   1. Direct bill link → blue link (unchanged)
                          //   2. VOID/correction row → trace to original supplier
                          //      payment and label "تَصحيح دَفعَة على BILL-N"
                          //   3. Negative-amount row (supplier refund) → purple label
                          //   4. Anything left → "غير مرتبط" with notes as tooltip

                          // 1) Direct bill linkage on the payment row,
                          //    OR linkage stored in payment_allocations
                          //    (v3.74.146 — surface allocation-only links).
                          const effectiveBillId = p.bill_id || allocBillByPayment[p.id] || null
                          if (effectiveBillId) {
                            return (
                              <Link href={`/bills/${effectiveBillId}`} className="text-blue-600 hover:underline">
                                {billNumbers[effectiveBillId] || effectiveBillId}
                              </Link>
                            )
                          }

                          // 2) VOID row — trace to original supplier payment.
                          const voidsId = (p as any).voids_payment_id as string | undefined
                          if (voidsId) {
                            const orig = supplierPayments.find(x => x.id === voidsId) as any
                            if (orig?.bill_id) {
                              return (
                                <span className="text-amber-600 dark:text-amber-400 text-xs" title={String(p.notes || '')}>
                                  {appLang === 'en' ? 'Correction of payment on' : 'تَصحيح دَفعَة على'}
                                  <Link href={`/bills/${orig.bill_id}`} className="text-blue-600 hover:underline mx-1">
                                    {billNumbers[orig.bill_id] || orig.bill_id}
                                  </Link>
                                </span>
                              )
                            }
                            if (orig && Number(orig.amount || 0) < 0) {
                              return (
                                <span className="text-amber-600 dark:text-amber-400 text-xs" title={String(p.notes || '')}>
                                  {appLang === 'en' ? 'Correction of supplier refund' : 'تَصحيح صَرف لِمُورِّد'}
                                </span>
                              )
                            }
                            return (
                              <span className="text-amber-600 dark:text-amber-400 text-xs" title={String(p.notes || '')}>
                                {appLang === 'en' ? 'Payment correction' : 'تَصحيح دَفعَة'}
                              </span>
                            )
                          }

                          // 3) Supplier refund / advance (negative amount, no bill).
                          if (Number(p.amount || 0) < 0) {
                            const notes = String(p.notes || '')
                            const m = notes.match(/BILL-\d+/) // surface source bill if mentioned
                            const srcBill = m ? m[0] : null
                            return (
                              <span className="text-purple-600 dark:text-purple-400 text-xs" title={notes || (appLang === 'en' ? 'Supplier refund' : 'صَرف لِمُورِّد')}>
                                {appLang === 'en' ? 'Supplier refund' : 'صَرف رَصيد المُورِّد'}
                                {srcBill && (
                                  <span className="text-gray-500 dark:text-gray-400 mx-1">
                                    {appLang === 'en' ? `(from ${srcBill})` : `(من ${srcBill})`}
                                  </span>
                                )}
                              </span>
                            )
                          }

                          // 4) Truly unlinked (rare).
                          return (
                            <span className="text-gray-400 text-xs" title={String(p.notes || '')}>
                              {appLang === 'en' ? 'Not linked' : 'غير مرتبط'}
                            </span>
                          )
                        })()}
                      </td>
                      <td className="px-2 py-2">
                        {(() => {
                          if (p.purchase_order_id) {
                            const poNumber = poNumbers[p.purchase_order_id]
                            return poNumber ? (<Link href={`/purchase-orders/${p.purchase_order_id}`} className="text-blue-600 hover:underline">{poNumber}</Link>) : p.purchase_order_id
                          }
                          // v3.74.146 — same allocation fallback for the
                          // linked-PO column.
                          const billIdForPo = p.bill_id || allocBillByPayment[p.id] || null
                          if (billIdForPo && billToPoMap[billIdForPo]) {
                            const poId = billToPoMap[billIdForPo]
                            const poNumber = poNumbers[poId]
                            return poNumber ? (<Link href={`/purchase-orders/${poId}`} className="text-blue-600 hover:underline">{poNumber}</Link>) : poId
                          }
                          return "غير مرتبط"
                        })()}
                      </td>
                      {/* ✅ Status Badge */}
                      <td className="px-2 py-2">
                        {isPending && (
                          <div className="flex flex-col gap-1">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                              ⏳ {appLang === 'en' ? 'Pending' : 'في الانتظار'}
                            </span>
                            <span className="text-[10px] text-yellow-600 dark:text-yellow-400 font-semibold px-1">
                              {p.status === 'pending_manager' && (appLang === 'en' ? 'Manager Approval' : 'اعتماد مدير الإدارة')}
                              {p.status === 'pending_director' && (appLang === 'en' ? 'Director Approval' : 'اعتماد الإدارة العليا')}
                            </span>
                          </div>
                        )}
                        {p.status === 'approved' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                            ✅ {appLang === 'en' ? 'Approved' : 'معتمد'}
                          </span>
                        )}
                        {isRejected && (
                          <div>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                              ❌ {appLang === 'en' ? 'Rejected' : 'مرفوض'}
                            </span>
                            {p.rejection_reason && <p className="text-xs text-red-600 mt-0.5">{p.rejection_reason}</p>}
                          </div>
                        )}
                        {!p.status && <span className="text-xs text-gray-400">—</span>}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex gap-2 flex-wrap">
                          <Button variant="ghost" size="icon" title={appLang === 'en' ? 'View Details' : 'عرض التفاصيل'} onClick={() => setSelectedPaymentDetailsId(p.id)}>
                            <Eye className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          </Button>
                          {/* v3.74.126 — mirror customer-side v3.74.123 governance:
                              VOID rows and already-voided originals become read-only.
                              Apply-to-Bill / Apply-to-PO / Edit / Delete are gated
                              behind the "is this an active normal payment?" check
                              so an auditor can't accidentally re-allocate a
                              correction record or reuse a reversed payment. */}
                          {(p as any).voids_payment_id ? (
                            <>
                              <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                {appLang === 'en' ? 'Correction / Void' : 'تَصحيح / إِلغاء'}
                              </span>
                              {permUpdate && (
                                <Button variant="ghost" disabled={!online} onClick={() => {
                                  setEditingPayment(p)
                                  setEditFields({
                                    payment_date: p.payment_date,
                                    payment_method: p.payment_method || "cash",
                                    reference_number: p.reference_number || "",
                                    notes: p.notes || "",
                                    account_id: p.account_id || "",
                                  })
                                  setEditOpen(true)
                                }} title={appLang === 'en' ? 'Edit notes / reference only' : 'تَعديل الملاحظات والمَرجع فَقَط'}>
                                  {appLang === 'en' ? 'Edit notes' : 'تَعديل وَصفى'}
                                </Button>
                              )}
                            </>
                          ) : (p as any).voided_by_payment_id ? (
                            <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                              {appLang === 'en' ? 'Voided' : 'مُلغاة بتَصحيح'}
                            </span>
                          ) : (
                            <>
                              {/* v3.74.146 — also treat allocation-linked
                                  payments as "already on a bill" so the
                                  Apply-to-Bill button hides for them too. */}
                              {!p.bill_id && !allocBillByPayment[p.id] && permWrite && (
                                <Button variant="outline" onClick={() => openApplyToBill(p)} disabled={!online}>{appLang === 'en' ? 'Apply to Bill' : 'تطبيق على فاتورة'}</Button>
                              )}
                              {(() => {
                                // ✅ إخفاء زر "على أمر شراء" إذا كان هناك أمر شراء مرتبط (مباشر أو عبر الفاتورة)
                                // v3.74.146 — also consider the bill_id
                                // resolved from payment_allocations when
                                // chaining through billToPoMap.
                                const hasDirectPO = !!p.purchase_order_id
                                const effectiveBillIdForPo = p.bill_id || allocBillByPayment[p.id] || null
                                const hasPOViaBill = !!(effectiveBillIdForPo && billToPoMap[effectiveBillIdForPo])
                                const hasAnyPO = hasDirectPO || hasPOViaBill
                                return !hasAnyPO && permWrite && (
                                <Button variant="ghost" onClick={() => openApplyToPO(p)} disabled={!online}>{appLang === 'en' ? 'Apply to PO' : 'على أمر شراء'}</Button>
                                )
                              })()}
                              {permUpdate && (
                                <Button variant="ghost" disabled={!online} onClick={() => {
                                  setEditingPayment(p)
                                  setEditFields({
                                    payment_date: p.payment_date,
                                    payment_method: p.payment_method || "cash",
                                    reference_number: p.reference_number || "",
                                    notes: p.notes || "",
                                    account_id: p.account_id || "",
                                  })
                                  setEditOpen(true)
                                }} title={appLang === 'en' ? 'Edit notes / reference only' : 'تَعديل الملاحظات والمَرجع فَقَط'}>
                                  {appLang === 'en' ? 'Edit notes' : 'تَعديل وَصفى'}
                                </Button>
                              )}
                              {/* v3.74.127/v3.74.144 — smart correction button.
                                  Status-aware behaviour:
                                  - rejected: fast path. The payment never posted accounting,
                                    so we open the SAME dialog but submit to a different
                                    endpoint that directly edits the payment and resets it to
                                    pending_approval (no need for the full correction workflow).
                                  - approved/sent/cleared: governance path. Goes through
                                    vendor_payment_correction_requests with owner approval +
                                    documented reversal. */}
                              <Button
                                variant="outline"
                                className="border-amber-400 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                                disabled={!online}
                                title={
                                  isRejected
                                    ? (appLang === 'en' ? 'Edit this rejected payment and resubmit for approval' : 'تَعديل هذِه الدَّفعَة المَرفوضَة وإِعادَة إِرسالها للاعتماد')
                                    : (appLang === 'en' ? 'Request correction of this vendor payment (needs owner/general manager approval)' : 'طَلَب تَصحيح هذه الدَّفعَة لِلمُورِّد — يَحتاج اعتماد المالِك/المُدير العام')
                                }
                                onClick={() => {
                                  setCorrectionPayment(p)
                                  setCorrectionReason("")
                                  setCorrectionFields({
                                    amount: String(Math.abs(Number(p.amount || 0))),
                                    payment_date: p.payment_date || "",
                                    account_id: p.account_id || "",
                                    payment_method: p.payment_method || "cash",
                                    reference_number: p.reference_number || "",
                                    notes: p.notes || "",
                                    original_currency: "",
                                    exchange_rate: "",
                                  })
                                  setShowAllCorrectionAccounts(false)
                                  setCorrectionOpen(true)
                                }}
                              >
                                {isRejected
                                  ? (appLang === 'en' ? 'Edit & resubmit' : 'تَعديل وإِعادَة الإِرسال')
                                  : (appLang === 'en' ? 'Request correction' : 'طَلَب تَصحيح')}
                              </Button>
                            </>
                          )}
                          {/* ✅ Approve/Reject buttons for privileged roles on pending payments */}
                          {canApprove && isPending && (
                            <>
                              <Button variant="outline" size="sm" className="text-green-700 border-green-300 hover:bg-green-50" disabled={saving} onClick={() => approvePayment(p)}>
                                {appLang === 'en' ? '✅ Approve' : '✅ اعتماد'}
                              </Button>
                              <Button variant="outline" size="sm" className="text-red-700 border-red-300 hover:bg-red-50" disabled={saving} onClick={() => { setRejectingPayment(p); setRejectionReason(''); setRejectOpen(true) }}>
                                {appLang === 'en' ? '❌ Reject' : '❌ رفض'}
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Edit Payment Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{appLang === 'en' ? 'Edit Payment Notes' : 'تَعديل ملاحظات الدَّفعَة'}</DialogTitle>
            </DialogHeader>
            {editingPayment && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>{appLang === 'en' ? 'Payment Date' : 'تاريخ الدفع'}</Label>
                    {/* v3.74.111 - locked: changing the date moves the entry into a different
                        accounting period and is a hard no for an Edit-notes flow. Use Request
                        correction (Reversal) instead. */}
                    <Input type="date" value={editFields.payment_date} disabled readOnly className="bg-gray-50 dark:bg-slate-800 cursor-not-allowed" />
                  </div>
                  <div>
                    <Label>{appLang === 'en' ? 'Payment Method' : 'طريقة الدفع'}</Label>
                    <select className="w-full border rounded px-2 py-1 bg-gray-50 dark:bg-slate-800 cursor-not-allowed" value={editFields.payment_method} disabled>
                      <option value="cash">{appLang === 'en' ? 'Cash' : 'كاش'}</option>
                      {!isCashAccount(editFields.account_id) && (
                        <>
                          <option value="transfer">{appLang === 'en' ? 'Transfer' : 'تحويل'}</option>
                          <option value="check">{appLang === 'en' ? 'Check' : 'شيك'}</option>
                        </>
                      )}
                    </select>
                  </div>
                  {(editFields.payment_method === 'transfer' || editFields.payment_method === 'check') && (
                    <div>
                      <Label>{appLang === 'en' ? 'Transfer/Check No. (Optional)' : 'رقم التحويل/الشيك (اختياري)'}</Label>
                      <Input value={editFields.reference_number} onChange={(e) => setEditFields({ ...editFields, reference_number: e.target.value })} />
                    </div>
                  )}
                  <div>
                    <Label>{appLang === 'en' ? 'Account (Cash/Bank)' : 'الحساب (نقد/بنك)'}</Label>
                    {/* v3.74.111 - locked. Moving a payment between cash/bank accounts
                        rewrites GL and is not a notes-level edit. Use Request correction. */}
                    <select 
                      className="w-full border rounded px-2 py-1 bg-gray-50 dark:bg-slate-800 cursor-not-allowed" 
                      value={editFields.account_id} 
                      disabled
                      onChange={async (e) => {
                        const newAccountId = e.target.value
                        const cashOnly = isCashAccount(newAccountId)
                        if (cashOnly && editFields.payment_method !== 'cash') {
                          setEditFields(prev => ({ ...prev, payment_method: 'cash' }))
                        }
                        const oldAccountId = editingPayment?.account_id || ""
                        
                        // التحقق من رصيد الحساب عند تغيير الحساب
                        if (editingPayment && newAccountId && newAccountId !== oldAccountId) {
                          const balanceCheck = await checkAccountBalance(
                            newAccountId,
                            editingPayment.amount,
                            editFields.payment_date || editingPayment.payment_date
                          )
                          
                          if (!balanceCheck.sufficient) {
                            toast({
                              title: appLang === 'en' ? 'Insufficient Balance' : 'رصيد غير كافٍ',
                              description: appLang === 'en'
                                ? `The account "${balanceCheck.accountName || 'Selected Account'}" has insufficient balance. Current balance: ${balanceCheck.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. Required: ${editingPayment.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`
                                : `رصيد الحساب "${balanceCheck.accountName || 'الحساب المختار'}" غير كافٍ. الرصيد الحالي: ${balanceCheck.currentBalance.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. المطلوب: ${editingPayment.amount.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
                              variant: 'destructive'
                            })
                            // إعادة الحساب الأصلي
                            return
                          }
                        }
                        
                        setEditFields({ ...editFields, account_id: newAccountId })
                      }}
                    >
                      <option value="">اختر حساب الدفع</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.account_name} ({a.account_code})</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <Label>{appLang === 'en' ? 'Notes' : 'ملاحظات'}</Label>
                  <Input value={editFields.notes} onChange={(e) => setEditFields({ ...editFields, notes: e.target.value })} />
                </div>
                <div className="text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded p-3">
                  {appLang === 'en'
                    ? 'Date, payment method and cash/bank account are locked. To change any of them, file a Request correction so the change goes through approval and posts a proper reversal.'
                    : 'التاريخ وطَريقَة الدَّفع وحِساب النَّقد/البَنك مَقفولَة. لتَغيير أَى منها، استَخدِم "طَلَب تَصحيح" — يَمُرّ بالاعتماد ويُسَجِّل عَكساً محاسبياً مَوثَّقاً.'}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => { setEditOpen(false); setEditingPayment(null) }}>{appLang === 'en' ? 'Cancel' : 'إلغاء'}</Button>
              <Button onClick={async () => {
                try {
                  if (!editingPayment) return
                  if (!online) { toastActionError(toast, "الاتصال", "التعديل", "لا يوجد اتصال بالإنترنت"); return }
                  setSaving(true)
                  if (editingPayment.supplier_id) {
                    const response = await fetch(`/api/supplier-payments/${encodeURIComponent(editingPayment.id)}/update`, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        "Idempotency-Key": globalThis.crypto?.randomUUID?.() || `supplier-payment-update-${editingPayment.id}`,
                      },
                      body: JSON.stringify({
                        // v3.74.111 - locked fields always use the original payment record.
                        // Only reference_number and notes come from the edit form. This
                        // protects against tampering even if the UI inputs are bypassed.
                        paymentDate: editingPayment.payment_date,
                        paymentMethod: editingPayment.payment_method || "cash",
                        accountId: editingPayment.account_id || null,
                        referenceNumber: editFields.reference_number || null,
                        notes: editFields.notes || null,
                        uiSurface: "payments_page_edit_dialog",
                      }),
                    })

                    const result = await response.json().catch(() => ({})) as { success?: boolean; error?: string }
                    if (!response.ok || !result.success) {
                      throw new Error(result.error || (appLang === 'en' ? 'Failed to update supplier payment' : 'فشل تعديل دفعة المورد'))
                    }

                    toastActionSuccess(toast, "التحديث", "الدفعة")
                    setEditOpen(false)
                    setEditingPayment(null)
                    await reloadPaymentsWithFilters()
                    return
                  }

                  if (editingPayment.customer_id) {
                    const response = await fetch(`/api/customer-payments/${encodeURIComponent(editingPayment.id)}/update`, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        "Idempotency-Key": globalThis.crypto?.randomUUID?.() || `customer-payment-update-${editingPayment.id}`,
                      },
                      body: JSON.stringify({
                        // v3.74.111 - locked fields always use the original payment record.
                        // Only reference_number and notes come from the edit form. This
                        // protects against tampering even if the UI inputs are bypassed.
                        paymentDate: editingPayment.payment_date,
                        paymentMethod: editingPayment.payment_method || "cash",
                        accountId: editingPayment.account_id || null,
                        referenceNumber: editFields.reference_number || null,
                        notes: editFields.notes || null,
                        uiSurface: "payments_page_edit_dialog",
                      }),
                    })

                    const result = await response.json().catch(() => ({})) as { success?: boolean; error?: string }
                    if (!response.ok || !result.success) {
                      throw new Error(result.error || (appLang === 'en' ? 'Failed to update customer payment' : 'فشل تعديل دفعة العميل'))
                    }

                    toastActionSuccess(toast, "التحديث", "الدفعة")
                    setEditOpen(false)
                    setEditingPayment(null)
                    await reloadPaymentsWithFilters()
                    return
                  }

                  throw new Error(appLang === 'en'
                    ? 'Unsupported legacy payment owner. Payments must be updated through customer/supplier command services.'
                    : 'نوع الدفعة غير مدعوم. يجب تعديل المدفوعات عبر أوامر العملاء/الموردين الخلفية.')
                } catch (err) {
                  console.error("Error updating payment:", err)
                  toastActionError(toast, "التحديث", "الدفعة", "فشل تعديل الدفعة")
                } finally { setSaving(false) }
              }}>{appLang === 'en' ? 'Save' : 'حفظ'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Payment Dialog */}
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{appLang === 'en' ? 'Delete Payment' : 'حذف الدفعة'}</DialogTitle>
            </DialogHeader>
            {deletingPayment && (
              <div className="space-y-3">
                {(deletingPayment.invoice_id || deletingPayment.bill_id || deletingPayment.purchase_order_id) ? (
                  <p className="text-amber-600">{appLang === 'en' ? 'Deletion will be handled professionally: reverse linked journals (invoice/bill/PO), update documents, then delete the payment.' : 'ستتم معالجة الحذف بشكل احترافي: سنعكس القيود المرتبطة (فاتورة/فاتورة مورد/أمر شراء)، ونُحدّث المستندات، ثم نحذف الدفعة.'}</p>
                ) : (
                  <p>{appLang === 'en' ? 'A reversal journal will be created for consistency, then the payment will be deleted.' : 'سيتم إنشاء قيد عكسي للحفاظ على الاتساق ثم حذف الدفعة نهائيًا.'}</p>
                )}
                <p className="text-sm text-gray-600 dark:text-gray-400">المبلغ: {Number(deletingPayment.amount || 0).toFixed(2)} | التاريخ: {deletingPayment.payment_date}</p>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => { setDeleteOpen(false); setDeletingPayment(null) }}>{appLang === 'en' ? 'Cancel' : 'إلغاء'}</Button>
              <Button variant="destructive" onClick={async () => {
                try {
                  if (!deletingPayment) return
                  if (!online) { toastActionError(toast, "الاتصال", "الحذف", "لا يوجد اتصال بالإنترنت"); return }
                  setSaving(true)
                  if (deletingPayment.supplier_id) {
                    const response = await fetch(`/api/supplier-payments/${encodeURIComponent(deletingPayment.id)}/delete`, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        "Idempotency-Key": globalThis.crypto?.randomUUID?.() || `supplier-payment-delete-${deletingPayment.id}`,
                      },
                      body: JSON.stringify({
                        uiSurface: "payments_page_delete_dialog",
                      }),
                    })

                    const result = await response.json().catch(() => ({})) as { success?: boolean; error?: string }
                    if (!response.ok || !result.success) {
                      throw new Error(result.error || (appLang === 'en' ? 'Failed to delete supplier payment' : 'فشل حذف دفعة المورد'))
                    }

                    toastActionSuccess(toast, "الحذف", "الدفعة")
                    setDeleteOpen(false)
                    setDeletingPayment(null)
                    await reloadPaymentsWithFilters()
                    return
                  }

                  if (deletingPayment.customer_id) {
                    const response = await fetch(`/api/customer-payments/${encodeURIComponent(deletingPayment.id)}/delete`, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        "Idempotency-Key": globalThis.crypto?.randomUUID?.() || `customer-payment-delete-${deletingPayment.id}`,
                      },
                      body: JSON.stringify({
                        uiSurface: "payments_page_delete_dialog",
                      }),
                    })

                    const result = await response.json().catch(() => ({})) as { success?: boolean; error?: string }
                    if (!response.ok || !result.success) {
                      throw new Error(result.error || (appLang === 'en' ? 'Failed to delete customer payment' : 'فشل حذف دفعة العميل'))
                    }

                    toastActionSuccess(toast, "الحذف", "الدفعة")
                    setDeleteOpen(false)
                    setDeletingPayment(null)
                    await reloadPaymentsWithFilters()
                    return
                  }

                  throw new Error(appLang === 'en'
                    ? 'Unsupported legacy payment owner. Payments must be deleted through customer/supplier command services.'
                    : 'نوع الدفعة غير مدعوم. يجب حذف المدفوعات عبر أوامر العملاء/الموردين الخلفية.')
                } catch (err) {
                  console.error("Error deleting payment:", err)
                  toastActionError(toast, "الحذف", "الدفعة", "فشل حذف الدفعة")
                } finally { setSaving(false) }
              }}>{appLang === 'en' ? 'Confirm Delete' : 'تأكيد الحذف'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Apply to Invoice Dialog */}
        <Dialog open={applyInvoiceOpen} onOpenChange={setApplyInvoiceOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{appLang === 'en' ? 'Apply payment to invoice' : 'تطبيق دفعة على فاتورة'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>{appLang === 'en' ? 'Document' : 'الوثيقة'}</Label>
                <select className="w-full border rounded px-2 py-1" value={applyDocId} onChange={(e) => setApplyDocId(e.target.value)}>
                  <option value="">{appLang === 'en' ? 'Select an invoice' : 'اختر فاتورة'}</option>
                  {customerInvoices.map((inv) => {
                    const outstanding = Math.max(Number(inv.total_amount || 0) - Number(inv.paid_amount || 0), 0)
                    return (
                      <option key={inv.id} value={inv.id}>
                        {inv.invoice_number} — {appLang === 'en' ? 'Remaining' : 'متبقّي'} {outstanding.toFixed(2)}
                      </option>
                    )
                  })}
                </select>
              </div>
              <div>
                <Label>{appLang === 'en' ? 'Amount to apply' : 'المبلغ للتطبيق'}</Label>
                <NumericInput min={0} step={0.01} value={applyAmount} onChange={(val) => setApplyAmount(val)} decimalPlaces={2} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setApplyInvoiceOpen(false)}>{appLang === 'en' ? 'Cancel' : 'إلغاء'}</Button>
              <Button onClick={applyPaymentToInvoice} disabled={saving || !applyDocId || applyAmount <= 0}>{appLang === 'en' ? 'Apply' : 'تطبيق'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Apply to PO Dialog */}
        <Dialog open={applyPoOpen} onOpenChange={setApplyPoOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{appLang === 'en' ? 'Apply payment to purchase order' : 'تطبيق سداد على أمر شراء'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>{appLang === 'en' ? 'Document' : 'الوثيقة'}</Label>
                <select className="w-full border rounded px-2 py-1" value={applyDocId} onChange={(e) => setApplyDocId(e.target.value)}>
                  <option value="">{appLang === 'en' ? 'Select a purchase order' : 'اختر أمر شراء'}</option>
                  {supplierPOs.map((po) => {
                    const outstanding = Math.max(Number(po.total_amount || 0) - Number(po.received_amount || 0), 0)
                    return (
                      <option key={po.id} value={po.id}>
                        {po.po_number} — {appLang === 'en' ? 'Remaining' : 'متبقّي'} {outstanding.toFixed(2)}
                      </option>
                    )
                  })}
                </select>
              </div>
              <div>
                <Label>{appLang === 'en' ? 'Amount to apply' : 'المبلغ للتطبيق'}</Label>
                <NumericInput min={0} step={0.01} value={applyAmount} onChange={(val) => setApplyAmount(val)} decimalPlaces={2} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setApplyPoOpen(false)}>{appLang === 'en' ? 'Cancel' : 'إلغاء'}</Button>
              <Button onClick={applyPaymentToPO} disabled={saving || !applyDocId || applyAmount <= 0}>{appLang === 'en' ? 'Apply' : 'تطبيق'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Apply to Bill Dialog */}
        <Dialog open={applyBillOpen} onOpenChange={setApplyBillOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{appLang === 'en' ? 'Apply payment to supplier bill' : 'تطبيق سداد على فاتورة مورد'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>{appLang === 'en' ? 'Document' : 'الوثيقة'}</Label>
                <select className="w-full border rounded px-2 py-1" value={applyDocId} onChange={(e) => setApplyDocId(e.target.value)}>
                  <option value="">{appLang === 'en' ? 'Select a bill' : 'اختر فاتورة'}</option>
                  {supplierBills.map((b) => {
                    const outstanding = Math.max(Number(b.total_amount || 0) - Number(b.paid_amount || 0), 0)
                    return (
                      <option key={b.id} value={b.id}>
                        {b.bill_number} — {appLang === 'en' ? 'Remaining' : 'متبقّي'} {outstanding.toFixed(2)}
                      </option>
                    )
                  })}
                </select>
              </div>
              <div>
                <Label>{appLang === 'en' ? 'Amount to apply' : 'المبلغ للتطبيق'}</Label>
                <NumericInput min={0} step={0.01} value={applyAmount} onChange={(val) => setApplyAmount(val)} decimalPlaces={2} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setApplyBillOpen(false)}>{appLang === 'en' ? 'Cancel' : 'إلغاء'}</Button>
              <Button onClick={applyPaymentToBill} disabled={saving || !applyDocId || applyAmount <= 0}>{appLang === 'en' ? 'Apply' : 'تطبيق'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ✅ Rejection Reason Dialog */}
        <Dialog open={rejectOpen} onOpenChange={(open) => { setRejectOpen(open); if (!open) { setRejectingPayment(null); setRejectionReason("") } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{appLang === 'en' ? '❌ Reject Payment' : '❌ رفض الدفعة'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {appLang === 'en'
                  ? `You are about to reject a payment of ${Number(rejectingPayment?.amount || 0).toFixed(2)}. Please provide a reason (required).`
                  : `أنت على وشك رفض دفعة بمبلغ ${Number(rejectingPayment?.amount || 0).toFixed(2)}. يرجى توضيح سبب الرفض (إلزامي).`}
              </p>
              <div>
                <Label>{appLang === 'en' ? 'Rejection Reason' : 'سبب الرفض'} *</Label>
                <textarea
                  className="w-full border rounded px-3 py-2 text-sm mt-1 min-h-[80px] dark:bg-slate-800 dark:border-slate-600"
                  placeholder={appLang === 'en' ? 'Enter reason for rejection...' : 'أدخل سبب الرفض...'}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setRejectOpen(false); setRejectingPayment(null); setRejectionReason("") }}>
                {appLang === 'en' ? 'Cancel' : 'إلغاء'}
              </Button>
              <Button variant="destructive" disabled={saving || !rejectionReason.trim()} onClick={rejectPayment}>
                {saving ? (appLang === 'en' ? 'Rejecting...' : 'جاري الرفض...') : (appLang === 'en' ? 'Confirm Rejection' : 'تأكيد الرفض')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* v3.74.114 - Request Correction dialog */}
        <Dialog open={correctionOpen} onOpenChange={(o) => { if (!o) { setCorrectionOpen(false); setCorrectionPayment(null); setShowAllCorrectionAccounts(false) } }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{appLang === 'en' ? 'Request Payment Correction' : 'طَلَب تَصحيح دَفعَة'}</DialogTitle>
            </DialogHeader>
            {correctionPayment && (
              <div className="space-y-4">
                {/* v3.74.524 — surface the owner's rejection reason so the
                    accountant knows what to fix before proposing changes. */}
                {correctionPayment.rejection_reason && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded p-3 text-xs">
                    <div className="font-semibold text-red-800 dark:text-red-300 mb-1">
                      ⛔ {appLang === 'en' ? 'Owner rejection reason' : 'سَبَب رَفض المالِك'}
                    </div>
                    <div className="text-red-900 dark:text-red-200 whitespace-pre-wrap">{correctionPayment.rejection_reason}</div>
                  </div>
                )}
                <div className="bg-gray-50 dark:bg-slate-800 rounded p-3 text-xs space-y-1">
                  <div className="font-semibold text-gray-700 dark:text-gray-300">{appLang === 'en' ? 'Original payment' : 'الدَّفعَة الأَصلية'}</div>
                  <div>
                    {appLang === 'en' ? 'Amount' : 'المَبلَغ'}:{" "}
                    <span className="font-semibold">
                      {Number(correctionPayment.amount).toLocaleString()}{" "}
                      {correctionPayment.original_currency || correctionPayment.currency_code || 'EGP'}
                    </span>
                    {/* v3.74.524 — FX base equivalent + rate for non-EGP */}
                    {(correctionPayment.original_currency || correctionPayment.currency_code) !== 'EGP' && correctionPayment.base_currency_amount != null && (
                      <span className="ms-2 text-muted-foreground">
                        ≈ {Number(correctionPayment.base_currency_amount).toLocaleString()} EGP
                        {correctionPayment.exchange_rate != null && <> · {appLang === 'en' ? 'FX' : 'سعر الصرف'}: {Number(correctionPayment.exchange_rate).toFixed(4)}</>}
                      </span>
                    )}
                  </div>
                  <div>{appLang === 'en' ? 'Date' : 'التاريخ'}: {correctionPayment.payment_date}</div>
                  <div>{appLang === 'en' ? 'Method' : 'طَريقَة الدَّفع'}: {correctionPayment.payment_method || '-'}</div>
                  <div>{appLang === 'en' ? 'Reference' : 'المَرجع'}: {correctionPayment.reference_number || '-'}</div>
                </div>

                <div>
                  <Label>{appLang === 'en' ? 'Reason (required, min 5 chars)' : 'السَّبَب (إِلزامى، ٥ أَحرُف على الأَقَل)'}</Label>
                  <Textarea value={correctionReason} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setCorrectionReason(e.target.value)} className="mt-1" rows={2} placeholder={appLang === 'en' ? 'Why is the original wrong?' : 'لماذا الدَّفعَة الأَصلية خَاطِئَة؟'} />
                </div>

                {/* v3.74.526 — Correction dialog unified with supplier-payment form:
                    Currency is now a first-class, standalone dropdown (as in
                    "دفع الموردين"). The account list filters to the chosen
                    currency, with a conscious "show other currencies"
                    exception link. Picking an account still syncs the
                    currency (two-way), and picking a currency snaps the
                    account to the first matching one. This fixes the case
                    where the owner rejected a payment for being in the wrong
                    currency but the accountant had no direct control to
                    switch it. */}
                <div className="border-t pt-3">
                  <div className="text-sm font-semibold mb-2 text-emerald-700 dark:text-emerald-300">
                    {appLang === 'en' ? 'Proposed changes (leave blank to keep the original)' : 'التَّعديلات المُقتَرَحَة (اترُك فارِغاً للإِبقاء كما هو)'}
                  </div>
                  {(() => {
                    // Currency is now the source of truth (from the dropdown).
                    // Order: explicit currency selection → original payment
                    // currency. The account no longer silently drives it.
                    const originalCurrency = String(correctionPayment.original_currency || correctionPayment.currency_code || baseCurrency || 'EGP').toUpperCase()
                    const selectedAcc = correctionFields.account_id
                      ? (accounts.find(a => a.id === correctionFields.account_id) as any)
                      : null
                    const baseCcy = (baseCurrency || 'EGP').toUpperCase()
                    const effectiveCurrency = (
                      correctionFields.original_currency
                      || originalCurrency
                    ).toUpperCase()
                    // Accounts matching the chosen currency (unless the
                    // conscious exception mode is on).
                    const correctionAccounts = showAllCorrectionAccounts
                      ? accounts
                      : accounts.filter((a: any) => accountCurrencyOf(a) === effectiveCurrency)
                    return (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {/* Currency first — the primary driver (matches the
                            supplier-payment form's "العملة" dropdown). */}
                        <div className="md:col-span-2">
                          <Label>{appLang === 'en' ? 'Currency' : 'العملة'}</Label>
                          <select
                            className="w-full border rounded px-2 py-1 bg-white dark:bg-slate-900"
                            value={effectiveCurrency}
                            onChange={(e) => {
                              const v = e.target.value.toUpperCase()
                              // Snap the account to the first one in the new
                              // currency (keep it if it already matches).
                              const keepAcc = selectedAcc && accountCurrencyOf(selectedAcc) === v
                              const firstMatchedId = (accounts.find((a: any) => accountCurrencyOf(a) === v) as any)?.id || ''
                              setShowAllCorrectionAccounts(false)
                              setCorrectionFields({
                                ...correctionFields,
                                original_currency: v,
                                account_id: keepAcc ? correctionFields.account_id : firstMatchedId,
                                // Same-currency = no rate needed; clear the field.
                                exchange_rate: v === baseCcy ? "" : correctionFields.exchange_rate,
                              })
                            }}
                          >
                            {currencies.length > 0 ? (
                              currencies.map((c) => (
                                <option key={c.code} value={c.code}>{c.symbol} {c.code}</option>
                              ))
                            ) : (
                              Object.entries(currencySymbols).map(([code, symbol]) => (
                                <option key={code} value={code}>{symbol} {code}</option>
                              ))
                            )}
                          </select>
                        </div>
                        {/* Account — filtered to the chosen currency. */}
                        <div className="md:col-span-2">
                          <Label>{appLang === 'en' ? 'Account' : 'الحِساب'}</Label>
                          <select
                            className="w-full border rounded px-2 py-1 bg-white dark:bg-slate-900"
                            value={correctionFields.account_id}
                            onChange={(e) => {
                              const accId = e.target.value
                              const acc = accId ? (accounts.find(a => a.id === accId) as any) : null
                              const accCcy = acc ? accountCurrencyOf(acc) : ""
                              setCorrectionFields({
                                ...correctionFields,
                                account_id: accId,
                                // Picking an account syncs the currency to it.
                                original_currency: accCcy || correctionFields.original_currency,
                                // Same-currency = no rate needed; clear the field.
                                exchange_rate: accCcy && accCcy === baseCcy ? "" : correctionFields.exchange_rate,
                              })
                            }}
                          >
                            <option value="">{appLang === 'en' ? `Keep original (${originalCurrency})` : `إِبقاء الأَصلى (${originalCurrency})`}</option>
                            {correctionAccounts.map(a => {
                              const ccy = accountCurrencyOf(a)
                              const ccySuffix = ccy && ccy !== baseCcy ? ` — ${ccy}` : ''
                              return (<option key={a.id} value={a.id}>{a.account_name} ({a.account_code}){ccySuffix}</option>)
                            })}
                          </select>
                          {/* Conscious exception link — reveal accounts in
                              other currencies (mirrors showAllPayAccounts). */}
                          {!showAllCorrectionAccounts && accounts.some((a: any) => accountCurrencyOf(a) !== effectiveCurrency) && (
                            <button type="button" className="text-[11px] text-blue-600 hover:underline mt-0.5" onClick={() => setShowAllCorrectionAccounts(true)}>
                              {appLang === 'en' ? 'Show accounts in other currencies (exception)' : 'إظهار الحسابات بعملات أخرى (استثناء)'}
                            </button>
                          )}
                          {/* Amber mismatch banner: only if the accountant
                              explicitly picked an account whose currency
                              differs from the chosen payment currency. */}
                          {selectedAcc && accountCurrencyOf(selectedAcc) !== effectiveCurrency && (
                            <div className="text-[11px] mt-1 px-2 py-1 rounded bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                              ℹ️ {appLang === 'en'
                                ? `Account currency: ${accountCurrencyOf(selectedAcc)} — different from payment currency (${effectiveCurrency}).`
                                : `عملة الحساب: ${accountCurrencyOf(selectedAcc)} — مختلفة عن عملة الدفع (${effectiveCurrency}).`}
                            </div>
                          )}
                        </div>
                        {/* Amount + currency badge (currency is derived, not a
                            separate dropdown). */}
                        <div>
                          <Label>
                            {appLang === 'en' ? 'Amount' : 'المَبلَغ'}
                            <span className="ms-1 text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold">
                              ({effectiveCurrency})
                            </span>
                          </Label>
                          <Input
                            type="number" step="0.01" min="0"
                            value={correctionFields.amount}
                            onChange={(e) => setCorrectionFields({ ...correctionFields, amount: e.target.value })}
                            placeholder={String(Math.abs(Number(correctionPayment.amount || 0)))}
                          />
                        </div>
                        <div>
                          <Label>{appLang === 'en' ? 'Date' : 'التاريخ'}</Label>
                          <Input type="date" value={correctionFields.payment_date} onChange={(e) => setCorrectionFields({ ...correctionFields, payment_date: e.target.value })} />
                        </div>
                        {/* Method — filter transfer/check for cash accounts,
                            matching the create form's behavior. */}
                        <div>
                          <Label>{appLang === 'en' ? 'Method' : 'طَريقَة الدَّفع'}</Label>
                          <select className="w-full border rounded px-2 py-1 bg-white dark:bg-slate-900" value={correctionFields.payment_method} onChange={(e) => setCorrectionFields({ ...correctionFields, payment_method: e.target.value })}>
                            <option value="cash">{appLang === 'en' ? 'Cash' : 'كاش'}</option>
                            {!isCashAccount(correctionFields.account_id || correctionPayment.account_id || '') && (
                              <>
                                <option value="transfer">{appLang === 'en' ? 'Transfer' : 'تحويل'}</option>
                                <option value="check">{appLang === 'en' ? 'Check' : 'شيك'}</option>
                              </>
                            )}
                          </select>
                        </div>
                        {/* Reference only shows for transfer/check, same as
                            create form. */}
                        {(correctionFields.payment_method === 'transfer' || correctionFields.payment_method === 'check') && (
                          <div>
                            <Label>{appLang === 'en' ? 'Transfer/Check No.' : 'رقم التحويل/الشيك'}</Label>
                            <Input value={correctionFields.reference_number} onChange={(e) => setCorrectionFields({ ...correctionFields, reference_number: e.target.value })} />
                          </div>
                        )}
                        {/* Exchange rate: only when effective currency ≠ base,
                            and via ExchangeRateSelector (API dropdown + manual
                            override), not a raw number input. */}
                        {effectiveCurrency !== baseCcy && (
                          <div className="md:col-span-2">
                            <Label>{appLang === 'en' ? 'Exchange rate' : 'سعر الصرف'}</Label>
                            <ExchangeRateSelector
                              fromCurrency={effectiveCurrency}
                              baseCurrency={baseCcy}
                              value={Number(correctionFields.exchange_rate) || Number(correctionPayment.exchange_rate || 0) || 0}
                              onChange={(v) => setCorrectionFields({ ...correctionFields, exchange_rate: String(v) })}
                              hideLabel
                              showPreview
                              amount={Number(correctionFields.amount) || Math.abs(Number(correctionPayment.amount || 0))}
                            />
                          </div>
                        )}
                        <div className="md:col-span-2">
                          <Label>{appLang === 'en' ? 'Notes' : 'مُلاحَظات'}</Label>
                          <Input value={correctionFields.notes} onChange={(e) => setCorrectionFields({ ...correctionFields, notes: e.target.value })} />
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" disabled={correctionSubmitting} onClick={() => { setCorrectionOpen(false); setCorrectionPayment(null); setShowAllCorrectionAccounts(false) }}>
                {appLang === 'en' ? 'Cancel' : 'إلغاء'}
              </Button>
              <Button disabled={correctionSubmitting || correctionReason.trim().length < 5} onClick={async () => {
                if (!correctionPayment) return
                setCorrectionSubmitting(true)
                try {
                  // Send only fields that differ from original
                  const proposed: Record<string, string | number> = {}
                  const origAmount = Math.abs(Number(correctionPayment.amount || 0))
                  const newAmount = Number(correctionFields.amount)
                  if (Number.isFinite(newAmount) && newAmount > 0 && Math.abs(newAmount - origAmount) > 0.001) proposed.amount = newAmount
                  if (correctionFields.payment_date && correctionFields.payment_date !== correctionPayment.payment_date) proposed.payment_date = correctionFields.payment_date
                  if (correctionFields.account_id && correctionFields.account_id !== correctionPayment.account_id) proposed.account_id = correctionFields.account_id
                  if (correctionFields.payment_method && correctionFields.payment_method !== correctionPayment.payment_method) proposed.payment_method = correctionFields.payment_method
                  if (correctionFields.reference_number !== (correctionPayment.reference_number || '')) proposed.reference_number = correctionFields.reference_number
                  if (correctionFields.notes !== (correctionPayment.notes || '')) proposed.notes = correctionFields.notes
                  // v3.74.524 — currency + FX rate. Main fix for "rejected
                  // base_currency_amount from the new currency/rate pair.
                  const currentCurrency = correctionPayment.original_currency || correctionPayment.currency_code || 'EGP'
                  if (correctionFields.original_currency && correctionFields.original_currency !== currentCurrency) {
                    proposed.original_currency = correctionFields.original_currency
                    if (proposed.amount == null) proposed.amount = origAmount
                  }
                  const newRate = Number(correctionFields.exchange_rate)
                  if (Number.isFinite(newRate) && newRate > 0 && Math.abs(newRate - Number(correctionPayment.exchange_rate || 0)) > 0.0001) {
                    proposed.exchange_rate = newRate
                  }

                  // v3.74.127 / v3.74.144 — route by payment status.
                  // - If the payment was REJECTED before approval, it never posted
                  //   accounting. Use the fast resubmit endpoint that edits the row
                  //   directly and flips it back to pending_approval (no separate
                  //   correction request needed).
                  // - Otherwise (approved/sent/cleared), go through the formal
                  //   correction workflow that produces a documented reversal.
                  const isVendorPayment = Boolean((correctionPayment as any).supplier_id)
                  const isRejectedPayment = String((correctionPayment as any).status || '').toLowerCase() === 'rejected'

                  let correctionEndpoint: string
                  let payload: any
                  if (isVendorPayment && isRejectedPayment) {
                    correctionEndpoint = `/api/payments/${encodeURIComponent(correctionPayment.id)}/resubmit-after-reject`
                    payload = { reason: correctionReason.trim(), changes: proposed }
                  } else if (isVendorPayment) {
                    correctionEndpoint = `/api/payments/${encodeURIComponent(correctionPayment.id)}/vendor-request-correction`
                    payload = { reason: correctionReason.trim(), proposedChanges: proposed }
                  } else {
                    correctionEndpoint = `/api/payments/${encodeURIComponent(correctionPayment.id)}/request-correction`
                    payload = { reason: correctionReason.trim(), proposedChanges: proposed }
                  }

                  const res = await fetch(correctionEndpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                  })
                  const r = await res.json()
                  if (!r.success) {
                    toast({ title: appLang === 'en' ? 'Could not submit' : 'تَعَذَّر الإِرسال', description: r.error || '', variant: 'destructive' })
                    return
                  }
                  toast({
                    title: isRejectedPayment
                      ? (appLang === 'en' ? 'Payment resubmitted' : 'تَمَّ إِعادَة الإِرسال للاعتماد')
                      : (appLang === 'en' ? 'Correction request submitted' : 'تَمَّ إِرسال الطَّلَب'),
                    description: isRejectedPayment
                      ? (appLang === 'en' ? 'The owner and general manager have been notified.' : 'تَمَّ إِشعار المالِك والمُدير العام.')
                      : (appLang === 'en' ? 'Waiting for owner/general manager approval.' : 'يَنتَظِر اعتماد المالِك/المُدير العام.'),
                  })
                  setCorrectionOpen(false)
                  setCorrectionPayment(null)
                } catch (e: any) {
                  toast({ title: appLang === 'en' ? 'Error' : 'خَطَأ', description: String(e?.message || e), variant: 'destructive' })
                } finally {
                  setCorrectionSubmitting(false)
                }
              }}>
                {correctionSubmitting ? (appLang === 'en' ? 'Submitting...' : 'جاري الإرسال...') : (appLang === 'en' ? 'Submit request' : 'إِرسال الطَّلَب')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
      
      <PaymentDetailsModal 
        paymentId={selectedPaymentDetailsId} 
        isOpen={!!selectedPaymentDetailsId} 
        onClose={() => setSelectedPaymentDetailsId(null)} 
        appLang={appLang} 
      />
    </div>
  )
}
