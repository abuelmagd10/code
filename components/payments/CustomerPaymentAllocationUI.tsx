"use client"

import { useState, useEffect } from "react"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import { PaymentService } from "@/lib/services/payment.service"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { NumericInput } from "@/components/ui/numeric-input"
import { getActiveCompanyId } from "@/lib/company"
import { getExchangeRate } from "@/lib/currency-service"

export function CustomerPaymentAllocationUI({
  appLang,
  customers,
  accounts,
  currencies,
  baseCurrency,
  currencySymbols,
  onSuccess,
}: {
  appLang: 'ar' | 'en';
  customers: { id: string; name: string }[];
  accounts: { id: string; account_name: string }[];
  currencies: any[];
  baseCurrency: string;
  currencySymbols: Record<string, string>;
  onSuccess: () => void;
}) {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  // Payment Form State
  const [customerId, setCustomerId] = useState("")
  const [amount, setAmount] = useState(0)
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10))
  const [method, setMethod] = useState("transfer")
  const [accountId, setAccountId] = useState("")
  const [currency, setCurrency] = useState(baseCurrency)
  const [exchangeRate, setExchangeRate] = useState(1)
  const [reference, setReference] = useState("")
  const [notes, setNotes] = useState("")

  // Allocations State
  const [invoices, setInvoices] = useState<any[]>([])
  const [allocations, setAllocations] = useState<Record<string, number>>({})

  // Fetch Invoices when customer changes
  useEffect(() => {
    async function fetchInvoices() {
      if (!customerId || !open) return;
      const companyId = getActiveCompanyId() || ""
      const service = new PaymentService(supabase)
      try {
        const outstanding = await service.getOutstandingCustomerInvoices(companyId, customerId)
        setInvoices(outstanding)
        setAllocations({})
      } catch (err) {
        console.error("Failed to fetch invoices:", err)
      }
    }
    fetchInvoices()
  }, [customerId, open, supabase])

  // Auto-load exchange rate when currency changes
  useEffect(() => {
    async function loadRate() {
      if (currency === baseCurrency) { setExchangeRate(1); return; }
      try {
        const companyId = getActiveCompanyId() || ""
        const rateObj = await getExchangeRate(supabase, currency, baseCurrency, companyId)
        setExchangeRate(rateObj?.rate || 1)
      } catch { setExchangeRate(1) }
    }
    loadRate()
  }, [currency, baseCurrency, supabase])

  // Auto-Allocate (FIFO — oldest first)
  const handleAutoAllocate = () => {
    let remaining = amount;
    const newAllocations: Record<string, number> = {};
    const sorted = [...invoices].sort((a, b) =>
      new Date(a.invoice_date).getTime() - new Date(b.invoice_date).getTime()
    );
    for (const inv of sorted) {
      if (remaining <= 0) break;
      const allocAmt = Math.min(inv.outstanding, remaining);
      newAllocations[inv.id] = parseFloat(allocAmt.toFixed(2));
      remaining -= allocAmt;
    }
    setAllocations(newAllocations);
  }

  const handleManualAllocation = (invoiceId: string, val: number) => {
    setAllocations(prev => ({ ...prev, [invoiceId]: val }))
  }

  const handleSubmit = async () => {
    if (!customerId || !accountId || amount <= 0) {
      toast({ title: appLang === 'en' ? "Error" : "خطأ", description: appLang === 'en' ? "Please fill all required fields" : "يرجى تعبئة الحقول المطلوبة", variant: "destructive" })
      return
    }
    if (totalAllocated > amount + 0.01) {
      toast({ title: appLang === 'en' ? "Error" : "خطأ", description: appLang === 'en' ? "Total allocation exceeds payment amount" : "التوزيع يتجاوز مبلغ الدفعة", variant: "destructive" })
      return
    }

    setLoading(true)
    try {
      const companyId = getActiveCompanyId()
      if (!companyId) throw new Error("No active company")

      const { data: { user } } = await supabase.auth.getUser()
      const { data: member } = await supabase
        .from('company_members')
        .select('branch_id')
        .eq('user_id', user?.id)
        .eq('company_id', companyId)
        .single()

      const allocArray = Object.entries(allocations)
        .filter(([_, amt]) => amt > 0)
        .map(([invId, amt]) => ({ invoice_id: invId, amount: amt }))

      const service = new PaymentService(supabase)
      await service.createCustomerPaymentWithAllocations({
        company_id: companyId,
        customer_id: customerId,
        payment_amount: amount,
        payment_date: paymentDate,
        payment_method: method,
        account_id: accountId,
        branch_id: member?.branch_id || "",
        currency_code: currency,
        exchange_rate: exchangeRate,
        base_currency_amount: amount * exchangeRate,
        reference_number: reference || undefined,
        notes: notes || undefined,
        allocations: allocArray,
      })

      toast({
        title: appLang === 'en' ? "Success" : "نجاح",
        description: appLang === 'en' ? "Customer receipt created successfully" : "تم تسجيل التحصيل بنجاح وهو قيد الاعتماد"
      })
      setOpen(false)
      setCustomerId("")
      setAmount(0)
      setInvoices([])
      setAllocations({})
      onSuccess()
    } catch (err: any) {
      console.error(err)
      toast({ title: "Error", description: err.message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const totalAllocated = Object.values(allocations).reduce((s, v) => s + (v || 0), 0)
  const unallocated = amount - totalAllocated
  const currSymbol = currencySymbols[currency] || currency

  return (
    <>
      {/* Trigger Button */}
      <Button
        variant="default"
        className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
        onClick={() => setOpen(true)}
      >
        {appLang === 'en' ? '🏦 Batch Collection' : '🏦 تحصيل مجمّع'}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl text-emerald-800 dark:text-emerald-300">
              {appLang === 'en' ? 'Customer Receivables Allocation' : 'تحصيل الذمم المدينة المجمّع'}
            </DialogTitle>
          </DialogHeader>

          {/* Payment Form */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border">
            {/* Customer */}
            <div>
              <Label>{appLang === 'en' ? 'Customer' : 'العميل'}</Label>
              <select
                className="w-full border rounded px-3 py-2 mt-1 bg-white dark:bg-slate-800"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">{appLang === 'en' ? 'Select Customer' : 'اختر عميلاً'}</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* Account */}
            <div>
              <Label>{appLang === 'en' ? 'Receipt Account' : 'حساب التحصيل'}</Label>
              <select
                className="w-full border rounded px-3 py-2 mt-1 bg-white dark:bg-slate-800"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                <option value="">{appLang === 'en' ? 'Select Account' : 'اختر حسابًا'}</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.account_name}</option>)}
              </select>
            </div>

            {/* Amount */}
            <div>
              <Label>{appLang === 'en' ? 'Total Collection Amount' : 'إجمالي مبلغ التحصيل'}</Label>
              <NumericInput min={0} step={0.01} value={amount} onChange={setAmount} className="mt-1" />
            </div>

            {/* Date */}
            <div>
              <Label>{appLang === 'en' ? 'Date' : 'تاريخ التحصيل'}</Label>
              <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="mt-1" />
            </div>

            {/* Method */}
            <div>
              <Label>{appLang === 'en' ? 'Method' : 'طريقة الدفع'}</Label>
              <select
                className="w-full border rounded px-3 py-2 mt-1 bg-white dark:bg-slate-800"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                <option value="cash">{appLang === 'en' ? 'Cash' : 'نقداً'}</option>
                <option value="transfer">{appLang === 'en' ? 'Transfer' : 'تحويل'}</option>
                <option value="check">{appLang === 'en' ? 'Check' : 'شيك'}</option>
              </select>
            </div>

            {/* Currency */}
            <div>
              <Label>{appLang === 'en' ? 'Currency' : 'العملة'}</Label>
              <div className="flex gap-2 mt-1">
                <select
                  className="flex-1 border rounded px-3 py-2 bg-white dark:bg-slate-800"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  {currencies.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                </select>
                {currency !== baseCurrency && (
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <span>Rate:</span>
                    <span className="font-semibold">{exchangeRate}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Reference */}
            <div>
              <Label>{appLang === 'en' ? 'Reference' : 'مرجع'}</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} className="mt-1" placeholder={appLang === 'en' ? 'e.g. Cheque No.' : 'مثال: رقم الشيك'} />
            </div>

            {/* Notes */}
            <div className="col-span-full md:col-span-2">
              <Label>{appLang === 'en' ? 'Notes' : 'ملاحظات'}</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" placeholder={appLang === 'en' ? 'Optional notes...' : 'ملاحظات اختيارية...'} />
            </div>
          </div>

          {/* Summary Bar */}
          {amount > 0 && (
            <div className="flex gap-6 items-center p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 mt-2">
              <div className="text-sm">
                <span className="text-gray-500">{appLang === 'en' ? 'Total Receipt: ' : 'إجمالي التحصيل: '}</span>
                <span className="font-bold text-emerald-700 dark:text-emerald-300">{amount.toFixed(2)} {currSymbol}</span>
              </div>
              <div className="text-sm">
                <span className="text-gray-500">{appLang === 'en' ? 'Allocated: ' : 'موزع: '}</span>
                <span className="font-bold text-blue-600">{totalAllocated.toFixed(2)} {currSymbol}</span>
              </div>
              <div className="text-sm">
                <span className="text-gray-500">{appLang === 'en' ? 'Advance (Unallocated): ' : 'سلفة (غير موزع): '}</span>
                <span className={`font-bold ${unallocated < 0 ? 'text-red-500' : 'text-amber-600'}`}>
                  {unallocated.toFixed(2)} {currSymbol}
                </span>
              </div>
            </div>
          )}

          {/* Invoices Allocation Grid */}
          {customerId && invoices.length > 0 && (
            <div className="mt-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-lg font-semibold text-emerald-800 dark:text-emerald-300">
                  {appLang === 'en' ? 'Outstanding Invoices' : 'الفواتير المستحقة التحصيل'}
                </h3>
                <Button variant="outline" size="sm" onClick={handleAutoAllocate} disabled={amount <= 0}>
                  {appLang === 'en' ? '⚡ Auto-Allocate (FIFO)' : '⚡ توزيع تلقائي (الأقدم أولاً)'}
                </Button>
              </div>

              <div className="border rounded overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-emerald-50 dark:bg-emerald-900/30">
                    <tr>
                      <th className="px-3 py-2 text-right">{appLang === 'en' ? 'Invoice No.' : 'رقم الفاتورة'}</th>
                      <th className="px-3 py-2 text-right">{appLang === 'en' ? 'Date' : 'التاريخ'}</th>
                      <th className="px-3 py-2 text-right">{appLang === 'en' ? 'Total' : 'الإجمالي'}</th>
                      <th className="px-3 py-2 text-right text-red-600">{appLang === 'en' ? 'Outstanding' : 'المستحق'}</th>
                      <th className="px-3 py-2 text-right text-emerald-700">{appLang === 'en' ? 'Allocate' : 'المخصص'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map(inv => (
                      <tr key={inv.id} className="border-t hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="px-3 py-2 font-medium text-blue-600">{inv.invoice_number}</td>
                        <td className="px-3 py-2 text-gray-500">{inv.invoice_date}</td>
                        <td className="px-3 py-2">{Number(inv.total_amount).toFixed(2)}</td>
                        <td className="px-3 py-2 font-semibold text-red-600">{inv.outstanding.toFixed(2)}</td>
                        <td className="px-3 py-2">
                          <NumericInput
                            min={0}
                            max={inv.outstanding}
                            step={0.01}
                            value={allocations[inv.id] || 0}
                            onChange={(val) => handleManualAllocation(inv.id, val)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {customerId && invoices.length === 0 && (
            <div className="mt-8 text-center text-gray-500 py-8 border border-dashed rounded bg-slate-50 dark:bg-slate-900">
              {appLang === 'en' ? 'No outstanding invoices for this customer.' : 'لا توجد فواتير مستحقة لهذا العميل.'}
            </div>
          )}

          <DialogFooter className="mt-6 border-t pt-4">
            <Button variant="outline" onClick={() => setOpen(false)}>
              {appLang === 'en' ? 'Cancel' : 'إلغاء'}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={loading || !customerId || amount <= 0 || unallocated < -0.01 || !accountId}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {loading
                ? (appLang === 'en' ? 'Saving...' : 'جاري الحفظ...')
                : (appLang === 'en' ? 'Save Collection' : 'حفظ التحصيل وإصدار الدفعة')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
