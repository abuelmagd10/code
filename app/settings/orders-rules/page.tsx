"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { Shield, CheckCircle, AlertTriangle, Settings } from "lucide-react"

export default function OrdersRulesPage() {
  const [isApplying, setIsApplying] = useState(false)
  const [result, setResult] = useState<any>(null)
  const { toast } = useToast()
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')

  useEffect(() => {
    const handler = () => {
      try {
        setAppLang((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar')
      } catch { }
    }
    handler()
    window.addEventListener('app_language_changed', handler)
    return () => { window.removeEventListener('app_language_changed', handler) }
  }, [])

  const t = (en: string, ar: string) => appLang === 'en' ? en : ar

  const applyRules = async () => {
    setIsApplying(true)
    setResult(null)

    try {
      const response = await fetch("/api/apply-orders-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || t("An error occurred while applying the rules", "حدث خطأ أثناء تطبيق القواعد"))
      }

      setResult(data.data)
      toast({
        title: t("Success", "نجح"),
        description: data.data?.message || t("Rules applied successfully", "تم تطبيق القواعد بنجاح")
      })
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: t("Error", "خطأ"),
        description: error.message
      })
      setResult({ error: error.message })
    } finally {
      setIsApplying(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-6">
        
        <div className="flex items-center gap-3">
          <Settings className="w-8 h-8 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold">{t("Accounting Mode for Sales and Purchase Orders", "النمط المحاسبي لأوامر البيع والشراء")}</h1>
            <p className="text-gray-600 dark:text-gray-400">{t("Apply strict accounting rules", "تطبيق القواعد المحاسبية الصارمة")}</p>
          </div>
        </div>

        {/* شرح النمط */}
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-900/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-800 dark:text-blue-200">
              <Shield className="w-5 h-5" />
              {t("Strict Accounting Mode", "النمط المحاسبي الصارم")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-blue-700 dark:text-blue-300">
            <div>
              <h3 className="font-semibold mb-2">{t("🎯 Objective:", "🎯 الهدف:")}</h3>
              <p>{t("Ensure a professional, strict accounting mode for managing sales and purchase orders together with their linked invoices", "ضمان نمط محاسبي احترافي وصارم لإدارة أوامر البيع والشراء مع فواتيرها المرتبطة")}</p>
            </div>
            
            <div>
              <h3 className="font-semibold mb-2">{t("📋 Core Rules:", "📋 القواعد الأساسية:")}</h3>
              <ul className="list-disc list-inside space-y-1 mr-4">
                <li><strong>{t("Draft status:", "حالة المسودة:")}</strong> {t("The order and its linked invoice can be edited", "يمكن تعديل الأمر والفاتورة المرتبطة")}</li>
                <li><strong>{t("Sent status:", "حالة مرسلة:")}</strong> {t("Editing the order is blocked; changes are made through the invoice only", "يُمنع تعديل الأمر، التعديل من الفاتورة فقط")}</li>
                <li><strong>{t("Paid status:", "حالة مدفوعة:")}</strong> {t("Editing the order is blocked; changes are made through the invoice only", "يُمنع تعديل الأمر، التعديل من الفاتورة فقط")}</li>
                <li><strong>{t("Synchronization:", "المزامنة:")}</strong> {t("Invoice updates are automatically reflected on the order", "تحديثات الفاتورة تنعكس على الأمر تلقائياً")}</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold mb-2">{t("🔒 Protection:", "🔒 الحماية:")}</h3>
              <ul className="list-disc list-inside space-y-1 mr-4">
                <li>{t("Prevent editing sales orders after the invoice is sent", "منع تعديل أوامر البيع بعد إرسال الفاتورة")}</li>
                <li>{t("Prevent editing purchase orders after the invoice is sent", "منع تعديل أوامر الشراء بعد إرسال الفاتورة")}</li>
                <li>{t("Prevent deleting orders linked to sent invoices", "منع حذف الأوامر المرتبطة بفواتير مرسلة")}</li>
                <li>{t("Automatic synchronization of values between orders and invoices", "مزامنة تلقائية للقيم بين الأوامر والفواتير")}</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* تطبيق القواعد */}
        <Card>
          <CardHeader>
            <CardTitle>{t("Apply Accounting Rules", "تطبيق القواعد المحاسبية")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
                <div className="text-sm text-yellow-800 dark:text-yellow-200">
                  <p className="font-semibold mb-1">{t("Important Warning:", "تحذير مهم:")}</p>
                  <p>{t("Database functions and rules will be created to prevent unauthorized modifications. This action cannot be easily undone.", "سيتم إنشاء دوال وقواعد في قاعدة البيانات لمنع التعديلات غير المصرح بها. هذا الإجراء لا يمكن التراجع عنه بسهولة.")}</p>
                </div>
              </div>
            </div>

            <Button 
              onClick={applyRules} 
              disabled={isApplying}
              className="w-full bg-green-600 hover:bg-green-700"
              size="lg"
            >
              <Shield className="w-5 h-5 mr-2" />
              {isApplying ? t("Applying rules...", "جاري تطبيق القواعد...") : t("Apply Strict Accounting Mode", "تطبيق النمط المحاسبي الصارم")}
            </Button>

            {result && (
              <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-3">
                <h3 className="font-semibold flex items-center gap-2">
                  {result.error ? (
                    <>
                      <AlertTriangle className="w-5 h-5 text-red-500" />
                      {t("Application Result - Error", "نتيجة التطبيق - خطأ")}
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-5 h-5 text-green-500" />
                      {t("Application Result - Success", "نتيجة التطبيق - نجح")}
                    </>
                  )}
                </h3>
                
                {result.error ? (
                  <p className="text-red-600">{result.error}</p>
                ) : (
                  <div className="space-y-3 text-sm">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded">
                        <div className="text-blue-800 dark:text-blue-200 font-semibold">{t("Functions Created", "الدوال المنشأة")}</div>
                        <div className="text-2xl font-bold text-blue-600">{result.functions_created || 0}</div>
                      </div>
                      <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded">
                        <div className="text-green-800 dark:text-green-200 font-semibold">{t("Rules Applied", "القواعد المطبقة")}</div>
                        <div className="text-2xl font-bold text-green-600">{result.triggers_created || 0}</div>
                      </div>
                    </div>

                    {result.steps && result.steps.length > 0 && (
                      <div>
                        <p className="font-semibold text-green-600 mb-2">{t("Completed Steps:", "الخطوات المنجزة:")}</p>
                        <ul className="list-disc list-inside space-y-1">
                          {result.steps.map((step: string, idx: number) => (
                            <li key={idx} className="text-green-600">{step}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {result.errors && result.errors.length > 0 && (
                      <div>
                        <p className="font-semibold text-red-600 mb-2">{t("Errors:", "أخطاء:")}</p>
                        <ul className="list-disc list-inside space-y-1">
                          {result.errors.map((error: string, idx: number) => (
                            <li key={idx} className="text-red-600">{error}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {result.compliance_status && (
                      <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded">
                        <p className="font-semibold text-green-800 dark:text-green-200 mb-2">{t("Compliance Status:", "حالة الامتثال:")}</p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="flex items-center gap-1">
                            <CheckCircle className="w-3 h-3 text-green-500" />
                            <span>{t("Draft orders are editable", "أوامر المسودة قابلة للتعديل")}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <CheckCircle className="w-3 h-3 text-green-500" />
                            <span>{t("Sent orders are protected", "أوامر مرسلة محمية")}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <CheckCircle className="w-3 h-3 text-green-500" />
                            <span>{t("Control via invoices", "التحكم عبر الفواتير")}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <CheckCircle className="w-3 h-3 text-green-500" />
                            <span>{t("Automatic synchronization", "مزامنة تلقائية")}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {result.message && (
                      <p className="mt-3 text-green-600 font-semibold">{result.message}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* معلومات إضافية */}
        <Card>
          <CardHeader>
            <CardTitle>{t("Technical Information", "معلومات تقنية")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-3">
            <div>
              <h4 className="font-semibold mb-1">{t("Required Functions:", "الدوال المطلوبة:")}</h4>
              <ul className="list-disc list-inside space-y-1 mr-4 text-gray-600 dark:text-gray-400">
                <li><code>prevent_sales_order_edit_after_sent()</code></li>
                <li><code>prevent_purchase_order_edit_after_sent()</code></li>
                <li><code>sync_sales_order_from_invoice()</code></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-1">{t("Rules (Triggers):", "القواعد (Triggers):")}</h4>
              <ul className="list-disc list-inside space-y-1 mr-4 text-gray-600 dark:text-gray-400">
                <li><code>prevent_so_edit_trigger</code> {t("on table", "على جدول")} sales_orders</li>
                <li><code>prevent_po_edit_trigger</code> {t("on table", "على جدول")} purchase_orders</li>
                <li><code>sync_so_from_invoice_trigger</code> {t("on table", "على جدول")} invoices</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}