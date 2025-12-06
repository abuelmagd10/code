"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { useSupabase } from "@/lib/supabase/hooks"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Download, ArrowRight, ArrowLeft, Printer, FileDown, Pencil } from "lucide-react"
import { getActiveCompanyId } from "@/lib/company"
import { canAction } from "@/lib/authz"
import { useToast } from "@/hooks/use-toast"
import { toastActionError, toastActionSuccess } from "@/lib/notifications"

interface Invoice {
  id: string
  invoice_number: string
  invoice_date: string
  due_date: string
  subtotal: number
  tax_amount: number
  total_amount: number
  paid_amount: number
  status: string
  customer_id?: string
  customers?: { name: string; email: string; address: string }
  companies?: { name: string; email: string; phone: string; address: string }
  // Advanced fields
  discount_type?: "percent" | "amount"
  discount_value?: number
  discount_position?: "before_tax" | "after_tax"
  tax_inclusive?: boolean
  shipping?: number
  shipping_tax_rate?: number
  adjustment?: number
  // Multi-currency fields
  currency_code?: string
  exchange_rate?: number
  base_currency_total?: number
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
  const [appLang, setAppLang] = useState<'ar'|'en'>('ar')
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
  const [returnItems, setReturnItems] = useState<{item_id: string; product_id: string | null; product_name: string; max_qty: number; return_qty: number; unit_price: number; tax_rate: number; discount_percent: number}[]>([])
  const [returnMethod, setReturnMethod] = useState<'cash' | 'credit_note' | 'bank_transfer'>('credit_note')
  const [returnAccountId, setReturnAccountId] = useState<string>('')
  const [returnNotes, setReturnNotes] = useState<string>('')
  const [returnProcessing, setReturnProcessing] = useState(false)

  // Reverse return state
  const [showReverseReturn, setShowReverseReturn] = useState(false)
  const [reverseReturnProcessing, setReverseReturnProcessing] = useState(false)
  const [nextInvoiceId, setNextInvoiceId] = useState<string | null>(null)
  const [prevInvoiceId, setPrevInvoiceId] = useState<string | null>(null)
  const printAreaRef = useRef<HTMLDivElement | null>(null)
  const invoiceContentRef = useRef<HTMLDivElement | null>(null)
  const params = useParams()
  const router = useRouter()
  const invoiceId = params.id as string
  const [permUpdate, setPermUpdate] = useState<boolean>(false)
  const [permDelete, setPermDelete] = useState<boolean>(false)
  const [permPayWrite, setPermPayWrite] = useState<boolean>(false)
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string>("")

  // Currency symbols map
  const currencySymbols: Record<string, string> = {
    EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ',
    KWD: 'د.ك', QAR: '﷼', BHD: 'د.ب', OMR: '﷼', JOD: 'د.أ', LBP: 'ل.ل'
  }
  const currencySymbol = currencySymbols[appCurrency] || appCurrency

  // Listen for language and currency changes
  useEffect(() => {
    const langHandler = () => {
      try { setAppLang(localStorage.getItem('app_language') === 'en' ? 'en' : 'ar') } catch {}
    }
    const currHandler = () => {
      try { setAppCurrency(localStorage.getItem('app_currency') || 'EGP') } catch {}
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

  useEffect(() => { (async () => {
    try {
      const ok = await canAction(supabase, "invoices", "update")
      setPermUpdate(!!ok)
      const delOk = await canAction(supabase, "invoices", "delete")
      setPermDelete(!!delOk)
      const payWrite = await canAction(supabase, "payments", "write")
      setPermPayWrite(!!payWrite)
    } catch {}
  })() }, [supabase])

  useEffect(() => {
    ;(async () => {
      if (!showPayment) return
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data: company } = await supabase.from("companies").select("id").eq("user_id", user.id).single()
        if (!company) return
        const { data: accounts } = await supabase
          .from("chart_of_accounts")
          .select("id, account_code, account_name, account_type, sub_type")
          .eq("company_id", company.id)
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
        .select("*, customers(*), companies(*)")
        .eq("id", invoiceId)
        .single()

      if (invoiceData) {
        setInvoice(invoiceData)

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
        } catch {}
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
        if (r.ok) { const j = await r.json(); const lu2 = String(j?.company?.logo_url || ''); if (lu2) setCompanyLogoUrl(lu2) }
      } catch {}
    })()
  }, [invoice])

  

  const handlePrint = () => {
    window.print()
  }

  const handleDownloadPDF = async () => {
    try {
      const el = invoiceContentRef.current
      if (!el) return

      // فتح نافذة طباعة جديدة
      const printWindow = window.open('', '_blank', 'width=800,height=600')
      if (!printWindow) {
        alert('يرجى السماح بالنوافذ المنبثقة لتحميل PDF')
        return
      }

      // الحصول على محتوى الفاتورة
      const content = el.innerHTML

      // إنشاء صفحة HTML كاملة مع تنسيقات عربية - صفحة واحدة
      printWindow.document.write(`
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>فاتورة ${invoice?.invoice_number || ''}</title>
          <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap" rel="stylesheet">
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
              font-family: 'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif !important;
            }
            html, body {
              direction: rtl;
              background: #fff;
              color: #1f2937;
              font-size: 11px;
              line-height: 1.3;
            }
            .print-content {
              max-width: 210mm;
              max-height: 287mm;
              margin: 0 auto;
              padding: 8px 15px;
              background: #fff;
            }
            /* إخفاء الأزرار */
            button, svg, .print\\:hidden { display: none !important; }
            /* اللوجو */
            img[alt="Company Logo"], img[alt*="Logo"] {
              width: 50px !important;
              height: 50px !important;
              object-fit: contain;
              border-radius: 6px;
            }
            /* العناوين */
            h1 { font-size: 18px; font-weight: 800; color: #1e40af; margin-bottom: 4px; }
            h2 { font-size: 14px; font-weight: 700; color: #111827; margin-bottom: 3px; }
            h3 { font-size: 12px; font-weight: 600; color: #1e40af; border-bottom: 1px solid #3b82f6; padding-bottom: 3px; margin-bottom: 6px; }
            /* الجدول */
            table { width: 100%; border-collapse: collapse; margin: 6px 0; font-size: 10px; }
            th { background: #1e40af; color: #fff; padding: 5px 4px; font-weight: 600; text-align: center; border: 1px solid #1e3a8a; font-size: 9px; }
            td { padding: 4px 3px; text-align: center; border: 1px solid #e5e7eb; color: #374151; font-size: 10px; }
            td:nth-child(2) { text-align: right; font-weight: 500; color: #111827; }
            td:last-child { font-weight: 600; color: #1e40af; background: #f8fafc; }
            tr:nth-child(even) td { background: #f9fafb; }
            tr:nth-child(even) td:last-child { background: #f1f5f9; }
            /* الألوان */
            .text-blue-600, .text-blue-800 { color: #1e40af !important; }
            .text-green-600, .text-green-700 { color: #059669 !important; }
            .text-red-600, .text-red-700 { color: #dc2626 !important; }
            .text-gray-500 { color: #6b7280 !important; }
            .text-gray-600 { color: #4b5563 !important; }
            .text-gray-700 { color: #374151 !important; }
            /* الخلفيات */
            .bg-gray-50 { background: #f8fafc !important; }
            .bg-green-50 { background: #ecfdf5 !important; }
            .bg-blue-50 { background: #eff6ff !important; }
            .bg-green-100 { background: #d1fae5 !important; }
            .bg-blue-100 { background: #dbeafe !important; }
            /* الحدود */
            .rounded-lg { border-radius: 6px; }
            .border { border: 1px solid #e5e7eb; }
            .border-b { border-bottom: 1px solid #e5e7eb; }
            .border-t { border-top: 1px solid #e5e7eb; }
            /* المسافات - مضغوطة */
            .p-4 { padding: 8px; }
            .p-3 { padding: 6px; }
            .mt-4 { margin-top: 6px; }
            .mt-6 { margin-top: 8px; }
            .mb-2 { margin-bottom: 4px; }
            .mb-4 { margin-bottom: 6px; }
            .pt-4 { padding-top: 6px; }
            .pt-6 { padding-top: 8px; }
            .pb-4 { padding-bottom: 6px; }
            .pb-6 { padding-bottom: 8px; }
            .space-y-6 > * + * { margin-top: 6px; }
            .space-y-4 > * + * { margin-top: 4px; }
            .space-y-2 > * + * { margin-top: 3px; }
            .space-y-1 > * + * { margin-top: 2px; }
            /* أحجام النص - مضغوطة */
            .text-3xl { font-size: 18px; font-weight: 800; }
            .text-2xl { font-size: 16px; font-weight: 700; }
            .text-xl { font-size: 14px; font-weight: 700; }
            .text-lg { font-size: 12px; font-weight: 600; }
            .text-base { font-size: 11px; }
            .text-sm { font-size: 10px; }
            .text-xs { font-size: 9px; }
            .font-bold { font-weight: 700; }
            .font-semibold { font-weight: 600; }
            /* الفليكس */
            .flex { display: flex; }
            .justify-between { justify-content: space-between; }
            .items-center { align-items: center; }
            .items-start { align-items: flex-start; }
            .gap-6 { gap: 10px; }
            .gap-4 { gap: 8px; }
            .gap-2 { gap: 4px; }
            .grid { display: grid; }
            .grid-cols-2 { grid-template-columns: repeat(2, 1fr); }
            .grid-cols-3 { grid-template-columns: repeat(3, 1fr); }
            /* إعدادات الطباعة - صفحة واحدة */
            @media print {
              html, body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
                height: 100%;
              }
              @page {
                size: A4;
                margin: 5mm;
              }
              .print-content {
                page-break-inside: avoid;
                transform: scale(0.95);
                transform-origin: top center;
              }
            }
          </style>
        </head>
        <body>
          <div class="print-content">
            ${content}
          </div>
          <script>
            // انتظار تحميل الخطوط ثم الطباعة
            document.fonts.ready.then(() => {
              setTimeout(() => {
                window.print();
                window.onafterprint = () => window.close();
              }, 500);
            });
          </script>
        </body>
        </html>
      `)
    } catch (err) {
      console.error("Error generating PDF:", err)
      toastActionError(toast, appLang==='en' ? 'Download' : 'تنزيل', appLang==='en' ? 'Invoice PDF' : 'ملف الفاتورة', String((err as any)?.message || ''))
    }
  }

  

  // التحقق من توفر المخزون قبل إرسال الفاتورة
  const checkInventoryAvailability = async (): Promise<{ success: boolean; shortages: { productName: string; required: number; available: number }[] }> => {
    try {
      // جلب عناصر الفاتورة مع بيانات المنتجات
      const { data: invoiceItems } = await supabase
        .from("invoice_items")
        .select("product_id, quantity, products(name, quantity_on_hand, track_inventory)")
        .eq("invoice_id", invoiceId)

      const shortages: { productName: string; required: number; available: number }[] = []

      for (const item of invoiceItems || []) {
        const product = item.products as any
        // تخطي المنتجات التي لا تتطلب تتبع المخزون أو بدون product_id
        if (!item.product_id || !product || product.track_inventory === false) continue

        const required = Number(item.quantity || 0)
        const available = Number(product.quantity_on_hand || 0)

        if (required > available) {
          shortages.push({
            productName: product.name || "منتج غير معروف",
            required,
            available: Math.max(0, available)
          })
        }
      }

      return { success: shortages.length === 0, shortages }
    } catch (error) {
      console.error("Error checking inventory:", error)
      return { success: true, shortages: [] } // في حالة الخطأ، نسمح بالمتابعة
    }
  }

  const handleChangeStatus = async (newStatus: string) => {
    try {
      // التحقق من المخزون قبل الإرسال
      if (newStatus === "sent") {
        const { success, shortages } = await checkInventoryAvailability()
        if (!success) {
          const shortageList = shortages.map(s =>
            `• ${s.productName}: مطلوب ${s.required}، متوفر ${s.available}`
          ).join("\n")

          toast({
            variant: "destructive",
            title: appLang === 'en' ? "Insufficient Inventory" : "المخزون غير كافٍ",
            description: appLang === 'en'
              ? `Cannot send invoice. The following products have insufficient stock:\n${shortages.map(s => `• ${s.productName}: Required ${s.required}, Available ${s.available}`).join("\n")}`
              : `لا يمكن إرسال الفاتورة. المنتجات التالية غير متوفرة بالكمية المطلوبة:\n${shortageList}`,
            duration: 8000,
          })
          return
        }
      }

      const { error } = await supabase.from("invoices").update({ status: newStatus }).eq("id", invoiceId)

      if (error) throw error

      // ===== منطق محاسبي جديد (متوافق مع Zoho Books / ERPNext) =====
      // الفاتورة المرسلة: لا قيود محاسبية - فقط خصم المخزون لوجيستياً
      // القيود المحاسبية تُنشأ فقط عند الدفع الأول (مدفوعة/مدفوعة جزئياً)
      if (invoice) {
        if (newStatus === "sent") {
          // فقط خصم المخزون بدون قيود محاسبية
          await deductInventoryOnly()
        } else if (newStatus === "draft" || newStatus === "cancelled") {
          await reverseInventoryForInvoice()
          // أيضاً عكس القيود المحاسبية إن وجدت
          await reverseInvoiceJournals()
        }
      }

      loadInvoice()
      toastActionSuccess(toast, "التحديث", "الفاتورة")
    } catch (error) {
      console.error("Error updating status:", error)
      toastActionError(toast, "التحديث", "الفاتورة", "تعذر تحديث حالة الفاتورة")
    }
  }

  const findAccountIds = async (companyId?: string) => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null

    let companyData: any = null
    if (companyId) {
      const { data } = await supabase.from("companies").select("id").eq("id", companyId).single()
      companyData = data
    } else {
      const { data } = await supabase.from("companies").select("id").eq("user_id", user.id).single()
      companyData = data
    }
    if (!companyData) return null

    const { data: accounts } = await supabase
      .from("chart_of_accounts")
      .select("id, account_code, account_type, account_name, sub_type, parent_id")
      .eq("company_id", companyData.id)

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

    return { companyId: companyData.id, ar, revenue, vatPayable, cash, bank, inventory, cogs, shippingAccount }
  }

