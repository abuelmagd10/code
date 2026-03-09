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

    // 2️⃣ قراءة action و reason من body
    const body = await request.json().catch(() => ({}))
    const { action = 'receive', reason } = body

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({
        error: "Unauthorized",
        error_ar: "غير مصرح"
      }, { status: 401 })
    }

    // 3️⃣ معالجة حسب action
    if (action === 'reject') {
      // رفض GRN
      if (!reason || reason.trim() === '') {
        return NextResponse.json({
          error: "Rejection reason is required",
          error_ar: "سبب الرفض مطلوب"
        }, { status: 400 })
      }

      const { data: grn, error: fetchError } = await supabase
        .from('goods_receipts')
        .select('*')
        .eq('id', id)
        .eq('company_id', governance.companyId)
        .single()

      if (fetchError || !grn) {
        return NextResponse.json({
          error: "GRN not found",
          error_ar: "إيصال الاستلام غير موجود"
        }, { status: 404 })
      }

      const { error: updateError } = await supabase
        .from('goods_receipts')
        .update({
          status: 'rejected',
          rejected_by: user.id,
          rejected_at: new Date().toISOString(),
          rejection_reason: reason,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('company_id', governance.companyId)

      if (updateError) {
        return NextResponse.json({
          error: updateError.message,
          error_ar: "خطأ في رفض إيصال الاستلام"
        }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        data: {
          grn_id: id,
          status: 'rejected'
        }
      })

    } else if (action === 'approve') {
      // الموافقة على GRN (لا تزال draft، تحتاج معالجة لاحقاً)
      const { data: grn, error: fetchError } = await supabase
        .from('goods_receipts')
        .select('*')
        .eq('id', id)
        .eq('company_id', governance.companyId)
        .single()

      if (fetchError || !grn) {
        return NextResponse.json({
          error: "GRN not found",
          error_ar: "إيصال الاستلام غير موجود"
        }, { status: 404 })
      }

      // الموافقة تعني فقط تحديث الحالة (لا تزال draft حتى يتم receive)
      const { error: updateError } = await supabase
        .from('goods_receipts')
        .update({
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('company_id', governance.companyId)

      if (updateError) {
        return NextResponse.json({
          error: updateError.message,
          error_ar: "خطأ في الموافقة على إيصال الاستلام"
        }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        data: {
          grn_id: id,
          status: grn.status
        }
      })

    } else {
      // action === 'receive' - استدعاء RPC Function للمعالجة وإنشاء inventory transactions
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
    }

  } catch (error: any) {
    console.error("[API /goods-receipts/process] Unexpected error:", error)
    const errorMessage = error?.message || String(error) || 'Unknown error'
    return NextResponse.json({
      error: errorMessage,
      error_ar: "حدث خطأ غير متوقع"
    }, {
      status: errorMessage.includes('Unauthorized') ? 401 : 403
    })
  }
}
