"use client"

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <main className="flex-1 p-4 md:p-8">
        <div className="rounded-md border bg-white dark:bg-slate-900 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">حدث خطأ غير متوقع</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{error?.message || "تعذر تحميل لوحة التحكم حالياً."}</p>
          <button
            className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            onClick={() => reset()}
          >
            إعادة المحاولة
          </button>
        </div>
      </main>
    </div>
  )
}
