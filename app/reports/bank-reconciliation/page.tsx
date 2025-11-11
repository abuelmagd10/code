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
  const [startDate, setStartDate] = useState<string>("")
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedAccount, setSelectedAccount] = useState<string>("")
  const [statementDate, setStatementDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [statementBalance, setStatementBalance] = useState<number>(0)
  const [lines, setLines] = useState<Line[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [saving, setSaving] = useState<boolean>(false)

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
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      const { data: company } = await supabase.from("companies").select("id").eq("user_id", user.id).single()
      if (!company) return

      const { data: accs } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name, account_type, sub_type, parent_id")
        .eq("company_id", company.id)
      const list = (accs || []) as any
      setAccounts(filterBankAccounts(list, true) as any)
    } finally {
      setLoading(false)
    }
  }

  const loadLines = async () => {
    try {
      setLoading(true)
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      const { data: company } = await supabase.from("companies").select("id").eq("user_id", user.id).single()
      if (!company) return

      // جلب قيود اليومية المرتبطة بالحساب المختار ضمن النطاق الزمني
      const { data } = await supabase
        .from("journal_entry_lines")
        .select("id, debit_amount, credit_amount, description, journal_entries!inner(id, entry_date)")
        .eq("account_id", selectedAccount)
        .gte("journal_entries.entry_date", startDate || "0001-01-01")
        .lte("journal_entries.entry_date", endDate || "9999-12-31")
        .order("journal_entries.entry_date", { ascending: false })

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
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />

      <main className="flex-1 md:mr-64 p-4 md:p-8">
        <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">تسوية البنك</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">اختَر حساب بنك، حدّد الفترة، وأدخل رصيد كشف الحساب ثم قم بتعليم القيود المسوّاة.</p>
              </div>
            <div className="flex items-center gap-3">
              <div>
                <label className="text-sm text-gray-600 dark:text-gray-400">الحساب</label>
                <select className="px-3 py-2 border rounded-lg text-sm ml-2" value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)}>
                  <option value="">اختر حسابًا</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.account_code || ""} {a.account_name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 dark:text-gray-400">من</label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 dark:text-gray-400">إلى</label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 dark:text-gray-400">رصيد كشف الحساب</label>
                <Input type="number" value={statementBalance} onChange={(e) => setStatementBalance(Number(e.target.value) || 0)} className="w-40" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 dark:text-gray-400">تاريخ الكشف</label>
                <Input type="date" value={statementDate} onChange={(e) => setStatementDate(e.target.value)} className="w-40" />
              </div>
            </div>
          </div>

          <Card>
            <CardContent className="pt-6">
              {loading ? (
                <div className="text-gray-600 dark:text-gray-400">جاري التحميل...</div>
              ) : (
                <div className="space-y-4">
                  <div className="flex gap-6">
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">إجمالي الفترة</div>
                      <div className="text-xl font-bold">{totals.period_total.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">المسوّى</div>
                      <div className="text-xl font-bold text-green-600">{totals.cleared_total.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">الفارق مع كشف الحساب</div>
                      <div className="text-xl font-bold text-orange-600">{totals.difference.toFixed(2)}</div>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left">
                          <th className="p-2">التاريخ</th>
                          <th className="p-2">الوصف</th>
                          <th className="p-2">المبلغ</th>
                          <th className="p-2">مسوّى؟</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((l) => (
                          <tr key={l.id} className="border-t">
                            <td className="p-2">{new Date(l.entry_date).toLocaleDateString("ar")}</td>
                            <td className="p-2">{l.description || "-"}</td>
                            <td className="p-2 font-semibold">{(l.amount || 0).toFixed(2)}</td>
                            <td className="p-2">
                              <Button variant={l.cleared ? "default" : "outline"} size="sm" onClick={() => toggleCleared(l.id)}>
                                {l.cleared ? "مسوّى" : "غير مسوّى"}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex gap-3">
                    <Button onClick={saveReconciliation} disabled={!selectedAccount || saving}>حفظ التسوية البنكية</Button>
                    <Button variant="outline" onClick={() => setLines((prev) => prev.map((l) => ({ ...l, cleared: false })))} disabled={saving}>إلغاء تحديد الكل</Button>
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
