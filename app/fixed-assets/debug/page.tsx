"use client"

import { useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { ArrowLeft, Wrench, Database, CheckCircle, AlertTriangle } from "lucide-react"
import Link from "next/link"

export default function FixedAssetsDebugPage() {
  const { toast } = useToast()
  const [isApplyingFixes, setIsApplyingFixes] = useState(false)
  const [fixResult, setFixResult] = useState<any>(null)

  const applyFixes = async () => {
    setIsApplyingFixes(true)
    try {
      const response = await fetch('/api/fixed-assets/apply-fixes', {
        method: 'POST'
      })

      const result = await response.json()
      setFixResult(result)

      if (response.ok) {
        toast({
          title: "تم تطبيق الإصلاحات بنجاح",
          description: "دالة post_depreciation تم إصلاحها"
        })
      } else {
        toast({
          title: "فشل في تطبيق الإصلاحات",
          description: result.details || result.error,
          variant: "destructive"
        })
      }
    } catch (error: any) {
      toast({
        title: "خطأ في تطبيق الإصلاحات",
        description: error.message,
        variant: "destructive"
      })
    } finally {
      setIsApplyingFixes(false)
    }
  }

  const testDepreciation = async () => {
    try {
      // هذا مجرد اختبار - في الواقع نحتاج لـ schedule_id حقيقي
      const response = await fetch('/api/fixed-assets/test-depreciation', {
        method: 'POST'
      })

      const result = await response.json()

      toast({
        title: response.ok ? "نجح الاختبار" : "فشل الاختبار",
        description: result.message || result.error,
        variant: response.ok ? "default" : "destructive"
      })
    } catch (error: any) {
      toast({
        title: "خطأ في الاختبار",
        description: error.message,
        variant: "destructive"
      })
    }
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/fixed-assets">
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              العودة للأصول الثابتة
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
              إصلاح موديول الأصول الثابتة
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              أدوات استكشاف الأخطاء وتطبيق الإصلاحات
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* تطبيق الإصلاحات */}
          <Card className="dark:bg-slate-900">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wrench className="w-5 h-5" />
                تطبيق إصلاحات قاعدة البيانات
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                يطبق هذا الإصلاح دالة post_depreciation المُصححة التي تحل مشكلة خطأ 42703
              </p>

              <Button
                onClick={applyFixes}
                disabled={isApplyingFixes}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                {isApplyingFixes ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    جاري تطبيق الإصلاحات...
                  </>
                ) : (
                  <>
                    <Database className="w-4 h-4 mr-2" />
                    تطبيق الإصلاحات
                  </>
                )}
              </Button>

              {fixResult && (
                <div className={`p-3 rounded-lg ${
                  fixResult.success
                    ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                    : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                }`}>
                  <div className="flex items-center gap-2">
                    {fixResult.success ? (
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-red-600" />
                    )}
                    <span className="text-sm font-medium">
                      {fixResult.success ? 'نجح الإصلاح' : 'فشل الإصلاح'}
                    </span>
                  </div>
                  <p className="text-xs mt-1 text-gray-600 dark:text-gray-400">
                    {fixResult.message || fixResult.error}
                  </p>
                  {fixResult.details && (
                    <p className="text-xs mt-1 text-red-600 dark:text-red-400">
                      {fixResult.details}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* اختبار الإهلاك */}
          <Card className="dark:bg-slate-900">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5" />
                اختبار ترحيل الإهلاك
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                يختبر ترحيل الإهلاك للتأكد من عدم وجود خطأ 42703
              </p>

              <Button
                onClick={testDepreciation}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                اختبار ترحيل الإهلاك
              </Button>

              <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                <p>• يتحقق من وجود جداول الإهلاك</p>
                <p>• يختبر استدعاء دالة post_depreciation</p>
                <p>• يتأكد من عدم وجود أعمدة مفقودة</p>
              </div>
            </CardContent>
          </Card>

          {/* معلومات الإصلاح */}
          <Card className="dark:bg-slate-900 lg:col-span-2">
            <CardHeader>
              <CardTitle>معلومات الإصلاح</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium mb-2">المشاكل التي تم حلها:</h4>
                  <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                    <li>• إزالة entry_number من journal_entries</li>
                    <li>• إزالة branch_id من journal_entries</li>
                    <li>• إزالة cost_center_id من journal_entries</li>
                    <li>• إزالة created_by من journal_entries</li>
                    <li>• استخدام أعمدة محددة بدلاً من SELECT *</li>
                    <li>• استخدام متغيرات فردية بدلاً من RECORD</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-medium mb-2">الملفات المُحدثة:</h4>
                  <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                    <li>• scripts/120_fixed_assets.sql</li>
                    <li>• scripts/auto_fix_database.sql</li>
                    <li>• fix_post_depreciation.sql</li>
                    <li>• app/api/fixed-assets/apply-fixes/route.ts</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}