"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react"

export default function AddDividendsAccountPage() {
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<any>(null)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const checkStatus = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await fetch('/api/add-dividends-payable-account', {
        method: 'GET'
      })
      
      const data = await response.json()
      
      if (response.ok) {
        setStatus(data)
      } else {
        setError(data.error || 'فشل التحقق من الحالة')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const addAccounts = async () => {
    if (!confirm('هل أنت متأكد من إضافة حساب الأرباح الموزعة المستحقة لجميع الشركات؟')) {
      return
    }

    try {
      setLoading(true)
      setError(null)
      setResult(null)
      
      const response = await fetch('/api/add-dividends-payable-account', {
        method: 'POST'
      })
      
      const data = await response.json()
      
      if (response.ok) {
        setResult(data)
        // تحديث الحالة بعد الإضافة
        await checkStatus()
      } else {
        setError(data.error || 'فشل إضافة الحسابات')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl" dir="rtl">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">إضافة حساب الأرباح الموزعة المستحقة</CardTitle>
          <CardDescription>
            إضافة حساب "الأرباح الموزعة المستحقة" (2150) لجميع الشركات في قاعدة البيانات
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          
          {/* شرح الحساب */}
          <Alert>
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-semibold">📊 ما هو حساب الأرباح الموزعة المستحقة؟</p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li><strong>النوع:</strong> التزام متداول (Current Liability)</li>
                  <li><strong>الرصيد الطبيعي:</strong> دائن (Credit)</li>
                  <li><strong>الاستخدام:</strong> تسجيل الأرباح التي تم توزيعها على الشركاء ولكن لم يتم دفعها بعد</li>
                  <li><strong>الموقع:</strong> الالتزامات → الالتزامات المتداولة → الأرباح الموزعة المستحقة</li>
                </ul>
              </div>
            </AlertDescription>
          </Alert>

          {/* أزرار التحكم */}
          <div className="flex gap-4">
            <Button 
              onClick={checkStatus} 
              disabled={loading}
              variant="outline"
            >
              {loading ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  جاري التحقق...
                </>
              ) : (
                'التحقق من الحالة'
              )}
            </Button>

            <Button 
              onClick={addAccounts} 
              disabled={loading || (status && !status.needsUpdate)}
            >
              {loading ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  جاري الإضافة...
                </>
              ) : (
                'إضافة الحسابات'
              )}
            </Button>
          </div>

          {/* عرض الحالة */}
          {status && (
            <Alert variant={status.needsUpdate ? "default" : "default"}>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-1">
                  <p><strong>إجمالي الشركات:</strong> {status.totalCompanies}</p>
                  <p><strong>الشركات التي لديها الحساب:</strong> {status.companiesWithAccount}</p>
                  <p><strong>الشركات المتبقية:</strong> {status.companiesMissing}</p>
                  {status.needsUpdate ? (
                    <p className="text-orange-600 font-semibold mt-2">
                      ⚠️ يوجد {status.companiesMissing} شركة تحتاج إلى إضافة الحساب
                    </p>
                  ) : (
                    <p className="text-green-600 font-semibold mt-2">
                      ✅ جميع الشركات لديها الحساب
                    </p>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* عرض النتيجة */}
          {result && (
            <Alert variant="default">
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-semibold text-green-600">✅ {result.message}</p>
                  <div className="text-sm space-y-1">
                    <p><strong>إجمالي الشركات:</strong> {result.totalCompanies}</p>
                    <p><strong>الحسابات المضافة (2150):</strong> {result.accountsAdded}</p>
                    {result.details && (
                      <>
                        <p><strong>حسابات 2000 المضافة:</strong> {result.details.accounts_2000_added}</p>
                        <p><strong>حسابات 2100 المضافة:</strong> {result.details.accounts_2100_added}</p>
                        <p><strong>حسابات 2150 المضافة:</strong> {result.details.accounts_2150_added}</p>
                        {result.details.errors && result.details.errors.length > 0 && (
                          <div className="mt-2">
                            <p className="text-red-600 font-semibold">أخطاء:</p>
                            <ul className="list-disc list-inside text-xs">
                              {result.details.errors.map((err: string, idx: number) => (
                                <li key={idx}>{err}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* عرض الأخطاء */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <p className="font-semibold">خطأ:</p>
                <p className="text-sm">{error}</p>
              </AlertDescription>
            </Alert>
          )}

        </CardContent>
      </Card>
    </div>
  )
}