  const postInvoiceJournal = async () => {
    try {
      if (!invoice) return

      const mapping = await findAccountIds()
      if (!mapping || !mapping.ar || !mapping.revenue) {
        console.warn("Account mapping incomplete: AR/Revenue not found. Skipping journal posting.")
        return
      }

      // Avoid duplicate posting for this invoice
      const { data: existing } = await supabase
        .from("journal_entries")
        .select("id")
        .eq("company_id", mapping.companyId)
        .eq("reference_type", "invoice")
        .eq("reference_id", invoiceId)
        .limit(1)
      if (existing && existing.length > 0) return

      const { data: entry, error: entryError } = await supabase
        .from("journal_entries")
        .insert({
          company_id: mapping.companyId,
          reference_type: "invoice",
          reference_id: invoiceId,
          entry_date: invoice.invoice_date,
          description: `Invoice ${invoice.invoice_number}`,
        })
        .select()
        .single()

      if (entryError) throw entryError

      const lines = [
        {
          journal_entry_id: entry.id,
          account_id: mapping.ar,
          debit_amount: invoice.total_amount,
          credit_amount: 0,
          description: "Accounts Receivable",
        },
        {
          journal_entry_id: entry.id,
          account_id: mapping.revenue,
          debit_amount: 0,
          credit_amount: invoice.subtotal,
          description: "Revenue",
        },
      ] as any[]

      if (Number(invoice.shipping || 0) > 0) {
        lines.push({
          journal_entry_id: entry.id,
          account_id: mapping.shippingAccount || mapping.revenue,
          debit_amount: 0,
          credit_amount: Number(invoice.shipping || 0),
          description: "الشحن",
        })
      }

      if (mapping.vatPayable && invoice.tax_amount && invoice.tax_amount > 0) {
        lines.push({
          journal_entry_id: entry.id,
          account_id: mapping.vatPayable,
          debit_amount: 0,
          credit_amount: invoice.tax_amount,
          description: "VAT Payable",
        })
      }

      const { error: linesError } = await supabase.from("journal_entry_lines").insert(lines)
      if (linesError) throw linesError
    } catch (err) {
      console.error("Error posting invoice journal:", err)
    }
  }

  const postPaymentJournal = async () => {
    try {
      if (!invoice) return
      const mapping = await findAccountIds()
      if (!mapping || !mapping.ar) {
        console.warn("Account mapping incomplete: AR not found. Skipping payment journal posting.")
        return
      }

      // Check if a payment journal exists already (we link by reference_type invoice-paid)
      const { data: existing } = await supabase
        .from("journal_entries")
        .select("id")
        .eq("company_id", mapping.companyId)
        .eq("reference_type", "invoice_payment")
        .eq("reference_id", invoiceId)
        .limit(1)
      if (existing && existing.length > 0) return

      // Try to use latest payment info (account_id + payment_date)
      const { data: lastPay } = await supabase
        .from("payments")
        .select("account_id, payment_date, amount")
        .eq("company_id", mapping.companyId)
        .eq("invoice_id", invoiceId)
        .order("payment_date", { ascending: false })
        .limit(1)
        .maybeSingle()

      const { data: entry, error: entryError } = await supabase
        .from("journal_entries")
        .insert({
          company_id: mapping.companyId,
          reference_type: "invoice_payment",
          reference_id: invoiceId,
          entry_date: (lastPay?.payment_date as string) || new Date().toISOString().slice(0, 10),
          description: `Invoice Payment ${invoice.invoice_number}`,
        })
        .select()
        .single()

      if (entryError) throw entryError

      const amount = Number(lastPay?.amount ?? invoice.paid_amount)
      let cashAccountId = lastPay?.account_id || mapping.bank || mapping.cash
      if (!cashAccountId) {
        const { data: accounts } = await supabase
          .from("chart_of_accounts")
          .select("id, account_name, sub_type")
          .eq("company_id", mapping.companyId)
        const list = (accounts || []).filter((a: any) => {
          const st = String(a.sub_type || "").toLowerCase()
          const nm = String(a.account_name || "")
          const nmLower = nm.toLowerCase()
          const isCashOrBankSubtype = st === "cash" || st === "bank"
          const nameSuggestsCashOrBank = nmLower.includes("bank") || nmLower.includes("cash") || /بنك|بنكي|مصرف|خزينة|نقد|صندوق/.test(nm)
          return isCashOrBankSubtype || nameSuggestsCashOrBank
        })
        const preferredBank = list.find((a: any) => String(a.sub_type || '').toLowerCase() === 'bank' || /بنك|مصرف/.test(String(a.account_name || '')))
        cashAccountId = (preferredBank || list[0])?.id
      }
      const { error: linesError } = await supabase.from("journal_entry_lines").insert([
        {
          journal_entry_id: entry.id,
          account_id: cashAccountId,
          debit_amount: amount,
          credit_amount: 0,
          description: "Cash/Bank",
        },
        {
          journal_entry_id: entry.id,
          account_id: mapping.ar,
          debit_amount: 0,
          credit_amount: amount,
          description: "Accounts Receivable",
        },
      ])
      if (linesError) throw linesError
    } catch (err) {
      console.error("Error posting payment journal:", err)
    }
  }

