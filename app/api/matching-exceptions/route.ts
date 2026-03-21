/**
 * 🔍 API استثناءات المطابقة الثلاثية
 * 
 * GET /api/matching-exceptions - جلب استثناءات المطابقة
 * PUT /api/matching-exceptions/[id] - حل استثناء مطابقة
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { enforceGovernance } from "@/lib/governance-middleware"
import { resolveMatchingException } from "@/lib/three-way-matching"

/**
 * GET /api/matching-exceptions
 * جلب استثناءات المطابقة مع تطبيق فلاتر الحوكمة
 */
export async function GET(request: NextRequest) {
  try {
    // 1️⃣ تطبيق الحوكمة (إلزامي)
    const governance = await enforceGovernance()

    const supabase = await createClient()

    const { searchParams } = new URL(request.url)
    const bill_id = searchParams.get("bill_id") || undefined
    const status = searchParams.get("status") || undefined
    const exception_type = searchParams.get("exception_type") || undefined

    // 2️⃣ بناء الاستعلام
    let query = supabase
      .from("matching_exceptions")
      .select(`
        *,
        purchase_order:purchase_orders!purchase_order_id (id, po_number),
        goods_receipt:goods_receipts!goods_receipt_id (id, grn_number),
        bill:bills!bill_id (id, bill_number),
        product:products!product_id (id, name, sku)
      `)
      .eq("company_id", governance.companyId)

    if (bill_id) {
      query = query.eq("bill_id", bill_id)
    }

    if (status && status !== "all") {
      query = query.eq("status", status)
    }

    if (exception_type) {
      query = query.eq("exception_type", exception_type)
    }

    query = query.order("created_at", { ascending: false })

    const { data: exceptions, error: dbError } = await query

    if (dbError) {
      console.error("[API /matching-exceptions] Database error:", dbError)
      return NextResponse.json({
        error: dbError.message,
        error_ar: "خطأ في جلب استثناءات المطابقة"
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: exceptions || [],
      meta: {
        total: (exceptions || []).length,
        role: governance.role
      }
    })

  } catch (error: any) {
    console.error("[API /matching-exceptions] Unexpected error:", error)
    return NextResponse.json({
      error: error.message,
      error_ar: "حدث خطأ غير متوقع"
    }, {
      status: error.message.includes('Unauthorized') ? 401 : 403
    })
  }
}

/**
 * PUT /api/matching-exceptions/[id]
 * حل استثناء مطابقة
 */
export async function PUT(request: NextRequest) {
  try {
    // 1️⃣ تطبيق الحوكمة (إلزامي)
    const governance = await enforceGovernance()

    const body = await request.json()
    const { id, resolution_notes } = body

    if (!id) {
      return NextResponse.json({
        error: "id is required",
        error_ar: "معرف الاستثناء مطلوب"
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

    // 2️⃣ حل الاستثناء
    const result = await resolveMatchingException(
      supabase,
      id,
      governance.companyId,
      user.id,
      resolution_notes
    )

    if (!result.success) {
      return NextResponse.json({
        error: result.error || "Failed to resolve exception",
        error_ar: "فشل حل الاستثناء"
      }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      message: "Exception resolved successfully",
      message_ar: "تم حل الاستثناء بنجاح"
    })

  } catch (error: any) {
    console.error("[API /matching-exceptions] Unexpected error:", error)
    return NextResponse.json({
      error: error.message,
      error_ar: "حدث خطأ غير متوقع"
    }, {
      status: error.message.includes('Unauthorized') ? 401 : 403
    })
  }
}
