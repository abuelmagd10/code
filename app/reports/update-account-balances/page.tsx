"use client"

import { useEffect, useMemo, useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { filterLeafAccounts } from "@/lib/accounts"

type Account = { id: string; account_code: string | null; account_name: string | null }

export default function UpdateAccountBalancesPage() {
  const supabase = useSupabase()
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [accounts, setAccounts] = useState<Account[]>([])
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [saving, setSaving] = useState<boolean>(false)
  const [computed, setComputed] = useState<Record<string, { debit: number; credit: number }>>({})

  useEffect(() => {
    loadAccounts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadAccounts = async () => {
    try {
      setLoading(true)
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      const { data: company } = await supabase.from("companies").select("id").eq("user_id", user.id).single()
      if (!company) return
      setCompanyId(company.id)

      const { data: accs } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name, parent_id")
        .eq("company_id", company.id)
      const list = accs || []
      const leafOnly = filterLeafAccounts(list)
      setAccounts(leafOnly as any)
    } finally {
      setLoading(false)
    }
  }

  const computeBalances = async (): Promise<Record<string, { debit: number; credit: number }>> => {
    if (!companyId) return {}
    const { data: lines, error } = await supabase
      .from("journal_entry_lines")
      .select("account_id, debit_amount, credit_amount, journal_entries!inner(entry_date, company_id)")
      .eq("journal_entries.company_id", companyId)
    if (error) {
      console.error("Failed loading journal lines:", error)
      return {}
    }
    const grouped: Record<string, { debit: number; credit: number }> = {}
    ;(lines || []).forEach((l: any) => {
      const d = new Date(l.journal_entries?.entry_date || new Date().toISOString().slice(0, 10))
      if (d > new Date(endDate)) return
      const debit = Number(l.debit_amount || 0)
      const credit = Number(l.credit_amount || 0)
      const prev = grouped[l.account_id] || { debit: 0, credit: 0 }
      grouped[l.account_id] = { debit: prev.debit + debit, credit: prev.credit + credit }
    })
    setComputed(grouped)
    return grouped
  }

  const saveSnapshots = async () => {
    try {
      setSaving(true)
      const latest = await computeBalances()
      const payload = Object.entries(latest).map(([account_id, agg]) => ({
        company_id: companyId!,
        account_id,
        balance_date: endDate,
        debit_balance: agg.debit,
        credit_balance: agg.credit,
      }))
      if (payload.length === 0) return
      const { error } = await supabase.from("account_balances").insert(payload)
      if (error) throw error
    } finally {
      setSaving(false)
    }
  }
  // مجموع صافي الأرصدة (مدين - دائن)
  const total = useMemo(() => Object.values(computed).reduce((s, v) => s + (v.debit - v.credit), 0), [computed])

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />

      <main className="flex-1 md:mr-64 p-4 md:p-8">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">حفظ أرصدة الحسابات</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">إنشاء لقطة أرصدة من القيود حتى تاريخ محدد</p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 dark:text-gray-400">تاريخ نهاية اللقطة</label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-44" />
            </div>
          </div>

          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex gap-2">
                <Button variant="outline" onClick={computeBalances} disabled={loading}>
                  احتساب الأرصدة
                </Button>
                <Button onClick={saveSnapshots} disabled={saving || loading}>
                  {saving ? "جاري الحفظ..." : "حفظ اللقطة"}
                </Button>
              </div>

              {Object.keys(computed).length > 0 && (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left">
                        <th className="p-2">الحساب</th>
                        <th className="p-2">الرصيد</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accounts.map((a) => (
                        <tr key={a.id} className="border-t">
                          <td className="p-2">{a.account_name || a.account_code || a.id}</td>
                          <td className="p-2 font-semibold">{Number(((computed[a.id]?.debit || 0) - (computed[a.id]?.credit || 0))).toFixed(2)}</td>
                        </tr>
                      ))}
                      <tr className="border-t bg-gray-50 dark:bg-slate-900">
                        <td className="p-2 font-semibold">المجموع</td>
                        <td className="p-2 font-semibold">{total.toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}

