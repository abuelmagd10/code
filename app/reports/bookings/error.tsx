"use client"

import { useEffect } from 'react'
import { AlertCircle, RefreshCw, ArrowRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface PageErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function BookingReportsError({ error, reset }: PageErrorProps) {
  const router = useRouter()

  useEffect(() => {
    console.error('[reports/bookings] page error:', error)
  }, [error])

  const lang = typeof window !== 'undefined'
    ? (localStorage.getItem('app_language') || 'ar') as 'ar' | 'en'
    : 'ar'

  const t = (ar: string, en: string) => lang === 'ar' ? ar : en

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900 items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
          </div>
          <CardTitle className="text-xl font-bold text-red-600 dark:text-red-400">
            {t('خطأ في تحميل التقرير', 'Report Load Error')}
          </CardTitle>
          <CardDescription>
            {t(
              'تعذّر تحميل بيانات التقرير. يرجى التحقق من اتصالك وإعادة المحاولة.',
              'Could not load report data. Check your connection and try again.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {process.env.NODE_ENV === 'development' && error.message && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
              <p className="text-xs font-mono text-red-600 dark:text-red-300 break-all">
                {error.message}
              </p>
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={reset} className="gap-2 bg-orange-600 hover:bg-orange-700 text-white">
              <RefreshCw className="h-4 w-4" />
              {t('إعادة المحاولة', 'Retry')}
            </Button>
            <Button variant="outline" onClick={() => router.push('/reports')} className="gap-2">
              <ArrowRight className="h-4 w-4" />
              {t('التقارير', 'Reports')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
