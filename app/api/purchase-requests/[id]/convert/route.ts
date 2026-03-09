/**
 * 🔄 API تحويل طلب شراء إلى أمر شراء
 * 
 * POST /api/purchase-requests/[id]/convert - تحويل طلب شراء معتمد إلى PO
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
    const body = await request.json()
    const { supplier_id } = body

    if (!supplier_id) {
      return NextResponse.json({
        error: "supplier_id is required",
        error_ar: "معرف المورد مطلوب"
      }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({
        error: "Unauthorized",
        error_ar: "غير مصرح"
      }, { status: 401 })
    }

    // 2️⃣ استدعاء RPC Function للتحويل
    const { data: result, error: rpcError } = await supabase.rpc(
      'convert_purchase_request_to_po',
      {
        p_request_id: id,
        p_user_id: user.id,
        p_company_id: governance.companyId,
        p_supplier_id: supplier_id
      }
    )

    if (rpcError) {
      console.error("[API /purchase-requests/convert] RPC error:", rpcError)
      return NextResponse.json({
        error: rpcError.message,
        error_ar: "خطأ في تحويل طلب الشراء"
      }, { status: 500 })
    }

    if (!result || !result.success) {
      return NextResponse.json({
        error: result?.error || "Conversion failed",
        error_ar: result?.error || "فشل التحويل"
      }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      data: {
        po_id: result.po_id,
        po_number: result.po_number,
        request_id: result.request_id
      }
    })

  } catch (error: any) {
    console.error("[API /purchase-requests/convert] Unexpected error:", error)
    return NextResponse.json({
      error: error.message,
      error_ar: "حدث خطأ غير متوقع"
    }, {
      status: error.message.includes('Unauthorized') ? 401 : 403
    })
  }
}
