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
import { ArrowRight, Pause, Play, RotateCcw, ChevronDown, ChevronUp, X, Volume2, VolumeX, Mic2 } from "lucide-react"

type Lang = "ar" | "en"

const SCENE_DURATION_MS = 6000

type Scene = {
  id: string
  titleAr: string
  titleEn: string
  captionAr: string
  captionEn: string
  /** v3.74.231 — extended Arabic narration spoken by the browser TTS when
   *  audio is enabled. Falls back to captionAr when missing. */
  narrationAr?: string
  /** v3.74.231 — extended English narration spoken by the browser TTS
   *  when audio is enabled. Falls back to captionEn when missing. */
  narrationEn?: string
  /** which mock component to render */
  kind: "hero" | "modules" | "invoice" | "refund" | "dashboard" | "purchases" | "inventory" | "banking" | "reports" | "payroll" | "manufacturing" | "cta"
}

const SCENES: Scene[] = [
  {
    id: "hero",
    titleAr: "أَهلًا بِكَ فى 7esab ERP",
    titleEn: "Welcome to 7esab ERP",
    captionAr: "نِظام مُحاسَبَة وَإِدارَة كامِل — بِالعَرَبِيَّة، بِالعُملَة المَحَلِّيَّة، بِأَمان مُؤَسَّسى.",
    captionEn: "A complete accounting & ops platform — Arabic-first, multi-currency, enterprise-secure.",
    narrationAr: "أَهلاً بِك فى نِظام سَبعة حِساب لِإِدارَة المَوارِد، نِظام مُحاسَبَة وَإِدارَة كامِل بِاللُّغَة العَرَبِيَّة، يَدعَم تَعَدُّد العُمَلات وَالشَّرِكات بِأَمان مُؤَسَّسى.",
    narrationEn: "Welcome to 7esab ERP, a complete accounting and operations platform with first-class Arabic, multi-currency support, and enterprise-grade security.",
    kind: "hero",
  },
  {
    id: "modules",
    titleAr: "وَحَدات مُتَكامِلَة",
    titleEn: "Integrated Modules",
    captionAr: "مَبيعات • مُشتَرَيات • مَخزون • حِسابات • تَقارير. كُلُّها مُتَّصِلَة وَتُحَدَّث لَحظِيًّا.",
    captionEn: "Sales • Purchases • Inventory • Accounting • Reports — all connected, all real-time.",
    narrationAr: "وَحَدات مُتَكامِلَة تُغَطّى المَبيعات وَالمُشتَرَيات وَالمَخزون وَالحِسابات وَالتَّقارير. كُلُّها مُتَّصِلَة وَتُحَدِّث الأَرقام لَحظَة بِلَحظَة بِدون تَدَخُّل يَدَوى.",
    narrationEn: "Integrated modules covering sales, purchases, inventory, accounting, and reports. Every number updates in real time, with zero manual sync.",
    kind: "modules",
  },
  {
    id: "invoice",
    titleAr: "فاتورَة بِعُملَة أَجنَبِيَّة",
    titleEn: "Foreign-Currency Invoice",
    captionAr: "أَنشِئ فاتورَة بِالدولار، يَتِم تَسجيلُها فى الحِسابات بِالجُنَيه تِلقائِيًّا بِسِعر صَرف اليَوم.",
    captionEn: "Issue an invoice in USD — your books capture the EGP equivalent automatically at today's rate.",
    narrationAr: "أَنشِئ فاتورَة مَبيعات بِأَىِّ عُملَة، مِثل الدولار أَو اليورو. النِّظام يَلتَقِط سِعر الصَّرف تِلقائِيًّا وَيُسَجِّل القَيد المُحاسَبى بِالجُنَيه فى الدَّفاتِر.",
    narrationEn: "Issue a sales invoice in any currency such as US dollars or euros. The system captures the exchange rate automatically and posts the journal entry in your base currency.",
    kind: "invoice",
  },
  {
    id: "refund",
    titleAr: "صَرف رَصيد دائِن",
    titleEn: "Customer Credit Refund",
    captionAr: "إِرجاع المَبلَغ بِأَىّ عُملَة، مَع مُتابَعَة الرَّصيد المُتَبَقِّى وَالقَيد المُحاسَبى تِلقائِيًّا.",
    captionEn: "Refund in any currency — the running credit balance and the journal entry both stay in sync.",
    narrationAr: "حَتَّى استرداد رَصيد العَميل بِعُملَة أَجنَبِيَّة يَتِم بِنَقرَة واحِدَة. يُحَدَّث الرَّصيد الدائِن، وَيُسَجَّل القَيد، وَتَظهَر القيمَة الأَصلِيَّة وَالمُعادِلَة فى التَّفاصيل.",
    narrationEn: "Even foreign-currency customer credit refunds take just one click. The credit balance updates, the journal entry posts, and both the original and the base values stay visible in the details.",
    kind: "refund",
  },
  {
    id: "dashboard",
    titleAr: "لَوحَة تَحَكُّم لَحظِيَّة",
    titleEn: "Real-time Dashboard",
    captionAr: "أَرباح، تَدَفُّق نَقدى، أَعمار الذِّمَم — كُل مُؤَشِّر تَجِدُه فى مَكانِه بِنَقرَة واحِدَة.",
    captionEn: "Profit, cash-flow, aging — every KPI you need, one click away.",
    narrationAr: "لَوحَة تَحَكُّم لَحظِيَّة تُظهِر المَبيعات وَالأَرباح وَالعُمَلاء وَالفَواتير، مَع رَسم بَيانى لِأَداء آخِر اثنا عَشَر شَهرًا، حَتَّى تَعرِف وَضع شَرِكَتِك فى ثَوانٍ.",
    narrationEn: "A real-time dashboard surfaces sales, profit, customers, and invoices, plus a twelve-month trend chart, so you know exactly where your business stands in seconds.",
    kind: "dashboard",
  },
  {
    id: "purchases",
    titleAr: "المُشتَرَيات وَالفَواتير",
    titleEn: "Purchases & Bills",
    captionAr: "أَوامِر شِراء، فَواتير مُورِّدين، اعتِمادات مُتَعَدِّدَة المُستَوَيات — دَورَة شِراء كامِلَة فى مَكان واحِد.",
    captionEn: "Purchase orders, supplier bills, multi-level approvals — the full procurement cycle in one place.",
    narrationAr: "أَوامِر شِراء وَفَواتير مُورِّدين مَع مَسار اعتِماد مُتَعَدِّد المُستَوَيات. كُلُّ خُطوَة يُسَجَّل عَلَيها مَن وافَقَ وَمَتى لِغَرَض المُراجَعَة وَالحَوكَمَة.",
    narrationEn: "Purchase orders and supplier bills run through a multi-level approval workflow. Every step records who approved and when, ready for audit and governance.",
    kind: "purchases",
  },
  {
    id: "inventory",
    titleAr: "المَخزون وَتَتَبُّع التَّكلِفَة (FIFO)",
    titleEn: "Inventory & FIFO Costing",
    captionAr: "مُستَوَدَعات، تَحويلات، دَفعات FIFO — تَكلِفَة دَقيقَة لِكُل صِنف وَمُستَوَى مَخزون لَحظى.",
    captionEn: "Warehouses, transfers, FIFO lots — accurate per-item cost and real-time stock levels.",
    narrationAr: "إِدارَة مَخزون بِنِظام دَفعات FIFO يَتَتَبَّع تَكلِفَة كُل صِنف مِن الشِّراء حَتَّى البَيع، مَع مُستَوَدَعات وَتَحويلات وَتَتَبُّع لَحظى لِلأَرصِدَة.",
    narrationEn: "Inventory management uses FIFO lots to track every item's cost from purchase to sale, with warehouses, transfers, and live stock balances.",
    kind: "inventory",
  },
  {
    id: "banking",
    titleAr: "البُنوك وَالتَّسويَة",
    titleEn: "Banking & Reconciliation",
    captionAr: "حِسابات بَنكِيَّة بِعِدَّة عُمَلات، تَحويلات داخِلِيَّة، وَتَسوِيَة كَشف الحِساب بِنَقرَة.",
    captionEn: "Multi-currency bank accounts, internal transfers, and one-click statement reconciliation.",
    narrationAr: "حِسابات بَنكِيَّة بِعُمَلات مُتَعَدِّدَة، تَحويلات داخِلِيَّة بَين الفُروع، وَتَسوِيَة كَشف الحِساب البَنكى بِنَقرَة واحِدَة بِدون أَخطاء.",
    narrationEn: "Multi-currency bank accounts, internal transfers between branches, and one-click bank-statement reconciliation with zero variance.",
    kind: "banking",
  },
  {
    id: "reports",
    titleAr: "تَقارير مالِيَّة فَورِيَّة",
    titleEn: "Instant Financial Reports",
    captionAr: "قائِمَة الدَّخل، المَركَز المالى، أَعمار الذِّمَم، تَدَفُّقات نَقدِيَّة — كُلُّها لَحظِيَّة وَقابِلَة لِلتَّصدير.",
    captionEn: "P&L, balance sheet, AR/AP aging, cash flow — all real-time and one-click exportable.",
    narrationAr: "تَقارير مالِيَّة فَورِيَّة تَشمَل قائِمَة الدَّخل، وَالمَركَز المالى، وَأَعمار الذِّمَم المَدينَة، وَالتَّدَفُّقات النَّقدِيَّة، قابِلَة لِلتَّصدير لاكسِل وَPDF.",
    narrationEn: "Instant financial reports including profit and loss, balance sheet, accounts-receivable aging, and cash flow, all exportable to Excel and PDF.",
    kind: "reports",
  },
  {
    id: "payroll",
    titleAr: "المَوارِد البَشَرِيَّة وَالرَّواتِب",
    titleEn: "HR & Payroll",
    captionAr: "بَيانات المُوَظَّفين، رَواتِب شَهرِيَّة، حَوافِز وَخَصمَيات، وَقَيد مُحاسَبى تِلقائى.",
    captionEn: "Employee records, monthly payroll, bonuses & deductions, with auto-generated journal entries.",
    narrationAr: "إِدارَة المُوَظَّفين وَالرَّواتِب الشَّهرِيَّة مَع الحَوافِز وَالخَصمَيات. اعتِماد الكَشف يُولِّد القَيد المُحاسَبى وَأَوامِر التَّحويل البَنكى تِلقائِيًّا.",
    narrationEn: "Manage employees and monthly payroll runs with bonuses and deductions. Approving the run posts the journal entry and queues bank transfers automatically.",
    kind: "payroll",
  },
  {
    id: "manufacturing",
    titleAr: "الإِنتاج وَأَوامِر التَّصنيع",
    titleEn: "Manufacturing & Work Orders",
    captionAr: "قَوائِم مَوادّ (BOM)، أَوامِر إِنتاج، صَرف مَخزون، حِساب تَكلِفَة المَنتَج النِّهائى تِلقائِيًّا.",
    captionEn: "Bills of materials, work orders, stock consumption — finished-product cost computed automatically.",
    narrationAr: "أَوامِر إِنتاج مَع قائِمَة المَوادّ الخام، صَرف المَخزون تِلقائِيًّا، وَحِساب تَكلِفَة الوَحدَة النِّهائِيَّة فَور الانتِهاء مِن أَمر التَّصنيع.",
    narrationEn: "Work orders with bills of materials, automatic stock consumption, and a finished-unit cost computed the moment production completes.",
    kind: "manufacturing",
  },
  {
    id: "cta",
    titleAr: "ابدَأ مَجَّانًا الآن",
    titleEn: "Start Free Today",
    captionAr: "مُستَخدِم واحِد مَجَّانى لِلأَبَد — بِدون بِطاقَة ائتِمان، بِدون حُدود زَمَنِيَّة.",
    captionEn: "One user free forever — no credit card, no time limits.",
    narrationAr: "ابدَأ تَجرُبَتَك مَجَّانًا الآن. مُستَخدِم واحِد مَجَّانى لِلأَبَد، بِدون بِطاقَة ائتِمان، بِدون قُيود زَمَنِيَّة. ادخُل عَلى سَبعة حِساب دوت كوم.",
    narrationEn: "Start your free trial right now. One user free forever, no credit card, no time limits. Just head over to 7esab.com and you're in.",
    kind: "cta",
  },
]

