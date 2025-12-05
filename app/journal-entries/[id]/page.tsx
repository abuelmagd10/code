"use client"
import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Sidebar } from "@/components/sidebar"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import { toastActionError, toastActionSuccess } from "@/lib/notifications"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface JournalEntry {
  id: string
  entry_date: string
  description: string | null
  reference_type: string | null
  reference_id: string | null
  company_id?: string
  companies?: { name: string }
}

interface JournalLine {
  id: string
  account_id: string
  debit_amount: number
  credit_amount: number
  description: string | null
  chart_of_accounts?: { account_name: string; account_code: string }
}

export default function JournalEntryDetailPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const params = useParams()
  const router = useRouter()
  const entryId = params?.id as string

  const [entry, setEntry] = useState<JournalEntry | null>(null)
  const [lines, setLines] = useState<JournalLine[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isPosting, setIsPosting] = useState(false)
  const [autoAttempted, setAutoAttempted] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editHeaderDate, setEditHeaderDate] = useState<string>("")
  const [editHeaderDesc, setEditHeaderDesc] = useState<string>("")
  const [editLines, setEditLines] = useState<Array<{ id?: string; account_id: string; description: string; debit_amount: number; credit_amount: number }>>([])
  const [accounts, setAccounts] = useState<Array<{ id: string; code?: string; name: string }>>([])

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true)
        const { data: entryData, error: entryErr } = await supabase
          .from("journal_entries")
          .select("id, entry_date, description, reference_type, reference_id, company_id")
          .eq("id", entryId)
          .single()
        if (entryErr) {
          console.warn("فشل جلب القيد:", entryErr.message)
        }

        if (entryData) {
          setEntry(entryData as JournalEntry)
          const { data: linesData, error: linesErr } = await supabase
            .from("journal_entry_lines")
            .select("id, account_id, debit_amount, credit_amount, description, chart_of_accounts(account_code, account_name)")
            .eq("journal_entry_id", entryId)
          if (linesErr) {
            console.warn("فشل جلب بنود القيد:", linesErr.message)
          }
          setLines((linesData as JournalLine[]) || [])
          setEditHeaderDate(String(entryData.entry_date || "").slice(0, 10))
          setEditHeaderDesc(String(entryData.description || ""))
          setEditLines(((linesData as JournalLine[]) || []).map((l) => ({ id: l.id, account_id: l.account_id, description: String(l.description || ""), debit_amount: Number(l.debit_amount || 0), credit_amount: Number(l.credit_amount || 0) })))
          if (entryData.company_id) {
            const { data: accs } = await supabase
              .from("chart_of_accounts")
              .select("id, account_code, account_name")
              .eq("company_id", entryData.company_id)
            setAccounts((accs || []).map((a: any) => ({ id: a.id, code: a.account_code, name: a.account_name })))
          }
        } else {
          setEntry(null)
          setLines([])
        }
      } catch (err) {
        console.error("خطأ في تحميل القيد:", err)
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [entryId, supabase])

  // Auto-generate lines on first load if none exist for invoice-linked entries
  useEffect(() => {
    if (isLoading) return
    if (autoAttempted) return
    if (!entry) return
    const noLines = !(Array.isArray(lines) && lines.length > 0)
    if (
      noLines &&
      ["invoice", "bill", "invoice_payment"].includes(String(entry.reference_type || "")) &&
      entry.reference_id
    ) {
      setAutoAttempted(true)
      handleGenerateLines()
    }
  }, [isLoading, entry, lines])

  const findAccountIds = async () => {
    if (!entry || !entry.company_id) return null
    const { data: accounts } = await supabase
      .from("chart_of_accounts")
      .select("id, account_code, account_type, account_name, sub_type")
      .eq("company_id", entry.company_id)
    if (!accounts) return null

    const byCode = (code: string) => accounts.find((a: any) => String(a.account_code || "").toUpperCase() === code)?.id
    const byTypeFirst = (type: string) => accounts.find((a: any) => String(a.account_type || "").toLowerCase() === type.toLowerCase())?.id
    const byNameIncludes = (name: string) => accounts.find((a: any) => String(a.account_name || "").toLowerCase().includes(name.toLowerCase()))?.id
    const bySubType = (st: string) => accounts.find((a: any) => String(a.sub_type || "").toLowerCase() === st.toLowerCase())?.id

    // Primary: use explicit sub_type seeded in Arabic COA
    const ar =
      bySubType("accounts_receivable") ||
      byCode("1130") ||
      byNameIncludes("الحسابات المدينة") ||
      byNameIncludes("receivable") ||
      byTypeFirst("asset")

    const revenue =
      bySubType("sales_revenue") ||
      byCode("4000") ||
      byNameIncludes("المبيعات") ||
      byNameIncludes("revenue") ||
      byTypeFirst("income")

    const vatPayable =
      bySubType("vat_output") ||
      byCode("2103") ||
      byNameIncludes("output vat") ||
      byNameIncludes("ضريبة") ||
      byTypeFirst("liability")

    const cash =
      bySubType("cash") ||
      byCode("1110") ||
      byNameIncludes("cash") ||
      byNameIncludes("نقد") ||
      byTypeFirst("asset")

    const bank =
      bySubType("bank") ||
      byCode("1010") ||
      byCode("1120") ||
      byNameIncludes("bank") ||
      byNameIncludes("بنك") ||
      byTypeFirst("asset")

    const ap =
      bySubType("accounts_payable") ||
      byCode("2000") ||
      byNameIncludes("الحسابات الدائنة") ||
      byNameIncludes("payable") ||
      byTypeFirst("liability")

    const vatReceivable =
      bySubType("vat_input") ||
      byCode("1140") ||
      byNameIncludes("input vat") ||
      byNameIncludes("ضريبة") ||
      byTypeFirst("asset")

    const inventory =
      bySubType("inventory") ||
      byNameIncludes("inventory") ||
      byTypeFirst("asset")

    const expense =
      bySubType("operating_expenses") ||
      byNameIncludes("مصروف") ||
      byNameIncludes("expense") ||
      byTypeFirst("expense")

    const shippingAccount =
      byCode("7000") ||
      byNameIncludes("بوسطة") ||
      byNameIncludes("byosta") ||
      byNameIncludes("الشحن") ||
      byNameIncludes("shipping") ||
      null

    return { ar, revenue, vatPayable, cash, bank, ap, vatReceivable, inventory, expense, shippingAccount, companyId: entry.company_id }
  }

  const handleGenerateLines = async () => {
    try {
      if (!entry) return
      setIsPosting(true)

      // Support auto-generation for invoice- and bill-linked entries
      if (!entry.reference_id) {
        toastActionError(toast, "التوليد", "بنود القيد", "القيد لا يحتوي على مرجع صالح")
        return
      }

      // Check if lines already exist
      const { data: existing } = await supabase
        .from("journal_entry_lines")
        .select("id")
        .eq("journal_entry_id", entry.id)
        .limit(1)
      if (existing && existing.length > 0) {
        return
      }

      const mapping = await findAccountIds()
      let linesToInsert: any[] = []

      if (entry.reference_type === "invoice") {
        if (!mapping || !mapping.ar || !mapping.revenue) {
          console.warn("لم يتم العثور على حسابات AR/Revenue المناسبة.")
          toastActionError(toast, "الجلب", "حسابات القيد", "تعذر العثور على حسابات الح.المدينة/المبيعات")
          return
        }
        const { data: inv } = await supabase
          .from("invoices")
          .select("invoice_number, subtotal, tax_amount, total_amount, shipping")
          .eq("id", entry.reference_id)
          .single()
        if (!inv) {
          console.warn("تعذر جلب بيانات الفاتورة المرتبطة بالقيد.")
          toastActionError(toast, "الجلب", "الفاتورة", "تعذر جلب بيانات الفاتورة المرتبطة بالقيد")
          return
        }
        linesToInsert = [
          {
            journal_entry_id: entry.id,
            account_id: mapping.ar,
            debit_amount: Number(inv.total_amount || 0),
            credit_amount: 0,
            description: inv.invoice_number ? `الحسابات المدينة — ${inv.invoice_number}` : "الحسابات المدينة",
          },
          {
            journal_entry_id: entry.id,
            account_id: mapping.revenue,
            debit_amount: 0,
            credit_amount: Number(inv.subtotal || 0),
            description: inv.invoice_number ? `المبيعات — ${inv.invoice_number}` : "المبيعات",
          },
        ]
        if (Number(inv.shipping || 0) > 0) {
          linesToInsert.push({
            journal_entry_id: entry.id,
            account_id: mapping.shippingAccount || mapping.revenue,
            debit_amount: 0,
            credit_amount: Number(inv.shipping || 0),
            description: "الشحن",
          })
        }
        if (mapping.vatPayable && inv.tax_amount && Number(inv.tax_amount) > 0) {
          linesToInsert.push({
            journal_entry_id: entry.id,
            account_id: mapping.vatPayable,
            debit_amount: 0,
            credit_amount: Number(inv.tax_amount || 0),
            description: inv.invoice_number ? `ضريبة القيمة المضافة المستحقة — ${inv.invoice_number}` : "ضريبة القيمة المضافة المستحقة",
          })
        }
      } else if (entry.reference_type === "invoice_payment") {
        const cashOrBank = mapping?.cash || mapping?.bank
        if (!mapping || !mapping.ar || !cashOrBank) {
          const missing = !mapping?.ar ? "الحسابات المدينة" : "نقد/بنك"
          toastActionError(toast, "الجلب", "حسابات القيد", `تعذر العثور على حساب ${missing}`)
          return
        }
        const { data: inv } = await supabase
          .from("invoices")
          .select("invoice_number, paid_amount")
          .eq("id", entry.reference_id)
          .single()
        if (!inv) {
          toastActionError(toast, "الجلب", "الفاتورة", "تعذر جلب بيانات الفاتورة المرتبطة بالدفع")
          return
        }
        const amount = Number(inv.paid_amount || 0)
        if (amount <= 0) {
          toastActionError(toast, "التوليد", "بنود القيد", "مبلغ السداد غير صالح أو يساوي صفرًا")
          return
        }
        linesToInsert = [
          {
            journal_entry_id: entry.id,
            account_id: cashOrBank,
            debit_amount: amount,
            credit_amount: 0,
            description: inv.invoice_number ? `نقد/بنك — ${inv.invoice_number}` : "نقد/بنك",
          },
          {
            journal_entry_id: entry.id,
            account_id: mapping.ar,
            debit_amount: 0,
            credit_amount: amount,
            description: inv.invoice_number ? `الحسابات المدينة — ${inv.invoice_number}` : "الحسابات المدينة",
          },
        ]
      } else if (entry.reference_type === "bill") {
        if (!mapping || !mapping.ap) {
          toastActionError(toast, "الجلب", "حسابات القيد", "تعذر العثور على حساب الح.الدائنة")
          return
        }
        const invOrExp = mapping.inventory || mapping.expense
        if (!invOrExp) {
          toastActionError(toast, "الجلب", "حسابات القيد", "تعذر العثور على المخزون أو المصروفات")
          return
        }
        const { data: bill } = await supabase
          .from("bills")
          .select("bill_number, subtotal, tax_amount, total_amount")
          .eq("id", entry.reference_id)
          .single()
        if (!bill) {
          toastActionError(toast, "الجلب", "الفاتورة", "تعذر جلب بيانات فاتورة المورد المرتبطة")
          return
        }
        linesToInsert = [
          {
            journal_entry_id: entry.id,
            account_id: invOrExp,
            debit_amount: Number(bill.subtotal || 0),
            credit_amount: 0,
            description: (mapping.inventory ? "المخزون" : "مصروفات") + (bill.bill_number ? ` — ${bill.bill_number}` : ""),
          },
          {
            journal_entry_id: entry.id,
            account_id: mapping.ap,
            debit_amount: 0,
            credit_amount: Number(bill.total_amount || 0),
            description: bill.bill_number ? `الحسابات الدائنة — ${bill.bill_number}` : "الحسابات الدائنة",
          },
        ]
        if (mapping.vatReceivable && bill.tax_amount && Number(bill.tax_amount) > 0) {
          linesToInsert.splice(1, 0, {
            journal_entry_id: entry.id,
            account_id: mapping.vatReceivable,
            debit_amount: Number(bill.tax_amount || 0),
            credit_amount: 0,
            description: bill.bill_number ? `ضريبة قابلة للاسترداد — ${bill.bill_number}` : "ضريبة قابلة للاسترداد",
          })
        }
      } else {
        toastActionError(toast, "التوليد", "بنود القيد", "نوع المرجع غير مدعوم")
        return
      }

      const { error: linesErr } = await supabase.from("journal_entry_lines").insert(linesToInsert)
      if (linesErr) throw linesErr
      toastActionSuccess(toast, "الإنشاء", "بنود القيد")

      // Reload lines
      const { data: linesData, error: reloadErr } = await supabase
        .from("journal_entry_lines")
        .select("id, account_id, debit_amount, credit_amount, description, chart_of_accounts(account_code, account_name)")
        .eq("journal_entry_id", entry.id)
      if (reloadErr) {
        console.warn("فشل إعادة تحميل بنود القيد:", reloadErr.message)
      }
      setLines((linesData as JournalLine[]) || [])
    } catch (err: any) {
      console.error("فشل إنشاء بنود القيد تلقائيًا:", err)
      const message = err?.message ? String(err.message) : "حدث خطأ مجهول أثناء الإنشاء"
      toastActionError(toast, "الإنشاء", "بنود القيد", message)
    } finally {
      setIsPosting(false)
    }
  }

  const totals = useMemo(() => {
    const source = isEditing ? editLines : lines
    const debit = (Array.isArray(source) ? source : []).reduce((s, l) => s + Number(l.debit_amount || 0), 0)
    const credit = (Array.isArray(source) ? source : []).reduce((s, l) => s + Number(l.credit_amount || 0), 0)
    return { debit, credit }
  }, [lines, editLines, isEditing])

  const addLine = () => {
    setEditLines([...editLines, { account_id: accounts[0]?.id || "", description: "", debit_amount: 0, credit_amount: 0 }])
  }

  const removeLine = (idx: number) => {
    const next = [...editLines]
    next.splice(idx, 1)
    setEditLines(next)
  }

  const updateLine = (idx: number, patch: Partial<{ account_id: string; description: string; debit_amount: number; credit_amount: number }>) => {
    const next = [...editLines]
    next[idx] = { ...next[idx], ...patch }
    if (patch.debit_amount !== undefined) next[idx].credit_amount = 0
    if (patch.credit_amount !== undefined) next[idx].debit_amount = 0
    setEditLines(next)
  }

  const handleSave = async () => {
    try {
      if (!entry) return
      if (editLines.length === 0) {
        toastActionError(toast, "الحفظ", "بنود القيد", "يجب إضافة سطر واحد على الأقل")
        return
      }
      if (Math.abs(totals.debit - totals.credit) > 0.0001) {
        toastActionError(toast, "الحفظ", "بنود القيد", "يجب أن تتساوى إجماليات المدين والدائن")
        return
      }
      setIsPosting(true)
      const { error: updErr } = await supabase
        .from("journal_entries")
        .update({ entry_date: editHeaderDate, description: editHeaderDesc })
        .eq("id", entry.id)
      if (updErr) throw updErr
      const { error: delErr } = await supabase
        .from("journal_entry_lines")
        .delete()
        .eq("journal_entry_id", entry.id)
      if (delErr) throw delErr
      const payload = editLines.map((l) => ({ journal_entry_id: entry.id, account_id: l.account_id, description: l.description || null, debit_amount: Number(l.debit_amount || 0), credit_amount: Number(l.credit_amount || 0) }))
      const { error: insErr } = await supabase.from("journal_entry_lines").insert(payload)
      if (insErr) throw insErr
      toastActionSuccess(toast, "الحفظ", "القيد")
      setIsEditing(false)
      const { data: linesData } = await supabase
        .from("journal_entry_lines")
        .select("id, account_id, debit_amount, credit_amount, description, chart_of_accounts(account_code, account_name)")
        .eq("journal_entry_id", entry.id)
      setLines((linesData as JournalLine[]) || [])
    } catch (err: any) {
      const message = err?.message ? String(err.message) : "تعذر حفظ القيد"
      toastActionError(toast, "الحفظ", "القيد", message)
    } finally {
      setIsPosting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
        <Sidebar />
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
          <p className="text-center py-8">{appLang==='en' ? 'Loading...' : 'جاري التحميل...'}</p>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />
      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        {!entry ? (
          <div className="space-y-4">
            <h1 className="text-xl font-semibold">{appLang==='en' ? 'Journal Entry' : 'قيد اليومية'}</h1>
            <p className="text-red-600">{appLang==='en' ? 'Entry not found' : 'لم يتم العثور على القيد'}</p>
            <button
              className="px-4 py-2 rounded bg-gray-200 dark:bg-slate-800"
              onClick={() => router.push("/journal-entries")}
            >
              {appLang==='en' ? 'Back' : 'العودة'}
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-semibold">{appLang==='en' ? 'Journal Entry' : 'قيد اليومية'}</h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">{appLang==='en' ? 'Date:' : 'التاريخ:'} {entry.entry_date?.slice(0, 10)}</p>
                {entry.companies?.name && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">{appLang==='en' ? 'Company:' : 'الشركة:'} {entry.companies.name}</p>
                )}
                {entry.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">{appLang==='en' ? 'Description:' : 'الوصف:'} {entry.description}</p>
                )}
                {entry.reference_type && entry.reference_id && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {appLang==='en' ? 'Reference:' : 'مرجع:'} {entry.reference_type} — {entry.reference_id}
                  </p>
                )}
              </div>
              <div className="space-x-2">
                <button
                  className="px-4 py-2 rounded bg-gray-200 dark:bg-slate-800"
                  onClick={() => router.push("/journal-entries")}
                >
                  {appLang==='en' ? 'Back' : 'العودة'}
                </button>
                {entry && (
                  <Button variant="outline" onClick={() => setIsEditing(!isEditing)} disabled={isPosting}>
                    {isEditing ? (appLang==='en' ? 'Cancel Edit' : 'إلغاء التعديل') : (appLang==='en' ? 'Edit' : 'تعديل')}
                  </Button>
                )}
                {isEditing && (
                  <Button onClick={handleSave} disabled={isPosting}>
                    {isPosting ? (appLang==='en' ? 'Saving...' : 'جاري الحفظ...') : (appLang==='en' ? 'Save Entry' : 'حفظ القيد')}
                  </Button>
                )}
              </div>
            </div>

            <div className="border rounded">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 dark:bg-slate-900">
                    <th className="px-4 py-2 text-right">{appLang==='en' ? 'Account' : 'الحساب'}</th>
                    <th className="px-4 py-2 text-right">{appLang==='en' ? 'Description' : 'الوصف'}</th>
                    <th className="px-4 py-2 text-right">{appLang==='en' ? 'Debit' : 'مدين'}</th>
                    <th className="px-4 py-2 text-right">{appLang==='en' ? 'Credit' : 'دائن'}</th>
                    {isEditing && <th className="px-4 py-2" />}
                  </tr>
                </thead>
                <tbody>
                  {(!isEditing && (Array.isArray(lines) ? lines : []).length === 0) ? (
                    <tr>
                      <td className="px-4 py-3 text-center text-gray-500 dark:text-gray-400" colSpan={4}>
                        {appLang==='en' ? 'No lines for this entry' : 'لا توجد بنود لهذا القيد'}
                        {(["invoice", "bill", "invoice_payment"].includes(String(entry.reference_type || ""))) && (
                          <div className="mt-3">
                            <button
                              className="px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-50"
                              disabled={isPosting}
                              onClick={handleGenerateLines}
                            >
                              {isPosting ? (appLang==='en' ? 'Generating...' : 'جاري الإنشاء...') : (appLang==='en' ? 'Generate lines automatically' : 'إنشاء بنود القيد تلقائيًا')}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ) : (!isEditing ? (
                    (lines || []).map((ln) => (
                      <tr key={ln.id} className="border-b">
                        <td className="px-4 py-2">
                          {ln.chart_of_accounts?.account_code ? `${ln.chart_of_accounts.account_code} — ` : ""}
                          {ln.chart_of_accounts?.account_name || ln.account_id}
                        </td>
                        <td className="px-4 py-2">{ln.description || ""}</td>
                        <td className="px-4 py-2">{Number(ln.debit_amount || 0).toFixed(2)}</td>
                        <td className="px-4 py-2">{Number(ln.credit_amount || 0).toFixed(2)}</td>
                      </tr>
                    ))
                  ) : (
                    editLines.map((ln, idx) => (
                      <tr key={idx} className="border-b">
                        <td className="px-4 py-2">
                          <select className="w-full border rounded p-2" value={ln.account_id} onChange={(e) => updateLine(idx, { account_id: e.target.value })}>
                            {accounts.map((a) => (
                              <option key={a.id} value={a.id}>{a.code ? `${a.code} — ` : ""}{a.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <Input value={ln.description} onChange={(e) => updateLine(idx, { description: e.target.value })} />
                        </td>
                        <td className="px-4 py-2">
                          <Input type="number" step="0.01" value={ln.debit_amount} onChange={(e) => updateLine(idx, { debit_amount: Number(e.target.value || 0) })} />
                        </td>
                        <td className="px-4 py-2">
                          <Input type="number" step="0.01" value={ln.credit_amount} onChange={(e) => updateLine(idx, { credit_amount: Number(e.target.value || 0) })} />
                        </td>
                        <td className="px-4 py-2 text-center">
                          <Button variant="outline" onClick={() => removeLine(idx)}>حذف</Button>
                        </td>
                      </tr>
                    ))
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t">
                    <td className="px-4 py-2 font-medium" colSpan={2}>
                      {appLang==='en' ? 'Totals' : 'الإجماليات'}
                    </td>
                    <td className="px-4 py-2 font-medium">{totals.debit.toFixed(2)}</td>
                    <td className="px-4 py-2 font-medium">{totals.credit.toFixed(2)}</td>
                    {isEditing && (
                      <td className="px-4 py-2 text-right">
                        <Button variant="outline" onClick={addLine}>{appLang==='en' ? 'Add Line' : 'إضافة سطر'}</Button>
                      </td>
                    )}
                  </tr>
                </tfoot>
              </table>
            </div>
            {isEditing && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>{appLang==='en' ? 'Entry Date' : 'تاريخ القيد'}</Label>
                  <Input type="date" value={editHeaderDate} onChange={(e) => setEditHeaderDate(e.target.value)} />
                </div>
                <div>
                  <Label>{appLang==='en' ? 'Description' : 'الوصف'}</Label>
                  <Input value={editHeaderDesc} onChange={(e) => setEditHeaderDesc(e.target.value)} />
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
  const appLang = typeof window !== 'undefined' ? ((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') : 'ar'
