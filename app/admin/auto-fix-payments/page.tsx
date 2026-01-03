"use client"

import { useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Zap, CheckCircle, XCircle } from "lucide-react"

export default function AutoFixPaymentsPage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const appLang = typeof window !== 'undefined' ? ((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') : 'ar'

  const runAutoFix = async () => {
    if (!confirm(appLang === 'en'
      ? 'This will automatically fix ALL remaining negative payments. Continue?'
      : 'سيتم إصلاح جميع المدفوعات السالبة المتبقية تلقائياً. هل تريد المتابعة؟')) {
      return
    }

    setLoading(true)
    setResult(null)

    try {
      const response = await fetch('/api/auto-fix-remaining-payments', {
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
              <Zap className="w-6 h-6 text-yellow-500" />
              {appLang === 'en' ? 'Auto-Fix Negative Payments' : 'إصلاح تلقائي للمدفوعات السالبة'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <h3 className="font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
                {appLang === 'en' ? '⚡ Smart Auto-Fix Strategy:' : '⚡ استراتيجية الإصلاح الذكي:'}
              </h3>
              <ul className="text-sm text-yellow-700 dark:text-yellow-300 space-y-2 list-disc list-inside">
                <li>
                  <strong>{appLang === 'en' ? 'Step 1:' : 'الخطوة 1:'}</strong> {appLang === 'en' ? 'Try to extract invoice number from notes (e.g., INV-0031)' : 'محاولة استخراج رقم الفاتورة من الملاحظات (مثل INV-0031)'}
                </li>
                <li>
                  <strong>{appLang === 'en' ? 'Step 2:' : 'الخطوة 2:'}</strong> {appLang === 'en' ? 'If not found, search for recent invoices (last 30 days) for the same customer' : 'إذا لم يتم العثور عليها، البحث عن فواتير حديثة (آخر 30 يوم) لنفس العميل'}
                </li>
                <li>
                  <strong>{appLang === 'en' ? 'Step 3:' : 'الخطوة 3:'}</strong> {appLang === 'en' ? 'If invoice found, create proper sales return' : 'إذا تم إيجاد الفاتورة، إنشاء مرتجع صحيح'}
                </li>
                <li>
                  <strong>{appLang === 'en' ? 'Step 4:' : 'الخطوة 4:'}</strong> {appLang === 'en' ? 'If no invoice found or invalid data, delete the payment' : 'إذا لم يتم إيجاد فاتورة أو بيانات غير صالحة، حذف الدفعة'}
                </li>
              </ul>
            </div>

            <Button
              onClick={runAutoFix}
              disabled={loading}
              className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600"
              size="lg"
            >
              {loading
                ? (appLang === 'en' ? '⚡ Processing...' : '⚡ جاري المعالجة...')
                : (appLang === 'en' ? '⚡ Run Auto-Fix' : '⚡ تشغيل الإصلاح التلقائي')}
            </Button>

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
                            <th className="px-3 py-2 text-right">{appLang === 'en' ? 'Action' : 'الإجراء'}</th>
                            <th className="px-3 py-2 text-right">{appLang === 'en' ? 'Invoice' : 'الفاتورة'}</th>
                            <th className="px-3 py-2 text-right">{appLang === 'en' ? 'Amount' : 'المبلغ'}</th>
                            <th className="px-3 py-2 text-right">{appLang === 'en' ? 'Status' : 'الحالة'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.results.map((r: any, idx: number) => (
                            <tr key={idx} className="border-b dark:border-slate-700">
                              <td className="px-3 py-2 font-mono text-xs">{r.payment_id?.slice(0, 8)}</td>
                              <td className="px-3 py-2 text-xs">
                                <span className={`px-2 py-1 rounded ${
                                  r.action === 'converted_to_return' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' :
                                  r.action === 'deleted' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300' :
                                  'bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-300'
                                }`}>
                                  {r.action}
                                </span>
                              </td>
                              <td className="px-3 py-2">{r.invoice_number || '-'}</td>
                              <td className="px-3 py-2">{r.return_amount ? `${r.return_amount.toFixed(2)} £` : '-'}</td>
                              <td className="px-3 py-2">
                                <span className={`px-2 py-1 rounded text-xs ${
                                  r.status === 'success' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' :
                                  'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
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

