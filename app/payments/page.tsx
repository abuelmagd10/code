"use client"

import { useEffect, useMemo, useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { useSupabase } from "@/lib/supabase/hooks"

interface Customer { id: string; name: string }
interface Supplier { id: string; name: string }
interface Payment { id: string; customer_id?: string; supplier_id?: string; invoice_id?: string | null; purchase_order_id?: string | null; bill_id?: string | null; payment_date: string; amount: number; payment_method?: string; reference_number?: string; notes?: string }
interface InvoiceRow { id: string; invoice_number: string; total_amount: number; paid_amount: number; status: string }
interface PORow { id: string; po_number: string; total_amount: number; received_amount: number; status: string }
interface BillRow { id: string; bill_number: string; total_amount: number; paid_amount: number; status: string }

export default function PaymentsPage() {
  const supabase = useSupabase()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [customerPayments, setCustomerPayments] = useState<Payment[]>([])
  const [supplierPayments, setSupplierPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)

  // New payment form states
  const [newCustPayment, setNewCustPayment] = useState({ customer_id: "", amount: 0, date: new Date().toISOString().slice(0, 10), method: "cash", ref: "", notes: "" })
  const [newSuppPayment, setNewSuppPayment] = useState({ supplier_id: "", amount: 0, date: new Date().toISOString().slice(0, 10), method: "cash", ref: "", notes: "" })

  // Apply dialogs
  const [applyInvoiceOpen, setApplyInvoiceOpen] = useState(false)
  const [applyPoOpen, setApplyPoOpen] = useState(false)
  const [applyBillOpen, setApplyBillOpen] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const [customerInvoices, setCustomerInvoices] = useState<InvoiceRow[]>([])
  const [supplierPOs, setSupplierPOs] = useState<PORow[]>([])
  const [supplierBills, setSupplierBills] = useState<BillRow[]>([])
  const [applyAmount, setApplyAmount] = useState<number>(0)
  const [applyDocId, setApplyDocId] = useState<string>("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        setLoading(true)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data: company } = await supabase.from("companies").select("id").eq("user_id", user.id).single()
        if (!company) return

        const { data: custs } = await supabase.from("customers").select("id, name").eq("company_id", company.id)
        setCustomers(custs || [])
        const { data: supps } = await supabase.from("suppliers").select("id, name").eq("company_id", company.id)
        setSuppliers(supps || [])

        const { data: custPays } = await supabase
          .from("payments")
          .select("*")
          .eq("company_id", company.id)
          .not("customer_id", "is", null)
          .order("payment_date", { ascending: false })
        setCustomerPayments(custPays || [])

        const { data: suppPays } = await supabase
          .from("payments")
          .select("*")
          .eq("company_id", company.id)
          .not("supplier_id", "is", null)
          .order("payment_date", { ascending: false })
        setSupplierPayments(suppPays || [])
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const createCustomerPayment = async () => {
    try {
      setSaving(true)
      if (!newCustPayment.customer_id || newCustPayment.amount <= 0) return
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: company } = await supabase.from("companies").select("id").eq("user_id", user.id).single()
      if (!company) return
      const { error } = await supabase.from("payments").insert({
        company_id: company.id,
        customer_id: newCustPayment.customer_id,
        payment_date: newCustPayment.date,
        amount: newCustPayment.amount,
        payment_method: newCustPayment.method,
        reference_number: newCustPayment.ref || null,
        notes: newCustPayment.notes || null,
      })
      if (error) throw error
      setNewCustPayment({ customer_id: "", amount: 0, date: newCustPayment.date, method: "cash", ref: "", notes: "" })
      // reload list
      const { data: custPays } = await supabase
        .from("payments").select("*")
        .eq("company_id", company.id)
        .not("customer_id", "is", null)
        .order("payment_date", { ascending: false })
      setCustomerPayments(custPays || [])
    } catch (err) {
      console.error("Error creating customer payment:", err)
    } finally {
      setSaving(false)
    }
  }

  const createSupplierPayment = async () => {
    try {
      setSaving(true)
      if (!newSuppPayment.supplier_id || newSuppPayment.amount <= 0) return
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: company } = await supabase.from("companies").select("id").eq("user_id", user.id).single()
      if (!company) return
      const { error } = await supabase.from("payments").insert({
        company_id: company.id,
        supplier_id: newSuppPayment.supplier_id,
        payment_date: newSuppPayment.date,
        amount: newSuppPayment.amount,
        payment_method: newSuppPayment.method,
        reference_number: newSuppPayment.ref || null,
        notes: newSuppPayment.notes || null,
      })
      if (error) throw error
      setNewSuppPayment({ supplier_id: "", amount: 0, date: newSuppPayment.date, method: "cash", ref: "", notes: "" })
      const { data: suppPays } = await supabase
        .from("payments").select("*")
        .eq("company_id", company.id)
        .not("supplier_id", "is", null)
        .order("payment_date", { ascending: false })
      setSupplierPayments(suppPays || [])
    } catch (err) {
      console.error("Error creating supplier payment:", err)
    } finally {
      setSaving(false)
    }
  }

  const findAccountIds = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data: company } = await supabase.from("companies").select("id").eq("user_id", user.id).single()
    if (!company) return null
    const { data: accounts } = await supabase
      .from("chart_of_accounts")
      .select("id, account_code, account_type, account_name")
      .eq("company_id", company.id)
    if (!accounts) return null
    const byCode = (code: string) => accounts.find((a: any) => a.account_code?.toUpperCase() === code)?.id
    const byType = (type: string) => accounts.find((a: any) => a.account_type === type)?.id
    const byNameIncludes = (name: string) => accounts.find((a: any) => (a.account_name || "").toLowerCase().includes(name.toLowerCase()))?.id
    const ar = byCode("AR") || byNameIncludes("receivable") || byType("asset")
    const ap = byCode("AP") || byNameIncludes("payable") || byType("liability")
    const cash = byCode("CASH") || byNameIncludes("cash") || byType("asset")
    return { companyId: company.id, ar, ap, cash }
  }

  const openApplyToInvoice = async (p: Payment) => {
    setSelectedPayment(p)
    setApplyAmount(p.amount)
    setApplyDocId("")
    const { data: invs } = await supabase
      .from("invoices")
      .select("id, invoice_number, total_amount, paid_amount, status")
      .eq("customer_id", p.customer_id)
      .in("status", ["sent", "partially_paid"])
    setCustomerInvoices(invs || [])
    setApplyInvoiceOpen(true)
  }

  const openApplyToPO = async (p: Payment) => {
    setSelectedPayment(p)
    setApplyAmount(p.amount)
    setApplyDocId("")
    const { data: pos } = await supabase
      .from("purchase_orders")
      .select("id, po_number, total_amount, received_amount, status")
      .eq("supplier_id", p.supplier_id)
      .in("status", ["received_partial", "received"])
    setSupplierPOs(pos || [])
    setApplyPoOpen(true)
  }

  const openApplyToBill = async (p: Payment) => {
    setSelectedPayment(p)
    setApplyAmount(p.amount)
    setApplyDocId("")
    const { data: bills } = await supabase
      .from("bills")
      .select("id, bill_number, total_amount, paid_amount, status")
      .eq("supplier_id", p.supplier_id)
      .in("status", ["draft", "sent", "partially_paid"]) // قابلة للدفع
    setSupplierBills(bills || [])
    setApplyBillOpen(true)
  }

  const applyPaymentToInvoice = async () => {
    try {
      if (!selectedPayment || !applyDocId || applyAmount <= 0) return
      setSaving(true)
      const mapping = await findAccountIds()
      if (!mapping || !mapping.ar || !mapping.cash) return
      // Load invoice to compute remaining
      const { data: inv } = await supabase.from("invoices").select("*").eq("id", applyDocId).single()
      if (!inv) return
      const remaining = Math.max(Number(inv.total_amount || 0) - Number(inv.paid_amount || 0), 0)
      const amount = Math.min(applyAmount, remaining)

      // Update invoice
      const newPaid = Number(inv.paid_amount || 0) + amount
      const newStatus = newPaid >= Number(inv.total_amount || 0) ? "paid" : "partially_paid"
      const { error: invErr } = await supabase.from("invoices").update({ paid_amount: newPaid, status: newStatus }).eq("id", inv.id)
      if (invErr) throw invErr

      // Update payment to link invoice
      const { error: payErr } = await supabase.from("payments").update({ invoice_id: inv.id }).eq("id", selectedPayment.id)
      if (payErr) throw payErr

      // Post journal
      const { data: entry, error: entryErr } = await supabase
        .from("journal_entries").insert({
          company_id: mapping.companyId,
          reference_type: "invoice_payment",
          reference_id: inv.id,
          entry_date: selectedPayment.payment_date,
          description: `دفعة مرتبطة بفاتورة ${inv.invoice_number}`,
        }).select().single()
      if (entryErr) throw entryErr
      const { error: linesErr } = await supabase.from("journal_entry_lines").insert([
        { journal_entry_id: entry.id, account_id: mapping.cash, debit_amount: amount, credit_amount: 0, description: "نقد/بنك" },
        { journal_entry_id: entry.id, account_id: mapping.ar, debit_amount: 0, credit_amount: amount, description: "ذمم مدينة" },
      ])
      if (linesErr) throw linesErr

      // refresh lists
      setApplyInvoiceOpen(false)
      setSelectedPayment(null)
      const { data: custPays } = await supabase
        .from("payments").select("*")
        .eq("company_id", mapping.companyId)
        .not("customer_id", "is", null)
        .order("payment_date", { ascending: false })
      setCustomerPayments(custPays || [])
    } catch (err) {
      console.error("Error applying payment to invoice:", err)
    } finally {
      setSaving(false)
    }
  }

  const applyPaymentToPO = async () => {
    try {
      if (!selectedPayment || !applyDocId || applyAmount <= 0) return
      setSaving(true)
      const mapping = await findAccountIds()
      if (!mapping || !mapping.ap || !mapping.cash) return
      const { data: po } = await supabase.from("purchase_orders").select("*").eq("id", applyDocId).single()
      if (!po) return
      const remaining = Math.max(Number(po.total_amount || 0) - Number(po.received_amount || 0), 0)
      const amount = Math.min(applyAmount, remaining)

      // Update PO
      const newReceived = Number(po.received_amount || 0) + amount
      const newStatus = newReceived >= Number(po.total_amount || 0) ? "received" : "received_partial"
      const { error: poErr } = await supabase.from("purchase_orders").update({ received_amount: newReceived, status: newStatus }).eq("id", po.id)
      if (poErr) throw poErr

      // Link payment
      const { error: payErr } = await supabase.from("payments").update({ purchase_order_id: po.id }).eq("id", selectedPayment.id)
      if (payErr) throw payErr

      // Post journal
      const { data: entry, error: entryErr } = await supabase
        .from("journal_entries").insert({
          company_id: mapping.companyId,
          reference_type: "po_payment",
          reference_id: po.id,
          entry_date: selectedPayment.payment_date,
          description: `سداد مرتبط بأمر شراء ${po.po_number}`,
        }).select().single()
      if (entryErr) throw entryErr
      const { error: linesErr } = await supabase.from("journal_entry_lines").insert([
        { journal_entry_id: entry.id, account_id: mapping.ap, debit_amount: amount, credit_amount: 0, description: "حسابات دائنة" },
        { journal_entry_id: entry.id, account_id: mapping.cash, debit_amount: 0, credit_amount: amount, description: "نقد/بنك" },
      ])
      if (linesErr) throw linesErr

      setApplyPoOpen(false)
      setSelectedPayment(null)
      const { data: suppPays } = await supabase
        .from("payments").select("*")
        .eq("company_id", mapping.companyId)
        .not("supplier_id", "is", null)
        .order("payment_date", { ascending: false })
      setSupplierPayments(suppPays || [])
    } catch (err) {
      console.error("Error applying payment to PO:", err)
    } finally {
      setSaving(false)
    }
  }

  const applyPaymentToBill = async () => {
    try {
      if (!selectedPayment || !applyDocId || applyAmount <= 0) return
      setSaving(true)
      const mapping = await findAccountIds()
      if (!mapping || !mapping.ap || !mapping.cash) return
      const { data: bill } = await supabase.from("bills").select("*").eq("id", applyDocId).single()
      if (!bill) return
      const remaining = Math.max(Number(bill.total_amount || 0) - Number(bill.paid_amount || 0), 0)
      const amount = Math.min(applyAmount, remaining)

      // Update bill
      const newPaid = Number(bill.paid_amount || 0) + amount
      const newStatus = newPaid >= Number(bill.total_amount || 0) ? "paid" : "partially_paid"
      const { error: billErr } = await supabase.from("bills").update({ paid_amount: newPaid, status: newStatus }).eq("id", bill.id)
      if (billErr) throw billErr

      // Link payment
      const { error: payErr } = await supabase.from("payments").update({ bill_id: bill.id }).eq("id", selectedPayment.id)
      if (payErr) throw payErr

      // Post journal
      const { data: entry, error: entryErr } = await supabase
        .from("journal_entries").insert({
          company_id: mapping.companyId,
          reference_type: "bill_payment",
          reference_id: bill.id,
          entry_date: selectedPayment.payment_date,
          description: `سداد مرتبط بفاتورة مورد ${bill.bill_number}`,
        }).select().single()
      if (entryErr) throw entryErr
      const { error: linesErr } = await supabase.from("journal_entry_lines").insert([
        { journal_entry_id: entry.id, account_id: mapping.ap, debit_amount: amount, credit_amount: 0, description: "حسابات دائنة" },
        { journal_entry_id: entry.id, account_id: mapping.cash, debit_amount: 0, credit_amount: amount, description: "نقد/بنك" },
      ])
      if (linesErr) throw linesErr

      setApplyBillOpen(false)
      setSelectedPayment(null)
      const { data: suppPays } = await supabase
        .from("payments").select("*")
        .eq("company_id", mapping.companyId)
        .not("supplier_id", "is", null)
        .order("payment_date", { ascending: false })
      setSupplierPayments(suppPays || [])
    } catch (err) {
      console.error("Error applying payment to bill:", err)
    } finally { setSaving(false) }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
        <Sidebar />
        <main className="flex-1 md:mr-64 p-4 md:p-8">
          <p className="py-8 text-center">جاري التحميل...</p>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-4 md:p-8 space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">المدفوعات</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">إنشاء واستعراض مدفوعات العملاء والموردين وتطبيقها على المستندات</p>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-6">
            <h2 className="text-xl font-semibold">مدفوعات العملاء</h2>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
              <div>
                <Label>العميل</Label>
                <select className="w-full border rounded px-2 py-1" value={newCustPayment.customer_id} onChange={(e) => setNewCustPayment({ ...newCustPayment, customer_id: e.target.value })}>
                  <option value="">اختر عميلًا</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>المبلغ</Label>
                <Input type="number" min={0} step={0.01} value={newCustPayment.amount} onChange={(e) => setNewCustPayment({ ...newCustPayment, amount: Number(e.target.value) })} />
              </div>
              <div>
                <Label>تاريخ</Label>
                <Input type="date" value={newCustPayment.date} onChange={(e) => setNewCustPayment({ ...newCustPayment, date: e.target.value })} />
              </div>
              <div>
                <Label>طريقة</Label>
                <Input value={newCustPayment.method} onChange={(e) => setNewCustPayment({ ...newCustPayment, method: e.target.value })} />
              </div>
              <div className="flex gap-2">
                <Button onClick={createCustomerPayment} disabled={saving || !newCustPayment.customer_id || newCustPayment.amount <= 0}>إنشاء</Button>
              </div>
            </div>

            <div className="border-t pt-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 dark:bg-slate-900">
                    <th className="px-2 py-2 text-right">التاريخ</th>
                    <th className="px-2 py-2 text-right">المبلغ</th>
                    <th className="px-2 py-2 text-right">مرجع</th>
                    <th className="px-2 py-2 text-right">الفاتورة المرتبطة</th>
                    <th className="px-2 py-2 text-right">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {customerPayments.map((p) => (
                    <tr key={p.id} className="border-b">
                      <td className="px-2 py-2">{p.payment_date}</td>
                      <td className="px-2 py-2">{Number(p.amount || 0).toFixed(2)}</td>
                      <td className="px-2 py-2">{p.reference_number || "-"}</td>
                      <td className="px-2 py-2">{p.invoice_id ? p.invoice_id : "غير مرتبط"}</td>
                      <td className="px-2 py-2">
                        {!p.invoice_id && (
                          <Button variant="outline" onClick={() => openApplyToInvoice(p)}>تطبيق على فاتورة</Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 space-y-6">
            <h2 className="text-xl font-semibold">مدفوعات الموردين</h2>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
              <div>
                <Label>المورد</Label>
                <select className="w-full border rounded px-2 py-1" value={newSuppPayment.supplier_id} onChange={(e) => setNewSuppPayment({ ...newSuppPayment, supplier_id: e.target.value })}>
                  <option value="">اختر مورّدًا</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>المبلغ</Label>
                <Input type="number" min={0} step={0.01} value={newSuppPayment.amount} onChange={(e) => setNewSuppPayment({ ...newSuppPayment, amount: Number(e.target.value) })} />
              </div>
              <div>
                <Label>تاريخ</Label>
                <Input type="date" value={newSuppPayment.date} onChange={(e) => setNewSuppPayment({ ...newSuppPayment, date: e.target.value })} />
              </div>
              <div>
                <Label>طريقة</Label>
                <Input value={newSuppPayment.method} onChange={(e) => setNewSuppPayment({ ...newSuppPayment, method: e.target.value })} />
              </div>
              <div className="flex gap-2">
                <Button onClick={createSupplierPayment} disabled={saving || !newSuppPayment.supplier_id || newSuppPayment.amount <= 0}>إنشاء</Button>
              </div>
            </div>

            <div className="border-t pt-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 dark:bg-slate-900">
                    <th className="px-2 py-2 text-right">التاريخ</th>
                    <th className="px-2 py-2 text-right">المبلغ</th>
                    <th className="px-2 py-2 text-right">مرجع</th>
                    <th className="px-2 py-2 text-right">فاتورة المورد المرتبطة</th>
                    <th className="px-2 py-2 text-right">أمر الشراء المرتبط</th>
                    <th className="px-2 py-2 text-right">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {supplierPayments.map((p) => (
                    <tr key={p.id} className="border-b">
                      <td className="px-2 py-2">{p.payment_date}</td>
                      <td className="px-2 py-2">{Number(p.amount || 0).toFixed(2)}</td>
                      <td className="px-2 py-2">{p.reference_number || "-"}</td>
                      <td className="px-2 py-2">{p.bill_id ? p.bill_id : "غير مرتبط"}</td>
                      <td className="px-2 py-2">{p.purchase_order_id ? p.purchase_order_id : "غير مرتبط"}</td>
                      <td className="px-2 py-2">
                        <div className="flex gap-2">
                          {!p.bill_id && (
                            <Button variant="outline" onClick={() => openApplyToBill(p)}>تطبيق على فاتورة</Button>
                          )}
                          {!p.purchase_order_id && (
                            <Button variant="ghost" onClick={() => openApplyToPO(p)}>على أمر شراء</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Apply to Invoice Dialog */}
        <Dialog open={applyInvoiceOpen} onOpenChange={setApplyInvoiceOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>تطبيق دفعة على فاتورة</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>الوثيقة</Label>
                <select className="w-full border rounded px-2 py-1" value={applyDocId} onChange={(e) => setApplyDocId(e.target.value)}>
                  <option value="">اختر فاتورة</option>
                  {customerInvoices.map((inv) => {
                    const outstanding = Math.max(Number(inv.total_amount || 0) - Number(inv.paid_amount || 0), 0)
                    return (
                      <option key={inv.id} value={inv.id}>
                        {inv.invoice_number} — متبقّي {outstanding.toFixed(2)}
                      </option>
                    )
                  })}
                </select>
              </div>
              <div>
                <Label>المبلغ للتطبيق</Label>
                <Input type="number" min={0} step={0.01} value={applyAmount} onChange={(e) => setApplyAmount(Number(e.target.value))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setApplyInvoiceOpen(false)}>إلغاء</Button>
              <Button onClick={applyPaymentToInvoice} disabled={saving || !applyDocId || applyAmount <= 0}>تطبيق</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Apply to PO Dialog */}
        <Dialog open={applyPoOpen} onOpenChange={setApplyPoOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>تطبيق سداد على أمر شراء</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>الوثيقة</Label>
                <select className="w-full border rounded px-2 py-1" value={applyDocId} onChange={(e) => setApplyDocId(e.target.value)}>
                  <option value="">اختر أمر شراء</option>
                  {supplierPOs.map((po) => {
                    const outstanding = Math.max(Number(po.total_amount || 0) - Number(po.received_amount || 0), 0)
                    return (
                      <option key={po.id} value={po.id}>
                        {po.po_number} — متبقّي {outstanding.toFixed(2)}
                      </option>
                    )
                  })}
                </select>
              </div>
              <div>
                <Label>المبلغ للتطبيق</Label>
                <Input type="number" min={0} step={0.01} value={applyAmount} onChange={(e) => setApplyAmount(Number(e.target.value))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setApplyPoOpen(false)}>إلغاء</Button>
              <Button onClick={applyPaymentToPO} disabled={saving || !applyDocId || applyAmount <= 0}>تطبيق</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Apply to Bill Dialog */}
        <Dialog open={applyBillOpen} onOpenChange={setApplyBillOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>تطبيق سداد على فاتورة مورد</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>الوثيقة</Label>
                <select className="w-full border rounded px-2 py-1" value={applyDocId} onChange={(e) => setApplyDocId(e.target.value)}>
                  <option value="">اختر فاتورة</option>
                  {supplierBills.map((b) => {
                    const outstanding = Math.max(Number(b.total_amount || 0) - Number(b.paid_amount || 0), 0)
                    return (
                      <option key={b.id} value={b.id}>
                        {b.bill_number} — متبقّي {outstanding.toFixed(2)}
                      </option>
                    )
                  })}
                </select>
              </div>
              <div>
                <Label>المبلغ للتطبيق</Label>
                <Input type="number" min={0} step={0.01} value={applyAmount} onChange={(e) => setApplyAmount(Number(e.target.value))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setApplyBillOpen(false)}>إلغاء</Button>
              <Button onClick={applyPaymentToBill} disabled={saving || !applyDocId || applyAmount <= 0}>تطبيق</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}
