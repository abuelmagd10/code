/**
 * 🔒 API العملاء مع الحوكمة الإلزامية
 * 
 * GET /api/customers - جلب العملاء مع تطبيق الحوكمة
 * POST /api/customers - إنشاء عميل جديد مع الحوكمة
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
 * GET /api/customers
 * جلب العملاء مع تطبيق فلاتر الحوكمة
 */
export async function GET(request: NextRequest) {
  try {
    // 1️⃣ تطبيق الحوكمة (إلزامي)
    const governance = await enforceGovernance()
    
    const supabase = createClient(cookies())
    
    // 2️⃣ بناء الاستعلام مع فلاتر الحوكمة
    let query = supabase
      .from("customers")
      .select("*")
    
    // 3️⃣ تطبيق فلاتر الحوكمة (إلزامي)
    query = applyGovernanceFilters(query, governance)
    query = query.order("name")

    const { data: customers, error: dbError } = await query

    if (dbError) {
      console.error("[API /customers] Database error:", dbError)
      return NextResponse.json({
        error: dbError.message,
        error_ar: "خطأ في جلب العملاء"
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: customers || [],
      meta: {
        total: (customers || []).length,
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
    console.error("[API /customers] Unexpected error:", error)
    return NextResponse.json({
      error: error.message,
      error_ar: "حدث خطأ غير متوقع"
    }, { 
      status: error.message.includes('Unauthorized') ? 401 : 403 
    })
  }
}

/**
 * POST /api/customers
 * إنشاء عميل جديد مع التحقق من الحوكمة
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
    
    const supabase = createClient(cookies())
    
    // 4️⃣ الإدخال في قاعدة البيانات
    const { data: newCustomer, error: insertError } = await supabase
      .from("customers")
      .insert(dataWithGovernance)
      .select()
      .single()

    if (insertError) {
      console.error("[API /customers POST] Insert error:", insertError)
      return NextResponse.json({
        error: insertError.message,
        error_ar: "فشل في إنشاء العميل"
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: newCustomer,
      message: "Customer created successfully",
      message_ar: "تم إنشاء العميل بنجاح",
      governance: {
        enforced: true,
        companyId: governance.companyId,
        branchId: dataWithGovernance.branch_id,
        warehouseId: dataWithGovernance.warehouse_id,
        costCenterId: dataWithGovernance.cost_center_id
      }
    }, { status: 201 })

  } catch (error: any) {
    console.error("[API /customers POST] Unexpected error:", error)
    return NextResponse.json({
      error: error.message,
      error_ar: "حدث خطأ غير متوقع"
    }, { 
      status: error.message.includes('Violation') ? 403 : 500 
    })
  }
}
