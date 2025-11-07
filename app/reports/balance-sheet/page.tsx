"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { Download, ArrowRight } from "lucide-react"
import { useRouter } from "next/navigation"

interface AccountBalance {
  account_name: string
  account_type: string
  balance: number
}

export default function BalanceSheetPage() {
  const supabase = useSupabase()
  const [balances, setBalances] = useState<AccountBalance[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    loadBalances()
  }, [])

  const loadBalances = async () => {
    try {
      setIsLoading(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data: companyData } = await supabase.from("companies").select("id").eq("user_id", user.id).single()

      if (!companyData) return

      const { data } = await supabase
        .from("chart_of_accounts")
        .select("account_name, account_type, opening_balance")
        .eq("company_id", companyData.id)

      if (data) {
        setBalances(
          data.map((acc) => ({
            account_name: acc.account_name,
            account_type: acc.account_type,
            balance: acc.opening_balance,
          })),
        )
      }
    } catch (error) {
      console.error("Error loading balances:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const calculateTotalsByType = (type: string) => {
    return balances.filter((b) => b.account_type === type).reduce((sum, b) => sum + b.balance, 0)
  }

  const assets = calculateTotalsByType("asset")
  const liabilities = calculateTotalsByType("liability")
  const equity = calculateTotalsByType("equity")
  const totalLiabilitiesAndEquity = liabilities + equity

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
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">الميزانية العمومية</h1>
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
                <div className="space-y-8">
                  <div>
                    <h2 className="text-xl font-bold mb-4">الأصول</h2>
                    <table className="w-full text-sm mb-4">
                      <tbody>
                        {balances
                          .filter((b) => b.account_type === "asset")
                          .map((item, idx) => (
                            <tr key={idx} className="border-b hover:bg-gray-50 dark:hover:bg-slate-900">
                              <td className="px-4 py-2">{item.account_name}</td>
                              <td className="px-4 py-2 text-left">{item.balance.toFixed(2)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                    <div className="flex justify-between font-bold text-lg bg-gray-100 dark:bg-slate-800 px-4 py-2 rounded">
                      <span>إجمالي الأصول:</span>
                      <span>{assets.toFixed(2)}</span>
                    </div>
                  </div>

                  <div>
                    <h2 className="text-xl font-bold mb-4">الالتزامات</h2>
                    <table className="w-full text-sm mb-4">
                      <tbody>
                        {balances
                          .filter((b) => b.account_type === "liability")
                          .map((item, idx) => (
                            <tr key={idx} className="border-b hover:bg-gray-50 dark:hover:bg-slate-900">
                              <td className="px-4 py-2">{item.account_name}</td>
                              <td className="px-4 py-2 text-left">{item.balance.toFixed(2)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                    <div className="flex justify-between font-bold text-lg bg-gray-100 dark:bg-slate-800 px-4 py-2 rounded">
                      <span>إجمالي الالتزامات:</span>
                      <span>{liabilities.toFixed(2)}</span>
                    </div>
                  </div>

                  <div>
                    <h2 className="text-xl font-bold mb-4">حقوق الملكية</h2>
                    <table className="w-full text-sm mb-4">
                      <tbody>
                        {balances
                          .filter((b) => b.account_type === "equity")
                          .map((item, idx) => (
                            <tr key={idx} className="border-b hover:bg-gray-50 dark:hover:bg-slate-900">
                              <td className="px-4 py-2">{item.account_name}</td>
                              <td className="px-4 py-2 text-left">{item.balance.toFixed(2)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                    <div className="flex justify-between font-bold text-lg bg-gray-100 dark:bg-slate-800 px-4 py-2 rounded">
                      <span>إجمالي حقوق الملكية:</span>
                      <span>{equity.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex justify-between font-bold text-lg">
                      <span>إجمالي الالتزامات + حقوق الملكية:</span>
                      <span
                        className={
                          Math.abs(assets - totalLiabilitiesAndEquity) < 0.01 ? "text-green-600" : "text-red-600"
                        }
                      >
                        {totalLiabilitiesAndEquity.toFixed(2)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                      {Math.abs(assets - totalLiabilitiesAndEquity) < 0.01
                        ? "✓ الميزانية متوازنة"
                        : "✗ الميزانية غير متوازنة"}
                    </p>
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
