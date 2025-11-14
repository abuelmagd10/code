"use client"

type Props = {
  error: Error & { digest?: string }
  reset: () => void
}

export default function Error({ error, reset }: Props) {
  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <div className="w-64 hidden md:block" />
      <main className="flex-1 md:mr-64 p-4 md:p-8 space-y-6">
        <h1 className="text-2xl font-bold">حدث خطأ في صفحة الإعدادات</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {error?.message || "خطأ غير متوقع"}
        </p>
        <button
          className="px-4 py-2 bg-black text-white dark:bg-white dark:text-black rounded"
          onClick={() => reset()}
        >
          إعادة المحاولة
        </button>
      </main>
    </div>
  )
}

