"use client"

import React, { useEffect, useMemo, useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import { toastActionSuccess, toastActionError } from "@/lib/notifications"
import { filterLeafAccounts } from "@/lib/accounts"

type Account = { id: string; account_code: string | null; account_name: string; account_type: string }
type Line = {
  id: string;
  debit_amount: number;
  credit_amount: number;
  description: string | null;
  journal_entries: { entry_date: string, description: string | null };
  // Multi-currency fields
  display_debit?: number | null;
  display_credit?: number | null;
  display_currency?: string | null;
}

export default function BankAccountDetail({ params }: { params: Promise<{ id: string }> }) {
  const supabase = useSupabase()
  const { toast } = useToast()
  const { id: accountId } = React.use(params)
  const [account, setAccount] = useState<Account | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [counterAccounts, setCounterAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deposit, setDeposit] = useState({ amount: 0, date: new Date().toISOString().slice(0, 10), description: "إيداع", counter_id: "" })
  const [withdraw, setWithdraw] = useState({ amount: 0, date: new Date().toISOString().slice(0, 10), description: "سحب", counter_id: "" })

  // Currency support
  const [appCurrency, setAppCurrency] = useState<string>(() => {
    if (typeof window === 'undefined') return 'EGP'
    try { return localStorage.getItem('app_currency') || 'EGP' } catch { return 'EGP' }
  })
  const currencySymbols: Record<string, string> = {
    EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ',
    KWD: 'د.ك', QAR: '﷼', BHD: 'د.ب', OMR: '﷼', JOD: 'د.أ', LBP: 'ل.ل'
  }
  const currencySymbol = currencySymbols[appCurrency] || appCurrency

  // Helper function to get display amount based on current currency
  const getDisplayAmount = (originalAmount: number, displayAmount?: number | null, displayCurrency?: string | null): number => {
    if (displayAmount != null && displayCurrency === appCurrency) {
      return displayAmount
    }
    return originalAmount
  }

  useEffect(() => {
    // Listen for currency changes
    const handleCurrencyChange = () => {
      const newCurrency = localStorage.getItem('app_currency') || 'EGP'
      setAppCurrency(newCurrency)
    }
    window.addEventListener('app_currency_changed', handleCurrencyChange)
    return () => window.removeEventListener('app_currency_changed', handleCurrencyChange)
  }, [])

  useEffect(() => { loadData() }, [accountId])

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
          const acc = (j?.accounts || []).find((a: any) => String(a.id) === String(accountId))
          if (acc) setAccount(acc as any)
          const leafOnly = filterLeafAccounts(j?.accounts || [])
          setCounterAccounts(leafOnly.filter((a: any) => String(a.id) !== String(accountId)) as any)
        }
      } catch {}
      if (!cid) {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data: memberCompany } = await supabase.from('company_members').select('company_id').eq('user_id', user.id).limit(1)
        cid = Array.isArray(memberCompany) && memberCompany[0]?.company_id ? String(memberCompany[0].company_id) : null
      }
      // Try API first
      const res2 = await fetch(`/api/account-lines?accountId=${encodeURIComponent(String(accountId))}&companyId=${encodeURIComponent(String(cid || ''))}&limit=100`)
      if (res2.ok) {
        const lns = await res2.json()
        setLines((lns || []) as any)
      } else {
        // Fallback: fetch directly from Supabase (with multi-currency fields)
        const { data: directLines } = await supabase
          .from("journal_entry_lines")
          .select("id, debit_amount, credit_amount, description, display_debit, display_credit, display_currency, journal_entries!inner(entry_date, description, company_id)")
          .eq("account_id", accountId)
          .order("id", { ascending: false })
          .limit(100)
        setLines((directLines || []) as any)
      }
    } finally { setLoading(false) }
  }

  // Calculate balance using display amounts when available
  const balance = useMemo(() => {
    return lines.reduce((sum, l) => {
      const debit = getDisplayAmount(l.debit_amount || 0, l.display_debit, l.display_currency)
      const credit = getDisplayAmount(l.credit_amount || 0, l.display_credit, l.display_currency)
      return sum + debit - credit
    }, 0)
  }, [lines, appCurrency])

  const recordEntry = async (type: "deposit" | "withdraw") => {
    try {
      setSaving(true)
      const cfg = type === "deposit" ? deposit : withdraw
      if (!cfg.counter_id) { toast({ title: "بيانات غير مكتملة", description: "يرجى اختيار الحساب المقابل", variant: "destructive" }); return }
      if (cfg.amount <= 0) { toast({ title: "قيمة غير صحيحة", description: "يرجى إدخال مبلغ أكبر من صفر", variant: "destructive" }); return }
      let cid: string | null = null
      try {
        const res = await fetch('/api/my-company')
        if (res.ok) { const j = await res.json(); cid = String(j?.company?.id || '') || null }
      } catch {}
      if (!cid) {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data: memberCompany } = await supabase.from('company_members').select('company_id').eq('user_id', user.id).limit(1)
        cid = Array.isArray(memberCompany) && memberCompany[0]?.company_id ? String(memberCompany[0].company_id) : null
      }
      if (!cid) return

      const { data: entry, error: entryErr } = await supabase
        .from("journal_entries")
        .insert({ company_id: cid, reference_type: type === "deposit" ? "bank_deposit" : "cash_withdrawal", entry_date: cfg.date, description: cfg.description })
        .select()
        .single()
      if (entryErr) throw entryErr

      // Get system currency for original values
      const systemCurrency = typeof window !== 'undefined'
        ? localStorage.getItem('original_system_currency') || localStorage.getItem('app_currency') || 'EGP'
        : 'EGP'

      // Deposit: debit accountId, credit counter
      // Withdraw: debit counter, credit accountId
      const linesPayload = type === "deposit"
        ? [
            {
              journal_entry_id: entry.id,
              account_id: accountId,
              debit_amount: cfg.amount,
              credit_amount: 0,
              description: "إيداع",
              // Multi-currency support - store original values
              original_debit: cfg.amount,
              original_credit: 0,
              original_currency: systemCurrency,
              exchange_rate_used: 1,
            },
            {
              journal_entry_id: entry.id,
              account_id: cfg.counter_id,
              debit_amount: 0,
              credit_amount: cfg.amount,
              description: "مقابل الإيداع",
              // Multi-currency support - store original values
              original_debit: 0,
              original_credit: cfg.amount,
              original_currency: systemCurrency,
              exchange_rate_used: 1,
            },
          ]
        : [
            {
              journal_entry_id: entry.id,
              account_id: cfg.counter_id,
              debit_amount: cfg.amount,
              credit_amount: 0,
              description: "مقابل السحب",
              // Multi-currency support - store original values
              original_debit: cfg.amount,
              original_credit: 0,
              original_currency: systemCurrency,
              exchange_rate_used: 1,
            },
            {
              journal_entry_id: entry.id,
              account_id: accountId,
              debit_amount: 0,
              credit_amount: cfg.amount,
              description: "سحب",
              // Multi-currency support - store original values
              original_debit: 0,
              original_credit: cfg.amount,
              original_currency: systemCurrency,
              exchange_rate_used: 1,
            },
          ]

      const { error: linesErr } = await supabase.from("journal_entry_lines").insert(linesPayload)
      if (linesErr) throw linesErr
      await loadData()
      if (type === "deposit") setDeposit({ ...deposit, amount: 0, description: "إيداع" })
      else setWithdraw({ ...withdraw, amount: 0, description: "سحب" })
      toastActionSuccess(toast, "الحفظ", "العملية")
    } catch (err) {
      console.error("Error recording entry:", err)
      toastActionError(toast, "الحفظ", "العملية")
    } finally { setSaving(false) }
  }

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-4 md:p-8 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">تفاصيل الحساب</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">مطابق لطريقة Zoho: عرض الرصيد، السجل، وإجراءات الإيداع/السحب.</p>
          </div>
          <Button variant="outline" asChild>
            <a href="/banking">رجوع للبنوك</a>
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-2">
            {loading ? (
              <div>جاري التحميل...</div>
            ) : account ? (
              <>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-lg font-semibold">{account.account_name} {account.account_code ? `(${account.account_code})` : ""}</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">النوع: {account.account_type}</div>
                  </div>
                  <div className={`text-2xl font-bold ${balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {new Intl.NumberFormat('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(balance)} {currencySymbol}
                  </div>
                </div>
                <div className="text-sm text-gray-500 mt-2">عدد الحركات: {lines.length} | العملة: {appCurrency}</div>
              </>
            ) : (
              <div>الحساب غير موجود</div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <h2 className="text-xl font-semibold">إيداع</h2>
              <div>
                <Label>الحساب المقابل</Label>
                <select className="w-full border rounded px-2 py-1" value={deposit.counter_id} onChange={(e) => setDeposit({ ...deposit, counter_id: e.target.value })}>
                  <option value="">اختر حسابًا</option>
                  {counterAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.account_code || ""} {a.account_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>المبلغ</Label>
                <Input type="number" min={0} step={0.01} value={deposit.amount} onChange={(e) => setDeposit({ ...deposit, amount: Number(e.target.value) })} />
              </div>
              <div>
                <Label>التاريخ</Label>
                <Input type="date" value={deposit.date} onChange={(e) => setDeposit({ ...deposit, date: e.target.value })} />
              </div>
              <div>
                <Label>الوصف</Label>
                <Input type="text" value={deposit.description} onChange={(e) => setDeposit({ ...deposit, description: e.target.value })} />
              </div>
              <div className="flex gap-2">
                <Button onClick={() => recordEntry("deposit")} disabled={saving || !deposit.counter_id || deposit.amount <= 0}>تسجيل الإيداع</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6 space-y-4">
              <h2 className="text-xl font-semibold">سحب</h2>
              <div>
                <Label>الحساب المقابل</Label>
                <select className="w-full border rounded px-2 py-1" value={withdraw.counter_id} onChange={(e) => setWithdraw({ ...withdraw, counter_id: e.target.value })}>
                  <option value="">اختر حسابًا</option>
                  {counterAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.account_code || ""} {a.account_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>المبلغ</Label>
                <Input type="number" min={0} step={0.01} value={withdraw.amount} onChange={(e) => setWithdraw({ ...withdraw, amount: Number(e.target.value) })} />
              </div>
              <div>
                <Label>التاريخ</Label>
                <Input type="date" value={withdraw.date} onChange={(e) => setWithdraw({ ...withdraw, date: e.target.value })} />
              </div>
              <div>
                <Label>الوصف</Label>
                <Input type="text" value={withdraw.description} onChange={(e) => setWithdraw({ ...withdraw, description: e.target.value })} />
              </div>
              <div className="flex gap-2">
                <Button onClick={() => recordEntry("withdraw")} disabled={saving || !withdraw.counter_id || withdraw.amount <= 0}>تسجيل السحب</Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <h2 className="text-xl font-semibold">آخر الحركات</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-100 dark:bg-slate-800">
                  <tr className="text-right">
                    <th className="p-2 text-right">التاريخ</th>
                    <th className="p-2 text-right">الوصف</th>
                    <th className="p-2 text-right">مدين</th>
                    <th className="p-2 text-right">دائن</th>
                    <th className="p-2 text-right">الرصيد</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    // Calculate running balance from oldest to newest (using display amounts)
                    const sortedLines = [...lines].reverse()
                    let runningBalance = 0
                    const linesWithBalance = sortedLines.map(l => {
                      const debit = getDisplayAmount(l.debit_amount || 0, l.display_debit, l.display_currency)
                      const credit = getDisplayAmount(l.credit_amount || 0, l.display_credit, l.display_currency)
                      runningBalance += debit - credit
                      return { ...l, runningBalance, displayDebit: debit, displayCredit: credit }
                    })
                    // Reverse back to show newest first
                    return linesWithBalance.reverse().map(l => (
                      <tr key={l.id} className="border-t hover:bg-gray-50 dark:hover:bg-slate-900">
                        <td className="p-2">{l.journal_entries?.entry_date || '-'}</td>
                        <td className="p-2">{l.description || l.journal_entries?.description || "-"}</td>
                        <td className="p-2 text-green-600">{l.displayDebit > 0 ? new Intl.NumberFormat('ar-EG', { minimumFractionDigits: 2 }).format(l.displayDebit) + ' ' + currencySymbol : '-'}</td>
                        <td className="p-2 text-red-600">{l.displayCredit > 0 ? new Intl.NumberFormat('ar-EG', { minimumFractionDigits: 2 }).format(l.displayCredit) + ' ' + currencySymbol : '-'}</td>
                        <td className={`p-2 font-medium ${l.runningBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {new Intl.NumberFormat('ar-EG', { minimumFractionDigits: 2 }).format(l.runningBalance)} {currencySymbol}
                        </td>
                      </tr>
                    ))
                  })()}
                  {lines.length === 0 && !loading && (
                    <tr>
                      <td className="p-2 text-center text-gray-500" colSpan={5}>لا توجد حركات بعد لهذا الحساب.</td>
                    </tr>
                  )}
                </tbody>
                {lines.length > 0 && (
                  <tfoot className="bg-gray-100 dark:bg-slate-800 font-bold">
                    <tr>
                      <td className="p-2" colSpan={2}>الإجمالي</td>
                      <td className="p-2 text-green-600">{new Intl.NumberFormat('ar-EG', { minimumFractionDigits: 2 }).format(lines.reduce((s, l) => s + getDisplayAmount(l.debit_amount || 0, l.display_debit, l.display_currency), 0))} {currencySymbol}</td>
                      <td className="p-2 text-red-600">{new Intl.NumberFormat('ar-EG', { minimumFractionDigits: 2 }).format(lines.reduce((s, l) => s + getDisplayAmount(l.credit_amount || 0, l.display_credit, l.display_currency), 0))} {currencySymbol}</td>
                      <td className={`p-2 ${balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>{new Intl.NumberFormat('ar-EG', { minimumFractionDigits: 2 }).format(balance)} {currencySymbol}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

