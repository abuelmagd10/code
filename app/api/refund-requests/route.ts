/**
 * 🔒 API طلبات الاسترداد مع الحوكمة والموافقات
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"
import { 
  enforceGovernance, 
  applyGovernanceFilters,
  validateGovernanceData,
  addGovernanceData
} from "@/lib/governance-middleware"
import { RefundPolicyEngine } from "@/lib/refund-policy-engine"

export async function GET(request: NextRequest) {
  try {
    const governance = await enforceGovernance()
    const supabase = createClient(cookies())
    
    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status") || undefined
    
    let query = supabase
      .from("refund_requests")
      .select(`
        *,
        requested_by_user:requested_by(id, email, full_name),
        branch_approved_by_user:branch_approved_by(id, email, full_name),
        finance_approved_by_user:finance_approved_by(id, email, full_name),
        final_approved_by_user:final_approved_by(id, email, full_name)
      `)

    if (status && status !== "all") {
      query = query.eq("status", status)
    }

    query = applyGovernanceFilters(query, governance)
    query = query.order("requested_at", { ascending: false })

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      meta: {
        total: (data || []).length,
        role: governance.role
      }
    })

  } catch (error: any) {
    return NextResponse.json({ 
      error: error.message 
    }, { 
      status: error.message.includes('Unauthorized') ? 401 : 403 
    })
  }
}

export async function POST(request: NextRequest) {
  try {
    const governance = await enforceGovernance()
    const body = await request.json()
    const supabase = createClient(cookies())
    
    const { 
      source_type, 
      source_id, 
      requested_amount, 
      reason, 
      attachments 
    } = body
    
    // 1️⃣ التحقق من صلاحية الطلب
    const validation = await RefundPolicyEngine.validateRefundRequest(
      supabase,
      source_type,
      source_id,
      requested_amount
    )
    
    if (!validation.valid) {
      return NextResponse.json({ 
        error: validation.error 
      }, { status: 400 })
    }
    
    // 2️⃣ إضافة بيانات الحوكمة
    const dataWithGovernance = addGovernanceData({
      source_type,
      source_id,
      source_number: validation.sourceData?.invoice_number || 
                     validation.sourceData?.return_number || 
                     validation.sourceData?.payment_number,
      requested_amount,
      reason,
      attachments,
      status: 'pending',
      requested_by: governance.companyId, // سيتم استبداله بـ user_id
      requested_at: new Date().toISOString()
    }, governance)
    
    validateGovernanceData(dataWithGovernance, governance)
    
    // 3️⃣ إنشاء الطلب
    const { data, error } = await supabase
      .from("refund_requests")
      .insert(dataWithGovernance)
      .select()
      .single()
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    // 4️⃣ إنشاء سجل تدقيق
    await RefundPolicyEngine.createAuditLog(
      supabase,
      data.id,
      'created',
      governance.companyId,
      { requested_amount, reason }
    )
    
    return NextResponse.json({
      success: true,
      data,
      message: 'تم إنشاء طلب الاسترداد بنجاح'
    }, { status: 201 })
    
  } catch (error: any) {
    return NextResponse.json({ 
      error: error.message 
    }, { 
      status: error.message.includes('Violation') ? 403 : 500 
    })
  }
}
