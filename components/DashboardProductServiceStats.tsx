"use client"

import { useEffect, useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Package, Wrench, TrendingUp, BarChart3 } from "lucide-react"
import { useSupabase } from "@/lib/supabase/hooks"
import { currencySymbols } from "./DashboardAmounts"

interface ProductServiceStatsProps {
  companyId: string
  defaultCurrency: string
  appLang: string
  fromDate?: string
  toDate?: string
}

interface SalesData {
  productSales: number
  serviceSales: number
  productCount: number
  serviceCount: number
  topProducts: { name: string; total: number }[]
  topServices: { name: string; total: number }[]
}

export default function DashboardProductServiceStats({
  companyId,
  defaultCurrency,
  appLang,
  fromDate,
  toDate
}: ProductServiceStatsProps) {
  const supabase = useSupabase()
  const [appCurrency, setAppCurrency] = useState(defaultCurrency)
  const [salesData, setSalesData] = useState<SalesData>({
    productSales: 0,
    serviceSales: 0,
    productCount: 0,
    serviceCount: 0,
    topProducts: [],
    topServices: []
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const storedCurrency = localStorage.getItem('app_currency')
    if (storedCurrency) setAppCurrency(storedCurrency)
    
    const handleCurrencyChange = () => {
      const newCurrency = localStorage.getItem('app_currency')
      if (newCurrency) setAppCurrency(newCurrency)
    }
    
    window.addEventListener('app_currency_changed', handleCurrencyChange)
    return () => window.removeEventListener('app_currency_changed', handleCurrencyChange)
  }, [])

  useEffect(() => {
    loadSalesData()
  }, [companyId, fromDate, toDate])

  const loadSalesData = async () => {
    if (!companyId) return
    setLoading(true)
    try {
      // Get invoice items with product info (left join to include items without products)
      let query = supabase
        .from('invoice_items')
        .select(`
          line_total,
          quantity,
          product_id,
          description,
          products(id, name, item_type),
          invoices!inner(company_id, status, invoice_date)
        `)
        .eq('invoices.company_id', companyId)
        .in('invoices.status', ['sent', 'partially_paid', 'paid'])

      // Apply date filters if provided
      if (fromDate) {
        query = query.gte('invoices.invoice_date', fromDate)
      }
      if (toDate) {
        query = query.lte('invoices.invoice_date', toDate)
      }

      const { data: invoiceItems } = await query

      const productTotals = new Map<string, { name: string; total: number }>()
      const serviceTotals = new Map<string, { name: string; total: number }>()
      let productSales = 0
      let serviceSales = 0
      let productCount = 0
      let serviceCount = 0

      for (const item of invoiceItems || []) {
        const product = (item as any).products
        const lineTotal = Number((item as any).line_total || 0)
        // إذا لم يكن هناك منتج مرتبط، نعتبره منتج (بند يدوي)
        const itemType = product?.item_type || 'product'
        const productName = product?.name || (item as any).description || 'بند يدوي'
        const productId = product?.id || (item as any).product_id || `manual-${(item as any).description || 'item'}`

        if (itemType === 'service') {
          serviceSales += lineTotal
          serviceCount += Number((item as any).quantity || 0)
          const existing = serviceTotals.get(productId) || { name: productName, total: 0 }
          serviceTotals.set(productId, { name: productName, total: existing.total + lineTotal })
        } else {
          productSales += lineTotal
          productCount += Number((item as any).quantity || 0)
          const existing = productTotals.get(productId) || { name: productName, total: 0 }
          productTotals.set(productId, { name: productName, total: existing.total + lineTotal })
        }
      }

      // Sort and get top 5
      const topProducts = Array.from(productTotals.values())
        .sort((a, b) => b.total - a.total)
        .slice(0, 5)
      const topServices = Array.from(serviceTotals.values())
        .sort((a, b) => b.total - a.total)
        .slice(0, 5)

      setSalesData({
        productSales,
        serviceSales,
        productCount,
        serviceCount,
        topProducts,
        topServices
      })
    } catch (error) {
      console.error('Error loading sales data:', error)
    } finally {
      setLoading(false)
    }
  }

  const currency = currencySymbols[appCurrency] || appCurrency
  const formatNumber = (n: number) => n.toLocaleString('en-US')
  const totalSales = salesData.productSales + salesData.serviceSales
  const productPercentage = totalSales > 0 ? (salesData.productSales / totalSales) * 100 : 0
  const servicePercentage = totalSales > 0 ? (salesData.serviceSales / totalSales) * 100 : 0

  const L = appLang === 'en' ? {
    title: 'Products vs Services',
    productSales: 'Product Sales',
    serviceSales: 'Service Sales',
    topProducts: 'Top Products',
    topServices: 'Top Services',
    units: 'units',
    noData: 'No sales data yet'
  } : {
    title: 'المنتجات مقابل الخدمات',
    productSales: 'مبيعات المنتجات',
    serviceSales: 'مبيعات الخدمات',
    topProducts: 'أفضل المنتجات',
    topServices: 'أفضل الخدمات',
    units: 'وحدة',
    noData: 'لا توجد بيانات مبيعات حتى الآن'
  }

  if (loading) {
    return (
      <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm animate-pulse">
        <CardContent className="p-6 h-48" />
      </Card>
    )
  }

  return (
    <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-purple-600" />
          <CardTitle className="text-base">{L.title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Sales Comparison */}
        <div className="grid grid-cols-2 gap-4">
          {/* Product Sales */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/50 dark:to-indigo-950/50 border border-blue-100 dark:border-blue-900">
            <div className="flex items-center gap-2 mb-2">
              <Package className="w-4 h-4 text-blue-600" />
              <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">{L.productSales}</span>
            </div>
            <p className="text-xl font-bold text-blue-900 dark:text-blue-100">{formatNumber(salesData.productSales)}</p>
            <p className="text-xs text-blue-500">{currency} · {productPercentage.toFixed(1)}%</p>
          </div>
          {/* Service Sales */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/50 dark:to-pink-950/50 border border-purple-100 dark:border-purple-900">
            <div className="flex items-center gap-2 mb-2">
              <Wrench className="w-4 h-4 text-purple-600" />
              <span className="text-xs text-purple-600 dark:text-purple-400 font-medium">{L.serviceSales}</span>
            </div>
            <p className="text-xl font-bold text-purple-900 dark:text-purple-100">{formatNumber(salesData.serviceSales)}</p>
            <p className="text-xs text-purple-500">{currency} · {servicePercentage.toFixed(1)}%</p>
          </div>
        </div>

        {/* Progress Bar */}
        {totalSales > 0 && (
          <div className="h-3 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
            <div className="bg-blue-500 h-full" style={{ width: `${productPercentage}%` }} />
            <div className="bg-purple-500 h-full" style={{ width: `${servicePercentage}%` }} />
          </div>
        )}

        {/* Top Items */}
        <div className="grid grid-cols-2 gap-4 pt-2">
          {/* Top Products */}
          <div>
            <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">{L.topProducts}</h4>
            {salesData.topProducts.length > 0 ? (
              <ul className="space-y-1">
                {salesData.topProducts.slice(0, 3).map((p, i) => (
                  <li key={i} className="text-xs flex justify-between">
                    <span className="truncate text-gray-700 dark:text-gray-300">📦 {p.name}</span>
                    <span className="text-gray-500 dark:text-gray-400">{formatNumber(p.total)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-gray-400 dark:text-gray-500">{L.noData}</p>
            )}
          </div>
          {/* Top Services */}
          <div>
            <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">{L.topServices}</h4>
            {salesData.topServices.length > 0 ? (
              <ul className="space-y-1">
                {salesData.topServices.slice(0, 3).map((s, i) => (
                  <li key={i} className="text-xs flex justify-between">
                    <span className="truncate text-gray-700 dark:text-gray-300">🔧 {s.name}</span>
                    <span className="text-gray-500 dark:text-gray-400">{formatNumber(s.total)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-gray-400 dark:text-gray-500">{L.noData}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