  const issueFullCreditNote = async () => {
    try {
      if (!invoice) return
      const mapping = await findAccountIds()
      if (!mapping || !mapping.ar || !mapping.revenue) {
        console.warn("Account mapping incomplete: AR/Revenue not found. Skipping credit note posting.")
        return
      }

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

      // Reverse COGS and return inventory for full invoice
      if (mapping && mapping.inventory && mapping.cogs) {
        const { data: existingCOGS } = await supabase
          .from("journal_entries")
          .select("id")
          .eq("company_id", mapping.companyId)
          .eq("reference_type", "credit_note_cogs")
          .eq("reference_id", invoiceId)
          .limit(1)
        if (!existingCOGS || existingCOGS.length === 0) {
          const { data: invItems } = await supabase
            .from("invoice_items")
            .select("product_id, quantity, products(cost_price)")
            .eq("invoice_id", invoiceId)

          const totalCOGS = (invItems || []).reduce((sum: number, it: any) => {
            const cost = Number(it.products?.cost_price || 0)
            return sum + Number(it.quantity || 0) * cost
          }, 0)

          if (totalCOGS > 0) {
            const { data: entry2, error: entry2Err } = await supabase
              .from("journal_entries")
              .insert({
                company_id: mapping.companyId,
                reference_type: "credit_note_cogs",
                reference_id: invoiceId,
                entry_date: creditDate,
                description: `عكس تكلفة المبيعات للفاتورة ${invoice.invoice_number}`,
              })
              .select()
              .single()
            if (entry2Err) throw entry2Err

            const { error: lines2Err } = await supabase.from("journal_entry_lines").insert([
              {
                journal_entry_id: entry2.id,
                account_id: mapping.inventory,
                debit_amount: totalCOGS,
                credit_amount: 0,
                description: "عودة للمخزون",
              },
              {
                journal_entry_id: entry2.id,
                account_id: mapping.cogs,
                debit_amount: 0,
                credit_amount: totalCOGS,
                description: "عكس تكلفة البضاعة المباعة",
              },
            ])
            if (lines2Err) throw lines2Err

            // Inventory transactions: return quantities
            const invTx = (invItems || []).map((it: any) => ({
              company_id: mapping.companyId,
              product_id: it.product_id,
              transaction_type: "sale_return",
              quantity_change: Number(it.quantity || 0),
              reference_id: invoiceId,
              notes: `مرتجع للفاتورة ${invoice.invoice_number}`,
            }))
            if (invTx.length > 0) {
              const { error: invErr } = await supabase.from("inventory_transactions").insert(invTx)
              if (invErr) console.warn("Failed inserting inventory return transactions", invErr)
            }
          }
        }
      }

      // Update invoice to reflect credit application
      const { error: updErr } = await supabase
        .from("invoices")
        .update({ subtotal: 0, tax_amount: 0, total_amount: 0, status: "cancelled" })
        .eq("id", invoice.id)
      if (updErr) throw updErr

      await loadInvoice()
      setShowCredit(false)
    } catch (err) {
      console.error("Error issuing full credit note:", err)
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
      const mapping = await findAccountIds()
      if (!mapping) {
        toastActionError(toast, appLang==='en' ? 'Return' : 'المرتجع', appLang==='en' ? 'Invoice' : 'الفاتورة', appLang==='en' ? 'Account settings not found' : 'لم يتم العثور على إعدادات الحسابات')
        return
      }

      // Create journal entry for the return (reverse AR and Revenue)
      const { data: entry, error: entryErr } = await supabase
        .from("journal_entries")
        .insert({
          company_id: mapping.companyId,
          reference_type: "sales_return",
          reference_id: invoice.id,
          entry_date: new Date().toISOString().slice(0, 10),
          description: appLang==='en' ? `Sales return for invoice ${invoice.invoice_number}` : `مرتجع مبيعات للفاتورة ${invoice.invoice_number}`,
        })
        .select()
        .single()
      if (entryErr) throw entryErr

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

      // Journal entry lines: Debit Revenue, Credit AR
      const lines: any[] = []

      // Debit Revenue (reduce sales)
      if (mapping.revenue) {
        lines.push({
          journal_entry_id: entry.id,
          account_id: mapping.revenue,
          debit_amount: returnSubtotal,
          credit_amount: 0,
          description: appLang==='en' ? 'Sales return - Revenue reversal' : 'مرتجع مبيعات - عكس الإيراد',
        })
      }

      // Debit VAT Payable (if tax exists)
      if (returnTax > 0 && mapping.vatPayable) {
        lines.push({
          journal_entry_id: entry.id,
          account_id: mapping.vatPayable,
          debit_amount: returnTax,
          credit_amount: 0,
          description: appLang==='en' ? 'Sales return - VAT reversal' : 'مرتجع مبيعات - عكس الضريبة',
        })
      }

      // Credit AR (reduce receivable)
      if (mapping.ar) {
        lines.push({
          journal_entry_id: entry.id,
          account_id: mapping.ar,
          debit_amount: 0,
          credit_amount: returnTotal,
          description: appLang==='en' ? 'Sales return - AR reduction' : 'مرتجع مبيعات - تخفيض الذمم',
        })
      }

      if (lines.length > 0) {
        const { error: linesErr } = await supabase.from("journal_entry_lines").insert(lines)
        if (linesErr) throw linesErr
      }

      // Reverse COGS and return inventory
      if (mapping.inventory && mapping.cogs) {
        const totalCOGS = returnItems.reduce((sum, it) => {
          // Get cost price from original item
          const originalItem = items.find(i => i.id === it.item_id) as any
          const costPrice = originalItem?.products?.cost_price || 0
          return sum + (it.return_qty * costPrice)
        }, 0)

        if (totalCOGS > 0) {
          const { data: cogsEntry, error: cogsErr } = await supabase
            .from("journal_entries")
            .insert({
              company_id: mapping.companyId,
              reference_type: "sales_return_cogs",
              reference_id: invoice.id,
              entry_date: new Date().toISOString().slice(0, 10),
              description: appLang==='en' ? `COGS reversal for return - Invoice ${invoice.invoice_number}` : `عكس تكلفة البضاعة المباعة - الفاتورة ${invoice.invoice_number}`,
            })
            .select()
            .single()
          if (!cogsErr && cogsEntry) {
            await supabase.from("journal_entry_lines").insert([
              { journal_entry_id: cogsEntry.id, account_id: mapping.inventory, debit_amount: totalCOGS, credit_amount: 0, description: appLang==='en' ? 'Inventory return' : 'إرجاع المخزون' },
              { journal_entry_id: cogsEntry.id, account_id: mapping.cogs, debit_amount: 0, credit_amount: totalCOGS, description: appLang==='en' ? 'COGS reversal' : 'عكس تكلفة البضاعة' },
            ])
          }
        }
      }

      // Update invoice_items returned_quantity
      for (const it of returnItems) {
        if (it.return_qty > 0) {
          const originalItem = items.find(i => i.id === it.item_id)
          const newReturnedQty = (originalItem?.returned_quantity || 0) + it.return_qty
          await supabase.from("invoice_items").update({ returned_quantity: newReturnedQty }).eq("id", it.item_id)
        }
      }

      // Create inventory transactions for returned items (positive quantity = items returning to stock)
      const invTx = returnItems.filter(it => it.return_qty > 0 && it.product_id).map(it => ({
        company_id: mapping.companyId,
        product_id: it.product_id,
        transaction_type: "sale_return",
        quantity_change: it.return_qty, // positive for incoming
        reference_id: invoice.id,
        journal_entry_id: entry.id,
        notes: appLang==='en' ? `Sales return for invoice ${invoice.invoice_number}` : `مرتجع مبيعات للفاتورة ${invoice.invoice_number}`,
      }))
      if (invTx.length > 0) {
        await supabase.from("inventory_transactions").insert(invTx)
      }

      // Update products quantity (add back to stock)
      for (const it of returnItems) {
        if (it.return_qty > 0 && it.product_id) {
          const { data: prod } = await supabase.from("products").select("quantity_on_hand").eq("id", it.product_id).single()
          if (prod) {
            const newQty = (prod.quantity_on_hand || 0) + it.return_qty
            await supabase.from("products").update({ quantity_on_hand: newQty }).eq("id", it.product_id)
          }
        }
      }

      // Update invoice returned_amount and return_status
      const currentReturnedAmount = Number((invoice as any).returned_amount || 0)
      const newReturnedAmount = currentReturnedAmount + returnTotal
      const invoiceTotalAmount = Number(invoice.total_amount || 0)
      const newReturnStatus = newReturnedAmount >= invoiceTotalAmount ? 'full' : 'partial'

      await supabase.from("invoices").update({
        returned_amount: newReturnedAmount,
        return_status: newReturnStatus
      }).eq("id", invoice.id)

      // If credit_note method, create customer credit record
      if (returnMethod === 'credit_note') {
        await supabase.from("customer_credits").insert({
          company_id: mapping.companyId,
          customer_id: invoice.customer_id,
          invoice_id: invoice.id,
          credit_number: `CR-${Date.now()}`,
          credit_date: new Date().toISOString().slice(0, 10),
          amount: returnTotal,
          remaining_amount: returnTotal,
          reason: returnNotes || (appLang==='en' ? 'Sales return' : 'مرتجع مبيعات'),
          status: 'active'
        })
      }

      toastActionSuccess(toast, appLang==='en' ? 'Return' : 'المرتجع', appLang==='en' ? 'Sales return processed successfully' : 'تم معالجة المرتجع بنجاح')
      setShowPartialReturn(false)
      await loadInvoice()
    } catch (err: any) {
      console.error("Error processing sales return:", err)
      toastActionError(toast, appLang==='en' ? 'Return' : 'المرتجع', appLang==='en' ? 'Invoice' : 'الفاتورة', err?.message || '')
    } finally {
      setReturnProcessing(false)
    }
  }

