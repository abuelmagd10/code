"use client"

import { useEffect, useState } from "react"
import { useSupabase } from "@/lib/supabase/hooks"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useRouter, useParams } from "next/navigation"
import { ShoppingCart, ArrowLeft, ArrowRight, Pencil, FileText, Printer } from "lucide-react"
import { canAction } from "@/lib/authz"
import Link from "next/link"

interface SalesOrder {
  id: string
  so_number: string
  so_date: string
  due_date: string | null
  status: string
  subtotal: number
  tax_amount: number
  total: number
  total_amount?: number
  discount_amount?: number
  shipping_charge?: number
  adjustment?: number
  notes?: string | null
  currency?: string
  customer?: { id: string; name: string; email?: string; phone?: string; address?: string }
}

interface SOItem {
  id: string
  product_id: string
  quantity: number
  unit_price: number
  tax_rate: number
  discount_percent: number
  subtotal: number
  tax_amount: number
  total: number
  description?: string
  product?: { name: string; sku: string }
}

export default function SalesOrderDetailPage() {
  const supabase = useSupabase()
  const router = useRouter()
  const params = useParams()
  const orderId = params.id as string

  const [order, setOrder] = useState<SalesOrder | null>(null)
  const [items, setItems] = useState<SOItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [permUpdate, setPermUpdate] = useState(false)
  const [appLang, setAppLang] = useState<'ar'|'en'>(() => {
    if (typeof window === 'undefined') return 'ar'
    try {
      const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
      return (fromCookie || localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar'
    } catch { return 'ar' }
  })
  const [hydrated, setHydrated] = useState(false)

  const currencySymbols: Record<string, string> = {
    EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ',
  }

  useEffect(() => {
    setHydrated(true)
    const handler = () => {
      try {
        const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
        setAppLang((fromCookie || localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar')
      } catch {}
    }
    window.addEventListener('app_language_changed', handler)
    return () => { window.removeEventListener('app_language_changed', handler) }
  }, [])

  useEffect(() => {
    const checkPerms = async () => {
      const update = await canAction(supabase, "sales_orders", "update")
      setPermUpdate(update)
    }
    checkPerms()
  }, [supabase])

  useEffect(() => {
    const loadOrder = async () => {
      setIsLoading(true)
      try {
        const { data: orderData, error: orderError } = await supabase
          .from("sales_orders")
          .select(`*, customer:customers(id, name, email, phone, address)`)
          .eq("id", orderId)
          .single()

        if (orderError) throw orderError
        setOrder(orderData)

        const { data: itemsData } = await supabase
          .from("sales_order_items")
          .select(`*, product:products(name, sku)`)
          .eq("sales_order_id", orderId)

        setItems(itemsData || [])
      } catch (error) {
        console.error("Error loading order:", error)
      } finally {
        setIsLoading(false)
      }
    }
    if (orderId) loadOrder()
  }, [supabase, orderId])

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { bg: string; text: string; label: { ar: string; en: string } }> = {
      draft: { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-700 dark:text-gray-300', label: { ar: 'مسودة', en: 'Draft' } },
      sent: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', label: { ar: 'مُرسل', en: 'Sent' } },
      invoiced: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', label: { ar: 'تم التحويل', en: 'Invoiced' } },
      cancelled: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', label: { ar: 'ملغي', en: 'Cancelled' } },
    }
    const config = statusConfig[status] || statusConfig.draft
    return (
      <span className={`px-3 py-1 rounded-full text-sm font-medium ${config.bg} ${config.text}`}>
        {appLang === 'en' ? config.label.en : config.label.ar}
      </span>
    )
  }

  if (!hydrated) return null

  const currency = order?.currency || 'EGP'
  const symbol = currencySymbols[currency] || currency
  const total = order?.total || order?.total_amount || 0

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />
      {/* Main Content */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div className="flex items-center gap-3 sm:gap-4">
              <Link href="/sales-orders">
                <Button variant="ghost" size="icon" className="flex-shrink-0">
                  {appLang === 'ar' ? <ArrowRight className="h-5 w-5" /> : <ArrowLeft className="h-5 w-5" />}
                </Button>
              </Link>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2 truncate" suppressHydrationWarning>
                  <ShoppingCart className="h-5 w-5 sm:h-6 sm:w-6 flex-shrink-0" />
                  {order?.so_number || (appLang === 'en' ? 'Sales Order' : 'أمر البيع')}
                </h1>
                {order && <div className="mt-1">{getStatusBadge(order.status)}</div>}
              </div>
            </div>
            {order?.status === 'draft' && permUpdate && (
              <div className="flex gap-2 flex-shrink-0">
                <Button variant="outline" onClick={() => window.print()} className="dark:border-gray-600 dark:text-gray-300">
                  <Printer className="h-4 w-4 mr-2" />
                  <span suppressHydrationWarning>{appLang === 'en' ? 'Print' : 'طباعة'}</span>
                </Button>
                <Link href={`/sales-orders/${orderId}/edit`}>
                  <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                    <Pencil className="h-4 w-4 mr-2" />
                    <span suppressHydrationWarning>{appLang === 'en' ? 'Edit' : 'تعديل'}</span>
                  </Button>
                </Link>
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : order ? (
            <div className="space-y-6">
              {/* Order Info & Customer */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="dark:bg-gray-800 dark:border-gray-700">
                  <CardHeader>
                    <CardTitle className="dark:text-white">{appLang === 'en' ? 'Order Information' : 'معلومات الأمر'}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Order Number' : 'رقم الأمر'}</span>
                      <span className="font-medium text-gray-900 dark:text-white">{order.so_number}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Date' : 'التاريخ'}</span>
                      <span className="text-gray-900 dark:text-white">{order.so_date}</span>
                    </div>
                    {order.due_date && (
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Due Date' : 'تاريخ الاستحقاق'}</span>
                        <span className="text-gray-900 dark:text-white">{order.due_date}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Currency' : 'العملة'}</span>
                      <span className="text-gray-900 dark:text-white">{currency}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="dark:bg-gray-800 dark:border-gray-700">
                  <CardHeader>
                    <CardTitle className="dark:text-white">{appLang === 'en' ? 'Customer' : 'العميل'}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="font-medium text-gray-900 dark:text-white text-lg">{order.customer?.name || '-'}</p>
                    {order.customer?.phone && <p className="text-gray-600 dark:text-gray-400">{order.customer.phone}</p>}
                    {order.customer?.email && <p className="text-gray-600 dark:text-gray-400">{order.customer.email}</p>}
                    {order.customer?.address && <p className="text-gray-500 dark:text-gray-500 text-sm">{order.customer.address}</p>}
                  </CardContent>
                </Card>
              </div>

              {/* Items */}
              <Card className="dark:bg-gray-800 dark:border-gray-700">
                <CardHeader>
                  <CardTitle className="dark:text-white">{appLang === 'en' ? 'Items' : 'العناصر'}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b dark:border-gray-700 text-left">
                          <th className="py-3 px-2 font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Product' : 'المنتج'}</th>
                          <th className="py-3 px-2 font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Qty' : 'الكمية'}</th>
                          <th className="py-3 px-2 font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Price' : 'السعر'}</th>
                          <th className="py-3 px-2 font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Disc%' : 'خصم%'}</th>
                          <th className="py-3 px-2 font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Tax%' : 'ضريبة%'}</th>
                          <th className="py-3 px-2 font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Total' : 'الإجمالي'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item) => (
                          <tr key={item.id} className="border-b dark:border-gray-700">
                            <td className="py-3 px-2 text-gray-900 dark:text-white">{item.product?.name || item.description || '-'}</td>
                            <td className="py-3 px-2 text-gray-700 dark:text-gray-300">{item.quantity}</td>
                            <td className="py-3 px-2 text-gray-700 dark:text-gray-300">{symbol}{item.unit_price.toFixed(2)}</td>
                            <td className="py-3 px-2 text-gray-700 dark:text-gray-300">{item.discount_percent || 0}%</td>
                            <td className="py-3 px-2 text-gray-700 dark:text-gray-300">{item.tax_rate || 0}%</td>
                            <td className="py-3 px-2 font-medium text-gray-900 dark:text-white">{symbol}{(item.total || item.subtotal || 0).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Summary */}
              <Card className="dark:bg-gray-800 dark:border-gray-700">
                <CardContent className="pt-6">
                  <div className="max-w-xs ml-auto space-y-2">
                    <div className="flex justify-between text-gray-600 dark:text-gray-400">
                      <span>{appLang === 'en' ? 'Subtotal' : 'المجموع الفرعي'}</span>
                      <span>{symbol}{(order.subtotal || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600 dark:text-gray-400">
                      <span>{appLang === 'en' ? 'Tax' : 'الضريبة'}</span>
                      <span>{symbol}{(order.tax_amount || 0).toFixed(2)}</span>
                    </div>
                    {(order.discount_value || 0) > 0 && (
                      <div className="flex justify-between text-red-600 dark:text-red-400">
                        <span>{appLang === 'en' ? 'Discount' : 'الخصم'} {order.discount_type === 'percent' ? `(${order.discount_value}%)` : ''}</span>
                        <span>-{symbol}{order.discount_type === 'percent' ? ((order.subtotal || 0) * (order.discount_value || 0) / 100).toFixed(2) : (order.discount_value || 0).toFixed(2)}</span>
                      </div>
                    )}
                    {(order.shipping || 0) > 0 && (
                      <div className="flex justify-between text-gray-600 dark:text-gray-400">
                        <span>{appLang === 'en' ? 'Shipping' : 'الشحن'}</span>
                        <span>{symbol}{(order.shipping || 0).toFixed(2)}</span>
                      </div>
                    )}
                    {(order.adjustment || 0) !== 0 && (
                      <div className="flex justify-between text-gray-600 dark:text-gray-400">
                        <span>{appLang === 'en' ? 'Adjustment' : 'التسوية'}</span>
                        <span>{(order.adjustment || 0) >= 0 ? '+' : ''}{symbol}{order.adjustment?.toFixed(2)}</span>
                      </div>
                    )}
                    <hr className="border-gray-200 dark:border-gray-700" />
                    <div className="flex justify-between text-lg font-bold text-gray-900 dark:text-white">
                      <span>{appLang === 'en' ? 'Total' : 'الإجمالي'}</span>
                      <span>{symbol}{total.toFixed(2)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Notes */}
              {order.notes && (
                <Card className="dark:bg-gray-800 dark:border-gray-700">
                  <CardHeader>
                    <CardTitle className="dark:text-white">{appLang === 'en' ? 'Notes' : 'ملاحظات'}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-gray-600 dark:text-gray-400">{order.notes}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Order not found' : 'لم يتم العثور على الأمر'}</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

