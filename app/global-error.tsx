"use client"

import React from 'react'
import { useEffect } from 'react'
import { AlertCircle, RefreshCw, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface GlobalErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

const errorTexts = {
  ar: {
    title: 'حدث خطأ في الصفحة',
    description: 'نأسف لحدوث هذا الخطأ. يمكنك محاولة التالي:',
    refresh: 'إعادة المحاولة',
    goHome: 'العودة إلى الصفحة الرئيسية',
    details: 'تفاصيل الخطأ',
    contactSupport: 'إذا استمرت المشكلة، يرجى الاتصال بالدعم الفني'
  },
  en: {
    title: 'Page Error Occurred',
    description: 'We apologize for this error. You can try the following:',
    refresh: 'Try Again',
    goHome: 'Return to Homepage',
    details: 'Error Details',
    contactSupport: 'If the issue persists, please contact technical support'
  }
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error('Global error occurred:', error)
    
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', 'exception', {
        description: error.toString(),
        fatal: true
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
    <html lang={lang} dir={lang === 'en' ? 'ltr' : 'rtl'}>
      <body className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl">
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
      </body>
    </html>
  )
}