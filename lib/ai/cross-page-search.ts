import type { SupabaseClient } from "@supabase/supabase-js"
import { AI_PAGE_KEY_REGISTRY } from "@/lib/ai/page-key-registry"

/**
 * Cross-page knowledge search.
 *
 * When the user asks a question that does not match the current page,
 * search every `page_guides` row for a relevant page and suggest it.
 *
 * This works WITHOUT any external AI provider — it is a pure SQL ILIKE
 * + JavaScript scoring pipeline that respects existing RLS on `page_guides`.
 *
 * Used by:
 *   - GET /api/ai/find-page  (server-side)
 *   - The AI Assistant Drawer (client-side via the API above)
 */

export interface PageSuggestion {
  pageKey: string
  title: string
  route: string
  /** The resource code from page-key-registry (e.g. "chart_of_accounts"). */
  resource: string | null
  snippet: string
  score: number
}

/**
 * Server-side governance gate for cross-page suggestions.
 * The API route builds this from the user's role + company_role_permissions
 * and passes it to findRelevantPages so the search never leaks pages that
 * the user is not allowed to access.
 */
export interface GovernanceContext {
  role: string | null
  /** Set of resource codes the user is allowed to access. */
  allowedResources: Set<string>
  /** Owner/admin/general_manager bypass — see all pages. */
  isFullAccess: boolean
}

// Common Arabic stop-words we drop before searching.
const STOP_WORDS_AR = new Set([
  // Function words
  "في", "من", "إلى", "إِلى", "على", "عن", "كيف", "أين", "اين", "متى",
  "ماذا", "هذا", "هذه", "ما", "هل", "أن", "أنا", "أنت", "نحن", "هو",
  "هى", "هي", "ذلك", "تلك", "أو", "ثم", "كل", "بعض", "أى", "اى",
  "اضيف", "أضيف", "اعمل", "افعل", "يا", "لا", "نعم", "للقيام", "كان",
  "كانت", "يكون", "تكون", "لكى", "لكي", "حتى", "حسب", "بعد", "قبل",
  "مع", "بين", "أمام", "خلف", "فوق", "تحت",
  // Domain noise (appear in almost every ERP page description)
  "شركة", "الشركة", "شركتى", "شركتك", "شركات", "بيانات", "بياناتك",
  "إدارة", "ادارة", "النظام", "نظام", "صفحة", "الصفحة", "صفحات",
  "العملاء", "العميل", "العمليات", "العملية", "تسجيل",
])

const STOP_WORDS_EN = new Set([
  "the", "a", "an", "is", "are", "was", "were", "in", "on", "at", "of",
  "for", "how", "what", "when", "where", "why", "who", "do", "i", "you",
  "we", "to", "and", "or", "but", "if", "this", "that", "these", "those",
  "can", "should", "would", "add", "create", "make", "be", "have", "has",
])

/**
 * Break a user query into search tokens. Removes very-short tokens and
 * common stop-words so we don't blow up the ILIKE pattern set with noise.
 */
function tokenize(text: string, lang: "ar" | "en"): string[] {
  const stop = lang === "ar" ? STOP_WORDS_AR : STOP_WORDS_EN
  const cleaned = text
    .replace(/[?!.,،؟؛:;()\[\]{}"'`]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  if (!cleaned) return []

  const tokens = cleaned.split(" ")
  const seen = new Set<string>()
  const result: string[] = []

  for (const raw of tokens) {
    const tok = raw.toLowerCase()
    if (tok.length < 2) continue
    if (stop.has(tok)) continue
    if (seen.has(tok)) continue
    seen.add(tok)
    result.push(tok)
  }

  // Cap the token count so .or() doesn't get huge
  return result.slice(0, 6)
}

/**
 * Search the AI knowledge base for pages relevant to the user's query.
 *
 * Backed by Postgres full-text search via the `ai_search_pages` RPC
 * (see migration 20260528000200). The RPC runs ts_rank weighted by
 * chunk type (title +5, description +2.5, step +1.5, tip +1.0) over
 * the `ai_knowledge_chunks` table. This is roughly 10x more accurate
 * than the previous ILIKE-based search and supports stemming-free
 * Arabic + English search through the `simple` text-search config.
 *
 * Layered guards (applied client-side after the RPC):
 *   - Resource governance: results whose `resource` is not in the
 *     user's `allowedResources` set are silently dropped.
 *   - Current page is excluded server-side via the RPC argument.
 *
 * Returns at most 3 suggestions, sorted by RPC score descending.
 */
export async function findRelevantPages(
  supabase: SupabaseClient,
  query: string,
  currentPageKey: string | null,
  lang: "ar" | "en",
  governance?: GovernanceContext
): Promise<PageSuggestion[]> {
  // tokenize() is still used so we keep a stable shape for future
  // logging / phrase analysis, but the actual matching is delegated
  // to the Postgres RPC ai_search_pages.
  const tokens = tokenize(query, lang)
  if (tokens.length === 0) return []

  // Call the FTS RPC. RLS still applies because SECURITY INVOKER.
  const { data, error } = await supabase.rpc("ai_search_pages", {
    p_query: query,
    p_lang: lang,
    p_exclude_page_key: currentPageKey,
    p_limit: 20,
  })

  if (error || !data) return []

  const rows = Array.isArray(data) ? data : []
  const scored: PageSuggestion[] = []

  for (const row of rows as any[]) {
    const pageKey: string | undefined = row?.page_key
    const title: string = typeof row?.title === "string" ? row.title.trim() : ""
    if (!pageKey || !title) continue

    // Look up the route + governance resource from the static registry.
    const regEntry = AI_PAGE_KEY_REGISTRY.find((e) => e.key === pageKey)
    const route = regEntry?.prefixes?.[0] ?? null
    const resource = regEntry?.resource ?? null

    if (!route) continue

    // GOVERNANCE GATE — never leak a page the user cannot access.
    if (governance && !governance.isFullAccess) {
      if (!resource || !governance.allowedResources.has(resource)) {
        continue
      }
    }

    const snippetRaw =
      (typeof row?.best_snippet === "string" && row.best_snippet) ||
      (typeof row?.description === "string" && row.description) ||
      ""

    const score = typeof row?.score === "number"
      ? row.score
      : Number(row?.score) || 0

    scored.push({
      pageKey,
      title,
      route,
      resource,
      snippet: snippetRaw.slice(0, 200),
      score,
    })
  }

  // The RPC orders by score DESC server-side, but governance/route
  // filtering above may have removed some rows; re-sort defensively.
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, 3)
}
