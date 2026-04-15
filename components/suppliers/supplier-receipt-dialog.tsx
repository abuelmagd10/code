"use client"

import { useState, useEffect } from "react"
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
import { ShieldAlert, Clock, CheckCircle2 } from "lucide-react"

// ─── Notification helpers ─────────────────────────────────────────────────────
import { notifyVendorRefundRequestCreated } from "@/lib/notification-helpers"

// الأدوار المميزة التي تنفذ فوراً بدون انتظار اعتماد
const PRIVILEGED_ROLES = ['owner', 'admin', 'general_manager']

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
  /** دور المستخدم الحالي — يحدد إذا كان التنفيذ فورياً أو بحاجة اعتماد */
  userRole?: string
  /** معرف الفرع (للإشعارات) */
  branchId?: string
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
  onReceiptComplete,
  userRole = '',
  branchId,
}: SupplierReceiptDialogProps) {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')

  useEffect(() => {
    try { setAppLang((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') } catch { }
  }, [])

  const [isProcessing, setIsProcessing] = useState(false)

  // هل الدور مميز؟ → تنفيذ فوري
  const isPrivileged = PRIVILEGED_ROLES.includes(userRole.toLowerCase())

  // دالة التحقق المشتركة من المدخلات
  const validateInputs = (): boolean => {
    if (!receiptAmount || receiptAmount <= 0) {
      toast({
        variant: "destructive",
        title: appLang === 'en' ? 'Invalid Amount' : 'مبلغ غير صالح',
        description: appLang === 'en' ? 'Please enter a valid receipt amount' : 'الرجاء إدخال مبلغ استقبال صالح'
      })
      return false
    }
    if (receiptAmount > maxAmount) {
      toast({
        variant: "destructive",
        title: appLang === 'en' ? 'Amount Exceeds Balance' : 'المبلغ يتجاوز الرصيد',
        description: appLang === 'en' ? 'Receipt amount cannot exceed available balance' : 'مبلغ الاسترداد لا يمكن أن يتجاوز الرصيد المتاح'
      })
      return false
    }
    if (!receiptAccountId) {
      toast({
        variant: "destructive",
        title: appLang === 'en' ? 'Account Required' : 'الحساب مطلوب',
        description: appLang === 'en' ? 'Please select an account for the receipt' : 'الرجاء اختيار حساب للاستقبال'
      })
      return false
    }
    return true
  }

  // ====================================================================
  //  مسار 1: المحاسب/الدور العادي → رفع طلب استرداد (Pending Approval)
  // ====================================================================
  const submitRefundRequest = async () => {
    if (!validateInputs()) return
    setIsProcessing(true)
    try {
      const activeCompanyId = await getActiveCompanyId(supabase)
      if (!activeCompanyId) throw new Error('No active company')

      const baseReceiptAmount = receiptCurrency === appCurrency
        ? receiptAmount
        : Math.round(receiptAmount * receiptExRate.rate * 10000) / 10000

      const { data: result, error } = await supabase.rpc('create_vendor_refund_request', {
        p_company_id: activeCompanyId,
        p_supplier_id: supplierId,
        p_amount: receiptAmount,
        p_currency: receiptCurrency,
        p_exchange_rate: receiptExRate.rate,
        p_base_amount: baseReceiptAmount,
        p_receipt_account_id: receiptAccountId,
        p_receipt_date: receiptDate,
        p_notes: receiptNotes || null,
        p_branch_id: branchId || null,
        p_cost_center_id: null,
      })

      if (error) throw error
      if (!result?.success) throw new Error(result?.error || 'Unknown error')

      const requestId = result.request_id

      // إرسال إشعار للأدوار الإدارية (fire-and-forget)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user && requestId) {
          notifyVendorRefundRequestCreated({
            companyId: activeCompanyId,
            requestId,
            supplierName,
            amount: receiptAmount,
            currency: receiptCurrency,
            branchId,
            createdBy: user.id,
            appLang,
          }).catch(console.warn)
        }
      } catch { /* الإشعار اختياري */ }

      toast({
        title: appLang === 'en' ? '✅ Request Submitted' : '✅ تم رفع الطلب',
        description: appLang === 'en'
          ? `Refund request for ${receiptAmount.toLocaleString()} ${receiptCurrency} has been sent for management approval.`
          : `تم رفع طلب استرداد ${receiptAmount.toLocaleString()} ${receiptCurrency} وبانتظار اعتماد الإدارة.`,
        duration: 6000,
      })

      resetForm()
      onOpenChange(false)
      onReceiptComplete()

    } catch (error: any) {
      console.error("Refund request error:", error)
      toastActionError(toast, appLang === 'en' ? 'Request' : 'الطلب', appLang === 'en' ? 'Vendor refund request' : 'طلب الاسترداد', String(error?.message || error || ''), appLang, 'OPERATION_FAILED')
    } finally {
      setIsProcessing(false)
    }
  }

  // ====================================================================
  //  مسار 2: الأدوار المميزة → تنفيذ فوري (Auto-Approve)
  // ====================================================================
  const processSupplierReceipt = async () => {
    if (!validateInputs()) return
    setIsProcessing(true)
    try {
      const baseReceiptAmount = receiptCurrency === appCurrency
        ? receiptAmount
        : Math.round(receiptAmount * receiptExRate.rate * 10000) / 10000

      const idempotencyKey = globalThis.crypto?.randomUUID?.() || `supplier-refund-receipt-${Date.now()}`
      const response = await fetch("/api/suppliers/refunds/receipt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          supplierId,
          amount: receiptAmount,
          currencyCode: receiptCurrency,
          exchangeRate: receiptExRate.rate,
          baseAmount: baseReceiptAmount,
          receiptAccountId,
          receiptDate,
          notes: receiptNotes || (appLang === 'en' ? `Supplier cash refund - ${supplierName}` : `استرداد نقدي من المورد - ${supplierName}`),
          branchId: branchId || null,
          exchangeRateId: receiptExRate.rateId || null,
          rateSource: receiptExRate.source || null,
          uiSurface: "supplier_receipt_dialog",
        }),
      })

      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) {
        throw new Error(result.error || (appLang === 'en' ? 'Failed to record supplier refund' : 'فشل تسجيل استرداد المورد'))
      }

      toastActionSuccess(
        toast,
        appLang === 'en' ? 'Cash Refund' : 'الاسترداد',
        appLang === 'en' ? 'Supplier cash refund completed successfully' : 'تم استرداد السلفة النقدية من المورد بنجاح'
      )

      resetForm()
      onOpenChange(false)
      onReceiptComplete()

    } catch (error: any) {
      console.error("Receipt error:", error)
      toastActionError(toast, appLang === 'en' ? 'Receipt' : 'الاسترداد', appLang === 'en' ? 'Supplier refund' : 'استرداد السلفة', String(error?.message || error || ''), appLang, 'OPERATION_FAILED')
    } finally {
      setIsProcessing(false)
    }
  }

  const resetForm = () => {
    setReceiptAmount(0)
    setReceiptNotes("")
    setReceiptMethod("cash")
    setReceiptAccountId("")
  }

  const handleConfirm = () => {
    if (isPrivileged) {
      processSupplierReceipt()
    } else {
      submitRefundRequest()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{appLang === 'en' ? 'Vendor Cash Refund' : 'استرداد نقدي (سلفة مورد)'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">

          {/* بانر المعلومات + تحذير الاعتماد للأدوار العادية */}
          <div className={`p-3 rounded-lg border ${isPrivileged
            ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
            : 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700'}`}>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {appLang === 'en' ? 'Supplier' : 'المورد'}: <span className="font-semibold">{supplierName}</span>
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {appLang === 'en' ? 'Available Refund Balance' : 'رصيد السلفة المتاح'}:{' '}
              <span className="font-semibold text-blue-600">{maxAmount.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}</span>
            </p>
            {!isPrivileged && (
              <div className="mt-2 flex items-start gap-2 text-amber-700 dark:text-amber-400">
                <Clock className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p className="text-xs font-medium">
                  {appLang === 'en'
                    ? 'This refund request will be sent to management for approval. No cash movement will occur until approved.'
                    : 'سيُرفع هذا الطلب للإدارة للاعتماد. لن تتم أي حركة نقدية قبل الموافقة.'}
                </p>
              </div>
            )}
            {isPrivileged && (
              <div className="mt-2 flex items-center gap-2 text-blue-700 dark:text-blue-400">
                <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                <p className="text-xs font-medium">
                  {appLang === 'en'
                    ? 'As a privileged role, this refund will be executed immediately.'
                    : 'بصفتك مستخدماً مميزاً، سيُنفَّذ الاسترداد فوراً.'}
                </p>
              </div>
            )}
          </div>

          {/* المبلغ والعملة */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{appLang === 'en' ? 'Refund Amount' : 'مبلغ الاسترداد'}</Label>
              <Input
                type="number"
                value={receiptAmount}
                max={maxAmount}
                onChange={(e) => setReceiptAmount(Math.min(Number(e.target.value || 0), maxAmount))}
              />
            </div>
            <div className="space-y-2">
              <Label>{appLang === 'en' ? 'Currency' : 'العملة'}</Label>
              <Select value={receiptCurrency} onValueChange={setReceiptCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {currencies.length > 0
                    ? currencies.map(c => <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>)
                    : DEFAULT_CURRENCIES.map(c => <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>)
                  }
                </SelectContent>
              </Select>
            </div>
          </div>

          {receiptCurrency !== appCurrency && receiptAmount > 0 && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded text-sm">
              <div>{appLang === 'en' ? 'Exchange Rate' : 'سعر الصرف'}: <strong>1 {receiptCurrency} = {receiptExRate.rate.toFixed(4)} {appCurrency}</strong> ({receiptExRate.source})</div>
              <div>{appLang === 'en' ? 'Base Amount' : 'المبلغ الأساسي'}: <strong>{(receiptAmount * receiptExRate.rate).toFixed(2)} {appCurrency}</strong></div>
            </div>
          )}

          {/* التاريخ */}
          <div className="space-y-2">
            <Label>{appLang === 'en' ? 'Date' : 'التاريخ'}</Label>
            <Input type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} />
          </div>

          {/* طريقة الاسترداد */}
          <div className="space-y-2">
            <Label>{appLang === 'en' ? 'Refund Method' : 'طريقة الاسترداد'}</Label>
            <Select value={receiptMethod} onValueChange={setReceiptMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">{appLang === 'en' ? 'Cash' : 'نقداً'}</SelectItem>
                <SelectItem value="bank">{appLang === 'en' ? 'Bank Transfer' : 'تحويل بنكي'}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* الحساب */}
          <div className="space-y-2">
            <Label>{appLang === 'en' ? 'Cash / Bank Account' : 'حساب الخزنة / البنك'}</Label>
            <Select value={receiptAccountId} onValueChange={setReceiptAccountId}>
              <SelectTrigger>
                <SelectValue placeholder={appLang === 'en' ? 'Select cash or bank account' : 'اختر حساب الخزنة أو البنك'} />
              </SelectTrigger>
              <SelectContent>
                {accounts.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-gray-500">
                    {appLang === 'en' ? 'No cash/bank accounts found for your branch' : 'لا توجد حسابات خزنة أو بنك لفرعك'}
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
                          {acc.sub_type === 'bank' ? (appLang === 'en' ? 'Bank' : 'بنك') : (appLang === 'en' ? 'Cash' : 'خزنة')}
                        </span>
                        {acc.account_code} - {acc.account_name}
                      </span>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {appLang === 'en' ? '🔒 Only cash and bank accounts are shown' : '🔒 تظهر فقط حسابات الخزنة والبنك'}
            </p>
          </div>

          {/* ملاحظات */}
          <div className="space-y-2">
            <Label>{appLang === 'en' ? 'Notes' : 'ملاحظات'}</Label>
            <Input
              value={receiptNotes}
              onChange={(e) => setReceiptNotes(e.target.value)}
              placeholder={appLang === 'en' ? 'Optional notes' : 'ملاحظات اختيارية'}
            />
          </div>

          {/* أزرار التأكيد */}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing}>
              {appLang === 'en' ? 'Cancel' : 'إلغاء'}
            </Button>
            <Button
              onClick={handleConfirm}
              className={isPrivileged
                ? "bg-blue-600 hover:bg-blue-700"
                : "bg-amber-600 hover:bg-amber-700"}
              disabled={isProcessing || !receiptAmount || receiptAmount <= 0 || receiptAmount > maxAmount || !receiptAccountId}
            >
              {isProcessing
                ? (appLang === 'en' ? 'Processing...' : 'جاري المعالجة...')
                : isPrivileged
                  ? (appLang === 'en' ? 'Confirm Refund' : 'تأكيد الاسترداد')
                  : (appLang === 'en' ? 'Submit Refund Request' : 'رفع طلب استرداد')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
