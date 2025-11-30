"use client"

import { useEffect, useMemo, useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { useSupabase } from "@/lib/supabase/hooks"
import Link from "next/link"
import { useToast } from "@/hooks/use-toast"
import { toastActionError, toastActionSuccess } from "@/lib/notifications"
import { CreditCard } from "lucide-react"

interface Customer { id: string; name: string }
interface Supplier { id: string; name: string }
interface Payment { id: string; customer_id?: string; supplier_id?: string; invoice_id?: string | null; purchase_order_id?: string | null; bill_id?: string | null; payment_date: string; amount: number; payment_method?: string; reference_number?: string; notes?: string; account_id?: string | null; display_currency?: string; display_amount?: number }
interface InvoiceRow { id: string; invoice_number: string; invoice_date?: string; total_amount: number; paid_amount: number; status: string }
interface PORow { id: string; po_number: string; total_amount: number; received_amount: number; status: string }
interface BillRow { id: string; bill_number: string; bill_date?: string; total_amount: number; paid_amount: number; status: string }
interface Account { id: string; account_code: string; account_name: string; account_type: string }

export default function PaymentsPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const appLang = typeof window !== 'undefined' ? ((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') : 'ar'
  const [online, setOnline] = useState<boolean>(typeof window !== "undefined" ? navigator.onLine : true)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [customerPayments, setCustomerPayments] = useState<Payment[]>([])
  const [supplierPayments, setSupplierPayments] = useState<Payment[]>([])
  const [invoiceNumbers, setInvoiceNumbers] = useState<Record<string, string>>({})
  const [billNumbers, setBillNumbers] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  // Currency support
  const [paymentCurrency, setPaymentCurrency] = useState<string>(() => {
    if (typeof window === 'undefined') return 'EGP'
    try { return localStorage.getItem('app_currency') || 'EGP' } catch { return 'EGP' }
  })
  const [baseCurrency] = useState<string>(() => {
    if (typeof window === 'undefined') return 'EGP'
    try { return localStorage.getItem('app_currency') || 'EGP' } catch { return 'EGP' }
  })
  const [exchangeRate, setExchangeRate] = useState<number>(1)
  const [fetchingRate, setFetchingRate] = useState<boolean>(false)

  const currencySymbols: Record<string, string> = {
    EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ',
    KWD: 'د.ك', QAR: '﷼', BHD: 'د.ب', OMR: '﷼', JOD: 'د.أ', LBP: 'ل.ل'
  }
  const currencySymbol = currencySymbols[paymentCurrency] || paymentCurrency

  // Helper: Get display amount (use converted if available)
  const getDisplayAmount = (payment: Payment): number => {
    if (payment.display_currency === paymentCurrency && payment.display_amount != null) {
      return payment.display_amount
    }
    return payment.amount
  }

  // New payment form states
  const [newCustPayment, setNewCustPayment] = useState({ customer_id: "", amount: 0, date: new Date().toISOString().slice(0, 10), method: "cash", ref: "", notes: "", account_id: "" })
  const [newSuppPayment, setNewSuppPayment] = useState({ supplier_id: "", amount: 0, date: new Date().toISOString().slice(0, 10), method: "cash", ref: "", notes: "", account_id: "" })
  const [customerQuery, setCustomerQuery] = useState("")
  const [supplierQuery, setSupplierQuery] = useState("")
  // متغيرات اختيارية كانت مستخدمة ضمن ربط تلقائي للدفع بالفواتير
  const [selectedFormBillId, setSelectedFormBillId] = useState<string>("")
  const [selectedFormInvoiceId, setSelectedFormInvoiceId] = useState<string>("")
  const [newSuppAccountType, setNewSuppAccountType] = useState<string>("")
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

  // Edit/Delete dialogs
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null)
  const [deletingPayment, setDeletingPayment] = useState<Payment | null>(null)
  const [editFields, setEditFields] = useState({ payment_date: "", payment_method: "", reference_number: "", notes: "", account_id: "" })

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

  useEffect(() => {
    ;(async () => {
      try {
        setLoading(true)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data: company } = await supabase.from("companies").select("id").eq("user_id", user.id).single()
        if (!company) return
        const { data: custs, error: custsErr } = await supabase.from("customers").select("id, name").eq("company_id", company.id)
        if (custsErr) {
          toastActionError(toast, "الجلب", "العملاء", "تعذر جلب قائمة العملاء")
        }
        setCustomers(custs || [])
        const { data: supps, error: suppsErr } = await supabase.from("suppliers").select("id, name").eq("company_id", company.id)
        if (suppsErr) {
          toastActionError(toast, "الجلب", "الموردين", "تعذر جلب قائمة الموردين")
        }
        setSuppliers(supps || [])
        const { data: accs, error: accsErr } = await supabase
          .from("chart_of_accounts")
          .select("id, account_code, account_name, account_type")
          .eq("company_id", company.id)
        if (accsErr) {
          toastActionError(toast, "الجلب", "شجرة الحسابات", "تعذر جلب الحسابات")
        }
        // نرشّح الحسابات ذات النوع أصل (مثل النقد والبنك)
        setAccounts((accs || []).filter((a: any) => (a.account_type || "").toLowerCase() === "asset"))

      const { data: custPays, error: custPaysErr } = await supabase
        .from("payments")
        .select("*")
        .eq("company_id", company.id)
        .not("customer_id", "is", null)
        .order("payment_date", { ascending: false })
      if (custPaysErr) {
        toastActionError(toast, "الجلب", "مدفوعات العملاء", "تعذر جلب مدفوعات العملاء")
      }
      setCustomerPayments(custPays || [])

      const { data: suppPays, error: suppPaysErr } = await supabase
        .from("payments")
        .select("*")
        .eq("company_id", company.id)
        .not("supplier_id", "is", null)
        .order("payment_date", { ascending: false })
      if (suppPaysErr) {
        toastActionError(toast, "الجلب", "مدفوعات الموردين", "تعذر جلب مدفوعات الموردين")
      }
      setSupplierPayments(suppPays || [])
    } finally {
      setLoading(false)
    }
  })()
}, [])

  // Load invoice numbers for displayed customer payments
  useEffect(() => {
    ;(async () => {
      try {
        const ids = Array.from(new Set((customerPayments || []).map((p) => p.invoice_id).filter(Boolean))) as string[]
        if (!ids.length) { setInvoiceNumbers({}); return }
        const { data: invs } = await supabase.from("invoices").select("id, invoice_number").in("id", ids)
        const map: Record<string, string> = {}
        ;(invs || []).forEach((r: any) => { map[r.id] = r.invoice_number })
        setInvoiceNumbers(map)
      } catch (e) { /* ignore */ }
    })()
  }, [customerPayments])

  // Load bill numbers for displayed supplier payments
  useEffect(() => {
    ;(async () => {
      try {
        const ids = Array.from(new Set((supplierPayments || []).map((p) => p.bill_id).filter(Boolean))) as string[]
        if (!ids.length) { setBillNumbers({}); return }
        const { data: bills } = await supabase.from("bills").select("id, bill_number").in("id", ids)
        const map: Record<string, string> = {}
        ;(bills || []).forEach((r: any) => { map[r.id] = r.bill_number })
        setBillNumbers(map)
      } catch (e) { /* ignore */ }
    })()
  }, [supplierPayments])

  // جلب فواتير العميل غير المسددة بالكامل عند اختيار عميل في نموذج إنشاء دفعة
  useEffect(() => {
    ;(async () => {
      try {
        setSelectedFormInvoiceId("")
        if (!newCustPayment.customer_id) { setFormCustomerInvoices([]); return }
        const { data: invs } = await supabase
          .from("invoices")
          .select("id, invoice_number, invoice_date, total_amount, paid_amount, status")
          .eq("customer_id", newCustPayment.customer_id)
          .in("status", ["sent", "partially_paid"]) // غير مسددة بالكامل
          .order("invoice_date", { ascending: false })
        setFormCustomerInvoices(invs || [])
      } catch (e) { /* ignore */ }
    })()
  }, [newCustPayment.customer_id])

  // جلب فواتير المورد غير المسددة بالكامل عند اختيار مورد في نموذج إنشاء دفعة
  useEffect(() => {
    ;(async () => {
      try {
        setSelectedFormBillId("")
        if (!newSuppPayment.supplier_id) { setFormSupplierBills([]); return }
        const { data: bills } = await supabase
          .from("bills")
          .select("id, bill_number, bill_date, total_amount, paid_amount, status")
          .eq("supplier_id", newSuppPayment.supplier_id)
          .in("status", ["draft", "sent", "partially_paid"]) // قابلة للدفع
          .order("bill_date", { ascending: false })
        setFormSupplierBills(bills || [])
      } catch (e) { /* ignore */ }
    })()
  }, [newSuppPayment.supplier_id])

  const createCustomerPayment = async () => {
    try {
      setSaving(true)
      if (!newCustPayment.customer_id || newCustPayment.amount <= 0) return
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: company } = await supabase.from("companies").select("id").eq("user_id", user.id).single()
      if (!company) return
      // Attempt insert including account_id; fallback if column not exists
      const basePayload: any = {
        company_id: company.id,
        customer_id: newCustPayment.customer_id,
        payment_date: newCustPayment.date,
        amount: newCustPayment.amount,
        payment_method: newCustPayment.method,
        reference_number: newCustPayment.ref || null,
        notes: newCustPayment.notes || null,
        account_id: newCustPayment.account_id || null,
        // Multi-currency support
        currency_code: paymentCurrency,
        exchange_rate: exchangeRate,
        base_currency_amount: paymentCurrency !== baseCurrency ? newCustPayment.amount * exchangeRate : null,
      }
      let insertErr: any = null
      {
        const { error } = await supabase.from("payments").insert(basePayload)
        insertErr = error || null
      }
      if (insertErr) {
        const msg = String(insertErr?.message || insertErr || "")
        const mentionsAccountId = msg.toLowerCase().includes("account_id")
        const looksMissingColumn = mentionsAccountId && (
          msg.toLowerCase().includes("does not exist") ||
          msg.toLowerCase().includes("not found") ||
          msg.toLowerCase().includes("schema cache") ||
          msg.toLowerCase().includes("column")
        )
        if (looksMissingColumn || mentionsAccountId) {
          console.warn("payments.insert fallback: removing account_id due to schema mismatch:", msg)
          const fallbackPayload = { ...basePayload }
          delete fallbackPayload.account_id
          const { error: retryError } = await supabase.from("payments").insert(fallbackPayload)
          if (retryError) throw retryError
        } else {
          throw insertErr
        }
      }

      // Journal: treat as customer advance if not linked to invoice yet
      const mapping = await findAccountIds()
      if (mapping) {
        const cashAccountId = newCustPayment.account_id || mapping.cash || mapping.bank
        const advanceId = mapping.customerAdvance
        if (cashAccountId && advanceId) {
          const { data: entry } = await supabase
            .from("journal_entries").insert({
              company_id: mapping.companyId,
              reference_type: "customer_payment",
              reference_id: null,
              entry_date: newCustPayment.date,
              description: `سداد عميل كسلفة(${newCustPayment.method})`,
            }).select().single()
          if (entry?.id) {
            await supabase.from("journal_entry_lines").insert([
              { journal_entry_id: entry.id, account_id: cashAccountId, debit_amount: newCustPayment.amount, credit_amount: 0, description: "نقد/بنك" },
              { journal_entry_id: entry.id, account_id: advanceId, debit_amount: 0, credit_amount: newCustPayment.amount, description: "سلف من العملاء" },
            ])
          }
        }
      }
      setNewCustPayment({ customer_id: "", amount: 0, date: newCustPayment.date, method: "cash", ref: "", notes: "", account_id: "" })
      toastActionSuccess(toast, "الإنشاء", "الدفعة")
      // reload list
      const { data: custPays } = await supabase
        .from("payments").select("*")
        .eq("company_id", company.id)
        .not("customer_id", "is", null)
        .order("payment_date", { ascending: false })
      setCustomerPayments(custPays || [])
      // إذا اختار المستخدم فاتورة من الجدول في النموذج: اربط أحدث دفعة عميل بهذه الفاتورة مباشرة
      if (selectedFormInvoiceId && custPays && custPays.length > 0) {
        const latest = custPays.find((p: any) => p.customer_id === newCustPayment.customer_id && !p.invoice_id) || custPays[0]
        try {
          await applyPaymentToInvoiceWithOverrides(latest as any, selectedFormInvoiceId, Number(latest?.amount || newCustPayment.amount || 0))
        } catch (linkErr) {
          console.error("Error auto-linking payment to invoice:", linkErr)
        }
      }
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
      if (!newSuppPayment.supplier_id || newSuppPayment.amount <= 0) return
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: company } = await supabase.from("companies").select("id").eq("user_id", user.id).single()
      if (!company) return
      // Validate selected cash/bank account belongs to company and exists
      if (newSuppPayment.account_id) {
        const { data: acct, error: acctErr } = await supabase
          .from("chart_of_accounts")
          .select("id, company_id")
          .eq("id", newSuppPayment.account_id)
          .eq("company_id", company.id)
          .single()
        if (acctErr || !acct) {
          toastActionError(toast, "التحقق", "الحساب", "الحساب المختار غير موجود أو لا يتبع الشركة")
          return
        }
      }
      // Attempt insert including account_id; fallback if column not exists
      const basePayload: any = {
        company_id: company.id,
        supplier_id: newSuppPayment.supplier_id,
        payment_date: newSuppPayment.date,
        amount: newSuppPayment.amount,
        payment_method: newSuppPayment.method,
        reference_number: newSuppPayment.ref || null,
        notes: newSuppPayment.notes || null,
        account_id: newSuppPayment.account_id || null,
        // Multi-currency support
        currency_code: paymentCurrency,
        exchange_rate: exchangeRate,
        base_currency_amount: paymentCurrency !== baseCurrency ? newSuppPayment.amount * exchangeRate : null,
      }
      let insertErr: any = null
      let insertedPayment: any = null
      {
        const { data, error } = await supabase
          .from("payments")
          .insert(basePayload)
          .select()
          .single()
        insertErr = error || null
        insertedPayment = data || null
      }
      if (insertErr) {
        const msg = String(insertErr?.message || insertErr || "")
        if (msg.includes('column "account_id" does not exist') || msg.toLowerCase().includes("account_id") && msg.toLowerCase().includes("does not exist")) {
          const fallbackPayload = { ...basePayload }
          delete fallbackPayload.account_id
          const { error: retryError } = await supabase
            .from("payments")
            .insert(fallbackPayload)
            .select()
            .single()
          if (retryError) throw retryError
        } else {
          throw insertErr
        }
      }

      // Journal: treat as supplier advance (prepayment)
      const mapping = await findAccountIds()
      if (mapping) {
        const cashAccountId = newSuppPayment.account_id || mapping.cash || mapping.bank
        const advanceId = mapping.supplierAdvance
        if (cashAccountId && advanceId) {
          const { data: entry } = await supabase
            .from("journal_entries").insert({
              company_id: mapping.companyId,
              reference_type: "supplier_payment",
              reference_id: null,
              entry_date: newSuppPayment.date,
              description: `سداد مورّد كسلفة(${newSuppPayment.method})`,
            }).select().single()
          if (entry?.id) {
            const { error: linesErr } = await supabase.from("journal_entry_lines").insert([
              { journal_entry_id: entry.id, account_id: advanceId, debit_amount: newSuppPayment.amount, credit_amount: 0, description: "سلف للموردين" },
              { journal_entry_id: entry.id, account_id: cashAccountId, debit_amount: 0, credit_amount: newSuppPayment.amount, description: "نقد/بنك" },
            ])
            if (linesErr) throw linesErr
          }
        }
      }
      setNewSuppPayment({ supplier_id: "", amount: 0, date: newSuppPayment.date, method: "cash", ref: "", notes: "", account_id: "" })
      const { data: suppPays } = await supabase
        .from("payments").select("*")
        .eq("company_id", company.id)
        .not("supplier_id", "is", null)
        .order("payment_date", { ascending: false })
      setSupplierPayments(suppPays || [])
      // If a bill was selected in the form, link the latest supplier payment to that bill immediately
      if (selectedFormBillId && suppPays && suppPays.length > 0) {
        const latest = suppPays.find((p: any) => p.supplier_id === newSuppPayment.supplier_id && !p.bill_id) || suppPays[0]
        try {
          await applyPaymentToBillWithOverrides(latest as any, selectedFormBillId, Number(latest?.amount || newSuppPayment.amount || 0), newSuppAccountType)
        } catch (linkErr) {
          console.error("Error auto-linking payment to bill:", linkErr)
        }
      }
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

  const findAccountIds = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data: company } = await supabase.from("companies").select("id").eq("user_id", user.id).single()
    if (!company) return null
    const { data: accounts } = await supabase
      .from("chart_of_accounts")
      .select("id, account_code, account_type, account_name, sub_type")
      .eq("company_id", company.id)
    if (!accounts) return null
    const byCode = (code: string) => accounts.find((a: any) => String(a.account_code || "").toUpperCase() === code)?.id
    const byType = (type: string) => accounts.find((a: any) => a.account_type === type)?.id
    const byNameIncludes = (name: string) => accounts.find((a: any) => (a.account_name || "").toLowerCase().includes(name.toLowerCase()))?.id
    const bySubType = (st: string) => accounts.find((a: any) => String(a.sub_type || "").toLowerCase() === st.toLowerCase())?.id

    const ar = bySubType("accounts_receivable") || byCode("AR") || byNameIncludes("receivable") || byType("asset")
    const ap = bySubType("accounts_payable") || byCode("AP") || byNameIncludes("payable") || byType("liability")
    const cash = bySubType("cash") || byCode("CASH") || byNameIncludes("cash") || byType("asset")
    const bank = bySubType("bank") || byNameIncludes("bank") || byType("asset")
    // حساب "سلف للموردين"
    const supplierAdvance =
      bySubType("supplier_advance") ||
      byCode("1400") ||
      byNameIncludes("supplier advance") ||
      byNameIncludes("advance to suppliers") ||
      byNameIncludes("advances") ||
      byNameIncludes("prepaid to suppliers") ||
      byNameIncludes("prepayment") ||
      byType("asset")
    // حساب "سلف من العملاء" (التزامات)
    const customerAdvance =
      bySubType("customer_advance") ||
      byCode("1500") ||
      byNameIncludes("customer advance") ||
      byNameIncludes("advance from customers") ||
      byNameIncludes("deposit") ||
      byType("liability")

    return { companyId: company.id, ar, ap, cash, bank, supplierAdvance, customerAdvance }
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
      .select("id, bill_number, total_amount, paid_amount, status")
      .eq("supplier_id", p.supplier_id)
      .in("status", ["draft", "sent", "partially_paid"]) // قابلة للدفع
      .order("bill_date", { ascending: false })
    setSupplierBills(bills || [])
    setApplyBillOpen(true)
  }

  // تنفيذ ربط دفع عميل بفاتورة عميل باستخدام معطيات محددة دون الاعتماد على حالة الواجهة
  const applyPaymentToInvoiceWithOverrides = async (payment: Payment, invoiceId: string, rawAmount: number) => {
    try {
      if (!payment || !invoiceId || rawAmount <= 0) return
      setSaving(true)
      const mapping = await findAccountIds()
      if (!mapping || !mapping.ar) return
      const { data: inv } = await supabase.from("invoices").select("*").eq("id", invoiceId).single()
      if (!inv) return
      const remaining = Math.max(Number(inv.total_amount || 0) - Number(inv.paid_amount || 0), 0)
      const amount = Math.min(rawAmount, remaining)

      // تحديث الفاتورة
      const newPaid = Number(inv.paid_amount || 0) + amount
      const newStatus = newPaid >= Number(inv.total_amount || 0) ? "paid" : "partially_paid"
      const { error: invErr } = await supabase.from("invoices").update({ paid_amount: newPaid, status: newStatus }).eq("id", inv.id)
      if (invErr) throw invErr

      // ربط الدفعة
      const { error: payErr } = await supabase.from("payments").update({ invoice_id: inv.id }).eq("id", payment.id)
      if (payErr) throw payErr

      // قيد محاسبي لتسوية السلفة -> الذمم المدينة
      const { data: entry, error: entryErr } = await supabase
        .from("journal_entries").insert({
          company_id: mapping.companyId,
          reference_type: "invoice_payment",
          reference_id: inv.id,
          entry_date: payment.payment_date,
          description: `دفعة مرتبطة بفاتورة ${inv.invoice_number}`,
        }).select().single()
      if (entryErr) throw entryErr
      const settleAdvId = mapping.customerAdvance
      const { error: linesErr } = await supabase.from("journal_entry_lines").insert([
        { journal_entry_id: entry.id, account_id: settleAdvId || mapping.cash, debit_amount: amount, credit_amount: 0, description: settleAdvId ? "تسوية سلف العملاء" : "نقد/بنك" },
        { journal_entry_id: entry.id, account_id: mapping.ar, debit_amount: 0, credit_amount: amount, description: "ذمم مدينة" },
      ])
      if (linesErr) throw linesErr

      await supabase.from("advance_applications").insert({
        company_id: mapping.companyId,
        customer_id: payment.customer_id || null,
        supplier_id: null,
        payment_id: payment.id,
        invoice_id: inv.id,
        bill_id: null,
        amount_applied: amount,
        applied_date: payment.payment_date,
        notes: "تطبيق سلفة عميل على فاتورة",
      })

      const { data: custPays } = await supabase
        .from("payments").select("*")
        .eq("company_id", mapping.companyId)
        .not("customer_id", "is", null)
        .order("payment_date", { ascending: false })
      setCustomerPayments(custPays || [])
    } catch (err) {
      console.error("Error applying payment to invoice (overrides):", err)
    } finally {
      setSaving(false)
    }
  }

  const applyPaymentToInvoice = async () => {
    try {
      if (!selectedPayment || !applyDocId || applyAmount <= 0) return
      setSaving(true)
      const mapping = await findAccountIds()
      if (!mapping || !mapping.ar) return
      // Load invoice to compute remaining
      const { data: inv } = await supabase.from("invoices").select("*").eq("id", applyDocId).single()
      if (!inv) return
      const remaining = Math.max(Number(inv.total_amount || 0) - Number(inv.paid_amount || 0), 0)
      const amount = Math.min(applyAmount, remaining)

      // Update invoice
      const newPaid = Number(inv.paid_amount || 0) + amount
      const newStatus = newPaid >= Number(inv.total_amount || 0) ? "paid" : "partially_paid"
      const { error: invErr } = await supabase.from("invoices").update({ paid_amount: newPaid, status: newStatus }).eq("id", inv.id)
      if (invErr) throw invErr

      // Update payment to link invoice
      const { error: payErr } = await supabase.from("payments").update({ invoice_id: inv.id }).eq("id", selectedPayment.id)
      if (payErr) throw payErr

      // Post journal: settle customer advance -> AR (do not touch cash here)
      const { data: entry, error: entryErr } = await supabase
        .from("journal_entries").insert({
          company_id: mapping.companyId,
          reference_type: "invoice_payment",
          reference_id: inv.id,
          entry_date: selectedPayment.payment_date,
          description: `دفعة مرتبطة بفاتورة ${inv.invoice_number}`,
        }).select().single()
      if (entryErr) throw entryErr
      const settleAdvId = mapping.customerAdvance
      const { error: linesErr } = await supabase.from("journal_entry_lines").insert([
        { journal_entry_id: entry.id, account_id: settleAdvId || mapping.cash, debit_amount: amount, credit_amount: 0, description: settleAdvId ? "تسوية سلف العملاء" : "نقد/بنك" },
        { journal_entry_id: entry.id, account_id: mapping.ar, debit_amount: 0, credit_amount: amount, description: "ذمم مدينة" },
      ])
      if (linesErr) throw linesErr

      toastActionSuccess(toast, "التحديث", "الفاتورة")

      // Link advance application record
      await supabase.from("advance_applications").insert({
        company_id: mapping.companyId,
        customer_id: selectedPayment.customer_id || null,
        supplier_id: null,
        payment_id: selectedPayment.id,
        invoice_id: inv.id,
        bill_id: null,
        amount_applied: amount,
        applied_date: selectedPayment.payment_date,
        notes: "تطبيق سلفة عميل على فاتورة",
      })

      // refresh lists
      setApplyInvoiceOpen(false)
      setSelectedPayment(null)
      const { data: custPays } = await supabase
        .from("payments").select("*")
        .eq("company_id", mapping.companyId)
        .not("customer_id", "is", null)
        .order("payment_date", { ascending: false })
      setCustomerPayments(custPays || [])
    } catch (err) {
      console.error("Error applying payment to invoice:", err)
      toastActionError(toast, "التحديث", "الفاتورة", "فشل تطبيق الدفعة على الفاتورة")
    } finally {
      setSaving(false)
    }
  }

  const applyPaymentToPO = async () => {
    try {
      if (!selectedPayment || !applyDocId || applyAmount <= 0) return
      setSaving(true)
      const mapping = await findAccountIds()
      if (!mapping || !mapping.supplierAdvance || !mapping.cash) return
      const { data: po } = await supabase.from("purchase_orders").select("*").eq("id", applyDocId).single()
      if (!po) return
      const remaining = Math.max(Number(po.total_amount || 0) - Number(po.received_amount || 0), 0)
      const amount = Math.min(applyAmount, remaining)

      // Update PO
      const newReceived = Number(po.received_amount || 0) + amount
      const newStatus = newReceived >= Number(po.total_amount || 0) ? "received" : "received_partial"
      const { error: poErr } = await supabase.from("purchase_orders").update({ received_amount: newReceived, status: newStatus }).eq("id", po.id)
      if (poErr) throw poErr

      // Link payment
      const { error: payErr } = await supabase.from("payments").update({ purchase_order_id: po.id }).eq("id", selectedPayment.id)
      if (payErr) throw payErr

      // Post journal
      const cashAccountId = selectedPayment?.account_id || mapping.cash
      const { data: entry, error: entryErr } = await supabase
        .from("journal_entries").insert({
          company_id: mapping.companyId,
          reference_type: "po_payment",
          reference_id: po.id,
          entry_date: selectedPayment.payment_date,
          description: `سداد مرتبط بأمر شراء ${po.po_number}`,
        }).select().single()
      if (entryErr) throw entryErr
      const { error: linesErr } = await supabase.from("journal_entry_lines").insert([
        { journal_entry_id: entry.id, account_id: mapping.supplierAdvance, debit_amount: amount, credit_amount: 0, description: "سلف للموردين" },
        { journal_entry_id: entry.id, account_id: cashAccountId, debit_amount: 0, credit_amount: amount, description: "نقد/بنك" },
      ])
      if (linesErr) throw linesErr

      toastActionSuccess(toast, "التحديث", "أمر الشراء")

      setApplyPoOpen(false)
      setSelectedPayment(null)
      const { data: suppPays } = await supabase
        .from("payments").select("*")
        .eq("company_id", mapping.companyId)
        .not("supplier_id", "is", null)
        .order("payment_date", { ascending: false })
      setSupplierPayments(suppPays || [])
    } catch (err) {
      console.error("Error applying payment to PO:", err)
      toastActionError(toast, "التحديث", "أمر الشراء", "فشل تطبيق الدفعة على أمر الشراء")
    } finally {
      setSaving(false)
    }
  }

  const applyPaymentToBill = async () => {
    try {
      if (!selectedPayment || !applyDocId || applyAmount <= 0) return
      setSaving(true)
      const mapping = await findAccountIds()
      if (!mapping || !mapping.ap) return
      const { data: bill } = await supabase.from("bills").select("*").eq("id", applyDocId).single()
      if (!bill) return
      const remaining = Math.max(Number(bill.total_amount || 0) - Number(bill.paid_amount || 0), 0)
      const amount = Math.min(applyAmount, remaining)

      // Link payment first, then update bill; rollback on failure
      const originalPaid = Number(bill.paid_amount || 0)
      const originalStatus = String(bill.status || "draft")
      {
        const { error: payErr } = await supabase.from("payments").update({ bill_id: bill.id }).eq("id", selectedPayment.id)
        if (payErr) throw payErr
      }
      {
        const newPaid = originalPaid + amount
        const newStatus = newPaid >= Number(bill.total_amount || 0) ? "paid" : "partially_paid"
        const { error: billErr } = await supabase.from("bills").update({ paid_amount: newPaid, status: newStatus }).eq("id", bill.id)
        if (billErr) {
          await supabase.from("payments").update({ bill_id: null }).eq("id", selectedPayment.id)
          throw billErr
        }
      }

      // Post journal: settle supplier advance -> AP (do not touch cash here)
      const { data: entry, error: entryErr } = await supabase
        .from("journal_entries").insert({
          company_id: mapping.companyId,
          reference_type: "bill_payment",
          reference_id: bill.id,
          entry_date: selectedPayment.payment_date,
          description: `سداد مرتبط بفاتورة مورد ${bill.bill_number}`,
        }).select().single()
      if (entryErr) throw entryErr
      const settleAdvId = mapping.supplierAdvance
      const { error: linesErr } = await supabase.from("journal_entry_lines").insert([
        { journal_entry_id: entry.id, account_id: mapping.ap, debit_amount: amount, credit_amount: 0, description: "حسابات دائنة" },
        { journal_entry_id: entry.id, account_id: settleAdvId || mapping.cash, debit_amount: 0, credit_amount: amount, description: settleAdvId ? "تسوية سلف الموردين" : "نقد/بنك" },
      ])
      if (linesErr) throw linesErr

      // Link advance application record
      await supabase.from("advance_applications").insert({
        company_id: mapping.companyId,
        customer_id: null,
        supplier_id: selectedPayment.supplier_id || null,
        payment_id: selectedPayment.id,
        invoice_id: null,
        bill_id: bill.id,
        amount_applied: amount,
        applied_date: selectedPayment.payment_date,
        notes: "تطبيق سلفة مورد على فاتورة شراء",
      })

      setApplyBillOpen(false)
      setSelectedPayment(null)
      const { data: suppPays } = await supabase
        .from("payments").select("*")
        .eq("company_id", mapping.companyId)
        .not("supplier_id", "is", null)
        .order("payment_date", { ascending: false })
      setSupplierPayments(suppPays || [])
    } catch (err: any) {
      console.error("Error applying payment to bill:", { message: String(err?.message || err || ""), details: err?.details ?? err })
    } finally { setSaving(false) }
  }

  // تنفيذ ربط دفع مورّد بفاتورة مورد باستخدام معطيات محددة دون الاعتماد على حالة الواجهة
  const applyPaymentToBillWithOverrides = async (payment: Payment, billId: string, rawAmount: number, _accountType?: string) => {
    try {
      if (!payment || !billId || rawAmount <= 0) return
      setSaving(true)
      const mapping = await findAccountIds()
      if (!mapping || !mapping.ap || !mapping.cash) return
      const { data: bill } = await supabase.from("bills").select("*").eq("id", billId).single()
      if (!bill) return
      const remaining = Math.max(Number(bill.total_amount || 0) - Number(bill.paid_amount || 0), 0)
      const amount = Math.min(rawAmount, remaining)

      // Track state for potential rollback
      const originalPaid = Number(bill.paid_amount || 0)
      const originalStatus = String(bill.status || "draft")
      let linkedPayment = false
      let billUpdated = false

      // 1) Link payment first to avoid updating bill when link fails (RLS/constraints)
      {
        const { error: payErr } = await supabase.from("payments").update({ bill_id: bill.id }).eq("id", payment.id)
        if (payErr) throw payErr
        linkedPayment = true
      }

      // 2) Update bill totals/status
      {
        const newPaid = originalPaid + amount
        const newStatus = newPaid >= Number(bill.total_amount || 0) ? "paid" : "partially_paid"
        const { error: billErr } = await supabase.from("bills").update({ paid_amount: newPaid, status: newStatus }).eq("id", bill.id)
        if (billErr) {
          // rollback payment link if bill update fails
          if (linkedPayment) {
            await supabase.from("payments").update({ bill_id: null }).eq("id", payment.id)
          }
          throw billErr
        }
        billUpdated = true
      }

      const settleAdvId = mapping.supplierAdvance
      const { data: entry, error: entryErr } = await supabase
        .from("journal_entries").insert({
          company_id: mapping.companyId,
          reference_type: "bill_payment",
          reference_id: bill.id,
          entry_date: payment.payment_date,
          description: `سداد مرتبط بفاتورة مورد ${bill.bill_number}`,
        }).select().single()
      if (entryErr) throw entryErr
      const { error: linesErr } = await supabase.from("journal_entry_lines").insert([
        { journal_entry_id: entry.id, account_id: mapping.ap, debit_amount: amount, credit_amount: 0, description: "حسابات دائنة" },
        { journal_entry_id: entry.id, account_id: settleAdvId || mapping.cash, debit_amount: 0, credit_amount: amount, description: settleAdvId ? "تسوية سلف الموردين" : "نقد/بنك" },
      ])
      if (linesErr) throw linesErr

      await supabase.from("advance_applications").insert({
        company_id: mapping.companyId,
        customer_id: null,
        supplier_id: payment.supplier_id || null,
        payment_id: payment.id,
        invoice_id: null,
        bill_id: bill.id,
        amount_applied: amount,
        applied_date: payment.payment_date,
        notes: "تطبيق سلفة مورد على فاتورة شراء",
      })

      const { data: suppPays } = await supabase
        .from("payments").select("*")
        .eq("company_id", mapping.companyId)
        .not("supplier_id", "is", null)
        .order("payment_date", { ascending: false })
      setSupplierPayments(suppPays || [])
    } catch (err: any) {
      // Attempt rollback of partial updates for consistency
      try {
        const { data: bill } = await supabase.from("bills").select("*").eq("id", billId).single()
        if (bill) {
          // We don't know flags here after throw; compute using amounts
          // If bill looks over-updated relative to remaining, try revert using previous paid value heuristic
          // Note: this is best-effort; full consistency requires DB transaction.
        }
      } catch (_) { /* ignore rollback errors */ }
      const msg = String(err?.message || err || "")
      const details = err?.details ?? err
      console.error("Error applying payment to bill (overrides):", { message: msg, details })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <Sidebar />
        <main className="flex-1 md:mr-64 p-4 md:p-8">
          <p className="py-8 text-center">{appLang==='en' ? 'Loading...' : 'جاري التحميل...'}</p>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-4 md:p-8 space-y-6">
        {/* رأس الصفحة */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-xl">
              <CreditCard className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{appLang==='en' ? 'Payments' : 'المدفوعات'}</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{appLang==='en' ? 'Create and review customer/supplier payments and apply them to documents' : 'إنشاء واستعراض مدفوعات العملاء والموردين وتطبيقها على المستندات'}</p>
            </div>
          </div>
          {!online && (
            <div className="mt-4 p-3 rounded border border-amber-300 bg-amber-50 text-amber-700">
              {appLang==='en' ? 'Internet connection is unavailable. Save/apply/delete actions are temporarily disabled.' : 'الاتصال بالإنترنت غير متاح الآن. أنشطة الحفظ/التطبيق/الحذف معطّلة مؤقتًا.'}
            </div>
          )}
        </div>

        <Card>
          <CardContent className="pt-6 space-y-6">
            <h2 className="text-xl font-semibold">{appLang==='en' ? 'Customer Payments' : 'مدفوعات العملاء'}</h2>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
              <div>
                <Label>{appLang==='en' ? 'Customer' : 'العميل'}</Label>
                <Select value={newCustPayment.customer_id} onValueChange={(v) => setNewCustPayment({ ...newCustPayment, customer_id: v })}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={appLang==='en' ? 'Select a customer' : 'اختر عميلًا'} />
                  </SelectTrigger>
                  <SelectContent className="min-w-[260px]">
                    <div className="p-2">
                      <Input value={customerQuery} onChange={(e) => setCustomerQuery(e.target.value)} placeholder={appLang==='en' ? 'Search customers...' : 'ابحث عن عميل...'} className="text-sm" />
                    </div>
                    {customers.filter((c) => {
                      const q = customerQuery.trim().toLowerCase()
                      if (!q) return true
                      return String(c.name || '').toLowerCase().includes(q)
                    }).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{appLang==='en' ? 'Account (Cash/Bank)' : 'الحساب (نقد/بنك)'}</Label>
                <select className="w-full border rounded px-2 py-1" value={newCustPayment.account_id} onChange={(e) => setNewCustPayment({ ...newCustPayment, account_id: e.target.value })}>
                  <option value="">{appLang==='en' ? 'Select payment account' : 'اختر حساب الدفع'}</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.account_name} ({a.account_code})</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>{appLang==='en' ? 'Amount' : 'المبلغ'}</Label>
                <Input type="number" min={0} step={0.01} value={newCustPayment.amount} onChange={(e) => setNewCustPayment({ ...newCustPayment, amount: Number(e.target.value) })} />
              </div>
              <div>
                <Label>{appLang==='en' ? 'Date' : 'تاريخ'}</Label>
                <Input type="date" value={newCustPayment.date} onChange={(e) => setNewCustPayment({ ...newCustPayment, date: e.target.value })} />
              </div>
              <div>
                <Label>{appLang==='en' ? 'Method' : 'طريقة'}</Label>
                <select className="w-full border rounded px-2 py-1" value={newCustPayment.method} onChange={(e) => setNewCustPayment({ ...newCustPayment, method: e.target.value })}>
                  <option value="cash">{appLang==='en' ? 'Cash' : 'كاش'}</option>
                  <option value="transfer">{appLang==='en' ? 'Transfer' : 'تحويل'}</option>
                  <option value="check">{appLang==='en' ? 'Check' : 'شيك'}</option>
                </select>
              </div>
              <div className="flex gap-2">
                <Button onClick={createCustomerPayment} disabled={saving || !online || !newCustPayment.customer_id || newCustPayment.amount <= 0 || !newCustPayment.account_id}>{appLang==='en' ? 'Create' : 'إنشاء'}</Button>
              </div>
            </div>

            {newCustPayment.customer_id && (
              <div className="mt-4 border rounded p-3">
                <h3 className="text-base font-semibold mb-2">{appLang==='en' ? 'Customer invoices not fully paid' : 'فواتير العميل غير المسددة بالكامل'}</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 dark:bg-slate-900">
                      <th className="px-2 py-2 text-right">{appLang==='en' ? 'Invoice No.' : 'رقم الفاتورة'}</th>
                      <th className="px-2 py-2 text-right">{appLang==='en' ? 'Date' : 'التاريخ'}</th>
                      <th className="px-2 py-2 text-right">{appLang==='en' ? 'Total' : 'المبلغ'}</th>
                      <th className="px-2 py-2 text-right">{appLang==='en' ? 'Paid' : 'المدفوع'}</th>
                      <th className="px-2 py-2 text-right">{appLang==='en' ? 'Remaining' : 'المتبقي'}</th>
                      <th className="px-2 py-2 text-right">{appLang==='en' ? 'Select' : 'اختيار'}</th>
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
                          <td className="px-2 py-2">{Number(inv.total_amount || 0).toFixed(2)} {currencySymbols[baseCurrency] || baseCurrency}</td>
                          <td className="px-2 py-2">{Number(inv.paid_amount || 0).toFixed(2)} {currencySymbols[baseCurrency] || baseCurrency}</td>
                          <td className="px-2 py-2 font-semibold">{outstanding.toFixed(2)} {currencySymbols[baseCurrency] || baseCurrency}</td>
                          <td className="px-2 py-2">
                            <Button variant={selectedFormInvoiceId === inv.id ? "default" : "outline"} size="sm" onClick={() => {
                              setSelectedFormInvoiceId(inv.id)
                              setNewCustPayment({ ...newCustPayment, amount: outstanding })
                            }}>{appLang==='en' ? 'Select' : 'اختيار'}</Button>
                          </td>
                        </tr>
                      )
                    })}
                    {formCustomerInvoices.length === 0 && (
                      <tr><td colSpan={6} className="px-2 py-2 text-center text-gray-500">{appLang==='en' ? 'No unpaid invoices for this customer' : 'لا توجد فواتير غير مسددة بالكامل لهذا العميل'}</td></tr>
                    )}
                  </tbody>
                </table>
                {selectedFormInvoiceId && (
                  <p className="mt-2 text-sm text-gray-600">{appLang==='en' ? 'Invoice selected; amount auto-filled with remaining.' : 'تم اختيار الفاتورة، وتم تعبئة خانة المبلغ تلقائيًا بالمبلغ المتبقي.'}</p>
                )}
              </div>
            )}

            <div className="border-t pt-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 dark:bg-slate-900">
                    <th className="px-2 py-2 text-right">{appLang==='en' ? 'Date' : 'التاريخ'}</th>
                    <th className="px-2 py-2 text-right">{appLang==='en' ? 'Amount' : 'المبلغ'}</th>
                    <th className="px-2 py-2 text-right">{appLang==='en' ? 'Reference' : 'مرجع'}</th>
                    <th className="px-2 py-2 text-right">{appLang==='en' ? 'Linked Invoice' : 'الفاتورة المرتبطة'}</th>
                    <th className="px-2 py-2 text-right">{appLang==='en' ? 'Action' : 'إجراء'}</th>
                  </tr>
                </thead>
                <tbody>
                  {customerPayments.map((p) => (
                    <tr key={p.id} className="border-b">
                      <td className="px-2 py-2">{p.payment_date}</td>
                      <td className="px-2 py-2">{getDisplayAmount(p).toFixed(2)} {currencySymbol}</td>
                      <td className="px-2 py-2">{p.reference_number || "-"}</td>
                      <td className="px-2 py-2">
                        {p.invoice_id ? (
                          <Link href={`/invoices/${p.invoice_id}`} className="text-blue-600 hover:underline">
                            {invoiceNumbers[p.invoice_id] || p.invoice_id}
                          </Link>
                        ) : (
                          "غير مرتبط"
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex gap-2">
                          {!p.invoice_id && (
                            <Button variant="outline" onClick={() => openApplyToInvoice(p)} disabled={!online}>{appLang==='en' ? 'Apply to Invoice' : 'تطبيق على فاتورة'}</Button>
                          )}
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
                          }}>{appLang==='en' ? 'Edit' : 'تعديل'}</Button>
                          <Button variant="destructive" disabled={!online} onClick={() => { setDeletingPayment(p); setDeleteOpen(true) }}>{appLang==='en' ? 'Delete' : 'حذف'}</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 space-y-6">
            <h2 className="text-xl font-semibold">{appLang==='en' ? 'Supplier Payments' : 'مدفوعات الموردين'}</h2>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
              <div>
                <Label>{appLang==='en' ? 'Supplier' : 'المورد'}</Label>
                <Select value={newSuppPayment.supplier_id} onValueChange={(v) => setNewSuppPayment({ ...newSuppPayment, supplier_id: v })}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={appLang==='en' ? 'Select a supplier' : 'اختر مورّدًا'} />
                  </SelectTrigger>
                  <SelectContent className="min-w-[260px]">
                    <div className="p-2">
                      <Input value={supplierQuery} onChange={(e) => setSupplierQuery(e.target.value)} placeholder={appLang==='en' ? 'Search suppliers...' : 'ابحث عن مورد...'} className="text-sm" />
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
              </div>
              <div>
                <Label>{appLang==='en' ? 'Account (Cash/Bank)' : 'الحساب (نقد/بنك)'}</Label>
                <select className="w-full border rounded px-2 py-1" value={newSuppPayment.account_id} onChange={(e) => setNewSuppPayment({ ...newSuppPayment, account_id: e.target.value })}>
                  <option value="">{appLang==='en' ? 'Select payment account' : 'اختر حساب السداد'}</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.account_name} ({a.account_code})</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>{appLang==='en' ? 'Amount' : 'المبلغ'}</Label>
                <Input type="number" min={0} step={0.01} value={newSuppPayment.amount} onChange={(e) => setNewSuppPayment({ ...newSuppPayment, amount: Number(e.target.value) })} />
              </div>
              <div>
                <Label>{appLang==='en' ? 'Date' : 'تاريخ'}</Label>
                <Input type="date" value={newSuppPayment.date} onChange={(e) => setNewSuppPayment({ ...newSuppPayment, date: e.target.value })} />
              </div>
              <div>
                <Label>{appLang==='en' ? 'Method' : 'طريقة'}</Label>
                <select className="w-full border rounded px-2 py-1" value={newSuppPayment.method} onChange={(e) => setNewSuppPayment({ ...newSuppPayment, method: e.target.value })}>
                  <option value="cash">{appLang==='en' ? 'Cash' : 'كاش'}</option>
                  <option value="transfer">{appLang==='en' ? 'Transfer' : 'تحويل'}</option>
                  <option value="check">{appLang==='en' ? 'Check' : 'شيك'}</option>
                </select>
              </div>
              <div className="flex gap-2">
                <Button onClick={createSupplierPayment} disabled={saving || !online || !newSuppPayment.supplier_id || newSuppPayment.amount <= 0 || !newSuppPayment.account_id}>{appLang==='en' ? 'Create' : 'إنشاء'}</Button>
              </div>
            </div>

            {newSuppPayment.supplier_id && (
              <div className="mt-4 border rounded p-3">
                <h3 className="text-base font-semibold mb-2">{appLang==='en' ? 'Supplier bills not fully paid' : 'فواتير المورد غير المسددة بالكامل'}</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 dark:bg-slate-900">
                      <th className="px-2 py-2 text-right">{appLang==='en' ? 'Bill No.' : 'رقم الفاتورة'}</th>
                      <th className="px-2 py-2 text-right">{appLang==='en' ? 'Date' : 'التاريخ'}</th>
                      <th className="px-2 py-2 text-right">{appLang==='en' ? 'Total' : 'المبلغ'}</th>
                      <th className="px-2 py-2 text-right">{appLang==='en' ? 'Paid' : 'المدفوع'}</th>
                      <th className="px-2 py-2 text-right">{appLang==='en' ? 'Remaining' : 'المتبقي'}</th>
                      <th className="px-2 py-2 text-right">{appLang==='en' ? 'Select' : 'اختيار'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formSupplierBills.map((b) => {
                      const remaining = Math.max(Number(b.total_amount || 0) - Number(b.paid_amount || 0), 0)
                      if (remaining <= 0) return null
                      return (
                        <tr key={b.id} className="border-b">
                          <td className="px-2 py-2">{b.bill_number}</td>
                          <td className="px-2 py-2">{b.bill_date || "-"}</td>
                          <td className="px-2 py-2">{Number(b.total_amount || 0).toFixed(2)} {currencySymbols[baseCurrency] || baseCurrency}</td>
                          <td className="px-2 py-2">{Number(b.paid_amount || 0).toFixed(2)} {currencySymbols[baseCurrency] || baseCurrency}</td>
                          <td className="px-2 py-2 font-semibold">{remaining.toFixed(2)} {currencySymbols[baseCurrency] || baseCurrency}</td>
                          <td className="px-2 py-2">
                            <Button variant={selectedFormBillId === b.id ? "default" : "outline"} size="sm" onClick={() => {
                              setSelectedFormBillId(b.id)
                              setNewSuppPayment({ ...newSuppPayment, amount: remaining })
                            }}>{appLang==='en' ? 'Select' : 'اختيار'}</Button>
                          </td>
                        </tr>
                      )
                    })}
                    {formSupplierBills.length === 0 && (
                      <tr><td colSpan={6} className="px-2 py-2 text-center text-gray-500">{appLang==='en' ? 'No unpaid bills for this supplier' : 'لا توجد فواتير غير مسددة بالكامل لهذا المورد'}</td></tr>
                    )}
                  </tbody>
                </table>
                {selectedFormBillId && (
                  <p className="mt-2 text-sm text-gray-600">تم اختيار الفاتورة، وتم تعبئة خانة المبلغ تلقائيًا بالمبلغ المتبقي.</p>
                )}
              </div>
            )}

            <div className="border-t pt-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 dark:bg-slate-900">
                    <th className="px-2 py-2 text-right">{appLang==='en' ? 'Date' : 'التاريخ'}</th>
                    <th className="px-2 py-2 text-right">{appLang==='en' ? 'Amount' : 'المبلغ'}</th>
                    <th className="px-2 py-2 text-right">{appLang==='en' ? 'Reference' : 'مرجع'}</th>
                    <th className="px-2 py-2 text-right">{appLang==='en' ? 'Linked Supplier Bill' : 'فاتورة المورد المرتبطة'}</th>
                    <th className="px-2 py-2 text-right">{appLang==='en' ? 'Linked Purchase Order' : 'أمر الشراء المرتبط'}</th>
                    <th className="px-2 py-2 text-right">{appLang==='en' ? 'Action' : 'إجراء'}</th>
                  </tr>
                </thead>
                <tbody>
                  {supplierPayments.map((p) => (
                    <tr key={p.id} className="border-b">
                      <td className="px-2 py-2">{p.payment_date}</td>
                      <td className="px-2 py-2">{getDisplayAmount(p).toFixed(2)} {currencySymbol}</td>
                      <td className="px-2 py-2">{p.reference_number || "-"}</td>
                      <td className="px-2 py-2">
                        {p.bill_id ? (
                          <Link href={`/bills/${p.bill_id}`} className="text-blue-600 hover:underline">
                            {billNumbers[p.bill_id] || p.bill_id}
                          </Link>
                        ) : (
                          "غير مرتبط"
                        )}
                      </td>
                      <td className="px-2 py-2">{p.purchase_order_id ? p.purchase_order_id : "غير مرتبط"}</td>
                      <td className="px-2 py-2">
                        <div className="flex gap-2">
                          {!p.bill_id && (
                            <Button variant="outline" onClick={() => openApplyToBill(p)} disabled={!online}>{appLang==='en' ? 'Apply to Bill' : 'تطبيق على فاتورة'}</Button>
                          )}
                          {!p.purchase_order_id && (
                            <Button variant="ghost" onClick={() => openApplyToPO(p)} disabled={!online}>{appLang==='en' ? 'Apply to PO' : 'على أمر شراء'}</Button>
                          )}
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
                          }}>{appLang==='en' ? 'Edit' : 'تعديل'}</Button>
                          <Button variant="destructive" disabled={!online} onClick={() => { setDeletingPayment(p); setDeleteOpen(true) }}>{appLang==='en' ? 'Delete' : 'حذف'}</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        </CardContent>
      </Card>

      {/* Edit Payment Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{appLang==='en' ? 'Edit Payment' : 'تعديل الدفعة'}</DialogTitle>
          </DialogHeader>
          {editingPayment && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>{appLang==='en' ? 'Payment Date' : 'تاريخ الدفع'}</Label>
                  <Input type="date" value={editFields.payment_date} onChange={(e) => setEditFields({ ...editFields, payment_date: e.target.value })} />
                </div>
                <div>
                  <Label>{appLang==='en' ? 'Payment Method' : 'طريقة الدفع'}</Label>
                  <select className="w-full border rounded px-2 py-1" value={editFields.payment_method} onChange={(e) => setEditFields({ ...editFields, payment_method: e.target.value })}>
                  <option value="cash">{appLang==='en' ? 'Cash' : 'كاش'}</option>
                  <option value="transfer">{appLang==='en' ? 'Transfer' : 'تحويل'}</option>
                  <option value="check">{appLang==='en' ? 'Check' : 'شيك'}</option>
                  </select>
                </div>
                <div>
                  <Label>{appLang==='en' ? 'Reference' : 'مرجع'}</Label>
                  <Input value={editFields.reference_number} onChange={(e) => setEditFields({ ...editFields, reference_number: e.target.value })} />
                </div>
                <div>
                  <Label>{appLang==='en' ? 'Account (Cash/Bank)' : 'الحساب (نقد/بنك)'}</Label>
                  <select className="w-full border rounded px-2 py-1" value={editFields.account_id} onChange={(e) => setEditFields({ ...editFields, account_id: e.target.value })}>
                    <option value="">اختر حساب الدفع</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.account_name} ({a.account_code})</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <Label>{appLang==='en' ? 'Notes' : 'ملاحظات'}</Label>
                <Input value={editFields.notes} onChange={(e) => setEditFields({ ...editFields, notes: e.target.value })} />
              </div>
              {(editingPayment.invoice_id || editingPayment.bill_id || editingPayment.purchase_order_id) ? (
                <p className="text-sm text-amber-600">{appLang==='en' ? 'Payment is linked to a document; amount cannot be changed. Edit reference/notes only.' : 'الدفع مرتبط بمستند؛ لا يمكن تعديل المبلغ. عدّل المرجع/الملاحظات فقط عند الحاجة.'}</p>
              ) : (
                <p className="text-sm text-gray-500">{appLang==='en' ? 'Changing amount via edit is not supported. Use delete then create a new payment if needed.' : 'لا ندعم تغيير المبلغ عبر التعديل. استخدم حذف ثم إنشاء دفعة جديدة إذا لزم.'}</p>
              )}
          </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditOpen(false); setEditingPayment(null) }}>{appLang==='en' ? 'Cancel' : 'إلغاء'}</Button>
            <Button onClick={async () => {
              try {
                if (!editingPayment) return
                if (!online) { toastActionError(toast, "الاتصال", "التعديل", "لا يوجد اتصال بالإنترنت"); return }
                setSaving(true)
                const mapping = await findAccountIds()
                const isCustomer = !!editingPayment.customer_id
                const isApplied = !!(editingPayment.invoice_id || editingPayment.bill_id || editingPayment.purchase_order_id)

                // إذا لم تكن مرتبطة بأي مستند: ننفذ قيد عكسي ثم نقيد الدفعة بالقيم الجديدة لضمان اتساق القيود
                if (!isApplied) {
                  const cashAccountIdOriginal = editingPayment.account_id || (mapping ? (mapping.cash || mapping.bank) : undefined)
                  if (mapping && cashAccountIdOriginal) {
                    const { data: revEntry } = await supabase
                      .from("journal_entries").insert({
                        company_id: mapping.companyId,
                        reference_type: isCustomer ? "customer_payment_reversal" : "supplier_payment_reversal",
                        reference_id: null,
                        entry_date: new Date().toISOString().slice(0, 10),
                        description: isCustomer ? "عكس دفعة عميل غير مرتبطة" : "عكس دفعة مورد غير مرتبطة",
                      }).select().single()
                    if (revEntry?.id) {
                      if (isCustomer) {
                        if (mapping.customerAdvance) {
                          await supabase.from("journal_entry_lines").insert([
                            { journal_entry_id: revEntry.id, account_id: mapping.customerAdvance, debit_amount: editingPayment.amount, credit_amount: 0, description: "عكس سلف العملاء" },
                            { journal_entry_id: revEntry.id, account_id: cashAccountIdOriginal, debit_amount: 0, credit_amount: editingPayment.amount, description: "عكس نقد/بنك" },
                          ])
                        }
                      } else {
                        if (mapping.supplierAdvance) {
                          await supabase.from("journal_entry_lines").insert([
                            { journal_entry_id: revEntry.id, account_id: cashAccountIdOriginal, debit_amount: editingPayment.amount, credit_amount: 0, description: "عكس نقد/بنك" },
                            { journal_entry_id: revEntry.id, account_id: mapping.supplierAdvance, debit_amount: 0, credit_amount: editingPayment.amount, description: "عكس سلف الموردين" },
                          ])
                        }
                      }
                    }
                  }

                  // قيد جديد بالقيم المحدّثة
                  const cashAccountIdNew = editFields.account_id || (mapping ? (mapping.cash || mapping.bank) : undefined)
                  if (mapping && cashAccountIdNew) {
                    const { data: newEntry } = await supabase
                      .from("journal_entries").insert({
                        company_id: mapping.companyId,
                        reference_type: isCustomer ? "customer_payment" : "supplier_payment",
                        reference_id: null,
                        entry_date: editFields.payment_date || editingPayment.payment_date,
                        description: isCustomer ? `سداد عميل (${editFields.payment_method || editingPayment.payment_method || "cash"})` : `سداد مورّد (${editFields.payment_method || editingPayment.payment_method || "cash"})`,
                      }).select().single()
                    if (newEntry?.id) {
                      if (isCustomer) {
                        if (mapping.customerAdvance) {
                          await supabase.from("journal_entry_lines").insert([
                            { journal_entry_id: newEntry.id, account_id: cashAccountIdNew, debit_amount: editingPayment.amount, credit_amount: 0, description: "نقد/بنك" },
                            { journal_entry_id: newEntry.id, account_id: mapping.customerAdvance, debit_amount: 0, credit_amount: editingPayment.amount, description: "سلف من العملاء" },
                          ])
                        }
                      } else {
                        if (mapping.supplierAdvance) {
                          await supabase.from("journal_entry_lines").insert([
                            { journal_entry_id: newEntry.id, account_id: mapping.supplierAdvance, debit_amount: editingPayment.amount, credit_amount: 0, description: "سلف للموردين" },
                            { journal_entry_id: newEntry.id, account_id: cashAccountIdNew, debit_amount: 0, credit_amount: editingPayment.amount, description: "نقد/بنك" },
                          ])
                        }
                      }
                    }
                  }
                  if (!mapping || !cashAccountIdOriginal || !cashAccountIdNew || (isCustomer && !mapping?.customerAdvance) || (!isCustomer && !mapping?.supplierAdvance)) {
                    toast({ title: "تحذير", description: "تم حفظ التعديل لكن تعذر تسجيل قيود عكسية/مستحدثة لغياب إعدادات الحسابات.", variant: "default" })
                  }
                } else {
                  // الدفعة مرتبطة بمستند: إذا تغيّر حساب النقد/البنك، ننفذ قيد إعادة تصنيف بين الحسابين
                  const oldCashId = editingPayment.account_id || null
                  const newCashId = editFields.account_id || null
                  if (mapping && oldCashId && newCashId && oldCashId !== newCashId) {
                    const { data: reclassEntry } = await supabase
                      .from("journal_entries").insert({
                        company_id: mapping.companyId,
                        reference_type: isCustomer ? "customer_payment_reclassification" : "supplier_payment_reclassification",
                        reference_id: editingPayment.id,
                        entry_date: editFields.payment_date || editingPayment.payment_date,
                        description: "إعادة تصنيف حساب الدفع: نقل من حساب قديم إلى حساب جديد",
                      }).select().single()
                    if (reclassEntry?.id) {
                      await supabase.from("journal_entry_lines").insert([
                        { journal_entry_id: reclassEntry.id, account_id: newCashId, debit_amount: editingPayment.amount, credit_amount: 0, description: "تحويل إلى حساب جديد (نقد/بنك)" },
                        { journal_entry_id: reclassEntry.id, account_id: oldCashId, debit_amount: 0, credit_amount: editingPayment.amount, description: "تحويل من الحساب القديم (نقد/بنك)" },
                      ])
                    }
                  }
                }

                // تحديث صف الدفعة
                const { error: updErr } = await supabase.from("payments").update({
                  payment_date: editFields.payment_date || editingPayment.payment_date,
                  payment_method: editFields.payment_method || editingPayment.payment_method,
                  reference_number: editFields.reference_number || null,
                  notes: editFields.notes || null,
                  account_id: editFields.account_id || null,
                }).eq("id", editingPayment.id)
                if (updErr) throw updErr

                toastActionSuccess(toast, "التحديث", "الدفعة")
                setEditOpen(false)
                setEditingPayment(null)

                // إعادة تحميل القوائم
                const { data: { user } } = await supabase.auth.getUser()
                if (!user) return
                const { data: company } = await supabase.from("companies").select("id").eq("user_id", user.id).single()
                if (!company) return
                const { data: custPays } = await supabase
                  .from("payments").select("*")
                  .eq("company_id", company.id)
                  .not("customer_id", "is", null)
                  .order("payment_date", { ascending: false })
                setCustomerPayments(custPays || [])
                const { data: suppPays } = await supabase
                  .from("payments").select("*")
                  .eq("company_id", company.id)
                  .not("supplier_id", "is", null)
                  .order("payment_date", { ascending: false })
                setSupplierPayments(suppPays || [])
              } catch (err) {
                console.error("Error updating payment:", err)
                toastActionError(toast, "التحديث", "الدفعة", "فشل تعديل الدفعة")
              } finally { setSaving(false) }
            }}>{appLang==='en' ? 'Save' : 'حفظ'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Payment Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{appLang==='en' ? 'Delete Payment' : 'حذف الدفعة'}</DialogTitle>
          </DialogHeader>
          {deletingPayment && (
            <div className="space-y-3">
              {(deletingPayment.invoice_id || deletingPayment.bill_id || deletingPayment.purchase_order_id) ? (
                <p className="text-amber-600">{appLang==='en' ? 'Deletion will be handled professionally: reverse linked journals (invoice/bill/PO), update documents, then delete the payment.' : 'ستتم معالجة الحذف بشكل احترافي: سنعكس القيود المرتبطة (فاتورة/فاتورة مورد/أمر شراء)، ونُحدّث المستندات، ثم نحذف الدفعة.'}</p>
              ) : (
                <p>{appLang==='en' ? 'A reversal journal will be created for consistency, then the payment will be deleted.' : 'سيتم إنشاء قيد عكسي للحفاظ على الاتساق ثم حذف الدفعة نهائيًا.'}</p>
              )}
              <p className="text-sm text-gray-600">المبلغ: {Number(deletingPayment.amount || 0).toFixed(2)} | التاريخ: {deletingPayment.payment_date}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteOpen(false); setDeletingPayment(null) }}>{appLang==='en' ? 'Cancel' : 'إلغاء'}</Button>
            <Button variant="destructive" onClick={async () => {
              try {
                if (!deletingPayment) return
                if (!online) { toastActionError(toast, "الاتصال", "الحذف", "لا يوجد اتصال بالإنترنت"); return }
                setSaving(true)
                const mapping = await findAccountIds()
                const isCustomer = !!deletingPayment.customer_id
                const cashAccountId = deletingPayment.account_id || (mapping ? (mapping.cash || mapping.bank) : undefined)
                let skipBaseReversal = false
                // 1) إذا كانت الدفعة مرتبطة بمستند، نعكس القيود ونُحدّث المستند
                if (deletingPayment.invoice_id) {
                  if (!mapping || !mapping.ar) throw new Error("غياب إعدادات الذمم المدينة (AR)")
                  const { data: inv } = await supabase.from("invoices").select("id, invoice_number, total_amount, paid_amount, status").eq("id", deletingPayment.invoice_id).single()
                  if (!inv) throw new Error("الفاتورة غير موجودة")
                  const { data: apps } = await supabase
                    .from("advance_applications")
                    .select("amount_applied")
                    .eq("payment_id", deletingPayment.id)
                    .eq("invoice_id", inv.id)
                  const applied = (apps || []).reduce((s: number, r: any) => s + Number(r.amount_applied || 0), 0)
                  if (applied > 0) {
                    const { data: revEntry } = await supabase
                      .from("journal_entries").insert({
                        company_id: mapping.companyId,
                        reference_type: "invoice_payment_reversal",
                        reference_id: inv.id,
                        entry_date: new Date().toISOString().slice(0, 10),
                        description: `عكس تطبيق دفعة على فاتورة ${inv.invoice_number}`,
                      }).select().single()
                    if (revEntry?.id) {
                      const creditAdvanceId = mapping.customerAdvance || cashAccountId
                      await supabase.from("journal_entry_lines").insert([
                        { journal_entry_id: revEntry.id, account_id: mapping.ar, debit_amount: applied, credit_amount: 0, description: "عكس ذمم مدينة" },
                        { journal_entry_id: revEntry.id, account_id: creditAdvanceId!, debit_amount: 0, credit_amount: applied, description: mapping.customerAdvance ? "عكس تسوية سلف العملاء" : "عكس نقد/بنك" },
                      ])
                    }
                    // تحديث الفاتورة
                    const newPaid = Math.max(Number(inv.paid_amount || 0) - applied, 0)
                    const newStatus = newPaid <= 0 ? "sent" : "partially_paid"
                    await supabase.from("invoices").update({ paid_amount: newPaid, status: newStatus }).eq("id", inv.id)
                    // إزالة سجلات التطبيق
                    await supabase.from("advance_applications").delete().eq("payment_id", deletingPayment.id).eq("invoice_id", inv.id)
                    // إزالة الربط من الدفعة
                    await supabase.from("payments").update({ invoice_id: null }).eq("id", deletingPayment.id)
                  } else {
                    // دفع مباشر على الفاتورة بدون سجلات سلفة: نعكس نقد/بنك -> ذمم مدينة
                    const { data: revEntryDirect } = await supabase
                      .from("journal_entries").insert({
                        company_id: mapping.companyId,
                        reference_type: "invoice_payment_reversal",
                        reference_id: inv.id,
                        entry_date: new Date().toISOString().slice(0, 10),
                        description: `عكس دفع مباشر للفاتورة ${inv.invoice_number}`,
                      }).select().single()
                    if (revEntryDirect?.id && cashAccountId) {
                      await supabase.from("journal_entry_lines").insert([
                        { journal_entry_id: revEntryDirect.id, account_id: mapping.ar, debit_amount: Number(deletingPayment.amount || 0), credit_amount: 0, description: "عكس الذمم المدينة" },
                        { journal_entry_id: revEntryDirect.id, account_id: cashAccountId, debit_amount: 0, credit_amount: Number(deletingPayment.amount || 0), description: "عكس نقد/بنك" },
                      ])
                    }
                    const newPaid = Math.max(Number(inv.paid_amount || 0) - Number(deletingPayment.amount || 0), 0)
                    const newStatus = newPaid <= 0 ? "sent" : "partially_paid"
                    await supabase.from("invoices").update({ paid_amount: newPaid, status: newStatus }).eq("id", inv.id)
                    await supabase.from("payments").update({ invoice_id: null }).eq("id", deletingPayment.id)
                    // لا نعكس القيد الأساسي لاحقًا لأن الدفعة لم تُسجّل كسلفة
                    skipBaseReversal = true
                  }
                } else if (deletingPayment.bill_id) {
                  if (!mapping || !mapping.ap) throw new Error("غياب إعدادات الحسابات الدائنة (AP)")
                  const { data: bill } = await supabase.from("bills").select("id, bill_number, total_amount, paid_amount, status").eq("id", deletingPayment.bill_id).single()
                  if (!bill) throw new Error("فاتورة المورد غير موجودة")
                  const { data: apps } = await supabase
                    .from("advance_applications")
                    .select("amount_applied")
                    .eq("payment_id", deletingPayment.id)
                    .eq("bill_id", bill.id)
                  const applied = (apps || []).reduce((s: number, r: any) => s + Number(r.amount_applied || 0), 0)
                  if (applied > 0) {
                    const { data: revEntry } = await supabase
                      .from("journal_entries").insert({
                        company_id: mapping.companyId,
                        reference_type: "bill_payment_reversal",
                        reference_id: bill.id,
                        entry_date: new Date().toISOString().slice(0, 10),
                        description: `عكس تطبيق دفعة على فاتورة مورد ${bill.bill_number}`,
                      }).select().single()
                    if (revEntry?.id) {
                      const debitAdvanceId = mapping.supplierAdvance || cashAccountId
                      await supabase.from("journal_entry_lines").insert([
                        { journal_entry_id: revEntry.id, account_id: debitAdvanceId!, debit_amount: applied, credit_amount: 0, description: mapping.supplierAdvance ? "عكس تسوية سلف الموردين" : "عكس نقد/بنك" },
                        { journal_entry_id: revEntry.id, account_id: mapping.ap, debit_amount: 0, credit_amount: applied, description: "عكس حسابات دائنة" },
                      ])
                    }
                    const newPaid = Math.max(Number(bill.paid_amount || 0) - applied, 0)
                    const newStatus = newPaid <= 0 ? "sent" : "partially_paid"
                    await supabase.from("bills").update({ paid_amount: newPaid, status: newStatus }).eq("id", bill.id)
                    await supabase.from("advance_applications").delete().eq("payment_id", deletingPayment.id).eq("bill_id", bill.id)
                    await supabase.from("payments").update({ bill_id: null }).eq("id", deletingPayment.id)
                  }
                } else if (deletingPayment.purchase_order_id) {
                  // عكس تطبيق الدفعة على أمر شراء: الأصل كان (سلف للموردين مدين / نقد دائن)
                  const { data: po } = await supabase.from("purchase_orders").select("id, po_number, total_amount, received_amount, status").eq("id", deletingPayment.purchase_order_id).single()
                  if (po && mapping) {
                    const { data: revEntry } = await supabase
                      .from("journal_entries").insert({
                        company_id: mapping.companyId,
                        reference_type: "po_payment_reversal",
                        reference_id: po.id,
                        entry_date: new Date().toISOString().slice(0, 10),
                        description: `عكس تطبيق دفعة على أمر شراء ${po.po_number}`,
                      }).select().single()
                    if (revEntry?.id && cashAccountId && mapping.supplierAdvance) {
                      await supabase.from("journal_entry_lines").insert([
                        { journal_entry_id: revEntry.id, account_id: cashAccountId, debit_amount: deletingPayment.amount, credit_amount: 0, description: "عكس نقد/بنك" },
                        { journal_entry_id: revEntry.id, account_id: mapping.supplierAdvance, debit_amount: 0, credit_amount: deletingPayment.amount, description: "عكس سلف الموردين" },
                      ])
                    }
                    const newReceived = Math.max(Number(po.received_amount || 0) - Number(deletingPayment.amount || 0), 0)
                    const newStatus = newReceived <= 0 ? "received_partial" : (newReceived >= Number(po.total_amount || 0) ? "received" : "received_partial")
                    await supabase.from("purchase_orders").update({ received_amount: newReceived, status: newStatus }).eq("id", po.id)
                    await supabase.from("payments").update({ purchase_order_id: null }).eq("id", deletingPayment.id)
                  }
                }

                // 2) عكس قيد إنشاء الدفعة (نقد/سلف) إن لم يكن دفعًا مباشرًا على الفاتورة
                if (!skipBaseReversal && mapping && cashAccountId) {
                  const { data: revEntryBase } = await supabase
                    .from("journal_entries").insert({
                      company_id: mapping.companyId,
                      reference_type: isCustomer ? "customer_payment_deletion" : "supplier_payment_deletion",
                      reference_id: deletingPayment.id,
                      entry_date: new Date().toISOString().slice(0, 10),
                      description: isCustomer ? "حذف دفعة عميل" : "حذف دفعة مورد",
                    }).select().single()
                  if (revEntryBase?.id) {
                    if (isCustomer && mapping.customerAdvance) {
                      await supabase.from("journal_entry_lines").insert([
                        { journal_entry_id: revEntryBase.id, account_id: mapping.customerAdvance, debit_amount: deletingPayment.amount, credit_amount: 0, description: "عكس سلف العملاء" },
                        { journal_entry_id: revEntryBase.id, account_id: cashAccountId, debit_amount: 0, credit_amount: deletingPayment.amount, description: "عكس نقد/بنك" },
                      ])
                    } else if (!isCustomer && mapping.supplierAdvance) {
                      await supabase.from("journal_entry_lines").insert([
                        { journal_entry_id: revEntryBase.id, account_id: cashAccountId, debit_amount: deletingPayment.amount, credit_amount: 0, description: "عكس نقد/بنك" },
                        { journal_entry_id: revEntryBase.id, account_id: mapping.supplierAdvance, debit_amount: 0, credit_amount: deletingPayment.amount, description: "عكس سلف الموردين" },
                      ])
                    }
                  }
                }
                if (!mapping || !cashAccountId) {
                  toast({ title: "تحذير", description: "تم حذف الدفعة لكن تعذر تسجيل بعض القيود لغياب إعدادات الحسابات.", variant: "default" })
                }
                const { error: delErr } = await supabase.from("payments").delete().eq("id", deletingPayment.id)
                if (delErr) {
                  // رمز 23503 يعبّر عادة عن قيود مفاتيح خارجية
                  if ((delErr as any).code === "23503") {
                    toastActionError(toast, "الحذف", "الدفعة", "تعذر حذف الدفعة لارتباطها بسجلات أخرى")
                    return
                  }
                  throw delErr
                }
                toastActionSuccess(toast, "الحذف", "الدفعة")
                setDeleteOpen(false)
                setDeletingPayment(null)
                const { data: { user } } = await supabase.auth.getUser()
                if (!user) return
                const { data: company } = await supabase.from("companies").select("id").eq("user_id", user.id).single()
                if (!company) return
                const { data: custPays } = await supabase
                  .from("payments").select("*")
                  .eq("company_id", company.id)
                  .not("customer_id", "is", null)
                  .order("payment_date", { ascending: false })
                setCustomerPayments(custPays || [])
                const { data: suppPays } = await supabase
                  .from("payments").select("*")
                  .eq("company_id", company.id)
                  .not("supplier_id", "is", null)
                  .order("payment_date", { ascending: false })
                setSupplierPayments(suppPays || [])
              } catch (err) {
                console.error("Error deleting payment:", err)
                toastActionError(toast, "الحذف", "الدفعة", "فشل حذف الدفعة")
              } finally { setSaving(false) }
            }}>{appLang==='en' ? 'Confirm Delete' : 'تأكيد الحذف'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

        {/* Apply to Invoice Dialog */}
        <Dialog open={applyInvoiceOpen} onOpenChange={setApplyInvoiceOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{appLang==='en' ? 'Apply payment to invoice' : 'تطبيق دفعة على فاتورة'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>{appLang==='en' ? 'Document' : 'الوثيقة'}</Label>
                <select className="w-full border rounded px-2 py-1" value={applyDocId} onChange={(e) => setApplyDocId(e.target.value)}>
                  <option value="">{appLang==='en' ? 'Select an invoice' : 'اختر فاتورة'}</option>
                  {customerInvoices.map((inv) => {
                    const outstanding = Math.max(Number(inv.total_amount || 0) - Number(inv.paid_amount || 0), 0)
                    return (
                      <option key={inv.id} value={inv.id}>
                        {inv.invoice_number} — {appLang==='en' ? 'Remaining' : 'متبقّي'} {outstanding.toFixed(2)}
                      </option>
                    )
                  })}
                </select>
              </div>
              <div>
                <Label>{appLang==='en' ? 'Amount to apply' : 'المبلغ للتطبيق'}</Label>
                <Input type="number" min={0} step={0.01} value={applyAmount} onChange={(e) => setApplyAmount(Number(e.target.value))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setApplyInvoiceOpen(false)}>{appLang==='en' ? 'Cancel' : 'إلغاء'}</Button>
              <Button onClick={applyPaymentToInvoice} disabled={saving || !applyDocId || applyAmount <= 0}>{appLang==='en' ? 'Apply' : 'تطبيق'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Apply to PO Dialog */}
        <Dialog open={applyPoOpen} onOpenChange={setApplyPoOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{appLang==='en' ? 'Apply payment to purchase order' : 'تطبيق سداد على أمر شراء'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>{appLang==='en' ? 'Document' : 'الوثيقة'}</Label>
                <select className="w-full border rounded px-2 py-1" value={applyDocId} onChange={(e) => setApplyDocId(e.target.value)}>
                  <option value="">{appLang==='en' ? 'Select a purchase order' : 'اختر أمر شراء'}</option>
                  {supplierPOs.map((po) => {
                    const outstanding = Math.max(Number(po.total_amount || 0) - Number(po.received_amount || 0), 0)
                    return (
                      <option key={po.id} value={po.id}>
                        {po.po_number} — {appLang==='en' ? 'Remaining' : 'متبقّي'} {outstanding.toFixed(2)}
                      </option>
                    )
                  })}
                </select>
              </div>
              <div>
                <Label>{appLang==='en' ? 'Amount to apply' : 'المبلغ للتطبيق'}</Label>
                <Input type="number" min={0} step={0.01} value={applyAmount} onChange={(e) => setApplyAmount(Number(e.target.value))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setApplyPoOpen(false)}>{appLang==='en' ? 'Cancel' : 'إلغاء'}</Button>
              <Button onClick={applyPaymentToPO} disabled={saving || !applyDocId || applyAmount <= 0}>{appLang==='en' ? 'Apply' : 'تطبيق'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Apply to Bill Dialog */}
        <Dialog open={applyBillOpen} onOpenChange={setApplyBillOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{appLang==='en' ? 'Apply payment to supplier bill' : 'تطبيق سداد على فاتورة مورد'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>{appLang==='en' ? 'Document' : 'الوثيقة'}</Label>
                <select className="w-full border rounded px-2 py-1" value={applyDocId} onChange={(e) => setApplyDocId(e.target.value)}>
                  <option value="">{appLang==='en' ? 'Select a bill' : 'اختر فاتورة'}</option>
                  {supplierBills.map((b) => {
                    const outstanding = Math.max(Number(b.total_amount || 0) - Number(b.paid_amount || 0), 0)
                    return (
                      <option key={b.id} value={b.id}>
                        {b.bill_number} — {appLang==='en' ? 'Remaining' : 'متبقّي'} {outstanding.toFixed(2)}
                      </option>
                    )
                  })}
                </select>
              </div>
              <div>
                <Label>{appLang==='en' ? 'Amount to apply' : 'المبلغ للتطبيق'}</Label>
                <Input type="number" min={0} step={0.01} value={applyAmount} onChange={(e) => setApplyAmount(Number(e.target.value))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setApplyBillOpen(false)}>{appLang==='en' ? 'Cancel' : 'إلغاء'}</Button>
              <Button onClick={applyPaymentToBill} disabled={saving || !applyDocId || applyAmount <= 0}>{appLang==='en' ? 'Apply' : 'تطبيق'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}
