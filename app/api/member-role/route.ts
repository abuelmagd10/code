import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const companyId: string = body?.companyId
    const userId: string = body?.userId
    const role: string = body?.role
    if (!companyId || !userId || !role) return NextResponse.json({ error: "missing_params" }, { status: 400 })
    if (!["owner","admin","accountant","viewer"].includes(role)) return NextResponse.json({ error: "invalid_role" }, { status: 400 })
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!url || !serviceKey) return NextResponse.json({ error: "server_not_configured" }, { status: 500 })
    const admin = createClient(url, serviceKey)
    const { error } = await admin.from("company_members").update({ role }).eq("company_id", companyId).eq("user_id", userId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown_error" }, { status: 500 })
  }
}