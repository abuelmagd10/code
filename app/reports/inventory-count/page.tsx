"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { Download, ArrowRight, CheckCircle, XCircle, AlertCircle, Package } from "lucide-react"
import { useRouter } from "next/navigation"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface CountItem {
  product_id: string
  product_sku: string
  product_name: string
  system_quantity: number
  calculated_quantity: number
  difference: number
  has_discrepancy: boolean
  status: "matched" | "over" | "under"
}

interface Summary {
  total_products: number
  matched_count: number
  discrepancies_count: number
  over_count: number
  under_count: number
  total_difference: number
}

export default function InventoryCountPage() {
  const supabase = useSupabase()
  const router = useRouter()
  const [countData, setCountData] = useState<CountItem[]>([])
  const [summary, setSummary] = useState<Summary>({
    total_products: 0,
    matched_count: 0,
    discrepancies_count: 0,
    over_count: 0,
    under_count: 0,
    total_difference: 0
  })
  const [products, setProducts] = useState<Array<{ id: string; name: string; sku: string }>>([])
  const [warehouses, setWarehouses] = useState<Array<{ id: string; name: string }>>([])
  const [isLoading, setIsLoading] = useState(true)
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [selectedProduct, setSelectedProduct] = useState<string>("")
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>("")
  const [showDiscrepanciesOnly, setShowDiscrepanciesOnly] = useState(false)

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
  const numberFmt = new Intl.NumberFormat(appLang === 'en' ? "en-EG" : "ar-EG", { minimumFractionDigits: 0, maximumFractionDigits: 0 })

  // Load products and warehouses
  useEffect(() => {
    const loadData = async () => {
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      const [productsRes, warehousesRes] = await Promise.all([
        supabase
          .from("products")
          .select("id, name, sku")
          .eq("company_id", companyId)
          .or("item_type.is.null,item_type.eq.product")
          .order("name"),
        supabase
          .from("warehouses")
          .select("id, name")
          .eq("company_id", companyId)
          .order("name")
      ])

      setProducts((productsRes.data || []) as Array<{ id: string; name: string; sku: string }>)
      setWarehouses((warehousesRes.data || []) as Array<{ id: string; name: string }>)
    }
    loadData()
  }, [supabase])

  useEffect(() => {
    loadCountData()
  }, [selectedProduct, selectedWarehouse, showDiscrepanciesOnly])

  /**
   * ✅ تحميل بيانات جرد المخزون
   * ⚠️ OPERATIONAL REPORT - تقرير تشغيلي (من products و inventory_transactions مباشرة)
   * راجع: docs/OPERATIONAL_REPORTS_GUIDE.md
   */
  const loadCountData = async () => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams({
        discrepancies_only: showDiscrepanciesOnly.toString()
      })
      if (selectedProduct) params.set('product_id', selectedProduct)
      if (selectedWarehouse) params.set('warehouse_id', selectedWarehouse)

      const res = await fetch(`/api/inventory-count?${params.toString()}`)
      if (!res.ok) {
        console.error("API Error:", res.status)
        setCountData([])
        setSummary({
          total_products: 0,
          matched_count: 0,
          discrepancies_count: 0,
          over_count: 0,
          under_count: 0,
          total_difference: 0
        })
        return
      }

      const data = await res.json()
      setCountData(Array.isArray(data.data) ? data.data : [])
      setSummary(data.summary || {
        total_products: 0,
        matched_count: 0,
        discrepancies_count: 0,
        over_count: 0,
        under_count: 0,
        total_difference: 0
      })
    } catch (error) {
      console.error("Error loading count data:", error)
      setCountData([])
      setSummary({
        total_products: 0,
        matched_count: 0,
        discrepancies_count: 0,
        over_count: 0,
        under_count: 0,
        total_difference: 0
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleExportCsv = () => {
    const headers = ["product_sku", "product_name", "system_quantity", "calculated_quantity", "difference", "status"]
    const rowsCsv = countData.map((item) => [
      item.product_sku,
      item.product_name,
      item.system_quantity.toString(),
      item.calculated_quantity.toString(),
      item.difference.toString(),
      item.status
    ])
    const csv = [headers.join(","), ...rowsCsv.map((r) => r.join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const aEl = document.createElement("a")
    aEl.href = url
    aEl.download = `inventory-count-${new Date().toISOString().split('T')[0]}.csv`
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
                    <Package className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                      {t("Inventory Count Report", "تقرير جرد المخزون")}
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {t("Compare system quantities with calculated quantities", "مقارنة الكميات في النظام مع الكميات المحسوبة")}
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="dark:bg-gray-800">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t("Total Products", "إجمالي المنتجات")}</p>
                    <p className="text-2xl font-bold">{summary.total_products}</p>
                  </div>
                  <Package className="w-8 h-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>
            <Card className="dark:bg-gray-800">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t("Matched", "متطابق")}</p>
                    <p className="text-2xl font-bold text-green-600">{summary.matched_count}</p>
                  </div>
                  <CheckCircle className="w-8 h-8 text-green-500" />
                </div>
              </CardContent>
            </Card>
            <Card className="dark:bg-gray-800">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t("Discrepancies", "اختلافات")}</p>
                    <p className="text-2xl font-bold text-red-600">{summary.discrepancies_count}</p>
                  </div>
                  <XCircle className="w-8 h-8 text-red-500" />
                </div>
              </CardContent>
            </Card>
            <Card className="dark:bg-gray-800">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t("Total Difference", "إجمالي الفرق")}</p>
                    <p className="text-2xl font-bold">{numberFmt.format(summary.total_difference)}</p>
                  </div>
                  <AlertCircle className="w-8 h-8 text-yellow-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card className="dark:bg-gray-800">
            <CardContent className="py-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                <div>
                  <Label className="text-xs">{t("Warehouse", "المخزن")}</Label>
                  <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t("All Warehouses", "جميع المخازن")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">{t("All Warehouses", "جميع المخازن")}</SelectItem>
                      {warehouses.map((w) => (
                        <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showDiscrepanciesOnly}
                      onChange={(e) => setShowDiscrepanciesOnly(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">{t("Discrepancies Only", "الاختلافات فقط")}</span>
                  </label>
                </div>
                <div className="flex items-end gap-2">
                  <Button onClick={loadCountData} className="flex-1">
                    {t("Load", "تحميل")}
                  </Button>
                  <Button variant="outline" onClick={handleExportCsv}>
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          <Card className="dark:bg-gray-800">
            <CardHeader>
              <CardTitle>{t("Count Comparison", "مقارنة الجرد")} ({countData.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-gray-500">{t("Loading...", "جاري التحميل...")}</div>
              ) : countData.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Package className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                  <p>{t("No count data found", "لا توجد بيانات جرد")}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b dark:border-gray-700">
                        <th className="text-right py-3 px-2">{t("Product", "المنتج")}</th>
                        <th className="text-right py-3 px-2">{t("System Quantity", "الكمية في النظام")}</th>
                        <th className="text-right py-3 px-2">{t("Calculated Quantity", "الكمية المحسوبة")}</th>
                        <th className="text-right py-3 px-2">{t("Difference", "الفرق")}</th>
                        <th className="text-right py-3 px-2">{t("Status", "الحالة")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {countData.map((item, idx) => (
                        <tr key={idx} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-slate-700">
                          <td className="py-3 px-2">
                            <div>
                              <div className="font-medium">{item.product_name}</div>
                              <div className="text-xs text-gray-500">{item.product_sku}</div>
                            </div>
                          </td>
                          <td className="py-3 px-2">{numberFmt.format(item.system_quantity)}</td>
                          <td className="py-3 px-2">{numberFmt.format(item.calculated_quantity)}</td>
                          <td className={`py-3 px-2 font-semibold ${item.difference > 0 ? 'text-green-600' : item.difference < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                            {item.difference > 0 ? '+' : ''}{numberFmt.format(item.difference)}
                          </td>
                          <td className="py-3 px-2">
                            {item.status === "matched" ? (
                              <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                                {t("Matched", "متطابق")}
                              </Badge>
                            ) : item.status === "over" ? (
                              <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                                {t("Over", "زيادة")}
                              </Badge>
                            ) : (
                              <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                                {t("Under", "نقص")}
                              </Badge>
                            )}
                          </td>
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
