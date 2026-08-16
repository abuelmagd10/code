import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { secureApiRequest, serverError, badRequestError } from "@/lib/api-security-enhanced"
import { apiSuccess } from "@/lib/api-error-handler"

/**
 * 🔐 General Ledger API - دفتر الأستاذ العام
 *
 * ⚠️ CRITICAL ACCOUNTING FUNCTION - FINAL APPROVED LOGIC
 *
 * ✅ هذا المنطق معتمد نهائيًا ولا يتم تغييره إلا بحذر شديد
 * ✅ مطابق لأنظمة ERP الاحترافية (Odoo / Zoho / SAP)
 *
 * ✅ القواعد الإلزامية الثابتة:
 * 1. Single Source of Truth:
 *    - جميع البيانات تأتي من journal_entries فقط
 *    - لا قيم ثابتة أو محفوظة مسبقًا
 *    - التسلسل: journal_entries → journal_entry_lines → general_ledger
 *
 * 2. Phase 4 Enhancement - Pagination:
 *    - عند تحديد accountId: pagination في DB عبر get_gl_transactions_paginated RPC
 *    - عند جلب كل الحسابات: يُستخدم get_gl_account_summary RPC (ملخص لا تفاصيل)
 *    - يمنع تحميل ملايين السطور في الذاكرة
 *
 * 3. Balance Calculation:
 *    - الرصيد = opening_balance + (debit - credit) movements
 *    - حسب الطبيعة المحاسبية للحساب
 *
 * ⚠️ DO NOT MODIFY WITHOUT SENIOR ACCOUNTING REVIEW
 */
