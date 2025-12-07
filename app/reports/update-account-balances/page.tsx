"use client"

import { useEffect, useMemo, useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { filterLeafAccounts } from "@/lib/accounts"
import { ArrowRight, Download } from "lucide-react"
import { useRouter } from "next/navigation"

type Account = { id: string; account_code: string | null; account_name: string | null }

export default function UpdateAccountBalancesPage() {
  const supabase = useSupabase()
  const router = useRouter()
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [accounts, setAccounts] = useState<Account[]>([])
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [saving, setSaving] = useState<boolean>(false)
  const [computed, setComputed] = useState<Record<string, { debit: number; credit: number }>>({})
  const [fixing, setFixing] = useState<boolean>(false)
  const [autoFixed, setAutoFixed] = useState<boolean>(false)

  useEffect(() => {
    loadAccounts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    ;(async () => {
      if (autoFixed) return
      if (loading) return
      await fixUnbalancedInvoiceJournals()
      await computeBalances()
      setAutoFixed(true)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  const loadAccounts = async () => {
    try {
      setLoading(true)

      // استخدام getActiveCompanyId لدعم المستخدمين المدعوين
      const { getActiveCompanyId } = await import("@/lib/company")
      const loadedCompanyId = await getActiveCompanyId(supabase)
      if (!loadedCompanyId) return
      setCompanyId(loadedCompanyId)

      const { data: accs } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name, parent_id")
        .eq("company_id", loadedCompanyId)
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

  const fixUnbalancedInvoiceJournals = async () => {
    try {
      setFixing(true)

      // استخدام getActiveCompanyId لدعم المستخدمين المدعوين
      const { getActiveCompanyId } = await import("@/lib/company")
      const fixCompanyId = await getActiveCompanyId(supabase)
      if (!fixCompanyId) return

      const { data: accounts } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_type, account_name, sub_type, parent_id")
        .eq("company_id", fixCompanyId)
      const leafOnly = filterLeafAccounts(accounts || []) as any[]
      const byNameIncludes = (name: string) => leafOnly.find((a: any) => String(a.account_name || "").toLowerCase().includes(name.toLowerCase()))?.id
      const bySubType = (st: string) => leafOnly.find((a: any) => String(a.sub_type || "").toLowerCase() === st.toLowerCase())?.id
      const byType = (type: string) => leafOnly.find((a: any) => String(a.account_type || "").toLowerCase() === type.toLowerCase())?.id
      const byCode = (code: string) => leafOnly.find((a: any) => String(a.account_code || "").toUpperCase() === code.toUpperCase())?.id
      const revenueId = bySubType("sales_revenue") || bySubType("revenue") || byType("income") || byCode("4000") || byNameIncludes("المبيعات") || byNameIncludes("revenue")
      const arId = bySubType("accounts_receivable") || byCode("1100") || byNameIncludes("الذمم") || byNameIncludes("receivable") || byType("asset")

      // Load invoice entries
      const { data: entries } = await supabase
        .from("journal_entries")
        .select("id, reference_type, reference_id")
        .eq("company_id", fixCompanyId)
        .in("reference_type", ["invoice", "invoice_reversal"]) as any

      const entryIds = (entries || []).map((e: any) => e.id)
      if (entryIds.length === 0) return
      const { data: lines } = await supabase
        .from("journal_entry_lines")
        .select("journal_entry_id, debit_amount, credit_amount")
        .in("journal_entry_id", entryIds)

      const linesByEntry: Record<string, { debit: number; credit: number }> = {}
      ;(lines || []).forEach((l: any) => {
        const prev = linesByEntry[l.journal_entry_id] || { debit: 0, credit: 0 }
        linesByEntry[l.journal_entry_id] = { debit: prev.debit + Number(l.debit_amount || 0), credit: prev.credit + Number(l.credit_amount || 0) }
      })

      // Load invoices referenced
      const invIds = Array.from(new Set((entries || []).map((e: any) => e.reference_id).filter(Boolean)))
      const { data: invoices } = await supabase
        .from("invoices")
        .select("id, subtotal, tax_amount, total_amount, shipping, adjustment")
        .in("id", invIds)
      const invMap = new Map<string, any>((invoices || []).map((i: any) => [i.id, i]))

      for (const e of (entries || [])) {
        const sums = linesByEntry[e.id] || { debit: 0, credit: 0 }
        const inv = invMap.get(e.reference_id)
        if (!inv) continue
        const expectedCredit = Number(inv.subtotal || 0) + Number(inv.tax_amount || 0) + Number(inv.shipping || 0) + Math.max(0, Number(inv.adjustment || 0))
        const expectedDebit = Number(inv.total_amount || 0)
        const diffCredit = expectedCredit - sums.credit
        const diffDebit = expectedDebit - sums.debit
        const eps = 0.005
        const rawDiff = (sums.credit - sums.debit)
        if (e.reference_type === "invoice") {
          if (revenueId && diffCredit > eps) {
            await supabase.from("journal_entry_lines").insert({ journal_entry_id: e.id, account_id: revenueId, debit_amount: 0, credit_amount: diffCredit, description: "موازنة الشحن/التعديل" })
          }
          if (arId && rawDiff > eps) {
            await supabase.from("journal_entry_lines").insert({ journal_entry_id: e.id, account_id: arId, debit_amount: rawDiff, credit_amount: 0, description: "موازنة الذمم المدينة" })
          }
        }
        if (e.reference_type === "invoice_reversal") {
          if (revenueId && diffDebit > eps) {
            await supabase.from("journal_entry_lines").insert({ journal_entry_id: e.id, account_id: revenueId, debit_amount: diffDebit, credit_amount: 0, description: "موازنة عكس الشحن/التعديل" })
          }
          if (arId && rawDiff < -eps) {
            const needCredit = Math.abs(rawDiff)
            await supabase.from("journal_entry_lines").insert({ journal_entry_id: e.id, account_id: arId, debit_amount: 0, credit_amount: needCredit, description: "موازنة الذمم المدينة (عكس)" })
          }
        }
      }
    } finally {
      setFixing(false)
    }
  }
  // مجموع صافي الأرصدة (مدين - دائن)
  const total = useMemo(() => Object.values(computed).reduce((s, v) => s + (v.debit - v.credit), 0), [computed])

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
          <div className="flex flex-col sm:flex-row sm:justify-between items-start gap-3">
            <div className="min-w-0">
              <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">حفظ أرصدة الحسابات</h1>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-0.5 sm:mt-1">لقطة أرصدة من القيود</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-sm text-gray-600 dark:text-gray-400">تاريخ نهاية اللقطة</label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full sm:w-44" />
              <Button variant="outline" onClick={() => window.print()}>
                <Download className="w-4 h-4 mr-2" />
                طباعة
              </Button>
              <Button variant="outline" onClick={() => router.push('/reports')}>
                <ArrowRight className="w-4 h-4 mr-2" />
                رجوع
              </Button>
            </div>
          </div>

          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" onClick={computeBalances} disabled={loading}>
                  احتساب الأرصدة
                </Button>
                <Button onClick={saveSnapshots} disabled={saving || loading}>
                  {saving ? "جاري الحفظ..." : "حفظ اللقطة"}
                </Button>
                <Button onClick={fixUnbalancedInvoiceJournals} disabled={fixing || loading}>
                  {fixing ? "جاري الموازنة..." : "موازنة قيود الفواتير"}
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

