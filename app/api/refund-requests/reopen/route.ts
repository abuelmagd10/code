/**
 * 🔒 API إعادة فتح طلب الاسترداد
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
    
    const { refund_request_id, reason } = body
    
    if (!reason) {
      return NextResponse.json({ 
        error: 'سبب إعادة الفتح مطلوب' 
      }, { status: 400 })
    }
    
    // 1️⃣ التحقق من صلاحية إعادة الفتح
    const { data: { user } } = await supabase.auth.getUser()
    
    const reopenCheck = await RefundPolicyEngine.canReopenRequest(
      supabase,
      user!.id,
      governance.companyId,
      refund_request_id
    )
    
    if (!reopenCheck.canReopen) {
      return NextResponse.json({ 
        error: reopenCheck.error 
      }, { status: 403 })
    }
    
    // 2️⃣ إعادة فتح الطلب
    const { data, error } = await supabase
      .from("refund_requests")
      .update({
        status: 'pending',
        branch_approved_by: null,
        branch_approved_at: null,
        finance_approved_by: null,
        finance_approved_at: null,
        final_approved_by: null,
        final_approved_at: null,
        rejected_by: null,
        rejected_at: null,
        rejection_reason: null,
        notes: `إعادة فتح: ${reason}`
      })
      .eq("id", refund_request_id)
      .select()
      .single()
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    // 3️⃣ إنشاء سجل تدقيق
    await RefundPolicyEngine.createAuditLog(
      supabase,
      refund_request_id,
      'reopened',
      user!.id,
      { reason }
    )
    
    return NextResponse.json({
      success: true,
      data,
      message: 'تم إعادة فتح الطلب بنجاح'
    })
    
  } catch (error: any) {
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 })
  }
}
