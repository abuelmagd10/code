/**
 * GET /api/permissions/shared-with-me?company_id=<uuid>
 *
 * Returns the active, non-expired permission_sharing rows where the caller
 * is the grantee — i.e. "what has been shared with me?". Joins grantor's
 * email + display name from auth.users for display.
 *
 * v3.71.0 Phase B — backs the "مُشارَك مَعى" panel in /settings/users.
 *
 * Visibility is enforced by the v_shared_with_me VIEW which filters on
 * auth.uid() automatically, so callers can't see other users' inbound shares.
 */
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { createClient as createAdminClient } from "@supabase/supabase-js"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: { getAll() { return cookieStore.getAll() } },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get("company_id")
    if (!companyId) {
      return NextResponse.json({ error: "company_id مطلوب" }, { status: 400 })
    }

    // v3.74.1 — when include_inactive=true, also return deactivated/expired
    // shares from permission_sharing directly (the view filters to active+
    // non-expired only). Default keeps the view (active history).
    const includeInactive = searchParams.get("include_inactive") === "true"

    let shares: any[] | null = null
    let error: any = null
    if (includeInactive) {
      const result = await supabase
        .from("permission_sharing")
        .select("*")
        .eq("company_id", companyId)
        .eq("grantee_user_id", user.id)
        .order("created_at", { ascending: false })
      shares = result.data as any[] | null
      error = result.error
    } else {
      const result = await supabase
        .from("v_shared_with_me")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
      shares = result.data as any[] | null
      error = result.error
    }

    if (error) {
      console.error("[shared-with-me] view query failed:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Enrich with grantor email + display name (best effort, via admin client).
    const grantorIds = Array.from(
      new Set((shares ?? []).map((s: any) => s.grantor_user_id).filter(Boolean))
    )

    let grantorMap: Record<string, { email: string | null; display_name: string | null }> = {}
    if (grantorIds.length > 0) {
      const adminUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ""
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
      if (adminUrl && serviceKey) {
        const admin = createAdminClient(adminUrl, serviceKey, { auth: { persistSession: false } })

        // Pull from public.user_profiles if it exists; fall back to auth.users metadata.
        const { data: profiles } = await admin
          .from("user_profiles")
          .select("user_id, display_name, email")
          .in("user_id", grantorIds)

        for (const p of profiles || []) {
          grantorMap[p.user_id] = {
            email: p.email ?? null,
            display_name: p.display_name ?? null,
          }
        }

        // For any missing, peek at auth.users
        const missing = grantorIds.filter(id => !grantorMap[id])
        for (const uid of missing) {
          try {
            const { data: u } = await admin.auth.admin.getUserById(uid)
            if (u?.user) {
              grantorMap[uid] = {
                email: u.user.email ?? null,
                display_name: (u.user.user_metadata as any)?.display_name
                  ?? (u.user.user_metadata as any)?.name
                  ?? null,
              }
            }
          } catch {
            // ignore — grantor will display as "(غير معروف)"
          }
        }
      }
    }

    const enriched = (shares ?? []).map((s: any) => ({
      ...s,
      grantor_email: grantorMap[s.grantor_user_id]?.email ?? null,
      grantor_name: grantorMap[s.grantor_user_id]?.display_name ?? null,
    }))

    return NextResponse.json({ data: enriched })
  } catch (e: any) {
    console.error("[shared-with-me] unexpected error:", e)
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}
