// =====================================================
// 📌 SALES INVOICE COMMAND UI – PHASE 1
// =====================================================
// الواجهة هنا ترسل أوامر فقط.
// جميع الآثار المالية تُنفذ في الـBackend عبر API + RPC ذرية.
// دورة البيع نفسها تبقى:
// Sales Order → Draft Invoice → Post → Warehouse Approval → Payment → Return

"use client"

import { useState, useEffect, useRef, useMemo, useTransition, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NumericInput } from "@/components/ui/numeric-input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { useSupabase } from "@/lib/supabase/hooks"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { DollarSign, CreditCard, Banknote, FileText, CheckCircle, AlertCircle, RotateCcw, Package, Truck, MapPin, Phone, User, ExternalLink, Trash2 } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { getActiveCompanyId } from "@/lib/company"
import { canAction } from "@/lib/authz"
import { useToast } from "@/hooks/use-toast"
import { ToastAction } from "@/components/ui/toast"
import { toastActionError, toastActionSuccess } from "@/lib/notifications"
import { checkInventoryAvailability, getShortageToastContent } from "@/lib/inventory-check"
import { ERPPageHeader } from "@/components/erp-page-header"
import {
  validateShippingProvider
} from "@/lib/third-party-inventory"
import { useRealtimeTable } from "@/hooks/use-realtime-table"
import { useAutoRefresh } from "@/hooks/use-auto-refresh"
import { CustomerRefundDialog } from "@/components/customers/customer-refund-dialog"
import { getActiveCurrencies, type Currency, DEFAULT_CURRENCIES } from "@/lib/currency-service"
import { useAccess } from "@/lib/access-context"
import {
  SALES_RETURN_ACTIVE_REQUEST_STATUSES,
  getSalesReturnRequestStatusLabel,
} from "@/lib/sales-return-requests"
// v3.74.375 — discount approval banner + gate state for invoice posting.
import { InvoiceDiscountApprovalBanner, type InvoiceDiscountGate } from "@/components/invoices/InvoiceDiscountApprovalBanner"
import { BillAmendmentBanner } from "@/components/bills/BillAmendmentBanner"

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
  original_total?: number
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
  approval_status?: string | null
  approval_reason?: string | null
  approved_by?: string | null
  approval_date?: string | null
  rejected_by?: string | null
  rejected_at?: string | null
  warehouse_rejection_reason?: string | null
  warehouse_rejected_at?: string | null
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

type ActiveSalesReturnRequest = {
  id: string
  status: string
}

