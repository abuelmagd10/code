"use client"

/**
 * v3.74.733 — the repair button is gone.
 *
 * It called /api/fix-bill-return, which hard-deleted journal entries and
 * inventory movements rather than reversing them, left FIFO consumption rows
 * orphaned, and forced the bill to "paid". The endpoint now returns 410; this
 * page explains why rather than 404ing on someone who bookmarked it.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertTriangle } from "lucide-react"

export default function FixBillReturnPage() {
  return (
    <div className="container mx-auto p-6 max-w-3xl" dir="rtl">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">إصلاح مرتجع فاتورة مشتريات</CardTitle>
          <CardDescription>هذه الأداة موقوفة</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="border-amber-500">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-700">لماذا أُوقفت</AlertTitle>
            <AlertDescription className="space-y-2 mt-2 text-amber-700">
              <p>
                كانت <strong>تحذف القيود المحاسبية وحركات المخزون نهائياً</strong> بدل عكسها بقيود
                مضادة — فيختفى أثر العملية من الدفاتر، ولا يبقى ما يدل على أنها حدثت أو حُذفت.
              </p>
              <p>
                وتترك <strong>دفعات FIFO معلّقة</strong> تشير إلى حركات لم تعد موجودة.
              </p>
              <p>
                وتفرض على الفاتورة حالة <strong>«مدفوعة»</strong> دون التحقق من السداد الفعلى.
              </p>
            </AlertDescription>
          </Alert>

          <Alert>
            <AlertTitle>البديل الصحيح</AlertTitle>
            <AlertDescription className="mt-2">
              تصحيح مرتجع خاطئ يتم بقيد عكسى يُبقى الأصل ظاهراً فى الدفاتر، مع إعادة الوحدات إلى
              دفعاتها عبر مسار FIFO. راجعنا قبل أى تصحيح على فاتورة بعينها.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  )
}
