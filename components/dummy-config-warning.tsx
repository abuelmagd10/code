"use client"

import { useState, useEffect } from 'react'
import { AlertTriangle, X, ExternalLink } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

interface DummyConfigWarningProps {
  lang?: 'ar' | 'en'
}

export function DummyConfigWarning({ lang = 'ar' }: DummyConfigWarningProps) {
  const [isDismissed, setIsDismissed] = useState(false)
  const [isDummyConfig, setIsDummyConfig] = useState(false)

  useEffect(() => {
    // Check if we're using dummy configuration
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    
    const isDummy = !!(supabaseUrl?.includes('dummy') || supabaseAnonKey?.includes('dummy'))
    setIsDummyConfig(isDummy)

    // Check if user has dismissed this warning
    const dismissed = localStorage.getItem('dummy-config-warning-dismissed')
    setIsDismissed(dismissed === 'true')
  }, [])

  const handleDismiss = () => {
    setIsDismissed(true)
    localStorage.setItem('dummy-config-warning-dismissed', 'true')
  }

  const texts = {
    ar: {
      title: 'تحذير: إعدادات قاعدة البيانات وهمية',
      description: 'يستخدم التطبيق حالياً إعدادات Supabase وهمية. لن تعمل الميزات بشكل صحيح.',
      setupGuide: 'دليل الإعداد',
      dismiss: 'إخفاء'
    },
    en: {
      title: 'Warning: Using Dummy Database Configuration',
      description: 'The application is currently using dummy Supabase configuration. Features will not work properly.',
      setupGuide: 'Setup Guide',
      dismiss: 'Dismiss'
    }
  }

  if (!isDummyConfig || isDismissed) {
    return null
  }

  return (
    <Alert className="border-orange-200 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-800 mb-4">
      <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
      <AlertDescription className="flex items-center justify-between w-full">
        <div className="flex-1">
          <div className="font-medium text-orange-800 dark:text-orange-200 mb-1">
            {texts[lang].title}
          </div>
          <div className="text-sm text-orange-700 dark:text-orange-300">
            {texts[lang].description}
          </div>
        </div>
        <div className="flex items-center gap-2 ml-4">
          <Button
            variant="outline"
            size="sm"
            className="text-orange-700 border-orange-300 hover:bg-orange-100 dark:text-orange-300 dark:border-orange-600 dark:hover:bg-orange-900/30"
            onClick={() => window.open('/SUPABASE_SETUP.md', '_blank')}
          >
            <ExternalLink className="h-3 w-3 mr-1" />
            {texts[lang].setupGuide}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className="text-orange-600 hover:bg-orange-100 dark:text-orange-400 dark:hover:bg-orange-900/30"
          >
            <X className="h-4 w-4" />
            {texts[lang].dismiss}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}