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

export default function TrialBalancePage() {
  const supabase = useSupabase()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const router = useRouter()

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
        .select("account_id, debit_amount, credit_amount, journal_entries!inner(entry_date, company_id)")
        .eq("journal_entries.company_id", companyData.id)
        .lte("journal_entries.entry_date", asOfDate)

      if (linesError) throw linesError

      const movementByAccount = new Map<string, number>()
      linesData?.forEach((line: any) => {
        const accId = line.account_id as string
        const debit = Number(line.debit_amount || 0)
        const credit = Number(line.credit_amount || 0)
        const net = debit - credit
        movementByAccount.set(accId, (movementByAccount.get(accId) || 0) + net)
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
    } catch (error) {
      console.error("Error loading accounts:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0)

  const handlePrint = () => {
    window.print()
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
              <Button variant="outline" onClick={() => router.push("/reports")}>
                <ArrowRight className="w-4 h-4 mr-2" />
                العودة
              </Button>
            </div>
          </div>

          {isLoading ? (
            <p className="text-center py-8">جاري التحميل...</p>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-gray-50 dark:bg-slate-900">
                      <tr>
                        <th className="px-4 py-3 text-right">الرمز</th>
                        <th className="px-4 py-3 text-right">اسم الحساب</th>
                        <th className="px-4 py-3 text-right">الرصيد</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accounts.map((account, idx) => (
                        <tr key={idx} className="border-b hover:bg-gray-50 dark:hover:bg-slate-900">
                          <td className="px-4 py-3 font-medium">{account.account_code}</td>
                          <td className="px-4 py-3">{account.account_name}</td>
                          <td className="px-4 py-3 text-left">{account.balance.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-bold bg-gray-100 dark:bg-slate-800">
                        <td colSpan={2} className="px-4 py-3">
                          الإجمالي
                        </td>
                        <td className="px-4 py-3 text-left">{totalBalance.toFixed(2)}</td>
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
