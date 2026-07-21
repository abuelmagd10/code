/**
 * v3.74.779 — approve an expense on the server.
 *
 * This is the first API route the expenses module has ever had. Approval used
 * to be six-plus browser round-trips: mark approved, resolve accounts, check
 * the cash balance, post the journal, link it back, and revert everything if
 * any of it failed — with three of those writes unchecked, including the
 * reverts. A dropped connection in the middle left the ledger and the expense
 * disagreeing, and the user was told it had worked.
 *
 * The route now does only what must happen before the money moves; the
 * approval and the posting are a single database transaction.
 *
 * WHAT STAYED IN THE BROWSER, ON PURPOSE
 * ---------------------------------------------------------------------------
 * Notifications. They are unchanged and still fire from the page after this
 * route returns. Moving them here would mean porting notification plumbing in
 * the same release that moves the accounting, and a notification that fails to
 * send is not a ledger problem. One thing at a time.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"

export async function POST(
  _request: NextRequest,
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

    const { data: expense, error: selectErr } = await supabase
      .from("expenses")
      .select("id, expense_number, amount, base_currency_amount, status, expense_account_id, payment_account_id")
      .eq("id", id)
      .eq("company_id", companyId)
      .maybeSingle()

    if (selectErr) {
      return NextResponse.json({ error: selectErr.message }, { status: 500 })
    }
    if (!expense) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 })
    }

    // ---- resolve accounts: expense → company defaults → 5000 / 1010 ---------
    // Same precedence the page used. Kept identical so a posting that worked
    // yesterday still works today; only the location of the code changed.
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
      const fallbackExpense = accounts?.find((a: any) => a.account_code === "5000")
      const fallbackCash = accounts?.find((a: any) => a.account_code === "1010")
      expenseAccountId = expenseAccountId || fallbackExpense?.id || null
      paymentAccountId = paymentAccountId || fallbackCash?.id || null
    }

    if (!expenseAccountId || !paymentAccountId) {
      // Refuse up front rather than approving and rolling back. The old flow
      // approved first, discovered this, and then tried to un-approve.
      return NextResponse.json({
        error: "ACCOUNTS_MISSING",
        message: "الاعتماد يتطلب ترحيل قيد محاسبى. حدّد حساب المصروف وحساب الدفع (أو الإعدادات الافتراضية للشركة)، ثم أعد الاعتماد.",
      }, { status: 400 })
    }

    // ---- cash overdraft rule ------------------------------------------------
    // A no-op for non-cash payment accounts, so it is safe to call always.
    try {
      const { assertCashOutflowAllowed } = await import("@/lib/accounting/cash-balance-validator")
      await assertCashOutflowAllowed(supabase, {
        accountId: paymentAccountId,
        amount: Number((expense as any).base_currency_amount ?? (expense as any).amount ?? 0),
        nativeAmount: Number((expense as any).amount ?? 0),
        companyId,
        description: `Expense ${(expense as any).expense_number}`,
      })
    } catch (e: any) {
      if (e?.name === "CashOverdraftError") {
        // Nothing to undo — the expense has not been touched yet.
        return NextResponse.json({ error: "CASH_OVERDRAFT", message: e.message }, { status: 400 })
      }
      throw e
    }

    // ---- approve + post, one transaction ------------------------------------
    // Role, status, separation of duties and the journal all live inside this
    // call. It cannot half-succeed.
    const { data, error } = await supabase.rpc("approve_expense_atomic", {
      p_expense_id: id,
      p_company_id: companyId,
      p_actor_id: user.id,
      p_expense_account_id: expenseAccountId,
      p_payment_account_id: paymentAccountId,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const result = (data ?? {}) as Record<string, any>
    if (!result.success) {
      const status = result.error === "FORBIDDEN" ? 403
        : result.error === "EXPENSE_NOT_FOUND" ? 404
        : 400
      return NextResponse.json(
        { error: result.error, message: result.message ?? result.error },
        { status }
      )
    }

    return NextResponse.json({
      success: true,
      message: result.already_approved
        ? "المصروف معتمد بالفعل"
        : "تَمَّ اعتماد المصروف وترحيل قيده بنجاح",
      ...result,
    })
  } catch (error: any) {
    console.error("[EXPENSE_APPROVE]", error)
    return NextResponse.json({ error: error?.message ?? "Unexpected error" }, { status: 500 })
  }
}
