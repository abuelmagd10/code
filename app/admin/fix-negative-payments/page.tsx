"use client"

import { useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertTriangle, CheckCircle, XCircle } from "lucide-react"

export default function FixNegativePaymentsPage() {
  const [loading, setLoading] = useState(false)
  const [inspecting, setInspecting] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [inspectionData, setInspectionData] = useState<any>(null)
  const appLang = typeof window !== 'undefined' ? ((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') : 'ar'

  const inspectPayments = async () => {
    setInspecting(true)
    setInspectionData(null)

    try {
      const response = await fetch('/api/inspect-negative-payments')
      const data = await response.json()
      setInspectionData(data)
    } catch (error: any) {
      setInspectionData({
        success: false,
        error: error.message
      })
    } finally {
      setInspecting(false)
    }
  }

  const runFix = async () => {
    if (!confirm(appLang === 'en'
      ? 'This will convert all negative payments to proper sales returns. Continue?'
      : 'سيتم تحويل جميع المدفوعات السالبة إلى مرتجعات صحيحة. هل تريد المتابعة؟')) {
      return
    }

    setLoading(true)
    setResult(null)

    try {
      const response = await fetch('/api/fix-negative-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      const data = await response.json()
      setResult(data)
    } catch (error: any) {
      setResult({
        success: false,
        error: error.message
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-8 pt-20 md:pt-8">
        <Card className="max-w-4xl mx-auto">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-6 h-6 text-orange-500" />
              {appLang === 'en' ? 'Fix Negative Payments' : 'تصحيح المدفوعات السالبة'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <h3 className="font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
                {appLang === 'en' ? 'What does this do?' : 'ماذا يفعل هذا؟'}
              </h3>
              <ul className="text-sm text-yellow-700 dark:text-yellow-300 space-y-1 list-disc list-inside">
                <li>{appLang === 'en' ? 'Finds all payments with negative amounts' : 'البحث عن جميع المدفوعات ذات المبالغ السالبة'}</li>
                <li>{appLang === 'en' ? 'Creates proper sales return records' : 'إنشاء سجلات مرتجعات صحيحة'}</li>
                <li>{appLang === 'en' ? 'Updates invoice returned_amount and return_status' : 'تحديث returned_amount و return_status في الفواتير'}</li>
                <li>{appLang === 'en' ? 'Deletes the incorrect negative payments' : 'حذف المدفوعات السالبة الخاطئة'}</li>
              </ul>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Button
                onClick={inspectPayments}
                disabled={inspecting}
                variant="outline"
                size="lg"
              >
                {inspecting
                  ? (appLang === 'en' ? 'Inspecting...' : 'جاري الفحص...')
                  : (appLang === 'en' ? 'Inspect First' : 'فحص أولاً')}
              </Button>

              <Button
                onClick={runFix}
                disabled={loading}
                size="lg"
              >
                {loading
                  ? (appLang === 'en' ? 'Processing...' : 'جاري المعالجة...')
                  : (appLang === 'en' ? 'Run Fix' : 'تشغيل التصحيح')}
              </Button>
            </div>

            {inspectionData && inspectionData.success && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <h3 className="font-semibold text-blue-800 dark:text-blue-200 mb-3">
                  {appLang === 'en' ? 'Inspection Results' : 'نتائج الفحص'} ({inspectionData.count} {appLang === 'en' ? 'payments' : 'دفعة'})
                </h3>
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-blue-100 dark:bg-blue-900/30 sticky top-0">
                      <tr>
                        <th className="px-2 py-1 text-right text-xs">{appLang === 'en' ? 'ID' : 'المعرف'}</th>
                        <th className="px-2 py-1 text-right text-xs">{appLang === 'en' ? 'Amount' : 'المبلغ'}</th>
                        <th className="px-2 py-1 text-right text-xs">{appLang === 'en' ? 'Date' : 'التاريخ'}</th>
                        <th className="px-2 py-1 text-right text-xs">{appLang === 'en' ? 'Notes' : 'الملاحظات'}</th>
                        <th className="px-2 py-1 text-right text-xs">{appLang === 'en' ? 'Invoice' : 'الفاتورة'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inspectionData.payments?.map((p: any) => (
                        <tr key={p.id} className="border-b dark:border-blue-800">
                          <td className="px-2 py-1 font-mono text-xs">{p.id.slice(0, 8)}</td>
                          <td className="px-2 py-1 text-red-600 dark:text-red-400 font-semibold">{p.amount.toFixed(2)} £</td>
                          <td className="px-2 py-1 text-xs">{p.payment_date}</td>
                          <td className="px-2 py-1 text-xs max-w-xs truncate">{p.notes || '-'}</td>
                          <td className="px-2 py-1 text-xs">
                            {p.related_invoice ? (
                              <span className="text-green-600 dark:text-green-400">
                                ✓ {p.related_invoice.invoice_number}
                              </span>
                            ) : (
                              <span className="text-red-600 dark:text-red-400">✗ {appLang === 'en' ? 'Not found' : 'غير موجودة'}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {result && (
              <div className={`rounded-lg p-4 ${result.success ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'}`}>
                <div className="flex items-center gap-2 mb-3">
                  {result.success ? (
                    <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                  )}
                  <h3 className={`font-semibold ${result.success ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}`}>
                    {result.message || (result.success ? 'Success' : 'Error')}
                  </h3>
                </div>

                {result.success && result.results && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div className="bg-white dark:bg-slate-800 rounded p-3">
                        <div className="text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Total' : 'الإجمالي'}</div>
                        <div className="text-2xl font-bold">{result.total || 0}</div>
                      </div>
                      <div className="bg-white dark:bg-slate-800 rounded p-3">
                        <div className="text-green-600 dark:text-green-400">{appLang === 'en' ? 'Success' : 'نجح'}</div>
                        <div className="text-2xl font-bold text-green-600 dark:text-green-400">{result.success_count || 0}</div>
                      </div>
                      <div className="bg-white dark:bg-slate-800 rounded p-3">
                        <div className="text-red-600 dark:text-red-400">{appLang === 'en' ? 'Errors' : 'أخطاء'}</div>
                        <div className="text-2xl font-bold text-red-600 dark:text-red-400">{result.error_count || 0}</div>
                      </div>
                    </div>

                    <div className="max-h-96 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-100 dark:bg-slate-800 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-right">{appLang === 'en' ? 'Payment ID' : 'معرف الدفعة'}</th>
                            <th className="px-3 py-2 text-right">{appLang === 'en' ? 'Invoice' : 'الفاتورة'}</th>
                            <th className="px-3 py-2 text-right">{appLang === 'en' ? 'Amount' : 'المبلغ'}</th>
                            <th className="px-3 py-2 text-right">{appLang === 'en' ? 'Status' : 'الحالة'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.results.map((r: any, idx: number) => (
                            <tr key={idx} className="border-b dark:border-slate-700">
                              <td className="px-3 py-2 font-mono text-xs">{r.payment_id?.slice(0, 8)}</td>
                              <td className="px-3 py-2">{r.invoice_number || '-'}</td>
                              <td className="px-3 py-2">{r.return_amount ? `${r.return_amount.toFixed(2)} £` : '-'}</td>
                              <td className="px-3 py-2">
                                <span className={`px-2 py-1 rounded text-xs ${r.status === 'success' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' :
                                  r.status === 'error' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' :
                                    'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                                  }`}>
                                  {r.status}
                                </span>
                                {r.reason && <div className="text-xs text-gray-500 mt-1">{r.reason}</div>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {!result.success && result.error && (
                  <p className="text-sm text-red-700 dark:text-red-300">{result.error}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

