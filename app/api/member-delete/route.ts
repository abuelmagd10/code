import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const userId: string = body?.userId
    const companyId: string = body?.companyId
    const fullDelete: boolean = !!body?.fullDelete
    if (!userId || !companyId) return NextResponse.json({ error: "missing_params" }, { status: 400 })
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!url || !serviceKey) return NextResponse.json({ error: "server_not_configured" }, { status: 500 })
    const admin = createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } })
    const { error: delMemErr } = await admin.from("company_members").delete().eq("company_id", companyId).eq("user_id", userId)
    if (delMemErr) return NextResponse.json({ error: delMemErr.message }, { status: 400 })
    if (fullDelete) {
      const { error: delUserErr } = await (admin as any).auth.admin.deleteUser(userId)
      if (delUserErr) return NextResponse.json({ error: delUserErr.message }, { status: 400 })
    }
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown_error" }, { status: 500 })
  }
}