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
 *
 * v3.74.844 — الغلاف القياسى للصفحات (PageGuard + CompanyHeader +
 * ERPPageHeader) بدل `<div>` عارٍ. أول نسخة بنيت تخطيطها ولغتها بنفسها، فخرجت
 * بلا شريط الشركة ولا ترويسة، وعنوانها مقطوع عند حافة الشاشة — تبدو صفحة من
 * تطبيق آخر. والاتجاه واللغة يأتيان من آلية المشروع (`app_language` وحدث
 * `app_language_changed`) لا من الصفحة، وإلا تعارضت مع بقية النظام.
 * ---------------------------------------------------------------------------
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { PageGuard } from "@/components/page-guard"
import { CompanyHeader } from "@/components/company-header"
import { ERPPageHeader } from "@/components/erp-page-header"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { useAutoRefresh } from "@/hooks/use-auto-refresh"
import {
  Loader2, Plus, Send, Check, X, Wallet, Users, Trash2, Factory,
} from "lucide-react"

type Line = { key: string; personId: string; hours: string; amount: string }

const money = (n: any) =>
  Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const EMPTY_LINES: Line[] = [{ key: "1", personId: "", hours: "8", amount: "" }]

export default function ProductionLabourPage() {
  const { toast } = useToast()

  // نفس آلية اللغة المستخدمة فى بقية الصفحات — لا اتجاه محلى ولا قاموس خاص
  const [appLang, setAppLang] = useState<"ar" | "en">("ar")
  const t = (en: string, ar: string) => (appLang === "en" ? en : ar)

  useEffect(() => {
    const handler = () => {
      try {
        const v = localStorage.getItem("app_language") || "ar"
        setAppLang(v === "en" ? "en" : "ar")
      } catch {}
    }
    handler()
    window.addEventListener("app_language_changed", handler)
    return () => window.removeEventListener("app_language_changed", handler)
  }, [])

  const [companyId, setCompanyId] = useState("")
  const [role, setRole] = useState("")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const [orders, setOrders] = useState<any[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [workers, setWorkers] = useState<any[]>([])
  const [employees, setEmployees] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])

  const [showForm, setShowForm] = useState(false)
  const [showWorker, setShowWorker] = useState(false)
  const [wName, setWName] = useState("")
  const [wPhone, setWPhone] = useState("")
  const [wNid, setWNid] = useState("")

  const [orderId, setOrderId] = useState("")
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 10))
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [labourType, setLabourType] = useState<"casual" | "employee">("casual")
  const [mode, setMode] = useState<"paid" | "hours_only">("paid")
  const [accountId, setAccountId] = useState("")
  const [lines, setLines] = useState<Line[]>(EMPTY_LINES)

  const canCreate = ["owner", "admin", "manager", "manufacturing_officer"].includes(role)
  const canApprove = ["owner", "admin", "manager"].includes(role)
  const canPay = ["owner", "admin", "accountant"].includes(role)

  const total = useMemo(
    () => lines.reduce((s, l) => s + (mode === "hours_only" ? 0 : Number(l.amount || 0)), 0),
    [lines, mode]
  )

  const statusLabel = (s: string) =>
    ({
      draft: t("Draft", "مسودة"),
      pending_approval: t("Awaiting approval", "بانتظار الاعتماد"),
      approved: t("Approved", "معتمد"),
      rejected: t("Rejected", "مرفوض"),
      paid: t("Paid", "مصروف"),
      cancelled: t("Cancelled", "ملغى"),
    } as Record<string, string>)[s] || s

  const loadData = useCallback(async () => {
    let cid = ""
    try { cid = localStorage.getItem("active_company_id") || "" } catch {}
    setCompanyId(cid)
    if (!cid) { setLoading(false); return }

    const supabase = createClient()
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      const [{ data: mem }, { data: co }] = await Promise.all([
        supabase.from("company_members").select("role")
          .eq("company_id", cid).eq("user_id", user?.id ?? "").maybeSingle(),
        supabase.from("companies").select("user_id").eq("id", cid).maybeSingle(),
      ])
      setRole(co?.user_id && co.user_id === user?.id ? "owner" : (mem?.role || ""))

      const [o, a, w, e, p] = await Promise.all([
        supabase.from("manufacturing_production_orders")
          .select("id, order_no, status").eq("company_id", cid)
          .in("status", ["released", "in_progress", "completed"])
          .order("order_no", { ascending: false }).limit(200),
        supabase.from("chart_of_accounts")
          .select("id, account_code, account_name, sub_type").eq("company_id", cid)
          .in("sub_type", ["cash", "bank"]).eq("is_active", true).order("account_code"),
        supabase.from("casual_workers").select("id, name, phone")
          .eq("company_id", cid).eq("is_active", true).order("name"),
        supabase.from("employees").select("id, name").eq("company_id", cid).order("name").limit(300),
        supabase.from("production_labour_payments")
          .select("id, payment_no, period_from, period_to, labour_type, payment_mode, total_amount, estimated_amount, status, production_order_id")
          .eq("company_id", cid).order("created_at", { ascending: false }).limit(100),
      ])
      setOrders(o.data || []); setAccounts(a.data || []); setWorkers(w.data || [])
      setEmployees(e.data || []); setPayments(p.data || [])
    } catch {
      toast({
        variant: "destructive",
        title: t("Load Error", "خطأ في التحميل"),
        description: t("Could not fetch production labour data", "تعذر جلب بيانات أجور عمالة التصنيع"),
      })
    } finally {
      setLoading(false)
    }
  }, [toast, appLang])

  useEffect(() => { void loadData() }, [loadData])
  useAutoRefresh({ onRefresh: () => loadData() })

  // رسائل القاعدة ثنائية اللغة بالفعل («عربى | English»): يُعرض الشق الموافق
  const half = (msg: string) => {
    const parts = String(msg || "").split("|")
    if (parts.length < 2) return msg
    return (appLang === "en" ? parts[1] : parts[0]).trim()
  }

  const call = async (fn: string, args: any, okTitle: string) => {
    setBusy(true)
    try {
      const { data, error } = await createClient().rpc(fn, args)
      if (error) {
        toast({ variant: "destructive", title: t("Error", "خطأ"), description: half(error.message) })
        return null
      }
      toast({ title: okTitle })
      await loadData()
      return data
    } finally {
      setBusy(false)
    }
  }

  const saveWorker = async () => {
    const r = await call(
      "plw_upsert_casual_worker",
      { p_company_id: companyId, p_name: wName, p_phone: wPhone || null, p_national_id: wNid || null },
      t("Worker saved", "تم حفظ العامل")
    )
    if (r) { setWName(""); setWPhone(""); setWNid(""); }
  }

  const createPayment = async () => {
    const payload = lines.filter((l) => l.personId).map((l) => ({
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
    }, t("Saved as draft", "تم الحفظ كمسودة"))
    if (r) { setShowForm(false); setLines(EMPTY_LINES) }
  }

  const people = labourType === "casual" ? workers : employees
  const orderNo = (id: string) => orders.find((o) => o.id === id)?.order_no || "—"

  return (
    <PageGuard resource="production_labour_wages">
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">
          <CompanyHeader />
          <ERPPageHeader
            title={t("Production Labour Wages", "أجور عمالة التصنيع")}
            description={t(
              "Record what the workers were actually paid against a production order. The estimate is shown for comparison only — the gap between them is what reveals an hourly rate that needs revisiting.",
              "يُسجَّل ما دُفع فعلاً للعمال على أمر الإنتاج. المُقدَّر معروض للمقارنة فقط — والفرق بينهما هو ما يكشف أن سعر الساعة يحتاج مراجعة."
            )}
            variant="list"
            extra={canCreate ? (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowWorker((v) => !v)} disabled={busy} className="gap-2">
                  <Users className="h-4 w-4" />{t("Casual workers", "سجل العمالة المؤقتة")}
                </Button>
                <Button onClick={() => setShowForm((v) => !v)} disabled={busy} className="gap-2">
                  <Plus className="h-4 w-4" />{t("New payment", "صرف جديد")}
                </Button>
              </div>
            ) : null}
          />

          {showWorker && canCreate && (
            <Card className="dark:bg-slate-900 dark:border-slate-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t("Add worker", "إضافة عامل")}</CardTitle>
                <CardDescription>
                  {t("Casual workers are not employees — no salary, no insurance.",
                     "العمالة المؤقتة ليسوا موظفين — لا مرتب ولا تأمينات.")}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-4 items-end">
                <div className="space-y-2">
                  <Label>{t("Worker name", "اسم العامل")}</Label>
                  <Input value={wName} onChange={(e) => setWName(e.target.value)} disabled={busy} />
                </div>
                <div className="space-y-2">
                  <Label>{t("Phone", "الهاتف")}</Label>
                  <Input value={wPhone} onChange={(e) => setWPhone(e.target.value)} dir="ltr" disabled={busy} />
                </div>
                <div className="space-y-2">
                  <Label>{t("National ID (optional)", "الرقم القومى (اختيارى)")}</Label>
                  <Input value={wNid} onChange={(e) => setWNid(e.target.value)} dir="ltr" disabled={busy} />
                </div>
                <div className="flex gap-2">
                  <Button onClick={saveWorker} disabled={busy || !wName.trim()} className="gap-2">
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}{t("Save", "حفظ")}
                  </Button>
                  <Button variant="ghost" onClick={() => setShowWorker(false)}>{t("Close", "إغلاق")}</Button>
                </div>
                {workers.length > 0 && (
                  <div className="md:col-span-4 flex flex-wrap gap-2 pt-1">
                    {workers.map((w) => (
                      <Badge key={w.id} variant="secondary">{w.name}{w.phone ? ` · ${w.phone}` : ""}</Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {showForm && canCreate && (
            <Card className="dark:bg-slate-900 dark:border-slate-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t("New payment", "صرف جديد")}</CardTitle>
                {mode === "hours_only" && (
                  <CardDescription>
                    {t("A salaried employee is already paid through payroll — their time is recorded here without payment, so they are never paid twice.",
                       "الموظف بمرتب ثابت مدفوع فى المرتبات — يُسجَّل وقته هنا بلا صرف، فلا يُدفع له مرتين.")}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>{t("Production order", "أمر الإنتاج")}</Label>
                    <Select value={orderId} onValueChange={setOrderId} disabled={busy}>
                      <SelectTrigger><SelectValue placeholder={t("Choose an order...", "اختر أمر إنتاج...")} /></SelectTrigger>
                      <SelectContent>
                        {orders.map((o) => <SelectItem key={o.id} value={o.id}>{o.order_no}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {orders.length === 0 && (
                      <p className="text-xs text-amber-600">
                        {t("No released, in-progress or completed production orders.",
                           "لا توجد أوامر إنتاج مُصدَرة أو جارية أو مكتملة.")}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>{t("From", "من تاريخ")}</Label>
                    <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} disabled={busy} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("To", "إلى تاريخ")}</Label>
                    <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} disabled={busy} />
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>{t("Labour type", "نوع العمالة")}</Label>
                    <Select
                      value={labourType}
                      onValueChange={(v: any) => { setLabourType(v); if (v === "casual") setMode("paid") }}
                      disabled={busy}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="casual">{t("Casual workers", "عمالة مؤقتة")}</SelectItem>
                        <SelectItem value="employee">{t("Employees", "موظفون")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("Record as", "طريقة التسجيل")}</Label>
                    <Select value={mode} onValueChange={(v: any) => setMode(v)} disabled={busy || labourType === "casual"}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="paid">{t("Actual payment", "صرف فعلى")}</SelectItem>
                        <SelectItem value="hours_only">{t("Hours only (salaried)", "تسجيل ساعات فقط (موظف بمرتب ثابت)")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {mode === "paid" && (
                    <div className="space-y-2">
                      <Label>{t("Pay from", "يُصرف من")}</Label>
                      <Select value={accountId} onValueChange={setAccountId} disabled={busy}>
                        <SelectTrigger><SelectValue placeholder={t("Treasury or bank...", "خزينة أو بنك...")} /></SelectTrigger>
                        <SelectContent>
                          {accounts.map((a) => (
                            <SelectItem key={a.id} value={a.id}>{a.account_code} — {a.account_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>{t("Workers", "العمال")}</Label>
                  {lines.map((l, i) => (
                    <div key={l.key} className="grid gap-2 md:grid-cols-[2fr_1fr_1fr_auto] items-center">
                      <Select
                        value={l.personId}
                        onValueChange={(v) => setLines((c) => c.map((x, j) => (j === i ? { ...x, personId: v } : x)))}
                        disabled={busy}
                      >
                        <SelectTrigger><SelectValue placeholder={t("Worker / employee", "العامل / الموظف")} /></SelectTrigger>
                        <SelectContent>
                          {people.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input type="number" min="0" step="0.5" placeholder={t("Hours", "ساعات")} value={l.hours}
                             disabled={busy}
                             onChange={(e) => setLines((c) => c.map((x, j) => (j === i ? { ...x, hours: e.target.value } : x)))} />
                      <Input type="number" min="0" step="0.01" placeholder={t("Amount paid", "المبلغ المدفوع")} value={l.amount}
                             disabled={busy || mode === "hours_only"}
                             onChange={(e) => setLines((c) => c.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
                      <Button variant="ghost" size="sm" disabled={busy || lines.length === 1}
                              onClick={() => setLines((c) => c.filter((_, j) => j !== i))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" disabled={busy} className="gap-2"
                          onClick={() => setLines((c) => [...c, { key: String(Date.now()), personId: "", hours: "8", amount: "" }])}>
                    <Plus className="h-3 w-3" />{t("Add line", "إضافة سطر")}
                  </Button>
                </div>

                <div className="flex items-center justify-between border-t pt-3 dark:border-slate-800">
                  <span className="text-sm font-semibold">{t("Total", "الإجمالى")}: {money(total)}</span>
                  <div className="flex gap-2">
                    <Button onClick={createPayment} disabled={busy || !orderId || (mode === "paid" && !accountId)} className="gap-2">
                      {busy && <Loader2 className="h-4 w-4 animate-spin" />}{t("Save as draft", "حفظ كمسودة")}
                    </Button>
                    <Button variant="ghost" onClick={() => setShowForm(false)}>{t("Cancel", "إلغاء")}</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />{t("Loading...", "جاري التحميل...")}
            </div>
          ) : payments.length === 0 ? (
            <Card className="p-10 text-center dark:bg-slate-900 dark:border-slate-800">
              <Factory className="mx-auto h-10 w-10 text-slate-300 mb-3" />
              <p className="text-lg font-medium text-slate-700 dark:text-slate-300">
                {t("No payments yet", "لا توجد صرفيات بعد")}
              </p>
              <p className="text-sm text-slate-500 mt-1 mb-4">
                {t("Register your casual workers first, then record what they were paid against a production order.",
                   "سجّل العمالة المؤقتة أولاً، ثم سجّل ما دُفع لهم على أمر إنتاج.")}
              </p>
              {canCreate && (
                <Button onClick={() => setShowForm(true)} className="gap-2">
                  <Plus className="h-4 w-4" />{t("New payment", "صرف جديد")}
                </Button>
              )}
            </Card>
          ) : (
            <Card className="dark:bg-slate-900 dark:border-slate-800">
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/50">
                    <tr>
                      <th className="p-3 text-start">#</th>
                      <th className="p-3 text-start">{t("Order", "أمر الإنتاج")}</th>
                      <th className="p-3 text-start">{t("Period", "الفترة")}</th>
                      <th className="p-3 text-start">{t("Total", "الإجمالى")}</th>
                      <th className="p-3 text-start">{t("Estimated", "المُقدَّر")}</th>
                      <th className="p-3 text-start">{t("Variance", "الفرق")}</th>
                      <th className="p-3 text-start">{t("Status", "الحالة")}</th>
                      <th className="p-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => {
                      const variance = Number(p.total_amount || 0) - Number(p.estimated_amount || 0)
                      return (
                        <tr key={p.id} className="border-t dark:border-slate-800">
                          <td className="p-3 font-mono text-xs">{p.payment_no}</td>
                          <td className="p-3">{orderNo(p.production_order_id)}</td>
                          <td className="p-3 whitespace-nowrap text-xs">{p.period_from} — {p.period_to}</td>
                          <td className="p-3">{money(p.total_amount)}</td>
                          <td className="p-3 text-slate-500">{money(p.estimated_amount)}</td>
                          <td className={"p-3 " + (Math.abs(variance) < 0.005 ? "text-slate-400" : variance > 0 ? "text-amber-600" : "text-blue-600")}>
                            {variance > 0 ? "+" : ""}{money(variance)}
                          </td>
                          <td className="p-3">
                            <Badge variant={p.status === "paid" ? "default" : "secondary"}>{statusLabel(p.status)}</Badge>
                          </td>
                          <td className="p-3">
                            <div className="flex gap-1 justify-end">
                              {canCreate && (p.status === "draft" || p.status === "rejected") && (
                                <Button size="sm" variant="outline" disabled={busy} className="gap-1"
                                        onClick={() => call("plw_submit_labour_payment",
                                          { p_company_id: companyId, p_payment_id: p.id },
                                          t("Submitted for approval", "أُرسل للاعتماد"))}>
                                  <Send className="h-3 w-3" />{t("Submit", "إرسال")}
                                </Button>
                              )}
                              {canApprove && p.status === "pending_approval" && (
                                <>
                                  <Button size="sm" disabled={busy} className="gap-1"
                                          onClick={() => call("plw_approve_labour_payment",
                                            { p_company_id: companyId, p_payment_id: p.id },
                                            t("Approved", "تم الاعتماد"))}>
                                    <Check className="h-3 w-3" />{t("Approve", "اعتماد")}
                                  </Button>
                                  <Button size="sm" variant="outline" disabled={busy} className="gap-1"
                                          onClick={() => {
                                            const reason = window.prompt(t("Rejection reason", "سبب الرفض")) || ""
                                            if (reason.trim()) {
                                              void call("plw_reject_labour_payment",
                                                { p_company_id: companyId, p_payment_id: p.id, p_reason: reason },
                                                t("Rejected", "تم الرفض"))
                                            }
                                          }}>
                                    <X className="h-3 w-3" />{t("Reject", "رفض")}
                                  </Button>
                                </>
                              )}
                              {canPay && p.status === "approved" && p.payment_mode === "paid" && (
                                <Button size="sm" disabled={busy} className="gap-1"
                                        onClick={() => call("plw_pay_labour_payment",
                                          { p_company_id: companyId, p_payment_id: p.id, p_payment_date: null },
                                          t("Paid", "تم الصرف"))}>
                                  <Wallet className="h-3 w-3" />{t("Pay", "صرف")}
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          <p className="text-xs text-slate-500 leading-relaxed">
            {t("A variance is normal and is not blocked. If it stays large, the work centre's hourly rate needs revisiting.",
               "الفرق طبيعى ولا يُمنع. لو تكرر كبيراً، فسعر الساعة فى مركز العمل يحتاج مراجعة.")}
          </p>
        </main>
      </div>
    </PageGuard>
  )
}
