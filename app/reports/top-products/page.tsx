"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { Download, ArrowRight, Star, TrendingUp, Package } from "lucide-react"
import { useRouter } from "next/navigation"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell } from "recharts"

interface TopProduct {
  product_id: string
  product_name: string
  product_sku: string
  item_type: string
  total_quantity: number
  total_revenue: number
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']

export default function TopProductsPage() {
  const supabase = useSupabase()
  const router = useRouter()
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')

  // Helper function to format date
  const formatLocalDate = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const today = new Date()
  const defaultTo = formatLocalDate(today)
  const defaultFrom = formatLocalDate(new Date(today.getFullYear(), today.getMonth(), 1))

  const [fromDate, setFromDate] = useState<string>(defaultFrom)
  const [toDate, setToDate] = useState<string>(defaultTo)
  const [itemTypeFilter, setItemTypeFilter] = useState<'all' | 'product' | 'service'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'sent' | 'paid' | 'partially_paid'>('all')
  const [sortBy, setSortBy] = useState<'revenue' | 'quantity'>('revenue')
  const [limit, setLimit] = useState<number>(10)

  useEffect(() => {
    const handler = () => {
      try {
        const v = localStorage.getItem('app_language') || 'ar'
        setAppLang(v === 'en' ? 'en' : 'ar')
      } catch {}
    }
    handler()
    window.addEventListener('app_language_changed', handler)
    return () => window.removeEventListener('app_language_changed', handler)
  }, [])

  const t = (en: string, ar: string) => appLang === 'en' ? en : ar
  const numberFmt = new Intl.NumberFormat(appLang === 'en' ? "en-EG" : "ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  useEffect(() => {
    if (fromDate && toDate) {
      loadData()
    }
  }, [fromDate, toDate, itemTypeFilter, statusFilter, sortBy, limit])

  /**
   * ✅ تحميل بيانات الأصناف الأكثر مبيعًا
   * ⚠️ OPERATIONAL REPORT - تقرير تشغيلي (من invoices و invoice_items مباشرة)
   * راجع: docs/OPERATIONAL_REPORTS_GUIDE.md
   */
  const loadData = async () => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams({
        from: fromDate,
        to: toDate,
        item_type: itemTypeFilter,
        status: statusFilter,
        sort_by: sortBy,
        limit: limit.toString()
      })

      const res = await fetch(`/api/top-products?${params.toString()}`)
      if (!res.ok) {
        console.error("API Error:", res.status)
        setTopProducts([])
        return
      }

