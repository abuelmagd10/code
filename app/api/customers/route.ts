/**
 * 🔒 API العملاء مع تطبيق الصلاحيات على مستوى Backend
 * 
 * GET /api/customers - جلب العملاء مع تطبيق الصلاحيات
 * POST /api/customers - إنشاء عميل جديد
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"
import { getAccessFilter, getRoleAccessLevel } from "@/lib/validation"

/**
 * GET /api/customers
 * جلب العملاء مع تطبيق الصلاحيات
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

    const accessFilter = getAccessFilter(role, user.id, branchId, costCenterId, filterByEmployee)

    // 5️⃣ بناء الاستعلام مع تطبيق الصلاحيات
    let query = supabase
      .from("customers")
      .select("*")
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

    // ترتيب حسب الاسم
    query = query.order("name")

    const { data: customers, error: dbError } = await query

    if (dbError) {
      console.error("[API /customers] Database error:", dbError)
      return NextResponse.json({
        error: dbError.message,
        error_ar: "خطأ في جلب العملاء"
      }, { status: 500 })
    }

    // 6️⃣ جلب العملاء المشتركين (للموظفين فقط)
    let sharedCustomers: any[] = []
    if (accessFilter.filterByCreatedBy) {
      const { data: sharedPerms } = await supabase
        .from("permission_sharing")
        .select("grantor_user_id")
        .eq("grantee_user_id", user.id)
        .eq("company_id", companyId)
        .eq("is_active", true)
        .or("resource_type.eq.all,resource_type.eq.customers")

      if (sharedPerms && sharedPerms.length > 0) {
        const grantorIds = sharedPerms.map((p: any) => p.grantor_user_id)
        const { data: sharedData } = await supabase
          .from("customers")
          .select("*")
          .eq("company_id", companyId)
          .in("created_by_user_id", grantorIds)

        sharedCustomers = sharedData || []
      }
    }

    // 7️⃣ دمج النتائج (بدون تكرار)
    const allCustomers = [...(customers || [])]
    sharedCustomers.forEach((sc: any) => {
      if (!allCustomers.find((c: any) => c.id === sc.id)) {
        allCustomers.push(sc)
      }
    })

    return NextResponse.json({
      success: true,
      data: allCustomers,
      meta: {
        total: allCustomers.length,
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
    console.error("[API /customers] Unexpected error:", error)
    return NextResponse.json({
      error: error.message,
      error_ar: "حدث خطأ غير متوقع"
    }, { status: 500 })
  }
}

/**
 * POST /api/customers
 * إنشاء عميل جديد مع تسجيل المنشئ
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

    // 3️⃣ جلب معلومات العضوية
    const { data: member } = await supabase
      .from("company_members")
      .select("role, branch_id, cost_center_id")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .maybeSingle()

    // 4️⃣ قراءة بيانات العميل
    const body = await request.json()

    // 5️⃣ إنشاء العميل مع تسجيل المنشئ والقيود التنظيمية
    const customerData = {
      ...body,
      company_id: companyId,
      created_by_user_id: user.id, // 🔒 تسجيل المنشئ
      branch_id: body.branch_id || member?.branch_id || null,
      cost_center_id: body.cost_center_id || member?.cost_center_id || null,
    }

    const { data: newCustomer, error: insertError } = await supabase
      .from("customers")
      .insert(customerData)
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
      message_ar: "تم إنشاء العميل بنجاح"
    }, { status: 201 })

  } catch (error: any) {
    console.error("[API /customers POST] Unexpected error:", error)
    return NextResponse.json({
      error: error.message,
      error_ar: "حدث خطأ غير متوقع"
    }, { status: 500 })
  }
}

