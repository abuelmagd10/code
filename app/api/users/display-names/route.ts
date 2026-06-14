/**
 * v3.74.151 — display-name lookup for a list of user IDs.
 *
 * Why this exists:
 *   Several panels (payment audit trail, refund history, etc.) need to
 *   render "who did this" labels next to log rows. We were resolving
 *   names by joining company_members with employees and falling back to
 *   the member's email column. That fails for legacy owner rows where
 *   company_members.email is NULL — the dialog ended up showing
 *   "مُستَخدِم غَير مُحَدَّد" for entries the user knew were the owner's.
 *
 *   The cleanest fallback is auth.users.email, but the browser can't
 *   read auth.users directly. So we expose a small server endpoint
 *   that:
 *     1) authenticates the caller,
 *     2) confirms each requested user_id is a member of the caller's
 *        active company (no cross-tenant leakage),
 *     3) returns { user_id → label } where label is the first non-empty
 *        of: linked employee.full_name, company_members.email, then
 *        auth.users.email (looked up with the service client).
 *
 * Request body: { userIds: string[] }
 * Response: { names: Record<string, string> } — missing ids are omitted.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) {
      return NextResponse.json({ error: "Company context missing" }, { status: 400 })
    }

    let body: { userIds?: string[] } = {}
    try { body = await request.json() } catch { }

    const rawIds = Array.isArray(body?.userIds) ? body.userIds : []
    const ids = [...new Set(rawIds.filter((x) => typeof x === "string" && x.length > 0))].slice(0, 200)
    if (ids.length === 0) {
      return NextResponse.json({ names: {} })
    }

    let serviceClient: ReturnType<typeof createServiceClient>
    try {
      serviceClient = createServiceClient()
    } catch {
      return NextResponse.json({ names: {} })
    }

    // Confirm caller is themselves a member of this company. If not we
    // refuse the lookup outright — defence in depth even though the
    // session cookie path already implied it.
    const { data: callerMember } = await serviceClient
      .from("company_members")
      .select("user_id")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .maybeSingle()
    if (!callerMember) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Pull employee-linked + email columns for the requested ids that
    // actually belong to this company. Anything outside the company is
    // dropped silently so the API can't be used to enumerate user ids.
    const { data: members } = await serviceClient
      .from("company_members")
      .select("user_id, email, employee_id, employee:employees(full_name)")
      .eq("company_id", companyId)
      .in("user_id", ids)

    const memberByUserId = new Map<string, any>()
    members?.forEach((m: any) => memberByUserId.set(m.user_id, m))

    // Final fallback: auth.users.email. listUsers requires a paginated
    // call in supabase-js v2, so we fetch a generous chunk and filter.
    let authUsers: any[] = []
    try {
      const adminAny = (serviceClient as any).auth?.admin
      if (adminAny && typeof adminAny.listUsers === "function") {
        const { data: page1 } = await adminAny.listUsers({ page: 1, perPage: 1000 })
        if (page1?.users) authUsers = page1.users
      }
    } catch { }
    const emailByUserId = new Map<string, string>()
    authUsers.forEach((u: any) => {
      if (u?.id && u?.email) emailByUserId.set(u.id, u.email)
    })

    const out: Record<string, string> = {}
    for (const id of ids) {
      const m = memberByUserId.get(id)
      if (!m) continue // not in this company — drop
      const empName = m?.employee?.full_name as string | undefined
      const memberEmail = m?.email as string | undefined
      const authEmail = emailByUserId.get(id)
      const label = empName || memberEmail || authEmail || null
      if (label) out[id] = label
    }

    return NextResponse.json({ names: out })
  } catch (e: any) {
    console.error("[USERS_DISPLAY_NAMES]", e?.message || e)
    return NextResponse.json({ names: {} })
  }
}
