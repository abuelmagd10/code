import { createClient as createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { secureApiRequest, serverError } from "@/lib/api-security-enhanced"
import { buildBranchFilter } from "@/lib/branch-access-control"
import { NextRequest, NextResponse } from "next/server"
import { badRequestError } from "@/lib/api-error-handler"

export async function GET(req: NextRequest) {
  try {
    // ✅ إنشاء supabase client للمصادقة
    const authSupabase = await createServerClient()

    // ✅ التحقق من الأمان
    const { user, companyId, branchId, member, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requireBranch: true,
      requirePermission: { resource: "reports", action: "read" },
      supabase: authSupabase // ✅ تمرير supabase client
    })

    if (error) return error
    if (!companyId) return badRequestError("معرف الشركة مطلوب")
    if (!branchId) return badRequestError("معرف الفرع مطلوب")

    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!url || !serviceKey) {
      return serverError(`خطأ في إعدادات الخادم: ${"Server configuration error"}`)
    }
    const admin = createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } })

    const { searchParams } = new URL(req.url)
    const accountId = String(searchParams.get("accountId") || "")
    const from = String(searchParams.get("from") || "0001-01-01")
    const to = String(searchParams.get("to") || "9999-12-31")
    const limit = Number(searchParams.get("limit") || 50)

    if (!accountId) {
      return badRequestError("معرف الحساب مطلوب")
    }

    const { data, error: dbError } = await admin
      .from("journal_entry_lines")
      .select("id, debit_amount, credit_amount, description, display_debit, display_credit, display_currency, original_debit, original_credit, original_currency, exchange_rate_used, journal_entries!inner(entry_date, description, company_id, is_deleted, deleted_at, status)")
      .eq("account_id", accountId)
      .eq("journal_entries.company_id", companyId)
      .neq("journal_entries.is_deleted", true) // ✅ استثناء القيود المحذوفة (is_deleted)
      .is("journal_entries.deleted_at", null) // ✅ استثناء القيود المحذوفة (deleted_at)
      .not("journal_entries.status", "eq", "draft") // ✅ استثناء القيود المسودة
      .gte("journal_entries.entry_date", from)
      .lte("journal_entries.entry_date", to)
      .order("id", { ascending: false })
      .limit(limit)
    if (dbError) {
      return serverError(`خطأ في جلب سطور الحساب: ${dbError.message}`)
    }
    return NextResponse.json({
      success: true,
      data: data || []
    })
  } catch (e: any) {
    return serverError(`حدث خطأ أثناء جلب سطور الحساب: ${e?.message}`)
  }
}
