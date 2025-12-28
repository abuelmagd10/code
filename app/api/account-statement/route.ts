import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { secureApiRequest, serverError, badRequestError } from "@/lib/api-security-enhanced"
import { apiSuccess } from "@/lib/api-error-handler"

/**
 * كشف حساب (Account Statement)
 * يعرض جميع الحركات على حساب واحد مع الرصيد الجاري
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

    const { searchParams } = new URL(req.url)
    const accountId = searchParams.get("accountId")
    const from = searchParams.get("from") || "0001-01-01"
    const to = searchParams.get("to") || "9999-12-31"

    if (!accountId) {
      return badRequestError("معرف الحساب مطلوب")
    }

    // جلب بيانات الحساب
    const { data: account, error: accountError } = await supabase
      .from("chart_of_accounts")
      .select("id, account_code, account_name, account_type, sub_type, opening_balance, normal_balance")
      .eq("company_id", companyId)
      .eq("id", accountId)
      .single()

    if (accountError || !account) {
      console.error("Account query error:", accountError)
      return badRequestError("الحساب غير موجود")
    }

    // ✅ جلب القيود المرحّلة قبل تاريخ البداية (للرصيد الافتتاحي)
    const { data: openingEntries, error: openingEntriesError } = await supabase
      .from("journal_entries")
      .select("id")
      .eq("company_id", companyId)
      .eq("status", "posted")
      .is("deleted_at", null)
      .lt("entry_date", from)

    let openingBalance = account.opening_balance || 0
    if (openingEntries && openingEntries.length > 0) {
      const openingEntryIds = openingEntries.map((e: any) => e.id)

      const { data: openingLines, error: openingLinesError } = await supabase
        .from("journal_entry_lines")
        .select("debit_amount, credit_amount")
        .eq("account_id", accountId)
        .in("journal_entry_id", openingEntryIds)

      if (openingLines && !openingLinesError) {
        openingLines.forEach((line: any) => {
          const debit = line.debit_amount || 0
          const credit = line.credit_amount || 0
          openingBalance += debit - credit
        })
      }
    }

    // ✅ جلب القيود المرحّلة في الفترة
    const { data: periodEntries, error: periodEntriesError } = await supabase
      .from("journal_entries")
      .select("id, entry_number, entry_date, description, reference_type, reference_id")
      .eq("company_id", companyId)
      .eq("status", "posted")
      .is("deleted_at", null)
      .gte("entry_date", from)
      .lte("entry_date", to)
      .order("entry_date")

    if (periodEntriesError) {
      console.error("Period entries error:", periodEntriesError)
      return serverError(`خطأ في جلب القيود: ${periodEntriesError.message}`)
    }

    // ✅ جلب سطور القيود للحساب المحدد
    let lines: any[] = []
    if (periodEntries && periodEntries.length > 0) {
      const periodEntryIds = periodEntries.map((e: any) => e.id)

      const { data: linesData, error: linesError } = await supabase
        .from("journal_entry_lines")
        .select("id, journal_entry_id, debit_amount, credit_amount, description")
        .eq("account_id", accountId)
        .in("journal_entry_id", periodEntryIds)

      if (linesError) {
        console.error("Lines query error:", linesError)
        return serverError(`خطأ في جلب سطور القيود: ${linesError.message}`)
      }

      lines = linesData || []
    }

    // ✅ إنشاء map للقيود
    const entriesMap: Record<string, any> = {}
    for (const entry of periodEntries || []) {
      entriesMap[entry.id] = entry
    }

    // بناء قائمة الحركات مع الرصيد الجاري
    let runningBalance = openingBalance
    const transactions = lines.map((line: any) => {
      const entry = entriesMap[line.journal_entry_id]
      if (!entry) return null

      const debit = line.debit_amount || 0
      const credit = line.credit_amount || 0
      runningBalance += debit - credit

      // جلب رقم المرجع بناءً على نوع المرجع
      let referenceNumber = ""
      if (entry.reference_type === "invoice") {
        referenceNumber = "INV-" + (entry.reference_id?.slice(0, 8) || "")
      } else if (entry.reference_type === "bill") {
        referenceNumber = "BILL-" + (entry.reference_id?.slice(0, 8) || "")
      } else if (entry.reference_type === "payment") {
        referenceNumber = "PAY-" + (entry.reference_id?.slice(0, 8) || "")
      }

      return {
        id: line.id,
        date: entry.entry_date,
        entryNumber: entry.entry_number || `JE-${entry.id.slice(0, 8)}`,
        description: line.description || entry.description || "",
        referenceType: entry.reference_type || "",
        referenceNumber,
        debit,
        credit,
        runningBalance
      }
    }).filter((t: any) => t !== null) // ✅ إزالة null values

    const totalDebit = transactions.reduce((sum: number, t: any) => sum + t.debit, 0)
    const totalCredit = transactions.reduce((sum: number, t: any) => sum + t.credit, 0)
    const closingBalance = runningBalance

    return apiSuccess({
      account: {
        id: account.id,
        code: account.account_code,
        name: account.account_name,
        type: account.account_type,
        subType: account.sub_type,
        normalBalance: account.normal_balance
      },
      transactions,
      summary: {
        openingBalance,
        totalDebit,
        totalCredit,
        closingBalance,
        transactionCount: transactions.length,
        netChange: totalDebit - totalCredit
      },
      period: { from, to }
    })
  } catch (e: any) {
    console.error("Account statement error:", e)
    return serverError(`حدث خطأ أثناء إنشاء كشف الحساب: ${e?.message || "unknown_error"}`)
  }
}

