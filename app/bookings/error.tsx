"use client"

import { useEffect } from 'react'
import { AlertCircle, RefreshCw, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface PageErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function BookingsError({ error, reset }: PageErrorProps) {
  useEffect(() => {
    console.error('[bookings] page error:', error)
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
            {t('حدث خطأ في صفحة الحجوزات', 'Bookings Page Error')}
          </CardTitle>
          <CardDescription>
            {t(
              'تعذّر تحميل بيانات الحجوزات. يرجى المحاولة مجدداً.',
              'Failed to load booking data. Please try again.'
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
              {t('إعادة المحاولة', 'Try Again')}
            </Button>
            <Button variant="outline" onClick={() => window.location.href = '/dashboard'} className="gap-2">
              <ArrowRight className="h-4 w-4" />
              {t('الرئيسية', 'Home')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
