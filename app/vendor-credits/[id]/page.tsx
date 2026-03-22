"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import { toastActionError, toastActionSuccess } from "@/lib/notifications"
import { ArrowRight, FileCheck } from "lucide-react"
import { useRealtimeTable } from "@/hooks/use-realtime-table"
import { useCallback } from "react"

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
  source_purchase_invoice_id?: string | null
  source_purchase_return_id?: string | null
  reference_type?: string | null
  branch_id?: string | null
  cost_center_id?: string | null
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
  const { toast } = useToast()
  const params = useParams()
  const id = params?.id as string
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')

  // تهيئة اللغة بعد hydration
  useEffect(() => {
    try { setAppLang((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') } catch { }
  }, [])

  const [credit, setCredit] = useState<VendorCredit | null>(null)
  const [supplier, setSupplier] = useState<Supplier | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [applyOpen, setApplyOpen] = useState(false)
  const [bills, setBills] = useState<any[]>([])
  const [selectedBillId, setSelectedBillId] = useState<string>("")
  const [applyAmount, setApplyAmount] = useState<string>("")
  const [purchaseReturn, setPurchaseReturn] = useState<any>(null)
  const [sourceBill, setSourceBill] = useState<any>(null)
  const [branch, setBranch] = useState<any>(null)
  const [costCenter, setCostCenter] = useState<any>(null)

  const loadData = useCallback(async () => {
    if (!id) return
    const { data: vc } = await supabase.from("vendor_credits").select("*").eq("id", id).single()
    if (vc) {
      setCredit(vc as any)
      const { data: sup } = await supabase.from("suppliers").select("id, name").eq("id", vc.supplier_id).single()
      setSupplier(sup as any)
      const { data: rows } = await supabase.from("vendor_credit_items").select("id, description, quantity, unit_price, discount_percent, tax_rate, line_total").eq("vendor_credit_id", id)
      setItems((rows || []) as any)

      // جلب معلومات المرتجع المرتبط
      if (vc.source_purchase_return_id) {
        const { data: pr } = await supabase
          .from("purchase_returns")
          .select("id, return_number, return_date, status")
          .eq("id", vc.source_purchase_return_id)
          .single()
        setPurchaseReturn(pr)
      }

      // جلب معلومات الفاتورة المصدر
      if (vc.source_purchase_invoice_id) {
        const { data: bill } = await supabase
          .from("bills")
          .select("id, bill_number, bill_date, status")
          .eq("id", vc.source_purchase_invoice_id)
          .single()
        setSourceBill(bill)
      }

      // جلب معلومات الفرع
      if (vc.branch_id) {
        const { data: br } = await supabase
          .from("branches")
          .select("id, name")
          .eq("id", vc.branch_id)
          .single()
        setBranch(br)
      }

      // جلب معلومات مركز التكلفة
      if (vc.cost_center_id) {
        const { data: cc } = await supabase
          .from("cost_centers")
          .select("id, name")
          .eq("id", vc.cost_center_id)
          .single()
        setCostCenter(cc)
      }
    }
  }, [id, supabase])

  useEffect(() => {
    loadData()
  }, [loadData])

  useRealtimeTable({
    table: 'vendor_credits',
    enabled: !!id,
    onUpdate: (record) => {
      if (record?.id === id) {
        loadData()
      }
    }
  })

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
    if (amount <= 0) { toast({ title: "قيمة غير صحيحة", description: "يرجى إدخال مبلغ صالح", variant: "destructive" }); return }
    if (amount > creditRemaining) { toast({ title: "قيمة غير صحيحة", description: "المبلغ يتجاوز المتبقي في الإشعار", variant: "destructive" }); return }
    if (amount > billRemaining) { toast({ title: "قيمة غير صحيحة", description: "المبلغ يتجاوز المتبقي في الفاتورة", variant: "destructive" }); return }

    // سجّل ربط التطبيق
    const { error: insErr } = await supabase.from("vendor_credit_applications").insert({
      company_id: credit.company_id,
      vendor_credit_id: credit.id,
      bill_id: selectedBillId,
      applied_date: new Date().toISOString().slice(0, 10),
      amount_applied: amount,
      note: `تطبيق إشعار ${credit.credit_number} على فاتورة`,
    })
    if (insErr) { toastActionError(toast, "الحفظ", "التطبيق", "فشل حفظ التطبيق: " + insErr.message); return }

    // حدّث مبالغ الإشعار والفاتورة وحالاتهما
    const newApplied = Number(credit.applied_amount || 0) + amount
    const creditStatus = newApplied >= Number(credit.total_amount || 0) ? "applied" : "partially_applied"
    const { error: upCreditErr } = await supabase
      .from("vendor_credits")
      .update({ applied_amount: newApplied, status: creditStatus })
      .eq("id", credit.id)
    if (upCreditErr) { toastActionError(toast, "التحديث", "الإشعار", "فشل تحديث الإشعار: " + upCreditErr.message); return }

    const newBillPaid = Number(bill.paid_amount || 0) + amount
    const billStatus = newBillPaid >= Number(bill.total_amount || 0) ? "paid" : "partially_paid"
    const { error: upBillErr } = await supabase
      .from("bills")
      .update({ paid_amount: newBillPaid, status: billStatus })
      .eq("id", bill.id)
    if (upBillErr) { toastActionError(toast, "التحديث", "الفاتورة", "فشل تحديث الفاتورة: " + upBillErr.message); return }

    // أعد التحميل لعرض القيم الجديدة
    const { data: vc } = await supabase.from("vendor_credits").select("*").eq("id", credit.id).single()
    setCredit(vc as any)
    toastActionSuccess(toast, "تطبيق", "الإشعار على الفاتورة")
    setApplyOpen(false)
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">

        {/* Header */}
        <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="p-2 sm:p-3 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg sm:rounded-xl flex-shrink-0">
                <FileCheck className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">
                  {appLang === 'en' ? 'Vendor Credit' : 'إشعار دائن'}
                  {credit.credit_number && (
                    <span className="text-gray-400 dark:text-gray-500 font-normal mr-2 text-base sm:text-lg">
                      #{credit.credit_number}
                    </span>
                  )}
                </h1>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1">
                  {appLang === 'en'
                    ? 'View credit note details and apply it to outstanding supplier bills'
                    : 'عرض تفاصيل الإشعار الدائن وتطبيقه على فواتير المورد المستحقة'}
                </p>
                {credit.status === 'open' && (
                  <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mt-1">
                    {appLang === 'en' ? '✅ Credit available for use' : '✅ الإشعار متاح للاستخدام'}
                  </p>
                )}
                {credit.status === 'partially_applied' && (
                  <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mt-1">
                    {appLang === 'en' ? '⏳ Credit partially applied' : '⏳ الإشعار مطبّق جزئياً'}
                  </p>
                )}
                {credit.status === 'applied' && (
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-1">
                    {appLang === 'en' ? '🔒 Credit fully applied' : '🔒 الإشعار مطبّق بالكامل'}
                  </p>
                )}
              </div>
            </div>
            <Link href="/vendor-credits" className="self-start sm:self-auto">
              <Button variant="outline" size="sm" className="text-xs sm:text-sm flex items-center gap-1.5">
                <ArrowRight className="w-3.5 h-3.5" />
                {appLang === 'en' ? 'Back to Credits' : 'العودة للإشعارات'}
              </Button>
            </Link>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{appLang === 'en' ? 'Credit Note Details' : 'تفاصيل الإشعار'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-gray-600">{appLang === 'en' ? 'Credit No.' : 'رقم الإشعار'}</div>
                <div className="font-medium">{credit.credit_number}</div>
              </div>
              <div>
                <div className="text-gray-600">{appLang === 'en' ? 'Date' : 'التاريخ'}</div>
                <div className="font-medium">{credit.credit_date}</div>
              </div>
              <div>
                <div className="text-gray-600">{appLang === 'en' ? 'Supplier' : 'المورد'}</div>
                <div className="font-medium">{supplier?.name || "—"}</div>
              </div>
            </div>

            {/* معلومات المرتجع المرتبط */}
            {(purchaseReturn || sourceBill || branch || costCenter || credit.reference_type === 'purchase_return') && (
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg space-y-2 text-sm">
                <div className="font-semibold text-blue-900 dark:text-blue-100">
                  {appLang === 'en' ? '📋 Source Information' : '📋 معلومات المصدر'}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {credit.reference_type && (
                    <div>
                      <div className="text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Type' : 'النوع'}</div>
                      <div className="font-medium">
                        {credit.reference_type === 'purchase_return' ? (appLang === 'en' ? 'Purchase Return' : 'مرتجع مشتريات') : credit.reference_type}
                      </div>
                    </div>
                  )}
                  {purchaseReturn && (
                    <div>
                      <div className="text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Return Number' : 'رقم المرتجع'}</div>
                      <div className="font-medium">
                        <Link href={`/purchase-returns`} className="text-blue-600 hover:underline">
                          {purchaseReturn.return_number}
                        </Link>
                        <span className="text-xs text-gray-500 mr-2">({purchaseReturn.return_date})</span>
                      </div>
                    </div>
                  )}
                  {sourceBill && (
                    <div>
                      <div className="text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Source Bill' : 'الفاتورة الأصلية'}</div>
                      <div className="font-medium">
                        <Link href={`/bills/${sourceBill.id}`} className="text-blue-600 hover:underline">
                          {sourceBill.bill_number}
                        </Link>
                        <span className="text-xs text-gray-500 mr-2">({sourceBill.bill_date})</span>
                      </div>
                    </div>
                  )}
                  {branch && (
                    <div>
                      <div className="text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Branch' : 'الفرع'}</div>
                      <div className="font-medium">{branch.name}</div>
                    </div>
                  )}
                  {costCenter && (
                    <div>
                      <div className="text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Cost Center' : 'مركز التكلفة'}</div>
                      <div className="font-medium">{costCenter.name}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-600">
                    <th className="text-right p-2">{appLang === 'en' ? 'Description' : 'الوصف'}</th>
                    <th className="text-right p-2">{appLang === 'en' ? 'Quantity' : 'الكمية'}</th>
                    <th className="text-right p-2">{appLang === 'en' ? 'Unit Price' : 'سعر الوحدة'}</th>
                    <th className="text-right p-2">{appLang === 'en' ? 'Discount %' : 'خصم%'}</th>
                    <th className="text-right p-2">{appLang === 'en' ? 'Tax %' : 'الضريبة%'}</th>
                    <th className="text-right p-2">{appLang === 'en' ? 'Total' : 'الإجمالي'}</th>
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
              <div>{appLang === 'en' ? 'Subtotal:' : 'المجموع قبل الضريبة:'} {Number(credit.subtotal || 0).toFixed(2)}</div>
              <div>{appLang === 'en' ? 'Tax:' : 'ضريبة:'} {Number(credit.tax_amount || 0).toFixed(2)}</div>
              <div>{appLang === 'en' ? 'Shipping:' : 'شحن:'} {Number(credit.shipping || 0).toFixed(2)} | {appLang === 'en' ? 'tax' : 'الضريبة'} {Number(credit.shipping_tax_rate || 0).toFixed(2)}%</div>
              <div>{appLang === 'en' ? 'Adjustment:' : 'تسوية:'} {Number(credit.adjustment || 0).toFixed(2)}</div>
              <div>{appLang === 'en' ? 'Total:' : 'إجمالي:'} <span className="font-semibold">{Number(credit.total_amount || 0).toFixed(2)}</span></div>
              <div>{appLang === 'en' ? 'Applied:' : 'المطبّق:'} {Number(credit.applied_amount || 0).toFixed(2)} | {appLang === 'en' ? 'Remaining:' : 'المتبقي:'} {remaining.toFixed(2)}</div>
              <div>{appLang === 'en' ? 'Status:' : 'الحالة:'} {credit.status}</div>
            </div>

            <div className="flex justify-end gap-2">
              <Button onClick={openApplyDialog}>{appLang === 'en' ? 'Apply to Supplier Bill' : 'تطبيق على فاتورة مورد'}</Button>
            </div>
          </CardContent>
        </Card>

        <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>{appLang === 'en' ? 'Apply credit to bill' : 'تطبيق الإشعار على فاتورة'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <div>{appLang === 'en' ? 'Credit remaining:' : 'المتبقي في الإشعار:'} <span className="font-medium">{remaining.toFixed(2)}</span></div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-600">
                      <th className="text-right p-2">{appLang === 'en' ? 'Bill No.' : 'رقم الفاتورة'}</th>
                      <th className="text-right p-2">{appLang === 'en' ? 'Total' : 'الإجمالي'}</th>
                      <th className="text-right p-2">{appLang === 'en' ? 'Paid' : 'المدفوع'}</th>
                      <th className="text-right p-2">{appLang === 'en' ? 'Remaining' : 'المتبقي'}</th>
                      <th className="text-right p-2">{appLang === 'en' ? 'Select' : 'اختيار'}</th>
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
                        <td className="p-4 text-center text-gray-500" colSpan={5}>{appLang === 'en' ? 'No bills with remaining amounts for this supplier' : 'لا توجد فواتير بمبالغ متبقية لهذا المورد'}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="grid grid-cols-2 gap-4 items-center">
                <label className="text-gray-600">{appLang === 'en' ? 'Amount to apply' : 'المبلغ المراد تطبيقه'}</label>
                <Input value={applyAmount} onChange={e => setApplyAmount(e.target.value)} placeholder="0.00" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setApplyOpen(false)}>{appLang === 'en' ? 'Cancel' : 'إلغاء'}</Button>
              <Button onClick={applyCreditToBill} disabled={!selectedBillId || bills.length === 0}>{appLang === 'en' ? 'Apply' : 'تطبيق'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}
