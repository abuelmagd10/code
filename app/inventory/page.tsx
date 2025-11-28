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
import { Plus, ArrowUp, ArrowDown, RefreshCcw, CheckCircle2, AlertCircle, FileText, Package, TrendingUp, TrendingDown, Calendar, Filter, Search, BarChart3, Box, ShoppingCart, Truck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import Link from "next/link"
import { canAction } from "@/lib/authz"
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
  const [purchaseTotals, setPurchaseTotals] = useState<Record<string, number>>({})
  const [soldTotals, setSoldTotals] = useState<Record<string, number>>({})
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
  const [permInventoryWrite, setPermInventoryWrite] = useState<boolean>(true)
  useEffect(() => { (async () => { setPermInventoryWrite(await canAction(supabase, "inventory", "write")) })() }, [supabase])
  const [isReconciling, setIsReconciling] = useState(false)
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false)
  const [reviewResult, setReviewResult] = useState<{
    inserted: number
    updated: number
    deleted: number
    total: number
    details: { type: 'insert' | 'update' | 'delete'; product: string; qty: number; note: string }[]
  } | null>(null)
  

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

      const txs = (transactionsData || [])
      const saleIds = Array.from(new Set(txs.filter((t: any) => String(t.transaction_type || '').startsWith('sale') && t.reference_id).map((t: any) => String(t.reference_id))))
      const purchaseIds = Array.from(new Set(txs.filter((t: any) => String(t.transaction_type || '').startsWith('purchase') && t.reference_id).map((t: any) => String(t.reference_id))))
      const { data: invsById } = saleIds.length > 0 ? await supabase.from('invoices').select('id,status').in('id', saleIds) : { data: [] as any[] }
      const { data: billsById } = purchaseIds.length > 0 ? await supabase.from('bills').select('id,status').in('id', purchaseIds) : { data: [] as any[] }
      const validInvIds = new Set((invsById || []).map((i: any) => String(i.id)))
      const validBillIds = new Set((billsById || []).map((i: any) => String(i.id)))
      const filteredTxs = txs.filter((t: any) => {
        const type = String(t.transaction_type || '')
        const hasJournal = Boolean((t as any)?.journal_entries?.id)
        const rid = String(t.reference_id || '')
        if (type.startsWith('sale')) {
          return hasJournal || (rid && validInvIds.has(rid))
        }
        if (type.startsWith('purchase')) {
          return hasJournal || (rid && validBillIds.has(rid))
        }
        return true
      })

      const sorted = filteredTxs.slice().sort((a: any, b: any) => {
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
      const purchasesAgg: Record<string, number> = {}
      const soldAgg: Record<string, number> = {}
      ;(billItems || []).forEach((it: any) => {
        const pid = String(it.product_id || '')
        const q = Number(it.quantity || 0)
        purchasesAgg[pid] = (purchasesAgg[pid] || 0) + q
        agg[pid] = (agg[pid] || 0) + q
      })
      ;(invItems || []).forEach((it: any) => {
        const pid = String(it.product_id || '')
        const q = Number(it.quantity || 0)
        soldAgg[pid] = (soldAgg[pid] || 0) + q
        agg[pid] = (agg[pid] || 0) - q
      })
      setComputedQty(agg)
      setPurchaseTotals(purchasesAgg)
      setSoldTotals(soldAgg)
    } catch (error) {
      console.error("Error loading inventory data:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const reconcileRecentMovements = async () => {
    try {
      setIsReconciling(true)
      setReviewResult(null)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      // جلب أسماء المنتجات للعرض
      const productNames: Record<string, string> = {}
      products.forEach(p => { productNames[p.id] = p.name })

      const { data: entries } = await supabase
        .from('journal_entries')
        .select('id, reference_type, reference_id')
        .eq('company_id', companyId)
        .in('reference_type', ['invoice_cogs','invoice_cogs_reversal','invoice_inventory_reversal','bill'])

      const invIds = Array.from(new Set((entries || []).filter((e: any) => e.reference_type !== 'bill' && e.reference_id).map((e: any) => String(e.reference_id))))
      const billIds = Array.from(new Set((entries || []).filter((e: any) => e.reference_type === 'bill' && e.reference_id).map((e: any) => String(e.reference_id))))
      const { data: invItemsAll } = invIds.length > 0 ? await supabase.from('invoice_items').select('invoice_id, product_id, quantity').in('invoice_id', invIds) : { data: [] as any[] }
      const { data: billItemsAll } = billIds.length > 0 ? await supabase.from('bill_items').select('bill_id, product_id, quantity').in('bill_id', billIds) : { data: [] as any[] }

      const invMap: Record<string, any[]> = {}
      ;(invItemsAll || []).forEach((it: any) => {
        const k = String(it.invoice_id || '')
        if (!invMap[k]) invMap[k] = []
        invMap[k].push(it)
      })
      const billMap: Record<string, any[]> = {}
      ;(billItemsAll || []).forEach((it: any) => {
        const k = String(it.bill_id || '')
        if (!billMap[k]) billMap[k] = []
        billMap[k].push(it)
      })

      const expected: any[] = []
      for (const e of (entries || [])) {
        const rt = String((e as any).reference_type || '')
        const rid = String((e as any).reference_id || '')
        if (!rid) continue
        if (rt === 'bill') {
          const items = billMap[rid] || []
          for (const it of items) {
            if (!it.product_id) continue
            expected.push({ company_id: companyId, product_id: it.product_id, transaction_type: 'purchase', quantity_change: Number(it.quantity || 0), reference_id: rid, journal_entry_id: (e as any).id, notes: 'فاتورة شراء' })
          }
        } else {
          const items = invMap[rid] || []
          for (const it of items) {
            if (!it.product_id) continue
            const isRev = rt === 'invoice_cogs_reversal' || rt === 'invoice_inventory_reversal'
            const qty = Number(it.quantity || 0)
            expected.push({ company_id: companyId, product_id: it.product_id, transaction_type: isRev ? 'sale_reversal' : 'sale', quantity_change: isRev ? qty : -qty, reference_id: rid, journal_entry_id: (e as any).id, notes: isRev ? 'عكس بيع' : 'بيع' })
          }
        }
      }

      const entryIds = (entries || []).map((e: any) => e.id)
      const { data: existing } = entryIds.length > 0
        ? await supabase.from('inventory_transactions').select('id, journal_entry_id, product_id, transaction_type, quantity_change, reference_id, notes').eq('company_id', companyId).in('journal_entry_id', entryIds)
        : { data: [] as any[] }
      const existMap: Record<string, any> = {}
      ;(existing || []).forEach((t: any) => { existMap[`${t.journal_entry_id}:${t.product_id}:${t.transaction_type}`] = t })

      const toInsert: any[] = []
      const toUpdate: { id: string; patch: any; productId: string; qty: number; note: string }[] = []
      const details: { type: 'insert' | 'update' | 'delete'; product: string; qty: number; note: string }[] = []

      for (const exp of expected) {
        const key = `${exp.journal_entry_id}:${exp.product_id}:${exp.transaction_type}`
        const cur = existMap[key]
        if (!cur) {
          toInsert.push(exp)
          details.push({ type: 'insert', product: productNames[exp.product_id] || exp.product_id, qty: exp.quantity_change, note: exp.notes })
        } else {
          const needPatch = (Number(cur.quantity_change || 0) !== Number(exp.quantity_change || 0)) || (String(cur.reference_id || '') !== String(exp.reference_id || '')) || (String(cur.notes || '') !== String(exp.notes || ''))
          if (needPatch) {
            toUpdate.push({ id: String(cur.id), patch: { quantity_change: exp.quantity_change, reference_id: exp.reference_id, notes: exp.notes }, productId: exp.product_id, qty: exp.quantity_change, note: exp.notes })
            details.push({ type: 'update', product: productNames[exp.product_id] || exp.product_id, qty: exp.quantity_change, note: exp.notes })
          }
        }
      }

      if (toInsert.length > 0) {
        const { error: insErr } = await supabase.from('inventory_transactions').insert(toInsert)
        if (insErr) throw insErr
      }
      for (const upd of toUpdate) {
        const { error: updErr } = await supabase.from('inventory_transactions').update(upd.patch).eq('id', upd.id).eq('company_id', companyId)
        if (updErr) throw updErr
      }

      const allowed = new Set((expected || []).map((t: any) => `${t.journal_entry_id}:${t.product_id}:${t.transaction_type}`))
      const extras = (existing || []).filter((t: any) => !allowed.has(`${t.journal_entry_id}:${t.product_id}:${t.transaction_type}`))
      if (extras.length > 0) {
        const ids = extras.map((t: any) => t.id)
        extras.forEach((t: any) => {
          details.push({ type: 'delete', product: productNames[t.product_id] || t.product_id, qty: t.quantity_change, note: t.notes || '' })
        })
        await supabase.from('inventory_transactions').delete().in('id', ids)
      }

      // تحديث النتيجة
      setReviewResult({
        inserted: toInsert.length,
        updated: toUpdate.length,
        deleted: extras.length,
        total: entries?.length || 0,
        details
      })
      setIsReviewDialogOpen(true)

      await loadData()
      if (toInsert.length === 0 && toUpdate.length === 0 && extras.length === 0) {
        toastActionSuccess(toast, appLang==='en' ? 'Review' : 'مراجعة', appLang==='en' ? 'All movements are synchronized' : 'جميع الحركات متزامنة')
      } else {
        toastActionSuccess(toast, appLang==='en' ? 'Review' : 'مراجعة', appLang==='en' ? 'Inventory movements synchronized' : 'تم مزامنة حركات المخزون')
      }
    } catch (err: any) {
      const msg = err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err))
      toastActionError(toast, appLang==='en' ? 'Review' : 'مراجعة', appLang==='en' ? 'Inventory movements' : 'حركات المخزون', msg)
    } finally { setIsReconciling(false) }
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

  

  

  // حساب إجمالي المشتريات والمبيعات
  const totalPurchased = Object.values(purchaseTotals).reduce((a, b) => a + b, 0)
  const totalSold = Object.values(soldTotals).reduce((a, b) => a + b, 0)
  const lowStockCount = products.filter(p => (computedQty[p.id] ?? p.quantity_on_hand ?? 0) < 5).length

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />

      <main className="flex-1 md:mr-64 p-4 md:p-8">
        <div className="space-y-6">
          {/* رأس الصفحة */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-6">
            <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg shadow-blue-500/20">
                  <Package className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
                    {appLang==='en' ? 'Inventory Management' : 'إدارة المخزون'}
                  </h1>
                  <p className="text-gray-500 dark:text-gray-400 mt-1">
                    {appLang==='en' ? 'Track and manage your inventory movements' : 'تتبع وإدارة حركات المخزون'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {/* زر المراجعة والمزامنة */}
                <Button
                  variant="outline"
                  disabled={isReconciling}
                  onClick={reconcileRecentMovements}
                  className="gap-2 bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 border-blue-200 text-blue-700 dark:from-blue-950 dark:to-indigo-950 dark:hover:from-blue-900 dark:hover:to-indigo-900 dark:border-blue-800 dark:text-blue-300 shadow-sm"
                >
                  <RefreshCcw className={`w-4 h-4 ${isReconciling ? 'animate-spin' : ''}`} />
                  {isReconciling ? (appLang==='en' ? 'Syncing...' : 'جاري المزامنة...') : (appLang==='en' ? 'Sync Inventory' : 'مزامنة المخزون')}
                </Button>

                {/* زر إضافة حركة */}
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                  <DialogTrigger asChild>
                    {permInventoryWrite ? (
                      <Button className="gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/25">
                        <Plus className="w-4 h-4" />
                        {appLang==='en' ? 'New Movement' : 'حركة جديدة'}
                      </Button>
                    ) : <div />}
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <Box className="w-5 h-5 text-blue-600" />
                        {appLang==='en' ? 'Record Inventory Movement' : 'تسجيل حركة مخزون'}
                      </DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="product_id">{appLang==='en' ? 'Product' : 'المنتج'}</Label>
                        <select
                          id="product_id"
                          value={formData.product_id}
                          onChange={(e) => setFormData({ ...formData, product_id: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                          onChange={(e) => setFormData({ ...formData, transaction_type: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="adjustment">{appLang==='en' ? 'Adjustment' : 'تعديل'}</option>
                          <option value="purchase">{appLang==='en' ? 'Purchase (Stock In)' : 'شراء (إدخال)'}</option>
                          <option value="sale">{appLang==='en' ? 'Sale (Stock Out)' : 'بيع (إخراج)'}</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="quantity_change">{appLang==='en' ? 'Quantity' : 'الكمية'}</Label>
                        <Input
                          id="quantity_change"
                          type="number"
                          value={formData.quantity_change}
                          onChange={(e) => setFormData({ ...formData, quantity_change: Number.parseInt(e.target.value) })}
                          className="focus:ring-2 focus:ring-blue-500"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="notes">{appLang==='en' ? 'Notes' : 'ملاحظات'}</Label>
                        <Input
                          id="notes"
                          value={formData.notes}
                          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                          placeholder={appLang==='en' ? 'Optional notes...' : 'ملاحظات اختيارية...'}
                          className="focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <Button type="submit" className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
                        {appLang==='en' ? 'Save Movement' : 'حفظ الحركة'}
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </div>

          {/* بطاقات الإحصائيات */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      {appLang==='en' ? 'Total Products' : 'إجمالي المنتجات'}
                    </p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{products.length}</p>
                  </div>
                  <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                    <Package className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      {appLang==='en' ? 'Stock on Hand' : 'المخزون المتاح'}
                    </p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                      {products.reduce((sum, p) => sum + (quantityMode === 'actual' ? (actualQty[p.id] ?? 0) : (computedQty[p.id] ?? p.quantity_on_hand ?? 0)), 0)}
                    </p>
                  </div>
                  <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-xl">
                    <BarChart3 className="w-6 h-6 text-green-600 dark:text-green-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      {appLang==='en' ? 'Total Purchased' : 'إجمالي المشتريات'}
                    </p>
                    <p className="text-3xl font-bold text-emerald-600 mt-2">+{totalPurchased}</p>
                  </div>
                  <div className="p-3 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl">
                    <Truck className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      {appLang==='en' ? 'Total Sold' : 'إجمالي المبيعات'}
                    </p>
                    <p className="text-3xl font-bold text-orange-600 mt-2">-{totalSold}</p>
                  </div>
                  <div className="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-xl">
                    <ShoppingCart className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* جدول حالة المخزون */}
          <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
            <CardHeader className="border-b border-gray-100 dark:border-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                    <BarChart3 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <CardTitle className="text-lg">{appLang==='en' ? 'Inventory Status' : 'حالة المخزون'}</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <Tabs value={quantityMode} onValueChange={(v) => setQuantityMode(v as 'derived' | 'actual')} className="w-auto">
                    <TabsList className="bg-gray-100 dark:bg-slate-800">
                      <TabsTrigger value="derived" className="text-xs data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700">
                        {appLang==='en' ? 'Derived' : 'مشتقة'}
                      </TabsTrigger>
                      <TabsTrigger value="actual" className="text-xs data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700">
                        {appLang==='en' ? 'Actual' : 'فعلي'}
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                  {lowStockCount > 0 && (
                    <Badge variant="destructive" className="gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {lowStockCount} {appLang==='en' ? 'Low Stock' : 'مخزون منخفض'}
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCcw className="w-6 h-6 animate-spin text-blue-600" />
                  <span className="mr-2 text-gray-500">{appLang==='en' ? 'Loading...' : 'جاري التحميل...'}</span>
                </div>
              ) : products.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                  <Package className="w-12 h-12 mb-3 text-gray-300" />
                  <p>{appLang==='en' ? 'No products yet' : 'لا توجد منتجات حتى الآن'}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[800px] w-full text-sm">
                    <thead>
                      <tr className="bg-gradient-to-r from-slate-50 to-gray-100 dark:from-slate-800 dark:to-slate-800/80">
                        <th className="px-4 py-4 text-right font-semibold text-gray-700 dark:text-gray-200 border-b-2 border-gray-200 dark:border-slate-700">
                          <div className="flex items-center gap-2 justify-end">
                            <Box className="w-4 h-4 text-gray-500" />
                            <span>{appLang==='en' ? 'Code' : 'الرمز'}</span>
                          </div>
                        </th>
                        <th className="px-4 py-4 text-right font-semibold text-gray-700 dark:text-gray-200 border-b-2 border-gray-200 dark:border-slate-700">
                          <div className="flex items-center gap-2 justify-end">
                            <Package className="w-4 h-4 text-gray-500" />
                            <span>{appLang==='en' ? 'Product Name' : 'اسم المنتج'}</span>
                          </div>
                        </th>
                        <th className="px-4 py-4 text-center font-semibold text-gray-700 dark:text-gray-200 border-b-2 border-gray-200 dark:border-slate-700">
                          <div className="flex items-center gap-2 justify-center">
                            <Truck className="w-4 h-4 text-emerald-600" />
                            <span>{appLang==='en' ? 'Total Purchased' : 'إجمالي المشتريات'}</span>
                          </div>
                        </th>
                        <th className="px-4 py-4 text-center font-semibold text-gray-700 dark:text-gray-200 border-b-2 border-gray-200 dark:border-slate-700">
                          <div className="flex items-center gap-2 justify-center">
                            <ShoppingCart className="w-4 h-4 text-orange-600" />
                            <span>{appLang==='en' ? 'Total Sold' : 'إجمالي المبيعات'}</span>
                          </div>
                        </th>
                        <th className="px-4 py-4 text-center font-semibold text-gray-700 dark:text-gray-200 border-b-2 border-gray-200 dark:border-slate-700">
                          <div className="flex items-center gap-2 justify-center">
                            <BarChart3 className="w-4 h-4 text-blue-600" />
                            <span>{appLang==='en' ? 'Available Stock' : 'المخزون المتاح'}</span>
                          </div>
                        </th>
                        <th className="px-4 py-4 text-center font-semibold text-gray-700 dark:text-gray-200 border-b-2 border-gray-200 dark:border-slate-700">
                          <div className="flex items-center gap-2 justify-center">
                            <span>{appLang==='en' ? 'Status' : 'الحالة'}</span>
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                      {products.map((product, index) => {
                        const purchased = purchaseTotals[product.id] ?? 0
                        const sold = soldTotals[product.id] ?? 0
                        const q = computedQty[product.id]
                        const shown = quantityMode==='actual' ? (actualQty[product.id] ?? 0) : (q ?? product.quantity_on_hand ?? 0)
                        const isLowStock = shown > 0 && shown < 5
                        const isOutOfStock = shown <= 0
                        const stockPercentage = purchased > 0 ? Math.round((shown / purchased) * 100) : 0

                        return (
                          <tr
                            key={product.id}
                            className={`hover:bg-blue-50/50 dark:hover:bg-slate-800/70 transition-all duration-200 ${
                              index % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-gray-50/50 dark:bg-slate-900/50'
                            }`}
                          >
                            {/* الرمز */}
                            <td className="px-4 py-4">
                              <Badge variant="outline" className="font-mono text-xs bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600">
                                {product.sku || '-'}
                              </Badge>
                            </td>

                            {/* اسم المنتج */}
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 flex items-center justify-center flex-shrink-0">
                                  <Package className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                </div>
                                <div>
                                  <p className="font-semibold text-gray-900 dark:text-white">{product.name}</p>
                                  <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {appLang==='en' ? 'Stock Rate' : 'نسبة المخزون'}: {stockPercentage}%
                                  </p>
                                </div>
                              </div>
                            </td>

                            {/* إجمالي المشتريات */}
                            <td className="px-4 py-4 text-center">
                              <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                                <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                <span className="font-bold text-emerald-700 dark:text-emerald-300 text-base">
                                  {purchased.toLocaleString()}
                                </span>
                              </div>
                            </td>

                            {/* إجمالي المبيعات */}
                            <td className="px-4 py-4 text-center">
                              <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
                                <TrendingDown className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                                <span className="font-bold text-orange-700 dark:text-orange-300 text-base">
                                  {sold.toLocaleString()}
                                </span>
                              </div>
                            </td>

                            {/* المخزون المتاح */}
                            <td className="px-4 py-4 text-center">
                              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-lg ${
                                isOutOfStock
                                  ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-700'
                                  : isLowStock
                                    ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700'
                                    : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700'
                              }`}>
                                {shown.toLocaleString()}
                              </div>
                            </td>

                            {/* الحالة */}
                            <td className="px-4 py-4 text-center">
                              {isOutOfStock ? (
                                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                                  <AlertCircle className="w-4 h-4" />
                                  <span className="text-sm font-medium">{appLang==='en' ? 'Out of Stock' : 'نفذ المخزون'}</span>
                                </div>
                              ) : isLowStock ? (
                                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                                  <AlertCircle className="w-4 h-4" />
                                  <span className="text-sm font-medium">{appLang==='en' ? 'Low Stock' : 'مخزون منخفض'}</span>
                                </div>
                              ) : (
                                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                                  <CheckCircle2 className="w-4 h-4" />
                                  <span className="text-sm font-medium">{appLang==='en' ? 'In Stock' : 'متوفر'}</span>
                                </div>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    {/* Footer Summary */}
                    <tfoot>
                      <tr className="bg-gradient-to-r from-slate-100 to-gray-100 dark:from-slate-800 dark:to-slate-700 border-t-2 border-gray-300 dark:border-slate-600">
                        <td colSpan={2} className="px-4 py-4 text-right">
                          <span className="font-bold text-gray-700 dark:text-gray-200 text-base">
                            {appLang==='en' ? 'Total' : 'الإجمالي'} ({products.length} {appLang==='en' ? 'products' : 'منتج'})
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-200 dark:bg-emerald-800 border border-emerald-400 dark:border-emerald-600">
                            <TrendingUp className="w-5 h-5 text-emerald-700 dark:text-emerald-300" />
                            <span className="font-bold text-emerald-800 dark:text-emerald-200 text-lg">
                              {totalPurchased.toLocaleString()}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-200 dark:bg-orange-800 border border-orange-400 dark:border-orange-600">
                            <TrendingDown className="w-5 h-5 text-orange-700 dark:text-orange-300" />
                            <span className="font-bold text-orange-800 dark:text-orange-200 text-lg">
                              {totalSold.toLocaleString()}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-200 dark:bg-blue-800 border border-blue-400 dark:border-blue-600">
                            <BarChart3 className="w-5 h-5 text-blue-700 dark:text-blue-300" />
                            <span className="font-bold text-blue-800 dark:text-blue-200 text-lg">
                              {products.reduce((sum, p) => sum + (quantityMode === 'actual' ? (actualQty[p.id] ?? 0) : (computedQty[p.id] ?? p.quantity_on_hand ?? 0)), 0).toLocaleString()}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <div className="flex items-center justify-center gap-3">
                            {lowStockCount > 0 && (
                              <Badge variant="destructive" className="gap-1 px-2 py-1">
                                <AlertCircle className="w-3 h-3" />
                                {lowStockCount}
                              </Badge>
                            )}
                            <Badge className="gap-1 px-2 py-1 bg-green-600">
                              <CheckCircle2 className="w-3 h-3" />
                              {products.length - lowStockCount - products.filter(p => (quantityMode === 'actual' ? (actualQty[p.id] ?? 0) : (computedQty[p.id] ?? p.quantity_on_hand ?? 0)) <= 0).length}
                            </Badge>
                          </div>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* قسم حركات المخزون */}
          <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
            <CardHeader className="border-b border-gray-100 dark:border-slate-800">
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                    <FileText className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <CardTitle className="text-lg">{appLang==='en' ? 'Inventory Movements' : 'حركات المخزون'}</CardTitle>
                </div>

                {/* شريط الفلاتر */}
                <div className="flex flex-wrap items-center gap-3 p-4 bg-gray-50 dark:bg-slate-800/50 rounded-xl">
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-500">{appLang==='en' ? 'Filters:' : 'الفلاتر:'}</span>
                  </div>

                  {/* فلتر النوع */}
                  <select
                    value={movementFilter}
                    onChange={(e) => setMovementFilter(e.target.value === 'purchase' ? 'purchase' : (e.target.value === 'sale' ? 'sale' : 'all'))}
                    className="px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="all">{appLang==='en' ? 'All Types' : 'كل الأنواع'}</option>
                    <option value="purchase">{appLang==='en' ? 'Purchases' : 'المشتريات'}</option>
                    <option value="sale">{appLang==='en' ? 'Sales' : 'المبيعات'}</option>
                  </select>

                  {/* فلتر المنتج */}
                  <select
                    value={movementProductId}
                    onChange={(e) => setMovementProductId(e.target.value)}
                    className="px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 max-w-[200px]"
                  >
                    <option value="">{appLang==='en' ? 'All Products' : 'كل المنتجات'}</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>

                  {/* فلتر التاريخ */}
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <Input
                      type="date"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                      className="text-sm w-36 bg-white dark:bg-slate-900"
                    />
                    <span className="text-gray-400">-</span>
                    <Input
                      type="date"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                      className="text-sm w-36 bg-white dark:bg-slate-900"
                    />
                  </div>

                  {/* إجمالي الكمية */}
                  <Badge variant="secondary" className="gap-1 px-3 py-1.5">
                    <BarChart3 className="w-3 h-3" />
                    {appLang==='en' ? 'Total:' : 'الإجمالي:'} {(() => {
                      const sum = transactions.reduce((acc, t) => {
                        const typeOk = movementFilter === 'all' ? true : movementFilter === 'purchase' ? String(t.transaction_type || '').startsWith('purchase') : String(t.transaction_type || '').startsWith('sale')
                        if (!typeOk) return acc
                        if (movementProductId && String(t.product_id || '') !== movementProductId) return acc
                        const dStr = String((t as any)?.journal_entries?.entry_date || t.created_at || '').slice(0,10)
                        if (fromDate && dStr < fromDate) return acc
                        if (toDate && dStr > toDate) return acc
                        return acc + Number(t.quantity_change || 0)
                      }, 0)
                      return sum
                    })()}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCcw className="w-6 h-6 animate-spin text-blue-600" />
                  <span className="mr-2 text-gray-500">{appLang==='en' ? 'Loading...' : 'جاري التحميل...'}</span>
                </div>
              ) : (() => {
                const filtered = transactions.filter((t) => {
                  const typeOk = movementFilter === 'all' ? true : movementFilter === 'purchase' ? String(t.transaction_type || '').startsWith('purchase') : String(t.transaction_type || '').startsWith('sale')
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
                  return (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                      <FileText className="w-12 h-12 mb-3 text-gray-300" />
                      <p>{appLang==='en' ? 'No movements found' : 'لا توجد حركات'}</p>
                    </div>
                  )
                }
                return (
                  <div className="divide-y divide-gray-100 dark:divide-slate-800">
                    {filtered.slice(0, 20).map((transaction) => {
                      const isPositive = transaction.quantity_change > 0
                      const transType = String(transaction.transaction_type || '')
                      return (
                        <div
                          key={transaction.id}
                          className="flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors"
                        >
                          <div className="flex items-center gap-4">
                            <div className={`p-2.5 rounded-xl ${isPositive ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                              {isPositive ? (
                                <ArrowUp className="w-5 h-5 text-green-600 dark:text-green-400" />
                              ) : (
                                <ArrowDown className="w-5 h-5 text-red-600 dark:text-red-400" />
                              )}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900 dark:text-white">{transaction.products?.name}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" className="text-xs font-mono">{transaction.products?.sku}</Badge>
                                <Badge
                                  variant="secondary"
                                  className={`text-xs ${
                                    transType.startsWith('purchase') ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                                    transType.startsWith('sale') ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                                    'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                                  }`}
                                >
                                  {transType === 'sale' ? (appLang==='en' ? 'Sale' : 'بيع') :
                                   transType === 'sale_reversal' ? (appLang==='en' ? 'Sale Return' : 'مرتجع بيع') :
                                   transType === 'purchase' ? (appLang==='en' ? 'Purchase' : 'شراء') :
                                   transType === 'purchase_reversal' ? (appLang==='en' ? 'Purchase Return' : 'مرتجع شراء') :
                                   transType === 'adjustment' ? (appLang==='en' ? 'Adjustment' : 'تعديل') : transType}
                                </Badge>
                              </div>
                              {transaction.reference_id && (
                                <p className="text-xs text-gray-500 mt-1">
                                  {transType.startsWith('purchase') ? (
                                    <Link href={`/bills/${transaction.reference_id}`} className="text-blue-600 hover:underline flex items-center gap-1">
                                      <FileText className="w-3 h-3" />
                                      {appLang==='en' ? 'View Bill' : 'عرض الفاتورة'}
                                    </Link>
                                  ) : transType.startsWith('sale') ? (
                                    <Link href={`/invoices/${transaction.reference_id}`} className="text-blue-600 hover:underline flex items-center gap-1">
                                      <FileText className="w-3 h-3" />
                                      {appLang==='en' ? 'View Invoice' : 'عرض الفاتورة'}
                                    </Link>
                                  ) : null}
                                </p>
                              )}
                              {transaction.notes && (
                                <p className="text-xs text-gray-400 mt-1 max-w-md truncate">{transaction.notes}</p>
                              )}
                            </div>
                          </div>
                          <div className="text-left">
                            <p className={`text-lg font-bold ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                              {isPositive ? '+' : ''}{transaction.quantity_change}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              {new Date(transaction.created_at).toLocaleDateString(appLang==='en' ? 'en' : 'ar', { year: 'numeric', month: 'short', day: 'numeric' })}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </CardContent>
          </Card>
        </div>

        {/* موديال نتيجة المراجعة */}
        <Dialog open={isReviewDialogOpen} onOpenChange={setIsReviewDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader className="border-b border-gray-100 dark:border-slate-800 pb-4">
              <DialogTitle className="flex items-center gap-3 text-xl">
                <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg shadow-lg shadow-blue-500/20">
                  <RefreshCcw className="w-5 h-5 text-white" />
                </div>
                {appLang === 'en' ? 'Inventory Sync Report' : 'تقرير مزامنة المخزون'}
              </DialogTitle>
            </DialogHeader>

            {reviewResult && (
              <div className="space-y-6 overflow-y-auto flex-1 py-4">
                {/* ملخص النتائج */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-800 dark:to-slate-900 rounded-xl p-4 text-center border border-gray-200 dark:border-slate-700">
                    <p className="text-3xl font-bold text-gray-700 dark:text-gray-300">{reviewResult.total}</p>
                    <p className="text-xs text-gray-500 mt-1">{appLang === 'en' ? 'Total Entries' : 'إجمالي القيود'}</p>
                  </div>
                  <div className="bg-gradient-to-br from-green-50 to-emerald-100 dark:from-green-950 dark:to-emerald-900 rounded-xl p-4 text-center border border-green-200 dark:border-green-800">
                    <p className="text-3xl font-bold text-green-600 dark:text-green-400">{reviewResult.inserted}</p>
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1">{appLang === 'en' ? 'Added' : 'مضاف'}</p>
                  </div>
                  <div className="bg-gradient-to-br from-amber-50 to-yellow-100 dark:from-amber-950 dark:to-yellow-900 rounded-xl p-4 text-center border border-amber-200 dark:border-amber-800">
                    <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">{reviewResult.updated}</p>
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">{appLang === 'en' ? 'Updated' : 'محدّث'}</p>
                  </div>
                  <div className="bg-gradient-to-br from-red-50 to-rose-100 dark:from-red-950 dark:to-rose-900 rounded-xl p-4 text-center border border-red-200 dark:border-red-800">
                    <p className="text-3xl font-bold text-red-600 dark:text-red-400">{reviewResult.deleted}</p>
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">{appLang === 'en' ? 'Deleted' : 'محذوف'}</p>
                  </div>
                </div>

                {/* حالة المزامنة */}
                {reviewResult.inserted === 0 && reviewResult.updated === 0 && reviewResult.deleted === 0 ? (
                  <div className="flex items-center gap-4 p-5 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/50 dark:to-emerald-950/50 rounded-xl border border-green-200 dark:border-green-800">
                    <div className="p-3 bg-green-100 dark:bg-green-900/50 rounded-full">
                      <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="font-bold text-green-700 dark:text-green-400 text-lg">
                        {appLang === 'en' ? 'All Synchronized!' : 'الكل متزامن!'}
                      </p>
                      <p className="text-sm text-green-600 dark:text-green-500">
                        {appLang === 'en' ? 'All inventory movements match the journal entries.' : 'جميع حركات المخزون متطابقة مع القيود المحاسبية.'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-4 p-5 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/50 dark:to-indigo-950/50 rounded-xl border border-blue-200 dark:border-blue-800">
                    <div className="p-3 bg-blue-100 dark:bg-blue-900/50 rounded-full">
                      <CheckCircle2 className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="font-bold text-blue-700 dark:text-blue-400 text-lg">
                        {appLang === 'en' ? 'Sync Complete!' : 'تمت المزامنة!'}
                      </p>
                      <p className="text-sm text-blue-600 dark:text-blue-500">
                        {appLang === 'en'
                          ? `${reviewResult.inserted + reviewResult.updated + reviewResult.deleted} changes applied successfully.`
                          : `تم تطبيق ${reviewResult.inserted + reviewResult.updated + reviewResult.deleted} تغيير بنجاح.`}
                      </p>
                    </div>
                  </div>
                )}

                {/* تفاصيل التغييرات */}
                {reviewResult.details.length > 0 && (
                  <div className="bg-gray-50 dark:bg-slate-800/50 rounded-xl p-4">
                    <h3 className="font-semibold mb-3 flex items-center gap-2 text-gray-700 dark:text-gray-300">
                      <FileText className="w-4 h-4" />
                      {appLang === 'en' ? 'Change Details' : 'تفاصيل التغييرات'}
                    </h3>
                    <div className="max-h-48 overflow-y-auto bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-100 dark:bg-slate-800 sticky top-0">
                          <tr>
                            <th className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Action' : 'الإجراء'}</th>
                            <th className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Product' : 'المنتج'}</th>
                            <th className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Qty' : 'الكمية'}</th>
                            <th className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Note' : 'ملاحظة'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                          {reviewResult.details.map((d, i) => (
                            <tr key={i} className="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                              <td className="px-4 py-3">
                                <Badge className={`${
                                  d.type === 'insert' ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400 hover:bg-green-100' :
                                  d.type === 'update' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400 hover:bg-amber-100' :
                                  'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400 hover:bg-red-100'
                                }`}>
                                  {d.type === 'insert' ? (appLang === 'en' ? 'Add' : 'إضافة') :
                                   d.type === 'update' ? (appLang === 'en' ? 'Update' : 'تحديث') :
                                   (appLang === 'en' ? 'Delete' : 'حذف')}
                                </Badge>
                              </td>
                              <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{d.product}</td>
                              <td className="px-4 py-3">
                                <span className={`font-bold ${d.qty > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                  {d.qty > 0 ? '+' : ''}{d.qty}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs max-w-[150px] truncate">{d.note}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end pt-4 border-t border-gray-100 dark:border-slate-800">
              <Button
                onClick={() => setIsReviewDialogOpen(false)}
                className="bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800"
              >
                {appLang === 'en' ? 'Close' : 'إغلاق'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}
