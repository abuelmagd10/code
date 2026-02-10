import { createClient as createServerClient } from "@/lib/supabase/server"
import { secureApiRequest, serverError, badRequestError } from "@/lib/api-security-enhanced"
import { buildBranchFilter } from "@/lib/branch-access-control"
import { NextRequest, NextResponse } from "next/server"

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

    const supabase = await createServerClient()

    const { searchParams } = new URL(req.url)
    const asOf = String(searchParams.get("asOf") || "9999-12-31")

    // ✅ جلب القيود أولاً
    const { data: entries, error: entriesError } = await supabase
      .from("journal_entries")
      .select("id, entry_date")
      .eq("company_id", companyId)
      .or("is_deleted.is.null,is_deleted.eq.false") // ✅ استثناء القيود المحذوفة (is_deleted)
      .is("deleted_at", null) // ✅ استثناء القيود المحذوفة (deleted_at)
      .lte("entry_date", asOf)

    if (entriesError) {
      return serverError(`خطأ في جلب القيود: ${entriesError.message}`)
    }

    if (!entries || entries.length === 0) {
      return NextResponse.json({ success: true, data: [] })
    }

    const entryIds = entries.map((e: any) => e.id)

    // ✅ جلب سطور القيود
    const { data, error: dbError } = await supabase
      .from("journal_entry_lines")
      .select("debit_amount, credit_amount, journal_entry_id")
      .in("journal_entry_id", entryIds)
    if (dbError) {
      return serverError(`خطأ في جلب القيود غير المتوازنة: ${dbError.message}`)
    }

    const byEntry: Record<string, { debit: number; credit: number; entry_date: string }> = {}
      ; (data || []).forEach((line: any) => {
        const debit = Number(line.debit_amount || 0)
        const credit = Number(line.credit_amount || 0)
        const entryId = String(line.journal_entries?.id || "")
        const entryDate = String(line.journal_entries?.entry_date || asOf)
        if (entryId) {
          const prev = byEntry[entryId] || { debit: 0, credit: 0, entry_date: entryDate }
          byEntry[entryId] = { debit: prev.debit + debit, credit: prev.credit + credit, entry_date: entryDate }
        }
      })
    const unbalanced = Object.entries(byEntry)
      .map(([id, v]) => ({ id, entry_date: v.entry_date, debit: v.debit, credit: v.credit, difference: v.debit - v.credit }))
      .filter((s) => Math.abs(s.difference) >= 0.01)
      .sort((a, b) => a.entry_date.localeCompare(b.entry_date))
    return NextResponse.json({
      success: true,
      data: unbalanced
    })
  } catch (e: any) {
    return serverError(`حدث خطأ أثناء جلب القيود غير المتوازنة: ${e?.message}`)
  }
}