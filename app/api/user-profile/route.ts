// =============================================
// API لإدارة ملف المستخدم (username, display_name, etc.)
// =============================================
import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { secureApiRequest } from "@/lib/api-security"
import { apiError, apiSuccess, HTTP_STATUS, internalError, unauthorizedError, badRequestError } from "@/lib/api-error-handler"

// v3.74.678 — resolve the current user's custom job title (employees.job_title)
// for the active company, DISPLAY-ONLY. Falls back to null so the UI shows the
// default role label. Never touches permissions (role stays the source of RBAC).
async function resolveJobTitle(supabase: any, userId: string): Promise<string | null> {
  try {
    const activeCompanyId = (await cookies()).get("active_company_id")?.value || null
    let q = supabase
      .from("company_members")
      .select("employee_id")
      .eq("user_id", userId)
      .not("employee_id", "is", null)
    if (activeCompanyId) q = q.eq("company_id", activeCompanyId)
    const { data: mem } = await q.limit(1).maybeSingle()
    if (!mem?.employee_id) return null
    const { data: emp } = await supabase
      .from("employees")
      .select("job_title")
      .eq("id", mem.employee_id)
      .maybeSingle()
    const jt = String(emp?.job_title || "").trim()
    return jt || null
  } catch {
    return null
  }
}

// GET: جلب ملف المستخدم الحالي
export async function GET() {
  try {
    // === تحصين أمني: استخدام secureApiRequest ===
    const { user, error } = await secureApiRequest(new NextRequest("http://localhost"), {
      requireAuth: true,
      requireCompany: false // User profile doesn't require company
    })

    if (error) return error
    if (!user) {
      return unauthorizedError("غير مصرح - يرجى تسجيل الدخول")
    }
    // === نهاية التحصين الأمني ===

    const supabase = await createClient()

    // جلب ملف المستخدم
    const { data: profile, error: fetchError } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle()

    if (fetchError) {
      console.error("Error fetching profile:", fetchError)
      return internalError("خطأ في جلب ملف المستخدم", fetchError.message)
    }

    // إذا لم يوجد ملف، أنشئ واحد
    if (!profile) {
      const username = user.email?.split("@")[0]?.toLowerCase().replace(/[^a-z0-9_]/g, "") || "user"
      const { data: newProfile, error: insertError } = await supabase
        .from("user_profiles")
        .insert({
          user_id: user.id,
          username: username.length >= 3 ? username : username + "user",
          display_name: user.email?.split("@")[0] || "User"
        })
        .select()
        .single()

      if (insertError) {
        return internalError("خطأ في إنشاء ملف المستخدم", insertError.message)
      }
      return apiSuccess({ profile: newProfile, email: user.email })
    }

    const job_title = await resolveJobTitle(supabase, user.id)
    return apiSuccess({ profile: { ...profile, job_title }, email: user.email })
  } catch (err: any) {
    console.error("Error:", err)
    return internalError("حدث خطأ أثناء جلب ملف المستخدم", err?.message || "unknown_error")
  }
}

