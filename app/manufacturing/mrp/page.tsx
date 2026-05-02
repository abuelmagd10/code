"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { BarChart3, Package, ArrowLeft, ArrowRight, BookOpen, Info, AlertCircle } from "lucide-react"
import { PageGuard } from "@/components/page-guard"
import { CompanyHeader } from "@/components/company-header"
import { ManufacturingGuide } from "@/components/manufacturing/manufacturing-guide"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { MRP_COPY, readAppLanguage, getTextDirection, type AppLang } from "@/lib/manufacturing/manufacturing-ui"

export default function MrpPage() {
  const router = useRouter()
  const [lang, setLang] = useState<AppLang>("ar")

  useEffect(() => {
    const handler = () => setLang(readAppLanguage())
    handler()
    window.addEventListener("app_language_changed", handler)
    window.addEventListener("storage", (e) => { if (e.key === "app_language") handler() })
    return () => window.removeEventListener("app_language_changed", handler)
  }, [])

  const copy = MRP_COPY[lang].page

  return (
    <PageGuard resource="manufacturing_boms">
      <div dir={getTextDirection(lang)} className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">
          <CompanyHeader />

          <ManufacturingGuide
            currentStep="production_order"
            lang={lang}
            pageInfo={{
              titleAr: "تخطيط متطلبات المواد (MRP)",
              titleEn: "Material Requirements Planning (MRP)",
              descAr: "MRP يحسب المواد الخام المطلوبة لتلبية طلبات الإنتاج. يمنعك من توقف الإنتاج بسبب نقص المواد.",
              descEn: "MRP calculates raw materials needed to fulfill production demand. Prevents stoppages due to material shortages.",
              whenAr: "شغّل MRP قبل إصدار أوامر إنتاج كبيرة للتأكد من توفر المواد.",
              whenEn: "Run MRP before releasing large production orders to verify material availability.",
              nextStepId: "production_order",
            }}
          />

          {/* Header card */}
          <Card className="p-5 sm:p-6 dark:bg-slate-900 dark:border-slate-800">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl">
                <BarChart3 className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{copy.title}</h1>
                  <Badge variant="outline" className="text-indigo-700 border-indigo-300 bg-indigo-50">{copy.pill}</Badge>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{copy.description}</p>
              </div>
            </div>
          </Card>

          {/* What is MRP */}
          <Card className="p-5 sm:p-6 dark:bg-slate-900 dark:border-slate-800 space-y-3">
            <div className="flex items-center gap-2">
              <Info className="h-5 w-5 text-blue-500" />
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">{copy.whatTitle}</h2>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{copy.whatDesc}</p>
          </Card>

          {/* When to use */}
          <Card className="p-5 sm:p-6 dark:bg-slate-900 dark:border-slate-800 space-y-3">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-amber-500" />
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">{copy.whenTitle}</h2>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{copy.whenDesc}</p>
          </Card>

          {/* MRP Flow illustration */}
          <Card className="p-5 sm:p-6 dark:bg-slate-900 dark:border-slate-800">
            <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-4">
              {lang === "ar" ? "دورة عمل MRP" : "MRP Flow"}
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {[
                { icon: "📋", labelAr: "أوامر المبيعات", labelEn: "Sales Orders" },
                { icon: "➡️", labelAr: "", labelEn: "" },
                { icon: "📊", labelAr: "MRP", labelEn: "MRP" },
                { icon: "➡️", labelAr: "", labelEn: "" },
                { icon: "🏭", labelAr: "أوامر الإنتاج", labelEn: "Prod. Orders" },
                { icon: "➡️", labelAr: "", labelEn: "" },
                { icon: "🛒", labelAr: "طلبات الشراء", labelEn: "Purchase Requests" },
              ].map((item, idx) =>
                item.labelAr === "" ? (
                  <span key={idx} className="text-slate-400">{item.icon}</span>
                ) : (
                  <div key={idx} className="flex items-center gap-1 px-3 py-1.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                    <span>{item.icon}</span>
                    <span className="text-slate-700 dark:text-slate-300">
                      {lang === "ar" ? item.labelAr : item.labelEn}
                    </span>
                  </div>
                )
              )}
            </div>
          </Card>

          {/* Coming soon */}
          <Card className="p-5 sm:p-6 dark:bg-slate-900 dark:border-slate-800 border-dashed border-2 border-amber-300 dark:border-amber-700 space-y-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              <h2 className="text-base font-bold text-amber-800 dark:text-amber-300">{copy.comingSoon}</h2>
            </div>
            <p className="text-sm text-amber-700 dark:text-amber-400 leading-relaxed">{copy.comingSoonDesc}</p>
          </Card>

          {/* Next step actions */}
          <Card className="p-5 sm:p-6 dark:bg-slate-900 dark:border-slate-800 bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-950/20 dark:to-blue-950/20 border-indigo-200 dark:border-indigo-800">
            <p className="text-xs text-indigo-700 dark:text-indigo-400 mb-4">{copy.nextStepDesc}</p>
            <div className="flex flex-wrap gap-3">
              <Button
                className="gap-2"
                onClick={() => router.push("/manufacturing/production-orders")}
              >
                <Package className="h-4 w-4" />
                {copy.goToOrders}
                {lang === "ar" ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => router.push("/manufacturing/boms")}
              >
                {copy.goToBoms}
              </Button>
            </div>
          </Card>
        </main>
      </div>
    </PageGuard>
  )
}
