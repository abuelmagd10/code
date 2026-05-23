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
  role: 'free_owner' | 'paid' | 'over_quota' | 'empty'
  member: Member | null
  is_over_quota: boolean
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
                    <th className="px-5 py-3 text-start font-medium">تاريخ الإضافة</th>
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
}

function SeatRow({ seat, canMoveUp, canMoveDown, onMoveUp, onMoveDown, isSwapping, showActions }: SeatRowProps) {
  const m = seat.member

  const seatBadge = (() => {
    switch (seat.role) {
      case 'free_owner':
        return { label: 'مالك (مجانى)', color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300', icon: <Crown className="w-3 h-3" /> }
      case 'paid':
        return { label: 'نشط', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300', icon: <CheckCircle className="w-3 h-3" /> }
      case 'over_quota':
        return { label: 'محظور (فوق الحد)', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300', icon: <XCircle className="w-3 h-3" /> }
      case 'empty':
      default:
        return { label: 'متاح', color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400', icon: <Lock className="w-3 h-3" /> }
    }
  })()

  return (
    <tr className={`hover:bg-gray-50 dark:hover:bg-slate-800/30 transition-colors ${
      seat.is_over_quota ? 'bg-red-50/30 dark:bg-red-900/5' : ''
    } ${isSwapping ? 'opacity-50' : ''}`}>
      <td className="px-5 py-3 font-bold text-gray-900 dark:text-white">
        <span className={`inline-flex items-center justify-center w-9 h-9 rounded-lg ${
          seat.role === 'free_owner' ? 'bg-violet-100 dark:bg-violet-900/30' :
          seat.is_over_quota ? 'bg-red-100 dark:bg-red-900/30' :
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
      <td className="px-5 py-3 text-xs text-gray-500">
        {fmtDate(m?.created_at ?? null)}
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
