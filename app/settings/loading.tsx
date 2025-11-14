export default function Loading() {
  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <div className="w-64 hidden md:block" />
      <main className="flex-1 md:mr-64 p-4 md:p-8 space-y-6">
        <div className="h-7 w-48 bg-gray-200 dark:bg-slate-800 rounded animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-40 bg-gray-200 dark:bg-slate-800 rounded animate-pulse" />
          <div className="h-40 bg-gray-200 dark:bg-slate-800 rounded animate-pulse" />
          <div className="h-72 bg-gray-200 dark:bg-slate-800 rounded animate-pulse lg:col-span-2" />
        </div>
      </main>
    </div>
  )
}