const APPROVAL_VIEW_ROLES = new Set([
  'owner',
  'admin',
  'general_manager',
  'generalmanager',
  'gm',
  'manager',
  'sales_manager',
  'warehouse_manager',
  'store_manager',
  'super_admin',
  'superadmin',
])

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
  // v3.74.250 — pre-shipment refund dialog state (refund customer's
  // payment when the warehouse hasn't approved dispatch yet).
  const [showPreShipmentRefund, setShowPreShipmentRefund] = useState(false)
  const [preShipmentRefundMode, setPreShipmentRefundMode] = useState<'cancel_invoice' | 'keep_open'>('cancel_invoice')
  const [preShipmentRefundAccountId, setPreShipmentRefundAccountId] = useState<string>('')
  const [preShipmentRefundReason, setPreShipmentRefundReason] = useState<string>('')
  const [preShipmentRefundSaving, setPreShipmentRefundSaving] = useState(false)
  // v3.74.254 — surface the last rejection so the requester can re-submit
  // informed. Loaded when invoice loads; nullable.
  const [lastRejectedRefund, setLastRejectedRefund] = useState<{ id: string; reason: string | null; rejected_at: string } | null>(null)
  // Multi-currency (IAS 21) fields — supports 2 scenarios:
  //  1) Invoice in FC, payment in same FC → FX gain/loss on rate difference
  //  2) Invoice in base, payment in FC → cross-currency receipt with auto-conversion
  const [paymentExchangeRate, setPaymentExchangeRate] = useState<number>(0)
  const [paymentFCAmount, setPaymentFCAmount] = useState<number>(0)
  const [payInDifferentCurrency, setPayInDifferentCurrency] = useState<boolean>(false)
  const [paymentCurrency, setPaymentCurrency] = useState<string>('USD')
  // v3.16.0: Rate source selection (from exchange_rates table, not manual input)
  const [availableRates, setAvailableRates] = useState<Array<{
    id: string
    source: 'api' | 'manual'
    rate: number
    rate_date: string
    label: string
  }>>([])
  const [selectedRateId, setSelectedRateId] = useState<string>('')
  const [loadingRates, setLoadingRates] = useState<boolean>(false)
  const [cashBankAccounts, setCashBankAccounts] = useState<any[]>([])
  const [savingPayment, setSavingPayment] = useState(false)
  // ❌ تم إزالة showCredit و creditDate - استخدم المرتجع الجزئي/الكامل بدلاً من مذكرة الدائن الكاملة

  // Partial return state
  const [showPartialReturn, setShowPartialReturn] = useState(false)
  const [returnItems, setReturnItems] = useState<{ item_id: string; product_id: string | null; product_name: string; max_qty: number; return_qty: number; unit_price: number; tax_rate: number; discount_percent: number }[]>([])
  const [returnMethod, setReturnMethod] = useState<'cash' | 'credit_note' | 'bank_transfer'>('credit_note')
  // v3.74.246 — settlement disbursement account picked by the requester.
  // Required when returnMethod is cash or bank_transfer. Filtered to the
  // user's branch for regular roles, all branches for owner/admin/GM.
  const [returnSettlementAccountId, setReturnSettlementAccountId] = useState<string>('')
  const [returnNotes, setReturnNotes] = useState<string>('')
  const [returnProcessing, setReturnProcessing] = useState(false)
  const [returnDialogMode, setReturnDialogMode] = useState<'partial' | 'full'>('partial')
  const [activeSalesReturnRequest, setActiveSalesReturnRequest] = useState<ActiveSalesReturnRequest | null>(null)
  const [changingStatus, setChangingStatus] = useState(false)
  // v3.74.375 — discount gate state from the banner. "open" means
  // the invoice can be posted; everything else blocks the
  // transition to 'sent'/'posted'.
  const [discountGate, setDiscountGate] = useState<InvoiceDiscountGate>("open")
  const [isPending, startTransition] = useTransition()

  const [nextInvoiceId, setNextInvoiceId] = useState<string | null>(null)
  const [prevInvoiceId, setPrevInvoiceId] = useState<string | null>(null)

  // ── FX auto-calculation: when invoice is in FC and user fills FC amount + rate,
  //    automatically update paymentAmount to (FC × rate) so the API receives
  //    the correct base-currency amount.
  useEffect(() => {
    if (!invoice) return
    const isFCInvoice = !!(invoice.currency_code && invoice.exchange_rate && Number(invoice.exchange_rate) !== 1)
    const isCrossCurrency = !isFCInvoice && payInDifferentCurrency
    if ((isFCInvoice || isCrossCurrency) && paymentFCAmount > 0 && paymentExchangeRate > 0) {
      const computed = Math.round(paymentFCAmount * paymentExchangeRate * 100) / 100
      if (Math.abs(computed - paymentAmount) > 0.005) {
        setPaymentAmount(computed)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentFCAmount, paymentExchangeRate, invoice?.currency_code, invoice?.exchange_rate, payInDifferentCurrency])

  // v3.16.0: Fetch available exchange rates (api + manual) from /settings/exchange-rates
  // Triggered when payment currency changes (FC invoice currency or cross-currency selection)
  useEffect(() => {
    if (!invoice || !showPayment) return
    const isFCInvoice = !!(invoice.currency_code && invoice.exchange_rate && Number(invoice.exchange_rate) !== 1)
    const fcCurrency = isFCInvoice
      ? String(invoice.currency_code || '').toUpperCase()
      : (payInDifferentCurrency ? paymentCurrency.toUpperCase() : '')
    if (!fcCurrency || fcCurrency === appCurrency.toUpperCase()) {
      setAvailableRates([])
      setSelectedRateId('')
      return
    }
    let cancelled = false
    ;(async () => {
      setLoadingRates(true)
      try {
        const { data, error } = await supabase
          .from('exchange_rates')
          .select('id, rate, rate_date, source')
          .eq('from_currency', fcCurrency)
          .eq('to_currency', appCurrency.toUpperCase())
          .order('rate_date', { ascending: false })
          .limit(50)
        if (error) throw error
        if (cancelled) return
        // Get latest rate per source (api + manual)
        const seenSources = new Set<string>()
        const latestPerSource: typeof availableRates = []
        for (const row of (data || [])) {
          const src = String((row as any).source || 'api') as 'api' | 'manual'
          if (seenSources.has(src)) continue
          seenSources.add(src)
          latestPerSource.push({
            id: (row as any).id,
            source: src,
            rate: Number((row as any).rate),
            rate_date: (row as any).rate_date,
            label: `${src === 'manual' ? '✋ يدوى' : '🔄 لحظى (API)'} — ${Number((row as any).rate).toFixed(4)} (${(row as any).rate_date})`,
          })
        }
        setAvailableRates(latestPerSource)
        // Auto-select the API rate by default (the user can switch to manual)
        const def = latestPerSource.find(r => r.source === 'api') || latestPerSource[0]
        if (def) {
          setSelectedRateId(def.id)
          setPaymentExchangeRate(def.rate)
        } else {
          setSelectedRateId('')
          setPaymentExchangeRate(0)
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load exchange rates:', err)
          setAvailableRates([])
          setSelectedRateId('')
          setPaymentExchangeRate(0)
        }
      } finally {
        if (!cancelled) setLoadingRates(false)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPayment, invoice?.currency_code, paymentCurrency, payInDifferentCurrency, appCurrency])

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
  // v3.74.303 — Latest events on the shipment so we can render a
  // mini-timeline inline on the invoice page (no page hop needed).
  const [shipmentStatusLogs, setShipmentStatusLogs] = useState<any[]>([])
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
  // v3.74.88: credit-applied entries from customer_credit_ledger (source_type='credit_applied')
  // We track them separately so the payments table can show them as a distinct row type,
  // but they DO count toward totalPaidAmount because invoice.paid_amount already includes them.
  const [creditApplications, setCreditApplications] = useState<any[]>([])
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
  const [approvalActorNames, setApprovalActorNames] = useState<Record<string, string>>({})
  const { profile: accessProfile, canAccessBranch } = useAccess()
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
  const invoiceApprovalStatus = useMemo(() => {
    const explicitStatus = String(invoice?.approval_status || '').toLowerCase()
    const warehouseStatus = String(invoice?.warehouse_status || '').toLowerCase()

    if (explicitStatus === 'approved' || warehouseStatus === 'approved') return 'approved'
    if (explicitStatus === 'rejected' || warehouseStatus === 'rejected') return 'rejected'
    if (explicitStatus === 'pending' || warehouseStatus === 'pending') return 'pending'

    return explicitStatus || warehouseStatus || 'pending'
  }, [invoice?.approval_status, invoice?.warehouse_status])
  const canSeeApprovalDetails = useMemo(() => {
    const role = String(currentUserRole || '').toLowerCase()
    const allowedActions = accessProfile?.allowed_actions || []
    const invoiceBranchId = invoice?.branch_id || null
    return APPROVAL_VIEW_ROLES.has(role) ||
      allowedActions.includes('*') ||
      allowedActions.includes('invoices:approve') ||
      (!!invoiceBranchId && canAccessBranch(invoiceBranchId))
  }, [accessProfile?.allowed_actions, canAccessBranch, currentUserRole, invoice?.branch_id])
  const approvalDecisionActorId = useMemo(() => {
    if (!invoice) return null
    if (invoiceApprovalStatus === 'approved') return invoice.approved_by || null
    if (invoiceApprovalStatus === 'rejected') return invoice.rejected_by || null
    return null
  }, [invoice, invoiceApprovalStatus])
  const approvalDecisionActorName = approvalDecisionActorId
    ? approvalActorNames[approvalDecisionActorId] || approvalDecisionActorId.slice(0, 8)
    : '-'
  const approvalDecisionDate = invoiceApprovalStatus === 'approved'
    ? (invoice?.approval_date || null)
    : invoiceApprovalStatus === 'rejected'
      ? (invoice?.rejected_at || invoice?.approval_date || invoice?.warehouse_rejected_at || null)
      : null
  const approvalReasonText = invoice?.approval_reason || invoice?.warehouse_rejection_reason || null
  const returnableInvoiceItems = useMemo(() => (
    items
      .map((it) => ({
        ...it,
        max_qty: Math.max(0, it.quantity - (it.returned_quantity || 0)),
      }))
      .filter((it) => it.max_qty > 0)
  ), [items])
  const canShowReturnButtons = useMemo(() => (
    !!invoice &&
    invoice.status !== "cancelled" &&
    invoice.status !== "draft" &&
    invoice.status !== "invoiced" &&
    invoice.status !== "voided" &&
    invoice.status !== "fully_returned" &&
    returnableInvoiceItems.length > 0 &&
    invoiceApprovalStatus === 'approved' &&
    !activeSalesReturnRequest
  ), [activeSalesReturnRequest, invoice, invoiceApprovalStatus, returnableInvoiceItems])
  const canShowPartialReturnButton = useMemo(() => (
    canShowReturnButtons &&
    returnableInvoiceItems.length === 1 &&
    returnableInvoiceItems[0].max_qty > 1
  ), [canShowReturnButtons, returnableInvoiceItems])
  const activeSalesReturnRequestLabel = activeSalesReturnRequest
    ? getSalesReturnRequestStatusLabel(activeSalesReturnRequest.status, appLang)
    : null

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
    ; (async () => {
      try {
        const actorIds = Array.from(
          new Set([invoice?.approved_by, invoice?.rejected_by].filter(Boolean))
        ) as string[]

        if (actorIds.length === 0) {
          setApprovalActorNames({})
          return
        }

        const { data: profiles } = await supabase
          .from("user_profiles")
          .select("user_id, display_name, username")
          .in("user_id", actorIds)

        const nextMap: Record<string, string> = {}
        ; (profiles || []).forEach((profile: { user_id: string; display_name?: string | null; username?: string | null }) => {
          nextMap[profile.user_id] = profile.display_name || profile.username || profile.user_id.slice(0, 8)
        })

        actorIds.forEach((userId) => {
          if (!nextMap[userId]) {
            nextMap[userId] = userId.slice(0, 8)
          }
        })

        setApprovalActorNames(nextMap)
      } catch (error) {
        console.warn("Failed to load approval actor profiles:", error)
        setApprovalActorNames({})
      }
    })()
  }, [invoice?.approved_by, invoice?.rejected_by, supabase])

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
          // v3.74.214 — pull original_currency so the Record-Payment dialog
          // can filter accounts by the chosen payment currency (same pattern
          // as v3.74.200 in the customer-refund dialog).
          .select("id, account_code, account_name, account_type, sub_type, branch_id, original_currency")
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
        // v3.74.306 — لا نختار حساب افتراضياً.
        // المستخدم لازم يختار الحساب بنفسه. الـ auto-default القديم كان
        // بيخلى المستخدم يقفل النافذة وهو فاكر إنه ما اختارش حساب، فالدفعة
        // كانت بتروح على أول حساب بنكى (حتى لو دولارى والفاتورة بالجنيه).
        // الزرار disabled لحد ما المستخدم يختار، فالحقل الفاضى أأمن.
      } catch (e) {
        /* ignore */
      }
    })()
  }, [showPayment])

  // v3.74.250 — load filtered cash/bank accounts the moment the
  // pre-shipment refund dialog opens, so the disbursement dropdown has
  // data without depending on the payment or return dialog being opened first.
  useEffect(() => {
    ; (async () => {
      if (!showPreShipmentRefund || !invoice?.company_id) return
      try {
        const { data: accounts } = await supabase
          .from("chart_of_accounts")
          .select("id, account_code, account_name, account_type, sub_type, branch_id, original_currency")
          .eq("company_id", invoice.company_id)
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
      } catch (e) { /* ignore */ }
    })()
  }, [showPreShipmentRefund, invoice?.company_id, isPrivilegedUser, userBranchId])

    // v3.74.246 — load branch-filtered cash/bank accounts the moment the
  // return dialog opens, so the settlement dropdown has data even if the
  // user never opened the payment dialog first. Same filtering rule as
  // the payment loader: regulars see only their branch, owner/admin/GM
  // see the whole company.
  useEffect(() => {
    ; (async () => {
      if (!showPartialReturn || !invoice?.company_id) return
      try {
        const { data: accounts } = await supabase
          .from("chart_of_accounts")
          .select("id, account_code, account_name, account_type, sub_type, branch_id, original_currency")
          .eq("company_id", invoice.company_id)
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
        }).map((a: any) => {
          // Normalize sub_type so the dialog's cash/bank split filter
          // works even on rows that only matched by Arabic name pattern.
          const st = String(a.sub_type || "").toLowerCase()
          if (st === 'cash' || st === 'bank') return a
          const nm = String(a.account_name || "")
          const nmLower = nm.toLowerCase()
          const inferred = nmLower.includes('bank') || /بنك|بنكي|مصرف/.test(nm) ? 'bank' : 'cash'
          return { ...a, sub_type: inferred }
        })
        setCashBankAccounts(list)
      } catch (e) {
        /* ignore — the dialog will show "no accounts" message */
      }
    })()
  }, [showPartialReturn, invoice?.company_id, isPrivilegedUser, userBranchId])

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

  // v3.74.58 — تَحديث تِلقائى عِندَ العَودَة للنّافِذَة/التَّبويب
  useAutoRefresh({ onRefresh: () => loadInvoice() })

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
        // v3.74.254 — load the most-recent rejected refund_request for
        // this invoice (if any) to power the "rejected — see reason"
        // banner on the action area.
        try {
          const { data: lastRej } = await supabase
            .from('customer_refund_requests')
            .select('id, rejection_reason, rejected_at')
            .eq('source_type', 'pre_shipment')
            .eq('invoice_id', invoiceId)
            .eq('status', 'rejected')
            .order('rejected_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          if (lastRej) {
            setLastRejectedRefund({ id: (lastRej as any).id, reason: (lastRej as any).rejection_reason, rejected_at: (lastRej as any).rejected_at })
          } else {
            setLastRejectedRefund(null)
          }
        } catch { /* ignore */ }
        
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

        // Load linked sales order if exists.
        // v3.74.10 — use maybeSingle so we don't get a console 406 when the
        // SO row is hidden by RLS for this user (e.g. accountant viewing an
        // invoice whose linked SO is in another branch). 0 rows is fine here.
        if (invoiceData.sales_order_id) {
          const { data: soData } = await supabase
            .from("sales_orders")
            .select("id, so_number")
            .eq("id", invoiceData.sales_order_id)
            .maybeSingle()
          if (soData) {
            setLinkedSalesOrder(soData)
          } else {
            setLinkedSalesOrder(null)
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

        try {
          const { data: requestData } = await supabase
            .from("sales_return_requests")
            .select("id, status, created_at")
            .eq("company_id", invoiceData.company_id)
            .eq("invoice_id", invoiceId)
            .in("status", SALES_RETURN_ACTIVE_REQUEST_STATUSES as unknown as string[])
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()

          setActiveSalesReturnRequest(requestData
            ? { id: String(requestData.id), status: String(requestData.status || "") }
            : null)
        } catch (requestError) {
          console.warn("Failed to load active sales return request:", requestError)
          setActiveSalesReturnRequest(null)
        }

        // Load payments for this invoice
        const { data: paymentsData } = await supabase
          .from("payments")
          .select("*")
          .eq("invoice_id", invoiceId)
          .order("payment_date", { ascending: false })
        setInvoicePayments(paymentsData || [])

        // v3.74.88: load credit applications for this invoice so the cards
        // and payments table reflect them.
        //
        // v3.74.206 — since v3.74.102 (RPC apply_customer_credit_to_invoice)
        // ALSO writes a row in `payments` with payment_method='customer_credit',
        // so the application appeared twice in the payments table: once as
        // a payment row and once as a customer_credit_ledger row. Filter the
        // ledger entries to exclude any whose journal_entry_id already shows
        // up on a payment row, keeping legacy pre-v3.74.102 entries (ledger
        // only) but suppressing the new duplicates.
        try {
          const { data: creditAppsData } = await supabase
            .from("customer_credit_ledger")
            .select("id, amount, created_at, description, journal_entry_id")
            .eq("source_id", invoiceId)
            .eq("source_type", "credit_applied")
            .order("created_at", { ascending: false })
          const paymentJeIds = new Set(
            (paymentsData || []).map((p: any) => p.journal_entry_id).filter(Boolean)
          )
          const deduped = (creditAppsData || []).filter(
            (ca: any) => !ca.journal_entry_id || !paymentJeIds.has(ca.journal_entry_id)
          )
          setCreditApplications(deduped)
        } catch {
          setCreditApplications([])
        }

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

        // v3.74.303 — Pull the most recent status log entries so the
        // mini-timeline on the invoice has something to show. Limited
        // to 5 — the full history lives on /inventory/third-party.
        if (shipmentData?.id) {
          const { data: logs } = await supabase
            .from("shipment_status_logs")
            .select("internal_status, provider_status, location, notes, created_at")
            .eq("shipment_id", shipmentData.id)
            .order("created_at", { ascending: false })
            .limit(5)
          setShipmentStatusLogs(logs || [])
        } else {
          setShipmentStatusLogs([])
        }

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

  // v3.74.406 — soft-cancel via /api/invoices/[id]/void. The cascade
  // (status=voided, discount approvals cancelled, sales_order
  // unlinked, audit log) lives in void_invoice_atomic.
  const handleVoid = async () => {
    if (!invoice) return
    try {
      const response = await fetch(`/api/invoices/${encodeURIComponent(invoice.id)}/void`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": globalThis.crypto?.randomUUID?.() || `invoice-void-${invoice.id}`,
        },
        body: JSON.stringify({ reason: "" }),
      })
      const result = await response.json().catch(() => ({})) as { success?: boolean; error?: string }
      if (!response.ok || !result.success) {
        throw new Error(result.error || (appLang === 'en' ? 'Failed to void invoice' : 'فشل إلغاء الفاتورة'))
      }
      toastActionSuccess(toast, appLang === 'en' ? "Void" : "الإلغاء", appLang === 'en' ? "Invoice" : "الفاتورة")
      router.push('/invoices')
    } catch (err: any) {
      const msg = typeof err?.message === 'string' ? err.message : (appLang === 'en' ? 'Unexpected error' : 'حدث خطأ غير متوقع')
      toastActionError(toast, appLang === 'en' ? "Void" : "الإلغاء", appLang === 'en' ? "Invoice" : "الفاتورة", msg)
      console.error("Error voiding invoice:", err)
    }
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

          // v3.74.375 — Discount approval gate. The DB trigger blocks
          // this anyway, but stopping early gives a friendlier toast
          // and avoids the unnecessary inventory + period checks.
          if (discountGate !== "open") {
            startTransition(() => { setChangingStatus(false) })
            const msg = discountGate === "blocked_pending"
              ? (appLang === 'en'
                  ? "Discount is awaiting GM / owner approval. Posting is blocked."
                  : "الخصم في انتظار اعتماد المدير العام / المالك. لا يمكن الترحيل قبل الاعتماد.")
              : discountGate === "blocked_rejected"
                ? (appLang === 'en'
                    ? "Discount was rejected. Edit or remove the discount to proceed."
                    : "تم رفض الخصم. عدّل قيمة الخصم أو ألغِه للمتابعة.")
                : (appLang === 'en'
                    ? "Discount needs approval. Save the invoice again to submit a request."
                    : "الخصم يحتاج اعتماد. احفظ الفاتورة مرة أخرى لإرسال الطلب.")
            toast({
              variant: "destructive",
              title: appLang === 'en' ? "Discount approval required" : "❌ يلزم اعتماد الخصم",
              description: msg,
              duration: 8000,
            })
            return
          }

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

        if (newStatus === "sent" && invoice) {
          console.log("📌 Sending invoice through backend posting flow...")
          await deductInventoryOnly()

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
            }
          }

          const { data: { user } } = await supabase.auth.getUser()
          if (user?.id && invoice.company_id) {
            await supabase.from("audit_logs").insert({
              company_id: invoice.company_id,
              user_id: user.id,
              action: "UPDATE",
              target_table: "invoices",
              record_id: invoiceId,
              record_identifier: invoice.invoice_number,
              old_data: { status: invoice.status },
              new_data: {
                status: "sent",
                warehouse_status: "pending",
                approval_status: "pending",
                approval_reason: null,
                approved_by: null,
                approval_date: null,
                rejected_by: null,
                rejected_at: null,
                shipping_provider_id: invoice.shipping_provider_id,
                total_amount: invoice.total_amount
              }
            })
          }

          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('invoice_status_changed', {
              detail: { invoiceId, newStatus: 'sent' }
            }))
          }

          startTransition(() => {
            loadInvoice()
            setChangingStatus(false)
          })
          toastActionSuccess(toast, "التحديث", "الفاتورة")
          return
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
          if (newStatus === "paid" || newStatus === "partially_paid") {
            console.log("ℹ️ Payment status must be driven by the backend payment API. Skipping client-side accounting logic.")
          } else if (newStatus === "draft" || newStatus === "cancelled") {
            throw new Error(appLang === 'en'
              ? 'Invoice reversal must be executed through a backend command service.'
              : 'عكس الفاتورة يجب أن يتم عبر أمر خلفي فقط.')
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

  // ===== 📌 ملاحظة: لا قيد COGS في النظام =====
  // حسب النمط المطلوب (Cash Basis): لا COGS في القيود المحاسبية
  // COGS يُحسب فقط للتقارير الإدارية (خارج القيود)

  // ❌ تم إزالة issueFullCreditNote - استخدم المرتجع الجزئي/الكامل من صفحة الفواتير بدلاً منه
  // السبب: المرتجع الجزئي/الكامل يدعم FIFO, COGS, التالف، وينشئ سجلات sales_returns

  // Open sales return dialog (partial/full)
  const openReturnDialog = (mode: 'partial' | 'full' = 'partial') => {
    if (!invoice || !items.length) return
    if (activeSalesReturnRequest) {
      toastActionError(
        toast,
        appLang === 'en' ? 'Return Request' : 'طلب المرتجع',
        appLang === 'en' ? 'Invoice' : 'الفاتورة',
        appLang === 'en'
          ? `There is already an active return request for this invoice: ${getSalesReturnRequestStatusLabel(activeSalesReturnRequest.status, 'en')}`
          : `يوجد بالفعل طلب مرتجع نشط لهذه الفاتورة: ${getSalesReturnRequestStatusLabel(activeSalesReturnRequest.status, 'ar')}`
      )
      return
    }
    const returnableItems = items.map(it => ({
      item_id: it.id,
      product_id: it.product_id || null,
      product_name: it.products?.name || '—',
      max_qty: it.quantity - (it.returned_quantity || 0),
      return_qty: mode === 'full' ? Math.max(0, it.quantity - (it.returned_quantity || 0)) : 0,
      unit_price: it.unit_price,
      tax_rate: it.tax_rate || 0,
      discount_percent: it.discount_percent || 0
    })).filter(it => it.max_qty > 0)
    setReturnDialogMode(mode)
    setReturnItems(returnableItems)
    setReturnMethod('credit_note')
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
  // v3.74.250 — submit pre-shipment refund.
  const submitPreShipmentRefund = async () => {
    if (!invoice) return
    if (!preShipmentRefundAccountId) {
      toastActionError(
        toast,
        appLang === 'en' ? 'Pre-shipment refund' : 'استرداد قبل الشحن',
        appLang === 'en' ? 'Invoice' : 'الفاتورة',
        appLang === 'en' ? 'Select the cash drawer / bank account to refund from.' : 'يرجى اختيار حساب الصرف الذى ستخرج منه الفلوس.'
      )
      return
    }
    setPreShipmentRefundSaving(true)
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/pre-shipment-refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settlement_account_id: preShipmentRefundAccountId,
          mode: preShipmentRefundMode,
          reason: preShipmentRefundReason || null,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.error || (appLang === 'en' ? 'Refund failed' : 'فشل الاسترداد'))
      }
      // v3.74.253 — the API returns executed=true for owner/GM and
      // executed=false (pending_approval=true) for everyone else. Show
      // the right toast so a regular user knows their request is queued.
      if (json.pending_approval) {
        toastActionSuccess(
          toast,
          appLang === 'en' ? 'Refund request' : 'طلب الاسترداد',
          appLang === 'en'
            ? 'Submitted for owner / general manager approval. The refund will only post once approved.'
            : 'تم إرسال طلب الاسترداد لاعتماد المالك / المدير العام. لن يتم تنفيذ القيد إلا بعد الاعتماد.'
        )
      } else {
        toastActionSuccess(
          toast,
          appLang === 'en' ? 'Pre-shipment refund' : 'استرداد قبل الشحن',
          appLang === 'en'
            ? `Refunded ${Number(json.data?.refundedAmount || 0).toLocaleString()} ${preShipmentRefundMode === 'cancel_invoice' ? '— invoice cancelled.' : '— invoice kept open.'}`
            : `تم استرداد ${Number(json.data?.refundedAmount || 0).toLocaleString()} ${preShipmentRefundMode === 'cancel_invoice' ? '— تم إلغاء الفاتورة.' : '— الفاتورة باقية مفتوحة.'}`
        )
      }
      setShowPreShipmentRefund(false)
      await loadInvoice()
    } catch (e: any) {
      toastActionError(
        toast,
        appLang === 'en' ? 'Pre-shipment refund' : 'استرداد قبل الشحن',
        appLang === 'en' ? 'Invoice' : 'الفاتورة',
        e?.message || (appLang === 'en' ? 'Unexpected error' : 'خطأ غير متوقع')
      )
    } finally {
      setPreShipmentRefundSaving(false)
    }
  }

  const processPartialReturn = async () => {
    if (!invoice || returnTotal <= 0) return
    try {
      setReturnProcessing(true)

      if (activeSalesReturnRequest) {
        toastActionError(
          toast,
          appLang === 'en' ? 'Return Request' : 'طلب المرتجع',
          appLang === 'en' ? 'Invoice' : 'الفاتورة',
          appLang === 'en'
            ? `There is already an active return request for this invoice: ${getSalesReturnRequestStatusLabel(activeSalesReturnRequest.status, 'en')}`
            : `يوجد بالفعل طلب مرتجع نشط لهذه الفاتورة: ${getSalesReturnRequestStatusLabel(activeSalesReturnRequest.status, 'ar')}`
        )
        return
      }

      const validation = await import("@/lib/validation")
      if (!validation.canReturnInvoice(invoice.status)) {
        const error = validation.getInvoiceOperationError(invoice.status, 'return', appLang as 'en' | 'ar')
        if (error) {
          toastActionError(toast, appLang === 'en' ? 'Return Request' : 'طلب المرتجع', appLang === 'en' ? 'Invoice' : 'الفاتورة', error.description)
        }
        return
      }

      const requestItems = returnItems
        .filter((item) => item.return_qty > 0)
        .map((item) => {
          const originalItem = items.find((invoiceItem) => invoiceItem.id === item.item_id)
          return {
            id: item.item_id,
            product_id: item.product_id,
            name: item.product_name,
            quantity: Number(originalItem?.quantity || item.max_qty),
            maxQty: item.max_qty,
            qtyToReturn: item.return_qty,
            qtyCreditOnly: 0,
            cost_price: Number(originalItem?.products?.cost_price || 0),
            unit_price: item.unit_price,
            tax_rate: item.tax_rate || 0,
            discount_percent: item.discount_percent || 0,
            line_total: Number(originalItem?.line_total || (item.max_qty * item.unit_price)),
          }
        })

      if (requestItems.length === 0) {
        toastActionError(
          toast,
          appLang === 'en' ? 'Return Request' : 'طلب المرتجع',
          appLang === 'en' ? 'Invoice' : 'الفاتورة',
          appLang === 'en'
            ? 'Select at least one quantity before submitting the return request.'
            : 'اختر كمية واحدة على الأقل قبل إرسال طلب المرتجع.'
        )
        return
      }

      // v3.74.246 — the settlement preference + disbursement account are
      // only meaningful when there is actual paid money to refund. For
      // an unpaid invoice (no money in), the form hides the controls and
      // we send null so the request execution path treats it as a pure
      // inventory/revenue reversal with no payment movement.
      const hasPaidAmount = Number((invoice as any)?.paid_amount || 0) > 0
      const isCashOrBank = (returnMethod === 'cash' || returnMethod === 'bank_transfer')
      if (hasPaidAmount && isCashOrBank && !returnSettlementAccountId) {
        toastActionError(
          toast,
          appLang === 'en' ? 'Return Request' : 'طلب المرتجع',
          appLang === 'en' ? 'Invoice' : 'الفاتورة',
          appLang === 'en'
            ? `Select the ${returnMethod === 'cash' ? 'cash' : 'bank'} account to refund from.`
            : `يرجى اختيار ${returnMethod === 'cash' ? 'حساب الخزينة' : 'الحساب البنكى'} الذى سيتم الصرف منه.`
        )
        return
      }
      const response = await fetch("/api/sales-return-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_id: invoice.id,
          return_type: returnDialogMode,
          items: requestItems,
          total_return_amount: returnTotal,
          notes: returnNotes || (
            returnDialogMode === 'full'
              ? (appLang === 'en' ? 'Full sales return request' : 'طلب مرتجع مبيعات كامل')
              : (appLang === 'en' ? 'Partial sales return request' : 'طلب مرتجع مبيعات جزئي')
          ),
          // v3.74.246 — capture settlement preference + account so the
          // executor refunds from the right drawer.
          settlement_method: hasPaidAmount ? returnMethod : null,
          settlement_account_id: hasPaidAmount && isCashOrBank ? returnSettlementAccountId : null,
        }),
      })

      const requestResult = await response.json()
      if (!response.ok || !requestResult.success) {
        throw new Error(requestResult.error || (appLang === 'en' ? 'Failed to submit return request' : 'فشل إرسال طلب المرتجع'))
      }

      setActiveSalesReturnRequest({
        id: String(requestResult.data?.id || ''),
        status: String(requestResult.data?.status || 'pending_approval_level_1'),
      })

      toastActionSuccess(
        toast,
        appLang === 'en' ? 'Return Request' : 'طلب المرتجع',
        appLang === 'en'
          ? 'Return request submitted successfully and is now awaiting approvals'
          : 'تم إرسال طلب المرتجع بنجاح وهو الآن بانتظار الاعتمادات'
      )
      setShowPartialReturn(false)
      setReturnItems([])
      setReturnNotes('')
      await loadInvoice()
      return

      /* Legacy direct-execution path kept temporarily for reference only.
         It is intentionally disabled after introducing the multi-level
         approval workflow for sales returns.

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
          reason: returnNotes || (
            returnDialogMode === 'full'
              ? (appLang === 'en' ? 'Full return' : 'مرتجع كامل')
              : (appLang === 'en' ? 'Partial return' : 'مرتجع جزئي')
          ),
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
      */
    } catch (err: any) {
      console.error("Error processing sales return:", err)
      toastActionError(toast, appLang === 'en' ? 'Return' : 'المرتجع', appLang === 'en' ? 'Invoice' : 'الفاتورة', err?.message || '')
    } finally {
      setReturnProcessing(false)
    }
  }

  // ===== 📌 recordInvoicePayment: Backend-only Atomic Payment =====
  // الواجهة ترسل الطلب فقط. جميع القيود والتحديثات المالية تنفذ في الخادم.
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
          // Multi-currency (IAS 21) — supports 2 scenarios:
          // 1) FC invoice (currency matches invoice): records FX gain/loss on rate diff
          // 2) Cross-currency receipt (invoice in base, customer pays in FC):
          //    converts to base; excess becomes customer credit
          exchangeRate: paymentExchangeRate > 0 ? paymentExchangeRate : null,
          originalCurrencyAmount: paymentFCAmount > 0 ? paymentFCAmount : null,
          // v3.14.0: explicitly identify the payment currency when it differs from invoice
          paymentCurrency: paymentFCAmount > 0
            ? (invoice.currency_code && Number(invoice.exchange_rate) !== 1
                ? invoice.currency_code
                : (payInDifferentCurrency ? paymentCurrency : null))
            : null,
          // v3.74.219 — forward the exchange rate selector's metadata so the
          // payment row stores rate_source ('manual' vs 'api') and the
          // exchange_rate_id link. Without these the row used to default to
          // rate_source='api' even when the accountant picked a manual rate.
          exchangeRateId: paymentFCAmount > 0 ? (selectedRateId || null) : null,
          rateSource: paymentFCAmount > 0
            ? (availableRates.find(r => r.id === selectedRateId)?.source || null)
            : null,
        }),
      })

      const atomicResult = await atomicRes.json()

      if (!atomicRes.ok || !atomicResult.success) {
        // v3.74.9 — friendly handling for the "closed/missing accounting period"
        // case: show a toast with a CTA that jumps to /accounting/periods
        // instead of a generic alert with the raw English DB message.
        if (atomicResult?.code === "ERR_PERIOD_CLOSED") {
          toast({
            title: "الفترة المحاسبية غير مفتوحة",
            description:
              atomicResult.error ||
              "لا توجد فترة محاسبية مفتوحة تغطى تاريخ هذه الدفعة. الرجاء فتحها من صفحة الفترات المحاسبية.",
            variant: "destructive",
            action: (
              <ToastAction
                altText="فتح صفحة الفترات المحاسبية"
                onClick={() => router.push("/accounting/periods")}
              >
                فتح الفترة
              </ToastAction>
            ),
          })
          return
        }
        const errMsg = atomicResult?.error || "فشل تسجيل الدفعة"
        throw new Error(errMsg)
      }

      // v3.74.11 — bonus calculation moved to the server side.
      // SalesInvoicePaymentCommandService now triggers the shared
      // bonus-calculator service automatically the moment the invoice
      // transitions to "paid", using the admin client. This means the
      // bonus is correctly attributed to the salesperson on the sales
      // order regardless of which user (accountant, store manager, etc.)
      // pressed "Record Payment". The /api/bonuses endpoint still exists
      // for manual recalculation from the bonuses page.

      await loadInvoice()
      setShowPayment(false)
      setPaymentAccountId("")
      toast({ title: "تم تسجيل الدفعة بنجاح", description: "تم تنفيذ التحصيل ذرياً من خلال الخادم" })
    } catch (err: any) {
      console.error("خطأ أثناء تسجيل الدفعة:", err)
      const errMsg = err?.message || err?.error_description || "تعذر تسجيل الدفعة"
      toast({ title: "خطأ", description: errMsg, variant: "destructive" })
    } finally {
      setSavingPayment(false)
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
  // v3.10.0: استخدم base_currency_amount لو موجود (للدفعات بعملات أجنبية)
  // v3.74.88: credit applications are paid-amount too — they post the same
  // journal entry as a real payment (Dr customer credit / Cr AR) and bump
  // invoice.paid_amount. So sum them in here.
  const totalPaymentsFromTable = invoicePayments.reduce((sum, p) => {
    const amt = Number(p.base_currency_amount ?? p.amount ?? 0)
    return sum + (amt > 0 ? amt : 0)
  }, 0)
  const totalCreditApplied = creditApplications.reduce((sum, c) => {
    // customer_credit_ledger stores credit_applied with NEGATIVE amount
    // (customer's credit balance went down). The amount applied to the
    // invoice is the absolute value.
    return sum + Math.abs(Number(c.amount || 0))
  }, 0)
  const totalPaidAmount = totalPaymentsFromTable + totalCreditApplied
  const totalRefundedToCustomer = invoicePayments.reduce((sum, p) => {
    const amt = Number(p.base_currency_amount ?? p.amount ?? 0)
    return sum + (amt < 0 ? Math.abs(amt) : 0)
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
          {/* v3.74.375 — discount approval banner. Only renders when
              the invoice is in draft with a non-zero discount; on
              posted invoices and undiscounted ones it returns null
              and adds zero layout weight. Sits above the header so
              the user sees the blocker before any post action. */}
          <InvoiceDiscountApprovalBanner
            invoiceId={invoiceId}
            lang={appLang as "ar" | "en"}
            onGateChange={setDiscountGate}
          />
          {/* v3.74.462 — amendment banner. Reuses the BillAmendmentBanner
              component with kind="invoice" so bill and invoice views
              stay in sync. */}
          <BillAmendmentBanner
            documentId={invoiceId}
            kind="invoice"
            lang={appLang as "ar" | "en"}
          />
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
                {(() => {
                  const paidAmount = Number(invoice.paid_amount || 0)
                  const returnedAmount = Number(invoice.returned_amount || 0)
                  const originalTotal = Number(invoice.original_total || invoice.total_amount || 0)
                  const isFullyReturned = returnedAmount >= originalTotal && originalTotal > 0

                  let actualStatus: string
                  if (invoice.status === 'draft' || invoice.status === 'invoiced') {
                    actualStatus = 'draft'
                  } else if (invoice.status === 'cancelled' || invoice.status === 'voided') {
                    actualStatus = 'cancelled'
                  } else if (isFullyReturned) {
                    actualStatus = 'fully_returned'
                  } else if (returnedAmount > 0 && returnedAmount < originalTotal && originalTotal > 0) {
                    actualStatus = 'partially_returned'
                  } else if (originalTotal > 0 && paidAmount >= originalTotal) {
                    actualStatus = 'paid'
                  } else if (originalTotal > 0 && paidAmount > 0 && paidAmount < originalTotal) {
                    actualStatus = 'partially_paid'
                  } else if (originalTotal > 0 && paidAmount === 0 && returnedAmount === 0) {
                    actualStatus = 'sent'
                  } else {
                    actualStatus = invoice.status || 'draft'
                  }

                  const isPaid = paidAmount > 0;
                  const isReturned = returnedAmount > 0;
                  const isWarehouseApproved = (invoice.approval_status || invoice.warehouse_status) === 'approved';
                  const isCancelled = actualStatus === 'cancelled';
                  const isSent = actualStatus === 'sent';
                  
                  const canEditInvoice = permUpdate && !isPaid && !isReturned && !isWarehouseApproved && !isCancelled && !isSent;

                  if (canEditInvoice) {
                    return (
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/invoices/${invoice.id}/edit`}>
                          {appLang === 'en' ? 'Edit' : 'تعديل'}
                        </Link>
                      </Button>
                    );
                  }
                  return null;
                })()}

                {/* Print Button */}
                <Button onClick={handlePrint} variant="outline" size="sm" data-ai-help="invoices.print_button">
                  {appLang === 'en' ? 'Print' : 'طباعة'}
                </Button>

                {/* Download PDF Button */}
                <Button onClick={handleDownloadPDF} variant="outline" size="sm" data-ai-help="invoices.download_pdf_button">
                  {appLang === 'en' ? 'Download PDF' : 'تنزيل PDF'}
                </Button>

                {/* v3.74.406 - Void button (mirrors bills/[id]/page.tsx).
                    Draft only + no payments / JE / inventory tx. The full
                    cascade lives in void_invoice_atomic. */}
                {invoice.status === 'draft' && permDelete && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm">
                        <Trash2 className="w-4 h-4 sm:mr-1" />
                        <span className="hidden sm:inline">{appLang === 'en' ? 'Void' : 'إلغاء'}</span>
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{appLang === 'en' ? 'Confirm Void Invoice' : 'تأكيد إلغاء الفاتورة'}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {appLang === 'en'
                            ? 'The invoice will be marked as voided (kept in the audit trail). The linked sales order will be unlinked so a new invoice can be issued.'
                            : 'سيتم وضع الفاتورة فى حالة "ملغاة" (تبقى محفوظة فى سجل المراجعة). طلب المبيعات المرتبط سيتم تحريره عشان تتعمل فاتورة جديدة منه.'}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{appLang === 'en' ? 'Cancel' : 'تراجع'}</AlertDialogCancel>
                        <AlertDialogAction onClick={handleVoid}>{appLang === 'en' ? 'Void' : 'إلغاء الفاتورة'}</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
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
                <div className="md:col-span-2 bg-gray-50 dark:bg-slate-800 rounded-lg p-4 print:bg-gray-100 print:p-3" data-ai-help="invoices.detail_customer_snapshot">
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
                <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-4 print:bg-gray-100 print:p-3" data-ai-help="invoices.detail_status">
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
                          <span data-ai-help="invoices.detail_status" className={`px-2 py-0.5 rounded text-xs font-medium ${invoice.status === 'paid' ? 'bg-green-100 text-green-800 print:bg-green-50' :
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

              {canSeeApprovalDetails && (
                <Card className="border-slate-200 dark:border-slate-700">
                  <CardContent className="pt-6 space-y-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                          {appLang === 'en' ? 'Approval Status' : 'حالة الاعتماد'}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {appLang === 'en'
                            ? 'Dispatch approval details for this sales invoice'
                            : 'تفاصيل اعتماد أو رفض إخراج الفاتورة'}
                        </p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${invoiceApprovalStatus === 'approved'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
                        : invoiceApprovalStatus === 'rejected'
                          ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                          : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                        }`}>
                        {invoiceApprovalStatus === 'approved'
                          ? (appLang === 'en' ? 'Approved' : 'معتمدة')
                          : invoiceApprovalStatus === 'rejected'
                            ? (appLang === 'en' ? 'Rejected' : 'مرفوضة')
                            : (appLang === 'en' ? 'Pending' : 'بانتظار الاعتماد')}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 dark:bg-slate-800 px-4 py-3">
                        <span className="text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Decision By' : 'تم بواسطة'}</span>
                        <span className="font-medium text-gray-900 dark:text-white">{approvalDecisionActorName}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 dark:bg-slate-800 px-4 py-3">
                        <span className="text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Decision Date' : 'تاريخ القرار'}</span>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {approvalDecisionDate
                            ? new Date(approvalDecisionDate).toLocaleString(appLang === 'en' ? 'en-GB' : 'ar-EG')
                            : '-'}
                        </span>
                      </div>
                    </div>

                    <div className={`rounded-lg border px-4 py-3 ${invoiceApprovalStatus === 'rejected'
                      ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-900/20'
                      : invoiceApprovalStatus === 'approved'
                        ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-900/20'
                        : 'border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-900/20'
                      }`}>
                      <div className={`text-xs font-medium mb-1 ${invoiceApprovalStatus === 'rejected'
                        ? 'text-red-800 dark:text-red-200'
                        : invoiceApprovalStatus === 'approved'
                          ? 'text-emerald-800 dark:text-emerald-200'
                          : 'text-yellow-800 dark:text-yellow-200'
                        }`}>
                        {invoiceApprovalStatus === 'rejected'
                          ? (appLang === 'en' ? 'Rejection Reason' : 'سبب الرفض')
                          : invoiceApprovalStatus === 'approved'
                            ? (appLang === 'en' ? 'Approval Notes' : 'ملاحظات الاعتماد')
                            : (appLang === 'en' ? 'Status Note' : 'ملاحظة الحالة')}
                      </div>
                      <div className={`text-sm ${invoiceApprovalStatus === 'rejected'
                        ? 'text-red-700 dark:text-red-300'
                        : invoiceApprovalStatus === 'approved'
                          ? 'text-emerald-700 dark:text-emerald-300'
                          : 'text-yellow-700 dark:text-yellow-300'
                        }`}>
                        {approvalReasonText || (appLang === 'en' ? 'No notes' : 'لا توجد ملاحظات')}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

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
              <div data-ai-help="invoices.apply_credit_button" className={`print:hidden rounded-xl border-2 border-emerald-300 dark:border-emerald-700 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
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
                    data-ai-help="invoices.apply_credit_button"
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
            {/* v3.74.203 — z-[100] so this opens ABOVE the Record-Payment
                Radix dialog when launched from the inner banner (v3.74.202).
                Radix Dialog uses z-50, so the previous z-50 here let the
                payment dialog sit on top and swallow every click.
                v3.74.204 — pointer-events-auto on BOTH the overlay and the
                inner card. Radix Dialog disables pointer events on body
                while it's open; without this override the apply-credit
                dialog rendered above (correct z-index) but the Apply Credit
                button below could not receive clicks. */}
            {showApplyCreditDialog && (
              <div className="print:hidden fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm pointer-events-auto">
                <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 p-6 w-full max-w-md mx-4 pointer-events-auto">
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
                    {/* v3.74.87: cap input to min(credit, invoiceRemaining); warn on overshoot */}
                    {(() => {
                      const invoiceRemaining = Math.max(0, invoice.total_amount - invoice.paid_amount)
                      const maxApplicable = Math.min(ledgerCreditBalance, invoiceRemaining)
                      const entered = Number(creditApplyAmount || 0)
                      const willCap = entered > maxApplicable && maxApplicable > 0
                      return (
                        <>
                          <div className="relative">
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">{currencySymbol}</span>
                            <input
                              data-ai-help="invoices.credit_apply_amount"
                              type="number" min="0.01" step="0.01" max={maxApplicable}
                              value={creditApplyAmount}
                              onChange={e => setCreditApplyAmount(e.target.value)}
                              className="w-full h-10 px-4 pr-9 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                            />
                          </div>
                          <p className="text-xs text-gray-400">
                            {appLang === 'en'
                              ? `Remaining balance: ${currencySymbol}${invoiceRemaining.toFixed(2)} · Max applicable: ${currencySymbol}${maxApplicable.toFixed(2)}`
                              : `المتبقي في الفاتورة: ${currencySymbol}${invoiceRemaining.toFixed(2)} · الحَدّ الأَقصى للتَّطبيق: ${currencySymbol}${maxApplicable.toFixed(2)}`}
                          </p>
                          {willCap && (
                            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-2.5 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" /></svg>
                              <span>
                                {appLang === 'en'
                                  ? `Only ${currencySymbol}${maxApplicable.toFixed(2)} will be applied (invoice covered). Remaining ${currencySymbol}${(entered - maxApplicable).toFixed(2)} stays in customer credit.`
                                  : `سيُطبَّق ${currencySymbol}${maxApplicable.toFixed(2)} فَقَط (الفاتورة استَنفَدَت). الفَرق ${currencySymbol}${(entered - maxApplicable).toFixed(2)} يَبقى فى رَصيد العَميل.`}
                              </span>
                            </div>
                          )}
                        </>
                      )
                    })()}
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setShowApplyCreditDialog(false)} disabled={applyingCredit}
                      className="px-4 py-2 border rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800">
                      {appLang === 'en' ? 'Cancel' : 'إلغاء'}
                    </button>
                    <button
                      data-ai-help="invoices.apply_credit_button"
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
                            // v3.74.87: refresh from server truth + tell user exactly what was applied
                            const remaining = Number(json.data?.remaining_credit ?? 0)
                            setLedgerCreditBalance(remaining)
                            const applied = Number(json.data?.applied_amount ?? Number(creditApplyAmount))
                            const entered = Number(creditApplyAmount)
                            await loadInvoice()
                            if (applied < entered - 0.01) {
                              alert(appLang === 'en'
                                ? `✓ Applied ${currencySymbol}${applied.toFixed(2)} (invoice covered).\nRemaining ${currencySymbol}${(entered - applied).toFixed(2)} stays in your credit.\nCredit balance now: ${currencySymbol}${remaining.toFixed(2)}`
                                : `✓ تَمَّ تَطبيق ${currencySymbol}${applied.toFixed(2)} (الفاتورة استَنفَدَت).\nالفَرق ${currencySymbol}${(entered - applied).toFixed(2)} يَبقى فى رَصيد العَميل.\nالرَّصيد المُتَبَقّى: ${currencySymbol}${remaining.toFixed(2)}`)
                            }
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

            {/* v3.74.303 — Shipment tracking card. Visible whenever the
                invoice has a shipment row, regardless of pay permissions
                (anyone with invoice read access should see where the
                package is). The mini-timeline shows up to 5 most recent
                events; full history is on /inventory/third-party. */}
            {existingShipment && (
              <Card className="dark:bg-slate-900 dark:border-slate-800 border-cyan-200 dark:border-cyan-900/40">
                <div className="p-4 border-b border-cyan-100 dark:border-cyan-900/30 bg-cyan-50/50 dark:bg-cyan-950/20 flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Truck className="h-5 w-5 text-cyan-600" />
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      {appLang === 'en' ? 'Shipment Tracking' : '📦 تتبع الشحنة'}
                    </h3>
                    {(() => {
                      const s = String(existingShipment.status || 'pending').toLowerCase()
                      const map: Record<string, { label: string; labelEn: string; cls: string }> = {
                        created:          { label: 'تم الإنشاء',          labelEn: 'Created',           cls: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300' },
                        picked_up:        { label: 'اتسلّمت من البائع',   labelEn: 'Picked Up',         cls: 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300' },
                        in_transit:       { label: 'فى الطريق',           labelEn: 'In Transit',        cls: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300' },
                        out_for_delivery: { label: 'مع المندوب للتوصيل', labelEn: 'Out for Delivery',  cls: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300' },
                        delivered:        { label: 'اتسلّمت للعميل',      labelEn: 'Delivered',         cls: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300' },
                        returned:         { label: 'رجعت',                labelEn: 'Returned',          cls: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300' },
                        cancelled:        { label: 'ملغية',               labelEn: 'Cancelled',         cls: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300' },
                        failed:           { label: 'فشل التوصيل',         labelEn: 'Delivery Failed',   cls: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300' },
                        pending:          { label: 'فى الانتظار',         labelEn: 'Pending',           cls: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300' },
                      }
                      const m = map[s] || map.pending
                      return (
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${m.cls}`}>
                          {appLang === 'en' ? m.labelEn : m.label}
                        </span>
                      )
                    })()}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-cyan-700 hover:text-cyan-900 hover:bg-cyan-100 dark:text-cyan-300 dark:hover:bg-cyan-900/40"
                    onClick={() => window.open(`/inventory/third-party?invoice_id=${invoiceId}`, '_blank')}
                  >
                    {appLang === 'en' ? 'View Full' : 'عرض كامل'}
                    <ExternalLink className="w-3 h-3 mr-1" />
                  </Button>
                </div>
                <CardContent className="pt-4 space-y-4">
                  {/* Shipment meta: number / tracking / provider */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{appLang === 'en' ? 'Shipment #' : 'رقم الشحنة'}</p>
                      <p className="font-mono text-gray-900 dark:text-white">{existingShipment.shipment_number || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{appLang === 'en' ? 'Tracking' : 'رقم التتبع'}</p>
                      {existingShipment.tracking_number ? (
                        <a
                          href={`https://bosta.co/track/${existingShipment.tracking_number}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-cyan-700 dark:text-cyan-300 hover:underline inline-flex items-center gap-1"
                        >
                          {existingShipment.tracking_number}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <p className="text-gray-400">—</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{appLang === 'en' ? 'Carrier' : 'شركة الشحن'}</p>
                      <p className="text-gray-900 dark:text-white">{existingShipment.shipping_providers?.provider_name || '—'}</p>
                    </div>
                  </div>

                  {/* Mini timeline — newest first, max 5 entries */}
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{appLang === 'en' ? 'Latest events' : 'آخر التحديثات'}</p>
                    {shipmentStatusLogs.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                        {appLang === 'en' ? 'No events yet. The carrier will push updates as the shipment progresses.' : 'لسة مفيش تحديثات. شركة الشحن هتبعت تحديثات وقت ما الشحنة تتحرّك.'}
                      </p>
                    ) : (
                      <ol className="relative border-r-2 border-cyan-200 dark:border-cyan-900/40 pr-4 space-y-3">
                        {shipmentStatusLogs.map((ev, i) => {
                          const dt = ev.created_at ? new Date(ev.created_at) : null
                          const s = String(ev.internal_status || '').toLowerCase()
                          const labelMap: Record<string, { ar: string; en: string }> = {
                            created:          { ar: 'تم إنشاء الشحنة',      en: 'Shipment created' },
                            picked_up:        { ar: 'اتسلّمت من البائع',     en: 'Picked up from sender' },
                            in_transit:       { ar: 'فى الطريق',             en: 'In transit' },
                            out_for_delivery: { ar: 'مع المندوب للتوصيل',   en: 'Out for delivery' },
                            delivered:        { ar: 'اتسلّمت للعميل',        en: 'Delivered to customer' },
                            returned:         { ar: 'رجعت',                  en: 'Returned' },
                            cancelled:        { ar: 'ملغية',                 en: 'Cancelled' },
                            failed:           { ar: 'فشل التوصيل',           en: 'Delivery failed' },
                            pending:          { ar: 'فى الانتظار',           en: 'Pending' },
                          }
                          const lbl = labelMap[s] || { ar: ev.provider_status || s, en: ev.provider_status || s }
                          return (
                            <li key={i} className="relative">
                              <span className={`absolute right-[-21px] top-1 w-2.5 h-2.5 rounded-full ${i === 0 ? 'bg-cyan-500 ring-2 ring-cyan-200 dark:ring-cyan-900/60' : 'bg-gray-300 dark:bg-gray-600'}`} />
                              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                                <p className={`text-sm ${i === 0 ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                                  {appLang === 'en' ? lbl.en : lbl.ar}
                                </p>
                                {dt && (
                                  <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                    {dt.toLocaleDateString(appLang === 'en' ? 'en-US' : 'ar-EG')}
                                    {' '}
                                    {dt.toLocaleTimeString(appLang === 'en' ? 'en-US' : 'ar-EG', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                )}
                              </div>
                              {ev.location && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">📍 {ev.location}</p>
                              )}
                              {ev.notes && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{ev.notes}</p>
                              )}
                            </li>
                          )
                        })}
                      </ol>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* جدول المدفوعات */}
            {permPayView && (
              <Card className="dark:bg-slate-900 dark:border-slate-800" data-ai-help="invoices.payments_table">
                <div className="p-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-green-600" />
                    <h3 className="font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Payments' : 'المدفوعات'}</h3>
                    <span className="bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-300 text-xs px-2 py-0.5 rounded-full">{invoicePayments.length + creditApplications.length}</span>
                  </div>
                </div>
                <div className="p-4">
                  {invoicePayments.length === 0 && creditApplications.length === 0 ? (
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
                              <td className="px-3 py-2 font-semibold text-green-600 dark:text-green-400">
                                {(() => {
                                  // Prefer base_currency_amount (the actual EGP value);
                                  // if absent, fall back to amount.
                                  const baseAmount = Number(payment.base_currency_amount || payment.amount || 0)
                                  const origAmount = Number(payment.original_amount || 0)
                                  const origCurrency = String(payment.original_currency || payment.currency_code || '').toUpperCase()
                                  const baseCur = appCurrency.toUpperCase()
                                  const isFC = origCurrency && origCurrency !== baseCur && origAmount > 0
                                  if (isFC) {
                                    return (
                                      <>
                                        <span>{origAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} {origCurrency}</span>
                                        <span className="block text-[10px] text-gray-500 font-normal">≈ {currencySymbol}{baseAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                                      </>
                                    )
                                  }
                                  return <>{currencySymbol}{baseAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</>
                                })()}
                              </td>
                            </tr>
                          ))}
                          {/* v3.74.88: credit-applied rows from customer_credit_ledger */}
                          {creditApplications.map((credit, idx) => {
                            const amt = Math.abs(Number(credit.amount || 0))
                            const dateStr = credit.created_at ? String(credit.created_at).slice(0, 10) : '-'
                            return (
                              <tr key={`credit-${credit.id}`} className="border-b border-gray-100 dark:border-gray-800 hover:bg-emerald-50/40 dark:hover:bg-emerald-900/10 bg-emerald-50/20 dark:bg-emerald-900/5">
                                <td className="px-3 py-2 text-gray-500">{invoicePayments.length + idx + 1}</td>
                                <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{dateStr}</td>
                                <td className="px-3 py-2">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-800 dark:text-emerald-300">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    {appLang === 'en' ? 'Credit Applied' : 'تطبيق رصيد دائن'}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{credit.description || '-'}</td>
                                <td className="px-3 py-2 font-semibold text-emerald-600 dark:text-emerald-400">
                                  {currencySymbol}{amt.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                </td>
                              </tr>
                            )
                          })}
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
            <Card className="dark:bg-slate-900 dark:border-slate-800" data-ai-help="invoices.returns_table">
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
                  <Button onClick={() => handleChangeStatus("sent")} className="bg-blue-600 hover:bg-blue-700" disabled={changingStatus || isPending} data-ai-help="invoices.mark_sent_button">
                    {changingStatus || isPending ? (appLang === 'en' ? 'Updating...' : 'جاري التحديث...') : (appLang === 'en' ? 'Mark as Sent' : 'تحديد كمرسلة')}
                  </Button>
                ) : null}
                {/* 🔒 زر الدفع يظهر فقط للفواتير المنفذة (sent/partially_paid) - ليس للمسودات */}
                {netRemainingAmount > 0 && permPayWrite && invoice.status !== "draft" && invoice.status !== "invoiced" && invoice.status !== "cancelled" ? (
                  <Button className="bg-indigo-600 hover:bg-indigo-700" data-ai-help="invoices.record_payment_button" onClick={() => {
                    setPaymentAmount(netRemainingAmount)
                    setShowPayment(true)
                  }}>
                    {appLang === 'en' ? 'Record Payment' : 'تسجيل دفعة'}
                  </Button>
                ) : null}
                {/* v3.74.254 — show the last rejection reason inline so the
                    requester knows why their previous submission failed and
                    can resubmit with a better justification. */}
                {lastRejectedRefund && (() => {
                  const wh = String((invoice as any).warehouse_status || '').toLowerCase()
                  const alreadyRefunded = !!(invoice as any).pre_shipment_refund_at
                  const hasPaid = Number((invoice as any).paid_amount || 0) > 0
                  const eligible = hasPaid && wh !== 'approved' && !alreadyRefunded && invoice.status !== 'cancelled'
                  if (!eligible) return null
                  return (
                    <div className="w-full p-2 mb-2 rounded border border-red-300 bg-red-50 dark:bg-red-900/20 text-xs text-red-800 dark:text-red-200">
                      {appLang === 'en'
                        ? `Previous refund request was rejected${lastRejectedRefund.reason ? `: ${lastRejectedRefund.reason}` : ''}. You can submit a new request.`
                        : `تم رفض طلب الاسترداد السابق${lastRejectedRefund.reason ? `. السبب: ${lastRejectedRefund.reason}` : ''}. يمكنك إعادة الإرسال.`}
                    </div>
                  )
                })()}
                {/* v3.74.250 — Pre-shipment refund: only show while warehouse
                    hasn't approved dispatch AND the customer has paid something.
                    Cash hasn't been "earned" yet under IFRS 15, so the customer
                    is entitled to ask for it back. */}
                {(() => {
                  const wh = String((invoice as any).warehouse_status || '').toLowerCase()
                  const alreadyRefunded = !!(invoice as any).pre_shipment_refund_at
                  const hasPaid = Number((invoice as any).paid_amount || 0) > 0
                  const eligible = hasPaid && wh !== 'approved' && !alreadyRefunded && invoice.status !== 'cancelled'
                  if (!eligible || !isPrivilegedUser) return null
                  return (
                    <Button
                      variant="outline"
                      className="border-amber-500 text-amber-700 hover:bg-amber-50 dark:border-amber-400 dark:text-amber-300"
                      onClick={() => { setShowPreShipmentRefund(true); setPreShipmentRefundAccountId(''); setPreShipmentRefundReason(''); setPreShipmentRefundMode('cancel_invoice') }}
                    >
                      {appLang === 'en' ? 'Refund pre-shipment payment' : 'استرداد دفعة قبل الشحن'}
                    </Button>
                  )
                })()}
                {/* 📌 تم إلغاء زر "إنشاء شحنة" - الوظيفة مدمجة في "تحديد كمرسلة" */}
                {/* v3.74.303 — "View Shipment" button now points at the
                    Third-Party Inventory page filtered by invoice, since
                    /shipments/[id] doesn't exist as a standalone page.
                    The shipment summary card below shows the latest
                    timeline events inline. */}
                {existingShipment ? (
                  <Button variant="outline" className="border-cyan-500 text-cyan-600 hover:bg-cyan-50" onClick={() => window.open(`/inventory/third-party?invoice_id=${invoiceId}`, '_blank')}>
                    <Truck className="w-4 h-4 ml-2" />
                    {appLang === 'en' ? `Shipment: ${existingShipment.shipment_number}` : `الشحنة: ${existingShipment.shipment_number}`}
                    {existingShipment.tracking_number && <ExternalLink className="w-3 h-3 mr-1" />}
                  </Button>
                ) : null}
                {/* ❌ تم إزالة زر "إصدار مذكرة دائن كاملة" - استخدم "مرتجع جزئي" بدلاً منه للتحكم الكامل */}
                {/* ❌ تم إزالة زر "تحديد كمدفوعة" - الحالة تتحدث تلقائياً عند الدفع أو المرتجع */}
              </>
            )}
            {activeSalesReturnRequestLabel ? (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                {activeSalesReturnRequestLabel}
              </span>
            ) : null}
            {/* 🔒 زر المرتجع: الكامل لأي فاتورة معتمدة مخزنياً، والجزئي فقط لفاتورة بند واحد بكمية متاحة > 1 */}
            {canShowReturnButtons ? (
              <>
                {canShowPartialReturnButton && (
                  <Button
                    variant="outline"
                    className="border-orange-500 text-orange-600 hover:bg-orange-50"
                    data-ai-help="invoices.partial_return_button"
                    onClick={() => openReturnDialog('partial')}
                  >
                    {appLang === 'en' ? 'Partial Return' : 'مرتجع جزئي'}
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="border-red-500 text-red-600 hover:bg-red-50"
                  data-ai-help="invoices.full_return_button"
                  onClick={() => openReturnDialog('full')}
                >
                  {appLang === 'en' ? 'Full Return' : 'مرتجع كامل'}
                </Button>
              </>
            ) : null}
            {/* 💰 زر صرف رصيد العميل الدائن - يظهر لـ: owner/admin/general_manager (اختيار الفرع) و accountant (فرعه فقط) */}
            {customerCreditAmount > 0 && canSeeCreditRefundButton && invoice.customer_id && invoice.status !== "cancelled" && invoice.status !== "draft" ? (
              <Button
                variant="outline"
                className="border-green-500 text-green-600 hover:bg-green-50"
                data-ai-help="invoices.refund_customer_credit_button"
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
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{appLang === 'en' ? `Record payment for invoice #${invoice.invoice_number}` : `تسجيل دفعة للفاتورة #${invoice.invoice_number}`}</DialogTitle>
              </DialogHeader>
              {/* Detect FC invoice once for clearer logic */}
              {(() => {
                const isFCInvoice = !!(invoice.currency_code && invoice.exchange_rate && Number(invoice.exchange_rate) !== 1)
                const baseCurrencySymbol = currencySymbol  // typically £ for EGP
                return null
              })()}
              <div className="space-y-4 py-2">
                {/* v3.74.202 — Customer credit banners. Mirror the two info
                    panels rendered on the invoice page itself so the user can
                    apply a credit straight from the payment form without
                    closing it to find the outer button. */}
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
                {ledgerCreditBalance > 0.009 && ['sent', 'partially_paid'].includes(invoice.status) && canSeeCreditRefundButton && (
                  <div className="rounded-xl border-2 border-emerald-300 dark:border-emerald-700 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-emerald-100 dark:bg-emerald-900/40 rounded-xl flex-shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                      </div>
                      <div>
                        <p className="font-semibold text-emerald-800 dark:text-emerald-300 text-sm">
                          {appLang === 'en' ? '💰 Customer has an available credit balance!' : '💰 لدى العميل رصيد دائن متاح!'}
                        </p>
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                          {appLang === 'en' ? 'Available credit from approved return: ' : 'رصيد متاح من مرتجع معتمد: '}
                          <span className="font-bold text-sm">{currencySymbol}{ledgerCreditBalance.toFixed(2)}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          const remaining = Math.max(0, invoice.total_amount - invoice.paid_amount)
                          setCreditApplyAmount(String(Math.min(ledgerCreditBalance, remaining).toFixed(2)))
                          setShowApplyCreditDialog(true)
                        }}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        {appLang === 'en' ? 'Apply Credit' : 'تطبيق الرصيد'}
                      </button>
                      <a href={`/customer-credits/${invoice.customer_id}`} target="_blank" rel="noreferrer"
                        className="px-2 py-1.5 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 text-xs rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors flex items-center gap-1">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                        {appLang === 'en' ? 'Ledger' : 'السجل'}
                      </a>
                    </div>
                  </div>
                )}
                <div className="space-y-2" data-ai-help="invoices.payment_amount">
                  <Label>
                    {appLang === 'en' ? 'Amount (in base currency)' : `المبلغ (بالعملة الأساسية ${appCurrency})`}
                  </Label>
                  <NumericInput
                    value={paymentAmount}
                    min={0}
                    step="0.01"
                    onChange={(val) => setPaymentAmount(val)}
                    decimalPlaces={2}
                    disabled={!!(invoice.currency_code && invoice.exchange_rate && Number(invoice.exchange_rate) !== 1 && paymentFCAmount > 0 && paymentExchangeRate > 0)}
                  />
                  {invoice.currency_code && invoice.exchange_rate && Number(invoice.exchange_rate) !== 1 && (
                    <p className="text-xs text-blue-600 dark:text-blue-400">
                      {paymentFCAmount > 0 && paymentExchangeRate > 0
                        ? (appLang === 'en'
                            ? `🔒 Auto-calculated: ${paymentFCAmount} ${invoice.currency_code} × ${paymentExchangeRate.toFixed(4)} = ${currencySymbol}${(paymentFCAmount * paymentExchangeRate).toFixed(2)}`
                            : `🔒 محسوب تلقائياً: ${paymentFCAmount} ${invoice.currency_code} × ${paymentExchangeRate.toFixed(4)} = ${currencySymbol}${(paymentFCAmount * paymentExchangeRate).toFixed(2)}`)
                        : (appLang === 'en'
                            ? `⚠️ This invoice is in ${invoice.currency_code}. Fill the FX section below — base amount will be calculated automatically.`
                            : `⚠️ هذه الفاتورة بـ${invoice.currency_code}. املأ قسم FX أدناه — سيتم حساب المبلغ بـ${appCurrency} تلقائياً.`)}
                    </p>
                  )}
                </div>
                <div className="space-y-2" data-ai-help="invoices.payment_account">
                  <Label>{appLang === 'en' ? 'Payment Date' : 'تاريخ الدفع'}</Label>
                  <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{appLang === 'en' ? 'Payment Method' : 'طريقة الدفع'}</Label>
                  {/* v3.74.8 — dropdown of the four payment methods the display
                      side already recognizes (cash / bank_transfer / card /
                      cheque). Was a free-text Input that let typos slip through. */}
                  <select
                    className="w-full border rounded px-3 py-2 bg-white dark:bg-slate-900"
                    value={paymentMethod || 'cash'}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  >
                    <option value="cash">{appLang === 'en' ? 'Cash' : 'نقدى'}</option>
                    <option value="bank_transfer">{appLang === 'en' ? 'Bank Transfer' : 'تحويل بنكى'}</option>
                    <option value="card">{appLang === 'en' ? 'Card' : 'بطاقة ائتمان'}</option>
                    <option value="cheque">{appLang === 'en' ? 'Cheque' : 'شيك'}</option>
                  </select>
                </div>
                {/* v3.74.214 — Currency-aware Account picker.
                    Effective payment currency = invoice's FC code (if the
                    invoice itself is foreign-currency), else the payment-
                    currency selector (if "different currency" is on), else
                    the app base currency.
                    Step 1: prefer accounts whose original_currency matches
                            the effective payment currency.
                    Step 2: if none in the branch, fall back to all cash/
                            bank accounts and surface an amber notice that
                            FX conversion will apply. The existing FX
                            section below already exposes the live / manual
                            rate picker for the conversion. */}
                {(() => {
                  const baseCcy = String(appCurrency || 'EGP').toUpperCase()
                  const isFCInvoice = !!(invoice.currency_code && invoice.exchange_rate && Number(invoice.exchange_rate) !== 1)
                  const effectivePayCcy = String(
                    isFCInvoice ? invoice.currency_code
                      : payInDifferentCurrency ? paymentCurrency
                      : baseCcy
                  ).toUpperCase()
                  const accCcy = (a: any) => String(a?.original_currency || baseCcy).toUpperCase()
                  const inPayCcy = cashBankAccounts.filter((a: any) => accCcy(a) === effectivePayCcy)
                  const displayed = inPayCcy.length > 0 ? inPayCcy : cashBankAccounts
                  const noMatchInCcy = inPayCcy.length === 0 && cashBankAccounts.length > 0
                  return (
                    <div className="space-y-2">
                      <Label>{appLang === 'en' ? 'Account (Cash/Bank)' : 'الحساب (نقد/بنك)'}</Label>
                      <select
                        className="w-full border rounded px-3 py-2 bg-white dark:bg-slate-900"
                        value={paymentAccountId}
                        onChange={(e) => setPaymentAccountId(e.target.value)}
                      >
                        <option value="">{appLang === 'en' ? 'Select account' : 'اختر الحساب'}</option>
                        {displayed.map((a: any) => {
                          const ccy = accCcy(a)
                          const ccyBadge = ccy !== effectivePayCcy ? ` [${ccy}]` : ''
                          return (
                            <option key={a.id} value={a.id}>
                              {(a.account_code ? `${a.account_code} - ` : "") + a.account_name + ccyBadge}
                            </option>
                          )
                        })}
                      </select>
                      {noMatchInCcy && (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400">
                          {appLang === 'en'
                            ? `No account in ${effectivePayCcy} for this branch — showing all accounts. FX conversion will apply using the rate below.`
                            : `لا يوجد حساب بِعُملَة ${effectivePayCcy} فى هذا الفَرع — يَتِم عَرض جَميع الحِسابات. سَيَتِم تَحويل العُملَة بِالسِّعر المُحَدَّد بِالأَسفَل.`}
                        </p>
                      )}
                    </div>
                  )
                })()}
                <div className="space-y-2">
                  <Label>{appLang === 'en' ? 'Reference/Receipt No. (optional)' : 'مرجع/رقم إيصال (اختياري)'}</Label>
                  <Input value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} />
                </div>

                {/* ===== Multi-currency Payment Section (v3.14.0) ===== */}
                {/* Supports 2 scenarios:                                  */}
                {/* (A) Invoice in FC → match the invoice currency        */}
                {/* (B) Invoice in base, customer pays in FC → cross-currency receipt */}
                {(() => {
                  const isFCInvoice = !!(invoice.currency_code && invoice.exchange_rate && Number(invoice.exchange_rate) !== 1)
                  const fcCurrency = isFCInvoice ? invoice.currency_code : paymentCurrency
                  const showFXSection = isFCInvoice || payInDifferentCurrency
                  return (
                    <>
                      {/* Toggle: only shown if invoice is in base currency */}
                      {!isFCInvoice && (
                        <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-md">
                          <input
                            type="checkbox"
                            id="pay-different-currency"
                            checked={payInDifferentCurrency}
                            onChange={(e) => {
                              setPayInDifferentCurrency(e.target.checked)
                              if (!e.target.checked) {
                                setPaymentFCAmount(0)
                                setPaymentExchangeRate(0)
                              }
                            }}
                            className="rounded"
                          />
                          <label htmlFor="pay-different-currency" className="text-sm cursor-pointer">
                            💱 {appLang === 'en'
                              ? `Customer is paying in a different currency (other than ${appCurrency})`
                              : `العميل يدفع بعملة مختلفة (غير ${appCurrency})`}
                          </label>
                        </div>
                      )}

                      {showFXSection && (
                        <div className="space-y-3 p-3 border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 rounded-md">
                          <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300">
                            <span>💱</span>
                            <span>
                              {isFCInvoice
                                ? (appLang === 'en'
                                    ? `Foreign Currency Invoice (${invoice.currency_code} — original rate: ${Number(invoice.exchange_rate).toFixed(4)})`
                                    : `فاتورة بعملة أجنبية (${invoice.currency_code} — السعر الأصلى: ${Number(invoice.exchange_rate).toFixed(4)})`)
                                : (appLang === 'en'
                                    ? `Cross-currency Payment (customer pays in ${paymentCurrency})`
                                    : `دفع بعملة مختلفة (العميل يدفع بـ${paymentCurrency})`)}
                            </span>
                          </div>

                          {/* Currency selector for cross-currency scenario */}
                          {!isFCInvoice && (
                            <div className="space-y-1">
                              <Label className="text-xs">{appLang === 'en' ? 'Payment Currency' : 'عملة الدفع'}</Label>
                              <select
                                className="w-full border rounded px-2 py-1 text-sm dark:bg-slate-800"
                                value={paymentCurrency}
                                onChange={(e) => setPaymentCurrency(e.target.value)}
                              >
                                {['USD','EUR','GBP','SAR','AED','KWD','QAR','BHD','OMR','JOD','LBP'].filter(c => c !== appCurrency).map(c => (
                                  <option key={c} value={c}>{c}</option>
                                ))}
                              </select>
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs">
                                {appLang === 'en' ? `Amount in ${fcCurrency}` : `المبلغ بـ${fcCurrency}`}
                              </Label>
                              <NumericInput
                                value={paymentFCAmount}
                                min={0}
                                step="0.01"
                                onChange={(val) => setPaymentFCAmount(val)}
                                decimalPlaces={2}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">
                                {appLang === 'en' ? `Exchange Rate (${fcCurrency} → ${appCurrency})` : `سعر الصرف (${fcCurrency} → ${appCurrency})`}
                              </Label>
                              {loadingRates ? (
                                <div className="text-xs text-gray-500 py-2">{appLang === 'en' ? 'Loading rates...' : 'جارى تحميل الأسعار...'}</div>
                              ) : availableRates.length === 0 ? (
                                <div className="text-xs space-y-1">
                                  <div className="text-red-600 dark:text-red-400">
                                    ⚠️ {appLang === 'en'
                                      ? `No exchange rate found for ${fcCurrency} → ${appCurrency}`
                                      : `لا يوجد سعر صرف لـ ${fcCurrency} → ${appCurrency}`}
                                  </div>
                                  <Link href="/settings/exchange-rates" className="text-blue-600 hover:underline text-xs inline-block">
                                    → {appLang === 'en' ? 'Add rate in settings' : 'إضافة سعر فى الإعدادات'}
                                  </Link>
                                </div>
                              ) : (
                                <select
                                  className="w-full border rounded px-2 py-1.5 text-sm dark:bg-slate-800 dark:border-slate-700"
                                  value={selectedRateId}
                                  onChange={(e) => {
                                    const id = e.target.value
                                    setSelectedRateId(id)
                                    const r = availableRates.find(x => x.id === id)
                                    if (r) setPaymentExchangeRate(r.rate)
                                  }}
                                >
                                  {availableRates.map(r => (
                                    <option key={r.id} value={r.id}>{r.label}</option>
                                  ))}
                                </select>
                              )}
                            </div>
                          </div>

                          {paymentFCAmount > 0 && paymentExchangeRate > 0 && (
                            <div className="text-xs space-y-1 pt-1 border-t border-amber-200 dark:border-amber-800">
                              {(() => {
                                const cashBase = paymentFCAmount * paymentExchangeRate
                                const invoiceTotal = Number(invoice.total_amount || 0)
                                const invoicePaid = Number(invoice.paid_amount || 0)
                                const invoiceOpen = Math.max(0, invoiceTotal - invoicePaid)
                                if (isFCInvoice) {
                                  // FC invoice scenario: FX gain/loss on rate diff
                                  const arBase = paymentFCAmount * Number(invoice.exchange_rate)
                                  const diff = cashBase - arBase
                                  const gain = diff > 0
                                  return (
                                    <>
                                      <div className="flex justify-between">
                                        <span>{appLang === 'en' ? 'AR relieved (original rate):' : 'تسوية الذمم (السعر الأصلى):'}</span>
                                        <span className="font-mono">{arBase.toFixed(2)} {currencySymbol}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>{appLang === 'en' ? 'Cash received (payment rate):' : 'النقد المستلم (سعر الدفع):'}</span>
                                        <span className="font-mono">{cashBase.toFixed(2)} {currencySymbol}</span>
                                      </div>
                                      <div className={`flex justify-between font-bold ${gain ? 'text-green-700' : 'text-red-700'}`}>
                                        <span>{gain ? (appLang === 'en' ? 'FX Gain → 4320:' : 'مكسب عملة → 4320:') : (appLang === 'en' ? 'FX Loss → 5310:' : 'خسارة عملة → 5310:')}</span>
                                        <span className="font-mono">{Math.abs(diff).toFixed(2)} {currencySymbol}</span>
                                      </div>
                                    </>
                                  )
                                } else {
                                  // Cross-currency scenario: customer pays FC on base-currency invoice
                                  const excess = Math.max(0, cashBase - invoiceOpen)
                                  return (
                                    <>
                                      <div className="flex justify-between">
                                        <span>{appLang === 'en' ? 'Cash received (converted):' : 'النقد المستلم (محوّل):'}</span>
                                        <span className="font-mono">{cashBase.toFixed(2)} {currencySymbol}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>{appLang === 'en' ? 'Invoice outstanding:' : 'المتبقى من الفاتورة:'}</span>
                                        <span className="font-mono">{invoiceOpen.toFixed(2)} {currencySymbol}</span>
                                      </div>
                                      {excess > 0 ? (
                                        <div className="flex justify-between font-bold text-blue-700">
                                          <span>{appLang === 'en' ? 'Excess → Customer Credit:' : 'الزيادة → رصيد للعميل:'}</span>
                                          <span className="font-mono">{excess.toFixed(2)} {currencySymbol}</span>
                                        </div>
                                      ) : cashBase < invoiceOpen ? (
                                        <div className="flex justify-between text-amber-700">
                                          <span>{appLang === 'en' ? 'Partial payment, remaining:' : 'دفع جزئى، المتبقى:'}</span>
                                          <span className="font-mono">{(invoiceOpen - cashBase).toFixed(2)} {currencySymbol}</span>
                                        </div>
                                      ) : (
                                        <div className="flex justify-between font-bold text-green-700">
                                          <span>{appLang === 'en' ? 'Full payment ✓' : 'سداد كامل ✓'}</span>
                                        </div>
                                      )}
                                    </>
                                  )
                                }
                              })()}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowPayment(false)} disabled={savingPayment}>{appLang === 'en' ? 'Cancel' : 'إلغاء'}</Button>
                <Button
                  data-ai-help="invoices.save_payment_button"
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
          {/* v3.74.250 — Pre-shipment refund dialog */}
          <Dialog open={showPreShipmentRefund} onOpenChange={setShowPreShipmentRefund}>
            <DialogContent dir={appLang === 'en' ? 'ltr' : 'rtl'} className="max-w-md">
              <DialogHeader>
                <DialogTitle>{appLang === 'en' ? 'Refund pre-shipment payment' : 'استرداد دفعة قبل الشحن'}</DialogTitle>
                <DialogDescription className="text-xs leading-relaxed">
                  {appLang === 'en'
                    ? "The customer paid but the warehouse hasn't approved dispatch yet. Until the goods leave, the cash is a contract liability — return it now and choose what happens to the invoice."
                    : 'العميل دفع لكن المخزن لسه ماعتمدش الإرسال. طالما البضاعة فى المخزن، الفلوس أمانة عند الشركة — هترجعها الآن وتختار مصير الفاتورة.'}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="p-3 rounded bg-blue-50 dark:bg-blue-900/20 text-sm">
                  <div className="flex justify-between">
                    <span>{appLang === 'en' ? 'Refundable amount' : 'المبلغ القابل للاسترداد'}:</span>
                    <span className="font-bold">{Number((invoice as any).paid_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>{appLang === 'en' ? 'What should happen to the invoice?' : 'مصير الفاتورة'}</Label>
                  <div className="space-y-2">
                    <label className="flex items-start gap-2 p-2 rounded border cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                      <input type="radio" name="psr-mode" checked={preShipmentRefundMode === 'cancel_invoice'} onChange={() => setPreShipmentRefundMode('cancel_invoice')} className="mt-1" />
                      <span className="text-sm">
                        <div className="font-medium">{appLang === 'en' ? 'Cancel the invoice (recommended)' : 'إلغاء الفاتورة (موصى به)'}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {appLang === 'en'
                            ? 'Full unwind: payments reversed, revenue JE reversed, invoice + linked sales order cancelled.'
                            : 'إلغاء كامل: عكس المدفوعات، عكس قيد الإيراد، إلغاء الفاتورة وأمر البيع المرتبط.'}
                        </div>
                      </span>
                    </label>
                    <label className="flex items-start gap-2 p-2 rounded border cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                      <input type="radio" name="psr-mode" checked={preShipmentRefundMode === 'keep_open'} onChange={() => setPreShipmentRefundMode('keep_open')} className="mt-1" />
                      <span className="text-sm">
                        <div className="font-medium">{appLang === 'en' ? 'Keep invoice open' : 'إبقاء الفاتورة مفتوحة'}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {appLang === 'en'
                            ? 'Reverse payments only. Invoice goes back to sent (unpaid). Customer can pay again later.'
                            : 'عكس المدفوعات فقط. الفاتورة ترجع لحالة مرسلة (غير مدفوعة). العميل يقدر يدفع لاحقاً.'}
                        </div>
                      </span>
                    </label>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>{appLang === 'en' ? 'Cash drawer / bank account to refund from' : 'حساب الصرف (خزينة / بنك)'}</Label>
                  <select
                    className="w-full border rounded px-3 py-2 bg-white dark:bg-slate-900"
                    value={preShipmentRefundAccountId}
                    onChange={(e) => setPreShipmentRefundAccountId(e.target.value)}
                  >
                    <option value="">{appLang === 'en' ? '— select account —' : '— اختر حسابًا —'}</option>
                    {(cashBankAccounts || []).map((a: any) => (
                      <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>
                    ))}
                  </select>
                  {!isPrivilegedUser && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {appLang === 'en' ? 'Showing accounts belonging to your branch.' : 'يتم عرض الحسابات التابعة لفرعك فقط.'}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>{appLang === 'en' ? 'Reason (optional)' : 'السبب (اختيارى)'}</Label>
                  <Input
                    value={preShipmentRefundReason}
                    onChange={(e) => setPreShipmentRefundReason(e.target.value)}
                    placeholder={appLang === 'en' ? 'e.g. Customer changed mind' : 'مثال: العميل غيّر رأيه'}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowPreShipmentRefund(false)} disabled={preShipmentRefundSaving}>
                  {appLang === 'en' ? 'Cancel' : 'إلغاء'}
                </Button>
                <Button
                  variant={preShipmentRefundMode === 'cancel_invoice' ? 'destructive' : 'default'}
                  onClick={submitPreShipmentRefund}
                  disabled={preShipmentRefundSaving || !preShipmentRefundAccountId}
                >
                  {preShipmentRefundSaving
                    ? (appLang === 'en' ? 'Processing...' : 'جارى التنفيذ...')
                    : preShipmentRefundMode === 'cancel_invoice'
                      ? (appLang === 'en' ? 'Refund + cancel invoice' : 'استرداد + إلغاء الفاتورة')
                      : (appLang === 'en' ? 'Refund (keep invoice open)' : 'استرداد (إبقاء الفاتورة)')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={showPartialReturn} onOpenChange={setShowPartialReturn}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {returnDialogMode === 'full'
                    ? (appLang === 'en' ? 'Full Sales Return Request' : 'طلب مرتجع مبيعات كامل')
                    : (appLang === 'en' ? 'Partial Sales Return Request' : 'طلب مرتجع مبيعات جزئي')}
                </DialogTitle>
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

                {/* v3.74.246 — Settlement preference: hidden for invoices with
                    no actual paid amount (no money in = nothing to refund);
                    when a cash/bank method is picked, also require the user
                    to choose the disbursement account, filtered by branch
                    for regular roles. */}
                {(() => {
                  const hasPaidAmount = Number((invoice as any)?.paid_amount || 0) > 0
                  if (!hasPaidAmount) {
                    return (
                      <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                        <p className="text-sm text-amber-700 dark:text-amber-300">
                          {appLang === 'en'
                            ? 'This invoice has no payments on the books, so no settlement is needed. The return will only reverse revenue and restock inventory.'
                            : 'الفاتورة ليس بها مدفوعات مسجّلة، فلا حاجة لاختيار تسوية. المرتجع سيعكس الإيراد ويعيد المخزون فقط.'}
                        </p>
                      </div>
                    )
                  }
                  const accCoa = (a: any) => String(a?.sub_type || '').toLowerCase()
                  const cashOnly  = (cashBankAccounts || []).filter((a: any) => accCoa(a) === 'cash')
                  const bankOnly  = (cashBankAccounts || []).filter((a: any) => accCoa(a) === 'bank')
                  const eligibleAccounts = returnMethod === 'cash' ? cashOnly
                                         : returnMethod === 'bank_transfer' ? bankOnly
                                         : []
                  const accountLabel = returnMethod === 'cash'
                    ? (appLang === 'en' ? 'Cash drawer to refund from' : 'الخزينة المسحوب منها')
                    : (appLang === 'en' ? 'Bank account to refund from' : 'الحساب البنكى المسحوب منه')
                  return (
                    <>
                      <div className="space-y-2">
                        <Label>{appLang === 'en' ? 'Settlement Preference After Approval' : 'تفضيل التسوية بعد الاعتماد'}</Label>
                        <select
                          className="w-full border rounded px-3 py-2 bg-white dark:bg-slate-900"
                          value={returnMethod}
                          onChange={(e) => { setReturnMethod(e.target.value as any); setReturnSettlementAccountId('') }}
                        >
                          <option value="credit_note">{appLang === 'en' ? 'Credit Note (Customer Credit)' : 'مذكرة دائن (رصيد للعميل)'}</option>
                          <option value="cash">{appLang === 'en' ? 'Cash Refund' : 'استرداد نقدي'}</option>
                          <option value="bank_transfer">{appLang === 'en' ? 'Bank Transfer' : 'تحويل بنكي'}</option>
                        </select>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {appLang === 'en'
                            ? 'Informational only at this stage. The request still requires management and warehouse approvals before any execution.'
                            : 'هذا الاختيار إرشادي فقط في هذه المرحلة. الطلب ما زال يحتاج إلى اعتماد الإدارة ثم المخزن قبل أي تنفيذ فعلي.'}
                        </p>
                      </div>
                      {(returnMethod === 'cash' || returnMethod === 'bank_transfer') && (
                        <div className="space-y-2">
                          <Label>{accountLabel}</Label>
                          <select
                            className="w-full border rounded px-3 py-2 bg-white dark:bg-slate-900"
                            value={returnSettlementAccountId}
                            onChange={(e) => setReturnSettlementAccountId(e.target.value)}
                          >
                            <option value="">{appLang === 'en' ? '— select account —' : '— اختر حسابًا —'}</option>
                            {eligibleAccounts.map((a: any) => (
                              <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>
                            ))}
                          </select>
                          {eligibleAccounts.length === 0 && (
                            <p className="text-xs text-red-600 dark:text-red-400">
                              {appLang === 'en'
                                ? `No ${returnMethod === 'cash' ? 'cash' : 'bank'} accounts are available for your branch. Ask the owner to create one.`
                                : `لا توجد ${returnMethod === 'cash' ? 'حسابات خزينة' : 'حسابات بنكية'} متاحة لفرعك. اطلب من المالك إنشاء واحد.`}
                            </p>
                          )}
                          {!isPrivilegedUser && eligibleAccounts.length > 0 && (
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {appLang === 'en'
                                ? 'Showing accounts belonging to your branch.'
                                : 'يتم عرض الحسابات التابعة لفرعك فقط.'}
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  )
                })()}

                {/* Notes */}
                <div className="space-y-2">
                  <Label>{appLang === 'en' ? 'Notes' : 'ملاحظات'}</Label>
                  <Input
                    value={returnNotes}
                    onChange={(e) => setReturnNotes(e.target.value)}
                    placeholder={appLang === 'en' ? 'Return reason...' : 'سبب المرتجع...'}
                  />
                </div>

                <p className="text-sm text-orange-600">{appLang === 'en' ? 'This dialog now submits an approval request only. Inventory, receivables, and accounting entries will be posted after management approval and warehouse confirmation.' : 'هذه النافذة ترسل طلب اعتماد فقط. المخزون والذمم والقيود المحاسبية لن تُنفذ إلا بعد اعتماد الإدارة ثم تأكيد المخزن.'}</p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowPartialReturn(false)}>{appLang === 'en' ? 'Cancel' : 'إلغاء'}</Button>
                <Button
                  className="bg-orange-600 hover:bg-orange-700"
                  onClick={processPartialReturn}
                  disabled={returnProcessing || returnTotal <= 0}
                >
                  {returnProcessing ? (appLang === 'en' ? 'Submitting...' : 'جاري الإرسال...') : (appLang === 'en' ? 'Submit Return Request' : 'إرسال طلب المرتجع')}
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
              setRefundExRate={setRefundExRate}
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
