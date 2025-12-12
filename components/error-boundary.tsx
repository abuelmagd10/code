"use client"

import React, { Component, ErrorInfo, ReactNode } from 'react'
import { AlertCircle, RefreshCw, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  lang?: 'ar' | 'en'
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

const errorTexts = {
  ar: {
    title: 'حدث خطأ في التطبيق',
    description: 'نأسف لحدوث هذا الخطأ. يمكنك محاولة التالي:',
    refresh: 'إعادة تحميل الصفحة',
    goHome: 'العودة إلى الصفحة الرئيسية',
    details: 'تفاصيل الخطأ',
    contactSupport: 'إذا استمرت المشكلة، يرجى الاتصال بالدعم الفني'
  },
  en: {
    title: 'Application Error Occurred',
    description: 'We apologize for this error. You can try the following:',
    refresh: 'Reload Page',
    goHome: 'Return to Homepage',
    details: 'Error Details',
    contactSupport: 'If the issue persists, please contact technical support'
  }
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
      errorInfo: null
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    
    this.setState({
      error,
      errorInfo
    })

    if (this.props.onError) {
      this.props.onError(error, errorInfo)
    }

    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'exception', {
        description: error.toString(),
        fatal: true
      })
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    })
  }

  handleRefresh = () => {
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }

  handleGoHome = () => {
    if (typeof window !== 'undefined') {
      window.location.href = '/'
    }
  }

  render() {
    const { hasError, error, errorInfo } = this.state
    const { children, fallback, lang = 'ar' } = this.props
    const texts = errorTexts[lang]

    if (hasError) {
      if (fallback) {
        return fallback
      }

      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
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
                  onClick={this.handleRefresh}
                  variant="default"
                  className="gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  {texts.refresh}
                </Button>
                <Button 
                  onClick={this.handleGoHome}
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
                    {error.stack && (
                      <pre className="text-xs overflow-auto max-h-32 bg-background p-2 rounded border">
                        {error.stack}
                      </pre>
                    )}
                    {errorInfo && errorInfo.componentStack && (
                      <div>
                        <h5 className="font-semibold mt-2">Component Stack:</h5>
                        <pre className="text-xs overflow-auto max-h-32 bg-background p-2 rounded border">
                          {errorInfo.componentStack}
                        </pre>
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
      )
    }

    return children
  }
}

export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  options?: Partial<ErrorBoundaryProps>
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...options}>
      <Component {...props} />
    </ErrorBoundary>
  )
  
  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`
  
  return WrappedComponent
}

export default ErrorBoundary