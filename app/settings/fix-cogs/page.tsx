"use client"

/**
 * v3.74.726 — this page no longer offers a repair button.
 *
 * The button called fix_historical_cogs(), which valued COGS from the product
 * card instead of the FIFO batches and never consumed those batches. It wrote
 * wrong numbers into the ledger and reported success while doing it. The
 * function has been dropped; what remains here is an honest read-only check.
 */

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertTriangle, CheckCircle, Loader2, RefreshCw } from "lucide-react"

export default function FixCOGSPage() {
  const [checking, setChecking] = useState(true)
  const [status, setStatus] = useState<any>(null)

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

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">فحص تكلفة البضاعة المباعة</CardTitle>
          <CardDescription>
            فحص للقراءة فقط — لا يُعدِّل أى قيد
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert className="border-amber-500">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-700">أداة التصحيح موقوفة</AlertTitle>
            <AlertDescription className="space-y-2 mt-2 text-amber-700">
              <p>
                زر «تطبيق التصحيحات» كان يحتسب التكلفة من <strong>بطاقة المنتج</strong> بدل
                دفعات FIFO، فيكتب قيوداً بتكلفة خاطئة ويترك الدفعات غير مستهلكة — ثم يُبلغ
                بالنجاح.
              </p>
              <p>
                أداة إصلاح تُفسد ما جاءت لتُصلحه، فأُوقفت وحُذفت الدالة من قاعدة البيانات.
              </p>
            </AlertDescription>
          </Alert>

          <Alert className="border-green-500">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertTitle className="text-green-700">الوضع الحالى</AlertTitle>
            <AlertDescription className="space-y-2 mt-2 text-green-700">
              <p>✅ عند كل عملية بيع تُسجَّل التكلفة من دفعات FIFO تلقائياً</p>
              <p>✅ عند المرتجع تُعاد الوحدات لدفعاتها الأصلية وتُعكس بنفس تكلفتها</p>
              <p>✅ لا حاجة لأى تصحيح يدوى للحركات الجديدة</p>
            </AlertDescription>
          </Alert>

          {checking ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="mr-2">جارٍ الفحص...</span>
            </div>
          ) : status ? (
            <Card className={status.needs_fix ? "border-orange-500" : "border-green-500"}>
              <CardHeader>
                <CardTitle className="text-lg">نتيجة الفحص</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span>الحالة:</span>
                  <span className={status.needs_fix ? "text-orange-600 font-bold" : "text-green-600 font-bold"}>
                    {status.status}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>حركات بيع بلا قيد تكلفة:</span>
                  <span className="font-bold">{status.sales_without_cogs}</span>
                </div>
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <p className="text-sm">{status.recommendation}</p>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <div className="flex gap-3">
            <Button onClick={checkStatus} disabled={checking} variant="outline">
              <RefreshCw className="ml-2 h-4 w-4" />
              إعادة الفحص
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
