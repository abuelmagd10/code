// =====================================================
// PURCHASE BILL ACCOUNTING PATTERN – CANONICAL LOGIC
// =====================================================
// This component MUST follow the approved pattern:
// 1) Draft:    no journal_entries, no inventory_transactions.
// 2) Sent/Received: increase stock ONLY via inventory_transactions(type='purchase'),
//                   NO accounting entries at this stage.
// 3) First Payment:
//      - create 'bill' entry (Inventory/Expense + VAT input + Shipping vs AP),
//      - create 'bill_payment' entry (AP vs Cash/Bank or Supplier Advance).
//    Subsequent payments: 'bill_payment' only (no extra stock movement).
// 4) Purchase Returns (Vendor Credits):
//      - decrease stock via 'purchase_return',
//      - decrease AP and reverse VAT on purchases when applicable.
// Any new code here that breaks this pattern is a BUG, not a spec change.

"use client"

import { useEffect, useMemo, useState, useRef } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import { useSupabase } from "@/lib/supabase/hooks"
import { Button } from "@/components/ui/button"
import { useParams } from "next/navigation"
import { Pencil, Trash2, Printer, FileDown, ArrowLeft, ArrowRight, RotateCcw, DollarSign, CreditCard, Banknote, FileText, AlertCircle, CheckCircle, Package, Clock, User, ExternalLink } from "lucide-react"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import { toastActionError, toastActionSuccess } from "@/lib/notifications"
import { canAction } from "@/lib/authz"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NumericInput } from "@/components/ui/numeric-input"
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
import { checkInventoryAvailability, getShortageToastContent } from "@/lib/inventory-check"

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
  // Branch, Cost Center, Warehouse
  branch_id?: string | null
  cost_center_id?: string | null
  warehouse_id?: string | null
  // Linked Purchase Order
  purchase_order_id?: string | null
}

