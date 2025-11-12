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
type Line = { id: string; debit_amount: number; credit_amount: number; description: string | null, journal_entries: { entry_date: string, description: string | null } }

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

  useEffect(() => { loadData() }, [accountId])

  const loadData = async () => {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: company } = await supabase.from("companies").select("id").eq("user_id", user.id).single()
      if (!company) return

      const { data: acc } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name, account_type, sub_type, parent_id")
        .eq("company_id", company.id)
        .eq("id", accountId)
        .single()
      setAccount(acc as any)

      const { data: cos } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name, account_type, parent_id")
        .eq("company_id", company.id)
      const cosList = (cos || []) as any
      const leafOnly = filterLeafAccounts(cosList)
      setCounterAccounts(leafOnly.filter((a: any) => a.id !== accountId) as any)

      const { data: lns } = await supabase
        .from("journal_entry_lines")
        .select("id, debit_amount, credit_amount, description, journal_entries(entry_date, description)")
        .eq("account_id", accountId)
        .order("id", { ascending: false })
        .limit(50)
      setLines((lns || []) as any)
    } finally { setLoading(false) }
  }

  const balance = useMemo(() => {
    return lines.reduce((sum, l) => sum + (l.debit_amount || 0) - (l.credit_amount || 0), 0)
  }, [lines])

  const recordEntry = async (type: "deposit" | "withdraw") => {
    try {
      setSaving(true)
      const cfg = type === "deposit" ? deposit : withdraw
      if (!cfg.counter_id) { toast({ title: "بيانات غير مكتملة", description: "يرجى اختيار الحساب المقابل", variant: "destructive" }); return }
      if (cfg.amount <= 0) { toast({ title: "قيمة غير صحيحة", description: "يرجى إدخال مبلغ أكبر من صفر", variant: "destructive" }); return }
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: company } = await supabase.from("companies").select("id").eq("user_id", user.id).single()
      if (!company) return

      const { data: entry, error: entryErr } = await supabase
        .from("journal_entries")
        .insert({ company_id: company.id, reference_type: type === "deposit" ? "bank_deposit" : "cash_withdrawal", entry_date: cfg.date, description: cfg.description })
        .select()
        .single()
      if (entryErr) throw entryErr

      // Deposit: debit accountId, credit counter
      // Withdraw: debit counter, credit accountId
      const linesPayload = type === "deposit"
        ? [
            { journal_entry_id: entry.id, account_id: accountId, debit_amount: cfg.amount, credit_amount: 0, description: "إيداع" },
            { journal_entry_id: entry.id, account_id: cfg.counter_id, debit_amount: 0, credit_amount: cfg.amount, description: "مقابل الإيداع" },
          ]
        : [
            { journal_entry_id: entry.id, account_id: cfg.counter_id, debit_amount: cfg.amount, credit_amount: 0, description: "مقابل السحب" },
            { journal_entry_id: entry.id, account_id: accountId, debit_amount: 0, credit_amount: cfg.amount, description: "سحب" },
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
            {account ? (
              <>
                <div className="text-lg font-semibold">{account.account_name} {account.account_code ? `(${account.account_code})` : ""}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">النوع: {account.account_type}</div>
                <div className="text-xl mt-2">الرصيد الحالي: {balance.toFixed(2)}</div>
              </>
            ) : (
              <div>جاري التحميل...</div>
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
                <thead>
                  <tr className="text-left">
                    <th className="p-2">التاريخ</th>
                    <th className="p-2">الوصف</th>
                    <th className="p-2">مدين</th>
                    <th className="p-2">دائن</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map(l => (
                    <tr key={l.id} className="border-t">
                      <td className="p-2">{l.journal_entries?.entry_date}</td>
                      <td className="p-2">{l.description || l.journal_entries?.description || ""}</td>
                      <td className="p-2">{Number(l.debit_amount || 0).toFixed(2)}</td>
                      <td className="p-2">{Number(l.credit_amount || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                  {lines.length === 0 && !loading && (
                    <tr>
                      <td className="p-2" colSpan={4}>لا توجد حركات بعد لهذا الحساب.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

