"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { Download, ArrowRight } from "lucide-react"
import { useRouter } from "next/navigation"
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend, PieChart, Pie, Cell } from "recharts"

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
  const [search, setSearch] = useState<string>("")

  useEffect(() => {
    loadPurchasesData()
  }, [fromDate, toDate])

  // استخدام الدالة الموحدة للحصول على معرف الشركة

  const loadPurchasesData = async () => {
    try {
      setIsLoading(true)
      const res = await fetch(`/api/report-purchases?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`)
      const rows = res.ok ? await res.json() : []
      setPurchasesData(Array.isArray(rows) ? rows : [])
    } catch (error) {
      console.error("Error loading purchases data:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const totalPurchases = purchasesData.reduce((sum, p) => sum + p.total_purchases, 0)
  const filtered = purchasesData.filter(p => !search.trim() || p.supplier_name.toLowerCase().includes(search.trim().toLowerCase()))
  const pieData = filtered.map(p => ({ name: p.supplier_name, value: p.total_purchases }))
  const COLORS = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#06b6d4"]

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
          <div className="flex flex-col sm:flex-row sm:justify-between items-start gap-3 print:hidden">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">تقرير المشتريات</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">{new Date().toLocaleDateString("ar")}</p>
            </div>
            <div className="flex gap-2 flex-wrap">
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
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className="space-y-2">
                  <label className="text-sm" htmlFor="from_date">من تاريخ</label>
                  <input id="from_date" type="date" className="px-3 py-2 border rounded-md bg-white dark:bg-slate-900" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm" htmlFor="to_date">إلى تاريخ</label>
                  <input id="to_date" type="date" className="px-3 py-2 border rounded-md bg-white dark:bg-slate-900" value={toDate} onChange={(e) => setToDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm" htmlFor="search">بحث سريع</label>
                  <input id="search" type="text" className="px-3 py-2 border rounded-md bg-white dark:bg-slate-900" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث باسم المورد" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm">إجمالي المشتريات</label>
                  <div className="px-3 py-2 border rounded-lg bg-gray-50 dark:bg-slate-900 font-semibold">{numberFmt.format(totalPurchases)}</div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm">عدد الموردين</label>
                  <div className="px-3 py-2 border rounded-lg bg-gray-50 dark:bg-slate-900 font-semibold">{filtered.length}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {isLoading ? (
            <p className="text-center py-8">جاري التحميل...</p>
          ) : (
            <Card>
              <CardContent className="pt-6 space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={filtered}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="supplier_name" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="total_purchases" fill="#3b82f6" name="إجمالي المشتريات" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                          <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                            {pieData.map((entry, index) => (
                              <Cell key={index} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-[640px] w-full text-sm">
                    <thead className="border-b bg-gray-50 dark:bg-slate-900">
                      <tr>
                        <th className="px-4 py-3 text-right">المورد</th>
                        <th className="px-4 py-3 text-right">إجمالي المشتريات</th>
                        <th className="px-4 py-3 text-right">عدد فواتير المورد</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-4 py-6 text-center text-gray-600 dark:text-gray-400">لا توجد مشتريات في الفترة المحددة.</td>
                        </tr>
                      ) : filtered.map((purchase, idx) => (
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
