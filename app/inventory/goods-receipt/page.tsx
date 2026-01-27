// app/inventory/goods-receipt/page.tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import { toastActionError, toastActionSuccess } from "@/lib/notifications"
import { getActiveCompanyId } from "@/lib/company"
import { useUserContext } from "@/hooks/use-user-context"
import { type UserContext } from "@/lib/validation"
import { buildDataVisibilityFilter, applyDataVisibilityFilter } from "@/lib/data-visibility-control"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NumericInput } from "@/components/ui/numeric-input"
import { Package, CheckCircle, Warehouse, Building2, AlertCircle, Loader2 } from "lucide-react"
import { createPurchaseInventoryJournal } from "@/lib/accrual-accounting-engine"

type BillForReceipt = {
  id: string
  bill_number: string
  bill_date: string
  supplier_id: string
  status: string
  branch_id: string | null
  warehouse_id: string | null
  cost_center_id: string | null
  subtotal: number
  tax_amount: number
  total_amount: number
  suppliers?: { name: string }
}

type BillItemRow = {
  id: string
  product_id: string | null
  quantity: number
  unit_price: number
  tax_rate: number
  products?: { name: string; sku: string | null }
}

type ReceiptItem = {
  id: string
  product_id: string
  product_name: string
  max_qty: number
  receive_qty: number
  unit_price: number
  tax_rate: number
}

