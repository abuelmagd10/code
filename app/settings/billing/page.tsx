'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  CreditCard, Users, CheckCircle, AlertTriangle,
  Clock, ArrowLeft, Plus, Minus, Loader2, RefreshCw,
  Receipt, Calendar, Shield, Zap, TrendingDown, Sparkles, Globe,
  Award, Gift,
} from 'lucide-react'

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────
interface SeatStatus {
  total_paid_seats: number
  used_seats: number
  reserved_seats: number
  available_seats: number
  can_invite: boolean
  subscription_status: string
}

interface PricingPreview {
  seats: number
  billingPeriod: 'monthly' | 'annual'
  targetCurrency: string
  countryCode: string
  basePriceUsd: number
  subtotalUsd: number
  volumeDiscountPercent: number
  volumeDiscountUsd: number
  annualDiscountPercent: number
  annualDiscountUsd: number
  couponDiscountPercent: number
  couponDiscountUsd: number
  totalDiscountUsd: number
  afterDiscountsUsd: number
  taxRate: number
  taxAmountUsd: number
  totalUsd: number
  exchangeRate: number
  subtotalDisplay: number
  discountDisplay: number
  afterDiscountsDisplay: number
  taxAmountDisplay: number
  totalDisplay: number
  // EGP charge fields (Paymob)
  chargeCurrency?: string
  chargeExchangeRate?: number
  chargeTotalEgp?: number
  monthsInPeriod: number
  couponApplied?: string
  couponValid?: boolean
  notes: string[]
}

interface SeatTransaction {
  id: string
  transaction_type: string
  seats_delta: number
  amount_egp: number | null
  paymob_transaction_id: string | null
  created_at: string
  metadata: Record<string, any>
}

const STATUS_MAP: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  free:           { label: 'مجاني (مالك فقط)',  color: 'text-gray-600 bg-gray-100 dark:bg-gray-800',  icon: <Shield className="w-4 h-4" /> },
  active:         { label: 'نشط',                color: 'text-green-700 bg-green-100 dark:bg-green-900/30', icon: <CheckCircle className="w-4 h-4" /> },
  past_due:       { label: 'متأخر في الدفع',     color: 'text-amber-700 bg-amber-100 dark:bg-amber-900/30', icon: <Clock className="w-4 h-4" /> },
  payment_failed: { label: 'فشل الدفع',          color: 'text-red-700 bg-red-100 dark:bg-red-900/30',   icon: <AlertTriangle className="w-4 h-4" /> },
  canceled:       { label: 'ملغى',               color: 'text-gray-500 bg-gray-100 dark:bg-gray-800',   icon: <Minus className="w-4 h-4" /> },
}

const TXN_TYPE_MAP: Record<string, string> = {
  purchase: '🛒 شراء مقاعد',
  reserve:  '🔒 حجز مقعد',
  release:  '🔓 تحرير مقعد',
  activate: '✅ تفعيل مقعد',
  refund:   '↩️ استرداد',
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', EGP: 'ج.م', SAR: 'ر.س', AED: 'د.إ'
}

