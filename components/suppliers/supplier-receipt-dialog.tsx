"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { type Currency, DEFAULT_CURRENCIES } from "@/lib/currency-service"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import { toastActionError, toastActionSuccess } from "@/lib/notifications"
import { getActiveCompanyId } from "@/lib/company"

interface SupplierReceiptDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  supplierId: string
  supplierName: string
  maxAmount: number
  accounts: { id: string; account_code: string; account_name: string; account_type: string; sub_type?: string }[]
  appCurrency: string
  currencies: Currency[]
  receiptAmount: number
  setReceiptAmount: (amount: number) => void
  receiptCurrency: string
  setReceiptCurrency: (currency: string) => void
  receiptDate: string
  setReceiptDate: (date: string) => void
  receiptMethod: string
  setReceiptMethod: (method: string) => void
  receiptAccountId: string
  setReceiptAccountId: (accountId: string) => void
  receiptNotes: string
  setReceiptNotes: (notes: string) => void
  receiptExRate: { rate: number; rateId: string | null; source: string }
  onReceiptComplete: () => void
}

export function SupplierReceiptDialog({
  open,
  onOpenChange,
  supplierId,
  supplierName,
  maxAmount,
  accounts,
  appCurrency,
  currencies,
  receiptAmount,
  setReceiptAmount,
  receiptCurrency,
  setReceiptCurrency,
  receiptDate,
  setReceiptDate,
  receiptMethod,
  setReceiptMethod,
  receiptAccountId,
  setReceiptAccountId,
  receiptNotes,
  setReceiptNotes,
  receiptExRate,
  onReceiptComplete
}: SupplierReceiptDialogProps) {
  const supabase = useSupabase()
  const { toast } = useToast()
  const appLang = typeof window !== 'undefined' ? ((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') : 'ar'

  const [isProcessing, setIsProcessing] = useState(false)

  const processSupplierReceipt = async () => {
    if (!receiptAmount || receiptAmount <= 0) {
      toast({
        variant: "destructive",
        title: appLang === 'en' ? 'Invalid Amount' : 'مبلغ غير صالح',
        description: appLang === 'en' ? 'Please enter a valid receipt amount' : 'الرجاء إدخال مبلغ استقبال صالح'
      })
      return
    }

    if (receiptAmount > maxAmount) {
      toast({
        variant: "destructive",
        title: appLang === 'en' ? 'Amount Exceeds Balance' : 'المبلغ يتجاوز الرصيد',
        description: appLang === 'en' ? 'Receipt amount cannot exceed available balance' : 'مبلغ الاستقبال لا يمكن أن يتجاوز الرصيد المتاح'
      })
      return
    }

    if (!receiptAccountId) {
      toast({
        variant: "destructive",
        title: appLang === 'en' ? 'Account Required' : 'الحساب مطلوب',
        description: appLang === 'en' ? 'Please select an account for the receipt' : 'الرجاء اختيار حساب للاستقبال'
      })
      return
    }

    setIsProcessing(true)

    try {
      const activeCompanyId = await getActiveCompanyId(supabase)
      if (!activeCompanyId) {
        throw new Error('No active company')
      }

      // Find supplier debit account
      const find = (f: (a: any) => boolean) => (accounts || []).find(f)?.id
      const supplierDebit = find((a: any) => String(a.sub_type || "").toLowerCase() === "supplier_debit") ||
                           find((a: any) => String(a.sub_type || "").toLowerCase() === "supplier_advance") ||
                           find((a: any) => String(a.account_name || "").toLowerCase().includes("سلف الموردين")) ||
                           find((a: any) => String(a.account_name || "").toLowerCase().includes("رصيد الموردين"))

      // Calculate base amount in app currency
      const baseReceiptAmount = receiptCurrency === appCurrency ?
        receiptAmount :
        Math.round(receiptAmount * receiptExRate.rate * 10000) / 10000

      // ===== إنشاء قيد استقبال رصيد المورد =====
      // القيد المحاسبي (عكس سند صرف العميل):
      // مدين: النقد/البنك (دخول المبلغ) - receiptAccountId
      // دائن: رصيد المورد المدين (تقليل المستحق لنا) - supplierDebit
      //
      // 🔑 نستخدم UUID فريد لكل عملية استرداد لتفادي trigger الـ DUPLICATE_JOURNAL_VIOLATION
      // (الـ trigger يمنع إدخال قيدين بنفس reference_type و reference_id)
      const receiptRefId = crypto.randomUUID()
      const { data: entry, error: entryError } = await supabase
        .from("journal_entries")
        .insert({
          company_id: activeCompanyId,
          reference_type: "supplier_debit_receipt",
          reference_id: receiptRefId,
          entry_date: receiptDate,
          description: receiptNotes || (appLang === 'en' ? `Supplier cash refund - ${supplierName}` : `استرداد نقدي من المورد - ${supplierName}`),
        })
        .select()
        .single()

      if (entryError) throw entryError

      if (entry?.id) {
        const lines = []
        // مدين: النقد/البنك (دخول المبلغ من المورد)
        lines.push({
          journal_entry_id: entry.id,
          account_id: receiptAccountId,
          debit_amount: baseReceiptAmount,
          credit_amount: 0,
          description: appLang === 'en' ? 'Cash/Bank receipt from supplier' : 'استقبال نقدي/بنكي من المورد',
          original_currency: receiptCurrency,
          original_debit: receiptAmount,
          original_credit: 0,
          exchange_rate_used: receiptExRate.rate,
          exchange_rate_id: receiptExRate.rateId || null
        })
        // دائن: رصيد المورد المدين (نخفض المستحق لنا من المورد)
        if (supplierDebit) {
          lines.push({
            journal_entry_id: entry.id,
            account_id: supplierDebit,
            debit_amount: 0,
            credit_amount: baseReceiptAmount,
            description: appLang === 'en' ? 'Supplier debit settlement' : 'تسوية رصيد المورد المدين',
            original_currency: receiptCurrency,
            original_debit: 0,
            original_credit: receiptAmount,
            exchange_rate_used: receiptExRate.rate,
            exchange_rate_id: receiptExRate.rateId || null
          })
        }

        const { error: linesError } = await supabase.from("journal_entry_lines").insert(lines)
        if (linesError) throw linesError
      }

      // ===== تحديث جدول vendor_credits لخصم المبلغ المسترد =====
      const { data: debits } = await supabase
        .from("vendor_credits")
        .select("id, total_amount, applied_amount")
        .eq("company_id", activeCompanyId)
        .eq("supplier_id", supplierId)
        .in("status", ["open", "partially_applied"])
        .order("credit_date", { ascending: true })

      let remainingToDeduct = receiptAmount
      if (debits && debits.length > 0) {
        for (const debit of debits) {
          if (remainingToDeduct <= 0) break
          
          const totalAmt = Number(debit.total_amount || 0)
          const appliedAmt = Number(debit.applied_amount || 0)
          const available = totalAmt - appliedAmt
          
          if (available <= 0) continue

          const deductAmount = Math.min(available, remainingToDeduct)
          const newAppliedAmount = appliedAmt + deductAmount
          
          let newStatus = "partially_applied"
          if (newAppliedAmount >= totalAmt) {
            newStatus = "applied"
          }

          await supabase
            .from("vendor_credits")
            .update({
              applied_amount: newAppliedAmount,
              status: newStatus,
              updated_at: new Date().toISOString()
            })
            .eq("id", debit.id)

          remainingToDeduct -= deductAmount
        }
      }

      toastActionSuccess(toast, appLang === 'en' ? 'Cash Refund' : 'الاسترداد', appLang === 'en' ? 'Supplier cash refund completed' : 'تم استرداد السلفة النقدية من المورد بنجاح')

      // Reset form
      setReceiptAmount(0)
      setReceiptNotes("")
      setReceiptMethod("cash")
      setReceiptAccountId("")

      // Close dialog and refresh
      onOpenChange(false)
      onReceiptComplete()

    } catch (error: any) {
      console.error("Receipt error:", error)
      toastActionError(toast, appLang === 'en' ? 'Receipt' : 'الاسترداد', appLang === 'en' ? 'Supplier refund' : 'استرداد السلفة', String(error?.message || error || ''), appLang, 'OPERATION_FAILED')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{appLang==='en' ? 'Vendor Cash Refund' : 'استرداد نقدي (سلفة مورد)'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <p className="text-sm text-gray-600 dark:text-gray-400">{appLang==='en' ? 'Supplier' : 'المورد'}: <span className="font-semibold">{supplierName}</span></p>
            <p className="text-sm text-gray-600 dark:text-gray-400">{appLang==='en' ? 'Available Refund Balance' : 'رصيد السلفة المتاح للاسترداد'}: <span className="font-semibold text-blue-600">{maxAmount.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}</span></p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{appLang==='en' ? 'Refund Amount' : 'مبلغ الاسترداد'}</Label>
              <Input
                type="number"
                value={receiptAmount}
                max={maxAmount}
                onChange={(e) => setReceiptAmount(Math.min(Number(e.target.value || 0), maxAmount))}
              />
            </div>
            <div className="space-y-2">
              <Label>{appLang==='en' ? 'Currency' : 'العملة'}</Label>
              <Select value={receiptCurrency} onValueChange={setReceiptCurrency}>
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
          {receiptCurrency !== appCurrency && receiptAmount > 0 && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded text-sm">
              <div>{appLang==='en' ? 'Exchange Rate' : 'سعر الصرف'}: <strong>1 {receiptCurrency} = {receiptExRate.rate.toFixed(4)} {appCurrency}</strong> ({receiptExRate.source})</div>
              <div>{appLang==='en' ? 'Base Amount' : 'المبلغ الأساسي'}: <strong>{(receiptAmount * receiptExRate.rate).toFixed(2)} {appCurrency}</strong></div>
            </div>
          )}
          <div className="space-y-2">
            <Label>{appLang==='en' ? 'Date' : 'التاريخ'}</Label>
            <Input type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{appLang==='en' ? 'Refund Method' : 'طريقة الاسترداد'}</Label>
            <Select value={receiptMethod} onValueChange={setReceiptMethod}>
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
            <Label>{appLang==='en' ? 'Cash / Bank Account' : 'حساب الخزنة / البنك'}</Label>
            <Select value={receiptAccountId} onValueChange={setReceiptAccountId}>
              <SelectTrigger>
                <SelectValue placeholder={appLang==='en' ? 'Select cash or bank account' : 'اختر حساب الخزنة أو البنك'} />
              </SelectTrigger>
              <SelectContent>
                {accounts.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-gray-500">
                    {appLang==='en' ? 'No cash/bank accounts found for your branch' : 'لا توجد حسابات خزنة أو بنك لفرعك'}
                  </div>
                ) : (
                  accounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>
                      <span className="flex items-center gap-2">
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                          acc.sub_type === 'bank'
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                            : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                        }`}>
                          {acc.sub_type === 'bank'
                            ? (appLang === 'en' ? 'Bank' : 'بنك')
                            : (appLang === 'en' ? 'Cash' : 'خزنة')}
                        </span>
                        {acc.account_code} - {acc.account_name}
                      </span>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {appLang==='en'
                ? '🔒 Only cash and bank accounts are shown'
                : '🔒 تظهر فقط حسابات الخزنة والبنك'}
            </p>
          </div>
          <div className="space-y-2">
            <Label>{appLang==='en' ? 'Notes' : 'ملاحظات'}</Label>
            <Input value={receiptNotes} onChange={(e) => setReceiptNotes(e.target.value)} placeholder={appLang==='en' ? 'Optional notes' : 'ملاحظات اختيارية'} />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing}>{appLang==='en' ? 'Cancel' : 'إلغاء'}</Button>
            <Button
              onClick={processSupplierReceipt}
              className="bg-blue-600 hover:bg-blue-700"
              disabled={isProcessing || !receiptAmount || receiptAmount <= 0 || receiptAmount > maxAmount || !receiptAccountId}
            >
              {isProcessing ? (appLang==='en' ? 'Processing...' : 'جاري المعالجة...') : (appLang==='en' ? 'Confirm Refund' : 'تأكيد الاسترداد')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

