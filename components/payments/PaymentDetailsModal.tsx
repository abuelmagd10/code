"use client"

import { useState, useEffect } from "react"
import { useSupabase } from "@/lib/supabase/hooks"
import Link from "next/link"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import {
  FileText, ListChecks, History, Activity,
  CheckCircle2, XCircle, Clock, UserCircle, AlertCircle, RefreshCcw,
  Building2, User as UserIcon, Calendar, Hash, Banknote
} from "lucide-react"

/**
 * v3.74.124 — comprehensive rewrite of the Payment Details modal.
 *
 * The previous version had user-facing bugs the operator would never know to
 * trust around: reference field read the wrong column (always blank), default
 * currency was "SAR" on an Egyptian system, audit log dumped raw JSON, action
 * codes leaked as PAYMENT_CREATE / PAYMENT_APPROVE strings, status badges
 * covered only 4 of the 6 real statuses, etc. This rewrite:
 *   - reads the correct DB columns
 *   - falls back to the company's actual base currency
 *   - translates every status, payment_method, and audit action to readable
 *     Arabic/English
 *   - turns the audit log JSON into a user-readable diff (old → new) per field
 *   - surfaces the void/correction state in the header
 *   - shows branch, creator, linked invoice, and source of refunds (was missing)
 *   - hides the FX card when there's no FX (currency == base AND rate == 1)
 */

interface PaymentDetailsModalProps {
  paymentId: string | null
  isOpen: boolean
  onClose: () => void
  appLang: 'ar' | 'en'
}

// ─── Translation helpers ────────────────────────────────────────────────────
// Centralised so the user never sees raw DB tokens.

const statusLabel = (status: string, lang: 'ar' | 'en') => {
  const map: Record<string, [string, string]> = {
    approved:         ['Approved',          'مُعتَمَدَة'],
    rejected:         ['Rejected',          'مَرفوضَة'],
    pending:          ['Pending',           'بانتظار الاعتماد'],
    pending_manager:  ['Pending Manager',   'بانتظار الإدارة'],
    pending_director: ['Pending Director',  'بانتظار المُدير العام'],
    voided:           ['Voided',            'مُلغاة بتَصحيح'],
    draft:            ['Draft',             'مُسَوَّدَة'],
    cancelled:        ['Cancelled',         'مُلغاة'],
  }
  const pair = map[status] || [status, status]
  return lang === 'en' ? pair[0] : pair[1]
}

const statusBadgeClass = (status: string) => {
  switch (status) {
    case 'approved':         return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300'
    case 'rejected':         return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300'
    case 'pending':
    case 'pending_manager':  return 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300'
    case 'pending_director': return 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300'
    case 'voided':
    case 'cancelled':        return 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300'
    case 'draft':            return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300'
    default:                 return 'bg-slate-100 text-slate-700 border-slate-200'
  }
}

const paymentMethodLabel = (method: string | null | undefined, lang: 'ar' | 'en') => {
  const map: Record<string, [string, string]> = {
    cash:             ['Cash',                'نَقداً'],
    transfer:         ['Bank Transfer',       'حَوالَة بَنكية'],
    bank_transfer:    ['Bank Transfer',       'حَوالَة بَنكية'],
    check:            ['Check',               'شيك'],
    cheque:           ['Check',               'شيك'],
    card:             ['Card',                'بِطاقَة'],
    customer_credit:  ['Customer Credit',     'رَصيد العَميل الدائن'],
    online:           ['Online Payment',      'دَفع إِلكترونى'],
  }
  const key = String(method || '').toLowerCase()
  const pair = map[key]
  if (pair) return lang === 'en' ? pair[0] : pair[1]
  return method || '—'
}

