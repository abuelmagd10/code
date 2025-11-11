"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { getLeafAccountIds } from "@/lib/accounts"
import { Download, ArrowRight } from "lucide-react"
import { useRouter } from "next/navigation"
import { CompanyHeader } from "@/components/company-header"

interface IncomeData {
  totalIncome: number
  totalExpense: number
}

export default function IncomeStatementPage() {
  const supabase = useSupabase()
  const [data, setData] = useState<IncomeData>({
    totalIncome: 0,
    totalExpense: 0,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date()
    const start = new Date(d.getFullYear(), 0, 1)
    return start.toISOString().slice(0, 10)
  })
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const router = useRouter()

  useEffect(() => {
    loadIncomeData(startDate, endDate)
  }, [startDate, endDate])

  const loadIncomeData = async (fromDate: string, toDate: string) => {
    try {
      setIsLoading(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data: companyData } = await supabase.from("companies").select("id").eq("user_id", user.id).single()

      if (!companyData) return

      const { data: accountsData, error: accountsError } = await supabase
        .from("chart_of_accounts")
        .select("id, account_type, parent_id")
        .eq("company_id", companyData.id)

      if (accountsError) throw accountsError
      if (!accountsData) return

      const typeByAccount = new Map<string, string>()
      accountsData.forEach((acc: any) => {
        typeByAccount.set(acc.id, acc.account_type)
      })
      const leafAccountIds = getLeafAccountIds(accountsData || [])

      const { data: linesData, error: linesError } = await supabase
        .from("journal_entry_lines")
        .select("account_id, debit_amount, credit_amount, journal_entries!inner(entry_date, company_id)")
        .eq("journal_entries.company_id", companyData.id)
        .gte("journal_entries.entry_date", fromDate)
        .lte("journal_entries.entry_date", toDate)

      if (linesError) throw linesError

      let incomeTotal = 0
      let expenseTotal = 0

      linesData?.forEach((line: any) => {
        if (!leafAccountIds.has(String(line.account_id))) return
        const accType = typeByAccount.get(line.account_id)
        const debit = Number(line.debit_amount || 0)
        const credit = Number(line.credit_amount || 0)
        if (accType === "income") {
          incomeTotal += credit - debit
        } else if (accType === "expense") {
          expenseTotal += debit - credit
        }
      })

      setData({ totalIncome: incomeTotal, totalExpense: expenseTotal })
    } catch (error) {
      console.error("Error loading income data:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const netIncome = data.totalIncome - data.totalExpense

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
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">قائمة الدخل</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">{new Date().toLocaleDateString("ar")}</p>
            </div>
            <div className="flex gap-2 items-center">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="border rounded px-3 py-2 text-sm bg-white dark:bg-slate-900"
              />
              <span className="text-sm">إلى</span>
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
                <div className="max-w-2xl mx-auto space-y-6">
                  <div>
                    <h2 className="text-lg font-bold mb-2">الإيرادات</h2>
                    <div className="border-b pb-2">
                      <div className="flex justify-between px-4 py-2">
                        <span>إجمالي الإيرادات:</span>
                        <span className="font-semibold">{data.totalIncome.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h2 className="text-lg font-bold mb-2">المصروفات</h2>
                    <div className="border-b pb-2">
                      <div className="flex justify-between px-4 py-2">
                        <span>إجمالي المصروفات:</span>
                        <span className="font-semibold">{data.totalExpense.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div
                      className={`flex justify-between px-4 py-3 rounded-lg font-bold text-lg ${
                        netIncome >= 0
                          ? "bg-green-100 dark:bg-green-900 text-green-900 dark:text-green-100"
                          : "bg-red-100 dark:bg-red-900 text-red-900 dark:text-red-100"
                      }`}
                    >
                      <span>{netIncome >= 0 ? "صافي الدخل" : "صافي الخسارة"}:</span>
                      <span>{netIncome.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  )
}
