/**
 * Dashboard Loading Skeleton — paints instantly during navigation
 *
 * Next.js App Router shows this file's exports while page.tsx is resolving
 * (auth check, company lookup, etc.). It mirrors the actual dashboard
 * layout so the user sees stable structure rather than a blank screen
 * or a single spinner.
 *
 * v3.63.2 — added as part of the cold-start mitigation. The earlier
 * Suspense fallbacks only kicked in AFTER the page reached the widget
 * boundaries, which on a cold function start was 5-10 seconds in.
 * This file fires the moment Vercel returns its first byte.
 */
import {
  StatsSkeleton,
  SecondaryStatsSkeleton,
  ChartsSkeleton,
  BankCashSkeleton,
  RecentListsSkeleton,
} from "./_widgets/SkeletonWidgets"

function Pulse({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-200 dark:bg-slate-700 ${className}`} />
}

export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950" dir="rtl">
      <div className="mx-auto max-w-7xl space-y-4 p-4 sm:space-y-6 sm:p-6">
        <div className="rounded-xl sm:rounded-2xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-3 sm:gap-4">
              <Pulse className="h-12 w-12 sm:h-14 sm:w-14 rounded-lg sm:rounded-xl" />
              <div className="space-y-2 min-w-0 flex-1">
                <Pulse className="h-7 sm:h-8 w-40 sm:w-56" />
                <Pulse className="h-4 w-32 sm:w-48" />
              </div>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <Pulse className="h-8 w-24 rounded-md" />
              <Pulse className="h-8 w-16 rounded-md" />
            </div>
          </div>
        </div>

        <StatsSkeleton />
        <SecondaryStatsSkeleton />
        <ChartsSkeleton />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <BankCashSkeleton />
          <RecentListsSkeleton />
        </div>
      </div>
    </div>
  )
}
