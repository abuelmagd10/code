"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { Download, ArrowRight } from "lucide-react"
import { useRouter } from "next/navigation"

interface PurchasesData {
  supplier_name: string
  total_purchases: number
  bill_count: number
}

export default function PurchasesReportPage() {
  const supabase = useSupabase()
  const [purchasesData, setPurchasesData] = useState<PurchasesData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()
  const numberFmt = new Intl.NumberFormat("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const today = new Date()
  const defaultTo = today.toISOString().slice(0, 10)
  const defaultFrom = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10)
  const [fromDate, setFromDate] = useState<string>(defaultFrom)
  const [toDate, setToDate] = useState<string>(defaultTo)

  useEffect(() => {
    loadPurchasesData()
  }, [fromDate, toDate])

  // استخدام الدالة الموحدة للحصول على معرف الشركة

  const loadPurchasesData = async () => {
    try {
      setIsLoading(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      let query = supabase
        .from("bills")
        .select("total_amount, bill_date, status, suppliers(name)")
        .eq("company_id", companyId)
        .eq("status", "paid")

      if (fromDate) query = query.gte("bill_date", fromDate)
      if (toDate) query = query.lte("bill_date", toDate)

      const { data } = await query

      if (data) {
        const grouped = data.reduce((acc: Record<string, any>, bill: any) => {
          const supplier = (bill.suppliers as any)?.name || "Unknown"
          if (!acc[supplier]) {
            acc[supplier] = { total: 0, count: 0 }
          }
          acc[supplier].total += Number(bill.total_amount || 0)
          acc[supplier].count += 1
          return acc
        }, {})

        setPurchasesData(
          Object.entries(grouped).map(([name, data]: any) => ({
            supplier_name: name,
            total_purchases: data.total,
            bill_count: data.count,
          })),
        )
      }
    } catch (error) {
      console.error("Error loading purchases data:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const totalPurchases = purchasesData.reduce((sum, p) => sum + p.total_purchases, 0)

  const handlePrint = () => {
    window.print()
  }

  const handleExportCsv = () => {
    const headers = ["supplier_name", "total_purchases", "bill_count"]
    const rowsCsv = purchasesData.map((p) => [p.supplier_name, p.total_purchases.toFixed(2), String(p.bill_count)])
    const csv = [headers.join(","), ...rowsCsv.map((r) => r.join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const aEl = document.createElement("a")
    aEl.href = url
    aEl.download = `purchases-${fromDate}-${toDate}.csv`
    aEl.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />

      <main className="flex-1 md:mr-64 p-4 md:p-8">
        <div className="space-y-6">
          <div className="flex justify-between items-center print:hidden">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">تقرير المشتريات</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">{new Date().toLocaleDateString("ar")}</p>
            </div>
            <div className="flex gap-2">
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

          <Card className="print:hidden">
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <label className="text-sm" htmlFor="from_date">من تاريخ</label>
                  <input id="from_date" type="date" className="px-3 py-2 border rounded-md bg-white dark:bg-slate-900" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm" htmlFor="to_date">إلى تاريخ</label>
                  <input id="to_date" type="date" className="px-3 py-2 border rounded-md bg-white dark:bg-slate-900" value={toDate} onChange={(e) => setToDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm">إجمالي المشتريات</label>
                  <div className="px-3 py-2 border rounded-lg bg-gray-50 dark:bg-slate-900 font-semibold">{numberFmt.format(totalPurchases)}</div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm">عدد الموردين</label>
                  <div className="px-3 py-2 border rounded-lg bg-gray-50 dark:bg-slate-900 font-semibold">{purchasesData.length}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {isLoading ? (
            <p className="text-center py-8">جاري التحميل...</p>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-gray-50 dark:bg-slate-900">
                      <tr>
                        <th className="px-4 py-3 text-right">المورد</th>
                        <th className="px-4 py-3 text-right">إجمالي المشتريات</th>
                        <th className="px-4 py-3 text-right">عدد فواتير المورد</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchasesData.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-4 py-6 text-center text-gray-600 dark:text-gray-400">لا توجد مشتريات في الفترة المحددة.</td>
                        </tr>
                      ) : purchasesData.map((purchase, idx) => (
                        <tr key={idx} className="border-b hover:bg-gray-50 dark:hover:bg-slate-900">
                          <td className="px-4 py-3">{purchase.supplier_name}</td>
                          <td className="px-4 py-3 font-semibold">{numberFmt.format(purchase.total_purchases)}</td>
                          <td className="px-4 py-3">{purchase.bill_count}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-bold bg-gray-100 dark:bg-slate-800">
                        <td className="px-4 py-3">الإجمالي</td>
                        <td colSpan={2} className="px-4 py-3">
                          {numberFmt.format(totalPurchases)}
                        </td>
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
