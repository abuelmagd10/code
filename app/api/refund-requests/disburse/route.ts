/**
 * 🔒 API إصدار سند صرف لطلب الاسترداد
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  enforceGovernance,
  addGovernanceData,
  validateGovernanceData
} from "@/lib/governance-middleware"
import { RefundPolicyEngine } from "@/lib/refund-policy-engine"

export async function POST(request: NextRequest) {
  try {
    const governance = await enforceGovernance()
    const body = await request.json()
    const supabase = await createClient()
    
    const { refund_request_id, payment_method, notes } = body
    
    // 1️⃣ منع إنشاء سند صرف مكرر
    const duplicateCheck = await RefundPolicyEngine.preventDuplicateDisbursement(
      supabase,
      refund_request_id
    )
    
    if (!duplicateCheck.allowed) {
      return NextResponse.json({ 
        error: duplicateCheck.error 
      }, { status: 400 })
    }
    
    // 2️⃣ الحصول على الطلب
    const { data: refundRequest } = await supabase
      .from("refund_requests")
      .select("*")
      .eq("id", refund_request_id)
      .single()
    
    if (!refundRequest) {
      return NextResponse.json({ 
        error: 'طلب الاسترداد غير موجود' 
      }, { status: 404 })
    }
    
    // 3️⃣ إنشاء سند الصرف
    const { data: { user } } = await supabase.auth.getUser()
    
    const voucherData = addGovernanceData({
      voucher_type: 'refund',
      refund_request_id,
      source_type: refundRequest.source_type,
      source_id: refundRequest.source_id,
      amount: refundRequest.approved_amount,
      payment_method,
      notes,
      created_by: user!.id,
      created_at: new Date().toISOString()
    }, governance)
    
    validateGovernanceData(voucherData, governance)
    
    const { data: voucher, error: voucherError } = await supabase
      .from("disbursement_vouchers")
      .insert(voucherData)
      .select()
      .single()
    
    if (voucherError) {
      return NextResponse.json({ 
        error: voucherError.message 
      }, { status: 500 })
    }
    
    // 4️⃣ تحديث طلب الاسترداد
    const { data, error } = await supabase
      .from("refund_requests")
      .update({
        status: 'disbursed',
        disbursement_voucher_id: voucher.id,
        disbursed_by: user!.id,
        disbursed_at: new Date().toISOString()
      })
      .eq("id", refund_request_id)
      .select()
      .single()
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    // 5️⃣ إنشاء سجل تدقيق
    await RefundPolicyEngine.createAuditLog(
      supabase,
      refund_request_id,
      'disbursed',
      user!.id,
      { 
        voucher_id: voucher.id,
        amount: refundRequest.approved_amount,
        payment_method
      }
    )
    
    return NextResponse.json({
      success: true,
      data,
      voucher,
      message: 'تم إصدار سند الصرف بنجاح'
    })
    
  } catch (error: any) {
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 })
  }
}
