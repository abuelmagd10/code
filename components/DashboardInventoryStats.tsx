"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Package, AlertTriangle, Receipt, Percent, PieChart, Send } from "lucide-react"
import { useSupabase } from "@/lib/supabase/hooks"
import { currencySymbols } from "./DashboardAmounts"
import { useUserContext } from "@/hooks/use-user-context"

interface InventoryStatsProps {
  companyId: string
  defaultCurrency: string
  appLang: string
  fromDate?: string
  toDate?: string
}

interface Product {
  id: string
  cost_price?: number
  reorder_level?: number
  item_type?: string
}

export default function DashboardInventoryStats({
  companyId,
  defaultCurrency,
  appLang,
  fromDate,
  toDate
}: InventoryStatsProps) {
  const supabase = useSupabase()
  const { userContext } = useUserContext()
  const [appCurrency, setAppCurrency] = useState(defaultCurrency)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    inventoryValue: 0,
    lowStockCount: 0,
    totalTaxCollected: 0,
    totalPaymentsReceived: 0,
    collectionRate: 0,
    totalPaymentsSent: 0
  })

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
    loadStats()
  }, [companyId, fromDate, toDate])

  const loadStats = async () => {
    if (!companyId) return
    setLoading(true)
    try {
      if (!userContext || userContext.company_id !== companyId) return
      const branchId = String(userContext.branch_id || "")
      const warehouseId = String(userContext.warehouse_id || "")
      const costCenterId = String(userContext.cost_center_id || "")
      if (!branchId || !warehouseId || !costCenterId) return

      // ✅ ERP Professional: حساب قيمة المخزون من FIFO Lots (المصدر الوحيد للحقيقة)
      // 📌 يمنع استخدام products.cost_price في التقارير الرسمية
      // 📌 FIFO Engine هو الجهة الوحيدة المخولة بتحديد unit_cost
      
      // 1. حساب الكميات من inventory_transactions
      let transactionsQuery = supabase
        .from('inventory_transactions')
        .select('product_id, quantity_change')
        .eq('company_id', companyId)
        .eq('branch_id', branchId)
        .eq('warehouse_id', warehouseId)
        .eq('cost_center_id', costCenterId)
        .or('is_deleted.is.null,is_deleted.eq.false')

      const { data: transactions } = await transactionsQuery

      const qtyByProduct: Record<string, number> = {}
      
      for (const t of (transactions || [])) {
        const pid = String(t.product_id)
        qtyByProduct[pid] = (qtyByProduct[pid] || 0) + Number(t.quantity_change || 0)
      }

      // 2. ✅ حساب قيمة المخزون من FIFO Lots (بقايا المخزون الحالية)
      // جلب جميع FIFO lots للمنتجات الموجودة في inventory_transactions
      const productIds = Object.keys(qtyByProduct)
      let inventoryValue = 0
      let lowStockCount = 0

      // جلب بيانات reorder_level للمنتجات
      const { data: products } = await supabase
        .from('products')
        .select('id, reorder_level, item_type')
        .eq('company_id', companyId)
        .in('id', productIds)
        .or('item_type.is.null,item_type.eq.product')

      const productMap = new Map((products || []).map((p: any) => [p.id, { reorder_level: p.reorder_level }]))

      // حساب قيمة المخزون من FIFO Lots لكل منتج
      for (const [pid, qty] of Object.entries(qtyByProduct)) {
        const actualQty = Math.max(0, qty)
        
        // ✅ حساب FIFO value للمنتج
        const { data: productFifoLots } = await supabase
          .from('fifo_cost_lots')
          .select('remaining_quantity, unit_cost')
          .eq('company_id', companyId)
          .eq('product_id', pid)
          .gt('remaining_quantity', 0)

        let productFifoValue = 0
        let productFifoQty = 0
        
        for (const lot of (productFifoLots || [])) {
          const lotQty = Number(lot.remaining_quantity || 0)
          const lotCost = Number(lot.unit_cost || 0)
          productFifoQty += lotQty
          productFifoValue += lotQty * lotCost
        }

        // ✅ حساب قيمة المخزون بناءً على FIFO weighted average
        if (productFifoQty > 0 && actualQty > 0) {
          const avgFifoCost = productFifoValue / productFifoQty
          // استخدام الحد الأدنى بين الكمية الفعلية وكمية FIFO المتاحة
          const qtyToValue = Math.min(actualQty, productFifoQty)
          inventoryValue += qtyToValue * avgFifoCost
        }
        // إذا لم توجد FIFO lots، لا نضيف قيمة (ممنوع استخدام cost_price)

        // حساب low stock count
        const product = productMap.get(pid) as { reorder_level?: number } | undefined
        if (product && qty < (product.reorder_level || 5)) {
          lowStockCount++
        }
      }

      // 2. حساب إجمالي الضرائب المحصلة من الفواتير المدفوعة
      let invoicesQuery = supabase
        .from('invoices')
        .select('tax_amount, paid_amount, total_amount, status, invoice_date')
        .eq('company_id', companyId)
        .in('status', ['sent', 'partially_paid', 'paid'])

      if (fromDate) invoicesQuery = invoicesQuery.gte('invoice_date', fromDate)
      if (toDate) invoicesQuery = invoicesQuery.lte('invoice_date', toDate)

      const { data: invoices } = await invoicesQuery

      const totalTaxCollected = (invoices || []).reduce((sum: number, inv: any) => {
        return sum + Number(inv.tax_amount || 0)
      }, 0)

      // 3. حساب إجمالي المدفوعات المستلمة ونسبة التحصيل
      const totalPaymentsReceived = (invoices || []).reduce((sum: number, inv: any) => {
        return sum + Number(inv.paid_amount || 0)
      }, 0)

      const totalInvoicesAmount = (invoices || []).reduce((sum: number, inv: any) => {
        return sum + Number(inv.total_amount || 0)
      }, 0)

      const collectionRate = totalInvoicesAmount > 0
        ? (totalPaymentsReceived / totalInvoicesAmount) * 100
        : 0

      // 4. حساب المدفوعات المرسلة للموردين
      let billsQuery = supabase
        .from('bills')
        .select('paid_amount, bill_date')
        .eq('company_id', companyId)
        .in('status', ['sent', 'partially_paid', 'paid'])

      if (fromDate) billsQuery = billsQuery.gte('bill_date', fromDate)
      if (toDate) billsQuery = billsQuery.lte('bill_date', toDate)

      const { data: bills } = await billsQuery

      const totalPaymentsSent = (bills || []).reduce((sum: number, bill: any) => {
        return sum + Number(bill.paid_amount || 0)
      }, 0)

      setStats({
        inventoryValue,
        lowStockCount,
        totalTaxCollected,
        totalPaymentsReceived,
        collectionRate,
        totalPaymentsSent
      })
    } catch (error) {
      console.error('Error loading inventory stats:', error)
    } finally {
      setLoading(false)
    }
  }

  const currency = currencySymbols[appCurrency] || appCurrency
  const formatNumber = (n: number) => n.toLocaleString('en-US')

  const L = appLang === 'en' ? {
    inventoryValue: 'Inventory Value',
    lowStock: 'Low Stock Items',
    taxCollected: 'Tax Collected',
    paymentsReceived: 'Payments Received',
    collectionRate: 'Collection Rate',
    paymentsSent: 'Payments Sent',
    items: 'items'
  } : {
    inventoryValue: 'قيمة المخزون',
    lowStock: 'منتجات منخفضة',
    taxCollected: 'الضرائب المحصلة',
    paymentsReceived: 'المدفوعات المستلمة',
    collectionRate: 'نسبة التحصيل',
    paymentsSent: 'المدفوعات المرسلة',
    items: 'منتج'
  }

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {[1,2,3,4,5,6].map(i => (
          <Card key={i} className="bg-white dark:bg-slate-900 border-0 shadow-sm animate-pulse">
            <CardContent className="p-5 h-24" />
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      {/* قيمة المخزون */}
      <Card className="bg-gradient-to-br from-cyan-50 to-teal-50 dark:from-cyan-950/50 dark:to-teal-950/50 border border-cyan-100 dark:border-cyan-900 shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-cyan-100 dark:bg-cyan-900/50 rounded-lg">
              <Package className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
            </div>
            <span className="text-sm font-medium text-cyan-700 dark:text-cyan-300">{L.inventoryValue}</span>
          </div>
          <p className="text-2xl font-bold text-cyan-700 dark:text-cyan-300">{formatNumber(stats.inventoryValue)}</p>
          <p className="text-xs text-cyan-600/70 dark:text-cyan-400/70 mt-1">{currency}</p>
        </CardContent>
      </Card>

      {/* منتجات منخفضة المخزون */}
      <Card className="bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/50 dark:to-amber-950/50 border border-orange-100 dark:border-orange-900 shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-orange-100 dark:bg-orange-900/50 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            </div>
            <span className="text-sm font-medium text-orange-700 dark:text-orange-300">{L.lowStock}</span>
          </div>
          <p className="text-2xl font-bold text-orange-700 dark:text-orange-300">{stats.lowStockCount}</p>
          <p className="text-xs text-orange-600/70 dark:text-orange-400/70 mt-1">{L.items}</p>
        </CardContent>
      </Card>

      {/* الضرائب المحصلة */}
      <Card className="bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/50 dark:to-purple-950/50 border border-violet-100 dark:border-violet-900 shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-violet-100 dark:bg-violet-900/50 rounded-lg">
              <Percent className="w-5 h-5 text-violet-600 dark:text-violet-400" />
            </div>
            <span className="text-sm font-medium text-violet-700 dark:text-violet-300">{L.taxCollected}</span>
          </div>
          <p className="text-2xl font-bold text-violet-700 dark:text-violet-300">{formatNumber(stats.totalTaxCollected)}</p>
          <p className="text-xs text-violet-600/70 dark:text-violet-400/70 mt-1">{currency}</p>
        </CardContent>
      </Card>

      {/* المدفوعات المستلمة */}
      <Card className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/50 dark:to-emerald-950/50 border border-green-100 dark:border-green-900 shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/50 rounded-lg">
              <Receipt className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <span className="text-sm font-medium text-green-700 dark:text-green-300">{L.paymentsReceived}</span>
          </div>
          <p className="text-2xl font-bold text-green-700 dark:text-green-300">{formatNumber(stats.totalPaymentsReceived)}</p>
          <p className="text-xs text-green-600/70 dark:text-green-400/70 mt-1">{currency}</p>
        </CardContent>
      </Card>

      {/* نسبة التحصيل */}
      <Card className="bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/50 dark:to-blue-950/50 border border-indigo-100 dark:border-indigo-900 shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg">
              <PieChart className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">{L.collectionRate}</span>
          </div>
          <p className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">{stats.collectionRate.toFixed(1)}%</p>
          <div className="w-full bg-indigo-200 dark:bg-indigo-800 rounded-full h-1.5 mt-2">
            <div className="bg-indigo-600 dark:bg-indigo-400 h-1.5 rounded-full" style={{ width: `${Math.min(stats.collectionRate, 100)}%` }} />
          </div>
        </CardContent>
      </Card>

      {/* المدفوعات المرسلة */}
      <Card className="bg-gradient-to-br from-rose-50 to-pink-50 dark:from-rose-950/50 dark:to-pink-950/50 border border-rose-100 dark:border-rose-900 shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-rose-100 dark:bg-rose-900/50 rounded-lg">
              <Send className="w-5 h-5 text-rose-600 dark:text-rose-400" />
            </div>
            <span className="text-sm font-medium text-rose-700 dark:text-rose-300">{L.paymentsSent}</span>
          </div>
          <p className="text-2xl font-bold text-rose-700 dark:text-rose-300">{formatNumber(stats.totalPaymentsSent)}</p>
          <p className="text-xs text-rose-600/70 dark:text-rose-400/70 mt-1">{currency}</p>
        </CardContent>
      </Card>
    </div>
  )
}

