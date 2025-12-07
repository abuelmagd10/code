"use client"

import { useEffect, useMemo, useState, useRef } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import { useSupabase } from "@/lib/supabase/hooks"
import { Button } from "@/components/ui/button"
import { useParams } from "next/navigation"
import { Pencil, Trash2, Printer, FileDown, ArrowLeft, ArrowRight, RotateCcw } from "lucide-react"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import { toastActionError, toastActionSuccess } from "@/lib/notifications"
import { canAction } from "@/lib/authz"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getExchangeRate, getActiveCurrencies, type Currency } from "@/lib/currency-service"
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

type Bill = {
  id: string
  supplier_id: string
  company_id: string
  bill_number: string
  bill_date: string
  due_date: string
  subtotal: number
  tax_amount: number
  total_amount: number
  discount_type: "amount" | "percent"
  discount_value: number
  discount_position: "before_tax" | "after_tax"
  tax_inclusive: boolean
  shipping: number
  shipping_tax_rate: number
  adjustment: number
  status: string
  // Multi-currency fields
  currency_code?: string
  exchange_rate?: number
  base_currency_total?: number
}

type Supplier = { id: string; name: string }
type BillItem = { id: string; product_id: string; description: string | null; quantity: number; returned_quantity?: number; unit_price: number; tax_rate: number; discount_percent: number; line_total: number }
type Product = { id: string; name: string; sku: string }
type Payment = { id: string; bill_id: string | null; amount: number }

