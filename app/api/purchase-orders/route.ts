/**
 * 🔒 API أوامر الشراء مع الحوكمة الإلزامية
 * 
 * GET /api/purchase-orders - جلب أوامر الشراء مع تطبيق الحوكمة
 * POST /api/purchase-orders - إنشاء أمر شراء جديد مع الحوكمة
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
 * GET /api/purchase-orders
 * جلب أوامر الشراء مع تطبيق فلاتر الحوكمة
 */
export async function GET(request: NextRequest) {
  try {
    // 1️⃣ تطبيق الحوكمة (إلزامي)
    const governance = await enforceGovernance()

    const supabase = await createClient()

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status") || undefined

    // 2️⃣ بناء الاستعلام مع فلاتر الحوكمة
    let query = supabase
      .from("purchase_orders")
      .select(`
        *,
        suppliers:supplier_id (id, name, phone, city)
      `)

    if (status && status !== "all") {
      query = query.eq("status", status)
    }

    // 3️⃣ تطبيق فلاتر الحوكمة (إلزامي)
    query = applyGovernanceFilters(query, governance)
    query = query.order("created_at", { ascending: false })

    const { data: orders, error: dbError } = await query

    if (dbError) {
      console.error("[API /purchase-orders] Database error:", dbError)
      return NextResponse.json({
        error: dbError.message,
        error_ar: "خطأ في جلب أوامر الشراء"
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: orders || [],
      meta: {
        total: (orders || []).length,
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
    console.error("[API /purchase-orders] Unexpected error:", error)
    return NextResponse.json({
      error: error.message,
      error_ar: "حدث خطأ غير متوقع"
    }, {
      status: error.message.includes('Unauthorized') ? 401 : 403
    })
  }
}

/**
 * POST /api/purchase-orders
 * إنشاء أمر شراء جديد مع التحقق من الحوكمة
 */
export async function POST(request: NextRequest) {
  try {
    // 1️⃣ تطبيق الحوكمة (إلزامي)
    const governance = await enforceGovernance()

    const body = await request.json()

    // 2️⃣ إضافة بيانات الحوكمة تلقائياً
    const dataWithGovernance = addGovernanceData(body, governance)

    // 3️⃣ التحقق من صحة البيانات (إلزامي)
    validateGovernanceData(dataWithGovernance, governance)

    const supabase = await createClient()

    // --- Product Branch Isolation Check ---
    if (body.items && Array.isArray(body.items) && body.items.length > 0) {
      const productIds = body.items.map((item: any) => item.product_id).filter(Boolean);
      if (productIds.length > 0) {
        const { data: productsData, error: productsError } = await supabase
          .from("products")
          .select("id, branch_id")
          .in("id", productIds);

        if (productsError) {
           return NextResponse.json({ error: "Failed to validate products" }, { status: 500 });
        }

        const isAdmin = ['super_admin', 'admin', 'general_manager', 'gm', 'owner'].includes(governance.role);
        const docBranchId = dataWithGovernance.branch_id;

        if (!isAdmin && docBranchId) {
          for (const product of productsData || []) {
            if (product.branch_id && product.branch_id !== docBranchId) {
              return NextResponse.json({
                error: `Product Branch Isolation Violation: Product ${product.id} (branch ${product.branch_id}) cannot be added to document (branch ${docBranchId})`,
                error_ar: "غير مصرح باستخدام منتجات من فروع أخرى"
              }, { status: 403 });
            }
          }
        }
      }
    }
    // ------------------------------------

    // 4️⃣ الإدخال في قاعدة البيانات
    const { data: newOrder, error: insertError } = await supabase
      .from("purchase_orders")
      .insert(dataWithGovernance)
      .select()
      .single()

    if (insertError) {
      return NextResponse.json({
        error: insertError.message,
        error_ar: "فشل في إنشاء أمر الشراء"
      }, { status: 500 })
    }

    // --- Insert Items if provided ---
    if (body.items && Array.isArray(body.items) && body.items.length > 0) {
      const itemsToInsert = body.items.map((item: any) => ({
        ...item,
        purchase_order_id: newOrder.id
      }));
      const { error: itemsError } = await supabase.from("purchase_order_items").insert(itemsToInsert);
      if (itemsError) {
        console.error("Failed to insert items:", itemsError);
      }
    }

    // 5️⃣ إضافة سجل تدقيق (Enterprise Requirement)
    const { data: { user } } = await supabase.auth.getUser()
    if (user && governance.companyId) {
      await supabase.from("audit_logs").insert({
        company_id: governance.companyId,
        user_id: user.id,
        action: "po_created",
        entity_type: "purchase_order",
        entity_id: newOrder.id,
        new_values: newOrder,
        created_at: new Date().toISOString()
      })
    }

    return NextResponse.json({
      success: true,
      data: newOrder,
      message: "Purchase order created successfully",
      message_ar: "تم إنشاء أمر الشراء بنجاح",
      governance: {
        enforced: true,
        companyId: governance.companyId,
        branchId: dataWithGovernance.branch_id,
        warehouseId: dataWithGovernance.warehouse_id,
        costCenterId: dataWithGovernance.cost_center_id
      }
    }, { status: 201 })

  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      error_ar: "حدث خطأ غير متوقع"
    }, {
      status: error.message.includes('Violation') ? 403 : 500
    })
  }
}

