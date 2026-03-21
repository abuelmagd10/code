/**
 * Dashboard Skeleton Components
 * يُعرض أثناء تحميل كل Widget بشكل مستقل (Streaming SSR)
 */

function Pulse({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-200 dark:bg-slate-700 ${className}`} />
}

/** Skeleton لبطاقات الإحصائيات الرئيسية (GL KPIs) */
export function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-white dark:bg-slate-900 dark:border-slate-800 p-4 space-y-3">
          <Pulse className="h-4 w-28" />
          <Pulse className="h-8 w-20" />
          <Pulse className="h-3 w-16" />
        </div>
      ))}
    </div>
  )
}

/** Skeleton لبطاقات الإحصائيات الثانوية (الذمم + الشهر الحالي) */
export function SecondaryStatsSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-white dark:bg-slate-900 dark:border-slate-800 p-4 space-y-3">
          <Pulse className="h-4 w-24" />
          <Pulse className="h-7 w-20" />
        </div>
      ))}
    </div>
  )
}

/** Skeleton للرسوم البيانية الشهرية */
export function ChartsSkeleton() {
  return (
    <div className="rounded-xl border bg-white dark:bg-slate-900 dark:border-slate-800 p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Pulse className="h-9 w-9 rounded-lg" />
        <Pulse className="h-5 w-40" />
      </div>
      <Pulse className="h-56 w-full" />
    </div>
  )
}

/** Skeleton لأرصدة البنك والنقد */
export function BankCashSkeleton() {
  return (
    <div className="rounded-xl border bg-white dark:bg-slate-900 dark:border-slate-800 p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Pulse className="h-9 w-9 rounded-lg" />
        <Pulse className="h-5 w-36" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex justify-between">
          <Pulse className="h-4 w-32" />
          <Pulse className="h-4 w-20" />
        </div>
      ))}
    </div>
  )
}

/** Skeleton لقوائم الفواتير والمشتريات الأخيرة */
export function RecentListsSkeleton() {
  return (
    <div className="col-span-2 rounded-xl border bg-white dark:bg-slate-900 dark:border-slate-800 p-6 space-y-4">
      <Pulse className="h-5 w-40" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex justify-between items-center">
          <div className="space-y-1">
            <Pulse className="h-4 w-32" />
            <Pulse className="h-3 w-24" />
          </div>
          <Pulse className="h-5 w-16" />
        </div>
      ))}
    </div>
  )
}

/** Skeleton عام للـ Widget الكامل */
export function CardWidgetSkeleton({ rows = 3, title = true }: { rows?: number; title?: boolean }) {
  return (
    <div className="rounded-xl border bg-white dark:bg-slate-900 dark:border-slate-800 p-6 space-y-4">
      {title && (
        <div className="flex items-center gap-3 pb-2 border-b dark:border-slate-700">
          <Pulse className="h-9 w-9 rounded-lg" />
          <Pulse className="h-5 w-36" />
        </div>
      )}
      {Array.from({ length: rows }).map((_, i) => (
        <Pulse key={i} className="h-4 w-full" />
      ))}
    </div>
  )
}
