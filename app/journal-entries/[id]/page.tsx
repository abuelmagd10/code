"use client"
import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import { toastActionError, toastActionSuccess } from "@/lib/notifications"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { AlertTriangle, Lock, FileText } from "lucide-react"
import { isDocumentLinkedEntry, isOwner, logJournalEntryEdit, getCurrentUserInfo } from "@/lib/audit-log"
import { BranchCostCenterSelector } from "@/components/branch-cost-center-selector"

interface JournalEntry {
  id: string
  entry_date: string
  description: string | null
  reference_type: string | null
  reference_id: string | null
  company_id?: string
  companies?: { name: string }
  branch_id?: string | null
  cost_center_id?: string | null
  status?: string | null
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

  // Language state
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  useEffect(() => {
    const handler = () => {
      try {
        const docLang = document.documentElement?.lang
        if (docLang === 'en') { setAppLang('en'); return }
        const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
        const v = fromCookie || localStorage.getItem('app_language') || 'ar'
        setAppLang(v === 'en' ? 'en' : 'ar')
      } catch { }
    }
    handler()
    window.addEventListener('app_language_changed', handler)
    return () => window.removeEventListener('app_language_changed', handler)
  }, [])

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

  // 🆕 حالات جديدة للتحكم في صلاحيات التعديل
  const [isUserOwner, setIsUserOwner] = useState(false)
  const [isDocumentLinked, setIsDocumentLinked] = useState(false)
  const [showReasonDialog, setShowReasonDialog] = useState(false)
  const [editReason, setEditReason] = useState("")
  const [originalLines, setOriginalLines] = useState<JournalLine[]>([])
  const [referenceNumber, setReferenceNumber] = useState<string>("")