      const data = await res.json()
      setTopProducts(Array.isArray(data.data) ? data.data : [])
    } catch (error) {
      console.error("Error loading top products:", error)
      setTopProducts([])
    } finally {
      setIsLoading(false)
    }
  }

  const handleExportCsv = () => {
    const headers = ["rank", "product_sku", "product_name", "item_type", "total_quantity", "total_revenue"]
    const rowsCsv = topProducts.map((item, idx) => [
      (idx + 1).toString(),
      item.product_sku,
      item.product_name,
      item.item_type,
      item.total_quantity.toString(),
      item.total_revenue.toFixed(2)
    ])
    const csv = [headers.join(","), ...rowsCsv.map((r) => r.join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const aEl = document.createElement("a")
    aEl.href = url
    aEl.download = `top-products-${fromDate}-${toDate}.csv`
    aEl.click()
    URL.revokeObjectURL(url)
  }

  const totalRevenue = topProducts.reduce((sum, p) => sum + p.total_revenue, 0)
  const totalQuantity = topProducts.reduce((sum, p) => sum + p.total_quantity, 0)

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
        <div className="space-y-6">
          {/* Header */}
          <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
            <CardContent className="py-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-gradient-to-br from-yellow-500 to-orange-600 rounded-xl shadow-lg">
                    <Star className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                      {t("Top Products Report", "تقرير الأصناف الأكثر مبيعًا")}
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {t("Best selling products ranking", "ترتيب الأصناف الأكثر مبيعًا")}
                    </p>
                  </div>
                </div>
                <Button variant="outline" onClick={() => router.push("/reports")}>
                  <ArrowRight className="w-4 h-4 ml-2" />
                  {t("Back", "العودة")}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="dark:bg-gray-800">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t("Top Products", "أفضل المنتجات")}</p>
                    <p className="text-2xl font-bold">{topProducts.length}</p>
                  </div>
                  <Star className="w-8 h-8 text-yellow-500" />
                </div>
              </CardContent>
            </Card>
            <Card className="dark:bg-gray-800">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t("Total Revenue", "إجمالي الإيرادات")}</p>
                    <p className="text-2xl font-bold">{numberFmt.format(totalRevenue)}</p>
                  </div>
                  <TrendingUp className="w-8 h-8 text-green-500" />
                </div>
              </CardContent>
            </Card>
            <Card className="dark:bg-gray-800">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t("Total Quantity", "إجمالي الكمية")}</p>
                    <p className="text-2xl font-bold">{totalQuantity}</p>
                  </div>
                  <Package className="w-8 h-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card className="dark:bg-gray-800">
            <CardContent className="py-4">
              <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                <div>
                  <Label className="text-xs">{t("From Date", "من تاريخ")}</Label>
                  <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full" />
                </div>
                <div>
                  <Label className="text-xs">{t("To Date", "إلى تاريخ")}</Label>
                  <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-full" />
                </div>
                <div>
                  <Label className="text-xs">{t("Item Type", "نوع العنصر")}</Label>
                  <Select value={itemTypeFilter} onValueChange={(v) => setItemTypeFilter(v as 'all' | 'product' | 'service')}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("All", "الكل")}</SelectItem>
                      <SelectItem value="product">{t("Products", "منتجات")}</SelectItem>
                      <SelectItem value="service">{t("Services", "خدمات")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">{t("Status", "الحالة")}</Label>
                  <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | 'sent' | 'paid' | 'partially_paid')}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("All", "الكل")}</SelectItem>
                      <SelectItem value="sent">{t("Sent", "مرسلة")}</SelectItem>
                      <SelectItem value="paid">{t("Paid", "مدفوعة")}</SelectItem>
                      <SelectItem value="partially_paid">{t("Partially Paid", "مدفوعة جزئياً")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">{t("Sort By", "ترتيب حسب")}</Label>
                  <Select value={sortBy} onValueChange={(v) => setSortBy(v as 'revenue' | 'quantity')}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="revenue">{t("Revenue", "الإيرادات")}</SelectItem>
                      <SelectItem value="quantity">{t("Quantity", "الكمية")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">{t("Limit", "الحد الأقصى")}</Label>
                  <Input type="number" value={limit} onChange={(e) => setLimit(parseInt(e.target.value) || 10)} className="w-full" min="5" max="50" />
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <Button onClick={loadData} className="flex-1">
                  {t("Load", "تحميل")}
                </Button>
                <Button variant="outline" onClick={handleExportCsv}>
                  <Download className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Charts */}
          {topProducts.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="dark:bg-gray-800">
                <CardHeader>
                  <CardTitle>{t("Revenue by Product", "الإيرادات حسب المنتج")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={topProducts as any[]}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="product_name" angle={-45} textAnchor="end" height={80} />
                      <YAxis />
                      <Tooltip formatter={(value: number) => numberFmt.format(value)} />
                      <Legend />
                      <Bar dataKey="total_revenue" fill="#3b82f6" name={t("Revenue", "الإيرادات")} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card className="dark:bg-gray-800">
                <CardHeader>
                  <CardTitle>{t("Revenue Distribution", "توزيع الإيرادات")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={topProducts as any[]}
                        dataKey="total_revenue"
                        nameKey="product_name"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={(entry: any) => `${entry.product_name}: ${numberFmt.format(entry.total_revenue)}`}
                      >
                        {topProducts.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => numberFmt.format(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Table */}
          <Card className="dark:bg-gray-800">
            <CardHeader>
              <CardTitle>{t("Top Products Ranking", "ترتيب الأصناف الأكثر مبيعًا")} ({topProducts.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-gray-500">{t("Loading...", "جاري التحميل...")}</div>
              ) : topProducts.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Star className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                  <p>{t("No products found", "لا توجد منتجات")}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b dark:border-gray-700">
                        <th className="text-right py-3 px-2">{t("Rank", "الترتيب")}</th>
                        <th className="text-right py-3 px-2">{t("Product", "المنتج")}</th>
                        <th className="text-right py-3 px-2">{t("Type", "النوع")}</th>
                        <th className="text-right py-3 px-2">{t("Quantity", "الكمية")}</th>
                        <th className="text-right py-3 px-2">{t("Revenue", "الإيرادات")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topProducts.map((item, idx) => (
                        <tr key={idx} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-slate-700">
                          <td className="py-3 px-2">
                            <div className="flex items-center gap-2">
                              <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${idx < 3 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'}`}>
                                {idx + 1}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-2">
                            <div>
                              <div className="font-medium">{item.product_name}</div>
                              <div className="text-xs text-gray-500">{item.product_sku}</div>
                            </div>
                          </td>
                          <td className="py-3 px-2">
                            <span className={`px-2 py-1 rounded text-xs ${item.item_type === 'service' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'}`}>
                              {item.item_type === 'service' ? t("Service", "خدمة") : t("Product", "منتج")}
                            </span>
                          </td>
                          <td className="py-3 px-2">{item.total_quantity}</td>
                          <td className="py-3 px-2 font-semibold">{numberFmt.format(item.total_revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
