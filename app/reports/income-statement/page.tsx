"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { Download, ArrowRight } from "lucide-react"
import { useRouter } from "next/navigation"

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
  const router = useRouter()

  useEffect(() => {
    loadIncomeData()
  }, [])

  const loadIncomeData = async () => {
    try {
      setIsLoading(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data: companyData } = await supabase.from("companies").select("id").eq("user_id", user.id).single()

      if (!companyData) return

      const { data: accountsData } = await supabase
        .from("chart_of_accounts")
        .select("account_type, opening_balance")
        .eq("company_id", companyData.id)

      if (accountsData) {
        const income = accountsData
          .filter((a) => a.account_type === "income")
          .reduce((sum, a) => sum + a.opening_balance, 0)

        const expense = accountsData
          .filter((a) => a.account_type === "expense")
          .reduce((sum, a) => sum + a.opening_balance, 0)

        setData({
          totalIncome: income,
          totalExpense: expense,
        })
      }
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
          <div className="flex justify-between items-center print:hidden">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">قائمة الدخل</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">{new Date().toLocaleDateString("ar")}</p>
            </div>
            <div className="flex gap-2">
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
