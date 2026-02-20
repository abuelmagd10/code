"use client"

import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { BookOpen, CheckCircle2, Lightbulb, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { PageGuide } from "@/lib/page-guides"

// ─── Types ────────────────────────────────────────────────────────────────────

interface GuidePanelProps {
  isOpen: boolean
  onClose: () => void
  guide: PageGuide | null
  isLoading: boolean
  lang: "ar" | "en"
  showDontShowAgain: boolean
  isAlreadySeen: boolean
  onMarkSeen: () => void
}

// ─── Label maps ───────────────────────────────────────────────────────────────

const L = {
  ar: {
    loading: "جاري تحميل الدليل...",
    noGuide: "لا يوجد دليل لهذه الصفحة حالياً.",
    howToUse: "كيفية الاستخدام",
    tips: "نصائح مهمة",
    dontShow: "لا تُظهر مرة أخرى لهذه الصفحة",
    close: "إغلاق",
    aiGuide: "دليل المساعد الذكي",
  },
  en: {
    loading: "Loading guide...",
    noGuide: "No guide available for this page yet.",
    howToUse: "How to Use",
    tips: "Important Tips",
    dontShow: "Don't show again for this page",
    close: "Close",
    aiGuide: "AI Assistant Guide",
  },
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GuidePanel({
  isOpen,
  onClose,
  guide,
  isLoading,
  lang,
  showDontShowAgain,
  isAlreadySeen,
  onMarkSeen,
}: GuidePanelProps) {
  const t = L[lang]
  const dir = lang === "ar" ? "rtl" : "ltr"

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side={lang === "ar" ? "left" : "right"}
        className="w-full sm:max-w-md overflow-y-auto"
        dir={dir}
      >
        {/* Header */}
        <SheetHeader className="pb-4 border-b border-gray-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex-shrink-0">
              <BookOpen className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-0.5">
                {t.aiGuide}
              </p>
              <SheetTitle className="text-base leading-tight">
                {isLoading ? (
                  <Skeleton className="h-5 w-40" />
                ) : (
                  guide?.title ?? t.noGuide
                )}
              </SheetTitle>
            </div>
          </div>
          {guide?.description && !isLoading && (
            <SheetDescription className="text-sm text-gray-600 dark:text-gray-400 mt-2 leading-relaxed">
              {guide.description}
            </SheetDescription>
          )}
        </SheetHeader>

        {/* Body */}
        <div className="py-5 space-y-6">
          {isLoading ? (
            <LoadingSkeleton />
          ) : !guide ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
              {t.noGuide}
            </p>
          ) : (
            <>
              {/* Steps */}
              {guide.steps.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2 mb-3">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    {t.howToUse}
                  </h3>
                  <ol className="space-y-2.5">
                    {guide.steps.map((step, idx) => (
                      <li key={idx} className="flex gap-3 text-sm">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-bold flex items-center justify-center mt-0.5">
                          {idx + 1}
                        </span>
                        <span className="text-gray-700 dark:text-gray-300 leading-relaxed">
                          {step}
                        </span>
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              {/* Tips */}
              {guide.tips.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2 mb-3">
                    <Lightbulb className="h-4 w-4 text-amber-500" />
                    {t.tips}
                  </h3>
                  <ul className="space-y-2">
                    {guide.tips.map((tip, idx) => (
                      <li
                        key={idx}
                        className="flex gap-2.5 text-sm bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/40 rounded-lg px-3 py-2.5"
                      >
                        <span className="text-amber-500 flex-shrink-0 mt-0.5">•</span>
                        <span className="text-amber-800 dark:text-amber-200 leading-relaxed">
                          {tip}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 dark:border-slate-800 pt-4 space-y-3">
          {/* Don't show again — only for auto mode */}
          {showDontShowAgain && guide && (
            <label className="flex items-center gap-2.5 cursor-pointer">
              <Checkbox
                id="dont-show-again"
                checked={isAlreadySeen}
                onCheckedChange={(checked) => {
                  if (checked) onMarkSeen()
                }}
              />
              <span className="text-xs text-gray-500 dark:text-gray-400 select-none">
                {t.dontShow}
              </span>
            </label>
          )}
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2"
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5" />
            {t.close}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-4 w-28" />
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-6 w-6 rounded-full flex-shrink-0" />
            <Skeleton className="h-4 flex-1" />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-10 w-full rounded-lg" />
        ))}
      </div>
    </div>
  )
}