  // Check if invoice has returns
  const hasReturns = useMemo(() => {
    if (!invoice) return false
    return (invoice as any).return_status === 'partial' || (invoice as any).return_status === 'full' || Number((invoice as any).returned_amount || 0) > 0
  }, [invoice])

  // Reverse sales return - Professional ERP approach
  const reverseSalesReturn = async () => {
    if (!invoice || !hasReturns) return
    try {
      setReverseReturnProcessing(true)
      const mapping = await findAccountIds()
      if (!mapping) {
        toastActionError(toast, appLang==='en' ? 'Reverse' : 'العكس', appLang==='en' ? 'Invoice' : 'الفاتورة', appLang==='en' ? 'Account settings not found' : 'لم يتم العثور على إعدادات الحسابات')
        return
      }

      // 1. Find all journal entries related to this invoice's returns
      const { data: journalEntries, error: jeErr } = await supabase
        .from("journal_entries")
        .select("id, reference_type, description")
        .eq("reference_id", invoice.id)
        .in("reference_type", ["sales_return", "sales_return_cogs", "sales_return_refund"])

      if (jeErr) throw jeErr

      // 2. Delete journal entry lines first (foreign key constraint)
      if (journalEntries && journalEntries.length > 0) {
        const jeIds = journalEntries.map(je => je.id)
        const { error: delLinesErr } = await supabase
          .from("journal_entry_lines")
          .delete()
          .in("journal_entry_id", jeIds)
        if (delLinesErr) throw delLinesErr

        // 3. Delete journal entries
        const { error: delJeErr } = await supabase
          .from("journal_entries")
          .delete()
          .in("id", jeIds)
        if (delJeErr) throw delJeErr
      }

      // 4. Find and delete inventory transactions
      const { data: invTx, error: invTxErr } = await supabase
        .from("inventory_transactions")
        .select("id, product_id, quantity_change")
        .eq("reference_id", invoice.id)
        .eq("transaction_type", "sale_return")

      if (!invTxErr && invTx && invTx.length > 0) {
        // 5. Restore product quantities (subtract what was returned back to stock)
        for (const tx of invTx) {
          const { data: prod } = await supabase
            .from("products")
            .select("quantity_on_hand")
            .eq("id", tx.product_id)
            .single()
          if (prod) {
            // quantity_change is positive for sale returns, so we subtract it
            const restoredQty = (prod.quantity_on_hand || 0) - (tx.quantity_change || 0)
            await supabase
              .from("products")
              .update({ quantity_on_hand: restoredQty })
              .eq("id", tx.product_id)
          }
        }

        // 6. Delete inventory transactions
        const txIds = invTx.map(t => t.id)
        await supabase.from("inventory_transactions").delete().in("id", txIds)
      }

      // 7. Reset returned_quantity in invoice_items
      const { error: resetItemsErr } = await supabase
        .from("invoice_items")
        .update({ returned_quantity: 0 })
        .eq("invoice_id", invoice.id)
      if (resetItemsErr) throw resetItemsErr

      // 8. Reset invoice returned_amount and return_status
      const { error: resetInvErr } = await supabase
        .from("invoices")
        .update({ returned_amount: 0, return_status: null })
        .eq("id", invoice.id)
      if (resetInvErr) throw resetInvErr

      // 9. Delete customer credits related to this return
      await supabase
        .from("customer_credits")
        .delete()
        .eq("invoice_id", invoice.id)

      // 10. Create audit log entry (professional ERP practice)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        await supabase.from("audit_logs").insert({
          company_id: mapping.companyId,
          user_id: user?.id,
          action: "reverse_return",
          entity_type: "invoice",
          entity_id: invoice.id,
          details: {
            invoice_number: invoice.invoice_number,
            reversed_amount: (invoice as any).returned_amount,
            reversed_by: user?.email,
            reversed_at: new Date().toISOString()
          }
        })
      } catch (auditErr) {
        console.warn("Audit log failed:", auditErr)
      }

      toastActionSuccess(toast, appLang==='en' ? 'Reverse' : 'العكس', appLang==='en' ? 'Return reversed successfully' : 'تم عكس المرتجع بنجاح')
      setShowReverseReturn(false)
      await loadInvoice()
    } catch (err: any) {
      console.error("Error reversing sales return:", err)
      toastActionError(toast, appLang==='en' ? 'Reverse' : 'العكس', appLang==='en' ? 'Return' : 'المرتجع', err?.message || '')
    } finally {
      setReverseReturnProcessing(false)
    }
  }

  const recordInvoicePayment = async (amount: number, dateStr: string, method: string, reference: string) => {
    try {
      if (!invoice) return
      setSavingPayment(true)
      // تأكيد اختيار حساب قبل الحفظ
      if (!paymentAccountId) {
        toast({ title: "بيانات غير مكتملة", description: "يرجى اختيار حساب النقد/البنك للدفعة", variant: "destructive" })
        setSavingPayment(false)
        return
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error("لم يتم العثور على المستخدم")
      const { data: company } = await supabase.from("companies").select("id").eq("user_id", user.id).single()
      if (!company) throw new Error("لم يتم العثور على الشركة")

      // ===== التحقق: هل هذه أول دفعة على فاتورة مرسلة؟ =====
      const isFirstPaymentOnSentInvoice = invoice.status === "sent"

      // 1) إدراج سجل الدفع
      const basePayload: any = {
        company_id: company.id,
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
      if (isFirstPaymentOnSentInvoice) {
        // ✅ أول دفعة على فاتورة مرسلة: إنشاء جميع القيود المحاسبية
        // (المبيعات، الذمم، الشحن، الضريبة، COGS، الدفع)
        await postAllInvoiceJournals(amount, dateStr, paymentAccountId)
      } else {
        // دفعة إضافية: فقط قيد الدفع
        const mapping = await findAccountIds()
        if (mapping && mapping.ar && (mapping.cash || mapping.bank)) {
          const { data: entry, error: entryError } = await supabase
            .from("journal_entries")
            .insert({
              company_id: mapping.companyId,
              reference_type: "invoice_payment",
              reference_id: invoice.id,
              entry_date: dateStr,
              description: `دفعة للفاتورة ${invoice.invoice_number}${reference ? ` (${reference})` : ""}`,
            })
            .select()
            .single()
          if (entryError) throw entryError

          const methodLower = String(method || "").toLowerCase()
          const isBankMethod = [
            "bank", "transfer", "cheque", "شيك", "تحويل", "بنكي", "فيزا", "بطاقة", "pos", "ماكينة"
          ].some((kw) => methodLower.includes(kw))
          const cashAccountId = paymentAccountId || (isBankMethod ? (mapping.bank || mapping.cash) : (mapping.cash || mapping.bank))

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
          if (linesErr) throw linesErr
        }
      }

      // أعِد التحميل وأغلق النموذج
      await loadInvoice()
      setShowPayment(false)
      setPaymentAccountId("")
      toast({ title: "تم تسجيل الدفعة بنجاح", description: isFirstPaymentOnSentInvoice ? "تم إنشاء جميع القيود المحاسبية" : "تم إضافة قيد الدفع" })
    } catch (err) {
      console.error("خطأ أثناء تسجيل الدفعة:", err)
      toast({ title: "خطأ", description: "تعذر تسجيل الدفعة", variant: "destructive" })
    } finally {
      setSavingPayment(false)
    }
  }

  const postCOGSJournalAndInventory = async () => {
    try {
      if (!invoice) return
      const mapping = await findAccountIds()
      if (!mapping) return
      const inventoryId = mapping.inventory
      const cogsId = mapping.cogs
      if (!inventoryId || !cogsId) {
        console.warn("Inventory/COGS accounts not found via sub_type mapping. Skipping COGS posting.")
        return
      }

      // Avoid duplicate COGS posting
      const { data: existing } = await supabase
        .from("journal_entries")
        .select("id")
        .eq("company_id", mapping.companyId)
        .eq("reference_type", "invoice_cogs")
        .eq("reference_id", invoiceId)
        .limit(1)
      if (existing && existing.length > 0) return

      // Fetch invoice items with product cost
      const { data: invItems } = await supabase
        .from("invoice_items")
        .select("quantity, products(cost_price)")
        .eq("invoice_id", invoiceId)
      const totalCOGS = (invItems || []).reduce((sum: number, it: any) => {
        const cost = Number(it.products?.cost_price || 0)
        return sum + Number(it.quantity || 0) * cost
      }, 0)
      if (totalCOGS <= 0) return

      const { data: entry, error: entryError } = await supabase
        .from("journal_entries")
        .insert({
          company_id: mapping.companyId,
          reference_type: "invoice_cogs",
          reference_id: invoiceId,
          entry_date: invoice.invoice_date,
          description: `تكلفة مبيعات للفاتورة ${invoice.invoice_number}`,
        })
        .select()
        .single()
      if (entryError) throw entryError

      const { error: linesError } = await supabase.from("journal_entry_lines").insert([
        {
          journal_entry_id: entry.id,
          account_id: cogsId,
          debit_amount: totalCOGS,
          credit_amount: 0,
          description: "تكلفة البضاعة المباعة",
        },
        {
          journal_entry_id: entry.id,
          account_id: inventoryId,
          debit_amount: 0,
          credit_amount: totalCOGS,
          description: "المخزون",
        },
      ])
      if (linesError) throw linesError

      // Create inventory transactions (negative quantities)
      const { data: invItems2 } = await supabase
        .from("invoice_items")
        .select("product_id, quantity")
        .eq("invoice_id", invoiceId)
      const invTx = (invItems2 || []).map((it: any) => ({
        company_id: mapping.companyId,
        product_id: it.product_id,
        transaction_type: "sale",
        quantity_change: -Number(it.quantity || 0),
        reference_id: invoiceId,
        journal_entry_id: entry.id,
        notes: `بيع ${invoice.invoice_number}`,
      }))
      if (invTx.length > 0) {
        const { error: invErr } = await supabase
          .from("inventory_transactions")
          .upsert(invTx, { onConflict: "journal_entry_id,product_id,transaction_type" })
        if (invErr) console.warn("Failed inserting/upserting sale inventory transactions", invErr)
      }

      
  } catch (err) {
    console.error("Error posting COGS/inventory for invoice:", err)
  }
}

 const reverseInventoryForInvoice = async () => {
   try {
     if (!invoice) return
     const mapping = await findAccountIds()
     if (!mapping || !mapping.inventory || !mapping.cogs) return
     const { data: invItems } = await supabase
       .from("invoice_items")
       .select("product_id, quantity, products(cost_price)")
       .eq("invoice_id", invoiceId)
     const reversalTx = (invItems || []).filter((it: any) => !!it.product_id).map((it: any) => ({
       company_id: mapping.companyId,
       product_id: it.product_id,
       transaction_type: "sale_reversal",
       quantity_change: Number(it.quantity || 0),
       reference_id: invoiceId,
       notes: `عكس بيع للفاتورة ${invoice.invoice_number}`,
     }))
    if (reversalTx.length > 0) {
      const { error: invErr } = await supabase.from("inventory_transactions").insert(reversalTx)
      if (invErr) console.warn("Failed inserting sale reversal inventory transactions", invErr)
    }
     const totalCOGS = (invItems || []).reduce((sum: number, it: any) => sum + Number(it.quantity || 0) * Number(it.products?.cost_price || 0), 0)
     if (totalCOGS > 0) {
       const { data: entry2 } = await supabase
         .from("journal_entries")
         .insert({ company_id: mapping.companyId, reference_type: "invoice_cogs_reversal", reference_id: invoiceId, entry_date: new Date().toISOString().slice(0, 10), description: `عكس تكلفة المبيعات للفاتورة ${invoice.invoice_number}` })
         .select()
         .single()
    if (entry2?.id) {
      await supabase.from("journal_entry_lines").insert([
        { journal_entry_id: entry2.id, account_id: mapping.inventory, debit_amount: totalCOGS, credit_amount: 0, description: "عودة للمخزون" },
        { journal_entry_id: entry2.id, account_id: mapping.cogs, debit_amount: 0, credit_amount: totalCOGS, description: "عكس تكلفة البضاعة المباعة" },
      ])
      const reversalTxLinked = (invItems || []).filter((it: any) => !!it.product_id).map((it: any) => ({
        company_id: mapping.companyId,
        product_id: it.product_id,
        transaction_type: "sale_reversal",
        quantity_change: Number(it.quantity || 0),
        reference_id: invoiceId,
        journal_entry_id: entry2.id,
        notes: `عكس بيع للفاتورة ${invoice.invoice_number}`,
      }))
    if (reversalTxLinked.length > 0) {
      const { error: invErr2 } = await supabase
        .from("inventory_transactions")
        .upsert(reversalTxLinked, { onConflict: "journal_entry_id,product_id,transaction_type" })
      if (invErr2) console.warn("Failed upserting sale reversal inventory transactions", invErr2)
    }
    }
     }
   } catch (e) {
     console.warn("Error reversing inventory for invoice", e)
   }
 }

  // ===== دالة خصم المخزون فقط بدون قيود محاسبية =====
  // تُستخدم عند إرسال الفاتورة (حالة sent)
  const deductInventoryOnly = async () => {
    try {
      if (!invoice) return
      const mapping = await findAccountIds()
      if (!mapping) return

      // التحقق من عدم وجود معاملات مخزون سابقة لهذه الفاتورة
      const { data: existingTx } = await supabase
        .from("inventory_transactions")
        .select("id")
        .eq("reference_id", invoiceId)
        .eq("transaction_type", "sale")
        .limit(1)
      if (existingTx && existingTx.length > 0) return

      // جلب بنود الفاتورة مع معلومات المنتج (للتأكد من أنها منتجات وليست خدمات)
      const { data: invItems } = await supabase
        .from("invoice_items")
        .select("product_id, quantity, products(item_type)")
        .eq("invoice_id", invoiceId)

      // خصم المخزون للمنتجات فقط (وليس الخدمات)
      const invTx = (invItems || [])
        .filter((it: any) => !!it.product_id && it.products?.item_type !== 'service')
        .map((it: any) => ({
          company_id: mapping.companyId,
          product_id: it.product_id,
          transaction_type: "sale",
          quantity_change: -Number(it.quantity || 0),
          reference_id: invoiceId,
          notes: `بيع ${invoice.invoice_number} (مرسلة)`,
        }))

      if (invTx.length > 0) {
        const { error: invErr } = await supabase
          .from("inventory_transactions")
          .insert(invTx)
        if (invErr) console.warn("Failed inserting sale inventory transactions", invErr)
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

      // حذف قيود الفاتورة الأصلية
      const { data: invoiceEntries } = await supabase
        .from("journal_entries")
        .select("id")
        .eq("company_id", mapping.companyId)
        .eq("reference_id", invoiceId)
        .in("reference_type", ["invoice", "invoice_cogs", "invoice_payment"])

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

  // ===== دالة إنشاء جميع القيود المحاسبية للفاتورة =====
  // تُستخدم عند الدفع الأول (التحويل من sent إلى paid/partially_paid)
  const postAllInvoiceJournals = async (paymentAmount: number, paymentDate: string, paymentAccountId: string) => {
    try {
      if (!invoice) return
      const mapping = await findAccountIds()
      if (!mapping || !mapping.ar || !mapping.revenue) {
        console.warn("Account mapping incomplete. Skipping journal posting.")
        return
      }

      // التحقق من عدم وجود قيود سابقة للفاتورة
      const { data: existingInvoiceEntry } = await supabase
        .from("journal_entries")
        .select("id")
        .eq("company_id", mapping.companyId)
        .eq("reference_type", "invoice")
        .eq("reference_id", invoiceId)
        .limit(1)

      // ===== 1) قيد المبيعات والذمم المدينة =====
      if (!existingInvoiceEntry || existingInvoiceEntry.length === 0) {
        const { data: entry, error: entryError } = await supabase
          .from("journal_entries")
          .insert({
            company_id: mapping.companyId,
            reference_type: "invoice",
            reference_id: invoiceId,
            entry_date: invoice.invoice_date,
            description: `فاتورة مبيعات ${invoice.invoice_number}`,
          })
          .select()
          .single()

        if (!entryError && entry) {
          const lines: any[] = [
            // من ح/ الذمم المدينة
            {
              journal_entry_id: entry.id,
              account_id: mapping.ar,
              debit_amount: invoice.total_amount,
              credit_amount: 0,
              description: "الذمم المدينة",
            },
            // إلى ح/ المبيعات
            {
              journal_entry_id: entry.id,
              account_id: mapping.revenue,
              debit_amount: 0,
              credit_amount: invoice.subtotal,
              description: "إيرادات المبيعات",
            },
          ]

          // ===== 2) قيد مصاريف الشحن (إن وجدت) =====
          if (Number(invoice.shipping || 0) > 0 && mapping.shippingAccount) {
            lines.push({
              journal_entry_id: entry.id,
              account_id: mapping.shippingAccount,
              debit_amount: 0,
              credit_amount: Number(invoice.shipping || 0),
              description: "إيرادات الشحن",
            })
          } else if (Number(invoice.shipping || 0) > 0) {
            // إذا لم يوجد حساب شحن منفصل، أضفه للإيرادات
            lines[1].credit_amount += Number(invoice.shipping || 0)
          }

          // ===== 3) قيد الضريبة (إن وجدت) =====
          if (mapping.vatPayable && invoice.tax_amount && invoice.tax_amount > 0) {
            lines.push({
              journal_entry_id: entry.id,
              account_id: mapping.vatPayable,
              debit_amount: 0,
              credit_amount: invoice.tax_amount,
              description: "ضريبة القيمة المضافة المستحقة",
            })
          }

          await supabase.from("journal_entry_lines").insert(lines)
        }
      }

      // ===== 4) قيد COGS (تكلفة البضاعة المباعة) =====
      const { data: existingCOGS } = await supabase
        .from("journal_entries")
        .select("id")
        .eq("company_id", mapping.companyId)
        .eq("reference_type", "invoice_cogs")
        .eq("reference_id", invoiceId)
        .limit(1)

      if ((!existingCOGS || existingCOGS.length === 0) && mapping.inventory && mapping.cogs) {
        const { data: invItems } = await supabase
          .from("invoice_items")
          .select("quantity, product_id, products(cost_price, item_type)")
          .eq("invoice_id", invoiceId)

        const totalCOGS = (invItems || []).reduce((sum: number, it: any) => {
          // تجاهل الخدمات
          if (it.products?.item_type === 'service') return sum
          const cost = Number(it.products?.cost_price || 0)
          return sum + Number(it.quantity || 0) * cost
        }, 0)

        if (totalCOGS > 0) {
          const { data: cogsEntry, error: cogsError } = await supabase
            .from("journal_entries")
            .insert({
              company_id: mapping.companyId,
              reference_type: "invoice_cogs",
              reference_id: invoiceId,
              entry_date: invoice.invoice_date,
              description: `تكلفة مبيعات ${invoice.invoice_number}`,
            })
            .select()
            .single()

          if (!cogsError && cogsEntry) {
            await supabase.from("journal_entry_lines").insert([
              // من ح/ تكلفة البضاعة المباعة
              {
                journal_entry_id: cogsEntry.id,
                account_id: mapping.cogs,
                debit_amount: totalCOGS,
                credit_amount: 0,
                description: "تكلفة البضاعة المباعة",
              },
              // إلى ح/ المخزون
              {
                journal_entry_id: cogsEntry.id,
                account_id: mapping.inventory,
                debit_amount: 0,
                credit_amount: totalCOGS,
                description: "المخزون",
              },
            ])

            // ربط معاملات المخزون بقيد COGS
            await supabase
              .from("inventory_transactions")
              .update({ journal_entry_id: cogsEntry.id })
              .eq("reference_id", invoiceId)
              .eq("transaction_type", "sale")
          }
        }
      }

      // ===== 5) قيد الدفع =====
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

  if (isLoading) {
    return (
      <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
        <Sidebar />
      <main className="flex-1 md:mr-64 p-4 md:p-8 print-area">
          <p className="text-center py-8">جاري التحميل...</p>
        </main>
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
        <Sidebar />
        <main className="flex-1 md:mr-64 p-4 md:p-8">
          <p className="text-center py-8 text-red-600">{appLang==='en' ? 'Invoice not found' : 'لم يتم العثور على الفاتورة'}</p>
        </main>
      </div>
    )
  }

  const remainingAmount = invoice.total_amount - invoice.paid_amount

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
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />
      {/* Main Content - تحسين للهاتف */}
      <main ref={printAreaRef} className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 print-area overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 print:space-y-4 max-w-full">
          <div className="flex flex-col sm:flex-row sm:justify-between items-start gap-3 print:hidden">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white truncate">{appLang==='en' ? `Invoice #${invoice.invoice_number}` : `الفاتورة #${invoice.invoice_number}`}</h1>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1 sm:mt-2">{appLang==='en' ? `Issue date: ${new Date(invoice.invoice_date).toLocaleDateString('en')}` : `تاريخ الإصدار: ${new Date(invoice.invoice_date).toLocaleDateString('ar')}`}</p>
            </div>

            <div className="flex gap-2 relative z-50 pointer-events-auto flex-wrap">
              <Button variant="outline" onClick={handleDownloadPDF}>
                <FileDown className="w-4 h-4 mr-2" />
                {appLang==='en' ? 'Download PDF' : 'تنزيل PDF'}
              </Button>
              <Button variant="outline" onClick={handlePrint}>
                <Printer className="w-4 h-4 mr-2" />
                {appLang==='en' ? 'Print' : 'طباعة'}
              </Button>
              {prevInvoiceId ? (
                <Link href={`/invoices/${prevInvoiceId}`}>
                  <Button variant="outline">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    {appLang==='en' ? 'Previous Invoice' : 'الفاتورة السابقة'}
                  </Button>
                </Link>
              ) : (
                <Button variant="outline" disabled>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  {appLang==='en' ? 'Previous Invoice' : 'الفاتورة السابقة'}
                </Button>
              )}
              {nextInvoiceId ? (
                <Link href={`/invoices/${nextInvoiceId}`}>
                  <Button variant="outline">
                    <ArrowRight className="w-4 h-4 mr-2" />
                    {appLang==='en' ? 'Next Invoice' : 'الفاتورة التالية'}
                  </Button>
                </Link>
              ) : (
                <Button variant="outline" disabled>
                  <ArrowRight className="w-4 h-4 mr-2" />
                  {appLang==='en' ? 'Next Invoice' : 'الفاتورة التالية'}
                </Button>
              )}
              
              {permUpdate ? (
                <Link href={`/invoices/${invoice.id}/edit`}>
                  <Button variant="outline">
                    <Pencil className="w-4 h-4 mr-2" />
                    {appLang==='en' ? 'Edit' : 'تعديل'}
                  </Button>
                </Link>
              ) : null}
              <Button variant="outline" onClick={() => router.push("/invoices")}> 
                <ArrowRight className="w-4 h-4 mr-2" />
                {appLang==='en' ? 'Back' : 'العودة'}
              </Button>
            </div>
          </div>

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
                    <h1 className="text-3xl font-bold text-blue-600 print:text-blue-800">{appLang==='en' ? 'INVOICE' : 'فاتورة'}</h1>
                    <p className="text-xl font-semibold mt-1">#{invoice.invoice_number}</p>
                  </div>
                </div>
              </div>

              {/* معلومات الفاتورة والعميل */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 print:gap-4">
                {/* معلومات العميل */}
                <div className="md:col-span-2">
                  <h3 className="font-semibold mb-2 text-gray-700 dark:text-gray-300 print:text-gray-800 border-b pb-1">{appLang==='en' ? 'Bill To:' : 'فاتورة إلى:'}</h3>
                  <p className="text-base font-medium text-gray-900 dark:text-white print:text-black">{invoice.customers?.name}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 print:text-gray-700">{invoice.customers?.email}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 print:text-gray-700">{invoice.customers?.address}</p>
                </div>

                {/* تفاصيل الفاتورة */}
                <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-4 print:bg-gray-100 print:p-3">
                  <table className="w-full text-sm">
                    <tbody>
                      <tr>
                        <td className="py-1 font-medium text-gray-600 dark:text-gray-400 print:text-gray-700">{appLang==='en' ? 'Invoice Number:' : 'رقم الفاتورة:'}</td>
                        <td className="py-1 text-right font-semibold">{invoice.invoice_number}</td>
                      </tr>
                      <tr>
                        <td className="py-1 font-medium text-gray-600 dark:text-gray-400 print:text-gray-700">{appLang==='en' ? 'Invoice Date:' : 'تاريخ الفاتورة:'}</td>
                        <td className="py-1 text-right">{new Date(invoice.invoice_date).toLocaleDateString(appLang==='en' ? 'en-GB' : 'ar-EG')}</td>
                      </tr>
                      <tr>
                        <td className="py-1 font-medium text-gray-600 dark:text-gray-400 print:text-gray-700">{appLang==='en' ? 'Due Date:' : 'تاريخ الاستحقاق:'}</td>
                        <td className="py-1 text-right">{new Date(invoice.due_date).toLocaleDateString(appLang==='en' ? 'en-GB' : 'ar-EG')}</td>
                      </tr>
                      <tr>
                        <td className="py-1 font-medium text-gray-600 dark:text-gray-400 print:text-gray-700">{appLang==='en' ? 'Status:' : 'الحالة:'}</td>
                        <td className="py-1 text-right">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            invoice.status === 'paid' ? 'bg-green-100 text-green-800 print:bg-green-50' :
                            invoice.status === 'sent' ? 'bg-blue-100 text-blue-800 print:bg-blue-50' :
                            invoice.status === 'overdue' ? 'bg-red-100 text-red-800 print:bg-red-50' :
                            'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200 print:bg-gray-50'
                          }`}>
                            {invoice.status === 'paid' ? (appLang==='en' ? 'Paid' : 'مدفوعة') :
                             invoice.status === 'sent' ? (appLang==='en' ? 'Sent' : 'مرسلة') :
                             invoice.status === 'overdue' ? (appLang==='en' ? 'Overdue' : 'متأخرة') :
                             invoice.status === 'draft' ? (appLang==='en' ? 'Draft' : 'مسودة') :
                             invoice.status}
                          </span>
                        </td>
                      </tr>
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
                      <th className="px-3 py-2 text-right border border-blue-500 print:border-gray-300">{appLang==='en' ? 'Product' : 'المنتج'}</th>
                      <th className="px-3 py-2 text-center border border-blue-500 print:border-gray-300">{appLang==='en' ? 'Qty' : 'الكمية'}</th>
                      <th className="px-3 py-2 text-center border border-blue-500 print:border-gray-300">{appLang==='en' ? 'Returned' : 'المرتجع'}</th>
                      <th className="px-3 py-2 text-center border border-blue-500 print:border-gray-300">{appLang==='en' ? 'Net Qty' : 'الصافي'}</th>
                      <th className="px-3 py-2 text-right border border-blue-500 print:border-gray-300">{appLang==='en' ? 'Unit Price' : 'سعر الوحدة'}</th>
                      <th className="px-3 py-2 text-center border border-blue-500 print:border-gray-300">{appLang==='en' ? 'Disc%' : 'خصم%'}</th>
                      <th className="px-3 py-2 text-center border border-blue-500 print:border-gray-300">{appLang==='en' ? 'Tax%' : 'ضريبة%'}</th>
                      <th className="px-3 py-2 text-right border border-blue-500 print:border-gray-300">{appLang==='en' ? 'Total' : 'الإجمالي'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, index) => {
                      const returnedQty = Number(item.returned_quantity || 0)
                      const effectiveQty = item.quantity - returnedQty
                      const itemTotal = Number(item.line_total || 0) + (Number(item.line_total || 0) * Number(item.tax_rate || 0)) / 100
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
                                <span className="line-through text-gray-400 dark:text-gray-500 text-xs">{itemTotal.toFixed(2)}</span>
                                <div className="text-green-600 print:text-green-700">{netTotal.toFixed(2)}</div>
                              </>
                            ) : (
                              itemTotal.toFixed(2)
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
                        {appLang==='en' ? 'Prices shown are tax inclusive' : 'الأسعار المعروضة شاملة الضريبة'}
                      </p>
                    </div>
                  )}
                  <div className="mt-4 text-xs text-gray-500 dark:text-gray-400 print:text-gray-700">
                    <p className="font-medium mb-1">{appLang==='en' ? 'Terms & Conditions:' : 'الشروط والأحكام:'}</p>
                    <p>{appLang==='en' ? 'Payment is due within the specified period.' : 'الدفع مستحق خلال الفترة المحددة.'}</p>
                  </div>
                </div>

                {/* ملخص المبالغ */}
                <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-4 print:bg-gray-100 print:p-3">
                  <table className="w-full text-sm">
                    <tbody>
                      <tr>
                        <td className="py-1 text-gray-600 dark:text-gray-400 print:text-gray-700">{appLang==='en' ? 'Subtotal:' : 'المجموع الفرعي:'}</td>
                        <td className="py-1 text-right">{invoice.subtotal.toFixed(2)}</td>
                      </tr>
                      {discountBeforeTax > 0 && (
                        <tr className="text-orange-600 print:text-orange-700">
                          <td className="py-1">{appLang==='en' ? `Pre-tax Discount${invoice.discount_type === 'percent' ? ` (${Number(invoice.discount_value || 0).toFixed(1)}%)` : ''}:` : `خصم قبل الضريبة${invoice.discount_type === "percent" ? ` (${Number(invoice.discount_value || 0).toFixed(1)}%)` : ""}:`}</td>
                          <td className="py-1 text-right">-{discountBeforeTax.toFixed(2)}</td>
                        </tr>
                      )}
                      <tr>
                        <td className="py-1 text-gray-600 dark:text-gray-400 print:text-gray-700">{appLang==='en' ? 'Tax:' : 'الضريبة:'}</td>
                        <td className="py-1 text-right">{invoice.tax_amount.toFixed(2)}</td>
                      </tr>
                      {taxSummary.length > 0 && taxSummary.map((t, idx) => (
                        <tr key={idx} className="text-xs text-gray-500 dark:text-gray-400">
                          <td className="py-0.5 pr-4">&nbsp;&nbsp;{appLang==='en' ? `└ VAT ${t.rate}%:` : `└ ضريبة ${t.rate}%:`}</td>
                          <td className="py-0.5 text-right">{t.amount.toFixed(2)}</td>
                        </tr>
                      ))}
                      {shipping > 0 && (
                        <tr>
                          <td className="py-1 text-gray-600 dark:text-gray-400 print:text-gray-700">{appLang==='en' ? `Shipping${shippingTaxRate > 0 ? ` (+${shippingTaxRate}% tax)` : ''}:` : `الشحن${shippingTaxRate > 0 ? ` (+${shippingTaxRate}% ضريبة)` : ''}:`}</td>
                          <td className="py-1 text-right">{(shipping + shippingTaxAmount).toFixed(2)}</td>
                        </tr>
                      )}
                      {discountAfterTax > 0 && (
                        <tr className="text-orange-600 print:text-orange-700">
                          <td className="py-1">{appLang==='en' ? `Post-tax Discount${invoice.discount_type === 'percent' ? ` (${Number(invoice.discount_value || 0).toFixed(1)}%)` : ''}:` : `خصم بعد الضريبة${invoice.discount_type === "percent" ? ` (${Number(invoice.discount_value || 0).toFixed(1)}%)` : ""}:`}</td>
                          <td className="py-1 text-right">-{discountAfterTax.toFixed(2)}</td>
                        </tr>
                      )}
                      {adjustment !== 0 && (
                        <tr>
                          <td className="py-1 text-gray-600 dark:text-gray-400 print:text-gray-700">{appLang==='en' ? 'Adjustment:' : 'التعديل:'}</td>
                          <td className="py-1 text-right">{adjustment > 0 ? '+' : ''}{adjustment.toFixed(2)}</td>
                        </tr>
                      )}
                      <tr className="border-t-2 border-gray-300">
                        <td className="py-2 font-bold text-lg text-gray-900 dark:text-white print:text-black">{appLang==='en' ? 'Total:' : 'الإجمالي:'}</td>
                        <td className="py-2 text-right font-bold text-lg text-blue-600 print:text-blue-800">{invoice.total_amount.toFixed(2)} <span className="text-sm">{currencySymbol}</span></td>
                      </tr>
                      {/* عرض القيمة المحولة إذا كانت العملة مختلفة */}
                      {invoice.currency_code && invoice.currency_code !== appCurrency && invoice.base_currency_total && (
                        <tr className="bg-gray-50 dark:bg-gray-800">
                          <td className="py-1 text-xs text-gray-500 dark:text-gray-400">{appLang==='en' ? `Equivalent in ${appCurrency}:` : `المعادل بـ ${appCurrency}:`}</td>
                          <td className="py-1 text-right text-xs text-gray-600 dark:text-gray-400 font-medium">{invoice.base_currency_total.toFixed(2)} {appCurrency}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>

                  {/* حالة الدفع */}
                  <div className={`mt-4 p-3 rounded-lg border ${
                    invoice.status === 'paid'
                      ? 'bg-green-50 border-green-200 print:bg-green-50'
                      : 'bg-blue-50 border-blue-200 print:bg-blue-50'
                  }`}>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600 dark:text-gray-400 print:text-gray-700">{appLang==='en' ? 'Amount Paid:' : 'المبلغ المدفوع:'}</span>
                      <span className="font-medium text-green-600 print:text-green-700">{invoice.paid_amount.toFixed(2)} {currencySymbol}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm mt-1">
                      <span className="text-gray-600 dark:text-gray-400 print:text-gray-700">{appLang==='en' ? 'Balance Due:' : 'المبلغ المتبقي:'}</span>
                      <span className={`font-bold ${remainingAmount > 0 ? 'text-red-600 print:text-red-700' : 'text-green-600 print:text-green-700'}`}>
                        {remainingAmount.toFixed(2)} {currencySymbol}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* تذييل الفاتورة للطباعة */}
              <div className="hidden print:block border-t pt-4 mt-6 text-center text-xs text-gray-500 dark:text-gray-400">
                <p>{appLang==='en' ? 'Thank you for your business!' : 'شكراً لتعاملكم معنا!'}</p>
                <p className="mt-1">{invoice.companies?.name} | {invoice.companies?.phone} | {invoice.companies?.email}</p>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3 print:hidden">
            {invoice.status !== "paid" && (
              <>
                {invoice.status === "draft" && permUpdate ? (
                  <Button onClick={() => handleChangeStatus("sent")} className="bg-blue-600 hover:bg-blue-700">
                    {appLang==='en' ? 'Mark as Sent' : 'تحديد كمرسلة'}
                  </Button>
                ) : null}
                {invoice.status !== "cancelled" && permUpdate ? (
                  <Button variant="outline" onClick={() => handleChangeStatus("partially_paid")}>
                    {appLang==='en' ? 'Mark as Partially Paid' : 'تحديد كمدفوعة جزئياً'}
                  </Button>
                ) : null}
                {remainingAmount > 0 && permPayWrite ? (
                  <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => {
                    setPaymentAmount(remainingAmount)
                    setShowPayment(true)
                  }}>
                    {appLang==='en' ? 'Record Payment' : 'تسجيل دفعة'}
                  </Button>
                ) : null}
                {invoice.status !== "cancelled" && invoice.status !== "draft" && permUpdate ? (
                  <Button variant="outline" className="border-orange-500 text-orange-600 hover:bg-orange-50" onClick={openPartialReturnDialog}>
                    {appLang==='en' ? 'Partial Return' : 'مرتجع جزئي'}
                  </Button>
                ) : null}
                {/* Reverse Return Button */}
                {hasReturns && permDelete ? (
                  <Button variant="outline" className="border-purple-500 text-purple-600 hover:bg-purple-50" onClick={() => setShowReverseReturn(true)}>
                    {appLang==='en' ? 'Reverse Return' : 'عكس المرتجع'}
                  </Button>
                ) : null}
                {invoice.status !== "cancelled" && permDelete ? (
                  <Button variant="destructive" onClick={() => setShowCredit(true)}>
                    {appLang==='en' ? 'Issue Full Credit Note' : 'إصدار مذكرة دائن كاملة'}
                  </Button>
                ) : null}
                {remainingAmount <= 0 && permUpdate ? (
                  <Button onClick={() => handleChangeStatus("paid")} className="bg-green-600 hover:bg-green-700">
                    {appLang==='en' ? 'Mark as Paid' : 'تحديد كمدفوعة'}
                  </Button>
                ) : null}
              </>
            )}
          </div>

          {/* Dialog: Receive Payment */}
          <Dialog open={showPayment} onOpenChange={setShowPayment}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{appLang==='en' ? `Record payment for invoice #${invoice.invoice_number}` : `تسجيل دفعة للفاتورة #${invoice.invoice_number}`}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>{appLang==='en' ? 'Amount' : 'المبلغ'}</Label>
                  <Input
                    type="number"
                    value={paymentAmount}
                    min={0}
                    step={0.01}
                    onChange={(e) => setPaymentAmount(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{appLang==='en' ? 'Payment Date' : 'تاريخ الدفع'}</Label>
                  <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
                </div>
              <div className="space-y-2">
                <Label>{appLang==='en' ? 'Payment Method' : 'طريقة الدفع'}</Label>
                <Input value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} placeholder="cash" />
              </div>
              <div className="space-y-2">
                <Label>{appLang==='en' ? 'Account (Cash/Bank)' : 'الحساب (نقد/بنك)'}</Label>
                <select
                  className="w-full border rounded px-3 py-2 bg-white dark:bg-slate-900"
                  value={paymentAccountId}
                  onChange={(e) => setPaymentAccountId(e.target.value)}
                >
                  <option value="">{appLang==='en' ? 'Select account' : 'اختر الحساب'}</option>
                  {cashBankAccounts.map((a: any) => (
                    <option key={a.id} value={a.id}>
                      {(a.account_code ? `${a.account_code} - ` : "") + a.account_name}
                    </option>
                  ))}
                </select>
              </div>
                <div className="space-y-2">
                  <Label>{appLang==='en' ? 'Reference/Receipt No. (optional)' : 'مرجع/رقم إيصال (اختياري)'}</Label>
                  <Input value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowPayment(false)} disabled={savingPayment}>{appLang==='en' ? 'Cancel' : 'إلغاء'}</Button>
                <Button
                  onClick={() => recordInvoicePayment(paymentAmount, paymentDate, paymentMethod, paymentRef)}
                  disabled={savingPayment || paymentAmount <= 0 || !paymentAccountId}
                >
                  {appLang==='en' ? 'Save Payment' : 'حفظ الدفعة'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Dialog: Full Credit Note */}
          <Dialog open={showCredit} onOpenChange={setShowCredit}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{appLang==='en' ? 'Issue full credit note' : 'إصدار مذكرة دائن كاملة'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>{appLang==='en' ? 'Credit note date' : 'تاريخ المذكرة'}</Label>
                  <Input type="date" value={creditDate} onChange={(e) => setCreditDate(e.target.value)} />
                </div>
                <p className="text-sm text-red-600">{appLang==='en' ? 'Revenue, tax, and receivables for this invoice will be reversed, and inventory fully returned. The invoice amounts will be zero and its status will become cancelled.' : 'سيتم عكس الإيراد والضريبة والذمم لهذه الفاتورة، وإرجاع المخزون بالكامل. ستصبح قيم الفاتورة صفرًا وتتحول حالتها إلى "ملغاة".'}</p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCredit(false)}>{appLang==='en' ? 'Cancel' : 'إلغاء'}</Button>
                <Button variant="destructive" onClick={issueFullCreditNote}>{appLang==='en' ? 'Confirm Issue Credit Note' : 'تأكيد إصدار مذكرة دائن'}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Dialog: Partial Return */}
          <Dialog open={showPartialReturn} onOpenChange={setShowPartialReturn}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{appLang==='en' ? 'Partial Sales Return' : 'مرتجع مبيعات جزئي'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                {/* Return Items Table */}
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 dark:bg-slate-800">
                      <tr>
                        <th className="px-3 py-2 text-right">{appLang==='en' ? 'Product' : 'المنتج'}</th>
                        <th className="px-3 py-2 text-center">{appLang==='en' ? 'Max Qty' : 'الحد الأقصى'}</th>
                        <th className="px-3 py-2 text-center">{appLang==='en' ? 'Return Qty' : 'كمية المرتجع'}</th>
                        <th className="px-3 py-2 text-right">{appLang==='en' ? 'Unit Price' : 'سعر الوحدة'}</th>
                        <th className="px-3 py-2 text-right">{appLang==='en' ? 'Total' : 'الإجمالي'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {returnItems.map((item, idx) => {
                        const gross = item.return_qty * item.unit_price
                        const net = gross - (gross * (item.discount_percent || 0) / 100)
                        const tax = net * (item.tax_rate || 0) / 100
                        const lineTotal = net + tax
                        return (
                          <tr key={item.item_id} className="border-t">
                            <td className="px-3 py-2">{item.product_name}</td>
                            <td className="px-3 py-2 text-center text-gray-500">{item.max_qty}</td>
                            <td className="px-3 py-2 text-center">
                              <Input
                                type="number"
                                min={0}
                                max={item.max_qty}
                                value={item.return_qty}
                                onChange={(e) => {
                                  const val = Math.min(Math.max(0, Number(e.target.value)), item.max_qty)
                                  setReturnItems(prev => prev.map((it, i) => i === idx ? { ...it, return_qty: val } : it))
                                }}
                                className="w-20 text-center"
                              />
                            </td>
                            <td className="px-3 py-2 text-right">{item.unit_price.toFixed(2)}</td>
                            <td className="px-3 py-2 text-right font-medium">{lineTotal.toFixed(2)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot className="bg-gray-50 dark:bg-slate-900">
                      <tr>
                        <td colSpan={4} className="px-3 py-2 text-left font-bold">{appLang==='en' ? 'Total Return Amount:' : 'إجمالي المرتجع:'}</td>
                        <td className="px-3 py-2 text-right font-bold text-red-600">{returnTotal.toFixed(2)} {currencySymbol}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Refund Method */}
                <div className="space-y-2">
                  <Label>{appLang==='en' ? 'Refund Method' : 'طريقة الاسترداد'}</Label>
                  <select
                    className="w-full border rounded px-3 py-2 bg-white dark:bg-slate-900"
                    value={returnMethod}
                    onChange={(e) => setReturnMethod(e.target.value as any)}
                  >
                    <option value="credit_note">{appLang==='en' ? 'Credit Note (Customer Credit)' : 'مذكرة دائن (رصيد للعميل)'}</option>
                    <option value="cash">{appLang==='en' ? 'Cash Refund' : 'استرداد نقدي'}</option>
                    <option value="bank_transfer">{appLang==='en' ? 'Bank Transfer' : 'تحويل بنكي'}</option>
                  </select>
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <Label>{appLang==='en' ? 'Notes' : 'ملاحظات'}</Label>
                  <Input
                    value={returnNotes}
                    onChange={(e) => setReturnNotes(e.target.value)}
                    placeholder={appLang==='en' ? 'Return reason...' : 'سبب المرتجع...'}
                  />
                </div>

                <p className="text-sm text-orange-600">{appLang==='en' ? 'This will reverse the revenue, tax, and receivables for the returned items, and return the inventory to stock.' : 'سيتم عكس الإيراد والضريبة والذمم للأصناف المرتجعة، وإرجاع المخزون للمستودع.'}</p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowPartialReturn(false)}>{appLang==='en' ? 'Cancel' : 'إلغاء'}</Button>
                <Button
                  className="bg-orange-600 hover:bg-orange-700"
                  onClick={processPartialReturn}
                  disabled={returnProcessing || returnTotal <= 0}
                >
                  {returnProcessing ? (appLang==='en' ? 'Processing...' : 'جاري المعالجة...') : (appLang==='en' ? 'Process Return' : 'معالجة المرتجع')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Reverse Return Confirmation Dialog */}
          <AlertDialog open={showReverseReturn} onOpenChange={setShowReverseReturn}>
            <AlertDialogContent dir={appLang==='en' ? 'ltr' : 'rtl'}>
              <AlertDialogHeader>
                <AlertDialogTitle className="text-purple-600">
                  {appLang==='en' ? '⚠️ Reverse Sales Return' : '⚠️ عكس مرتجع المبيعات'}
                </AlertDialogTitle>
                <AlertDialogDescription className="space-y-3">
                  <p>{appLang==='en' ? 'Are you sure you want to reverse this sales return? This action will:' : 'هل أنت متأكد من عكس هذا المرتجع؟ سيؤدي هذا إلى:'}</p>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li>{appLang==='en' ? 'Delete all journal entries related to this return' : 'حذف جميع القيود المحاسبية المرتبطة بالمرتجع'}</li>
                    <li>{appLang==='en' ? 'Remove returned items from inventory' : 'إزالة الأصناف المرتجعة من المخزون'}</li>
                    <li>{appLang==='en' ? 'Delete any customer credits created for this return' : 'حذف أرصدة العملاء المنشأة لهذا المرتجع'}</li>
                    <li>{appLang==='en' ? 'Reset returned amounts on invoice items' : 'تصفير الكميات المرتجعة في بنود الفاتورة'}</li>
                    <li>{appLang==='en' ? 'Reset invoice return status' : 'إعادة حالة المرتجع للفاتورة'}</li>
                  </ul>
                  {invoice && (
                    <div className="mt-3 p-3 bg-purple-50 dark:bg-purple-900/20 rounded">
                      <p className="font-medium">{appLang==='en' ? 'Return to reverse:' : 'المرتجع المراد عكسه:'}</p>
                      <p className="text-sm">{appLang==='en' ? 'Amount:' : 'المبلغ:'} {Number((invoice as any).returned_amount || 0).toLocaleString()} {currencySymbol}</p>
                    </div>
                  )}
                  <p className="text-red-600 font-medium">{appLang==='en' ? 'This action cannot be undone!' : 'لا يمكن التراجع عن هذا الإجراء!'}</p>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={reverseReturnProcessing}>
                  {appLang==='en' ? 'Cancel' : 'إلغاء'}
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={reverseSalesReturn}
                  disabled={reverseReturnProcessing}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  {reverseReturnProcessing ? '...' : (appLang==='en' ? 'Confirm Reverse' : 'تأكيد العكس')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </main>
    </div>
  )
}
