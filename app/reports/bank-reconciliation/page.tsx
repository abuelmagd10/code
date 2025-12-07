"use client"

import { useEffect, useMemo, useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import { toastActionSuccess, toastActionError } from "@/lib/notifications"
import { filterBankAccounts } from "@/lib/accounts"
import { getActiveCompanyId } from "@/lib/company"
import { ArrowRight, Download } from "lucide-react"
import { useRouter } from "next/navigation"

type Account = { id: string; account_code: string | null; account_name: string; account_type: string }
type Line = {
  id: string
  entry_date: string
  description: string | null
  amount: number
  cleared: boolean
}

export default function BankReconciliationPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const router = useRouter()
  const [startDate, setStartDate] = useState<string>("")
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedAccount, setSelectedAccount] = useState<string>("")
  const [statementDate, setStatementDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [statementBalance, setStatementBalance] = useState<number>(0)
  const [lines, setLines] = useState<Line[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [saving, setSaving] = useState<boolean>(false)
  const [appLang, setAppLang] = useState<'ar'|'en'>('ar')
  useEffect(() => {
    const handler = () => {
      try {
        const v = localStorage.getItem('app_language') || 'ar'
        setAppLang(v === 'en' ? 'en' : 'ar')
      } catch {}
    }
    handler()
    window.addEventListener('app_language_changed', handler)
    return () => window.removeEventListener('app_language_changed', handler)
  }, [])
  const t = (en: string, ar: string) => appLang === 'en' ? en : ar
  const numberFmt = new Intl.NumberFormat(appLang === 'en' ? "en-EG" : "ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  useEffect(() => {
    loadAccounts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (selectedAccount) loadLines()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccount, startDate, endDate])

  const loadAccounts = async () => {
    try {
      setLoading(true)
      let cid: string | null = null
      try { const r = await fetch('/api/my-company'); if (r.ok) { const j = await r.json(); cid = String(j?.company?.id || '') || null; if (Array.isArray(j?.accounts)) setAccounts(filterBankAccounts(j.accounts || [], true) as any) } } catch {}
      if (!cid) cid = await getActiveCompanyId(supabase)
      if (!cid) return
      if (!accounts || accounts.length === 0) {
        const { data: accs } = await supabase.from('chart_of_accounts').select('id, account_code, account_name, account_type, sub_type, parent_id').eq('company_id', cid)
        const list = (accs || []) as any
        setAccounts(filterBankAccounts(list, true) as any)
      }
    } finally {
      setLoading(false)
    }
  }

  const loadLines = async () => {
    try {
      setLoading(true)
      let cid: string | null = null
      try { const r = await fetch('/api/my-company'); if (r.ok) { const j = await r.json(); cid = String(j?.company?.id || '') || null } } catch {}
      if (!cid) cid = await getActiveCompanyId(supabase)
      if (!cid) return
      const res = await fetch(`/api/account-lines?accountId=${encodeURIComponent(selectedAccount)}&companyId=${encodeURIComponent(cid)}&from=${encodeURIComponent(startDate || '0001-01-01')}&to=${encodeURIComponent(endDate || '9999-12-31')}`)
      const data = res.ok ? await res.json() : []
      const mapped: Line[] = (data || []).map((l: any) => ({
        id: l.id,
        entry_date: l.journal_entries?.entry_date || new Date().toISOString().slice(0, 10),
        description: l.description || null,
        amount: Number(l.debit_amount || 0) > 0 ? Number(l.debit_amount || 0) : Number(l.credit_amount || 0),
        cleared: false,
      }))
      setLines(mapped)
    } finally {
      setLoading(false)
    }
  }

  const totals = useMemo(() => {
    const cleared_total = lines.filter((l) => l.cleared).reduce((sum, l) => sum + (l.amount || 0), 0)
    const difference = (statementBalance || 0) - cleared_total
    const period_total = lines.reduce((sum, l) => sum + (l.amount || 0), 0)
    return { cleared_total, difference, period_total }
  }, [lines, statementBalance])

  const toggleCleared = (lineId: string) => {
    setLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, cleared: !l.cleared } : l)))
  }

  const saveReconciliation = async () => {
    try {
      if (!selectedAccount) return
      setSaving(true)
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      const { data: company } = await supabase.from("companies").select("id").eq("user_id", user.id).single()
      if (!company) return

      const { cleared_total, difference } = totals
      const { data: rec, error: recErr } = await supabase
        .from("bank_reconciliations")
        .insert({
          company_id: company.id,
          account_id: selectedAccount,
          statement_date: statementDate,
          statement_balance: statementBalance,
          cleared_total,
          difference,
          notes: null,
        })
        .select()
        .single()
      if (recErr) throw recErr

      const clearedLines = lines.filter((l) => l.cleared)
      if (clearedLines.length > 0) {
        const payload = clearedLines.map((l) => ({
          bank_reconciliation_id: rec.id,
          journal_entry_line_id: l.id,
          cleared: true,
          cleared_amount: l.amount,
        }))
        const { error: linesErr } = await supabase.from("bank_reconciliation_lines").insert(payload)
        if (linesErr) throw linesErr
      }

      toastActionSuccess(toast, "الحفظ", "التسوية البنكية")
    } catch (err) {
      console.error("Save reconciliation failed", err)
      toastActionError(toast, "الحفظ", "التسوية البنكية")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">{t('Bank Reconciliation', 'تسوية البنك')}</h1>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">{t('Select account and mark cleared entries', 'اختَر الحساب وعلّم القيود')}</p>
              </div>
            <div className="flex items-center gap-3">
              <div>
                <label className="text-sm text-gray-600 dark:text-gray-400">{t('Account', 'الحساب')}</label>
                <select className="px-3 py-2 border rounded-lg text-sm ml-2" value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)}>
                  <option value="">{t('Select account', 'اختر حسابًا')}</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.account_code || ""} {a.account_name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 dark:text-gray-400">{t('From', 'من')}</label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 dark:text-gray-400">{t('To', 'إلى')}</label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 dark:text-gray-400">{t('Statement Balance', 'رصيد كشف الحساب')}</label>
                <Input type="number" value={statementBalance} onChange={(e) => setStatementBalance(Number(e.target.value) || 0)} className="w-40" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 dark:text-gray-400">{t('Statement Date', 'تاريخ الكشف')}</label>
                <Input type="date" value={statementDate} onChange={(e) => setStatementDate(e.target.value)} className="w-40" />
              </div>
            </div>
          </div>

          <Card>
            <CardContent className="pt-6">
              {loading ? (
                <div className="text-gray-600 dark:text-gray-400">{t('Loading...', 'جاري التحميل...')}</div>
              ) : (
                <div className="space-y-4">
                  <div className="flex gap-6">
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">{t('Period Total', 'إجمالي الفترة')}</div>
                      <div className="text-xl font-bold">{numberFmt.format(totals.period_total)}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">{t('Cleared', 'المسوّى')}</div>
                      <div className="text-xl font-bold text-green-600">{numberFmt.format(totals.cleared_total)}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">{t('Difference from Statement', 'الفارق مع كشف الحساب')}</div>
                      <div className="text-xl font-bold text-orange-600">{numberFmt.format(totals.difference)}</div>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left">
                          <th className="p-2">{t('Date', 'التاريخ')}</th>
                          <th className="p-2">{t('Description', 'الوصف')}</th>
                          <th className="p-2">{t('Amount', 'المبلغ')}</th>
                          <th className="p-2">{t('Cleared?', 'مسوّى؟')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="p-4 text-center text-gray-600 dark:text-gray-400">{t('No entries in the selected period or account.', 'لا توجد قيود في الفترة المحددة أو الحساب المختار.')}</td>
                          </tr>
                        ) : (
                          lines.map((l) => (
                            <tr key={l.id} className="border-t">
                              <td className="p-2">{new Date(l.entry_date).toLocaleDateString(appLang === 'en' ? 'en' : 'ar')}</td>
                              <td className="p-2">{l.description || "-"}</td>
                              <td className="p-2 font-semibold">{numberFmt.format(l.amount || 0)}</td>
                              <td className="p-2">
                                <Button variant={l.cleared ? "default" : "outline"} size="sm" onClick={() => toggleCleared(l.id)}>
                                  {l.cleared ? t('Cleared', 'مسوّى') : t('Not Cleared', 'غير مسوّى')}
                                </Button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex gap-3 flex-wrap">
                    <Button onClick={saveReconciliation} disabled={!selectedAccount || saving}>{t('Save Reconciliation', 'حفظ التسوية البنكية')}</Button>
                    <Button variant="outline" onClick={() => setLines((prev) => prev.map((l) => ({ ...l, cleared: false })))} disabled={saving}>{t('Clear All', 'إلغاء تحديد الكل')}</Button>
                    <Button variant="outline" onClick={() => window.print()}>
                      <Download className="w-4 h-4 mr-2" />
                      {t('Print', 'طباعة')}
                    </Button>
                    <Button variant="outline" onClick={() => router.push('/reports')}>
                      <ArrowRight className="w-4 h-4 mr-2" />
                      {t('Back', 'رجوع')}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
