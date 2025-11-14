"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
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
  products?: { name: string; sku: string }
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
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isFixDialogOpen, setIsFixDialogOpen] = useState(false)
  const [formData, setFormData] = useState({
    product_id: "",
    transaction_type: "adjustment",
    quantity_change: 0,
    notes: "",
  })
  const [fixForm, setFixForm] = useState({
    invoice_number: "",
    delete_original_sales: true,
  })

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
        .select("*, products(name, sku)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(50)

      setTransactions(transactionsData || [])
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

      // Update product quantity
      const product = products.find((p) => p.id === formData.product_id)
      if (product) {
        await supabase
          .from("products")
          .update({
            quantity_on_hand: product.quantity_on_hand + Number.parseInt(formData.quantity_change.toString()),
          })
          .eq("id", formData.product_id)
      }

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

  const recalculateQtyFromTransactions = async () => {
    try {
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) {
        toastActionError(toast, "إعادة الاحتساب", "المخزون", "لا توجد شركة فعّالة")
        return
      }

      // اجلب كل معاملات المخزون للشركة واحسب المجاميع لكل منتج
      const { data: allTx, error: txErr } = await supabase
        .from("inventory_transactions")
        .select("product_id, quantity_change")
        .eq("company_id", companyId)
      if (txErr) throw txErr

      const sums = new Map<string, number>()
      for (const t of (allTx || [])) {
        const cur = sums.get(t.product_id) || 0
        sums.set(t.product_id, cur + Number(t.quantity_change || 0))
      }

      // حدّث كمية كل منتج حسب مجموع معاملاته
      for (const p of products) {
        const newQty = sums.get(p.id) || 0
        const { error: updErr } = await supabase
          .from("products")
          .update({ quantity_on_hand: newQty })
          .eq("id", p.id)
        if (updErr) throw updErr
      }

      await loadData()
      toastActionSuccess(toast, "إعادة الاحتساب", "المخزون")
    } catch (err: any) {
      console.error("Error recalculating inventory quantities:", err)
      const msg = typeof err?.message === "string" ? err.message : "فشل إعادة احتساب الكميات"
      toastActionError(toast, "إعادة الاحتساب", "المخزون", msg)
    }
  }

  const fixDeletedInvoiceTransactions = async () => {
    try {
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) {
        toastActionError(toast, "إصلاح الفاتورة", "المخزون", "لا توجد شركة فعّالة")
        return
      }

      const invNo = fixForm.invoice_number.trim()
      if (!invNo) {
        toastActionError(toast, "إصلاح الفاتورة", "المخزون", "يرجى إدخال رقم الفاتورة")
        return
      }

      // ابحث عن معاملات بيع مرتبطة بملاحظات تحتوي رقم الفاتورة
      const { data: saleTx, error: txErr } = await supabase
        .from("inventory_transactions")
        .select("id, product_id, quantity_change")
        .eq("company_id", companyId)
        .eq("transaction_type", "sale")
        .ilike("notes", `%${invNo}%`)
      if (txErr) throw txErr

      if (!saleTx || saleTx.length === 0) {
        toastActionError(toast, "إصلاح الفاتورة", "المخزون", "لا توجد معاملات بيع بهذه الفاتورة")
        return
      }

      // كوّن معاملات عكس وإرجع الكميات
      const reversalTx = saleTx.map((t: any) => ({
        company_id: companyId,
        product_id: t.product_id,
        transaction_type: "sale_reversal",
        quantity_change: Math.abs(Number(t.quantity_change || 0)),
        notes: `عكس مخزون بسبب حذف الفاتورة ${invNo}`,
      }))

      const { error: insErr } = await supabase.from("inventory_transactions").insert(reversalTx)
      if (insErr) throw insErr

      // حدث كميات المنتجات مرة واحدة لكل منتج
      const addSums = new Map<string, number>()
      for (const t of saleTx) {
        const cur = addSums.get(t.product_id) || 0
        addSums.set(t.product_id, cur + Math.abs(Number(t.quantity_change || 0)))
      }

      for (const [pid, addQty] of addSums.entries()) {
        const { data: prod } = await supabase
          .from("products")
          .select("id, quantity_on_hand")
          .eq("id", pid)
          .single()
        if (prod) {
          const newQty = Number(prod.quantity_on_hand || 0) + Number(addQty || 0)
          const { error: updErr } = await supabase
            .from("products")
            .update({ quantity_on_hand: newQty })
            .eq("id", pid)
          if (updErr) throw updErr
        }
      }

      // اختياري: حذف معاملات البيع الأصلية لتصفية السجل
      if (fixForm.delete_original_sales) {
        const ids = saleTx.map((t: any) => t.id)
        const { error: delErr } = await supabase
          .from("inventory_transactions")
          .delete()
          .in("id", ids)
        if (delErr) throw delErr
      }

      await loadData()
      setIsFixDialogOpen(false)
      toastActionSuccess(toast, "إصلاح الفاتورة", "المخزون")
    } catch (err: any) {
      console.error("Error fixing deleted invoice transactions:", err)
      const msg = typeof err?.message === "string" ? err.message : "فشل إصلاح معاملات الفاتورة"
      toastActionError(toast, "إصلاح الفاتورة", "المخزون", msg)
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />

      <main className="flex-1 md:mr-64 p-4 md:p-8">
        <div className="space-y-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">المخزون</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">تتبع حركات المخزون</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={recalculateQtyFromTransactions}>
                إعادة احتساب الكميات
              </Button>
              <Dialog open={isFixDialogOpen} onOpenChange={setIsFixDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    إصلاح أثر فاتورة محذوفة
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>إرجاع الكميات لفاتورة محذوفة</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="invoice_number">رقم الفاتورة</Label>
                      <Input
                        id="invoice_number"
                        placeholder="مثال: INV-0001"
                        value={fixForm.invoice_number}
                        onChange={(e) => setFixForm({ ...fixForm, invoice_number: e.target.value })}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="delete_original_sales"
                        checked={fixForm.delete_original_sales}
                        onCheckedChange={(v) => setFixForm({ ...fixForm, delete_original_sales: Boolean(v) })}
                      />
                      <Label htmlFor="delete_original_sales">حذف معاملات البيع الأصلية</Label>
                    </div>
                    <Button onClick={fixDeletedInvoiceTransactions} className="w-full">
                      تنفيذ الإصلاح
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  حركة مخزون جديدة
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>تسجيل حركة مخزون</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="product_id">المنتج</Label>
                    <select
                      id="product_id"
                      value={formData.product_id}
                      onChange={(e) => setFormData({ ...formData, product_id: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                      required
                    >
                      <option value="">اختر منتج</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name} ({product.sku})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="transaction_type">نوع الحركة</Label>
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
                      <option value="adjustment">تعديل</option>
                      <option value="purchase">شراء</option>
                      <option value="sale">بيع</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quantity_change">الكمية</Label>
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
                    <Label htmlFor="notes">ملاحظات</Label>
                    <Input
                      id="notes"
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    />
                  </div>
                  <Button type="submit" className="w-full">
                    تسجيل الحركة
                  </Button>
                </form>
              </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">إجمالي المنتجات</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{products.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">إجمالي الكمية</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{products.reduce((sum, p) => sum + p.quantity_on_hand, 0)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">آخر تحديث</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {transactions.length > 0 ? new Date(transactions[0].created_at).toLocaleDateString("ar") : "-"}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>حالة المخزون</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-center py-8 text-gray-500">جاري التحميل...</p>
              ) : products.length === 0 ? (
                <p className="text-center py-8 text-gray-500">لا توجد منتجات حتى الآن</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-gray-50 dark:bg-slate-900">
                      <tr>
                        <th className="px-4 py-3 text-right">الرمز</th>
                        <th className="px-4 py-3 text-right">الاسم</th>
                        <th className="px-4 py-3 text-right">الكمية المتاحة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((product) => (
                        <tr key={product.id} className="border-b hover:bg-gray-50 dark:hover:bg-slate-900">
                          <td className="px-4 py-3 font-medium">{product.sku}</td>
                          <td className="px-4 py-3">{product.name}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-1 rounded ${
                                product.quantity_on_hand < 0
                                  ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                                  : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                              }`}
                            >
                              {product.quantity_on_hand}
                            </span>
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
              <CardTitle>حركات المخزون الأخيرة</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-center py-8 text-gray-500">جاري التحميل...</p>
              ) : transactions.length === 0 ? (
                <p className="text-center py-8 text-gray-500">لا توجد حركات مخزون حتى الآن</p>
              ) : (
                <div className="space-y-4">
                  {transactions.slice(0, 20).map((transaction) => (
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
                            {transaction.products?.sku} • {transaction.transaction_type}
                          </p>
                          {transaction.notes && <p className="text-sm text-gray-500 mt-1">{transaction.notes}</p>}
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
                          {new Date(transaction.created_at).toLocaleDateString("ar")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
