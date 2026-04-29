/**
 * Page Guides Library
 *
 * Maps URL pathnames to page_key identifiers and fetches
 * bilingual guide content from the page_guides Supabase table.
 *
 * Design principles:
 * - Guide content is fetched LAZILY (only on panel open)
 * - AI settings are cached in localStorage (1-hour TTL)
 * - "Seen pages" are tracked in localStorage for auto-mode
 * - No financial operations — read-only
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import {
  AI_EXCLUDED_PREFIXES,
  PAGE_KEY_MAP as AI_PAGE_KEY_MAP,
  getGuideKeyForPageKey,
  getPageKeyFromRegistry,
} from "@/lib/ai/page-key-registry"

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AISettings {
  ai_assistant_enabled: boolean
  ai_mode: "disabled" | "manual" | "auto"
  ai_language_mode: "follow_app_language" | "custom"
  /** Only used when ai_language_mode = 'custom' */
  ai_custom_language: "ar" | "en"
}

export interface AccountingEntry {
  account: string
  /** "debit" | "credit" — UI translates to مدين/دائن or Dr/Cr */
  side: "debit" | "credit"
}

export interface AccountingImpact {
  assets?: string
  liabilities?: string
  equity?: string
  pl?: string
}

/** Structured accounting pattern returned by fetchPageGuide */
export interface AccountingPattern {
  event: string
  entries: AccountingEntry[]
  impact: AccountingImpact
}

export interface PageGuide {
  page_key: string
  title: string
  description: string
  steps: string[]
  tips: string[]
  /** Null when the page has no accounting pattern (e.g. pure reporting pages) */
  accounting_pattern: AccountingPattern | null
}

export const DEFAULT_AI_SETTINGS: AISettings = {
  ai_assistant_enabled: true,
  ai_mode: "manual",
  ai_language_mode: "follow_app_language",
  ai_custom_language: "ar",
}

// ─── localStorage keys ────────────────────────────────────────────────────────

// v2 — bumped when AISettings gained ai_custom_language to evict stale v1 entries
export const AI_SETTINGS_CACHE_KEY = "ai_assistant_settings_v2"
export const AI_SETTINGS_CACHE_TS_KEY = "ai_assistant_settings_ts_v2"
export const AI_SETTINGS_CACHE_TTL = 60 * 60 * 1000 // 1 hour
export const AI_SEEN_PAGES_KEY = "ai_seen_pages_v1"

// ─── Pathname → page_key map ──────────────────────────────────────────────────

/**
 * Maps pathname prefixes to page_key values used in the page_guides table.
 * Order matters: more specific paths must come before shorter ones.
 */
export const PAGE_KEY_MAP: Array<{ prefix: string; key: string }> = [...AI_PAGE_KEY_MAP]

/** Pages where the AI assistant should NOT appear */
export const EXCLUDED_PREFIXES = [...AI_EXCLUDED_PREFIXES]

/**
 * Derives the page_key from a Next.js pathname string.
 * Returns null for excluded/unknown pages.
 */
export function getPageKeyFromPath(pathname: string): string | null {
  return getPageKeyFromRegistry(pathname)
}

// ─── Guide fetching ───────────────────────────────────────────────────────────

/**
 * Fetches a single page guide from Supabase, localised to the given language.
 * Returns null if the guide is not found or the page has no guide.
 */
export async function fetchPageGuide(
  supabase: SupabaseClient,
  pageKey: string,
  lang: "ar" | "en"
): Promise<PageGuide | null> {
  try {
    const guideKey = getGuideKeyForPageKey(pageKey) || pageKey
    const { data, error } = await supabase
      .from("page_guides")
      .select(
        "page_key, title_ar, title_en, description_ar, description_en, " +
        "steps_ar, steps_en, tips_ar, tips_en, " +
        "accounting_pattern_ar, accounting_pattern_en"
      )
      .eq("page_key", guideKey)
      .eq("is_active", true)
      .single()

    if (error || !data) return null

    // Supabase types may not include recently-added columns (accounting_pattern_ar/en).
    // Cast to any to avoid generated-type mismatch until types are regenerated.
    const row = data as any
    const isAr = lang === "ar"
    const rawPattern = isAr ? row.accounting_pattern_ar : row.accounting_pattern_en

    return {
      page_key: row.page_key,
      title: isAr ? row.title_ar : row.title_en,
      description: isAr ? row.description_ar : row.description_en,
      steps: Array.isArray(isAr ? row.steps_ar : row.steps_en)
        ? (isAr ? row.steps_ar : row.steps_en)
        : [],
      tips: Array.isArray(isAr ? row.tips_ar : row.tips_en)
        ? (isAr ? row.tips_ar : row.tips_en)
        : [],
      accounting_pattern: rawPattern ?? null,
    }
  } catch {
    return null
  }
}

