"use client"

/**
 * /hr/production-labour — أجور عمالة التصنيع | Production Labour Wages
 * ---------------------------------------------------------------------------
 * تعيش تحت «الموظفون والمرتبات» بطلب المالك، **بمفتاح صلاحية مستقل**
 * (`production_labour_wages`). ولو رُبطت بصلاحية `payroll` لانفتحت مرتبات كل
 * الموظفين على محاسب الفرع ومسؤول التصنيع — ومنها مرتب المدير العام.
 * موضع القائمة وحق الوصول شيئان مختلفان.
 *
 * فصل المهام (تفرضه دوال القاعدة، لا هذه الشاشة):
 *   مسؤول التصنيع يُنشئ ويُرسل → المالك/المدير يعتمد → محاسب الفرع يصرف.
 * الأزرار هنا تُخفى حسب الدور **راحةً للمستخدم فقط**؛ ولو استُدعيت الدالة
 * مباشرة لرفضتها القاعدة. والكتابة على الجداول ممنوعة من المتصفح أصلاً.
 *
 * ولا يُملى النظام ما يُدفع: يُدخل المستخدم **الفعلى**، ويُعرض المُقدَّر
 * جانبه للمقارنة. إجبار الفعلى على مساواة المُقدَّر يجعل التقدير يُحقّق نفسه
 * ويُلغى الانحراف — وهو الرقم الوحيد الذى يكشف أن سعر الساعة خاطئ.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Loader2, Plus, Send, Check, X, Wallet, Users, AlertCircle, CheckCircle2, Trash2,
} from "lucide-react"

type Lang = "ar" | "en"

const T = {
  ar: {
    title: "أجور عمالة التصنيع",
    subtitle:
      "يُسجَّل ما دُفع فعلاً للعمال على أمر الإنتاج. المُقدَّر معروض للمقارنة فقط — والفرق بينهما هو ما يكشف أن سعر الساعة يحتاج مراجعة.",
    newPayment: "صرف جديد",
    workers: "سجل العمالة المؤقتة",
    addWorker: "إضافة عامل",
    workerName: "اسم العامل",
    phone: "الهاتف",
    nationalId: "الرقم القومى (اختيارى)",
    save: "حفظ",
    cancel: "إلغاء",
    order: "أمر الإنتاج",
    from: "من تاريخ",
    to: "إلى تاريخ",
    labourType: "نوع العمالة",
    casual: "عمالة مؤقتة",
    employee: "موظفون",
    mode: "طريقة التسجيل",
    paid: "صرف فعلى",
    hoursOnly: "تسجيل ساعات فقط (موظف بمرتب ثابت)",
    payFrom: "يُصرف من",
    lines: "العمال",
    addLine: "إضافة سطر",
    person: "العامل / الموظف",
    hours: "ساعات",
    amount: "المبلغ المدفوع",
    total: "الإجمالى",
    estimated: "المُقدَّر",
    variance: "الفرق",
    create: "حفظ كمسودة",
    submit: "إرسال للاعتماد",
    approve: "اعتماد",
    reject: "رفض",
    pay: "صرف",
    rejectReason: "سبب الرفض",
    status: "الحالة",
    statuses: {
      draft: "مسودة", pending_approval: "بانتظار الاعتماد", approved: "معتمد",
      rejected: "مرفوض", paid: "مصروف", cancelled: "ملغى",
    } as Record<string, string>,
    noRows: "لا توجد صرفيات بعد.",
    hoursOnlyNote:
      "الموظف بمرتب ثابت مدفوع فى المرتبات — يُسجَّل وقته هنا بلا صرف، فلا يُدفع له مرتين.",
    varianceNote:
      "الفرق طبيعى ولا يُمنع. لو تكرر كبيراً، فسعر الساعة فى مركز العمل يحتاج مراجعة.",
    loading: "جارٍ التحميل...",
    saved: "تم الحفظ",
    pickOrder: "اختر أمر إنتاج",
    pickAccount: "اختر خزينة أو بنك",
    noOrders: "لا توجد أوامر إنتاج مُصدَرة أو جارية أو مكتملة.",
    remove: "حذف",
  },
  en: {
    title: "Production Labour Wages",
    subtitle:
      "Record what the workers were actually paid against a production order. The estimate is shown for comparison only — the gap between them is what reveals an hourly rate that needs revisiting.",
    newPayment: "New payment",
    workers: "Casual worker register",
    addWorker: "Add worker",
    workerName: "Worker name",
    phone: "Phone",
    nationalId: "National ID (optional)",
    save: "Save",
    cancel: "Cancel",
    order: "Production order",
    from: "From",
    to: "To",
    labourType: "Labour type",
    casual: "Casual workers",
    employee: "Employees",
    mode: "Record as",
    paid: "Actual payment",
    hoursOnly: "Hours only (salaried employee)",
    payFrom: "Pay from",
    lines: "Workers",
    addLine: "Add line",
    person: "Worker / employee",
    hours: "Hours",
    amount: "Amount paid",
    total: "Total",
    estimated: "Estimated",
    variance: "Variance",
    create: "Save as draft",
    submit: "Submit for approval",
    approve: "Approve",
    reject: "Reject",
    pay: "Pay",
    rejectReason: "Rejection reason",
    status: "Status",
    statuses: {
      draft: "Draft", pending_approval: "Awaiting approval", approved: "Approved",
      rejected: "Rejected", paid: "Paid", cancelled: "Cancelled",
    } as Record<string, string>,
    noRows: "No payments yet.",
    hoursOnlyNote:
      "A salaried employee is already paid through payroll — their time is recorded here without payment, so they are never paid twice.",
    varianceNote:
      "A variance is normal and is not blocked. If it stays large, the work centre's hourly rate needs revisiting.",
    loading: "Loading...",
    saved: "Saved",
    pickOrder: "Choose a production order",
    pickAccount: "Choose a treasury or bank",
    noOrders: "No released, in-progress or completed production orders.",
    remove: "Remove",
  },
} as const

function readLang(): Lang {
  try {
    const v = localStorage.getItem("app_language") || ""
    return v.toLowerCase().startsWith("en") ? "en" : "ar"
  } catch { return "ar" }
}

function activeCompanyId(): string {
  try { return localStorage.getItem("active_company_id") || "" } catch { return "" }
}

const money = (n: any) => Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type Line = { key: string; personId: string; hours: string; amount: string }

export default function ProductionLabourPage() {
  const [lang, setLang] = useState<Lang>("ar")
  const t = T[lang]
  const [companyId, setCompanyId] = useState("")
  const [role, setRole] = useState("")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [orders, setOrders] = useState<any[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [workers, setWorkers] = useState<any[]>([])
  const [employees, setEmployees] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])

  const [showForm, setShowForm] = useState(false)
  const [showWorker, setShowWorker] = useState(false)
  const [wName, setWName] = useState(""); const [wPhone, setWPhone] = useState(""); const [wNid, setWNid] = useState("")

  const [orderId, setOrderId] = useState("")
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 10))
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [labourType, setLabourType] = useState<"casual" | "employee">("casual")
  const [mode, setMode] = useState<"paid" | "hours_only">("paid")
  const [accountId, setAccountId] = useState("")
  const [lines, setLines] = useState<Line[]>([{ key: "1", personId: "", hours: "8", amount: "" }])

  const canCreate = ["owner", "admin", "manager", "manufacturing_officer"].includes(role)
  const canApprove = ["owner", "admin", "manager"].includes(role)
  const canPay = ["owner", "admin", "accountant"].includes(role)

  const total = useMemo(
    () => lines.reduce((s, l) => s + (mode === "hours_only" ? 0 : Number(l.amount || 0)), 0),
    [lines, mode]
  )

  useEffect(() => { setLang(readLang()); setCompanyId(activeCompanyId()) }, [])

  const load = async () => {
    const cid = activeCompanyId()
    if (!cid) { setLoading(false); return }
    const supabase = createClient()
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const [{ data: mem }, { data: co }] = await Promise.all([
        supabase.from("company_members").select("role").eq("company_id", cid).eq("user_id", user?.id ?? "").maybeSingle(),
        supabase.from("companies").select("user_id").eq("id", cid).maybeSingle(),
      ])
      setRole(co?.user_id && co.user_id === user?.id ? "owner" : (mem?.role || ""))

      const [o, a, w, e, p] = await Promise.all([
        supabase.from("manufacturing_production_orders")
          .select("id, order_no, status").eq("company_id", cid)
          .in("status", ["released", "in_progress", "completed"]).order("order_no", { ascending: false }).limit(200),
        supabase.from("chart_of_accounts")
          .select("id, account_code, account_name, sub_type").eq("company_id", cid)
          .in("sub_type", ["cash", "bank"]).eq("is_active", true).order("account_code"),
        supabase.from("casual_workers").select("id, name, phone").eq("company_id", cid).eq("is_active", true).order("name"),
        supabase.from("employees").select("id, name").eq("company_id", cid).order("name").limit(300),
        supabase.from("production_labour_payments")
          .select("id, payment_no, period_from, period_to, labour_type, payment_mode, total_amount, estimated_amount, status, production_order_id")
          .eq("company_id", cid).order("created_at", { ascending: false }).limit(100),
      ])
      setOrders(o.data || []); setAccounts(a.data || []); setWorkers(w.data || [])
      setEmployees(e.data || []); setPayments(p.data || [])
    } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  // رسائل القاعدة ثنائية اللغة بالفعل: نعرض الشق الموافق للغة المستخدم
  const half = (msg: string) => {
    const parts = String(msg || "").split("|")
    if (parts.length < 2) return msg
    return (lang === "en" ? parts[1] : parts[0]).trim()
  }

  const call = async (fn: string, args: any, ok?: string) => {
    setBusy(true); setError(null); setNotice(null)
    try {
      const { data, error } = await createClient().rpc(fn, args)
      if (error) { setError(half(error.message)); return null }
      setNotice(ok || t.saved)
      await load()
      return data
    } finally { setBusy(false) }
  }

  const saveWorker = async () => {
    const r = await call("plw_upsert_casual_worker",
      { p_company_id: companyId, p_name: wName, p_phone: wPhone || null, p_national_id: wNid || null })
    if (r) { setWName(""); setWPhone(""); setWNid(""); setShowWorker(false) }
  }

  const createPayment = async () => {
    const payload = lines
      .filter((l) => l.personId)
      .map((l) => ({
        ...(labourType === "casual" ? { casual_worker_id: l.personId } : { employee_id: l.personId }),
        hours: Number(l.hours || 0),
        amount: mode === "hours_only" ? 0 : Number(l.amount || 0),
      }))
    const r = await call("plw_create_labour_payment", {
      p_company_id: companyId, p_production_order_id: orderId,
      p_period_from: from, p_period_to: to,
      p_labour_type: labourType, p_payment_mode: mode,
      p_payment_account_id: mode === "hours_only" ? null : (accountId || null),
      p_lines: payload, p_notes: null,
    })
    if (r) { setShowForm(false); setLines([{ key: "1", personId: "", hours: "8", amount: "" }]) }
  }

  const people = labourType === "casual" ? workers : employees
  const orderNo = (id: string) => orders.find((o) => o.id === id)?.order_no || "—"

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" dir={lang === "en" ? "ltr" : "rtl"}>
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        <span className="mx-2 text-sm text-gray-500">{t.loading}</span>
      </div>
    )
  }

  return (
    <div dir={lang === "en" ? "ltr" : "rtl"} className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{t.title}</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-3xl leading-relaxed">{t.subtitle}</p>
        </div>
        <div className="flex gap-2">
          {canCreate && (
            <>
              <Button variant="outline" onClick={() => setShowWorker((v) => !v)} disabled={busy}>
                <Users className="w-4 h-4 mx-1" />{t.workers}
              </Button>
              <Button onClick={() => setShowForm((v) => !v)} disabled={busy}>
                <Plus className="w-4 h-4 mx-1" />{t.newPayment}
              </Button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /><span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="rounded-md border border-green-200 bg-green-50 dark:border-green-900/40 dark:bg-green-950/30 p-3 text-sm text-green-700 dark:text-green-300 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" /><span>{notice}</span>
        </div>
      )}

      {showWorker && canCreate && (
        <Card>
          <CardHeader><CardTitle className="text-base">{t.addWorker}</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4 items-end">
            <div><Label>{t.workerName}</Label><Input value={wName} onChange={(e) => setWName(e.target.value)} /></div>
            <div><Label>{t.phone}</Label><Input value={wPhone} onChange={(e) => setWPhone(e.target.value)} dir="ltr" /></div>
            <div><Label>{t.nationalId}</Label><Input value={wNid} onChange={(e) => setWNid(e.target.value)} dir="ltr" /></div>
            <div className="flex gap-2">
              <Button onClick={saveWorker} disabled={busy || !wName.trim()}>{t.save}</Button>
              <Button variant="ghost" onClick={() => setShowWorker(false)}>{t.cancel}</Button>
            </div>
            {workers.length > 0 && (
              <div className="md:col-span-4 text-xs text-gray-500 flex flex-wrap gap-2 pt-1">
                {workers.map((w) => (<Badge key={w.id} variant="secondary">{w.name}{w.phone ? ` · ${w.phone}` : ""}</Badge>))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {showForm && canCreate && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t.newPayment}</CardTitle>
            {mode === "hours_only" && <CardDescription>{t.hoursOnlyNote}</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <Label>{t.order}</Label>
                <select className="w-full h-10 rounded-md border px-3 bg-transparent"
                        value={orderId} onChange={(e) => setOrderId(e.target.value)}>
                  <option value="">{t.pickOrder}</option>
                  {orders.map((o) => (<option key={o.id} value={o.id}>{o.order_no}</option>))}
                </select>
                {orders.length === 0 && <p className="text-xs text-amber-600 mt-1">{t.noOrders}</p>}
              </div>
              <div><Label>{t.from}</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
              <div><Label>{t.to}</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <Label>{t.labourType}</Label>
                <select className="w-full h-10 rounded-md border px-3 bg-transparent" value={labourType}
                        onChange={(e) => { const v = e.target.value as any; setLabourType(v); if (v === "casual") setMode("paid") }}>
                  <option value="casual">{t.casual}</option>
                  <option value="employee">{t.employee}</option>
                </select>
              </div>
              <div>
                <Label>{t.mode}</Label>
                <select className="w-full h-10 rounded-md border px-3 bg-transparent" value={mode}
                        onChange={(e) => setMode(e.target.value as any)} disabled={labourType === "casual"}>
                  <option value="paid">{t.paid}</option>
                  <option value="hours_only">{t.hoursOnly}</option>
                </select>
              </div>
              {mode === "paid" && (
                <div>
                  <Label>{t.payFrom}</Label>
                  <select className="w-full h-10 rounded-md border px-3 bg-transparent"
                          value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                    <option value="">{t.pickAccount}</option>
                    {accounts.map((a) => (<option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>))}
                  </select>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>{t.lines}</Label>
              {lines.map((l, i) => (
                <div key={l.key} className="grid gap-2 md:grid-cols-[2fr_1fr_1fr_auto] items-center">
                  <select className="h-10 rounded-md border px-3 bg-transparent" value={l.personId}
                          onChange={(e) => setLines((c) => c.map((x, j) => j === i ? { ...x, personId: e.target.value } : x))}>
                    <option value="">{t.person}</option>
                    {people.map((p: any) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                  </select>
                  <Input type="number" min="0" step="0.5" placeholder={t.hours} value={l.hours}
                         onChange={(e) => setLines((c) => c.map((x, j) => j === i ? { ...x, hours: e.target.value } : x))} />
                  <Input type="number" min="0" step="0.01" placeholder={t.amount} value={l.amount}
                         disabled={mode === "hours_only"}
                         onChange={(e) => setLines((c) => c.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} />
                  <Button variant="ghost" size="sm" onClick={() => setLines((c) => c.filter((_, j) => j !== i))}
                          disabled={lines.length === 1} title={t.remove}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm"
                      onClick={() => setLines((c) => [...c, { key: String(Date.now()), personId: "", hours: "8", amount: "" }])}>
                <Plus className="w-3 h-3 mx-1" />{t.addLine}
              </Button>
            </div>

            <div className="flex items-center justify-between border-t pt-3">
              <div className="text-sm">
                <span className="font-semibold">{t.total}: {money(total)}</span>
              </div>
              <div className="flex gap-2">
                <Button onClick={createPayment} disabled={busy || !orderId || (mode === "paid" && !accountId)}>
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t.create}
                </Button>
                <Button variant="ghost" onClick={() => setShowForm(false)}>{t.cancel}</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {payments.length === 0 ? (
            <p className="p-6 text-sm text-gray-500 text-center">{t.noRows}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-slate-800/50">
                  <tr className="text-start">
                    <th className="p-3 text-start">#</th>
                    <th className="p-3 text-start">{t.order}</th>
                    <th className="p-3 text-start">{t.from} — {t.to}</th>
                    <th className="p-3 text-start">{t.total}</th>
                    <th className="p-3 text-start">{t.estimated}</th>
                    <th className="p-3 text-start">{t.variance}</th>
                    <th className="p-3 text-start">{t.status}</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => {
                    const variance = Number(p.total_amount || 0) - Number(p.estimated_amount || 0)
                    return (
                      <tr key={p.id} className="border-t">
                        <td className="p-3 font-mono text-xs">{p.payment_no}</td>
                        <td className="p-3">{orderNo(p.production_order_id)}</td>
                        <td className="p-3 whitespace-nowrap text-xs">{p.period_from} — {p.period_to}</td>
                        <td className="p-3">{money(p.total_amount)}</td>
                        <td className="p-3 text-gray-500">{money(p.estimated_amount)}</td>
                        <td className={"p-3 " + (Math.abs(variance) < 0.005 ? "text-gray-400" : variance > 0 ? "text-amber-600" : "text-blue-600")}>
                          {variance > 0 ? "+" : ""}{money(variance)}
                        </td>
                        <td className="p-3"><Badge variant={p.status === "paid" ? "default" : "secondary"}>{t.statuses[p.status] || p.status}</Badge></td>
                        <td className="p-3">
                          <div className="flex gap-1 justify-end">
                            {canCreate && (p.status === "draft" || p.status === "rejected") && (
                              <Button size="sm" variant="outline" disabled={busy}
                                      onClick={() => call("plw_submit_labour_payment", { p_company_id: companyId, p_payment_id: p.id })}>
                                <Send className="w-3 h-3 mx-1" />{t.submit}
                              </Button>
                            )}
                            {canApprove && p.status === "pending_approval" && (
                              <>
                                <Button size="sm" disabled={busy}
                                        onClick={() => call("plw_approve_labour_payment", { p_company_id: companyId, p_payment_id: p.id })}>
                                  <Check className="w-3 h-3 mx-1" />{t.approve}
                                </Button>
                                <Button size="sm" variant="outline" disabled={busy}
                                        onClick={() => {
                                          const reason = window.prompt(t.rejectReason) || ""
                                          if (reason.trim()) void call("plw_reject_labour_payment",
                                            { p_company_id: companyId, p_payment_id: p.id, p_reason: reason })
                                        }}>
                                  <X className="w-3 h-3 mx-1" />{t.reject}
                                </Button>
                              </>
                            )}
                            {canPay && p.status === "approved" && p.payment_mode === "paid" && (
                              <Button size="sm" disabled={busy}
                                      onClick={() => call("plw_pay_labour_payment", { p_company_id: companyId, p_payment_id: p.id, p_payment_date: null })}>
                                <Wallet className="w-3 h-3 mx-1" />{t.pay}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-gray-500 leading-relaxed">{t.varianceNote}</p>
    </div>
  )
}
