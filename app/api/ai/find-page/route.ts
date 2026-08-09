import { NextRequest, NextResponse } from "next/server"
import { secureApiRequest } from "@/lib/api-security-enhanced"
import { createClient } from "@/lib/supabase/server"
import { DEFAULT_ROLE_PAGES } from "@/lib/role-default-pages"
import {
  findRelevantPages,
  type GovernanceContext,
} from "@/lib/ai/cross-page-search"

/**
 * GET /api/ai/find-page?q=...&pageKey=...&language=ar|en
 *
 * Returns at most 3 page suggestions whose page_guides entries match
 * the user's query. The current page (pageKey) is excluded.
 *
 * Governance:
 *   - Owner / Admin / General Manager: see all pages.
 *   - Other roles: only pages whose `resource` is allowed for their role
 *     (defaults per-role + custom rows in company_role_permissions).
 *
 * Read-only. Respects RLS on page_guides + per-role permissions.
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

    const governance = await buildGovernanceContext(
      supabase,
      security.companyId,
      security.user.id,
      security.member?.role || null
    )

    const matches = await findRelevantPages(
      supabase,
      query,
      pageKey,
      language,
      governance
    )

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

/**
 * Build the GovernanceContext used to filter cross-page suggestions.
 *
 * Mirrors the access-context.tsx role logic on the server side:
 *   1. Full-access roles (owner/admin/general_manager) bypass the filter.
 *   2. Other roles get a default page set + customizations from
 *      company_role_permissions (can_access = true/false).
 */
async function buildGovernanceContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  userId: string,
  cachedRole: string | null
): Promise<GovernanceContext> {
  const role = String(cachedRole || "").trim().toLowerCase()
  const isFullAccess = ["owner", "admin"].includes(role)

  if (isFullAccess) {
    return {
      role,
      isFullAccess: true,
      allowedResources: new Set<string>(),
    }
  }

  // company_role_permissions is the source of truth when the admin has
  // configured anything for this (company, role). Hardcoded defaults are
  // only a fallback for brand-new companies that haven't configured perms.
  const allowedResources = new Set<string>()

  try {
    const { data: permissions } = await supabase
      .from("company_role_permissions")
      .select("resource, can_access, can_read, all_access")
      .eq("company_id", companyId)
      .eq("role", role)

    const rows = Array.isArray(permissions) ? permissions : []

    if (rows.length > 0) {
      // Admin has configured this role - use ONLY the configured permissions.
      for (const perm of rows as Array<{
        resource?: string | null
        can_access?: boolean | null
        can_read?: boolean | null
        all_access?: boolean | null
      }>) {
        if (!perm?.resource) continue
        const granted = perm.can_access === true
          || perm.can_read === true
          || perm.all_access === true
        if (granted) {
          allowedResources.add(perm.resource)
        }
      }
    } else {
      // No configuration yet - fall back to role defaults.
      for (const r of (DEFAULT_ROLE_PAGES[role] ?? [])) {
        allowedResources.add(r)
      }
    }
  } catch {
    // Silent: on error, fall back to defaults so user is not locked out.
    for (const r of (DEFAULT_ROLE_PAGES[role] ?? [])) {
      allowedResources.add(r)
    }
  }

  // Dashboard is always allowed (matches sidebar behaviour).
  allowedResources.add("dashboard")

  return {
    role,
    isFullAccess: false,
    allowedResources,
  }
}

// v3.74.965 - البيتُ الوحيد لهذه القائمة: lib/role-default-pages.ts
//
// وكانت هنا نسخةٌ ثالثةٌ مكتوبةٌ بخطِّ اليد، **وأوسعُ الثلاث بكثير**:
// كانت تُعطى مسؤولَ المشتريات bills و journal_entries و banking و
// shareholders و chart_of_accounts - أى قائمةَ محاسبٍ كاملة. وهذا يناقض
// قاعدةَ المشروع صراحةً: مسؤولُ المشتريات لا يرى فواتيرَ الشراء.
//
// وليست ميتةً تماماً: تُقرأ حين لا يكون للدور صفٌّ واحد، **وفى مُلتقَط
// الخطأ أيضاً** - أى عند عُطلٍ عابرٍ فى القاعدة، وهو وارد.
//
// فصارت تُستورَد من البيت الواحد. والمحتوى الموحَّد منقولٌ عن
// access-context لأنّه الأدقُّ ولأنّه يوافق ما فى قاعدة البيانات.
