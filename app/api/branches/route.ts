import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { getActiveCompanyId } from "@/lib/company"
import { logAuditEvent } from "@/lib/audit-log"
/**
 * GET /api/branches
 * جلب جميع الفروع للشركة الحالية
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const companyId = await getActiveCompanyId(supabase)

    if (!companyId) {
      return NextResponse.json({ error: "No company found" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("branches")
      .select("*")
      .eq("company_id", companyId)
      .order("is_main", { ascending: false })
      .order("name")

    if (error) throw error

    return NextResponse.json({ branches: data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/branches
 * إنشاء فرع جديد مع ملحقاته (مركز التكلفة والمستودع) 
 * Enterprise ERP Automation
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const companyId = await getActiveCompanyId(supabase)

    if (!companyId) {
      return NextResponse.json({ error: "No company found" }, { status: 400 })
    }

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { name, code, address, city, phone, email, manager_name, is_active } = body
    const finalCode = code?.trim().toUpperCase()

    if (!name || !finalCode) {
      return NextResponse.json({ error: "Name and code are required" }, { status: 400 })
    }

    // 1️⃣ إنشاء الفرع (Create Branch)
    const { data: branch, error: branchError } = await supabase
      .from("branches")
      .insert({
        company_id: companyId,
        name: name.trim(),
        branch_name: name.trim(),
        code: finalCode,
        branch_code: finalCode,
        address: address?.trim() || null,
        city: city?.trim() || null,
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        manager_name: manager_name?.trim() || null,
        is_active: is_active ?? true,
        is_main: false, // دائما فروع فرعية
        is_head_office: false
      })
      .select()
      .single()

    if (branchError) throw branchError

    try {
      // 2️⃣ إنشاء مركز التكلفة الافتراضي (Default Cost Center)
      // استخدام كود فريد مستمد من كود الفرع لمنع التصادم
      const { data: costCenter, error: ccError } = await supabase
        .from('cost_centers')
        .insert({
          company_id: companyId,
          branch_id: branch.id,
          cost_center_name: `مركز التكلفة الافتراضي - ${name.trim()}`,
          cost_center_code: `CC-${finalCode}`,
          is_active: true
        })
        .select()
        .single()

      if (ccError) throw ccError

      // 3️⃣ إنشاء المستودع الافتراضي (Default Warehouse)
      // إضافة كود فريد مستمد من كود الفرع
      const { data: warehouse, error: whError } = await supabase
        .from('warehouses')
        .insert({
          company_id: companyId,
          branch_id: branch.id,
          cost_center_id: costCenter.id,
          name: `المستودع الافتراضي - ${name.trim()}`,
          code: `WH-${finalCode}`,
          is_main: false, // مجرد مستودع افتراضي للفرع وليس مستودع رئيسي للشركة
          is_active: true
        })
        .select()
        .single()

      if (whError) throw whError

      // 4️⃣ تحديث الفرع لربطه للقيم الافتراضية
      const { error: updateError } = await supabase
        .from('branches')
        .update({
          default_cost_center_id: costCenter.id,
          default_warehouse_id: warehouse.id
        })
        .eq('id', branch.id)

      if (updateError) throw updateError

      // 5️⃣ تسجيل العمليات في Audit Log (ممارسة Enterprise)
      await Promise.all([
        logAuditEvent(supabase, {
          company_id: companyId,
          user_id: user.id,
          user_email: user.email,
          action: 'create',
          target_table: 'branches',
          record_id: branch.id,
          record_identifier: finalCode,
          new_data: branch
        }),
        logAuditEvent(supabase, {
          company_id: companyId,
          user_id: user.id,
          user_email: user.email,
          action: 'create',
          target_table: 'cost_centers',
          record_id: costCenter.id,
          record_identifier: costCenter.cost_center_code,
          new_data: costCenter
        }),
        logAuditEvent(supabase, {
          company_id: companyId,
          user_id: user.id,
          user_email: user.email,
          action: 'create',
          target_table: 'warehouses',
          record_id: warehouse.id,
          record_identifier: warehouse.code,
          new_data: warehouse
        })
      ])

      // جلب الفرع المحدث للتأكد من احتوائه على keys
      const { data: finalBranch } = await supabase
        .from('branches')
        .select('*')
        .eq('id', branch.id)
        .single()

      return NextResponse.json({ branch: finalBranch || branch })

    } catch (err: any) {
      // 🚫 Rollback في حالة فشل أي خطوة لاحقة (Atomic Strategy)
      await supabase.from('branches').delete().eq('id', branch.id)
      throw new Error(`فشل إنشاء الملحقات وتم التراجع عن إنشاء الفرع (Rollback): ${err.message}`)
    }

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

