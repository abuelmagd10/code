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
    const enhancedContext = await enforceBranchDefaults(governance, body)
    
    // 3️⃣ بناء البيانات النهائية مع الحوكمة المحسنة
    const finalData = buildSalesOrderData(body, enhancedContext)
    
    // 4️⃣ التحقق من صحة البيانات
    validateBranchDefaults(finalData, enhancedContext)
    
    const supabase = await createClient()
    
    // 5️⃣ الإدخال في قاعدة البيانات
    const { data: newSalesOrder, error: insertError } = await supabase
      .from("sales_orders")
      .insert(finalData)
      .select()
      .single()

    if (insertError) {
      return NextResponse.json({ 
        error: insertError.message, 
        error_ar: "فشل في إنشاء أمر البيع" 
      }, { status: 500 })
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
    return NextResponse.json({ 
      error: error.message, 
      error_ar: "حدث خطأ غير متوقع" 
    }, { 
      status: error.message.includes('Violation') ? 403 : 500 
    })
  }
}

