"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Layers, ArrowLeft, ArrowRight, Info, BookOpen } from "lucide-react"
import { PageGuard } from "@/components/page-guard"
import { CompanyHeader } from "@/components/company-header"
import { ManufacturingGuide } from "@/components/manufacturing/manufacturing-guide"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { BOM_VERSIONS_COPY, readAppLanguage, getTextDirection, type AppLang } from "@/lib/manufacturing/manufacturing-ui"

export default function BomVersionsPage() {
  const router = useRouter()
  const [lang, setLang] = useState<AppLang>("ar")

  useEffect(() => {
    const handler = () => setLang(readAppLanguage())
    handler()
    window.addEventListener("app_language_changed", handler)
    window.addEventListener("storage", (e) => { if (e.key === "app_language") handler() })
    return () => window.removeEventListener("app_language_changed", handler)
  }, [])

  const copy = BOM_VERSIONS_COPY[lang].page

  return (
    <PageGuard resource="manufacturing_boms">
      <div dir={getTextDirection(lang)} className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">
          <CompanyHeader />

          <ManufacturingGuide
            currentStep="bom_version"
            lang={lang}
            pageInfo={{
              titleAr: "إصدارات قوائم المواد",
              titleEn: "BOM Versions",
              descAr: "كل قائمة مواد يمكن أن يكون لها عدة إصدارات. كل إصدار يحدد المكونات والكميات بشكل رسمي.",
              descEn: "Each BOM can have multiple versions. Each version officially defines the components and quantities.",
              whenAr: "أضف إصداراً جديداً عند تغيير وصفة الإنتاج. الإصدار القديم يبقى للمرجعية.",
              whenEn: "Add a new version when the production recipe changes. Old versions remain for reference.",
              nextStepId: "approve",
            }}
          />

          {/* Header */}
          <Card className="p-5 sm:p-6 dark:bg-slate-900 dark:border-slate-800">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl">
                <Layers className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
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

          {/* Info */}
          <Card className="p-5 sm:p-6 dark:bg-slate-900 dark:border-slate-800 space-y-3">
            <div className="flex items-center gap-2">
              <Info className="h-5 w-5 text-blue-500" />
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">{copy.infoTitle}</h2>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{copy.infoDesc}</p>
          </Card>

          {/* How to manage versions */}
          <Card className="p-5 sm:p-6 dark:bg-slate-900 dark:border-slate-800 space-y-3">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-amber-500" />
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">{copy.howToTitle}</h2>
            </div>
            <ol className="space-y-2">
              {copy.howToSteps.map((step, idx) => (
                <li key={idx} className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-400">
                  <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                    {idx + 1}
                  </div>
                  <span className="pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </Card>

          {/* Navigation to BOM page (since versions live inside BOM detail) */}
          <Card className="p-5 sm:p-6 dark:bg-slate-900 dark:border-slate-800 bg-gradient-to-r from-emerald-50 to-cyan-50 dark:from-emerald-950/20 dark:to-cyan-950/20 border-emerald-200 dark:border-emerald-800">
            <p className="text-xs text-emerald-700 dark:text-emerald-400 mb-4">
              {lang === "ar"
                ? "إصدارات قوائم المواد تُدار من داخل صفحة تفاصيل كل قائمة مواد."
                : "BOM versions are managed from within each BOM detail page."}
            </p>
            <Button className="gap-2" onClick={() => router.push("/manufacturing/boms")}>
              <Layers className="h-4 w-4" />
              {copy.goToBoms}
              {lang === "ar" ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
            </Button>
          </Card>
        </main>
      </div>
    </PageGuard>
  )
}
