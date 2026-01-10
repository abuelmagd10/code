/**
 * 🔒 API أوامر البيع مع الحوكمة الإلزامية
 * 
 * GET /api/sales-orders - جلب أوامر البيع مع تطبيق الحوكمة الإلزامية
 * POST /api/sales-orders - إنشاء أمر بيع جديد مع الحوكمة الإلزامية
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"
import { getAccessFilter, getRoleAccessLevel } from "@/lib/validation"
import ERPGovernanceLayer, { GovernanceContext } from "@/lib/erp-governance-layer"
import { SecureQueryBuilder } from "@/lib/api-security-governance"

/**
 * GET /api/sales-orders
 * جلب أوامر البيع مع تطبيق الحوكمة الإلزامية
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // 1️⃣ التحقق من المصادقة
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized", error_ar: "غير مصرح" }, { status: 401 })
    }

    // 2️⃣ جلب الشركة النشطة
    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) {
      return NextResponse.json({ error: "No company found", error_ar: "لا توجد شركة" }, { status: 400 })
    }

    // 3️⃣ 🔒 الحصول على سياق الحوكمة الإلزامي
    let governance: GovernanceContext
    try {
      governance = await ERPGovernanceLayer.getUserGovernanceContext(supabase, user.id, companyId)
    } catch (error: any) {
      return NextResponse.json({ 
        error: error.message, 
        error_ar: "خطأ في سياق الحوكمة" 
      }, { status: 403 })
    }

    // 4️⃣ 🔒 التحقق من الحوكمة الإلزامية
    ERPGovernanceLayer.validateGovernance(governance, true) // نحتاج warehouse لأوامر البيع

    // 5️⃣ جلب معلومات العضوية والدور
    const { data: member } = await supabase
      .from("company_members")
      .select("role")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .maybeSingle()

    const role = member?.role || ""

    // 6️⃣ بناء فلتر الوصول
    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status") || undefined
    const filterByEmployee = searchParams.get("employee_id") || undefined
    
    const accessFilter = getAccessFilter(role, user.id, governance.branchId, governance.costCenterId, filterByEmployee)

    // 7️⃣ 🔒 استخدام SecureQueryBuilder (بدون NULL escapes)
    const queryBuilder = new SecureQueryBuilder(supabase, governance)
    let query = queryBuilder.getSalesOrders()
    
    // إضافة بيانات العملاء
    query = query.select(`
      *,
      customers:customer_id (id, name, phone, city)
    `)

    // 🔒 تطبيق فلتر المنشئ (للموظفين)
    if (accessFilter.filterByCreatedBy && accessFilter.createdByUserId) {
      query = query.eq("created_by_user_id", accessFilter.createdByUserId)
    }

    // تطبيق فلاتر إضافية
    if (status && status !== "all") {
      query = query.eq("status", status)
    }
    
    // ترتيب حسب التاريخ
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
        role,
        accessLevel: getRoleAccessLevel(role),
        governance: {
          branchId: governance.branchId,
          costCenterId: governance.costCenterId,
          warehouseId: governance.warehouseId
        },
        filterApplied: {
          byCreatedBy: accessFilter.filterByCreatedBy,
          byBranch: true, // 🔒 دائماً مفعل
          byCostCenter: true, // 🔒 دائماً مفعل
          byWarehouse: true // 🔒 دائماً مفعل
        }
      }
    })

  } catch (error: any) {
    console.error("[API /sales-orders] Unexpected error:", error)
    return NextResponse.json({ 
      error: error.message, 
      error_ar: "حدث خطأ غير متوقع" 
    }, { status: 500 })
  }
}

/**
 * POST /api/sales-orders
 * إنشاء أمر بيع جديد مع تطبيق الحوكمة الإلزامية
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // 1️⃣ التحقق من المصادقة
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized", error_ar: "غير مصرح" }, { status: 401 })
    }

    // 2️⃣ جلب الشركة النشطة
    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) {
      return NextResponse.json({ error: "No company found", error_ar: "لا توجد شركة" }, { status: 400 })
    }

    // 3️⃣ 🔒 الحصول على سياق الحوكمة الإلزامي
    let governance: GovernanceContext
    try {
      governance = await ERPGovernanceLayer.getUserGovernanceContext(supabase, user.id, companyId)
    } catch (error: any) {
      return NextResponse.json({ 
        error: error.message, 
        error_ar: "خطأ في سياق الحوكمة" 
      }, { status: 403 })
    }

    // 4️⃣ 🔒 التحقق من الحوكمة الإلزامية
    ERPGovernanceLayer.validateGovernance(governance, true) // نحتاج warehouse لأوامر البيع

    // 5️⃣ قراءة بيانات أمر البيع
    const body = await request.json()
    
    // 6️⃣ 🔒 تطبيق الحوكمة الإلزامية على البيانات
    const salesOrderData = ERPGovernanceLayer.enforceGovernanceOnInsert(
      body,
      governance,
      true // نحتاج warehouse لأوامر البيع
    )

    const { data: newSalesOrder, error: insertError } = await supabase
      .from("sales_orders")
      .insert(salesOrderData)
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
        branchId: governance.branchId,
        costCenterId: governance.costCenterId,
        warehouseId: governance.warehouseId,
        enforced: true
      }
    }, { status: 201 })

  } catch (error: any) {
    return NextResponse.json({ 
      error: error.message, 
      error_ar: "حدث خطأ غير متوقع" 
    }, { status: 500 })
  }
}