export default function BillViewPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id as string
  const supabase = useSupabase()
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const printAreaRef = useMemo(() => ({ current: null as HTMLDivElement | null }), [])
  const billContentRef = useRef<HTMLDivElement | null>(null)
  const [bill, setBill] = useState<Bill | null>(null)
  const [supplier, setSupplier] = useState<Supplier | null>(null)
  const [items, setItems] = useState<BillItem[]>([])
  const [products, setProducts] = useState<Record<string, Product>>({})
  const [payments, setPayments] = useState<Payment[]>([])
  const [posting, setPosting] = useState(false)
  const [permUpdate, setPermUpdate] = useState(false)
  const [permDelete, setPermDelete] = useState(false)
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string>("")
  const [nextBillId, setNextBillId] = useState<string | null>(null)
  const [prevBillId, setPrevBillId] = useState<string | null>(null)
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [appCurrency, setAppCurrency] = useState<string>('EGP')

  // Purchase Return Dialog State
  const [returnOpen, setReturnOpen] = useState(false)
  const [returnType, setReturnType] = useState<'partial' | 'full'>('partial')
  const [returnItems, setReturnItems] = useState<Array<{ item_id: string; product_id: string; product_name: string; max_qty: number; return_qty: number; unit_price: number }>>([])
  const [returnMethod, setReturnMethod] = useState<'cash' | 'bank' | 'credit'>('cash')
  const [returnAccountId, setReturnAccountId] = useState<string>('')
  const [returnNotes, setReturnNotes] = useState<string>('')
  const [accounts, setAccounts] = useState<Array<{ id: string; account_code: string | null; account_name: string; sub_type: string | null }>>([])
  const [returnProcessing, setReturnProcessing] = useState(false)
  // Multi-currency for returns
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [returnCurrency, setReturnCurrency] = useState<string>('EGP')
  const [returnExRate, setReturnExRate] = useState<{ rate: number; rateId: string | null; source: string }>({ rate: 1, rateId: null, source: 'same_currency' })
  // Bill financial details for return form
  const [returnBillData, setReturnBillData] = useState<{
    originalTotal: number
    paidAmount: number
    remainingAmount: number
    previouslyReturned: number
    billCurrency: string
    paymentStatus: 'unpaid' | 'partial' | 'paid'
  }>({
    originalTotal: 0,
    paidAmount: 0,
    remainingAmount: 0,
    previouslyReturned: 0,
    billCurrency: 'EGP',
    paymentStatus: 'unpaid'
  })

  // Reverse/Delete return state
  const [reverseReturnOpen, setReverseReturnOpen] = useState(false)
  const [reverseReturnProcessing, setReverseReturnProcessing] = useState(false)

  // Currency symbols map
  const currencySymbols: Record<string, string> = {
    EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ',
    KWD: 'د.ك', QAR: '﷼', BHD: 'د.ب', OMR: '﷼', JOD: 'د.أ', LBP: 'ل.ل'
  }
  const currencySymbol = currencySymbols[appCurrency] || appCurrency

  useEffect(() => {
    loadData()
    ;(async () => {
      try {
        setPermUpdate(await canAction(supabase, 'bills', 'update'))
        setPermDelete(await canAction(supabase, 'bills', 'delete'))
      } catch {}
    })()
    const langHandler = () => {
      try {
        const v = localStorage.getItem('app_language') || 'ar'
        setAppLang(v === 'en' ? 'en' : 'ar')
      } catch {}
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
  }, [id])

  const loadData = async () => {
    try {
      setLoading(true)
      const { data: billData } = await supabase.from("bills").select("*").eq("id", id).single()
      setBill(billData as any)
      if (!billData) return
      const { data: supplierData } = await supabase.from("suppliers").select("id, name").eq("id", billData.supplier_id).single()
      setSupplier(supplierData as any)
      const { data: itemData } = await supabase.from("bill_items").select("*").eq("bill_id", id)
      setItems((itemData || []) as any)
      const productIds = Array.from(new Set((itemData || []).map((it: any) => it.product_id)))
      if (productIds.length) {
        const { data: prodData } = await supabase.from("products").select("id, name, sku").in("id", productIds)
        const map: Record<string, Product> = {}
        ;(prodData || []).forEach((p: any) => map[p.id] = p)
        setProducts(map)
      }
      const { data: payData } = await supabase.from("payments").select("id, bill_id, amount").eq("bill_id", id)
      setPayments((payData || []) as any)

      try {
        const companyId = (billData as any)?.company_id
        if (companyId && billData?.bill_number) {
          const { data: nextByNumber } = await supabase
            .from("bills")
            .select("id, bill_number")
            .eq("company_id", companyId)
            .gt("bill_number", billData.bill_number)
            .order("bill_number", { ascending: true })
            .limit(1)
          setNextBillId((nextByNumber && nextByNumber[0]?.id) || null)

          const { data: prevByNumber } = await supabase
            .from("bills")
            .select("id, bill_number")
            .eq("company_id", companyId)
            .lt("bill_number", billData.bill_number)
            .order("bill_number", { ascending: false })
            .limit(1)
          setPrevBillId((prevByNumber && prevByNumber[0]?.id) || null)

          // Load accounts for returns
          const { data: accs } = await supabase
            .from("chart_of_accounts")
            .select("id, account_code, account_name, sub_type")
            .eq("company_id", companyId)
          setAccounts((accs || []).filter((a: any) => ['cash', 'bank', 'accounts_payable'].includes(String(a.sub_type || '').toLowerCase())))

          // Load currencies
          const curr = await getActiveCurrencies(supabase, companyId)
          if (curr.length > 0) setCurrencies(curr)
          setReturnCurrency(appCurrency)
        } else {
          setNextBillId(null)
          setPrevBillId(null)
        }
      } catch {}
    } finally { setLoading(false) }
  }

  // Update return exchange rate when currency changes
  useEffect(() => {
    const updateReturnRate = async () => {
      if (returnCurrency === appCurrency) {
        setReturnExRate({ rate: 1, rateId: null, source: 'same_currency' })
      } else if (bill?.company_id) {
        const result = await getExchangeRate(supabase, bill.company_id, returnCurrency, appCurrency)
        setReturnExRate({ rate: result.rate, rateId: result.rateId || null, source: result.source })
      }
    }
    updateReturnRate()
  }, [returnCurrency, bill?.company_id, appCurrency])

  const handlePrint = () => { window.print() }
  const handleDownloadPDF = async () => {
    try {
      const el = billContentRef.current
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
          <title>فاتورة مورد ${bill?.bill_number || ''}</title>
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
    }
  }

  const paidTotal = useMemo(() => payments.reduce((sum, p) => sum + (p.amount || 0), 0), [payments])

  // Open return dialog
  const openReturnDialog = (type: 'partial' | 'full') => {
    if (!bill || !items.length) return
    setReturnType(type)
    const returnableItems = items.map(it => ({
      item_id: it.id,
      product_id: it.product_id,
      product_name: products[it.product_id]?.name || it.product_id,
      max_qty: it.quantity - (it.returned_quantity || 0),
      return_qty: type === 'full' ? (it.quantity - (it.returned_quantity || 0)) : 0,
      unit_price: it.unit_price
    })).filter(it => it.max_qty > 0)
    setReturnItems(returnableItems)
    setReturnMethod('cash')
    setReturnAccountId('')
    setReturnNotes('')
    const billCurrency = bill.currency_code || appCurrency
    setReturnCurrency(billCurrency)

    // Store bill financial details for display in form
    const originalTotal = Number(bill.total_amount || 0) + Number((bill as any).returned_amount || 0)
    const paidAmount = Number((bill as any).paid_amount || paidTotal || 0)
    const previouslyReturned = Number((bill as any).returned_amount || 0)
    const remainingAmount = Math.max(0, Number(bill.total_amount || 0) - paidAmount)
    let paymentStatus: 'unpaid' | 'partial' | 'paid' = 'unpaid'
    if (paidAmount >= originalTotal) {
      paymentStatus = 'paid'
    } else if (paidAmount > 0) {
      paymentStatus = 'partial'
    }
    setReturnBillData({
      originalTotal,
      paidAmount,
      remainingAmount,
      previouslyReturned,
      billCurrency,
      paymentStatus
    })

    setReturnOpen(true)
  }

  // Calculate return total
  const returnTotal = useMemo(() => {
    return returnItems.reduce((sum, it) => sum + (it.return_qty * it.unit_price), 0)
  }, [returnItems])

  // Process purchase return
  const processPurchaseReturn = async () => {
    if (!bill || returnTotal <= 0) return
    try {
      setReturnProcessing(true)
      const mapping = await findAccountIds(bill.company_id)
      if (!mapping) {
        toastActionError(toast, appLang==='en' ? 'Return' : 'المرتجع', appLang==='en' ? 'Bill' : 'الفاتورة', appLang==='en' ? 'Account settings not found' : 'لم يتم العثور على إعدادات الحسابات')
        return
      }

      // Calculate base amount for multi-currency
      const baseReturnTotal = returnCurrency === appCurrency ? returnTotal : Math.round(returnTotal * returnExRate.rate * 10000) / 10000

      // Determine refund account
      let refundAccountId: string | null = returnAccountId || null
      if (!refundAccountId) {
        if (returnMethod === 'cash') {
          refundAccountId = mapping.cash || null
        } else if (returnMethod === 'bank') {
          refundAccountId = mapping.bank || null
        } else {
          refundAccountId = mapping.ap || null // Credit to AP (reduce payable)
        }
      }

      if (!refundAccountId && returnMethod !== 'credit') {
        toastActionError(toast, appLang==='en' ? 'Return' : 'المرتجع', appLang==='en' ? 'Account' : 'الحساب', appLang==='en' ? 'No refund account found' : 'لم يتم العثور على حساب للاسترداد')
        return
      }

      // Create journal entry for the return
      const { data: entry, error: entryErr } = await supabase
        .from("journal_entries")
        .insert({
          company_id: bill.company_id,
          reference_type: "purchase_return",
          reference_id: bill.id,
          entry_date: new Date().toISOString().slice(0, 10),
          description: appLang==='en' ? `Purchase return for bill ${bill.bill_number}` : `مرتجع مشتريات للفاتورة ${bill.bill_number}`,
        })
        .select()
        .single()
      if (entryErr) throw entryErr

      // Journal entry lines with multi-currency support
      // القيد المحاسبي الصحيح لمرتجع المشتريات:
      // 1. قيد إرجاع البضاعة: مدين الذمم الدائنة (AP) / دائن المخزون
      // 2. قيد استرداد المال (إذا نقدي): مدين الخزينة / دائن الذمم الدائنة
      const lines: any[] = []

      // Step 1: Always reduce AP and Inventory for returned goods
      // مدين: الذمم الدائنة (تقليل الدين للمورد)
      if (mapping.ap) {
        lines.push({
          journal_entry_id: entry.id,
          account_id: mapping.ap,
          debit_amount: baseReturnTotal,
          credit_amount: 0,
          description: appLang==='en' ? 'Accounts Payable reduction - goods returned' : 'تخفيض الذمم الدائنة - بضاعة مرتجعة',
          original_currency: returnCurrency,
          original_debit: returnTotal,
          original_credit: 0,
          exchange_rate_used: returnExRate.rate,
          exchange_rate_id: returnExRate.rateId,
          rate_source: returnExRate.source
        })
      }

      // دائن: المخزون (البضاعة خرجت)
      const invOrExp = mapping.inventory || mapping.expense
      if (invOrExp) {
        lines.push({
          journal_entry_id: entry.id,
          account_id: invOrExp,
          debit_amount: 0,
          credit_amount: baseReturnTotal,
          description: mapping.inventory ? (appLang==='en' ? 'Inventory reduced - goods returned to supplier' : 'تخفيض المخزون - بضاعة مرتجعة للمورد') : (appLang==='en' ? 'Expense reversal' : 'عكس المصروف'),
          original_currency: returnCurrency,
          original_debit: 0,
          original_credit: returnTotal,
          exchange_rate_used: returnExRate.rate,
          exchange_rate_id: returnExRate.rateId,
          rate_source: returnExRate.source
        })
      }

      const { error: linesErr } = await supabase.from("journal_entry_lines").insert(lines)
      if (linesErr) throw linesErr

      // Step 2: If cash/bank refund, create another entry for money received from supplier
      // قيد استرداد المال من المورد (إذا لم يكن ائتمان)
      if (returnMethod !== 'credit' && refundAccountId && mapping.ap) {
        const { data: refundEntry, error: refundEntryErr } = await supabase
          .from("journal_entries")
          .insert({
            company_id: bill.company_id,
            reference_type: "purchase_return_refund",
            reference_id: bill.id,
            entry_date: new Date().toISOString().slice(0, 10),
            description: appLang==='en' ? `Cash refund received for return - Bill ${bill.bill_number}` : `استرداد نقدي للمرتجع - الفاتورة ${bill.bill_number}`,
          })
          .select()
          .single()

        if (!refundEntryErr && refundEntry) {
          const refundLines = [
            // مدين: الخزينة/البنك (المال دخل)
            {
              journal_entry_id: refundEntry.id,
              account_id: refundAccountId,
              debit_amount: baseReturnTotal,
              credit_amount: 0,
              description: returnMethod === 'cash' ? (appLang==='en' ? 'Cash received from supplier' : 'نقدية مستلمة من المورد') : (appLang==='en' ? 'Bank transfer from supplier' : 'تحويل بنكي من المورد'),
              original_currency: returnCurrency,
              original_debit: returnTotal,
              original_credit: 0,
              exchange_rate_used: returnExRate.rate,
              exchange_rate_id: returnExRate.rateId,
              rate_source: returnExRate.source
            },
            // دائن: الذمم الدائنة (المورد سدد لنا)
            {
              journal_entry_id: refundEntry.id,
              account_id: mapping.ap,
              debit_amount: 0,
              credit_amount: baseReturnTotal,
              description: appLang==='en' ? 'Refund received from supplier' : 'استرداد مستلم من المورد',
              original_currency: returnCurrency,
              original_debit: 0,
              original_credit: returnTotal,
              exchange_rate_used: returnExRate.rate,
              exchange_rate_id: returnExRate.rateId,
              rate_source: returnExRate.source
            }
          ]
          await supabase.from("journal_entry_lines").insert(refundLines)
        }
      }

      // Update bill_items returned_quantity
      for (const it of returnItems) {
        if (it.return_qty > 0) {
          const originalItem = items.find(i => i.id === it.item_id)
          const newReturnedQty = (originalItem?.returned_quantity || 0) + it.return_qty
          await supabase.from("bill_items").update({ returned_quantity: newReturnedQty }).eq("id", it.item_id)
        }
      }

      // Create inventory transactions for returned items
      const invTx = returnItems.filter(it => it.return_qty > 0 && it.product_id).map(it => ({
        company_id: bill.company_id,
        product_id: it.product_id,
        transaction_type: "purchase_return",
        quantity_change: -it.return_qty,
        reference_id: bill.id,
        journal_entry_id: entry.id,
        notes: appLang==='en' ? `Purchase return for bill ${bill.bill_number}` : `مرتجع مشتريات للفاتورة ${bill.bill_number}`,
      }))
      if (invTx.length > 0) {
        await supabase.from("inventory_transactions").insert(invTx)
      }

      // Update products quantity
      for (const it of returnItems) {
        if (it.return_qty > 0 && it.product_id) {
          const { data: prod } = await supabase.from("products").select("quantity_on_hand").eq("id", it.product_id).single()
          if (prod) {
            const newQty = (prod.quantity_on_hand || 0) - it.return_qty
            await supabase.from("products").update({ quantity_on_hand: newQty }).eq("id", it.product_id)
          }
        }
      }

      // Update bill totals, paid amount, and status
      const oldTotal = Number(bill.total_amount || 0)
      const oldPaid = Number((bill as any).paid_amount || 0)
      const currentReturnedAmount = Number((bill as any).returned_amount || 0)
      const newReturnedAmount = currentReturnedAmount + baseReturnTotal
      const newTotal = Math.max(oldTotal - baseReturnTotal, 0)

      // للفاتورة المدفوعة بالكامل: المدفوع الجديد = إجمالي الفاتورة بعد المرتجع
      const wasFullyPaid = oldPaid >= oldTotal
      let newPaid: number

      if (returnMethod === 'credit') {
        // في حالة الائتمان: نخفض المدفوع بقيمة المرتجع
        newPaid = Math.max(oldPaid - baseReturnTotal, 0)
      } else {
        // في حالة النقد/البنك: إذا كانت مدفوعة بالكامل تبقى مدفوعة
        newPaid = wasFullyPaid ? newTotal : Math.min(oldPaid, newTotal)
      }

      const newReturnStatus = newTotal === 0 ? 'full' : 'partial'

      // تحديد الحالة بناءً على الدفع والمرتجع
      let newStatus: string
      if (newTotal === 0) {
        newStatus = "fully_returned"
      } else if (newPaid >= newTotal) {
        newStatus = "paid"
      } else if (newPaid > 0) {
        newStatus = "partially_paid"
      } else {
        newStatus = "sent"
      }

      await supabase.from("bills").update({
        total_amount: newTotal,
        paid_amount: newPaid,
        status: newStatus,
        returned_amount: newReturnedAmount,
        return_status: newReturnStatus
      }).eq("id", bill.id)

      toastActionSuccess(toast, appLang==='en' ? 'Return' : 'المرتجع', appLang==='en' ? 'Purchase return processed' : 'تم معالجة المرتجع')
      setReturnOpen(false)
      await loadData()
    } catch (err: any) {
      console.error("Error processing purchase return:", err)
      toastActionError(toast, appLang==='en' ? 'Return' : 'المرتجع', appLang==='en' ? 'Bill' : 'الفاتورة', err?.message || '')
    } finally {
      setReturnProcessing(false)
    }
  }

  // Check if bill has returns
  const hasReturns = useMemo(() => {
    if (!bill) return false
    return (bill as any).return_status === 'partial' || (bill as any).return_status === 'full' || Number((bill as any).returned_amount || 0) > 0
  }, [bill])

  // Reverse/Delete purchase return - Professional ERP approach
  const reverseReturn = async () => {
    if (!bill || !hasReturns) return
    try {
      setReverseReturnProcessing(true)

      // 1. Find all journal entries related to this bill's returns
      const { data: journalEntries, error: jeErr } = await supabase
        .from("journal_entries")
        .select("id, reference_type, description")
        .eq("reference_id", bill.id)
        .in("reference_type", ["purchase_return", "purchase_return_refund"])

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
        .eq("reference_id", bill.id)
        .eq("transaction_type", "purchase_return")

      if (!invTxErr && invTx && invTx.length > 0) {
        // 5. Restore product quantities (add back what was returned)
        for (const tx of invTx) {
          const { data: prod } = await supabase
            .from("products")
            .select("quantity_on_hand")
            .eq("id", tx.product_id)
            .single()
          if (prod) {
            // quantity_change is negative for purchase returns, so we subtract it (add back)
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

      // 7. Reset returned_quantity in bill_items
      const { error: resetItemsErr } = await supabase
        .from("bill_items")
        .update({ returned_quantity: 0 })
        .eq("bill_id", bill.id)
      if (resetItemsErr) throw resetItemsErr

      // 8. Reset bill returned_amount and return_status
      const { error: resetBillErr } = await supabase
        .from("bills")
        .update({ returned_amount: 0, return_status: null })
        .eq("id", bill.id)
      if (resetBillErr) throw resetBillErr

      // 9. Create audit log entry (professional ERP practice)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        await supabase.from("audit_logs").insert({
          company_id: bill.company_id,
          user_id: user?.id,
          action: "reverse_return",
          entity_type: "bill",
          entity_id: bill.id,
          details: {
            bill_number: bill.bill_number,
            reversed_amount: (bill as any).returned_amount,
            reversed_by: user?.email,
            reversed_at: new Date().toISOString()
          }
        })
      } catch (auditErr) {
        console.warn("Audit log failed:", auditErr)
      }

      toastActionSuccess(toast, appLang==='en' ? 'Reverse' : 'العكس', appLang==='en' ? 'Return reversed successfully' : 'تم عكس المرتجع بنجاح')
      setReverseReturnOpen(false)
      await loadData()
    } catch (err: any) {
      console.error("Error reversing purchase return:", err)
      toastActionError(toast, appLang==='en' ? 'Reverse' : 'العكس', appLang==='en' ? 'Return' : 'المرتجع', err?.message || '')
    } finally {
      setReverseReturnProcessing(false)
    }
  }

  const canHardDelete = useMemo(() => {
    if (!bill) return false
    const hasPayments = payments.length > 0
    const isDraft = bill.status?.toLowerCase() === "draft"
    return isDraft && !hasPayments
  }, [bill, payments])

  // Helper: locate account ids for posting
  const findAccountIds = async (companyId?: string) => {
    const { data: { user } } = await supabase.auth.getUser()
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
    // اعتماد الحسابات الورقية فقط (غير الأب)
    const parentIds = new Set((accounts || []).map((a: any) => a.parent_id).filter(Boolean))
    const leafAccounts = (accounts || []).filter((a: any) => !parentIds.has(a.id))
    const byCode = (code: string) => leafAccounts.find((a: any) => String(a.account_code || "").toUpperCase() === code)?.id
    const byType = (type: string) => leafAccounts.find((a: any) => String(a.account_type || "") === type)?.id
    const byNameIncludes = (name: string) => leafAccounts.find((a: any) => String(a.account_name || "").toLowerCase().includes(name.toLowerCase()))?.id
    const bySubType = (st: string) => leafAccounts.find((a: any) => String(a.sub_type || "").toLowerCase() === st.toLowerCase())?.id

    const ap =
      bySubType("accounts_payable") ||
      byCode("AP") ||
      byNameIncludes("payable") ||
      byNameIncludes("الحسابات الدائنة") ||
      byCode("2000") ||
      byType("liability")
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
    const expense =
      bySubType("operating_expenses") ||
      byNameIncludes("expense") ||
      byNameIncludes("مصروف") ||
      byNameIncludes("مصروفات") ||
      byType("expense")
    const vatReceivable =
      bySubType("vat_input") ||
      byCode("VATIN") ||
      byNameIncludes("vat") ||
      byNameIncludes("ضريبة") ||
      byType("asset")
    const cash = bySubType("cash") || byCode("CASH") || byNameIncludes("cash") || byType("asset")
    const bank = bySubType("bank") || byNameIncludes("bank") || byType("asset")
    const supplierAdvance =
      bySubType("supplier_advance") ||
      byCode("1400") ||
      byNameIncludes("supplier advance") ||
      byNameIncludes("advance to suppliers") ||
      byNameIncludes("advances") ||
      byNameIncludes("prepaid to suppliers") ||
      byNameIncludes("prepayment") ||
      byType("asset")

    return { companyId: companyData.id, ap, inventory, expense, vatReceivable, cash, bank, supplierAdvance }
  }

  // === منطق الفاتورة المرسلة (Sent) ===
  // عند الإرسال: فقط إضافة المخزون، بدون قيود محاسبية
  // القيود المحاسبية تُنشأ عند الدفع الأول
  const postBillInventoryOnly = async () => {
    try {
      if (!bill) return
      setPosting(true)
      const mapping = await findAccountIds(bill.company_id)
      if (!mapping) {
        toastActionError(toast, "الإرسال", "فاتورة المورد", "لم يتم العثور على إعدادات الحسابات")
        return
      }

      // Prevent duplicate inventory transactions
      const { data: existingTx } = await supabase
        .from("inventory_transactions")
        .select("id")
        .eq("reference_id", bill.id)
        .eq("transaction_type", "purchase")
        .limit(1)
      if (existingTx && existingTx.length > 0) {
        toastActionSuccess(toast, "التحقق", "فاتورة المورد", "تم إضافة المخزون مسبقاً")
        return
      }

      // Inventory transactions from bill items (products only, not services)
      const { data: billItems } = await supabase
        .from("bill_items")
        .select("product_id, quantity, products(item_type)")
        .eq("bill_id", bill.id)

      const invTx = (billItems || [])
        .filter((it: any) => it.product_id && it.products?.item_type !== 'service')
        .map((it: any) => ({
          company_id: bill.company_id,
          product_id: it.product_id,
          transaction_type: "purchase",
          quantity_change: it.quantity,
          reference_id: bill.id,
          notes: `فاتورة شراء ${bill.bill_number}`,
        }))

      if (invTx.length > 0) {
        const { error: invErr } = await supabase
          .from("inventory_transactions")
          .insert(invTx)
        if (invErr) console.warn("Failed inserting inventory transactions from bill:", invErr)
      }

      // Update product quantities (increase on purchase) - products only
      const productItems = (billItems || []).filter((it: any) => it.product_id && it.products?.item_type !== 'service')
      for (const it of productItems) {
        try {
          const { data: prod } = await supabase
            .from("products")
            .select("id, quantity_on_hand")
            .eq("id", it.product_id)
            .single()
          if (prod) {
            const newQty = Number(prod.quantity_on_hand || 0) + Number(it.quantity || 0)
            await supabase
              .from("products")
              .update({ quantity_on_hand: newQty })
              .eq("id", it.product_id)
          }
        } catch (e) {
          console.warn("Error updating product quantity after purchase", e)
        }
      }

      toastActionSuccess(toast, "الإرسال", "فاتورة المورد", "تم إضافة الكميات للمخزون")
    } catch (err: any) {
      console.error("Error posting bill inventory:", err)
      const msg = String(err?.message || "")
      toastActionError(toast, "الإرسال", "فاتورة المورد", msg)
    } finally {
      setPosting(false)
    }
  }

  const changeStatus = async (newStatus: string) => {
    try {
      if (!bill) return

      // منع تغيير الحالة إلى "مرسل" إذا كانت الفاتورة مرسلة مسبقاً
      if (newStatus === "sent" && (bill.status === "sent" || bill.status === "received" || bill.status === "partially_paid" || bill.status === "paid")) {
        toastActionError(toast, "التحديث", "فاتورة المورد", "لا يمكن إعادة إرسال فاتورة مرسلة مسبقاً")
        return
      }

      const { error } = await supabase.from("bills").update({ status: newStatus }).eq("id", bill.id)
      if (error) throw error
      if (newStatus === "sent") {
        // عند الإرسال: فقط إضافة المخزون (بدون قيود محاسبية)
        await postBillInventoryOnly()
      } else if (newStatus === "draft" || newStatus === "cancelled") {
        await reverseBillInventory()
      }
      await loadData()
      toastActionSuccess(toast, "التحديث", "فاتورة المورد")
    } catch (err) {
      console.error("Error updating bill status:", err)
      toastActionError(toast, "التحديث", "فاتورة المورد", "تعذر تحديث حالة الفاتورة")
    }
  }

  const reverseBillInventory = async () => {
    try {
      if (!bill) return
      const mapping = await findAccountIds(bill.company_id)
      if (!mapping || !mapping.inventory) return
      const { data: billItems } = await supabase
        .from("bill_items")
        .select("product_id, quantity")
        .eq("bill_id", bill.id)
      // Create reversal journal entry
      const { data: revEntry } = await supabase
        .from("journal_entries")
        .insert({ company_id: bill.company_id, reference_type: "bill_reversal", reference_id: bill.id, entry_date: new Date().toISOString().slice(0,10), description: `عكس شراء للفاتورة ${bill.bill_number}` })
        .select()
        .single()
      const reversalTx = (billItems || []).filter((it: any) => !!it.product_id).map((it: any) => ({
        company_id: bill.company_id,
        product_id: it.product_id,
        transaction_type: "purchase_reversal",
        quantity_change: -Number(it.quantity || 0),
        journal_entry_id: revEntry?.id,
        reference_id: bill.id,
        notes: `عكس شراء للفاتورة ${bill.bill_number}`,
      }))
      if (reversalTx.length > 0) {
        const { error: invErr } = await supabase
          .from("inventory_transactions")
          .upsert(reversalTx, { onConflict: "journal_entry_id,product_id,transaction_type" })
        if (invErr) console.warn("Failed upserting purchase reversal inventory transactions", invErr)
      }
    } catch (e) {
      console.warn("Error reversing inventory for bill", e)
    }
  }

  const handleDelete = async () => {
    if (!bill) return
    try {
      // إن كانت مسودة ولا تحتوي على مدفوعات: حذف مباشر بدون عكس
      if (canHardDelete) {
        const { error: delItemsErr } = await supabase.from("bill_items").delete().eq("bill_id", bill.id)
        if (delItemsErr) throw delItemsErr
        const { error: delBillErr } = await supabase.from("bills").delete().eq("id", bill.id)
        if (delBillErr) throw delBillErr
        toastActionSuccess(toast, "الحذف", "الفاتورة")
        router.push("/bills")
        return
      }

      // غير المسودة أو بها مدفوعات: نفّذ العكس أولاً ثم ألغِ الفاتورة
      const mapping = await findAccountIds()
      if (!mapping || !mapping.ap) throw new Error("غياب إعدادات حسابات الدائنين (AP)")

      // اعادة تحميل بيانات الفاتورة الحالية بالقيم المالية
      const { data: billRow } = await supabase
        .from("bills")
        .select("id, bill_number, bill_date, subtotal, tax_amount, total_amount, paid_amount, status")
        .eq("id", bill.id)
        .single()

      // 1) عكس المدفوعات المرتبطة بالفاتورة
      const { data: linkedPays } = await supabase
        .from("payments")
        .select("id, amount, payment_date, account_id, supplier_id")
        .eq("bill_id", bill.id)

      if (Array.isArray(linkedPays) && linkedPays.length > 0) {
        for (const p of linkedPays as any[]) {
          // حدد المبلغ المطبّق عبر advance_applications إن وجد
          const { data: apps } = await supabase
            .from("advance_applications")
            .select("amount_applied")
            .eq("payment_id", p.id)
            .eq("bill_id", bill.id)
          const applied = (apps || []).reduce((s: number, r: any) => s + Number(r.amount_applied || 0), 0)

          const cashAccountId = p.account_id || mapping.cash || mapping.bank

          const { data: revEntry } = await supabase
            .from("journal_entries")
            .insert({
              company_id: mapping.companyId,
              reference_type: "bill_payment_reversal",
              reference_id: bill.id,
              entry_date: new Date().toISOString().slice(0, 10),
              description: `عكس تطبيق دفعة على فاتورة مورد ${billRow?.bill_number || bill.bill_number}`,
            })
            .select()
            .single()
          if (revEntry?.id) {
            const amt = applied > 0 ? applied : Number(p.amount || 0)
            const debitAdvanceId = mapping.supplierAdvance || cashAccountId
            await supabase.from("journal_entry_lines").insert([
              { journal_entry_id: revEntry.id, account_id: debitAdvanceId!, debit_amount: amt, credit_amount: 0, description: mapping.supplierAdvance ? "عكس تسوية سلف الموردين" : "عكس نقد/بنك" },
              { journal_entry_id: revEntry.id, account_id: mapping.ap, debit_amount: 0, credit_amount: amt, description: "عكس حسابات دائنة" },
            ])
          }

          // حدّث الفاتورة: طرح المبلغ المطبّق وأعد حالة الفاتورة
          const newPaid = Math.max(Number(billRow?.paid_amount || 0) - (applied > 0 ? applied : Number(p.amount || 0)), 0)
          const newStatus = newPaid <= 0 ? "sent" : "partially_paid"
          await supabase.from("bills").update({ paid_amount: newPaid, status: newStatus }).eq("id", bill.id)
          await supabase.from("advance_applications").delete().eq("payment_id", p.id).eq("bill_id", bill.id)
          await supabase.from("payments").update({ bill_id: null }).eq("id", p.id)
        }
      }

      // 2) عكس المخزون (إن وُجدت معاملات شراء مسجلة)
      try {
        const { data: invExist } = await supabase
          .from("inventory_transactions")
          .select("id")
          .eq("reference_id", bill.id)
          .limit(1)
        const hasPostedInventory = Array.isArray(invExist) && invExist.length > 0
        if (hasPostedInventory) {
          const { data: itemsToReverse } = await supabase
            .from("bill_items")
            .select("product_id, quantity")
            .eq("bill_id", bill.id)

          const { data: invRevEntry } = await supabase
            .from("journal_entries")
            .insert({ company_id: mapping.companyId, reference_type: "bill_inventory_reversal", reference_id: bill.id, entry_date: new Date().toISOString().slice(0,10), description: `عكس مخزون لفاتورة ${billRow?.bill_number || bill.bill_number}` })
            .select()
            .single()

          const reversalTx = (itemsToReverse || []).filter((it: any) => !!it.product_id).map((it: any) => ({
            company_id: mapping.companyId,
            product_id: it.product_id,
            transaction_type: "purchase_reversal",
            quantity_change: -Number(it.quantity || 0),
            reference_id: bill.id,
            journal_entry_id: invRevEntry?.id,
            notes: "عكس مخزون بسبب إلغاء/حذف الفاتورة",
          }))
          if (reversalTx.length > 0) {
            const { error: revErr } = await supabase
              .from("inventory_transactions")
              .upsert(reversalTx, { onConflict: "journal_entry_id,product_id,transaction_type" })
            if (revErr) console.warn("Failed upserting purchase reversal inventory transactions on bill delete", revErr)

            for (const it of (itemsToReverse || [])) {
              if (!it?.product_id) continue
              const { data: prod } = await supabase
                .from("products")
                .select("id, quantity_on_hand")
                .eq("id", it.product_id)
                .single()
              if (prod) {
                const newQty = Number(prod.quantity_on_hand || 0) - Number(it.quantity || 0)
                const { error: updErr } = await supabase
                  .from("products")
                  .update({ quantity_on_hand: newQty })
                  .eq("id", it.product_id)
                if (updErr) console.warn("Failed updating product quantity_on_hand on bill delete", updErr)
              }
            }
          }
        }
      } catch (e) {
        console.warn("Error while reversing inventory on bill delete", e)
      }

      // 3) عكس قيد الفاتورة (AP/Inventory|Expense/VAT receivable)
      if (billRow && mapping.ap) {
        const { data: revEntryInv } = await supabase
          .from("journal_entries")
          .insert({
            company_id: mapping.companyId,
            reference_type: "bill_reversal",
            reference_id: billRow.id,
            entry_date: new Date().toISOString().slice(0, 10),
            description: `عكس قيد فاتورة شراء ${billRow.bill_number}`,
          })
          .select()
          .single()
        if (revEntryInv?.id) {
          const lines: any[] = [
            { journal_entry_id: revEntryInv.id, account_id: mapping.ap, debit_amount: Number(billRow.total_amount || 0), credit_amount: 0, description: "عكس حسابات دائنة" },
          ]
          if (mapping.vatReceivable && Number(billRow.tax_amount || 0) > 0) {
            lines.push({ journal_entry_id: revEntryInv.id, account_id: mapping.vatReceivable, debit_amount: 0, credit_amount: Number(billRow.tax_amount || 0), description: "عكس ضريبة قابلة للاسترداد" })
          }
          const invOrExp = mapping.inventory || mapping.expense
          if (invOrExp) {
            lines.push({ journal_entry_id: revEntryInv.id, account_id: invOrExp, debit_amount: 0, credit_amount: Number(billRow.subtotal || 0), description: mapping.inventory ? "عكس المخزون" : "عكس المصروف" })
          }
          const { error: linesErr } = await supabase.from("journal_entry_lines").insert(lines)
          if (linesErr) console.warn("Failed inserting bill reversal lines", linesErr)
        }
      }

      // أخيرًا: إلغاء الفاتورة (void)
      const { error: voidErr } = await supabase.from("bills").update({ status: "voided" }).eq("id", bill.id)
      if (voidErr) throw voidErr
      toastActionSuccess(toast, "الإلغاء", "الفاتورة")
      await loadData()
    } catch (err: any) {
      const msg = typeof err?.message === "string" ? err.message : "حدث خطأ غير متوقع"
      const detail = (err?.code === "23503" || /foreign key/i.test(String(err?.message))) ? "لا يمكن حذف الفاتورة لوجود مراجع مرتبطة (مدفوعات/أرصدة/مستندات)." : undefined
      toastActionError(toast, canHardDelete ? "الحذف" : "الإلغاء", "الفاتورة", detail ? detail : `فشل العملية: ${msg}`)
      console.error("Error deleting/voiding bill:", err)
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/my-company')
        if (r.ok) { const j = await r.json(); const lu2 = String(j?.company?.logo_url || ''); if (lu2) setCompanyLogoUrl(lu2) }
      } catch {}
    })()
  }, [bill])
  const companyLogo = companyLogoUrl || String((typeof window !== 'undefined' ? (localStorage.getItem('company_logo_url') || '') : ''))
  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      {/* Main Content - تحسين للهاتف */}
      <main ref={printAreaRef as any} className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 print-area overflow-x-hidden">
        {loading ? (
          <div className="text-gray-600 dark:text-gray-400">جاري التحميل...</div>
        ) : !bill ? (
          <div className="text-red-600">لم يتم العثور على الفاتورة</div>
        ) : (
          <div className="space-y-4 sm:space-y-6 max-w-full">
            <div className="flex flex-col sm:flex-row sm:justify-between items-start gap-3">
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white truncate">{appLang==='en' ? `Bill #${bill.bill_number}` : `فاتورة #${bill.bill_number}`}</h1>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">{appLang==='en' ? `Supplier: ${supplier?.name || ''}` : `المورد: ${supplier?.name || ''}`}</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap print:hidden">
                {prevBillId ? (
                  <Link href={`/bills/${prevBillId}`} className="px-3 py-2 bg-gray-100 dark:bg-slate-800 rounded hover:bg-gray-200 dark:hover:bg-slate-700 flex items-center gap-2">
                    <ArrowLeft className="w-4 h-4" /> {appLang==='en' ? 'Previous Bill' : 'الفاتورة السابقة'}
                  </Link>
                ) : (
                  <Button variant="outline" disabled className="flex items-center gap-2"><ArrowLeft className="w-4 h-4" /> {appLang==='en' ? 'Previous Bill' : 'الفاتورة السابقة'}</Button>
                )}
                {nextBillId ? (
                  <Link href={`/bills/${nextBillId}`} className="px-3 py-2 bg-gray-100 dark:bg-slate-800 rounded hover:bg-gray-200 dark:hover:bg-slate-700 flex items-center gap-2">
                    <ArrowRight className="w-4 h-4" /> {appLang==='en' ? 'Next Bill' : 'الفاتورة التالية'}
                  </Link>
                ) : (
                  <Button variant="outline" disabled className="flex items-center gap-2"><ArrowRight className="w-4 h-4" /> {appLang==='en' ? 'Next Bill' : 'الفاتورة التالية'}</Button>
                )}
                {permUpdate ? (
                  <Link href={`/bills/${bill.id}/edit`} className="px-3 py-2 bg-gray-100 dark:bg-slate-800 rounded hover:bg-gray-200 dark:hover:bg-slate-700 flex items-center gap-2">
                    <Pencil className="w-4 h-4" /> {appLang==='en' ? 'Edit' : 'تعديل'}
                  </Link>
                ) : null}
                {/* زر تحديد كمرسل - يظهر فقط للفواتير المسودة */}
                {bill.status === "draft" && (
                  <Button onClick={() => changeStatus("sent")} disabled={posting} className="bg-green-600 hover:bg-green-700">
                    {posting ? "..." : (appLang==='en' ? 'Mark as Sent' : 'تحديد كمرسل')}
                  </Button>
                )}
                {permDelete ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" className="flex items-center gap-2"><Trash2 className="w-4 h-4" /> {appLang==='en' ? 'Delete' : 'حذف'}</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{appLang==='en' ? `Confirm ${canHardDelete ? 'Delete' : 'Void'} Bill` : `تأكيد ${canHardDelete ? 'حذف' : 'إلغاء'} الفاتورة`}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {canHardDelete
                            ? (appLang==='en' ? 'The bill will be permanently deleted if it is a draft with no payments.' : 'سيتم حذف الفاتورة نهائياً إن كانت مسودة ولا تحتوي على مدفوعات.')
                            : (appLang==='en' ? 'The bill is not a draft or has payments; it will be voided while preserving history.' : 'الفاتورة ليست مسودة أو لديها مدفوعات؛ سيتم إلغاء الفاتورة (void) مع الحفاظ على السجل.')}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{appLang==='en' ? 'Cancel' : 'تراجع'}</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete}>{canHardDelete ? (appLang==='en' ? 'Delete' : 'حذف') : (appLang==='en' ? 'Void' : 'إلغاء')}</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : null}
                {/* Purchase Return Buttons */}
                {bill.status !== "draft" && bill.status !== "voided" && items.some(it => (it.quantity - (it.returned_quantity || 0)) > 0) && (
                  <>
                    <Button variant="outline" onClick={() => openReturnDialog('partial')} className="flex items-center gap-2 text-orange-600 hover:text-orange-700 border-orange-300">
                      <RotateCcw className="w-4 h-4" /> {appLang==='en' ? 'Partial Return' : 'مرتجع جزئي'}
                    </Button>
                    <Button variant="outline" onClick={() => openReturnDialog('full')} className="flex items-center gap-2 text-red-600 hover:text-red-700 border-red-300">
                      <RotateCcw className="w-4 h-4" /> {appLang==='en' ? 'Full Return' : 'مرتجع كامل'}
                    </Button>
                  </>
                )}
                {/* Reverse Return Button */}
                {hasReturns && permDelete && (
                  <Button variant="outline" onClick={() => setReverseReturnOpen(true)} className="flex items-center gap-2 text-purple-600 hover:text-purple-700 border-purple-300">
                    <Trash2 className="w-4 h-4" /> {appLang==='en' ? 'Reverse Return' : 'عكس المرتجع'}
                  </Button>
                )}
                <Button variant="outline" onClick={() => router.push("/bills")} className="flex items-center gap-2"><ArrowRight className="w-4 h-4" /> {appLang==='en' ? 'Back' : 'العودة'}</Button>
                <Button variant="outline" onClick={handleDownloadPDF} className="flex items-center gap-2"><FileDown className="w-4 h-4" /> {appLang==='en' ? 'Download PDF' : 'تنزيل PDF'}</Button>
                <Button variant="outline" onClick={handlePrint} className="flex items-center gap-2"><Printer className="w-4 h-4" /> {appLang==='en' ? 'Print' : 'طباعة'}</Button>
              </div>
            </div>

            <Card ref={billContentRef} className="bg-white">
              <CardHeader>
                <CardTitle>{appLang==='en' ? 'Bill Details' : 'تفاصيل الفاتورة'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {companyLogo ? (<img src={companyLogo} alt="Company Logo" className="h-16 w-16 rounded object-cover border mb-4" />) : null}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                  <div><span className="text-gray-600 dark:text-gray-400">{appLang==='en' ? 'Bill Date:' : 'تاريخ الفاتورة:'}</span> {new Date(bill.bill_date).toLocaleDateString(appLang==='en' ? 'en' : 'ar')}</div>
                  <div><span className="text-gray-600 dark:text-gray-400">{appLang==='en' ? 'Due Date:' : 'تاريخ الاستحقاق:'}</span> {new Date(bill.due_date).toLocaleDateString(appLang==='en' ? 'en' : 'ar')}</div>
                  <div><span className="text-gray-600 dark:text-gray-400">{appLang==='en' ? 'Status:' : 'الحالة:'}</span> {bill.status}</div>
                  <div><span className="text-gray-600 dark:text-gray-400">{appLang==='en' ? 'Prices tax-inclusive:' : 'أسعار شاملة ضريبة:'}</span> {bill.tax_inclusive ? (appLang==='en' ? 'Yes' : 'نعم') : (appLang==='en' ? 'No' : 'لا')}</div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left">
                        <th className="p-2">{appLang==='en' ? 'Product' : 'المنتج'}</th>
                        <th className="p-2">{appLang==='en' ? 'Description' : 'الوصف'}</th>
                        <th className="p-2">{appLang==='en' ? 'Quantity' : 'الكمية'}</th>
                        <th className="p-2">{appLang==='en' ? 'Returned' : 'المرتجع'}</th>
                        <th className="p-2">{appLang==='en' ? 'Unit Price' : 'سعر الوحدة'}</th>
                        <th className="p-2">{appLang==='en' ? 'Discount %' : 'خصم %'}</th>
                        <th className="p-2">{appLang==='en' ? 'Tax %' : 'نسبة الضريبة'}</th>
                        <th className="p-2">{appLang==='en' ? 'Total (Net)' : 'الإجمالي (صافي)'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it) => {
                        const returnedQty = Number(it.returned_quantity || 0)
                        const effectiveQty = it.quantity - returnedQty
                        return (
                          <tr key={it.id} className="border-t">
                            <td className="p-2">{products[it.product_id]?.name || it.product_id}</td>
                            <td className="p-2">{it.description || ""}</td>
                            <td className="p-2">{it.quantity}</td>
                            <td className="p-2">
                              {returnedQty > 0 ? (
                                <span className="text-red-600 font-medium">-{returnedQty}</span>
                              ) : (
                                <span className="text-gray-400 dark:text-gray-500">0</span>
                              )}
                            </td>
                            <td className="p-2">{it.unit_price.toFixed(2)}</td>
                            <td className="p-2">{(it.discount_percent || 0).toFixed(2)}%</td>
                            <td className="p-2">{it.tax_rate.toFixed(2)}%</td>
                            <td className="p-2">
                              {it.line_total.toFixed(2)}
                              {returnedQty > 0 && (
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  ({appLang==='en' ? 'Net' : 'الصافي'}: {(effectiveQty * it.unit_price * (1 - (it.discount_percent || 0) / 100)).toFixed(2)})
                                </div>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">{appLang==='en' ? 'Summary' : 'ملخص'}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex items-center justify-between"><span>{appLang==='en' ? 'Subtotal' : 'الإجمالي الفرعي'}</span><span>{bill.subtotal.toFixed(2)}</span></div>
                      <div className="flex items-center justify-between"><span>{appLang==='en' ? 'Tax' : 'الضريبة'}</span><span>{bill.tax_amount.toFixed(2)} {bill.tax_inclusive ? (appLang==='en' ? '(Prices inclusive)' : '(أسعار شاملة)') : ''}</span></div>
                      <div className="flex items-center justify-between"><span>{appLang==='en' ? 'Shipping' : 'الشحن'}</span><span>{(bill.shipping || 0).toFixed(2)} {appLang==='en' ? `(+Tax ${Number(bill.shipping_tax_rate || 0).toFixed(2)}%)` : `(+ضريبة ${Number(bill.shipping_tax_rate || 0).toFixed(2)}%)`}</span></div>
                      <div className="flex items-center justify-between"><span>{appLang==='en' ? 'Adjustment' : 'التعديل'}</span><span>{(bill.adjustment || 0).toFixed(2)}</span></div>
                      <div className="flex items-center justify-between font-semibold text-blue-600"><span>{appLang==='en' ? 'Total' : 'الإجمالي'}</span><span>{bill.total_amount.toFixed(2)} {currencySymbol}</span></div>
                      {/* عرض القيمة المحولة إذا كانت العملة مختلفة */}
                      {bill.currency_code && bill.currency_code !== appCurrency && bill.base_currency_total && (
                        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-2 rounded">
                          <span>{appLang==='en' ? `Equivalent in ${appCurrency}:` : `المعادل بـ ${appCurrency}:`}</span>
                          <span className="font-medium">{bill.base_currency_total.toFixed(2)} {appCurrency}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">{appLang==='en' ? 'Discount' : 'الخصم'}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex items-center justify-between"><span>{appLang==='en' ? 'Type' : 'النوع'}</span><span>{bill.discount_type === 'percent' ? (appLang==='en' ? 'Percentage' : 'نسبة') : (appLang==='en' ? 'Amount' : 'قيمة')}</span></div>
                      <div className="flex items-center justify-between"><span>{appLang==='en' ? 'Value' : 'القيمة'}</span><span>{Number(bill.discount_value || 0).toFixed(2)}{bill.discount_type === 'percent' ? '%' : ''}</span></div>
                      <div className="flex items-center justify-between"><span>{appLang==='en' ? 'Position' : 'الموضع'}</span><span>{bill.discount_position === 'after_tax' ? (appLang==='en' ? 'After tax' : 'بعد الضريبة') : (appLang==='en' ? 'Before tax' : 'قبل الضريبة')}</span></div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">{appLang==='en' ? 'Payments' : 'المدفوعات'}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex items-center justify-between"><span>{appLang==='en' ? 'Paid' : 'المدفوع'}</span><span className="text-green-600">{paidTotal.toFixed(2)} {currencySymbol}</span></div>
                      <div className="flex items-center justify-between"><span>{appLang==='en' ? 'Remaining' : 'المتبقي'}</span><span className="font-semibold text-red-600">{Math.max((bill.total_amount || 0) - paidTotal, 0).toFixed(2)} {currencySymbol}</span></div>
                      <div>
                        <Link href={`/payments?bill_id=${bill.id}`} className="text-blue-600 hover:underline">{appLang==='en' ? 'Record/Pay' : 'سجل/ادفع'}</Link>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>

      {/* Purchase Return Dialog */}
      <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {returnType === 'full'
                ? (appLang==='en' ? 'Full Purchase Return' : 'مرتجع مشتريات كامل')
                : (appLang==='en' ? 'Partial Purchase Return' : 'مرتجع مشتريات جزئي')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Bill Financial Summary */}
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm space-y-2">
              <div className="flex justify-between items-center">
                <div>
                  <span className="font-semibold text-lg">{appLang==='en' ? 'Bill' : 'الفاتورة'}: {bill?.bill_number}</span>
                  <p className="text-gray-500 dark:text-gray-400">{appLang==='en' ? 'Supplier' : 'المورد'}: {supplier?.name}</p>
                </div>
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  returnBillData.paymentStatus === 'paid' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                  returnBillData.paymentStatus === 'partial' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                  'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                }`}>
                  {returnBillData.paymentStatus === 'paid' ? (appLang==='en' ? 'Fully Paid' : 'مدفوعة بالكامل') :
                   returnBillData.paymentStatus === 'partial' ? (appLang==='en' ? 'Partially Paid' : 'مدفوعة جزئياً') :
                   (appLang==='en' ? 'Unpaid' : 'غير مدفوعة')}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 pt-3 border-t border-blue-200 dark:border-blue-700">
                <div>
                  <p className="text-gray-500 dark:text-gray-400 text-xs">{appLang==='en' ? 'Original Total' : 'الإجمالي الأصلي'}</p>
                  <p className="font-semibold">{returnBillData.originalTotal.toFixed(2)} {returnBillData.billCurrency}</p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400 text-xs">{appLang==='en' ? 'Paid Amount' : 'المبلغ المدفوع'}</p>
                  <p className="font-semibold text-green-600">{returnBillData.paidAmount.toFixed(2)} {returnBillData.billCurrency}</p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400 text-xs">{appLang==='en' ? 'Remaining' : 'المتبقي'}</p>
                  <p className="font-semibold text-red-600">{returnBillData.remainingAmount.toFixed(2)} {returnBillData.billCurrency}</p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400 text-xs">{appLang==='en' ? 'Previously Returned' : 'مرتجع سابق'}</p>
                  <p className="font-semibold text-orange-600">{returnBillData.previouslyReturned.toFixed(2)} {returnBillData.billCurrency}</p>
                </div>
              </div>
            </div>

            {/* Items to return */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-600 dark:text-gray-400 border-b">
                    <th className="text-right p-2">{appLang==='en' ? 'Product' : 'المنتج'}</th>
                    <th className="text-right p-2">{appLang==='en' ? 'Available' : 'المتاح'}</th>
                    <th className="text-right p-2">{appLang==='en' ? 'Return Qty' : 'كمية المرتجع'}</th>
                    <th className="text-right p-2">{appLang==='en' ? 'Unit Price' : 'سعر الوحدة'}</th>
                    <th className="text-right p-2">{appLang==='en' ? 'Total' : 'الإجمالي'}</th>
                  </tr>
                </thead>
                <tbody>
                  {returnItems.map((it, idx) => (
                    <tr key={it.item_id} className="border-b">
                      <td className="p-2">{it.product_name}</td>
                      <td className="p-2 text-center">{it.max_qty}</td>
                      <td className="p-2">
                        <Input
                          type="number"
                          min={0}
                          max={it.max_qty}
                          value={it.return_qty}
                          onChange={(e) => {
                            const val = Math.min(Math.max(Number(e.target.value) || 0, 0), it.max_qty)
                            setReturnItems(prev => {
                              const next = [...prev]
                              next[idx] = { ...next[idx], return_qty: val }
                              return next
                            })
                          }}
                          className="w-20"
                          disabled={returnType === 'full'}
                        />
                      </td>
                      <td className="p-2 text-right">{it.unit_price.toFixed(2)}</td>
                      <td className="p-2 text-right font-medium">{(it.return_qty * it.unit_price).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Return total */}
            <div className="flex justify-end">
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded text-lg font-semibold">
                {appLang==='en' ? 'Return Total' : 'إجمالي المرتجع'}: {returnTotal.toFixed(2)} {returnCurrency}
              </div>
            </div>

            {/* Currency selector */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{appLang==='en' ? 'Currency' : 'العملة'}</Label>
                <Select value={returnCurrency} onValueChange={setReturnCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {currencies.length > 0 ? (
                      currencies.map(c => <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>)
                    ) : (
                      <>
                        <SelectItem value="EGP">EGP</SelectItem>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                        <SelectItem value="SAR">SAR</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{appLang==='en' ? 'Refund Method' : 'طريقة الاسترداد'}</Label>
                <Select value={returnMethod} onValueChange={(v: 'cash' | 'bank' | 'credit') => setReturnMethod(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">{appLang==='en' ? 'Cash Refund' : 'استرداد نقدي'}</SelectItem>
                    <SelectItem value="bank">{appLang==='en' ? 'Bank Refund' : 'استرداد بنكي'}</SelectItem>
                    <SelectItem value="credit">{appLang==='en' ? 'Credit to Supplier Account' : 'رصيد على حساب المورد'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {returnMethod !== 'credit' && (
                <div className="space-y-2">
                  <Label>{appLang==='en' ? 'Refund Account' : 'حساب الاسترداد'}</Label>
                  <Select value={returnAccountId} onValueChange={setReturnAccountId}>
                    <SelectTrigger><SelectValue placeholder={appLang==='en' ? 'Auto-select' : 'اختيار تلقائي'} /></SelectTrigger>
                    <SelectContent>
                      {accounts.map(acc => (
                        <SelectItem key={acc.id} value={acc.id}>{acc.account_code || ''} {acc.account_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Exchange rate info */}
            {returnCurrency !== appCurrency && returnTotal > 0 && (
              <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded text-sm">
                <div>{appLang==='en' ? 'Exchange Rate' : 'سعر الصرف'}: <strong>1 {returnCurrency} = {returnExRate.rate.toFixed(4)} {appCurrency}</strong> ({returnExRate.source})</div>
                <div>{appLang==='en' ? 'Base Amount' : 'المبلغ الأساسي'}: <strong>{(returnTotal * returnExRate.rate).toFixed(2)} {appCurrency}</strong></div>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <Label>{appLang==='en' ? 'Notes' : 'ملاحظات'}</Label>
              <Input
                value={returnNotes}
                onChange={(e) => setReturnNotes(e.target.value)}
                placeholder={appLang==='en' ? 'Optional notes for return' : 'ملاحظات اختيارية للمرتجع'}
              />
            </div>

            {/* Info about refund method */}
            <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded text-sm text-yellow-800 dark:text-yellow-200">
              {returnMethod === 'cash' && (appLang==='en' ? '💰 Cash will be returned to the cash account' : '💰 سيتم إرجاع المبلغ إلى حساب النقد')}
              {returnMethod === 'bank' && (appLang==='en' ? '🏦 Amount will be returned to the bank account' : '🏦 سيتم إرجاع المبلغ إلى الحساب البنكي')}
              {returnMethod === 'credit' && (appLang==='en' ? '📝 Amount will reduce your payable to the supplier' : '📝 سيتم تخفيض المبلغ المستحق للمورد')}
            </div>

            {/* Post-return preview */}
            {returnTotal > 0 && (
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg text-sm border border-green-200 dark:border-green-700">
                <h4 className="font-semibold text-green-800 dark:text-green-200 mb-2">
                  {appLang==='en' ? '📊 After Return Preview' : '📊 معاينة ما بعد المرتجع'}
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div>
                    <p className="text-gray-500 dark:text-gray-400 text-xs">{appLang==='en' ? 'New Bill Total' : 'الإجمالي الجديد'}</p>
                    <p className="font-semibold">{Math.max(0, (returnBillData.originalTotal - returnBillData.previouslyReturned) - returnTotal).toFixed(2)} {returnBillData.billCurrency}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-gray-400 text-xs">{appLang==='en' ? 'Total Returned' : 'إجمالي المرتجع'}</p>
                    <p className="font-semibold text-orange-600">{(returnBillData.previouslyReturned + returnTotal).toFixed(2)} {returnBillData.billCurrency}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-gray-400 text-xs">{appLang==='en' ? 'Expected Status' : 'الحالة المتوقعة'}</p>
                    <p className={`font-semibold ${
                      (returnBillData.originalTotal - returnBillData.previouslyReturned - returnTotal) <= 0 ? 'text-purple-600' :
                      returnBillData.paymentStatus === 'paid' ? 'text-green-600' :
                      returnBillData.paidAmount > 0 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {(returnBillData.originalTotal - returnBillData.previouslyReturned - returnTotal) <= 0
                        ? (appLang==='en' ? 'Fully Returned' : 'مرتجع بالكامل')
                        : returnBillData.paymentStatus === 'paid'
                          ? (appLang==='en' ? 'Paid' : 'مدفوعة')
                          : returnBillData.paidAmount >= Math.max(0, (returnBillData.originalTotal - returnBillData.previouslyReturned) - returnTotal)
                            ? (appLang==='en' ? 'Paid' : 'مدفوعة')
                            : returnBillData.paidAmount > 0
                              ? (appLang==='en' ? 'Partially Paid' : 'مدفوعة جزئياً')
                              : (appLang==='en' ? 'Unpaid' : 'غير مدفوعة')}
                    </p>
                  </div>
                </div>
                {/* Show expected refund for paid bills with cash/bank */}
                {returnMethod !== 'credit' && returnBillData.paymentStatus !== 'unpaid' && (
                  <div className="mt-3 pt-3 border-t border-green-200 dark:border-green-700">
                    <p className="text-gray-600 dark:text-gray-300">
                      💵 {appLang==='en' ? 'Expected Refund Amount' : 'المبلغ المتوقع استرداده'}: <strong className="text-green-700 dark:text-green-300">{Math.min(returnTotal, returnBillData.paidAmount).toFixed(2)} {returnBillData.billCurrency}</strong>
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Accounting entries preview */}
            {returnTotal > 0 && (
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded text-xs border">
                <h5 className="font-semibold mb-2">{appLang==='en' ? '📝 Journal Entries to be Created' : '📝 القيود المحاسبية التي سيتم إنشاؤها'}</h5>
                <div className="space-y-1 text-gray-600 dark:text-gray-300">
                  <p>1️⃣ {appLang==='en' ? 'Purchase Return Entry:' : 'قيد مرتجع المشتريات:'}</p>
                  <p className="ms-4">• {appLang==='en' ? 'Debit: Accounts Payable (Supplier)' : 'مدين: الذمم الدائنة (المورد)'} - {returnTotal.toFixed(2)}</p>
                  <p className="ms-4">• {appLang==='en' ? 'Credit: Inventory' : 'دائن: المخزون'} - {returnTotal.toFixed(2)}</p>
                  {returnMethod !== 'credit' && returnBillData.paymentStatus !== 'unpaid' && (
                    <>
                      <p className="mt-2">2️⃣ {appLang==='en' ? 'Refund Entry:' : 'قيد الاسترداد:'}</p>
                      <p className="ms-4">• {appLang==='en' ? 'Debit:' : 'مدين:'} {returnMethod === 'cash' ? (appLang==='en' ? 'Cash' : 'الخزينة') : (appLang==='en' ? 'Bank' : 'البنك')} - {Math.min(returnTotal, returnBillData.paidAmount).toFixed(2)}</p>
                      <p className="ms-4">• {appLang==='en' ? 'Credit: Accounts Payable' : 'دائن: الذمم الدائنة'} - {Math.min(returnTotal, returnBillData.paidAmount).toFixed(2)}</p>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReturnOpen(false)} disabled={returnProcessing}>
              {appLang==='en' ? 'Cancel' : 'إلغاء'}
            </Button>
            <Button
              onClick={processPurchaseReturn}
              disabled={returnProcessing || returnTotal <= 0}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {returnProcessing ? '...' : (appLang==='en' ? 'Process Return' : 'تنفيذ المرتجع')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reverse Return Confirmation Dialog */}
      <AlertDialog open={reverseReturnOpen} onOpenChange={setReverseReturnOpen}>
        <AlertDialogContent dir={appLang==='en' ? 'ltr' : 'rtl'}>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-purple-600">
              {appLang==='en' ? '⚠️ Reverse Purchase Return' : '⚠️ عكس مرتجع المشتريات'}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>{appLang==='en' ? 'Are you sure you want to reverse this purchase return? This action will:' : 'هل أنت متأكد من عكس هذا المرتجع؟ سيؤدي هذا إلى:'}</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>{appLang==='en' ? 'Delete all journal entries related to this return' : 'حذف جميع القيود المحاسبية المرتبطة بالمرتجع'}</li>
                <li>{appLang==='en' ? 'Restore product quantities to inventory' : 'إعادة كميات المنتجات للمخزون'}</li>
                <li>{appLang==='en' ? 'Reset returned amounts on bill items' : 'تصفير الكميات المرتجعة في بنود الفاتورة'}</li>
                <li>{appLang==='en' ? 'Reset bill return status' : 'إعادة حالة المرتجع للفاتورة'}</li>
              </ul>
              {bill && (
                <div className="mt-3 p-3 bg-purple-50 dark:bg-purple-900/20 rounded">
                  <p className="font-medium">{appLang==='en' ? 'Return to reverse:' : 'المرتجع المراد عكسه:'}</p>
                  <p className="text-sm">{appLang==='en' ? 'Amount:' : 'المبلغ:'} {Number((bill as any).returned_amount || 0).toLocaleString()} {currencySymbol}</p>
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
              onClick={reverseReturn}
              disabled={reverseReturnProcessing}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {reverseReturnProcessing ? '...' : (appLang==='en' ? 'Confirm Reverse' : 'تأكيد العكس')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
