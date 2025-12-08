import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

async function getInvitationByToken(token: string) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""

  if (!url || !serviceKey) {
    console.error("Missing Supabase config:", { url: !!url, serviceKey: !!serviceKey })
    return { error: "config_error", message: "خطأ في إعدادات الخادم", status: 500 }
  }

  const admin = createClient(url, serviceKey)

  const { data: invitation, error } = await admin
    .from("company_invitations")
    .select("id, email, role, company_id, accepted, expires_at, companies(name)")
    .eq("accept_token", token)
    .single()

  if (error || !invitation) {
    return { error: "invalid", message: "رابط الدعوة غير صالح", status: 404 }
  }

  if (invitation.accepted) {
    return { error: "accepted", message: "تم قبول هذه الدعوة مسبقاً", status: 400 }
  }

  if (new Date(invitation.expires_at) < new Date()) {
    return {
      error: "expired",
      message: "انتهت صلاحية هذه الدعوة",
      email: invitation.email,
      company_name: (invitation.companies as any)?.name || 'شركة',
      status: 400
    }
  }

  return {
    success: true,
    invitation: {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      company_id: invitation.company_id,
      company_name: (invitation.companies as any)?.name || 'شركة',
      expires_at: invitation.expires_at
    }
  }
}

// GET request - for direct URL access
export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token")

    if (!token) {
      return NextResponse.json({ error: "missing_token", message: "Token is required" }, { status: 400 })
    }

    const result = await getInvitationByToken(token)
    return NextResponse.json(result, { status: result.status || 200 })
  } catch (e: any) {
    return NextResponse.json({ error: "server_error", message: "حدث خطأ في الخادم" }, { status: 500 })
  }
}

// POST request - for form submission
export async function POST(req: NextRequest) {
  try {
    let body
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "invalid_request", message: "طلب غير صالح" }, { status: 400 })
    }

    const token = body?.token

    if (!token) {
      return NextResponse.json({ error: "missing_token", message: "Token is required" }, { status: 400 })
    }

    const result = await getInvitationByToken(token)
    return NextResponse.json(result, { status: result.status || 200 })
  } catch (e: any) {
    return NextResponse.json({
      error: "server_error",
      message: "حدث خطأ في الخادم"
    }, { status: 500 })
  }
}

