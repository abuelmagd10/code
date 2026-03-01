/**
 * 🔒 API فواتير الشراء مع الحوكمة الإلزامية
 * 
 * GET /api/bills - جلب فواتير الشراء مع تطبيق الحوكمة
 * POST /api/bills - إنشاء فاتورة شراء جديدة مع الحوكمة
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  enforceGovernance,
  applyGovernanceFilters,
  validateGovernanceData,
  addGovernanceData
} from "@/lib/governance-middleware"
import { validateShippingProviderForBranch } from "@/lib/shipping-provider-branch"

/**
 * GET /api/bills
 * جلب فواتير الشراء مع تطبيق فلاتر الحوكمة
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
      .from("bills")
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

    const { data: bills, error: dbError } = await query

    if (dbError) {
      console.error("[API /bills] Database error:", dbError)
      return NextResponse.json({ 
        error: dbError.message, 
        error_ar: "خطأ في جلب فواتير الشراء" 
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: bills || [],
      meta: {
        total: (bills || []).length,
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
    console.error("[API /bills] Unexpected error:", error)
    return NextResponse.json({ 
      error: error.message, 
      error_ar: "حدث خطأ غير متوقع" 
    }, { 
      status: error.message.includes('Unauthorized') ? 401 : 403 
    })
  }
}

/**
 * POST /api/bills
 * إنشاء فاتورة شراء جديدة مع التحقق من الحوكمة
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
    
    // 4️⃣ الإدخال في قاعدة البيانات
    const { data: newBill, error: insertError } = await supabase
      .from("bills")
      .insert(dataWithGovernance)
      .select()
      .single()

    if (insertError) {
      return NextResponse.json({ 
        error: insertError.message, 
        error_ar: "فشل في إنشاء فاتورة الشراء" 
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: newBill,
      message: "Bill created successfully",
      message_ar: "تم إنشاء فاتورة الشراء بنجاح",
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
