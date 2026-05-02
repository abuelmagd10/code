"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { XSquare, Info, BookOpen, ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react"
import { PageGuard } from "@/components/page-guard"
import { CompanyHeader } from "@/components/company-header"
import { ManufacturingGuide } from "@/components/manufacturing/manufacturing-guide"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { EXECUTION_COPY, readAppLanguage, getTextDirection, type AppLang } from "@/lib/manufacturing/manufacturing-ui"

export default function CloseProductionOrderPage() {
  const router = useRouter()
  const [lang, setLang] = useState<AppLang>("ar")

  useEffect(() => {
    const handler = () => setLang(readAppLanguage())
    handler()
    window.addEventListener("app_language_changed", handler)
    window.addEventListener("storage", (e) => { if (e.key === "app_language") handler() })
    return () => window.removeEventListener("app_language_changed", handler)
  }, [])

  const copy = EXECUTION_COPY[lang].closeOrder

  const checklist = lang === "ar"
    ? [
        "تم صرف جميع المواد الخام المطلوبة ✓",
        "تم إنجاز جميع مراحل التصنيع ✓",
        "تم إدخال الكمية المصنّعة فعلياً ✓",
        "تم إضافة المنتج النهائي للمخزن ✓",
        "مستودعا الصرف والاستلام محددان بشكل صحيح ✓",
      ]
    : [
        "All required raw materials have been issued ✓",
        "All manufacturing operations are complete ✓",
        "Actual manufactured quantity entered ✓",
        "Finished product added to inventory ✓",
        "Issue and receipt warehouses correctly specified ✓",
      ]

  return (
    <PageGuard resource="manufacturing_boms">
      <div dir={getTextDirection(lang)} className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">
          <CompanyHeader />

          <ManufacturingGuide
            currentStep="close"
            completedSteps={["products", "bom", "bom_version", "approve", "production_order", "material_issue", "product_receive"]}
            lang={lang}
            pageInfo={{
              titleAr: "إغلاق أمر الإنتاج",
              titleEn: "Close Production Order",
              descAr: "الخطوة الأخيرة في دورة التصنيع — تجمّد جميع الحركات المخزونية وتتيح احتساب التكلفة الفعلية.",
              descEn: "The final step in the manufacturing cycle — freezes all inventory movements and enables actual cost calculation.",
              whenAr: "بعد استلام المنتج النهائي وتأكد من اكتمال جميع العمليات.",
              whenEn: "After receiving the finished product and confirming all operations are complete.",
            }}
          />

          <Card className="p-5 sm:p-6 dark:bg-slate-900 dark:border-slate-800">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-xl">
                <XSquare className="h-7 w-7 text-red-600 dark:text-red-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{copy.title}</h1>
                  <Badge variant="outline" className="text-red-700 border-red-300 bg-red-50">{copy.pill}</Badge>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{copy.description}</p>
              </div>
            </div>
          </Card>

          <Card className="p-5 sm:p-6 dark:bg-slate-900 dark:border-slate-800 space-y-3">
            <div className="flex items-center gap-2">
              <Info className="h-5 w-5 text-blue-500" />
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">{copy.whatTitle}</h2>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{copy.whatDesc}</p>
          </Card>

          <Card className="p-5 sm:p-6 dark:bg-slate-900 dark:border-slate-800 space-y-3">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-amber-500" />
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">{copy.howToTitle}</h2>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{copy.howToDesc}</p>
          </Card>

          {/* Pre-close checklist */}
          <Card className="p-5 sm:p-6 dark:bg-slate-900 dark:border-slate-800 space-y-3">
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
              {lang === "ar" ? "قائمة التحقق قبل الإغلاق" : "Pre-Closure Checklist"}
            </h2>
            <div className="space-y-2">
              {checklist.map((item, idx) => (
                <div key={idx} className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5 sm:p-6 dark:bg-slate-900 dark:border-slate-800 bg-gradient-to-r from-red-50 to-rose-50 dark:from-red-950/20 dark:to-rose-950/20 border-red-200 dark:border-red-800">
            <p className="text-xs text-red-700 dark:text-red-400 mb-4">
              {lang === "ar"
                ? "إغلاق أمر الإنتاج يتم تلقائياً عند الضغط على 'إكمال الأمر' في صفحة تفاصيل الأمر."
                : "Production order closure occurs automatically when clicking 'Complete Order' in the order detail page."}
            </p>
            <Button className="gap-2 bg-red-600 hover:bg-red-700" onClick={() => router.push("/manufacturing/production-orders")}>
              <XSquare className="h-4 w-4" />
              {copy.goToOrders}
              {lang === "ar" ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
            </Button>
          </Card>
        </main>
      </div>
    </PageGuard>
  )
}
