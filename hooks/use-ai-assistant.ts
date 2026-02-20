"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { usePathname } from "next/navigation"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import {
  type AISettings,
  type PageGuide,
  DEFAULT_AI_SETTINGS,
  getPageKeyFromPath,
  fetchPageGuide,
  fetchAISettings,
  getAISettingsFromCache,
  setAISettingsCache,
  isPageSeen,
  markPageAsSeen,
  EXCLUDED_PREFIXES,
} from "@/lib/page-guides"

// ─── Return type ──────────────────────────────────────────────────────────────

export interface UseAIAssistantReturn {
  /** Current AI assistant settings (from cache or DB) */
  settings: AISettings
  /** Guide content for the current page (loaded lazily) */
  guide: PageGuide | null
  /** Whether the guide panel is currently open */
  isOpen: boolean
  /** Whether guide content is being loaded */
  isLoadingGuide: boolean
  /** Whether the current page has been "seen" (auto mode) */
  isAlreadySeen: boolean
  /** page_key for the current pathname */
  pageKey: string | null
  /** Open the guide panel (fetches guide if not loaded) */
  openGuide: () => void
  /** Close the guide panel */
  closeGuide: () => void
  /** Mark current page as seen so auto-mode won't re-open it */
  markCurrentPageSeen: () => void
  /** App language resolved for the guide */
  lang: "ar" | "en"
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAIAssistant(): UseAIAssistantReturn {
  const supabase = useSupabase()
  const pathname = usePathname()

  const [settings, setSettings] = useState<AISettings>(DEFAULT_AI_SETTINGS)
  const [guide, setGuide] = useState<PageGuide | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [isLoadingGuide, setIsLoadingGuide] = useState(false)
  // appLang tracks the app's UI language from localStorage
  const [appLang, setAppLang] = useState<"ar" | "en">("ar")

  const autoOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const companyIdRef = useRef<string | null>(null)
  const settingsLoadedRef = useRef(false)
  // Bug 2 fix: stable ref so the auto-open timer always calls the latest openGuide
  const openGuideRef = useRef<() => void>(() => {})

  // Derive page key from current pathname
  const pageKey = getPageKeyFromPath(pathname)

  // Whether we are on an excluded page (auth, onboarding)
  const isExcludedPage =
    !pathname ||
    pathname === "/" ||
    EXCLUDED_PREFIXES.some((p) => pathname.startsWith(p))

  // Bug 1 fix: compute the effective guide language by consulting ai_language_mode.
  // When mode is 'custom', use the stored ai_custom_language preference;
  // otherwise follow the app's UI language.
  const lang: "ar" | "en" =
    settings.ai_language_mode === "custom"
      ? settings.ai_custom_language
      : appLang

  // Track the app UI language from localStorage
  useEffect(() => {
    const readLang = () => {
      try {
        const v = localStorage.getItem("app_language") || "ar"
        setAppLang(v === "en" ? "en" : "ar")
      } catch {}
    }
    readLang()
    window.addEventListener("app_language_changed", readLang)
    return () => window.removeEventListener("app_language_changed", readLang)
  }, [])

  // Load settings once (from cache first, then DB)
  useEffect(() => {
    if (settingsLoadedRef.current) return
    if (isExcludedPage) return

    const load = async () => {
      // Try cache first (avoids DB round-trip on every page navigation)
      const cached = getAISettingsFromCache()
      if (cached) {
        setSettings(cached)
        settingsLoadedRef.current = true
        return
      }

      // Cache miss → fetch from Supabase
      try {
        const cid = await getActiveCompanyId(supabase)
        if (!cid) return
        companyIdRef.current = cid

        const fetched = await fetchAISettings(supabase, cid)
        setSettings(fetched)
        setAISettingsCache(fetched)
        settingsLoadedRef.current = true
      } catch {}
    }

    load()
  }, [supabase, isExcludedPage])

  // Re-load settings when they change from the settings page
  useEffect(() => {
    const handler = () => {
      settingsLoadedRef.current = false
      const load = async () => {
        try {
          const cid = companyIdRef.current ?? (await getActiveCompanyId(supabase))
          if (!cid) return
          const fetched = await fetchAISettings(supabase, cid)
          setSettings(fetched)
          setAISettingsCache(fetched)
          settingsLoadedRef.current = true
        } catch {}
      }
      load()
    }
    window.addEventListener("ai_settings_changed", handler)
    return () => window.removeEventListener("ai_settings_changed", handler)
  }, [supabase])

  // Reset guide and panel on page navigation
  useEffect(() => {
    setIsOpen(false)
    setGuide(null)

    // Clear any pending auto-open timer
    if (autoOpenTimerRef.current) {
      clearTimeout(autoOpenTimerRef.current)
      autoOpenTimerRef.current = null
    }
  }, [pathname])

  // Auto-mode: open guide 800ms after navigation if not yet seen.
  // Bug 2 fix: the timer calls openGuideRef.current() instead of the captured
  // openGuide closure, so language/guide changes that happen between scheduling
  // and firing always use the latest version of the function.
  useEffect(() => {
    if (isExcludedPage) return
    if (!pageKey) return
    if (settings.ai_mode !== "auto") return
    if (!settings.ai_assistant_enabled) return
    if (isPageSeen(pageKey)) return

    autoOpenTimerRef.current = setTimeout(() => {
      openGuideRef.current()
    }, 800)

    return () => {
      if (autoOpenTimerRef.current) clearTimeout(autoOpenTimerRef.current)
    }
  }, [pathname, pageKey, settings.ai_mode, settings.ai_assistant_enabled, isExcludedPage])

  // ─── Lazy guide fetch ────────────────────────────────────────────────────

  const openGuide = useCallback(async () => {
    setIsOpen(true)

    // Guide already loaded for this page
    if (guide !== null) return
    if (!pageKey) return

    setIsLoadingGuide(true)
    try {
      const fetched = await fetchPageGuide(supabase, pageKey, lang)
      setGuide(fetched)
    } catch {
      setGuide(null)
    } finally {
      setIsLoadingGuide(false)
    }
  }, [guide, pageKey, supabase, lang])

  // Keep the ref in sync so the auto-open timer always invokes the latest version
  useEffect(() => {
    openGuideRef.current = openGuide
  }, [openGuide])

  const closeGuide = useCallback(() => {
    setIsOpen(false)
  }, [])

  const markCurrentPageSeen = useCallback(() => {
    if (pageKey) markPageAsSeen(pageKey)
  }, [pageKey])

  const isAlreadySeen = pageKey ? isPageSeen(pageKey) : false

  return {
    settings,
    guide,
    isOpen,
    isLoadingGuide,
    isAlreadySeen,
    pageKey,
    openGuide,
    closeGuide,
    markCurrentPageSeen,
    lang,
  }
}
