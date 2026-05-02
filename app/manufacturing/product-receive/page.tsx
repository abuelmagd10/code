"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { PackageCheck, Info, BookOpen, ArrowLeft, ArrowRight } from "lucide-react"
import { PageGuard } from "@/components/page-guard"
import { CompanyHeader } from "@/components/company-header"
import { ManufacturingGuide } from "@/components/manufacturing/manufacturing-guide"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { EXECUTION_COPY, readAppLanguage, getTextDirection, type AppLang } from "@/lib/manufacturing/manufacturing-ui"

export default function ProductReceivePage() {
  const router = useRouter()
  const [lang, setLang] = useState<AppLang>("ar")

  useEffect(() => {
    const handler = () => setLang(readAppLanguage())
    handler()
    window.addEventListener("app_language_changed", handler)
    window.addEventListener("storage", (e) => { if (e.key === "app_language") handler() })
    return () => window.removeEventListener("app_language_changed", handler)
  }, [])

  const copy = EXECUTION_COPY[lang].productReceive

  const steps = lang === "ar"
    ? [
        "افتح أمر الإنتاج من القائمة",
        "تأكد أن حالة الأمر 'قيد التنفيذ'",
        "تحقق من اكتمال جميع عمليات التصنيع",
        "اضغط 'إكمال الأمر'",
        "أدخل الكمية المصنّعة فعلياً",
        "سيضيف النظام المنتج النهائي لمستودع الاستلام",
      ]
    : [
        "Open the production order from the list",
        "Verify the order is in 'In Progress' status",
        "Confirm all manufacturing operations are complete",
        "Click 'Complete Order'",
        "Enter the actual manufactured quantity",
        "The system adds the finished product to the receipt warehouse",
      ]

  return (
    <PageGuard resource="manufacturing_boms">
      <div dir={getTextDirection(lang)} className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">
          <CompanyHeader />

          <ManufacturingGuide
            currentStep="product_receive"
            completedSteps={["products", "bom", "bom_version", "approve", "production_order", "material_issue"]}
            lang={lang}
            pageInfo={{
              titleAr: "استلام المنتج النهائي",
              titleEn: "Receive Finished Product",
              descAr: "بعد اكتمال التصنيع، أضف المنتج النهائي إلى مستودع الاستلام.",
              descEn: "After manufacturing is complete, add the finished product to the receipt warehouse.",
              whenAr: "تتم عند الضغط على 'إكمال الأمر' في صفحة تفاصيل أمر الإنتاج.",
              whenEn: "Occurs when clicking 'Complete Order' in the production order detail page.",
              nextStepId: "close",
            }}
          />

          <Card className="p-5 sm:p-6 dark:bg-slate-900 dark:border-slate-800">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl">
                <PackageCheck className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{copy.title}</h1>
                  <Badge variant="outline" className="text-emerald-700 border-emerald-300 bg-emerald-50">{copy.pill}</Badge>
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
            <ol className="space-y-2">
              {steps.map((step, idx) => (
                <li key={idx} className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-400">
                  <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                    {idx + 1}
                  </div>
                  <span className="pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </Card>

          <Card className="p-5 sm:p-6 dark:bg-slate-900 dark:border-slate-800 bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-950/20 dark:to-green-950/20 border-emerald-200 dark:border-emerald-800">
            <p className="text-xs text-emerald-700 dark:text-emerald-400 mb-4">
              {lang === "ar"
                ? "استلام المنتج النهائي يتم من داخل صفحة تفاصيل أمر الإنتاج عند إكمال الأمر."
                : "Product receive is done from within the production order detail page when completing the order."}
            </p>
            <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => router.push("/manufacturing/production-orders")}>
              <PackageCheck className="h-4 w-4" />
              {copy.goToOrders}
              {lang === "ar" ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
            </Button>
          </Card>
        </main>
      </div>
    </PageGuard>
  )
}
