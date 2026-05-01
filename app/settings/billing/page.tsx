'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  CreditCard, Users, TrendingUp, CheckCircle, AlertTriangle,
  Clock, ArrowLeft, Plus, Minus, Loader2, RefreshCw,
  Receipt, Calendar, Shield, Zap, ChevronRight
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
  price_per_seat_egp: number
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

// ─────────────────────────────────────────
// Constants
// ─────────────────────────────────────────
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
  const [seatsToAdd, setSeatsToAdd] = useState(1)
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

  // ─── Fetch transactions ───
  const fetchTransactions = useCallback(async () => {
    setTxnLoading(true)
    try {
      const res = await fetch('/api/billing/transactions')
      const data = await res.json()
      if (res.ok && Array.isArray(data)) {
        setTransactions(data)
      }
    } catch { /* transactions are optional — don't block UI */ }
    finally { setTxnLoading(false) }
  }, [])

  useEffect(() => {
    fetchStatus()
    fetchTransactions()
  }, [fetchStatus, fetchTransactions])

  // ─── Initiate payment ───
  const handlePurchase = async () => {
    if (seatsToAdd < 1 || seatsToAdd > 50) return
    setCheckoutLoading(true)
    setCheckoutError(null)
    try {
      const res = await fetch('/api/billing/seats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seats: seatsToAdd }),
      })
      const data = await res.json()
      if (!res.ok) {
        setCheckoutError(data?.error || 'فشل في إنشاء طلب الدفع')
        return
      }
      // Redirect to Paymob checkout
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

  const pricePerSeat = status?.price_per_seat_egp ?? 500
  const totalCost = seatsToAdd * pricePerSeat

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
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 p-4 md:p-8" dir="rtl">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/settings/users" className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors">
              <ArrowLeft className="w-5 h-5 text-gray-500 rotate-180" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">إدارة الاشتراك</h1>
              <p className="text-sm text-gray-500">إدارة مقاعد المستخدمين والدفع الشهري</p>
            </div>
          </div>
          <button
            onClick={() => { fetchStatus(); fetchTransactions() }}
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

        {/* Pricing info */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-100 dark:border-slate-800 flex items-center gap-3">
          <div className="p-2 bg-violet-100 dark:bg-violet-900/30 rounded-lg">
            <Zap className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <p className="font-semibold text-gray-900 dark:text-white text-sm">سعر المقعد الشهري</p>
            <p className="text-gray-500 text-xs">يُجدَّد شهرياً • المالك المؤسس مجاني دائماً</p>
          </div>
          <div className="mr-auto text-right">
            <p className="text-2xl font-bold text-violet-600">{pricePerSeat} جنيه</p>
            <p className="text-xs text-gray-400">/مقعد/شهر</p>
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
          <div className="p-5 space-y-4">
            {/* Seat counter */}
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex-shrink-0">
                عدد المقاعد المطلوبة:
              </label>
              <div className="flex items-center gap-3 bg-gray-50 dark:bg-slate-800 rounded-xl p-1">
                <button
                  onClick={() => setSeatsToAdd(Math.max(1, seatsToAdd - 1))}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-12 text-center font-bold text-lg text-gray-900 dark:text-white">
                  {seatsToAdd}
                </span>
                <button
                  onClick={() => setSeatsToAdd(Math.min(50, seatsToAdd + 1))}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Cost breakdown */}
            <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">{seatsToAdd} مقعد × {pricePerSeat} جنيه/شهر</span>
                <span className="font-medium">{totalCost.toLocaleString()} جنيه</span>
              </div>
              <div className="border-t border-gray-200 dark:border-slate-700 pt-2 flex justify-between">
                <span className="font-semibold text-gray-900 dark:text-white">الإجمالي</span>
                <span className="font-bold text-violet-600 text-lg">{totalCost.toLocaleString()} جنيه/شهر</span>
              </div>
            </div>

            {checkoutError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {checkoutError}
              </div>
            )}

            <button
              onClick={handlePurchase}
              disabled={checkoutLoading}
              className="w-full flex items-center justify-center gap-2 py-3 px-6 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 disabled:opacity-60 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-violet-500/25"
            >
              {checkoutLoading ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> جارٍ التحويل لبوابة الدفع...</>
              ) : (
                <><CreditCard className="w-5 h-5" /> الدفع الآن — {totalCost.toLocaleString()} جنيه</>
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
    </div>
  )
}

// ─────────────────────────────────────────
// StatCard helper
// ─────────────────────────────────────────
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
