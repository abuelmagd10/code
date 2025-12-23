"use client"

import { useState, useEffect } from "react"
import { useSupabase } from "@/lib/supabase/hooks"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { CheckCircle, AlertCircle, Loader2, RefreshCw } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

export default function FixCOGSPage() {
  const { supabase } = useSupabase()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [status, setStatus] = useState<any>(null)
  const [results, setResults] = useState<any>(null)

  // فحص حالة النظام عند التحميل
  useEffect(() => {
    checkStatus()
  }, [])

  const checkStatus = async () => {
    try {
      setChecking(true)
      const response = await fetch("/api/fix-cogs-accounting")
      const data = await response.json()
      setStatus(data.data)
    } catch (error) {
      console.error("Error checking status:", error)
    } finally {
      setChecking(false)
    }
  }

  const applyFix = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/fix-cogs-accounting", {
        method: "POST"
      })
      const data = await response.json()
      
      if (data.success) {
        setResults(data.data)
        toast({
          title: "✅ تم التصحيح بنجاح",
          description: "تم تطبيق التصحيحات المحاسبية على النظام",
        })
        // إعادة فحص الحالة
        await checkStatus()
      } else {
        throw new Error(data.error || "فشل التصحيح")
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "❌ خطأ",
        description: error.message || "حدث خطأ أثناء تطبيق التصحيحات",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">تصحيح النظام المحاسبي - COGS</CardTitle>
          <CardDescription>
            تطبيق المعيار المحاسبي الصحيح لحساب تكلفة البضاعة المباعة والأرباح
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* شرح المشكلة */}
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>المشكلة المحاسبية</AlertTitle>
            <AlertDescription className="space-y-2 mt-2">
              <p>• المشتريات كانت تُسجل كمصروف بدلاً من مخزون (Asset)</p>
              <p>• COGS (تكلفة البضاعة المباعة) لم يكن يُسجل عند البيع</p>
              <p>• الأرباح كانت مضخمة بشكل خاطئ</p>
            </AlertDescription>
          </Alert>

          {/* الحل */}
          <Alert className="border-green-500">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertTitle className="text-green-700">الحل المحاسبي الصحيح</AlertTitle>
            <AlertDescription className="space-y-2 mt-2 text-green-700">
              <p>✅ المشتريات → المخزون (Asset)</p>
              <p>✅ عند البيع → COGS يُسجل تلقائيًا (Quantity × Cost Price)</p>
              <p>✅ الربح = المبيعات - COGS - المصروفات</p>
            </AlertDescription>
          </Alert>

          {/* حالة النظام */}
          {checking ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="mr-2">جاري فحص النظام...</span>
            </div>
          ) : status ? (
            <Card className={status.needs_fix ? "border-orange-500" : "border-green-500"}>
              <CardHeader>
                <CardTitle className="text-lg">حالة النظام</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span>الحالة:</span>
                  <span className={status.needs_fix ? "text-orange-600 font-bold" : "text-green-600 font-bold"}>
                    {status.status}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>معاملات بيع بدون COGS:</span>
                  <span className="font-bold">{status.sales_without_cogs}</span>
                </div>
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <p className="text-sm">{status.recommendation}</p>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {/* نتائج التصحيح */}
          {results && (
            <Card className="border-green-500">
              <CardHeader>
                <CardTitle className="text-lg text-green-700">نتائج التصحيح</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span>Trigger للـ COGS التلقائي:</span>
                  <span>{results.summary?.trigger_status}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>قيود COGS المصححة:</span>
                  <span>{results.summary?.historical_cogs_fixed}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>قائمة الدخل:</span>
                  <span>{results.summary?.income_statement}</span>
                </div>
                {results.results?.errors?.length > 0 && (
                  <Alert variant="destructive">
                    <AlertTitle>أخطاء:</AlertTitle>
                    <AlertDescription>
                      {results.results.errors.map((err: string, i: number) => (
                        <p key={i}>• {err}</p>
                      ))}
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          )}

          {/* أزرار التحكم */}
          <div className="flex gap-3">
            <Button
              onClick={applyFix}
              disabled={loading || !status?.needs_fix}
              className="flex-1"
            >
              {loading ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  جاري التطبيق...
                </>
              ) : (
                <>
                  <CheckCircle className="ml-2 h-4 w-4" />
                  تطبيق التصحيحات
                </>
              )}
            </Button>
            <Button
              onClick={checkStatus}
              disabled={checking}
              variant="outline"
            >
              <RefreshCw className="ml-2 h-4 w-4" />
              إعادة الفحص
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

