"use client"

import React, { useEffect } from 'react'
import { AlertCircle, RefreshCw, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface DashboardErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

const errorTexts = {
  ar: {
    title: 'حدث خطأ في لوحة التحكم',
    description: 'نأسف لحدوث هذا الخطأ أثناء تحميل لوحة التحكم. يمكنك محاولة التالي:',
    refresh: 'إعادة المحاولة',
    goHome: 'العودة إلى الصفحة الرئيسية',
    details: 'تفاصيل الخطأ',
    contactSupport: 'إذا استمرت المشكلة، يرجى الاتصال بالدعم الفني'
  },
  en: {
    title: 'Dashboard Error Occurred',
    description: 'We apologize for this error while loading the dashboard. You can try the following:',
    refresh: 'Try Again',
    goHome: 'Return to Homepage',
    details: 'Error Details',
    contactSupport: 'If the issue persists, please contact technical support'
  }
}

export default function DashboardError({ error, reset }: DashboardErrorProps) {
  useEffect(() => {
    console.error('Dashboard error occurred:', error)
    
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'exception', {
        description: error.toString(),
        fatal: false
      })
    }
  }, [error])

  const handleGoHome = () => {
    if (typeof window !== 'undefined') {
      window.location.href = '/'
    }
  }

  const lang = typeof window !== 'undefined' ? 
    (localStorage.getItem('app_language') || 'ar') as 'ar' | 'en' : 'ar'
  
  const texts = errorTexts[lang]

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <main className="flex-1 p-4 md:p-8">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertCircle className="h-8 w-8 text-destructive" />
              </div>
              <CardTitle className="text-2xl font-bold text-destructive">
                {texts.title}
              </CardTitle>
              <CardDescription className="text-base">
                {texts.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button 
                  onClick={reset}
                  variant="default"
                  className="gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  {texts.refresh}
                </Button>
                <Button 
                  onClick={handleGoHome}
                  variant="outline"
                  className="gap-2"
                >
                  <Home className="h-4 w-4" />
                  {texts.goHome}
                </Button>
              </div>

              {process.env.NODE_ENV === 'development' && error && (
                <div className="mt-6 p-4 bg-muted rounded-lg">
                  <h4 className="font-semibold mb-2 text-sm">{texts.details}</h4>
                  <div className="space-y-2 text-sm font-mono">
                    <div className="text-destructive font-semibold">
                      {error.name}: {error.message}
                    </div>
                    {error.digest && (
                      <div className="text-xs text-muted-foreground">
                        Error ID: {error.digest}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="text-center text-sm text-muted-foreground">
                {texts.contactSupport}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}