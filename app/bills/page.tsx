"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import Link from "next/link"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { canAction } from "@/lib/authz"
import { Receipt, Plus } from "lucide-react"
import { PageContainer } from "@/components/ui/page-container"
import { PageHeader } from "@/components/ui/page-header"

type Bill = {
  id: string
  supplier_id: string
  bill_number: string
  bill_date: string
  total_amount: number
  status: string
}

type Supplier = { id: string; name: string }

type Payment = { id: string; bill_id: string | null; amount: number }

export default function BillsPage() {
  const supabase = useSupabase()
  const [startDate, setStartDate] = useState<string>("")
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [loading, setLoading] = useState<boolean>(true)
  const [bills, setBills] = useState<Bill[]>([])
  const [suppliers, setSuppliers] = useState<Record<string, Supplier>>({})
  const [payments, setPayments] = useState<Payment[]>([])
  const appLang = typeof window !== 'undefined' ? ((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') : 'ar'
  const [permView, setPermView] = useState(true)
  const [permWrite, setPermWrite] = useState(false)
  const [returnOpen, setReturnOpen] = useState(false)
  const [returnMode, setReturnMode] = useState<"partial"|"full">("partial")
  const [returnBillId, setReturnBillId] = useState<string | null>(null)
  const [returnBillNumber, setReturnBillNumber] = useState<string>("")
  const [returnItems, setReturnItems] = useState<{ id: string; product_id: string; name?: string; quantity: number; maxQty: number; qtyToReturn: number; unit_price: number; tax_rate: number; line_total: number }[]>([])

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: "bg-gray-100 text-gray-800",
      sent: "bg-blue-100 text-blue-800",
      partially_paid: "bg-yellow-100 text-yellow-800",
      paid: "bg-green-100 text-green-800",
      cancelled: "bg-red-100 text-red-800",
    }
    return colors[status] || "bg-gray-100 text-gray-800"
  }

  const getStatusLabel = (status: string) => {
    const labelsAr: Record<string, string> = { draft: "مسودة", sent: "مرسلة", partially_paid: "مدفوعة جزئياً", paid: "مدفوعة", cancelled: "ملغاة" }
    const labelsEn: Record<string, string> = { draft: "Draft", sent: "Sent", partially_paid: "Partially Paid", paid: "Paid", cancelled: "Cancelled" }
    return (appLang === 'en' ? labelsEn : labelsAr)[status] || status
  }

  useEffect(() => {
    (async () => {
      setPermView(await canAction(supabase, 'bills', 'read'))
      setPermWrite(await canAction(supabase, 'bills', 'write'))
    })()
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate])
  useEffect(() => {
    const reloadPerms = async () => {
      setPermView(await canAction(supabase, 'bills', 'read'))
      setPermWrite(await canAction(supabase, 'bills', 'write'))
    }
    const handler = () => { reloadPerms() }
    if (typeof window !== 'undefined') window.addEventListener('permissions_updated', handler)
    return () => { if (typeof window !== 'undefined') window.removeEventListener('permissions_updated', handler) }
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      let query = supabase
        .from("bills")
        .select("id, supplier_id, bill_number, bill_date, total_amount, status")
        .eq("company_id", companyId)
        .neq("status", "voided")
      if (startDate) query = query.gte("bill_date", startDate)
      if (endDate) query = query.lte("bill_date", endDate)
      const { data: billData } = await query.order("bill_date", { ascending: false })
      setBills(billData || [])

      const supplierIds = Array.from(new Set((billData || []).map((b: any) => b.supplier_id)))
      if (supplierIds.length) {
        const { data: suppData } = await supabase
          .from("suppliers")
          .select("id, name")
          .eq("company_id", companyId)
          .in("id", supplierIds)
        const map: Record<string, Supplier> = {}
        ;(suppData || []).forEach((s: any) => (map[s.id] = { id: s.id, name: s.name }))
        setSuppliers(map)
      } else {
        setSuppliers({})
      }

      const billIds = Array.from(new Set((billData || []).map((b: any) => b.id)))
      if (billIds.length) {
        const { data: payData } = await supabase
          .from("payments")
          .select("id, bill_id, amount")
          .eq("company_id", companyId)
          .in("bill_id", billIds)
        setPayments(payData || [])
      } else {
        setPayments([])
      }
    } finally {
      setLoading(false)
    }
  }

  const openPurchaseReturn = async (bill: Bill, mode: "partial"|"full") => {
    try {
      setReturnMode(mode)
      setReturnBillId(bill.id)
      setReturnBillNumber(bill.bill_number)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return
      const { data: items } = await supabase
        .from("bill_items")
        .select("id, product_id, quantity, unit_price, tax_rate, discount_percent, line_total, products(name)")
        .eq("bill_id", bill.id)
      const rows = (items || []).map((it: any) => ({ id: String(it.id), product_id: String(it.product_id), name: String(it.products?.name || ""), quantity: Number(it.quantity || 0), maxQty: Number(it.quantity || 0), qtyToReturn: mode === "full" ? Number(it.quantity || 0) : 0, unit_price: Number(it.unit_price || 0), tax_rate: Number(it.tax_rate || 0), line_total: Number(it.line_total || 0) }))
      setReturnItems(rows)
      setReturnOpen(true)
    } catch {}
  }

  const submitPurchaseReturn = async () => {
    try {
      if (!returnBillId) return
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return
      const { data: accounts } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name, account_type, sub_type")
        .eq("company_id", companyId)
      const find = (f: (a: any) => boolean) => (accounts || []).find(f)?.id
      const ap = find((a: any) => String(a.sub_type || "").toLowerCase() === "ap") || find((a: any) => String(a.account_name || "").toLowerCase().includes("accounts payable")) || find((a: any) => String(a.account_code || "") === "2000")
      const inventory = find((a: any) => String(a.sub_type || "").toLowerCase() === "inventory")
      const vatRecv = find((a: any) => String(a.sub_type || "").toLowerCase().includes("vat")) || find((a: any) => String(a.account_name || "").toLowerCase().includes("vat receivable")) || find((a: any) => String(a.account_code || "") === "2105")
      // حساب النقد أو البنك لاسترداد المبلغ
      const cash = find((a: any) => String(a.sub_type || "").toLowerCase() === "cash") || find((a: any) => String(a.account_name || "").toLowerCase().includes("cash")) || find((a: any) => String(a.account_code || "") === "1000")
      const toReturn = returnItems.filter((r) => r.qtyToReturn > 0)

      // ===== تعديل كميات بنود فاتورة المورد بحسب المرتجع =====
      for (const r of toReturn) {
        try {
          const idStr = String(r.id || "")
          let curr: any = null
          if (idStr && !idStr.includes("-")) {
            const { data } = await supabase
              .from("bill_items")
              .select("id, quantity, unit_price, discount_percent, returned_quantity")
              .eq("id", idStr)
              .single()
            curr = data || null
          } else {
            const { data } = await supabase
              .from("bill_items")
              .select("id, quantity, unit_price, discount_percent, returned_quantity")
              .eq("bill_id", returnBillId)
              .eq("product_id", r.product_id)
              .limit(1)
            curr = Array.isArray(data) ? (data[0] || null) : null
          }
          if (curr?.id) {
            const oldReturnedQty = Number(curr.returned_quantity || 0)
            const newReturnedQty = oldReturnedQty + Number(r.qtyToReturn || 0)
            await supabase
              .from("bill_items")
              .update({ returned_quantity: newReturnedQty })
              .eq("id", curr.id)
          }
        } catch (_) {}
      }

      const returnedNet = toReturn.reduce((s, r) => s + (r.line_total * (r.qtyToReturn / (r.quantity || 1))), 0)
      const returnedTax = toReturn.reduce((s, r) => s + ((r.line_total * (r.qtyToReturn / (r.quantity || 1))) * (r.tax_rate || 0) / 100), 0)
      const returnTotal = returnedNet + returnedTax

      // ===== جلب معلومات الفاتورة والدفعات =====
      const { data: billRow } = await supabase
        .from("bills")
        .select("supplier_id, bill_number, subtotal, tax_amount, total_amount, paid_amount, status, returned_amount")
        .eq("id", returnBillId)
        .single()

      if (!billRow) return

      const oldPaid = Number(billRow.paid_amount || 0)
      const oldReturned = Number(billRow.returned_amount || 0)
      const oldTotal = Number(billRow.total_amount || 0)
      const newReturned = oldReturned + returnTotal
      const newTotal = Math.max(oldTotal - returnTotal, 0)
      const refundAmount = Math.max(0, oldPaid - newTotal)

      // ===== البحث عن الحساب الذي تم الدفع منه =====
      let paidAccount: string | null = null
      try {
        const { data: billPays } = await supabase
          .from("payments")
          .select("account_id")
          .eq("bill_id", returnBillId)
          .not("account_id", "is", null)
          .limit(1)
        paidAccount = (billPays && billPays[0]?.account_id) ? String(billPays[0].account_id) : cash
      } catch {
        paidAccount = cash
      }

      // ===== قيد مرتجع المشتريات =====
      // القيد المحاسبي الصحيح للمرتجع:
      // مدين: ذمم الموردين (AP) - تقليل المستحق للمورد
      // دائن: المخزون - خروج البضاعة المرتجعة
      // دائن: ضريبة المشتريات (إن وجدت)
      // إذا كان هناك مبلغ مسترد:
      // مدين: النقد/البنك - استلام المبلغ المسترد
      // دائن: ذمم الموردين - تسوية الرصيد

      let entryId: string | null = null
      const { data: entry } = await supabase
        .from("journal_entries")
        .insert({
          company_id: companyId,
          reference_type: "purchase_return",
          reference_id: returnBillId,
          entry_date: new Date().toISOString().slice(0,10),
          description: `مرتجع فاتورة مورد ${returnBillNumber}${returnMode === "partial" ? " (جزئي)" : " (كامل)"}`
        })
        .select()
        .single()
      entryId = entry?.id ? String(entry.id) : null

      if (entryId) {
        const lines: any[] = []
        // مدين: ذمم الموردين (تقليل المستحق)
        if (ap && returnTotal > 0) {
          lines.push({ journal_entry_id: entryId, account_id: ap, debit_amount: returnTotal, credit_amount: 0, description: "تقليل ذمم الموردين - مرتجع" })
        }
        // دائن: المخزون (خروج البضاعة)
        if (inventory && returnedNet > 0) {
          lines.push({ journal_entry_id: entryId, account_id: inventory, debit_amount: 0, credit_amount: returnedNet, description: "خروج مخزون - مرتجع مشتريات" })
        }
        // دائن: ضريبة المشتريات
        if (vatRecv && returnedTax > 0) {
          lines.push({ journal_entry_id: entryId, account_id: vatRecv, debit_amount: 0, credit_amount: returnedTax, description: "عكس ضريبة المشتريات" })
        }
        if (lines.length > 0) await supabase.from("journal_entry_lines").insert(lines)
      }

      // ===== حركات المخزون - خصم الكميات المرتجعة من المخزون =====
      if (toReturn.length > 0) {
        const invTx = toReturn.map((r) => ({
          company_id: companyId,
          product_id: r.product_id,
          transaction_type: "purchase_return", // نوع العملية: مرتجع مشتريات (stock out)
          quantity_change: -r.qtyToReturn, // كمية سالبة لأنها تخرج من المخزون
          reference_id: returnBillId,
          journal_entry_id: entryId,
          notes: returnMode === "partial" ? "مرتجع جزئي لفاتورة المورد" : "مرتجع كامل لفاتورة المورد"
        }))
        await supabase.from("inventory_transactions").upsert(invTx, { onConflict: "journal_entry_id,product_id,transaction_type" })

        // تحديث كمية المخزون في جدول المنتجات
        for (const r of toReturn) {
          try {
            const { data: prod } = await supabase
              .from("products")
              .select("id, quantity_on_hand")
              .eq("id", r.product_id)
              .single()
            if (prod) {
              const newQty = Math.max(0, Number(prod.quantity_on_hand || 0) - Number(r.qtyToReturn || 0))
              await supabase
                .from("products")
                .update({ quantity_on_hand: newQty })
                .eq("id", r.product_id)
            }
          } catch {}
        }
      }

      // ===== تحديث الفاتورة الأصلية =====
      const newPaid = Math.min(oldPaid, newTotal)
      const returnStatus = newTotal === 0 ? "full" : "partial"
      let newStatus: string = billRow.status
      if (newTotal === 0) newStatus = "fully_returned"
      else if (returnStatus === "partial") newStatus = "partially_returned"
      else if (newPaid >= newTotal) newStatus = "paid"
      else if (newPaid > 0) newStatus = "partially_paid"
      else newStatus = "sent"

      await supabase
        .from("bills")
        .update({
          total_amount: newTotal,
          paid_amount: newPaid,
          status: newStatus,
          returned_amount: newReturned,
          return_status: returnStatus
        })
        .eq("id", returnBillId)

      // ===== إنشاء قيد استرداد المبلغ للخزنة/البنك =====
      if (refundAmount > 0 && paidAccount) {
        const { data: refundEntry } = await supabase
          .from("journal_entries")
          .insert({
            company_id: companyId,
            reference_type: "purchase_return_refund",
            reference_id: returnBillId,
            entry_date: new Date().toISOString().slice(0,10),
            description: `استرداد مبلغ مرتجع فاتورة مورد ${returnBillNumber}`
          })
          .select()
          .single()

        if (refundEntry?.id) {
          const refundLines = [
            { journal_entry_id: refundEntry.id, account_id: paidAccount, debit_amount: refundAmount, credit_amount: 0, description: "استرداد مبلغ المرتجع" },
            { journal_entry_id: refundEntry.id, account_id: ap, debit_amount: 0, credit_amount: refundAmount, description: "تسوية ذمم الموردين" }
          ]
          await supabase.from("journal_entry_lines").insert(refundLines)
        }

        // إنشاء سجل دفعة استرداد
        const payload: any = {
          company_id: companyId,
          supplier_id: billRow.supplier_id,
          bill_id: returnBillId,
          payment_date: new Date().toISOString().slice(0,10),
          amount: -refundAmount, // سالب لأنه استرداد
          payment_method: "refund",
          reference_number: `REF-${returnBillId.slice(0,8)}`,
          notes: `استرداد نقدي بسبب مرتجع فاتورة مورد ${billRow.bill_number}`,
          account_id: paidAccount,
        }
        try {
          const { error: payErr } = await supabase.from("payments").insert(payload)
          if (payErr) {
            const msg = String(payErr?.message || "")
            if (msg.toLowerCase().includes("account_id")) {
              const fallback = { ...payload }
              delete (fallback as any).account_id
              await supabase.from("payments").insert(fallback)
            }
          }
        } catch {}
      }

      setReturnOpen(false)
      setReturnItems([])
      await loadData()
    } catch {}
  }

  const paidByBill: Record<string, number> = useMemo(() => {
    const agg: Record<string, number> = {}
    payments.forEach((p) => {
      const key = p.bill_id || ""
      agg[key] = (agg[key] || 0) + (p.amount || 0)
    })
    return agg
  }, [payments])

  return (
    <PageContainer>
      <PageHeader
        title="فواتير الموردين"
        titleEn="Supplier Bills"
        description="فواتير الموردين المسجلة مع الأرصدة والمدفوعات"
        descriptionEn="Registered supplier bills with balances and payments"
        icon={Receipt}
        iconColor="orange"
        lang={appLang}
      >
        <div className="flex items-center gap-2 flex-wrap">
          {permWrite ? (
            <Link href="/bills/new">
              <Button>
                <Plus className="w-4 h-4 ml-2" />
                {appLang==='en' ? 'Create Purchase Bill' : 'إنشاء فاتورة شراء'}
              </Button>
            </Link>
          ) : null}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <label className="text-sm text-gray-600 dark:text-gray-400">{appLang==='en' ? 'From' : 'من'}</label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full sm:w-40" />
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <label className="text-sm text-gray-600 dark:text-gray-400">{appLang==='en' ? 'To' : 'إلى'}</label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full sm:w-40" />
          </div>
        </div>

        <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
          <CardHeader className="border-b border-gray-100 dark:border-slate-800">
            <CardTitle>{appLang==='en' ? 'Bills List' : 'قائمة الفواتير'}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="border-b bg-gray-50 dark:bg-slate-800/50">
                    <tr className="text-right">
                      <th className="p-3 font-semibold text-gray-600 dark:text-gray-300">{appLang==='en' ? 'Bill No.' : 'رقم الفاتورة'}</th>
                      <th className="p-3 font-semibold text-gray-600 dark:text-gray-300">{appLang==='en' ? 'Date' : 'التاريخ'}</th>
                      <th className="p-3 font-semibold text-gray-600 dark:text-gray-300">{appLang==='en' ? 'Supplier' : 'المورد'}</th>
                      <th className="p-3 font-semibold text-gray-600 dark:text-gray-300">{appLang==='en' ? 'Total' : 'الإجمالي'}</th>
                      <th className="p-3 font-semibold text-gray-600 dark:text-gray-300">{appLang==='en' ? 'Paid' : 'المدفوع'}</th>
                      <th className="p-3 font-semibold text-gray-600 dark:text-gray-300">{appLang==='en' ? 'Remaining' : 'المتبقي'}</th>
                      <th className="p-3 font-semibold text-gray-600 dark:text-gray-300">{appLang==='en' ? 'Status' : 'الحالة'}</th>
                      <th className="p-3 font-semibold text-gray-600 dark:text-gray-300">{appLang==='en' ? 'Actions' : 'الإجراءات'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                    {bills.map((b) => {
                      const paid = paidByBill[b.id] || 0
                      const remaining = Math.max((b.total_amount || 0) - paid, 0)
                      return (
                        <tr key={b.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="p-3">
                            <Link href={`/bills/${b.id}`} className="text-blue-600 hover:underline">{b.bill_number}</Link>
                            </td>
                            <td className="p-2">{new Date(b.bill_date).toLocaleDateString(appLang==='en' ? 'en' : 'ar')}</td>
                            <td className="p-2">{suppliers[b.supplier_id]?.name || b.supplier_id}</td>
                            <td className="p-2">{(b.total_amount || 0).toFixed(2)}</td>
                            <td className="p-2">{paid.toFixed(2)}</td>
                            <td className="p-2 font-semibold">{remaining.toFixed(2)}</td>
                            <td className="p-2">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(b.status)}`}>
                                {getStatusLabel(b.status)}
                              </span>
                            </td>
                            <td className="p-2">
                              <div className="flex gap-2 flex-wrap">
                                <Link href={`/bills/${b.id}`} className="px-3 py-2 border rounded hover:bg-gray-100 dark:hover:bg-slate-800">{appLang==='en' ? 'Details' : 'تفاصيل'}</Link>
                                <Button variant="outline" size="sm" onClick={() => openPurchaseReturn(b, "partial")}>{appLang==='en' ? 'Partial Return' : 'مرتجع جزئي'}</Button>
                                <Button variant="outline" size="sm" onClick={() => openPurchaseReturn(b, "full")}>{appLang==='en' ? 'Full Return' : 'مرتجع كامل'}</Button>
                              </div>
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
      </PageHeader>
    </PageContainer>
    <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
      <DialogContent dir={appLang==='en' ? 'ltr' : 'rtl'}>
        <DialogHeader>
          <DialogTitle>{appLang==='en' ? (returnMode==='full' ? 'Full Return' : 'Partial Return') : (returnMode==='full' ? 'مرتجع كامل' : 'مرتجع جزئي')}</DialogTitle>
          <DialogDescription className="sr-only">معالجة مرتجع فاتورة المورد</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-sm">{appLang==='en' ? 'Bill' : 'فاتورة المورد'}: <span className="font-semibold">{returnBillNumber}</span></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="p-2 text-right">{appLang==='en' ? 'Product' : 'المنتج'}</th>
                  <th className="p-2 text-right">{appLang==='en' ? 'Qty' : 'الكمية'}</th>
                  <th className="p-2 text-right">{appLang==='en' ? 'Return' : 'مرتجع'}</th>
                </tr>
              </thead>
              <tbody>
                {returnItems.map((it, idx) => (
                  <tr key={it.id} className="border-t">
                    <td className="p-2">{it.name || it.product_id}</td>
                    <td className="p-2 text-right">{it.quantity}</td>
                    <td className="p-2 text-right">
                      <Input type="number" min={0} max={it.maxQty} value={it.qtyToReturn} disabled={returnMode==='full'} onChange={(e) => {
                        const v = Math.max(0, Math.min(Number(e.target.value || 0), it.maxQty))
                        setReturnItems((prev) => prev.map((r, i) => i===idx ? { ...r, qtyToReturn: v } : r))
                      }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setReturnOpen(false)}>{appLang==='en' ? 'Cancel' : 'إلغاء'}</Button>
          <Button onClick={submitPurchaseReturn}>{appLang==='en' ? 'Confirm' : 'تأكيد'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
