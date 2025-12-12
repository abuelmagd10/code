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

interface CustomerVoucherDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  customerId: string
  customerName: string
  accounts: { id: string; account_code: string; account_name: string; account_type: string; sub_type?: string }[]
  appCurrency: string
  currencies: Currency[]
  voucherAmount: number
  setVoucherAmount: (amount: number) => void
  voucherCurrency: string
  setVoucherCurrency: (currency: string) => void
  voucherDate: string
  setVoucherDate: (date: string) => void
  voucherMethod: string
  setVoucherMethod: (method: string) => void
  voucherAccountId: string
  setVoucherAccountId: (accountId: string) => void
  voucherRef: string
  setVoucherRef: (ref: string) => void
  voucherNotes: string
  setVoucherNotes: (notes: string) => void
  voucherExRate: { rate: number; rateId: string | null; source: string }
  setVoucherExRate: (exRate: { rate: number; rateId: string | null; source: string }) => void
  onVoucherComplete: () => void
}

export function CustomerVoucherDialog({
  open,
  onOpenChange,
  customerId,
  customerName,
  accounts,
  appCurrency,
  currencies,
  voucherAmount,
  setVoucherAmount,
  voucherCurrency,
  setVoucherCurrency,
  voucherDate,
  setVoucherDate,
  voucherMethod,
  setVoucherMethod,
  voucherAccountId,
  setVoucherAccountId,
  voucherRef,
  setVoucherRef,
  voucherNotes,
  setVoucherNotes,
  voucherExRate,
  setVoucherExRate,
  onVoucherComplete
}: CustomerVoucherDialogProps) {
  const supabase = useSupabase()
  const { toast } = useToast()
  const appLang = typeof window !== 'undefined' ? ((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') : 'ar'

  const [isProcessing, setIsProcessing] = useState(false)

  // Update exchange rate when currency changes
  useEffect(() => {
    const updateExchangeRate = async () => {
      if (voucherCurrency === appCurrency) {
        setVoucherExRate({ rate: 1, rateId: null, source: 'same_currency' })
        return
      }

      try {
         const rate = await getExchangeRate(supabase, voucherCurrency, appCurrency, voucherDate ? new Date(voucherDate) : undefined)
         if (rate) {
           setVoucherExRate({ rate: rate.rate, rateId: rate.rateId || null, source: rate.source })
         } else {
           setVoucherExRate({ rate: 1, rateId: null, source: 'fallback' })
         }
      } catch (error) {
        setVoucherExRate({ rate: 1, rateId: null, source: 'same_currency' })
      }
    }

    if (voucherCurrency && appCurrency && voucherDate) {
      updateExchangeRate()
    }
  }, [voucherCurrency, appCurrency, voucherDate, supabase, setVoucherExRate])

  const createCustomerVoucher = async () => {
    if (!customerId || voucherAmount <= 0) {
      toast({
        variant: "destructive",
        title: appLang === 'en' ? 'Invalid Data' : 'بيانات غير صالحة',
        description: appLang === 'en' ? 'Please enter a valid amount' : 'الرجاء إدخال مبلغ صالح'
      })
      return
    }

    if (!voucherAccountId) {
      toast({
        variant: "destructive",
        title: appLang === 'en' ? 'Account Required' : 'الحساب مطلوب',
        description: appLang === 'en' ? 'Please select an account for the voucher' : 'الرجاء اختيار حساب للسند'
      })
      return
    }

    setIsProcessing(true)

    try {
      const activeCompanyId = await getActiveCompanyId(supabase)
      if (!activeCompanyId) {
        throw new Error('No active company')
      }

      // Validate account
      if (voucherAccountId) {
        const { data: acct, error: acctErr } = await supabase
          .from("chart_of_accounts")
          .select("id, company_id")
          .eq("id", voucherAccountId)
          .eq("company_id", activeCompanyId)
          .single()
        
        if (acctErr || !acct) {
          toastActionError(toast, appLang==='en' ? 'Validation' : 'التحقق', appLang==='en' ? 'Account' : 'الحساب', appLang==='en' ? 'Selected account is invalid' : 'الحساب المختار غير صالح', appLang, 'INVALID_INPUT')
          return
        }
      }

      const payload: any = {
        company_id: activeCompanyId,
        customer_id: customerId,
        payment_date: voucherDate,
        amount: voucherAmount,
        payment_method: voucherMethod === "bank" ? "bank" : (voucherMethod === "cash" ? "cash" : "refund"),
        reference_number: voucherRef || null,
        notes: voucherNotes || null,
        account_id: voucherAccountId || null,
      }

      let insertedPayment: any = null
      let insertErr: any = null
      
      // Try to insert payment
      const { data, error } = await supabase.from("payments").insert(payload).select().single()
      insertedPayment = data || null
      insertErr = error || null

      if (insertErr) {
        const msg = String(insertErr?.message || insertErr || "")
        const mentionsAccountId = msg.toLowerCase().includes("account_id")
        const looksMissingColumn = mentionsAccountId && (msg.toLowerCase().includes("does not exist") || msg.toLowerCase().includes("not found") || msg.toLowerCase().includes("column"))
        
        if (looksMissingColumn || mentionsAccountId) {
          // Retry without account_id if it's causing issues
          const fallback = { ...payload }
          delete (fallback as any).account_id
          const { error: retryError } = await supabase.from("payments").insert(fallback)
          if (retryError) throw retryError
        } else {
          throw insertErr
        }
      }

      // Create journal entry if accounts are available
      try {
        if (accounts.length > 0) {
          const find = (f: (a: any) => boolean) => (accounts || []).find(f)?.id
          const customerAdvance = find((a: any) => String(a.sub_type || "").toLowerCase() === "customer_advance") || 
                               find((a: any) => String(a.account_name || "").toLowerCase().includes("advance")) || 
                               find((a: any) => String(a.account_name || "").toLowerCase().includes("deposit"))
          const cash = find((a: any) => String(a.sub_type || "").toLowerCase() === "cash") || 
                      find((a: any) => String(a.account_name || "").toLowerCase().includes("cash"))
          const bank = find((a: any) => String(a.sub_type || "").toLowerCase() === "bank") ||
                      find((a: any) => String(a.account_name || "").toLowerCase().includes("bank"))

          const cashAccountId = voucherAccountId || bank || cash

          if (customerAdvance && cashAccountId) {
            // Calculate base amounts for multi-currency
            const baseAmount = voucherCurrency === appCurrency ? 
              voucherAmount : 
              Math.round(voucherAmount * voucherExRate.rate * 10000) / 10000

            const { data: entry } = await supabase
              .from("journal_entries")
              .insert({
                company_id: activeCompanyId,
                reference_type: "customer_voucher",
                reference_id: insertedPayment?.id,
                entry_date: voucherDate,
                description: appLang==='en' ? 'Customer payment voucher' : 'سند صرف عميل',
              })
              .select()
              .single()

            if (entry?.id) {
              await supabase.from("journal_entry_lines").insert([
                {
                  journal_entry_id: entry.id,
                  account_id: customerAdvance,
                  debit_amount: baseAmount,
                  credit_amount: 0,
                  description: appLang==='en' ? 'Customer advance' : 'سلف العملاء',
                  original_currency: voucherCurrency,
                  original_debit: voucherAmount,
                  original_credit: 0,
                  exchange_rate_used: voucherExRate.rate,
                  exchange_rate_id: voucherExRate.rateId,
                  rate_source: voucherExRate.source
                },
                {
                  journal_entry_id: entry.id,
                  account_id: cashAccountId,
                  debit_amount: 0,
                  credit_amount: baseAmount,
                  description: appLang==='en' ? 'Cash/Bank' : 'نقد/بنك',
                  original_currency: voucherCurrency,
                  original_debit: 0,
                  original_credit: voucherAmount,
                  exchange_rate_used: voucherExRate.rate,
                  exchange_rate_id: voucherExRate.rateId,
                  rate_source: voucherExRate.source
                },
              ])
            }
          }
        }
      } catch (_) { 
        /* ignore journal errors, voucher still created */ 
      }

      // Apply to outstanding invoices if payment was created
      try {
        if (insertedPayment?.id && customerId) {
          const { data: invoices } = await supabase
            .from("invoices")
            .select("id, total_amount, paid_amount, status")
            .eq("company_id", activeCompanyId)
            .eq("customer_id", customerId)
            .in("status", ["sent", "partially_paid"])
            .order("issue_date", { ascending: true })

          let remaining = Number(voucherAmount || 0)
          for (const inv of (invoices || [])) {
            if (remaining <= 0) break
            const due = Math.max(Number(inv.total_amount || 0) - Number(inv.paid_amount || 0), 0)
            const applyAmt = Math.min(remaining, due)
            if (applyAmt > 0) {
              await supabase.from("advance_applications").insert({ 
                company_id: activeCompanyId, 
                customer_id: customerId, 
                invoice_id: inv.id, 
                amount_applied: applyAmt, 
                payment_id: insertedPayment.id 
              })
              await supabase.from("invoices").update({ 
                paid_amount: Number(inv.paid_amount || 0) + applyAmt, 
                status: Number(inv.total_amount || 0) <= (Number(inv.paid_amount || 0) + applyAmt) ? "paid" : "partially_paid" 
              }).eq("id", inv.id)
              remaining -= applyAmt
            }
          }
        }
      } catch (_) {}

      toastActionSuccess(toast, appLang==='en' ? 'Create' : 'الإنشاء', appLang==='en' ? 'Customer voucher' : 'سند صرف عميل')
      
      // Reset form
      setVoucherAmount(0)
      setVoucherRef("")
      setVoucherNotes("")
      setVoucherAccountId("")
      setVoucherCurrency(appCurrency)
      
      // Close dialog and refresh
      onOpenChange(false)
      onVoucherComplete()

    } catch (err: any) {
      toastActionError(toast, appLang==='en' ? 'Create' : 'الإنشاء', appLang==='en' ? 'Customer voucher' : 'سند صرف عميل', String(err?.message || err || ''), appLang, 'OPERATION_FAILED')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{appLang==='en' ? 'Customer Payment Voucher' : 'سند صرف عميل'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{appLang==='en' ? 'Amount' : 'المبلغ'}</Label>
              <Input type="number" value={voucherAmount} onChange={(e) => setVoucherAmount(Number(e.target.value || 0))} />
            </div>
            <div className="space-y-2">
              <Label>{appLang==='en' ? 'Currency' : 'العملة'}</Label>
              <Select value={voucherCurrency} onValueChange={setVoucherCurrency}>
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
          {voucherCurrency !== appCurrency && voucherAmount > 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded text-sm">
              <div>{appLang==='en' ? 'Exchange Rate' : 'سعر الصرف'}: <strong>1 {voucherCurrency} = {voucherExRate.rate.toFixed(4)} {appCurrency}</strong> ({voucherExRate.source})</div>
              <div>{appLang==='en' ? 'Base Amount' : 'المبلغ الأساسي'}: <strong>{(voucherAmount * voucherExRate.rate).toFixed(2)} {appCurrency}</strong></div>
            </div>
          )}
          <div className="space-y-2">
            <Label>{appLang==='en' ? 'Date' : 'التاريخ'}</Label>
            <Input type="date" value={voucherDate} onChange={(e) => setVoucherDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{appLang==='en' ? 'Payment Method' : 'طريقة الدفع'}</Label>
            <Select value={voucherMethod} onValueChange={setVoucherMethod}>
              <SelectTrigger><SelectValue placeholder={appLang==='en' ? 'Method' : 'الطريقة'} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">{appLang==='en' ? 'Cash' : 'نقد'}</SelectItem>
                <SelectItem value="bank">{appLang==='en' ? 'Bank' : 'بنك'}</SelectItem>
                <SelectItem value="refund">{appLang==='en' ? 'Refund' : 'استرداد'}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{appLang==='en' ? 'Account' : 'الحساب'}</Label>
            <Select value={voucherAccountId} onValueChange={setVoucherAccountId}>
              <SelectTrigger><SelectValue placeholder={appLang==='en' ? 'Select account' : 'اختر الحساب'} /></SelectTrigger>
              <SelectContent>
                {(accounts || []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.account_name} {a.account_code ? `(${a.account_code})` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{appLang==='en' ? 'Reference' : 'مرجع'}</Label>
            <Input value={voucherRef} onChange={(e) => setVoucherRef(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{appLang==='en' ? 'Notes' : 'ملاحظات'}</Label>
            <Input value={voucherNotes} onChange={(e) => setVoucherNotes(e.target.value)} />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing}>{appLang==='en' ? 'Cancel' : 'إلغاء'}</Button>
            <Button 
              onClick={createCustomerVoucher} 
              disabled={isProcessing || !voucherAmount || voucherAmount <= 0 || !voucherAccountId}
            >
              {isProcessing ? (appLang==='en' ? 'Processing...' : 'جاري المعالجة...') : (appLang==='en' ? 'Create' : 'إنشاء')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}