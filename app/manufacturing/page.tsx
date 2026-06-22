"use client"

/**
 * v3.74.265 — Manufacturing Hub (landing page for the module).
 *
 * Before this page, opening /manufacturing 404'd and the user landed in
 * a sidebar of 8 acronymed links with no sense of order or prerequisite.
 *
 * This page lays out the manufacturing cycle in plain Arabic, grouped by
 * lifecycle phase (Setup → Plan → Execute), so a non-technical user can
 * see at a glance "where do I start?" and click straight to the right
 * step.
 *
 * Pure presentation — every link points to a page that already exists.
 * No backend changes.
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import { PageGuard } from "@/components/page-guard"
import { CompanyHeader } from "@/components/company-header"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Factory, Cpu, Layers, GitMerge, Calculator, ClipboardList,
  PackagePlus, PackageCheck, CheckSquare, Info, ArrowLeft, ArrowRight,
} from "lucide-react"
import {
  HUB_COPY, readAppLanguage, getTextDirection, type AppLang,
} from "@/lib/manufacturing/manufacturing-ui"

// Small lookup so the JSON copy can reference Lucide icons by name.
const ICON_MAP = {
  Cpu, Layers, GitMerge, Calculator, ClipboardList,
  PackagePlus, PackageCheck, CheckSquare,
} as const
type IconName = keyof typeof ICON_MAP

// Tailwind colour ramps per phase. Kept conservative so each step reads
// at a glance: indigo = setup, blue = plan, emerald = execute.
const COLOR_CLASSES: Record<string, {
  bg: string; ring: string; text: string; chip: string; badge: string; iconBg: string;
}> = {
  indigo: {
    bg: "bg-indigo-50 dark:bg-indigo-950/30",
    ring: "ring-indigo-200 dark:ring-indigo-900/50",
    text: "text-indigo-700 dark:text-indigo-300",
    chip: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
    badge: "bg-indigo-600",
    iconBg: "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400",
  },
  blue: {
    bg: "bg-blue-50 dark:bg-blue-950/30",
    ring: "ring-blue-200 dark:ring-blue-900/50",
    text: "text-blue-700 dark:text-blue-300",
    chip: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    badge: "bg-blue-600",
    iconBg: "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
  },
  emerald: {
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    ring: "ring-emerald-200 dark:ring-emerald-900/50",
    text: "text-emerald-700 dark:text-emerald-300",
    chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    badge: "bg-emerald-600",
    iconBg: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400",
  },
}

export default function ManufacturingHubPage() {
  const [lang, setLang] = useState<AppLang>("ar")
  useEffect(() => {
    const handler = () => setLang(readAppLanguage())
    handler()
    window.addEventListener("app_language_changed", handler)
    window.addEventListener("storage", (e) => { if (e.key === "app_language") handler() })
    return () => window.removeEventListener("app_language_changed", handler)
  }, [])

  const copy = HUB_COPY[lang]
  const dir = getTextDirection(lang)
  // Arrow that "points forward" in the active text direction.
  const ForwardArrow = lang === "ar" ? ArrowLeft : ArrowRight

  return (
    <PageGuard resource="manufacturing_boms">
      <div dir={dir} className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-6 overflow-x-hidden">
          <CompanyHeader />

          {/* Hero */}
          <Card className="p-6 sm:p-8 dark:bg-slate-900 dark:border-slate-800 border-0 shadow-sm bg-white">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-gradient-to-br from-violet-600 to-purple-700 rounded-xl shadow-lg shadow-violet-500/20">
                <Factory className="h-7 w-7 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100">
                  {copy.page.title}
                </h1>
                <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                  {copy.page.subtitle}
                </p>
              </div>
            </div>
          </Card>

          {/* Help strip */}
          <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40">
            <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <div className="font-semibold text-amber-900 dark:text-amber-200 mb-1">
                {copy.helpStripTitle}
              </div>
              <div className="text-amber-800 dark:text-amber-300 leading-relaxed">
                {copy.helpStripBody}
              </div>
            </div>
          </div>

          {/* Phases */}
          <div className="space-y-6">
            {copy.sections.map((section) => {
              const c = COLOR_CLASSES[section.color] || COLOR_CLASSES.indigo
              return (
                <Card key={section.key} className={`p-5 sm:p-6 dark:bg-slate-900 dark:border-slate-800 border-0 shadow-sm bg-white ring-1 ${c.ring}`}>
                  {/* Section header */}
                  <div className="flex items-start gap-4 mb-5">
                    <div className={`flex items-center justify-center w-10 h-10 rounded-full ${c.badge} text-white font-bold text-lg shadow flex-shrink-0`}>
                      {section.order}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className={`text-lg sm:text-xl font-bold ${c.text}`}>
                          {section.title}
                        </h2>
                        <Badge variant="outline" className={`text-xs ${c.chip} border-transparent`}>
                          {copy.page.stepLabel} {section.order}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                        {section.subtitle}
                      </p>
                    </div>
                  </div>

                  {/* Steps grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {section.items.map((item) => {
                      const Icon = ICON_MAP[item.icon as IconName] || Factory
                      const isPrimary = (item as any).primary === true
                      const isOptional = (item as any).optional === true
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`group block p-4 rounded-xl border-2 transition-all hover:shadow-md
                            ${isPrimary
                              ? `${c.bg} border-current ${c.text}`
                              : "bg-white dark:bg-slate-800/50 border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600"}`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`p-2 rounded-lg ${c.iconBg} flex-shrink-0`}>
                              <Icon className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                                  {item.title}
                                </h3>
                                {isOptional && (
                                  <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-slate-500 border-slate-300 dark:border-slate-600">
                                    {lang === 'en' ? 'Optional' : 'اختيارى'}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                                {item.desc}
                              </p>
                            </div>
                            <ForwardArrow className={`w-4 h-4 ${c.text} opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0`} />
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                </Card>
              )
            })}
          </div>
        </main>
      </div>
    </PageGuard>
  )
}
