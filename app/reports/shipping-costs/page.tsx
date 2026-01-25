"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { Download, ArrowRight, DollarSign, Truck, TrendingUp } from "lucide-react"
import { useRouter } from "next/navigation"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LineChart, Line } from "recharts"

interface ShippingCost {
  key: string
  label: string
  total_cost: number
  shipment_count: number
  avg_cost: number
}

interface Summary {
  total_cost: number
  shipment_count: number
  avg_cost: number
}

export default function ShippingCostsPage() {
  const supabase = useSupabase()
  const router = useRouter()
  const [costsData, setCostsData] = useState<ShippingCost[]>([])
  const [summary, setSummary] = useState<Summary>({
    total_cost: 0,
    shipment_count: 0,
    avg_cost: 0
  })
  const [providers, setProviders] = useState<Array<{ id: string; provider_name: string }>>([])
  const [isLoading, setIsLoading] = useState(true)
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [appCurrency, setAppCurrency] = useState('EGP')

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
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [selectedProvider, setSelectedProvider] = useState<string>("")
  const [groupBy, setGroupBy] = useState<'provider' | 'status' | 'period'>('provider')
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('month')

  useEffect(() => {
    const handler = () => {
      try {
        const v = localStorage.getItem('app_language') || 'ar'
        setAppLang(v === 'en' ? 'en' : 'ar')
        setAppCurrency(localStorage.getItem('app_currency') || 'EGP')
      } catch {}
    }
    handler()
    window.addEventListener('app_language_changed', handler)
    window.addEventListener('app_currency_changed', handler)
    return () => {
      window.removeEventListener('app_language_changed', handler)
      window.removeEventListener('app_currency_changed', handler)
    }
  }, [])

  const t = (en: string, ar: string) => appLang === 'en' ? en : ar
  const numberFmt = new Intl.NumberFormat(appLang === 'en' ? "en-EG" : "ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const currencySymbols: Record<string, string> = { EGP: '£', USD: '$', EUR: '€', SAR: '﷼', AED: 'د.إ' }
  const currencySymbol = currencySymbols[appCurrency] || appCurrency

  // Load providers
  useEffect(() => {
    const loadProviders = async () => {
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      const { data } = await supabase
        .from("shipping_providers")
        .select("id, provider_name")
        .eq("company_id", companyId)
        .order("provider_name")

      setProviders((data || []) as Array<{ id: string; provider_name: string }>)
    }
    loadProviders()
  }, [supabase])

  useEffect(() => {
    if (fromDate && toDate) {
      loadData()
    }
  }, [fromDate, toDate, statusFilter, selectedProvider, groupBy, period])

  /**
   * ✅ تحميل بيانات تكاليف الشحن
   * ⚠️ OPERATIONAL REPORT - تقرير تشغيلي (من shipments مباشرة)
   * راجع: docs/OPERATIONAL_REPORTS_GUIDE.md
   */
  const loadData = async () => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams({
        from: fromDate,
        to: toDate,
        status: statusFilter,
        group_by: groupBy,
        period: period
      })
      if (selectedProvider) params.set('provider_id', selectedProvider)

      const res = await fetch(`/api/shipping-costs?${params.toString()}`)
      if (!res.ok) {
        console.error("API Error:", res.status)
        setCostsData([])
        setSummary({
          total_cost: 0,
          shipment_count: 0,
          avg_cost: 0
        })
        return
      }

      const data = await res.json()
      setCostsData(Array.isArray(data.data) ? data.data : [])
      setSummary(data.summary || {
        total_cost: 0,
        shipment_count: 0,
        avg_cost: 0
      })
    } catch (error) {
      console.error("Error loading shipping costs:", error)
      setCostsData([])
      setSummary({
        total_cost: 0,
        shipment_count: 0,
        avg_cost: 0
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleExportCsv = () => {
    const headers = ["label", "total_cost", "shipment_count", "avg_cost"]
    const rowsCsv = costsData.map((item) => [
      item.label,
      item.total_cost.toFixed(2),
      item.shipment_count.toString(),
      item.avg_cost.toFixed(2)
    ])
    const csv = [headers.join(","), ...rowsCsv.map((r) => r.join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const aEl = document.createElement("a")
    aEl.href = url
    aEl.download = `shipping-costs-${fromDate}-${toDate}.csv`
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
                  <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl shadow-lg">
                    <DollarSign className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                      {t("Shipping Costs Report", "تقرير تكاليف الشحن")}
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {t("Shipping cost analysis by provider, status, or period", "تحليل تكاليف الشحن حسب المزود، الحالة، أو الفترة")}
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
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t("Total Cost", "إجمالي التكلفة")}</p>
                    <p className="text-2xl font-bold">{currencySymbol} {numberFmt.format(summary.total_cost)}</p>
                  </div>
                  <DollarSign className="w-8 h-8 text-green-500" />
                </div>
              </CardContent>
            </Card>
            <Card className="dark:bg-gray-800">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t("Shipment Count", "عدد الشحنات")}</p>
                    <p className="text-2xl font-bold">{summary.shipment_count}</p>
                  </div>
                  <Truck className="w-8 h-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>
            <Card className="dark:bg-gray-800">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t("Average Cost", "متوسط التكلفة")}</p>
                    <p className="text-2xl font-bold">{currencySymbol} {numberFmt.format(summary.avg_cost)}</p>
                  </div>
                  <TrendingUp className="w-8 h-8 text-purple-500" />
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
                  <Label className="text-xs">{t("Status", "الحالة")}</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("All", "الكل")}</SelectItem>
                      <SelectItem value="pending">{t("Pending", "معلقة")}</SelectItem>
                      <SelectItem value="created">{t("Created", "تم الإنشاء")}</SelectItem>
                      <SelectItem value="in_transit">{t("In Transit", "قيد الشحن")}</SelectItem>
                      <SelectItem value="delivered">{t("Delivered", "مسلمة")}</SelectItem>
                      <SelectItem value="returned">{t("Returned", "مرتجعة")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">{t("Provider", "مزود الشحن")}</Label>
                  <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t("All Providers", "جميع المزودين")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">{t("All Providers", "جميع المزودين")}</SelectItem>
                      {providers.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.provider_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">{t("Group By", "تجميع حسب")}</Label>
                  <Select value={groupBy} onValueChange={(v) => setGroupBy(v as 'provider' | 'status' | 'period')}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="provider">{t("Provider", "مزود الشحن")}</SelectItem>
                      <SelectItem value="status">{t("Status", "الحالة")}</SelectItem>
                      <SelectItem value="period">{t("Period", "الفترة")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {groupBy === 'period' && (
                  <div>
                    <Label className="text-xs">{t("Period", "الفترة")}</Label>
                    <Select value={period} onValueChange={(v) => setPeriod(v as 'day' | 'week' | 'month')}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="day">{t("Day", "يوم")}</SelectItem>
                        <SelectItem value="week">{t("Week", "أسبوع")}</SelectItem>
                        <SelectItem value="month">{t("Month", "شهر")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
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
          {costsData.length > 0 && (
            <Card className="dark:bg-gray-800">
              <CardHeader>
                <CardTitle>{t("Shipping Costs", "تكاليف الشحن")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  {groupBy === 'period' ? (
                    <LineChart data={costsData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" angle={-45} textAnchor="end" height={100} />
                      <YAxis />
                      <Tooltip formatter={(value: number) => `${currencySymbol} ${numberFmt.format(value)}`} />
                      <Legend />
                      <Line type="monotone" dataKey="total_cost" stroke="#3b82f6" name={t("Total Cost", "إجمالي التكلفة")} />
                      <Line type="monotone" dataKey="avg_cost" stroke="#10b981" name={t("Average Cost", "متوسط التكلفة")} />
                    </LineChart>
                  ) : (
                    <BarChart data={costsData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" angle={-45} textAnchor="end" height={100} />
                      <YAxis />
                      <Tooltip formatter={(value: number) => `${currencySymbol} ${numberFmt.format(value)}`} />
                      <Legend />
                      <Bar dataKey="total_cost" fill="#3b82f6" name={t("Total Cost", "إجمالي التكلفة")} />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Table */}
          <Card className="dark:bg-gray-800">
            <CardHeader>
              <CardTitle>{t("Shipping Costs Details", "تفاصيل تكاليف الشحن")} ({costsData.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-gray-500">{t("Loading...", "جاري التحميل...")}</div>
              ) : costsData.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Truck className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                  <p>{t("No shipping costs found", "لا توجد بيانات تكاليف شحن")}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b dark:border-gray-700">
                        <th className="text-right py-3 px-2">{groupBy === 'provider' ? t("Provider", "مزود الشحن") : groupBy === 'status' ? t("Status", "الحالة") : t("Period", "الفترة")}</th>
                        <th className="text-right py-3 px-2">{t("Total Cost", "إجمالي التكلفة")}</th>
                        <th className="text-right py-3 px-2">{t("Shipment Count", "عدد الشحنات")}</th>
                        <th className="text-right py-3 px-2">{t("Average Cost", "متوسط التكلفة")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {costsData.map((item, idx) => (
                        <tr key={idx} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-slate-700">
                          <td className="py-3 px-2 font-medium">{item.label}</td>
                          <td className="py-3 px-2 font-semibold">{currencySymbol} {numberFmt.format(item.total_cost)}</td>
                          <td className="py-3 px-2">{item.shipment_count}</td>
                          <td className="py-3 px-2">{currencySymbol} {numberFmt.format(item.avg_cost)}</td>
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