function formatMoney(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency.toUpperCase()] || currency
  const formatted = amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${symbol} ${formatted}`
}

// ─────────────────────────────────────────
// Component
// ─────────────────────────────────────────
export default function BillingPage() {
  const router = useRouter()
  const [status, setStatus] = useState<SeatStatus | null>(null)
  const [transactions, setTransactions] = useState<SeatTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [txnLoading, setTxnLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Pricing UI state
  const [seatsToAdd, setSeatsToAdd] = useState(1)
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly')
  const [couponCode, setCouponCode] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState('')
  const [pricing, setPricing] = useState<PricingPreview | null>(null)
  const [pricingLoading, setPricingLoading] = useState(false)

  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)

  // ─── Fetch seat status ───
  const fetchStatus = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/billing/seats')
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          router.push('/settings/users')
          return
        }
        setError(data?.error || 'تعذر جلب بيانات الاشتراك')
        return
      }
      setStatus(data)
    } catch {
      setError('خطأ في الاتصال بالخادم')
    } finally {
      setLoading(false)
    }
  }, [router])

  // ─── Fetch live pricing preview ───
  const fetchPricing = useCallback(async () => {
    if (seatsToAdd < 1) return
    setPricingLoading(true)
    try {
      const params = new URLSearchParams({
        seats: String(seatsToAdd),
        period: billingPeriod,
      })
      if (appliedCoupon) params.set('coupon', appliedCoupon)

      const res = await fetch(`/api/billing/preview?${params}`)
      if (res.ok) {
        const data = await res.json()
        setPricing(data)
      }
    } catch (e) {
      console.warn('Pricing preview failed', e)
    } finally {
      setPricingLoading(false)
    }
  }, [seatsToAdd, billingPeriod, appliedCoupon])

  const fetchTransactions = useCallback(async () => {
    setTxnLoading(true)
    try {
      const res = await fetch('/api/billing/transactions')
      const data = await res.json()
      if (res.ok && Array.isArray(data)) setTransactions(data)
    } catch { }
    finally { setTxnLoading(false) }
  }, [])

  useEffect(() => {
    fetchStatus()
    fetchTransactions()
  }, [fetchStatus, fetchTransactions])

  // Debounced pricing fetch on inputs change
  useEffect(() => {
    const timer = setTimeout(fetchPricing, 300)
    return () => clearTimeout(timer)
  }, [fetchPricing])

  // ─── Initiate payment ───
  const handlePurchase = async () => {
    if (seatsToAdd < 1 || seatsToAdd > 1000) return
    setCheckoutLoading(true)
    setCheckoutError(null)
    try {
      const res = await fetch('/api/billing/seats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seats: seatsToAdd,
          billing_period: billingPeriod,
          coupon: appliedCoupon || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setCheckoutError(data?.error || 'فشل في إنشاء طلب الدفع')
        return
      }
      if (data?.checkout_url) {
        window.location.href = data.checkout_url
      } else {
        setCheckoutError('لم يتم استلام رابط الدفع من بوابة الدفع')
      }
    } catch (e: any) {
      setCheckoutError(e.message || 'خطأ في الاتصال')
    } finally {
      setCheckoutLoading(false)
    }
  }

  const handleApplyCoupon = () => {
    setAppliedCoupon(couponCode.trim().toUpperCase())
  }

  const displayCurrency = pricing?.targetCurrency || 'USD'
  const monthsLabel = billingPeriod === 'annual' ? '/سنة' : '/شهر'
  const perSeatPriceUsd = pricing
    ? (pricing.afterDiscountsUsd / pricing.seats / pricing.monthsInPeriod).toFixed(2)
    : '10.00'

  // ─────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-violet-600" />
          <p className="text-gray-500 text-sm">جارٍ تحميل بيانات الاشتراك...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-950">
        <div className="text-center max-w-sm">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-gray-700 dark:text-gray-300 mb-4">{error}</p>
          <button onClick={fetchStatus} className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm hover:bg-violet-700">
            إعادة المحاولة
          </button>
        </div>
      </div>
    )
  }

  const subStatus = STATUS_MAP[status?.subscription_status ?? 'free'] ?? STATUS_MAP.free

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950" dir="rtl">
      <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/settings/users" className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors">
              <ArrowLeft className="w-5 h-5 text-gray-500 rotate-180" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">إدارة الاشتراك</h1>
              <p className="text-sm text-gray-500">أسعار عالمية بـ {displayCurrency} • تحويل تلقائى من $10 USD</p>
            </div>
          </div>
          <button
            onClick={() => { fetchStatus(); fetchTransactions(); fetchPricing() }}
            className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
            title="تحديث"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>

        {/* Status Banner */}
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl ${subStatus.color}`}>
          {subStatus.icon}
          <span className="font-semibold text-sm">حالة الاشتراك: {subStatus.label}</span>
        </div>

        {/* Seat Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon={<CreditCard className="w-6 h-6 text-violet-600" />}
            label="مقاعد مدفوعة"
            value={status?.total_paid_seats ?? 0}
            bg="bg-violet-50 dark:bg-violet-900/20"
          />
          <StatCard
            icon={<Users className="w-6 h-6 text-blue-600" />}
            label="مستخدمون نشطون"
            value={status?.used_seats ?? 0}
            bg="bg-blue-50 dark:bg-blue-900/20"
            note="المالك مجاني"
          />
          <StatCard
            icon={<Clock className="w-6 h-6 text-amber-600" />}
            label="دعوات معلقة"
            value={status?.reserved_seats ?? 0}
            bg="bg-amber-50 dark:bg-amber-900/20"
            note="محجوزة"
          />
          <StatCard
            icon={<CheckCircle className="w-6 h-6 text-green-600" />}
            label="مقاعد متاحة"
            value={status?.available_seats ?? 0}
            bg="bg-green-50 dark:bg-green-900/20"
            highlight={status?.available_seats === 0}
          />
        </div>

        {/* Live Pricing Display */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-gray-100 dark:border-slate-800">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-violet-100 dark:bg-violet-900/30 rounded-lg">
              <Globe className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">سعر المقعد</h3>
              <p className="text-xs text-gray-500">$10 USD/شهر — يتم تحويله للعملة المحلية بسعر الصرف اللحظى</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-slate-800">
              <p className="text-xs text-gray-500 mb-1">USD</p>
              <p className="text-2xl font-bold text-violet-600">${perSeatPriceUsd}</p>
              <p className="text-[10px] text-gray-400">{monthsLabel}</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-violet-50 dark:bg-violet-900/20 ring-2 ring-violet-200">
              <p className="text-xs text-violet-700 dark:text-violet-300 mb-1">{displayCurrency}</p>
              <p className="text-2xl font-bold text-violet-700 dark:text-violet-300">
                {pricing ? formatMoney(pricing.afterDiscountsDisplay / pricing.seats / pricing.monthsInPeriod, displayCurrency) : '...'}
              </p>
              <p className="text-[10px] text-violet-500">سعر الصرف: {pricing?.exchangeRate.toFixed(4)}</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-900/20">
              <p className="text-xs text-green-700 dark:text-green-300 mb-1">VAT</p>
              <p className="text-2xl font-bold text-green-700 dark:text-green-300">{pricing?.taxRate ?? 0}%</p>
              <p className="text-[10px] text-green-500">{pricing?.countryCode}</p>
            </div>
          </div>
        </div>

        {/* Purchase seats card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 overflow-hidden">
          <div className="p-5 border-b border-gray-100 dark:border-slate-800 flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <Plus className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white">إضافة مقاعد جديدة</h2>
              <p className="text-xs text-gray-500">ستُضاف المقاعد فور تأكيد الدفع</p>
            </div>
          </div>
          <div className="p-5 space-y-5">

            {/* Billing period toggle */}
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex-shrink-0">
                دورة الفوترة:
              </label>
              <div className="flex bg-gray-100 dark:bg-slate-800 rounded-xl p-1">
                <button
                  onClick={() => setBillingPeriod('monthly')}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    billingPeriod === 'monthly'
                      ? 'bg-white dark:bg-slate-700 text-violet-600 shadow-sm'
                      : 'text-gray-600 dark:text-gray-400'
                  }`}
                >
                  شهرى
                </button>
                <button
                  onClick={() => setBillingPeriod('annual')}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all relative ${
                    billingPeriod === 'annual'
                      ? 'bg-white dark:bg-slate-700 text-violet-600 shadow-sm'
                      : 'text-gray-600 dark:text-gray-400'
                  }`}
                >
                  سنوى
                  <span className="absolute -top-2 -end-2 px-1.5 py-0.5 bg-green-500 text-white text-[10px] rounded-full font-bold">
                    -17%
                  </span>
                </button>
              </div>
            </div>

            {/* Seat counter */}
            <div className="flex items-center gap-4 flex-wrap">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex-shrink-0">
                عدد المقاعد:
              </label>
              <div className="flex items-center gap-3 bg-gray-50 dark:bg-slate-800 rounded-xl p-1">
                <button
                  onClick={() => setSeatsToAdd(Math.max(1, seatsToAdd - 1))}
                  className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={seatsToAdd}
                  onChange={(e) => setSeatsToAdd(Math.max(1, Math.min(1000, parseInt(e.target.value) || 1)))}
                  className="w-16 text-center font-bold text-lg text-gray-900 dark:text-white bg-transparent focus:outline-none"
                />
                <button
                  onClick={() => setSeatsToAdd(Math.min(1000, seatsToAdd + 1))}
                  className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Volume discount badge */}
              {pricing && pricing.volumeDiscountPercent > 0 && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-xs font-semibold">
                  <Award className="w-3.5 h-3.5" />
                  خصم الكمية: -{pricing.volumeDiscountPercent}%
                </span>
              )}
            </div>

            {/* Coupon input */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex-shrink-0">
                كود خصم:
              </label>
              <input
                type="text"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                placeholder="WELCOME20"
                className="flex-1 px-3 py-2 bg-gray-50 dark:bg-slate-800 rounded-lg text-sm text-gray-900 dark:text-white border border-transparent focus:border-violet-400 focus:outline-none"
              />
              <button
                onClick={handleApplyCoupon}
                disabled={!couponCode.trim()}
                className="px-3 py-2 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 rounded-lg text-sm font-medium hover:bg-violet-200 disabled:opacity-50"
              >
                <Gift className="w-4 h-4 inline" /> طبّق
              </button>
              {appliedCoupon && pricing?.couponValid && (
                <span className="text-xs text-green-600 font-medium">✓ {appliedCoupon}</span>
              )}
            </div>

            {/* Live cost breakdown */}
            <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-4 space-y-2">
              {pricingLoading && (
                <div className="flex justify-center py-2">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              )}
              {pricing && !pricingLoading && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">
                      {seatsToAdd} مقعد × ${pricing.basePriceUsd} × {pricing.monthsInPeriod} {pricing.monthsInPeriod === 12 ? 'شهر' : 'شهر'}
                    </span>
                    <span className="font-medium">{formatMoney(pricing.subtotalDisplay, displayCurrency)}</span>
                  </div>

                  {pricing.volumeDiscountPercent > 0 && (
                    <div className="flex justify-between text-sm text-green-700 dark:text-green-400">
                      <span className="flex items-center gap-1"><TrendingDown className="w-3.5 h-3.5" />خصم الكمية ({pricing.volumeDiscountPercent}%)</span>
                      <span>-{formatMoney(round2(pricing.volumeDiscountUsd * pricing.exchangeRate), displayCurrency)}</span>
                    </div>
                  )}

                  {pricing.annualDiscountPercent > 0 && (
                    <div className="flex justify-between text-sm text-green-700 dark:text-green-400">
                      <span className="flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" />خصم سنوى ({pricing.annualDiscountPercent}%)</span>
                      <span>-{formatMoney(round2(pricing.annualDiscountUsd * pricing.exchangeRate), displayCurrency)}</span>
                    </div>
                  )}

                  {pricing.couponValid && pricing.couponDiscountUsd > 0 && (
                    <div className="flex justify-between text-sm text-green-700 dark:text-green-400">
                      <span className="flex items-center gap-1"><Gift className="w-3.5 h-3.5" />كوبون ({pricing.couponApplied})</span>
                      <span>-{formatMoney(round2(pricing.couponDiscountUsd * pricing.exchangeRate), displayCurrency)}</span>
                    </div>
                  )}

                  <div className="border-t border-gray-200 dark:border-slate-700 pt-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400">المجموع قبل الضريبة</span>
                      <span className="font-medium">{formatMoney(pricing.afterDiscountsDisplay, displayCurrency)}</span>
                    </div>
                  </div>

                  {pricing.taxRate > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400">ضريبة القيمة المضافة ({pricing.taxRate}%)</span>
                      <span className="font-medium">{formatMoney(pricing.taxAmountDisplay, displayCurrency)}</span>
                    </div>
                  )}

                  <div className="border-t-2 border-gray-300 dark:border-slate-600 pt-2 flex justify-between">
                    <span className="font-semibold text-gray-900 dark:text-white">الإجمالى</span>
                    <span className="font-bold text-violet-600 text-xl">{formatMoney(pricing.totalDisplay, displayCurrency)}</span>
                  </div>
                  <p className="text-xs text-gray-400 text-end">
                    ≈ ${pricing.totalUsd} USD
                  </p>

                  {/* EGP charge notice (when display currency != EGP) */}
                  {displayCurrency !== 'EGP' && pricing.chargeTotalEgp && (
                    <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                      <div className="flex items-start gap-2">
                        <CreditCard className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 text-xs">
                          <p className="font-semibold text-amber-800 dark:text-amber-300 mb-1">💳 سيتم التحصيل بالجنيه المصرى</p>
                          <div className="flex justify-between items-center">
                            <span className="text-amber-700 dark:text-amber-400">المبلغ المُحصَّل عبر Paymob:</span>
                            <span className="font-bold text-amber-900 dark:text-amber-200 text-base">
                              {formatMoney(pricing.chargeTotalEgp, 'EGP')}
                            </span>
                          </div>
                          {pricing.chargeExchangeRate && (
                            <p className="text-[10px] text-amber-600 dark:text-amber-500 mt-1">
                              سعر الصرف: 1 USD = {pricing.chargeExchangeRate.toFixed(2)} EGP (لحظى)
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {checkoutError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {checkoutError}
              </div>
            )}

            <button
              onClick={handlePurchase}
              disabled={checkoutLoading || !pricing}
              className="w-full flex items-center justify-center gap-2 py-3 px-6 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 disabled:opacity-60 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-violet-500/25"
            >
              {checkoutLoading ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> جارٍ التحويل لبوابة الدفع...</>
              ) : (
                <><CreditCard className="w-5 h-5" /> الدفع الآن {pricing && `— ${formatMoney(pricing.totalDisplay, displayCurrency)}`}</>
              )}
            </button>

            <p className="text-xs text-gray-400 text-center">
              ✅ الدفع الآمن عبر Paymob • HTTPS مشفر • لن تُضاف المقاعد إلا بعد تأكيد الدفع
            </p>
          </div>
        </div>

        {/* Transactions history */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 overflow-hidden">
          <div className="p-5 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Receipt className="w-5 h-5 text-blue-600" />
              </div>
              <h2 className="font-semibold text-gray-900 dark:text-white">سجل معاملات المقاعد</h2>
            </div>
            {txnLoading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
          </div>
          <div className="divide-y divide-gray-50 dark:divide-slate-800">
            {transactions.length === 0 && !txnLoading && (
              <div className="p-8 text-center">
                <Receipt className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">لا توجد معاملات بعد</p>
              </div>
            )}
            {transactions.map((txn) => (
              <div key={txn.id} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {TXN_TYPE_MAP[txn.transaction_type] || txn.transaction_type}
                  </span>
                  {txn.seats_delta !== 0 && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      txn.seats_delta > 0
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-400'
                    }`}>
                      {txn.seats_delta > 0 ? `+${txn.seats_delta}` : txn.seats_delta}
                    </span>
                  )}
                </div>
                <div className="text-left rtl:text-right flex items-center gap-4">
                  {txn.amount_egp && (
                    <span className="text-sm font-medium text-violet-600">{txn.amount_egp.toLocaleString()} جنيه</span>
                  )}
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(txn.created_at).toLocaleDateString('ar-EG')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Volume discount info */}
        <div className="grid md:grid-cols-3 gap-3 text-xs">
          <div className="p-3 bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 rounded-lg border border-violet-100 dark:border-violet-800">
            <p className="font-semibold text-violet-700 dark:text-violet-300 mb-1">🎯 10+ مقاعد</p>
            <p className="text-gray-600 dark:text-gray-400">خصم 10%</p>
          </div>
          <div className="p-3 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
            <p className="font-semibold text-blue-700 dark:text-blue-300 mb-1">🚀 25+ مقاعد</p>
            <p className="text-gray-600 dark:text-gray-400">خصم 15%</p>
          </div>
          <div className="p-3 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg border border-green-100 dark:border-green-800">
            <p className="font-semibold text-green-700 dark:text-green-300 mb-1">🏆 50+ مقاعد</p>
            <p className="text-gray-600 dark:text-gray-400">خصم 20%</p>
          </div>
        </div>

        {/* Back link */}
        <div className="flex justify-center">
          <Link
            href="/settings/users"
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 rotate-180" />
            العودة إلى إدارة المستخدمين
          </Link>
        </div>
      </div>
      </main>
    </div>
  )
}

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function StatCard({
  icon, label, value, bg, note, highlight
}: {
  icon: React.ReactNode
  label: string
  value: number
  bg: string
  note?: string
  highlight?: boolean
}) {
  return (
    <div className={`rounded-2xl p-4 border border-transparent ${bg}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="p-2 bg-white/60 dark:bg-slate-900/40 rounded-lg">{icon}</div>
        {highlight && value === 0 && (
          <span className="text-xs text-red-500 font-medium">ممتلئ</span>
        )}
      </div>
      <p className={`text-3xl font-bold mb-1 ${highlight && value === 0 ? 'text-red-600' : 'text-gray-900 dark:text-white'}`}>
        {value}
      </p>
      <p className="text-xs font-medium text-gray-600 dark:text-gray-400">{label}</p>
      {note && <p className="text-[10px] text-gray-400 mt-0.5">{note}</p>}
    </div>
  )
}