const actionLabel = (action: string, lang: 'ar' | 'en') => {
  const a = String(action || '').toUpperCase()
  const map: Record<string, [string, string]> = {
    PAYMENT_CREATE:        ['Payment created',         'إِنشاء الدَّفعَة'],
    CREATE:                ['Created',                 'إِنشاء'],
    PAYMENT_UPDATE:        ['Payment updated',         'تَعديل الدَّفعَة'],
    UPDATE:                ['Updated',                 'تَعديل'],
    PAYMENT_APPROVE:       ['Payment approved',        'اعتماد الدَّفعَة'],
    APPROVE:               ['Approved',                'اعتماد'],
    PAYMENT_REJECT:        ['Payment rejected',        'رَفض الدَّفعَة'],
    REJECT:                ['Rejected',                'رَفض'],
    PAYMENT_VOID:          ['Payment voided (correction)', 'إِلغاء الدَّفعَة (تَصحيح)'],
    VOID:                  ['Voided',                  'إِلغاء بتَصحيح'],
    PAYMENT_NOTES_UPDATE:  ['Notes updated',           'تَعديل المُلاحَظات'],
    NOTES_UPDATE:          ['Notes updated',           'تَعديل المُلاحَظات'],
    PAYMENT_DELETE:        ['Payment deleted',         'حَذف الدَّفعَة'],
    DELETE:                ['Deleted',                 'حَذف'],
  }
  const pair = map[a]
  if (pair) return lang === 'en' ? pair[0] : pair[1]
  // Last-resort: humanise unknown tokens (e.g. PAYMENT_FOO → "Payment foo")
  return a.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// Translate JSON field names so the audit log diff reads as user prose,
// not as a column dump.
const fieldLabel = (field: string, lang: 'ar' | 'en') => {
  const map: Record<string, [string, string]> = {
    amount:               ['Amount',           'المَبلَغ'],
    payment_date:         ['Date',             'التاريخ'],
    payment_method:       ['Method',           'طَريقَة الدَّفع'],
    reference_number:     ['Reference',        'المَرجع'],
    notes:                ['Notes',            'المُلاحَظات'],
    account_id:           ['Account',          'الحِساب'],
    status:               ['Status',           'الحالَة'],
    voided_at:            ['Voided at',        'وَقت الإِلغاء'],
    void_reason:          ['Void reason',      'سَبَب الإِلغاء'],
    voided_by:            ['Voided by',        'الذى أَلغى'],
    voids_payment_id:     ['Voids payment',    'يُلغى دَفعَة'],
    voided_by_payment_id: ['Voided by',        'مُلغاة بواسطَة'],
    rejection_reason:     ['Rejection reason', 'سَبَب الرَّفض'],
    invoice_id:           ['Invoice',          'الفاتورَة'],
    bill_id:              ['Supplier bill',    'فاتورَة المُورِّد'],
    customer_id:          ['Customer',         'العَميل'],
    supplier_id:          ['Supplier',         'المُورِّد'],
    branch_id:            ['Branch',           'الفَرع'],
    cost_center_id:       ['Cost center',      'مَركَز التَّكلِفَة'],
    company_id:           ['Company',          'الشَّركَة'],
    created_by:           ['Created by',       'مُنشَأَة بواسطَة'],
    approved_by:          ['Approved by',      'مُعتَمَدَة بواسطَة'],
    is_deleted:           ['Deleted',          'مَحذوفَة'],
    journal_entry_id:     ['Journal entry',    'القَيد المحاسبى'],
    currency_code:        ['Currency',         'العُملَة'],
    exchange_rate:        ['Exchange rate',    'سِعر الصَّرف'],
    base_currency_amount: ['Amount (base)',    'المَبلَغ بالعُملَة الأَساسية'],
    unallocated_amount:   ['Unallocated',      'غَير مُوَزَّع'],
  }
  const pair = map[field]
  if (pair) return lang === 'en' ? pair[0] : pair[1]
  return field
}

// Render a single audit value into something readable. Drops uuid-only values
// to "—" because surfacing raw uuids to an operator is noise.
// v3.74.125 — when we know the field, translate its value too (status,
// payment_method): an auditor should never see raw tokens like "approved"
// or "customer_credit" in the diff.
const renderValue = (v: any, lang: 'ar' | 'en', field?: string) => {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'string') {
    // raw uuid → drop (the operator can't reason about it)
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return '—'
    if (field === 'status') return statusLabel(v, lang)
    if (field === 'payment_method') return paymentMethodLabel(v, lang)
    return v
  }
  if (typeof v === 'number') return v.toLocaleString(undefined, { maximumFractionDigits: 4 })
  if (typeof v === 'boolean') return v ? (lang === 'en' ? 'Yes' : 'نعم') : (lang === 'en' ? 'No' : 'لا')
  return String(v)
}

// Turn two JSON blobs into a list of {field, before, after} entries for the
// fields that actually changed. Anything that's identical, or that's not a
// real user-facing field, is dropped.
const buildDiff = (oldV: any, newV: any) => {
  const ignore = new Set(['updated_at', 'created_at', 'id'])
  const keys = new Set<string>([
    ...Object.keys(oldV || {}),
    ...Object.keys(newV || {}),
  ])
  const diff: Array<{ field: string; before: any; after: any }> = []
  keys.forEach(k => {
    if (ignore.has(k)) return
    const a = oldV?.[k]
    const b = newV?.[k]
    if (JSON.stringify(a) === JSON.stringify(b)) return
    diff.push({ field: k, before: a, after: b })
  })
  return diff
}

// ─── Component ──────────────────────────────────────────────────────────────

