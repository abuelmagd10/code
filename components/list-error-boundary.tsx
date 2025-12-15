"use client"

import React, { Component, ErrorInfo, ReactNode } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface ListErrorBoundaryProps {
  children: ReactNode
  listType?: 'customers' | 'invoices' | 'products' | 'suppliers' | 'sales-returns' | 'vendor-credits' | 'generic'
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  lang?: 'ar' | 'en'
}

interface ListErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

const errorTexts = {
  ar: {
    customers: {
      title: 'حدث خطأ في قائمة العملاء',
      description: 'نأسف لحدوث هذا الخطأ أثناء تحميل قائمة العملاء.',
      refresh: 'إعادة تحميل القائمة'
    },
    invoices: {
      title: 'حدث خطأ في قائمة الفواتير',
      description: 'نأسف لحدوث هذا الخطأ أثناء تحميل قائمة الفواتير.',
      refresh: 'إعادة تحميل القائمة'
    },
    products: {
      title: 'حدث خطأ في قائمة المنتجات',
      description: 'نأسف لحدوث هذا الخطأ أثناء تحميل قائمة المنتجات.',
      refresh: 'إعادة تحميل القائمة'
    },
    suppliers: {
      title: 'حدث خطأ في قائمة الموردين',
      description: 'نأسف لحدوث هذا الخطأ أثناء تحميل قائمة الموردين.',
      refresh: 'إعادة تحميل القائمة'
    },
    'sales-returns': {
      title: 'حدث خطأ في قائمة مرتجعات المبيعات',
      description: 'نأسف لحدوث هذا الخطأ أثناء تحميل قائمة المرتجعات.',
      refresh: 'إعادة تحميل القائمة'
    },
    'vendor-credits': {
      title: 'حدث خطأ في قائمة إشعارات الدائن',
      description: 'نأسف لحدوث هذا الخطأ أثناء تحميل قائمة إشعارات الدائن.',
      refresh: 'إعادة تحميل القائمة'
    },
    generic: {
      title: 'حدث خطأ في القائمة',
      description: 'نأسف لحدوث هذا الخطأ أثناء تحميل البيانات.',
      refresh: 'إعادة تحميل القائمة'
    },
    contactSupport: 'إذا استمرت المشكلة، يرجى الاتصال بالدعم الفني'
  },
  en: {
    customers: {
      title: 'Error in Customers List',
      description: 'We apologize for this error while loading the customers list.',
      refresh: 'Reload List'
    },
    invoices: {
      title: 'Error in Invoices List',
      description: 'We apologize for this error while loading the invoices list.',
      refresh: 'Reload List'
    },
    products: {
      title: 'Error in Products List',
      description: 'We apologize for this error while loading the products list.',
      refresh: 'Reload List'
    },
    suppliers: {
      title: 'Error in Suppliers List',
      description: 'We apologize for this error while loading the suppliers list.',
      refresh: 'Reload List'
    },
    'sales-returns': {
      title: 'Error in Sales Returns List',
      description: 'We apologize for this error while loading the sales returns list.',
      refresh: 'Reload List'
    },
    'vendor-credits': {
      title: 'Error in Vendor Credits List',
      description: 'We apologize for this error while loading the vendor credits list.',
      refresh: 'Reload List'
    },
    generic: {
      title: 'Error in List',
      description: 'We apologize for this error while loading the data.',
      refresh: 'Reload List'
    },
    contactSupport: 'If the issue persists, please contact technical support'
  }
}

export class ListErrorBoundary extends Component<ListErrorBoundaryProps, ListErrorBoundaryState> {
  constructor(props: ListErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null
    }
  }

  static getDerivedStateFromError(error: Error): ListErrorBoundaryState {
    return {
      hasError: true,
      error
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`ListErrorBoundary (${this.props.listType}) caught an error:`, error, errorInfo)
    
    this.setState({
      error
    })

    if (this.props.onError) {
      this.props.onError(error, errorInfo)
    }

    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'exception', {
        description: `${this.props.listType} list error: ${error.toString()}`,
        fatal: false
      })
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null
    })
  }

  handleRefresh = () => {
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }

  render() {
    const { hasError, error } = this.state
    const { children, listType = 'generic', lang = 'ar' } = this.props
    const texts = errorTexts[lang]
    const listTexts = texts[listType]

    if (hasError) {
      return (
        <div className="p-6">
          <Card className="w-full max-w-2xl mx-auto">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertCircle className="h-6 w-6 text-destructive" />
              </div>
              <CardTitle className="text-xl font-bold text-destructive">
                {listTexts.title}
              </CardTitle>
              <CardDescription className="text-sm">
                {listTexts.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button 
                  onClick={this.handleRefresh}
                  variant="default"
                  className="gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  {listTexts.refresh}
                </Button>
                <Button 
                  onClick={this.handleReset}
                  variant="outline"
                >
                  إغلاق
                </Button>
              </div>

              {process.env.NODE_ENV === 'development' && error && (
                <div className="mt-4 p-3 bg-muted rounded-lg">
                  <h4 className="font-semibold mb-2 text-sm">{lang === 'ar' ? 'تفاصيل الخطأ' : 'Error Details'}</h4>
                  <div className="text-sm font-mono">
                    <div className="text-destructive font-semibold">
                      {error.name}: {error.message}
                    </div>
                  </div>
                </div>
              )}

              <div className="text-center text-xs text-muted-foreground">
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

export default ListErrorBoundary