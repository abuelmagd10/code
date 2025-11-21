import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createSSR } from "@/lib/supabase/server"

export async function GET(req: NextRequest) {
  try {
    const ssr = await createSSR()
    const { data: { user } } = await ssr.auth.getUser()
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!url || !serviceKey) return NextResponse.json({ error: "server_not_configured" }, { status: 500 })
    const admin = createClient(url, serviceKey)
    const { data: member } = await admin.from("company_members").select("company_id, role").eq("user_id", user.id).limit(1)
    const cid = Array.isArray(member) && member[0]?.company_id ? String(member[0].company_id) : ""
    if (!cid) return NextResponse.json({ error: "no_membership" }, { status: 404 })
    const { data: company } = await admin
      .from("companies")
      .select("*")
      .eq("id", cid)
      .maybeSingle()
    if (!company?.id) return NextResponse.json({ error: "company_not_found" }, { status: 404 })
    return NextResponse.json({ company }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown_error" }, { status: 500 })
  }
}