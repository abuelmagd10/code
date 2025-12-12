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
                           find((a: any) => String(a.account_name || "").toLowerCase().includes("credit")) ||
                           find((a: any) => String(a.account_name || "").toLowerCase().includes("مدين"))
      const cash = find((a: any) => String(a.sub_type || "").toLowerCase() === "cash") || 
                  find((a: any) => String(a.account_name || "").toLowerCase().includes("cash")) ||
                  find((a: any) => String(a.account_name || "").toLowerCase().includes("نقد"))
      const bank = find((a: any) => String(a.sub_type || "").toLowerCase() === "bank") ||
                  find((a: any) => String(a.account_name || "").toLowerCase().includes("bank")) ||
                  find((a: any) => String(a.account_name || "").toLowerCase().includes("بنك"))

      const targetAccount = refundMethod === "cash" ? (cash || refundAccountId) : (bank || refundAccountId)

      // Calculate base amount in app currency
      const baseRefundAmount = refundCurrency === appCurrency ? 
        refundAmount : 
        Math.round(refundAmount * refundExRate.rate * 10000) / 10000

      // Create journal entry for the refund
      const { error: journalError } = await supabase
        .from("journal_entries")
        .insert({
          company_id: activeCompanyId,
          entry_date: refundDate,
          description: refundNotes || (appLang === 'en' ? `Customer refund: ${customerName}` : `صرف رصيد العميل: ${customerName}`),
          reference: `REFUND-${customerId}-${Date.now()}`,
          total_debit: baseRefundAmount,
          total_credit: baseRefundAmount,
          currency: appCurrency,
          exchange_rate: refundExRate.rate,
          exchange_rate_id: refundExRate.rateId
        })

      if (journalError) throw journalError

      // Get the journal entry ID
      const { data: journalData } = await supabase
        .from("journal_entries")
        .select("id")
        .eq("company_id", activeCompanyId)
        .eq("reference", `REFUND-${customerId}-${Date.now()}`)
        .single()

      if (!journalData?.id) {
        throw new Error('Failed to create journal entry')
      }

      // Create journal entry lines
      const { error: linesError } = await supabase
        .from("journal_entry_lines")
        .insert([
          {
            journal_entry_id: journalData.id,
            account_id: customerCredit || refundAccountId,
            debit: 0,
            credit: baseRefundAmount,
            description: appLang === 'en' ? 'Customer credit refund' : 'صرف رصيد العميل'
          },
          {
            journal_entry_id: journalData.id,
            account_id: targetAccount,
            debit: baseRefundAmount,
            credit: 0,
            description: appLang === 'en' ? 'Refund payment' : 'دفعة الصرف'
          }
        ])

      if (linesError) throw linesError

      // Record the refund transaction
      const { error: refundError } = await supabase
        .from("refunds")
        .insert({
          company_id: activeCompanyId,
          customer_id: customerId,
          amount: refundAmount,
          currency: refundCurrency,
          exchange_rate: refundExRate.rate,
          exchange_rate_id: refundExRate.rateId,
          base_currency: appCurrency,
          base_amount: baseRefundAmount,
          refund_date: refundDate,
          method: refundMethod,
          account_id: targetAccount,
          notes: refundNotes,
          journal_entry_id: journalData.id,
          status: 'completed'
        })

      if (refundError) throw refundError

      toastActionSuccess(toast, appLang === 'en' ? 'Refund processed successfully' : 'تم صرف الرصيد بنجاح')
      
      // Reset form
      setRefundAmount(0)
      setRefundNotes("")
      setRefundMethod("cash")
      setRefundAccountId("")
      
      // Close dialog and refresh
      onOpenChange(false)
      onRefundComplete()

    } catch (error) {
      toastActionError(toast, appLang === 'en' ? 'Failed to process refund' : 'فشل في صرف الرصيد')
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