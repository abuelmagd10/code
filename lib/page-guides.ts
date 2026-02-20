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

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AISettings {
  ai_assistant_enabled: boolean
  ai_mode: "disabled" | "manual" | "auto"
  ai_language_mode: "follow_app_language" | "custom"
  /** Only used when ai_language_mode = 'custom' */
  ai_custom_language: "ar" | "en"
}

export interface PageGuide {
  page_key: string
  title: string
  description: string
  steps: string[]
  tips: string[]
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
export const PAGE_KEY_MAP: Array<{ prefix: string; key: string }> = [
  // ── Dashboard ────────────────────────────────────────────────────────────
  { prefix: "/dashboard", key: "dashboard" },

  // ── Sales flow ───────────────────────────────────────────────────────────
  { prefix: "/invoices", key: "invoices" },
  { prefix: "/sales-orders", key: "sales_orders" },
  { prefix: "/sales-returns", key: "sales_returns" },
  { prefix: "/sent-invoice-returns", key: "invoices" },
  { prefix: "/estimates", key: "estimates" },
  { prefix: "/customer-debit-notes", key: "customer_debit_notes" },

  // ── Purchase flow ────────────────────────────────────────────────────────
  { prefix: "/bills", key: "bills" },
  { prefix: "/purchase-orders", key: "purchase_orders" },
  { prefix: "/purchase-returns", key: "purchase_returns" },
  { prefix: "/vendor-credits", key: "vendor_credits" },

  // ── Stakeholders ─────────────────────────────────────────────────────────
  { prefix: "/customers", key: "customers" },
  { prefix: "/suppliers", key: "suppliers" },
  { prefix: "/shareholders", key: "shareholders" },

  // ── Products & inventory ──────────────────────────────────────────────────
  { prefix: "/products", key: "products" },
  { prefix: "/inventory-transfers", key: "inventory_transfers" },
  { prefix: "/inventory", key: "inventory" },

  // ── Accounting ───────────────────────────────────────────────────────────
  // FIX: route is /journal-entries, not /journal
  { prefix: "/journal-entries", key: "journal" },
  { prefix: "/chart-of-accounts", key: "chart_of_accounts" },
  { prefix: "/accounting", key: "accounting_periods" },

  // ── Specific report pages (most specific first, then catch-all) ───────────
  { prefix: "/reports/income-statement", key: "income_statement" },
  { prefix: "/reports/balance-sheet-audit", key: "balance_sheet" },
  { prefix: "/reports/balance-sheet", key: "balance_sheet" },
  { prefix: "/reports/accounting-validation", key: "accounting_validation" },
  { prefix: "/reports/trial-balance", key: "trial_balance" },
  { prefix: "/reports/bank-reconciliation", key: "banking" },
  { prefix: "/reports/bank-accounts-by-branch", key: "banking" },
  { prefix: "/reports/bank-transactions", key: "banking" },
  { prefix: "/reports/aging-ar", key: "customers" },
  { prefix: "/reports/aging-ap", key: "suppliers" },
  { prefix: "/reports/inventory-audit", key: "inventory" },
  { prefix: "/reports/inventory-count", key: "inventory" },
  { prefix: "/reports/inventory-valuation", key: "inventory" },
  { prefix: "/reports/warehouse-inventory", key: "inventory" },
  { prefix: "/reports/product-expiry", key: "products" },
  { prefix: "/reports/top-products", key: "products" },
  { prefix: "/reports/sales-by-product", key: "products" },
  { prefix: "/reports/sales", key: "invoices" },
  { prefix: "/reports/sales-invoices-detail", key: "invoices" },
  { prefix: "/reports/sales-discounts", key: "invoices" },
  { prefix: "/reports/invoices", key: "invoices" },
  { prefix: "/reports/purchases", key: "bills" },
  { prefix: "/reports/purchase-bills-detail", key: "bills" },
  { prefix: "/reports/purchase-orders-status", key: "purchase_orders" },
  { prefix: "/reports/purchase-prices-by-period", key: "bills" },
  { prefix: "/reports/supplier-price-comparison", key: "suppliers" },
  { prefix: "/reports/daily-payments-receipts", key: "payments" },
  { prefix: "/reports/dashboard", key: "dashboard" },
  { prefix: "/reports/branch-cost-center", key: "cost_centers" },
  { prefix: "/reports/cost-center-analysis", key: "cost_centers" },
  { prefix: "/reports/sales-bonuses", key: "payroll" },
  { prefix: "/reports/login-activity", key: "settings" },
  { prefix: "/reports/update-account-balances", key: "chart_of_accounts" },
  // Catch-all for any remaining /reports/* pages
  { prefix: "/reports", key: "reports" },

  // ── Closing & finance ────────────────────────────────────────────────────
  { prefix: "/annual-closing", key: "annual_closing" },
  { prefix: "/drawings", key: "drawings" },

  // ── Payments & banking ───────────────────────────────────────────────────
  { prefix: "/payments", key: "payments" },
  { prefix: "/banking", key: "banking" },

  // ── Expenses ─────────────────────────────────────────────────────────────
  { prefix: "/expenses", key: "expenses" },

  // ── HR (specific before generic) ─────────────────────────────────────────
  { prefix: "/hr/payroll", key: "payroll" },
  { prefix: "/hr/employees", key: "employees" },
  { prefix: "/hr/attendance", key: "employees" },
  { prefix: "/hr/instant-payouts", key: "payroll" },
  { prefix: "/hr", key: "employees" },

  // ── Fixed assets ─────────────────────────────────────────────────────────
  { prefix: "/fixed-assets", key: "fixed_assets" },

  // ── Configuration ────────────────────────────────────────────────────────
  { prefix: "/branches", key: "branches" },
  { prefix: "/warehouses", key: "warehouses" },
  { prefix: "/cost-centers", key: "cost_centers" },
  { prefix: "/settings", key: "settings" },
]

/** Pages where the AI assistant should NOT appear */
export const EXCLUDED_PREFIXES = [
  "/auth/",
  "/onboarding",
  "/invitations/",
  "/admin/",
  "/no-access",
  "/no-permissions",
  "/system-status",
  "/test-tooltips",
  "/fix-inv",
  "/fix-invoice",
]

/**
 * Derives the page_key from a Next.js pathname string.
 * Returns null for excluded/unknown pages.
 */
export function getPageKeyFromPath(pathname: string): string | null {
  if (!pathname) return null

  // Exclude auth / public pages
  for (const excl of EXCLUDED_PREFIXES) {
    if (pathname.startsWith(excl)) return null
  }
  // Root redirect page — no guide
  if (pathname === "/" || pathname === "") return null

  // Find the most specific matching prefix (longest wins)
  let bestMatch: { prefix: string; key: string } | null = null
  for (const entry of PAGE_KEY_MAP) {
    if (
      pathname === entry.prefix ||
      pathname.startsWith(entry.prefix + "/") ||
      pathname.startsWith(entry.prefix + "?")
    ) {
      if (!bestMatch || entry.prefix.length > bestMatch.prefix.length) {
        bestMatch = entry
      }
    }
  }

  return bestMatch?.key ?? null
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
    const { data, error } = await supabase
      .from("page_guides")
      .select("page_key, title_ar, title_en, description_ar, description_en, steps_ar, steps_en, tips_ar, tips_en")
      .eq("page_key", pageKey)
      .eq("is_active", true)
      .single()

    if (error || !data) return null

    const isAr = lang === "ar"
    return {
      page_key: data.page_key,
      title: isAr ? data.title_ar : data.title_en,
      description: isAr ? data.description_ar : data.description_en,
      steps: Array.isArray(isAr ? data.steps_ar : data.steps_en)
        ? (isAr ? data.steps_ar : data.steps_en)
        : [],
      tips: Array.isArray(isAr ? data.tips_ar : data.tips_en)
        ? (isAr ? data.tips_ar : data.tips_en)
        : [],
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
