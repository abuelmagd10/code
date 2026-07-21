"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { canAction } from "@/lib/authz"
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
  // `fixing` removed in v3.74.773 along with the balancing function it drove.
  const [autoFixed, setAutoFixed] = useState<boolean>(false)

  // v3.74.581 — financial report: requires financial_reports (top management only)
  const [permChecked, setPermChecked] = useState(false)
  const [canViewFinancial, setCanViewFinancial] = useState(false)

  useEffect(() => {
    (async () => {
      setCanViewFinancial(await canAction(supabase, "financial_reports", "read"))
      setPermChecked(true)
    })()
  }, [supabase])

  useEffect(() => {
    loadAccounts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    ;(async () => {
      if (autoFixed) return
      if (loading) return
      // v3.74.773 — fixUnbalancedInvoiceJournals() used to run HERE, on mount.
      //
      // Merely opening this report attempted to write single-sided journal
      // lines into the ledger. No button, no confirmation, no indication that
      // viewing a report was also editing the accounts. It failed every time —
      // the database rejects lines on posted entries — but the intent was to
      // write, and the failure was silent.
      //
      // Only the balance snapshot remains, which is what the page is for.
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

  /**
   * ✅ حساب الأرصدة من القيود المحاسبية
   * ✅ ACCOUNTING FUNCTION - يستخدم journal_entries فقط
   * راجع: docs/ACCOUNTING_REPORTS_ARCHITECTURE.md
   */
  const computeBalances = async (): Promise<Record<string, { debit: number; credit: number }>> => {
    if (!companyId) return {}
    // ✅ جلب القيود المحاسبية (من journal_entries فقط)
    const { data: lines, error } = await supabase
      .from("journal_entry_lines")
      .select("account_id, debit_amount, credit_amount, journal_entries!inner(entry_date, company_id, deleted_at)")
      .eq("journal_entries.company_id", companyId)
      .is("journal_entries.deleted_at", null) // ✅ استثناء القيود المحذوفة
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

  /**
   * v3.74.773 — fixUnbalancedInvoiceJournals removed.
   *
   * It inserted SINGLE-SIDED journal lines to force invoice entries to balance:
   * a credit-only line to revenue, a debit-only line to receivables, under two
   * INDEPENDENT conditions — so one could fire without the other. The second
   * condition was computed from figures taken before the first insert, so its
   * arithmetic was already stale by the time it ran.
   *
   * That is not repairing accounting. It is forcing a total to look right by
   * inventing revenue and receivables.
   *
   * It never worked. Tested against a restored copy of production: the database
   * refuses it outright —
   *
   *     "Cannot add lines to a posted journal entry. Use Reversal instead."
   *
   * and every insert here discarded its result, so the rejection was silent and
   * the page reported success. Every journal entry in this system is posted
   * (validation test 3 confirms no drafts), so it failed every single time it
   * was pressed.
   *
   * The snapshot report on this page is genuine and untouched; only the button
   * is gone. A real imbalance is corrected with a reversal entry through the
   * normal posting path.
   */
  // مجموع صافي الأرصدة (مدين - دائن)
  const total = useMemo(() => Object.values(computed).reduce((s, v) => s + (v.debit - v.credit), 0), [computed])

  if (permChecked && !canViewFinancial) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
          <Card className="border-red-200 dark:border-red-800">
            <CardContent className="pt-6">
              <p className="text-red-600 dark:text-red-400">ليس لديك صلاحية لعرض هذا التقرير.</p>
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
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
                {/* v3.74.773 — the "موازنة قيود الفواتير" button is gone.
                    It inserted single-sided lines to force a total to balance,
                    which the database rejects on posted entries. It reported
                    success regardless. An imbalance is corrected with a
                    reversal, not a plug. */}
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

