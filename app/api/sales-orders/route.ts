/**
 * 🔒 API أوامر البيع مع تطبيق الصلاحيات على مستوى Backend
 * 
 * GET /api/sales-orders - جلب أوامر البيع مع تطبيق الصلاحيات
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"
import { getAccessFilter, getRoleAccessLevel } from "@/lib/validation"

/**
 * GET /api/sales-orders
 * جلب أوامر البيع مع تطبيق الصلاحيات
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

    // 3️⃣ جلب معلومات العضوية والدور
    const { data: member } = await supabase
      .from("company_members")
      .select("role, branch_id, cost_center_id, warehouse_id")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .maybeSingle()

    const role = member?.role || ""
    const branchId = member?.branch_id || null
    const costCenterId = member?.cost_center_id || null

    // 4️⃣ بناء فلتر الوصول
    const { searchParams } = new URL(request.url)
    const filterByEmployee = searchParams.get("employee_id") || undefined
    const status = searchParams.get("status") || undefined
    
    const accessFilter = getAccessFilter(role, user.id, branchId, costCenterId, filterByEmployee)

    // 5️⃣ بناء الاستعلام مع تطبيق الصلاحيات
    let query = supabase
      .from("sales_orders")
      .select(`
        *,
        customers:customer_id (id, name, phone, city)
      `)
      .eq("company_id", companyId)

    // 🔒 تطبيق فلتر المنشئ (للموظفين)
    if (accessFilter.filterByCreatedBy && accessFilter.createdByUserId) {
      query = query.eq("created_by_user_id", accessFilter.createdByUserId)
    }

    // 🔒 تطبيق فلتر الفرع (للمدراء والمحاسبين)
    if (accessFilter.filterByBranch && accessFilter.branchId) {
      query = query.eq("branch_id", accessFilter.branchId)
    }

    // 🔒 تطبيق فلتر مركز التكلفة (للمشرفين)
    if (accessFilter.filterByCostCenter && accessFilter.costCenterId) {
      query = query.eq("cost_center_id", accessFilter.costCenterId)
    }

    // فلتر الحالة
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

    // 6️⃣ جلب الأوامر المشتركة (للموظفين فقط)
    let sharedOrders: any[] = []
    if (accessFilter.filterByCreatedBy) {
      const { data: sharedPerms } = await supabase
        .from("permission_sharing")
        .select("grantor_user_id")
        .eq("grantee_user_id", user.id)
        .eq("company_id", companyId)
        .eq("is_active", true)
        .or("resource_type.eq.all,resource_type.eq.sales_orders")

      if (sharedPerms && sharedPerms.length > 0) {
        const grantorIds = sharedPerms.map((p: any) => p.grantor_user_id)
        let sharedQuery = supabase
          .from("sales_orders")
          .select(`*, customers:customer_id (id, name, phone, city)`)
          .eq("company_id", companyId)
          .in("created_by_user_id", grantorIds)

        if (status && status !== "all") {
          sharedQuery = sharedQuery.eq("status", status)
        }

        const { data: sharedData } = await sharedQuery
        sharedOrders = sharedData || []
      }
    }

    // 7️⃣ دمج النتائج (بدون تكرار)
    const allOrders = [...(orders || [])]
    sharedOrders.forEach((so: any) => {
      if (!allOrders.find((o: any) => o.id === so.id)) {
        allOrders.push(so)
      }
    })

    return NextResponse.json({
      success: true,
      data: allOrders,
      meta: {
        total: allOrders.length,
        role,
        accessLevel: getRoleAccessLevel(role),
        filterApplied: {
          byCreatedBy: accessFilter.filterByCreatedBy,
          byBranch: accessFilter.filterByBranch,
          byCostCenter: accessFilter.filterByCostCenter
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

