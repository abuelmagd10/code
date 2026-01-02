/**
 * 🔒 API الفواتير مع تطبيق الصلاحيات على مستوى Backend
 * 
 * GET /api/invoices - جلب الفواتير مع تطبيق الصلاحيات
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"
import { getAccessFilter, getRoleAccessLevel } from "@/lib/validation"

/**
 * GET /api/invoices
 * جلب الفواتير مع تطبيق الصلاحيات
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
    const invoiceType = searchParams.get("type") || undefined // sales, purchase
    
    const accessFilter = getAccessFilter(role, user.id, branchId, costCenterId, filterByEmployee)

    // 5️⃣ بناء الاستعلام مع تطبيق الصلاحيات
    let query = supabase
      .from("invoices")
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

    // فلتر النوع
    if (invoiceType && invoiceType !== "all") {
      query = query.eq("invoice_type", invoiceType)
    }

    // ترتيب حسب التاريخ
    query = query.order("created_at", { ascending: false })

    const { data: invoices, error: dbError } = await query

    if (dbError) {
      console.error("[API /invoices] Database error:", dbError)
      return NextResponse.json({ 
        error: dbError.message, 
        error_ar: "خطأ في جلب الفواتير" 
      }, { status: 500 })
    }

    // 6️⃣ جلب الفواتير المشتركة (للموظفين فقط)
    let sharedInvoices: any[] = []
    if (accessFilter.filterByCreatedBy) {
      const { data: sharedPerms } = await supabase
        .from("permission_sharing")
        .select("grantor_user_id")
        .eq("grantee_user_id", user.id)
        .eq("company_id", companyId)
        .eq("is_active", true)
        .or("resource_type.eq.all,resource_type.eq.invoices")

      if (sharedPerms && sharedPerms.length > 0) {
        const grantorIds = sharedPerms.map((p: any) => p.grantor_user_id)
        let sharedQuery = supabase
          .from("invoices")
          .select(`*, customers:customer_id (id, name, phone, city)`)
          .eq("company_id", companyId)
          .in("created_by_user_id", grantorIds)

        if (status && status !== "all") {
          sharedQuery = sharedQuery.eq("status", status)
        }
        if (invoiceType && invoiceType !== "all") {
          sharedQuery = sharedQuery.eq("invoice_type", invoiceType)
        }

        const { data: sharedData } = await sharedQuery
        sharedInvoices = sharedData || []
      }
    }

    // 7️⃣ دمج النتائج (بدون تكرار)
    const allInvoices = [...(invoices || [])]
    sharedInvoices.forEach((si: any) => {
      if (!allInvoices.find((i: any) => i.id === si.id)) {
        allInvoices.push(si)
      }
    })

    return NextResponse.json({
      success: true,
      data: allInvoices,
      meta: {
        total: allInvoices.length,
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
    console.error("[API /invoices] Unexpected error:", error)
    return NextResponse.json({ 
      error: error.message, 
      error_ar: "حدث خطأ غير متوقع" 
    }, { status: 500 })
  }
}

