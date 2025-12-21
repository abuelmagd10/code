"use client"

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  Database, 
  Server, 
  Settings,
  RefreshCw,
  ExternalLink
} from 'lucide-react'
import { performHealthCheck, getHealthMessages, type SystemHealth } from '@/lib/system-health'

export default function SystemStatusPage() {
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [lang] = useState<'ar' | 'en'>(() => {
    if (typeof window === 'undefined') return 'ar'
    return (localStorage.getItem('app_language') || 'ar') as 'ar' | 'en'
  })

  const loadHealthCheck = () => {
    setIsLoading(true)
    try {
      const healthResult = performHealthCheck()
      setHealth(healthResult)
    } catch (error) {
      console.error('Health check failed:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadHealthCheck()
  }, [])

  const texts = {
    ar: {
      title: 'حالة النظام',
      description: 'تشخيص شامل لحالة النظام والإعدادات',
      refresh: 'تحديث',
      supabaseConfig: 'إعدادات Supabase',
      environment: 'بيئة التشغيل',
      status: 'الحالة',
      healthy: 'سليم',
      warning: 'تحذير',
      error: 'خطأ',
      configured: 'مُعد',
      notConfigured: 'غير مُعد',
      dummy: 'وهمي',
      valid: 'صحيح',
      issues: 'المشاكل المكتشفة',
      noIssues: 'لا توجد مشاكل',
      setupGuide: 'دليل الإعداد',
      projectUrl: 'رابط المشروع',
      development: 'تطوير',
      production: 'إنتاج'
    },
    en: {
      title: 'System Status',
      description: 'Comprehensive system health and configuration diagnostics',
      refresh: 'Refresh',
      supabaseConfig: 'Supabase Configuration',
      environment: 'Environment',
      status: 'Status',
      healthy: 'Healthy',
      warning: 'Warning',
      error: 'Error',
      configured: 'Configured',
      notConfigured: 'Not Configured',
      dummy: 'Dummy',
      valid: 'Valid',
      issues: 'Detected Issues',
      noIssues: 'No Issues',
      setupGuide: 'Setup Guide',
      projectUrl: 'Project URL',
      development: 'Development',
      production: 'Production'
    }
  }

  const t = texts[lang]

  const getStatusIcon = (status: SystemHealth['status']) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="h-5 w-5 text-green-600" />
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-600" />
      case 'error':
        return <XCircle className="h-5 w-5 text-red-600" />
      default:
        return <AlertTriangle className="h-5 w-5 text-gray-600" />
    }
  }

  const getStatusColor = (status: SystemHealth['status']) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
      case 'error':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!health) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <XCircle className="h-12 w-12 text-red-600 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">
              {lang === 'ar' ? 'فشل في تحميل حالة النظام' : 'Failed to load system status'}
            </p>
            <Button onClick={loadHealthCheck} className="mt-4">
              <RefreshCw className="h-4 w-4 mr-2" />
              {t.refresh}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900 p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <Settings className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <CardTitle className="text-2xl">{t.title}</CardTitle>
                  <CardDescription>{t.description}</CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  {getStatusIcon(health.status)}
                  <Badge className={getStatusColor(health.status)}>
                    {health.status === 'healthy' ? t.healthy : 
                     health.status === 'warning' ? t.warning : t.error}
                  </Badge>
                </div>
                <Button onClick={loadHealthCheck} variant="outline" size="sm">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {t.refresh}
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Issues Alert */}
        {health.issues.length > 0 && (
          <Alert className="border-orange-200 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-800">
            <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            <AlertDescription>
              <div className="font-medium text-orange-800 dark:text-orange-200 mb-2">
                {t.issues}:
              </div>
              <ul className="list-disc list-inside space-y-1 text-sm text-orange-700 dark:text-orange-300">
                {health.issues.map((issue, index) => (
                  <li key={index}>{issue}</li>
                ))}
              </ul>
              <div className="mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-orange-700 border-orange-300 hover:bg-orange-100 dark:text-orange-300 dark:border-orange-600"
                  onClick={() => window.open('/SUPABASE_SETUP.md', '_blank')}
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  {t.setupGuide}
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Supabase Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                {t.supabaseConfig}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">{t.status}:</span>
                  <div className="mt-1">
                    <Badge className={health.supabase.hasValidKeys ? 
                      'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                      'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                    }>
                      {health.supabase.hasValidKeys ? t.valid : 
                       health.supabase.isDummy ? t.dummy : t.notConfigured}
                    </Badge>
                  </div>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">{t.configured}:</span>
                  <div className="mt-1">
                    <Badge variant={health.supabase.configured ? 'default' : 'destructive'}>
                      {health.supabase.configured ? t.configured : t.notConfigured}
                    </Badge>
                  </div>
                </div>
              </div>
              
              {health.supabase.url && (
                <div>
                  <span className="text-gray-500 dark:text-gray-400 text-sm">{t.projectUrl}:</span>
                  <div className="mt-1 p-2 bg-gray-100 dark:bg-slate-800 rounded text-xs font-mono break-all">
                    {health.supabase.url}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Environment */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5 text-green-600 dark:text-green-400" />
                {t.environment}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 text-sm">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Node Environment:</span>
                  <div className="mt-1">
                    <Badge variant={health.environment.isProduction ? 'default' : 'secondary'}>
                      {health.environment.isProduction ? t.production : t.development}
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* No Issues */}
        {health.issues.length === 0 && (
          <Card className="border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                <div>
                  <div className="font-medium text-green-800 dark:text-green-200">
                    {t.noIssues}
                  </div>
                  <div className="text-sm text-green-700 dark:text-green-300">
                    {lang === 'ar' ? 'النظام يعمل بشكل طبيعي' : 'System is operating normally'}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}