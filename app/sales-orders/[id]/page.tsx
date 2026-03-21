"use client"

import { useEffect, useState, useMemo, useCallback, useRef } from "react"
import { useSupabase } from "@/lib/supabase/hooks"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useRouter, useParams } from "next/navigation"
import { ShoppingCart, ArrowLeft, ArrowRight, Pencil, FileText, Printer, Receipt, CreditCard, RotateCcw, Package, TrendingUp, DollarSign, AlertCircle, CheckCircle, Clock, Ban } from "lucide-react"
import { canAction } from "@/lib/authz"
import Link from "next/link"
import { useRealtimeTable } from "@/hooks/use-realtime-table"
import { useToast } from "@/hooks/use-toast"
import { toastActionError } from "@/lib/notifications"
import { getActiveCompanyId } from "@/lib/company"

interface SalesOrder {
  id: string
  company_id: string
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
  invoice_id?: string | null
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

interface LinkedInvoice {
  id: string
  invoice_number: string
  invoice_date: string
  due_date: string | null
  total_amount: number
  status: string
  paid_amount?: number
  returned_amount?: number
  return_status?: string
}

interface LinkedPayment {
  id: string
  reference_number: string
  payment_date: string
  amount: number
  payment_method: string
  notes?: string
  invoice_id?: string
}

interface LinkedReturn {
  id: string
  return_number: string
  return_date: string
  total_amount: number
  status: string
  reason?: string
  invoice_id?: string
  items?: LinkedReturnItem[]
}

interface LinkedReturnItem {
  id: string
  quantity: number
  unit_price: number
  line_total: number
  product?: { name: string }
}

export default function SalesOrderDetailPage() {
  const supabase = useSupabase()
  const router = useRouter()
  const params = useParams()
  const orderId = params.id as string
  const { toast } = useToast()

  const [order, setOrder] = useState<SalesOrder | null>(null)
  const [items, setItems] = useState<SOItem[]>([])
  const [linkedInvoices, setLinkedInvoices] = useState<LinkedInvoice[]>([])
  const [linkedPayments, setLinkedPayments] = useState<LinkedPayment[]>([])
  const [linkedReturns, setLinkedReturns] = useState<LinkedReturn[]>([])
  // 💸 إجمالي الرصيد الدائن المُصرَف للعميل (مرجع توضيحي)
  const [customerCreditDisbursed, setCustomerCreditDisbursed] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [permUpdate, setPermUpdate] = useState(false)
  const [permReadInvoices, setPermReadInvoices] = useState(false)
  const [permReadPayments, setPermReadPayments] = useState(false)
  const [activeTab, setActiveTab] = useState("items")
  const [appLang, setAppLang] = useState<'ar' | 'en'>(() => {
    if (typeof window === 'undefined') return 'ar'
    try {
      const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
      return (fromCookie || localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar'
    } catch { return 'ar' }
  })
  const [hydrated, setHydrated] = useState(false)
  const printContentRef = useRef<HTMLDivElement>(null)
  const [companyDetails, setCompanyDetails] = useState<any>(null)

  const currencySymbols: Record<string, string> = {
    EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ',
  }

  useEffect(() => {
    setHydrated(true)
    const handler = () => {
      try {
        const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
        setAppLang((fromCookie || localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar')
      } catch { }
    }
    window.addEventListener('app_language_changed', handler)
    return () => { window.removeEventListener('app_language_changed', handler) }
  }, [])

  useEffect(() => {
    const checkPerms = async () => {
      const [update, readInv, readPay] = await Promise.all([
        canAction(supabase, "sales_orders", "update"),
        canAction(supabase, "invoices", "read"),
        canAction(supabase, "payments", "read"),
      ])
      setPermUpdate(update)
      setPermReadInvoices(readInv)
      setPermReadPayments(readPay)
    }
    checkPerms()
  }, [supabase])

  const loadCompanyDetails = async (companyId: string) => {
    try {
      const { data } = await supabase
        .from('companies')
        .select('*')
        .eq('id', companyId)
        .single()
      if (data) setCompanyDetails(data)
    } catch (e) {
      console.error('Failed to load company details', e)
    }
  }

  const loadOrder = useCallback(async () => {
    if (!orderId) return
    setIsLoading(true)
    try {
      // Load sales order with customer and shipping provider
      const { data: orderData, error: orderError } = await supabase
        .from("sales_orders")
        .select(`*, customer:customers(id, name, email, phone, address), shipping_providers(provider_name)`)
        .eq("id", orderId)
        .single()

      if (orderError) throw orderError
      setOrder(orderData)

      if (orderData.company_id) {
        loadCompanyDetails(orderData.company_id)
      } else {
        const activeCompanyId = await getActiveCompanyId(supabase)
        if (activeCompanyId) loadCompanyDetails(activeCompanyId)
      }

      // Load order items
      const { data: itemsData } = await supabase
        .from("sales_order_items")
        .select(`*, product:products(name, sku)`)
        .eq("sales_order_id", orderId)
      setItems(itemsData || [])

      // Load linked invoices (via sales_order_id or invoice_id)
      const invoiceIds: string[] = []

      // First check if there's a direct invoice_id link
      if (orderData.invoice_id) {
        invoiceIds.push(orderData.invoice_id)
      }

      // Also check for invoices that reference this sales order
      const { data: invoicesData } = await supabase
        .from("invoices")
        .select("id, invoice_number, invoice_date, due_date, total_amount, status, paid_amount, returned_amount, return_status")
        .or(`sales_order_id.eq.${orderId}${orderData.invoice_id ? `,id.eq.${orderData.invoice_id}` : ''}`)

      const uniqueInvoices = invoicesData || []
      setLinkedInvoices(uniqueInvoices)

      // 💸 تحميل الرصيد الدائن المُصرَف للعميل (مرجع توضيحي)
      if (orderData.customer_id && orderData.company_id) {
        try {
          const { data: creditsData } = await supabase
            .from("customer_credits")
            .select("used_amount")
            .eq("company_id", orderData.company_id)
            .eq("customer_id", orderData.customer_id)
          const totalDisbursed = (creditsData || []).reduce((sum: number, c: any) => sum + Number(c.used_amount || 0), 0)
          setCustomerCreditDisbursed(totalDisbursed)
        } catch { setCustomerCreditDisbursed(0) }
      }

      // Load payments for all linked invoices
      if (uniqueInvoices.length > 0) {
        const invIds = uniqueInvoices.map((inv: any) => inv.id)
        const { data: paymentsData } = await supabase
          .from("payments")
          .select("id, reference_number, payment_date, amount, payment_method, notes, invoice_id")
          .in("invoice_id", invIds)
          .order("payment_date", { ascending: false })
        setLinkedPayments(paymentsData || [])

        // Load sales returns for all linked invoices
        const { data: returnsData } = await supabase
          .from("sales_returns")
          .select(`
            id, return_number, return_date, total_amount, status, reason, invoice_id,
            items:sales_return_items(id, quantity, unit_price, line_total, product:products(name))
          `)
          .in("invoice_id", invIds)
          .order("return_date", { ascending: false })
        setLinkedReturns(returnsData || [])
      } else {
        setLinkedPayments([])
        setLinkedReturns([])
      }

    } catch (error) {
      console.error("Error loading order:", error)
    } finally {
      setIsLoading(false)
    }
  }, [supabase, orderId])

  useEffect(() => {
    loadOrder()
  }, [loadOrder])

  // 🔄 Realtime: تحديث تفاصيل أمر البيع تلقائياً عند أي تغيير
  const loadOrderRef = useRef(loadOrder)
  loadOrderRef.current = loadOrder

  const handleSORealtimeEvent = useCallback((record: any) => {
    // فقط إذا كان التحديث لهذا الأمر
    if (record?.id === orderId) {
      console.log('🔄 [SO Detail] Realtime event received, refreshing SO data...')
      loadOrderRef.current()
    }
  }, [orderId])

  useRealtimeTable({
    table: 'sales_orders',
    enabled: !!orderId,
    onUpdate: handleSORealtimeEvent,
    onDelete: (record: any) => {
      if (record?.id === orderId) {
        console.log('🗑️ [SO Detail] SO deleted, redirecting...')
        router.push('/sales-orders')
      }
    },
  })

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

  // Calculate summary totals
  // ✅ total_amount هو الإجمالي الأصلي (لا يتغير بالمرتجعات)
  const summary = useMemo(() => {
    // إجمالي الفواتير = total_amount (الإجمالي الأصلي)
    const totalInvoiced = linkedInvoices.reduce((sum, inv) => {
      return sum + Number(inv.total_amount || 0)
    }, 0)
    const totalPaid = linkedPayments.reduce((sum, pay) => sum + (pay.amount || 0), 0)
    // المرتجعات من invoices.returned_amount
    const totalReturned = linkedInvoices.reduce((sum, inv) => sum + Number((inv as any).returned_amount || 0), 0)
    const netRemaining = Math.max(0, totalInvoiced - totalPaid - totalReturned)
    return { totalInvoiced, totalPaid, totalReturned, netRemaining }
  }, [linkedInvoices, linkedPayments])

  const getInvoiceStatusBadge = (status: string) => {
    const config: Record<string, { bg: string; text: string; icon: any; label: { ar: string; en: string } }> = {
      draft: { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-700 dark:text-gray-300', icon: Clock, label: { ar: 'مسودة', en: 'Draft' } },
      sent: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', icon: FileText, label: { ar: 'مُرسلة', en: 'Sent' } },
      paid: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', icon: CheckCircle, label: { ar: 'مدفوعة', en: 'Paid' } },
      partially_paid: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-300', icon: DollarSign, label: { ar: 'مدفوعة جزئياً', en: 'Partially Paid' } },
      partially_returned: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300', icon: RotateCcw, label: { ar: 'مرتجع جزئي', en: 'Partially Returned' } },
      fully_returned: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300', icon: RotateCcw, label: { ar: 'مرتجع كامل', en: 'Fully Returned' } },
      overdue: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', icon: AlertCircle, label: { ar: 'متأخرة', en: 'Overdue' } },
      cancelled: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', icon: Ban, label: { ar: 'ملغاة', en: 'Cancelled' } },
    }
    const c = config[status] || config.draft
    const Icon = c.icon
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
        <Icon className="h-3 w-3" />
        {appLang === 'en' ? c.label.en : c.label.ar}
      </span>
    )
  }

  const getReturnStatusBadge = (status: string) => {
    const config: Record<string, { bg: string; text: string; label: { ar: string; en: string } }> = {
      pending: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-300', label: { ar: 'قيد الانتظار', en: 'Pending' } },
      approved: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', label: { ar: 'معتمد', en: 'Approved' } },
      completed: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', label: { ar: 'مكتمل', en: 'Completed' } },
      cancelled: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', label: { ar: 'ملغي', en: 'Cancelled' } },
    }
    const c = config[status] || config.pending
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
        {appLang === 'en' ? c.label.en : c.label.ar}
      </span>
    )
  }

  const getPaymentMethodLabel = (method: string) => {
    const methods: Record<string, { ar: string; en: string }> = {
      cash: { ar: 'نقدي', en: 'Cash' },
      bank_transfer: { ar: 'تحويل بنكي', en: 'Bank Transfer' },
      credit_card: { ar: 'بطاقة ائتمان', en: 'Credit Card' },
      check: { ar: 'شيك', en: 'Check' },
      other: { ar: 'أخرى', en: 'Other' },
    }
    const m = methods[method] || methods.other
    return appLang === 'en' ? m.en : m.ar
  }

  const handlePrint = async () => {
    try {
      const el = printContentRef.current
      if (!el) return

      const clone = el.cloneNode(true) as HTMLElement
      // Remove tabs trigger list and non-printable elements
      const toRemove = clone.querySelectorAll('.no-print, button, [role="tablist"]')
      toRemove.forEach(e => e.remove())

      const content = clone.innerHTML
      const { openPrintWindow } = await import('@/lib/print-utils')

      const companyName = companyDetails?.name || 'Company Name'
      const address = companyDetails?.address || ''
      const phone = companyDetails?.phone || ''

      openPrintWindow(content, {
        lang: appLang as 'ar' | 'en',
        direction: appLang === 'ar' ? 'rtl' : 'ltr',
        title: appLang === 'en' ? `Sales Order ${order?.so_number || ''}` : `أمر بيع ${order?.so_number || ''}`,
        fontSize: 10,
        pageSize: 'A4',
        margin: '15mm',
        companyName: companyName,
        companyAddress: address,
        companyPhone: phone,
        printedBy: 'System User',
        showHeader: true,
        showFooter: true
      })
    } catch (err) {
      console.error("Error generating print:", err)
      toastActionError(toast, appLang === 'en' ? 'Print' : 'طباعة', appLang === 'en' ? 'Sales Order' : 'أمر البيع', String((err as any)?.message || ''))
    }
  }

  if (!hydrated) return null

  const currency = order?.currency || 'EGP'
  const symbol = currencySymbols[currency] || currency
  const total = order?.total || order?.total_amount || 0

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
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
            {permUpdate && (
              <div className="flex gap-2 flex-shrink-0">
                <Button variant="outline" onClick={handlePrint} className="dark:border-gray-600 dark:text-gray-300">
                  <Printer className="h-4 w-4 mr-2" />
                  <span suppressHydrationWarning>{appLang === 'en' ? 'Print' : 'طباعة'}</span>
                </Button>
                {order?.status === 'draft' && (
                  <Link href={`/sales-orders/${orderId}/edit`}>
                    <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                      <Pencil className="h-4 w-4 mr-2" />
                      <span suppressHydrationWarning>{appLang === 'en' ? 'Edit' : 'تعديل'}</span>
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : order ? (
            <div className="space-y-6" ref={printContentRef}>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 no-print">
                <Card className="dark:bg-gray-800 dark:border-gray-700 p-3 sm:p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                      <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Total Invoiced' : 'إجمالي الفواتير'}</p>
                      <p className="text-lg font-bold text-blue-600">{symbol}{summary.totalInvoiced.toFixed(2)}</p>
                    </div>
                  </div>
                </Card>
                <Card className="dark:bg-gray-800 dark:border-gray-700 p-3 sm:p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                      <CreditCard className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Total Paid' : 'إجمالي المدفوع'}</p>
                      <p className="text-lg font-bold text-green-600">{symbol}{summary.totalPaid.toFixed(2)}</p>
                    </div>
                  </div>
                </Card>
                <Card className="dark:bg-gray-800 dark:border-gray-700 p-3 sm:p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                      <RotateCcw className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Total Returns' : 'إجمالي المرتجعات'}</p>
                      <p className="text-lg font-bold text-orange-600">{symbol}{summary.totalReturned.toFixed(2)}</p>
                    </div>
                  </div>
                </Card>
                <Card className="dark:bg-gray-800 dark:border-gray-700 p-3 sm:p-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${summary.netRemaining > 0 ? 'bg-red-100 dark:bg-red-900/30' : 'bg-green-100 dark:bg-green-900/30'}`}>
                      <DollarSign className={`h-5 w-5 ${summary.netRemaining > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`} />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Net Remaining' : 'صافي المتبقي'}</p>
                      <p className={`text-lg font-bold ${summary.netRemaining > 0 ? 'text-red-600' : 'text-green-600'}`}>{symbol}{summary.netRemaining.toFixed(2)}</p>
                    </div>
                  </div>
                </Card>
              </div>

              {/* مرجع توضيحي: الرصيد الدائن المُصرَف للعميل */}
              {customerCreditDisbursed > 0 && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 no-print">
                  <div className="p-2 bg-purple-100 dark:bg-purple-800 rounded-lg shrink-0">
                    <span className="text-lg">💸</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-purple-600 dark:text-purple-400 font-medium">
                      {appLang === 'en' ? 'Disbursed Customer Credit (Reference)' : 'رصيد دائن مُصرَف للعميل (مرجع توضيحي)'}
                    </p>
                    <p className="text-sm font-bold text-purple-700 dark:text-purple-300">
                      {symbol}{customerCreditDisbursed.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <span className="text-xs text-purple-500 dark:text-purple-400 shrink-0 italic">
                    {appLang === 'en' ? 'Already refunded to customer' : 'تم ردّه للعميل مسبقاً'}
                  </span>
                </div>
              )}

              {/* Order Info & Customer */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <Card className="dark:bg-gray-800 dark:border-gray-700">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base dark:text-white flex items-center gap-2">
                      <ShoppingCart className="h-4 w-4" />
                      {appLang === 'en' ? 'Order Information' : 'معلومات الأمر'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
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
                    {(order as any).shipping_providers?.provider_name && (
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Shipping Company' : 'شركة الشحن'}</span>
                        <span className="text-gray-900 dark:text-white">{(order as any).shipping_providers.provider_name}</span>
                      </div>
                    )}
                    <div className="flex justify-between pt-2 border-t dark:border-gray-700">
                      <span className="text-gray-500 dark:text-gray-400 font-medium">{appLang === 'en' ? 'Order Total' : 'إجمالي الأمر'}</span>
                      <span className="font-bold text-gray-900 dark:text-white">{symbol}{total.toFixed(2)}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="dark:bg-gray-800 dark:border-gray-700">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base dark:text-white">{appLang === 'en' ? 'Customer' : 'العميل'}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="font-medium text-gray-900 dark:text-white text-lg">{order.customer?.name || '-'}</p>
                    {order.customer?.phone && <p className="text-gray-600 dark:text-gray-400 text-sm">{order.customer.phone}</p>}
                    {order.customer?.email && <p className="text-gray-600 dark:text-gray-400 text-sm">{order.customer.email}</p>}
                    {order.customer?.address && <p className="text-gray-500 dark:text-gray-500 text-sm">{order.customer.address}</p>}
                  </CardContent>
                </Card>
              </div>

              {/* Tabs for Items, Invoices, Payments, Returns */}
              <Card className="dark:bg-gray-800 dark:border-gray-700">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <div className="border-b dark:border-gray-700 px-4 pt-4 no-print">
                    <TabsList className="grid w-full grid-cols-4 h-auto gap-1 bg-transparent p-0">
                      <TabsTrigger
                        value="items"
                        className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-700 dark:data-[state=active]:bg-blue-900/30 dark:data-[state=active]:text-blue-300 flex items-center gap-1 sm:gap-2 text-xs sm:text-sm py-2"
                      >
                        <Package className="h-3 w-3 sm:h-4 sm:w-4" />
                        <span className="hidden sm:inline">{appLang === 'en' ? 'Items' : 'العناصر'}</span>
                        <span className="sm:hidden">{items.length}</span>
                        <span className="hidden sm:inline text-xs bg-gray-200 dark:bg-gray-600 px-1.5 py-0.5 rounded-full">{items.length}</span>
                      </TabsTrigger>
                      <TabsTrigger
                        value="invoices"
                        className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-700 dark:data-[state=active]:bg-blue-900/30 dark:data-[state=active]:text-blue-300 flex items-center gap-1 sm:gap-2 text-xs sm:text-sm py-2"
                      >
                        <Receipt className="h-3 w-3 sm:h-4 sm:w-4" />
                        <span className="hidden sm:inline">{appLang === 'en' ? 'Invoices' : 'الفواتير'}</span>
                        <span className="sm:hidden">{linkedInvoices.length}</span>
                        <span className="hidden sm:inline text-xs bg-gray-200 dark:bg-gray-600 px-1.5 py-0.5 rounded-full">{linkedInvoices.length}</span>
                      </TabsTrigger>
                      <TabsTrigger
                        value="payments"
                        className="data-[state=active]:bg-green-100 data-[state=active]:text-green-700 dark:data-[state=active]:bg-green-900/30 dark:data-[state=active]:text-green-300 flex items-center gap-1 sm:gap-2 text-xs sm:text-sm py-2"
                      >
                        <CreditCard className="h-3 w-3 sm:h-4 sm:w-4" />
                        <span className="hidden sm:inline">{appLang === 'en' ? 'Payments' : 'المدفوعات'}</span>
                        <span className="sm:hidden">{linkedPayments.length}</span>
                        <span className="hidden sm:inline text-xs bg-gray-200 dark:bg-gray-600 px-1.5 py-0.5 rounded-full">{linkedPayments.length}</span>
                      </TabsTrigger>
                      <TabsTrigger
                        value="returns"
                        className="data-[state=active]:bg-orange-100 data-[state=active]:text-orange-700 dark:data-[state=active]:bg-orange-900/30 dark:data-[state=active]:text-orange-300 flex items-center gap-1 sm:gap-2 text-xs sm:text-sm py-2"
                      >
                        <RotateCcw className="h-3 w-3 sm:h-4 sm:w-4" />
                        <span className="hidden sm:inline">{appLang === 'en' ? 'Returns' : 'المرتجعات'}</span>
                        <span className="sm:hidden">{linkedReturns.length}</span>
                        <span className="hidden sm:inline text-xs bg-gray-200 dark:bg-gray-600 px-1.5 py-0.5 rounded-full">{linkedReturns.length}</span>
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  {/* Items Tab */}
                  <TabsContent value="items" className="p-4 m-0">
                    <div className="overflow-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b dark:border-gray-700 text-left">
                            <th className="py-3 px-2 font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Product' : 'المنتج'}</th>
                            <th className="py-3 px-2 font-semibold text-gray-900 dark:text-white text-center">{appLang === 'en' ? 'Qty' : 'الكمية'}</th>
                            <th className="py-3 px-2 font-semibold text-gray-900 dark:text-white hidden sm:table-cell">{appLang === 'en' ? 'Price' : 'السعر'}</th>
                            <th className="py-3 px-2 font-semibold text-gray-900 dark:text-white hidden md:table-cell">{appLang === 'en' ? 'Disc%' : 'خصم%'}</th>
                            <th className="py-3 px-2 font-semibold text-gray-900 dark:text-white hidden md:table-cell">{appLang === 'en' ? 'Tax%' : 'ضريبة%'}</th>
                            <th className="py-3 px-2 font-semibold text-gray-900 dark:text-white text-right">{appLang === 'en' ? 'Total' : 'الإجمالي'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((item) => (
                            <tr key={item.id} className="border-b dark:border-gray-700">
                              <td className="py-3 px-2 text-gray-900 dark:text-white">{item.product?.name || item.description || '-'}</td>
                              <td className="py-3 px-2 text-gray-700 dark:text-gray-300 text-center">{item.quantity}</td>
                              <td className="py-3 px-2 text-gray-700 dark:text-gray-300 hidden sm:table-cell">{symbol}{item.unit_price.toFixed(2)}</td>
                              <td className="py-3 px-2 text-gray-700 dark:text-gray-300 hidden md:table-cell">{item.discount_percent || 0}%</td>
                              <td className="py-3 px-2 text-gray-700 dark:text-gray-300 hidden md:table-cell">{item.tax_rate || 0}%</td>
                              <td className="py-3 px-2 font-medium text-gray-900 dark:text-white text-right">{symbol}{(item.total || item.subtotal || 0).toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-gray-50 dark:bg-gray-700/50">
                            <td colSpan={5} className="py-3 px-2 font-semibold text-gray-900 dark:text-white text-right">{appLang === 'en' ? 'Order Total:' : 'إجمالي الأمر:'}</td>
                            <td className="py-3 px-2 font-bold text-gray-900 dark:text-white text-right">{symbol}{total.toFixed(2)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </TabsContent>

                  {/* Invoices Tab */}
                  <TabsContent value="invoices" className="p-4 m-0">
                    {linkedInvoices.length === 0 ? (
                      <div className="text-center py-8">
                        <Receipt className="h-12 w-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                        <p className="text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'No invoices linked to this order' : 'لا توجد فواتير مرتبطة بهذا الأمر'}</p>
                      </div>
                    ) : (
                      <div className="overflow-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b dark:border-gray-700 text-left">
                              <th className="py-3 px-2 font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Invoice #' : 'رقم الفاتورة'}</th>
                              <th className="py-3 px-2 font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Date' : 'التاريخ'}</th>
                              <th className="py-3 px-2 font-semibold text-gray-900 dark:text-white text-right">{appLang === 'en' ? 'Amount' : 'المبلغ'}</th>
                              <th className="py-3 px-2 font-semibold text-gray-900 dark:text-white text-right hidden sm:table-cell">{appLang === 'en' ? 'Returned' : 'المرتجع'}</th>
                              <th className="py-3 px-2 font-semibold text-gray-900 dark:text-white text-center">{appLang === 'en' ? 'Status' : 'الحالة'}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {linkedInvoices.map((inv) => {
                              const returnedAmount = Number(inv.returned_amount || 0)
                              // ✅ total_amount هو الإجمالي الأصلي (لا يتغير بالمرتجعات)
                              const originalTotal = Number(inv.total_amount || 0)
                              return (
                                <tr key={inv.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                  <td className="py-3 px-2">
                                    <span className="font-medium text-gray-900 dark:text-white">{inv.invoice_number}</span>
                                  </td>
                                  <td className="py-3 px-2 text-gray-700 dark:text-gray-300">{inv.invoice_date}</td>
                                  <td className="py-3 px-2 font-medium text-gray-900 dark:text-white text-right">{symbol}{originalTotal.toFixed(2)}</td>
                                  <td className="py-3 px-2 text-right hidden sm:table-cell">
                                    {returnedAmount > 0 ? (
                                      <span className="text-orange-600 dark:text-orange-400">-{symbol}{returnedAmount.toFixed(2)}</span>
                                    ) : '-'}
                                  </td>
                                  <td className="py-3 px-2 text-center">
                                    <div className="flex flex-col items-center gap-1">
                                      {getInvoiceStatusBadge(inv.status)}
                                      {inv.return_status && inv.status !== 'fully_returned' && (
                                        <span className={`text-xs px-2 py-0.5 rounded-full ${inv.return_status === 'full'
                                          ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
                                          : 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300'
                                          }`}>
                                          {inv.return_status === 'full'
                                            ? (appLang === 'en' ? 'Full Return' : 'مرتجع كامل')
                                            : (appLang === 'en' ? 'Partial Return' : 'مرتجع جزئي')}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="bg-blue-50 dark:bg-blue-900/20">
                              <td colSpan={2} className="py-3 px-2 font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Total Invoiced:' : 'إجمالي الفواتير:'}</td>
                              <td className="py-3 px-2 font-bold text-blue-600 dark:text-blue-400 text-right">{symbol}{summary.totalInvoiced.toFixed(2)}</td>
                              <td className="py-3 px-2 font-bold text-orange-600 dark:text-orange-400 text-right hidden sm:table-cell">
                                {summary.totalReturned > 0 ? `-${symbol}${summary.totalReturned.toFixed(2)}` : '-'}
                              </td>
                              <td></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </TabsContent>

                  {/* Payments Tab */}
                  <TabsContent value="payments" className="p-4 m-0">
                    {!permReadPayments ? (
                      <div className="text-center py-8">
                        <AlertCircle className="h-12 w-12 mx-auto text-yellow-400 mb-3" />
                        <p className="text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'You do not have permission to view payments' : 'ليس لديك صلاحية لعرض المدفوعات'}</p>
                      </div>
                    ) : linkedPayments.length === 0 ? (
                      <div className="text-center py-8">
                        <CreditCard className="h-12 w-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                        <p className="text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'No payments recorded for this order' : 'لا توجد مدفوعات مسجلة لهذا الأمر'}</p>
                      </div>
                    ) : (
                      <div className="overflow-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b dark:border-gray-700 text-left">
                              <th className="py-3 px-2 font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Receipt #' : 'رقم السند'}</th>
                              <th className="py-3 px-2 font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Date' : 'التاريخ'}</th>
                              <th className="py-3 px-2 font-semibold text-gray-900 dark:text-white hidden sm:table-cell">{appLang === 'en' ? 'Method' : 'طريقة الدفع'}</th>
                              <th className="py-3 px-2 font-semibold text-gray-900 dark:text-white text-right">{appLang === 'en' ? 'Amount' : 'المبلغ'}</th>
                              <th className="py-3 px-2 font-semibold text-gray-900 dark:text-white hidden md:table-cell">{appLang === 'en' ? 'Notes' : 'ملاحظات'}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {linkedPayments.map((pay) => (
                              <tr key={pay.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <td className="py-3 px-2 font-medium text-green-600 dark:text-green-400">{pay.reference_number || '-'}</td>
                                <td className="py-3 px-2 text-gray-700 dark:text-gray-300">{pay.payment_date}</td>
                                <td className="py-3 px-2 text-gray-700 dark:text-gray-300 hidden sm:table-cell">
                                  <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs">{getPaymentMethodLabel(pay.payment_method)}</span>
                                </td>
                                <td className="py-3 px-2 font-medium text-green-600 dark:text-green-400 text-right">{symbol}{pay.amount.toFixed(2)}</td>
                                <td className="py-3 px-2 text-gray-500 dark:text-gray-400 text-xs hidden md:table-cell truncate max-w-[150px]">{pay.notes || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-green-50 dark:bg-green-900/20">
                              <td colSpan={3} className="py-3 px-2 font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Total Paid:' : 'إجمالي المدفوع:'}</td>
                              <td className="py-3 px-2 font-bold text-green-600 dark:text-green-400 text-right">{symbol}{summary.totalPaid.toFixed(2)}</td>
                              <td></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </TabsContent>

                  {/* Returns Tab */}
                  <TabsContent value="returns" className="p-4 m-0">
                    {linkedReturns.length === 0 ? (
                      <div className="text-center py-8">
                        <RotateCcw className="h-12 w-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                        <p className="text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'No returns for this order' : 'لا توجد مرتجعات لهذا الأمر'}</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {linkedReturns.map((ret) => (
                          <div key={ret.id} className="border dark:border-gray-700 rounded-lg p-4">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                              <div className="flex items-center gap-3">
                                <span className="font-medium text-orange-600 dark:text-orange-400">{ret.return_number}</span>
                                {getReturnStatusBadge(ret.status)}
                              </div>
                              <div className="text-sm text-gray-500 dark:text-gray-400">{ret.return_date}</div>
                            </div>
                            {ret.reason && (
                              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 bg-gray-50 dark:bg-gray-700/50 p-2 rounded">
                                <span className="font-medium">{appLang === 'en' ? 'Reason: ' : 'السبب: '}</span>{ret.reason}
                              </p>
                            )}
                            {ret.items && ret.items.length > 0 && (
                              <div className="overflow-auto">
                                <table className="w-full text-xs sm:text-sm">
                                  <thead>
                                    <tr className="border-b dark:border-gray-600 text-left">
                                      <th className="py-2 px-2 text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Product' : 'المنتج'}</th>
                                      <th className="py-2 px-2 text-gray-600 dark:text-gray-400 text-center">{appLang === 'en' ? 'Qty' : 'الكمية'}</th>
                                      <th className="py-2 px-2 text-gray-600 dark:text-gray-400 text-right">{appLang === 'en' ? 'Amount' : 'المبلغ'}</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {ret.items.map((item) => (
                                      <tr key={item.id} className="border-b dark:border-gray-600">
                                        <td className="py-2 px-2 text-gray-900 dark:text-white">{item.product?.name || '-'}</td>
                                        <td className="py-2 px-2 text-gray-700 dark:text-gray-300 text-center">{item.quantity}</td>
                                        <td className="py-2 px-2 text-orange-600 dark:text-orange-400 text-right">{symbol}{item.line_total.toFixed(2)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                            <div className="flex justify-end mt-3 pt-3 border-t dark:border-gray-700">
                              <span className="font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Return Total: ' : 'إجمالي المرتجع: '}</span>
                              <span className="font-bold text-orange-600 dark:text-orange-400 ml-2">{symbol}{ret.total_amount.toFixed(2)}</span>
                            </div>
                          </div>
                        ))}
                        <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 flex justify-between items-center">
                          <span className="font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Total Returns:' : 'إجمالي المرتجعات:'}</span>
                          <span className="font-bold text-orange-600 dark:text-orange-400 text-lg">{symbol}{summary.totalReturned.toFixed(2)}</span>
                        </div>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </Card>

              {/* Notes */}
              {order.notes && (
                <Card className="dark:bg-gray-800 dark:border-gray-700">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base dark:text-white">{appLang === 'en' ? 'Notes' : 'ملاحظات'}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-gray-600 dark:text-gray-400 text-sm">{order.notes}</p>
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
