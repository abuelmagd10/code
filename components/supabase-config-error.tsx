"use client"

import { AlertTriangle, Settings, Database } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface SupabaseConfigErrorProps {
  lang?: 'ar' | 'en'
}

export function SupabaseConfigError({ lang = 'ar' }: SupabaseConfigErrorProps) {
  const texts = {
    ar: {
      title: 'خطأ في إعدادات قاعدة البيانات',
      description: 'لم يتم العثور على إعدادات Supabase الصحيحة',
      mainMessage: 'يبدو أن إعدادات قاعدة البيانات غير مكتملة أو تحتوي على قيم وهمية.',
      steps: 'للحل، يرجى التأكد من:',
      step1: 'وجود ملف .env.local في جذر المشروع',
      step2: 'احتواء الملف على متغيرات Supabase الصحيحة:',
      step3: 'عدم احتواء القيم على كلمة "dummy"',
      step4: 'إعادة تشغيل الخادم بعد تحديث المتغيرات',
      contactAdmin: 'إذا استمرت المشكلة، يرجى الاتصال بمدير النظام'
    },
    en: {
      title: 'Database Configuration Error',
      description: 'Valid Supabase configuration not found',
      mainMessage: 'It appears that the database configuration is incomplete or contains dummy values.',
      steps: 'To resolve this, please ensure:',
      step1: 'The .env.local file exists in the project root',
      step2: 'The file contains valid Supabase variables:',
      step3: 'The values do not contain the word "dummy"',
      step4: 'Restart the server after updating the variables',
      contactAdmin: 'If the issue persists, please contact the system administrator'
    }
  }

  const t = texts[lang]

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
            <Database className="h-8 w-8 text-orange-600 dark:text-orange-400" />
          </div>
          <CardTitle className="text-2xl font-bold text-orange-600 dark:text-orange-400">
            {t.title}
          </CardTitle>
          <CardDescription className="text-base">
            {t.description}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {t.mainMessage}
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Settings className="h-5 w-5" />
              {t.steps}
            </h3>
            
            <ol className="space-y-3 text-sm" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 w-6 h-6 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center text-xs font-bold">1</span>
                <span>{t.step1}</span>
              </li>
              
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 w-6 h-6 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center text-xs font-bold">2</span>
                <div className="space-y-2">
                  <span>{t.step2}</span>
                  <div className="bg-gray-100 dark:bg-slate-800 p-3 rounded-lg font-mono text-xs">
                    <div>NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co</div>
                    <div>NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key</div>
                    <div>SUPABASE_SERVICE_ROLE_KEY=your-service-role-key</div>
                  </div>
                </div>
              </li>
              
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 w-6 h-6 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center text-xs font-bold">3</span>
                <span>{t.step3}</span>
              </li>
              
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 w-6 h-6 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center text-xs font-bold">4</span>
                <span>{t.step4}</span>
              </li>
            </ol>
          </div>

          <div className="text-center text-sm text-muted-foreground border-t pt-4">
            {t.contactAdmin}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}