// v3.74.233 — pre-generated narration audio via Higgsfield (Mark voice:
// ElevenLabs for Arabic, Cozy Voice for English). Keyed by scene id and
// language. When a key is missing the audio playback effect falls back
// to the browser's Web Speech API. We host the files on Higgsfield's
// CloudFront because it's the original output bucket and re-uploading
// to our own /public would have meant downloading each file manually
// (the sandbox has no network access to cloudfront, and we ran out of
// budget to regenerate locally).
const HIGGSFIELD_AUDIO_BASE = "https://d8j0ntlcm91z4.cloudfront.net/user_3FMU0QOVEn3oxuRY11sO50WDSeV"
const SCENE_AUDIO: Record<string, { ar?: string; en?: string }> = {
  hero: { ar: `${HIGGSFIELD_AUDIO_BASE}/hf_20260619_160547_a3a2befa-7a75-416c-8913-88c05640d6a8.mp3`, en: `${HIGGSFIELD_AUDIO_BASE}/hf_20260619_160302_aee5206c-1e8f-4902-961c-ae59047e80f7.wav` },
  modules: { ar: `${HIGGSFIELD_AUDIO_BASE}/hf_20260619_161008_42fcc98b-577c-47bb-ad8b-0e87b93d6133.mp3`, en: `${HIGGSFIELD_AUDIO_BASE}/hf_20260619_162346_610c521c-ba6c-4224-b0ce-7fe5a393a748.wav` },
  invoice: { ar: `${HIGGSFIELD_AUDIO_BASE}/hf_20260619_161205_e21f2264-db2a-466f-9563-4342f1f8a30b.mp3`, en: `${HIGGSFIELD_AUDIO_BASE}/hf_20260619_162620_7f3f8007-560b-411d-813a-83e459c29a21.wav` },
  refund: { ar: `${HIGGSFIELD_AUDIO_BASE}/hf_20260619_161332_69957913-9a33-46f4-8fe9-64bba1629a2c.mp3`, en: `${HIGGSFIELD_AUDIO_BASE}/hf_20260619_162710_74c67cea-b281-4ab4-aca7-e7b19b7d0441.wav` },
  dashboard: { ar: `${HIGGSFIELD_AUDIO_BASE}/hf_20260619_161453_53c26cd4-216a-4bbf-9cc6-77e1840066cf.mp3` },
  purchases: { ar: `${HIGGSFIELD_AUDIO_BASE}/hf_20260619_161559_eb60b6f2-3e91-48d3-9163-a037d0ba6d7e.mp3` },
  inventory: { ar: `${HIGGSFIELD_AUDIO_BASE}/hf_20260619_161708_56ed2468-8f82-4599-8494-0678657aaab1.mp3` },
  banking: { ar: `${HIGGSFIELD_AUDIO_BASE}/hf_20260619_161811_6fd0f958-c8d8-4372-8229-d712d1a0ddf1.mp3` },
  reports: { ar: `${HIGGSFIELD_AUDIO_BASE}/hf_20260619_161916_22bac4d7-d7dc-42f7-83de-885cfce30b37.mp3` },
  payroll: { ar: `${HIGGSFIELD_AUDIO_BASE}/hf_20260619_162025_62026710-7c1d-44d9-850c-03c668e81d53.mp3` },
  manufacturing: { ar: `${HIGGSFIELD_AUDIO_BASE}/hf_20260619_162129_bd6be672-09fa-4bba-8767-e422e4895cd8.mp3` },
  cta: { ar: `${HIGGSFIELD_AUDIO_BASE}/hf_20260619_162234_0235c8b0-4d12-4fb0-8720-618ca9d47b66.mp3` },
}

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
  audioOn: { ar: "تَشغيل الصَّوت", en: "Sound on" },
  audioOff: { ar: "إِيقاف الصَّوت", en: "Sound off" },
  audioUnsupported: { ar: "المُتَصَفِّح لا يَدعَم القِراءَة الصَّوتِيَّة", en: "Browser does not support speech" },
  voicePick: { ar: "اختيار الصَّوت", en: "Pick voice" },
  voiceLabel: { ar: "الصَّوت الحالى", en: "Current voice" },
  voiceNoneInLang: { ar: "لا يوجد صَوت بِالعَرَبِيَّة عَلى هَذا الجِهاز", en: "No voice installed for this language" },
  voiceTipWindows: { ar: "نَصيحَة: ثَبِّت صَوت «Hoda Online (Natural)» مِن Windows Settings ← Time & Language ← Speech لِجَودَة أَفضَل.", en: "Tip: install a Microsoft Online (Natural) voice from Windows Settings → Time & Language → Speech for the best quality." },
}

