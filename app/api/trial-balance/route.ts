import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { secureApiRequest, serverError, badRequestError } from "@/lib/api-security-enhanced"
import { apiSuccess } from "@/lib/api-error-handler"

/**
 * ميزان المراجعة (Trial Balance)
 * يعرض جميع الحسابات مع المدين والدائن والرصيد
 */
export async function GET(req: NextRequest) {
  try {
    // ✅ إنشاء supabase client للمصادقة
    const authSupabase = await createServerClient()

    // ✅ التحقق من الأمان
    const { user, companyId, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requireBranch: false,
      requirePermission: { resource: "reports", action: "read" },
      supabase: authSupabase // ✅ تمرير supabase client
    })

    if (error) return error
    if (!companyId) return badRequestError("معرف الشركة مطلوب")

    // ✅ بعد التحقق من الأمان، نستخدم service role key
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )
    if (!companyId) return badRequestError("معرف الشركة مطلوب")

    const { searchParams } = new URL(req.url)
    const asOf = searchParams.get("asOf") || "9999-12-31"

    // ✅ جلب جميع الحسابات أولاً (بدون joins معقدة)
    const { data: accountsData, error: accountsError } = await supabase
      .from("chart_of_accounts")
      .select("id, account_code, account_name, account_type, opening_balance")
      .eq("company_id", companyId)
      .order("account_code")

    if (accountsError) {
      console.error("Accounts query error:", accountsError)
      return serverError(`خطأ في جلب بيانات الحسابات: ${accountsError.message}`)
    }

    // ✅ جلب القيود المرحّلة أولاً
    const { data: journalEntriesData, error: entriesError } = await supabase
      .from("journal_entries")
      .select("id")
      .eq("company_id", companyId)
      .eq("status", "posted")
      .lte("entry_date", asOf)

    if (entriesError) {
      console.error("Journal entries query error:", entriesError)
      return serverError(`خطأ في جلب القيود: ${entriesError.message}`)
    }

    const journalEntryIds = (journalEntriesData || []).map((je: any) => je.id)

    // ✅ جلب سطور القيود (بدون joins معقدة)
    let journalLinesData: any[] = []
    if (journalEntryIds.length > 0) {
      const { data: linesData, error: linesError } = await supabase
        .from("journal_entry_lines")
        .select("account_id, debit_amount, credit_amount")
        .in("journal_entry_id", journalEntryIds)

      if (linesError) {
        console.error("Journal lines query error:", linesError)
        return serverError(`خطأ في جلب بيانات القيود: ${linesError.message}`)
      }
      journalLinesData = linesData || []
    }

    // إنشاء خريطة للحسابات
    const accountsMap: Record<string, {
      code: string
      name: string
      type: string
      opening: number
      debit: number
      credit: number
    }> = {}

    for (const acc of accountsData || []) {
      const opening = Number(acc.opening_balance || 0)
      accountsMap[acc.id] = {
        code: acc.account_code || '',
        name: acc.account_name || '',
        type: acc.account_type || '',
        opening,
        debit: opening > 0 ? opening : 0,
        credit: opening < 0 ? -opening : 0
      }
    }

    // حساب الحركات من القيود
    for (const row of journalLinesData || []) {
      const aid = String((row as any).account_id || "")
      const debit = Number((row as any).debit_amount || 0)
      const credit = Number((row as any).credit_amount || 0)
      
      if (accountsMap[aid]) {
        accountsMap[aid].debit += debit
        accountsMap[aid].credit += credit
      }
    }

    // تحويل إلى مصفوفة وحساب الأرصدة
    const accounts = Object.entries(accountsMap).map(([account_id, v]) => {
      const type = v.type
      const isDebitNature = type === 'asset' || type === 'expense'
      const balance = isDebitNature ? (v.debit - v.credit) : (v.credit - v.debit)
      
      return {
        account_id,
        account_code: v.code,
        account_name: v.name,
        account_type: v.type,
        debit: v.debit,
        credit: v.credit,
        balance
      }
    })

    // حساب الإجماليات
    const totalDebit = accounts.reduce((sum, acc) => sum + acc.debit, 0)
    const totalCredit = accounts.reduce((sum, acc) => sum + acc.credit, 0)
    const difference = Math.abs(totalDebit - totalCredit)
    const isBalanced = difference < 0.01

    return apiSuccess({
      accounts,
      totals: {
        totalDebit,
        totalCredit,
        difference,
        isBalanced
      },
      period: { asOf }
    })
  } catch (e: any) {
    console.error("Trial balance error:", e)
    return serverError(`حدث خطأ أثناء إنشاء ميزان المراجعة: ${e?.message || "unknown_error"}`)
  }
}

