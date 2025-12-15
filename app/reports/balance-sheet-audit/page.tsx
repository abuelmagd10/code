"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { AlertCircle, CheckCircle, RefreshCw } from "lucide-react"

interface AuditResult {
  summary: {
    assets: number
    liabilities: number
    equity: number
    income: number
    expense: number
    netIncome: number
    totalEquity: number
    totalLiabilitiesEquity: number
    balanceSheetDifference: number
    isBalanced: boolean
  }
  accountsByType: Record<string, { accounts: any[], total: number }>
  negativeBalances: any[]
  unbalancedEntries: any[]
  totalImbalance: number
}

export default function BalanceSheetAuditPage() {
  const supabase = useSupabase()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AuditResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const runAudit = async () => {
    setLoading(true)
    setError(null)
    try {
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) {
        setError("لم يتم العثور على الشركة")
        return
      }
      const res = await fetch(`/api/balance-sheet-audit?companyId=${companyId}`)
      const data = await res.json()
      if (data.error) {
        setError(data.error)
      } else {
        setResult(data)
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { runAudit() }, [])

  const fmt = (n: number) => new Intl.NumberFormat('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold">🔍 فحص توازن الميزانية العمومية</h1>
            <Button onClick={runAudit} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ml-2 ${loading ? 'animate-spin' : ''}`} />
              إعادة الفحص
            </Button>
          </div>

          {error && (
            <Card className="border-red-500">
              <CardContent className="pt-6">
                <p className="text-red-600">❌ خطأ: {error}</p>
              </CardContent>
            </Card>
          )}

          {result && (
            <>
              {/* ملخص التوازن */}
              <Card className={result.summary.isBalanced ? "border-green-500" : "border-red-500"}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {result.summary.isBalanced ? (
                      <><CheckCircle className="text-green-500" /> الميزانية متوازنة ✅</>
                    ) : (
                      <><AlertCircle className="text-red-500" /> الميزانية غير متوازنة ❌</>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-3 bg-blue-50 rounded"><p className="text-sm text-gray-600">الأصول</p><p className="text-xl font-bold text-blue-600">{fmt(result.summary.assets)}</p></div>
                    <div className="p-3 bg-red-50 rounded"><p className="text-sm text-gray-600">الالتزامات</p><p className="text-xl font-bold text-red-600">{fmt(result.summary.liabilities)}</p></div>
                    <div className="p-3 bg-green-50 rounded"><p className="text-sm text-gray-600">حقوق الملكية</p><p className="text-xl font-bold text-green-600">{fmt(result.summary.totalEquity)}</p></div>
                    <div className="p-3 bg-purple-50 rounded"><p className="text-sm text-gray-600">صافي الدخل</p><p className="text-xl font-bold text-purple-600">{fmt(result.summary.netIncome)}</p></div>
                  </div>
                  <div className="mt-4 p-4 bg-gray-100 rounded">
                    <p><strong>الأصول:</strong> {fmt(result.summary.assets)}</p>
                    <p><strong>الالتزامات + حقوق الملكية:</strong> {fmt(result.summary.totalLiabilitiesEquity)}</p>
                    <p className={`font-bold ${Math.abs(result.summary.balanceSheetDifference) > 0.01 ? 'text-red-600' : 'text-green-600'}`}>
                      <strong>الفرق:</strong> {fmt(result.summary.balanceSheetDifference)}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* الأرصدة السالبة غير المنطقية */}
              {result.negativeBalances.length > 0 && (
                <Card className="border-orange-500">
                  <CardHeader><CardTitle>⚠️ أرصدة سالبة غير منطقية ({result.negativeBalances.length})</CardTitle></CardHeader>
                  <CardContent>
                    <table className="w-full text-sm">
                      <thead><tr className="border-b"><th className="text-right p-2">الحساب</th><th className="text-right p-2">الرصيد</th><th className="text-right p-2">المشكلة</th></tr></thead>
                      <tbody>
                        {result.negativeBalances.map((acc, i) => (
                          <tr key={i} className="border-b"><td className="p-2">{acc.account_code} - {acc.account_name}</td><td className="p-2 text-red-600">{fmt(acc.balance)}</td><td className="p-2 text-orange-600">{acc.issue}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              )}

              {/* القيود غير المتوازنة */}
              {result.unbalancedEntries.length > 0 && (
                <Card className="border-red-500">
                  <CardHeader><CardTitle>❌ قيود غير متوازنة ({result.unbalancedEntries.length}) - إجمالي عدم التوازن: {fmt(result.totalImbalance)}</CardTitle></CardHeader>
                  <CardContent>
                    <table className="w-full text-sm">
                      <thead><tr className="border-b"><th className="text-right p-2">التاريخ</th><th className="text-right p-2">النوع</th><th className="text-right p-2">مدين</th><th className="text-right p-2">دائن</th><th className="text-right p-2">الفرق</th></tr></thead>
                      <tbody>
                        {result.unbalancedEntries.map((e, i) => (
                          <tr key={i} className="border-b"><td className="p-2">{e.entry_date}</td><td className="p-2">{e.reference_type}</td><td className="p-2">{fmt(e.debit)}</td><td className="p-2">{fmt(e.credit)}</td><td className="p-2 text-red-600 font-bold">{fmt(e.difference)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              )}

              {/* تفاصيل الحسابات */}
              <Card>
                <CardHeader><CardTitle>📊 تفاصيل الحسابات حسب النوع</CardTitle></CardHeader>
                <CardContent>
                  {Object.entries(result.accountsByType).map(([type, data]) => data.accounts.length > 0 && (
                    <div key={type} className="mb-4">
                      <h3 className="font-bold text-lg mb-2">{type.toUpperCase()} (إجمالي: {fmt(data.total)})</h3>
                      <table className="w-full text-sm mb-4">
                        <tbody>
                          {data.accounts.map((acc, i) => (
                            <tr key={i} className="border-b"><td className="p-2">{acc.account_code} - {acc.account_name}</td><td className={`p-2 ${acc.balance < 0 ? 'text-red-600' : ''}`}>{fmt(acc.balance)}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

