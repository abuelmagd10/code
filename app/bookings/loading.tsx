/**
 * Loading skeleton for /bookings and /bookings/[id]
 * Matches the page layout: RTL sidebar (md:mr-64), header + filters + table
 */
export default function BookingsLoading() {
  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8 space-y-6">

        {/* Page header skeleton */}
        <div className="rounded-xl border bg-white dark:bg-slate-900 p-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-gray-200 dark:bg-slate-800 animate-pulse" />
            <div className="space-y-2">
              <div className="h-6 w-40 bg-gray-200 dark:bg-slate-800 rounded animate-pulse" />
              <div className="h-4 w-56 bg-gray-200 dark:bg-slate-800 rounded animate-pulse" />
            </div>
          </div>
          <div className="h-9 w-32 bg-gray-200 dark:bg-slate-800 rounded-lg animate-pulse" />
        </div>

        {/* Filter bar skeleton */}
        <div className="rounded-xl border bg-white dark:bg-slate-900 p-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-9 bg-gray-200 dark:bg-slate-800 rounded-lg animate-pulse" />
            ))}
          </div>
        </div>

        {/* View toggle skeleton */}
        <div className="flex gap-2">
          <div className="h-9 w-24 bg-gray-200 dark:bg-slate-800 rounded-lg animate-pulse" />
          <div className="h-9 w-24 bg-gray-200 dark:bg-slate-800 rounded-lg animate-pulse" />
        </div>

        {/* Table skeleton */}
        <div className="rounded-xl border bg-white dark:bg-slate-900 overflow-hidden">
          {/* Table header */}
          <div className="border-b dark:border-gray-700 px-4 py-3 grid grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-4 bg-gray-200 dark:bg-slate-800 rounded animate-pulse" />
            ))}
          </div>
          {/* Table rows */}
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="border-b dark:border-gray-700 px-4 py-4 grid grid-cols-6 gap-4 last:border-0"
            >
              <div className="h-4 bg-gray-100 dark:bg-slate-800/60 rounded animate-pulse" />
              <div className="h-4 w-3/4 bg-gray-100 dark:bg-slate-800/60 rounded animate-pulse" />
              <div className="h-4 w-1/2 bg-gray-100 dark:bg-slate-800/60 rounded animate-pulse" />
              <div className="h-6 w-20 bg-gray-100 dark:bg-slate-800/60 rounded-full animate-pulse" />
              <div className="h-4 w-2/3 bg-gray-100 dark:bg-slate-800/60 rounded animate-pulse" />
              <div className="h-4 w-1/2 bg-gray-100 dark:bg-slate-800/60 rounded animate-pulse" />
            </div>
          ))}
        </div>

        {/* Pagination skeleton */}
        <div className="flex justify-center gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 w-8 bg-gray-200 dark:bg-slate-800 rounded animate-pulse" />
          ))}
        </div>

      </main>
    </div>
  )
}
