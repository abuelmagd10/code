"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useSupabase } from "@/lib/supabase/hooks"
import { canAction } from "@/lib/authz"
import { Truck, Package, CheckCircle, Clock, RotateCcw, DollarSign, Filter, ExternalLink, FileText } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"

interface Shipment {
  id: string
  shipment_number: string
  tracking_number: string | null
  tracking_url: string | null
  status: string
  shipping_cost: number
  recipient_name: string
  recipient_city: string
  created_at: string
  delivery_date: string | null
  invoices?: { invoice_number: string }
  shipping_providers?: { provider_name: string }
}

export default function ShippingReportPage() {
  const supabase = useSupabase()
  const [isLoading, setIsLoading] = useState(true)
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [canRead, setCanRead] = useState(false)
  const [permChecked, setPermChecked] = useState(false)
  const [appLang, setAppLang] = useState<'ar'|'en'>('ar')
  const [appCurrency, setAppCurrency] = useState('EGP')

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [dateFrom, setDateFrom] = useState<string>("")
  const [dateTo, setDateTo] = useState<string>("")

  // Stats
  const [stats, setStats] = useState({
    pending: 0, created: 0, in_transit: 0, delivered: 0, returned: 0, total_cost: 0
  })

  const t = (en: string, ar: string) => appLang === 'en' ? en : ar
  const currencySymbols: Record<string, string> = { EGP: '£', USD: '$', EUR: '€', SAR: '﷼', AED: 'د.إ' }
  const currencySymbol = currencySymbols[appCurrency] || appCurrency

  useEffect(() => {
    const handler = () => {
      try {
        setAppLang(localStorage.getItem('app_language') === 'en' ? 'en' : 'ar')
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

  useEffect(() => {
    const checkPerms = async () => {
      const read = await canAction(supabase, "shipments", "read")
      setCanRead(read)
      setPermChecked(true)
    }
    checkPerms()
  }, [supabase])

  useEffect(() => {
    if (permChecked && canRead) loadData()
  }, [permChecked, canRead, statusFilter, dateFrom, dateTo])

  /**
   * ✅ تحميل بيانات الشحنات
   * ⚠️ OPERATIONAL REPORT - تقرير تشغيلي (من shipments مباشرة)
   * راجع: docs/OPERATIONAL_REPORTS_GUIDE.md
   */
  const loadData = async () => {
    try {
      setIsLoading(true)
      const { getActiveCompanyId } = await import("@/lib/company")
      const cid = await getActiveCompanyId(supabase)
      if (!cid) return

      // ✅ جلب الشحنات (تقرير تشغيلي - من shipments مباشرة)
      // ⚠️ ملاحظة: هذا تقرير تشغيلي وليس محاسبي رسمي
      let query = supabase
        .from("shipments")
        .select("*, invoices(invoice_number), shipping_providers(provider_name)")
        .eq("company_id", cid)
        .or("is_deleted.is.null,is_deleted.eq.false") // ✅ استثناء الشحنات المحذوفة
        .order("created_at", { ascending: false })

      if (statusFilter !== "all") query = query.eq("status", statusFilter)
      if (dateFrom) query = query.gte("created_at", dateFrom)
      if (dateTo) query = query.lte("created_at", dateTo + "T23:59:59")

      const { data, error } = await query
      if (error) throw error
      setShipments(data || [])

      // Calculate stats
      const all = data || []
      setStats({
        pending: all.filter((s: Shipment) => s.status === 'pending').length,
        created: all.filter((s: Shipment) => s.status === 'created').length,
        in_transit: all.filter((s: Shipment) => s.status === 'in_transit').length,
        delivered: all.filter((s: Shipment) => s.status === 'delivered').length,
        returned: all.filter((s: Shipment) => s.status === 'returned').length,
        total_cost: all.reduce((sum: number, s: Shipment) => sum + (s.shipping_cost || 0), 0)
      })
    } catch (err) {
      console.error("Error loading shipments:", err)
    } finally {
      setIsLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: "bg-yellow-100 text-yellow-700",
      created: "bg-blue-100 text-blue-700",
      in_transit: "bg-purple-100 text-purple-700",
      delivered: "bg-green-100 text-green-700",
      returned: "bg-red-100 text-red-700"
    }
    const labels: Record<string, { en: string; ar: string }> = {
      pending: { en: "Pending", ar: "قيد الانتظار" },
      created: { en: "Created", ar: "تم الإنشاء" },
      in_transit: { en: "In Transit", ar: "في الطريق" },
      delivered: { en: "Delivered", ar: "تم التسليم" },
      returned: { en: "Returned", ar: "مرتجع" }
    }
    return (
      <Badge className={styles[status] || "bg-gray-100 text-gray-700"}>
        {labels[status] ? t(labels[status].en, labels[status].ar) : status}
      </Badge>
    )
  }

  if (permChecked && !canRead) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <Sidebar />
        <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
          <Alert className="bg-red-50 dark:bg-red-900/20 border-red-200">
            <AlertDescription className="text-red-800 dark:text-red-200">
              {t("You do not have permission to view shipping reports.", "ليس لديك صلاحية لعرض تقارير الشحن.")}
            </AlertDescription>
          </Alert>
        </main>
      </div>
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
              <div className="flex items-center gap-4">
                <div className="p-3 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl shadow-lg">
                  <Truck className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {t("Shipping Report", "تقرير الشحنات")}
                  </h1>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {t("Track and analyze all shipments", "تتبع وتحليل جميع الشحنات")}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <Card className="bg-yellow-50 dark:bg-yellow-900/20 border-0">
              <CardContent className="p-4 text-center">
                <Clock className="w-6 h-6 mx-auto text-yellow-600 mb-2" />
                <p className="text-2xl font-bold text-yellow-700">{stats.pending}</p>
                <p className="text-xs text-yellow-600">{t("Pending", "قيد الانتظار")}</p>
              </CardContent>
            </Card>
            <Card className="bg-blue-50 dark:bg-blue-900/20 border-0">
              <CardContent className="p-4 text-center">
                <Package className="w-6 h-6 mx-auto text-blue-600 mb-2" />
                <p className="text-2xl font-bold text-blue-700">{stats.created}</p>
                <p className="text-xs text-blue-600">{t("Created", "تم الإنشاء")}</p>
              </CardContent>
            </Card>
            <Card className="bg-purple-50 dark:bg-purple-900/20 border-0">
              <CardContent className="p-4 text-center">
                <Truck className="w-6 h-6 mx-auto text-purple-600 mb-2" />
                <p className="text-2xl font-bold text-purple-700">{stats.in_transit}</p>
                <p className="text-xs text-purple-600">{t("In Transit", "في الطريق")}</p>
              </CardContent>
            </Card>
            <Card className="bg-green-50 dark:bg-green-900/20 border-0">
              <CardContent className="p-4 text-center">
                <CheckCircle className="w-6 h-6 mx-auto text-green-600 mb-2" />
                <p className="text-2xl font-bold text-green-700">{stats.delivered}</p>
                <p className="text-xs text-green-600">{t("Delivered", "تم التسليم")}</p>
              </CardContent>
            </Card>
            <Card className="bg-red-50 dark:bg-red-900/20 border-0">
              <CardContent className="p-4 text-center">
                <RotateCcw className="w-6 h-6 mx-auto text-red-600 mb-2" />
                <p className="text-2xl font-bold text-red-700">{stats.returned}</p>
                <p className="text-xs text-red-600">{t("Returned", "مرتجع")}</p>
              </CardContent>
            </Card>
            <Card className="bg-cyan-50 dark:bg-cyan-900/20 border-0">
              <CardContent className="p-4 text-center">
                <DollarSign className="w-6 h-6 mx-auto text-cyan-600 mb-2" />
                <p className="text-2xl font-bold text-cyan-700">{currencySymbol}{stats.total_cost.toLocaleString()}</p>
                <p className="text-xs text-cyan-600">{t("Total Cost", "إجمالي التكلفة")}</p>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card className="dark:bg-gray-800">
            <CardContent className="py-4">
              <div className="flex flex-wrap items-end gap-4">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium">{t("Filters:", "الفلاتر:")}</span>
                </div>
                <div>
                  <Label className="text-xs">{t("Status", "الحالة")}</Label>
                  <select
                    className="w-40 border rounded-md p-2 text-sm dark:bg-slate-800 dark:border-slate-700"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="all">{t("All", "الكل")}</option>
                    <option value="pending">{t("Pending", "قيد الانتظار")}</option>
                    <option value="created">{t("Created", "تم الإنشاء")}</option>
                    <option value="in_transit">{t("In Transit", "في الطريق")}</option>
                    <option value="delivered">{t("Delivered", "تم التسليم")}</option>
                    <option value="returned">{t("Returned", "مرتجع")}</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs">{t("From Date", "من تاريخ")}</Label>
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" />
                </div>
                <div>
                  <Label className="text-xs">{t("To Date", "إلى تاريخ")}</Label>
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" />
                </div>
                <Button variant="outline" size="sm" onClick={() => { setStatusFilter("all"); setDateFrom(""); setDateTo("") }}>
                  {t("Clear", "مسح")}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Shipments Table */}
          <Card className="dark:bg-gray-800">
            <CardHeader>
              <CardTitle className="text-lg">{t("Shipments", "الشحنات")} ({shipments.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-gray-500">{t("Loading...", "جاري التحميل...")}</div>
              ) : shipments.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Truck className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                  <p>{t("No shipments found", "لا توجد شحنات")}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b dark:border-gray-700">
                        <th className="text-right py-3 px-2">{t("Shipment #", "رقم الشحنة")}</th>
                        <th className="text-right py-3 px-2">{t("Invoice", "الفاتورة")}</th>
                        <th className="text-right py-3 px-2">{t("Provider", "شركة الشحن")}</th>
                        <th className="text-right py-3 px-2">{t("Recipient", "المستلم")}</th>
                        <th className="text-right py-3 px-2">{t("City", "المدينة")}</th>
                        <th className="text-right py-3 px-2">{t("Status", "الحالة")}</th>
                        <th className="text-right py-3 px-2">{t("Cost", "التكلفة")}</th>
                        <th className="text-right py-3 px-2">{t("Date", "التاريخ")}</th>
                        <th className="text-right py-3 px-2">{t("Tracking", "التتبع")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shipments.map((shipment) => (
                        <tr key={shipment.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-slate-700">
                          <td className="py-3 px-2 font-medium">{shipment.shipment_number}</td>
                          <td className="py-3 px-2">
                            {shipment.invoices?.invoice_number ? (
                              <Link href={`/invoices/${shipment.id}`} className="text-blue-600 hover:underline flex items-center gap-1">
                                <FileText className="w-3 h-3" />
                                {shipment.invoices.invoice_number}
                              </Link>
                            ) : '-'}
                          </td>
                          <td className="py-3 px-2">{shipment.shipping_providers?.provider_name || '-'}</td>
                          <td className="py-3 px-2">{shipment.recipient_name || '-'}</td>
                          <td className="py-3 px-2">{shipment.recipient_city || '-'}</td>
                          <td className="py-3 px-2">{getStatusBadge(shipment.status)}</td>
                          <td className="py-3 px-2">{currencySymbol}{(shipment.shipping_cost || 0).toLocaleString()}</td>
                          <td className="py-3 px-2">{new Date(shipment.created_at).toLocaleDateString(appLang === 'en' ? 'en-US' : 'ar-EG')}</td>
                          <td className="py-3 px-2">
                            {shipment.tracking_url ? (
                              <a href={shipment.tracking_url} target="_blank" rel="noopener noreferrer" className="text-cyan-600 hover:underline flex items-center gap-1">
                                <ExternalLink className="w-3 h-3" />
                                {shipment.tracking_number || t("Track", "تتبع")}
                              </a>
                            ) : shipment.tracking_number || '-'}
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

