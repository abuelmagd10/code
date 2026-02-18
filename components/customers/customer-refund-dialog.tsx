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

// 🔐 الأدوار المميزة التي يمكنها اختيار الفرع ومركز التكلفة يدوياً
const PRIVILEGED_ROLES = ['owner', 'admin', 'general_manager']

interface Branch {
  id: string
  name: string
  defaultCostCenterId?: string | null
}

interface CostCenter {
  id: string
  name: string
  code?: string
}

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
  // 🔐 ERP Governance - سياق المستخدم
  userRole?: string
  userBranchId?: string | null
  userCostCenterId?: string | null
  // 🔐 قوائم الفروع ومراكز التكلفة (للأدوار المميزة)
  branches?: Branch[]
  costCenters?: CostCenter[]
  // 📄 مصدر الفاتورة (اختياري - لربط الصرف بالفاتورة)
  invoiceId?: string | null
  invoiceNumber?: string | null
  // 🏢 فرع ومركز تكلفة الفاتورة كقيم افتراضية للأدوار المميزة
  invoiceBranchId?: string | null
  invoiceCostCenterId?: string | null
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
  onRefundComplete,
  // 🔐 ERP Governance
  userRole = 'staff',
  userBranchId = null,
  userCostCenterId = null,
  branches = [],
  costCenters = [],
  // 📄 مصدر الفاتورة
  invoiceId = null,
  invoiceNumber = null,
  // 🏢 فرع ومركز تكلفة الفاتورة
  invoiceBranchId = null,
  invoiceCostCenterId = null,
}: CustomerRefundDialogProps) {
  const supabase = useSupabase()
  const { toast } = useToast()
  const appLang = typeof window !== 'undefined' ? ((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') : 'ar'

  const [isProcessing, setIsProcessing] = useState(false)

  // 🔐 حالات الفرع ومركز التكلفة
  const isPrivilegedUser = PRIVILEGED_ROLES.includes(userRole.toLowerCase())
  // للأدوار المميزة: استخدم فرع الفاتورة افتراضياً، وإلا فرع المستخدم
  // 'none' هي القيمة المناسبة عند غياب اختيار (تتطابق مع SelectItem value="none")
  const defaultBranchId = isPrivilegedUser ? (invoiceBranchId || userBranchId || 'none') : (userBranchId || 'none')
  const defaultCostCenterId = isPrivilegedUser ? (invoiceCostCenterId || userCostCenterId || 'none') : (userCostCenterId || 'none')
  const [selectedBranchId, setSelectedBranchId] = useState<string>(defaultBranchId)
  const [selectedCostCenterId, setSelectedCostCenterId] = useState<string>(defaultCostCenterId)

  // 🏢 أسماء الفرع ومركز التكلفة للمحاسب (للعرض فقط)
  const [lockedBranchName, setLockedBranchName] = useState<string>('')
  const [lockedCostCenterName, setLockedCostCenterName] = useState<string>('')

  // تحديث القيم الافتراضية عند فتح النافذة
  useEffect(() => {
    if (open) {
      // للمميزين: فرع الفاتورة أولاً، ثم فرع المستخدم
      // لغير المميزين: فرع المستخدم فقط
      const bId = isPrivilegedUser ? (invoiceBranchId || userBranchId || 'none') : (userBranchId || 'none')
      const ccId = isPrivilegedUser ? (invoiceCostCenterId || userCostCenterId || 'none') : (userCostCenterId || 'none')
      setSelectedBranchId(bId)
      setSelectedCostCenterId(ccId)
    }
  }, [open, isPrivilegedUser, invoiceBranchId, invoiceCostCenterId, userBranchId, userCostCenterId])

  // 🏢 تحميل أسماء الفرع ومركز التكلفة للمستخدمين غير المميزين (محاسب الفرع)
  useEffect(() => {
    if (isPrivilegedUser || !open) return
    ;(async () => {
      try {
        const activeCompanyId = await getActiveCompanyId(supabase)
        if (!activeCompanyId) return
        if (userBranchId) {
          const { data: branch } = await supabase
            .from("branches")
            .select("branch_name")
            .eq("id", userBranchId)
            .maybeSingle()
          setLockedBranchName(branch?.branch_name || '')
        }
        if (userCostCenterId) {
          const { data: cc } = await supabase
            .from("cost_centers")
            .select("cost_center_name")
            .eq("id", userCostCenterId)
            .maybeSingle()
          setLockedCostCenterName(cc?.cost_center_name || '')
        }
      } catch { /* ignore */ }
    })()
  }, [open, isPrivilegedUser, userBranchId, userCostCenterId, supabase])

  // 🔄 تحديث مركز التكلفة تلقائياً عند تغيير الفرع بواسطة المستخدم
  const handleBranchChange = (newBranchId: string) => {
    setSelectedBranchId(newBranchId)
    if (newBranchId && newBranchId !== 'none' && branches) {
      const branch = branches.find(b => b.id === newBranchId)
      if (branch?.defaultCostCenterId) {
        const ccExists = costCenters?.some(cc => cc.id === branch.defaultCostCenterId)
        if (ccExists) setSelectedCostCenterId(branch.defaultCostCenterId)
        else setSelectedCostCenterId('none')
      } else {
        setSelectedCostCenterId('none')
      }
    } else {
      setSelectedCostCenterId('none')
    }
  }



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

      // 🔐 تحديد الفرع ومركز التكلفة للقيد (قيمة "none" تعني بدون فرع/مركز تكلفة)
      const finalBranchId = isPrivilegedUser
        ? (selectedBranchId && selectedBranchId !== 'none' ? selectedBranchId : null)
        : (userBranchId || null)
      const finalCostCenterId = isPrivilegedUser
        ? (selectedCostCenterId && selectedCostCenterId !== 'none' ? selectedCostCenterId : null)
        : (userCostCenterId || null)

      // ===== إنشاء قيد صرف رصيد العميل =====
      // القيد المحاسبي:
      // مدين: رصيد العميل الدائن (تقليل الالتزام) - customerCredit
      // دائن: النقد/البنك (خروج المبلغ) - refundAccountId

      // 📄 تحديد الوصف مع رقم الفاتورة إن وُجد
      const descriptionWithInvoice = invoiceNumber
        ? (appLang === 'en'
            ? `Customer credit refund - ${customerName} - Invoice #${invoiceNumber}`
            : `صرف رصيد دائن للعميل - ${customerName} - فاتورة #${invoiceNumber}`)
        : (refundNotes || (appLang === 'en' ? `Customer credit refund - ${customerName}` : `صرف رصيد دائن للعميل - ${customerName}`))

      const { data: entry, error: entryError } = await supabase
        .from("journal_entries")
        .insert({
          company_id: activeCompanyId,
          reference_type: invoiceId ? "invoice_credit_refund" : "customer_credit_refund",
          reference_id: invoiceId || customerId,
          entry_date: refundDate,
          description: descriptionWithInvoice,
          branch_id: finalBranchId,
          cost_center_id: finalCostCenterId
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
            exchange_rate_id: refundExRate.rateId || null,
            branch_id: finalBranchId,
            cost_center_id: finalCostCenterId
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
          exchange_rate_id: refundExRate.rateId || null,
          branch_id: finalBranchId,
          cost_center_id: finalCostCenterId
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
      // 📄 تحديد الملاحظات مع رقم الفاتورة إن وُجد
      const paymentNotes = invoiceNumber
        ? (appLang === 'en'
            ? `Credit refund to customer ${customerName} - Invoice #${invoiceNumber}`
            : `صرف رصيد دائن للعميل ${customerName} - فاتورة #${invoiceNumber}`)
        : (refundNotes || (appLang === 'en' ? `Credit refund to customer ${customerName}` : `صرف رصيد دائن للعميل ${customerName}`))

      // ⚠️ لا نضيف invoice_id هنا عمداً:
      // صرف الرصيد الدائن هو عملية شركة→عميل مستقلة وليست دفعة على الفاتورة.
      // ربطها بـ invoice_id يُسبب تحديث paid_amount في الفاتورة (عبر trigger قاعدة البيانات)
      // مما يُغير الحالة من "مدفوعة" إلى "مدفوعة جزئياً" بشكل خاطئ.
      // رقم الفاتورة موجود في notes و reference_number للمرجعية.
      const paymentPayload: any = {
        company_id: activeCompanyId,
        customer_id: customerId,
        payment_date: refundDate,
        amount: -refundAmount, // سالب لأنه صرف للعميل
        payment_method: refundMethod === "bank" ? "bank" : "cash",
        reference_number: invoiceNumber ? `REF-INV-${invoiceNumber}-${Date.now()}` : `REF-${Date.now()}`,
        notes: paymentNotes,
        branch_id: finalBranchId,
        cost_center_id: finalCostCenterId
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
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle>{appLang==='en' ? 'Refund Customer Credit' : 'صرف رصيد العميل الدائن'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 overflow-y-auto flex-1 px-6 pb-2">
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

          {/* 🏢 عرض الفرع ومركز التكلفة للمحاسب - قراءة فقط */}
          {!isPrivilegedUser && (lockedBranchName || lockedCostCenterName) && (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg space-y-1 border border-amber-200 dark:border-amber-800">
              <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                {appLang === 'en' ? '🏢 Branch Assignment (Fixed)' : '🏢 تعيين الفرع (ثابت)'}
              </p>
              {lockedBranchName && (
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {appLang === 'en' ? 'Branch' : 'الفرع'}: <span className="font-semibold">{lockedBranchName}</span>
                </p>
              )}
              {lockedCostCenterName && (
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {appLang === 'en' ? 'Cost Center' : 'مركز التكلفة'}: <span className="font-semibold">{lockedCostCenterName}</span>
                </p>
              )}
            </div>
          )}

          {/* 🔐 اختيار الفرع ومركز التكلفة - للأدوار المميزة فقط */}
          {isPrivilegedUser && (branches.length > 0 || costCenters.length > 0) && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg space-y-3">
              <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                {appLang === 'en' ? '🏢 Assignment (Admin)' : '🏢 التعيين (المدير)'}
              </p>
              {branches.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm">{appLang === 'en' ? 'Branch' : 'الفرع'}</Label>
                  <Select value={selectedBranchId} onValueChange={handleBranchChange}>
                    <SelectTrigger>
                      <SelectValue placeholder={appLang === 'en' ? 'Select branch' : 'اختر الفرع'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{appLang === 'en' ? '-- No Branch --' : '-- بدون فرع --'}</SelectItem>
                      {branches.map((branch) => (
                        <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {costCenters.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm">{appLang === 'en' ? 'Cost Center' : 'مركز التكلفة'}</Label>
                  <Select value={selectedCostCenterId} onValueChange={setSelectedCostCenterId}>
                    <SelectTrigger>
                      <SelectValue placeholder={appLang === 'en' ? 'Select cost center' : 'اختر مركز التكلفة'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{appLang === 'en' ? '-- No Cost Center --' : '-- بدون مركز تكلفة --'}</SelectItem>
                      {costCenters.map((cc) => (
                        <SelectItem key={cc.id} value={cc.id}>{cc.code ? `${cc.code} - ` : ''}{cc.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

        </div>
        {/* أزرار ثابتة في أسفل الديالوج */}
        <div className="flex gap-2 justify-end px-6 py-4 border-t shrink-0 bg-white dark:bg-gray-950">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing}>{appLang==='en' ? 'Cancel' : 'إلغاء'}</Button>
          <Button 
            onClick={processCustomerRefund} 
            className="bg-green-600 hover:bg-green-700" 
            disabled={isProcessing || !refundAmount || refundAmount <= 0 || refundAmount > maxAmount || !refundAccountId}
          >
            {isProcessing ? (appLang==='en' ? 'Processing...' : 'جاري المعالجة...') : (appLang==='en' ? 'Confirm Refund' : 'تأكيد الصرف')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}