// ─── AI Settings cache helpers ────────────────────────────────────────────────

/**
 * Reads AI settings from localStorage.
 * Returns null if the cache is missing or expired.
 */
export function getAISettingsFromCache(): AISettings | null {
  try {
    const ts = localStorage.getItem(AI_SETTINGS_CACHE_TS_KEY)
    if (!ts) return null
    if (Date.now() - Number(ts) > AI_SETTINGS_CACHE_TTL) return null
    const raw = localStorage.getItem(AI_SETTINGS_CACHE_KEY)
    if (!raw) return null
    // Merge with DEFAULT_AI_SETTINGS so any field added in a future schema
    // update always has a safe fallback rather than returning undefined.
    const parsed = JSON.parse(raw) as Partial<AISettings>
    return { ...DEFAULT_AI_SETTINGS, ...parsed }
  } catch {
    return null
  }
}

/**
 * Writes AI settings to localStorage with a fresh timestamp.
 */
export function setAISettingsCache(settings: AISettings): void {
  try {
    localStorage.setItem(AI_SETTINGS_CACHE_KEY, JSON.stringify(settings))
    localStorage.setItem(AI_SETTINGS_CACHE_TS_KEY, String(Date.now()))
  } catch {}
}

/**
 * Invalidates the AI settings cache (call after saving new settings).
 */
export function invalidateAISettingsCache(): void {
  try {
    localStorage.removeItem(AI_SETTINGS_CACHE_KEY)
    localStorage.removeItem(AI_SETTINGS_CACHE_TS_KEY)
  } catch {}
}

// ─── Seen-pages helpers (for auto mode "don't show again") ────────────────────

export function getSeenPages(): Set<string> {
  try {
    const raw = localStorage.getItem(AI_SEEN_PAGES_KEY)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw) as string[])
  } catch {
    return new Set()
  }
}

export function markPageAsSeen(pageKey: string): void {
  try {
    const seen = getSeenPages()
    seen.add(pageKey)
    localStorage.setItem(AI_SEEN_PAGES_KEY, JSON.stringify([...seen]))
  } catch {}
}

export function isPageSeen(pageKey: string): boolean {
  return getSeenPages().has(pageKey)
}

// ─── Fetch AI settings from Supabase ─────────────────────────────────────────

/**
 * Fetches AI settings for a company from Supabase.
 * Falls back to DEFAULT_AI_SETTINGS if no row exists yet.
 */
export async function fetchAISettings(
  supabase: SupabaseClient,
  companyId: string
): Promise<AISettings> {
  try {
    const { data, error } = await supabase
      .from("company_ai_settings")
      .select("ai_assistant_enabled, ai_mode, ai_language_mode, ai_custom_language")
      .eq("company_id", companyId)
      .maybeSingle()

    if (error || !data) return { ...DEFAULT_AI_SETTINGS }

    return {
      ai_assistant_enabled: Boolean(data.ai_assistant_enabled),
      ai_mode: (data.ai_mode ?? "manual") as AISettings["ai_mode"],
      ai_language_mode: (data.ai_language_mode ?? "follow_app_language") as AISettings["ai_language_mode"],
      ai_custom_language: ((data.ai_custom_language === "en" ? "en" : "ar")) as AISettings["ai_custom_language"],
    }
  } catch {
    return { ...DEFAULT_AI_SETTINGS }
  }
}

/**
 * Upserts AI settings for a company in Supabase.
 */
export async function saveAISettings(
  supabase: SupabaseClient,
  companyId: string,
  settings: AISettings
): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase
      .from("company_ai_settings")
      .upsert(
        {
          company_id: companyId,
          ai_assistant_enabled: settings.ai_assistant_enabled,
          ai_mode: settings.ai_mode,
          ai_language_mode: settings.ai_language_mode,
          ai_custom_language: settings.ai_custom_language,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "company_id" }
      )

    if (error) return { error: error.message }
    invalidateAISettingsCache()
    return { error: null }
  } catch (e: any) {
    return { error: e?.message ?? "Unknown error" }
  }
}
