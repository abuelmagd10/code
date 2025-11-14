"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { Download, ArrowRight } from "lucide-react"
import { useRouter } from "next/navigation"
import { CompanyHeader } from "@/components/company-header"
import { filterLeafAccounts } from "@/lib/accounts"

interface Account {
  account_code: string
  account_name: string
  balance: number
}

interface JournalEntrySummary {
  id: string
  entry_date: string
  debit: number
  credit: number
  difference: number
}

export default function TrialBalancePage() {
  const supabase = useSupabase()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [unbalancedEntries, setUnbalancedEntries] = useState<JournalEntrySummary[]>([])
  const router = useRouter()
  const numberFmt = new Intl.NumberFormat("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  useEffect(() => {
    loadAccounts(endDate)
  }, [endDate])

  const loadAccounts = async (asOfDate: string) => {
    try {
      setIsLoading(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data: companyData } = await supabase.from("companies").select("id").eq("user_id", user.id).single()

      if (!companyData) return

      // Load accounts with ids and opening balances
      const { data: accountsData, error: accountsError } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name, account_type, opening_balance, parent_id")
        .eq("company_id", companyData.id)
        .order("account_code")

      if (accountsError) throw accountsError
      if (!accountsData) return

      const accountMap = new Map<string, { account_code: string; account_name: string; opening_balance: number }>()
      accountsData.forEach((acc: any) => {
        accountMap.set(acc.id, {
          account_code: acc.account_code,
          account_name: acc.account_name,
          opening_balance: Number(acc.opening_balance || 0),
        })
      })

      // Sum movements up to asOfDate from journal entries
      const { data: linesData, error: linesError } = await supabase
        .from("journal_entry_lines")
        .select("account_id, debit_amount, credit_amount, journal_entries!inner(id, entry_date, company_id)")
        .eq("journal_entries.company_id", companyData.id)
        .lte("journal_entries.entry_date", asOfDate)

      if (linesError) throw linesError

      const movementByAccount = new Map<string, number>()
      const byEntry: Record<string, { debit: number; credit: number; entry_date: string }> = {}
      linesData?.forEach((line: any) => {
        const accId = line.account_id as string
        const debit = Number(line.debit_amount || 0)
        const credit = Number(line.credit_amount || 0)
        const net = debit - credit
        movementByAccount.set(accId, (movementByAccount.get(accId) || 0) + net)

        const entryId = String(line.journal_entries?.id || "")
        const entryDate = String(line.journal_entries?.entry_date || asOfDate)
        if (entryId) {
          const prev = byEntry[entryId] || { debit: 0, credit: 0, entry_date: entryDate }
          byEntry[entryId] = { debit: prev.debit + debit, credit: prev.credit + credit, entry_date: entryDate }
        }
      })

      // استبعاد الحسابات التجميعية (الأب) وعرض الحسابات الورقية فقط
      const leafAccounts = filterLeafAccounts((accountsData || []) as any)

      const result: Account[] = leafAccounts.map((acc: any) => {
        const movement = movementByAccount.get(acc.id) || 0
        const balance = Number(acc.opening_balance || 0) + movement
        return {
          account_code: acc.account_code,
          account_name: acc.account_name,
          balance,
        }
      })

      setAccounts(result)

      // قيود غير متوازنة: حيث مجموع المدين لا يساوي مجموع الدائن
      const unbalanced: JournalEntrySummary[] = Object.entries(byEntry)
        .map(([id, v]) => ({ id, entry_date: v.entry_date, debit: v.debit, credit: v.credit, difference: v.debit - v.credit }))
        .filter((s) => Math.abs(s.difference) >= 0.01)
        .sort((a, b) => a.entry_date.localeCompare(b.entry_date))
      setUnbalancedEntries(unbalanced)
    } catch (error) {
      console.error("Error loading accounts:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0)
  const totalDebit = accounts.reduce((sum, a) => sum + (a.balance > 0 ? a.balance : 0), 0)
  const totalCredit = accounts.reduce((sum, a) => sum + (a.balance < 0 ? -a.balance : 0), 0)

  const handlePrint = () => {
    window.print()
  }

  const handleExportCsv = () => {
    const headers = ["account_code", "account_name", "debit", "credit"]
    const rows = accounts.map((a) => [
      a.account_code,
      a.account_name,
      (a.balance > 0 ? a.balance : 0).toFixed(2),
      (a.balance < 0 ? -a.balance : 0).toFixed(2),
    ])
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `trial-balance-${endDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />

      <main className="flex-1 md:mr-64 p-4 md:p-8">
        <div className="space-y-6">
          <CompanyHeader />
          <div className="flex justify-between items-center print:hidden">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">ميزان المراجعة</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">حتى تاريخ: {new Date(endDate).toLocaleDateString("ar")}</p>
            </div>
            <div className="flex gap-2 items-center">
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="border rounded px-3 py-2 text-sm bg-white dark:bg-slate-900"
              />
              <Button variant="outline" onClick={handlePrint}>
                <Download className="w-4 h-4 mr-2" />
                طباعة
              </Button>
              <Button variant="outline" onClick={handleExportCsv}>
                <Download className="w-4 h-4 mr-2" />
                تصدير CSV
              </Button>
              <Button variant="outline" onClick={() => router.push("/reports")}>
                <ArrowRight className="w-4 h-4 mr-2" />
                العودة
              </Button>
            </div>
          </div>

          {isLoading ? (
            <p className="text-center py-8">جاري التحميل...</p>
          ) : accounts.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-gray-600 dark:text-gray-400">لا توجد بيانات لعرضها في التاريخ المحدد.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6">
                {unbalancedEntries.length > 0 && (
                  <div className="mb-4 rounded border border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950 p-4">
                    <div className="flex justify-between mb-2">
                      <span className="font-semibold">قيود غير متوازنة</span>
                      <span className="font-semibold">العدد: {unbalancedEntries.length}</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-red-100 dark:bg-red-900">
                            <th className="px-2 py-1 text-right">التاريخ</th>
                            <th className="px-2 py-1 text-right">رقم القيد</th>
                            <th className="px-2 py-1 text-right">مدين</th>
                            <th className="px-2 py-1 text-right">دائن</th>
                            <th className="px-2 py-1 text-right">الفرق</th>
                            <th className="px-2 py-1 text-right">فتح</th>
                          </tr>
                        </thead>
                        <tbody>
                          {unbalancedEntries.map((e) => (
                            <tr key={e.id} className="border-b">
                              <td className="px-2 py-1">{new Date(e.entry_date).toLocaleDateString("ar")}</td>
                              <td className="px-2 py-1">{e.id}</td>
                              <td className="px-2 py-1 text-left">{numberFmt.format(e.debit)}</td>
                              <td className="px-2 py-1 text-left">{numberFmt.format(e.credit)}</td>
                              <td className="px-2 py-1 text-left">{numberFmt.format(e.difference)}</td>
                              <td className="px-2 py-1">
                                <Button variant="outline" size="sm" onClick={() => router.push(`/journal-entries/${e.id}`)}>فتح</Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-gray-50 dark:bg-slate-900">
                      <tr>
                        <th className="px-4 py-3 text-right">الرمز</th>
                        <th className="px-4 py-3 text-right">اسم الحساب</th>
                        <th className="px-4 py-3 text-right">مدين</th>
                        <th className="px-4 py-3 text-right">دائن</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accounts.map((account, idx) => (
                        <tr key={idx} className="border-b hover:bg-gray-50 dark:hover:bg-slate-900">
                          <td className="px-4 py-3 font-medium">{account.account_code}</td>
                          <td className="px-4 py-3">{account.account_name}</td>
                          <td className="px-4 py-3 text-left">{numberFmt.format(account.balance > 0 ? account.balance : 0)}</td>
                          <td className="px-4 py-3 text-left">{numberFmt.format(account.balance < 0 ? -account.balance : 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-bold bg-gray-100 dark:bg-slate-800">
                        <td className="px-4 py-3">الإجمالي</td>
                        <td className="px-4 py-3 text-left">{numberFmt.format(totalDebit)}</td>
                        <td className="px-4 py-3 text-left">{numberFmt.format(totalCredit)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  )
}
