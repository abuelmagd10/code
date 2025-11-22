"use client"

import { useEffect, useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useSupabase } from "@/lib/supabase/hooks"
import { filterCashBankAccounts } from "@/lib/accounts"
import { useToast } from "@/hooks/use-toast"
import { toastActionSuccess, toastActionError } from "@/lib/notifications"
import { getActiveCompanyId } from "@/lib/company"
import { canAction } from "@/lib/authz"

type Account = { id: string; account_code: string | null; account_name: string; account_type: string }

export default function BankingPage() {
  const supabase = useSupabase()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [transfer, setTransfer] = useState({ from_id: "", to_id: "", amount: 0, date: new Date().toISOString().slice(0, 10), description: "تحويل بنكي" })
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()
  const [appLang, setAppLang] = useState<'ar'|'en'>(() => {
    if (typeof window === 'undefined') return 'ar'
    try {
      const docLang = document.documentElement?.lang
      if (docLang === 'en') return 'en'
      const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
      const v = fromCookie || localStorage.getItem('app_language') || 'ar'
      return v === 'en' ? 'en' : 'ar'
    } catch { return 'ar' }
  })
  const [hydrated, setHydrated] = useState(false)
  const [permView, setPermView] = useState(true)
  const [permWrite, setPermWrite] = useState(false)

  useEffect(() => { (async () => {
    setPermView(await canAction(supabase, 'banking', 'read'))
    setPermWrite(await canAction(supabase, 'banking', 'write'))
  })(); loadData() }, [])
  useEffect(() => {
    const reloadPerms = async () => {
      setPermView(await canAction(supabase, 'banking', 'read'))
      setPermWrite(await canAction(supabase, 'banking', 'write'))
    }
    const handler = () => { reloadPerms() }
    if (typeof window !== 'undefined') window.addEventListener('permissions_updated', handler)
    return () => { if (typeof window !== 'undefined') window.removeEventListener('permissions_updated', handler) }
  }, [])
  useEffect(() => {
    setHydrated(true)
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
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      let cid: string | null = null
      try {
        const res = await fetch('/api/my-company')
        if (res.ok) {
          const j = await res.json()
          cid = String(j?.company?.id || '') || null
          if (cid) { try { localStorage.setItem('active_company_id', cid) } catch {} }
          if (Array.isArray(j?.accounts)) {
            const leaf = filterCashBankAccounts(j.accounts || [], true)
            setAccounts(leaf as any)
            return
          }
        }
      } catch {}
      if (!cid) cid = await getActiveCompanyId(supabase)
      if (!cid) return
      const { data: accs } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name, account_type, sub_type, parent_id")
        .eq("company_id", cid)
      const list = accs || []
      const leafCashBankAccounts = filterCashBankAccounts(list, true)
      setAccounts(leafCashBankAccounts as any)
    } finally { setLoading(false) }
  }

  const submitTransfer = async () => {
    try {
      setSaving(true)
      if (!transfer.from_id || !transfer.to_id || transfer.amount <= 0 || transfer.from_id === transfer.to_id) {
        toast({ title: appLang==='en' ? "Incomplete data" : "بيانات غير مكتملة", description: appLang==='en' ? "Please select both accounts and a valid amount" : "يرجى تحديد الحسابين والمبلغ بشكل صحيح" })
        return
      }
      let cid: string | null = null
      try {
        const res = await fetch('/api/my-company')
        if (res.ok) { const j = await res.json(); cid = String(j?.company?.id || '') || null }
      } catch {}
      if (!cid) cid = await getActiveCompanyId(supabase)
      if (!cid) return

      const { data: entry, error: entryErr } = await supabase
        .from("journal_entries")
        .insert({
          company_id: cid,
          reference_type: "bank_transfer",
          entry_date: transfer.date,
          description: transfer.description || (appLang==='en' ? "Transfer between cash/bank accounts" : "تحويل بين حسابات نقد/بنك"),
        }).select().single()
      if (entryErr) throw entryErr

      const { error: linesErr } = await supabase.from("journal_entry_lines").insert([
        { journal_entry_id: entry.id, account_id: transfer.to_id, debit_amount: transfer.amount, credit_amount: 0, description: appLang==='en' ? "Incoming transfer" : "تحويل وارد" },
        { journal_entry_id: entry.id, account_id: transfer.from_id, debit_amount: 0, credit_amount: transfer.amount, description: appLang==='en' ? "Outgoing transfer" : "تحويل صادر" },
      ])
      if (linesErr) throw linesErr

      setTransfer({ ...transfer, amount: 0, description: appLang==='en' ? "Bank transfer" : "تحويل بنكي" })
      toastActionSuccess(toast, appLang==='en' ? "Record" : "التسجيل", appLang==='en' ? "Transfer" : "التحويل")
    } catch (err) {
      console.error("Error recording transfer:", err)
      toastActionError(toast, appLang==='en' ? "Transfer" : "التحويل")
    } finally { setSaving(false) }
  }

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-4 md:p-8 space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Banking' : 'الأعمال المصرفية'}</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2"></p>
          <div className="mt-3 flex items-center justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {appLang==='en' ? 'To show accounts here, add them from Chart of Accounts as Asset type (Bank account or Company cash).' : 'لإظهار الحسابات هنا، قم بإضافتها من صفحة الشجرة المحاسبية كحساب من نوع "أصول" مثل "حساب بنكي" أو "خزينة الشركة".'}
            </p>
            {permWrite ? (
              <Button variant="outline" asChild>
                <a href="/chart-of-accounts">{appLang==='en' ? 'Add bank/cash account' : 'إضافة حساب بنكي/خزينة'}</a>
              </Button>
            ) : null}
          </div>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-6">
            <h2 className="text-xl font-semibold" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Transfer Between Accounts' : 'تحويل بين الحسابات'}</h2>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
              <div>
                <Label suppressHydrationWarning>{(hydrated && appLang==='en') ? 'From Account' : 'من الحساب'}</Label>
                <select className="w-full border rounded px-2 py-1" value={transfer.from_id} onChange={(e) => setTransfer({ ...transfer, from_id: e.target.value })}>
                  <option value="">{appLang==='en' ? 'Select account' : 'اختر حسابًا'}</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.account_code || ""} {a.account_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label suppressHydrationWarning>{(hydrated && appLang==='en') ? 'To Account' : 'إلى الحساب'}</Label>
                <select className="w-full border rounded px-2 py-1" value={transfer.to_id} onChange={(e) => setTransfer({ ...transfer, to_id: e.target.value })}>
                  <option value="">{appLang==='en' ? 'Select account' : 'اختر حسابًا'}</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.account_code || ""} {a.account_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Amount' : 'المبلغ'}</Label>
                <Input type="number" min={0} step={0.01} value={transfer.amount} onChange={(e) => setTransfer({ ...transfer, amount: Number(e.target.value) })} />
              </div>
              <div>
                <Label suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Date' : 'التاريخ'}</Label>
                <Input type="date" value={transfer.date} onChange={(e) => setTransfer({ ...transfer, date: e.target.value })} />
              </div>
              <div className="flex gap-2">
                {permWrite ? (<Button onClick={submitTransfer} disabled={saving || !transfer.from_id || !transfer.to_id || transfer.from_id === transfer.to_id || transfer.amount <= 0}>{(hydrated && appLang==='en') ? 'Record Transfer' : 'تسجيل التحويل'}</Button>) : null}
              </div>
            </div>

            <div className="text-sm text-gray-600 dark:text-gray-400" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'The transfer is recorded as a journal entry (debit receiver, credit sender).' : 'يتم تسجيل التحويل كقيد يومي (مدين للحساب المستلم، دائن للحساب المرسل).'}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <h2 className="text-xl font-semibold" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Cash & Bank Accounts' : 'حسابات النقد والبنك'}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {accounts.map(a => (
                <a key={a.id} href={`/banking/${a.id}`} className="border rounded p-3 hover:bg-gray-50 dark:hover:bg-slate-900">
                  <div className="font-medium">{a.account_name}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">{a.account_code || ""} • {a.account_type}</div>
                  <div className="text-xs mt-1 text-blue-600" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'View details' : 'عرض التفاصيل'}</div>
                </a>
              ))}
              {accounts.length === 0 && (
                <div className="text-sm text-gray-600 dark:text-gray-400" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'No accounts yet. Add them from Chart of Accounts.' : 'لا توجد حسابات بعد. قم بإضافتها من الشجرة المحاسبية.'}</div>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
