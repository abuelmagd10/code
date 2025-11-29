"use client"

import { useEffect, useMemo, useState, useRef } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import { useSupabase } from "@/lib/supabase/hooks"
import { Button } from "@/components/ui/button"
import { useParams } from "next/navigation"
import { Pencil, Trash2, Printer, FileDown, ArrowLeft, ArrowRight } from "lucide-react"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import { toastActionError, toastActionSuccess } from "@/lib/notifications"
import { canAction } from "@/lib/authz"
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
  const [appLang, setAppLang] = useState<'ar' | 'en'>(() => {
    if (typeof window === 'undefined') return 'ar'
    try {
      const docLang = document.documentElement?.lang
      if (docLang === 'en') return 'en'
      const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
      const v = fromCookie || localStorage.getItem('app_language') || 'ar'
      return v === 'en' ? 'en' : 'ar'
    } catch { return 'ar' }
  })

  useEffect(() => { 
    loadData()
    ;(async () => {
      try {
        setPermUpdate(await canAction(supabase, 'bills', 'update'))
        setPermDelete(await canAction(supabase, 'bills', 'delete'))
      } catch {}
    })()
    const handler = () => {
      try {
        const docLang = document.documentElement?.lang
        if (docLang === 'en') { setAppLang('en'); return }
        const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
        const v = fromCookie || localStorage.getItem('app_language') || 'ar'
        setAppLang(v === 'en' ? 'en' : 'ar')
      } catch {}
    }
    window.addEventListener('app_language_changed', handler)
    window.addEventListener('storage', (e: any) => { if (e?.key === 'app_language') handler() })
    return () => { window.removeEventListener('app_language_changed', handler) }
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
        } else {
          setNextBillId(null)
          setPrevBillId(null)
        }
      } catch {}
    } finally { setLoading(false) }
  }

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

      // إنشاء صفحة HTML كاملة مع تنسيقات عربية
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
              font-size: 14px;
              line-height: 1.6;
            }
            .print-content {
              max-width: 210mm;
              margin: 0 auto;
              padding: 20px 30px;
              background: #fff;
            }
            /* إخفاء الأزرار */
            button, svg, .print\\:hidden { display: none !important; }
            /* اللوجو */
            img[alt="Company Logo"], img[alt*="Logo"] {
              width: 70px !important;
              height: 70px !important;
              object-fit: contain;
              border-radius: 8px;
            }
            /* العناوين */
            h1 { font-size: 28px; font-weight: 800; color: #1e40af; margin-bottom: 8px; }
            h2 { font-size: 20px; font-weight: 700; color: #111827; margin-bottom: 6px; }
            h3 { font-size: 16px; font-weight: 600; color: #1e40af; border-bottom: 2px solid #3b82f6; padding-bottom: 6px; margin-bottom: 12px; }
            /* الجدول */
            table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; }
            th { background: #1e40af; color: #fff; padding: 10px 8px; font-weight: 600; text-align: center; border: 1px solid #1e3a8a; }
            td { padding: 8px 6px; text-align: center; border: 1px solid #e5e7eb; color: #374151; }
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
            .rounded-lg { border-radius: 8px; }
            .border { border: 1px solid #e5e7eb; }
            .border-b { border-bottom: 1px solid #e5e7eb; }
            .border-t { border-top: 1px solid #e5e7eb; }
            /* المسافات */
            .p-4 { padding: 16px; }
            .p-3 { padding: 12px; }
            .mt-4 { margin-top: 16px; }
            .mb-2 { margin-bottom: 8px; }
            .space-y-4 > * + * { margin-top: 16px; }
            .space-y-2 > * + * { margin-top: 8px; }
            /* أحجام النص */
            .text-xl { font-size: 20px; font-weight: 700; }
            .text-lg { font-size: 18px; font-weight: 600; }
            .text-sm { font-size: 13px; }
            .text-xs { font-size: 12px; }
            .font-bold { font-weight: 700; }
            .font-semibold { font-weight: 600; }
            /* الفليكس */
            .flex { display: flex; }
            .justify-between { justify-content: space-between; }
            .items-center { align-items: center; }
            .items-start { align-items: flex-start; }
            .gap-4 { gap: 16px; }
            .gap-6 { gap: 24px; }
            .grid { display: grid; }
            .grid-cols-2 { grid-template-columns: repeat(2, 1fr); }
            /* إعدادات الطباعة */
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              @page { size: A4; margin: 10mm; }
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

  // Post journal and inventory transactions based on bill lines
  const postBillJournalAndInventory = async () => {
    try {
      if (!bill) return
      setPosting(true)
      const mapping = await findAccountIds(bill.company_id)
      if (!mapping || !mapping.ap) {
        toastActionError(toast, "الترحيل", "فاتورة المورد", "لم يتم العثور على حساب الدائنين")
        return
      }
      const invOrExp = mapping.inventory || mapping.expense
      if (!invOrExp) {
        toastActionError(toast, "الترحيل", "فاتورة المورد", "لم يتم العثور على حساب المخزون أو المصروفات")
        return
      }

      // Prevent duplicate posting
      const { data: exists } = await supabase
        .from("journal_entries")
        .select("id")
        .eq("company_id", mapping.companyId)
        .eq("reference_type", "bill")
        .eq("reference_id", bill.id)
        .limit(1)
      if (exists && exists.length > 0) {
        toastActionSuccess(toast, "التحقق", "فاتورة المورد")
        return
      }

      // Create journal entry
      const { data: entry, error: entryErr } = await supabase
        .from("journal_entries")
        .insert({
          company_id: mapping.companyId,
          reference_type: "bill",
          reference_id: bill.id,
          entry_date: bill.bill_date,
          description: `فاتورة شراء ${bill.bill_number}`,
        })
        .select()
        .single()
      if (entryErr) throw entryErr

      const lines: any[] = [
        { journal_entry_id: entry.id, account_id: invOrExp, debit_amount: bill.subtotal || 0, credit_amount: 0, description: mapping.inventory ? "المخزون" : "مصروفات" },
        { journal_entry_id: entry.id, account_id: mapping.ap, debit_amount: 0, credit_amount: bill.total_amount || 0, description: "حسابات دائنة" },
      ]
      if (mapping.vatReceivable && bill.tax_amount && bill.tax_amount > 0) {
        lines.splice(1, 0, { journal_entry_id: entry.id, account_id: mapping.vatReceivable, debit_amount: bill.tax_amount, credit_amount: 0, description: "ضريبة قابلة للاسترداد" })
      }
      const { error: linesErr } = await supabase.from("journal_entry_lines").insert(lines)
      if (linesErr) throw linesErr

      // Inventory transactions from bill items
      const { data: billItems } = await supabase
        .from("bill_items")
        .select("product_id, quantity")
        .eq("bill_id", bill.id)
      const invTx = (billItems || []).map((it: any) => ({
        company_id: bill.company_id,
        product_id: it.product_id,
        transaction_type: "purchase",
        quantity_change: it.quantity,
        reference_id: bill.id,
        journal_entry_id: entry.id,
        notes: `فاتورة شراء ${bill.bill_number}`,
      }))
      if (invTx.length > 0) {
        const { error: invErr } = await supabase
          .from("inventory_transactions")
          .upsert(invTx, { onConflict: "journal_entry_id,product_id,transaction_type" })
        if (invErr) console.warn("Failed inserting/upserting inventory transactions from bill:", invErr)
      }

      

      toastActionSuccess(toast, "الترحيل", "فاتورة المورد")
    } catch (err: any) {
      console.error("Error posting bill journal/inventory:", err)
      const msg = String(err?.message || "")
      toastActionError(toast, "الترحيل", "فاتورة المورد", msg)
    } finally {
      setPosting(false)
    }
  }

  const changeStatus = async (newStatus: string) => {
    try {
      if (!bill) return
      const { error } = await supabase.from("bills").update({ status: newStatus }).eq("id", bill.id)
      if (error) throw error
      if (newStatus === "sent") {
        await postBillJournalAndInventory()
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
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />
      <main ref={printAreaRef as any} className="flex-1 md:mr-64 p-4 md:p-8 print-area">
        {loading ? (
          <div className="text-gray-600 dark:text-gray-400">جاري التحميل...</div>
        ) : !bill ? (
          <div className="text-red-600">لم يتم العثور على الفاتورة</div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:justify-between items-start gap-3">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{appLang==='en' ? `Supplier Bill #${bill.bill_number}` : `فاتورة شراء #${bill.bill_number}`}</h1>
                <p className="text-gray-600 dark:text-gray-400 mt-1">{appLang==='en' ? `Supplier: ${supplier?.name || ''}` : `المورد: ${supplier?.name || ''}`}</p>
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
                {bill.status !== "cancelled" && bill.status !== "sent" && (
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
                                <span className="text-gray-400">0</span>
                              )}
                            </td>
                            <td className="p-2">{it.unit_price.toFixed(2)}</td>
                            <td className="p-2">{(it.discount_percent || 0).toFixed(2)}%</td>
                            <td className="p-2">{it.tax_rate.toFixed(2)}%</td>
                            <td className="p-2">
                              {it.line_total.toFixed(2)}
                              {returnedQty > 0 && (
                                <div className="text-xs text-gray-500">
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
                      <div className="flex items-center justify-between font-semibold"><span>{appLang==='en' ? 'Total' : 'الإجمالي'}</span><span>{bill.total_amount.toFixed(2)}</span></div>
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
                      <div className="flex items-center justify-between"><span>{appLang==='en' ? 'Paid' : 'المدفوع'}</span><span>{paidTotal.toFixed(2)}</span></div>
                      <div className="flex items-center justify-between"><span>{appLang==='en' ? 'Remaining' : 'المتبقي'}</span><span className="font-semibold">{Math.max((bill.total_amount || 0) - paidTotal, 0).toFixed(2)}</span></div>
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
    </div>
  )
}
