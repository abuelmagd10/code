/**
 * 🔒 API Endpoint: تعديل/حذف الإهلاك مع الحوكمة والصلاحيات
 * =====================================================
 * 
 * PATCH /api/write-offs/[id] - تحديث إهلاك مع التحقق من الصلاحيات
 * DELETE /api/write-offs/[id] - حذف إهلاك مع التحقق من الصلاحيات
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"
import { arabicReason } from "@/lib/error-messages"

/**
 * v3.74.858 — أعمدة الإهلاك القابلة للتعديل من هذه الشاشة، بالاسم.
 *
 * تُستثنى عمداً كل أعمدة الحالة والمسار المحكوم:
 * `status` · `approved_by/at` · `rejected_by/at` · `cancelled_by/at` ·
 * `journal_entry_id` · `created_by` · `company_id` · `total_cost`.
 * لكلٍّ منها مساره المعتمَد، ولا يجوز أن يبلغه المتصفح بتعديلٍ عادى — وهذا
 * ما كان يسمح به نسخُ جسم الطلب كما وصل.
 */
const WRITABLE_WRITE_OFF_COLUMNS = [
  "write_off_date", "reason", "reason_details", "notes",
  "warehouse_id", "warehouse_name", "branch_id", "cost_center_id",
  "attachments", "currency_code", "exchange_rate",
] as const

function pickWritableWriteOffFields(input: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {}
  for (const key of WRITABLE_WRITE_OFF_COLUMNS) {
    if (input?.[key] !== undefined) out[key] = input[key]
  }
  return out
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized", error_ar: "يجب تسجيل الدخول" },
        { status: 401 }
      )
    }

    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) {
      return NextResponse.json(
        { error: "No company", error_ar: "لم يتم تحديد شركة" },
        { status: 400 }
      )
    }

    // جلب الإهلاك الحالي
    const { data: writeOff, error: fetchError } = await supabase
      .from("inventory_write_offs")
      .select("*")
      .eq("id", id)
      .eq("company_id", companyId)
      .single()

    if (fetchError || !writeOff) {
      return NextResponse.json(
        { error: "Not found", error_ar: "الإهلاك غير موجود" },
        { status: 404 }
      )
    }

    // 🔐 ERP-Grade Governance Rule: منع التعديل بعد الاعتماد إلا لـ Admin و Owner
    if (writeOff.status === 'approved') {
      // جلب دور المستخدم
      const { data: memberData } = await supabase
        .from("company_members")
        .select("role")
        .eq("company_id", companyId)
        .eq("user_id", user.id)
        .maybeSingle()

      const { data: companyData } = await supabase
        .from("companies")
        .select("user_id")
        .eq("id", companyId)
        .single()

      const isOwner = companyData?.user_id === user.id
      const userRole = isOwner ? "owner" : (memberData?.role || "viewer")
      const canEditApproved = userRole === 'owner' || userRole === 'admin'

      if (!canEditApproved) {
        return NextResponse.json(
          { 
            error: "Forbidden", 
            error_ar: "لا يمكن تعديل إهلاك معتمد. العملية مسموحة فقط للإدارة العليا (Admin/Owner).",
            error_en: "Cannot edit approved write-off. Operation allowed only for top management (Admin/Owner)."
          },
          { status: 403 }
        )
      }
    }

    // جلب البيانات من الطلب
    const body = await request.json()
    
    // تحديث الإهلاك
    const { data: updated, error: updateError } = await supabase
      .from("inventory_write_offs")
      .update({
        // v3.74.858 — الأعمدة بالاسم لا نسخ الجسم كما وصل. أعمدة الحالة
        // (الاعتماد/الرفض/الإلغاء/القيد) لا تُكتب من هنا عمداً: لها مساراتها
        // المحكومة، ولا يجوز أن يبلغها المتصفح بتعديلٍ عادى.
        ...pickWritableWriteOffFields(body),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("company_id", companyId)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message, error_ar: arabicReason(updateError, "فشل في تحديث الإهلاك") },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, data: updated })
  } catch (error: any) {
    console.error("Error updating write-off:", error)
    return NextResponse.json(
      { error: error.message, error_ar: arabicReason(error, "خطأ في تحديث الإهلاك") },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized", error_ar: "يجب تسجيل الدخول" },
        { status: 401 }
      )
    }

    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) {
      return NextResponse.json(
        { error: "No company", error_ar: "لم يتم تحديد شركة" },
        { status: 400 }
      )
    }

    // جلب الإهلاك الحالي
    const { data: writeOff, error: fetchError } = await supabase
      .from("inventory_write_offs")
      .select("*")
      .eq("id", id)
      .eq("company_id", companyId)
      .single()

    if (fetchError || !writeOff) {
      return NextResponse.json(
        { error: "Not found", error_ar: "الإهلاك غير موجود" },
        { status: 404 }
      )
    }

    // 🔐 ERP-Grade Governance Rule: منع الحذف بعد الاعتماد إلا لـ Admin و Owner
    if (writeOff.status === 'approved') {
      // جلب دور المستخدم
      const { data: memberData } = await supabase
        .from("company_members")
        .select("role")
        .eq("company_id", companyId)
        .eq("user_id", user.id)
        .maybeSingle()

      const { data: companyData } = await supabase
        .from("companies")
        .select("user_id")
        .eq("id", companyId)
        .single()

      const isOwner = companyData?.user_id === user.id
      const userRole = isOwner ? "owner" : (memberData?.role || "viewer")
      const canDeleteApproved = userRole === 'owner' || userRole === 'admin'

      if (!canDeleteApproved) {
        return NextResponse.json(
          { 
            error: "Forbidden", 
            error_ar: "لا يمكن حذف إهلاك معتمد. العملية مسموحة فقط للإدارة العليا (Admin/Owner).",
            error_en: "Cannot delete approved write-off. Operation allowed only for top management (Admin/Owner)."
          },
          { status: 403 }
        )
      }
    }

    // حذف الإهلاك
    const { error: deleteError } = await supabase
      .from("inventory_write_offs")
      .delete()
      .eq("id", id)
      .eq("company_id", companyId)

    if (deleteError) {
      return NextResponse.json(
        { error: deleteError.message, error_ar: arabicReason(deleteError, "فشل في حذف الإهلاك") },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error deleting write-off:", error)
    return NextResponse.json(
      { error: error.message, error_ar: arabicReason(error, "خطأ في حذف الإهلاك") },
      { status: 500 }
    )
  }
}
