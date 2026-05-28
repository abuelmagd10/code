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
  snippet: string
  score: number
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
 * Look up the canonical route for a page_key from the AI page registry.
 * Returns null when the key has no registered prefix.
 */
function pageKeyToRoute(pageKey: string): string | null {
  const entry = AI_PAGE_KEY_REGISTRY.find((e) => e.key === pageKey)
  return entry?.prefixes?.[0] ?? null
}

/**
 * Search `page_guides` for pages relevant to the user's query.
 *
 * Scoring:
 *   - match in title:        +5 per token
 *   - match in description:  +2 per token
 *   - full query as phrase in title: +10
 *   - full query as phrase in description: +5
 *
 * Guards:
 *   - The current page (where the user is) is always excluded.
 *   - When the user typed 2+ meaningful tokens, a candidate must match
 *     at least 2 distinct tokens (no single-word noise).
 *   - A minimum score floor filters out very weak matches.
 *
 * Returns at most 3 suggestions, sorted by score descending.
 */
export async function findRelevantPages(
  supabase: SupabaseClient,
  query: string,
  currentPageKey: string | null,
  lang: "ar" | "en"
): Promise<PageSuggestion[]> {
  const tokens = tokenize(query, lang)
  if (tokens.length === 0) return []

  const titleField = lang === "ar" ? "title_ar" : "title_en"
  const descField = lang === "ar" ? "description_ar" : "description_en"

  // Build a Supabase .or() filter that matches if ANY token appears in
  // either the title or the description (case-insensitive).
  const orParts: string[] = []
  for (const tok of tokens) {
    const safe = tok.replace(/[%_,]/g, "")
    if (!safe) continue
    orParts.push(`${titleField}.ilike.%${safe}%`)
    orParts.push(`${descField}.ilike.%${safe}%`)
  }
  if (orParts.length === 0) return []

  const { data, error } = await supabase
    .from("page_guides")
    .select(
      `page_key, title_ar, title_en, description_ar, description_en`
    )
    .eq("is_active", true)
    .or(orParts.join(","))
    .limit(20)

  if (error || !data) return []

  const scored: PageSuggestion[] = []
  // Lowercased query, used for full-phrase bonus
  const queryLc = query.toLowerCase().trim()

  for (const row of data as any[]) {
    if (!row?.page_key) continue
    if (row.page_key === currentPageKey) continue

    const rawTitle: unknown = lang === "ar" ? row.title_ar : row.title_en
    const rawDesc: unknown = lang === "ar" ? row.description_ar : row.description_en
    const title = typeof rawTitle === "string" ? rawTitle.trim() : ""
    const desc = typeof rawDesc === "string" ? rawDesc.trim() : ""
    const route = pageKeyToRoute(row.page_key)

    if (!title || !route) continue

    let score = 0
    let distinctTokensMatched = 0
    const titleLc = title.toLowerCase()
    const descLc = desc.toLowerCase()
    let snippet = desc.slice(0, 140)

    for (const tok of tokens) {
      let tokenContributed = false
      if (titleLc.includes(tok)) {
        score += 5
        tokenContributed = true
      }
      if (descLc.includes(tok)) {
        score += 2
        tokenContributed = true
        const idx = descLc.indexOf(tok)
        if (idx >= 0) {
          const start = Math.max(0, idx - 30)
          const end = Math.min(desc.length, idx + tok.length + 80)
          snippet = (start > 0 ? "..." : "") + desc.slice(start, end) +
            (end < desc.length ? "..." : "")
        }
      }
      if (tokenContributed) distinctTokensMatched++
    }

    // Phrase bonus: the entire query (after trim) appears verbatim
    if (queryLc.length >= 4) {
      if (titleLc.includes(queryLc)) score += 10
      else if (descLc.includes(queryLc)) score += 5
    }

    // Multi-token requirement: when the user typed 2+ meaningful tokens,
    // a page that only matches one of them is too weak to suggest.
    if (tokens.length >= 2 && distinctTokensMatched < 2) {
      continue
    }

    // Score floor: do not surface very weak matches even if they pass
    // the multi-token gate.
    const MIN_SCORE = tokens.length >= 2 ? 8 : 5
    if (score < MIN_SCORE) continue

    scored.push({
      pageKey: row.page_key,
      title,
      route,
      snippet,
      score,
    })
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, 3)
}
