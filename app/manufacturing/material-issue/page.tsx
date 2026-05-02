"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { PackagePlus, Info, BookOpen, ArrowLeft, ArrowRight, CheckCircle } from "lucide-react"
import { PageGuard } from "@/components/page-guard"
import { CompanyHeader } from "@/components/company-header"
import { ManufacturingGuide } from "@/components/manufacturing/manufacturing-guide"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { EXECUTION_COPY, readAppLanguage, getTextDirection, type AppLang } from "@/lib/manufacturing/manufacturing-ui"

export default function MaterialIssuePage() {
  const router = useRouter()
  const [lang, setLang] = useState<AppLang>("ar")

  useEffect(() => {
    const handler = () => setLang(readAppLanguage())
    handler()
    window.addEventListener("app_language_changed", handler)
    window.addEventListener("storage", (e) => { if (e.key === "app_language") handler() })
    return () => window.removeEventListener("app_language_changed", handler)
  }, [])

  const copy = EXECUTION_COPY[lang].materialIssue

  const steps = lang === "ar"
    ? [
        "افتح أمر الإنتاج من القائمة",
        "تحقق من أن الأمر في حالة 'مسودة' أو 'جاهز للتنفيذ'",
        "تحقق من توفر المواد الخام في مستودع الصرف",
        "اضغط 'إصدار الأمر' لبدء عملية الصرف",
        "سيخصم النظام المواد تلقائياً وفق قائمة المواد المعتمدة",
      ]
    : [
        "Open the production order from the list",
        "Verify the order is in 'Draft' or 'Ready' status",
        "Confirm raw materials are available in the issue warehouse",
        "Click 'Release Order' to trigger material issue",
        "The system automatically deducts materials per the approved BOM",
      ]

  return (
    <PageGuard resource="manufacturing_boms">
      <div dir={getTextDirection(lang)} className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">
          <CompanyHeader />

          <ManufacturingGuide
            currentStep="material_issue"
            completedSteps={["products", "bom", "bom_version", "approve", "production_order"]}
            lang={lang}
            pageInfo={{
              titleAr: "صرف المواد الخام",
              titleEn: "Issue Raw Materials",
              descAr: "بعد إصدار أمر الإنتاج، يخصم النظام المواد الخام من مستودع الصرف لتغذية خط الإنتاج.",
              descEn: "After releasing the production order, the system deducts raw materials from the issue warehouse to feed production.",
              whenAr: "تحدث تلقائياً عند إصدار أمر الإنتاج. لا تحتاج لإجراء يدوي منفصل.",
              whenEn: "Happens automatically when releasing the production order. No separate manual action needed.",
              nextStepId: "product_receive",
            }}
          />

          {/* Header */}
          <Card className="p-5 sm:p-6 dark:bg-slate-900 dark:border-slate-800">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-xl">
                <PackagePlus className="h-7 w-7 text-orange-600 dark:text-orange-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{copy.title}</h1>
                  <Badge variant="outline" className="text-orange-700 border-orange-300 bg-orange-50">{copy.pill}</Badge>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{copy.description}</p>
              </div>
            </div>
          </Card>

          {/* What is */}
          <Card className="p-5 sm:p-6 dark:bg-slate-900 dark:border-slate-800 space-y-3">
            <div className="flex items-center gap-2">
              <Info className="h-5 w-5 text-blue-500" />
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">{copy.whatTitle}</h2>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{copy.whatDesc}</p>
          </Card>

          {/* How to */}
          <Card className="p-5 sm:p-6 dark:bg-slate-900 dark:border-slate-800 space-y-3">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-amber-500" />
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">{copy.howToTitle}</h2>
            </div>
            <ol className="space-y-2">
              {steps.map((step, idx) => (
                <li key={idx} className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-400">
                  <div className="w-6 h-6 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0 text-xs font-bold text-orange-700 dark:text-orange-400">
                    {idx + 1}
                  </div>
                  <span className="pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </Card>

          {/* Navigate to production orders */}
          <Card className="p-5 sm:p-6 dark:bg-slate-900 dark:border-slate-800 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/20 dark:to-amber-950/20 border-orange-200 dark:border-orange-800">
            <p className="text-xs text-orange-700 dark:text-orange-400 mb-4">
              {lang === "ar"
                ? "عملية صرف المواد تتم من داخل صفحة تفاصيل أمر الإنتاج."
                : "Material issue is performed from within the production order detail page."}
            </p>
            <Button className="gap-2 bg-orange-600 hover:bg-orange-700" onClick={() => router.push("/manufacturing/production-orders")}>
              <CheckCircle className="h-4 w-4" />
              {copy.goToOrders}
              {lang === "ar" ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
            </Button>
          </Card>
        </main>
      </div>
    </PageGuard>
  )
}
