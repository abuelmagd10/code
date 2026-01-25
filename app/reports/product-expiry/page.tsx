"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { Download, ArrowRight, AlertTriangle, Calendar, Package } from "lucide-react"
import { useRouter } from "next/navigation"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"

interface ExpiryItem {
  product_id: string
  product_name: string
  product_sku: string
  expiry_date: string
  quantity: number
  unit_cost: number
  total_cost: number
  days_until_expiry: number
  status: "expired" | "expiring_soon" | "valid"
  branch_name?: string
  warehouse_name?: string
}

interface Summary {
  total_items: number
  expired_count: number
  expiring_soon_count: number
  valid_count: number
  total_quantity: number
  total_cost: number
}

export default function ProductExpiryPage() {
  const supabase = useSupabase()
  const router = useRouter()
  const [expiryData, setExpiryData] = useState<ExpiryItem[]>([])
  const [summary, setSummary] = useState<Summary>({
    total_items: 0,
    expired_count: 0,
    expiring_soon_count: 0,
    valid_count: 0,
    total_quantity: 0,
    total_cost: 0
  })
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
  const defaultTo = formatLocalDate(new Date(today.getFullYear(), 11, 31))
  const defaultFrom = formatLocalDate(today)

  const [fromDate, setFromDate] = useState<string>(defaultFrom)
  const [toDate, setToDate] = useState<string>(defaultTo)
  const [selectedProduct, setSelectedProduct] = useState<string>("")
  const [statusFilter, setStatusFilter] = useState<'all' | 'expired' | 'expiring_soon' | 'valid'>('all')

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

      setProducts((data || []) as Array<{ id: string; name: string; sku: string }>)
    }
    loadProducts()
  }, [supabase])

  useEffect(() => {
    if (fromDate && toDate) {
      loadData()
    }
  }, [fromDate, toDate, selectedProduct, statusFilter])

  /**
   * ✅ تحميل بيانات صلاحيات المنتجات
   * ⚠️ OPERATIONAL REPORT - تقرير تشغيلي (من fifo_cost_lots و inventory_write_off_items مباشرة)
   * راجع: docs/OPERATIONAL_REPORTS_GUIDE.md
   */
  const loadData = async () => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams({
        from: fromDate,
        to: toDate,
        status: statusFilter
      })
      if (selectedProduct) params.set('product_id', selectedProduct)

      const res = await fetch(`/api/product-expiry?${params.toString()}`)
      if (!res.ok) {
        console.error("API Error:", res.status)
        setExpiryData([])
        setSummary({
          total_items: 0,
          expired_count: 0,
          expiring_soon_count: 0,
          valid_count: 0,
          total_quantity: 0,
          total_cost: 0
        })
        return
      }

      const data = await res.json()
      setExpiryData(Array.isArray(data.data) ? data.data : [])
      setSummary(data.summary || {
        total_items: 0,
        expired_count: 0,
        expiring_soon_count: 0,
        valid_count: 0,
        total_quantity: 0,
        total_cost: 0
      })
    } catch (error) {
      console.error("Error loading expiry data:", error)
      setExpiryData([])
      setSummary({
        total_items: 0,
        expired_count: 0,
        expiring_soon_count: 0,
        valid_count: 0,
        total_quantity: 0,
        total_cost: 0
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleExportCsv = () => {
    const headers = ["product_sku", "product_name", "expiry_date", "quantity", "unit_cost", "total_cost", "days_until_expiry", "status", "branch_name", "warehouse_name"]
    const rowsCsv = expiryData.map((item) => [
      item.product_sku,
      item.product_name,
      item.expiry_date,
      item.quantity.toString(),
      item.unit_cost.toFixed(2),
      item.total_cost.toFixed(2),
      item.days_until_expiry.toString(),
      item.status,
      item.branch_name || "",
      item.warehouse_name || ""
    ])
    const csv = [headers.join(","), ...rowsCsv.map((r) => r.join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const aEl = document.createElement("a")
    aEl.href = url
    aEl.download = `product-expiry-${fromDate}-${toDate}.csv`
    aEl.click()
    URL.revokeObjectURL(url)
  }

  const getStatusBadge = (status: string, days: number) => {
    if (status === "expired") {
      return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">{t("Expired", "منتهي الصلاحية")}</Badge>
    } else if (status === "expiring_soon") {
      return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">{t(`Expiring in ${days} days`, `ينتهي خلال ${days} يوم`)}</Badge>
    } else {
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">{t("Valid", "صالح")}</Badge>
    }
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
                  <div className="p-3 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl shadow-lg">
                    <Calendar className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                      {t("Product Expiry Report", "تقرير صلاحيات المنتجات")}
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {t("Track product expiration dates", "تتبع تواريخ انتهاء صلاحية المنتجات")}
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
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t("Total Items", "إجمالي العناصر")}</p>
                    <p className="text-2xl font-bold">{summary.total_items}</p>
                  </div>
                  <Package className="w-8 h-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>
            <Card className="dark:bg-gray-800">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t("Expired", "منتهي الصلاحية")}</p>
                    <p className="text-2xl font-bold text-red-600">{summary.expired_count}</p>
                  </div>
                  <AlertTriangle className="w-8 h-8 text-red-500" />
                </div>
              </CardContent>
            </Card>
            <Card className="dark:bg-gray-800">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t("Expiring Soon", "ينتهي قريباً")}</p>
                    <p className="text-2xl font-bold text-yellow-600">{summary.expiring_soon_count}</p>
                  </div>
                  <AlertTriangle className="w-8 h-8 text-yellow-500" />
                </div>
              </CardContent>
            </Card>
            <Card className="dark:bg-gray-800">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t("Total Cost", "إجمالي التكلفة")}</p>
                    <p className="text-2xl font-bold">{numberFmt.format(summary.total_cost)}</p>
                  </div>
                  <Package className="w-8 h-8 text-green-500" />
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
                  <Label className="text-xs">{t("Status", "الحالة")}</Label>
                  <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | 'expired' | 'expiring_soon' | 'valid')}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("All", "الكل")}</SelectItem>
                      <SelectItem value="expired">{t("Expired", "منتهي الصلاحية")}</SelectItem>
                      <SelectItem value="expiring_soon">{t("Expiring Soon", "ينتهي قريباً")}</SelectItem>
                      <SelectItem value="valid">{t("Valid", "صالح")}</SelectItem>
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
                  <Button onClick={loadData} className="flex-1">
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
              <CardTitle>{t("Expiry Data", "بيانات الصلاحيات")} ({expiryData.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-gray-500">{t("Loading...", "جاري التحميل...")}</div>
              ) : expiryData.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Calendar className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                  <p>{t("No expiry data found", "لا توجد بيانات صلاحيات")}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b dark:border-gray-700">
                        <th className="text-right py-3 px-2">{t("Product", "المنتج")}</th>
                        <th className="text-right py-3 px-2">{t("Expiry Date", "تاريخ الصلاحية")}</th>
                        <th className="text-right py-3 px-2">{t("Quantity", "الكمية")}</th>
                        <th className="text-right py-3 px-2">{t("Unit Cost", "تكلفة الوحدة")}</th>
                        <th className="text-right py-3 px-2">{t("Total Cost", "إجمالي التكلفة")}</th>
                        <th className="text-right py-3 px-2">{t("Days Until Expiry", "أيام حتى الانتهاء")}</th>
                        <th className="text-right py-3 px-2">{t("Status", "الحالة")}</th>
                        <th className="text-right py-3 px-2">{t("Branch/Warehouse", "الفرع/المخزن")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expiryData.map((item, idx) => (
                        <tr key={idx} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-slate-700">
                          <td className="py-3 px-2">
                            <div>
                              <div className="font-medium">{item.product_name}</div>
                              <div className="text-xs text-gray-500">{item.product_sku}</div>
                            </div>
                          </td>
                          <td className="py-3 px-2">{item.expiry_date}</td>
                          <td className="py-3 px-2">{item.quantity}</td>
                          <td className="py-3 px-2">{numberFmt.format(item.unit_cost)}</td>
                          <td className="py-3 px-2 font-semibold">{numberFmt.format(item.total_cost)}</td>
                          <td className={`py-3 px-2 font-semibold ${item.days_until_expiry < 0 ? 'text-red-600' : item.days_until_expiry <= 30 ? 'text-yellow-600' : 'text-green-600'}`}>
                            {item.days_until_expiry}
                          </td>
                          <td className="py-3 px-2">
                            {getStatusBadge(item.status, item.days_until_expiry)}
                          </td>
                          <td className="py-3 px-2 text-xs">
                            {item.branch_name && <div>{item.branch_name}</div>}
                            {item.warehouse_name && <div className="text-gray-500">{item.warehouse_name}</div>}
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
