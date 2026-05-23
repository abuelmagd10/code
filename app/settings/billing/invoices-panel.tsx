'use client'

/**
 * InvoicesPanel - 7ESAB ERP v3.31.0
 *
 * Customer Portal embedded as the "الفواتير" tab inside /settings/billing.
 *
 * Sections:
 *   1. SubscriptionBanner — current plan, renewal date, cancel button
 *   2. InvoicesList       — filterable + paginated table with PDF download
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle,
  Clock,
  Download,
  FileText,
  Loader2,
  Minus,
  Shield,
  Users,
  X,
  XCircle,
} from 'lucide-react'

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

interface SubscriptionData {
  subscription: {
    company_id: string
    subscription_status: 'free' | 'active' | 'past_due' | 'payment_failed' | 'canceled'
    current_period_start: string | null
    current_period_end: string | null
    paymob_order_id: string | null
    is_in_grace_period: boolean
    can_invite: boolean
  }
  seats: {
    total_paid_seats: number
    used_seats: number
    available_seats: number
    can_invite: boolean
    price_per_seat_egp: number
  }
}

interface Invoice {
  id: string
  invoice_number: string
  invoice_type: string
  status: 'draft' | 'paid' | 'pending' | 'failed' | 'void'
  currency: string
  total: number
  total_usd: number | null
  tax_rate: number
  tax_amount: number
  seats_count: number | null
  billing_period: 'monthly' | 'annual' | null
  paymob_transaction_id: string | null
  paid_at: string | null
  period_start: string | null
  period_end: string | null
  pdf_url: string | null
  created_at: string
}

interface InvoicesResponse {
  invoices: Invoice[]
  total: number
  limit: number
  offset: number
}

// ─────────────────────────────────────────
// Status maps
// ─────────────────────────────────────────

const SUB_STATUS_MAP: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  free:           { label: 'مجاني (مالك فقط)', color: 'text-gray-600 bg-gray-100 dark:bg-gray-800',   icon: <Shield className="w-4 h-4" /> },
  active:         { label: 'نشط',              color: 'text-green-700 bg-green-100 dark:bg-green-900/30', icon: <CheckCircle className="w-4 h-4" /> },
  past_due:       { label: 'متأخر فى الدفع',   color: 'text-amber-700 bg-amber-100 dark:bg-amber-900/30', icon: <Clock className="w-4 h-4" /> },
  payment_failed: { label: 'فشل الدفع',        color: 'text-red-700 bg-red-100 dark:bg-red-900/30',   icon: <AlertTriangle className="w-4 h-4" /> },
  canceled:       { label: 'مُلغى التجديد',    color: 'text-gray-500 bg-gray-100 dark:bg-gray-800',   icon: <Minus className="w-4 h-4" /> },
}

const INV_STATUS_MAP: Record<Invoice['status'], { label: string; color: string }> = {
  paid:    { label: 'مدفوعة',    color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  pending: { label: 'قيد المعالجة', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  failed:  { label: 'فاشلة',      color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  draft:   { label: 'مسوّدة',     color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
  void:    { label: 'ملغاة',      color: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500' },
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', EGP: 'ج.م', SAR: 'ر.س', AED: 'د.إ',
}

function fmtMoney(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency.toUpperCase()] || currency
  const formatted = (amount || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${symbol} ${formatted}`
}

function fmtDate(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: '2-digit' })
}

const PAGE_SIZE = 10

// ─────────────────────────────────────────
// Main panel
// ─────────────────────────────────────────

export default function InvoicesPanel() {
  return (
    <div className="space-y-6">
      <SubscriptionBanner />
      <InvoicesList />
    </div>
  )
}

// ─────────────────────────────────────────
// Subscription Banner
// ─────────────────────────────────────────

function SubscriptionBanner() {
  const [data, setData] = useState<SubscriptionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/billing/subscription')
      const json = await res.json()
      if (!res.ok) {
        setError(json?.error || 'تعذر جلب بيانات الاشتراك')
        return
      }
      setData(json)
    } catch {
      setError('خطأ فى الاتصال بالخادم')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleCancel = async () => {
    setCanceling(true)
    setCancelError(null)
    try {
      const res = await fetch('/api/billing/subscription/cancel', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        setCancelError(json?.error || 'فشل فى إلغاء الاشتراك')
        return
      }
      setShowCancelModal(false)
      await fetchData()
    } catch (e: any) {
      setCancelError(e?.message || 'خطأ فى الاتصال')
    } finally {
      setCanceling(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-gray-100 dark:border-slate-800 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-violet-600" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4 text-sm text-red-700 dark:text-red-400">
        {error || 'تعذر تحميل بيانات الاشتراك'}
      </div>
    )
  }

  const status = SUB_STATUS_MAP[data.subscription.subscription_status] || SUB_STATUS_MAP.free
  const isPaidActive = data.subscription.subscription_status === 'active'
  const isCanceled = data.subscription.subscription_status === 'canceled'
  const isPastDue = data.subscription.subscription_status === 'past_due'
  const isSuspended = data.subscription.subscription_status === 'payment_failed'
  const planName = data.seats.total_paid_seats > 0 ? 'Paid Addon' : 'Free Plan'

  // Days until renewal (negative = past due)
  const daysToRenewal = data.subscription.current_period_end
    ? Math.ceil((new Date(data.subscription.current_period_end).getTime() - Date.now()) / 86400_000)
    : null
  const isExpiringSoon = isPaidActive && daysToRenewal !== null && daysToRenewal <= 3 && daysToRenewal >= 0

  return (
    <>
      <div className="bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 rounded-2xl p-5 border border-violet-100 dark:border-violet-800">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex-1 min-w-[220px]">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-violet-700 dark:text-violet-300 uppercase tracking-wide">الخطة الحالية</span>
              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${status.color}`}>
                {status.icon}
                {status.label}
              </span>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{planName}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <p className="text-gray-500 dark:text-gray-400">مقاعد مدفوعة</p>
                <p className="font-semibold text-gray-900 dark:text-white text-base">{data.seats.total_paid_seats}</p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400">مستخدمون</p>
                <p className="font-semibold text-gray-900 dark:text-white text-base">{data.seats.used_seats}</p>
              </div>
              {data.subscription.current_period_end && (
                <div>
                  <p className="text-gray-500 dark:text-gray-400">
                    {isCanceled ? 'تنتهى فى' : 'تجديد فى'}
                  </p>
                  <p className="font-semibold text-gray-900 dark:text-white text-base flex items-center gap-1">
                    <CalendarDays className="w-3.5 h-3.5" />
                    {fmtDate(data.subscription.current_period_end)}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Seats Management button - always visible */}
            <Link
              href="/settings/seats"
              className="px-3 py-2 bg-white dark:bg-slate-800 hover:bg-violet-50 dark:hover:bg-violet-900/20 text-violet-600 dark:text-violet-400 text-sm font-medium rounded-lg border border-violet-100 dark:border-violet-900 transition-colors flex items-center gap-2"
            >
              <Users className="w-4 h-4" />
              إدارة المقاعد
            </Link>

            {/* Cancel button — only for active subscriptions */}
            {isPaidActive && (
              <button
                onClick={() => setShowCancelModal(true)}
                className="px-3 py-2 bg-white dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 text-sm font-medium rounded-lg border border-red-100 dark:border-red-900 transition-colors flex items-center gap-2"
              >
                <XCircle className="w-4 h-4" />
                إلغاء الاشتراك
              </button>
            )}
          </div>
        </div>

        {/* Expiring soon warning (3 days or less) */}
        {isExpiringSoon && (
          <div className="mt-3 p-3 bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-lg flex items-start gap-2 text-xs">
            <Clock className="w-4 h-4 text-amber-700 dark:text-amber-300 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-amber-900 dark:text-amber-200 mb-0.5">
                اشتراكك ينتهى خلال {daysToRenewal === 0 ? 'اليوم' : daysToRenewal === 1 ? 'يوم واحد' : `${daysToRenewal} أيام`}
              </p>
              <p className="text-amber-800 dark:text-amber-300">
                جدّد الاشتراك من تبويب "الاشتراك" لتجنب أى انقطاع.
              </p>
            </div>
          </div>
        )}

        {/* Past due — grace period active */}
        {isPastDue && (
          <div className="mt-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded-lg flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-bold text-red-800 dark:text-red-200 text-sm mb-1">
                ⚠️ الاشتراك منتهٍ — فترة سماح
              </p>
              <p className="text-xs text-red-700 dark:text-red-300 mb-2">
                لم نتلقَّ دفعتك الجديدة. الحساب يعمل بشكل كامل خلال فترة سماح 3 أيام من تاريخ الانتهاء،
                ثم يُوقَف الحساب تلقائياً.
              </p>
              <p className="text-xs text-red-800 dark:text-red-200 font-semibold">
                ادفع الآن من تبويب "الاشتراك" لاستئناف التجديد.
              </p>
            </div>
          </div>
        )}

        {/* Suspended — grace period exceeded */}
        {isSuspended && (
          <div className="mt-3 p-4 bg-gray-800 dark:bg-gray-900 text-white rounded-lg flex items-start gap-3">
            <XCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-bold text-sm mb-1">
                🛑 الحساب مُوقَف مؤقتاً
              </p>
              <p className="text-xs text-gray-300 mb-2">
                انتهت فترة السماح بدون تجديد. المستخدمون لا يستطيعون تسجيل الدخول حالياً.
                <br />
                بياناتك آمنة 100%، وعند الدفع يُعاد تفعيل الحساب فوراً.
              </p>
              <p className="text-xs font-semibold text-red-300">
                اذهب إلى تبويب "الاشتراك" وادفع لاستعادة الوصول.
              </p>
            </div>
          </div>
        )}

        {isCanceled && (
          <div className="mt-3 p-3 bg-gray-100 dark:bg-slate-800 rounded-lg text-xs text-gray-700 dark:text-gray-300">
            تم إلغاء التجديد التلقائى. المقاعد ستبقى نشطة حتى نهاية الفترة الحالية، ثم يصبح الحساب على الخطة المجانية.
          </div>
        )}
      </div>

      {/* Cancel confirmation modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !canceling && setShowCancelModal(false)}>
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-md w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">تأكيد إلغاء الاشتراك</h3>
              </div>
              <button
                onClick={() => !canceling && setShowCancelModal(false)}
                disabled={canceling}
                className="p-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded transition-colors disabled:opacity-40"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              عند إلغاء الاشتراك:
            </p>
            <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-2 mb-5 pr-5 list-disc">
              <li>المقاعد ستبقى نشطة حتى نهاية الفترة المدفوعة الحالية.</li>
              <li>لن يُجدَّد الاشتراك تلقائياً بعد ذلك.</li>
              <li>لا يُسترَد المبلغ المدفوع للفترة الحالية.</li>
              <li>يمكنك إعادة الاشتراك فى أى وقت من خلال شراء مقاعد جديدة.</li>
            </ul>

            {cancelError && (
              <div className="mb-3 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-xs flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5" />
                {cancelError}
              </div>
            )}

            <div className="flex gap-3 justify-start">
              <button
                onClick={handleCancel}
                disabled={canceling}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2"
              >
                {canceling ? <><Loader2 className="w-4 h-4 animate-spin" /> جارٍ الإلغاء...</> : <>نعم، ألغِ الاشتراك</>}
              </button>
              <button
                onClick={() => setShowCancelModal(false)}
                disabled={canceling}
                className="px-4 py-2 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg transition-colors"
              >
                تراجع
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ─────────────────────────────────────────
// Invoices List
// ─────────────────────────────────────────

function InvoicesList() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const fetchInvoices = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      })
      if (statusFilter) params.set('status', statusFilter)
      const res = await fetch(`/api/billing/invoices?${params}`)
      const data: InvoicesResponse = await res.json()
      if (!res.ok) {
        setError((data as any)?.error || 'تعذر جلب الفواتير')
        return
      }
      setInvoices(data.invoices || [])
      setTotal(data.total || 0)
    } catch {
      setError('خطأ فى الاتصال بالخادم')
    } finally {
      setLoading(false)
    }
  }, [offset, statusFilter])

  useEffect(() => { fetchInvoices() }, [fetchInvoices])

  const handleDownload = async (invoiceId: string) => {
    setDownloadingId(invoiceId)
    setDownloadError(null)
    try {
      const res = await fetch(`/api/billing/invoices/${invoiceId}/pdf`)
      const data = await res.json()
      if (!res.ok || !data?.url) {
        setDownloadError(data?.error || 'تعذر إنشاء رابط التحميل')
        return
      }
      // Open signed URL in new tab (browser handles the actual download)
      window.open(data.url, '_blank', 'noopener,noreferrer')
    } catch (e: any) {
      setDownloadError(e?.message || 'خطأ فى التحميل')
    } finally {
      setDownloadingId(null)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-gray-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-violet-100 dark:bg-violet-900/30 rounded-lg">
            <FileText className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-white">فواتيرى</h2>
            <p className="text-xs text-gray-500">{total} فاتورة • PDF متاح للتحميل</p>
          </div>
        </div>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setOffset(0) }}
          className="px-3 py-2 bg-gray-50 dark:bg-slate-800 rounded-lg text-sm text-gray-900 dark:text-white border border-transparent focus:border-violet-400 focus:outline-none"
        >
          <option value="">جميع الحالات</option>
          <option value="paid">مدفوعة</option>
          <option value="pending">قيد المعالجة</option>
          <option value="failed">فاشلة</option>
          <option value="void">ملغاة</option>
        </select>
      </div>

      {/* Download error */}
      {downloadError && (
        <div className="mx-5 mt-3 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-xs flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5" />
          {downloadError}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="p-8 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-violet-600" />
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="p-6 text-center text-sm text-red-600 dark:text-red-400 flex flex-col items-center gap-3">
          <AlertTriangle className="w-8 h-8" />
          {error}
          <button onClick={fetchInvoices} className="px-3 py-1.5 bg-violet-600 text-white rounded-lg text-xs hover:bg-violet-700">
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && invoices.length === 0 && (
        <div className="p-12 text-center">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">لا توجد فواتير {statusFilter && `بحالة "${INV_STATUS_MAP[statusFilter as Invoice['status']]?.label || statusFilter}"`}</p>
          <p className="text-xs text-gray-400 mt-1">ستظهر الفواتير هنا بعد أول عملية دفع ناجحة</p>
        </div>
      )}

      {/* Table */}
      {!loading && !error && invoices.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-slate-800/50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-5 py-3 text-start font-medium">رقم الفاتورة</th>
                  <th className="px-5 py-3 text-start font-medium">التاريخ</th>
                  <th className="px-5 py-3 text-start font-medium">الفترة</th>
                  <th className="px-5 py-3 text-start font-medium">المقاعد</th>
                  <th className="px-5 py-3 text-start font-medium">الحالة</th>
                  <th className="px-5 py-3 text-end font-medium">المبلغ</th>
                  <th className="px-5 py-3 text-end font-medium">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
                {invoices.map((inv) => {
                  const invStatus = INV_STATUS_MAP[inv.status] || INV_STATUS_MAP.draft
                  const periodLabel = inv.billing_period === 'annual' ? 'سنوية' : inv.billing_period === 'monthly' ? 'شهرية' : '—'
                  return (
                    <tr key={inv.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-5 py-3 font-mono text-xs text-gray-900 dark:text-white">{inv.invoice_number}</td>
                      <td className="px-5 py-3 text-gray-600 dark:text-gray-400">{fmtDate(inv.paid_at || inv.created_at)}</td>
                      <td className="px-5 py-3 text-gray-600 dark:text-gray-400">{periodLabel}</td>
                      <td className="px-5 py-3 text-gray-600 dark:text-gray-400">{inv.seats_count ?? '—'}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${invStatus.color}`}>
                          {invStatus.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-end font-semibold text-gray-900 dark:text-white">
                        {fmtMoney(inv.total, inv.currency)}
                      </td>
                      <td className="px-5 py-3 text-end">
                        <button
                          onClick={() => handleDownload(inv.id)}
                          disabled={downloadingId === inv.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-100 dark:bg-violet-900/30 hover:bg-violet-200 dark:hover:bg-violet-900/50 disabled:opacity-50 text-violet-700 dark:text-violet-300 text-xs font-medium rounded-lg transition-colors"
                          title="تحميل PDF"
                        >
                          {downloadingId === inv.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Download className="w-3.5 h-3.5" />}
                          PDF
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-5 py-3 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between text-xs">
              <span className="text-gray-500">
                صفحة {currentPage} من {totalPages} • {total} فاتورة
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  disabled={offset === 0}
                  className="px-3 py-1.5 bg-gray-100 dark:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
                >
                  السابق
                </button>
                <button
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  disabled={offset + PAGE_SIZE >= total}
                  className="px-3 py-1.5 bg-gray-100 dark:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
                >
                  التالى
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
