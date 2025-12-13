import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createSSR } from "@/lib/supabase/server"

// حقول العنوان - مسموح تعديلها لجميع المستخدمين
const ADDRESS_FIELDS = ['address', 'governorate', 'city', 'country', 'detailed_address']

export async function POST(request: NextRequest) {
  try {
    const { customerId, companyId, data, onlyAddress } = await request.json()

    if (!customerId || !companyId) {
      return NextResponse.json(
        { success: false, error: "Missing customerId or companyId", error_ar: "معرف العميل أو الشركة مفقود" },
        { status: 400 }
      )
    }

    // إنشاء Supabase client للمصادقة
    const ssr = await createSSR()

    // التحقق من تسجيل الدخول
    const { data: { user }, error: authError } = await ssr.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized", error_ar: "غير مصرح - يرجى تسجيل الدخول مرة أخرى" },
        { status: 401 }
      )
    }

    // إنشاء client للاستعلامات
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    const db = (url && serviceKey)
      ? createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } })
      : ssr

    // التحقق من عضوية المستخدم في الشركة
    const { data: member, error: memberError } = await db
      .from("company_members")
      .select("role")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .maybeSingle()

    if (memberError) {
      return NextResponse.json(
        { success: false, error: `Failed to verify membership: ${memberError.message}`, error_ar: `فشل في التحقق من العضوية: ${memberError.message}` },
        { status: 500 }
      )
    }

    if (!member) {
      return NextResponse.json(
        { success: false, error: "Not a member of this company", error_ar: "لست عضواً في هذه الشركة" },
        { status: 403 }
      )
    }

    // التحقق من العميل
    const { data: customer } = await db
      .from("customers")
      .select("id, name, created_by_user_id")
      .eq("id", customerId)
      .eq("company_id", companyId)
      .maybeSingle()

    if (!customer) {
      return NextResponse.json(
        { success: false, error: "Customer not found", error_ar: "العميل غير موجود" },
        { status: 404 }
      )
    }

    // تحديد الحقول المطلوب تعديلها
    const updateData = data || {}
    const requestedFields = Object.keys(updateData)

    // هل التعديل يحتوي على حقول غير العنوان؟
    const nonAddressFields = requestedFields.filter(field => !ADDRESS_FIELDS.includes(field))
    const isAddressOnlyUpdate = nonAddressFields.length === 0

    // إذا كان التعديل على العنوان فقط - مسموح لجميع أعضاء الشركة
    if (!isAddressOnlyUpdate) {
      // التحقق من الصلاحية للتعديل الكامل
      const isOwnerOrAdmin = ["owner", "admin"].includes(member.role || "")
      const isCreator = customer.created_by_user_id === user.id

      let hasRolePermission = false
      if (!isOwnerOrAdmin && !isCreator) {
        const { data: rolePerm } = await db
          .from("company_role_permissions")
          .select("can_update, all_access")
          .eq("company_id", companyId)
          .eq("role", member.role || "")
          .eq("resource", "customers")
          .maybeSingle()

        hasRolePermission = rolePerm?.can_update === true || rolePerm?.all_access === true
      }

      if (!isOwnerOrAdmin && !isCreator && !hasRolePermission) {
        return NextResponse.json(
          {
            success: false,
            error: "No permission to update this customer",
            error_ar: "ليس لديك صلاحية تعديل هذا العميل. يمكنك فقط تعديل العملاء الذين قمت بإنشائهم أو تعديل العنوان فقط."
          },
          { status: 403 }
        )
      }
    }

    // تنفيذ التعديل
    const { error: updateError } = await db
      .from("customers")
      .update(updateData)
      .eq("id", customerId)
      .eq("company_id", companyId)

    if (updateError) {
      return NextResponse.json({
        success: false,
        error: updateError.message,
        error_ar: `فشل في تعديل العميل: ${updateError.message}`
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: "Customer updated successfully",
      message_ar: "تم تعديل العميل بنجاح"
    })

  } catch (error: any) {
    console.error("Error in customer update API:", error)
    return NextResponse.json({
      success: false,
      error: error?.message || "Internal server error",
      error_ar: "حدث خطأ داخلي في الخادم"
    }, { status: 500 })
  }
}

