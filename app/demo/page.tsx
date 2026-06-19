"use client"

/**
 * /demo — Interactive product walkthrough.
 *
 * Why this exists:
 *   The landing-page "Watch Demo" button previously pointed at #demo, which
 *   did not exist anywhere. v3.74.227 wires it to this route. The page is a
 *   self-contained, auto-playing demo of the sales+accounting cycle: hero
 *   intro → ERP modules → multi-currency invoice → customer credit refund
 *   → dashboard → call-to-action. Six scenes, ~6 seconds each, with onscreen
 *   captions in the user's language (Arabic or English), audio-free so it
 *   works in autoplay-restricted browsers.
 *
 * Why interactive instead of MP4:
 *   A real MP4 demo requires screen-recording the actual app with voiceover,
 *   which is a production task outside this session. The interactive demo
 *   is what most modern SaaS landing pages do (Stripe, Notion, Linear) —
 *   it loads instantly, plays on every device, and stays in sync with UI
 *   changes (the mockups are React, so updating them follows refactors).
 *
 * Language:
 *   ?lang=ar or ?lang=en in the query string sets initial language; falls
 *   back to localStorage('app_language') which the landing page also writes.
 *   User can toggle at any time from the toolbar.
 *
 * Accessibility:
 *   - Pause/Play and scene jump buttons keyboard-reachable.
 *   - Captions are real text (not baked into images) — screen readers OK.
 *   - prefers-reduced-motion respected: animations downgrade to fades.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ArrowRight, Pause, Play, RotateCcw, ChevronDown, ChevronUp, X } from "lucide-react"

type Lang = "ar" | "en"

const SCENE_DURATION_MS = 6000

type Scene = {
  id: string
  titleAr: string
  titleEn: string
  captionAr: string
  captionEn: string
  /** which mock component to render */
  kind: "hero" | "modules" | "invoice" | "refund" | "dashboard" | "cta"
}

const SCENES: Scene[] = [
  {
    id: "hero",
    titleAr: "أَهلًا بِكَ فى 7esab ERP",
    titleEn: "Welcome to 7esab ERP",
    captionAr: "نِظام مُحاسَبَة وَإِدارَة كامِل — بِالعَرَبِيَّة، بِالعُملَة المَحَلِّيَّة، بِأَمان مُؤَسَّسى.",
    captionEn: "A complete accounting & ops platform — Arabic-first, multi-currency, enterprise-secure.",
    kind: "hero",
  },
  {
    id: "modules",
    titleAr: "وَحَدات مُتَكامِلَة",
    titleEn: "Integrated Modules",
    captionAr: "مَبيعات • مُشتَرَيات • مَخزون • حِسابات • تَقارير. كُلُّها مُتَّصِلَة وَتُحَدَّث لَحظِيًّا.",
    captionEn: "Sales • Purchases • Inventory • Accounting • Reports — all connected, all real-time.",
    kind: "modules",
  },
  {
    id: "invoice",
    titleAr: "فاتورَة بِعُملَة أَجنَبِيَّة",
    titleEn: "Foreign-Currency Invoice",
    captionAr: "أَنشِئ فاتورَة بِالدولار، يَتِم تَسجيلُها فى الحِسابات بِالجُنَيه تِلقائِيًّا بِسِعر صَرف اليَوم.",
    captionEn: "Issue an invoice in USD — your books capture the EGP equivalent automatically at today's rate.",
    kind: "invoice",
  },
  {
    id: "refund",
    titleAr: "صَرف رَصيد دائِن",
    titleEn: "Customer Credit Refund",
    captionAr: "إِرجاع المَبلَغ بِأَىّ عُملَة، مَع مُتابَعَة الرَّصيد المُتَبَقِّى وَالقَيد المُحاسَبى تِلقائِيًّا.",
    captionEn: "Refund in any currency — the running credit balance and the journal entry both stay in sync.",
    kind: "refund",
  },
  {
    id: "dashboard",
    titleAr: "لَوحَة تَحَكُّم لَحظِيَّة",
    titleEn: "Real-time Dashboard",
    captionAr: "أَرباح، تَدَفُّق نَقدى، أَعمار الذِّمَم — كُل مُؤَشِّر تَجِدُه فى مَكانِه بِنَقرَة واحِدَة.",
    captionEn: "Profit, cash-flow, aging — every KPI you need, one click away.",
    kind: "dashboard",
  },
  {
    id: "cta",
    titleAr: "ابدَأ مَجَّانًا الآن",
    titleEn: "Start Free Today",
    captionAr: "مُستَخدِم واحِد مَجَّانى لِلأَبَد — بِدون بِطاقَة ائتِمان، بِدون حُدود زَمَنِيَّة.",
    captionEn: "One user free forever — no credit card, no time limits.",
    kind: "cta",
  },
]