export default function GoodsReceiptPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const { userContext, loading: userContextLoading } = useUserContext()
  const [appLang, setAppLang] = useState<"ar" | "en">("ar")
  const [bills, setBills] = useState<BillForReceipt[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [selectedBill, setSelectedBill] = useState<BillForReceipt | null>(null)
  const [receiptItems, setReceiptItems] = useState<ReceiptItem[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [branchName, setBranchName] = useState<string | null>(null)
  const [warehouseName, setWarehouseName] = useState<string | null>(null)

  useEffect(() => {
    try {
      const v = localStorage.getItem("app_language") || "ar"
      setAppLang(v === "en" ? "en" : "ar")
    } catch {
      setAppLang("ar")
    }
  }, [])

  useEffect(() => {
    if (!userContextLoading && userContext) {
      loadBills(userContext)
    }
  }, [userContextLoading, userContext])

  const loadBills = async (context: UserContext) => {
    try {
      setLoading(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId || !context) {
        setBills([])
        return
      }

      // دور المستخدم الحالي
      const role = String(context.role || "").trim().toLowerCase()

      // فقط أدوار store_manager / owner / admin / manager ترى شاشة اعتماد الاستلام
      if (!["store_manager", "owner", "admin", "manager"].includes(role)) {
        setBills([])
        setLoading(false)
        return
      }

      // يجب أن يكون لدى مسؤول المخزن فرع ومخزن محدد
      const branchId = context.branch_id
      const warehouseId = context.warehouse_id

      if (!branchId || !warehouseId) {
        toastActionError(
          toast,
          appLang === "en" ? "Access" : "الوصول",
          appLang === "en" ? "Goods Receipt" : "اعتماد الاستلام",
          appLang === "en"
            ? "Warehouse manager must have a branch and warehouse assigned"
            : "مسؤول المخزن يجب أن يكون له فرع ومخزن محددان",
          appLang
        )
        setBills([])
        setLoading(false)
        return
      }

      // تحميل اسم الفرع والمخزن للعرض بدلاً من عرض المعرّفات الخام
      try {
        const { data: branchRow } = await supabase
          .from("branches")
          .select("id, name, branch_name")
          .eq("company_id", companyId)
          .eq("id", branchId)
          .maybeSingle()
        if (branchRow) {
          const label = (branchRow as any).name || (branchRow as any).branch_name || null
          setBranchName(label)
        } else {
          setBranchName(null)
        }

        const { data: whRow } = await supabase
          .from("warehouses")
          .select("id, name, code")
          .eq("company_id", companyId)
          .eq("id", warehouseId)
          .maybeSingle()
        if (whRow) {
          const label = (whRow as any).name || (whRow as any).code || null
          setWarehouseName(label)
        } else {
          setWarehouseName(null)
        }
      } catch {
        // في حال فشل جلب الأسماء نكتفي بعرض المعرفات
        setBranchName(null)
        setWarehouseName(null)
      }

      // بناء قواعد الحوكمة الأساسية
      const rules = buildDataVisibilityFilter(context)

      // نقيّد الاستعلام يدوياً على الفرع والمخزن
      let q = supabase
        .from("bills")
        .select(
          "id, bill_number, bill_date, supplier_id, status, branch_id, warehouse_id, cost_center_id, subtotal, tax_amount, total_amount, suppliers(name)"
        )
        .eq("company_id", companyId)
        .eq("status", "approved")
        .eq("branch_id", branchId)
        .eq("warehouse_id", warehouseId)

      q = applyDataVisibilityFilter(q, rules, "bills")

      const { data, error } = await q.order("bill_date", { ascending: true })
      if (error) throw error

      setBills((data || []) as BillForReceipt[])
    } catch (err) {
      console.error("Error loading bills for goods receipt:", err)
      toastActionError(
        toast,
        appLang === "en" ? "Load" : "التحميل",
        appLang === "en" ? "Bills" : "الفواتير",
        appLang === "en" ? "Failed to load bills for goods receipt" : "تعذر تحميل الفواتير لاعتماد الاستلام",
        appLang
      )
    } finally {
      setLoading(false)
    }
  }

  const openReceiptDialog = async (bill: BillForReceipt) => {
    try {
      setSelectedBill(bill)
      setProcessing(true)
      const { data: itemsData, error } = await supabase
        .from("bill_items")
        .select("id, product_id, quantity, unit_price, tax_rate, products(name, sku)")
        .eq("bill_id", bill.id)

      if (error) throw error

      const rows: ReceiptItem[] = (itemsData || [])
        .filter((it: BillItemRow) => !!it.product_id)
        .map((it: BillItemRow) => ({
          id: it.id,
          product_id: it.product_id as string,
          product_name: it.products?.name || it.product_id || "",
          max_qty: Number(it.quantity || 0),
          receive_qty: Number(it.quantity || 0), // افتراضياً استلام كامل
          unit_price: Number(it.unit_price || 0),
          tax_rate: Number(it.tax_rate || 0)
        }))

      setReceiptItems(rows)
      setDialogOpen(true)
    } catch (err) {
      console.error("Error loading bill items for receipt:", err)
      toastActionError(
        toast,
        appLang === "en" ? "Load" : "التحميل",
        appLang === "en" ? "Items" : "البنود",
        appLang === "en" ? "Failed to load bill items" : "تعذر تحميل بنود الفاتورة",
        appLang
      )
    } finally {
      setProcessing(false)
    }
  }

  const handleConfirmReceipt = async () => {
    if (!selectedBill || receiptItems.length === 0 || !userContext) {
      return
    }
    try {
      setProcessing(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const branchId = selectedBill.branch_id
      const warehouseId = selectedBill.warehouse_id
      const costCenterId = selectedBill.cost_center_id

      if (!branchId || !warehouseId || !costCenterId) {
        toastActionError(
          toast,
          appLang === "en" ? "Governance" : "الحوكمة",
          appLang === "en" ? "Goods Receipt" : "اعتماد الاستلام",
          appLang === "en"
            ? "Branch, warehouse and cost center are required on the bill before receipt"
            : "يجب تحديد الفرع والمخزن ومركز التكلفة في الفاتورة قبل اعتماد الاستلام",
          appLang
        )
        setProcessing(false)
        return
      }

      // إنشاء حركات المخزون من الكميات الفعلية المستلمة
      const invRows = receiptItems
        .filter((it) => it.receive_qty > 0)
        .map((it) => ({
          company_id: companyId,
          branch_id: branchId,
          warehouse_id: warehouseId,
          cost_center_id: costCenterId,
          product_id: it.product_id,
          transaction_type: "purchase",
          quantity_change: it.receive_qty,
          reference_id: selectedBill.id,
          notes:
            appLang === "en"
              ? `Goods receipt for bill ${selectedBill.bill_number}`
              : `اعتماد استلام فاتورة مشتريات ${selectedBill.bill_number}`
        }))

      if (invRows.length > 0) {
        const { error: invErr } = await supabase.from("inventory_transactions").insert(invRows)
        if (invErr) throw invErr
      }

      // إنشاء قيد المشتريات الرسمي عبر محرك الاستحقاق (إن لم يكن موجوداً)
      await createPurchaseInventoryJournal(supabase, selectedBill.id, companyId)

      // تحديث حالة الفاتورة إلى received وتسجيل من اعتمد الاستلام
      const now = new Date().toISOString()
      const { error: updErr } = await supabase
        .from("bills")
        .update({
          status: "received",
          received_by: user.id,
          received_at: now
        })
        .eq("id", selectedBill.id)
        .eq("company_id", companyId)

      if (updErr) throw updErr

      toastActionSuccess(
        toast,
        appLang === "en" ? "Receipt" : "الاستلام",
        appLang === "en" ? "Purchase Bill" : "فاتورة المشتريات",
        appLang
      )

      setDialogOpen(false)
      setSelectedBill(null)
      setReceiptItems([])
      await loadBills(userContext)
    } catch (err) {
      console.error("Error confirming goods receipt:", err)
      toastActionError(
        toast,
        appLang === "en" ? "Receipt" : "الاستلام",
        appLang === "en" ? "Purchase Bill" : "فاتورة المشتريات",
        appLang === "en" ? "Failed to confirm goods receipt" : "تعذر اعتماد استلام الفاتورة",
        appLang
      )
    } finally {
      setProcessing(false)
    }
  }

  const hasBills = bills.length > 0

  const totalBillsAmount = useMemo(
    () => bills.reduce((sum, b) => sum + Number(b.total_amount || 0), 0),
    [bills]
  )

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
          {/* Header */}
          <Card className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800">
            <CardHeader className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 sm:p-3 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                  <Warehouse className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <CardTitle className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">
                    {appLang === "en" ? "Purchase Goods Receipt" : "اعتماد استلام فواتير المشتريات"}
                  </CardTitle>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {appLang === "en"
                      ? "Approve inventory receipt for purchase bills after admin approval"
                      : "اعتماد استلام المخزون لفواتير المشتريات بعد الاعتماد الإداري"}
                  </p>
                </div>
              </div>
              {userContext && (
                <div className="flex flex-col text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                  <span className="flex items-center gap-1">
                    <Building2 className="w-4 h-4" />
                    {appLang === "en" ? "Branch:" : "الفرع:"}{" "}
                    {branchName || userContext.branch_id || "-"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Warehouse className="w-4 h-4" />
                    {appLang === "en" ? "Warehouse:" : "المخزن:"}{" "}
                    {warehouseName || userContext.warehouse_id || "-"}
                  </span>
                </div>
              )}
            </CardHeader>
          </Card>

          {/* Content */}
          <Card className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-emerald-600" />
                <CardTitle className="text-base sm:text-lg">
                  {appLang === "en" ? "Bills awaiting warehouse receipt" : "فواتير بانتظار اعتماد الاستلام من المخزن"}
                </CardTitle>
              </div>
              {hasBills && (
                <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                  {appLang === "en"
                    ? `Total: ${bills.length} bills, amount ${totalBillsAmount.toFixed(2)}`
                    : `الإجمالي: ${bills.length} فاتورة، بقيمة ${totalBillsAmount.toFixed(2)}`}
                </div>
              )}
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-10 text-gray-500 dark:text-gray-400">
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  {appLang === "en" ? "Loading bills..." : "جاري تحميل الفواتير..."}
                </div>
              ) : !hasBills ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
                  <AlertCircle className="w-10 h-10 mb-3 text-gray-300 dark:text-gray-600" />
                  <p className="text-sm">
                    {appLang === "en"
                      ? "No approved purchase bills pending warehouse receipt in your branch/warehouse."
                      : "لا توجد فواتير مشتريات معتمدة وبانتظار اعتماد الاستلام في فرعك ومخزنك."}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[720px] w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-slate-800">
                      <tr>
                        <th className="px-3 py-2 text-right">{appLang === "en" ? "Bill #" : "رقم الفاتورة"}</th>
                        <th className="px-3 py-2 text-right">{appLang === "en" ? "Supplier" : "المورد"}</th>
                        <th className="px-3 py-2 text-right">{appLang === "en" ? "Date" : "التاريخ"}</th>
                        <th className="px-3 py-2 text-right">{appLang === "en" ? "Amount" : "المبلغ"}</th>
                        <th className="px-3 py-2 text-center">{appLang === "en" ? "Status" : "الحالة"}</th>
                        <th className="px-3 py-2 text-center">{appLang === "en" ? "Action" : "الإجراء"}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                      {bills.map((bill) => (
                        <tr key={bill.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/60">
                          <td className="px-3 py-2 font-medium text-blue-600 dark:text-blue-400">
                            {bill.bill_number}
                          </td>
                          <td className="px-3 py-2">
                            {bill.suppliers?.name || bill.supplier_id}
                          </td>
                          <td className="px-3 py-2">
                            {new Date(bill.bill_date).toLocaleDateString(
                              appLang === "en" ? "en" : "ar"
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {Number(bill.total_amount || 0).toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                              {appLang === "en" ? "Approved" : "معتمدة إداريًا"}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <Button
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700 text-white"
                              disabled={processing}
                              onClick={() => openReceiptDialog(bill)}
                            >
                              <CheckCircle className="w-4 h-4 mr-1" />
                              {appLang === "en" ? "Confirm Receipt" : "اعتماد الاستلام"}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Dialog لاستلام الكميات الفعلية */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {appLang === "en"
                ? `Goods receipt for bill ${selectedBill?.bill_number || ""}`
                : `اعتماد استلام فاتورة ${selectedBill?.bill_number || ""}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedBill && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs sm:text-sm text-gray-600 dark:text-gray-300">
                <div>
                  <span className="block text-gray-400">
                    {appLang === "en" ? "Bill Date" : "تاريخ الفاتورة"}
                  </span>
                  <span>
                    {new Date(selectedBill.bill_date).toLocaleDateString(
                      appLang === "en" ? "en" : "ar"
                    )}
                  </span>
                </div>
                <div>
                  <span className="block text-gray-400">
                    {appLang === "en" ? "Amount" : "المبلغ"}
                  </span>
                  <span>{Number(selectedBill.total_amount || 0).toFixed(2)}</span>
                </div>
                <div>
                  <span className="block text-gray-400">
                    {appLang === "en" ? "Branch" : "الفرع"}
                  </span>
                  <span>{selectedBill.branch_id || "-"}</span>
                </div>
                <div>
                  <span className="block text-gray-400">
                    {appLang === "en" ? "Warehouse" : "المخزن"}
                  </span>
                  <span>{selectedBill.warehouse_id || "-"}</span>
                </div>
              </div>
            )}

            <div className="overflow-x-auto border rounded-lg">
              <table className="min-w-[600px] w-full text-xs sm:text-sm">
                <thead className="bg-gray-50 dark:bg-slate-800">
                  <tr>
                    <th className="px-2 py-2 text-right">
                      {appLang === "en" ? "Product" : "المنتج"}
                    </th>
                    <th className="px-2 py-2 text-center">
                      {appLang === "en" ? "Qty (Bill)" : "كمية الفاتورة"}
                    </th>
                    <th className="px-2 py-2 text-center">
                      {appLang === "en" ? "Receive Qty" : "الكمية المستلمة"}
                    </th>
                    <th className="px-2 py-2 text-center">
                      {appLang === "en" ? "Unit Price" : "سعر الوحدة"}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                  {receiptItems.map((it, idx) => (
                    <tr key={it.id}>
                      <td className="px-2 py-2 text-right">
                        <div className="font-medium">{it.product_name}</div>
                      </td>
                      <td className="px-2 py-2 text-center">{it.max_qty}</td>
                      <td className="px-2 py-2 text-center">
                        <NumericInput
                          min={0}
                          max={it.max_qty}
                          value={it.receive_qty}
                          onChange={(val) => {
                            const v = Math.max(0, Math.min(Math.round(val), it.max_qty))
                            setReceiptItems((prev) =>
                              prev.map((row, i) =>
                                i === idx ? { ...row, receive_qty: v } : row
                              )
                            )
                          }}
                          className="w-20 mx-auto"
                        />
                      </td>
                      <td className="px-2 py-2 text-center">
                        {it.unit_price.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  {receiptItems.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-3 py-4 text-center text-gray-500 dark:text-gray-400"
                      >
                        {appLang === "en"
                          ? "No items on this bill"
                          : "لا توجد بنود في هذه الفاتورة"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={processing}
            >
              {appLang === "en" ? "Cancel" : "إلغاء"}
            </Button>
            <Button
              onClick={handleConfirmReceipt}
              disabled={processing || receiptItems.every((it) => it.receive_qty <= 0)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {processing && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {appLang === "en" ? "Confirm Goods Receipt" : "تأكيد اعتماد الاستلام"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

