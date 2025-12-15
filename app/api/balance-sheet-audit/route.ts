import { NextRequest, NextResponse } from "next/server"
import { createClient as createSSR } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { secureApiRequest } from "@/lib/api-security"
import { apiError, apiSuccess, HTTP_STATUS, internalError } from "@/lib/api-error-handler"

async function getAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  return url && serviceKey ? createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } }) : null
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSSR()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return apiError(HTTP_STATUS.UNAUTHORIZED, "غير مصرح", "Unauthorized")

    // جلب الشركة
    const { data: company } = await supabase
      .from("companies")
      .select("id")
      .eq("user_id", user.id)
      .single()

    // إذا لم يكن مالك، جرب كعضو
    let companyId = company?.id
    if (!companyId) {
      const { data: member } = await supabase
        .from("company_members")
        .select("company_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .single()
      companyId = member?.company_id
    }

    if (!companyId) return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على الشركة", "Company not found")

    const admin = await getAdmin()
    // استخدم supabase العادي إذا لم يتوفر admin
    const db = admin || supabase

    // 1. جلب جميع الحسابات
    const { data: accounts, error: accError } = await db
      .from("chart_of_accounts")
      .select("id, account_code, account_name, account_type, sub_type, normal_balance, parent_id")
      .eq("company_id", companyId)
      .order("account_code")

    if (accError) return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في جلب الحسابات", accError.message)

    // تحديد الحسابات الورقية
    const parentIds = new Set(accounts?.filter((a: any) => a.parent_id).map((a: any) => a.parent_id))
    const leafAccounts = accounts?.filter((a: any) => !parentIds.has(a.id)) || []

    // 2. جلب جميع سطور القيود
    const { data: lines, error: linesError } = await db
      .from("journal_entry_lines")
      .select("journal_entry_id, account_id, debit_amount, credit_amount")

    if (linesError) return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في جلب القيود", linesError.message)

    // 3. حساب أرصدة الحسابات
    const balances: Record<string, number> = {}
    for (const line of lines || []) {
      const aid = line.account_id
      const debit = Number(line.debit_amount || 0)
      const credit = Number(line.credit_amount || 0)
      balances[aid] = (balances[aid] || 0) + debit - credit
    }

    // 4. تجميع حسب النوع
    const byType: Record<string, { accounts: any[], total: number }> = {
      asset: { accounts: [], total: 0 },
      liability: { accounts: [], total: 0 },
      equity: { accounts: [], total: 0 },
      income: { accounts: [], total: 0 },
      expense: { accounts: [], total: 0 }
    }

    const negativeBalances: any[] = []

    for (const acc of leafAccounts) {
      const balance = balances[acc.id] || 0
      if (Math.abs(balance) < 0.01) continue
      
      const type = acc.account_type
      if (byType[type]) {
        byType[type].accounts.push({ ...acc, balance })
        byType[type].total += balance
      }

      // تحديد الأرصدة السالبة غير المنطقية
      // الذمم المدينة (accounts_receivable) يجب أن تكون موجبة
      // الحسابات الدائنة (accounts_payable) يجب أن تكون سالبة (رصيد دائن)
      if (acc.sub_type === 'accounts_receivable' && balance < 0) {
        negativeBalances.push({ ...acc, balance, issue: 'ذمم مدينة سالبة - يجب تصنيفها كسلف عملاء' })
      }
      if (acc.sub_type === 'accounts_payable' && balance > 0) {
        negativeBalances.push({ ...acc, balance, issue: 'حسابات دائنة موجبة - يجب تصنيفها كأرصدة مدينة للموردين' })
      }
      if (acc.sub_type === 'customer_credit' && balance > 0) {
        negativeBalances.push({ ...acc, balance, issue: 'سلف عملاء برصيد موجب (مدين) - غير منطقي' })
      }
    }

    // 5. فحص القيود غير المتوازنة
    const { data: entries } = await db
      .from("journal_entries")
      .select("id, entry_date, description, reference_type, reference_id")
      .eq("company_id", companyId)

    const entryTotals: Record<string, { debit: number, credit: number }> = {}
    for (const line of lines || []) {
      const eid = line.journal_entry_id
      if (!entryTotals[eid]) entryTotals[eid] = { debit: 0, credit: 0 }
      entryTotals[eid].debit += Number(line.debit_amount || 0)
      entryTotals[eid].credit += Number(line.credit_amount || 0)
    }

    const unbalancedEntries: any[] = []
    let totalImbalance = 0
    for (const entry of entries || []) {
      const totals = entryTotals[entry.id] || { debit: 0, credit: 0 }
      const diff = totals.debit - totals.credit
      if (Math.abs(diff) > 0.01) {
        totalImbalance += diff
        unbalancedEntries.push({
          id: entry.id,
          entry_date: entry.entry_date,
          reference_type: entry.reference_type,
          reference_id: entry.reference_id,
          description: entry.description,
          debit: totals.debit,
          credit: totals.credit,
          difference: diff
        })
      }
    }

    // 6. حساب الإجماليات
    const assets = byType.asset.total
    const liabilities = byType.liability.total
    const equity = byType.equity.total
    const income = byType.income.total
    const expense = byType.expense.total
    const netIncome = income + expense
    const totalEquity = equity + netIncome
    const totalLiabilitiesEquity = liabilities + totalEquity
    const balanceSheetDifference = assets - totalLiabilitiesEquity

    return apiSuccess({
      summary: {
        assets,
        liabilities,
        equity,
        income,
        expense,
        netIncome,
        totalEquity,
        totalLiabilitiesEquity,
        balanceSheetDifference,
        isBalanced: Math.abs(balanceSheetDifference) < 0.01
      },
      accountsByType: byType,
      negativeBalances,
      unbalancedEntries,
      totalImbalance
    })
  } catch (e: any) {
    return internalError("حدث خطأ أثناء فحص الميزانية", e?.message)
  }
}

