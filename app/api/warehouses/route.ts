/**
 * 🔒 API المستودعات مع الحوكمة الإلزامية
 * 
 * GET /api/warehouses - جلب المستودعات مع تطبيق الحوكمة
 * POST /api/warehouses - إنشاء مستودع جديد مع الحوكمة
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
 * GET /api/warehouses
 * جلب المستودعات مع تطبيق فلاتر الحوكمة
 */
export async function GET(request: NextRequest) {
  try {
    // 1️⃣ تطبيق الحوكمة (إلزامي)
    const governance = await enforceGovernance(request)
    
    const supabase = await createClient()
    
    // 2️⃣ بناء الاستعلام مع فلاتر الحوكمة
    // Note: Fetching warehouses without relationships to avoid ambiguity
    let query = supabase
      .from("warehouses")
      .select("*")
    
    // 3️⃣ تطبيق فلاتر الحوكمة (إلزامي) - فقط company_id و branch_id (لا warehouse_id لأننا نجلب المخازن نفسها)
    query = query.eq('company_id', governance.companyId)

    // ✅ إذا طُلب branch_id محدد في URL (مثلاً من WarehouseSelector) → نطبقه فوراً بأولوية
    const requestedBranchId = new URL(request.url).searchParams.get("branch_id")
    if (requestedBranchId) {
      // التحقق من أن الفرع المطلوب ضمن الفروع المسموح بها (أو أن المستخدم owner لا قيود عليه)
      if (governance.branchIds.length === 0 || governance.branchIds.includes(requestedBranchId)) {
        query = query.eq('branch_id', requestedBranchId)
      } else {
        // الفرع المطلوب خارج نطاق صلاحيات المستخدم → نطبق فلتر الحوكمة الاعتيادي
        query = query.in('branch_id', governance.branchIds)
      }
    } else if (governance.branchIds.length > 0) {
      // ✅ استخدام .in() للسماح بالمخازن المرتبطة بأي من الفروع المسموح بها
      query = query.in('branch_id', governance.branchIds)
    }
    
    // ✅ لا نطبق فلتر warehouse_id لأننا نجلب المخازن نفسها
    // ✅ لا نطبق فلتر cost_center_id لأننا نجلب المخازن نفسها
    
    query = query.order("is_main", { ascending: false }).order("name")

    const { data: warehouses, error: dbError } = await query

    if (dbError) {
      console.error("[API /warehouses] Database error:", dbError)
      return NextResponse.json({ 
        error: dbError.message,
        error_ar: "خطأ في جلب المستودعات"
      }, { status: 500 })
    }

    // Fetch branch and cost center data separately to avoid relationship ambiguity
    const warehousesWithRelations = await Promise.all(
      (warehouses || []).map(async (wh: any) => {
        const result: any = { ...wh }
        
        // Fetch branch data if branch_id exists
        if (wh.branch_id) {
          const { data: branchData } = await supabase
            .from("branches")
            .select("id, name, branch_name")
            .eq("id", wh.branch_id)
            .single()
          if (branchData) {
            result.branches = branchData
          }
        }
        
        // Fetch cost center data if cost_center_id exists
        if (wh.cost_center_id) {
          const { data: ccData } = await supabase
            .from("cost_centers")
            .select("id, cost_center_name")
            .eq("id", wh.cost_center_id)
            .single()
          if (ccData) {
            result.cost_centers = ccData
          }
        }
        
        return result
      })
    )

    return NextResponse.json({
      success: true,
      data: warehousesWithRelations,
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
    const governance = await enforceGovernance(request)
    
    // التحقق من الصلاحيات
    if (!['admin', 'gm'].includes(governance.role)) {
      return NextResponse.json({ 
        error: "Insufficient permissions",
        error_ar: "صلاحيات غير كافية" 
      }, { status: 403 })
    }
    
    const body = await request.json()
    
    // 2️⃣ إضافة بيانات الحوكمة تلقائياً (فقط company_id و branch_id - لا warehouse_id لأننا ننشئ مستودعاً جديداً)
    const dataWithGovernance = {
      ...body,
      company_id: governance.companyId,
      branch_id: body.branch_id || (governance.branchIds.length > 0 ? governance.branchIds[0] : null),
      // ✅ لا نضيف warehouse_id و cost_center_id لأننا ننشئ مستودعاً جديداً
    }
    
    // 3️⃣ التحقق من صحة البيانات (إلزامي) - لكن نتحقق فقط من company_id و branch_id
    if (dataWithGovernance.company_id !== governance.companyId) {
      throw new Error('Governance Violation: Invalid company_id')
    }
    if (dataWithGovernance.branch_id && !governance.branchIds.includes(dataWithGovernance.branch_id)) {
      throw new Error('Governance Violation: Invalid branch_id')
    }
    
    const supabase = await createClient()
    
    // 4️⃣ الإدخال في قاعدة البيانات
    const { data: warehouse, error: insertError } = await supabase
      .from("warehouses")
      .insert({
        ...dataWithGovernance,
        is_main: false,
        is_active: body.is_active !== false
      })
      .select("*")
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
        // ✅ لا نرجع warehouse_id و cost_center_id لأننا ننشئ مستودعاً جديداً
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
