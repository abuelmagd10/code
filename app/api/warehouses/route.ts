/**
 * 🔒 API المستودعات مع الحوكمة الإلزامية
 * 
 * GET /api/warehouses - جلب المستودعات مع تطبيق الحوكمة
 * POST /api/warehouses - إنشاء مستودع جديد مع الحوكمة
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
 * GET /api/warehouses
 * جلب المستودعات مع تطبيق فلاتر الحوكمة
 */
export async function GET(request: NextRequest) {
  try {
    // 1️⃣ تطبيق الحوكمة (إلزامي)
    const governance = await enforceGovernance()
    
    const supabase = createClient(cookies())
    
    // 2️⃣ بناء الاستعلام مع فلاتر الحوكمة
    let query = supabase
      .from("warehouses")
      .select("*, branches(id, name, branch_name), cost_centers(id, cost_center_name)")
    
    // 3️⃣ تطبيق فلاتر الحوكمة (إلزامي)
    query = applyGovernanceFilters(query, governance)
    query = query.order("is_main", { ascending: false }).order("name")

    const { data: warehouses, error: dbError } = await query

    if (dbError) {
      console.error("[API /warehouses] Database error:", dbError)
      return NextResponse.json({ 
        error: dbError.message,
        error_ar: "خطأ في جلب المستودعات"
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: warehouses || [],
      meta: {
        total: (warehouses || []).length,
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
    console.error("[API /warehouses] Unexpected error:", error)
    return NextResponse.json({ 
      error: error.message,
      error_ar: "حدث خطأ غير متوقع"
    }, { 
      status: error.message.includes('Unauthorized') ? 401 : 403 
    })
  }
}

/**
 * POST /api/warehouses
 * إنشاء مستودع جديد مع التحقق من الحوكمة
 */
export async function POST(request: NextRequest) {
  try {
    // 1️⃣ تطبيق الحوكمة (إلزامي)
    const governance = await enforceGovernance()
    
    // التحقق من الصلاحيات
    if (!['admin', 'gm'].includes(governance.role)) {
      return NextResponse.json({ 
        error: "Insufficient permissions",
        error_ar: "صلاحيات غير كافية" 
      }, { status: 403 })
    }
    
    const body = await request.json()
    
    // 2️⃣ إضافة بيانات الحوكمة تلقائياً
    const dataWithGovernance = addGovernanceData(body, governance)
    
    // 3️⃣ التحقق من صحة البيانات (إلزامي)
    validateGovernanceData(dataWithGovernance, governance)
    
    const supabase = createClient(cookies())
    
    // 4️⃣ الإدخال في قاعدة البيانات
    const { data: warehouse, error: insertError } = await supabase
      .from("warehouses")
      .insert({
        ...dataWithGovernance,
        is_main: false,
        is_active: body.is_active !== false
      })
      .select()
      .single()

    if (insertError) {
      return NextResponse.json({ 
        error: insertError.message,
        error_ar: "فشل في إنشاء المستودع"
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: warehouse,
      message: "Warehouse created successfully",
      message_ar: "تم إنشاء المستودع بنجاح",
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
