"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { Download, ArrowRight } from "lucide-react"
import { useRouter } from "next/navigation"

interface SalesData {
  customer_name: string
  total_sales: number
  invoice_count: number
}

export default function SalesReportPage() {
  const supabase = useSupabase()
  const [salesData, setSalesData] = useState<SalesData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()
  const numberFmt = new Intl.NumberFormat("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const today = new Date()
  const defaultTo = today.toISOString().slice(0, 10)
  const defaultFrom = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10)
  const [fromDate, setFromDate] = useState<string>(defaultFrom)
  const [toDate, setToDate] = useState<string>(defaultTo)

  useEffect(() => {
    loadSalesData()
  }, [fromDate, toDate])

  const loadSalesData = async () => {
    try {
      setIsLoading(true)

      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      let query = supabase
        .from("invoices")
        .select("total_amount, invoice_date, status, customers(name)")
        .eq("company_id", companyId)
        .eq("status", "paid")

      if (fromDate) query = query.gte("invoice_date", fromDate)
      if (toDate) query = query.lte("invoice_date", toDate)

      const { data } = await query

      if (data) {
        const grouped = data.reduce((acc: Record<string, any>, inv: any) => {
          const customer = (inv.customers as any)?.name || "Unknown"
          if (!acc[customer]) {
            acc[customer] = { total: 0, count: 0 }
          }
          acc[customer].total += Number(inv.total_amount || 0)
          acc[customer].count += 1
          return acc
        }, {})

        setSalesData(
          Object.entries(grouped).map(([name, data]: any) => ({
            customer_name: name,
            total_sales: data.total,
            invoice_count: data.count,
          })),
        )
      }
    } catch (error) {
      console.error("Error loading sales data:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const totalSales = salesData.reduce((sum, s) => sum + s.total_sales, 0)

  const handlePrint = () => {
    window.print()
  }

  const handleExportCsv = () => {
    const headers = ["customer_name", "total_sales", "invoice_count"]
    const rowsCsv = salesData.map((s) => [s.customer_name, s.total_sales.toFixed(2), String(s.invoice_count)])
    const csv = [headers.join(","), ...rowsCsv.map((r) => r.join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const aEl = document.createElement("a")
    aEl.href = url
    aEl.download = `sales-${fromDate}-${toDate}.csv`
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
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">تقرير المبيعات</h1>
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
                  <label className="text-sm">إجمالي المبيعات</label>
                  <div className="px-3 py-2 border rounded-lg bg-gray-50 dark:bg-slate-900 font-semibold">{numberFmt.format(totalSales)}</div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm">عدد العملاء</label>
                  <div className="px-3 py-2 border rounded-lg bg-gray-50 dark:bg-slate-900 font-semibold">{salesData.length}</div>
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
                        <th className="px-4 py-3 text-right">العميل</th>
                        <th className="px-4 py-3 text-right">إجمالي المبيعات</th>
                        <th className="px-4 py-3 text-right">عدد الفواتير</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesData.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-4 py-6 text-center text-gray-600 dark:text-gray-400">لا توجد مبيعات في الفترة المحددة.</td>
                        </tr>
                      ) : salesData.map((sale, idx) => (
                        <tr key={idx} className="border-b hover:bg-gray-50 dark:hover:bg-slate-900">
                          <td className="px-4 py-3">{sale.customer_name}</td>
                          <td className="px-4 py-3 font-semibold">{numberFmt.format(sale.total_sales)}</td>
                          <td className="px-4 py-3">{sale.invoice_count}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-bold bg-gray-100 dark:bg-slate-800">
                        <td className="px-4 py-3">الإجمالي</td>
                        <td colSpan={2} className="px-4 py-3">
                          {numberFmt.format(totalSales)}
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
