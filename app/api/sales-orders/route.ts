/**
 * 🔒 API أوامر البيع مع الحوكمة الإلزامية
 * 
 * GET /api/sales-orders - جلب أوامر البيع مع تطبيق الحوكمة
 * POST /api/sales-orders - إنشاء أمر بيع جديد مع الحوكمة
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

/**
 * GET /api/sales-orders
 * جلب أوامر البيع مع تطبيق فلاتر الحوكمة
 */
export async function GET(request: NextRequest) {
  try {
    // 1️⃣ تطبيق الحوكمة (إلزامي)
    const governance = await enforceGovernance(request)
    
    // 2️⃣ بناء الاستعلام مع فلاتر الحوكمة
    const supabase = await createClient()
    let query = supabase
      .from("sales_orders")
      .select(`
        *,
        customers:customer_id (id, name, phone, city)
      `)
    
    // تطبيق الفلاتر
    query = applyGovernanceFilters(query, governance)
    query = query.order("created_at", { ascending: false })

    const { data: orders, error: dbError } = await query

    if (dbError) {
      console.error("[API /sales-orders] Database error:", dbError)
      return NextResponse.json({ 
        error: dbError.message, 
        error_ar: "خطأ في جلب أوامر البيع" 
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
    console.error("[API /sales-orders] Error:", error)
    return NextResponse.json({ 
      error: error.message, 
      error_ar: "حدث خطأ غير متوقع" 
    }, { 
      status: error.message.includes('Unauthorized') ? 401 : 403 
    })
  }
}

/**
 * POST /api/sales-orders
 * إنشاء أمر بيع جديد مع التحقق من الحوكمة واستخدام افتراضيات الفرع
 */
export async function POST(request: NextRequest) {
  try {
    // 1️⃣ تطبيق الحوكمة الأساسية (إلزامي)
    const governance = await enforceGovernance(request)
    
    const body = await request.json()
    
    // 2️⃣ تطبيق افتراضيات الفرع (Enterprise Pattern: User → Branch → Defaults)
    const { enforceBranchDefaults, validateBranchDefaults, buildSalesOrderData } = await import('@/lib/governance-branch-defaults')
    const supabase = await createClient()
    const enhancedContext = await enforceBranchDefaults(governance, body, supabase)
    
    // 3️⃣ بناء البيانات النهائية مع الحوكمة المحسنة
    const finalData = buildSalesOrderData(body, enhancedContext)
    
    // 4️⃣ التأكد من أن company_id موجود
    if (!finalData.company_id && governance.companyId) {
      finalData.company_id = governance.companyId
    }
    
    // 5️⃣ التحقق من صحة البيانات قبل الإدخال
    validateBranchDefaults(finalData, enhancedContext)
    
    // 6️⃣ التحقق من أن المستودع ومركز التكلفة ينتميان للفرع
    if (finalData.branch_id && finalData.warehouse_id) {
      const { data: warehouse, error: whError } = await supabase
        .from("warehouses")
        .select("branch_id")
        .eq("id", finalData.warehouse_id)
        .single()
      
      if (whError || !warehouse) {
        return NextResponse.json({ 
          error: "Warehouse not found",
          error_ar: "المخزن المحدد غير موجود" 
        }, { status: 400 })
      }
      
      if (warehouse.branch_id !== finalData.branch_id) {
        return NextResponse.json({ 
          error: "Warehouse does not belong to the selected branch",
          error_ar: "المخزن المحدد لا ينتمي للفرع المختار" 
        }, { status: 400 })
      }
    }
    
    if (finalData.branch_id && finalData.cost_center_id) {
      const { data: costCenter, error: ccError } = await supabase
        .from("cost_centers")
        .select("branch_id")
        .eq("id", finalData.cost_center_id)
        .single()
      
      if (ccError || !costCenter) {
        return NextResponse.json({ 
          error: "Cost center not found",
          error_ar: "مركز التكلفة المحدد غير موجود" 
        }, { status: 400 })
      }
      
      if (costCenter.branch_id !== finalData.branch_id) {
        return NextResponse.json({ 
          error: "Cost center does not belong to the selected branch",
          error_ar: "مركز التكلفة المحدد لا ينتمي للفرع المختار" 
        }, { status: 400 })
      }
    }
    
    // 7️⃣ التأكد من أن جميع الحقول المطلوبة موجودة
    if (!finalData.branch_id || !finalData.warehouse_id || !finalData.cost_center_id) {
      return NextResponse.json({ 
        error: "Missing required fields: branch_id, warehouse_id, and cost_center_id are required",
        error_ar: "الحقول المطلوبة مفقودة: يجب تحديد الفرع والمخزن ومركز التكلفة" 
      }, { status: 400 })
    }
    
    // 7️⃣ الإدخال في قاعدة البيانات
    const { data: newSalesOrder, error: insertError } = await supabase
      .from("sales_orders")
      .insert(finalData)
      .select()
      .single()

    if (insertError) {
      // تحسين رسالة الخطأ من قاعدة البيانات
      let errorMessage = insertError.message
      let errorAr = "فشل في إنشاء أمر البيع"
      
      if (insertError.message.includes('governance violation')) {
        if (insertError.message.includes('cannot be NULL')) {
          errorMessage = "Missing required governance fields"
          errorAr = "الحقول المطلوبة للحوكمة مفقودة: يجب تحديد الفرع والمخزن ومركز التكلفة"
        } else if (insertError.message.includes('warehouse_id must belong')) {
          errorMessage = "Warehouse does not belong to the selected branch"
          errorAr = "المخزن المحدد لا ينتمي للفرع المختار"
        } else if (insertError.message.includes('cost_center_id must belong')) {
          errorMessage = "Cost center does not belong to the selected branch"
          errorAr = "مركز التكلفة المحدد لا ينتمي للفرع المختار"
        }
      }
      
      return NextResponse.json({ 
        error: errorMessage, 
        error_ar: errorAr,
        details: insertError.message
      }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      data: newSalesOrder,
      message: "Sales order created successfully",
      message_ar: "تم إنشاء أمر البيع بنجاح",
      governance: {
        enforced: true,
        companyId: enhancedContext.companyId,
        branchId: enhancedContext.branchId,
        warehouseId: enhancedContext.warehouseId,
        costCenterId: enhancedContext.costCenterId,
        role: enhancedContext.role,
        isAdmin: enhancedContext.isAdmin,
        branchDefaults: {
          warehouseId: enhancedContext.warehouseId,
          costCenterId: enhancedContext.costCenterId
        }
      }
    }, { status: 201 })

  } catch (error: any) {
    console.error("[API /sales-orders POST] Error:", error)
    return NextResponse.json({ 
      error: error.message, 
      error_ar: error.message?.includes('Warehouse') || error.message?.includes('Cost center') 
        ? error.message 
        : "حدث خطأ غير متوقع" 
    }, { 
      status: error.message?.includes('Violation') || error.message?.includes('governance') ? 400 : 500 
    })
  }
}

