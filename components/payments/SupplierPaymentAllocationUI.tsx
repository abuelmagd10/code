"use client"

import { useState, useEffect } from "react"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import { PaymentService, PaymentAllocationInput } from "@/lib/services/payment.service"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { NumericInput } from "@/components/ui/numeric-input"
import { getExchangeRate } from "@/lib/currency-service"
import { getActiveCompanyId } from "@/lib/company"
import { getAccessFilter, UserContext } from "@/lib/validation"

export function SupplierPaymentAllocationUI({ 
  appLang, 
  suppliers, 
  accounts, 
  currencies, 
  baseCurrency, 
  currencySymbols,
  onSuccess
}: { 
  appLang: 'ar' | 'en',
  suppliers: {id: string, name: string}[],
  accounts: {id: string, account_name: string}[],
  currencies: any[],
  baseCurrency: string,
  currencySymbols: Record<string, string>,
  onSuccess: () => void
}) {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  
  // Payment Form State
  const [supplierId, setSupplierId] = useState("")
  const [amount, setAmount] = useState(0)
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10))
  const [method, setMethod] = useState("transfer")
  const [accountId, setAccountId] = useState("")
  const [currency, setCurrency] = useState(baseCurrency)
  const [exchangeRate, setExchangeRate] = useState(1)
  
  // Allocations State
  const [bills, setBills] = useState<any[]>([])
  const [allocations, setAllocations] = useState<Record<string, number>>({})
  
  // Fetch Bills when supplier changes
  useEffect(() => {
    async function fetchBills() {
      if (!supplierId || !open) return;
      
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return
      const service = new PaymentService(supabase)
      try {
        const outstandingBills = await service.getOutstandingSupplierBills(companyId, supplierId)
        setBills(outstandingBills)
        setAllocations({})
      } catch (err) {
        console.error("Failed to fetch bills:", err)
      }
    }
    fetchBills()
  }, [supplierId, open, supabase])

  // Handle auto-allocation FIFO
  const handleAutoAllocate = () => {
    let remaining = amount;
    const newAllocations: Record<string, number> = {};
    
    // Sort bills by date ascending (FIFO)
    const sortedBills = [...bills].sort((a, b) => new Date(a.bill_date).getTime() - new Date(b.bill_date).getTime());
    
    for (const bill of sortedBills) {
      if (remaining <= 0) break;
      const allocateAmt = Math.min(bill.outstanding, remaining);
      newAllocations[bill.id] = parseFloat(allocateAmt.toFixed(2));
      remaining -= allocateAmt;
    }
    
    setAllocations(newAllocations);
  }

  const handleManualAllocation = (billId: string, val: number) => {
    setAllocations(prev => ({
      ...prev,
      [billId]: val
    }))
  }

  const handleSubmit = async () => {
    if (!supplierId || !accountId || amount <= 0) {
      toast({ title: "Error", description: "Please fill all required fields", variant: "destructive" })
      return
    }

    setLoading(true)
    try {
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) throw new Error("No active company")

      // Get user branch
      const { data: { user } } = await supabase.auth.getUser()
      const { data: member } = await supabase.from('company_members').select('branch_id').eq('user_id', user?.id).eq('company_id', companyId).single()
      const branchId = member?.branch_id

      const allocArray: PaymentAllocationInput[] = Object.entries(allocations)
        .filter(([_, amt]) => amt > 0)
        .map(([bId, amt]) => ({ bill_id: bId, amount: amt }))

      const service = new PaymentService(supabase)
      
      await service.createSupplierPaymentWithAllocations({
        company_id: companyId,
        supplier_id: supplierId,
        payment_amount: amount,
        payment_date: paymentDate,
        payment_method: method,
        account_id: accountId,
        branch_id: branchId,
        currency_code: currency,
        exchange_rate: exchangeRate,
        base_currency_amount: amount * exchangeRate,
        allocations: allocArray
      })

      toast({ title: appLang === 'en' ? "Success" : "نجاح", description: appLang === 'en' ? "Payment created successfully" : "تم إنشاء الدفعة بنجاح" })
      setOpen(false)
      onSuccess()
    } catch (err: any) {
      console.error(err)
      toast({ title: "Error", description: err.message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const totalAllocated = Object.values(allocations).reduce((sum, val) => sum + (val || 0), 0)
  const unallocated = amount - totalAllocated

  return (
    <>
      <Button variant="default" className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm" onClick={() => setOpen(true)}>
        {appLang === 'en' ? 'Batch Payment Allocation' : 'توزيع دفعة مجمعة'}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl text-blue-800 dark:text-blue-300">
              {appLang === 'en' ? 'Enterprise Payment Allocation' : 'توزيع الدفعات المتقدم'}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border">
            <div>
              <Label>{appLang === 'en' ? 'Supplier' : 'المورد'}</Label>
              <select className="w-full border rounded px-3 py-2 mt-1" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">{appLang === 'en' ? 'Select Supplier' : 'اختر موردًا'}</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <Label>{appLang === 'en' ? 'Account' : 'حساب الدفع'}</Label>
              <select className="w-full border rounded px-3 py-2 mt-1" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">{appLang === 'en' ? 'Select Account' : 'اختر حسابًا'}</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.account_name}</option>)}
              </select>
            </div>
            <div>
              <Label>{appLang === 'en' ? 'Amount' : 'المبلغ'}</Label>
              <NumericInput min={0} step={0.01} value={amount} onChange={setAmount} className="mt-1" />
            </div>
            <div>
              <Label>{appLang === 'en' ? 'Date' : 'تاريخ الدفع'}</Label>
              <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="mt-1" />
            </div>
          </div>

          {supplierId && bills.length > 0 && (
            <div className="mt-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">{appLang === 'en' ? 'Outstanding Bills' : 'الفواتير المستحقة'}</h3>
                <div className="flex gap-4 items-center">
                  <div className="text-sm">
                    <span className="text-gray-500">{appLang === 'en' ? 'Total Allocated: ' : 'إجمالي الموزع: '}</span>
                    <span className="font-bold text-green-600">{totalAllocated.toFixed(2)}</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-gray-500">{appLang === 'en' ? 'Unallocated: ' : 'غير موزع (سلفة): '}</span>
                    <span className={`font-bold ${unallocated < 0 ? 'text-red-500' : 'text-blue-600'}`}>
                      {unallocated.toFixed(2)}
                    </span>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleAutoAllocate} disabled={amount <= 0}>
                    {appLang === 'en' ? 'Auto-Allocate (FIFO)' : 'توزيع تلقائي (الأقدم أولاً)'}
                  </Button>
                </div>
              </div>

              <div className="border rounded overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 dark:bg-slate-800">
                    <tr>
                      <th className="px-3 py-2 text-right">{appLang === 'en' ? 'Bill No.' : 'رقم الفاتورة'}</th>
                      <th className="px-3 py-2 text-right">{appLang === 'en' ? 'Date' : 'تاريخ'}</th>
                      <th className="px-3 py-2 text-right">{appLang === 'en' ? 'Outstanding' : 'المستحق'}</th>
                      <th className="px-3 py-2 text-right">{appLang === 'en' ? 'Allocate Amount' : 'مبلغ التوزيع'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bills.map(b => (
                      <tr key={b.id} className="border-t">
                        <td className="px-3 py-2">{b.bill_number}</td>
                        <td className="px-3 py-2">{b.bill_date}</td>
                        <td className="px-3 py-2 font-semibold text-red-600">{b.outstanding.toFixed(2)}</td>
                        <td className="px-3 py-2">
                          <NumericInput 
                            min={0} 
                            max={b.outstanding}
                            step={0.01} 
                            value={allocations[b.id] || 0} 
                            onChange={(val) => handleManualAllocation(b.id, val)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {supplierId && bills.length === 0 && (
            <div className="mt-8 text-center text-gray-500 py-8 border border-dashed rounded bg-slate-50">
              {appLang === 'en' ? 'No outstanding bills for this supplier.' : 'لا توجد فواتير مستحقة الدفع لهذا المورد.'}
            </div>
          )}

          <DialogFooter className="mt-6 border-t pt-4">
            <Button variant="outline" onClick={() => setOpen(false)}>{appLang === 'en' ? 'Cancel' : 'إلغاء'}</Button>
            <Button 
              onClick={handleSubmit} 
              disabled={loading || !supplierId || amount <= 0 || unallocated < 0 || !accountId}
            >
              {loading ? (appLang === 'en' ? 'Saving...' : 'جاري الحفظ...') : (appLang === 'en' ? 'Save Allocations' : 'حفظ التوزيع وإصدار الدفعة')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
