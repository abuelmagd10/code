"use client"

import { useState } from "react"
import { useSupabase } from "@/lib/supabase/hooks"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { Loader2, CheckCircle, XCircle, AlertCircle } from "lucide-react"
import { CompanyHeader } from "@/components/company-header"

export default function ApplyGovernancePage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)

  const handleApply = async () => {
    setLoading(true)
    setResult(null)

    try {
      const response = await fetch("/api/admin/apply-write-off-governance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })

      const data = await response.json()
      setResult(data)

      if (data.success) {
        toast({
          title: "✅ تم التطبيق بنجاح",
          description: "تم تطبيق قاعدة حوكمة الإهلاك بنجاح على قاعدة البيانات",
          variant: "default",
        })
      } else {
        toast({
          title: "⚠️ تطبيق جزئي",
          description: data.message || "تم التطبيق مع بعض الأخطاء. راجع التفاصيل أدناه.",
          variant: "destructive",
        })
      }
    } catch (error: any) {
      console.error("Error applying governance:", error)
      setResult({
        success: false,
        error: error.message || "فشل في تطبيق SQL script",
      })
      toast({
        title: "❌ خطأ",
        description: error.message || "فشل في تطبيق قاعدة حوكمة الإهلاك",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <div className="flex-1 flex flex-col overflow-hidden">
        <CompanyHeader />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-500" />
                  تطبيق قاعدة حوكمة الإهلاك
                </CardTitle>
                <CardDescription>
                  تطبيق SQL script على قاعدة البيانات لتطبيق قاعدة حوكمة الإهلاك (منع إهلاك المخزون بدون رصيد فعلي)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <h3 className="font-medium text-sm mb-2">⚠️ تنبيه مهم:</h3>
                  <ul className="text-xs space-y-1 text-muted-foreground list-disc list-inside">
                    <li>يجب أن تكون مسجل دخول كـ Owner أو Admin</li>
                    <li>سيتم إنشاء/تحديث Functions و Triggers في قاعدة البيانات</li>
                    <li>تأكد من عمل backup قبل التطبيق</li>
                    <li>هذه العملية آمنة ولا تحذف بيانات</li>
                  </ul>
                </div>

                <Button
                  onClick={handleApply}
                  disabled={loading}
                  className="w-full"
                  size="lg"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      جاري التطبيق...
                    </>
                  ) : (
                    "🚀 تطبيق قاعدة حوكمة الإهلاك"
                  )}
                </Button>

                {result && (
                  <div className="mt-4 space-y-4">
                    <Card className={result.success ? "border-green-500" : "border-amber-500"}>
                      <CardHeader>
                        <CardTitle className={`flex items-center gap-2 ${result.success ? "text-green-600" : "text-amber-600"}`}>
                          {result.success ? (
                            <CheckCircle className="h-5 w-5" />
                          ) : (
                            <XCircle className="h-5 w-5" />
                          )}
                          النتيجة
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {result.results && (
                          <div>
                            <p className="text-sm font-medium mb-2">📊 ملخص التنفيذ:</p>
                            <div className="grid grid-cols-3 gap-4 text-sm">
                              <div>
                                <span className="text-muted-foreground">المجموع:</span>
                                <span className="ml-2 font-medium">{result.results.total}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">✅ نجح:</span>
                                <span className="ml-2 font-medium text-green-600">{result.results.success}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">❌ فشل:</span>
                                <span className="ml-2 font-medium text-red-600">{result.results.failed}</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {result.verification && (
                          <div>
                            <p className="text-sm font-medium mb-2">🔍 التحقق:</p>
                            <div className="space-y-1 text-sm">
                              <div className="flex items-center gap-2">
                                {result.verification.functionExists ? (
                                  <CheckCircle className="h-4 w-4 text-green-600" />
                                ) : (
                                  <XCircle className="h-4 w-4 text-red-600" />
                                )}
                                <span>دالة get_available_inventory_quantity: {result.verification.functionExists ? "موجودة" : "غير موجودة"}</span>
                              </div>
                              {result.verification.functionWorks && (
                                <div className="flex items-center gap-2">
                                  <CheckCircle className="h-4 w-4 text-green-600" />
                                  <span>الدالة تعمل بشكل صحيح</span>
                                </div>
                              )}
                              {result.verification.error && (
                                <div className="text-red-600 text-xs mt-2">
                                  ⚠️ {result.verification.error}
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {result.results?.errors && result.results.errors.length > 0 && (
                          <div>
                            <p className="text-sm font-medium mb-2 text-red-600">❌ الأخطاء:</p>
                            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3 max-h-60 overflow-y-auto">
                              {result.results.errors.map((err: string, idx: number) => (
                                <div key={idx} className="text-xs text-red-700 dark:text-red-300 mb-1">
                                  {err}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {result.error && (
                          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3">
                            <p className="text-sm text-red-700 dark:text-red-300">{result.error}</p>
                          </div>
                        )}

                        {result.message && (
                          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-3">
                            <p className="text-sm text-blue-700 dark:text-blue-300">{result.message}</p>
                          </div>
                        )}

                        {!result.verification?.functionExists && (
                          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded p-3 mt-4">
                            <p className="text-sm font-medium mb-2">💡 الخطوات التالية:</p>
                            <ol className="text-xs space-y-1 list-decimal list-inside text-muted-foreground">
                              <li>افتح Supabase Dashboard</li>
                              <li>اذهب إلى SQL Editor</li>
                              <li>انسخ محتوى: <code className="bg-gray-200 dark:bg-gray-800 px-1 rounded">scripts/042_write_off_governance_validation.sql</code></li>
                              <li>الصق في SQL Editor واضغط Run</li>
                            </ol>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  )
}
