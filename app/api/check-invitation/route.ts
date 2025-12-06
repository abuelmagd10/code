import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// Check if an email has a pending invitation (for sign-up page)
export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()
    
    if (!email || !email.includes('@')) {
      return NextResponse.json({ hasInvitation: false })
    }
    
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    
    if (!url || !serviceKey) {
      return NextResponse.json({ hasInvitation: false })
    }
    
    const admin = createClient(url, serviceKey)
    
    const { data: invitation } = await admin
      .from("company_invitations")
      .select("company_id, role, accept_token, companies(name)")
      .eq("email", email.toLowerCase())
      .eq("accepted", false)
      .gt("expires_at", new Date().toISOString())
      .limit(1)
      .single()
    
    if (!invitation) {
      return NextResponse.json({ hasInvitation: false })
    }
    
    return NextResponse.json({
      hasInvitation: true,
      invitation: {
        company_id: invitation.company_id,
        company_name: (invitation.companies as any)?.name || 'شركة',
        role: invitation.role,
        accept_token: invitation.accept_token
      }
    })
  } catch (e: any) {
    return NextResponse.json({ hasInvitation: false })
  }
}

