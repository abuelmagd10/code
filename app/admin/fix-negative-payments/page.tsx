"use client"

/**
 * v3.74.733 — inspection kept, repair removed.
 *
 * /api/inspect-negative-payments is company-scoped and read-only, so it stays.
 * /api/fix-negative-payments discarded companyId entirely and rewrote payments
 * across every tenant, so its button is gone and the endpoint returns 410.
 */

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react"

export default function InspectNegativePaymentsPage() {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const inspect = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/inspect-negative-payments")
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "تعذّر الفحص")
      setData(json.data ?? json)
    } catch (err: any) {
      setError(err.message || "حدث خطأ غير متوقع")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl" dir="rtl">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">فحص المدفوعات السالبة</CardTitle>
          <CardDescription>فحص للقراءة فقط — مقصور على شركتك</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="border-amber-500">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-700">زر التصحيح أُزيل</AlertTitle>
            <AlertDescription className="space-y-2 mt-2 text-amber-700">
              <p>
                أداة التصحيح كانت تعمل على <strong>مدفوعات كل الشركات</strong> — لم تكن مقيَّدة
                بشركة المستخدم إطلاقاً. فضغطة واحدة من مسؤول فى شركة كانت تُعيد كتابة سجل
                المدفوعات لدى كل الشركات الأخرى.
              </p>
              <p>
                كما كانت تُنشئ المرتجعات بمنطق <strong>سابق لنظام FIFO</strong>.
              </p>
              <p>الفحص أدناه سليم ومقيَّد بشركتك، فبقى كما هو.</p>
            </AlertDescription>
          </Alert>

          <Button onClick={inspect} disabled={loading} variant="outline">
            {loading ? (
              <>
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                جارٍ الفحص...
              </>
            ) : (
              <>
                <RefreshCw className="ml-2 h-4 w-4" />
                فحص
              </>
            )}
          </Button>

          {error && (
            <Alert variant="destructive">
              <AlertTitle>خطأ</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {data && (
            <pre className="text-xs bg-gray-50 dark:bg-slate-800 p-3 rounded-lg overflow-x-auto">
              {JSON.stringify(data, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
