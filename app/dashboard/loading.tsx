export default function Loading() {
  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <main className="flex-1 p-4 md:p-8 space-y-8">
        <div>
          <div className="h-6 w-48 bg-gray-200 dark:bg-slate-800 rounded animate-pulse mb-2" />
          <div className="h-4 w-64 bg-gray-200 dark:bg-slate-800 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-md border bg-white dark:bg-slate-900 p-4">
              <div className="h-4 w-32 bg-gray-200 dark:bg-slate-800 rounded animate-pulse mb-3" />
              <div className="h-8 w-24 bg-gray-200 dark:bg-slate-800 rounded animate-pulse" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-md border bg-white dark:bg-slate-900 p-4">
              <div className="h-4 w-40 bg-gray-200 dark:bg-slate-800 rounded animate-pulse mb-3" />
              <div className="h-32 w-full bg-gray-200 dark:bg-slate-800 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
