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
import { ExchangeRateSelector } from "@/components/ExchangeRateSelector"

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
  // v3.74.200 — original_currency added so the dialog can filter accounts
  // by the selected refund currency.
  accounts: { id: string; account_code: string; account_name: string; account_type: string; sub_type?: string; original_currency?: string | null }[]
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

  // v3.74.200 — Account currency FX state. When the chosen bank/cash
  // account is denominated in a different currency from the refund, the
  // dialog needs an exchange rate AccountCurrency → BaseCurrency so the
  // service can post the cash line in the right amount.
  const [accountFxRate, setAccountFxRate] = useState<number>(1)
  const [accountFxRateId, setAccountFxRateId] = useState<string | null>(null)
  const [accountFxSource, setAccountFxSource] = useState<string | null>(null)

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
      const baseRefundAmount = refundCurrency === appCurrency
        ? refundAmount
        : Math.round(refundAmount * refundExRate.rate * 10000) / 10000

      // v3.74.200 — derive account FX so the API can post the cash line
      // in the account's native currency. If the chosen account matches
      // the refund currency, nothing changes — accountFxRate stays 1 and
      // accountNativeAmount equals refundAmount.
      const selectedAccount = accounts.find(a => a.id === refundAccountId)
      const selectedAccCcy = String((selectedAccount as any)?.original_currency || appCurrency || 'EGP').toUpperCase()
      const refundCcyUpper = (refundCurrency || appCurrency || 'EGP').toUpperCase()
      const crossCurrency = Boolean(selectedAccount) && selectedAccCcy !== refundCcyUpper
      const effectiveAccountRate = crossCurrency ? (accountFxRate > 0 ? accountFxRate : 1) : 1
      const accountNativeAmount = crossCurrency
        ? Math.round((baseRefundAmount / effectiveAccountRate) * 10000) / 10000
        : (refundCcyUpper === selectedAccCcy ? refundAmount : baseRefundAmount)

      // 🔐 تحديد الفرع ومركز التكلفة للقيد (قيمة "none" تعني بدون فرع/مركز تكلفة)
      const finalBranchId = isPrivilegedUser
        ? (selectedBranchId && selectedBranchId !== 'none' ? selectedBranchId : null)
        : (userBranchId || null)
      const finalCostCenterId = isPrivilegedUser
        ? (selectedCostCenterId && selectedCostCenterId !== 'none' ? selectedCostCenterId : null)
        : (userCostCenterId || null)

      const idempotencyKey = globalThis.crypto?.randomUUID?.() || `customer-refund-${Date.now()}`
      // v3.74.183 — accountants (and any non-privileged role) file a refund
      // REQUEST that goes to the approval queue. Owner / admin / general_manager
      // still cash out immediately via /api/customers/refunds for back-office
      // convenience. Symmetric with the supplier refund flow.
      const endpoint = isPrivilegedUser ? "/api/customers/refunds" : "/api/customers/refund-requests"
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          customerId,
          amount: refundAmount,
          currencyCode: refundCurrency,
          exchangeRate: refundExRate.rate,
          baseAmount: baseRefundAmount,
          refundAccountId,
          refundDate,
          refundMethod,
          notes: refundNotes || null,
          invoiceId,
          invoiceNumber,
          branchId: finalBranchId,
          costCenterId: finalCostCenterId,
          exchangeRateId: refundExRate.rateId || null,
          rateSource: refundExRate.source || null,
          uiSurface: "customer_refund_dialog",
          // v3.74.200 — Account FX (only meaningful when the chosen account's
          // currency differs from the refund currency; harmless otherwise).
          accountCurrency: selectedAccCcy,
          accountFxRate: effectiveAccountRate,
          accountFxRateId: crossCurrency ? accountFxRateId : null,
          accountFxSource: crossCurrency ? accountFxSource : null,
          accountNativeAmount,
        }),
      })

      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) {
        throw new Error(result.error || (appLang === 'en' ? 'Failed to record customer refund' : 'فشل تسجيل صرف رصيد العميل'))
      }

      if (isPrivilegedUser) {
        toastActionSuccess(toast, appLang === 'en' ? 'Refund' : 'الصرف', appLang === 'en' ? 'Customer credit refund completed' : 'تم صرف رصيد العميل بنجاح')
      } else {
        toastActionSuccess(toast, appLang === 'en' ? 'Refund Request' : 'طلب الصرف', appLang === 'en' ? 'Refund request submitted for management approval' : 'تم رفع طلب الصرف بانتظار اعتماد الإدارة')
      }

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
                inputMode="decimal"
                step="0.01"
                min="0"
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
          {/* v3.74.200 — Account picker with currency-aware filtering.
              Step 1: drop customer_credit / customer_advance sub-types (existing rule).
              Step 2: prefer accounts whose original_currency matches refundCurrency.
              Step 3: if none match, fall back to showing all branch accounts so
                      the accountant can still complete the refund, and warn that
                      FX conversion will apply.
              Step 4: when the chosen account differs from refundCurrency, render
                      an ExchangeRateSelector for AccountCurrency → BaseCurrency
                      so the cash line gets the right native amount. */}
          {(() => {
            const baseCcy = (appCurrency || 'EGP').toUpperCase()
            const refundCcy = (refundCurrency || baseCcy).toUpperCase()
            const cashBank = accounts.filter((acc) => {
              const st = String((acc as any).sub_type || '').toLowerCase()
              return st !== 'customer_credit' && st !== 'customer_advance'
            })
            const accCcy = (acc: any) => String((acc?.original_currency || baseCcy)).toUpperCase()
            const inRefundCcy = cashBank.filter(a => accCcy(a) === refundCcy)
            const displayed = inRefundCcy.length > 0 ? inRefundCcy : cashBank
            const noMatchInCcy = inRefundCcy.length === 0 && cashBank.length > 0

            const selectedAccount = cashBank.find(a => a.id === refundAccountId)
            const selectedAccCcy = selectedAccount ? accCcy(selectedAccount) : baseCcy
            const crossCurrency = Boolean(selectedAccount) && selectedAccCcy !== refundCcy

            const baseRefundAmount = refundCcy === baseCcy
              ? refundAmount
              : Math.round(refundAmount * refundExRate.rate * 10000) / 10000
            const accountNativeAmount = crossCurrency && accountFxRate > 0
              ? Math.round((baseRefundAmount / accountFxRate) * 10000) / 10000
              : (refundCcy === selectedAccCcy ? refundAmount : baseRefundAmount)

            return (
              <>
                <div className="space-y-2">
                  <Label>{appLang==='en' ? 'Account' : 'الحساب'}</Label>
                  <Select value={refundAccountId} onValueChange={setRefundAccountId}>
                    <SelectTrigger>
                      <SelectValue placeholder={appLang==='en' ? 'Select account' : 'اختر الحساب'} />
                    </SelectTrigger>
                    <SelectContent>
                      {displayed.map((acc) => {
                        const ccy = accCcy(acc)
                        const ccyBadge = ccy !== refundCcy ? ` [${ccy}]` : ''
                        return (
                          <SelectItem key={acc.id} value={acc.id}>
                            {acc.account_code} - {acc.account_name}{ccyBadge}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                  {noMatchInCcy && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400">
                      {appLang === 'en'
                        ? `No account in ${refundCcy} for this branch — showing all accounts. FX conversion will apply.`
                        : `لا يوجد حساب بِعُملَة ${refundCcy} فى هذا الفَرع — يَتِم عَرض جَميع الحِسابات. سَيَتِم تَطبيق تَحويل عُملات.`}
                    </p>
                  )}
                </div>

                {crossCurrency && refundAmount > 0 && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded space-y-2 border border-amber-200 dark:border-amber-800">
                    <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                      {appLang === 'en' ? '💱 Currency conversion' : '💱 تَحويل عُملَة'}
                    </p>
                    <ExchangeRateSelector
                      fromCurrency={selectedAccCcy}
                      baseCurrency={baseCcy}
                      value={accountFxRate}
                      onChange={setAccountFxRate}
                      onRateMetaChange={(meta) => {
                        if (meta) {
                          setAccountFxRateId(meta.rateId)
                          setAccountFxSource(meta.source)
                        } else {
                          setAccountFxRateId(null)
                          setAccountFxSource(null)
                        }
                      }}
                      labelEn={`Account rate (${selectedAccCcy} → ${baseCcy})`}
                      labelAr={`سعر صَرف الحِساب (${selectedAccCcy} → ${baseCcy})`}
                    />
                    {accountFxRate > 0 && (
                      <div className="text-xs text-gray-700 dark:text-gray-300">
                        <div>
                          {appLang === 'en' ? 'Will withdraw' : 'سَيُسحَب من الحِساب'}{' '}
                          <strong>{accountNativeAmount.toLocaleString('ar-EG', { maximumFractionDigits: 4 })} {selectedAccCcy}</strong>
                          {' '}({appLang === 'en' ? 'equivalent to' : 'يُعادِل'}{' '}
                          <strong>{baseRefundAmount.toFixed(2)} {baseCcy}</strong>)
                        </div>
                        {accountFxSource && (
                          <div className="text-[11px] text-gray-500">
                            {appLang === 'en' ? 'Rate source' : 'مَصدَر السِّعر'}: {accountFxSource === 'manual' ? (appLang === 'en' ? 'manual' : 'يَدَوى') : (appLang === 'en' ? 'live (API)' : 'لَحظى')}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )
          })()}
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
