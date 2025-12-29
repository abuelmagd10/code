"use client"

import { useState, useEffect, useMemo } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Package, Truck, DollarSign, FileText, ExternalLink, Loader2, Filter } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

interface ThirdPartyItem {
  id: string
  invoice_id: string
  product_id: string
  quantity: number
  unit_cost: number
  cleared_quantity: number
  returned_quantity: number
  status: string
  shipping_provider_id: string
  created_at: string
  invoices?: { invoice_number: string; customer_id: string; customers?: { name: string } }
  products?: { name: string; sku: string }
  shipping_providers?: { provider_name: string }
}

interface ShippingProvider {
  id: string
  provider_name: string
}

export default function ThirdPartyInventoryPage() {
  const supabase = useSupabase()
  const [items, setItems] = useState<ThirdPartyItem[]>([])
  const [providers, setProviders] = useState<ShippingProvider[]>([])
  const [selectedProvider, setSelectedProvider] = useState<string>("all")
  const [loading, setLoading] = useState(true)

  // Language
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  useEffect(() => {
    const handler = () => {
      try {
        const v = localStorage.getItem('app_language') || 'ar'
        setAppLang(v === 'en' ? 'en' : 'ar')
      } catch { }
    }
    handler()
    window.addEventListener('app_language_changed', handler)
    return () => window.removeEventListener('app_language_changed', handler)
  }, [])
  const isAr = appLang === 'ar'

  // Filters
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      // جلب شركات الشحن
      const { data: providersData } = await supabase
        .from("shipping_providers")
        .select("id, provider_name")
        .eq("company_id", companyId)
      setProviders(providersData || [])

      // جلب بضائع لدى الغير
      const { data: itemsData } = await supabase
        .from("third_party_inventory")
        .select(`
          *,
          invoices(invoice_number, customer_id, customers(name)),
          products(name, sku),
          shipping_providers(provider_name)
        `)
        .eq("company_id", companyId)
        .eq("status", "open")
        .order("created_at", { ascending: false })

      setItems(itemsData || [])
    } catch (error) {
      console.error("Error loading data:", error)
    } finally {
      setLoading(false)
    }
  }

  // فلترة حسب شركة الشحن
  const filteredItems = useMemo(() => {
    if (selectedProvider === "all") return items
    return items.filter(item => item.shipping_provider_id === selectedProvider)
  }, [items, selectedProvider])

  // حساب الإحصائيات
  const stats = useMemo(() => {
    const getAvailable = (item: ThirdPartyItem) =>
      Number(item.quantity) - Number(item.cleared_quantity) - Number(item.returned_quantity)

    return {
      totalItems: filteredItems.length,
      totalQuantity: filteredItems.reduce((sum, item) => sum + getAvailable(item), 0),
      totalValue: filteredItems.reduce((sum, item) => sum + (getAvailable(item) * Number(item.unit_cost)), 0),
      uniqueInvoices: new Set(filteredItems.map(item => item.invoice_id)).size
    }
  }, [filteredItems])

  const getAvailableQty = (item: ThirdPartyItem) =>
    Number(item.quantity) - Number(item.cleared_quantity) - Number(item.returned_quantity)

  // Loading state
  if (loading) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <Sidebar />
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
          <div className="flex items-center justify-center min-h-[60vh]">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">

          {/* Header - رأس الصفحة */}
          <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="p-2 sm:p-3 bg-orange-100 dark:bg-orange-900/30 rounded-lg sm:rounded-xl flex-shrink-0">
                  <Truck className="w-5 h-5 sm:w-6 sm:h-6 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">
                    {isAr ? "بضائع لدى الغير" : "Third Party Goods"}
                  </h1>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">
                    {isAr ? "تتبع البضائع المرسلة لشركات الشحن" : "Track goods sent to shipping companies"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Stats Cards - بطاقات الإحصائيات */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm p-2 sm:p-0">
              <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-4">
                <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">
                  {isAr ? "عدد البنود" : "Items"}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2 sm:p-4 pt-0">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                    <Package className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <span className="text-lg sm:text-2xl font-bold">{stats.totalItems}</span>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm p-2 sm:p-0">
              <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-4">
                <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">
                  {isAr ? "عدد الفواتير" : "Invoices"}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2 sm:p-4 pt-0">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                    <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 dark:text-green-400" />
                  </div>
                  <span className="text-lg sm:text-2xl font-bold">{stats.uniqueInvoices}</span>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm p-2 sm:p-0">
              <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-4">
                <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">
                  {isAr ? "إجمالي الكمية" : "Total Qty"}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2 sm:p-4 pt-0">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                    <Truck className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600 dark:text-orange-400" />
                  </div>
                  <span className="text-lg sm:text-2xl font-bold text-orange-600">{stats.totalQuantity.toLocaleString()}</span>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm p-2 sm:p-0">
              <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-4">
                <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">
                  {isAr ? "إجمالي القيمة" : "Total Value"}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2 sm:p-4 pt-0">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                    <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <span className="text-sm sm:text-2xl font-bold text-purple-600 truncate">{stats.totalValue.toLocaleString()}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters - الفلاتر */}
          <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
            <CardContent className="p-3 sm:p-4">
              <div className="flex flex-wrap items-end gap-2 sm:gap-4">
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <Filter className="w-4 h-4" />
                  <span>{isAr ? "الفلاتر:" : "Filters:"}</span>
                </div>
                <div className="w-full sm:w-48">
                  <Label className="text-xs sm:text-sm">{isAr ? "شركة الشحن" : "Shipping Provider"}</Label>
                  <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                    <SelectTrigger className="h-9 text-xs sm:text-sm">
                      <SelectValue placeholder={isAr ? "جميع الشركات" : "All Providers"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{isAr ? "جميع الشركات" : "All Providers"}</SelectItem>
                      {providers.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.provider_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 min-w-[120px]">
                  <Label className="text-xs sm:text-sm">{isAr ? "من تاريخ" : "From"}</Label>
                  <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 text-xs sm:text-sm" />
                </div>
                <div className="flex-1 min-w-[120px]">
                  <Label className="text-xs sm:text-sm">{isAr ? "إلى تاريخ" : "To"}</Label>
                  <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9 text-xs sm:text-sm" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Table - جدول البضائع */}
          <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
            <CardHeader className="pb-2 sm:pb-4 border-b border-gray-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <Package className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <CardTitle className="text-sm sm:text-base">
                  {isAr ? "قائمة البضائع لدى الغير" : "Third Party Goods List"}
                </CardTitle>
                {filteredItems.length > 0 && (
                  <Badge variant="secondary" className="text-xs">{filteredItems.length}</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50 dark:bg-slate-800">
                      <TableHead className="text-xs sm:text-sm">{isAr ? "المنتج" : "Product"}</TableHead>
                      <TableHead className="text-xs sm:text-sm">{isAr ? "الفاتورة" : "Invoice"}</TableHead>
                      <TableHead className="text-xs sm:text-sm hidden sm:table-cell">{isAr ? "العميل" : "Customer"}</TableHead>
                      <TableHead className="text-xs sm:text-sm">{isAr ? "شركة الشحن" : "Provider"}</TableHead>
                      <TableHead className="text-xs sm:text-sm text-center">{isAr ? "الكمية" : "Qty"}</TableHead>
                      <TableHead className="text-xs sm:text-sm text-center hidden sm:table-cell">{isAr ? "التكلفة" : "Cost"}</TableHead>
                      <TableHead className="text-xs sm:text-sm text-center">{isAr ? "القيمة" : "Value"}</TableHead>
                      <TableHead className="text-xs sm:text-sm text-center">{isAr ? "عرض" : "View"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          <Truck className="h-12 w-12 mx-auto mb-2 opacity-50" />
                          {isAr ? "لا توجد بضائع لدى الغير" : "No third party goods found"}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredItems.map(item => {
                        const availableQty = getAvailableQty(item)
                        const value = availableQty * Number(item.unit_cost)
                        return (
                          <TableRow key={item.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50">
                            <TableCell>
                              <div className="font-medium text-xs sm:text-sm">{item.products?.name}</div>
                              <div className="text-[10px] sm:text-xs text-gray-500">{item.products?.sku}</div>
                            </TableCell>
                            <TableCell className="text-xs sm:text-sm">
                              <Link href={`/invoices/${item.invoice_id}`} className="text-blue-600 hover:underline">
                                {item.invoices?.invoice_number}
                              </Link>
                            </TableCell>
                            <TableCell className="text-xs sm:text-sm hidden sm:table-cell">
                              {item.invoices?.customers?.name || '-'}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[10px] sm:text-xs bg-orange-50 text-orange-700 border-orange-200">
                                <Truck className="h-3 w-3 mr-1" />
                                {item.shipping_providers?.provider_name}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="secondary" className="text-xs font-bold">
                                {availableQty}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs sm:text-sm text-center hidden sm:table-cell">
                              {Number(item.unit_cost).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-center">
                              <span className="font-bold text-xs sm:text-sm text-green-600">
                                {value.toLocaleString()}
                              </span>
                            </TableCell>
                            <TableCell className="text-center">
                              <Link href={`/invoices/${item.invoice_id}`}>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                              </Link>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

        </div>
      </main>
    </div>
  )
}

