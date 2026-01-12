/**
 * 🔒 API الموافقة على طلبات الاسترداد
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"
import { enforceGovernance } from "@/lib/governance-middleware"
import { RefundPolicyEngine } from "@/lib/refund-policy-engine"

export async function POST(request: NextRequest) {
  try {
    const governance = await enforceGovernance()
    const body = await request.json()
    const supabase = createClient(cookies())
    
    const { refund_request_id, approved_amount, notes } = body
    
    // 1️⃣ الحصول على الطلب
    const { data: refundRequest, error: fetchError } = await supabase
      .from("refund_requests")
      .select("*")
      .eq("id", refund_request_id)
      .single()
    
    if (fetchError || !refundRequest) {
      return NextResponse.json({ 
        error: 'طلب الاسترداد غير موجود' 
      }, { status: 404 })
    }
    
    // 2️⃣ التحقق من صلاحية الموافقة
    const { data: { user } } = await supabase.auth.getUser()
    
    const approvalCheck = await RefundPolicyEngine.canApprove(
      supabase,
      user!.id,
      governance.companyId,
      refundRequest.requested_amount,
      refundRequest.status
    )
    
    if (!approvalCheck.canApprove) {
      return NextResponse.json({ 
        error: approvalCheck.error 
      }, { status: 403 })
    }
    
    // 3️⃣ تحديث الطلب
    const updateData: any = {
      status: approvalCheck.nextStatus,
      approved_amount: approved_amount || refundRequest.requested_amount
    }
    
    if (approvalCheck.nextStatus === 'branch_approved') {
      updateData.branch_approved_by = user!.id
      updateData.branch_approved_at = new Date().toISOString()
    } else if (approvalCheck.nextStatus === 'finance_approved') {
      updateData.finance_approved_by = user!.id
      updateData.finance_approved_at = new Date().toISOString()
    } else if (approvalCheck.nextStatus === 'approved') {
      updateData.final_approved_by = user!.id
      updateData.final_approved_at = new Date().toISOString()
    }
    
    if (notes) {
      updateData.notes = notes
    }
    
    const { data, error } = await supabase
      .from("refund_requests")
      .update(updateData)
      .eq("id", refund_request_id)
      .select()
      .single()
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    // 4️⃣ إنشاء سجل تدقيق
    await RefundPolicyEngine.createAuditLog(
      supabase,
      refund_request_id,
      'approved',
      user!.id,
      { 
        previous_status: refundRequest.status,
        new_status: approvalCheck.nextStatus,
        approved_amount: updateData.approved_amount,
        notes
      }
    )
    
    return NextResponse.json({
      success: true,
      data,
      message: 'تمت الموافقة بنجاح'
    })
    
  } catch (error: any) {
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 })
  }
}
