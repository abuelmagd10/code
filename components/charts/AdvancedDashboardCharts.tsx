"use client"

import { useEffect, useState, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer,
  XAxis, YAxis, Tooltip, Legend, CartesianGrid
} from "recharts"
import { Users, Package, FileText, TrendingUp, Download } from "lucide-react"

interface AdvancedDashboardChartsProps {
  companyId: string
  defaultCurrency: string
  appLang: string
}

interface InvoiceStatusData {
  name: string
  value: number
  color: string
}

interface TopCustomer {
  name: string
  total: number
  invoiceCount: number
}

interface TopProduct {
  name: string
  quantity: number
  revenue: number
}

const COLORS = {
  draft: '#94a3b8',
  sent: '#3b82f6',
  partially_paid: '#f59e0b',
  paid: '#10b981',
  cancelled: '#ef4444'
}

export default function AdvancedDashboardCharts({
  companyId,
  defaultCurrency,
  appLang
}: AdvancedDashboardChartsProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [invoiceStatusData, setInvoiceStatusData] = useState<InvoiceStatusData[]>([])
  const [topCustomers, setTopCustomers] = useState<TopCustomer[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [collectionsData, setCollectionsData] = useState({ collected: 0, pending: 0 })
  const [shippingExpense, setShippingExpense] = useState(0)
  const [inventoryData, setInventoryData] = useState<{ name: string; quantity: number; value: number }[]>([])

  const L = appLang === 'en' ? {
    invoiceStatus: 'Invoice Status',
    topCustomers: 'Top Customers',
    topProducts: 'Top Selling Products',
    collections: 'Collections & Payments',
    collected: 'Collected',
    pending: 'Pending',
    draft: 'Draft',
    sent: 'Sent',
    partiallyPaid: 'Partially Paid',
    paid: 'Paid',
    cancelled: 'Cancelled',
    noData: 'No data available',
    export: 'Export',
    quantity: 'Qty',
    revenue: 'Revenue',
    invoices: 'Invoices',
    shipping: 'Shipping Expense',
    inventory: 'Inventory Overview',
    value: 'Value',
    stock: 'Stock'
  } : {
    invoiceStatus: 'حالة الفواتير',
    topCustomers: 'أفضل العملاء',
    topProducts: 'المنتجات الأكثر مبيعاً',
    collections: 'التحصيلات والمدفوعات',
    collected: 'محصّل',
    pending: 'معلق',
    draft: 'مسودة',
    sent: 'مرسلة',
    partiallyPaid: 'مدفوعة جزئياً',
    paid: 'مدفوعة',
    cancelled: 'ملغاة',
    noData: 'لا توجد بيانات',
    export: 'تصدير',
    quantity: 'الكمية',
    revenue: 'الإيرادات',
    invoices: 'الفواتير',
    shipping: 'مصاريف الشحن',
    inventory: 'نظرة عامة على المخزون',
    value: 'القيمة',
    stock: 'المخزون'
  }

  useEffect(() => {
    loadAllData()
  }, [companyId])

  const loadAllData = async () => {
    if (!companyId) return
    setLoading(true)
    try {
      await Promise.all([
        loadInvoiceStatus(),
        loadTopCustomers(),
        loadTopProducts(),
        loadCollections(),
        loadShippingExpense(),
        loadInventoryData()
      ])
    } catch (err) {
      console.error('Error loading dashboard data:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadInvoiceStatus = async () => {
    const { data } = await supabase
      .from('invoices')
      .select('status')
      .eq('company_id', companyId)

    const counts: Record<string, number> = { draft: 0, sent: 0, partially_paid: 0, paid: 0, cancelled: 0 }
    ;(data || []).forEach((inv: any) => {
      const s = inv.status || 'draft'
      if (counts[s] !== undefined) counts[s]++
    })

    setInvoiceStatusData([
      { name: L.draft, value: counts.draft, color: COLORS.draft },
      { name: L.sent, value: counts.sent, color: COLORS.sent },
      { name: L.partiallyPaid, value: counts.partially_paid, color: COLORS.partially_paid },
      { name: L.paid, value: counts.paid, color: COLORS.paid }
    ].filter(d => d.value > 0))
  }

  const loadTopCustomers = async () => {
    const { data: invoices } = await supabase
      .from('invoices')
      .select('customer_id, total_amount, customers(name)')
      .eq('company_id', companyId)
      .in('status', ['sent', 'partially_paid', 'paid'])

    const customerMap = new Map<string, { name: string; total: number; count: number }>()
    ;(invoices || []).forEach((inv: any) => {
      const cid = inv.customer_id
      const name = inv.customers?.name || 'Unknown'
      const existing = customerMap.get(cid) || { name, total: 0, count: 0 }
      existing.total += Number(inv.total_amount || 0)
      existing.count++
      customerMap.set(cid, existing)
    })

    const sorted = Array.from(customerMap.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
      .map(c => ({ name: c.name, total: c.total, invoiceCount: c.count }))

    setTopCustomers(sorted)
  }

  const loadTopProducts = async () => {
    const { data: items } = await supabase
      .from('invoice_items')
      .select(`
        quantity, line_total, product_id,
        products!inner(name, item_type),
        invoices!inner(company_id, status)
      `)
      .eq('invoices.company_id', companyId)
      .in('invoices.status', ['sent', 'partially_paid', 'paid'])

    const productMap = new Map<string, { name: string; quantity: number; revenue: number }>()
    ;(items || []).forEach((it: any) => {
      if (it.products?.item_type === 'service') return
      const pid = it.product_id
      const name = it.products?.name || 'Unknown'
      const existing = productMap.get(pid) || { name, quantity: 0, revenue: 0 }
      existing.quantity += Number(it.quantity || 0)
      existing.revenue += Number(it.line_total || 0)
      productMap.set(pid, existing)
    })

    const sorted = Array.from(productMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)

    setTopProducts(sorted)
  }

  const loadCollections = async () => {
    const { data: invoices } = await supabase
      .from('invoices')
      .select('total_amount, paid_amount')
      .eq('company_id', companyId)
      .in('status', ['sent', 'partially_paid', 'paid'])

    let collected = 0
    let total = 0
    ;(invoices || []).forEach((inv: any) => {
      total += Number(inv.total_amount || 0)
      collected += Number(inv.paid_amount || 0)
    })

    setCollectionsData({ collected, pending: total - collected })
  }

  const loadShippingExpense = async () => {
    const { data: invoices } = await supabase
      .from('invoices')
      .select('shipping')
      .eq('company_id', companyId)
      .in('status', ['sent', 'partially_paid', 'paid'])

    const total = (invoices || []).reduce((sum: number, inv: any) =>
      sum + Number(inv.shipping || 0), 0)
    setShippingExpense(total)
  }

  const loadInventoryData = async () => {
    // جلب المنتجات مع كمياتها وأسعار التكلفة (بدون الخدمات)
    const { data: products } = await supabase
      .from('products')
      .select('id, name, quantity_on_hand, cost_price, item_type')
      .eq('company_id', companyId)
      .or('item_type.is.null,item_type.eq.product')
      .gt('quantity_on_hand', 0)
      .order('quantity_on_hand', { ascending: false })
      .limit(8)

    const data = (products || []).map((p: any) => ({
      name: p.name?.length > 15 ? p.name.substring(0, 15) + '...' : p.name,
      quantity: Number(p.quantity_on_hand || 0),
      value: Number(p.quantity_on_hand || 0) * Number(p.cost_price || 0)
    }))

    setInventoryData(data)
  }

  const formatCurrency = (value: number) => {
    return value.toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' ' + defaultCurrency
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-slate-800 p-3 rounded-lg shadow-lg border border-gray-200 dark:border-slate-700">
          <p className="font-medium text-gray-900 dark:text-white mb-1">{label || payload[0]?.name}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color || entry.payload?.color }}>
              {entry.name}: {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
            </p>
          ))}
        </div>
      )
    }
    return null
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map(i => (
          <Card key={i} className="animate-pulse bg-gray-100 dark:bg-slate-800 h-80" />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Invoice Status Pie Chart */}
      <Card className="bg-white dark:bg-slate-900 border-0 shadow-lg">
        <CardHeader className="border-b border-gray-100 dark:border-slate-800 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <CardTitle className="text-lg">{L.invoiceStatus}</CardTitle>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {invoiceStatusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={invoiceStatusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {invoiceStatusData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-400">
              <p>{L.noData}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top Customers Bar Chart */}
      <Card className="bg-white dark:bg-slate-900 border-0 shadow-lg">
        <CardHeader className="border-b border-gray-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
              <Users className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <CardTitle className="text-lg">{L.topCustomers}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {topCustomers.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={topCustomers} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => v.toLocaleString()} />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="total" fill="#10b981" radius={[0, 4, 4, 0]} name={L.revenue} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-400">
              <p>{L.noData}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top Products Bar Chart */}
      <Card className="bg-white dark:bg-slate-900 border-0 shadow-lg">
        <CardHeader className="border-b border-gray-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <Package className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <CardTitle className="text-lg">{L.topProducts}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {topProducts.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={topProducts} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => v.toLocaleString()} />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="revenue" fill="#8b5cf6" radius={[0, 4, 4, 0]} name={L.revenue} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-400">
              <p>{L.noData}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Collections & Shipping */}
      <Card className="bg-white dark:bg-slate-900 border-0 shadow-lg">
        <CardHeader className="border-b border-gray-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
              <TrendingUp className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <CardTitle className="text-lg">{L.collections}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="space-y-6">
            {/* Collections Pie */}
            {(collectionsData.collected > 0 || collectionsData.pending > 0) ? (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={[
                      { name: L.collected, value: collectionsData.collected, color: '#10b981' },
                      { name: L.pending, value: collectionsData.pending, color: '#f59e0b' }
                    ]}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    <Cell fill="#10b981" />
                    <Cell fill="#f59e0b" />
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-44 flex items-center justify-center text-gray-400">
                <p>{L.noData}</p>
              </div>
            )}
            {/* Shipping Expense */}
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-800 rounded-xl">
              <span className="text-gray-600 dark:text-gray-300">{L.shipping}</span>
              <span className="font-bold text-lg text-red-600 dark:text-red-400">
                {formatCurrency(shippingExpense)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Inventory Chart - Full Width */}
      <Card className="md:col-span-2 bg-white dark:bg-slate-900 border-0 shadow-lg">
        <CardHeader className="border-b border-gray-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-100 dark:bg-cyan-900/30 rounded-lg">
              <Package className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
            </div>
            <CardTitle className="text-lg">{L.inventory}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {inventoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={inventoryData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={60} />
                <YAxis yAxisId="left" orientation="left" tick={{ fontSize: 11 }} tickFormatter={(v) => v.toLocaleString()} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => v.toLocaleString()} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar yAxisId="left" dataKey="quantity" fill="#06b6d4" radius={[4, 4, 0, 0]} name={L.stock} />
                <Bar yAxisId="right" dataKey="value" fill="#8b5cf6" radius={[4, 4, 0, 0]} name={L.value} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-400">
              <p>{L.noData}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

