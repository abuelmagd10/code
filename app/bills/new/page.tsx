"use client"

import { useEffect, useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertTriangle, ArrowRight, ArrowLeft, ShoppingCart, Receipt } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"

export default function NewBillDisabledPage() {
  const router = useRouter()
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')

  useEffect(() => {
    try {
      setAppLang((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar')
    } catch { }
  }, [])

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8 flex items-center justify-center">
        <Card className="w-full max-w-lg shadow-xl border-dashed border-2 border-orange-200 dark:border-orange-900/50">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-16 h-16 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center mb-4">
              <AlertTriangle className="w-8 h-8 text-orange-600 dark:text-orange-400" />
            </div>
            <CardTitle className="text-2xl font-bold text-gray-900 dark:text-white">
              {appLang === 'en' ? 'Manual Bill Creation Disabled' : 'إصدار الفواتير اليدوي معطل'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-6">
            <p className="text-gray-600 dark:text-gray-400 text-lg">
              {appLang === 'en' 
                ? 'As per company policy, Purchase Bills can no longer be created manually. To maintain an accurate and strictly controlled purchasing lifecycle, Bills are now automatically generated solely upon the approval of a Purchase Order.'
                : 'وفقاً لسياسة الشركة، لم يعد من الممكن إنشاء فواتير المشتريات يدوياً. للحفاظ على دورة مشتريات منضبطة ودقيقة، يتم إصدار الفواتير تلقائياً فور اعتماد أمر الشراء.'}
            </p>

            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg text-sm text-blue-800 dark:text-blue-200">
              <p className="font-semibold mb-1">
                {appLang === 'en' ? 'Workflow:' : 'دورة العمل:'}
              </p>
              <div className="flex items-center justify-center gap-2 font-mono">
                <span>Purchase Order</span>
                <ArrowLeft className="w-4 h-4 rtl:hidden" />
                <ArrowRight className="w-4 h-4 ltr:hidden" />
                <span>Approval</span>
                <ArrowLeft className="w-4 h-4 rtl:hidden" />
                <ArrowRight className="w-4 h-4 ltr:hidden" />
                <span className="font-bold underline decoration-wavy decoration-blue-400 underline-offset-4">Automatic Draft Bill</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
              <Button onClick={() => router.push("/bills")} variant="outline" className="w-full sm:w-auto h-12">
                <Receipt className="w-4 h-4 ml-2 rtl:mr-2 rtl:ml-0" />
                {appLang === 'en' ? 'Back to Bills' : 'العودة لفواتير الشراء'}
              </Button>
              <Button onClick={() => router.push("/purchase-orders")} className="w-full sm:w-auto h-12 text-white bg-blue-600 hover:bg-blue-700">
                <ShoppingCart className="w-4 h-4 ml-2 rtl:mr-2 rtl:ml-0" />
                {appLang === 'en' ? 'Go to Purchase Orders' : 'الانتقال لأوامر الشراء'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
