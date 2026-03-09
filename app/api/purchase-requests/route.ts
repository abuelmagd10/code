/**
 * 🔒 API طلبات الشراء مع الحوكمة الإلزامية
 * 
 * GET /api/purchase-requests - جلب طلبات الشراء مع تطبيق الحوكمة
 * POST /api/purchase-requests - إنشاء طلب شراء جديد مع الحوكمة
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  enforceGovernance,
  applyGovernanceFilters,
  validateGovernanceData,
  addGovernanceData
} from "@/lib/governance-middleware"

/**
 * GET /api/purchase-requests
 * جلب طلبات الشراء مع تطبيق فلاتر الحوكمة
 */
export async function GET(request: NextRequest) {
  try {
    // 1️⃣ تطبيق الحوكمة (إلزامي)
    const governance = await enforceGovernance()

    const supabase = await createClient()

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status") || undefined
    const priority = searchParams.get("priority") || undefined

    // 2️⃣ بناء الاستعلام مع فلاتر الحوكمة
    let query = supabase
      .from("purchase_requests")
      .select(`
        *,
        requested_by_user:requested_by (id, email),
        approved_by_user:approved_by (id, email),
        converted_to_po:purchase_orders!converted_to_po_id (id, po_number),
        purchase_request_items (*)
      `)

    if (status && status !== "all") {
      query = query.eq("status", status)
    }

    if (priority && priority !== "all") {
      query = query.eq("priority", priority)
    }

    // 3️⃣ تطبيق فلاتر الحوكمة (إلزامي)
    query = applyGovernanceFilters(query, governance)
    query = query.order("created_at", { ascending: false })

    const { data: requests, error: dbError } = await query

    if (dbError) {
      console.error("[API /purchase-requests] Database error:", dbError)
      return NextResponse.json({
        error: dbError.message,
        error_ar: "خطأ في جلب طلبات الشراء"
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: requests || [],
      meta: {
        total: (requests || []).length,
        role: governance.role,
        governance: {
          companyId: governance.companyId,
          branchIds: governance.branchIds,
          warehouseIds: governance.warehouseIds,
          costCenterIds: governance.costCenterIds
        }
      }
    })

  } catch (error: any) {
    console.error("[API /purchase-requests] Unexpected error:", error)
    return NextResponse.json({
      error: error.message,
      error_ar: "حدث خطأ غير متوقع"
    }, {
      status: error.message.includes('Unauthorized') ? 401 : 403
    })
  }
}

/**
 * POST /api/purchase-requests
 * إنشاء طلب شراء جديد مع التحقق من الحوكمة
 */
export async function POST(request: NextRequest) {
  try {
    // 1️⃣ تطبيق الحوكمة (إلزامي)
    const governance = await enforceGovernance()

    const body = await request.json()
    const { items, ...requestData } = body

    // 2️⃣ إضافة بيانات الحوكمة تلقائياً
    const dataWithGovernance = addGovernanceData({
      ...requestData,
      requested_by: governance.userId,
      status: 'draft'
    }, governance)

    // 3️⃣ التحقق من صحة البيانات (إلزامي)
    validateGovernanceData(dataWithGovernance, governance)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({
        error: "Unauthorized",
        error_ar: "غير مصرح"
      }, { status: 401 })
    }

    // 4️⃣ إنشاء طلب الشراء
    const { data: purchaseRequest, error: requestError } = await supabase
      .from("purchase_requests")
      .insert(dataWithGovernance)
      .select()
      .single()

    if (requestError) {
      console.error("[API /purchase-requests] Insert error:", requestError)
      return NextResponse.json({
        error: requestError.message,
        error_ar: "خطأ في إنشاء طلب الشراء"
      }, { status: 500 })
    }

    // 5️⃣ إنشاء بنود الطلب
    if (items && items.length > 0) {
      const requestItems = items.map((item: any) => ({
        purchase_request_id: purchaseRequest.id,
        product_id: item.product_id || null,
        description: item.description || null,
        quantity_requested: item.quantity_requested || 0,
        quantity_approved: 0,
        estimated_unit_price: item.estimated_unit_price || 0,
        estimated_total: (item.quantity_requested || 0) * (item.estimated_unit_price || 0),
        item_type: item.item_type || 'product',
        notes: item.notes || null
      }))

      const { error: itemsError } = await supabase
        .from("purchase_request_items")
        .insert(requestItems)

      if (itemsError) {
        console.error("[API /purchase-requests] Items insert error:", itemsError)
        // Rollback: delete the request
        await supabase.from("purchase_requests").delete().eq("id", purchaseRequest.id)
        return NextResponse.json({
          error: itemsError.message,
          error_ar: "خطأ في إنشاء بنود الطلب"
        }, { status: 500 })
      }
    }

    // 6️⃣ Audit log
    await supabase.from("audit_logs").insert({
      company_id: governance.companyId,
      user_id: governance.userId,
      action: "purchase_request_created",
      entity_type: "purchase_request",
      entity_id: purchaseRequest.id,
      new_values: { status: 'draft' },
      created_at: new Date().toISOString()
    })

    return NextResponse.json({
      success: true,
      data: purchaseRequest
    }, { status: 201 })

  } catch (error: any) {
    console.error("[API /purchase-requests] Unexpected error:", error)
    return NextResponse.json({
      error: error.message,
      error_ar: "حدث خطأ غير متوقع"
    }, {
      status: error.message.includes('Unauthorized') ? 401 : 403
    })
  }
}