// PATCH: تحديث ملف المستخدم
export async function PATCH(request: NextRequest) {
  try {
    // === تحصين أمني: استخدام secureApiRequest ===
    const { user, error } = await secureApiRequest(request, {
      requireAuth: true,
      requireCompany: false
    })

    if (error) return error
    if (!user) {
      return unauthorizedError("غير مصرح - يرجى تسجيل الدخول")
    }
    // === نهاية التحصين الأمني ===

    const supabase = await createClient()

    const body = await request.json()
    const { username, display_name, phone, bio, language, theme } = body

    // التحقق من username إذا تم إرساله
    if (username !== undefined) {
      const cleanUsername = username.toLowerCase().trim()
      
      // التحقق من الطول
      if (cleanUsername.length < 3) {
        return badRequestError("اسم المستخدم قصير جداً (3 أحرف على الأقل)", ["username"])
      }
      if (cleanUsername.length > 30) {
        return badRequestError("اسم المستخدم طويل جداً (30 حرف كحد أقصى)", ["username"])
      }
      
      // التحقق من الأحرف المسموحة
      if (!/^[a-z0-9_]+$/.test(cleanUsername)) {
        return badRequestError("يُسمح فقط بالأحرف الإنجليزية الصغيرة والأرقام والشرطة السفلية", ["username"])
      }
      
      // التحقق من عدم وجود username مكرر
      const { data: existing } = await supabase
        .from("user_profiles")
        .select("user_id")
        .eq("username", cleanUsername)
        .neq("user_id", user.id)
        .maybeSingle()
        
      if (existing) {
        return badRequestError("اسم المستخدم مستخدم بالفعل", ["username"])
      }
    }

    // بناء البيانات للتحديث
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (username !== undefined) updateData.username = username.toLowerCase().trim()
    if (display_name !== undefined) {
      // 🔐 Enterprise: if member is linked to an employee, block display_name change from profile
      // display_name is managed via employee record (Settings → Members → Link Employee)
      const { data: linkedMember } = await supabase
        .from("company_members")
        .select("employee_id")
        .eq("user_id", user.id)
        .not("employee_id", "is", null)
        .limit(1)

      if (linkedMember && linkedMember.length > 0) {
        return badRequestError(
          "الاسم الظاهر مرتبط بسجل الموظف. لتغيير الاسم، تواصل مع المدير لتحديثه من سجل الموظفين.",
          ["display_name"]
        )
      }
      updateData.display_name = display_name
    }
    if (phone !== undefined) updateData.phone = phone
    if (bio !== undefined) updateData.bio = bio
    if (language !== undefined) updateData.language = language
    if (theme !== undefined) updateData.theme = theme

    const { data: profile, error: updateError } = await supabase
      .from("user_profiles")
      .update(updateData)
      .eq("user_id", user.id)
      .select()
      .single()

    if (updateError) {
      console.error("Error updating profile:", updateError)
      return internalError("خطأ في تحديث ملف المستخدم", updateError.message)
    }

    return apiSuccess({ profile, success: true })
  } catch (err: any) {
    console.error("Error:", err)
    return internalError("حدث خطأ أثناء تحديث ملف المستخدم", err?.message || "unknown_error")
  }
}

// POST: التحقق من توفر username
export async function POST(request: NextRequest) {
  try {
    // === تحصين أمني: استخدام secureApiRequest ===
    const { user, error } = await secureApiRequest(request, {
      requireAuth: true,
      requireCompany: false
    })

    if (error) return error
    if (!user) {
      return unauthorizedError("غير مصرح - يرجى تسجيل الدخول")
    }
    // === نهاية التحصين الأمني ===

    const supabase = await createClient()
    const body = await request.json()
    const { username } = body
    
    if (!username) {
      return badRequestError("اسم المستخدم مطلوب", ["username"])
    }

    const cleanUsername = username.toLowerCase().trim()
    
    // التحقق من الطول والأحرف
    if (cleanUsername.length < 3) {
      return apiSuccess({ available: false, error: "اسم المستخدم قصير جداً" })
    }
    if (cleanUsername.length > 30) {
      return apiSuccess({ available: false, error: "اسم المستخدم طويل جداً" })
    }
    if (!/^[a-z0-9_]+$/.test(cleanUsername)) {
      return apiSuccess({ available: false, error: "أحرف غير مسموحة" })
    }
    
    // التحقق من التوفر
    const { data: existing } = await supabase
      .from("user_profiles")
      .select("user_id")
      .eq("username", cleanUsername)
      .neq("user_id", user.id)
      .maybeSingle()

    return apiSuccess({ 
      available: !existing, 
      username: cleanUsername,
      error: existing ? "اسم المستخدم مستخدم بالفعل" : null 
    })
  } catch (err: any) {
    console.error("Error:", err)
    return internalError("حدث خطأ أثناء التحقق من توفر اسم المستخدم", err?.message || "unknown_error")
  }
}

