"use client"

import { useState, useEffect, useRef } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { useSupabase } from "@/lib/supabase/hooks"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Download, ArrowRight, Printer, FileDown, Pencil } from "lucide-react"
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
}

interface InvoiceItem {
  id: string
  quantity: number
  unit_price: number
  tax_rate: number
  discount_percent?: number
  line_total: number
  products?: { name: string; sku: string }
}

export default function InvoiceDetailPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
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
  const printAreaRef = useRef<HTMLDivElement | null>(null)
  const params = useParams()
  const router = useRouter()
  const invoiceId = params.id as string
  const [repairing, setRepairing] = useState(false)
  const [repairSummary, setRepairSummary] = useState<any | null>(null)

  useEffect(() => {
    loadInvoice()
  }, [])

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
          .select("*, products(name, sku)")
          .eq("invoice_id", invoiceId)

        setItems(itemsData || [])
      }
    } catch (error) {
      console.error("Error loading invoice:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const handleDownloadPDF = async () => {
    try {
      const el = printAreaRef.current
      if (!el) return
      const { default: html2canvas } = await import("html2canvas")
      const { jsPDF } = await import("jspdf")

      const canvas = await html2canvas(el, { scale: 2 })
      const imgData = canvas.toDataURL("image/png")
      const pdf = new jsPDF({ orientation: "p", unit: "pt", format: "a4" })
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const scale = Math.min(pageWidth / canvas.width, pageHeight / canvas.height)
      const imgWidth = canvas.width * scale
      const imgHeight = canvas.height * scale
      const x = (pageWidth - imgWidth) / 2
      const y = 0
      pdf.addImage(imgData, "PNG", x, y, imgWidth, imgHeight)
      const filename = `invoice-${invoice?.invoice_number || invoiceId}.pdf`
      pdf.save(filename)
    } catch (err) {
      console.error("Error generating PDF:", err)
    }
  }

  const repairThisInvoice = async () => {
    try {
      if (!invoice) return
      setRepairing(true)
      setRepairSummary(null)
      const res = await fetch("/api/repair-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_number: String(invoice.invoice_number || "").trim() }),
      })
      const data = await res.json()
      if (!res.ok || data?.ok === false) {
        toastActionError(toast, "الإصلاح", "الفاتورة", String(data?.error || "تعذر تنفيذ الإصلاح"))
        return
      }
      setRepairSummary(data?.summary || data)
      toastActionSuccess(toast, "الإصلاح", "الفاتورة")
    } catch (err: any) {
      toastActionError(toast, "الإصلاح", "الفاتورة", err?.message || undefined)
    } finally {
      setRepairing(false)
    }
  }

  const handleChangeStatus = async (newStatus: string) => {
    try {
      const { error } = await supabase.from("invoices").update({ status: newStatus }).eq("id", invoiceId)

      if (error) throw error

      // Auto-post journal entries for invoice when sent
      // ملاحظة: تم تعطيل إنشاء قيد دفع الفاتورة تلقائيًا عند التحويل إلى "مدفوعة"
      // لأن صفحة المدفوعات تتولى قيود الدفع والتطبيق، مما يمنع ازدواج القيود وبقاء بيانات دفع قديمة.
      if (invoice) {
        if (newStatus === "sent") {
          await postInvoiceJournal()
          await postCOGSJournalAndInventory()
        }
      }

      loadInvoice()
      toastActionSuccess(toast, "التحديث", "الفاتورة")
    } catch (error) {
      console.error("Error updating status:", error)
      toastActionError(toast, "التحديث", "الفاتورة", "تعذر تحديث حالة الفاتورة")
    }
  }

  const findAccountIds = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null

    const { data: companyData } = await supabase.from("companies").select("id").eq("user_id", user.id).single()
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

    return { companyId: companyData.id, ar, revenue, vatPayable, cash, bank, inventory, cogs }
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

      // Add shipping as revenue credit when shipping exists to keep AR = Revenue + VAT + Shipping
      if (Number(invoice.shipping || 0) > 0) {
        lines.push({
          journal_entry_id: entry.id,
          account_id: mapping.revenue,
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

      // 1) إدراج سجل الدفع
      // Attempt insert including account_id; fallback if column mismatch
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

      // 3) قيد اليومية للدفع
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
        // Choose debit account: prefer selected account, else infer by method, else fallback
        const methodLower = String(method || "").toLowerCase()
        // إضافة كلمات عربية شائعة لطرق الدفع البنكية
        const isBankMethod = [
          "bank",
          "transfer",
          "cheque",
          "شيك",
          "تحويل",
          "بنكي",
          "فيزا",
          "بطاقة",
          "pos",
          "ماكينة"
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

      // أعِد التحميل وأغلق النموذج
      await loadInvoice()
      setShowPayment(false)
      setPaymentAccountId("")
    } catch (err) {
      console.error("خطأ أثناء تسجيل الدفعة:", err)
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
        notes: `بيع ${invoice.invoice_number}`,
      }))
      if (invTx.length > 0) {
        const { error: invErr } = await supabase.from("inventory_transactions").insert(invTx)
        if (invErr) console.warn("Failed inserting sale inventory transactions", invErr)
      }

      // Update product quantities (decrease on sale)
      if (invItems2 && (invItems2 as any[]).length > 0) {
        for (const it of invItems2 as any[]) {
          try {
            const { data: prod } = await supabase
              .from("products")
              .select("id, quantity_on_hand")
              .eq("id", it.product_id)
              .single()
            if (prod) {
              const newQty = Number(prod.quantity_on_hand || 0) - Number(it.quantity || 0)
              if (newQty < 0) {
                console.warn("Negative stock warning for product", it.product_id, "newQty:", newQty)
                try {
                  toastActionError(
                    toast,
                    "الترحيل",
                    "المخزون",
                    "المخزون لا يكفي لأحد المنتجات. سيتم الاستمرار لكن يرجى مراجعة الكميات.",
                  )
                } catch {}
              }
              const { error: updErr } = await supabase
                .from("products")
                .update({ quantity_on_hand: newQty })
                .eq("id", it.product_id)
              if (updErr) console.warn("Failed updating product quantity_on_hand", updErr)
            }
          } catch (e) {
            console.warn("Error while updating product quantity after sale", e)
          }
        }
      }
    } catch (err) {
      console.error("Error posting COGS/inventory for invoice:", err)
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
        <Sidebar />
        <main className="flex-1 md:mr-64 p-4 md:p-8">
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
          <p className="text-center py-8 text-red-600">لم يتم العثور على الفاتورة</p>
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

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />

      <main ref={printAreaRef} className="flex-1 md:mr-64 p-4 md:p-8">
        <div className="space-y-6 print:space-y-4">
          <div className="flex justify-between items-start print:hidden">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">الفاتورة #{invoice.invoice_number}</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">
                تاريخ الإصدار: {new Date(invoice.invoice_date).toLocaleDateString("ar")}
              </p>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={handleDownloadPDF}>
                <FileDown className="w-4 h-4 mr-2" />
                تنزيل PDF
              </Button>
              <Button variant="outline" onClick={handlePrint}>
                <Printer className="w-4 h-4 mr-2" />
                طباعة
              </Button>
              <Button variant="outline" onClick={repairThisInvoice} disabled={repairing}>
                {repairing ? "جاري الإصلاح..." : "إصلاح القيود"}
              </Button>
              <Link href={`/invoices/${invoice.id}/edit`}>
                <Button variant="outline">
                  <Pencil className="w-4 h-4 mr-2" />
                  تعديل
                </Button>
              </Link>
              <Button variant="outline" onClick={() => router.push("/invoices")}> 
                <ArrowRight className="w-4 h-4 mr-2" />
                العودة
              </Button>
            </div>
          </div>

          <Card>
            <CardContent className="pt-6 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold mb-2">من:</h3>
                  <p className="text-sm font-medium">{invoice.companies?.name}</p>
                  <p className="text-sm text-gray-600">{invoice.companies?.email}</p>
                  <p className="text-sm text-gray-600">{invoice.companies?.phone}</p>
                  <p className="text-sm text-gray-600">{invoice.companies?.address}</p>
                </div>

                <div>
                  <h3 className="font-semibold mb-2">إلى:</h3>
                  <p className="text-sm font-medium">{invoice.customers?.name}</p>
                  <p className="text-sm text-gray-600">{invoice.customers?.email}</p>
                  <p className="text-sm text-gray-600">{invoice.customers?.address}</p>
                </div>
              </div>

              <div className="border-t pt-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 dark:bg-slate-900">
                      <th className="px-4 py-2 text-right">المنتج</th>
                      <th className="px-4 py-2 text-right">الكمية</th>
                      <th className="px-4 py-2 text-right">السعر</th>
                      <th className="px-4 py-2 text-right">خصم (%)</th>
                      <th className="px-4 py-2 text-right">الضريبة</th>
                      <th className="px-4 py-2 text-right">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className="border-b">
                        <td className="px-4 py-2">
                          {item.products?.name} ({item.products?.sku})
                        </td>
                        <td className="px-4 py-2">{item.quantity}</td>
                        <td className="px-4 py-2">{item.unit_price.toFixed(2)}</td>
                        <td className="px-4 py-2">{(item.discount_percent || 0).toFixed(2)}%</td>
                        <td className="px-4 py-2">{item.tax_rate}%</td>
                        <td className="px-4 py-2 font-semibold">
                          {(
                            Number(item.line_total || 0) +
                            (Number(item.line_total || 0) * Number(item.tax_rate || 0)) / 100
                          ).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="border-t pt-6 flex justify-end">
                <div className="w-full md:w-80 space-y-2">
                  {invoice.tax_inclusive && (
                    <div className="text-xs text-gray-500">الأسعار المعروضة شاملة الضريبة (مستخرج منها في الحسابات)</div>
                  )}
                  <div className="flex justify-between">
                    <span>المجموع الفرعي:</span>
                    <span>{invoice.subtotal.toFixed(2)}</span>
                  </div>
                  {discountBeforeTax > 0 && (
                    <div className="flex justify-between text-orange-700 dark:text-orange-300">
                      <span>خصم قبل الضريبة{invoice.discount_type === "percent" ? ` (${Number(invoice.discount_value || 0).toFixed(2)}%)` : ""}:</span>
                      <span>{discountBeforeTax.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>الضريبة:</span>
                    <span>{invoice.tax_amount.toFixed(2)}</span>
                  </div>
                  {taxSummary.length > 0 && (
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      {taxSummary.map((t, idx) => (
                        <div key={idx} className="flex justify-between">
                          <span>ملخص ضريبة {t.rate}%:</span>
                          <span>{t.amount.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {shipping > 0 && (
                    <div className="flex justify-between">
                      <span>الشحن{shippingTaxRate > 0 ? ` (ضريبة ${shippingTaxRate}%):` : ":"}</span>
                      <span>{(shipping + shippingTaxAmount).toFixed(2)}</span>
                    </div>
                  )}
                  {discountAfterTax > 0 && (
                    <div className="flex justify-between text-orange-700 dark:text-orange-300">
                      <span>خصم بعد الضريبة{invoice.discount_type === "percent" ? ` (${Number(invoice.discount_value || 0).toFixed(2)}%)` : ""}:</span>
                      <span>{discountAfterTax.toFixed(2)}</span>
                    </div>
                  )}
                  {adjustment !== 0 && (
                    <div className="flex justify-between">
                      <span>التعديل:</span>
                      <span>{adjustment.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="border-t pt-2 flex justify-between font-bold text-lg">
                    <span>الإجمالي:</span>
                    <span>{invoice.total_amount.toFixed(2)}</span>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded mt-4">
                    <p className="text-sm">المبلغ المدفوع: {invoice.paid_amount.toFixed(2)}</p>
                    <p className="text-sm font-semibold">المبلغ المتبقي: {remainingAmount.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3 print:hidden">
            {invoice.status !== "paid" && (
              <>
                {invoice.status === "draft" && (
                  <Button onClick={() => handleChangeStatus("sent")} className="bg-blue-600 hover:bg-blue-700">
                    تحديد كمرسلة
                  </Button>
                )}
                {invoice.status !== "cancelled" && (
                  <Button variant="outline" onClick={() => handleChangeStatus("partially_paid")}>
                    تحديد كمدفوعة جزئياً
                  </Button>
                )}
                {remainingAmount > 0 && (
                  <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => {
                    setPaymentAmount(remainingAmount)
                    setShowPayment(true)
                  }}>
                    تسجيل دفعة
                  </Button>
                )}
                {invoice.status !== "cancelled" && (
                  <Button variant="destructive" onClick={() => setShowCredit(true)}>
                    إصدار مذكرة دائن كاملة
                  </Button>
                )}
                {remainingAmount <= 0 && (
                  <Button onClick={() => handleChangeStatus("paid")} className="bg-green-600 hover:bg-green-700">
                    تحديد كمدفوعة
                  </Button>
                )}
              </>
            )}
          </div>

          {/* Dialog: Receive Payment */}
          <Dialog open={showPayment} onOpenChange={setShowPayment}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>تسجيل دفعة للفاتورة #{invoice.invoice_number}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>المبلغ</Label>
                  <Input
                    type="number"
                    value={paymentAmount}
                    min={0}
                    step={0.01}
                    onChange={(e) => setPaymentAmount(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>تاريخ الدفع</Label>
                  <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
                </div>
              <div className="space-y-2">
                <Label>طريقة الدفع</Label>
                <Input value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} placeholder="cash" />
              </div>
              <div className="space-y-2">
                <Label>الحساب (نقد/بنك)</Label>
                <select
                  className="w-full border rounded px-3 py-2 bg-white dark:bg-slate-900"
                  value={paymentAccountId}
                  onChange={(e) => setPaymentAccountId(e.target.value)}
                >
                  <option value="">اختر الحساب</option>
                  {cashBankAccounts.map((a: any) => (
                    <option key={a.id} value={a.id}>
                      {(a.account_code ? `${a.account_code} - ` : "") + a.account_name}
                    </option>
                  ))}
                </select>
              </div>
                <div className="space-y-2">
                  <Label>مرجع/رقم إيصال (اختياري)</Label>
                  <Input value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowPayment(false)} disabled={savingPayment}>إلغاء</Button>
                <Button
                  onClick={() => recordInvoicePayment(paymentAmount, paymentDate, paymentMethod, paymentRef)}
                  disabled={savingPayment || paymentAmount <= 0 || !paymentAccountId}
                >
                  حفظ الدفعة
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Dialog: Full Credit Note */}
          <Dialog open={showCredit} onOpenChange={setShowCredit}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>إصدار مذكرة دائن كاملة</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>تاريخ المذكرة</Label>
                  <Input type="date" value={creditDate} onChange={(e) => setCreditDate(e.target.value)} />
                </div>
                <p className="text-sm text-red-600">
                  سيتم عكس الإيراد والضريبة والذمم لهذه الفاتورة، وإرجاع المخزون بالكامل. ستصبح قيم الفاتورة صفرًا وتتحول حالتها إلى "ملغاة".
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCredit(false)}>إلغاء</Button>
                <Button variant="destructive" onClick={issueFullCreditNote}>تأكيد إصدار مذكرة دائن</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </main>
    </div>
  )
}
