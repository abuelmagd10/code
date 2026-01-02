/**
 * 🔒 API الموردين مع تطبيق الصلاحيات على مستوى Backend
 * 
 * GET /api/suppliers - جلب الموردين مع تطبيق الصلاحيات
 * POST /api/suppliers - إنشاء مورد جديد
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"
import { getAccessFilter, getRoleAccessLevel } from "@/lib/validation"

/**
 * GET /api/suppliers
 * جلب الموردين مع تطبيق الصلاحيات
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
      .from("suppliers")
      .select("*")
      .eq("company_id", companyId)

    // 🔒 تطبيق فلتر المنشئ (للموظفين)
    if (accessFilter.filterByCreatedBy && accessFilter.createdByUserId) {
      query = query.eq("created_by_user_id", accessFilter.createdByUserId)
    }

    // ترتيب حسب الاسم
    query = query.order("name")

    const { data: suppliers, error: dbError } = await query

    if (dbError) {
      console.error("[API /suppliers] Database error:", dbError)
      return NextResponse.json({ 
        error: dbError.message, 
        error_ar: "خطأ في جلب الموردين" 
      }, { status: 500 })
    }

    // 6️⃣ جلب الموردين المشتركين (للموظفين فقط)
    let sharedSuppliers: any[] = []
    if (accessFilter.filterByCreatedBy) {
      const { data: sharedPerms } = await supabase
        .from("permission_sharing")
        .select("grantor_user_id")
        .eq("grantee_user_id", user.id)
        .eq("company_id", companyId)
        .eq("is_active", true)
        .or("resource_type.eq.all,resource_type.eq.suppliers")

      if (sharedPerms && sharedPerms.length > 0) {
        const grantorIds = sharedPerms.map((p: any) => p.grantor_user_id)
        const { data: sharedData } = await supabase
          .from("suppliers")
          .select("*")
          .eq("company_id", companyId)
          .in("created_by_user_id", grantorIds)

        sharedSuppliers = sharedData || []
      }
    }

    // 7️⃣ دمج النتائج (بدون تكرار)
    const allSuppliers = [...(suppliers || [])]
    sharedSuppliers.forEach((ss: any) => {
      if (!allSuppliers.find((s: any) => s.id === ss.id)) {
        allSuppliers.push(ss)
      }
    })

    return NextResponse.json({
      success: true,
      data: allSuppliers,
      meta: {
        total: allSuppliers.length,
        role,
        accessLevel: getRoleAccessLevel(role),
        filterApplied: {
          byCreatedBy: accessFilter.filterByCreatedBy
        }
      }
    })

  } catch (error: any) {
    console.error("[API /suppliers] Unexpected error:", error)
    return NextResponse.json({ 
      error: error.message, 
      error_ar: "حدث خطأ غير متوقع" 
    }, { status: 500 })
  }
}

/**
 * POST /api/suppliers
 * إنشاء مورد جديد مع تسجيل المنشئ
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

    // 3️⃣ قراءة بيانات المورد
    const body = await request.json()
    
    // 4️⃣ إنشاء المورد مع تسجيل المنشئ
    const supplierData = {
      ...body,
      company_id: companyId,
      created_by_user_id: user.id, // 🔒 تسجيل المنشئ
    }

    const { data: newSupplier, error: insertError } = await supabase
      .from("suppliers")
      .insert(supplierData)
      .select()
      .single()

    if (insertError) {
      return NextResponse.json({ 
        error: insertError.message, 
        error_ar: "فشل في إنشاء المورد" 
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: newSupplier,
      message: "Supplier created successfully",
      message_ar: "تم إنشاء المورد بنجاح"
    }, { status: 201 })

  } catch (error: any) {
    return NextResponse.json({ 
      error: error.message, 
      error_ar: "حدث خطأ غير متوقع" 
    }, { status: 500 })
  }
}