type Supplier = { id: string; name: string }
type BillItem = { id: string; product_id: string; description: string | null; quantity: number; returned_quantity?: number; unit_price: number; tax_rate: number; discount_percent: number; line_total: number }
type Product = { id: string; name: string; sku: string }
type Payment = { id: string; bill_id: string | null; amount: number }
type PaymentDetail = {
  id: string;
  bill_id: string | null;
  amount: number;
  payment_date: string;
  payment_method: string;
  reference_number: string | null;
  notes: string | null;
  created_by_email?: string;
}
type VendorCreditDetail = {
  id: string;
  credit_number: string;
  credit_date: string;
  total_amount: number;
  applied_amount: number;
  status: string;
  notes: string | null;
  created_by_email?: string;
  items?: VendorCreditItem[];
}
type VendorCreditItem = {
  id: string;
  product_id: string | null;
  description: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  product_name?: string;
}

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
  const [paymentsDetail, setPaymentsDetail] = useState<PaymentDetail[]>([])
  const [vendorCredits, setVendorCredits] = useState<VendorCreditDetail[]>([])
  const [permPayView, setPermPayView] = useState(false)
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

  // Branch and Cost Center
  const [branchName, setBranchName] = useState<string | null>(null)
  const [costCenterName, setCostCenterName] = useState<string | null>(null)

  // Linked Purchase Order
  const [linkedPurchaseOrder, setLinkedPurchaseOrder] = useState<{ id: string; po_number: string } | null>(null)

  // Currency symbols map
  const currencySymbols: Record<string, string> = {
    EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ',
    KWD: 'د.ك', QAR: '﷼', BHD: 'د.ب', OMR: '﷼', JOD: 'د.أ', LBP: 'ل.ل'
  }
  const currencySymbol = currencySymbols[appCurrency] || appCurrency

  useEffect(() => {
    loadData()
      ; (async () => {
        try {
          setPermUpdate(await canAction(supabase, 'bills', 'update'))
          setPermDelete(await canAction(supabase, 'bills', 'delete'))
          const payView = await canAction(supabase, 'payments', 'read')
          setPermPayView(!!payView)
        } catch { }
      })()
    const langHandler = () => {
      try {
        const v = localStorage.getItem('app_language') || 'ar'
        setAppLang(v === 'en' ? 'en' : 'ar')
      } catch { }
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
  }, [id])

  const loadData = async () => {
    try {
      setLoading(true)
      const { data: billData } = await supabase.from("bills").select("*, shipping_providers(provider_name)").eq("id", id).single()
      setBill(billData as any)
      if (!billData) return

      // Load branch and cost center names
      if (billData.branch_id) {
        const { data: branchData } = await supabase
          .from("branches")
          .select("name, branch_name")
          .eq("id", billData.branch_id)
          .single()
        setBranchName(branchData?.name || branchData?.branch_name || null)
      }
      if (billData.cost_center_id) {
        try {
          const { data: ccData, error: ccError } = await supabase
            .from("cost_centers")
            .select("cost_center_name")
            .eq("id", billData.cost_center_id)
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

      // Load linked purchase order if exists
      if (billData.purchase_order_id) {
        const { data: poData } = await supabase
          .from("purchase_orders")
          .select("id, po_number")
          .eq("id", billData.purchase_order_id)
          .single()
        if (poData) {
          setLinkedPurchaseOrder(poData)
        }
      } else {
        setLinkedPurchaseOrder(null)
      }

      const { data: supplierData } = await supabase.from("suppliers").select("id, name").eq("id", billData.supplier_id).single()
      setSupplier(supplierData as any)
      const { data: itemData } = await supabase.from("bill_items").select("*").eq("bill_id", id)
      setItems((itemData || []) as any)
      const productIds = Array.from(new Set((itemData || []).map((it: any) => it.product_id)))
      if (productIds.length) {
        const { data: prodData } = await supabase.from("products").select("id, name, sku").in("id", productIds)
        const map: Record<string, Product> = {}
          ; (prodData || []).forEach((p: any) => map[p.id] = p)
        setProducts(map)
      }
      const { data: payData } = await supabase.from("payments").select("id, bill_id, amount").eq("bill_id", id)
      setPayments((payData || []) as any)

      // Load detailed payments with user info
      const { data: payDetailData } = await supabase
        .from("payments")
        .select("id, bill_id, amount, payment_date, payment_method, reference_number, notes, created_at")
        .eq("bill_id", id)
        .order("payment_date", { ascending: false })
      setPaymentsDetail((payDetailData || []) as any)

      // Load vendor credits (purchase returns) for this bill
      const companyId = (billData as any)?.company_id
      if (companyId) {
        const { data: vcData } = await supabase
          .from("vendor_credits")
          .select("id, credit_number, credit_date, total_amount, applied_amount, status, notes")
          .eq("company_id", companyId)
          .eq("bill_id", id)
          .order("credit_date", { ascending: false })

        // Load items for each vendor credit
        if (vcData && vcData.length > 0) {
          const vcWithItems = await Promise.all(vcData.map(async (vc: any) => {
            const { data: itemsData } = await supabase
              .from("vendor_credit_items")
              .select("id, product_id, description, quantity, unit_price, line_total")
              .eq("vendor_credit_id", vc.id)

            // Get product names
            const items = await Promise.all((itemsData || []).map(async (item: any) => {
              if (item.product_id) {
                const { data: prod } = await supabase.from("products").select("name").eq("id", item.product_id).single()
                return { ...item, product_name: prod?.name || item.description || '-' }
              }
              return { ...item, product_name: item.description || '-' }
            }))

            return { ...vc, items }
          }))
          setVendorCredits(vcWithItems as any)
        } else {
          setVendorCredits([])
        }
      }

      try {
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
      } catch { }
    } finally { setLoading(false) }
  }

  // Update return exchange rate when currency changes
  useEffect(() => {
    const updateReturnRate = async () => {
      if (returnCurrency === appCurrency) {
        setReturnExRate({ rate: 1, rateId: null, source: 'same_currency' })
      } else if (bill?.company_id) {
        const result = await getExchangeRate(supabase, returnCurrency, appCurrency, undefined, bill.company_id)
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

      const content = el.innerHTML
      const appLang = typeof window !== 'undefined'
        ? ((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar')
        : 'ar'

      const { openPrintWindow } = await import('@/lib/print-utils')
      openPrintWindow(content, {
        lang: appLang as 'ar' | 'en',
        direction: appLang === 'ar' ? 'rtl' : 'ltr',
        title: appLang === 'en' ? `Bill ${bill?.bill_number || ''}` : `فاتورة مورد ${bill?.bill_number || ''}`,
        fontSize: 11,
        pageSize: 'A4',
        margin: '5mm'
      })
    } catch (err) {
      console.error("Error generating PDF:", err)
      const appLang = typeof window !== 'undefined'
        ? ((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar')
        : 'ar'
      toastActionError(toast, appLang === 'en' ? 'Download' : 'تنزيل', appLang === 'en' ? 'Bill PDF' : 'ملف الفاتورة', String((err as any)?.message || ''))
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

      // 🔍 التحقق من توفر المخزون قبل المرتجع
      // مرتجع الشراء يعني إرجاع البضاعة للمورد، لذا يجب أن تكون البضاعة متوفرة في المخزون
      const itemsToCheck = returnItems
        .filter(it => it.return_qty > 0 && it.product_id)
        .map(it => ({
          product_id: it.product_id!,
          quantity: it.return_qty
        }))

      if (itemsToCheck.length > 0) {
        // Pass bill context for proper inventory filtering
        const inventoryContext = bill ? {
          company_id: bill.company_id,
          branch_id: bill.branch_id || null,
          warehouse_id: bill.warehouse_id || null,
          cost_center_id: bill.cost_center_id || null,
        } : undefined

        const inventoryCheck = await checkInventoryAvailability(supabase, itemsToCheck, undefined, inventoryContext)
        if (!inventoryCheck.success) {
          const shortageContent = getShortageToastContent(inventoryCheck.shortages, appLang)
          toast({
            title: shortageContent.title,
            description: shortageContent.description,
            variant: "destructive"
          })
          setReturnProcessing(false)
          return
        }
      }

      const mapping = await findAccountIds(bill.company_id)
      if (!mapping) {
        toastActionError(toast, appLang === 'en' ? 'Return' : 'المرتجع', appLang === 'en' ? 'Bill' : 'الفاتورة', appLang === 'en' ? 'Account settings not found' : 'لم يتم العثور على إعدادات الحسابات')
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
        toastActionError(toast, appLang === 'en' ? 'Return' : 'المرتجع', appLang === 'en' ? 'Account' : 'الحساب', appLang === 'en' ? 'No refund account found' : 'لم يتم العثور على حساب للاسترداد')
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
          description: appLang === 'en' ? `Purchase return for bill ${bill.bill_number}` : `مرتجع مشتريات للفاتورة ${bill.bill_number}`,
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
          description: appLang === 'en' ? 'Accounts Payable reduction - goods returned' : 'تخفيض الذمم الدائنة - بضاعة مرتجعة',
          original_currency: returnCurrency,
          original_debit: returnTotal,
          original_credit: 0,
          exchange_rate_used: returnExRate.rate,
          exchange_rate_id: returnExRate.rateId,
          rate_source: returnExRate.source,
          branch_id: bill.branch_id || null,
          cost_center_id: bill.cost_center_id || null
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
          description: mapping.inventory ? (appLang === 'en' ? 'Inventory reduced - goods returned to supplier' : 'تخفيض المخزون - بضاعة مرتجعة للمورد') : (appLang === 'en' ? 'Expense reversal' : 'عكس المصروف'),
          original_currency: returnCurrency,
          original_debit: 0,
          original_credit: returnTotal,
          exchange_rate_used: returnExRate.rate,
          exchange_rate_id: returnExRate.rateId,
          rate_source: returnExRate.source,
          branch_id: bill.branch_id || null,
          cost_center_id: bill.cost_center_id || null
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
            description: appLang === 'en' ? `Cash refund received for return - Bill ${bill.bill_number}` : `استرداد نقدي للمرتجع - الفاتورة ${bill.bill_number}`,
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
              description: returnMethod === 'cash' ? (appLang === 'en' ? 'Cash received from supplier' : 'نقدية مستلمة من المورد') : (appLang === 'en' ? 'Bank transfer from supplier' : 'تحويل بنكي من المورد'),
              original_currency: returnCurrency,
              original_debit: returnTotal,
              original_credit: 0,
              exchange_rate_used: returnExRate.rate,
              exchange_rate_id: returnExRate.rateId,
              rate_source: returnExRate.source,
              branch_id: bill.branch_id || null,
              cost_center_id: bill.cost_center_id || null
            },
            // دائن: الذمم الدائنة (المورد سدد لنا)
            {
              journal_entry_id: refundEntry.id,
              account_id: mapping.ap,
              debit_amount: 0,
              credit_amount: baseReturnTotal,
              description: appLang === 'en' ? 'Refund received from supplier' : 'استرداد مستلم من المورد',
              original_currency: returnCurrency,
              original_debit: 0,
              original_credit: returnTotal,
              exchange_rate_used: returnExRate.rate,
              exchange_rate_id: returnExRate.rateId,
              rate_source: returnExRate.source,
              branch_id: bill.branch_id || null,
              cost_center_id: bill.cost_center_id || null
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
      let effectiveBranchId = (bill as any).branch_id as string | null
      let effectiveWarehouseId = (bill as any).warehouse_id as string | null
      let effectiveCostCenterId = (bill as any).cost_center_id as string | null

      if (!effectiveBranchId && effectiveWarehouseId) {
        const { data: wh } = await supabase
          .from("warehouses")
          .select("branch_id")
          .eq("company_id", bill.company_id)
          .eq("id", effectiveWarehouseId)
          .single()
        effectiveBranchId = (wh as any)?.branch_id || null
      }

      if (effectiveBranchId && (!effectiveWarehouseId || !effectiveCostCenterId)) {
        const { getBranchDefaults } = await import("@/lib/governance-branch-defaults")
        const defaults = await getBranchDefaults(supabase, effectiveBranchId)
        if (!effectiveWarehouseId) effectiveWarehouseId = defaults.default_warehouse_id
        if (!effectiveCostCenterId) effectiveCostCenterId = defaults.default_cost_center_id
      }

      const invTx = returnItems.filter(it => it.return_qty > 0 && it.product_id).map(it => ({
        company_id: bill.company_id,
        product_id: it.product_id,
        transaction_type: "purchase_return",
        quantity_change: -it.return_qty,
        reference_id: bill.id,
        journal_entry_id: entry.id,
        notes: appLang === 'en' ? `Purchase return for bill ${bill.bill_number}` : `مرتجع مشتريات للفاتورة ${bill.bill_number}`,
        branch_id: effectiveBranchId,
        cost_center_id: effectiveCostCenterId,
        warehouse_id: effectiveWarehouseId
      }))
      if (invTx.length > 0) {
        await supabase.from("inventory_transactions").insert(invTx)
        // ملاحظة: لا حاجة لتحديث products.quantity_on_hand يدوياً
        // لأن الـ Database Trigger (trg_apply_inventory_insert) يفعل ذلك تلقائياً
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

      const { error: billUpdateErr } = await supabase.from("bills").update({
        total_amount: newTotal,
        paid_amount: newPaid,
        status: newStatus,
        returned_amount: newReturnedAmount,
        return_status: newReturnStatus
      }).eq("id", bill.id)

      if (billUpdateErr) {
        console.error("❌ Failed to update bill after return:", billUpdateErr)
        throw new Error(`فشل تحديث الفاتورة: ${billUpdateErr.message}`)
      }
      console.log("✅ Bill updated:", { billId: bill.id, newReturnedAmount, newReturnStatus, newStatus })

      // تحديث حالة أمر الشراء المرتبط
      await updateLinkedPurchaseOrderStatus(bill.id)

      toastActionSuccess(toast, appLang === 'en' ? 'Return' : 'المرتجع', appLang === 'en' ? 'Purchase return processed' : 'تم معالجة المرتجع')
      setReturnOpen(false)
      await loadData()
    } catch (err: any) {
      console.error("Error processing purchase return:", err)
      toastActionError(toast, appLang === 'en' ? 'Return' : 'المرتجع', appLang === 'en' ? 'Bill' : 'الفاتورة', err?.message || '')
    } finally {
      setReturnProcessing(false)
    }
  }

  const canHardDelete = useMemo(() => {
    if (!bill) return false
    const hasPayments = payments.length > 0
    const isDraft = bill.status?.toLowerCase() === "draft"
    return isDraft && !hasPayments
  }, [bill, payments])

  // Helper: locate account ids for posting
  const findAccountIds = async (companyIdParam?: string) => {
    // استخدام getActiveCompanyId لدعم المستخدمين المدعوين
    const { getActiveCompanyId } = await import("@/lib/company")
    const resolvedCompanyId = companyIdParam || await getActiveCompanyId(supabase)
    if (!resolvedCompanyId) return null

    const { data: accounts } = await supabase
      .from("chart_of_accounts")
      .select("id, account_code, account_type, account_name, sub_type, parent_id")
      .eq("company_id", resolvedCompanyId)
      .eq("is_active", true) // 📌 فلترة الحسابات النشطة فقط
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
    // 📌 حساب المشتريات (Purchases) - مستقل عن المخزون
    const purchases =
      bySubType("purchases") ||
      byCode("5100") ||
      byNameIncludes("purchases") ||
      byNameIncludes("مشتريات") ||
      expense // fallback to expense account
    // 📌 ضريبة المدخلات (VAT Input) - للخصم
    const vatInput =
      bySubType("vat_input") ||
      byCode("VATIN") ||
      byCode("1500") ||
      byNameIncludes("vat input") ||
      byNameIncludes("ضريبة المدخلات") ||
      byNameIncludes("ضريبة") ||
      null
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

    return { companyId: resolvedCompanyId, ap, inventory, expense, purchases, vatInput, vatReceivable, cash, bank, supplierAdvance }
  }

  // === دالة تحديث حالة أمر الشراء المرتبط (مع مزامنة البيانات المالية) ===
  const updateLinkedPurchaseOrderStatus = async (billId: string) => {
    try {
      // جلب الفاتورة للحصول على purchase_order_id والبيانات المالية
      const { data: billData } = await supabase
        .from("bills")
        .select("purchase_order_id, status, subtotal, tax_amount, total_amount, returned_amount, return_status")
        .eq("id", billId)
        .single()

      if (!billData?.purchase_order_id) return // لا يوجد أمر شراء مرتبط

      const poId = billData.purchase_order_id

      // جلب بنود أمر الشراء
      const { data: poItems } = await supabase
        .from("purchase_order_items")
        .select("product_id, quantity")
        .eq("purchase_order_id", poId)

      // جلب جميع الفواتير المرتبطة بأمر الشراء (غير الملغاة وغير المحذوفة)
      const { data: linkedBills } = await supabase
        .from("bills")
        .select("id, status")
        .eq("purchase_order_id", poId)
        .not("status", "in", "(voided,cancelled)")

      const billIds = (linkedBills || []).map((b: any) => b.id)

      // جلب بنود جميع الفواتير المرتبطة
      let billedQtyMap: Record<string, number> = {}
      if (billIds.length > 0) {
        const { data: allBillItems } = await supabase
          .from("bill_items")
          .select("product_id, quantity, returned_quantity")
          .in("bill_id", billIds)

        // حساب الكميات المفوترة (صافي بعد المرتجعات)
        for (const item of (allBillItems || [])) {
          const netQty = Number(item.quantity || 0) - Number(item.returned_quantity || 0)
          billedQtyMap[item.product_id] = (billedQtyMap[item.product_id] || 0) + netQty
        }
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

      // تحديث أمر الشراء بالحالة والبيانات المالية من الفاتورة
      await supabase
        .from("purchase_orders")
        .update({
          status: newStatus,
          subtotal: billData.subtotal,
          tax_amount: billData.tax_amount,
          total: billData.total_amount,
          returned_amount: billData.returned_amount || 0,
          return_status: billData.return_status,
          updated_at: new Date().toISOString()
        })
        .eq("id", poId)

      console.log(`✅ Updated linked PO ${poId} status to: ${newStatus} with financial data`)
    } catch (err) {
      console.warn("Failed to update linked PO status:", err)
    }
  }

  // === دالة تحديث حالة أمر الشراء بعد حذف الفاتورة ===
  const updatePurchaseOrderStatusAfterBillDelete = async (poId: string) => {
    try {
      // جلب بنود أمر الشراء
      const { data: poItems } = await supabase
        .from("purchase_order_items")
        .select("product_id, quantity")
        .eq("purchase_order_id", poId)

      // جلب جميع الفواتير المرتبطة بأمر الشراء (غير الملغاة)
      const { data: linkedBills } = await supabase
        .from("bills")
        .select("id, status")
        .eq("purchase_order_id", poId)
        .not("status", "in", "(voided,cancelled)")

      const billIds = (linkedBills || []).map((b: any) => b.id)

      // جلب بنود جميع الفواتير المرتبطة
      let billedQtyMap: Record<string, number> = {}
      if (billIds.length > 0) {
        const { data: allBillItems } = await supabase
          .from("bill_items")
          .select("product_id, quantity, returned_quantity")
          .in("bill_id", billIds)

        for (const item of (allBillItems || [])) {
          const netQty = Number(item.quantity || 0) - Number(item.returned_quantity || 0)
          billedQtyMap[item.product_id] = (billedQtyMap[item.product_id] || 0) + netQty
        }
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
        .update({ status: newStatus, bill_id: billIds.length > 0 ? billIds[0] : null })
        .eq("id", poId)

      console.log(`✅ Updated PO ${poId} status after bill delete to: ${newStatus}`)
    } catch (err) {
      console.warn("Failed to update PO status after bill delete:", err)
    }
  }

  // ===== 📌 Cash Basis: قيد المشتريات والذمم عند الدفع =====
  // عند Paid: Debit Inventory + VAT / Credit AP
  // هذا يسجل المصروف عند الدفع فقط (وليس عند الاستلام)
  const postAPPurchaseJournal = async () => {
    try {
      if (!bill) return

      const mapping = await findAccountIds(bill.company_id)
      // ✅ تحسين: استخدام المخزون كبديل للمشتريات إذا لم يكن متوفراً
      if (!mapping || !mapping.ap || (!mapping.purchases && !mapping.inventory)) {
        console.warn("Account mapping incomplete: AP and (Purchases or Inventory) not found. Skipping AP/Purchases journal.")
        return
      }

      // تجنب التكرار - التحقق من عدم وجود قيد سابق
      const { data: existing } = await supabase
        .from("journal_entries")
        .select("id")
        .eq("company_id", mapping.companyId)
        .eq("reference_type", "bill") // قيد الفاتورة الرئيسي
        .eq("reference_id", bill.id)
        .limit(1)
      if (existing && existing.length > 0) return

      // ===== 1) قيد المشتريات والذمم الدائنة =====
      const { data: entry, error: entryError } = await supabase
        .from("journal_entries")
        .insert({
          company_id: bill.company_id,
          reference_type: "bill", // قيد الفاتورة - نظام الاستحقاق
          reference_id: bill.id,
          entry_date: bill.bill_date,
          description: `فاتورة مشتريات ${bill.bill_number}`,
          branch_id: bill.branch_id || null,
          cost_center_id: bill.cost_center_id || null,
          warehouse_id: bill.warehouse_id || null,
        })
        .select()
        .single()

      if (entryError) throw entryError

      // القيد: Debit Inventory/Purchases + VAT / Credit AP
      const lines: any[] = []

      // Debit: المخزون (Asset) - المشتريات تُسجل كأصل وليس مصروف
      // ✅ حسب المعيار المحاسبي: المشتريات → المخزون (Asset)
      // عند البيع → COGS يُسجل تلقائيًا بواسطة Trigger
      lines.push({
        journal_entry_id: entry.id,
        account_id: mapping.inventory || mapping.purchases,
        debit_amount: bill.subtotal,
        credit_amount: 0,
        description: "المخزون (أصل)",
        branch_id: bill.branch_id || null,
        cost_center_id: bill.cost_center_id || null,
      })

      // Debit: ضريبة المدخلات إن وجدت
      if (mapping.vatInput && bill.tax_amount && bill.tax_amount > 0) {
        lines.push({
          journal_entry_id: entry.id,
          account_id: mapping.vatInput,
          debit_amount: bill.tax_amount,
          credit_amount: 0,
          description: "ضريبة القيمة المضافة المدفوعة",
          branch_id: bill.branch_id || null,
          cost_center_id: bill.cost_center_id || null,
        })
      }

      // Credit: الذمم الدائنة (الموردين)
      lines.push({
        journal_entry_id: entry.id,
        account_id: mapping.ap,
        debit_amount: 0,
        credit_amount: bill.total_amount,
        description: "الذمم الدائنة (الموردين)",
        branch_id: bill.branch_id || null,
        cost_center_id: bill.cost_center_id || null,
      })

      const { error: linesError } = await supabase.from("journal_entry_lines").insert(lines)
      if (linesError) throw linesError

      console.log(`✅ تم إنشاء قيد المشتريات للفاتورة ${bill.bill_number} (Accrual Basis)`)
    } catch (err) {
      console.error("Error posting AP/Purchase journal:", err)
    }
  }

  // === منطق الفاتورة المرسلة (Sent) ===
  // عند الإرسال: إضافة المخزون + قيد AP/Purchases (نظام الاستحقاق)
  // قيد السداد فقط يُنشأ عند الدفع
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
        toastActionSuccess(toast, "التحقق", "تم إضافة المخزون مسبقاً")
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
        // ملاحظة: لا حاجة لتحديث products.quantity_on_hand يدوياً
        // لأن الـ Database Trigger (trg_apply_inventory_insert) يفعل ذلك تلقائياً
      }

      toastActionSuccess(toast, "الإرسال", "تم إضافة الكميات للمخزون")
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

      // التحقق من توفر المخزون قبل الإلغاء أو الإرجاع للمسودة (لأن ذلك يعني خصم المخزون)
      if ((newStatus === "draft" || newStatus === "cancelled") &&
        (bill.status === "sent" || bill.status === "received" || bill.status === "partially_paid" || bill.status === "paid")) {
        // جلب عناصر الفاتورة للتحقق
        const { data: billItems } = await supabase
          .from("bill_items")
          .select("product_id, quantity")
          .eq("bill_id", bill.id)

        const itemsToCheck = (billItems || []).map((item: any) => ({
          product_id: item.product_id,
          quantity: Number(item.quantity || 0)
        }))

        // Pass bill context for proper inventory filtering
        const inventoryContext = bill ? {
          company_id: bill.company_id,
          branch_id: bill.branch_id || null,
          warehouse_id: bill.warehouse_id || null,
          cost_center_id: bill.cost_center_id || null,
        } : undefined

        const { success, shortages } = await checkInventoryAvailability(supabase, itemsToCheck, undefined, inventoryContext)

        if (!success) {
          const { title, description } = getShortageToastContent(shortages, appLang as 'en' | 'ar')
          toast({
            variant: "destructive",
            title: appLang === 'en' ? "Cannot Cancel Bill" : "لا يمكن إلغاء الفاتورة",
            description: appLang === 'en'
              ? `Cancelling this bill would result in negative inventory:\n${shortages.map(s => `• ${s.productName}: Required to deduct ${s.required}, Available ${s.available}`).join("\n")}`
              : `إلغاء هذه الفاتورة سيؤدي لمخزون سالب:\n${shortages.map(s => `• ${s.productName}: مطلوب خصم ${s.required}، متوفر ${s.available}`).join("\n")}`,
            duration: 8000,
          })
          return
        }
      }

      const { error } = await supabase.from("bills").update({ status: newStatus }).eq("id", bill.id)
      if (error) throw error
      if (newStatus === "sent") {
        // ===== 📌 ERP Accounting & Inventory Core Logic (MANDATORY FINAL SPECIFICATION) =====
        // النمط المحاسبي الصارم:
        // Sent/Received: زيادة المخزون فقط (Stock In) - ❌ لا قيد محاسبي
        // Paid: قيد AP/Inventory + قيد السداد (AP/Cash)
        // 1️⃣ إضافة المخزون (كميات فقط)
        await postBillInventoryOnly()
        // ❌ لا قيد محاسبي عند Sent - القيد يُنشأ عند الدفع فقط
        // تحديث حالة أمر الشراء المرتبط
        await updateLinkedPurchaseOrderStatus(bill.id)
        console.log(`✅ BILL Sent: تم إضافة المخزون فقط (النمط المحاسبي الصارم - لا قيد)`)
      } else if (newStatus === "draft" || newStatus === "cancelled") {
        await reverseBillInventory()
        // عكس القيود المحاسبية إن وجدت (للفواتير المدفوعة سابقاً)
        await reverseBillJournals()
        // تحديث حالة أمر الشراء المرتبط
        await updateLinkedPurchaseOrderStatus(bill.id)
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
        .select("product_id, quantity, products(item_type)")
        .eq("bill_id", bill.id)

      // فلترة المنتجات فقط (وليس الخدمات)
      const productItems = (billItems || []).filter((it: any) => !!it.product_id && it.products?.item_type !== 'service')

      // Create reversal journal entry
      const { data: revEntry } = await supabase
        .from("journal_entries")
        .insert({ company_id: bill.company_id, reference_type: "bill_reversal", reference_id: bill.id, entry_date: new Date().toISOString().slice(0, 10), description: `عكس شراء للفاتورة ${bill.bill_number}` })
        .select()
        .single()
      const reversalTx = productItems.map((it: any) => ({
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
        // ملاحظة: لا حاجة لتحديث products.quantity_on_hand يدوياً
        // لأن الـ Database Trigger (trg_apply_inventory_insert) يفعل ذلك تلقائياً
      }
    } catch (e) {
      console.warn("Error reversing inventory for bill", e)
    }
  }

  // ===== عكس القيود المحاسبية للفاتورة =====
  const reverseBillJournals = async () => {
    try {
      if (!bill) return

      // حذف جميع القيود المحاسبية المرتبطة بالفاتورة
      const { data: billEntries, error: jeErr } = await supabase
        .from("journal_entries")
        .select("id")
        .eq("reference_id", bill.id)
        .in("reference_type", ["bill", "bill_payment", "purchase_return"])

      if (jeErr) throw jeErr

      if (billEntries && billEntries.length > 0) {
        const jeIds = billEntries.map((je: any) => je.id)
        // حذف السطور أولاً (foreign key constraint)
        await supabase.from("journal_entry_lines").delete().in("journal_entry_id", jeIds)
        // ثم حذف القيود
        await supabase.from("journal_entries").delete().in("id", jeIds)
        console.log(`✅ تم عكس القيود المحاسبية للفاتورة ${bill.bill_number}`)
      }
    } catch (e) {
      console.warn("Error reversing bill journals:", e)
    }
  }

  const handleDelete = async () => {
    if (!bill) return
    try {
      // حفظ purchase_order_id قبل الحذف لتحديث حالة أمر الشراء لاحقاً
      const linkedPOId = (bill as any).purchase_order_id

      // إن كانت مسودة ولا تحتوي على مدفوعات: حذف مباشر بدون عكس
      if (canHardDelete) {
        const { error: delItemsErr } = await supabase.from("bill_items").delete().eq("bill_id", bill.id)
        if (delItemsErr) throw delItemsErr
        const { error: delBillErr } = await supabase.from("bills").delete().eq("id", bill.id)
        if (delBillErr) throw delBillErr

        // تحديث حالة أمر الشراء المرتبط بعد الحذف
        if (linkedPOId) {
          await updatePurchaseOrderStatusAfterBillDelete(linkedPOId)
        }

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
            .insert({ company_id: mapping.companyId, reference_type: "bill_inventory_reversal", reference_id: bill.id, entry_date: new Date().toISOString().slice(0, 10), description: `عكس مخزون لفاتورة ${billRow?.bill_number || bill.bill_number}` })
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
            // ملاحظة: لا حاجة لتحديث products.quantity_on_hand يدوياً
            // لأن الـ Database Trigger (trg_apply_inventory_insert) يفعل ذلك تلقائياً
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
        if (r.ok) {
          const j = await r.json()
          // API response structure: { success, data: { company, accounts } }
          const lu2 = String(j?.data?.company?.logo_url || j?.company?.logo_url || '')
          if (lu2) setCompanyLogoUrl(lu2)
        }
      } catch { }
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
            {/* ==================== Header Section ==================== */}
            <div className="flex flex-col gap-4">
              {/* العنوان والحالة */}
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white truncate">
                      {appLang === 'en' ? `Bill #${bill.bill_number}` : `فاتورة #${bill.bill_number}`}
                    </h1>
                    {/* شارة الحالة */}
                    <span className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${bill.status === 'paid' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                      bill.status === 'partially_paid' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                        bill.status === 'sent' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                          bill.status === 'draft' ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200' :
                            bill.status === 'voided' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                              'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                      }`}>
                      {bill.status === 'paid' ? (appLang === 'en' ? 'Paid' : 'مدفوعة') :
                        bill.status === 'partially_paid' ? (appLang === 'en' ? 'Partially Paid' : 'مدفوعة جزئياً') :
                          bill.status === 'sent' ? (appLang === 'en' ? 'Sent' : 'مرسلة') :
                            bill.status === 'draft' ? (appLang === 'en' ? 'Draft' : 'مسودة') :
                              bill.status === 'voided' ? (appLang === 'en' ? 'Voided' : 'ملغاة') :
                                bill.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {appLang === 'en' ? `Supplier: ${supplier?.name || ''}` : `المورد: ${supplier?.name || ''}`}
                  </p>
                </div>

                {/* أزرار التنقل */}
                <div className="flex items-center gap-2 print:hidden">
                  {prevBillId ? (
                    <Link href={`/bills/${prevBillId}`}>
                      <Button variant="outline" size="sm">
                        <ArrowLeft className="w-4 h-4" />
                      </Button>
                    </Link>
                  ) : (
                    <Button variant="outline" size="sm" disabled><ArrowLeft className="w-4 h-4" /></Button>
                  )}
                  {nextBillId ? (
                    <Link href={`/bills/${nextBillId}`}>
                      <Button variant="outline" size="sm">
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </Link>
                  ) : (
                    <Button variant="outline" size="sm" disabled><ArrowRight className="w-4 h-4" /></Button>
                  )}
                </div>
              </div>

              {/* شريط الأزرار الرئيسية - ثابت ومنظم */}
              <div className="flex flex-wrap items-center gap-2 p-3 bg-gray-50 dark:bg-slate-800/50 rounded-lg border border-gray-200 dark:border-slate-700 print:hidden">
                {/* زر العودة */}
                <Button variant="outline" size="sm" onClick={() => router.push("/bills")} className="order-first">
                  {appLang === 'en' ? <ArrowLeft className="w-4 h-4 mr-1" /> : <ArrowRight className="w-4 h-4 ml-1" />}
                  <span className="hidden sm:inline">{appLang === 'en' ? 'Back' : 'العودة'}</span>
                </Button>

                {/* فاصل */}
                <div className="h-6 w-px bg-gray-300 dark:bg-slate-600 hidden sm:block" />

                {/* أزرار الإجراءات الرئيسية */}
                {permUpdate && (
                  <Link href={`/bills/${bill.id}/edit`}>
                    <Button variant="outline" size="sm">
                      <Pencil className="w-4 h-4 sm:mr-1" />
                      <span className="hidden sm:inline">{appLang === 'en' ? 'Edit' : 'تعديل'}</span>
                    </Button>
                  </Link>
                )}

                {bill.status === "draft" && (
                  <Button onClick={() => changeStatus("sent")} disabled={posting} size="sm" className="bg-green-600 hover:bg-green-700">
                    <CheckCircle className="w-4 h-4 sm:mr-1" />
                    <span className="hidden sm:inline">{posting ? "..." : (appLang === 'en' ? 'Mark as Sent' : 'تحديد كمرسل')}</span>
                  </Button>
                )}

                {/* فاصل */}
                <div className="h-6 w-px bg-gray-300 dark:bg-slate-600 hidden sm:block" />

                {/* أزرار المرتجعات */}
                {bill.status !== "draft" && bill.status !== "voided" && bill.status !== "fully_returned" && items.some(it => (it.quantity - (it.returned_quantity || 0)) > 0) && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => openReturnDialog('partial')} className="text-orange-600 hover:text-orange-700 border-orange-300 hover:border-orange-400">
                      <RotateCcw className="w-4 h-4 sm:mr-1" />
                      <span className="hidden sm:inline">{appLang === 'en' ? 'Partial Return' : 'مرتجع جزئي'}</span>
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openReturnDialog('full')} className="text-red-600 hover:text-red-700 border-red-300 hover:border-red-400">
                      <RotateCcw className="w-4 h-4 sm:mr-1" />
                      <span className="hidden sm:inline">{appLang === 'en' ? 'Full Return' : 'مرتجع كامل'}</span>
                    </Button>
                  </>
                )}

                {/* فاصل */}
                <div className="h-6 w-px bg-gray-300 dark:bg-slate-600 hidden sm:block" />

                {/* أزرار الطباعة والتنزيل */}
                <Button variant="outline" size="sm" onClick={handlePrint}>
                  <Printer className="w-4 h-4 sm:mr-1" />
                  <span className="hidden sm:inline">{appLang === 'en' ? 'Print' : 'طباعة'}</span>
                </Button>
                <Button variant="outline" size="sm" onClick={handleDownloadPDF}>
                  <FileDown className="w-4 h-4 sm:mr-1" />
                  <span className="hidden sm:inline">{appLang === 'en' ? 'PDF' : 'PDF'}</span>
                </Button>

                {/* زر الحذف - في النهاية */}
                {/* 🔒 منع الحذف للفواتير المرسلة أو المدفوعة جزئياً أو كلياً */}
                {permDelete && bill.status !== 'sent' && bill.status !== 'partially_paid' && bill.status !== 'paid' && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm" className="mr-auto sm:mr-0">
                        <Trash2 className="w-4 h-4 sm:mr-1" />
                        <span className="hidden sm:inline">{appLang === 'en' ? 'Delete' : 'حذف'}</span>
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{appLang === 'en' ? `Confirm ${canHardDelete ? 'Delete' : 'Void'} Bill` : `تأكيد ${canHardDelete ? 'حذف' : 'إلغاء'} الفاتورة`}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {canHardDelete
                            ? (appLang === 'en' ? 'The bill will be permanently deleted if it is a draft with no payments.' : 'سيتم حذف الفاتورة نهائياً إن كانت مسودة ولا تحتوي على مدفوعات.')
                            : (appLang === 'en' ? 'The bill is not a draft or has payments; it will be voided while preserving history.' : 'الفاتورة ليست مسودة أو لديها مدفوعات؛ سيتم إلغاء الفاتورة (void) مع الحفاظ على السجل.')}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{appLang === 'en' ? 'Cancel' : 'تراجع'}</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete}>{canHardDelete ? (appLang === 'en' ? 'Delete' : 'حذف') : (appLang === 'en' ? 'Void' : 'إلغاء')}</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>

            <Card ref={billContentRef} className="bg-white dark:bg-slate-900">
              <CardHeader className="pb-2">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <CardTitle className="text-lg">{appLang === 'en' ? 'Bill Details' : 'تفاصيل الفاتورة'}</CardTitle>
                  {companyLogo && <img src={companyLogo} alt="Company Logo" className="h-12 w-12 rounded object-cover border" />}
                </div>
              </CardHeader>
              <CardContent className="space-y-4 p-4 sm:p-6">
                {/* معلومات الفاتورة الأساسية */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-gray-50 dark:bg-slate-800/50 rounded-lg text-sm">
                  <div className="flex flex-col">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Bill Date' : 'تاريخ الفاتورة'}</span>
                    <span className="font-medium">{new Date(bill.bill_date).toLocaleDateString(appLang === 'en' ? 'en' : 'ar')}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Due Date' : 'تاريخ الاستحقاق'}</span>
                    <span className="font-medium">{new Date(bill.due_date).toLocaleDateString(appLang === 'en' ? 'en' : 'ar')}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Tax Type' : 'نوع الضريبة'}</span>
                    <span className="font-medium">{bill.tax_inclusive ? (appLang === 'en' ? 'Inclusive' : 'شاملة') : (appLang === 'en' ? 'Exclusive' : 'مضافة')}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Currency' : 'العملة'}</span>
                    <span className="font-medium">{bill.currency_code || appCurrency}</span>
                  </div>
                </div>

                {/* جدول البنود - عرض سطح المكتب */}
                <div className="hidden md:block overflow-x-auto border rounded-lg">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-slate-800">
                      <tr>
                        <th className="p-3 text-right font-medium text-gray-700 dark:text-gray-300">{appLang === 'en' ? 'Product' : 'المنتج'}</th>
                        <th className="p-3 text-center font-medium text-gray-700 dark:text-gray-300">{appLang === 'en' ? 'Qty' : 'الكمية'}</th>
                        <th className="p-3 text-center font-medium text-gray-700 dark:text-gray-300">{appLang === 'en' ? 'Unit Price' : 'سعر الوحدة'}</th>
                        <th className="p-3 text-center font-medium text-gray-700 dark:text-gray-300">{appLang === 'en' ? 'Discount' : 'الخصم'}</th>
                        <th className="p-3 text-center font-medium text-gray-700 dark:text-gray-300">{appLang === 'en' ? 'Tax' : 'الضريبة'}</th>
                        <th className="p-3 text-center font-medium text-gray-700 dark:text-gray-300">{appLang === 'en' ? 'Returned' : 'المرتجع'}</th>
                        <th className="p-3 text-left font-medium text-gray-700 dark:text-gray-300">{appLang === 'en' ? 'Total' : 'الإجمالي'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                      {items.map((it) => {
                        const returnedQty = Number(it.returned_quantity || 0)
                        const effectiveQty = it.quantity - returnedQty
                        return (
                          <tr key={it.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50">
                            <td className="p-3">
                              <div className="font-medium text-gray-900 dark:text-white">{products[it.product_id]?.name || it.product_id}</div>
                              {it.description && <div className="text-xs text-gray-500 dark:text-gray-400">{it.description}</div>}
                            </td>
                            <td className="p-3 text-center font-medium">{it.quantity}</td>
                            <td className="p-3 text-center">{currencySymbol}{it.unit_price.toFixed(2)}</td>
                            <td className="p-3 text-center">{(it.discount_percent || 0) > 0 ? `${(it.discount_percent || 0).toFixed(0)}%` : '-'}</td>
                            <td className="p-3 text-center">{it.tax_rate > 0 ? `${it.tax_rate.toFixed(0)}%` : '-'}</td>
                            <td className="p-3 text-center">
                              {returnedQty > 0 ? (
                                <span className="text-red-600 font-medium bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded">-{returnedQty}</span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="p-3 text-left">
                              <span className="font-semibold text-gray-900 dark:text-white">{currencySymbol}{it.line_total.toFixed(2)}</span>
                              {returnedQty > 0 && (
                                <div className="text-xs text-orange-600 dark:text-orange-400">
                                  {appLang === 'en' ? 'Net' : 'صافي'}: {currencySymbol}{(effectiveQty * it.unit_price * (1 - (it.discount_percent || 0) / 100)).toFixed(2)}
                                </div>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* جدول البنود - عرض الموبايل (بطاقات) */}
                <div className="md:hidden space-y-3">
                  {items.map((it) => {
                    const returnedQty = Number(it.returned_quantity || 0)
                    const effectiveQty = it.quantity - returnedQty
                    return (
                      <div key={it.id} className="p-3 border rounded-lg bg-white dark:bg-slate-800 shadow-sm">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <h4 className="font-medium text-gray-900 dark:text-white">{products[it.product_id]?.name || it.product_id}</h4>
                            {it.description && <p className="text-xs text-gray-500 dark:text-gray-400">{it.description}</p>}
                          </div>
                          <span className="font-bold text-blue-600 dark:text-blue-400">{currencySymbol}{it.line_total.toFixed(2)}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div className="flex flex-col">
                            <span className="text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Qty' : 'الكمية'}</span>
                            <span className="font-medium">{it.quantity}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Price' : 'السعر'}</span>
                            <span className="font-medium">{currencySymbol}{it.unit_price.toFixed(2)}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Tax' : 'الضريبة'}</span>
                            <span className="font-medium">{it.tax_rate > 0 ? `${it.tax_rate.toFixed(0)}%` : '-'}</span>
                          </div>
                        </div>
                        {returnedQty > 0 && (
                          <div className="mt-2 pt-2 border-t border-dashed flex justify-between items-center">
                            <span className="text-xs text-orange-600 dark:text-orange-400">{appLang === 'en' ? 'Returned' : 'مرتجع'}: {returnedQty}</span>
                            <span className="text-xs text-orange-600 dark:text-orange-400 font-medium">{appLang === 'en' ? 'Net' : 'صافي'}: {currencySymbol}{(effectiveQty * it.unit_price * (1 - (it.discount_percent || 0) / 100)).toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">{appLang === 'en' ? 'Summary' : 'ملخص'}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex items-center justify-between"><span>{appLang === 'en' ? 'Subtotal' : 'الإجمالي الفرعي'}</span><span>{bill.subtotal.toFixed(2)}</span></div>
                      <div className="flex items-center justify-between"><span>{appLang === 'en' ? 'Tax' : 'الضريبة'}</span><span>{bill.tax_amount.toFixed(2)} {bill.tax_inclusive ? (appLang === 'en' ? '(Prices inclusive)' : '(أسعار شاملة)') : ''}</span></div>
                      {(bill.shipping || 0) > 0 && (
                        <>
                          {(bill as any).shipping_providers?.provider_name && (
                            <div className="flex items-center justify-between"><span>{appLang === 'en' ? 'Shipping Company' : 'شركة الشحن'}</span><span className="text-sm">{(bill as any).shipping_providers.provider_name}</span></div>
                          )}
                          <div className="flex items-center justify-between"><span>{appLang === 'en' ? 'Shipping' : 'الشحن'}</span><span>{(bill.shipping || 0).toFixed(2)} {appLang === 'en' ? `(+Tax ${Number(bill.shipping_tax_rate || 0).toFixed(2)}%)` : `(+ضريبة ${Number(bill.shipping_tax_rate || 0).toFixed(2)}%)`}</span></div>
                        </>
                      )}
                      <div className="flex items-center justify-between"><span>{appLang === 'en' ? 'Adjustment' : 'التعديل'}</span><span>{(bill.adjustment || 0).toFixed(2)}</span></div>
                      {/* عرض المرتجعات إذا وجدت */}
                      {Number((bill as any).returned_amount || 0) > 0 ? (
                        <>
                          <div className="flex items-center justify-between text-gray-500">
                            <span>{appLang === 'en' ? 'Original Total' : 'الإجمالي الأصلي'}</span>
                            <span>{((bill as any).original_total || (bill.total_amount + Number((bill as any).returned_amount || 0))).toFixed(2)}</span>
                          </div>
                          <div className="flex items-center justify-between text-orange-600 dark:text-orange-400">
                            <span>{appLang === 'en' ? 'Returns' : 'المرتجعات'}</span>
                            <span>-{Number((bill as any).returned_amount).toFixed(2)}</span>
                          </div>
                          <div className="flex items-center justify-between font-semibold text-blue-600 pt-2 border-t border-gray-200 dark:border-gray-700">
                            <span>{appLang === 'en' ? 'Net Total' : 'الإجمالي الصافي'}</span>
                            <span>{bill.total_amount.toFixed(2)} {currencySymbol}</span>
                          </div>
                        </>
                      ) : (
                        <div className="flex items-center justify-between font-semibold text-blue-600 pt-2 border-t border-gray-200 dark:border-gray-700">
                          <span>{appLang === 'en' ? 'Total' : 'الإجمالي'}</span>
                          <span>{bill.total_amount.toFixed(2)} {currencySymbol}</span>
                        </div>
                      )}
                      {/* عرض القيمة المحولة إذا كانت العملة مختلفة */}
                      {bill.currency_code && bill.currency_code !== appCurrency && bill.base_currency_total && (
                        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-2 rounded">
                          <span>{appLang === 'en' ? `Equivalent in ${appCurrency}:` : `المعادل بـ ${appCurrency}:`}</span>
                          <span className="font-medium">{bill.base_currency_total.toFixed(2)} {appCurrency}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">{appLang === 'en' ? 'Discount' : 'الخصم'}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex items-center justify-between"><span>{appLang === 'en' ? 'Type' : 'النوع'}</span><span>{bill.discount_type === 'percent' ? (appLang === 'en' ? 'Percentage' : 'نسبة') : (appLang === 'en' ? 'Amount' : 'قيمة')}</span></div>
                      <div className="flex items-center justify-between"><span>{appLang === 'en' ? 'Value' : 'القيمة'}</span><span>{Number(bill.discount_value || 0).toFixed(2)}{bill.discount_type === 'percent' ? '%' : ''}</span></div>
                      <div className="flex items-center justify-between"><span>{appLang === 'en' ? 'Position' : 'الموضع'}</span><span>{bill.discount_position === 'after_tax' ? (appLang === 'en' ? 'After tax' : 'بعد الضريبة') : (appLang === 'en' ? 'Before tax' : 'قبل الضريبة')}</span></div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">{appLang === 'en' ? 'Payments' : 'المدفوعات'}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex items-center justify-between"><span>{appLang === 'en' ? 'Paid' : 'المدفوع'}</span><span className="text-green-600">{paidTotal.toFixed(2)} {currencySymbol}</span></div>
                      <div className="flex items-center justify-between"><span>{appLang === 'en' ? 'Remaining' : 'المتبقي'}</span><span className="font-semibold text-red-600">{Math.max((bill.total_amount || 0) - paidTotal, 0).toFixed(2)} {currencySymbol}</span></div>
                      {bill.status !== 'draft' && bill.status !== 'voided' && bill.status !== 'paid' && (
                        <div>
                          <Link href={`/payments?bill_id=${bill.id}`} className="text-blue-600 hover:underline">{appLang === 'en' ? 'Record/Pay' : 'سجل/ادفع'}</Link>
                        </div>
                      )}
                      {/* Branch and Cost Center */}
                      {branchName && (
                        <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
                          <span>{appLang === 'en' ? 'Branch' : 'الفرع'}</span>
                          <span className="font-medium">{branchName}</span>
                        </div>
                      )}
                      {costCenterName && (
                        <div className="flex items-center justify-between">
                          <span>{appLang === 'en' ? 'Cost Center' : 'مركز التكلفة'}</span>
                          <span className="font-medium">{costCenterName}</span>
                        </div>
                      )}
                      {linkedPurchaseOrder && (
                        <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700 print:hidden">
                          <span>{appLang === 'en' ? 'Purchase Order' : 'أمر الشراء'}</span>
                          <Link href={`/purchase-orders/${linkedPurchaseOrder.id}`} className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline flex items-center gap-1">
                            <ExternalLink className="w-3 h-3" />
                            <span className="font-medium">{linkedPurchaseOrder.po_number}</span>
                          </Link>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>

            {/* ==================== قسم العمليات على الفاتورة ==================== */}
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
                      <p className="text-xs text-blue-600 dark:text-blue-400">{appLang === 'en' ? 'Bill Total' : 'إجمالي الفاتورة'}</p>
                      <p className="text-lg font-bold text-blue-700 dark:text-blue-300">{currencySymbol}{bill.total_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
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
                      <p className="text-lg font-bold text-green-700 dark:text-green-300">{currencySymbol}{paidTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
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
                      <p className="text-lg font-bold text-orange-700 dark:text-orange-300">{currencySymbol}{Number((bill as any).returned_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                    </div>
                  </div>
                </Card>

                {/* صافي المتبقي */}
                {(() => {
                  // لا نستخدم Math.max لأن الرصيد السالب يعني رصيد دائن للشركة من المورد
                  // total_amount تم تحديثه بالفعل ليشمل المرتجعات، لذا لا نطرحها مرة أخرى
                  const netRemaining = bill.total_amount - paidTotal
                  const isCredit = netRemaining < 0
                  const isOwed = netRemaining > 0
                  return (
                    <Card className={`p-4 ${isOwed ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' : isCredit ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${isOwed ? 'bg-red-100 dark:bg-red-800' : isCredit ? 'bg-blue-100 dark:bg-blue-800' : 'bg-green-100 dark:bg-green-800'}`}>
                          {isOwed ? (
                            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                          ) : (
                            <CheckCircle className={`h-5 w-5 ${isCredit ? 'text-blue-600 dark:text-blue-400' : 'text-green-600 dark:text-green-400'}`} />
                          )}
                        </div>
                        <div>
                          <p className={`text-xs ${isOwed ? 'text-red-600 dark:text-red-400' : isCredit ? 'text-blue-600 dark:text-blue-400' : 'text-green-600 dark:text-green-400'}`}>
                            {appLang === 'en' ? (isCredit ? 'Credit Balance' : 'Net Remaining') : (isCredit ? 'رصيد دائن' : 'صافي المتبقي')}
                          </p>
                          <p className={`text-lg font-bold ${isOwed ? 'text-red-700 dark:text-red-300' : isCredit ? 'text-blue-700 dark:text-blue-300' : 'text-green-700 dark:text-green-300'}`}>
                            {currencySymbol}{Math.abs(netRemaining).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            {isCredit && <span className="text-xs mr-1">({appLang === 'en' ? 'credit' : 'دائن'})</span>}
                          </p>
                        </div>
                      </div>
                    </Card>
                  )
                })()}
              </div>

              {/* جدول المدفوعات */}
              {permPayView && (
                <Card className="dark:bg-slate-900 dark:border-slate-800">
                  <div className="p-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-5 w-5 text-green-600" />
                      <h3 className="font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Payments' : 'المدفوعات'}</h3>
                      <span className="bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-300 text-xs px-2 py-0.5 rounded-full">{paymentsDetail.length}</span>
                    </div>
                    {bill.status !== 'draft' && bill.status !== 'voided' && bill.status !== 'paid' && (
                      <Link href={`/payments?bill_id=${bill.id}`} className="text-sm text-blue-600 hover:underline">{appLang === 'en' ? 'Add Payment' : 'إضافة دفعة'}</Link>
                    )}
                  </div>
                  <div className="p-4">
                    {paymentsDetail.length === 0 ? (
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
                            {paymentsDetail.map((payment, idx) => (
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
                              <td className="px-3 py-2 font-bold text-green-600 dark:text-green-400">{currencySymbol}{paidTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                </Card>
              )}

              {/* جدول المرتجعات من vendor_credits */}
              <Card className="dark:bg-slate-900 dark:border-slate-800">
                <div className="p-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <RotateCcw className="h-5 w-5 text-orange-600" />
                    <h3 className="font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Returns (Vendor Credits)' : 'المرتجعات (إشعارات دائنة)'}</h3>
                    <span className="bg-orange-100 dark:bg-orange-800 text-orange-700 dark:text-orange-300 text-xs px-2 py-0.5 rounded-full">{vendorCredits.length}</span>
                  </div>
                </div>
                <div className="p-4">
                  {vendorCredits.length === 0 && !((bill as any).return_status === 'partial' || (bill as any).return_status === 'full' || Number((bill as any).returned_amount || 0) > 0) ? (
                    <div className="text-center py-8">
                      <Package className="h-10 w-10 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'No returns recorded yet' : 'لا توجد مرتجعات بعد'}</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* عرض مرتجعات الفاتورة المباشرة إن وجدت */}
                      {((bill as any).return_status === 'partial' || (bill as any).return_status === 'full' || Number((bill as any).returned_amount || 0) > 0) && (
                        <div className="border border-orange-200 dark:border-orange-800 rounded-lg overflow-hidden">
                          <div className="bg-orange-50 dark:bg-orange-900/20 p-3 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${(bill as any).return_status === 'full' ? 'bg-red-100 text-red-700 dark:bg-red-800 dark:text-red-300' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-800 dark:text-yellow-300'
                                }`}>
                                {(bill as any).return_status === 'full' ? (appLang === 'en' ? 'Full Return' : 'مرتجع كامل') : (appLang === 'en' ? 'Partial Return' : 'مرتجع جزئي')}
                              </span>
                            </div>
                            <div className="flex items-center gap-4 text-sm">
                              <span className="font-semibold text-orange-600 dark:text-orange-400">{currencySymbol}{Number((bill as any).returned_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                            </div>
                          </div>
                          {/* تفاصيل العناصر المرتجعة */}
                          <div className="p-3">
                            <table className="w-full text-sm">
                              <thead className="text-xs text-gray-500 dark:text-gray-400">
                                <tr>
                                  <th className="text-right pb-2">{appLang === 'en' ? 'Product' : 'المنتج'}</th>
                                  <th className="text-right pb-2">{appLang === 'en' ? 'Original Qty' : 'الكمية الأصلية'}</th>
                                  <th className="text-right pb-2">{appLang === 'en' ? 'Returned Qty' : 'الكمية المرتجعة'}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {items.filter(it => Number(it.returned_quantity || 0) > 0).map((item) => (
                                  <tr key={item.id} className="border-t border-gray-100 dark:border-gray-800">
                                    <td className="py-2 text-gray-700 dark:text-gray-300">{products[item.product_id]?.name || '-'}</td>
                                    <td className="py-2 text-gray-600 dark:text-gray-400">{item.quantity}</td>
                                    <td className="py-2 font-medium text-orange-600 dark:text-orange-400">{Math.abs(Number(item.returned_quantity || 0))}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* عرض إشعارات الموردين الدائنة */}
                      {vendorCredits.map((vc, idx) => (
                        <div key={vc.id} className="border border-orange-200 dark:border-orange-800 rounded-lg overflow-hidden">
                          <div className="bg-orange-50 dark:bg-orange-900/20 p-3 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{vc.credit_number}</span>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${vc.status === 'applied' ? 'bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-300' :
                                vc.status === 'partially_applied' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-800 dark:text-yellow-300' :
                                  'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                                }`}>
                                {vc.status === 'applied' ? (appLang === 'en' ? 'Applied' : 'مطبّق') :
                                  vc.status === 'partially_applied' ? (appLang === 'en' ? 'Partial' : 'جزئي') :
                                    vc.status === 'open' ? (appLang === 'en' ? 'Open' : 'مفتوح') : vc.status}
                              </span>
                            </div>
                            <div className="flex items-center gap-4 text-sm">
                              <span className="text-gray-500 dark:text-gray-400">{vc.credit_date}</span>
                              <span className="font-semibold text-orange-600 dark:text-orange-400">{currencySymbol}{Number(vc.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                            </div>
                          </div>
                          {vc.items && vc.items.length > 0 && (
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
                                  {vc.items.map((item: VendorCreditItem) => (
                                    <tr key={item.id} className="border-t border-gray-100 dark:border-gray-800">
                                      <td className="py-2 text-gray-700 dark:text-gray-300">{item.product_name || '-'}</td>
                                      <td className="py-2 text-gray-600 dark:text-gray-400">{item.quantity}</td>
                                      <td className="py-2 text-gray-600 dark:text-gray-400">{currencySymbol}{Number(item.unit_price || 0).toFixed(2)}</td>
                                      <td className="py-2 font-medium text-orange-600 dark:text-orange-400">{currencySymbol}{Number(item.line_total || 0).toFixed(2)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              {vc.notes && (
                                <div className="mt-2 p-2 bg-gray-50 dark:bg-slate-800 rounded text-xs text-gray-500 dark:text-gray-400">
                                  <span className="font-medium">{appLang === 'en' ? 'Note:' : 'ملاحظة:'}</span> {vc.notes}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}

                      {/* إجمالي المرتجعات */}
                      {(vendorCredits.length > 0 || ((bill as any).return_status === 'partial' || (bill as any).return_status === 'full' || Number((bill as any).returned_amount || 0) > 0)) && (
                        <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded-lg flex justify-between items-center">
                          <span className="font-semibold text-gray-700 dark:text-gray-300">{appLang === 'en' ? 'Total Returns' : 'إجمالي المرتجعات'}</span>
                          <span className="font-bold text-orange-600 dark:text-orange-400">{currencySymbol}{(Number((bill as any).returned_amount || 0) + vendorCredits.reduce((sum, vc) => sum + Number(vc.total_amount || 0), 0)).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            </div>
            {/* ==================== نهاية قسم العمليات ==================== */}
          </div>
        )}
      </main>

      {/* Purchase Return Dialog */}
      <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {returnType === 'full'
                ? (appLang === 'en' ? 'Full Purchase Return' : 'مرتجع مشتريات كامل')
                : (appLang === 'en' ? 'Partial Purchase Return' : 'مرتجع مشتريات جزئي')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Bill Financial Summary */}
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm space-y-2">
              <div className="flex justify-between items-center">
                <div>
                  <span className="font-semibold text-lg">{appLang === 'en' ? 'Bill' : 'الفاتورة'}: {bill?.bill_number}</span>
                  <p className="text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Supplier' : 'المورد'}: {supplier?.name}</p>
                </div>
                <span className={`px-2 py-1 rounded text-xs font-medium ${returnBillData.paymentStatus === 'paid' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                  returnBillData.paymentStatus === 'partial' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                    'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                  }`}>
                  {returnBillData.paymentStatus === 'paid' ? (appLang === 'en' ? 'Fully Paid' : 'مدفوعة بالكامل') :
                    returnBillData.paymentStatus === 'partial' ? (appLang === 'en' ? 'Partially Paid' : 'مدفوعة جزئياً') :
                      (appLang === 'en' ? 'Unpaid' : 'غير مدفوعة')}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 pt-3 border-t border-blue-200 dark:border-blue-700">
                <div>
                  <p className="text-gray-500 dark:text-gray-400 text-xs">{appLang === 'en' ? 'Original Total' : 'الإجمالي الأصلي'}</p>
                  <p className="font-semibold">{returnBillData.originalTotal.toFixed(2)} {returnBillData.billCurrency}</p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400 text-xs">{appLang === 'en' ? 'Paid Amount' : 'المبلغ المدفوع'}</p>
                  <p className="font-semibold text-green-600">{returnBillData.paidAmount.toFixed(2)} {returnBillData.billCurrency}</p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400 text-xs">{appLang === 'en' ? 'Remaining' : 'المتبقي'}</p>
                  <p className="font-semibold text-red-600">{returnBillData.remainingAmount.toFixed(2)} {returnBillData.billCurrency}</p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400 text-xs">{appLang === 'en' ? 'Previously Returned' : 'مرتجع سابق'}</p>
                  <p className="font-semibold text-orange-600">{returnBillData.previouslyReturned.toFixed(2)} {returnBillData.billCurrency}</p>
                </div>
              </div>
            </div>

            {/* Items to return */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-600 dark:text-gray-400 border-b">
                    <th className="text-right p-2">{appLang === 'en' ? 'Product' : 'المنتج'}</th>
                    <th className="text-right p-2">{appLang === 'en' ? 'Available' : 'المتاح'}</th>
                    <th className="text-right p-2">{appLang === 'en' ? 'Return Qty' : 'كمية المرتجع'}</th>
                    <th className="text-right p-2">{appLang === 'en' ? 'Unit Price' : 'سعر الوحدة'}</th>
                    <th className="text-right p-2">{appLang === 'en' ? 'Total' : 'الإجمالي'}</th>
                  </tr>
                </thead>
                <tbody>
                  {returnItems.map((it, idx) => (
                    <tr key={it.item_id} className="border-b">
                      <td className="p-2">{it.product_name}</td>
                      <td className="p-2 text-center">{it.max_qty}</td>
                      <td className="p-2">
                        <NumericInput
                          min={0}
                          max={it.max_qty}
                          value={it.return_qty}
                          onChange={(val) => {
                            const v = Math.min(Math.max(Math.round(val), 0), it.max_qty)
                            setReturnItems(prev => {
                              const next = [...prev]
                              next[idx] = { ...next[idx], return_qty: v }
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
                {appLang === 'en' ? 'Return Total' : 'إجمالي المرتجع'}: {returnTotal.toFixed(2)} {returnCurrency}
              </div>
            </div>

            {/* Currency selector */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{appLang === 'en' ? 'Currency' : 'العملة'}</Label>
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
                <Label>{appLang === 'en' ? 'Refund Method' : 'طريقة الاسترداد'}</Label>
                <Select value={returnMethod} onValueChange={(v: 'cash' | 'bank' | 'credit') => setReturnMethod(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">{appLang === 'en' ? 'Cash Refund' : 'استرداد نقدي'}</SelectItem>
                    <SelectItem value="bank">{appLang === 'en' ? 'Bank Refund' : 'استرداد بنكي'}</SelectItem>
                    <SelectItem value="credit">{appLang === 'en' ? 'Credit to Supplier Account' : 'رصيد على حساب المورد'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {returnMethod !== 'credit' && (
                <div className="space-y-2">
                  <Label>{appLang === 'en' ? 'Refund Account' : 'حساب الاسترداد'}</Label>
                  <Select value={returnAccountId} onValueChange={setReturnAccountId}>
                    <SelectTrigger><SelectValue placeholder={appLang === 'en' ? 'Auto-select' : 'اختيار تلقائي'} /></SelectTrigger>
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
                <div>{appLang === 'en' ? 'Exchange Rate' : 'سعر الصرف'}: <strong>1 {returnCurrency} = {returnExRate.rate.toFixed(4)} {appCurrency}</strong> ({returnExRate.source})</div>
                <div>{appLang === 'en' ? 'Base Amount' : 'المبلغ الأساسي'}: <strong>{(returnTotal * returnExRate.rate).toFixed(2)} {appCurrency}</strong></div>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <Label>{appLang === 'en' ? 'Notes' : 'ملاحظات'}</Label>
              <Input
                value={returnNotes}
                onChange={(e) => setReturnNotes(e.target.value)}
                placeholder={appLang === 'en' ? 'Optional notes for return' : 'ملاحظات اختيارية للمرتجع'}
              />
            </div>

            {/* Info about refund method */}
            <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded text-sm text-yellow-800 dark:text-yellow-200">
              {returnMethod === 'cash' && (appLang === 'en' ? '💰 Cash will be returned to the cash account' : '💰 سيتم إرجاع المبلغ إلى حساب النقد')}
              {returnMethod === 'bank' && (appLang === 'en' ? '🏦 Amount will be returned to the bank account' : '🏦 سيتم إرجاع المبلغ إلى الحساب البنكي')}
              {returnMethod === 'credit' && (appLang === 'en' ? '📝 Amount will reduce your payable to the supplier' : '📝 سيتم تخفيض المبلغ المستحق للمورد')}
            </div>

            {/* Post-return preview */}
            {returnTotal > 0 && (
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg text-sm border border-green-200 dark:border-green-700">
                <h4 className="font-semibold text-green-800 dark:text-green-200 mb-2">
                  {appLang === 'en' ? '📊 After Return Preview' : '📊 معاينة ما بعد المرتجع'}
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div>
                    <p className="text-gray-500 dark:text-gray-400 text-xs">{appLang === 'en' ? 'New Bill Total' : 'الإجمالي الجديد'}</p>
                    <p className="font-semibold">{Math.max(0, (returnBillData.originalTotal - returnBillData.previouslyReturned) - returnTotal).toFixed(2)} {returnBillData.billCurrency}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-gray-400 text-xs">{appLang === 'en' ? 'Total Returned' : 'إجمالي المرتجع'}</p>
                    <p className="font-semibold text-orange-600">{(returnBillData.previouslyReturned + returnTotal).toFixed(2)} {returnBillData.billCurrency}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-gray-400 text-xs">{appLang === 'en' ? 'Expected Status' : 'الحالة المتوقعة'}</p>
                    <p className={`font-semibold ${(returnBillData.originalTotal - returnBillData.previouslyReturned - returnTotal) <= 0 ? 'text-purple-600' :
                      returnBillData.paymentStatus === 'paid' ? 'text-green-600' :
                        returnBillData.paidAmount > 0 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                      {(returnBillData.originalTotal - returnBillData.previouslyReturned - returnTotal) <= 0
                        ? (appLang === 'en' ? 'Fully Returned' : 'مرتجع بالكامل')
                        : returnBillData.paymentStatus === 'paid'
                          ? (appLang === 'en' ? 'Paid' : 'مدفوعة')
                          : returnBillData.paidAmount >= Math.max(0, (returnBillData.originalTotal - returnBillData.previouslyReturned) - returnTotal)
                            ? (appLang === 'en' ? 'Paid' : 'مدفوعة')
                            : returnBillData.paidAmount > 0
                              ? (appLang === 'en' ? 'Partially Paid' : 'مدفوعة جزئياً')
                              : (appLang === 'en' ? 'Unpaid' : 'غير مدفوعة')}
                    </p>
                  </div>
                </div>
                {/* Show expected refund for paid bills with cash/bank */}
                {returnMethod !== 'credit' && returnBillData.paymentStatus !== 'unpaid' && (
                  <div className="mt-3 pt-3 border-t border-green-200 dark:border-green-700">
                    <p className="text-gray-600 dark:text-gray-300">
                      💵 {appLang === 'en' ? 'Expected Refund Amount' : 'المبلغ المتوقع استرداده'}: <strong className="text-green-700 dark:text-green-300">{Math.min(returnTotal, returnBillData.paidAmount).toFixed(2)} {returnBillData.billCurrency}</strong>
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Accounting entries preview */}
            {returnTotal > 0 && (
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded text-xs border">
                <h5 className="font-semibold mb-2">{appLang === 'en' ? '📝 Journal Entries to be Created' : '📝 القيود المحاسبية التي سيتم إنشاؤها'}</h5>
                <div className="space-y-1 text-gray-600 dark:text-gray-300">
                  <p>1️⃣ {appLang === 'en' ? 'Purchase Return Entry:' : 'قيد مرتجع المشتريات:'}</p>
                  <p className="ms-4">• {appLang === 'en' ? 'Debit: Accounts Payable (Supplier)' : 'مدين: الذمم الدائنة (المورد)'} - {returnTotal.toFixed(2)}</p>
                  <p className="ms-4">• {appLang === 'en' ? 'Credit: Inventory' : 'دائن: المخزون'} - {returnTotal.toFixed(2)}</p>
                  {returnMethod !== 'credit' && returnBillData.paymentStatus !== 'unpaid' && (
                    <>
                      <p className="mt-2">2️⃣ {appLang === 'en' ? 'Refund Entry:' : 'قيد الاسترداد:'}</p>
                      <p className="ms-4">• {appLang === 'en' ? 'Debit:' : 'مدين:'} {returnMethod === 'cash' ? (appLang === 'en' ? 'Cash' : 'الخزينة') : (appLang === 'en' ? 'Bank' : 'البنك')} - {Math.min(returnTotal, returnBillData.paidAmount).toFixed(2)}</p>
                      <p className="ms-4">• {appLang === 'en' ? 'Credit: Accounts Payable' : 'دائن: الذمم الدائنة'} - {Math.min(returnTotal, returnBillData.paidAmount).toFixed(2)}</p>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReturnOpen(false)} disabled={returnProcessing}>
              {appLang === 'en' ? 'Cancel' : 'إلغاء'}
            </Button>
            <Button
              onClick={processPurchaseReturn}
              disabled={returnProcessing || returnTotal <= 0}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {returnProcessing ? '...' : (appLang === 'en' ? 'Process Return' : 'تنفيذ المرتجع')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
