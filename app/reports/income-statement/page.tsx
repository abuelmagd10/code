"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { getCompanyId, computeIncomeExpenseTotals } from "@/lib/ledger"
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
  const numberFmt = new Intl.NumberFormat("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  useEffect(() => {
    loadIncomeData(startDate, endDate)
  }, [startDate, endDate])

  const loadIncomeData = async (fromDate: string, toDate: string) => {
    try {
      setIsLoading(true)
      const companyId = await getCompanyId(supabase)
      if (!companyId) return
      const { totalIncome, totalExpense } = await computeIncomeExpenseTotals(supabase, companyId, fromDate, toDate)
      setData({ totalIncome, totalExpense })
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

  const handleExportCsv = () => {
    const headers = ["metric", "amount"]
    const rows = [
      ["total_income", data.totalIncome.toFixed(2)],
      ["total_expense", data.totalExpense.toFixed(2)],
      ["net_income", (data.totalIncome - data.totalExpense).toFixed(2)],
    ]
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `income-statement-${startDate}_to_${endDate}.csv`
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
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">قائمة الدخل</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">من {new Date(startDate).toLocaleDateString("ar")} إلى {new Date(endDate).toLocaleDateString("ar")}</p>
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
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="max-w-2xl mx-auto space-y-6">
                  <div>
                    <h2 className="text-lg font-bold mb-2">الإيرادات</h2>
                    <div className="border-b pb-2">
                      <div className="flex justify-between px-4 py-2">
                        <span>إجمالي الإيرادات:</span>
                        <span className="font-semibold">{numberFmt.format(data.totalIncome)}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h2 className="text-lg font-bold mb-2">المصروفات</h2>
                    <div className="border-b pb-2">
                      <div className="flex justify-between px-4 py-2">
                        <span>إجمالي المصروفات:</span>
                        <span className="font-semibold">{numberFmt.format(data.totalExpense)}</span>
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
                      <span>{numberFmt.format(netIncome)}</span>
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