export function PaymentDetailsModal({ paymentId, isOpen, onClose, appLang }: PaymentDetailsModalProps) {
  const supabase = useSupabase()
  const [loading, setLoading] = useState(true)

  const [payment, setPayment] = useState<any>(null)
  const [allocations, setAllocations] = useState<any[]>([])
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [baseCurrency, setBaseCurrency] = useState<string>('EGP')

  useEffect(() => {
    if (!paymentId || !isOpen) return

    async function fetchData() {
      setLoading(true)
      try {
        // 1. Payment + lookups (do separate fetches so a missing FK doesn't kill the whole modal)
        const { data: pData, error: pErr } = await supabase
          .from("payments")
          .select("*")
          .eq("id", paymentId!)
          .single()
        if (pErr) console.error("Error fetching payment:", pErr)

        if (pData) {
          // company base currency — required so we never default to "SAR"
          try {
            const { data: comp } = await supabase
              .from("companies")
              .select("base_currency")
              .eq("id", pData.company_id)
              .maybeSingle()
            if (comp?.base_currency) setBaseCurrency(comp.base_currency)
          } catch { }

          if (pData.account_id) {
            const { data: accData } = await supabase
              .from("chart_of_accounts")
              .select("account_name, account_code")
              .eq("id", pData.account_id)
              .maybeSingle()
            if (accData) pData.account = accData
          }
          if (pData.branch_id) {
            const { data: brData } = await supabase.from("branches").select("name").eq("id", pData.branch_id).maybeSingle()
            if (brData) pData.branch = brData
          }
          if (pData.invoice_id) {
            const { data: invData } = await supabase
              .from("invoices")
              .select("invoice_number, total_amount, status")
              .eq("id", pData.invoice_id)
              .maybeSingle()
            if (invData) pData.invoice = invData
          }
          if (pData.bill_id) {
            const { data: bill } = await supabase.from("bills").select("bill_number, total_amount, status").eq("id", pData.bill_id).maybeSingle()
            if (bill) pData.bill = bill
          }
          if (pData.supplier_id) {
            const { data: suppData } = await supabase.from("suppliers").select("name").eq("id", pData.supplier_id).maybeSingle()
            if (suppData) pData.supplier = suppData
          } else if (pData.customer_id) {
            const { data: custData } = await supabase.from("customers").select("name").eq("id", pData.customer_id).maybeSingle()
            if (custData) pData.customer = custData
          }
          // v3.74.147 — creator name. The previous query joined a
          // public.profiles table that doesn't exist in this schema, so
          // the full_name was always null and the modal showed
          // "غَير مُسَجَّل" / "Unknown user". Fall back to:
          //   1) company_members.email (always present for invited members)
          //   2) employees.full_name (when the member is linked to an HR
          //      employee record)
          if (pData.created_by) {
            try {
              const { data: mem } = await supabase
                .from("company_members")
                .select("user_id, email, employee_id, employee:employees(full_name)")
                .eq("user_id", pData.created_by)
                .maybeSingle()
              const empName = (mem as any)?.employee?.full_name as string | undefined
              const email = (mem as any)?.email as string | undefined
              pData.creator_name = empName || email || null
            } catch { }
            // v3.74.151 — auth.users.email fallback for legacy rows
            // where company_members.email is null (e.g. the owner row).
            if (!pData.creator_name) {
              try {
                const res = await fetch("/api/users/display-names", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ userIds: [pData.created_by] }),
                })
                if (res.ok) {
                  const j = await res.json()
                  pData.creator_name = (j?.names || {})[pData.created_by] || null
                }
              } catch { }
            }
          }
          // For VOID rows, fetch the original payment so we can label "Correction of ..."
          if (pData.voids_payment_id) {
            const { data: origData } = await supabase
              .from("payments")
              .select("id, amount, reference_number, invoice_id, notes")
              .eq("id", pData.voids_payment_id)
              .maybeSingle()
            if (origData) {
              if ((origData as any).invoice_id) {
                const { data: oInv } = await supabase.from("invoices").select("invoice_number").eq("id", (origData as any).invoice_id).maybeSingle()
                if (oInv) (origData as any).invoice_number = (oInv as any).invoice_number
              }
              pData.original = origData
            }
          }
        }

        setPayment(pData)

        // 2. Allocations
        const { data: allocData } = await supabase
          .from("payment_allocations")
          .select(`
            id, allocated_amount, created_at,
            bill:bills(bill_number, total_amount, status),
            invoice:invoices(invoice_number, total_amount, status)
          `)
          .eq("payment_id", paymentId)
          .order("created_at", { ascending: true })
        setAllocations(allocData || [])

        // 3. Audit logs + creator names
        const { data: logsData } = await supabase
          .from("payment_audit_logs")
          .select("*")
          .eq("payment_id", paymentId)
          .order("created_at", { ascending: false })

        if (logsData && logsData.length > 0) {
          const rawIds = logsData
            .map((l: any) => l.changed_by)
            .filter((v: any) => typeof v === "string" && v.length > 0) as string[]
          const userIds: string[] = Array.from(new Set<string>(rawIds))
          if (userIds.length > 0) {
            const userMap = new Map<string, string>()
            try {
              // v3.74.151 — first try the public client/path (employees +
              // company_members.email). Then for ids we still can't name
              // (e.g. legacy owner rows where company_members.email is null)
              // fall back to /api/users/display-names which uses the service
              // client to reach auth.users.email.
              const { data: members } = await supabase
                .from("company_members")
                .select("user_id, email, employee_id, employee:employees(full_name)")
                .in("user_id", userIds)
              members?.forEach((m: any) => {
                const empName = m?.employee?.full_name as string | undefined
                const email = m?.email as string | undefined
                const label = empName || email || null
                if (label) userMap.set(m.user_id, label)
              })
            } catch { /* safe fail */ }

            const missing = userIds.filter((id) => !userMap.has(id))
            if (missing.length > 0) {
              try {
                const res = await fetch("/api/users/display-names", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ userIds: missing }),
                })
                if (res.ok) {
                  const j = await res.json()
                  const names = (j?.names || {}) as Record<string, string>
                  for (const id of Object.keys(names)) {
                    if (!userMap.has(id) && names[id]) userMap.set(id, names[id])
                  }
                }
              } catch { /* safe fail */ }
            }

            logsData.forEach((l: any) => { l.user_name = userMap.get(l.changed_by) || null })
          }
        }
        setAuditLogs(logsData || [])
      } catch (err) {
        console.error("Error fetching payment details:", err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [paymentId, isOpen, supabase])

  if (!isOpen) return null

  // ─── Derived values ───────────────────────────────────────────────────────
  const fmtAmount = (amt: number | null | undefined) =>
    (amt || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const currency = payment?.currency_code || baseCurrency || 'EGP'
  const rate = Number(payment?.exchange_rate_used || payment?.exchange_rate || 1)
  const hasFx = (currency !== baseCurrency) || (rate !== 1)

  // v3.74.226 — for cross-currency payments (e.g., a USD refund on an EGP
  // credit), the header must show the original amount in the original
  // currency as the primary, with the base equivalent as a small reference
  // underneath. Previously the header read "-0.55 USD" — mixing the base
  // figure with the foreign-currency label. Math.abs guards refund rows
  // (negative amounts), which would otherwise fail an "origAmt > 0" check.
  const headerOrigAmt = Number(payment?.original_amount || 0)
  const headerOrigCur = String(payment?.original_currency || '').toUpperCase()
  const headerBaseAmt = Number(payment?.base_currency_amount ?? payment?.amount ?? 0)
  const headerBaseCur = String(baseCurrency || 'EGP').toUpperCase()
  const headerIsFC = !!headerOrigCur && headerOrigCur !== headerBaseCur && Math.abs(headerOrigAmt) > 0

  const isVoid = !!payment?.voids_payment_id          // this row IS a correction
  const isVoided = !!payment?.voided_by_payment_id     // this row WAS corrected

  const partyName = payment?.supplier?.name || payment?.customer?.name
                  || (appLang === 'en' ? 'General' : 'عام')

  const headerSubtitle = payment?.reference_number || (payment?.id ? '#' + payment.id.substring(0, 8) : '')

  const dateLocale = appLang === 'ar' ? 'ar-EG' : 'en-US'
  const fmtDateTime = (s: string | undefined | null) => s ? new Date(s).toLocaleString(dateLocale) : '—'

  // ─── Approval Trail (filter + sort by date asc) ───────────────────────────
  const approvalTrail = auditLogs
    .filter(log => /CREATE|APPROVE|REJECT|VOID/.test(String(log.action || '')))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      {/* v3.74.125 — responsive sizing.
            mobile (default): 96vw wide, 92vh tall — leaves enough breathing
              room around the edges so the close button is reachable and the
              page underneath stays a bit visible.
            sm+ (≥640px): centred at max-w-4xl (896px) so the modal stops
              feeling oversized on laptops and stops covering the table
              behind it.
            The internal Tabs body scrolls vertically so the modal never
            grows past its bound height regardless of how long the audit
            log is. */}
      <DialogContent className="w-[96vw] sm:w-auto max-w-4xl h-[92vh] sm:h-[85vh] flex flex-col p-0 gap-0 overflow-hidden bg-slate-50 dark:bg-slate-950">
        {/* ─── HEADER ─────────────────────────────────────────────────── */}
        <DialogHeader className="p-4 sm:p-6 pb-3 sm:pb-4 border-b bg-white dark:bg-slate-900 shadow-sm flex-shrink-0">
          <div className="flex justify-between items-start gap-3 sm:gap-4">
            <div className="min-w-0">
              <DialogTitle className="text-lg sm:text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 flex-wrap">
                {appLang === 'en' ? 'Payment Details' : 'تَفاصيل الدَّفعَة'}
                {headerSubtitle && (
                  <span className="text-sm font-normal text-slate-500">{headerSubtitle}</span>
                )}
                {/* v3.74.124 — surface correction status right next to the title */}
                {isVoid && (
                  <Badge className="bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300">
                    {appLang === 'en' ? 'Correction / Void' : 'تَصحيح / إِلغاء'}
                  </Badge>
                )}
                {isVoided && (
                  <Badge className="bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300">
                    {appLang === 'en' ? 'Voided by a later correction' : 'مُلغاة بتَصحيح لاحِق'}
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription className="mt-1 flex items-center gap-2 flex-wrap text-slate-600 dark:text-slate-400">
                <Calendar className="w-3.5 h-3.5" />
                <span>{payment?.payment_date}</span>
                <span>•</span>
                <span>{partyName}</span>
                {payment?.branch?.name && (
                  <>
                    <span>•</span>
                    <Building2 className="w-3.5 h-3.5" />
                    <span>{payment.branch.name}</span>
                  </>
                )}
              </DialogDescription>
            </div>
            <div className="text-right shrink-0">
              {headerIsFC ? (
                <>
                  <div className="text-xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                    {fmtAmount(headerOrigAmt)}
                    <span className="text-sm sm:text-base font-normal text-slate-500 ml-1">{headerOrigCur}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {`≈ ${fmtAmount(headerBaseAmt)} ${headerBaseCur}`}
                  </div>
                </>
              ) : (
                <div className="text-xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                  {fmtAmount(payment?.amount)}
                  <span className="text-sm sm:text-base font-normal text-slate-500 ml-1">{currency}</span>
                </div>
              )}
              <div className="mt-1 sm:mt-2 flex justify-end">
                <Badge className={`${statusBadgeClass(payment?.status)} px-2 py-1 text-xs`}>
                  {statusLabel(payment?.status || '', appLang)}
                </Badge>
              </div>
            </div>
          </div>

          {/* If it's a VOID/correction, point at the original row */}
          {isVoid && payment?.original && (
            <div className="mt-3 text-xs bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 rounded px-3 py-2">
              {appLang === 'en' ? 'This row corrects payment ' : 'هذه الدَّفعَة تُصَحِّح الدَّفعَة '}
              <span className="font-semibold">{payment.original.reference_number || ('#' + String(payment.original.id).substring(0, 8))}</span>
              {payment.original.invoice_number && (
                <>{appLang === 'en' ? ' (on ' : ' (على '}<span className="font-semibold">{payment.original.invoice_number}</span>)</>
              )}
              <span className="mx-2">·</span>
              {appLang === 'en' ? 'Original amount: ' : 'المَبلَغ الأَصلى: '}
              <span className="font-semibold">{fmtAmount(payment.original.amount)} {currency}</span>
            </div>
          )}
        </DialogHeader>

        {/* ─── BODY ───────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <RefreshCcw className="w-8 h-8 animate-spin text-slate-400" />
            </div>
          ) : (
            <Tabs defaultValue="overview" className="flex-1 flex flex-col w-full h-full">
              <div className="border-b bg-white dark:bg-slate-900 px-3 sm:px-6 flex-shrink-0 overflow-x-auto">
                <TabsList className="bg-transparent border-0 p-0 h-12 w-full justify-start gap-3 sm:gap-6">
                  <TabsTrigger value="overview" className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:shadow-none rounded-none py-3 px-1 data-[state=active]:text-blue-700 dark:data-[state=active]:text-blue-400 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    {appLang === 'en' ? 'Overview' : 'نَظرَة عامَّة'}
                  </TabsTrigger>
                  <TabsTrigger value="allocations" className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:shadow-none rounded-none py-3 px-1 data-[state=active]:text-blue-700 dark:data-[state=active]:text-blue-400 flex items-center gap-2">
                    <ListChecks className="w-4 h-4" />
                    {appLang === 'en' ? 'Allocations' : 'التَّوزيع على الفَواتير'}
                    {(allocations?.length || 0) > 0 && (
                      <Badge className="ml-1 px-1.5 py-0 min-w-5 h-5 flex items-center justify-center bg-slate-100 text-slate-600 hover:bg-slate-200">
                        {allocations.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="approval" className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:shadow-none rounded-none py-3 px-1 data-[state=active]:text-blue-700 dark:data-[state=active]:text-blue-400 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    {appLang === 'en' ? 'Approval Trail' : 'مَسار الاعتماد'}
                  </TabsTrigger>
                  <TabsTrigger value="audit" className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:shadow-none rounded-none py-3 px-1 data-[state=active]:text-blue-700 dark:data-[state=active]:text-blue-400 flex items-center gap-2">
                    <History className="w-4 h-4" />
                    {appLang === 'en' ? 'Audit Log' : 'سِجِلّ التَّعديلات'}
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="flex-1 overflow-y-auto p-3 sm:p-6 bg-slate-50 dark:bg-slate-950">

                {/* ─── 1) OVERVIEW ─────────────────────────────────── */}
                <TabsContent value="overview" className="mt-0 h-full">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-6 pb-6 sm:pb-8">

                    {/* Transaction details */}
                    <div className="bg-white dark:bg-slate-900 border rounded-xl shadow-sm overflow-hidden">
                      <div className="border-b bg-slate-50/50 dark:bg-slate-800/50 px-4 py-3 font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                        <Activity className="w-4 h-4 text-blue-500" />
                        {appLang === 'en' ? 'Transaction Details' : 'تَفاصيل الحَركَة'}
                      </div>
                      <div className="p-4 grid grid-cols-2 gap-y-4 gap-x-6 text-sm">
                        <div>
                          <p className="text-slate-500 mb-1 flex items-center gap-1"><Calendar className="w-3 h-3" />{appLang === 'en' ? 'Date' : 'التاريخ'}</p>
                          <p className="font-medium">{payment?.payment_date || '—'}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 mb-1 flex items-center gap-1"><Banknote className="w-3 h-3" />{appLang === 'en' ? 'Method' : 'طَريقَة الدَّفع'}</p>
                          <p className="font-medium">{paymentMethodLabel(payment?.payment_method, appLang)}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 mb-1 flex items-center gap-1"><Hash className="w-3 h-3" />{appLang === 'en' ? 'Reference' : 'المَرجع'}</p>
                          <p className="font-medium">{payment?.reference_number || '—'}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 mb-1 flex items-center gap-1"><Building2 className="w-3 h-3" />{appLang === 'en' ? 'Branch' : 'الفَرع'}</p>
                          <p className="font-medium">{payment?.branch?.name || '—'}</p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-slate-500 mb-1">{appLang === 'en' ? 'Account' : 'الحِساب المالى'}</p>
                          <p className="font-medium bg-slate-100 dark:bg-slate-800 inline-block px-2 py-1 rounded">
                            {payment?.account?.account_name
                              ? `${payment.account.account_name}${payment.account.account_code ? ` (${payment.account.account_code})` : ''}`
                              : '—'}
                          </p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-slate-500 mb-1 flex items-center gap-1"><UserIcon className="w-3 h-3" />{appLang === 'en' ? 'Created by' : 'مُنشِئ الدَّفعَة'}</p>
                          <p className="font-medium">
                            {payment?.creator_name || (appLang === 'en' ? 'Not recorded' : 'غَير مُسَجَّل')}
                          </p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-slate-500 mb-1">{appLang === 'en' ? 'Notes' : 'المُلاحَظات'}</p>
                          <p className="font-medium text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">
                            {payment?.notes || '—'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Linked document + financial context */}
                    <div className="bg-white dark:bg-slate-900 border rounded-xl shadow-sm overflow-hidden">
                      <div className="border-b bg-slate-50/50 dark:bg-slate-800/50 px-4 py-3 font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-500" />
                        {appLang === 'en' ? 'Linked Document & Currency' : 'المُستَنَد المَربوط والعُملَة'}
                      </div>
                      <div className="p-4 space-y-4 text-sm">
                        {/* Linked doc / source */}
                        <div>
                          <p className="text-slate-500 mb-1">{appLang === 'en' ? 'Linked document' : 'المُستَنَد المَربوط'}</p>
                          {payment?.invoice ? (
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="font-mono">
                                <Link href={`/invoices/${payment.invoice_id}`} className="text-blue-600 hover:underline">
                                  {payment.invoice.invoice_number}
                                </Link>
                              </Badge>
                              <span className="text-xs text-slate-500">
                                {appLang === 'en' ? 'Sales invoice' : 'فاتورَة مَبيعات'}
                              </span>
                            </div>
                          ) : payment?.bill ? (
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="font-mono">
                                <Link href={`/bills/${payment.bill_id}`} className="text-blue-600 hover:underline">
                                  {payment.bill.bill_number}
                                </Link>
                              </Badge>
                              <span className="text-xs text-slate-500">
                                {appLang === 'en' ? 'Supplier bill' : 'فاتورَة مُورِّد'}
                              </span>
                            </div>
                          ) : Number(payment?.amount || 0) < 0 ? (
                            <p className="font-medium text-purple-700 dark:text-purple-400">
                              {appLang === 'en' ? 'Customer credit refund' : 'صَرف رَصيد دائن للعَميل'}
                            </p>
                          ) : isVoid ? (
                            <p className="font-medium text-amber-700 dark:text-amber-400">
                              {appLang === 'en' ? 'Correction (no direct invoice)' : 'تَصحيح (بدون فاتورَة مُباشَرَة)'}
                            </p>
                          ) : (
                            <p className="text-slate-400">{appLang === 'en' ? 'Not linked to a specific document' : 'غَير مَربوط بمُستَنَد مُحَدَّد'}</p>
                          )}
                        </div>

                        {/* Currency — always shown */}
                        <div className="grid grid-cols-2 gap-y-3 gap-x-6 pt-2 border-t">
                          <div>
                            <p className="text-slate-500 mb-1">{appLang === 'en' ? 'Currency' : 'العُملَة'}</p>
                            <p className="font-bold text-blue-700 dark:text-blue-400">{currency}</p>
                          </div>
                          {/* FX block — only if there IS FX (rate ≠ 1 or currency ≠ base) */}
                          {hasFx && (
                            <>
                              <div>
                                <p className="text-slate-500 mb-1">{appLang === 'en' ? 'Exchange rate' : 'سِعر الصَّرف'}</p>
                                <p className="font-medium">{rate}</p>
                              </div>
                              <div className="col-span-2">
                                <p className="text-slate-500 mb-1">{appLang === 'en' ? 'Amount in base currency' : `المُعادِل بالعُملَة الأَساسية (${baseCurrency})`}</p>
                                <p className="font-medium">{fmtAmount(payment?.base_currency_amount)} {baseCurrency}</p>
                              </div>
                            </>
                          )}
                        </div>

                        {/* Unallocated — only if there's some */}
                        {Number(payment?.unallocated_amount || 0) > 0 && (
                          <div className="pt-3 border-t">
                            <p className="text-slate-500 mb-1">
                              {appLang === 'en' ? 'Unallocated (advance)' : 'المَبلَغ غَير المُوَزَّع (رَصيد مُقَدَّم)'}
                            </p>
                            <div className="text-xl font-bold text-emerald-600">
                              {fmtAmount(payment?.unallocated_amount)} {currency}
                            </div>
                            <p className="text-xs text-slate-500 mt-1">
                              {appLang === 'en'
                                ? 'This amount can be allocated to future invoices.'
                                : 'هذا المَبلَغ يُعتَبَر سُلفَة يُمكِن تَوزيعُه على فَواتير مُستَقبَلية.'}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                  </div>
                </TabsContent>

                {/* ─── 2) ALLOCATIONS ──────────────────────────────── */}
                <TabsContent value="allocations" className="mt-0 h-full">
                  <div className="bg-white dark:bg-slate-900 border rounded-xl shadow-sm overflow-hidden">
                    <table className="w-full text-sm text-left rtl:text-right">
                      <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-800/80 border-b">
                        <tr>
                          <th className="px-6 py-4">{appLang === 'en' ? 'Document Type' : 'نَوع المُستَنَد'}</th>
                          <th className="px-6 py-4">{appLang === 'en' ? 'Document Number' : 'رَقم المُستَنَد'}</th>
                          <th className="px-6 py-4 text-right">{appLang === 'en' ? 'Document Total' : 'إِجمالى المُستَنَد'}</th>
                          <th className="px-6 py-4 text-right">{appLang === 'en' ? 'Allocated Amount' : 'المَبلَغ المُوَزَّع من هذه الدَّفعَة'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {allocations.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                              <AlertCircle className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                              {appLang === 'en'
                                ? 'No allocations found. This was a direct journal payment or an advance.'
                                : 'لَم يَتِم تَوزيع الدَّفعَة على فَواتير مُحَدَّدَة (سَداد مُباشَر أَو سُلفَة).'}
                            </td>
                          </tr>
                        ) : (
                          allocations.map((alloc) => {
                            const doc = alloc.bill || alloc.invoice
                            const isBill = !!alloc.bill
                            return (
                              <tr key={alloc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                <td className="px-6 py-4 font-medium">
                                  {isBill ? (appLang === 'en' ? 'Supplier Bill' : 'فاتورَة مُورِّد') : (appLang === 'en' ? 'Sales Invoice' : 'فاتورَة مَبيعات')}
                                </td>
                                <td className="px-6 py-4">
                                  <Badge variant="outline" className="font-mono">{doc?.bill_number || doc?.invoice_number || '—'}</Badge>
                                </td>
                                <td className="px-6 py-4 text-right">{fmtAmount(doc?.total_amount)} {currency}</td>
                                <td className="px-6 py-4 text-right font-bold text-blue-600 dark:text-blue-400">
                                  {fmtAmount(alloc.allocated_amount)} {currency}
                                </td>
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                      {allocations.length > 0 && (
                        <tfoot className="bg-slate-50 dark:bg-slate-800/50 font-semibold border-t-2">
                          <tr>
                            <td colSpan={3} className="px-6 py-4 text-right">{appLang === 'en' ? 'Total Allocated:' : 'إِجمالى المُوَزَّع:'}</td>
                            <td className="px-6 py-4 text-right text-lg text-emerald-600">
                              {fmtAmount(allocations.reduce((acc, a) => acc + (a.allocated_amount || 0), 0))} {currency}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </TabsContent>

                {/* ─── 3) APPROVAL TRAIL ───────────────────────────── */}
                <TabsContent value="approval" className="mt-0 h-full">
                  <div className="max-w-2xl mx-auto py-8">
                    <div className="relative border-l-2 border-slate-200 dark:border-slate-800 ml-4 rtl:mr-4 rtl:ml-0 rtl:border-l-0 rtl:border-r-2 space-y-8">
                      {approvalTrail.length === 0 ? (
                        <div className="pl-8 rtl:pr-8 text-slate-500 text-center py-4">
                          {appLang === 'en' ? 'No approval trail available.' : 'لا يَوجَد مَسار زَمَنى للاعتماد.'}
                        </div>
                      ) : (
                        approvalTrail.map((log, index) => {
                          const a = String(log.action || '').toUpperCase()
                          const isCreate  = a.includes('CREATE')
                          const isReject  = a.includes('REJECT')
                          const isApprove = a.includes('APPROVE')
                          const isVoidAction = a.includes('VOID')

                          let Icon: any = Activity
                          let iconColor = "bg-blue-100 text-blue-600"
                          if (isCreate)       { Icon = FileText;   iconColor = "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300" }
                          else if (isApprove) { Icon = CheckCircle2; iconColor = "bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400" }
                          else if (isReject)  { Icon = XCircle;    iconColor = "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400" }
                          else if (isVoidAction) { Icon = AlertCircle; iconColor = "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" }

                          return (
                            <div key={log.id} className="relative pl-8 rtl:pr-8 rtl:pl-0">
                              <div className={`absolute -left-[17px] rtl:-right-[17px] rtl:left-auto top-1 p-1 rounded-full bg-white dark:bg-slate-950 border-2 border-white dark:border-slate-950`}>
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${iconColor}`}>
                                  <Icon className="w-3.5 h-3.5" />
                                </div>
                              </div>
                              <div className="bg-white dark:bg-slate-900 border rounded-lg p-4 shadow-sm">
                                <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-1">
                                  {actionLabel(log.action, appLang)}
                                </h4>
                                <div className="flex items-center gap-4 text-sm text-slate-500 flex-wrap">
                                  <span className="flex items-center gap-1">
                                    <UserCircle className="w-4 h-4" />
                                    {log.user_name || (appLang === 'en' ? 'Unknown user' : 'مُستَخدِم غَير مُحَدَّد')}
                                  </span>
                                  <span className="flex items-center gap-1"><Clock className="w-4 h-4" />{fmtDateTime(log.created_at)}</span>
                                </div>
                                {isReject && log.new_values?.rejection_reason && (
                                  <div className="mt-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 p-3 rounded text-sm border border-red-100 dark:border-red-800">
                                    <span className="font-bold">{appLang === 'en' ? 'Reason: ' : 'السَّبَب: '}</span>
                                    {log.new_values.rejection_reason}
                                  </div>
                                )}
                                {isVoidAction && log.new_values?.void_reason && (
                                  <div className="mt-3 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 p-3 rounded text-sm border border-amber-100 dark:border-amber-800">
                                    <span className="font-bold">{appLang === 'en' ? 'Reason: ' : 'السَّبَب: '}</span>
                                    {log.new_values.void_reason}
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>
                </TabsContent>

                {/* ─── 4) AUDIT LOG ────────────────────────────────── */}
                <TabsContent value="audit" className="mt-0 h-full">
                  <div className="space-y-3 pb-8">
                    {auditLogs.length === 0 ? (
                      <div className="bg-white dark:bg-slate-900 border rounded-xl shadow-sm p-12 text-center text-slate-500">
                        {appLang === 'en' ? 'No audit records found.' : 'لا يَوجَد سِجِلّ تَعديلات.'}
                      </div>
                    ) : (
                      auditLogs.map((log) => {
                        const diff = buildDiff(log.old_values, log.new_values)
                        return (
                          <div key={log.id} className="bg-white dark:bg-slate-900 border rounded-xl shadow-sm overflow-hidden">
                            {/* event header */}
                            <div className="flex items-center justify-between gap-4 flex-wrap px-4 py-3 border-b bg-slate-50/50 dark:bg-slate-800/40">
                              <div className="flex items-center gap-3 flex-wrap">
                                <span className="font-semibold text-slate-700 dark:text-slate-200">
                                  {actionLabel(log.action, appLang)}
                                </span>
                                <span className="flex items-center gap-1 text-xs text-slate-500">
                                  <UserCircle className="w-3.5 h-3.5" />
                                  {log.user_name || (appLang === 'en' ? 'Unknown user' : 'مُستَخدِم غَير مُحَدَّد')}
                                </span>
                              </div>
                              <span className="text-xs text-slate-500 flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5" />
                                {fmtDateTime(log.created_at)}
                              </span>
                            </div>
                            {/* readable diff */}
                            {diff.length === 0 ? (
                              <div className="px-4 py-3 text-sm text-slate-400">
                                {appLang === 'en' ? 'No field-level changes recorded.' : 'لا تَوجَد تَغييرات على مُستَوى الحُقول.'}
                              </div>
                            ) : (
                              <table className="w-full text-sm">
                                <thead className="text-xs text-slate-500 bg-slate-50/50 dark:bg-slate-800/30">
                                  <tr>
                                    <th className="px-4 py-2 text-right">{appLang === 'en' ? 'Field' : 'الحَقل'}</th>
                                    <th className="px-4 py-2 text-right">{appLang === 'en' ? 'Before' : 'القَيمَة السابِقَة'}</th>
                                    <th className="px-4 py-2 text-right">{appLang === 'en' ? 'After' : 'القَيمَة الجَديدَة'}</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                  {diff.map((d, i) => (
                                    <tr key={i}>
                                      <td className="px-3 sm:px-4 py-2 font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">{fieldLabel(d.field, appLang)}</td>
                                      <td className="px-3 sm:px-4 py-2 text-slate-500 line-through break-words">{renderValue(d.before, appLang, d.field)}</td>
                                      <td className="px-3 sm:px-4 py-2 text-emerald-700 dark:text-emerald-400 font-medium break-words">{renderValue(d.after, appLang, d.field)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        )
                      })
                    )}
                  </div>
                </TabsContent>

              </div>
            </Tabs>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