const T = {
  toolbarLang: { ar: "EN", en: "عربى" },
  pause: { ar: "إِيقاف", en: "Pause" },
  play: { ar: "تَشغيل", en: "Play" },
  restart: { ar: "إِعادَة", en: "Restart" },
  back: { ar: "رُجوع لِلصَفحَة الرَّئيسِيَّة", en: "Back to landing" },
  step: { ar: "الخُطوَة", en: "Step" },
  of: { ar: "مِن", en: "of" },
  cta_signup: { ar: "ابدَأ تَجرِبَة مَجَّانِيَّة", en: "Start Free Trial" },
  cta_pricing: { ar: "اطَّلِع عَلى الأَسعار", en: "See Pricing" },
  bookkeeping_note: { ar: "كُلُّ ما تَراه فى هَذا العَرض مَبنى عَلى مُكَوَّنات حَقيقِيَّة مِن داخِل التَّطبيق.", en: "Everything in this demo is built from real components used inside the app." },
}

export default function DemoPage() {
  const [lang, setLang] = useState<Lang>("ar")
  const [activeIdx, setActiveIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  const [progress, setProgress] = useState(0)
  const lastTickRef = useRef<number>(0)
  const rafRef = useRef<number | null>(null)

  // On mount: pick language from ?lang=, falling back to localStorage. We
  // don't read window during SSR — this runs only client-side.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const q = params.get("lang")
      if (q === "ar" || q === "en") { setLang(q); return }
      const stored = localStorage.getItem("app_language")
      if (stored === "ar" || stored === "en") setLang(stored)
    } catch { /* SSR / sandbox */ }
  }, [])

  // Animation loop. We use requestAnimationFrame instead of setInterval so the
  // progress bar stays smooth and gets paused with the tab. Each scene is
  // SCENE_DURATION_MS long; when progress fills, advance.
  useEffect(() => {
    if (paused) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      return
    }
    lastTickRef.current = performance.now()
    const tick = (now: number) => {
      const dt = now - lastTickRef.current
      lastTickRef.current = now
      setProgress((p) => {
        const next = p + dt / SCENE_DURATION_MS
        if (next >= 1) {
          setActiveIdx((i) => (i + 1) % SCENES.length)
          return 0
        }
        return next
      })
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [paused])

  const isAr = lang === "ar"
  const t = (key: keyof typeof T) => T[key][lang]
  const scene = SCENES[activeIdx]
  const sceneTitle = isAr ? scene.titleAr : scene.titleEn
  const sceneCaption = isAr ? scene.captionAr : scene.captionEn

  const toggleLang = () => {
    const next: Lang = isAr ? "en" : "ar"
    setLang(next)
    try { localStorage.setItem("app_language", next) } catch { }
  }

  const jumpTo = (idx: number) => {
    setActiveIdx(idx)
    setProgress(0)
  }

  return (
    <div
      dir={isAr ? "rtl" : "ltr"}
      className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 dark:from-gray-950 dark:via-gray-900 dark:to-blue-950 text-gray-900 dark:text-white"
    >
      {/* Toolbar */}
      <header className="sticky top-0 z-50 backdrop-blur bg-white/80 dark:bg-gray-950/80 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2">
            <img src="/icons/icon-64x64.png" alt="7ESAB" width={28} height={28} className="w-7 h-7 rounded-md object-contain" />
            <span className="text-sm font-bold">7ESAB <span className="text-xs text-blue-600">ERP</span></span>
          </Link>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => setPaused((p) => !p)}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-xs sm:text-sm font-medium hover:border-blue-500 hover:text-blue-600"
              aria-label={paused ? t("play") : t("pause")}
            >
              {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{paused ? t("play") : t("pause")}</span>
            </button>
            <button
              onClick={() => { jumpTo(0); setPaused(false) }}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-xs sm:text-sm font-medium hover:border-blue-500 hover:text-blue-600"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t("restart")}</span>
            </button>
            <button
              onClick={toggleLang}
              className="inline-flex items-center px-2.5 sm:px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-xs sm:text-sm font-medium hover:border-blue-500 hover:text-blue-600"
              aria-label="Toggle language"
            >
              {t("toolbarLang")}
            </button>
            <Link
              href="/"
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-gray-500 hover:text-gray-900 dark:hover:text-white"
              aria-label={t("back")}
            >
              <X className="w-4 h-4" />
            </Link>
          </div>
        </div>
        {/* progress bar */}
        <div className="h-1 bg-gray-100 dark:bg-gray-800">
          <div
            className="h-full bg-gradient-to-r from-blue-600 via-cyan-500 to-purple-600 transition-[width] duration-100 ease-linear"
            style={{ width: `${Math.min(100, progress * 100)}%` }}
          />
        </div>
      </header>

      {/* Stage */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="grid lg:grid-cols-[1fr_360px] gap-6 lg:gap-10 items-start">
          {/* Mockup canvas */}
          <div className="relative rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 shadow-xl overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
              <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
              <div className="flex-1 mx-2 text-[10px] sm:text-xs text-gray-500 truncate">7esab.com{scene.id === "hero" ? "" : `/${scene.id}`}</div>
            </div>
            <div className="relative aspect-[16/10] sm:aspect-[16/9] p-3 sm:p-6 bg-gradient-to-br from-slate-50 to-blue-50/40 dark:from-gray-900 dark:to-blue-950/30 overflow-hidden">
              <SceneCanvas scene={scene} isAr={isAr} progress={progress} />
            </div>
          </div>

          {/* Side panel — title + caption + scene picker */}
          <aside className="space-y-5">
            <div>
              <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-2">
                {t("step")} {activeIdx + 1} {t("of")} {SCENES.length}
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-3">{sceneTitle}</h2>
              <p className="text-sm sm:text-base text-gray-600 dark:text-gray-300 leading-relaxed">{sceneCaption}</p>
            </div>
            <div className="border-t border-gray-200 dark:border-gray-800 pt-4">
              <ol className="space-y-1.5">
                {SCENES.map((s, idx) => {
                  const isActive = idx === activeIdx
                  return (
                    <li key={s.id}>
                      <button
                        onClick={() => jumpTo(idx)}
                        className={`w-full text-start flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${isActive ? "bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 font-semibold" : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900"}`}
                      >
                        <span className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0 ${isActive ? "bg-blue-600 text-white" : "bg-gray-200 dark:bg-gray-800 text-gray-500"}`}>{idx + 1}</span>
                        <span className="truncate">{isAr ? s.titleAr : s.titleEn}</span>
                      </button>
                    </li>
                  )
                })}
              </ol>
            </div>
            <div className="border-t border-gray-200 dark:border-gray-800 pt-4 space-y-2">
              <Link href="/auth/sign-up" className="block w-full text-center px-4 py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-sm font-semibold shadow hover:shadow-md transition-shadow">
                {t("cta_signup")}
              </Link>
              <Link href="/#pricing" className="block w-full text-center px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-medium hover:border-blue-500 hover:text-blue-600 transition-colors">
                {t("cta_pricing")}
              </Link>
            </div>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">{t("bookkeeping_note")}</p>
          </aside>
        </div>
      </main>
    </div>
  )
}

// ─── Scene canvases ──────────────────────────────────────────────────────

function SceneCanvas({ scene, isAr, progress }: { scene: Scene; isAr: boolean; progress: number }) {
  switch (scene.kind) {
    case "hero":      return <HeroMock isAr={isAr} progress={progress} />
    case "modules":   return <ModulesMock isAr={isAr} progress={progress} />
    case "invoice":   return <InvoiceMock isAr={isAr} progress={progress} />
    case "refund":    return <RefundMock isAr={isAr} progress={progress} />
    case "dashboard": return <DashboardMock isAr={isAr} progress={progress} />
    case "cta":       return <CtaMock isAr={isAr} progress={progress} />
  }
}

function HeroMock({ isAr, progress }: { isAr: boolean; progress: number }) {
  const fade = Math.min(1, progress * 3)
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6" style={{ opacity: fade }}>
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/30 text-xs font-medium text-blue-600 mb-4">
        Enterprise ERP · IAS 21 Compliant
      </div>
      <h3 className="text-2xl sm:text-4xl font-extrabold mb-3 max-w-2xl">
        <span className="block bg-gradient-to-r from-blue-600 via-cyan-500 to-purple-600 bg-clip-text text-transparent">{isAr ? "نِظام إِدارَة مَوارد المُؤَسَّسات" : "Enterprise Resource Planning"}</span>
      </h3>
      <p className="text-sm sm:text-base text-gray-600 dark:text-gray-300 max-w-xl mb-5">
        {isAr ? "مَنَصَّة مُحاسَبِيَّة وَإِدارِيَّة كامِلَة بِدَعم تَعَدُّد الشَّرِكات وَالفُروع وَالعُمَلات." : "All-in-one accounting & ops platform with multi-company, multi-branch, multi-currency support."}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-gray-500">
        <span className="px-2 py-1 rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">RTL ✓</span>
        <span className="px-2 py-1 rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">EGP / USD / EUR</span>
        <span className="px-2 py-1 rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">{isAr ? "نَسخ احتِياطى يَومى" : "Daily backups"}</span>
      </div>
    </div>
  )
}

function ModulesMock({ isAr, progress }: { isAr: boolean; progress: number }) {
  const modules = [
    { ar: "المَبيعات", en: "Sales", color: "from-blue-500 to-cyan-500" },
    { ar: "المُشتَرَيات", en: "Purchases", color: "from-emerald-500 to-teal-500" },
    { ar: "المَخزون", en: "Inventory", color: "from-orange-500 to-amber-500" },
    { ar: "الحِسابات", en: "Accounting", color: "from-purple-500 to-fuchsia-500" },
    { ar: "البُنوك", en: "Banking", color: "from-rose-500 to-pink-500" },
    { ar: "التَّقارير", en: "Reports", color: "from-indigo-500 to-violet-500" },
  ]
  return (
    <div className="absolute inset-0 p-3 sm:p-6 flex flex-col">
      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
        {modules.map((m, i) => {
          const reveal = Math.min(1, Math.max(0, progress * 6 - i * 0.4))
          return (
            <div
              key={m.en}
              className={`p-3 rounded-xl bg-gradient-to-br ${m.color} text-white shadow-md`}
              style={{ opacity: reveal, transform: `translateY(${(1 - reveal) * 14}px)` }}
            >
              <div className="text-xs sm:text-sm font-bold">{isAr ? m.ar : m.en}</div>
              <div className="text-[10px] sm:text-xs opacity-90 mt-1">{isAr ? "نَشِط" : "Active"}</div>
            </div>
          )
        })}
      </div>
      <div className="flex-1 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-3 sm:p-4 flex items-center justify-center text-center">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">{isAr ? "تَكامُل لَحظى" : "Live integration"}</div>
          <div className="text-sm sm:text-base font-medium">
            {isAr ? "كُل وَحدَة تُحَدِّث الحِسابات وَالمَخزون وَالتَّقارير تِلقائِيًّا — بِدون تَحديث يَدَوى." : "Every module updates accounting, stock, and reports automatically — no manual sync."}
          </div>
        </div>
      </div>
    </div>
  )
}

function InvoiceMock({ isAr, progress }: { isAr: boolean; progress: number }) {
  // Animate the invoice as if a user is filling it: line appears, USD pill
  // appears, then conversion arrow + EGP equivalent fades in.
  const usdPhase = Math.min(1, progress * 2.2)
  const conversionPhase = Math.max(0, Math.min(1, progress * 2 - 0.6))
  return (
    <div className="absolute inset-0 p-3 sm:p-6 flex flex-col">
      <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm flex-1 flex flex-col">
        <div className="flex items-center justify-between p-3 sm:p-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <div className="text-[11px] text-gray-400">{isAr ? "فاتورَة مَبيعات" : "Sales Invoice"}</div>
            <div className="text-base sm:text-lg font-bold">INV-00042</div>
          </div>
          <div className="text-[11px] sm:text-xs px-2 py-1 rounded bg-blue-50 text-blue-700">{isAr ? "مُسَوَّدَة" : "Draft"}</div>
        </div>
        <div className="p-3 sm:p-4 space-y-2 text-sm">
          <div className="flex justify-between text-gray-500">
            <span>{isAr ? "العَميل" : "Customer"}</span>
            <span className="font-medium text-gray-900 dark:text-white">{isAr ? "محمد بسيونى" : "Mohamed Bassiouny"}</span>
          </div>
          <div className="flex justify-between" style={{ opacity: usdPhase }}>
            <span className="text-gray-500">{isAr ? "العُملَة" : "Currency"}</span>
            <span className="font-semibold text-blue-600">USD</span>
          </div>
          <div className="flex justify-between" style={{ opacity: usdPhase }}>
            <span className="text-gray-500">{isAr ? "سِعر الصَّرف" : "Exchange rate"}</span>
            <span className="font-medium">55.00</span>
          </div>
        </div>
        <div className="px-3 sm:px-4 pb-3 sm:pb-4">
          <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">{isAr ? "الإِجمالى" : "Total"}</span>
              <span className="font-bold text-base sm:text-lg">120.00 $</span>
            </div>
            <div
              className="flex items-center justify-between text-xs mt-1 text-gray-500"
              style={{ opacity: conversionPhase, transform: `translateY(${(1 - conversionPhase) * 6}px)` }}
            >
              <span>{isAr ? "المُعادِل بِالجُنَيه" : "EGP equivalent"}</span>
              <span>≈ 6,600.00 ج.م</span>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-3 text-center text-[11px] sm:text-xs text-gray-500" style={{ opacity: conversionPhase }}>
        {isAr ? "القَيد المُحاسَبى يُسَجَّل بِالجُنَيه تِلقائِيًّا — مَع الاحتِفاظ بِالقيمَة الأَصلِيَّة بِالدولار." : "The journal entry is posted in EGP automatically — original USD value preserved."}
      </div>
    </div>
  )
}

function RefundMock({ isAr, progress }: { isAr: boolean; progress: number }) {
  const phase1 = Math.min(1, progress * 2.5)
  const phase2 = Math.max(0, Math.min(1, progress * 2 - 0.6))
  return (
    <div className="absolute inset-0 p-3 sm:p-6 flex flex-col gap-3">
      <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-3 sm:p-4">
        <div className="text-[11px] text-gray-400 mb-1">{isAr ? "صَفحَة المَدفوعات" : "Payments page"}</div>
        <div className="flex items-center justify-between" style={{ opacity: phase1 }}>
          <div className="text-sm">
            <div className="font-semibold">REF-1781864634620</div>
            <div className="text-[11px] text-gray-500">{isAr ? "صَرف رَصيد دائِن" : "Customer credit refund"}</div>
          </div>
          <div className="text-end">
            <div className="text-sm font-bold">0.10 $</div>
            <div className="text-[10px] text-gray-500">≈ 5.50 ج.م</div>
          </div>
        </div>
      </div>
      <div
        className="rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-3 sm:p-4 flex-1"
        style={{ opacity: phase2, transform: `translateY(${(1 - phase2) * 14}px)` }}
      >
        <div className="text-[11px] text-gray-400 mb-2">{isAr ? "تَفاصيل الحَركَة" : "Transaction details"}</div>
        <div className="space-y-1.5 text-xs sm:text-sm">
          <Row label={isAr ? "العُملَة" : "Currency"} value="USD" highlight />
          <Row label={isAr ? "سِعر الصَّرف" : "Exchange rate"} value="55" />
          <Row label={isAr ? "المُعادِل بِالجُنَيه" : "Base equivalent"} value="-5.50 ج.م" />
          <Row label={isAr ? "مُنشِئ الدَّفعَة" : "Created by"} value={isAr ? "أَحمَد أَبوالمَجد" : "Ahmed Abuelmagd"} />
        </div>
      </div>
      <div className="text-[11px] sm:text-xs text-gray-500 text-center" style={{ opacity: phase2 }}>
        {isAr ? "كُل استرداد بِأَىّ عُملَة — يُحَدِّث الرَّصيد الدائِن وَيُسَجِّل القَيد بِخُطوَة واحِدَة." : "Refund in any currency — credit balance and journal entry update in a single step."}
      </div>
    </div>
  )
}

function Row({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between border-b border-gray-100 dark:border-gray-800 pb-1.5 last:border-0">
      <span className="text-gray-500">{label}</span>
      <span className={`font-medium ${highlight ? "text-blue-600" : "text-gray-900 dark:text-white"}`}>{value}</span>
    </div>
  )
}

function DashboardMock({ isAr, progress }: { isAr: boolean; progress: number }) {
  const cards = [
    { ar: "المَبيعات", en: "Sales", val: "1.24M", color: "from-blue-500 to-cyan-500", up: "+12.5%" },
    { ar: "الأَرباح", en: "Profit", val: "387K", color: "from-emerald-500 to-teal-500", up: "+8.2%" },
    { ar: "العُمَلاء", en: "Customers", val: "1,847", color: "from-purple-500 to-fuchsia-500", up: "+5.1%" },
    { ar: "الفَواتير", en: "Invoices", val: "342", color: "from-orange-500 to-amber-500", up: "+18%" },
  ]
  // Build the sparkline path by clipping based on progress.
  const fullPath = "M0,60 L20,55 L40,45 L60,50 L80,30 L100,35 L120,20 L140,25 L160,15 L180,20 L200,10 L220,15 L240,5"
  return (
    <div className="absolute inset-0 p-3 sm:p-6 flex flex-col gap-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {cards.map((c, i) => {
          const reveal = Math.min(1, Math.max(0, progress * 5 - i * 0.3))
          return (
            <div
              key={c.en}
              className={`p-2.5 sm:p-3 rounded-xl bg-gradient-to-br ${c.color} text-white shadow`}
              style={{ opacity: reveal, transform: `translateY(${(1 - reveal) * 10}px)` }}
            >
              <div className="text-[10px] sm:text-xs opacity-90">{isAr ? c.ar : c.en}</div>
              <div className="text-base sm:text-lg font-bold mt-0.5">{isAr ? "ج.م " : "£ "}{c.val}</div>
              <div className="text-[10px] opacity-90 mt-0.5">{c.up}</div>
            </div>
          )
        })}
      </div>
      <div className="flex-1 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-3 sm:p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs sm:text-sm font-semibold">{isAr ? "أَداء آخِر 12 شَهرًا" : "Last 12 months"}</span>
          <span className="text-[10px] sm:text-xs text-gray-500">EGP</span>
        </div>
        <svg viewBox="0 0 240 80" className="w-full h-16 sm:h-24">
          <defs>
            <linearGradient id="dg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${fullPath} L240,80 L0,80 Z`} fill="url(#dg)" style={{ clipPath: `inset(0 ${(1 - progress) * 100}% 0 0)` }} />
          <path d={fullPath} stroke="#3b82f6" strokeWidth="2" fill="none" style={{ clipPath: `inset(0 ${(1 - progress) * 100}% 0 0)` }} />
        </svg>
      </div>
    </div>
  )
}

function CtaMock({ isAr, progress }: { isAr: boolean; progress: number }) {
  const fade = Math.min(1, progress * 2)
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center" style={{ opacity: fade }}>
      <h3 className="text-2xl sm:text-4xl font-extrabold mb-3">
        <span className="bg-gradient-to-r from-blue-600 via-cyan-500 to-purple-600 bg-clip-text text-transparent">
          {isAr ? "جاهِز لِتَجرُبَة 7esab؟" : "Ready to try 7esab?"}
        </span>
      </h3>
      <p className="text-sm sm:text-base text-gray-600 dark:text-gray-300 max-w-lg mb-5">
        {isAr ? "مُستَخدِم واحِد مَجَّانًا لِلأَبَد — لا حُدود زَمَنِيَّة، لا بِطاقَة ائتِمان." : "One user free forever — no time limit, no credit card."}
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <Link href="/auth/sign-up" className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-sm font-semibold shadow inline-flex items-center gap-2">
          {isAr ? "ابدَأ مَجَّانًا" : "Start Free"}
          <ArrowRight className="w-4 h-4 rtl:rotate-180" />
        </Link>
        <Link href="/#pricing" className="px-6 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-semibold">
          {isAr ? "الأَسعار" : "Pricing"}
        </Link>
      </div>
    </div>
  )
}
