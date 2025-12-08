import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// Get invitation details by token (for accepting invitations)
export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json()
    
    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 })
    }
    
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    
    if (!url || !serviceKey) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
    }
    
    const admin = createClient(url, serviceKey)
    
    const { data: invitation, error } = await admin
      .from("company_invitations")
      .select("id, email, role, company_id, accepted, expires_at, companies(name)")
      .eq("accept_token", token)
      .single()
    
    if (error || !invitation) {
      return NextResponse.json({ 
        error: "invalid", 
        message: "رابط الدعوة غير صالح"
      }, { status: 404 })
    }
    
    if (invitation.accepted) {
      return NextResponse.json({ 
        error: "accepted",
        message: "تم قبول هذه الدعوة مسبقاً"
      }, { status: 400 })
    }
    
    if (new Date(invitation.expires_at) < new Date()) {
      return NextResponse.json({ 
        error: "expired",
        message: "انتهت صلاحية هذه الدعوة",
        email: invitation.email,
        company_name: (invitation.companies as any)?.name || 'شركة'
      }, { status: 400 })
    }
    
    return NextResponse.json({
      success: true,
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        company_id: invitation.company_id,
        company_name: (invitation.companies as any)?.name || 'شركة',
        expires_at: invitation.expires_at
      }
    })
  } catch (e: any) {
    return NextResponse.json({ 
      error: "server_error",
      message: "حدث خطأ في الخادم"
    }, { status: 500 })
  }
}

