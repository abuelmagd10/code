"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { Download, ArrowRight, Scale, Package, Building2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from "recharts"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"

interface SupplierPrice {
  supplier_id: string
  supplier_name: string
  avg_price: number
  min_price: number
  max_price: number
  total_quantity: number
  bill_count: number
}

interface ProductComparison {
  product_id: string
  product_name: string
  product_sku: string
  suppliers: SupplierPrice[]
}

interface Product {
  id: string
  name: string
  sku: string
}

export default function SupplierPriceComparisonPage() {
  const supabase = useSupabase()
  const router = useRouter()
  const [comparisonData, setComparisonData] = useState<ProductComparison[]>([])
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
      loadComparisonData()
    }
  }, [fromDate, toDate, selectedProduct])

  /**
   * ✅ تحميل بيانات مقارنة أسعار الموردين
   * ⚠️ OPERATIONAL REPORT - تقرير تشغيلي (من bills و bill_items مباشرة)
   * راجع: docs/OPERATIONAL_REPORTS_GUIDE.md
   */
  const loadComparisonData = async () => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams({
        from: fromDate,
        to: toDate
      })
      if (selectedProduct) params.set('product_id', selectedProduct)

      const res = await fetch(`/api/supplier-price-comparison?${params.toString()}`)
      if (!res.ok) {
        console.error("API Error:", res.status)
        setComparisonData([])
        return
      }

      const data = await res.json()
      setComparisonData(Array.isArray(data.data) ? data.data : [])
    } catch (error) {
      console.error("Error loading comparison data:", error)
      setComparisonData([])
    } finally {
      setIsLoading(false)
    }
  }

  const handleExportCsv = () => {
    const headers = ["product_name", "product_sku", "supplier_name", "avg_price", "min_price", "max_price", "total_quantity", "bill_count"]
    const rowsCsv: string[][] = []
    comparisonData.forEach(product => {
      product.suppliers.forEach(supplier => {
        rowsCsv.push([
          product.product_name,
          product.product_sku,
          supplier.supplier_name,
          supplier.avg_price.toFixed(2),
          supplier.min_price.toFixed(2),
          supplier.max_price.toFixed(2),
          supplier.total_quantity.toString(),
          supplier.bill_count.toString()
        ])
      })
    })
    const csv = [headers.join(","), ...rowsCsv.map((r) => r.join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const aEl = document.createElement("a")
    aEl.href = url
    aEl.download = `supplier-price-comparison-${fromDate}-${toDate}.csv`
    aEl.click()
    URL.revokeObjectURL(url)
  }

  // Get best price supplier for each product
  const getBestPriceSupplier = (suppliers: SupplierPrice[]) => {
    if (suppliers.length === 0) return null
    return suppliers.reduce((best, current) => 
      current.avg_price < best.avg_price ? current : best
    )
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
                  <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl shadow-lg">
                    <Scale className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                      {t("Supplier Price Comparison", "مقارنة أسعار المنتجات بين الموردين")}
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {t("Compare product prices across suppliers", "مقارنة أسعار المنتجات بين مختلف الموردين")}
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
                  <Button onClick={loadComparisonData} className="flex-1">
                    {t("Load", "تحميل")}
                  </Button>
                  <Button variant="outline" onClick={handleExportCsv}>
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Comparison Cards */}
          {!isLoading && comparisonData.length > 0 && (
            <div className="grid grid-cols-1 gap-6">
              {comparisonData.map((product) => {
                const bestPrice = getBestPriceSupplier(product.suppliers)
                const chartData = product.suppliers.map(s => ({
                  supplier: s.supplier_name,
                  avg_price: s.avg_price,
                  min_price: s.min_price,
                  max_price: s.max_price
                }))

                return (
                  <Card key={product.product_id} className="dark:bg-gray-800">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                          <Package className="w-5 h-5" />
                          {product.product_name} ({product.product_sku})
                        </CardTitle>
                        {bestPrice && (
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                            {t("Best Price", "أفضل سعر")}: {bestPrice.supplier_name} - {numberFmt.format(bestPrice.avg_price)}
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="supplier" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="avg_price" fill="#3b82f6" name={t("Average Price", "متوسط السعر")} />
                          <Bar dataKey="min_price" fill="#10b981" name={t("Min Price", "أقل سعر")} />
                          <Bar dataKey="max_price" fill="#ef4444" name={t("Max Price", "أعلى سعر")} />
                        </BarChart>
                      </ResponsiveContainer>

                      {/* Suppliers Table */}
                      <div className="mt-6 overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b dark:border-gray-700">
                              <th className="text-right py-3 px-2">{t("Supplier", "المورد")}</th>
                              <th className="text-right py-3 px-2">{t("Avg Price", "متوسط السعر")}</th>
                              <th className="text-right py-3 px-2">{t("Min Price", "أقل سعر")}</th>
                              <th className="text-right py-3 px-2">{t("Max Price", "أعلى سعر")}</th>
                              <th className="text-right py-3 px-2">{t("Quantity", "الكمية")}</th>
                              <th className="text-right py-3 px-2">{t("Bills", "الفواتير")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {product.suppliers.map((supplier, idx) => (
                              <tr key={supplier.supplier_id} className={`border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-slate-700 ${idx === 0 ? 'bg-green-50 dark:bg-green-900/20' : ''}`}>
                                <td className="py-3 px-2">
                                  <div className="flex items-center gap-2">
                                    <Building2 className="w-4 h-4 text-gray-400" />
                                    {supplier.supplier_name}
                                    {idx === 0 && (
                                      <Badge className="bg-green-100 text-green-800 text-xs">
                                        {t("Best", "أفضل")}
                                      </Badge>
                                    )}
                                  </div>
                                </td>
                                <td className="py-3 px-2 font-semibold">{numberFmt.format(supplier.avg_price)}</td>
                                <td className="py-3 px-2 text-green-600">{numberFmt.format(supplier.min_price)}</td>
                                <td className="py-3 px-2 text-red-600">{numberFmt.format(supplier.max_price)}</td>
                                <td className="py-3 px-2">{supplier.total_quantity}</td>
                                <td className="py-3 px-2">{supplier.bill_count}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}

          {/* Empty State */}
          {!isLoading && comparisonData.length === 0 && (
            <Card className="dark:bg-gray-800">
              <CardContent className="py-12 text-center">
                <Scale className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500 dark:text-gray-400">
                  {t("No comparison data found", "لا توجد بيانات للمقارنة")}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  )
}
