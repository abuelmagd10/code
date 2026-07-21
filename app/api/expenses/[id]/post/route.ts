/**
 * v3.74.779 — record payment for an already-approved expense, on the server.
 *
 * This is the third and last browser path that wrote to the ledger. It had the
 * same split as the others — post the journal, then update the expense in a
 * separate call — plus one of its own: it wrote payment_reference in that second
 * statement, so a reference could be recorded against an entry that was never
 * written, or lost against one that was.
 *
 * Since v3.74.779 approval already posts and marks the expense paid, this path
 * only applies to expenses left in 'approved' by the old flow. It is kept, and
 * routed through the same function, so there is no second way to write a journal
 * entry for an expense.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) {
      return NextResponse.json({ error: "Company context missing" }, { status: 400 })
    }

    let paymentReference: string | null = null
    try {
      const body = await request.json()
      paymentReference = String(body?.paymentReference ?? "").trim() || null
    } catch {
      /* no body is fine — the reference is optional */
    }

    const { data: expense, error: selectErr } = await supabase
      .from("expenses")
      .select("id, expense_number, amount, base_currency_amount, status, expense_account_id, payment_account_id, journal_entry_id")
      .eq("id", id)
      .eq("company_id", companyId)
      .maybeSingle()

    if (selectErr) return NextResponse.json({ error: selectErr.message }, { status: 500 })
    if (!expense) return NextResponse.json({ error: "Expense not found" }, { status: 404 })

    if ((expense as any).status !== "approved" && (expense as any).status !== "paid") {
      return NextResponse.json({
        error: "WRONG_STATUS",
        message: `لا يمكن تسجيل دفع مصروف حالته: ${(expense as any).status}`,
      }, { status: 400 })
    }

    // Account resolution, same precedence as everywhere else in this module.
    let expenseAccountId: string | null = (expense as any).expense_account_id ?? null
    let paymentAccountId: string | null = (expense as any).payment_account_id ?? null

    if (!expenseAccountId || !paymentAccountId) {
      const { data: settings } = await supabase
        .from("company_expenses_settings")
        .select("default_expense_account_id, default_payment_account_id")
        .eq("company_id", companyId)
        .maybeSingle()
      expenseAccountId = expenseAccountId || (settings as any)?.default_expense_account_id || null
      paymentAccountId = paymentAccountId || (settings as any)?.default_payment_account_id || null
    }
    if (!expenseAccountId || !paymentAccountId) {
      const { data: accounts } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code")
        .eq("company_id", companyId)
        .in("account_code", ["5000", "1010"])
      expenseAccountId = expenseAccountId || accounts?.find((a: any) => a.account_code === "5000")?.id || null
      paymentAccountId = paymentAccountId || accounts?.find((a: any) => a.account_code === "1010")?.id || null
    }

    // Only needed when there is no entry yet; an already-posted expense just
    // gets its reference recorded.
    if (!(expense as any).journal_entry_id && (!expenseAccountId || !paymentAccountId)) {
      return NextResponse.json({
        error: "ACCOUNTS_MISSING",
        message: "حدّد حساب المصروف وحساب الدفع (أو الإعدادات الافتراضية للشركة) قبل تسجيل الدفع.",
      }, { status: 400 })
    }

    if (!(expense as any).journal_entry_id) {
      try {
        const { assertCashOutflowAllowed } = await import("@/lib/accounting/cash-balance-validator")
        await assertCashOutflowAllowed(supabase, {
          accountId: paymentAccountId!,
          amount: Number((expense as any).base_currency_amount ?? (expense as any).amount ?? 0),
          nativeAmount: Number((expense as any).amount ?? 0),
          companyId,
          description: `Expense ${(expense as any).expense_number}`,
        })
      } catch (e: any) {
        if (e?.name === "CashOverdraftError") {
          return NextResponse.json({ error: "CASH_OVERDRAFT", message: e.message }, { status: 400 })
        }
        throw e
      }
    }

    const { data, error } = await supabase.rpc("post_expense_atomic", {
      p_expense_id: id,
      p_company_id: companyId,
      p_actor_id: user.id,
      p_expense_account_id: expenseAccountId,
      p_payment_account_id: paymentAccountId,
      p_payment_reference: paymentReference,
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    const result = (data ?? {}) as Record<string, any>
    if (!result.success) {
      return NextResponse.json(
        { error: result.error, message: result.message ?? result.error },
        { status: result.error === "EXPENSE_NOT_FOUND" ? 404 : 400 }
      )
    }

    return NextResponse.json({
      success: true,
      message: "تَمَّ تسجيل الدفع وترحيل القيد",
      ...result,
    })
  } catch (error: any) {
    console.error("[EXPENSE_POST]", error)
    return NextResponse.json({ error: error?.message ?? "Unexpected error" }, { status: 500 })
  }
}
