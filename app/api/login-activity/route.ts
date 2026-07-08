/**
 * 📊 Login Activity Report API - تقرير نشاط الدخول والخروج
 * 
 * ⚠️ OPERATIONAL REPORT (NOT ACCOUNTING REPORT)
 * 
 * ✅ هذا تقرير تشغيلي - يمكنه القراءة من audit_logs مباشرة
 * ✅ ليس تقرير محاسبي رسمي (التقارير المحاسبية تعتمد على journal_entries فقط)
 * 
 * ✅ القواعد:
 * 1. مصدر البيانات: audit_logs (تشغيلي) - action = 'LOGIN' أو 'LOGOUT'
 * 2. التصنيف: حسب المستخدم، التاريخ، IP Address
 * 3. الفلترة: حسب المستخدم، التاريخ، الشركة
 * 
 * ⚠️ ملاحظة مهمة:
 * - هذا التقرير تشغيلي وليس محاسبي رسمي
 * - التقارير المحاسبية الرسمية تعتمد على journal_entries فقط
 * - هذا التقرير يستخدم audit_logs لتوضيح تشغيلي
 * 
 * راجع: docs/OPERATIONAL_REPORTS_GUIDE.md
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { secureApiRequest, serverError, badRequestError } from "@/lib/api-security-enhanced"
import { buildBranchFilter } from "@/lib/branch-access-control"

async function getAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  return url && serviceKey ? createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } }) : null
}

export async function GET(req: NextRequest) {
  try {
    // ✅ إنشاء supabase client للمصادقة
    const authSupabase = await createServerClient()

    // ✅ التحقق من الأمان
    const { user, companyId, branchId, member, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requireBranch: true,
      requirePermission: { resource: "financial_reports", action: "read" },
      supabase: authSupabase
    })

    if (error) return error
    if (!companyId) return badRequestError("معرف الشركة مطلوب")
    if (!branchId) return badRequestError("معرف الفرع مطلوب")

    const admin = await getAdmin()
    if (!admin) {
      return serverError(`خطأ في إعدادات الخادم: ${"Server configuration error"}`)
    }

    const { searchParams } = new URL(req.url)
    const from = String(searchParams.get("from") || "")
    const to = String(searchParams.get("to") || "")
    const userId = searchParams.get("user_id") || ""
    const actionType = searchParams.get("action_type") || "all" // all, LOGIN, LOGOUT
    const page = parseInt(searchParams.get("page") || "1")
    const limit = parseInt(searchParams.get("limit") || "50")

    const offset = (page - 1) * limit

    // ✅ جلب سجلات الدخول والخروج (تقرير تشغيلي - من audit_logs مباشرة)
    // ⚠️ ملاحظة: هذا تقرير تشغيلي وليس محاسبي رسمي
    let logsQuery = admin
      .from("audit_logs")
      .select("*", { count: "exact" })
      .eq("company_id", companyId)
      .in("action", ["LOGIN", "LOGOUT"])
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (userId) {
      logsQuery = logsQuery.eq("user_id", userId)
    }

    if (actionType !== "all") {
      logsQuery = logsQuery.eq("action", actionType)
    }

    if (from) {
      logsQuery = logsQuery.gte("created_at", from)
    }

    if (to) {
      logsQuery = logsQuery.lte("created_at", to + "T23:59:59")
    }

    const { data: logs, error: logsError, count } = await logsQuery

    if (logsError) {
      console.error("Error fetching login activity:", logsError)
      return serverError(`حدث خطأ أثناء جلب سجلات الدخول والخروج: ${logsError.message}`)
    }

    // جلب ملخص النشاط
    let summaryQuery = admin
      .from("audit_logs")
      .select("action, user_id")
      .eq("company_id", companyId)
      .in("action", ["LOGIN", "LOGOUT"])

    if (from) {
      summaryQuery = summaryQuery.gte("created_at", from)
    }

    if (to) {
      summaryQuery = summaryQuery.lte("created_at", to + "T23:59:59")
    }

    const { data: summaryData } = await summaryQuery

    const summary = {
      total_logins: summaryData?.filter(s => s.action === "LOGIN").length || 0,
      total_logouts: summaryData?.filter(s => s.action === "LOGOUT").length || 0,
      unique_users: new Set(summaryData?.map(s => s.user_id) || []).size,
      total_activities: summaryData?.length || 0
    }

    // جلب قائمة المستخدمين
    const { data: companyMembers } = await admin
      .from("company_members")
      .select("user_id, email, role")
      .eq("company_id", companyId)

    // جلب بيانات المستخدمين من auth.users
    let uniqueUsers: { user_id: string; user_email: string; user_name: string }[] = []

    if (companyMembers && companyMembers.length > 0) {
      const userIds = companyMembers.map(m => m.user_id)
      const { data: authUsers } = await admin.auth.admin.listUsers()

      uniqueUsers = companyMembers.map(m => {
        const authUser = authUsers?.users?.find(u => u.id === m.user_id)
        return {
          user_id: m.user_id,
          user_email: m.email || authUser?.email || "",
          user_name: authUser?.user_metadata?.full_name ||
            authUser?.user_metadata?.name ||
            m.email ||
            authUser?.email ||
            "مستخدم"
        }
      })
    }

    return NextResponse.json({
      success: true,
      data: logs || [],
      summary,
      users: uniqueUsers,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit)
      }
    })
  } catch (e: any) {
    return serverError(`حدث خطأ أثناء جلب تقرير نشاط الدخول والخروج: ${e?.message || "unknown_error"}`)
  }
}
