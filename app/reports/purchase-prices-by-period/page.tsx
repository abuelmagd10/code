"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { Download, ArrowRight, TrendingUp, TrendingDown, Package } from "lucide-react"
import { useRouter } from "next/navigation"
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from "recharts"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface PriceData {
  product_id: string
  product_name: string
  product_sku: string
  period: string
  avg_price: number
  min_price: number
  max_price: number
  total_quantity: number
  bill_count: number
}

interface Product {
  id: string
  name: string
  sku: string
}

export default function PurchasePricesByPeriodPage() {
  const supabase = useSupabase()
  const router = useRouter()
  const [priceData, setPriceData] = useState<PriceData[]>([])
  const [products, setProducts] = useState<Product[]>([])
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
  const defaultFrom = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`

  const [fromDate, setFromDate] = useState<string>(defaultFrom)
  const [toDate, setToDate] = useState<string>(defaultTo)
  const [selectedProduct, setSelectedProduct] = useState<string>("")
  const [selectedSupplier, setSelectedSupplier] = useState<string>("")
  const [period, setPeriod] = useState<'month' | 'week' | 'day'>('month')

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
        .or("item_type.is.null,item_type.eq.product")
        .order("name")

      setProducts((data || []) as Product[])
    }
    loadProducts()
  }, [supabase])

  useEffect(() => {
    if (fromDate && toDate) {
      loadPriceData()
    }
  }, [fromDate, toDate, selectedProduct, selectedSupplier, period])

  /**
   * ✅ تحميل بيانات أسعار الشراء حسب الفترات
   * ⚠️ OPERATIONAL REPORT - تقرير تشغيلي (من bills و bill_items مباشرة)
   * راجع: docs/OPERATIONAL_REPORTS_GUIDE.md
   */
  const loadPriceData = async () => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams({
        from: fromDate,
        to: toDate,
        period: period
      })
      if (selectedProduct) params.set('product_id', selectedProduct)
      if (selectedSupplier) params.set('supplier_id', selectedSupplier)

      const res = await fetch(`/api/purchase-prices-by-period?${params.toString()}`)
      if (!res.ok) {
        console.error("API Error:", res.status)
        setPriceData([])
        return
      }

      const data = await res.json()
      setPriceData(Array.isArray(data.data) ? data.data : [])
    } catch (error) {
      console.error("Error loading price data:", error)
      setPriceData([])
    } finally {
      setIsLoading(false)
    }
  }

  // Group data by product for charts
  const groupedByProduct = priceData.reduce((acc, item) => {
    if (!acc[item.product_id]) {
      acc[item.product_id] = {
        product_name: item.product_name,
        product_sku: item.product_sku,
        data: []
      }
    }
    acc[item.product_id].data.push({
      period: item.period,
      avg_price: item.avg_price,
      min_price: item.min_price,
      max_price: item.max_price
    })
    return acc
  }, {} as Record<string, { product_name: string; product_sku: string; data: Array<{ period: string; avg_price: number; min_price: number; max_price: number }> }>)

  const handleExportCsv = () => {
    const headers = ["product_name", "product_sku", "period", "avg_price", "min_price", "max_price", "total_quantity", "bill_count"]
    const rowsCsv = priceData.map((p) => [
      p.product_name,
      p.product_sku,
      p.period,
      p.avg_price.toFixed(2),
      p.min_price.toFixed(2),
      p.max_price.toFixed(2),
      p.total_quantity,
      p.bill_count
    ])
    const csv = [headers.join(","), ...rowsCsv.map((r) => r.join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const aEl = document.createElement("a")
    aEl.href = url
    aEl.download = `purchase-prices-${fromDate}-${toDate}.csv`
    aEl.click()
    URL.revokeObjectURL(url)
  }

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
                  <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg">
                    <TrendingUp className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                      {t("Purchase Prices by Period", "أسعار الشراء حسب الفترات")}
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {t("Track purchase price trends over time", "تتبع اتجاهات أسعار الشراء عبر الزمن")}
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
                  <Label className="text-xs">{t("Period", "الفترة")}</Label>
                  <Select value={period} onValueChange={(v) => setPeriod(v as 'month' | 'week' | 'day')}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="month">{t("Monthly", "شهري")}</SelectItem>
                      <SelectItem value="week">{t("Weekly", "أسبوعي")}</SelectItem>
                      <SelectItem value="day">{t("Daily", "يومي")}</SelectItem>
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
                <div className="flex items-end gap-2">
                  <Button onClick={loadPriceData} className="flex-1">
                    {t("Load", "تحميل")}
                  </Button>
                  <Button variant="outline" onClick={handleExportCsv}>
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Charts */}
          {!isLoading && Object.keys(groupedByProduct).length > 0 && (
            <div className="grid grid-cols-1 gap-6">
              {Object.entries(groupedByProduct).map(([productId, productData]) => (
                <Card key={productId} className="dark:bg-gray-800">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Package className="w-5 h-5" />
                      {productData.product_name} ({productData.product_sku})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={productData.data}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="period" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="avg_price" stroke="#3b82f6" name={t("Average Price", "متوسط السعر")} />
                        <Line type="monotone" dataKey="min_price" stroke="#10b981" name={t("Min Price", "أقل سعر")} />
                        <Line type="monotone" dataKey="max_price" stroke="#ef4444" name={t("Max Price", "أعلى سعر")} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Table */}
          <Card className="dark:bg-gray-800">
            <CardHeader>
              <CardTitle>{t("Price Data", "بيانات الأسعار")} ({priceData.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-gray-500">{t("Loading...", "جاري التحميل...")}</div>
              ) : priceData.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Package className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                  <p>{t("No price data found", "لا توجد بيانات أسعار")}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b dark:border-gray-700">
                        <th className="text-right py-3 px-2">{t("Product", "المنتج")}</th>
                        <th className="text-right py-3 px-2">{t("Period", "الفترة")}</th>
                        <th className="text-right py-3 px-2">{t("Avg Price", "متوسط السعر")}</th>
                        <th className="text-right py-3 px-2">{t("Min Price", "أقل سعر")}</th>
                        <th className="text-right py-3 px-2">{t("Max Price", "أعلى سعر")}</th>
                        <th className="text-right py-3 px-2">{t("Quantity", "الكمية")}</th>
                        <th className="text-right py-3 px-2">{t("Bills", "الفواتير")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {priceData.map((item, idx) => (
                        <tr key={idx} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-slate-700">
                          <td className="py-3 px-2 font-medium">{item.product_name}</td>
                          <td className="py-3 px-2">{item.period}</td>
                          <td className="py-3 px-2 font-semibold">{numberFmt.format(item.avg_price)}</td>
                          <td className="py-3 px-2 text-green-600">{numberFmt.format(item.min_price)}</td>
                          <td className="py-3 px-2 text-red-600">{numberFmt.format(item.max_price)}</td>
                          <td className="py-3 px-2">{item.total_quantity}</td>
                          <td className="py-3 px-2">{item.bill_count}</td>
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