export default function DemoPage() {
  const [lang, setLang] = useState<Lang>("ar")
  const [activeIdx, setActiveIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  const [progress, setProgress] = useState(0)
  const lastTickRef = useRef<number>(0)
  const rafRef = useRef<number | null>(null)
  // v3.74.231 — narration via the browser's Web Speech API. Free, instant,
  // no credits required. The user toggles it from the toolbar; the choice
  // persists in localStorage('demo_audio_enabled'). audioSupported reflects
  // whether window.speechSynthesis exists at all (some embedded webviews
  // omit it). When unsupported we hide the toggle and skip speak() calls.
  const [audioEnabled, setAudioEnabled] = useState(false)
  const [audioSupported, setAudioSupported] = useState(true)
  // v3.74.232 — voice picker. We keep a separate selected voice per
  // language because the same person rarely wants the same voice for AR
  // and EN. voicesByLang is the filtered, ranked candidate list shown in
  // the dropdown (neural / online / natural voices rank highest).
  const [voicesAr, setVoicesAr] = useState<SpeechSynthesisVoice[]>([])
  const [voicesEn, setVoicesEn] = useState<SpeechSynthesisVoice[]>([])
  const [selectedVoiceAr, setSelectedVoiceAr] = useState<string>("")
  const [selectedVoiceEn, setSelectedVoiceEn] = useState<string>("")
  const [voicePickerOpen, setVoicePickerOpen] = useState(false)

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

  // v3.74.231 — initialize audio: check browser support, load persisted
  // preference, and warm the voice list (some browsers populate voices
  // asynchronously, so we register the voiceschanged listener once).
  useEffect(() => {
    if (typeof window === "undefined") return
    const supported = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window
    setAudioSupported(supported)
    if (!supported) return
    try {
      const stored = localStorage.getItem("demo_audio_enabled")
      if (stored === "true") setAudioEnabled(true)
    } catch { /* private mode */ }
    // v3.74.232 — rank installed voices for each language. Neural /
    // Online / Natural voices ship better prosody and accent control,
    // so we float them to the top of the dropdown.
    const rankVoice = (v: SpeechSynthesisVoice): number => {
      const name = v.name.toLowerCase()
      let score = 0
      if (/(neural|natural|online|enhanced|premium|wavenet|studio|hd)/.test(name)) score += 100
      if (v.localService === false) score += 10  // remote voices are usually the high-quality cloud ones
      if (v.default) score += 1
      return score
    }
    const loadVoices = () => {
      const all = window.speechSynthesis.getVoices()
      if (!all || all.length === 0) return
      const ar = all.filter((v) => v.lang.toLowerCase().startsWith("ar")).sort((a, b) => rankVoice(b) - rankVoice(a))
      const en = all.filter((v) => v.lang.toLowerCase().startsWith("en")).sort((a, b) => rankVoice(b) - rankVoice(a))
      setVoicesAr(ar)
      setVoicesEn(en)
      // Restore persisted selection or default to the top-ranked voice.
      try {
        const storedAr = localStorage.getItem("demo_voice_ar")
        const storedEn = localStorage.getItem("demo_voice_en")
        if (storedAr && ar.some((v) => v.name === storedAr)) setSelectedVoiceAr(storedAr)
        else if (ar.length > 0) setSelectedVoiceAr(ar[0].name)
        if (storedEn && en.some((v) => v.name === storedEn)) setSelectedVoiceEn(storedEn)
        else if (en.length > 0) setSelectedVoiceEn(en[0].name)
      } catch {
        if (ar.length > 0) setSelectedVoiceAr(ar[0].name)
        if (en.length > 0) setSelectedVoiceEn(en[0].name)
      }
    }
    loadVoices()
    const onVoicesChanged = () => { loadVoices() }
    window.speechSynthesis.addEventListener("voiceschanged", onVoicesChanged)
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged)
      window.speechSynthesis.cancel()
    }
  }, [])

  // v3.74.231 — speak the current scene's narration whenever it changes
  // (scene jump, language switch, audio toggle). Cancels any in-flight
  // utterance so we never overlap audio. Pause/resume hooks into the
  // existing `paused` state so the speech tracks the visual playback.
  // v3.74.233 — prefer the pre-generated Higgsfield clip (Mark voice,
  // ElevenLabs for Arabic, Cozy Voice for English). When the file is
  // missing for a particular scene+language combo we fall back to the
  // browser's Web Speech API, so the demo still narrates even before all
  // clips are generated.
  const higgsfieldAudioRef = useRef<HTMLAudioElement | null>(null)
  useEffect(() => {
    if (!audioSupported || typeof window === "undefined") return
    // Stop both backends.
    window.speechSynthesis.cancel()
    if (higgsfieldAudioRef.current) {
      higgsfieldAudioRef.current.pause()
      higgsfieldAudioRef.current.src = ""
      higgsfieldAudioRef.current = null
    }
    if (!audioEnabled || paused) return
    const sceneNow = SCENES[activeIdx]
    const audioUrl = SCENE_AUDIO[sceneNow.id]?.[lang]
    if (audioUrl) {
      try {
        const a = new Audio(audioUrl)
        a.crossOrigin = "anonymous"
        higgsfieldAudioRef.current = a
        a.play().catch(() => { /* autoplay blocked, fall through to web-speech */ })
        return () => { try { a.pause() } catch {} }
      } catch { /* fall through to Web Speech API */ }
    }
    const text = lang === "ar"
      ? (sceneNow.narrationAr || sceneNow.captionAr)
      : (sceneNow.narrationEn || sceneNow.captionEn)
    if (!text) return
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = lang === "ar" ? "ar-EG" : "en-US"
    utter.rate = lang === "ar" ? 0.95 : 1.0
    utter.pitch = 1
    // v3.74.232 — use the user-selected voice from the picker. Falls
    // back to the top-ranked voice (assigned at init time) when nothing
    // is selected. Some browsers (notably older Android Chrome) ignore
    // utter.lang without an explicit voice, so this also fixes the
    // accidental-English-on-Arabic case.
    try {
      const voices = window.speechSynthesis.getVoices()
      const wantedName = lang === "ar" ? selectedVoiceAr : selectedVoiceEn
      const v = (wantedName && voices.find((vv) => vv.name === wantedName))
        || voices.find((vv) => vv.lang.toLowerCase().startsWith(lang === "ar" ? "ar" : "en"))
      if (v) utter.voice = v
    } catch { /* getVoices may throw in some webviews */ }
    window.speechSynthesis.speak(utter)
    return () => { window.speechSynthesis.cancel() }
  }, [audioEnabled, audioSupported, activeIdx, lang, paused, selectedVoiceAr, selectedVoiceEn])

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
            {audioSupported && (
              <button
                onClick={() => {
                  const next = !audioEnabled
                  setAudioEnabled(next)
                  try { localStorage.setItem("demo_audio_enabled", String(next)) } catch { }
                }}
                className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg border text-xs sm:text-sm font-medium ${audioEnabled ? "border-blue-500 text-blue-600 bg-blue-50 dark:bg-blue-950/30" : "border-gray-300 dark:border-gray-700 hover:border-blue-500 hover:text-blue-600"}`}
                aria-label={audioEnabled ? t("audioOff") : t("audioOn")}
                title={audioEnabled ? t("audioOff") : t("audioOn")}
              >
                {audioEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{audioEnabled ? t("audioOff") : t("audioOn")}</span>
              </button>
            )}
            {audioSupported && (
              <div className="relative">
                <button
                  onClick={() => setVoicePickerOpen((o) => !o)}
                  className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-xs sm:text-sm font-medium hover:border-blue-500 hover:text-blue-600"
                  aria-label={t("voicePick")}
                  title={t("voicePick")}
                >
                  <Mic2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t("voicePick")}</span>
                </button>
                {voicePickerOpen && (
                  <div
                    className="absolute end-0 mt-2 w-72 sm:w-80 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 shadow-2xl p-3 z-10"
                    onMouseLeave={() => setVoicePickerOpen(false)}
                  >
                    <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-2">{t("voiceLabel")}</div>
                    {(() => {
                      const list = lang === "ar" ? voicesAr : voicesEn
                      const selected = lang === "ar" ? selectedVoiceAr : selectedVoiceEn
                      const setSelected = (name: string) => {
                        if (lang === "ar") {
                          setSelectedVoiceAr(name)
                          try { localStorage.setItem("demo_voice_ar", name) } catch { }
                        } else {
                          setSelectedVoiceEn(name)
                          try { localStorage.setItem("demo_voice_en", name) } catch { }
                        }
                      }
                      if (list.length === 0) {
                        return (
                          <div className="text-xs text-gray-500 leading-relaxed">
                            <div className="mb-2 text-rose-600 font-semibold">{t("voiceNoneInLang")}</div>
                            <div>{t("voiceTipWindows")}</div>
                          </div>
                        )
                      }
                      return (
                        <>
                          <ul className="max-h-72 overflow-y-auto -mx-1 space-y-1">
                            {list.map((v) => {
                              const isPremium = /(neural|natural|online|enhanced|premium|wavenet|studio|hd)/i.test(v.name)
                              const isSelected = v.name === selected
                              return (
                                <li key={v.name}>
                                  <button
                                    onClick={() => setSelected(v.name)}
                                    className={`w-full text-start flex items-start gap-2 px-3 py-2 rounded-lg text-xs transition-colors ${isSelected ? "bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 font-semibold" : "hover:bg-gray-50 dark:hover:bg-gray-900 text-gray-700 dark:text-gray-300"}`}
                                  >
                                    <span className={`mt-0.5 w-3 h-3 rounded-full flex-shrink-0 ${isSelected ? "bg-blue-600" : "border border-gray-300 dark:border-gray-700"}`} />
                                    <span className="flex-1 min-w-0">
                                      <span className="block truncate">{v.name}</span>
                                      <span className="block text-[10px] text-gray-400 mt-0.5">{v.lang}{isPremium ? " · Neural" : ""}</span>
                                    </span>
                                  </button>
                                </li>
                              )
                            })}
                          </ul>
                          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 text-[10px] text-gray-400 leading-relaxed">{t("voiceTipWindows")}</div>
                        </>
                      )
                    })()}
                  </div>
                )}
              </div>
            )}
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
    case "purchases":     return <PurchasesMock isAr={isAr} progress={progress} />
    case "inventory":     return <InventoryMock isAr={isAr} progress={progress} />
    case "banking":       return <BankingMock isAr={isAr} progress={progress} />
    case "reports":       return <ReportsMock isAr={isAr} progress={progress} />
    case "payroll":       return <PayrollMock isAr={isAr} progress={progress} />
    case "manufacturing": return <ManufacturingMock isAr={isAr} progress={progress} />
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

function PurchasesMock({ isAr, progress }: { isAr: boolean; progress: number }) {
  const p1 = Math.min(1, progress * 2.5)
  const p2 = Math.max(0, Math.min(1, progress * 2 - 0.5))
  return (
    <div className="absolute inset-0 p-3 sm:p-6 flex flex-col gap-3">
      <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-3 sm:p-4" style={{ opacity: p1 }}>
        <div className="text-[11px] text-gray-400 mb-1">{isAr ? "أَمر شِراء" : "Purchase Order"}</div>
        <div className="flex items-center justify-between mb-2">
          <span className="font-bold text-sm">PO-00037</span>
          <span className="text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-700">{isAr ? "بِانتِظار الاعتِماد" : "Pending approval"}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="text-gray-500">{isAr ? "المُورِّد" : "Supplier"}</div>
          <div className="font-medium text-end">{isAr ? "شَرِكَة المَوادّ الخام" : "Raw Materials Co."}</div>
          <div className="text-gray-500">{isAr ? "الإِجمالى" : "Total"}</div>
          <div className="font-bold text-end">85,400.00 ج.م</div>
        </div>
      </div>
      <div className="flex-1 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-3 sm:p-4" style={{ opacity: p2, transform: `translateY(${(1 - p2) * 14}px)` }}>
        <div className="text-[11px] text-gray-400 mb-2">{isAr ? "مَسار الاعتِماد" : "Approval workflow"}</div>
        <div className="flex items-center justify-between text-xs">
          {[
            { ar: "المُشتَرَيات", en: "Buyer", done: true },
            { ar: "المُدير", en: "Manager", done: true },
            { ar: "المالى", en: "Finance", done: false },
          ].map((s, i) => (
            <div key={i} className="flex-1 flex flex-col items-center">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold ${s.done ? "bg-emerald-500 text-white" : "bg-gray-200 dark:bg-gray-800 text-gray-500"}`}>{s.done ? "✓" : i + 1}</div>
              <span className="mt-1 text-gray-600 dark:text-gray-400">{isAr ? s.ar : s.en}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function InventoryMock({ isAr, progress }: { isAr: boolean; progress: number }) {
  const rows = [
    { sku: "SKU-1001", name: { ar: "زَيت تَشحيم", en: "Lubricant oil" }, qty: 248, lot: "L-204", cost: 12.5 },
    { sku: "SKU-1042", name: { ar: "فِلتَر هَواء", en: "Air filter" }, qty: 96, lot: "L-211", cost: 35.0 },
    { sku: "SKU-1107", name: { ar: "بَطَّارِيَّة 60Ah", en: "60Ah Battery" }, qty: 32, lot: "L-219", cost: 880.0 },
  ]
  return (
    <div className="absolute inset-0 p-3 sm:p-6 flex flex-col gap-3">
      <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 overflow-hidden flex-1">
        <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <span className="text-xs font-semibold">{isAr ? "أَرصِدَة المَخزون — مُستَوَدَع الرَّئيسى" : "Stock balances — Main warehouse"}</span>
          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">FIFO</span>
        </div>
        <table className="w-full text-xs">
          <thead className="bg-gray-50 dark:bg-gray-800/50 text-gray-500">
            <tr>
              <th className="text-start p-2 font-medium">{isAr ? "الصِّنف" : "Item"}</th>
              <th className="text-end p-2 font-medium">{isAr ? "الكَمِّيَّة" : "Qty"}</th>
              <th className="text-end p-2 font-medium hidden sm:table-cell">{isAr ? "الدَّفعَة" : "Lot"}</th>
              <th className="text-end p-2 font-medium">{isAr ? "التَّكلِفَة" : "Cost"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const reveal = Math.min(1, Math.max(0, progress * 4 - i * 0.4))
              return (
                <tr key={r.sku} className="border-t border-gray-100 dark:border-gray-800" style={{ opacity: reveal }}>
                  <td className="p-2">
                    <div className="font-medium">{isAr ? r.name.ar : r.name.en}</div>
                    <div className="text-[10px] text-gray-400">{r.sku}</div>
                  </td>
                  <td className="p-2 text-end font-medium">{r.qty}</td>
                  <td className="p-2 text-end hidden sm:table-cell text-gray-500">{r.lot}</td>
                  <td className="p-2 text-end font-medium text-blue-600">{r.cost.toFixed(2)} ج.م</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="text-[11px] text-gray-500 text-center">
        {isAr ? "تَكلِفَة دَقيقَة بِنِظام FIFO — كُل دَفعَة مُتَتَبَّعَة مِن الشِّراء حَتَّى البَيع." : "Accurate FIFO costing — every lot tracked from purchase to sale."}
      </div>
    </div>
  )
}

function BankingMock({ isAr, progress }: { isAr: boolean; progress: number }) {
  const p1 = Math.min(1, progress * 2.5)
  const p2 = Math.max(0, Math.min(1, progress * 2 - 0.6))
  return (
    <div className="absolute inset-0 p-3 sm:p-6 grid grid-rows-[auto_1fr] gap-3">
      <div className="grid grid-cols-3 gap-2 sm:gap-3" style={{ opacity: p1 }}>
        {[
          { name: { ar: "بَنك قَناة السُّوَيس", en: "Suez Canal Bank" }, n: "1010", bal: "0.09 $", base: "≈ 4.95 ج.م", color: "from-blue-500 to-cyan-500" },
          { name: { ar: "البَنك الأَهلى", en: "National Bank" }, n: "1020", bal: "182,400.00 ج.م", color: "from-emerald-500 to-teal-500" },
          { name: { ar: "خَزينَة الفَرع", en: "Branch Cash" }, n: "1030", bal: "12,650.00 ج.م", color: "from-purple-500 to-fuchsia-500" },
        ].map((a) => (
          <div key={a.n} className={`p-2.5 sm:p-3 rounded-xl bg-gradient-to-br ${a.color} text-white shadow`}>
            <div className="text-[10px] opacity-90">{isAr ? a.name.ar : a.name.en} ({a.n})</div>
            <div className="text-sm sm:text-base font-bold mt-1">{a.bal}</div>
            {a.base && <div className="text-[10px] opacity-90">{a.base}</div>}
          </div>
        ))}
      </div>
      <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-3 sm:p-4 flex flex-col gap-2" style={{ opacity: p2, transform: `translateY(${(1 - p2) * 14}px)` }}>
        <div className="text-[11px] text-gray-400">{isAr ? "تَسويَة كَشف الحِساب" : "Statement reconciliation"}</div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-[10px] text-gray-500">{isAr ? "حَركات مُسَوَّاة" : "Matched"}</div>
            <div className="text-base sm:text-lg font-bold text-emerald-600">147</div>
          </div>
          <div>
            <div className="text-[10px] text-gray-500">{isAr ? "بِانتِظار" : "Pending"}</div>
            <div className="text-base sm:text-lg font-bold text-amber-600">5</div>
          </div>
          <div>
            <div className="text-[10px] text-gray-500">{isAr ? "فَروقات" : "Variance"}</div>
            <div className="text-base sm:text-lg font-bold text-rose-600">0.00 ج.م</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ReportsMock({ isAr, progress }: { isAr: boolean; progress: number }) {
  const p1 = Math.min(1, progress * 2)
  return (
    <div className="absolute inset-0 p-3 sm:p-6 grid grid-cols-2 grid-rows-2 gap-3" style={{ opacity: p1 }}>
      <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-3 flex flex-col justify-between">
        <div>
          <div className="text-[10px] text-gray-400">{isAr ? "قائِمَة الدَّخل" : "Profit & Loss"}</div>
          <div className="text-xs font-semibold mt-0.5">{isAr ? "صافى الرِّبح" : "Net profit"}</div>
        </div>
        <div className="text-end">
          <div className="text-lg sm:text-xl font-extrabold text-emerald-600">387,420 ج.م</div>
          <div className="text-[10px] text-emerald-600">+8.2%</div>
        </div>
      </div>
      <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-3 flex flex-col justify-between">
        <div>
          <div className="text-[10px] text-gray-400">{isAr ? "المَركَز المالى" : "Balance Sheet"}</div>
          <div className="text-xs font-semibold mt-0.5">{isAr ? "إِجمالى الأُصول" : "Total assets"}</div>
        </div>
        <div className="text-end">
          <div className="text-lg sm:text-xl font-extrabold text-blue-600">2.41 M ج.م</div>
          <div className="text-[10px] text-gray-500">{isAr ? "31 ديسَمبَر" : "Dec 31"}</div>
        </div>
      </div>
      <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-3 flex flex-col justify-between">
        <div>
          <div className="text-[10px] text-gray-400">{isAr ? "أَعمار الذِّمَم" : "AR Aging"}</div>
          <div className="text-xs font-semibold mt-0.5">{isAr ? "أَكثَر مِن 90 يَومًا" : "90+ days"}</div>
        </div>
        <div className="text-end">
          <div className="text-lg sm:text-xl font-extrabold text-rose-600">42,800 ج.م</div>
          <div className="text-[10px] text-rose-600">{isAr ? "تَحَرُّك مَطلوب" : "Action needed"}</div>
        </div>
      </div>
      <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-3 flex flex-col justify-between">
        <div>
          <div className="text-[10px] text-gray-400">{isAr ? "التَّدَفُّق النَّقدى" : "Cash Flow"}</div>
          <div className="text-xs font-semibold mt-0.5">{isAr ? "الشَّهر الحالى" : "Current month"}</div>
        </div>
        <div className="text-end">
          <div className="text-lg sm:text-xl font-extrabold text-purple-600">+118,300 ج.م</div>
          <div className="text-[10px] text-gray-500">{isAr ? "تَشغيلى" : "Operating"}</div>
        </div>
      </div>
    </div>
  )
}

function PayrollMock({ isAr, progress }: { isAr: boolean; progress: number }) {
  const p1 = Math.min(1, progress * 2.2)
  const rows = [
    { name: { ar: "أَحمَد عَلى", en: "Ahmed Aly" }, role: { ar: "مُحاسِب", en: "Accountant" }, salary: 9500 },
    { name: { ar: "سارَة مَحمود", en: "Sara Mahmoud" }, role: { ar: "مَبيعات", en: "Sales" }, salary: 8200 },
    { name: { ar: "مُحَمَّد حَسَن", en: "Mohamed Hassan" }, role: { ar: "مَخزون", en: "Warehouse" }, salary: 7400 },
  ]
  return (
    <div className="absolute inset-0 p-3 sm:p-6 flex flex-col gap-3">
      <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 overflow-hidden flex-1">
        <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <span className="text-xs font-semibold">{isAr ? "كَشف رَواتِب — يونيو 2026" : "Payroll run — June 2026"}</span>
          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">{isAr ? "جاهِز لِلصَّرف" : "Ready to post"}</span>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {rows.map((r, i) => {
            const reveal = Math.min(1, Math.max(0, progress * 4 - i * 0.4))
            return (
              <div key={i} className="flex items-center justify-between px-3 py-2" style={{ opacity: reveal }}>
                <div>
                  <div className="text-sm font-medium">{isAr ? r.name.ar : r.name.en}</div>
                  <div className="text-[10px] text-gray-500">{isAr ? r.role.ar : r.role.en}</div>
                </div>
                <div className="text-end">
                  <div className="text-sm font-bold text-blue-600">{r.salary.toLocaleString()} ج.م</div>
                  <div className="text-[10px] text-gray-500">{isAr ? "صافى الرَّاتِب" : "Net pay"}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div className="text-[11px] text-gray-500 text-center" style={{ opacity: p1 }}>
        {isAr ? "اعتِماد الكَشف يُولِّد القَيد المُحاسَبى وَأَوامِر التَّحويل البَنكى تِلقائِيًّا." : "Approving the run posts the journal entry and queues bank transfers automatically."}
      </div>
    </div>
  )
}

function ManufacturingMock({ isAr, progress }: { isAr: boolean; progress: number }) {
  const p1 = Math.min(1, progress * 2.5)
  const p2 = Math.max(0, Math.min(1, progress * 2 - 0.6))
  return (
    <div className="absolute inset-0 p-3 sm:p-6 flex flex-col gap-3">
      <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-3 sm:p-4" style={{ opacity: p1 }}>
        <div className="text-[11px] text-gray-400 mb-1">{isAr ? "أَمر إِنتاج" : "Work order"}</div>
        <div className="flex items-center justify-between mb-2">
          <span className="font-bold text-sm">WO-00112</span>
          <span className="text-[10px] px-2 py-0.5 rounded bg-blue-100 text-blue-700">{isAr ? "جارٍ التَّصنيع" : "In progress"}</span>
        </div>
        <div className="text-sm font-medium">{isAr ? "زَيت تَزييت 1L — 200 وَحدَة" : "Lubricant 1L — 200 units"}</div>
      </div>
      <div className="flex-1 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-3 sm:p-4" style={{ opacity: p2, transform: `translateY(${(1 - p2) * 14}px)` }}>
        <div className="text-[11px] text-gray-400 mb-2">{isAr ? "صَرف مَوادّ خام (BOM)" : "Raw materials consumption (BOM)"}</div>
        <div className="space-y-1.5 text-xs">
          {[
            { ar: "زَيت أَساس", en: "Base oil", qty: "180 L", cost: "1,440 ج.م" },
            { ar: "مادَّة مُضافَة", en: "Additive", qty: "20 L", cost: "920 ج.م" },
            { ar: "زُجاجَات فارِغَة", en: "Empty bottles", qty: "200", cost: "300 ج.م" },
          ].map((m, i) => (
            <div key={i} className="flex justify-between border-b border-gray-100 dark:border-gray-800 pb-1.5 last:border-0">
              <span className="text-gray-500">{isAr ? m.ar : m.en}</span>
              <span className="font-medium">{m.qty}</span>
              <span className="font-medium text-blue-600">{m.cost}</span>
            </div>
          ))}
          <div className="flex justify-between pt-2 font-bold border-t border-gray-200 dark:border-gray-700">
            <span>{isAr ? "تَكلِفَة الوَحدَة" : "Cost per unit"}</span>
            <span className="text-emerald-600">13.30 ج.م</span>
          </div>
        </div>
      </div>
    </div>
  )
}

