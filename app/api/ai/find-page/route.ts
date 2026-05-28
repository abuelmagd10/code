import { NextRequest, NextResponse } from "next/server"
import { secureApiRequest } from "@/lib/api-security-enhanced"
import { createClient } from "@/lib/supabase/server"
import { findRelevantPages } from "@/lib/ai/cross-page-search"

/**
 * GET /api/ai/find-page?q=...&pageKey=...&language=ar|en
 *
 * Returns at most 3 page suggestions whose page_guides entries match
 * the user's query. The current page (pageKey) is excluded.
 *
 * Read-only, governance-aware (RLS on page_guides).
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const security = await secureApiRequest(request, {
      requireAuth: true,
      requireCompany: true,
      supabase,
    })

    if (security.error) return security.error
    if (!security.user || !security.companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const query = (searchParams.get("q") || "").trim()
    const pageKey = searchParams.get("pageKey") || null
    const language = searchParams.get("language") === "en" ? "en" : "ar"

    if (!query) {
      return NextResponse.json({ success: true, matches: [] })
    }

    const matches = await findRelevantPages(supabase, query, pageKey, language)
    return NextResponse.json({ success: true, matches })
  } catch (error: any) {
    console.error("[AI_FIND_PAGE][GET] Error:", error)
    return NextResponse.json(
      {
        error: error?.message || "Failed to search pages",
        matches: [],
      },
      { status: 500 }
    )
  }
}
