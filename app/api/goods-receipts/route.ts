/**
 * 🔒 API إيصالات استلام البضاعة مع الحوكمة الإلزامية
 * 
 * GET /api/goods-receipts - جلب إيصالات الاستلام مع تطبيق الحوكمة
 * POST /api/goods-receipts - إنشاء إيصال استلام جديد مع الحوكمة
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
 * GET /api/goods-receipts
 * جلب إيصالات الاستلام مع تطبيق فلاتر الحوكمة
 */
export async function GET(request: NextRequest) {
  try {
    // 1️⃣ تطبيق الحوكمة (إلزامي)
    const governance = await enforceGovernance()

    const supabase = await createClient()

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status") || undefined
    const purchase_order_id = searchParams.get("purchase_order_id") || undefined

    // 2️⃣ بناء الاستعلام مع فلاتر الحوكمة
    let query = supabase
      .from("goods_receipts")
      .select(`
        *,
        purchase_order:purchase_orders!purchase_order_id (id, po_number),
        bill:bills!bill_id (id, bill_number),
        received_by_user:received_by (id, email),
        goods_receipt_items (*)
      `)

    if (status && status !== "all") {
      query = query.eq("status", status)
    }

    if (purchase_order_id) {
      query = query.eq("purchase_order_id", purchase_order_id)
    }

    // 3️⃣ تطبيق فلاتر الحوكمة (إلزامي)
    query = applyGovernanceFilters(query, governance)
    query = query.order("created_at", { ascending: false })

    const { data: receipts, error: dbError } = await query

    if (dbError) {
      console.error("[API /goods-receipts] Database error:", dbError)
      return NextResponse.json({
        error: dbError.message,
        error_ar: "خطأ في جلب إيصالات الاستلام"
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: receipts || [],
      meta: {
        total: (receipts || []).length,
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
    console.error("[API /goods-receipts] Unexpected error:", error)
    const errorMessage = error?.message || String(error) || 'Unknown error'
    return NextResponse.json({
      error: errorMessage,
      error_ar: "حدث خطأ غير متوقع"
    }, {
      status: errorMessage.includes('Unauthorized') ? 401 : 403
    })
  }
}

/**
 * POST /api/goods-receipts
 * إنشاء إيصال استلام جديد مع التحقق من الحوكمة
 */
export async function POST(request: NextRequest) {
  try {
    // 1️⃣ تطبيق الحوكمة (إلزامي)
    const governance = await enforceGovernance()

    const body = await request.json()
    const { items, ...receiptData } = body

    // 2️⃣ إضافة بيانات الحوكمة تلقائياً
    const dataWithGovernance = addGovernanceData({
      ...receiptData,
      status: 'draft'
    }, governance)

    // 3️⃣ التحقق من صحة البيانات (إلزامي)
    validateGovernanceData(dataWithGovernance, governance)

    // 4️⃣ التحقق من وجود warehouse (مطلوب)
    if (!dataWithGovernance.warehouse_id) {
      return NextResponse.json({
        error: "warehouse_id is required",
        error_ar: "معرف المخزن مطلوب"
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

    // 5️⃣ إنشاء إيصال الاستلام
    const { data: goodsReceipt, error: receiptError } = await supabase
      .from("goods_receipts")
      .insert(dataWithGovernance)
      .select()
      .single()

    if (receiptError) {
      console.error("[API /goods-receipts] Insert error:", receiptError)
      return NextResponse.json({
        error: receiptError.message,
        error_ar: "خطأ في إنشاء إيصال الاستلام"
      }, { status: 500 })
    }

    // 6️⃣ إنشاء بنود الاستلام
    if (items && items.length > 0) {
      const receiptItems = items.map((item: any) => ({
        goods_receipt_id: goodsReceipt.id,
        purchase_order_item_id: item.purchase_order_item_id || null,
        product_id: item.product_id || null,
        quantity_ordered: item.quantity_ordered || 0,
        quantity_received: item.quantity_received || 0,
        quantity_accepted: item.quantity_accepted || 0,
        quantity_rejected: item.quantity_rejected || 0,
        unit_price: item.unit_price || 0,
        line_total: (item.quantity_accepted || 0) * (item.unit_price || 0),
        rejection_reason: item.rejection_reason || null,
        item_type: item.item_type || 'product',
        notes: item.notes || null
      }))

      const { error: itemsError } = await supabase
        .from("goods_receipt_items")
        .insert(receiptItems)

      if (itemsError) {
        console.error("[API /goods-receipts] Items insert error:", itemsError)
        // Rollback: delete the receipt
        await supabase.from("goods_receipts").delete().eq("id", goodsReceipt.id)
        return NextResponse.json({
          error: itemsError.message,
          error_ar: "خطأ في إنشاء بنود الاستلام"
        }, { status: 500 })
      }
    }

    // 7️⃣ Audit log
    await supabase.from("audit_logs").insert({
      company_id: governance.companyId,
      user_id: user.id,
      action: "goods_receipt_created",
      entity_type: "goods_receipt",
      entity_id: goodsReceipt.id,
      new_values: { status: 'draft' },
      created_at: new Date().toISOString()
    })

    return NextResponse.json({
      success: true,
      data: goodsReceipt
    }, { status: 201 })

  } catch (error: any) {
    console.error("[API /goods-receipts] Unexpected error:", error)
    const errorMessage = error?.message || String(error) || 'Unknown error'
    return NextResponse.json({
      error: errorMessage,
      error_ar: "حدث خطأ غير متوقع"
    }, {
      status: errorMessage.includes('Unauthorized') ? 401 : 403
    })
  }
}
