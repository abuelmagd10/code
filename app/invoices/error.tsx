"use client"

import { useEffect } from 'react'
import { AlertCircle, RefreshCw, Home, Database } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { SupabaseConfigError } from '@/components/supabase-config-error'

interface PageErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function PageError({ error, reset }: PageErrorProps) {
  useEffect(() => {
    console.error('Page error:', error)
  }, [error])

  const lang = typeof window !== 'undefined' ? 
    (localStorage.getItem('app_language') || 'ar') as 'ar' | 'en' : 'ar'

  // التحقق من نوع الخطأ - إذا كان خطأ إعدادات Supabase
  const isSupabaseConfigError = error.message?.includes('Supabase') || 
                                 error.message?.includes('dummy') ||
                                 error.message?.includes('configuration')

  if (isSupabaseConfigError) {
    return <SupabaseConfigError lang={lang} />
  }

  const texts = {
    ar: {
      title: 'حدث خطأ في التطبيق',
      description: 'نأسف لحدوث هذا الخطأ. يمكنك محاولة التالي:',
      refresh: 'إعادة تحميل الصفحة',
      goHome: 'العودة إلى الصفحة الرئيسية',
      contactSupport: 'إذا استمرت المشكلة، يرجى الاتصال بالدعم الفني',
      errorDetails: 'تفاصيل الخطأ:'
    },
    en: {
      title: 'Application Error Occurred',
      description: 'We apologize for this error. You can try the following:',
      refresh: 'Reload Page',
      goHome: 'Return to Homepage',
      contactSupport: 'If the issue persists, please contact technical support',
      errorDetails: 'Error details:'
    }
  }

  const handleGoHome = () => {
    window.location.href = '/dashboard'
  }

  const handleRefresh = () => {
    window.location.reload()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle className="text-2xl font-bold text-destructive">
            {texts[lang].title}
          </CardTitle>
          <CardDescription className="text-base">
            {texts[lang].description}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* عرض تفاصيل الخطأ في بيئة التطوير */}
          {process.env.NODE_ENV === 'development' && error.message && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
              <p className="text-sm font-medium text-red-800 dark:text-red-200 mb-1">
                {texts[lang].errorDetails}
              </p>
              <p className="text-xs text-red-600 dark:text-red-300 font-mono break-all">
                {error.message}
              </p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button 
              onClick={reset}
              variant="default"
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              {texts[lang].refresh}
            </Button>
            <Button 
              onClick={handleGoHome}
              variant="outline"
              className="gap-2"
            >
              <Home className="h-4 w-4" />
              {texts[lang].goHome}
            </Button>
          </div>

          <div className="text-center text-sm text-muted-foreground">
            {texts[lang].contactSupport}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}