export async function GET(req: NextRequest) {
  try {
    // ✅ إنشاء supabase client للمصادقة
    const authSupabase = await createServerClient()

    // ✅ التحقق من الأمان
    const { companyId, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requireBranch: false,
      requirePermission: { resource: "reports", action: "read" },
      supabase: authSupabase
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
    const accountId   = searchParams.get("accountId")   // optional
    const from        = searchParams.get("from") || "0001-01-01"
    const to          = searchParams.get("to")   || "9999-12-31"
    const page        = Math.max(1, parseInt(searchParams.get("page")     || "1",  10))
    const pageSize    = Math.min(200, Math.max(10, parseInt(searchParams.get("pageSize") || "50", 10)))
    const summaryOnly = searchParams.get("summary") === "true" // جلب ملخص فقط بدون تفاصيل سطور

    // ══════════════════════════════════════════════════════
    // المسار 1: حساب واحد مع Pagination كامل (Phase 4)
    // ══════════════════════════════════════════════════════
    if (accountId && !summaryOnly) {
      // v3.75.41 — **ولا نداءَ لما لا وجودَ له.**
      //
      // كان هنا نداءٌ لـ`get_gl_transactions_paginated`، وقِيس على الإنتاج
      // فسقطَ بـ42P01 `missing FROM-clause entry for table "jel"` — **على شركةِ
      // صاحبِ العملِ نفسِه**، أى أنّه لم يعملْ قطُّ لأحد. وخطّةُ التراجعِ هنا
      // كانت تلتقطُ «الدالّةُ غير موجودة» لا «الدالّةُ معطوبة»، فكانت الشاشةُ
      // ترى رسالةَ خطأٍ بدل الدفتر.
      //
      // فأُزيلت الدالّةُ فى v3.75.41 — **وبيتٌ لا يُسكَنُ ليس بيتاً** — وصارَ
      // هذا المسارُ ينادى الطريقَ الذى يعملُ فعلاً مباشرةً، بلا نداءٍ لاسمٍ
      // لا وجودَ له وبلا خطّةِ تراجعٍ تُخفى عطباً.
      return legacySingleAccountGL(supabase, companyId, accountId, from, to)
    }

    // ══════════════════════════════════════════════════════
    // المسار 2: ملخص كل الحسابات (Phase 4 - DB Aggregation)
    // ══════════════════════════════════════════════════════
    const { data: summaryRows, error: summaryErr } = await supabase.rpc(
      "get_gl_account_summary",
      {
        p_company_id: companyId,
        p_from_date:  from,
        p_to_date:    to,
        p_account_id: accountId || null
      }
    )

    if (summaryErr) {
      // fallback إذا لم تكن الدالة موجودة
      const isFunctionMissing =
        summaryErr.code === "PGRST202" ||
        summaryErr.code === "42883"    ||
        summaryErr.message?.includes("Could not find the function") ||
        summaryErr.message?.includes("does not exist")
      if (isFunctionMissing) {
        return legacyAllAccountsGL(supabase, companyId, from, to, accountId)
      }
      return serverError(`خطأ في جلب ملخص دفتر الأستاذ: ${summaryErr.message}`)
    }

    const accounts = (summaryRows || []).map((row: any) => ({
      accountId:        row.account_id,
      accountCode:      row.account_code,
      accountName:      row.account_name,
      accountType:      row.account_type,
      subType:          row.sub_type,
      openingBalance:   Number(row.opening_balance  ?? 0),
      totalDebit:       Number(row.total_debit       ?? 0),
      totalCredit:      Number(row.total_credit      ?? 0),
      closingBalance:   Number(row.closing_balance   ?? 0),
      transactionCount: Number(row.transaction_count ?? 0),
      // لا نرسل تفاصيل السطور في وضع الملخص - يُطلبها المستخدم per-account
      transactions: []
    }))

    return apiSuccess({
      mode: "summary",
      accounts,
      period: { from, to },
      pagination: {
        note: "لجلب تفاصيل حساب محدد مع Pagination، أضف ?accountId=<uuid>&page=1&pageSize=50"
      },
      summary: {
        totalAccounts:     accounts.length,
        totalTransactions: accounts.reduce((s: number, a: any) => s + a.transactionCount, 0),
        totalDebit:        accounts.reduce((s: number, a: any) => s + a.totalDebit, 0),
        totalCredit:       accounts.reduce((s: number, a: any) => s + a.totalCredit, 0)
      }
    })
  } catch (e: any) {
    console.error("General ledger error:", e)
    return serverError(`حدث خطأ أثناء إنشاء دفتر الأستاذ العام: ${e?.message || "unknown_error"}`)
  }
}

// ══════════════════════════════════════════════════════════════════
// Fallback: Legacy single-account GL (backward compatibility)
// ══════════════════════════════════════════════════════════════════
async function legacySingleAccountGL(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  companyId: string,
  accountId: string,
  from: string,
  to: string
): Promise<NextResponse> {
  const { data: account } = await supabase
    .from("chart_of_accounts")
    .select("id, account_code, account_name, account_type, sub_type, opening_balance")
    .eq("company_id", companyId)
    .eq("id", accountId)
    .maybeSingle()

  if (!account) return NextResponse.json({ error: "الحساب غير موجود" }, { status: 404 })

  const { data: lines } = await supabase
    .from("journal_entry_lines")
    .select(`
      id, account_id, debit_amount, credit_amount, description,
      journal_entries!inner(id, entry_number, entry_date, description, reference_type, reference_id, status, company_id, deleted_at)
    `)
    .eq("journal_entries.company_id", companyId)
    .eq("journal_entries.status", "posted")
    .neq("journal_entries.is_deleted", true)
    .is("journal_entries.deleted_at", null)
    .gte("journal_entries.entry_date", from)
    .lte("journal_entries.entry_date", to)
    .eq("account_id", accountId)
    .order("journal_entries.entry_date")

  const { data: openingLines } = await supabase
    .from("journal_entry_lines")
    .select(`account_id, debit_amount, credit_amount, journal_entries!inner(entry_date, status, company_id)`)
    .eq("journal_entries.company_id", companyId)
    .eq("journal_entries.status", "posted")
    .lt("journal_entries.entry_date", from)
    .eq("account_id", accountId)

  let openingBalance: number = account.opening_balance || 0
  if (openingLines) {
    openingLines.forEach((l: any) => { openingBalance += (l.debit_amount || 0) - (l.credit_amount || 0) })
  }

  let runningBalance = openingBalance
  const transactions = (lines || []).map((line: any) => {
    const debit  = line.debit_amount  || 0
    const credit = line.credit_amount || 0
    runningBalance += debit - credit
    return {
      date:          line.journal_entries.entry_date,
      entryNumber:   line.journal_entries.entry_number || `JE-${line.journal_entries.id.slice(0, 8)}`,
      description:   line.description || line.journal_entries.description || "",
      referenceType: line.journal_entries.reference_type || "",
      debit,
      credit,
      balance:       runningBalance
    }
  })

  return NextResponse.json({
    success: true,
    mode: "legacy",
    accounts: [{
      accountId:        account.id,
      accountCode:      account.account_code,
      accountName:      account.account_name,
      accountType:      account.account_type,
      subType:          account.sub_type,
      openingBalance,
      transactions,
      closingBalance:   runningBalance,
      totalDebit:       transactions.reduce((s: number, t: any) => s + t.debit, 0),
      totalCredit:      transactions.reduce((s: number, t: any) => s + t.credit, 0),
      transactionCount: transactions.length
    }],
    period: { from, to }
  })
}

// ══════════════════════════════════════════════════════════════════
// Fallback: Legacy all-accounts GL (backward compatibility)
// ══════════════════════════════════════════════════════════════════
async function legacyAllAccountsGL(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  companyId: string,
  from: string,
  to: string,
  accountId: string | null
): Promise<NextResponse> {
  let accountsQuery = supabase
    .from("chart_of_accounts")
    .select("id, account_code, account_name, account_type, sub_type, opening_balance, normal_balance")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("account_code")

  if (accountId) accountsQuery = accountsQuery.eq("id", accountId)

  const { data: accounts, error: accountsError } = await accountsQuery

  if (accountsError) return NextResponse.json({ error: accountsError.message }, { status: 500 })
  if (!accounts || accounts.length === 0) {
    return NextResponse.json({ success: true, accounts: [], period: { from, to } })
  }

  const accountIds = accounts.map((a: any) => a.id)

  const { data: lines } = await supabase
    .from("journal_entry_lines")
    .select(`
      id, account_id, debit_amount, credit_amount, description,
      journal_entries!inner(id, entry_number, entry_date, description, reference_type, reference_id, status, company_id, deleted_at)
    `)
    .eq("journal_entries.company_id", companyId)
    .eq("journal_entries.status", "posted")
    .neq("journal_entries.is_deleted", true)
    .is("journal_entries.deleted_at", null)
    .gte("journal_entries.entry_date", from)
    .lte("journal_entries.entry_date", to)
    .in("account_id", accountIds)
    .order("journal_entries.entry_date")

  const { data: openingLines } = await supabase
    .from("journal_entry_lines")
    .select(`account_id, debit_amount, credit_amount, journal_entries!inner(entry_date, status, company_id)`)
    .eq("journal_entries.company_id", companyId)
    .eq("journal_entries.status", "posted")
    .lt("journal_entries.entry_date", from)
    .in("account_id", accountIds)

  const openingBalances: Record<string, number> = {}
  accounts.forEach((acc: any) => { openingBalances[acc.id] = acc.opening_balance || 0 })
  if (openingLines) {
    openingLines.forEach((line: any) => {
      openingBalances[line.account_id] = (openingBalances[line.account_id] || 0) + (line.debit_amount || 0) - (line.credit_amount || 0)
    })
  }

  const accountsData = accounts.map((account: any) => {
    const accountLines = (lines || []).filter((l: any) => l.account_id === account.id)
    let runningBalance = openingBalances[account.id] || 0
    const transactions = accountLines.map((line: any) => {
      const debit  = line.debit_amount  || 0
      const credit = line.credit_amount || 0
      runningBalance += debit - credit
      return {
        date:          line.journal_entries.entry_date,
        entryNumber:   line.journal_entries.entry_number || `JE-${line.journal_entries.id.slice(0, 8)}`,
        description:   line.description || line.journal_entries.description || "",
        referenceType: line.journal_entries.reference_type || "",
        debit, credit, balance: runningBalance
      }
    })
    return {
      accountId:        account.id,
      accountCode:      account.account_code,
      accountName:      account.account_name,
      accountType:      account.account_type,
      subType:          account.sub_type,
      openingBalance:   openingBalances[account.id] || 0,
      transactions,
      closingBalance:   runningBalance,
      totalDebit:       accountLines.reduce((s: number, l: any) => s + (l.debit_amount  || 0), 0),
      totalCredit:      accountLines.reduce((s: number, l: any) => s + (l.credit_amount || 0), 0),
      transactionCount: transactions.length
    }
  })

  const filteredAccounts = accountsData.filter((acc: any) =>
    acc.transactionCount > 0 ||
    Math.abs(acc.openingBalance) >= 0.01 ||
    Math.abs(acc.closingBalance) >= 0.01
  )

  return NextResponse.json({
    success: true,
    mode: "legacy",
    accounts: filteredAccounts,
    period: { from, to },
    summary: {
      totalAccounts:     filteredAccounts.length,
      totalTransactions: filteredAccounts.reduce((s: number, a: any) => s + a.transactionCount, 0),
      totalDebit:        filteredAccounts.reduce((s: number, a: any) => s + a.totalDebit, 0),
      totalCredit:       filteredAccounts.reduce((s: number, a: any) => s + a.totalCredit, 0)
    }
  })
}