  // Branch and Cost Center
  const [branchId, setBranchId] = useState<string | null>(null)
  const [costCenterId, setCostCenterId] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true)
        const { data: entryData, error: entryErr } = await supabase
          .from("journal_entries")
          .select("id, entry_date, description, reference_type, reference_id, company_id, branch_id, cost_center_id, status")
          .eq("id", entryId)
          .single()
        if (entryErr) {
          console.warn("فشل جلب القيد:", entryErr.message)
        }

        if (entryData) {
          setEntry(entryData as JournalEntry)
          // Load branch and cost center
          setBranchId(entryData.branch_id || null)
          setCostCenterId(entryData.cost_center_id || null)
          const { data: linesData, error: linesErr } = await supabase
            .from("journal_entry_lines")
            .select("id, account_id, debit_amount, credit_amount, description, chart_of_accounts(account_code, account_name)")
            .eq("journal_entry_id", entryId)
          if (linesErr) {
            console.warn("فشل جلب بنود القيد:", linesErr.message)
          }
          setLines((linesData as JournalLine[]) || [])
          setOriginalLines((linesData as JournalLine[]) || []) // 🆕 حفظ البنود الأصلية
          setEditHeaderDate(String(entryData.entry_date || "").slice(0, 10))
          setEditHeaderDesc(String(entryData.description || ""))
          setEditLines(((linesData as JournalLine[]) || []).map((l) => ({ id: l.id, account_id: l.account_id, description: String(l.description || ""), debit_amount: Number(l.debit_amount || 0), credit_amount: Number(l.credit_amount || 0) })))

          // 🆕 التحقق من نوع القيد وصلاحيات المستخدم
          setIsDocumentLinked(isDocumentLinkedEntry(entryData.reference_type))

          if (entryData.company_id) {
            const { data: accs } = await supabase
              .from("chart_of_accounts")
              .select("id, account_code, account_name")
              .eq("company_id", entryData.company_id)
            setAccounts((accs || []).map((a: any) => ({ id: a.id, code: a.account_code, name: a.account_name })))

            // 🆕 التحقق من أن المستخدم مالك
            const ownerCheck = await isOwner(supabase, entryData.company_id)
            setIsUserOwner(ownerCheck)
          }

          // 🆕 جلب رقم المرجع (إن وجد)
          if (entryData.reference_type && entryData.reference_id) {
            let refNum = ""
            if (entryData.reference_type.includes("invoice")) {
              const { data: inv } = await supabase.from("invoices").select("invoice_number").eq("id", entryData.reference_id).single()
              refNum = inv?.invoice_number || ""
            } else if (entryData.reference_type.includes("bill")) {
              const { data: bill } = await supabase.from("bills").select("bill_number").eq("id", entryData.reference_id).single()
              refNum = bill?.bill_number || ""
            }
            setReferenceNumber(refNum)
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

  const handleGenerateLines = async () => {
    toastActionError(toast, "التوليد", "بنود القيد", appLang === 'en'
      ? "Journal lines must be regenerated from the source document command, not from the journal UI."
      : "يجب إعادة توليد بنود القيد من أمر المستند الأصلي وليس من واجهة القيود.")
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

  // 🔒 قائمة أنواع المراجع المحمية (لا يمكن تعديل القيود المرتبطة بها)
  // 📌 النمط المحاسبي الصارم: لا invoice_cogs أو invoice_cogs_reversal
  const PROTECTED_REFERENCE_TYPES = [
    "invoice",           // فاتورة مبيعات
    "invoice_payment",   // سداد فاتورة مبيعات
    "bill",              // فاتورة مشتريات
    "bill_payment",      // سداد فاتورة مشتريات
    "sales_return",      // مرتجع مبيعات
    "purchase_return",   // مرتجع مشتريات
    "payment",           // سند قبض
    "expense",           // سند صرف
  ]

  // 🔐 التحقق من إمكانية التعديل - المالك فقط + القيود غير المحمية + غير المُرحَّلة
  const canEdit = useMemo(() => {
    // فقط المالك يمكنه تعديل القيود اليومية
    if (!isUserOwner) return false

    // 🔒 منع تعديل القيود المُرحَّلة (posted) — قاعدة البيانات تمنع ذلك أيضاً
    if (entry?.status === 'posted') return false

    // 🔒 فقط القيود اليدوية legacy غير المرحّلة يمكن تعديلها عبر command service
    if (!entry?.reference_type || !["manual_entry", "manual_journal"].includes(entry.reference_type)) {
      return false
    }

    return true
  }, [isUserOwner, entry?.reference_type, entry?.status])

  // 🔐 بدء التعديل مع التحقق من الصلاحيات
  const handleStartEdit = () => {
    if (!isUserOwner) {
      toastActionError(toast, "التعديل", "القيد", appLang === 'en'
        ? "Only the owner can edit journal entries"
        : "فقط المالك يمكنه تعديل القيود اليومية")
      return
    }

    // 🔒 منع تعديل القيود المُرحَّلة (posted) — قاعدة البيانات تمنع ذلك أيضاً
    if (entry?.status === 'posted') {
      toastActionError(toast, "التعديل", "القيد", appLang === 'en'
        ? "Cannot edit a posted journal entry. Please create a reversal entry instead."
        : "لا يمكن تعديل قيد مُرحَّل (posted). لإجراء تصحيح يرجى إنشاء قيد عكسي بدلاً من ذلك.")
      return
    }

    // 🔒 فقط القيود اليدوية legacy غير المرحّلة يمكن تعديلها عبر command service
    if (!entry?.reference_type || !["manual_entry", "manual_journal"].includes(entry.reference_type)) {
      toastActionError(toast, "التعديل", "القيد", appLang === 'en'
        ? "Cannot edit entries linked to invoices, bills, or payments. Edit the source document instead."
        : "لا يمكن تعديل القيود المرتبطة بالفواتير أو المدفوعات. قم بتعديل المستند الأصلي بدلاً من ذلك.")
      return
    }

    setIsEditing(true)
  }

  // 🔐 طلب الحفظ - السبب مطلوب دائماً للتدقيق المحاسبي
  const handleRequestSave = () => {
    if (editLines.length === 0) {
      toastActionError(toast, "الحفظ", "بنود القيد", appLang === 'en'
        ? "At least one line is required"
        : "يجب إضافة سطر واحد على الأقل")
      return
    }
    if (Math.abs(totals.debit - totals.credit) > 0.0001) {
      toastActionError(toast, "الحفظ", "بنود القيد", appLang === 'en'
        ? "Debit and credit totals must be equal"
        : "يجب أن تتساوى إجماليات المدين والدائن")
      return
    }

    // السبب مطلوب دائماً للتدقيق المحاسبي
    setShowReasonDialog(true)
  }

  const handleSave = async (reason: string) => {
    try {
      if (!entry) return
      setIsPosting(true)

      if (entry.reference_type && !["manual_entry", "manual_journal"].includes(entry.reference_type)) {
        throw new Error(appLang === 'en'
          ? "Linked journal entries must be corrected from their source document."
          : "القيود المرتبطة بمستندات يجب تصحيحها من المستند الأصلي.")
      }

      const response = await fetch("/api/journal-entries/manual", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": globalThis.crypto?.randomUUID?.() || `manual-journal-update-${entry.id}-${Date.now()}`,
        },
        body: JSON.stringify({
          entry_id: entry.id,
          entry_date: editHeaderDate,
          description: editHeaderDesc,
          justification: reason,
          supporting_reference: referenceNumber || null,
          branch_id: branchId || null,
          cost_center_id: costCenterId || null,
          lines: editLines.map((line) => ({
            account_id: line.account_id,
            description: line.description || null,
            debit_amount: Number(line.debit_amount || 0),
            credit_amount: Number(line.credit_amount || 0),
            branch_id: branchId || null,
            cost_center_id: costCenterId || null,
          })),
          ui_surface: "manual_journal_detail_page",
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "تعذر حفظ القيد")
      }

      toastActionSuccess(toast, "الحفظ", "القيد")
      setIsEditing(false)
      setShowReasonDialog(false)
      setEditReason("")
      const { data: linesData } = await supabase
        .from("journal_entry_lines")
        .select("id, account_id, debit_amount, credit_amount, description, chart_of_accounts(account_code, account_name)")
        .eq("journal_entry_id", entry.id)
      setLines((linesData as JournalLine[]) || [])
      setOriginalLines((linesData as JournalLine[]) || [])
    } catch (err: any) {
      const rawMsg = String(err?.message || err || "تعذر حفظ القيد")
      // رسالة مخصصة لخطأ trigger المنع من تعديل القيود المُرحَّلة
      const isPostedError = rawMsg.toLowerCase().includes("posted") || rawMsg.includes("Cannot modify a posted")
      const message = isPostedError
        ? (appLang === 'en'
            ? "Cannot modify a posted journal entry. Create a reversal entry instead."
            : "لا يمكن تعديل قيد مُرحَّل. لإجراء تصحيح يرجى إنشاء قيد عكسي.")
        : rawMsg
      toastActionError(toast, "الحفظ", "القيد", message)
    } finally {
      setIsPosting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
          <p className="text-center py-8">{appLang === 'en' ? 'Loading...' : 'جاري التحميل...'}</p>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        {!entry ? (
          <div className="space-y-4">
            <h1 className="text-xl font-semibold">{appLang === 'en' ? 'Journal Entry' : 'قيد اليومية'}</h1>
            <p className="text-red-600">{appLang === 'en' ? 'Entry not found' : 'لم يتم العثور على القيد'}</p>
            <button
              className="px-4 py-2 rounded bg-gray-200 dark:bg-slate-800"
              onClick={() => router.push("/journal-entries")}
            >
              {appLang === 'en' ? 'Back' : 'العودة'}
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-semibold">{appLang === 'en' ? 'Journal Entry' : 'قيد اليومية'}</h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Date:' : 'التاريخ:'} {entry.entry_date?.slice(0, 10)}</p>
                {entry.companies?.name && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Company:' : 'الشركة:'} {entry.companies.name}</p>
                )}
                {entry.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Description:' : 'الوصف:'} {entry.description}</p>
                )}
                {entry.reference_type && entry.reference_id && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {appLang === 'en' ? 'Reference:' : 'مرجع:'} {entry.reference_type} — {entry.reference_id}
                  </p>
                )}

                {/* Branch and Cost Center Selection (Edit Mode) */}
                {isEditing && (
                  <div className="mt-4 pt-4 border-t">
                    <BranchCostCenterSelector
                      branchId={branchId}
                      costCenterId={costCenterId}
                      onBranchChange={setBranchId}
                      onCostCenterChange={setCostCenterId}
                      lang={appLang}
                      showLabels={true}
                      showWarehouse={false}
                    />
                  </div>
                )}
              </div>
              <div className="space-x-2 flex items-center gap-2">
                <button
                  className="px-4 py-2 rounded bg-gray-200 dark:bg-slate-800"
                  onClick={() => router.push("/journal-entries")}
                >
                  {appLang === 'en' ? 'Back' : 'العودة'}
                </button>

                {/* 🆕 شارة توضح حالة القيد */}
                {isDocumentLinked && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs">
                    <Lock className="w-3.5 h-3.5" />
                    <span>{appLang === 'en' ? 'Document-linked' : 'مرتبط بمستند'}</span>
                  </div>
                )}

                {entry && canEdit && (
                  <Button
                    variant="outline"
                    onClick={() => isEditing ? setIsEditing(false) : handleStartEdit()}
                    disabled={isPosting}
                  >
                    {isEditing ? (appLang === 'en' ? 'Cancel Edit' : 'إلغاء التعديل') : (appLang === 'en' ? 'Edit' : 'تعديل')}
                  </Button>
                )}

                {/* 🆕 رسالة للمستخدم غير المالك */}
                {entry && isDocumentLinked && !isUserOwner && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs">
                    <FileText className="w-3.5 h-3.5" />
                    <span>{appLang === 'en' ? 'Edit from source document' : 'التعديل من المستند الأصلي'}</span>
                  </div>
                )}

                {/* 🔒 رسالة للقيود المُرحَّلة (posted) */}
                {entry && entry.status === 'posted' && isUserOwner && !PROTECTED_REFERENCE_TYPES.includes(entry.reference_type || '') && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs">
                    <Lock className="w-3.5 h-3.5" />
                    <span>{appLang === 'en' ? 'Posted: Create a reversal entry to correct' : 'مُرحَّل: أنشئ قيداً عكسياً للتصحيح'}</span>
                  </div>
                )}

                {/* 🔒 رسالة للقيود المحمية (مرتبطة بفواتير/مدفوعات) */}
                {entry && entry.reference_type && PROTECTED_REFERENCE_TYPES.includes(entry.reference_type) && isUserOwner && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs">
                    <Lock className="w-3.5 h-3.5" />
                    <span>{appLang === 'en' ? 'Protected: Edit source document' : 'محمي: عدّل المستند الأصلي'}</span>
                  </div>
                )}

                {isEditing && (
                  <Button onClick={handleRequestSave} disabled={isPosting}>
                    {isPosting ? (appLang === 'en' ? 'Saving...' : 'جاري الحفظ...') : (appLang === 'en' ? 'Save Entry' : 'حفظ القيد')}
                  </Button>
                )}
              </div>
            </div>

            <div className="border rounded">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 dark:bg-slate-900">
                    <th className="px-4 py-2 text-right">{appLang === 'en' ? 'Account' : 'الحساب'}</th>
                    <th className="px-4 py-2 text-right">{appLang === 'en' ? 'Description' : 'الوصف'}</th>
                    <th className="px-4 py-2 text-right">{appLang === 'en' ? 'Debit' : 'مدين'}</th>
                    <th className="px-4 py-2 text-right">{appLang === 'en' ? 'Credit' : 'دائن'}</th>
                    {isEditing && <th className="px-4 py-2" />}
                  </tr>
                </thead>
                <tbody>
                  {(!isEditing && (Array.isArray(lines) ? lines : []).length === 0) ? (
                    <tr>
                      <td className="px-4 py-3 text-center text-gray-500 dark:text-gray-400" colSpan={4}>
                        {appLang === 'en' ? 'No lines for this entry' : 'لا توجد بنود لهذا القيد'}
                        {(["invoice", "bill", "invoice_payment"].includes(String(entry.reference_type || ""))) && (
                          <div className="mt-3">
                            <button
                              className="px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-50"
                              disabled={isPosting}
                              onClick={handleGenerateLines}
                            >
                              {isPosting ? (appLang === 'en' ? 'Generating...' : 'جاري الإنشاء...') : (appLang === 'en' ? 'Generate lines automatically' : 'إنشاء بنود القيد تلقائيًا')}
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
                      {appLang === 'en' ? 'Totals' : 'الإجماليات'}
                    </td>
                    <td className="px-4 py-2 font-medium">{totals.debit.toFixed(2)}</td>
                    <td className="px-4 py-2 font-medium">{totals.credit.toFixed(2)}</td>
                    {isEditing && (
                      <td className="px-4 py-2 text-right">
                        <Button variant="outline" onClick={addLine}>{appLang === 'en' ? 'Add Line' : 'إضافة سطر'}</Button>
                      </td>
                    )}
                  </tr>
                </tfoot>
              </table>
            </div>
            {isEditing && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>{appLang === 'en' ? 'Entry Date' : 'تاريخ القيد'}</Label>
                  <Input type="date" value={editHeaderDate} onChange={(e) => setEditHeaderDate(e.target.value)} />
                </div>
                <div>
                  <Label>{appLang === 'en' ? 'Description' : 'الوصف'}</Label>
                  <Input value={editHeaderDesc} onChange={(e) => setEditHeaderDesc(e.target.value)} />
                </div>
              </div>
            )}

            {/* 🆕 تحذير للقيود المرتبطة بمستند */}
            {isDocumentLinked && !isEditing && (
              <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                  <div>
                    <p className="font-medium text-amber-800 dark:text-amber-300">
                      {appLang === 'en' ? 'Document-Linked Entry' : 'قيد مرتبط بمستند'}
                    </p>
                    <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                      {appLang === 'en'
                        ? 'This entry is automatically generated from a source document. Any changes should be made from the original document to maintain data integrity.'
                        : 'هذا القيد تم إنشاؤه تلقائياً من مستند مصدر. يُفضل إجراء أي تعديلات من المستند الأصلي للحفاظ على سلامة البيانات.'
                      }
                    </p>
                    {referenceNumber && (
                      <p className="text-sm text-amber-600 dark:text-amber-500 mt-2">
                        {appLang === 'en' ? 'Reference:' : 'المرجع:'} <span className="font-mono">{referenceNumber}</span>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 🆕 Dialog لإدخال سبب التعديل */}
        <Dialog open={showReasonDialog} onOpenChange={setShowReasonDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                {appLang === 'en' ? 'Edit Reason Required' : 'سبب التعديل مطلوب'}
              </DialogTitle>
              <DialogDescription>
                {appLang === 'en'
                  ? 'This entry is linked to a document. Please provide a reason for this edit to maintain audit trail.'
                  : 'هذا القيد مرتبط بمستند. يرجى إدخال سبب التعديل للحفاظ على سجل المراجعة.'
                }
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>{appLang === 'en' ? 'Reason for Edit' : 'سبب التعديل'}</Label>
                <Textarea
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder={appLang === 'en' ? 'e.g., Correction of entry error, Amount adjustment...' : 'مثال: تصحيح خطأ إدخال، تعديل المبلغ...'}
                  rows={3}
                />
              </div>
              {referenceNumber && (
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {appLang === 'en' ? 'Document Reference:' : 'مرجع المستند:'} <span className="font-mono">{referenceNumber}</span>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowReasonDialog(false)}>
                {appLang === 'en' ? 'Cancel' : 'إلغاء'}
              </Button>
              <Button
                onClick={() => handleSave(editReason)}
                disabled={!editReason.trim() || isPosting}
              >
                {isPosting ? (appLang === 'en' ? 'Saving...' : 'جاري الحفظ...') : (appLang === 'en' ? 'Save with Reason' : 'حفظ مع السبب')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}
