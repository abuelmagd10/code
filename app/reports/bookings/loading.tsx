/**
 * Loading skeleton for /reports/bookings/*
 * Matches the 6 booking report pages:
 *   - Header card (icon + title + back button)
 *   - 4 summary stat cards
 *   - Filter bar
 *   - 2 chart cards side by side
 *   - Data table
 */
export default function BookingReportsLoading() {
  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8 space-y-6">

        {/* Header card */}
        <div className="rounded-xl border bg-white dark:bg-slate-900 p-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-gray-200 dark:bg-slate-800 animate-pulse" />
            <div className="space-y-2">
              <div className="h-6 w-44 bg-gray-200 dark:bg-slate-800 rounded animate-pulse" />
              <div className="h-4 w-64 bg-gray-200 dark:bg-slate-800 rounded animate-pulse" />
            </div>
          </div>
          <div className="h-9 w-24 bg-gray-200 dark:bg-slate-800 rounded-lg animate-pulse" />
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-white dark:bg-gray-800 p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <div className="h-3 w-20 bg-gray-200 dark:bg-slate-700 rounded animate-pulse" />
                  <div className="h-7 w-24 bg-gray-200 dark:bg-slate-700 rounded animate-pulse" />
                </div>
                <div className="w-8 h-8 bg-gray-200 dark:bg-slate-700 rounded-full animate-pulse" />
              </div>
            </div>
          ))}
        </div>

        {/* Filter bar */}
        <div className="rounded-xl border bg-white dark:bg-gray-800 p-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-9 bg-gray-200 dark:bg-slate-700 rounded-lg animate-pulse" />
            ))}
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-white dark:bg-gray-800 p-4 space-y-3">
              <div className="h-5 w-40 bg-gray-200 dark:bg-slate-700 rounded animate-pulse" />
              <div className="h-72 bg-gray-100 dark:bg-slate-700/50 rounded-lg animate-pulse" />
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="rounded-xl border bg-white dark:bg-gray-800 overflow-hidden">
          <div className="px-4 py-3 border-b dark:border-gray-700">
            <div className="h-5 w-48 bg-gray-200 dark:bg-slate-700 rounded animate-pulse" />
          </div>
          <div className="divide-y dark:divide-gray-700">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="px-4 py-3 grid grid-cols-5 gap-4">
                <div className="h-4 bg-gray-100 dark:bg-slate-700/60 rounded animate-pulse" />
                <div className="h-4 w-3/4 bg-gray-100 dark:bg-slate-700/60 rounded animate-pulse" />
                <div className="h-4 w-1/2 bg-gray-100 dark:bg-slate-700/60 rounded animate-pulse" />
                <div className="h-4 w-2/3 bg-gray-100 dark:bg-slate-700/60 rounded animate-pulse" />
                <div className="h-4 w-1/2 bg-gray-100 dark:bg-slate-700/60 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>

      </main>
    </div>
  )
}
