"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp, CheckCircle2, Circle, ArrowLeft } from "lucide-react"

export type ManufacturingStep =
  | "products"
  | "bom"
  | "bom_version"
  | "approve"
  | "production_order"
  | "material_issue"
  | "product_receive"
  | "close"

interface StepDef {
  id: ManufacturingStep
  labelAr: string
  labelEn: string
  href: string
  tip?: string
}

const STEPS: StepDef[] = [
  { id: "products",          labelAr: "١. المنتجات",              labelEn: "1. Products",           href: "/products",                                  tip: "عرّف المنتج النهائي والمواد الخام" },
  { id: "bom",               labelAr: "٢. قائمة المواد",          labelEn: "2. Bill of Materials",  href: "/manufacturing/boms",                        tip: "حدد 'وصفة' تصنيع المنتج" },
  { id: "bom_version",       labelAr: "٣. إصدار القائمة",         labelEn: "3. BOM Version",        href: "/manufacturing/boms",                        tip: "أضف المكونات والكميات للإصدار" },
  { id: "approve",           labelAr: "٤. الاعتماد",              labelEn: "4. Approval",           href: "/manufacturing/boms",                        tip: "اعتمد الإصدار واجعله افتراضياً" },
  { id: "production_order",  labelAr: "٥. أمر الإنتاج",           labelEn: "5. Production Order",   href: "/manufacturing/production-orders",           tip: "أنشئ أمراً بالكمية المطلوبة وأصدره" },
  { id: "material_issue",    labelAr: "٦. صرف المواد",            labelEn: "6. Issue Materials",    href: "/manufacturing/production-orders",           tip: "اخصم المواد الخام من المخزن" },
  { id: "product_receive",   labelAr: "٧. استلام المنتج",         labelEn: "7. Receive Product",    href: "/manufacturing/production-orders",           tip: "أضف المنتج النهائي للمخزن" },
  { id: "close",             labelAr: "٨. إغلاق الأمر",           labelEn: "8. Close Order",        href: "/manufacturing/production-orders",           tip: "احسب التكلفة الفعلية وأغلق الأمر" },
]

interface ManufacturingGuideProps {
  currentStep: ManufacturingStep
  completedSteps?: ManufacturingStep[]
  lang?: "ar" | "en"
  /** Context card shown below the progress bar */
  pageInfo?: {
    titleAr: string
    titleEn: string
    descAr: string
    descEn: string
    whenAr: string
    whenEn: string
    nextStepId?: ManufacturingStep
  }
}

export function ManufacturingGuide({
  currentStep,
  completedSteps = [],
  lang = "ar",
  pageInfo,
}: ManufacturingGuideProps) {
  const [expanded, setExpanded] = useState(false)
  const isAr = lang !== "en"

  const nextStep = pageInfo?.nextStepId
    ? STEPS.find((s) => s.id === pageInfo.nextStepId)
    : null

  return (
    <div
      dir={isAr ? "rtl" : "ltr"}
      className="rounded-xl border border-cyan-200 bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-cyan-950/30 dark:to-blue-950/30 dark:border-cyan-800 shadow-sm overflow-hidden"
    >
      {/* Header row */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-cyan-800 dark:text-cyan-300 hover:bg-cyan-100/50 dark:hover:bg-cyan-900/20 transition-colors"
      >
        <span className="flex items-center gap-2 font-semibold text-sm">
          <span className="text-lg">🏭</span>
          {isAr ? "دورة التصنيع — أنت هنا" : "Manufacturing Cycle — You are here"}
        </span>
        {expanded ? (
          <ChevronUp className="h-4 w-4 flex-shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 flex-shrink-0" />
        )}
      </button>

      {/* Always-visible compact progress bar */}
      <div className="px-4 pb-3">
        <div className="flex items-center gap-1 flex-wrap">
          {STEPS.map((step, idx) => {
            const isDone = completedSteps.includes(step.id)
            const isCurrent = step.id === currentStep
            return (
              <div key={step.id} className="flex items-center gap-1">
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium transition-all ${
                    isCurrent
                      ? "bg-cyan-600 text-white shadow"
                      : isDone
                      ? "bg-emerald-500 text-white"
                      : "bg-white/70 text-gray-500 dark:bg-slate-800 dark:text-gray-400"
                  }`}
                >
                  {isAr ? step.labelAr : step.labelEn}
                </span>
                {idx < STEPS.length - 1 && (
                  <ArrowLeft className="h-3 w-3 text-gray-300 dark:text-gray-600 rotate-180" />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-cyan-200 dark:border-cyan-800 px-4 py-4 space-y-4">
          {/* Page info card */}
          {pageInfo && (
            <div className="bg-white dark:bg-slate-900 rounded-lg border border-cyan-100 dark:border-slate-700 p-4 space-y-3">
              <h3 className="font-bold text-cyan-800 dark:text-cyan-300 text-base">
                {isAr ? pageInfo.titleAr : pageInfo.titleEn}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {isAr ? pageInfo.descAr : pageInfo.descEn}
              </p>
              <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
                <span className="text-lg">💡</span>
                <div>
                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-1">
                    {isAr ? "متى تستخدم هذه الصفحة؟" : "When to use this page?"}
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    {isAr ? pageInfo.whenAr : pageInfo.whenEn}
                  </p>
                </div>
              </div>
              {nextStep && (
                <div className="flex items-center gap-2 text-sm text-cyan-700 dark:text-cyan-400 font-medium">
                  <ArrowLeft className="h-4 w-4 rotate-180" />
                  {isAr ? `الخطوة التالية: ${nextStep.labelAr}` : `Next Step: ${nextStep.labelEn}`}
                </div>
              )}
            </div>
          )}

          {/* All steps list */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {STEPS.map((step) => {
              const isDone = completedSteps.includes(step.id)
              const isCurrent = step.id === currentStep
              return (
                <div
                  key={step.id}
                  className={`rounded-lg p-2.5 text-xs space-y-1 border ${
                    isCurrent
                      ? "border-cyan-500 bg-cyan-50 dark:bg-cyan-950/50"
                      : isDone
                      ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30"
                      : "border-gray-200 bg-white/50 dark:border-slate-700 dark:bg-slate-900/50"
                  }`}
                >
                  <div className="flex items-center gap-1">
                    {isDone ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                    ) : isCurrent ? (
                      <span className="h-3.5 w-3.5 rounded-full border-2 border-cyan-500 flex-shrink-0 animate-pulse" />
                    ) : (
                      <Circle className="h-3.5 w-3.5 text-gray-300 flex-shrink-0" />
                    )}
                    <span
                      className={`font-semibold ${
                        isCurrent
                          ? "text-cyan-700 dark:text-cyan-300"
                          : isDone
                          ? "text-emerald-700 dark:text-emerald-300"
                          : "text-gray-500 dark:text-gray-400"
                      }`}
                    >
                      {isAr ? step.labelAr : step.labelEn}
                    </span>
                  </div>
                  {step.tip && (
                    <p className="text-gray-400 dark:text-gray-500 leading-tight">
                      {step.tip}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
