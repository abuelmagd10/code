import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { apiError, apiSuccess, HTTP_STATUS, internalError, badRequestError, notFoundError } from "@/lib/api-error-handler"

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json()
    if (!token) {
      return badRequestError("رمز الدعوة مطلوب", ["token"])
    }

    // التحقق من أن المستخدم مسجل دخوله
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          },
        },
      }
    )
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return apiError(HTTP_STATUS.UNAUTHORIZED, "not_authenticated", "يجب تسجيل الدخول أولاً")
    }

    // استخدام service role للعمليات الإدارية
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!url || !serviceKey) {
      return internalError("خطأ في إعدادات الخادم", "Server configuration error")
    }
    const admin = createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } })

    // جلب الدعوة
    const { data: invRows, error: invErr } = await admin
      .from("company_invitations")
      .select("id, company_id, email, role, expires_at, accepted, branch_id, cost_center_id, warehouse_id")
      .eq("accept_token", token)
      .limit(1)
    
    if (invErr) {
      return internalError("خطأ في جلب الدعوة", invErr.message)
    }
    
    const inv = invRows?.[0]
    if (!inv) {
      return notFoundError("الدعوة", "Invite not found")
    }
    if (inv.accepted) {
      return badRequestError("تم قبول هذه الدعوة مسبقاً", ["token"])
    }
    if (new Date(inv.expires_at) < new Date()) {
      return badRequestError("انتهت صلاحية الدعوة", ["token"])
    }

    // التحقق من تطابق البريد الإلكتروني
    if (user.email?.toLowerCase() !== inv.email.toLowerCase()) {
      return apiError(
        HTTP_STATUS.FORBIDDEN, 
        "email_mismatch", 
        `هذه الدعوة مخصصة للبريد ${inv.email}. أنت مسجل دخولك بـ ${user.email}`
      )
    }

    // إضافة العضوية
    let branchId = inv.branch_id || null
    if (!branchId) {
      const { data: mainBranch } = await admin
        .from('branches')
        .select('id')
        .eq('company_id', inv.company_id)
        .eq('is_main', true)
        .limit(1)
        .single()
      branchId = mainBranch?.id || null
    }
    if (!branchId) {
      return internalError("لا يمكن قبول الدعوة بدون فرع", "missing_branch")
    }

    const memberData: any = {
      company_id: inv.company_id,
      user_id: user.id,
      role: inv.role,
      email: inv.email,
      branch_id: branchId,
      cost_center_id: null,
      warehouse_id: null
    }
    
    const { error: memErr } = await admin
      .from("company_members")
      .insert(memberData)
    
    if (memErr) {
      // التحقق إذا كان العضو موجوداً بالفعل
      if (memErr.message?.includes("duplicate") || memErr.code === "23505") {
        return badRequestError("أنت عضو بالفعل في هذه الشركة", ["membership"])
      }
      return internalError("خطأ في إضافة العضوية", memErr.message)
    }

    // تحديث الدعوة كمقبولة
    await admin.from("company_invitations").update({ accepted: true }).eq("id", inv.id)

    return apiSuccess({ ok: true, email: inv.email, company_id: inv.company_id })
  } catch (e: any) {
    return internalError("حدث خطأ أثناء قبول الدعوة", e?.message || String(e))
  }
}
