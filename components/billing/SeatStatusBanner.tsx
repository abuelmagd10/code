'use client'
import { useEffect, useState, useCallback } from 'react'
import { Users, AlertTriangle, CreditCard, CheckCircle, Loader2, RefreshCw } from 'lucide-react'

interface SeatStatus {
  total_paid_seats: number
  used_seats: number
  reserved_seats: number
  available_seats: number
  can_invite: boolean
  subscription_status: string
  price_per_seat_egp: number
}

interface SeatStatusBannerProps {
  companyId: string
  onAddSeat?: () => void
  className?: string
}

export default function SeatStatusBanner({ companyId, onAddSeat, className = '' }: SeatStatusBannerProps) {
  const [status, setStatus] = useState<SeatStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/billing/seats')
      const data = await res.json()
      if (res.ok && data && typeof data === 'object' && 'can_invite' in data) {
        setStatus(data)
      } else {
        setError(data?.error || 'تعذر جلب حالة المقاعد')
      }
    } catch {
      setError('خطأ في الاتصال')
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  if (loading) {
    return (
      <div className={`flex items-center gap-2 p-3 rounded-lg bg-gray-50 dark:bg-slate-800/50 text-sm text-gray-500 ${className}`}>
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>جارٍ تحميل حالة المقاعد...</span>
      </div>
    )
  }

  if (error || !status) {
    return null // Fail silent — don't block the UI
  }

  // ─── No seats at all (free tier, owner only) ───
  if (status.total_paid_seats === 0) {
    return (
      <div className={`rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 ${className}`}>
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-amber-800 dark:text-amber-300 text-sm">
              لا توجد مقاعد مدفوعة
            </p>
            <p className="text-amber-700 dark:text-amber-400 text-xs mt-1">
              لإرسال دعوة لمستخدم جديد، يرجى إضافة مقعد شهري مدفوع.
              سعر كل مقعد: <strong>{status.price_per_seat_egp} جنيه/شهر</strong>
            </p>
          </div>
          {onAddSeat && (
            <button
              onClick={onAddSeat}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              <CreditCard className="w-3.5 h-3.5" />
              إضافة مقعد
            </button>
          )}
        </div>
      </div>
    )
  }

  // ─── No available seats (all used/reserved) ───
  if (!status.can_invite) {
    return (
      <div className={`rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 ${className}`}>
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-red-800 dark:text-red-300 text-sm">
              لا توجد مقاعد متاحة
            </p>
            <p className="text-red-700 dark:text-red-400 text-xs mt-1">
              المقاعد: <strong>{status.used_seats}</strong> مستخدمة
              {status.reserved_seats > 0 && <> + <strong>{status.reserved_seats}</strong> محجوزة لدعوات معلقة</>}
              {' '}من إجمالي <strong>{status.total_paid_seats}</strong> مقعد مدفوع.
            </p>
            <p className="text-red-600 dark:text-red-400 text-xs mt-0.5">
              لإرسال دعوة جديدة، يرجى إضافة مقعد مدفوع إلى اشتراك الشركة.
            </p>
          </div>
          {onAddSeat && (
            <button
              onClick={onAddSeat}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              <CreditCard className="w-3.5 h-3.5" />
              إضافة مقعد شهري
            </button>
          )}
        </div>
      </div>
    )
  }

  // ─── Seats available ───
  const availableLabel = status.available_seats === 1 ? 'مقعد واحد متاح' : `${status.available_seats} مقاعد متاحة`

  return (
    <div className={`rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-3 ${className}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
          <div className="text-sm">
            <span className="text-green-800 dark:text-green-300 font-medium">
              المقاعد: {status.used_seats} مستخدمة
              {status.reserved_seats > 0 && <span className="text-green-600"> + {status.reserved_seats} محجوزة</span>}
              {' '}من {status.total_paid_seats}
            </span>
            <span className="mx-2 text-green-500">—</span>
            <span className="text-green-700 dark:text-green-400 font-semibold">{availableLabel}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchStatus}
            className="p-1 text-green-600 hover:text-green-800 dark:text-green-400 transition-colors"
            title="تحديث"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          {onAddSeat && (
            <button
              onClick={onAddSeat}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-green-600/20 hover:bg-green-600/30 text-green-800 dark:text-green-300 text-xs font-medium rounded-lg transition-colors"
            >
              <Users className="w-3 h-3" />
              إضافة مقاعد
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
