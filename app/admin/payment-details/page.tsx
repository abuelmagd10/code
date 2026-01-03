"use client"

import { useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search } from "lucide-react"

export default function PaymentDetailsPage() {
  const [paymentId, setPaymentId] = useState("")
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<any>(null)
  const appLang = typeof window !== 'undefined' ? ((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') : 'ar'

  const fetchDetails = async () => {
    if (!paymentId.trim()) return

    setLoading(true)
    setData(null)

    try {
      const response = await fetch(`/api/get-payment-details?id=${paymentId.trim()}`)
      const result = await response.json()
      setData(result)
    } catch (error: any) {
      setData({
        success: false,
        error: error.message
      })
    } finally {
      setLoading(false)
    }
  }

  // الدفعات المتبقية
  const remainingPayments = [
    { id: "7e5af0d0-e5e8-4e8f-8e8f-0d0e5e8f8e8f", label: "7e5af0d0" },
    { id: "14df608e-1234-5678-9abc-def012345678", label: "14df608e" }
  ]

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-8 pt-20 md:pt-8">
        <Card className="max-w-4xl mx-auto">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="w-6 h-6" />
              {appLang === 'en' ? 'Payment Details Inspector' : 'فحص تفاصيل الدفعة'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex gap-2">
              <Input
                placeholder={appLang === 'en' ? 'Enter Payment ID' : 'أدخل معرف الدفعة'}
                value={paymentId}
                onChange={(e) => setPaymentId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchDetails()}
              />
              <Button onClick={fetchDetails} disabled={loading}>
                {loading ? (appLang === 'en' ? 'Loading...' : 'جاري التحميل...') : (appLang === 'en' ? 'Search' : 'بحث')}
              </Button>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <h3 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">
                {appLang === 'en' ? 'Quick Access - Remaining Payments:' : 'وصول سريع - الدفعات المتبقية:'}
              </h3>
              <div className="flex gap-2 flex-wrap">
                {remainingPayments.map((p) => (
                  <Button
                    key={p.id}
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setPaymentId(p.id)
                      setTimeout(() => fetchDetails(), 100)
                    }}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>

            {data && (
              <div className={`rounded-lg p-4 ${data.success ? 'bg-white dark:bg-slate-800 border' : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'}`}>
                {data.success ? (
                  <div className="space-y-4">
                    <h3 className="font-bold text-lg border-b pb-2">
                      {appLang === 'en' ? 'Payment Information' : 'معلومات الدفعة'}
                    </h3>
                    
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'ID:' : 'المعرف:'}</span>
                        <div className="font-mono text-xs">{data.payment.id}</div>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Amount:' : 'المبلغ:'}</span>
                        <div className="font-bold text-lg text-red-600 dark:text-red-400">{data.payment.amount} £</div>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Date:' : 'التاريخ:'}</span>
                        <div>{data.payment.payment_date}</div>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Method:' : 'الطريقة:'}</span>
                        <div>{data.payment.payment_method}</div>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Customer ID:' : 'معرف العميل:'}</span>
                        <div className="font-mono text-xs">{data.payment.customer_id || '❌ NULL'}</div>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Company ID:' : 'معرف الشركة:'}</span>
                        <div className="font-mono text-xs">{data.payment.company_id || '❌ NULL'}</div>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Invoice ID:' : 'معرف الفاتورة:'}</span>
                        <div className="font-mono text-xs">{data.payment.invoice_id || '❌ NULL'}</div>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Account ID:' : 'معرف الحساب:'}</span>
                        <div className="font-mono text-xs">{data.payment.account_id || '❌ NULL'}</div>
                      </div>
                    </div>

                    <div>
                      <span className="text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Notes:' : 'الملاحظات:'}</span>
                      <div className="bg-gray-50 dark:bg-slate-700 p-2 rounded mt-1 text-sm">
                        {data.payment.notes || '(empty)'}
                      </div>
                    </div>

                    {data.payment.customer && (
                      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded p-3">
                        <h4 className="font-semibold text-green-800 dark:text-green-200 mb-1">
                          ✓ {appLang === 'en' ? 'Customer Found' : 'تم إيجاد العميل'}
                        </h4>
                        <div className="text-sm">{data.payment.customer.name}</div>
                      </div>
                    )}

                    {data.payment.invoice && (
                      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded p-3">
                        <h4 className="font-semibold text-green-800 dark:text-green-200 mb-1">
                          ✓ {appLang === 'en' ? 'Invoice Found (Direct Link)' : 'تم إيجاد الفاتورة (رابط مباشر)'}
                        </h4>
                        <div className="text-sm">
                          {data.payment.invoice.invoice_number} - {data.payment.invoice.total_amount} £
                        </div>
                      </div>
                    )}

                    {data.payment.extracted_invoice && (
                      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-3">
                        <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-1">
                          ✓ {appLang === 'en' ? 'Invoice Found (From Notes)' : 'تم إيجاد الفاتورة (من الملاحظات)'}
                        </h4>
                        <div className="text-sm">
                          {data.payment.extracted_invoice.invoice_number} - {data.payment.extracted_invoice.total_amount} £
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-red-700 dark:text-red-300">
                    <h3 className="font-semibold mb-2">{appLang === 'en' ? 'Error' : 'خطأ'}</h3>
                    <p>{data.error}</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

