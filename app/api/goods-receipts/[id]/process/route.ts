/**
 * ⚙️ API معالجة إيصال استلام البضاعة
 * 
 * POST /api/goods-receipts/[id]/process - معالجة GRN وإنشاء حركات المخزون
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { enforceGovernance } from "@/lib/governance-middleware"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1️⃣ تطبيق الحوكمة (إلزامي)
    const governance = await enforceGovernance()

    const { id } = await params

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({
        error: "Unauthorized",
        error_ar: "غير مصرح"
      }, { status: 401 })
    }

    // 2️⃣ استدعاء RPC Function للمعالجة
    const { data: result, error: rpcError } = await supabase.rpc(
      'process_goods_receipt_atomic',
      {
        p_grn_id: id,
        p_user_id: user.id,
        p_company_id: governance.companyId
      }
    )

    if (rpcError) {
      console.error("[API /goods-receipts/process] RPC error:", rpcError)
      return NextResponse.json({
        error: rpcError.message,
        error_ar: "خطأ في معالجة إيصال الاستلام"
      }, { status: 500 })
    }

    if (!result || !result.success) {
      return NextResponse.json({
        error: result?.error || "Processing failed",
        error_ar: result?.error || "فشلت المعالجة"
      }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      data: {
        grn_id: result.grn_id,
        status: result.status
      }
    })

  } catch (error: any) {
    console.error("[API /goods-receipts/process] Unexpected error:", error)
    return NextResponse.json({
      error: error.message,
      error_ar: "حدث خطأ غير متوقع"
    }, {
      status: error.message.includes('Unauthorized') ? 401 : 403
    })
  }
}
