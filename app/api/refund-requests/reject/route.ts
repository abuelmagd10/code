/**
 * 🔒 API رفض طلبات الاسترداد
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { enforceGovernance } from "@/lib/governance-middleware"
import { RefundPolicyEngine } from "@/lib/refund-policy-engine"

export async function POST(request: NextRequest) {
  try {
    const governance = await enforceGovernance()
    const body = await request.json()
    const supabase = await createClient()
    
    const { refund_request_id, rejection_reason } = body
    
    if (!rejection_reason) {
      return NextResponse.json({ 
        error: 'سبب الرفض مطلوب' 
      }, { status: 400 })
    }
    
    const { data: { user } } = await supabase.auth.getUser()
    
    const { data, error } = await supabase
      .from("refund_requests")
      .update({
        status: 'rejected',
        rejected_by: user!.id,
        rejected_at: new Date().toISOString(),
        rejection_reason
      })
      .eq("id", refund_request_id)
      .select()
      .single()
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    await RefundPolicyEngine.createAuditLog(
      supabase,
      refund_request_id,
      'rejected',
      user!.id,
      { rejection_reason }
    )
    
    return NextResponse.json({
      success: true,
      data,
      message: 'تم رفض الطلب'
    })
    
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
