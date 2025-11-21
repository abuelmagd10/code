"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { useSupabase } from "@/lib/supabase/hooks"
import { Plus, ArrowUp, ArrowDown } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { toastActionError, toastActionSuccess } from "@/lib/notifications"
import { getActiveCompanyId } from "@/lib/company"

interface InventoryTransaction {
  id: string
  product_id: string
  transaction_type: string
  quantity_change: number
  notes: string
  created_at: string
  reference_id?: string
  products?: { name: string; sku: string }
  journal_entries?: { id: string; reference_type: string; entry_date?: string; description?: string }
}

interface Product {
  id: string
  sku: string
  name: string
  quantity_on_hand: number
}

export default function InventoryPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const appLang = typeof window !== 'undefined' ? ((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') : 'ar'
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [computedQty, setComputedQty] = useState<Record<string, number>>({})
  const [actualQty, setActualQty] = useState<Record<string, number>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [formData, setFormData] = useState({
    product_id: "",
    transaction_type: "adjustment",
    quantity_change: 0,
    notes: "",
  })
  const [movementFilter, setMovementFilter] = useState<'all'|'purchase'|'sale'>('all')
  const [movementProductId, setMovementProductId] = useState<string>('')
  const [fromDate, setFromDate] = useState<string>('')
  const [toDate, setToDate] = useState<string>('')
  const [quantityMode, setQuantityMode] = useState<'derived'|'actual'>('derived')
  const lastDiffRef = useRef<string>('')
  const lastActualSigRef = useRef<string>('')
  

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setIsLoading(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) {
        toastActionError(toast, "الوصول", "المخزون", "لا توجد شركة فعّالة. يرجى إنشاء/اختيار شركة من الإعدادات.")
        return
      }

      // Load products
      const { data: productsData } = await supabase
        .from("products")
        .select("id, sku, name, quantity_on_hand")
        .eq("company_id", companyId)

      setProducts(productsData || [])

      // Load recent transactions
      const { data: transactionsData } = await supabase
        .from("inventory_transactions")
        .select("*, products(name, sku), journal_entries(id, reference_type, entry_date, description)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(200)

      const sorted = (transactionsData || []).slice().sort((a: any, b: any) => {
        const ad = String(a?.journal_entries?.entry_date || a?.created_at || '')
        const bd = String(b?.journal_entries?.entry_date || b?.created_at || '')
        return bd.localeCompare(ad)
      })
      setTransactions(sorted)

      const aggActual: Record<string, number> = {}
      ;(sorted || []).forEach((t: any) => {
        const pid = String(t.product_id || '')
        const q = Number(t.quantity_change || 0)
        aggActual[pid] = (aggActual[pid] || 0) + q
      })
      setActualQty(aggActual)

      // Compute quantities strictly from 'sent' purchase bills and sales invoices
      const { data: sentBills } = await supabase
        .from("bills")
        .select("id")
        .eq("company_id", companyId)
        .in("status", ["sent", "partially_paid", "paid"]) 
      const billIds = (sentBills || []).map((b: any) => b.id)
      const { data: billItems } = billIds.length > 0
        ? await supabase.from("bill_items").select("product_id, quantity").in("bill_id", billIds)
        : { data: [] as any[] }

      const { data: sentInvoices } = await supabase
        .from("invoices")
        .select("id")
        .eq("company_id", companyId)
        .in("status", ["sent", "partially_paid", "paid"]) 
      const invIds = (sentInvoices || []).map((i: any) => i.id)
      const { data: invItems } = invIds.length > 0
        ? await supabase.from("invoice_items").select("product_id, quantity").in("invoice_id", invIds)
        : { data: [] as any[] }

      const agg: Record<string, number> = {}
      ;(billItems || []).forEach((it: any) => {
        const pid = String(it.product_id || '')
        const q = Number(it.quantity || 0)
        agg[pid] = (agg[pid] || 0) + q
      })
      ;(invItems || []).forEach((it: any) => {
        const pid = String(it.product_id || '')
        const q = Number(it.quantity || 0)
        agg[pid] = (agg[pid] || 0) - q
      })
      setComputedQty(agg)
    } catch (error) {
      console.error("Error loading inventory data:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) {
        toastActionError(toast, "التسجيل", "المخزون", "تعذر تحديد الشركة الفعّالة")
        return
      }

      // Create transaction
      const { error } = await supabase.from("inventory_transactions").insert([
        {
          ...formData,
          quantity_change: Number.parseInt(formData.quantity_change.toString()),
          company_id: companyId,
        },
      ])

      if (error) throw error

      setIsDialogOpen(false)
      setFormData({
        product_id: "",
        transaction_type: "adjustment",
        quantity_change: 0,
        notes: "",
      })
      loadData()
    } catch (error) {
      console.error("Error creating transaction:", error)
    }
  }
  const reconcileProductQty = async (productId: string) => {
    try {
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) {
        toastActionError(toast, appLang==='en' ? 'Reconcile' : 'مطابقة', appLang==='en' ? 'Inventory' : 'المخزون', appLang==='en' ? 'No active company' : 'لا توجد شركة فعّالة')
        return
      }
      const target = (computedQty[productId] ?? products.find((p) => p.id === productId)?.quantity_on_hand ?? 0)
      const { error } = await supabase
        .from('products')
        .update({ quantity_on_hand: target })
        .eq('id', productId)
        .eq('company_id', companyId)
      if (error) throw error
      toastActionSuccess(toast, appLang==='en' ? 'Reconcile' : 'مطابقة', appLang==='en' ? 'Inventory' : 'المخزون')
      await loadData()
    } catch (err: any) {
      const msg = err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err))
      toastActionError(toast, appLang==='en' ? 'Reconcile' : 'مطابقة', appLang==='en' ? 'Inventory' : 'المخزون', msg)
    }
  }

  useEffect(() => {
    if (quantityMode !== 'derived') return
    const diffs = products.filter((p) => typeof computedQty[p.id] === 'number' && computedQty[p.id] !== (p.quantity_on_hand || 0))
    const signature = diffs.map((d) => `${d.id}:${computedQty[d.id]}`).join('|')
    if (!signature || signature === lastDiffRef.current) return
    ;(async () => {
      try {
        const companyId = await getActiveCompanyId(supabase)
        if (!companyId) return
        for (const p of diffs) {
          const target = (computedQty[p.id] ?? (p.quantity_on_hand || 0))
          const { error } = await supabase
            .from('products')
            .update({ quantity_on_hand: target })
            .eq('id', p.id)
            .eq('company_id', companyId)
          if (error) throw error
        }
        lastDiffRef.current = signature
        toastActionSuccess(toast, appLang==='en' ? 'Auto reconcile' : 'مطابقة تلقائية', appLang==='en' ? 'Inventory' : 'المخزون')
        await loadData()
      } catch (err: any) {
        const msg = err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err))
        toastActionError(toast, appLang==='en' ? 'Auto reconcile' : 'مطابقة تلقائية', appLang==='en' ? 'Inventory' : 'المخزون', msg)
      }
    })()
  }, [computedQty, products, quantityMode])

  useEffect(() => {
    if (quantityMode !== 'actual') return
    const diffs = products.filter((p) => typeof actualQty[p.id] === 'number' && actualQty[p.id] !== (p.quantity_on_hand || 0))
    const signature = `${fromDate}|${toDate}|` + diffs.map((d) => `${d.id}:${actualQty[d.id]}`).join('|')
    if (!signature || signature === lastActualSigRef.current) return
    ;(async () => {
      try {
        const companyId = await getActiveCompanyId(supabase)
        if (!companyId) return
        for (const p of diffs) {
          const target = (actualQty[p.id] ?? (p.quantity_on_hand || 0))
          const { error } = await supabase
            .from('products')
            .update({ quantity_on_hand: target })
            .eq('id', p.id)
            .eq('company_id', companyId)
          if (error) throw error
        }
        lastActualSigRef.current = signature
        toastActionSuccess(toast, appLang==='en' ? 'Auto reconcile' : 'مطابقة تلقائية', appLang==='en' ? 'Inventory' : 'المخزون')
        await loadData()
      } catch (err: any) {
        const msg = err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err))
        toastActionError(toast, appLang==='en' ? 'Auto reconcile' : 'مطابقة تلقائية', appLang==='en' ? 'Inventory' : 'المخزون', msg)
      }
    })()
  }, [actualQty, products, quantityMode, fromDate, toDate])

  

  

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />

      <main className="flex-1 md:mr-64 p-4 md:p-8">
        <div className="space-y-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{appLang==='en' ? 'Inventory' : 'المخزون'}</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">{appLang==='en' ? 'Track inventory movements' : 'تتبع حركات المخزون'}</p>
            </div>
            <div className="flex items-center gap-2">
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  {appLang==='en' ? 'New Inventory Movement' : 'حركة مخزون جديدة'}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>{appLang==='en' ? 'Record Inventory Movement' : 'تسجيل حركة مخزون'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="product_id">{appLang==='en' ? 'Product' : 'المنتج'}</Label>
                    <select
                      id="product_id"
                      value={formData.product_id}
                      onChange={(e) => setFormData({ ...formData, product_id: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                      required
                    >
                      <option value="">{appLang==='en' ? 'Select a product' : 'اختر منتج'}</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name} ({product.sku})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="transaction_type">{appLang==='en' ? 'Movement Type' : 'نوع الحركة'}</Label>
                    <select
                      id="transaction_type"
                      value={formData.transaction_type}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          transaction_type: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 border rounded-lg"
                    >
                      <option value="adjustment">{appLang==='en' ? 'Adjustment' : 'تعديل'}</option>
                      <option value="purchase">{appLang==='en' ? 'Purchase' : 'شراء'}</option>
                      <option value="sale">{appLang==='en' ? 'Sale' : 'بيع'}</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quantity_change">{appLang==='en' ? 'Quantity' : 'الكمية'}</Label>
                    <Input
                      id="quantity_change"
                      type="number"
                      value={formData.quantity_change}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          quantity_change: Number.parseInt(e.target.value),
                        })
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes">{appLang==='en' ? 'Notes' : 'ملاحظات'}</Label>
                    <Input
                      id="notes"
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    />
                  </div>
                  <Button type="submit" className="w-full">
                    {appLang==='en' ? 'Save Movement' : 'تسجيل الحركة'}
                  </Button>
                </form>
              </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">{appLang==='en' ? 'Total Products' : 'إجمالي المنتجات'}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{products.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">{appLang==='en' ? 'Total Quantity' : 'إجمالي الكمية'}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{products.reduce((sum, p) => {
                  const derived = (computedQty[p.id] ?? p.quantity_on_hand ?? 0)
                  const actual = (actualQty[p.id] ?? 0)
                  return sum + (quantityMode === 'actual' ? actual : derived)
                }, 0)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">{appLang==='en' ? 'Last Update' : 'آخر تحديث'}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {transactions.length > 0 ? new Date(transactions[0].created_at).toLocaleDateString(appLang==='en'?'en':'ar') : "-"}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{appLang==='en' ? 'Inventory Status' : 'حالة المخزون'}</CardTitle>
              <div className="mt-2">
                <select
                  value={quantityMode}
                  onChange={(e) => setQuantityMode(e.target.value === 'actual' ? 'actual' : 'derived')}
                  className="px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="derived">{appLang==='en' ? 'Derived (Invoices/Bills)' : 'مشتقة (فواتير)'}</option>
                  <option value="actual">{appLang==='en' ? 'Actual (Transactions As-of)' : 'فعلي (حركات حتى تاريخ)'}</option>
                </select>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-center py-8 text-gray-500">{appLang==='en' ? 'Loading...' : 'جاري التحميل...'}</p>
              ) : products.length === 0 ? (
                <p className="text-center py-8 text-gray-500">{appLang==='en' ? 'No products yet' : 'لا توجد منتجات حتى الآن'}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-gray-50 dark:bg-slate-900">
                      <tr>
                        <th className="px-4 py-3 text-right">{appLang==='en' ? 'Code' : 'الرمز'}</th>
                        <th className="px-4 py-3 text-right">{appLang==='en' ? 'Name' : 'الاسم'}</th>
                        <th className="px-4 py-3 text-right">{appLang==='en' ? 'Qty on Hand' : 'الكمية المتاحة'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((product) => (
                        <tr key={product.id} className="border-b hover:bg-gray-50 dark:hover:bg-slate-900">
                          <td className="px-4 py-3 font-medium">{product.sku}</td>
                          <td className="px-4 py-3">{product.name}</td>
                          <td className="px-4 py-3">
                            {(() => {
                              const q = computedQty[product.id]
                              const shown = quantityMode==='actual' ? (actualQty[product.id] ?? 0) : (q ?? product.quantity_on_hand ?? 0)
                              const mismatch = typeof q === 'number' && q !== product.quantity_on_hand
                              return (
                            <span
                              className={`px-2 py-1 rounded ${
                                shown < 0
                                  ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                                  : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                              }`}
                            >
                              {shown}
                            </span>
                              )
                            })()}
                            {typeof computedQty[product.id] === 'number' && computedQty[product.id] !== product.quantity_on_hand ? (
                              <span className="ml-2 text-xs text-orange-600">{appLang==='en' ? 'diff:' : 'فرق:'} {(computedQty[product.id] - (product.quantity_on_hand || 0))}</span>
                            ) : null}
                            {quantityMode==='derived' && typeof computedQty[product.id] === 'number' && computedQty[product.id] !== product.quantity_on_hand ? (
                              <Button variant="outline" size="sm" className="ml-2 text-xs" onClick={() => reconcileProductQty(product.id)}>
                                {appLang==='en' ? 'Reconcile' : 'مطابقة'}
                              </Button>
                            ) : null}
                            {/* مطابقة تلقائية مفعّلة؛ لا تعرض أزرار مطابقة */}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{appLang==='en' ? 'Recent Inventory Movements' : 'حركات المخزون الأخيرة'}</CardTitle>
              <div className="mt-2 flex gap-2">
                <select
                  value={movementFilter}
                  onChange={(e) => setMovementFilter(e.target.value === 'purchase' ? 'purchase' : (e.target.value === 'sale' ? 'sale' : 'all'))}
                  className="px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="all">{appLang==='en' ? 'All' : 'الكل'}</option>
                  <option value="purchase">{appLang==='en' ? 'Purchases' : 'المشتريات'}</option>
                  <option value="sale">{appLang==='en' ? 'Sales' : 'المبيعات'}</option>
                </select>
                <select
                  value={movementProductId}
                  onChange={(e) => setMovementProductId(e.target.value)}
                  className="px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="">{appLang==='en' ? 'All products' : 'كل المنتجات'}</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                  ))}
                </select>
                <Input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="text-sm"
                />
                <Input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="text-sm"
                />
                <span className="px-2 py-1 rounded bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-200 text-sm">
                  {appLang==='en' ? 'Total Qty:' : 'إجمالي الكمية:'} {(() => {
                    const sum = transactions.reduce((acc, t) => {
                      const typeOk = movementFilter === 'all'
                        ? true
                        : movementFilter === 'purchase'
                          ? String(t.transaction_type || '').startsWith('purchase')
                          : String(t.transaction_type || '').startsWith('sale')
                      if (!typeOk) return acc
                      if (movementProductId && String(t.product_id || '') !== movementProductId) return acc
                      const dStr = String((t as any)?.journal_entries?.entry_date || t.created_at || '').slice(0,10)
                      if (fromDate && dStr < fromDate) return acc
                      if (toDate && dStr > toDate) return acc
                      return acc + Number(t.quantity_change || 0)
                    }, 0)
                    return sum
                  })()}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-center py-8 text-gray-500">{appLang==='en' ? 'Loading...' : 'جاري التحميل...'}</p>
              ) : (() => {
                const filtered = transactions.filter((t) => {
                  const typeOk = movementFilter === 'all'
                    ? true
                    : movementFilter === 'purchase'
                      ? String(t.transaction_type || '').startsWith('purchase')
                      : String(t.transaction_type || '').startsWith('sale')
                  if (!typeOk) return false
                  if (!movementProductId) return true
                  const pidOk = String(t.product_id || '') === movementProductId
                  if (!pidOk) return false
                  const dStr = String((t as any)?.journal_entries?.entry_date || t.created_at || '').slice(0,10)
                  if (fromDate && dStr < fromDate) return false
                  if (toDate && dStr > toDate) return false
                  return true
                })
                if (filtered.length === 0) {
                  return <p className="text-center py-8 text-gray-500">{appLang==='en' ? 'No movements for selected filter' : 'لا توجد حركات لهذا الفلتر'}</p>
                }
                return (
                <div className="space-y-4">
                  {filtered.slice(0, 20).map((transaction) => (
                    <div
                      key={transaction.id}
                      className="flex items-start justify-between p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-slate-900"
                    >
                      <div className="flex items-start gap-4">
                        <div
                          className={`p-2 rounded-lg ${
                            transaction.quantity_change > 0
                              ? "bg-green-100 dark:bg-green-900"
                              : "bg-red-100 dark:bg-red-900"
                          }`}
                        >
                          {transaction.quantity_change > 0 ? (
                            <ArrowUp
                              className={`w-5 h-5 ${
                                transaction.quantity_change > 0 ? "text-green-600" : "text-red-600"
                              }`}
                            />
                          ) : (
                            <ArrowDown className="w-5 h-5 text-red-600" />
                          )}
                        </div>
                      <div>
                          <p className="font-medium">{transaction.products?.name}</p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {transaction.products?.sku} • {(() => {
                              const t = String(transaction.transaction_type || '')
                              if (appLang==='en') {
                                if (t==='sale') return 'sale'
                                if (t==='sale_reversal') return 'sale_reversal'
                                if (t==='purchase') return 'purchase'
                                if (t==='purchase_reversal') return 'purchase_reversal'
                                if (t==='adjustment') return 'adjustment'
                              }
                              return t
                            })()}
                          </p>
                          {transaction.reference_id ? (
                            <p className="text-xs mt-1">
                              {(appLang==='en') ? 'Linked doc:' : 'الوثيقة المرتبطة:'} {(() => {
                                const t = String(transaction.transaction_type || '')
                                const rid = String(transaction.reference_id || '')
                                if (t.startsWith('purchase')) {
                                  return <a href={`/bills/${rid}`} className="text-blue-600 hover:underline">{appLang==='en' ? 'Supplier Bill' : 'فاتورة شراء'}</a>
                                }
                                if (t.startsWith('sale')) {
                                  return <a href={`/invoices/${rid}`} className="text-blue-600 hover:underline">{appLang==='en' ? 'Sales Invoice' : 'فاتورة مبيعات'}</a>
                                }
                                return null
                              })()}
                            </p>
                          ) : null}
                          {transaction.notes && <p className="text-sm text-gray-500 mt-1">{transaction.notes}</p>}
                          {transaction.journal_entries?.id && (
                            <p className="text-xs mt-1">
                              {appLang==='en' ? 'Linked journal:' : 'مرتبط بالقيد:'} <a href={`/journal-entries?entry=${transaction.journal_entries.id}`} className="text-blue-600 hover:underline">{transaction.journal_entries.reference_type}</a>
                            </p>
                          )}
                          {(transaction.journal_entries?.entry_date || transaction.journal_entries?.description) ? (
                            <p className="text-xs text-gray-500 mt-1">
                              {transaction.journal_entries?.entry_date ? new Date(transaction.journal_entries.entry_date).toLocaleDateString(appLang==='en'?'en':'ar') : ''}
                              {transaction.journal_entries?.entry_date && transaction.journal_entries?.description ? ' • ' : ''}
                              {transaction.journal_entries?.description || ''}
                            </p>
                          ) : null}
                      </div>
                      </div>
                      <div className="text-right">
                        <p
                          className={`font-bold ${transaction.quantity_change > 0 ? "text-green-600" : "text-red-600"}`}
                        >
                          {transaction.quantity_change > 0 ? "+" : ""}
                          {transaction.quantity_change}
                        </p>
                        <p className="text-xs text-gray-500">
                          {new Date(transaction.created_at).toLocaleDateString(appLang==='en'?'en':'ar')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                )
              })()}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
