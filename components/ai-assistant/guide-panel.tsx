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
import { BookOpen, CheckCircle2, Lightbulb, TrendingUp, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { AccountingPattern, PageGuide } from "@/lib/page-guides"

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
    accountingPattern: "النمط المحاسبي لهذه الصفحة",
    financialEvent: "الحدث المالي",
    journalEntry: "القيد المحاسبي",
    balanceImpact: "التأثير على الميزانية",
    debit: "مدين",
    credit: "دائن",
    assets: "الأصول",
    liabilities: "الخصوم",
    equity: "حقوق الملكية",
    pl: "الأرباح والخسائر",
    noEntries: "لا قيود محاسبية لهذه العملية",
  },
  en: {
    loading: "Loading guide...",
    noGuide: "No guide available for this page yet.",
    howToUse: "How to Use",
    tips: "Important Tips",
    dontShow: "Don't show again for this page",
    close: "Close",
    aiGuide: "AI Assistant Guide",
    accountingPattern: "Accounting Pattern for This Page",
    financialEvent: "Financial Event",
    journalEntry: "Journal Entry",
    balanceImpact: "Balance Sheet Impact",
    debit: "Dr",
    credit: "Cr",
    assets: "Assets",
    liabilities: "Liabilities",
    equity: "Equity",
    pl: "Profit & Loss",
    noEntries: "No accounting entries for this operation",
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

              {/* Accounting Pattern */}
              {guide.accounting_pattern && (
                <AccountingPatternSection pattern={guide.accounting_pattern} t={t} />
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

// ─── Accounting Pattern Section ───────────────────────────────────────────────

type Labels = typeof L["ar"]

interface AccountingPatternSectionProps {
  pattern: AccountingPattern
  t: Labels
}

function AccountingPatternSection({ pattern, t }: AccountingPatternSectionProps) {
  const impactRows: Array<{ key: keyof AccountingPattern["impact"]; label: string }> = [
    { key: "assets", label: t.assets },
    { key: "liabilities", label: t.liabilities },
    { key: "equity", label: t.equity },
    { key: "pl", label: t.pl },
  ]

  const isNoEntry =
    pattern.entries.length === 1 &&
    pattern.entries[0].side === "debit" &&
    (pattern.entries[0].account.startsWith("لا ") ||
      pattern.entries[0].account.toLowerCase().startsWith("no "))

  return (
    <section className="border-t border-purple-100 dark:border-purple-900/40 pt-5">
      <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2 mb-4">
        <TrendingUp className="h-4 w-4 text-purple-500" />
        {t.accountingPattern}
      </h3>

      {/* Financial Event callout */}
      <div className="rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800/40 px-3.5 py-3 mb-4">
        <p className="text-xs font-semibold text-purple-600 dark:text-purple-400 mb-1">
          {t.financialEvent}
        </p>
        <p className="text-sm text-purple-900 dark:text-purple-100 leading-relaxed">
          {pattern.event}
        </p>
      </div>

      {/* Journal Entry */}
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
        {t.journalEntry}
      </p>
      {isNoEntry ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 italic px-1 mb-4">
          {t.noEntries}
        </p>
      ) : (
        <div className="rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden mb-4">
          {pattern.entries.map((entry, idx) => (
            <div
              key={idx}
              className={`flex items-center gap-3 px-3 py-2 text-sm ${
                idx % 2 === 0
                  ? "bg-white dark:bg-slate-900"
                  : "bg-gray-50 dark:bg-slate-800/60"
              }`}
            >
              <span
                className={`flex-shrink-0 w-10 text-center text-xs font-bold rounded px-1.5 py-0.5 ${
                  entry.side === "debit"
                    ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
                    : "bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300"
                }`}
              >
                {entry.side === "debit" ? t.debit : t.credit}
              </span>
              <span className="text-gray-700 dark:text-gray-300 leading-snug">
                {entry.account}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Balance Sheet Impact */}
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
        {t.balanceImpact}
      </p>
      <dl className="space-y-1.5">
        {impactRows.map(({ key, label }) => {
          const value = pattern.impact[key]
          if (!value) return null
          return (
            <div key={key} className="flex gap-2 text-sm">
              <dt className="flex-shrink-0 w-28 text-gray-500 dark:text-gray-400 font-medium">
                {label}
              </dt>
              <dd className="text-gray-700 dark:text-gray-300 leading-snug">{value}</dd>
            </div>
          )
        })}
      </dl>
    </section>
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
      <div className="space-y-2 pt-4 border-t border-purple-100 dark:border-purple-900/40">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-4 w-28 mt-2" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-8 w-full rounded" />
        ))}
      </div>
    </div>
  )
}
