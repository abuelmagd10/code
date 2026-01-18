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

import { useState, useEffect, useRef, useMemo, useTransition } from "react"
import { Sidebar } from "@/components/sidebar"
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
import { PageHeaderDetail } from "@/components/PageHeader"
import {
  transferToThirdParty,
  clearThirdPartyInventory,
  validateShippingProvider
} from "@/lib/third-party-inventory"
import { consumeFIFOLotsWithCOGS } from "@/lib/fifo-engine"

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
  const [showCredit, setShowCredit] = useState(false)
  const [creditDate, setCreditDate] = useState<string>(new Date().toISOString().slice(0, 10))

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
          .select("id, account_code, account_name, account_type, sub_type")
          .eq("company_id", paymentCompanyId)
        const list = (accounts || []).filter((a: any) => {
          const st = String(a.sub_type || "").toLowerCase()
          const nm = String(a.account_name || "")
          const nmLower = nm.toLowerCase()
          const isCashOrBankSubtype = st === "cash" || st === "bank"
          const nameSuggestsCashOrBank = nmLower.includes("bank") || nmLower.includes("cash") || /بنك|بنكي|مصرف|خزينة|نقد/.test(nm)
          return isCashOrBankSubtype || nameSuggestsCashOrBank
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

        try {
          const companyId = (invoiceData as any)?.company_id || (invoiceData as any)?.companies?.id || await getActiveCompanyId(supabase)
          if (companyId) {
            const { data: nextByNumber } = await supabase
              .from("invoices")
              .select("id, invoice_number")
              .eq("company_id", companyId)
              .gt("invoice_number", invoiceData.invoice_number)
              .order("invoice_number", { ascending: true })
              .limit(1)
            setNextInvoiceId((nextByNumber && nextByNumber[0]?.id) || null)

            const { data: prevByNumber } = await supabase
              .from("invoices")
              .select("id, invoice_number")
              .eq("company_id", companyId)
              .lt("invoice_number", invoiceData.invoice_number)
              .order("invoice_number", { ascending: false })
              .limit(1)
            setPrevInvoiceId((prevByNumber && prevByNumber[0]?.id) || null)
          } else {
            setNextInvoiceId(null)
            setPrevInvoiceId(null)
          }
        } catch { }
      }
    } catch (error) {
      console.error("Error loading invoice:", error)
    } finally {
      setIsLoading(false)
    }
  }

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
    window.print()
  }

  const handleDownloadPDF = async () => {
    try {
      const el = invoiceContentRef.current
      if (!el) return

      const content = el.innerHTML
      const appLang = typeof window !== 'undefined'
        ? ((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar')
        : 'ar'

      const { openPrintWindow } = await import('@/lib/print-utils')
      openPrintWindow(content, {
        lang: appLang as 'ar' | 'en',
        direction: appLang === 'ar' ? 'rtl' : 'ltr',
        title: appLang === 'en' ? `Invoice ${invoice?.invoice_number || ''}` : `فاتورة ${invoice?.invoice_number || ''}`,
        fontSize: 11,
        pageSize: 'A4',
        margin: '5mm'
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
          const { data: invoiceItems } = await supabase
            .from("invoice_items")
            .select("product_id, quantity")
            .eq("invoice_id", invoiceId)

          const itemsToCheck = (invoiceItems || []).map((item: any) => ({
            product_id: item.product_id,
            quantity: Number(item.quantity || 0)
          }))

          // Pass invoice context for proper inventory filtering
          const inventoryContext = invoice ? {
            company_id: invoice.company_id,
            branch_id: invoice.branch_id || null,
            warehouse_id: invoice.warehouse_id || null,
            cost_center_id: invoice.cost_center_id || null,
          } : undefined

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

      // تجنب التكرار - التحقق من عدم وجود قيد سابق
      const { data: existing } = await supabase
        .from("journal_entries")
        .select("id")
        .eq("company_id", mapping.companyId)
        .eq("reference_type", "invoice") // قيد الفاتورة الرئيسي
        .eq("reference_id", invoiceId)
        .limit(1)
      if (existing && existing.length > 0) return

      // ===== 1) قيد المبيعات والذمم المدينة =====
      const { data: entry, error: entryError } = await supabase
        .from("journal_entries")
        .insert({
          company_id: mapping.companyId,
          reference_type: "invoice", // قيد الفاتورة - Cash Basis
          reference_id: invoiceId,
          entry_date: invoice.invoice_date,
          description: `فاتورة مبيعات ${invoice.invoice_number}`,
          // Branch, Cost Center, Warehouse from invoice
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

  const issueFullCreditNote = async () => {
    try {
      if (!invoice) return
      const mapping = await findAccountIds()
      if (!mapping || !mapping.ar || !mapping.revenue) {
        console.warn("Account mapping incomplete: AR/Revenue not found. Skipping credit note posting.")
        return
      }

      // ===== للفواتير المرسلة (Sent): تحديث القيد الموجود فقط (بدون إنشاء قيود جديدة) =====
      if (invoice.status === 'sent') {
        // 📌 النمط المحاسبي الصارم: للفواتير المرسلة، المرتجع الكلي هو تصحيح للفاتورة فقط
        // ✅ المسموح فقط: تحديث بيانات الفاتورة + تحديث قيد AR الموجود
        // ❌ ممنوع تماماً: إنشاء أي قيود مالية جديدة (Revenue, VAT, Cash, COGS)

        // البحث عن القيد المحاسبي الأصلي للفاتورة (الذي تم إنشاؤه عند Sent)
        const { data: originalEntry, error: findEntryErr } = await supabase
          .from("journal_entries")
          .select("id")
          .eq("company_id", mapping.companyId)
          .eq("reference_type", "invoice")
          .eq("reference_id", invoice.id)
          .limit(1)
          .single()

        if (!findEntryErr && originalEntry) {
          // تحديث قيود القيد المحاسبي الأصلي لتعكس القيم الصفرية (مرتجع كامل)
          const { data: originalLines, error: linesErr } = await supabase
            .from("journal_entry_lines")
            .select("*")
            .eq("journal_entry_id", originalEntry.id)

          if (!linesErr && originalLines && originalLines.length > 0) {
            // تحديث كل سطر في القيد الأصلي إلى صفر (لأن المرتجع كامل)
            for (const line of originalLines) {
              // تحديث سطر AR (الذمم المدينة)
              if (line.account_id === mapping.ar) {
                await supabase
                  .from("journal_entry_lines")
                  .update({
                    debit_amount: 0,
                    credit_amount: 0,
                    description: line.description + (appLang === 'en' ? ' (fully returned)' : ' (مرتجع كامل)')
                  })
                  .eq("id", line.id)
              }
              // تحديث سطر Revenue (الإيراد)
              else if (line.account_id === mapping.revenue) {
                await supabase
                  .from("journal_entry_lines")
                  .update({
                    debit_amount: 0,
                    credit_amount: 0,
                    description: line.description + (appLang === 'en' ? ' (fully returned)' : ' (مرتجع كامل)')
                  })
                  .eq("id", line.id)
              }
              // تحديث سطر VAT (الضريبة)
              else if (mapping.vatPayable && line.account_id === mapping.vatPayable) {
                await supabase
                  .from("journal_entry_lines")
                  .update({
                    debit_amount: 0,
                    credit_amount: 0,
                    description: line.description + (appLang === 'en' ? ' (fully returned)' : ' (مرتجع كامل)')
                  })
                  .eq("id", line.id)
              }
              // تحديث سطر Shipping (الشحن) إن وجد
              else if (mapping.shippingAccount && line.account_id === mapping.shippingAccount) {
                await supabase
                  .from("journal_entry_lines")
                  .update({
                    debit_amount: 0,
                    credit_amount: 0,
                    description: line.description + (appLang === 'en' ? ' (fully returned)' : ' (مرتجع كامل)')
                  })
                  .eq("id", line.id)
              }
            }
            console.log(`✅ تم تحديث القيد المحاسبي الأصلي للفاتورة المرسلة ${invoice.invoice_number} (مرتجع كامل)`)
          }
        } else {
          console.warn(`⚠️ لم يتم العثور على القيد المحاسبي الأصلي للفاتورة ${invoice.invoice_number}`)
        }
      } else {
        // ===== للفواتير المدفوعة: إنشاء قيد credit_note جديد =====
        // Avoid duplicate credit note for this invoice
        const { data: existing } = await supabase
          .from("journal_entries")
          .select("id")
          .eq("company_id", mapping.companyId)
          .eq("reference_type", "credit_note")
          .eq("reference_id", invoiceId)
          .limit(1)
        if (!existing || existing.length === 0) {
          const { data: entry, error: entryError } = await supabase
            .from("journal_entries")
            .insert({
              company_id: mapping.companyId,
              reference_type: "credit_note",
              reference_id: invoiceId,
              entry_date: creditDate,
              description: `مذكرة دائن كاملة للفاتورة ${invoice.invoice_number}`,
            })
            .select()
            .single()
          if (entryError) throw entryError

          const lines: any[] = [
            {
              journal_entry_id: entry.id,
              account_id: mapping.revenue,
              debit_amount: invoice.subtotal,
              credit_amount: 0,
              description: "عكس الإيراد",
            },
            {
              journal_entry_id: entry.id,
              account_id: mapping.ar,
              debit_amount: 0,
              credit_amount: invoice.total_amount,
              description: "عكس الذمم المدينة",
            },
          ]
          if (mapping.vatPayable && Number(invoice.tax_amount || 0) > 0) {
            lines.splice(1, 0, {
              journal_entry_id: entry.id,
              account_id: mapping.vatPayable,
              debit_amount: Number(invoice.tax_amount || 0),
              credit_amount: 0,
              description: "عكس ضريبة مستحقة",
            })
          }
          const { error: linesErr } = await supabase.from("journal_entry_lines").insert(lines)
          if (linesErr) throw linesErr
        }
      }

      // ===== 📌 النمط المحاسبي الصارم: استرجاع المخزون بدون COGS =====
      // حسب المواصفات: لا قيد COGS في أي مرحلة
      const { data: invItems } = await supabase
        .from("invoice_items")
        .select("product_id, quantity, returned_quantity")
        .eq("invoice_id", invoiceId)

      if (invItems && invItems.length > 0 && mapping) {
        // ===== تحقق مهم: التأكد من وجود حركات بيع أصلية قبل إنشاء المرتجع =====
        const productIds = (invItems || []).filter((it: any) => it.product_id).map((it: any) => it.product_id)
        if (productIds.length > 0) {
          const { data: existingSales } = await supabase
            .from("inventory_transactions")
            .select("product_id, quantity_change")
            .eq("company_id", mapping.companyId)
            .eq("branch_id", (invoice as any).branch_id)
            .eq("warehouse_id", (invoice as any).warehouse_id)
            .eq("cost_center_id", (invoice as any).cost_center_id)
            .eq("reference_id", invoiceId)
            .eq("transaction_type", "sale")
            .in("product_id", productIds)

          const salesByProduct = new Map((existingSales || []).map((s: any) => [s.product_id, Math.abs(s.quantity_change)]))
          const missingProducts = productIds.filter((pid: string) => !salesByProduct.has(pid))

          if (missingProducts.length > 0) {
            console.warn("⚠️ Missing sale transactions for full return, creating them now...")
            const missingTx = (invItems || [])
              .filter((it: any) => it.product_id && missingProducts.includes(it.product_id))
              .map((it: any) => ({
                company_id: mapping.companyId,
                branch_id: (invoice as any).branch_id,
                warehouse_id: (invoice as any).warehouse_id,
                cost_center_id: (invoice as any).cost_center_id,
                product_id: it.product_id,
                transaction_type: "sale",
                quantity_change: -Number(it.quantity || 0),
                reference_id: invoiceId,
                notes: `بيع ${invoice.invoice_number} (إصلاح تلقائي)`,
              }))
            if (missingTx.length > 0) {
              await supabase.from("inventory_transactions").insert(missingTx)
              console.log("✅ Created missing sale transactions:", missingTx.length)
            }
          }
        }

        // ===== 🔧 إصلاح: حساب الكميات المتبقية للإرجاع (مع مراعاة المرتجعات الجزئية السابقة) =====
        // Inventory transactions: return quantities (بدون COGS)
        const invTx = (invItems || [])
          .filter((it: any) => it.product_id)
          .map((it: any) => {
            const originalQty = Number(it.quantity || 0)
            const alreadyReturned = Number(it.returned_quantity || 0)
            const remainingToReturn = originalQty - alreadyReturned

            // فقط إرجاع الكميات المتبقية (غير المرتجعة سابقاً)
            return {
              company_id: mapping.companyId,
              branch_id: (invoice as any).branch_id,
              warehouse_id: (invoice as any).warehouse_id,
              cost_center_id: (invoice as any).cost_center_id,
              product_id: it.product_id,
              transaction_type: "sale_return",
              quantity_change: remainingToReturn, // الكمية المتبقية فقط
              reference_id: invoiceId,
              notes: `مرتجع كامل للفاتورة ${invoice.invoice_number}${alreadyReturned > 0 ? ` (تم إرجاع ${alreadyReturned} مسبقاً)` : ''}`,
            }
          })
          .filter((tx: any) => tx.quantity_change > 0) // فقط الكميات الموجبة

        if (invTx.length > 0) {
          const { error: invErr } = await supabase.from("inventory_transactions").insert(invTx)
          if (invErr) console.warn("Failed inserting inventory return transactions", invErr)
          else console.log(`✅ تم إنشاء حركات المخزون للمرتجع الكامل (${invTx.length} منتج، بدون COGS)`)
        } else {
          console.log(`ℹ️ لا توجد كميات متبقية للإرجاع (تم إرجاع كل شيء مسبقاً)`)
        }
      }

      // ✅ عكس جميع المدفوعات عند المرتجع الكلي (للفواتير المدفوعة فقط)
      // 📌 للفواتير المرسلة: لا يوجد مدفوعات، لذلك لا حاجة لعكسها
      const currentPaidAmount = Number(invoice.paid_amount || 0)
      if (currentPaidAmount > 0 && invoice.status !== 'sent') {
        // إنشاء قيد عكسي لجميع المدفوعات
        const { data: paymentReversalEntry, error: prvErr } = await supabase
          .from("journal_entries")
          .insert({
            company_id: mapping.companyId,
            reference_type: "payment_reversal",
            reference_id: invoiceId,
            entry_date: creditDate,
            description: `عكس جميع المدفوعات - مرتجع كامل للفاتورة ${invoice.invoice_number} (${currentPaidAmount.toLocaleString()} جنيه)`,
          })
          .select()
          .single()

        if (!prvErr && paymentReversalEntry) {
          // جلب الحساب المصرفي/النقدي من الدفعات الأصلية
          const { data: originalPayments } = await supabase
            .from("payments")
            .select("account_id")
            .eq("invoice_id", invoiceId)
            .not("is_deleted", "eq", true)
            .limit(1)

          const paymentAccountId = originalPayments?.[0]?.account_id || mapping.cash || mapping.bank

          if (paymentAccountId) {
            // قيد عكسي: مدين الذمم (زيادة)، دائن النقد/البنك (نقص)
            await supabase.from("journal_entry_lines").insert([
              {
                journal_entry_id: paymentReversalEntry.id,
                account_id: mapping.ar,
                debit_amount: currentPaidAmount,
                credit_amount: 0,
                description: 'عكس المدفوعات - زيادة الذمم المدينة'
              },
              {
                journal_entry_id: paymentReversalEntry.id,
                account_id: paymentAccountId,
                debit_amount: 0,
                credit_amount: currentPaidAmount,
                description: 'إرجاع المدفوعات للعميل'
              },
            ])
          }
        }

        // إنشاء رصيد دائن للعميل بالمبلغ المدفوع
        await supabase.from("customer_credits").insert({
          company_id: mapping.companyId,
          customer_id: invoice.customer_id,
          invoice_id: invoice.id,
          credit_number: `CR-FULL-${Date.now()}`,
          credit_date: creditDate,
          amount: currentPaidAmount,
          remaining_amount: currentPaidAmount,
          reason: `إرجاع مدفوعات - مرتجع كامل للفاتورة ${invoice.invoice_number}`,
          status: 'active'
        })
      }

      // ===== 🔧 إصلاح: حساب returned_amount الصحيح (مع مراعاة المرتجعات الجزئية السابقة) =====
      // الإجمالي الأصلي للفاتورة = الإجمالي الحالي + المبلغ المرتجع سابقاً
      const currentTotalAmount = Number(invoice.total_amount || 0)
      const previouslyReturnedAmount = Number((invoice as any).returned_amount || 0)
      const originalTotalAmount = currentTotalAmount + previouslyReturnedAmount

      // المبلغ المرتجع الكلي = الإجمالي الأصلي (لأننا نرجع كل شيء)
      const finalReturnedAmount = originalTotalAmount

      console.log(`📊 حساب المرتجع الكامل:`)
      console.log(`   - الإجمالي الحالي: ${currentTotalAmount}`)
      console.log(`   - المرتجع سابقاً: ${previouslyReturnedAmount}`)
      console.log(`   - الإجمالي الأصلي: ${originalTotalAmount}`)
      console.log(`   - المرتجع الكلي النهائي: ${finalReturnedAmount}`)

      // ===== 🔧 تحديث الفاتورة: الحالة تصبح fully_returned بدلاً من cancelled =====
      // 📌 النهج المحاسبي الاحترافي: الفاتورة تبقى موجودة للتدقيق والمراجعة
      // Update invoice to reflect credit application
      const { error: updErr } = await supabase
        .from("invoices")
        .update({
          subtotal: 0,
          tax_amount: 0,
          total_amount: 0,
          paid_amount: 0,
          returned_amount: finalReturnedAmount, // ✅ الإجمالي الأصلي الكامل
          return_status: 'full',
          status: "fully_returned" // ✅ fully_returned بدلاً من cancelled (للاحتفاظ بسجل الفاتورة)
        })
        .eq("id", invoice.id)
      if (updErr) throw updErr

      // ===== 🔄 مزامنة أمر البيع المرتبط =====
      await updateLinkedSalesOrderStatus(invoice.id)

      await loadInvoice()
      setShowCredit(false)
      toast({
        title: appLang === 'en' ? 'Success' : 'تم بنجاح',
        description: appLang === 'en'
          ? `Full return processed. ${currentPaidAmount > 0 ? `Customer credit of ${currentPaidAmount.toLocaleString()} EGP created.` : ''}`
          : `تم المرتجع الكامل. ${currentPaidAmount > 0 ? `تم إنشاء رصيد دائن للعميل بقيمة ${currentPaidAmount.toLocaleString()} جنيه.` : ''}`,
      })
    } catch (err) {
      console.error("Error issuing full credit note:", err)
      toast({
        variant: "destructive",
        title: appLang === 'en' ? 'Error' : 'خطأ',
        description: appLang === 'en' ? 'Failed to process full return' : 'فشل في معالجة المرتجع الكامل',
      })
    }
  }

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
        recipient_name: invoice.customers?.name || "",
        recipient_phone: invoice.customers?.phone || "",
        recipient_address: invoice.customers?.address || "",
        recipient_city: invoice.customers?.city || "",
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
                  name: shipmentData.recipient_name || invoice.customers?.name || '',
                  phone: shipmentData.recipient_phone || invoice.customers?.phone || '',
                  address: shipmentData.recipient_address || invoice.customers?.address || '',
                  city: shipmentData.recipient_city || invoice.customers?.city || '',
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

      // ===== للفواتير المرسلة (Sent): تحديث الفاتورة + AR فقط (بدون Revenue/VAT/Cash/COGS) =====
      if (invoice.status === 'sent') {
        // 
        // 📌 تنبيه هام جدًا – معالجة مرتجعات فواتير المبيعات (Sent Invoices)
        // عند حدوث مرتجع جزئي أو كلي على فاتورة مبيعات حالتها مرسلة (Sent) يجب الالتزام بالآتي بدقة تامة:
        //
        // ✅ المسموح فقط:
        //    - تعديل بيانات الفاتورة نفسها: تحديث الكميات، الصافي والإجمالي
        //    - تحديث ذمم العميل (AR): تعديل رصيد العميل ليعكس القيمة الصحيحة بعد المرتجع
        //    - تخفيض المبلغ المستحق على العميل بدقة دون أي زيادات أو ازدواج
        //
        // ❌ ممنوع تمامًا:
        //    - عدم إنشاء أي قيد مالي جديد في هذه المرحلة
        //    - عدم إنشاء قيد Cash
        //    - عدم إنشاء قيد COGS
        //    - عدم إنشاء قيد Revenue إضافي
        //    - عدم المساس بأي فواتير أو قيود أخرى غير الفاتورة محل المرتجع
        //
        // 📌 التزام محاسبي صارم:
        //    - الحفاظ على النمط المحاسبي الأصلي المعتمد في المشروع
        //    - المرتجع في حالة Sent هو تصحيح للفاتورة وليس حدثًا ماليًا مستقلًا
        //    - الهدف أن تعكس الفاتورة القيم الصحيحة فقط دون أي تأثير مالي غير مطلوب
        //

        // البحث عن القيد المحاسبي الأصلي للفاتورة (إن وجد)
        const { data: originalEntry, error: findEntryErr } = await supabase
          .from("journal_entries")
          .select("id")
          .eq("company_id", mapping.companyId)
          .eq("reference_type", "invoice")
          .eq("reference_id", invoice.id)
          .limit(1)
          .single()

        if (findEntryErr || !originalEntry) {
          console.warn(`⚠️ لم يتم العثور على القيد المحاسبي الأصلي للفاتورة ${invoice.invoice_number}`)
          // في حالة عدم وجود قيد أصلي، نكتفي بتحديث الفاتورة فقط
          console.log(`✅ تم تحديث الفاتورة فقط (لا يوجد قيد محاسبي أصلي لتحديثه)`)
          originalInvoiceEntryId = null
        } else {
          originalInvoiceEntryId = originalEntry.id
          // ✅ تحديث قيد AR فقط (بدون Revenue/VAT) للفواتير المرسلة
          const { data: originalLines, error: linesErr } = await supabase
            .from("journal_entry_lines")
            .select("*")
            .eq("journal_entry_id", originalEntry.id)

          if (linesErr) {
            console.error("❌ خطأ في جلب قيود القيد الأصلي:", linesErr)
            throw new Error(appLang === 'en'
              ? 'Failed to fetch original journal entry lines'
              : 'فشل في جلب قيود القيد المحاسبي الأصلي')
          }

          if (originalLines && originalLines.length > 0) {
            // حساب القيم الجديدة للفاتورة
            const newInvoiceTotal = Math.max(0, Number(invoice.total_amount || 0) - returnTotal)

            // ✅ تحديث سطر AR فقط (الذمم المدينة) - بدون تعديل Revenue أو VAT
            for (const line of originalLines) {
              // ✅ تحديث سطر AR (الذمم المدينة) فقط
              if (line.account_id === mapping.ar) {
                const newDebit = newInvoiceTotal // AR يجب أن يعكس المبلغ الجديد للفاتورة
                const newCredit = 0

                // تحديث السطر فقط إذا تغيرت القيم
                if (newDebit !== line.debit_amount || newCredit !== line.credit_amount) {
                  const { error: updateLineErr } = await supabase
                    .from("journal_entry_lines")
                    .update({
                      debit_amount: newDebit,
                      credit_amount: newCredit,
                      description: line.description + (appLang === 'en' ? ' (adjusted for return)' : ' (معدل للمرتجع)')
                    })
                    .eq("id", line.id)

                  if (updateLineErr) {
                    console.error(`❌ خطأ في تحديث سطر AR ${line.id}:`, updateLineErr)
                    throw new Error(appLang === 'en'
                      ? `Failed to update AR journal entry line: ${updateLineErr.message}`
                      : `فشل في تحديث سطر AR: ${updateLineErr.message}`)
                  }
                }
              }
              // ❌ لا نعدل Revenue أو VAT أو أي حسابات أخرى للفواتير المرسلة
              // المرتجع في حالة Sent هو تصحيح للفاتورة فقط، وليس حدثًا ماليًا مستقلًا
            }

            console.log(`✅ تم تحديث قيد AR فقط للفاتورة المرسلة ${invoice.invoice_number} (بدون Revenue/VAT)`)
          }
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

      // ===== للفواتير المدفوعة: إنشاء قيود مالية كاملة =====
      if (requiresJournalEntries(invoice.status)) {
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

        if (lines.length > 0) {
          const { error: linesErr } = await supabase.from("journal_entry_lines").insert(lines)
          if (linesErr) throw linesErr
        }

        // ===== 📌 النمط المحاسبي الصارم: لا COGS Reversal =====
        // حسب المواصفات: لا قيد COGS في أي مرحلة
        // لذلك لا نحتاج لعكس COGS عند المرتجع
        console.log(`✅ تم إنشاء قيد المرتجع (بدون COGS) للفاتورة ${invoice.invoice_number}`)
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
        // إنشاء قيد عكسي للمدفوعات
        const { data: paymentReversalEntry, error: prvErr } = await supabase
          .from("journal_entries")
          .insert({
            company_id: mapping.companyId,
            reference_type: "payment_reversal",
            reference_id: invoice.id,
            entry_date: new Date().toISOString().slice(0, 10),
            description: appLang === 'en'
              ? `Payment reversal for return - Invoice ${invoice.invoice_number} (${excessPayment.toLocaleString()} EGP)`
              : `عكس مدفوعات للمرتجع - الفاتورة ${invoice.invoice_number} (${excessPayment.toLocaleString()} جنيه)`,
          })
          .select()
          .single()

        if (!prvErr && paymentReversalEntry) {
          // تحديد الحساب المصرفي/النقدي المستخدم في الدفعات الأصلية
          const { data: originalPayments } = await supabase
            .from("payments")
            .select("account_id")
            .eq("invoice_id", invoice.id)
            .not("is_deleted", "eq", true)
            .limit(1)

          const paymentAccountId = originalPayments?.[0]?.account_id || mapping.cash || mapping.bank

          // قيد: مدين الحساب المصرفي/النقدي (إرجاع المال)، دائن الذمم المدينة
          // ملاحظة: في المرتجع، نحن بالفعل أنشأنا قيد يقلل الذمم (دائن AR)
          // لكن يجب أيضاً عكس الأثر على الحساب المصرفي
          if (returnMethod === 'cash' && paymentAccountId) {
            // إرجاع نقدي: مدين الذمم المدينة (زيادة)، دائن النقد (نقص)
            await supabase.from("journal_entry_lines").insert([
              {
                journal_entry_id: paymentReversalEntry.id,
                account_id: mapping.ar,
                debit_amount: excessPayment,
                credit_amount: 0,
                description: appLang === 'en' ? 'AR increase for payment refund' : 'زيادة الذمم لإرجاع المدفوعات'
              },
              {
                journal_entry_id: paymentReversalEntry.id,
                account_id: paymentAccountId,
                debit_amount: 0,
                credit_amount: excessPayment,
                description: appLang === 'en' ? 'Cash refund to customer' : 'إرجاع نقدي للعميل'
              },
            ])
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

      // If credit_note method, create customer credit record
      // 📌 للفواتير المرسلة: لا ننشئ customer credit (لأنه لا يوجد مدفوعات)
      if (returnMethod === 'credit_note' && invoice.status !== 'sent') {
        // إذا كان هناك مبلغ زائد مدفوع، نضيفه كرصيد للعميل
        const creditAmount = excessPayment > 0 ? excessPayment : returnTotal
        await supabase.from("customer_credits").insert({
          company_id: mapping.companyId,
          customer_id: invoice.customer_id,
          invoice_id: invoice.id,
          credit_number: `CR-${Date.now()}`,
          credit_date: new Date().toISOString().slice(0, 10),
          amount: creditAmount,
          remaining_amount: creditAmount,
          reason: returnNotes || (appLang === 'en'
            ? `Sales return${excessPayment > 0 ? ' (includes payment refund)' : ''}`
            : `مرتجع مبيعات${excessPayment > 0 ? ' (يشمل إرجاع مدفوعات)' : ''}`),
          status: 'active'
        })
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

  const recordInvoicePayment = async (amount: number, dateStr: string, method: string, reference: string) => {
    try {
      if (!invoice) return

      // ✅ منع الضغط المتكرر على زر الحفظ
      if (savingPayment) {
        console.log("جاري حفظ الدفعة بالفعل...")
        return
      }
      setSavingPayment(true)

      // تأكيد اختيار حساب قبل الحفظ
      if (!paymentAccountId) {
        toast({ title: "بيانات غير مكتملة", description: "يرجى اختيار حساب النقد/البنك للدفعة", variant: "destructive" })
        setSavingPayment(false)
        return
      }

      // ✅ تحديث الجلسة أولاً لتجنب انتهاء الصلاحية
      await supabase.auth.refreshSession()

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        toast({ title: "انتهت الجلسة", description: "يرجى تسجيل الدخول مرة أخرى", variant: "destructive" })
        setSavingPayment(false)
        window.location.href = "/auth/login"
        return
      }

      // استخدام getActiveCompanyId لدعم المستخدمين المدعوين
      const { getActiveCompanyId } = await import("@/lib/company")
      const payCompanyId = await getActiveCompanyId(supabase)
      if (!payCompanyId) throw new Error("لم يتم العثور على الشركة")

      // ✅ التحقق من عدم وجود دفعة مكررة (نفس المبلغ والمرجع في نفس اليوم)
      const { data: existingPayments } = await supabase
        .from("payments")
        .select("id")
        .eq("invoice_id", invoice.id)
        .eq("amount", amount)
        .eq("payment_date", dateStr)
        .eq("reference_number", reference || "")
        .limit(1)

      if (existingPayments && existingPayments.length > 0) {
        toast({ title: "تحذير", description: "توجد دفعة مشابهة مسجلة بالفعل", variant: "destructive" })
        setSavingPayment(false)
        return
      }

      // 1) إدراج سجل الدفع
      const basePayload: any = {
        company_id: payCompanyId,
        customer_id: invoice.customer_id,
        invoice_id: invoice.id,
        payment_date: dateStr,
        amount,
        payment_method: method,
        reference_number: reference || null,
        notes: `دفعة على الفاتورة ${invoice.invoice_number}`,
        account_id: paymentAccountId || null,
      }
      {
        const { error: payErr } = await supabase.from("payments").insert(basePayload)
        if (payErr) {
          const msg = String(payErr?.message || "")
          const mentionsAccountId = msg.toLowerCase().includes("account_id")
          const looksMissingColumn = mentionsAccountId && (
            msg.toLowerCase().includes("does not exist") ||
            msg.toLowerCase().includes("not found") ||
            msg.toLowerCase().includes("schema cache") ||
            msg.toLowerCase().includes("column")
          )
          if (looksMissingColumn) {
            const payload2 = { ...basePayload }
            delete (payload2 as any).account_id
            const { error: retryErr } = await supabase.from("payments").insert(payload2)
            if (retryErr) throw retryErr
          } else {
            throw payErr
          }
        }
      }

      // 2) تحديث الفاتورة (المبلغ المدفوع والحالة)
      const newPaid = Number(invoice.paid_amount || 0) + Number(amount || 0)
      const remaining = Number(invoice.total_amount || 0) - newPaid
      const newStatus = remaining <= 0 ? "paid" : "partially_paid"
      const { error: invErr } = await supabase
        .from("invoices")
        .update({ paid_amount: newPaid, status: newStatus })
        .eq("id", invoice.id)
      if (invErr) throw invErr

      // ===== 3) إنشاء القيود المحاسبية =====
      // التحقق من وجود قيد دفع سابق لهذه الفاتورة
      const mapping = await findAccountIds()
      if (!mapping) {
        console.error("فشل في الحصول على mapping الحسابات")
        throw new Error("فشل في الحصول على إعدادات الحسابات")
      }

      const { data: existingPaymentJournal } = await supabase
        .from("journal_entries")
        .select("id")
        .eq("company_id", mapping.companyId)
        .eq("reference_type", "invoice_payment")
        .eq("reference_id", invoice.id)
        .limit(1)

      const hasExistingPaymentJournal = existingPaymentJournal && existingPaymentJournal.length > 0

      // ===== التحقق من وجود قيد الفاتورة (حماية ضد الدفع بدون قيد فاتورة) =====
      const { data: existingInvoiceEntry } = await supabase
        .from("journal_entries")
        .select("id")
        .eq("company_id", mapping.companyId)
        .eq("reference_type", "invoice")
        .eq("reference_id", invoice.id)
        .limit(1)

      const hasExistingInvoiceEntry = existingInvoiceEntry && existingInvoiceEntry.length > 0

      // ===== 📌 ERP Accounting Core Logic (MANDATORY SPECIFICATION) =====
      // النمط المحاسبي الصارم: القيود تُنشأ عند الدفع فقط
      // Sent = مخزون فقط، ❌ لا قيد
      // Paid = قيد AR/Revenue + قيد السداد (Cash/AR)

      // 📌 إنشاء قيد الفاتورة (AR/Revenue) عند أول دفعة (Cash Basis)
      if (!hasExistingInvoiceEntry) {
        console.log("📌 إنشاء قيد AR/Revenue عند الدفع (Cash Basis)")
        await postARRevenueJournal()
      }

      // ✅ إنشاء قيد الدفع فقط (Cash/AR)
      if (!mapping.ar) {
        console.error("حساب الذمم المدينة غير موجود")
        throw new Error("حساب الذمم المدينة غير موجود")
      }

      const cashAccountId = paymentAccountId || mapping.cash || mapping.bank
      if (!cashAccountId) {
        console.error("حساب النقد/البنك غير موجود")
        throw new Error("حساب النقد/البنك غير موجود")
      }

      const { data: entry, error: entryError } = await supabase
        .from("journal_entries")
        .insert({
          company_id: mapping.companyId,
          reference_type: "invoice_payment",
          reference_id: invoice.id,
          entry_date: dateStr,
          description: `دفعة للفاتورة ${invoice.invoice_number}${reference ? ` (${reference})` : ""} (${amount} جنيه)`,
        })
        .select()
        .single()

      if (entryError) {
        console.error("خطأ في إنشاء قيد الدفع:", entryError)
        throw entryError
      }

      const { error: linesErr } = await supabase.from("journal_entry_lines").insert([
        {
          journal_entry_id: entry.id,
          account_id: cashAccountId,
          debit_amount: amount,
          credit_amount: 0,
          description: "نقد/بنك",
        },
        {
          journal_entry_id: entry.id,
          account_id: mapping.ar,
          debit_amount: 0,
          credit_amount: amount,
          description: "الذمم المدينة",
        },
      ])

      if (linesErr) {
        console.error("خطأ في إنشاء سطور قيد الدفع:", linesErr)
        throw linesErr
      }

      console.log(`✅ تم إنشاء قيد الدفع (Cash/AR) - Cash Basis`)

      // ===== 📌 4) تصفية بضائع لدى الغير وتسجيل COGS =====
      // عند الدفع: إزالة من بضائع لدى الغير + تسجيل تكلفة البضاعة المباعة
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
        // إنشاء قيد COGS
        const { data: cogsEntry } = await supabase
          .from("journal_entries")
          .insert({
            company_id: mapping.companyId,
            reference_type: "invoice_cogs",
            reference_id: invoice.id,
            entry_date: dateStr,
            description: `تكلفة البضاعة المباعة - ${invoice.invoice_number} (دفعة ${amount})`,
            branch_id: invoice.branch_id || null,
            cost_center_id: invoice.cost_center_id || null,
          })
          .select()
          .single()

        if (cogsEntry && mapping.cogs && mapping.inventory) {
          await supabase.from("journal_entry_lines").insert([
            {
              journal_entry_id: cogsEntry.id,
              account_id: mapping.cogs,
              debit_amount: clearResult.totalCOGS,
              credit_amount: 0,
              description: "تكلفة البضاعة المباعة",
              branch_id: invoice.branch_id || null,
              cost_center_id: invoice.cost_center_id || null,
            },
            {
              journal_entry_id: cogsEntry.id,
              account_id: mapping.inventory,
              debit_amount: 0,
              credit_amount: clearResult.totalCOGS,
              description: "خصم من المخزون",
              branch_id: invoice.branch_id || null,
              cost_center_id: invoice.cost_center_id || null,
            },
          ])
          console.log(`✅ تم تسجيل COGS: ${clearResult.totalCOGS} عند الدفع`)
        }
      }

      // ===== 5) ✅ إنشاء COGS Transactions إذا لم تكن موجودة (للـ Direct Sales - بدون شركة شحن) =====
      // التحقق من وجود COGS transactions (إذا لم تكن موجودة، يتم إنشاؤها الآن)
      const { data: existingCOGS } = await supabase
        .from("cogs_transactions")
        .select("id")
        .eq("source_id", invoice.id)
        .eq("source_type", "invoice")
        .limit(1)
      
      if (!existingCOGS || existingCOGS.length === 0) {
        // التحقق من وجود شركة شحن (إذا كان هناك شركة شحن، COGS يتم في clearThirdPartyInventory)
        const shippingValidation = await validateShippingProvider(supabase, invoice.id)
        const hasShippingProvider = shippingValidation.valid && shippingValidation.shippingProviderId
        
        if (!hasShippingProvider) {
          // ✅ Direct Sales: إنشاء COGS الآن (FIFO + COGS Transactions)
          console.log("📌 Invoice paid - calling deductInventoryOnly() to create COGS...")
          await deductInventoryOnly()
          console.log(`✅ INV Paid: تم خصم المخزون وإنشاء COGS Transactions`)
        }
      }

      // ===== 6) حساب البونص إذا أصبحت الفاتورة مدفوعة بالكامل =====
      if (newStatus === "paid" && mapping?.companyId) {
        try {
          const bonusRes = await fetch("/api/bonuses", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ invoiceId: invoice.id, companyId: mapping.companyId })
          })
          const bonusData = await bonusRes.json()
          if (bonusRes.ok && bonusData.bonus) {
            console.log("تم حساب البونص:", bonusData.bonus.bonus_amount)
          } else if (bonusData.disabled) {
            // نظام البونص معطل - لا نعرض خطأ
          } else if (bonusData.error && !bonusData.error.includes("already calculated")) {
            console.warn("تحذير البونص:", bonusData.error)
          }
        } catch (bonusErr) {
          console.warn("تعذر حساب البونص:", bonusErr)
          // لا نوقف العملية بسبب خطأ في البونص
        }
      }

      // 📝 Audit Log: تسجيل عملية الدفع
      if (user?.id && invoice.company_id) {
        const { error: auditErr3 } = await supabase.from("audit_logs").insert({
          company_id: invoice.company_id,
          user_id: user.id,
          action: "UPDATE",
          target_table: "invoices",
          record_id: invoice.id,
          record_identifier: invoice.invoice_number,
          old_data: { 
            status: invoice.status,
            paid_amount: invoice.paid_amount
          },
          new_data: { 
            status: newStatus,
            paid_amount: newPaid,
            payment_amount: amount,
            third_party_cleared: clearResult.success
          }
        })
        if (auditErr3) console.warn("Audit log failed:", auditErr3)
      }

      // أعِد التحميل وأغلق النموذج
      await loadInvoice()
      setShowPayment(false)
      setPaymentAccountId("")
      toast({ title: "تم تسجيل الدفعة بنجاح", description: "تم إضافة قيد الدفع (Cash/AR)" })
    } catch (err) {
      console.error("خطأ أثناء تسجيل الدفعة:", err)
      toast({ title: "خطأ", description: "تعذر تسجيل الدفعة", variant: "destructive" })
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
  // إذا كان هناك shipping_provider_id → نقل إلى بضائع لدى الغير
  // وإلا → خصم مباشر من المخزون (النمط القديم)
  const deductInventoryOnly = async () => {
    try {
      if (!invoice) return
      const mapping = await findAccountIds()
      if (!mapping) {
        console.error("❌ Failed to get account mapping - mapping is null")
        return
      }

      console.log("🔍 Account mapping retrieved:", {
        companyId: mapping.companyId,
        hasAR: !!mapping.ar,
        hasRevenue: !!mapping.revenue,
        hasInventory: !!mapping.inventory
      })

      // التحقق من عدم وجود معاملات مخزون سابقة لهذه الفاتورة
      const { data: existingTx } = await supabase
        .from("inventory_transactions")
        .select("id")
        .eq("reference_id", invoiceId)
        .eq("transaction_type", "sale")
        .limit(1)
      if (existingTx && existingTx.length > 0) return

      // 📌 التحقق من وجود شركة شحن - نظام بضائع لدى الغير
      const shippingValidation = await validateShippingProvider(supabase, invoiceId)

      if (shippingValidation.valid && shippingValidation.shippingProviderId) {
        // ✅ نظام بضائع لدى الغير: نقل من المستودع → بضائع لدى الغير
        const success = await transferToThirdParty({
          supabase,
          companyId: mapping.companyId,
          invoiceId,
          shippingProviderId: shippingValidation.shippingProviderId,
          branchId: invoice.branch_id || null,
          costCenterId: invoice.cost_center_id || null,
          warehouseId: invoice.warehouse_id || null
        })

        if (success) {
          console.log(`✅ INV ${invoice.invoice_number}: تم نقل البضائع إلى "${shippingValidation.providerName}" (بضائع لدى الغير)`)
        }
        return
      }

      // ✅ ERP Professional: خصم المخزون باستخدام FIFO + COGS Transactions
      const { data: invItems } = await supabase
        .from("invoice_items")
        .select("product_id, quantity, products(item_type)")
        .eq("invoice_id", invoiceId)

      const productItems = (invItems || []).filter((it: any) => !!it.product_id && it.products?.item_type !== 'service')

      // التحقق من الحوكمة (إلزامي لـ COGS)
      if (!invoice.branch_id || !invoice.cost_center_id || !invoice.warehouse_id) {
        console.error("❌ COGS requires governance: branch_id, cost_center_id, warehouse_id must be set")
        // Fallback: استخدام الطريقة القديمة بدون COGS
        const invTx = productItems.map((it: any) => ({
          company_id: mapping.companyId,
          product_id: it.product_id,
          transaction_type: "sale",
          quantity_change: -Number(it.quantity || 0),
          reference_id: invoiceId,
          notes: `بيع ${invoice.invoice_number} (مرسلة - بدون COGS - missing governance)`,
          branch_id: invoice.branch_id || null,
          cost_center_id: invoice.cost_center_id || null,
          warehouse_id: invoice.warehouse_id || null,
        }))
        if (invTx.length > 0) {
          const { error: invErr } = await supabase.from("inventory_transactions").insert(invTx)
          if (invErr) console.error("❌ Failed inserting inventory transactions:", invErr)
        }
        return
      }

      // ✅ استخدام FIFO + COGS Transactions لكل منتج
      const { data: { user } } = await supabase.auth.getUser()
      let totalCOGSCreated = 0

      for (const item of productItems) {
        const fifoResult = await consumeFIFOLotsWithCOGS(supabase, {
          companyId: mapping.companyId,
          branchId: invoice.branch_id!,
          costCenterId: invoice.cost_center_id!,
          warehouseId: invoice.warehouse_id!,
          productId: item.product_id,
          quantity: Number(item.quantity || 0),
          sourceType: 'invoice',
          sourceId: invoiceId,
          transactionDate: invoice.invoice_date || new Date().toISOString().split('T')[0],
          createdByUserId: user?.id
        })

        if (fifoResult.success) {
          totalCOGSCreated += fifoResult.cogsTransactionIds.length
          console.log(`✅ COGS created for product ${item.product_id}: ${fifoResult.cogsTransactionIds.length} transactions, total COGS: ${fifoResult.totalCOGS}`)
        } else {
          console.error(`❌ Failed to create COGS for product ${item.product_id}:`, fifoResult.error)
        }
      }

      // إنشاء inventory_transactions للأرشيف (للتوافق مع النظام القديم)
      const invTx = productItems.map((it: any) => ({
        company_id: mapping.companyId,
        product_id: it.product_id,
        transaction_type: "sale",
        quantity_change: -Number(it.quantity || 0),
        reference_id: invoiceId,
        notes: `بيع ${invoice.invoice_number} (FIFO + COGS)`,
        branch_id: invoice.branch_id || null,
        cost_center_id: invoice.cost_center_id || null,
        warehouse_id: invoice.warehouse_id || null,
      }))

      if (invTx.length > 0) {
        const { error: invErr } = await supabase.from("inventory_transactions").insert(invTx)
        if (invErr) {
          console.error("❌ Failed inserting inventory transactions:", invErr)
        } else {
          console.log(`✅ Created ${totalCOGSCreated} COGS transactions for invoice ${invoice.invoice_number}`)
        }
      }
    } catch (err) {
      console.error("Error deducting inventory for invoice:", err)
    }
  }

  // ===== دالة عكس جميع القيود المحاسبية للفاتورة =====
  // تُستخدم عند إلغاء الفاتورة أو إعادتها لمسودة
  const reverseInvoiceJournals = async () => {
    try {
      if (!invoice) return
      const mapping = await findAccountIds()
      if (!mapping) return

      // حذف قيود الفاتورة الأصلية (جميع الأنواع)
      // 📌 النمط المحاسبي الصارم: لا invoice_cogs
      const { data: invoiceEntries } = await supabase
        .from("journal_entries")
        .select("id")
        .eq("company_id", mapping.companyId)
        .eq("reference_id", invoiceId)
        .in("reference_type", ["invoice", "invoice_payment", "invoice_ar"])

      if (invoiceEntries && invoiceEntries.length > 0) {
        const entryIds = invoiceEntries.map((e: any) => e.id)
        // حذف سطور القيود أولاً
        await supabase.from("journal_entry_lines").delete().in("journal_entry_id", entryIds)
        // ثم حذف القيود نفسها
        await supabase.from("journal_entries").delete().in("id", entryIds)
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

      // التحقق من عدم وجود قيد إيراد سابق للفاتورة
      const { data: existingInvoiceEntry } = await supabase
        .from("journal_entries")
        .select("id")
        .eq("company_id", mapping.companyId)
        .eq("reference_type", "invoice")
        .eq("reference_id", invoiceId)
        .limit(1)

      // ===== 1) قيد المبيعات والذمم (للتوافق مع البيانات القديمة) =====
      // Debit: AR / Credit: Revenue + VAT + Shipping
      // هذا يحدث فقط إذا لم يكن هناك قيد فاتورة سابق (بيانات قديمة)
      if (!existingInvoiceEntry || existingInvoiceEntry.length === 0) {
        const { data: entry, error: entryError } = await supabase
          .from("journal_entries")
          .insert({
            company_id: mapping.companyId,
            reference_type: "invoice",
            reference_id: invoiceId,
            entry_date: invoice.invoice_date, // تاريخ الفاتورة وليس الدفع
            description: `فاتورة مبيعات ${invoice.invoice_number}`,
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
          console.log(`✅ تم إنشاء قيد الإيراد للفاتورة ${invoice.invoice_number} (توافق مع بيانات قديمة)`)
        }
      }

      // 📌 النمط المحاسبي الصارم: لا COGS
      // COGS يُحسب عند الحاجة من cost_price × quantity المباع

      // ===== 4) قيد الدفع =====
      const selectedAccount = paymentAccountId || mapping.cash || mapping.bank
      if (selectedAccount && paymentAmount > 0) {
        const { data: payEntry, error: payError } = await supabase
          .from("journal_entries")
          .insert({
            company_id: mapping.companyId,
            reference_type: "invoice_payment",
            reference_id: invoiceId,
            entry_date: paymentDate,
            description: `دفعة على فاتورة ${invoice.invoice_number}`,
          })
          .select()
          .single()

        if (!payError && payEntry) {
          await supabase.from("journal_entry_lines").insert([
            // من ح/ البنك أو الصندوق
            {
              journal_entry_id: payEntry.id,
              account_id: selectedAccount,
              debit_amount: paymentAmount,
              credit_amount: 0,
              description: "النقد/البنك",
            },
            // إلى ح/ الذمم المدينة
            {
              journal_entry_id: payEntry.id,
              account_id: mapping.ar,
              debit_amount: 0,
              credit_amount: paymentAmount,
              description: "الذمم المدينة",
            },
          ])
        }
      }
    } catch (err) {
      console.error("Error posting all invoice journals:", err)
    }
  }

  // التحقق من صلاحية القراءة أولاً (الأولوية للأمان)
  if (permRead === false) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <Sidebar />
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
            <Button onClick={() => router.back()} className="mt-4" variant="outline">
              {appLang === 'en' ? 'Go Back' : 'العودة'}
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
        <Sidebar />
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 print-area overflow-x-hidden">
          <p className="text-center py-8">جاري التحميل...</p>
        </main>
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <Sidebar />
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
          <p className="text-center py-8 text-red-600">{appLang === 'en' ? 'Invoice not found' : 'لم يتم العثور على الفاتورة'}</p>
        </main>
      </div>
    )
  }

  // Calculate totals for payments and returns
  const totalPaidAmount = invoicePayments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
  // 🔧 إصلاح: المرتجعات تؤخذ من invoices.returned_amount (المصدر الموثوق)
  // لأن invoice.total_amount أصلاً تم تقليله بقيمة المرتجع
  const totalReturnsAmount = Number((invoice as any).returned_amount || 0)
  // صافي المتبقي = إجمالي الفاتورة الحالي (بعد المرتجعات) - المدفوع
  const netRemainingAmount = Math.max(0, invoice.total_amount - totalPaidAmount)

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
      <Sidebar />
      {/* Main Content - تحسين للهاتف */}
      <main ref={printAreaRef} className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 print-area overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 print:space-y-4 max-w-full">
          {/* ✅ Unified Page Header */}
          <PageHeaderDetail
            title={appLang === 'en' ? `Invoice #${invoice.invoice_number}` : `الفاتورة #${invoice.invoice_number}`}
            description={appLang === 'en' ? `Issue date: ${new Date(invoice.invoice_date).toLocaleDateString('en')}` : `تاريخ الإصدار: ${new Date(invoice.invoice_date).toLocaleDateString('ar')}`}
            onDownloadPDF={handleDownloadPDF}
            onPrint={handlePrint}
            previousHref={prevInvoiceId || undefined}
            previousLabel={appLang === 'en' ? 'Previous Invoice' : 'الفاتورة السابقة'}
            nextHref={nextInvoiceId || undefined}
            nextLabel={appLang === 'en' ? 'Next Invoice' : 'الفاتورة التالية'}
            editHref={`/invoices/${invoice.id}/edit`}
            editLabel={appLang === 'en' ? 'Edit' : 'تعديل'}
            editDisabled={!permUpdate || invoice.status === 'paid' || invoice.status === 'partially_paid'}
            editTitle={
              !permUpdate
                ? (appLang === 'en' ? 'No permission to edit' : 'لا توجد صلاحية للتعديل')
                : (invoice.status === 'paid' || invoice.status === 'partially_paid')
                  ? (appLang === 'en' ? 'Cannot edit paid invoice. Use Returns instead.' : 'لا يمكن تعديل الفاتورة المدفوعة. استخدم المرتجعات بدلاً من ذلك.')
                  : undefined
            }
            backHref="/invoices"
            backLabel={appLang === 'en' ? 'Back' : 'العودة'}
            lang={appLang}
          />

          <Card ref={invoiceContentRef} className="print:shadow-none print:border-0 bg-white">
            <CardContent className="pt-6 space-y-6 print:p-0">
              {/* رأس الفاتورة - Invoice Header */}
              <div className="border-b-2 border-gray-200 pb-6 print:pb-4">
                <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                  {/* معلومات الشركة */}
                  <div className="flex items-start gap-4">
                    {companyLogo ? (
                      <img src={companyLogo} crossOrigin="anonymous" alt="Company Logo" className="h-20 w-20 rounded object-cover border print:h-16 print:w-16" />
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
                    {/* اسم العميل */}
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-gray-900 dark:text-white print:text-black">{invoice.customers?.name || '-'}</span>
                    </div>
                    {/* رقم التليفون */}
                    {invoice.customers?.phone && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-500 dark:text-gray-400 print:text-gray-600">{appLang === 'en' ? 'Phone:' : 'الهاتف:'}</span>
                        <span className="font-medium text-gray-700 dark:text-gray-300 print:text-gray-800 dir-ltr">{invoice.customers.phone}</span>
                      </div>
                    )}
                    {/* البريد الإلكتروني */}
                    {invoice.customers?.email && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-500 dark:text-gray-400 print:text-gray-600">{appLang === 'en' ? 'Email:' : 'البريد:'}</span>
                        <span className="font-medium text-gray-700 dark:text-gray-300 print:text-gray-800">{invoice.customers.email}</span>
                      </div>
                    )}
                    {/* العنوان */}
                    {invoice.customers?.address && (
                      <div className="flex items-start gap-2 text-sm">
                        <span className="text-gray-500 dark:text-gray-400 print:text-gray-600">{appLang === 'en' ? 'Address:' : 'العنوان:'}</span>
                        <span className="font-medium text-gray-700 dark:text-gray-300 print:text-gray-800">
                          {invoice.customers.address}
                          {invoice.customers.city && `, ${invoice.customers.city}`}
                          {invoice.customers.country && `, ${invoice.customers.country}`}
                        </span>
                      </div>
                    )}
                    {/* الرقم الضريبي */}
                    {invoice.customers?.tax_id && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-500 dark:text-gray-400 print:text-gray-600">{appLang === 'en' ? 'Tax ID:' : 'الرقم الضريبي:'}</span>
                        <span className="font-medium text-gray-700 dark:text-gray-300 print:text-gray-800">{invoice.customers.tax_id}</span>
                      </div>
                    )}
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
                        <tr>
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
                    <tr className="bg-blue-600 text-white print:bg-blue-100 print:text-blue-900">
                      <th className="px-3 py-2 text-right border border-blue-500 print:border-gray-300">#</th>
                      <th className="px-3 py-2 text-right border border-blue-500 print:border-gray-300">{appLang === 'en' ? 'Product' : 'المنتج'}</th>
                      <th className="px-3 py-2 text-center border border-blue-500 print:border-gray-300">{appLang === 'en' ? 'Qty' : 'الكمية'}</th>
                      <th className="px-3 py-2 text-center border border-blue-500 print:border-gray-300">{appLang === 'en' ? 'Returned' : 'المرتجع'}</th>
                      <th className="px-3 py-2 text-center border border-blue-500 print:border-gray-300">{appLang === 'en' ? 'Net Qty' : 'الصافي'}</th>
                      <th className="px-3 py-2 text-right border border-blue-500 print:border-gray-300">{appLang === 'en' ? 'Unit Price' : 'سعر الوحدة'}</th>
                      <th className="px-3 py-2 text-center border border-blue-500 print:border-gray-300">{appLang === 'en' ? 'Disc%' : 'خصم%'}</th>
                      <th className="px-3 py-2 text-center border border-blue-500 print:border-gray-300">{appLang === 'en' ? 'Tax%' : 'ضريبة%'}</th>
                      <th className="px-3 py-2 text-right border border-blue-500 print:border-gray-300">{appLang === 'en' ? 'Total' : 'الإجمالي'}</th>
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
                          <td className="px-3 py-2 text-center border border-gray-200 text-gray-500 dark:text-gray-400">{index + 1}</td>
                          <td className="px-3 py-2 border border-gray-200">
                            <div className="font-medium">{item.products?.name}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">SKU: {item.products?.sku}</div>
                          </td>
                          <td className="px-3 py-2 text-center border border-gray-200">{item.quantity}</td>
                          <td className="px-3 py-2 text-center border border-gray-200">
                            {returnedQty > 0 ? (
                              <span className="text-red-600 font-medium print:text-red-700">-{returnedQty}</span>
                            ) : (
                              <span className="text-gray-400 dark:text-gray-500">-</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center border border-gray-200 font-medium">
                            {returnedQty > 0 ? effectiveQty : item.quantity}
                          </td>
                          <td className="px-3 py-2 text-right border border-gray-200">{item.unit_price.toFixed(2)}</td>
                          <td className="px-3 py-2 text-center border border-gray-200">{(item.discount_percent || 0) > 0 ? `${(item.discount_percent || 0).toFixed(1)}%` : '-'}</td>
                          <td className="px-3 py-2 text-center border border-gray-200">{item.tax_rate > 0 ? `${item.tax_rate}%` : '-'}</td>
                          <td className="px-3 py-2 text-right border border-gray-200 font-semibold">
                            {returnedQty > 0 ? (
                              <>
                                <span className="line-through text-gray-400 dark:text-gray-500 text-xs">{originalTotal.toFixed(2)}</span>
                                <div className="text-green-600 print:text-green-700">{netTotal.toFixed(2)}</div>
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
                <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-4 print:bg-gray-100 print:p-3">
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
                    // رصيد العميل الدائن = المدفوع - صافي الفاتورة (إذا كان موجباً)
                    const customerCreditDisplay = Math.max(0, invoice.paid_amount - netInvoiceAfterReturns)
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
                              <td className="py-2 font-bold text-lg text-gray-900 dark:text-white print:text-black">{appLang === 'en' ? 'Total:' : 'الإجمالي:'}</td>
                              <td className="py-2 text-right font-bold text-lg text-blue-600 print:text-blue-800">{invoice.total_amount.toFixed(2)} <span className="text-sm">{currencySymbol}</span></td>
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
                {/* زر الدفع يظهر فقط إذا كانت الفاتورة مرسلة (sent) أو مدفوعة جزئياً وكان المتبقي أكبر من 0 */}
                {netRemainingAmount > 0 && permPayWrite && invoice.status !== "draft" && invoice.status !== "cancelled" ? (
                  <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => {
                    setPaymentAmount(netRemainingAmount)
                    setShowPayment(true)
                  }}>
                    {appLang === 'en' ? 'Record Payment' : 'تسجيل دفعة'}
                  </Button>
                ) : null}
                {invoice.status !== "cancelled" && invoice.status !== "draft" && invoice.status !== "fully_returned" && permUpdate ? (
                  <Button variant="outline" className="border-orange-500 text-orange-600 hover:bg-orange-50" onClick={openPartialReturnDialog}>
                    {appLang === 'en' ? 'Partial Return' : 'مرتجع جزئي'}
                  </Button>
                ) : null}
                {/* 📌 تم إلغاء زر "إنشاء شحنة" - الوظيفة مدمجة في "تحديد كمرسلة" */}
                {/* View Shipment Button - if shipment/third party goods exists */}
                {existingShipment ? (
                  <Button variant="outline" className="border-cyan-500 text-cyan-600 hover:bg-cyan-50" onClick={() => window.open(`/shipments/${existingShipment.id}`, '_blank')}>
                    <Truck className="w-4 h-4 ml-2" />
                    {appLang === 'en' ? `Shipment: ${existingShipment.shipment_number}` : `الشحنة: ${existingShipment.shipment_number}`}
                    {existingShipment.tracking_number && <ExternalLink className="w-3 h-3 mr-1" />}
                  </Button>
                ) : null}
                {/* زر مذكرة دائن كاملة: يظهر فقط إذا كان هناك مبلغ متبقي للإرجاع */}
                {invoice.status !== "cancelled" && invoice.status !== "fully_returned" && invoice.total_amount > 0 && permDelete ? (
                  <Button variant="destructive" onClick={() => setShowCredit(true)}>
                    {appLang === 'en' ? 'Issue Full Credit Note' : 'إصدار مذكرة دائن كاملة'}
                  </Button>
                ) : null}
                {/* ❌ تم إزالة زر "تحديد كمدفوعة" - الحالة تتحدث تلقائياً عند الدفع أو المرتجع */}
              </>
            )}
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

          {/* Dialog: Full Credit Note */}
          <Dialog open={showCredit} onOpenChange={setShowCredit}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{appLang === 'en' ? 'Issue full credit note' : 'إصدار مذكرة دائن كاملة'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>{appLang === 'en' ? 'Credit note date' : 'تاريخ المذكرة'}</Label>
                  <Input type="date" value={creditDate} onChange={(e) => setCreditDate(e.target.value)} />
                </div>
                <p className="text-sm text-red-600">{appLang === 'en' ? 'Revenue, tax, and receivables for this invoice will be reversed, and inventory fully returned. The invoice amounts will be zero and its status will become cancelled.' : 'سيتم عكس الإيراد والضريبة والذمم لهذه الفاتورة، وإرجاع المخزون بالكامل. ستصبح قيم الفاتورة صفرًا وتتحول حالتها إلى "ملغاة".'}</p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCredit(false)}>{appLang === 'en' ? 'Cancel' : 'إلغاء'}</Button>
                <Button variant="destructive" onClick={issueFullCreditNote}>{appLang === 'en' ? 'Confirm Issue Credit Note' : 'تأكيد إصدار مذكرة دائن'}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

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
                      {appLang === 'en' ? 'Customer' : 'العميل'}: <span className="font-medium">{invoice.customers?.name || '—'}</span>
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
        </div>
      </main>
    </div>
  )
}
