import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { secureApiRequest, serverError, badRequestError } from "@/lib/api-security-enhanced"
import { apiSuccess } from "@/lib/api-error-handler"

/**
 * كشف حساب (Account Statement)
 * يعرض جميع الحركات على حساب واحد مع الرصيد الجاري
 */
export async function GET(req: NextRequest) {
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
  
  try {
    const { user, companyId, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requireBranch: false,
      requirePermission: { resource: "reports", action: "read" }
    })

    if (error) return error
    if (!companyId) return badRequestError("معرف الشركة مطلوب")

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

    // جلب الرصيد الافتتاحي (قبل تاريخ البداية)
    const { data: openingLines, error: openingError } = await supabase
      .from("journal_entry_lines")
      .select(`
        debit_amount,
        credit_amount,
        journal_entries!inner(
          entry_date,
          status,
          company_id
        )
      `)
      .eq("journal_entries.company_id", companyId)
      .eq("journal_entries.status", "posted")
      .eq("account_id", accountId)
      .lt("journal_entries.entry_date", from)

    let openingBalance = account.opening_balance || 0
    if (openingLines && !openingError) {
      openingLines.forEach((line: any) => {
        const debit = line.debit_amount || 0
        const credit = line.credit_amount || 0
        openingBalance += debit - credit
      })
    }

    // جلب جميع قيود اليومية المرحّلة في الفترة
    const { data: lines, error: linesError } = await supabase
      .from("journal_entry_lines")
      .select(`
        id,
        debit_amount,
        credit_amount,
        description,
        journal_entries!inner(
          id,
          entry_number,
          entry_date,
          description,
          reference_type,
          reference_id,
          status,
          company_id
        )
      `)
      .eq("journal_entries.company_id", companyId)
      .eq("journal_entries.status", "posted")
      .eq("account_id", accountId)
      .gte("journal_entries.entry_date", from)
      .lte("journal_entries.entry_date", to)
      .order("journal_entries.entry_date")

    if (linesError) {
      console.error("Lines query error:", linesError)
      return serverError(`خطأ في جلب بيانات القيود: ${linesError.message}`)
    }

    // بناء قائمة الحركات مع الرصيد الجاري
    let runningBalance = openingBalance
    const transactions = (lines || []).map((line: any) => {
      const debit = line.debit_amount || 0
      const credit = line.credit_amount || 0
      runningBalance += debit - credit

      // جلب رقم المرجع بناءً على نوع المرجع
      let referenceNumber = ""
      if (line.journal_entries.reference_type === "invoice") {
        referenceNumber = "INV-" + (line.journal_entries.reference_id?.slice(0, 8) || "")
      } else if (line.journal_entries.reference_type === "bill") {
        referenceNumber = "BILL-" + (line.journal_entries.reference_id?.slice(0, 8) || "")
      } else if (line.journal_entries.reference_type === "payment") {
        referenceNumber = "PAY-" + (line.journal_entries.reference_id?.slice(0, 8) || "")
      }

      return {
        id: line.id,
        date: line.journal_entries.entry_date,
        entryNumber: line.journal_entries.entry_number || `JE-${line.journal_entries.id.slice(0, 8)}`,
        description: line.description || line.journal_entries.description || "",
        referenceType: line.journal_entries.reference_type || "",
        referenceNumber,
        debit,
        credit,
        runningBalance
      }
    })

    const totalDebit = transactions.reduce((sum, t) => sum + t.debit, 0)
    const totalCredit = transactions.reduce((sum, t) => sum + t.credit, 0)
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

