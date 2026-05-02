"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Cpu, ArrowLeft, GitMerge, Factory, Info, BookOpen, ArrowRight } from "lucide-react"
import { PageGuard } from "@/components/page-guard"
import { CompanyHeader } from "@/components/company-header"
import { ManufacturingGuide } from "@/components/manufacturing/manufacturing-guide"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { WORK_CENTER_COPY, readAppLanguage, getTextDirection, type AppLang } from "@/lib/manufacturing/manufacturing-ui"

export default function WorkCentersPage() {
  const router = useRouter()
  const [lang, setLang] = useState<AppLang>("ar")

  useEffect(() => {
    const handler = () => setLang(readAppLanguage())
    handler()
    window.addEventListener("app_language_changed", handler)
    window.addEventListener("storage", (e) => { if (e.key === "app_language") handler() })
    return () => window.removeEventListener("app_language_changed", handler)
  }, [])

  const copy = WORK_CENTER_COPY[lang].page

  return (
    <PageGuard resource="manufacturing_boms">
      <div dir={getTextDirection(lang)} className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">
          <CompanyHeader />

          <ManufacturingGuide
            currentStep="bom"
            lang={lang}
            pageInfo={{
              titleAr: "مراكز العمل — آلات وأقسام الإنتاج",
              titleEn: "Work Centers — Production Machines & Departments",
              descAr: "مراكز العمل هي الآلات أو الأقسام التي تُنجز فيها عمليات التصنيع. عرّفها قبل إنشاء مسارات التصنيع.",
              descEn: "Work centers are the machines or departments where manufacturing operations take place. Define them before creating routings.",
              whenAr: "عرّف مراكز العمل قبل إنشاء مسارات التصنيع حتى تتمكن من ربط كل عملية بمركزها.",
              whenEn: "Define work centers before creating routings so you can assign each operation to its work center.",
              nextStepId: "bom",
            }}
          />

          {/* Header card */}
          <Card className="p-5 sm:p-6 dark:bg-slate-900 dark:border-slate-800">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-cyan-100 dark:bg-cyan-900/30 rounded-xl">
                <Cpu className="h-7 w-7 text-cyan-600 dark:text-cyan-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{copy.title}</h1>
                  <Badge variant="outline" className="text-cyan-700 border-cyan-300 bg-cyan-50">{copy.pill}</Badge>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{copy.description}</p>
              </div>
            </div>
          </Card>

          {/* What is a work center? */}
          <Card className="p-5 sm:p-6 dark:bg-slate-900 dark:border-slate-800 space-y-3">
            <div className="flex items-center gap-2">
              <Info className="h-5 w-5 text-blue-500" />
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">{copy.whatTitle}</h2>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{copy.whatDesc}</p>
          </Card>

          {/* Examples */}
          <div className="space-y-3">
            <h2 className="text-base font-bold text-slate-700 dark:text-slate-200 px-1">{copy.examplesTitle}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {copy.examples.map((ex, idx) => (
                <Card key={idx} className="p-4 dark:bg-slate-900 dark:border-slate-800 flex items-start gap-3">
                  <span className="text-2xl">{ex.icon}</span>
                  <div>
                    <p className="font-semibold text-sm text-slate-800 dark:text-slate-100">{ex.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{ex.desc}</p>
                  </div>
                </Card>
              ))}
            </div>
          </div>

          {/* When to use */}
          <Card className="p-5 sm:p-6 dark:bg-slate-900 dark:border-slate-800 space-y-3">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-amber-500" />
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">{copy.whenTitle}</h2>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{copy.whenDesc}</p>
          </Card>

          {/* Relation to routings */}
          <Card className="p-5 sm:p-6 dark:bg-slate-900 dark:border-slate-800 space-y-3">
            <div className="flex items-center gap-2">
              <GitMerge className="h-5 w-5 text-indigo-500" />
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">{copy.relationTitle}</h2>
            </div>
            <div className="bg-indigo-50 dark:bg-indigo-950/30 rounded-lg p-4">
              <pre className="text-xs text-indigo-800 dark:text-indigo-300 whitespace-pre-wrap font-mono leading-relaxed">{copy.relationDesc}</pre>
            </div>
          </Card>

          {/* Coming soon banner */}
          <Card className="p-5 sm:p-6 dark:bg-slate-900 dark:border-slate-800 border-dashed border-2 border-amber-300 dark:border-amber-700 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🚧</span>
              <h2 className="text-base font-bold text-amber-800 dark:text-amber-300">{copy.comingSoon}</h2>
            </div>
            <p className="text-sm text-amber-700 dark:text-amber-400 leading-relaxed">{copy.comingSoonDesc}</p>
          </Card>

          {/* Next step */}
          <Card className="p-5 sm:p-6 dark:bg-slate-900 dark:border-slate-800 bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-cyan-950/20 dark:to-blue-950/20 border-cyan-200 dark:border-cyan-800">
            <h2 className="text-sm font-bold text-cyan-800 dark:text-cyan-300 mb-3">{copy.nextStepTitle}</h2>
            <p className="text-xs text-cyan-700 dark:text-cyan-400 mb-4">{copy.nextStepDesc}</p>
            <div className="flex flex-wrap gap-3">
              <Button
                className="gap-2"
                onClick={() => router.push("/manufacturing/routings")}
              >
                <GitMerge className="h-4 w-4" />
                {copy.goToRoutings}
                {lang === "ar" ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => router.push("/manufacturing/production-orders")}
              >
                <Factory className="h-4 w-4" />
                {copy.goToOrders}
              </Button>
            </div>
          </Card>
        </main>
      </div>
    </PageGuard>
  )
}
