"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getExchangeRate, getActiveCurrencies, type Currency, DEFAULT_CURRENCIES } from "@/lib/currency-service"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import { toastActionError, toastActionSuccess } from "@/lib/notifications"
import { getActiveCompanyId } from "@/lib/company"

interface CustomerRefundDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  customerId: string
  customerName: string
  maxAmount: number
  accounts: { id: string; account_code: string; account_name: string; account_type: string }[]
  appCurrency: string
  currencies: Currency[]
  refundAmount: number
  setRefundAmount: (amount: number) => void
  refundCurrency: string
  setRefundCurrency: (currency: string) => void
  refundDate: string
  setRefundDate: (date: string) => void
  refundMethod: string
  setRefundMethod: (method: string) => void
  refundAccountId: string
  setRefundAccountId: (accountId: string) => void
  refundNotes: string
  setRefundNotes: (notes: string) => void
  refundExRate: { rate: number; rateId: string | null; source: string }
  onRefundComplete: () => void
}

export function CustomerRefundDialog({
  open,
  onOpenChange,
  customerId,
  customerName,
  maxAmount,
  accounts,
  appCurrency,
  currencies,
  refundAmount,
  setRefundAmount,
  refundCurrency,
  setRefundCurrency,
  refundDate,
  setRefundDate,
  refundMethod,
  setRefundMethod,
  refundAccountId,
  setRefundAccountId,
  refundNotes,
  setRefundNotes,
  refundExRate,
  onRefundComplete
}: CustomerRefundDialogProps) {
  const supabase = useSupabase()
  const { toast } = useToast()
  const appLang = typeof window !== 'undefined' ? ((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') : 'ar'

  const [isProcessing, setIsProcessing] = useState(false)



  const processCustomerRefund = async () => {
    if (!refundAmount || refundAmount <= 0) {
      toast({
        variant: "destructive",
        title: appLang === 'en' ? 'Invalid Amount' : 'مبلغ غير صالح',
        description: appLang === 'en' ? 'Please enter a valid refund amount' : 'الرجاء إدخال مبلغ صرف صالح'
      })
      return
    }

    if (refundAmount > maxAmount) {
      toast({
        variant: "destructive",
        title: appLang === 'en' ? 'Amount Exceeds Balance' : 'المبلغ يتجاوز الرصيد',
        description: appLang === 'en' ? 'Refund amount cannot exceed available balance' : 'مبلغ الصرف لا يمكن أن يتجاوز الرصيد المتاح'
      })
      return
    }

    if (!refundAccountId) {
      toast({
        variant: "destructive",
        title: appLang === 'en' ? 'Account Required' : 'الحساب مطلوب',
        description: appLang === 'en' ? 'Please select an account for the refund' : 'الرجاء اختيار حساب للصرف'
      })
      return
    }

    setIsProcessing(true)

    try {
      const activeCompanyId = await getActiveCompanyId(supabase)
      if (!activeCompanyId) {
        throw new Error('No active company')
      }

      // Find appropriate accounts
      const find = (f: (a: any) => boolean) => (accounts || []).find(f)?.id
      const customerCredit = find((a: any) => String(a.sub_type || "").toLowerCase() === "customer_credit") ||
                           find((a: any) => String(a.sub_type || "").toLowerCase() === "customer_advance") ||
                           find((a: any) => String(a.account_name || "").toLowerCase().includes("سلف العملاء")) ||
                           find((a: any) => String(a.account_name || "").toLowerCase().includes("رصيد العملاء"))

      // Calculate base amount in app currency
      const baseRefundAmount = refundCurrency === appCurrency ?
        refundAmount :
        Math.round(refundAmount * refundExRate.rate * 10000) / 10000

      // ===== إنشاء قيد صرف رصيد العميل =====
      // القيد المحاسبي:
      // مدين: رصيد العميل الدائن (تقليل الالتزام) - customerCredit
      // دائن: النقد/البنك (خروج المبلغ) - refundAccountId
      const { data: entry, error: entryError } = await supabase
        .from("journal_entries")
        .insert({
          company_id: activeCompanyId,
          reference_type: "customer_credit_refund",
          reference_id: customerId,
          entry_date: refundDate,
          description: refundNotes || (appLang === 'en' ? `Customer credit refund - ${customerName}` : `صرف رصيد دائن للعميل - ${customerName}`),
        })
        .select()
        .single()

      if (entryError) throw entryError

      if (entry?.id) {
        const lines = []
        // مدين: رصيد العميل (نخفض الالتزام تجاه العميل)
        if (customerCredit) {
          lines.push({
            journal_entry_id: entry.id,
            account_id: customerCredit,
            debit_amount: baseRefundAmount,
            credit_amount: 0,
            description: appLang === 'en' ? 'Customer credit refund' : 'صرف رصيد العميل الدائن',
            original_currency: refundCurrency,
            original_debit: refundAmount,
            original_credit: 0,
            exchange_rate_used: refundExRate.rate,
            exchange_rate_id: refundExRate.rateId || null
          })
        }
        // دائن: النقد/البنك (خروج المبلغ للعميل)
        lines.push({
          journal_entry_id: entry.id,
          account_id: refundAccountId,
          debit_amount: 0,
          credit_amount: baseRefundAmount,
          description: appLang === 'en' ? 'Cash/Bank payment to customer' : 'صرف نقدي/بنكي للعميل',
          original_currency: refundCurrency,
          original_debit: 0,
          original_credit: refundAmount,
          exchange_rate_used: refundExRate.rate,
          exchange_rate_id: refundExRate.rateId || null
        })

        const { error: linesError } = await supabase.from("journal_entry_lines").insert(lines)
        if (linesError) throw linesError
      }

      // ===== تحديث جدول customer_credits لخصم المبلغ المصروف =====
      const { data: credits } = await supabase
        .from("customer_credits")
        .select("id, amount, used_amount, applied_amount")
        .eq("company_id", activeCompanyId)
        .eq("customer_id", customerId)
        .eq("status", "active")
        .order("credit_date", { ascending: true })

      let remainingToDeduct = refundAmount
      if (credits && credits.length > 0) {
        for (const credit of credits) {
          if (remainingToDeduct <= 0) break
          // حساب المتاح = المبلغ - المستخدم - المطبق
          const usedAmt = Number(credit.used_amount || 0)
          const appliedAmt = Number(credit.applied_amount || 0)
          const totalUsed = usedAmt + appliedAmt
          const available = Number(credit.amount || 0) - totalUsed
          if (available <= 0) continue

          const deductAmount = Math.min(available, remainingToDeduct)
          const newUsedAmount = usedAmt + deductAmount
          const newStatus = (newUsedAmount + appliedAmt) >= Number(credit.amount || 0) ? "used" : "active"

          await supabase
            .from("customer_credits")
            .update({
              used_amount: newUsedAmount,
              status: newStatus,
              updated_at: new Date().toISOString()
            })
            .eq("id", credit.id)

          remainingToDeduct -= deductAmount
        }
      }

      // ===== إنشاء سجل دفعة صرف =====
      const paymentPayload: any = {
        company_id: activeCompanyId,
        customer_id: customerId,
        payment_date: refundDate,
        amount: -refundAmount, // سالب لأنه صرف للعميل
        payment_method: refundMethod === "bank" ? "bank" : "cash",
        reference_number: `REF-${Date.now()}`,
        notes: refundNotes || (appLang === 'en' ? `Credit refund to customer ${customerName}` : `صرف رصيد دائن للعميل ${customerName}`),
      }
      try {
        // محاولة إدراج مع account_id
        const payloadWithAccount = { ...paymentPayload, account_id: refundAccountId }
        const { error: payErr } = await supabase.from("payments").insert(payloadWithAccount)
        if (payErr) {
          // إذا فشل بسبب account_id، نحاول بدونه
          await supabase.from("payments").insert(paymentPayload)
        }
      } catch {
        // تجاهل أخطاء الدفعة - القيد المحاسبي هو الأهم
      }

      toastActionSuccess(toast, appLang === 'en' ? 'Refund' : 'الصرف', appLang === 'en' ? 'Customer credit refund completed' : 'تم صرف رصيد العميل بنجاح')

      // Reset form
      setRefundAmount(0)
      setRefundNotes("")
      setRefundMethod("cash")
      setRefundAccountId("")

      // Close dialog and refresh
      onOpenChange(false)
      onRefundComplete()

    } catch (error: any) {
      console.error("Refund error:", error)
      toastActionError(toast, appLang === 'en' ? 'Refund' : 'الصرف', appLang === 'en' ? 'Customer credit' : 'رصيد العميل', String(error?.message || error || ''), appLang, 'OPERATION_FAILED')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{appLang==='en' ? 'Refund Customer Credit' : 'صرف رصيد العميل الدائن'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <p className="text-sm text-gray-600 dark:text-gray-400">{appLang==='en' ? 'Customer' : 'العميل'}: <span className="font-semibold">{customerName}</span></p>
            <p className="text-sm text-gray-600 dark:text-gray-400">{appLang==='en' ? 'Available Balance' : 'الرصيد المتاح'}: <span className="font-semibold text-green-600">{maxAmount.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}</span></p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{appLang==='en' ? 'Refund Amount' : 'مبلغ الصرف'}</Label>
              <Input
                type="number"
                value={refundAmount}
                max={maxAmount}
                onChange={(e) => setRefundAmount(Math.min(Number(e.target.value || 0), maxAmount))}
              />
            </div>
            <div className="space-y-2">
              <Label>{appLang==='en' ? 'Currency' : 'العملة'}</Label>
              <Select value={refundCurrency} onValueChange={setRefundCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {currencies.length > 0 ? (
                    currencies.map(c => <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>)
                  ) : (
                    <>
                      {DEFAULT_CURRENCIES.map(currency => (
                        <SelectItem key={currency.code} value={currency.code}>
                          {currency.code}
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          {refundCurrency !== appCurrency && refundAmount > 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded text-sm">
              <div>{appLang==='en' ? 'Exchange Rate' : 'سعر الصرف'}: <strong>1 {refundCurrency} = {refundExRate.rate.toFixed(4)} {appCurrency}</strong> ({refundExRate.source})</div>
              <div>{appLang==='en' ? 'Base Amount' : 'المبلغ الأساسي'}: <strong>{(refundAmount * refundExRate.rate).toFixed(2)} {appCurrency}</strong></div>
            </div>
          )}
          <div className="space-y-2">
            <Label>{appLang==='en' ? 'Date' : 'التاريخ'}</Label>
            <Input type="date" value={refundDate} onChange={(e) => setRefundDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{appLang==='en' ? 'Payment Method' : 'طريقة الصرف'}</Label>
            <Select value={refundMethod} onValueChange={setRefundMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">{appLang==='en' ? 'Cash' : 'نقداً'}</SelectItem>
                <SelectItem value="bank">{appLang==='en' ? 'Bank Transfer' : 'تحويل بنكي'}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{appLang==='en' ? 'Account' : 'الحساب'}</Label>
            <Select value={refundAccountId} onValueChange={setRefundAccountId}>
              <SelectTrigger>
                <SelectValue placeholder={appLang==='en' ? 'Select account' : 'اختر الحساب'} />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>{acc.account_code} - {acc.account_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{appLang==='en' ? 'Notes' : 'ملاحظات'}</Label>
            <Input value={refundNotes} onChange={(e) => setRefundNotes(e.target.value)} placeholder={appLang==='en' ? 'Optional notes' : 'ملاحظات اختيارية'} />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing}>{appLang==='en' ? 'Cancel' : 'إلغاء'}</Button>
            <Button 
              onClick={processCustomerRefund} 
              className="bg-green-600 hover:bg-green-700" 
              disabled={isProcessing || !refundAmount || refundAmount <= 0 || refundAmount > maxAmount || !refundAccountId}
            >
              {isProcessing ? (appLang==='en' ? 'Processing...' : 'جاري المعالجة...') : (appLang==='en' ? 'Confirm Refund' : 'تأكيد الصرف')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}