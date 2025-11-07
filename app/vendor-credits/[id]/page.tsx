"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import { useSupabase } from "@/lib/supabase/hooks"

type VendorCredit = {
  id: string
  company_id: string
  supplier_id: string
  credit_number: string
  credit_date: string
  subtotal: number
  tax_amount: number
  total_amount: number
  discount_type: string
  discount_value: number
  discount_position: string
  shipping: number
  shipping_tax_rate: number
  adjustment: number
  applied_amount: number
  status: string
  notes: string
}

type Supplier = { id: string; name: string }
type Item = {
  id: string
  description: string
  quantity: number
  unit_price: number
  discount_percent: number
  tax_rate: number
  line_total: number
}

export default function VendorCreditViewPage() {
  const supabase = useSupabase()
  const params = useParams()
  const id = params?.id as string

  const [credit, setCredit] = useState<VendorCredit | null>(null)
  const [supplier, setSupplier] = useState<Supplier | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [applyOpen, setApplyOpen] = useState(false)
  const [bills, setBills] = useState<any[]>([])
  const [selectedBillId, setSelectedBillId] = useState<string>("")
  const [applyAmount, setApplyAmount] = useState<string>("")

  useEffect(() => {
    if (!id) return
    ;(async () => {
      const { data: vc } = await supabase.from("vendor_credits").select("*").eq("id", id).single()
      if (vc) {
        setCredit(vc as any)
        const { data: sup } = await supabase.from("suppliers").select("id, name").eq("id", vc.supplier_id).single()
        setSupplier(sup as any)
        const { data: rows } = await supabase.from("vendor_credit_items").select("id, description, quantity, unit_price, discount_percent, tax_rate, line_total").eq("vendor_credit_id", id)
        setItems((rows || []) as any)
      }
    })()
  }, [id])

  if (!credit) return null

  const remaining = Number(credit.total_amount || 0) - Number(credit.applied_amount || 0)

  async function openApplyDialog() {
    if (!credit) return
    const { data } = await supabase
      .from("bills")
      .select("id, bill_number, total_amount, paid_amount, status")
      .eq("supplier_id", credit.supplier_id)
      .eq("company_id", credit.company_id)
      .in("status", ["draft", "sent", "partially_paid"]) // لا تعرض الفواتير المسددة كلياً
      .order("bill_date", { ascending: false })
    const rows = (data || []).map((b: any) => ({
      ...b,
      remaining: Number(b.total_amount || 0) - Number(b.paid_amount || 0),
    })).filter((b: any) => b.remaining > 0)
    setBills(rows)
    setSelectedBillId(rows[0]?.id || "")
    setApplyAmount(remaining.toFixed(2))
    setApplyOpen(true)
  }

  async function applyCreditToBill() {
    if (!credit || !selectedBillId) return
    const bill = bills.find(b => b.id === selectedBillId)
    const amount = Number(applyAmount || 0)
    const creditRemaining = Number(credit.total_amount || 0) - Number(credit.applied_amount || 0)
    const billRemaining = Number(bill?.remaining || 0)
    if (amount <= 0) return alert("يرجى إدخال مبلغ صالح")
    if (amount > creditRemaining) return alert("المبلغ يتجاوز المتبقي في الإشعار")
    if (amount > billRemaining) return alert("المبلغ يتجاوز المتبقي في الفاتورة")

    // سجّل ربط التطبيق
    const { error: insErr } = await supabase.from("vendor_credit_applications").insert({
      company_id: credit.company_id,
      vendor_credit_id: credit.id,
      bill_id: selectedBillId,
      applied_date: new Date().toISOString().slice(0, 10),
      amount_applied: amount,
      note: `تطبيق إشعار ${credit.credit_number} على فاتورة`,
    })
    if (insErr) return alert("فشل حفظ التطبيق: " + insErr.message)

    // حدّث مبالغ الإشعار والفاتورة وحالاتهما
    const newApplied = Number(credit.applied_amount || 0) + amount
    const creditStatus = newApplied >= Number(credit.total_amount || 0) ? "applied" : "partially_applied"
    const { error: upCreditErr } = await supabase
      .from("vendor_credits")
      .update({ applied_amount: newApplied, status: creditStatus })
      .eq("id", credit.id)
    if (upCreditErr) return alert("فشل تحديث الإشعار: " + upCreditErr.message)

    const newBillPaid = Number(bill.paid_amount || 0) + amount
    const billStatus = newBillPaid >= Number(bill.total_amount || 0) ? "paid" : "partially_paid"
    const { error: upBillErr } = await supabase
      .from("bills")
      .update({ paid_amount: newBillPaid, status: billStatus })
      .eq("id", bill.id)
    if (upBillErr) return alert("فشل تحديث الفاتورة: " + upBillErr.message)

    // أعد التحميل لعرض القيم الجديدة
    const { data: vc } = await supabase.from("vendor_credits").select("*").eq("id", credit.id).single()
    setCredit(vc as any)
    setApplyOpen(false)
  }

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-4 md:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">عرض إشعار دائن</h1>
          <div className="flex gap-2">
            <Link href="/vendor-credits"><Button variant="outline">رجوع للقائمة</Button></Link>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>تفاصيل الإشعار</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-gray-600">رقم الإشعار</div>
                <div className="font-medium">{credit.credit_number}</div>
              </div>
              <div>
                <div className="text-gray-600">التاريخ</div>
                <div className="font-medium">{credit.credit_date}</div>
              </div>
              <div>
                <div className="text-gray-600">المورد</div>
                <div className="font-medium">{supplier?.name || "—"}</div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-600">
                    <th className="text-right p-2">الوصف</th>
                    <th className="text-right p-2">الكمية</th>
                    <th className="text-right p-2">سعر الوحدة</th>
                    <th className="text-right p-2">خصم%</th>
                    <th className="text-right p-2">الضريبة%</th>
                    <th className="text-right p-2">الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(it => (
                    <tr key={it.id} className="border-t">
                      <td className="p-2">{it.description}</td>
                      <td className="p-2 text-right">{it.quantity}</td>
                      <td className="p-2 text-right">{Number(it.unit_price || 0).toFixed(2)}</td>
                      <td className="p-2 text-right">{Number(it.discount_percent || 0).toFixed(2)}</td>
                      <td className="p-2 text-right">{Number(it.tax_rate || 0).toFixed(2)}</td>
                      <td className="p-2 text-right">{Number(it.line_total || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="border-t pt-4 text-sm flex flex-col items-end gap-1">
              <div>المجموع قبل الضريبة: {Number(credit.subtotal || 0).toFixed(2)}</div>
              <div>ضريبة: {Number(credit.tax_amount || 0).toFixed(2)}</div>
              <div>شحن: {Number(credit.shipping || 0).toFixed(2)} | الضريبة {Number(credit.shipping_tax_rate || 0).toFixed(2)}%</div>
              <div>تسوية: {Number(credit.adjustment || 0).toFixed(2)}</div>
              <div>إجمالي: <span className="font-semibold">{Number(credit.total_amount || 0).toFixed(2)}</span></div>
              <div>المطبّق: {Number(credit.applied_amount || 0).toFixed(2)} | المتبقي: {remaining.toFixed(2)}</div>
              <div>الحالة: {credit.status}</div>
            </div>

            <div className="flex justify-end gap-2">
              <Button onClick={openApplyDialog}>تطبيق على فاتورة مورد</Button>
            </div>
          </CardContent>
        </Card>

        <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>تطبيق الإشعار على فاتورة</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <div>المتبقي في الإشعار: <span className="font-medium">{remaining.toFixed(2)}</span></div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-600">
                      <th className="text-right p-2">رقم الفاتورة</th>
                      <th className="text-right p-2">الإجمالي</th>
                      <th className="text-right p-2">المدفوع</th>
                      <th className="text-right p-2">المتبقي</th>
                      <th className="text-right p-2">اختيار</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bills.map(b => (
                      <tr key={b.id} className="border-t">
                        <td className="p-2">{b.bill_number}</td>
                        <td className="p-2 text-right">{Number(b.total_amount || 0).toFixed(2)}</td>
                        <td className="p-2 text-right">{Number(b.paid_amount || 0).toFixed(2)}</td>
                        <td className="p-2 text-right">{Number(b.remaining || 0).toFixed(2)}</td>
                        <td className="p-2 text-right">
                          <input type="radio" name="bill" checked={selectedBillId === b.id} onChange={() => setSelectedBillId(b.id)} />
                        </td>
                      </tr>
                    ))}
                    {bills.length === 0 && (
                      <tr>
                        <td className="p-4 text-center text-gray-500" colSpan={5}>لا توجد فواتير بمبالغ متبقية لهذا المورد</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="grid grid-cols-2 gap-4 items-center">
                <label className="text-gray-600">المبلغ المراد تطبيقه</label>
                <Input value={applyAmount} onChange={e => setApplyAmount(e.target.value)} placeholder="0.00" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setApplyOpen(false)}>إلغاء</Button>
              <Button onClick={applyCreditToBill} disabled={!selectedBillId || bills.length === 0}>تطبيق</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}
