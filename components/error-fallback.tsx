"use client"

import React from 'react'
import { AlertCircle, RefreshCw, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface ErrorFallbackProps {
  error?: Error
  resetError?: () => void
  title?: string
  description?: string
  showDetails?: boolean
  lang?: 'ar' | 'en'
}

const errorTexts = {
  ar: {
    defaultTitle: 'حدث خطأ في التطبيق',
    defaultDescription: 'نأسف لحدوث هذا الخطأ. يمكنك محاولة التالي:',
    refresh: 'إعادة تحميل الصفحة',
    goHome: 'العودة إلى الصفحة الرئيسية',
    tryAgain: 'إعادة المحاولة',
    details: 'تفاصيل الخطأ',
    contactSupport: 'إذا استمرت المشكلة، يرجى الاتصال بالدعم الفني'
  },
  en: {
    defaultTitle: 'Application Error Occurred',
    defaultDescription: 'We apologize for this error. You can try the following:',
    refresh: 'Reload Page',
    goHome: 'Return to Homepage',
    tryAgain: 'Try Again',
    details: 'Error Details',
    contactSupport: 'If the issue persists, please contact technical support'
  }
}

export function ErrorFallback({ 
  error, 
  resetError, 
  title, 
  description, 
  showDetails = false,
  lang = 'ar' 
}: ErrorFallbackProps) {
  const texts = errorTexts[lang]
  
  const handleRefresh = () => {
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }

  const handleGoHome = () => {
    if (typeof window !== 'undefined') {
      window.location.href = '/dashboard'
    }
  }

  return (
    <div className="min-h-[400px] flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle className="text-xl font-bold text-destructive">
            {title || texts.defaultTitle}
          </CardTitle>
          <CardDescription className="text-base">
            {description || texts.defaultDescription}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {resetError && (
              <Button 
                onClick={resetError}
                variant="default"
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                {texts.tryAgain}
              </Button>
            )}
            <Button 
              onClick={handleRefresh}
              variant={resetError ? "outline" : "default"}
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

          {showDetails && error && process.env.NODE_ENV === 'development' && (
            <div className="mt-6 p-4 bg-muted rounded-lg">
              <h4 className="font-semibold mb-2 text-sm">{texts.details}</h4>
              <div className="space-y-2 text-sm font-mono">
                <div className="text-destructive font-semibold">
                  {error.name}: {error.message}
                </div>
                {error.stack && (
                  <pre className="text-xs overflow-auto max-h-32 bg-background p-2 rounded border">
                    {error.stack}
                  </pre>
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
  )
}

export default ErrorFallback