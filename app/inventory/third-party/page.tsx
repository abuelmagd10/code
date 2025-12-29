"use client"

import { useState, useEffect, useMemo } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Package, Truck, DollarSign, FileText, ExternalLink } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { PageHeaderDetail } from "@/components/PageHeader"

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

  return (
    <div className="flex min-h-screen bg-slate-50" dir="rtl">
      <Sidebar />
      <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-x-hidden">
        <PageHeaderDetail
          title="بضائع لدى الغير"
          description="تتبع البضائع المرسلة لشركات الشحن"
          icon={<Truck className="h-7 w-7 text-blue-600" />}
        />

        {/* بطاقات الإحصائيات */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Package className="h-8 w-8 text-blue-500" />
                <div>
                  <p className="text-sm text-gray-500">عدد البنود</p>
                  <p className="text-2xl font-bold">{stats.totalItems}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <FileText className="h-8 w-8 text-green-500" />
                <div>
                  <p className="text-sm text-gray-500">عدد الفواتير</p>
                  <p className="text-2xl font-bold">{stats.uniqueInvoices}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Truck className="h-8 w-8 text-orange-500" />
                <div>
                  <p className="text-sm text-gray-500">إجمالي الكمية</p>
                  <p className="text-2xl font-bold">{stats.totalQuantity.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <DollarSign className="h-8 w-8 text-purple-500" />
                <div>
                  <p className="text-sm text-gray-500">إجمالي القيمة</p>
                  <p className="text-2xl font-bold">{stats.totalValue.toLocaleString()} ج.م</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* فلتر شركة الشحن */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium">شركة الشحن:</label>
              <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="جميع الشركات" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الشركات</SelectItem>
                  {providers.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.provider_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* جدول البضائع */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              قائمة البضائع لدى الغير
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-gray-500">جاري التحميل...</div>
            ) : filteredItems.length === 0 ? (
              <div className="text-center py-8 text-gray-500">لا توجد بضائع لدى الغير</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-right">المنتج</th>
                      <th className="px-4 py-3 text-right">الفاتورة</th>
                      <th className="px-4 py-3 text-right">العميل</th>
                      <th className="px-4 py-3 text-right">شركة الشحن</th>
                      <th className="px-4 py-3 text-center">الكمية المتاحة</th>
                      <th className="px-4 py-3 text-center">التكلفة</th>
                      <th className="px-4 py-3 text-center">القيمة</th>
                      <th className="px-4 py-3 text-center">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredItems.map(item => {
                      const availableQty = getAvailableQty(item)
                      const value = availableQty * Number(item.unit_cost)
                      return (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="font-medium">{item.products?.name}</div>
                            <div className="text-xs text-gray-500">{item.products?.sku}</div>
                          </td>
                          <td className="px-4 py-3">
                            <Link href={`/invoices/${item.invoice_id}`} className="text-blue-600 hover:underline">
                              {item.invoices?.invoice_number}
                            </Link>
                          </td>
                          <td className="px-4 py-3">{item.invoices?.customers?.name || '-'}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs">
                              <Truck className="h-3 w-3" />
                              {item.shipping_providers?.provider_name}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center font-medium">{availableQty}</td>
                          <td className="px-4 py-3 text-center">{Number(item.unit_cost).toLocaleString()}</td>
                          <td className="px-4 py-3 text-center font-medium text-green-600">{value.toLocaleString()}</td>
                          <td className="px-4 py-3 text-center">
                            <Link href={`/invoices/${item.invoice_id}`}>
                              <Button variant="ghost" size="sm">
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

