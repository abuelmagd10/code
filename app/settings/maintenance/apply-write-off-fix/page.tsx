"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { CheckCircle2, XCircle, Loader2, AlertTriangle, FileText } from "lucide-react"
import { toast } from "@/hooks/use-toast"

export default function ApplyWriteOffFixPage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)

  const handleApplyFix = async () => {
    setLoading(true)
    setResult(null)

    try {
      const response = await fetch('/api/apply-write-off-fix', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setResult({
          success: true,
          message: data.message,
          changes: data.changes
        })
        toast({
          title: "نجح",
          description: "تم تطبيق الإصلاح بنجاح",
        })
      } else {
        setResult({
          success: false,
          message: data.message || data.error || 'حدث خطأ',
          instructions: data.instructions,
          file_path: data.file_path
        })
        toast({
          title: "تحذير",
          description: data.message || "يجب تطبيق الإصلاح من SQL Editor أولاً",
          variant: "destructive",
        })
      }
    } catch (error: any) {
      setResult({
        success: false,
        message: error.message || 'حدث خطأ أثناء تطبيق الإصلاح'
      })
      toast({
        title: "خطأ",
        description: error.message || "حدث خطأ",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center gap-2">
            <FileText className="w-6 h-6" />
            تطبيق إصلاح مشكلة إهلاك المخزون
          </CardTitle>
          <CardDescription>
            إصلاح مشكلة القيد غير المتوازن عند اعتماد إهلاك المخزون
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* معلومات المشكلة */}
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>المشكلة</AlertTitle>
            <AlertDescription>
              عند اعتماد إهلاك المخزون، يظهر خطأ "القيد غير متوازن" لأن الـ trigger يتحقق من التوازن بعد إدراج السطر الأول فقط.
            </AlertDescription>
          </Alert>

          {/* الحل */}
          <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
            <h3 className="font-semibold mb-2">الحل:</h3>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>تعديل دالة <code className="bg-gray-200 dark:bg-gray-800 px-1 rounded">approve_write_off</code> لإدراج كلا السطرين في نفس الأمر</li>
              <li>تعديل الـ triggers لتكون <code className="bg-gray-200 dark:bg-gray-800 px-1 rounded">DEFERRABLE INITIALLY DEFERRED</code></li>
            </ul>
          </div>

          {/* زر التطبيق */}
          <div className="flex gap-4">
            <Button 
              onClick={handleApplyFix} 
              disabled={loading}
              className="flex-1"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  جاري التطبيق...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  تطبيق الإصلاح
                </>
              )}
            </Button>
          </div>

          {/* النتيجة */}
          {result && (
            <Alert variant={result.success ? "default" : "destructive"}>
              {result.success ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              <AlertTitle>{result.success ? "نجح" : "فشل"}</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>{result.message}</p>
                
                {result.changes && (
                  <div className="mt-2">
                    <p className="font-semibold">التغييرات:</p>
                    <ul className="list-disc list-inside text-sm">
                      {result.changes.function_updated && (
                        <li>تم تحديث الدالة: {result.changes.function_updated}</li>
                      )}
                      {result.changes.triggers_updated && (
                        <li>تم تحديث الـ triggers: {result.changes.triggers_updated.length} trigger</li>
                      )}
                    </ul>
                  </div>
                )}

                {result.instructions && (
                  <div className="mt-4 bg-yellow-50 dark:bg-yellow-950 p-3 rounded">
                    <p className="font-semibold mb-2">تعليمات التطبيق اليدوي:</p>
                    <ol className="list-decimal list-inside space-y-1 text-sm">
                      {result.instructions.map((instruction: string, index: number) => (
                        <li key={index}>{instruction}</li>
                      ))}
                    </ol>
                    {result.file_path && (
                      <p className="mt-2 text-sm">
                        <strong>الملف:</strong> <code className="bg-gray-200 dark:bg-gray-800 px-1 rounded">{result.file_path}</code>
                      </p>
                    )}
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* تعليمات إضافية */}
          <div className="border-t pt-4">
            <h3 className="font-semibold mb-2">ملاحظات مهمة:</h3>
            <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
              <li>إذا لم تكن الدالة موجودة، يجب تطبيق ملف <code className="bg-gray-200 dark:bg-gray-800 px-1 rounded">scripts/apply_write_off_fix_function.sql</code> من SQL Editor أولاً</li>
              <li>يُنصح بعمل نسخة احتياطية قبل التطبيق (خاصة في Production)</li>
              <li>بعد التطبيق، يمكنك اختبار الإصلاح من صفحة إهلاك المخزون</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
