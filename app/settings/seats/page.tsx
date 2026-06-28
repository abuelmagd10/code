'use client'

/**
 * /settings/seats — Seat Management UI (Phase H)
 *
 * Owner-facing view of who owns which seat number + subscription status.
 * Pulls from /api/billing/seats/assignments.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Users, Crown, AlertTriangle, CheckCircle, XCircle, Clock,
  Calendar, RefreshCw, ArrowLeft, Loader2, CreditCard, Lock,
  UserCheck, UserX, ShieldAlert, ChevronUp, ChevronDown,
} from 'lucide-react'

interface Member {
  user_id: string
  email: string | null
  name: string | null
  role: string
  created_at: string | null
}

interface SeatAssignment {
  seat_number: number
  // v3.74.378 — added 'expired' for occupied seats whose license has passed expires_at.
  role: 'free_owner' | 'paid' | 'expired' | 'over_quota' | 'empty'
  member: Member | null
  is_over_quota: boolean
  // v3.74.378 — per-seat license metadata. NULL for owner (seat 0)
  // and any over-quota row that doesn't have a backing license.
  license_id: string | null
  purchased_at: string | null
  expires_at: string | null
  is_expired: boolean
}

interface AssignmentsResponse {
  company_id: string
  company_name: string
  subscription_status: 'free' | 'active' | 'past_due' | 'payment_failed' | 'canceled'
  current_period_start: string | null
  current_period_end: string | null
  suspended_at: string | null
  billing_period: 'monthly' | 'annual'
  last_paid_at: string | null
  total_paid_seats: number
  paid_seats_used: number
  paid_seats_empty: number
  over_quota_count: number
  // v3.74.378 — new in Stage 2: total number of paid seats whose
  // license has passed expires_at. Lets the UI surface a stat
  // alongside "X محظور" without breaking older client logic.
  expired_seat_count?: number
  owner: Member | null
  is_caller_owner: boolean
  seats: SeatAssignment[]
}

const STATUS_BADGES: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  free:           { label: 'مجاني',          color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300', icon: <Lock className="w-3.5 h-3.5" /> },
  active:         { label: 'نشط',            color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: <CheckCircle className="w-3.5 h-3.5" /> },
  past_due:       { label: 'متأخر',          color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', icon: <Clock className="w-3.5 h-3.5" /> },
  payment_failed: { label: 'مُوقَف',          color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: <XCircle className="w-3.5 h-3.5" /> },
  canceled:       { label: 'مُلغى',          color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400', icon: <Lock className="w-3.5 h-3.5" /> },
}

function fmtDate(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })
}

function daysUntil(date: string | null): number | null {
  if (!date) return null
  const d = new Date(date).getTime()
  if (isNaN(d)) return null
  return Math.ceil((d - Date.now()) / 86_400_000)
}

export default function SeatsManagementPage() {
  const [data, setData] = useState<AssignmentsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [swappingSeats, setSwappingSeats] = useState<Set<number>>(new Set())
  const [swapError, setSwapError] = useState<string | null>(null)
  // v3.74.382 — Stage 5: renewal flow state.
  const [renewingSeats, setRenewingSeats] = useState<Set<string>>(new Set())
  const [renewError, setRenewError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/billing/seats/assignments')
      const json = await res.json()
      if (!res.ok) {
        setError(json?.error || 'تعذر جلب بيانات المقاعد')
        return
      }
      setData(json)
    } catch {
      setError('خطأ فى الاتصال بالخادم')
    } finally {
      setLoading(false)
    }
  }, [])

  const swapSeats = useCallback(async (seatA: number, seatB: number) => {
    if (seatA === 0 || seatB === 0) return  // never touch owner seat
    setSwappingSeats(new Set([seatA, seatB]))
    setSwapError(null)
    try {
      const res = await fetch('/api/billing/seats/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seat_a: seatA, seat_b: seatB }),
      })
      const json = await res.json()
      if (!res.ok) {
        setSwapError(json?.error || 'فشل تبديل المقاعد')
        return
      }
      await fetchData()
    } catch (e: any) {
      setSwapError(e?.message || 'خطأ فى الاتصال')
    } finally {
      setSwappingSeats(new Set())
    }
  }, [fetchData])

  // v3.74.382 — Stage 5: kick off Paymob checkout for renewing a set
  // of seat licenses. Modes: 'one' (single seat), 'many' (selected
  // ids), 'all_expired' (server resolves the list).
  const startRenewal = useCallback(async (
    mode: 'one' | 'many' | 'all_expired',
    seatLicenseIds: string[] = [],
  ) => {
    setRenewError(null)
    // Mark spinners on the affected rows so the user sees feedback.
    seatLicenseIds.forEach((id) => setRenewingSeats((prev) => new Set(prev).add(id)))
    try {
      const res = await fetch('/api/billing/seats/renew', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          seat_license_ids: seatLicenseIds,
          billing_period: data?.billing_period || 'monthly',
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setRenewError(json?.error || 'فشل بدء عملية التجديد')
        return
      }
      // Free-grant path: server already renewed; just refresh.
      if (json?.free_grant) {
        await fetchData()
        return
      }
      // Standard path: redirect to Paymob checkout.
      if (json?.checkout_url) {
        window.location.href = json.checkout_url
      } else {
        setRenewError('استجابة غير متوقعة من الخادم')
      }
    } catch (e: any) {
      setRenewError(e?.message || 'خطأ فى الاتصال')
    } finally {
      setRenewingSeats(new Set())
    }
  }, [data?.billing_period, fetchData])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-950">
        <Loader2 className="w-10 h-10 animate-spin text-violet-600" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-950 p-6">
        <div className="text-center max-w-sm">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-gray-700 dark:text-gray-300 mb-4">{error}</p>
          <button onClick={fetchData} className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm hover:bg-violet-700">
            إعادة المحاولة
          </button>
        </div>
      </div>
    )
  }

  const subBadge = STATUS_BADGES[data.subscription_status] ?? STATUS_BADGES.free
  const daysLeft = daysUntil(data.current_period_end)
  const isExpiringSoon = daysLeft !== null && daysLeft <= 3 && daysLeft >= 0 && data.subscription_status === 'active'
  const hasOverQuota = data.over_quota_count > 0
  // v3.74.378 — count of paid seats whose license has expired.
  const expiredSeatCount = data.expired_seat_count ?? data.seats.filter((s) => s.seat_number > 0 && s.is_expired).length
  const hasExpiredSeats = expiredSeatCount > 0

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950" dir="rtl">
      <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="max-w-5xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Link href="/settings/billing" className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors">
                <ArrowLeft className="w-5 h-5 text-gray-500 rotate-180" />
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">إدارة المقاعد</h1>
                <p className="text-sm text-gray-500">{data.company_name} • {data.seats.length} مقعد إجمالى</p>
              </div>
            </div>
            <button
              onClick={fetchData}
              className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
              title="تحديث"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>

          {/* Subscription Summary Card */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">حالة الاشتراك</p>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${subBadge.color}`}>
                  {subBadge.icon}
                  {subBadge.label}
                </span>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">نوع الفوترة</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {data.billing_period === 'annual' ? 'سنوية' : 'شهرية'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">آخر دفعة</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-gray-400" />
                  {fmtDate(data.last_paid_at)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  {data.subscription_status === 'canceled' ? 'تنتهى فى' : 'تجديد فى'}
                </p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-gray-400" />
                  {fmtDate(data.current_period_end)}
                </p>
                {daysLeft !== null && daysLeft >= 0 && (
                  <p className={`text-[10px] mt-0.5 ${daysLeft <= 3 ? 'text-amber-600 font-semibold' : 'text-gray-400'}`}>
                    {daysLeft === 0 ? 'اليوم' : `بعد ${daysLeft} يوم`}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Seat Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-violet-50 dark:bg-violet-900/20 rounded-xl p-4 border border-violet-100 dark:border-violet-900">
              <div className="flex items-center gap-2 mb-2">
                <Crown className="w-5 h-5 text-violet-600" />
                <p className="text-xs font-medium text-violet-700 dark:text-violet-300">المقعد المجانى</p>
              </div>
              <p className="text-2xl font-bold text-violet-700 dark:text-violet-300">1</p>
              <p className="text-[10px] text-violet-500">المالك (دائماً)</p>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 border border-green-100 dark:border-green-900">
              <div className="flex items-center gap-2 mb-2">
                <UserCheck className="w-5 h-5 text-green-600" />
                <p className="text-xs font-medium text-green-700 dark:text-green-300">مقاعد مدفوعة</p>
              </div>
              <p className="text-2xl font-bold text-green-700 dark:text-green-300">{data.total_paid_seats}</p>
              <p className="text-[10px] text-green-500">{data.paid_seats_used} مستخدم • {data.paid_seats_empty} متاح</p>
            </div>
            <div className={`rounded-xl p-4 border ${
              hasOverQuota
                ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-900'
                : 'bg-gray-50 dark:bg-slate-800 border-gray-100 dark:border-slate-700'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <UserX className={`w-5 h-5 ${hasOverQuota ? 'text-red-600' : 'text-gray-400'}`} />
                <p className={`text-xs font-medium ${
                  hasOverQuota ? 'text-red-700 dark:text-red-300' : 'text-gray-500'
                }`}>
                  محظورون
                </p>
              </div>
              <p className={`text-2xl font-bold ${
                hasOverQuota ? 'text-red-700 dark:text-red-300' : 'text-gray-400'
              }`}>
                {data.over_quota_count}
              </p>
              <p className="text-[10px] text-gray-400">فوق الحد المدفوع</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-100 dark:border-blue-900">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-5 h-5 text-blue-600" />
                <p className="text-xs font-medium text-blue-700 dark:text-blue-300">إجمالى الأعضاء</p>
              </div>
              <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                {data.seats.filter((s) => s.member !== null).length}
              </p>
              <p className="text-[10px] text-blue-500">مع المالك</p>
            </div>
          </div>

          {/* Alerts */}
          {hasOverQuota && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-red-800 dark:text-red-200 text-sm mb-1">
                  لديك {data.over_quota_count} موظف فوق الحد المدفوع
                </p>
                <p className="text-xs text-red-700 dark:text-red-300">
                  هؤلاء الموظفون لا يستطيعون الدخول حالياً (يرون شاشة "مقعدك غير مدفوع").
                  لاستعادة وصولهم، اضغط <Link href="/settings/billing" className="underline font-semibold">"إضافة مقاعد"</Link> ودفع الفارق.
                </p>
              </div>
            </div>
          )}

          {/* v3.74.378 — Expired seats alert. Each seat now has its
              own expires_at; some seats can be expired while others
              are still active in the same company.
              v3.74.382 — Stage 5: added "تجديد كل المنتهى" button
              so the owner can renew everything in one Paymob checkout. */}
          {hasExpiredSeats && (
            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl p-4 flex items-start gap-3">
              <Clock className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-orange-800 dark:text-orange-200 text-sm mb-1">
                  {expiredSeatCount} مقعد منتهى الصلاحية
                </p>
                <p className="text-xs text-orange-700 dark:text-orange-300 mb-3">
                  الموظفون المرتبطون بمقاعد منتهية لا يستطيعون الدخول حالياً.
                  جدّد المقاعد دفعة واحدة أو انقل الموظفين إلى مقاعد نشطة باستخدام الأسهم.
                </p>
                {data.is_caller_owner && (
                  <button
                    onClick={() => startRenewal('all_expired', [])}
                    disabled={renewingSeats.size > 0}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {renewingSeats.size > 0 ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    تجديد كل المقاعد المنتهية ({expiredSeatCount})
                  </button>
                )}
              </div>
            </div>
          )}

          {/* v3.74.382 — Renewal-flow errors. */}
          {renewError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 text-sm text-red-800 dark:text-red-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {renewError}
            </div>
          )}

          {isExpiringSoon && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-start gap-3">
              <Clock className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-amber-800 dark:text-amber-200 text-sm mb-1">
                  اشتراكك ينتهى خلال {daysLeft === 0 ? 'اليوم' : daysLeft === 1 ? 'يوم واحد' : `${daysLeft} أيام`}
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  جدّد من <Link href="/settings/billing" className="underline font-semibold">صفحة الفوترة</Link> لتجنّب إيقاف الموظفين.
                </p>
              </div>
            </div>
          )}

          {/* Seats Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 overflow-hidden">
            <div className="p-5 border-b border-gray-100 dark:border-slate-800 flex items-center gap-3">
              <div className="p-2 bg-violet-100 dark:bg-violet-900/30 rounded-lg">
                <Users className="w-5 h-5 text-violet-600" />
              </div>
              <div className="flex-1">
                <h2 className="font-semibold text-gray-900 dark:text-white">جدول المقاعد</h2>
                <p className="text-xs text-gray-500">المالك (مقعد 0) مجانى دائماً. استخدم الأسهم لإعادة ترتيب الموظفين.</p>
              </div>
            </div>

            {swapError && (
              <div className="mx-5 mt-3 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-xs flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5" />
                {swapError}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-slate-800/50 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-5 py-3 text-start font-medium w-20">رقم المقعد</th>
                    <th className="px-5 py-3 text-start font-medium">الموظف</th>
                    <th className="px-5 py-3 text-start font-medium">البريد</th>
                    <th className="px-5 py-3 text-start font-medium">الدور</th>
                    <th className="px-5 py-3 text-start font-medium">الحالة</th>
                    {/* v3.74.378 — was "تاريخ الإضافة" (member join
                        date). Replaced with the seat license's own
                        purchase + expiry, which is what the owner
                        actually needs to see now. */}
                    <th className="px-5 py-3 text-start font-medium">صلاحية المقعد</th>
                    {data.is_caller_owner && (
                      <th className="px-5 py-3 text-center font-medium w-24">ترتيب</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
                  {data.seats.map((s, idx) => {
                    const prev = idx > 0 ? data.seats[idx - 1] : null
                    const next = idx < data.seats.length - 1 ? data.seats[idx + 1] : null
                    return (
                      <SeatRow
                        key={`${s.seat_number}-${s.member?.user_id ?? 'empty'}`}
                        seat={s}
                        canMoveUp={!!data.is_caller_owner && !!prev && prev.seat_number > 0 && s.seat_number > 0 && s.role !== 'free_owner'}
                        canMoveDown={!!data.is_caller_owner && !!next && next.seat_number > 0 && s.seat_number > 0 && s.role !== 'free_owner'}
                        onMoveUp={prev && prev.seat_number > 0 ? () => swapSeats(s.seat_number, prev.seat_number) : undefined}
                        onMoveDown={next && next.seat_number > 0 ? () => swapSeats(s.seat_number, next.seat_number) : undefined}
                        isSwapping={swappingSeats.has(s.seat_number)}
                        showActions={!!data.is_caller_owner}
                        // v3.74.382 — Stage 5: single-seat renewal.
                        onRenew={
                          data.is_caller_owner && s.license_id && s.seat_number > 0
                            ? () => startRenewal('one', [s.license_id!])
                            : undefined
                        }
                        isRenewing={!!s.license_id && renewingSeats.has(s.license_id)}
                      />
                    )
                  })}
                </tbody>
              </table>
            </div>

            {data.seats.length === 0 && (
              <div className="p-8 text-center text-gray-500 text-sm">
                لا توجد مقاعد بعد. ابدأ بإضافة مقاعد من <Link href="/settings/billing" className="underline">صفحة الفوترة</Link>.
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="grid md:grid-cols-2 gap-3">
            <Link
              href="/settings/billing"
              className="flex items-center justify-between p-4 bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-800 hover:border-violet-200 dark:hover:border-violet-800 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-violet-100 dark:bg-violet-900/30 rounded-lg group-hover:bg-violet-200 dark:group-hover:bg-violet-900/50 transition-colors">
                  <CreditCard className="w-5 h-5 text-violet-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white text-sm">إضافة مقاعد جديدة</p>
                  <p className="text-xs text-gray-500">شراء مقاعد إضافية للموظفين</p>
                </div>
              </div>
              <ArrowLeft className="w-4 h-4 text-gray-400 rotate-180" />
            </Link>
            <Link
              href="/settings/users"
              className="flex items-center justify-between p-4 bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-800 hover:border-blue-200 dark:hover:border-blue-800 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg group-hover:bg-blue-200 dark:group-hover:bg-blue-900/50 transition-colors">
                  <Users className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white text-sm">إدارة الموظفين</p>
                  <p className="text-xs text-gray-500">دعوة موظفين جدد أو حذف</p>
                </div>
              </div>
              <ArrowLeft className="w-4 h-4 text-gray-400 rotate-180" />
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}

// ─────────────────────────────────────────
// Seat Row
// ─────────────────────────────────────────

interface SeatRowProps {
  seat: SeatAssignment
  canMoveUp?: boolean
  canMoveDown?: boolean
  onMoveUp?: () => void
  onMoveDown?: () => void
  isSwapping?: boolean
  showActions?: boolean
  // v3.74.382 — Stage 5: per-row renewal.
  onRenew?: () => void
  isRenewing?: boolean
}

function SeatRow({ seat, canMoveUp, canMoveDown, onMoveUp, onMoveDown, isSwapping, showActions, onRenew, isRenewing }: SeatRowProps) {
  const m = seat.member

  // v3.74.378 — seatBadge now distinguishes "active with occupant"
  // from "expired with occupant" and "empty active" from "empty
  // expired". The role string carries the high-level state; the
  // expires_at flag refines empty seats.
  const seatBadge = (() => {
    switch (seat.role) {
      case 'free_owner':
        return { label: 'مالك (مجانى)', color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300', icon: <Crown className="w-3 h-3" /> }
      case 'paid':
        return { label: 'نشط', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300', icon: <CheckCircle className="w-3 h-3" /> }
      case 'expired':
        return { label: 'منتهى', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300', icon: <Clock className="w-3 h-3" /> }
      case 'over_quota':
        return { label: 'محظور (فوق الحد)', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300', icon: <XCircle className="w-3 h-3" /> }
      case 'empty':
      default:
        if (seat.is_expired) {
          return { label: 'متاح (منتهى)', color: 'bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400', icon: <Clock className="w-3 h-3" /> }
        }
        return { label: 'متاح', color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400', icon: <Lock className="w-3 h-3" /> }
    }
  })()

  // v3.74.378 — days until expiry (negative = days since expiry).
  // Used to colour the expiry line in the seat-validity column.
  const daysToExpiry = (() => {
    if (!seat.expires_at) return null
    const d = new Date(seat.expires_at).getTime()
    if (isNaN(d)) return null
    return Math.ceil((d - Date.now()) / 86_400_000)
  })()

  return (
    <tr className={`hover:bg-gray-50 dark:hover:bg-slate-800/30 transition-colors ${
      seat.is_over_quota ? 'bg-red-50/30 dark:bg-red-900/5' :
      seat.role === 'expired' ? 'bg-orange-50/40 dark:bg-orange-900/10' :
      ''
    } ${isSwapping ? 'opacity-50' : ''}`}>
      <td className="px-5 py-3 font-bold text-gray-900 dark:text-white">
        <span className={`inline-flex items-center justify-center w-9 h-9 rounded-lg ${
          seat.role === 'free_owner' ? 'bg-violet-100 dark:bg-violet-900/30' :
          seat.is_over_quota ? 'bg-red-100 dark:bg-red-900/30' :
          seat.role === 'expired' ? 'bg-orange-100 dark:bg-orange-900/30' :
          seat.role === 'empty' && seat.is_expired ? 'bg-orange-50 dark:bg-orange-900/20' :
          seat.role === 'empty' ? 'bg-gray-100 dark:bg-slate-800' :
          'bg-green-100 dark:bg-green-900/30'
        }`}>
          #{seat.seat_number}
        </span>
      </td>
      <td className="px-5 py-3 text-gray-900 dark:text-white font-medium">
        {m?.name || (m ? '—' : <span className="text-gray-400 font-normal italic">(مقعد فارغ)</span>)}
      </td>
      <td className="px-5 py-3 text-xs text-gray-600 dark:text-gray-400 font-mono">
        {m?.email || '—'}
      </td>
      <td className="px-5 py-3 text-gray-700 dark:text-gray-300">
        {m?.role || '—'}
      </td>
      <td className="px-5 py-3">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${seatBadge.color}`}>
          {seatBadge.icon}
          {seatBadge.label}
        </span>
      </td>
      <td className="px-5 py-3 text-xs">
        {/* v3.74.378 — seat license validity. The owner's seat (0)
            has no license, so we render a placeholder. Over-quota
            members have no license backing either.
            v3.74.382 — Stage 5: per-row "جدد" button when allowed. */}
        {seat.purchased_at && seat.expires_at ? (
          <div className="space-y-1">
            <p className="text-gray-500 dark:text-gray-400">
              اشترى: <span className="text-gray-700 dark:text-gray-300">{fmtDate(seat.purchased_at)}</span>
            </p>
            <p className={
              seat.is_expired
                ? 'text-orange-600 dark:text-orange-400 font-medium'
                : daysToExpiry !== null && daysToExpiry <= 3
                  ? 'text-amber-600 dark:text-amber-400 font-medium'
                  : 'text-gray-500 dark:text-gray-400'
            }>
              ينتهى: <span className="font-medium">{fmtDate(seat.expires_at)}</span>
              {daysToExpiry !== null && (
                <span className="ms-1 text-[10px]">
                  ({seat.is_expired
                    ? `منتهى منذ ${Math.abs(daysToExpiry)} يوم`
                    : daysToExpiry === 0
                      ? 'اليوم'
                      : `بعد ${daysToExpiry} يوم`})
                </span>
              )}
            </p>
            {onRenew && (
              <button
                onClick={onRenew}
                disabled={isRenewing}
                className={`mt-1 inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  seat.is_expired
                    ? 'bg-orange-100 hover:bg-orange-200 text-orange-700 dark:bg-orange-900/30 dark:hover:bg-orange-900/50 dark:text-orange-300'
                    : 'bg-violet-50 hover:bg-violet-100 text-violet-700 dark:bg-violet-900/20 dark:hover:bg-violet-900/40 dark:text-violet-300'
                }`}
              >
                {isRenewing ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
                {seat.is_expired ? 'جدد المقعد' : 'مدّد المقعد'}
              </button>
            )}
          </div>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
      {showActions && (
        <td className="px-5 py-3">
          {/* Only show up/down for non-owner occupied seats */}
          {m && seat.role !== 'free_owner' ? (
            <div className="flex items-center justify-center gap-1">
              <button
                onClick={onMoveUp}
                disabled={!canMoveUp || isSwapping}
                title="تحريك لأعلى (تبديل مع المقعد الأقل رقماً)"
                className="p-1.5 rounded-md text-gray-500 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
              >
                {isSwapping ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronUp className="w-4 h-4" />}
              </button>
              <button
                onClick={onMoveDown}
                disabled={!canMoveDown || isSwapping}
                title="تحريك لأسفل (تبديل مع المقعد الأعلى رقماً)"
                className="p-1.5 rounded-md text-gray-500 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
              >
                {isSwapping ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          ) : (
            <span className="text-gray-300 text-xs">—</span>
          )}
        </td>
      )}
    </tr>
  )
}
