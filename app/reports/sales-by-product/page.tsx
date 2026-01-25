"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { Download, ArrowRight, Package, TrendingUp } from "lucide-react"
import { useRouter } from "next/navigation"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts"

interface ProductSales {
  product_id: string
  product_name: string
  product_sku: string
  item_type: string
  total_quantity: number
  total_revenue: number
  invoice_count: number
}

export default function SalesByProductPage() {
  const supabase = useSupabase()
  const router = useRouter()
  const [salesData, setSalesData] = useState<ProductSales[]>([])
  const [products, setProducts] = useState<Array<{ id: string; name: string; sku: string }>>([])
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
  const [selectedProduct, setSelectedProduct] = useState<string>("")
  const [itemTypeFilter, setItemTypeFilter] = useState<'all' | 'product' | 'service'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'sent' | 'paid' | 'partially_paid'>('all')

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

  // Load products
  useEffect(() => {
    const loadProducts = async () => {
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      const { data } = await supabase
        .from("products")
        .select("id, name, sku")
        .eq("company_id", companyId)
        .order("name")

      setProducts((data || []) as Array<{ id: string; name: string; sku: string }>)
    }
    loadProducts()
  }, [supabase])

  useEffect(() => {
    if (fromDate && toDate) {
      loadData()
    }
  }, [fromDate, toDate, selectedProduct, itemTypeFilter, statusFilter])

  /**
   * ✅ تحميل بيانات المبيعات حسب المنتج
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
        status: statusFilter
      })
      if (selectedProduct) params.set('product_id', selectedProduct)

      const res = await fetch(`/api/sales-by-product?${params.toString()}`)
      if (!res.ok) {
        console.error("API Error:", res.status)
        setSalesData([])
        return
      }

      const data = await res.json()
      setSalesData(Array.isArray(data.data) ? data.data : [])
    } catch (error) {
      console.error("Error loading sales data:", error)
      setSalesData([])
    } finally {
      setIsLoading(false)
    }
  }

  const handleExportCsv = () => {
    const headers = ["product_sku", "product_name", "item_type", "total_quantity", "total_revenue", "invoice_count"]
    const rowsCsv = salesData.map((item) => [
      item.product_sku,
      item.product_name,
      item.item_type,
      item.total_quantity.toString(),
      item.total_revenue.toFixed(2),
      item.invoice_count.toString()
    ])
    const csv = [headers.join(","), ...rowsCsv.map((r) => r.join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const aEl = document.createElement("a")
    aEl.href = url
    aEl.download = `sales-by-product-${fromDate}-${toDate}.csv`
    aEl.click()
    URL.revokeObjectURL(url)
  }

  const totalRevenue = salesData.reduce((sum, s) => sum + s.total_revenue, 0)
  const totalQuantity = salesData.reduce((sum, s) => sum + s.total_quantity, 0)

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
                  <div className="p-3 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl shadow-lg">
                    <Package className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                      {t("Sales by Product Report", "تقرير المبيعات حسب المنتج")}
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {t("Product-based sales analysis", "تحليل المبيعات حسب المنتج")}
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
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t("Total Products", "إجمالي المنتجات")}</p>
                    <p className="text-2xl font-bold">{salesData.length}</p>
                  </div>
                  <Package className="w-8 h-8 text-blue-500" />
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
                  <Package className="w-8 h-8 text-purple-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card className="dark:bg-gray-800">
            <CardContent className="py-4">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
                  <Label className="text-xs">{t("Product", "المنتج")}</Label>
                  <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t("All Products", "جميع المنتجات")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">{t("All Products", "جميع المنتجات")}</SelectItem>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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

          {/* Chart */}
          {salesData.length > 0 && (
            <Card className="dark:bg-gray-800">
              <CardHeader>
                <CardTitle>{t("Revenue by Product", "الإيرادات حسب المنتج")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={salesData.slice(0, 20)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="product_name" angle={-45} textAnchor="end" height={100} />
                    <YAxis />
                    <Tooltip formatter={(value: number) => numberFmt.format(value)} />
                    <Legend />
                    <Bar dataKey="total_revenue" fill="#3b82f6" name={t("Revenue", "الإيرادات")} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Table */}
          <Card className="dark:bg-gray-800">
            <CardHeader>
              <CardTitle>{t("Product Sales Details", "تفاصيل مبيعات المنتجات")} ({salesData.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-gray-500">{t("Loading...", "جاري التحميل...")}</div>
              ) : salesData.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Package className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                  <p>{t("No sales data found", "لا توجد بيانات مبيعات")}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b dark:border-gray-700">
                        <th className="text-right py-3 px-2">{t("Product", "المنتج")}</th>
                        <th className="text-right py-3 px-2">{t("Type", "النوع")}</th>
                        <th className="text-right py-3 px-2">{t("Quantity", "الكمية")}</th>
                        <th className="text-right py-3 px-2">{t("Revenue", "الإيرادات")}</th>
                        <th className="text-right py-3 px-2">{t("Invoices", "عدد الفواتير")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesData.map((item, idx) => (
                        <tr key={idx} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-slate-700">
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
                          <td className="py-3 px-2">{item.invoice_count}</td>
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
