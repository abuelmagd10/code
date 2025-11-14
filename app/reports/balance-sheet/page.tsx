"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import Link from "next/link"
import { getCompanyId, computeLeafAccountBalancesAsOf, computeBalanceSheetTotalsFromBalances } from "@/lib/ledger"
import { Download, ArrowRight } from "lucide-react"
import { useRouter } from "next/navigation"
import { CompanyHeader } from "@/components/company-header"

interface AccountBalance {
  account_id: string
  account_name: string
  account_type: string
  balance: number
}

export default function BalanceSheetPage() {
  const supabase = useSupabase()
  const [balances, setBalances] = useState<AccountBalance[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const router = useRouter()
  const numberFmt = new Intl.NumberFormat("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  useEffect(() => {
    loadBalances(endDate)
  }, [endDate])

  const loadBalances = async (asOfDate: string) => {
    try {
      setIsLoading(true)
      const companyId = await getCompanyId(supabase)
      if (!companyId) return
      const computed = await computeLeafAccountBalancesAsOf(supabase, companyId, asOfDate)
      setBalances(
        computed.map((b) => ({
          account_id: b.account_id,
          account_name: b.account_name,
          account_type: b.account_type,
          balance: b.balance,
        })),
      )
    } catch (error) {
      console.error("Error loading balances:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const calculateTotalsByType = (type: string) => {
    return balances.filter((b) => b.account_type === type).reduce((sum, b) => sum + b.balance, 0)
  }

  const { assets, liabilities, equity, income, expense, netIncomeSigned, equityTotalSigned, totalLiabilitiesAndEquitySigned } = computeBalanceSheetTotalsFromBalances(balances)
  const netIncomeDisplay = Math.abs(netIncomeSigned)
  const equityTotalDisplay = Math.abs(equityTotalSigned)
  const totalLiabilitiesAndEquityAbs = Math.abs(totalLiabilitiesAndEquitySigned)

  const handlePrint = () => {
    window.print()
  }

  const handleExportCsv = () => {
    const headers = ["type", "account_name", "balance"]
    const rows = balances.map((b) => [b.account_type, b.account_name, b.balance.toFixed(2)])
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `balance-sheet-${endDate}.csv`
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
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">الميزانية العمومية</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">{new Date().toLocaleDateString("ar")}</p>
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
          ) : balances.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-gray-600 dark:text-gray-400">لا توجد بيانات لعرضها في التاريخ المحدد.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-8">
                  <div>
                    <h2 className="text-xl font-bold mb-4">الأصول</h2>
                    <table className="w-full text-sm mb-4">
                      <tbody>
                        {balances
                          .filter((b) => b.account_type === "asset" && Math.abs(b.balance) >= 0.01)
                          .map((item, idx) => (
                            <tr key={idx} className="border-b hover:bg-gray-50 dark:hover:bg-slate-900">
                              <td className="px-4 py-2">
                                <Link href={`/journal-entries?account_id=${encodeURIComponent(item.account_id)}&to=${encodeURIComponent(endDate)}`}>{item.account_name}</Link>
                              </td>
                              <td className="px-4 py-2 text-left">{numberFmt.format(item.balance)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                    <div className="flex justify-between font-bold text-lg bg-gray-100 dark:bg-slate-800 px-4 py-2 rounded">
                      <span>إجمالي الأصول:</span>
                      <span>{numberFmt.format(assets)}</span>
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
                              <td className="px-4 py-2">
                                <Link href={`/journal-entries?account_id=${encodeURIComponent(item.account_id)}&to=${encodeURIComponent(endDate)}`}>{item.account_name}</Link>
                              </td>
                              <td className="px-4 py-2 text-left">{numberFmt.format(item.balance)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                    <div className="flex justify-between font-bold text-lg bg-gray-100 dark:bg-slate-800 px-4 py-2 rounded">
                      <span>إجمالي الالتزامات:</span>
                      <span>{numberFmt.format(liabilities)}</span>
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
                              <td className="px-4 py-2">
                                <Link href={`/journal-entries?account_id=${encodeURIComponent(item.account_id)}&to=${encodeURIComponent(endDate)}`}>{item.account_name}</Link>
                              </td>
                              <td className="px-4 py-2 text-left">{numberFmt.format(item.balance)}</td>
                            </tr>
                          ))}
                        <tr className="border-b bg-gray-50 dark:bg-slate-900">
                          <td className="px-4 py-2 font-medium">الأرباح/الخسائر الجارية</td>
                          <td className="px-4 py-2 text-left font-medium">{numberFmt.format(netIncomeDisplay)}</td>
                        </tr>
                      </tbody>
                    </table>
                    <div className="flex justify-between font-bold text-lg bg-gray-100 dark:bg-slate-800 px-4 py-2 rounded">
                      <span>إجمالي حقوق الملكية:</span>
                      <span>{numberFmt.format(equityTotalDisplay)}</span>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex justify-between font-bold text-lg">
                      <span>إجمالي الالتزامات + حقوق الملكية:</span>
                      <span
                        className={
                          Math.abs(assets - totalLiabilitiesAndEquityAbs) < 0.01 ? "text-green-600" : "text-red-600"
                        }
                      >
                        {numberFmt.format(totalLiabilitiesAndEquityAbs)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                      {Math.abs(assets - totalLiabilitiesAndEquityAbs) < 0.01
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
