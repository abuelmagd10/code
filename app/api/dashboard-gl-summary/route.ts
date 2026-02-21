/**
 * Dashboard GL Summary API
 * Phase 3: توحيد مصدر البيانات - يجلب الأرقام مباشرة من General Ledger
 *
 * هذا الـ API هو المصدر الرسمي والوحيد للحقيقة المالية على الـ Dashboard.
 * الأرقام هنا تعتمد على journal_entry_lines وليس الجداول التشغيلية.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { secureApiRequest, serverError, badRequestError } from "@/lib/api-security-enhanced"

export async function GET(request: NextRequest) {
  try {
    const authSupabase = await createServerClient()

    const { companyId, error } = await secureApiRequest(request, {
      requireAuth: true,
      requireCompany: true,
      requireBranch: false,
      requirePermission: { resource: "dashboard", action: "read" },
      supabase: authSupabase,
    })

    if (error) return error
    if (!companyId) return badRequestError("معرف الشركة مطلوب")

    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    // نطاق التاريخ
    const now = new Date()
    const period = searchParams.get("period") || "month"

    let fromDate: string
    let toDate: string = now.toISOString().slice(0, 10)

    if (period === "today") {
      fromDate = toDate
    } else if (period === "week") {
      fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    } else if (period === "year") {
      fromDate = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10)
    } else {
      // month (default)
      fromDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
    }

    const customFrom = searchParams.get("from")
    const customTo = searchParams.get("to")
    if (customFrom) fromDate = customFrom
    if (customTo) toDate = customTo

    // ══════════════════════════════════════════════════════
    // جلب القيود المحاسبية مع تفاصيل الحسابات (من GL فقط)
    // ══════════════════════════════════════════════════════
    const { data: glLines, error: glErr } = await supabase
      .from("journal_entry_lines")
      .select(`
        debit_amount,
        credit_amount,
        chart_of_accounts!inner (
          account_type,
          sub_type,
          account_code,
          account_name
        ),
        journal_entries!inner (
          entry_date,
          status,
          company_id
        )
      `)
      .eq("journal_entries.company_id", companyId)
      .eq("journal_entries.status", "posted")
      .gte("journal_entries.entry_date", fromDate)
      .lte("journal_entries.entry_date", toDate)

    if (glErr) {
      return serverError(`خطأ في جلب بيانات General Ledger: ${glErr.message}`)
    }

    // ══════════════════════════════════════════════════════
    // تجميع الأرقام حسب نوع الحساب
    // ══════════════════════════════════════════════════════
    let totalRevenue = 0       // إيرادات (income accounts)
    let totalCOGS = 0          // تكلفة البضاعة المباعة
    let totalExpenses = 0      // مصروفات تشغيلية (بدون COGS)
    let totalAssets = 0        // أصول (net debit)
    let totalLiabilities = 0   // التزامات (net credit)
    let totalEquity = 0        // حقوق الملكية (net credit)

    const revenueByAccount: Record<string, number> = {}
    const expenseByAccount: Record<string, number> = {}

    for (const line of glLines || []) {
      const coa = (line as any).chart_of_accounts
      const accountType = coa?.account_type || ""
      const subType = coa?.sub_type || ""
      const accountCode = coa?.account_code || ""
      const accountName = coa?.account_name || accountCode
      const debit = Number(line.debit_amount || 0)
      const credit = Number(line.credit_amount || 0)
      const net = debit - credit

      if (accountType === "income" || accountType === "revenue") {
        // الإيرادات: credit - debit (دائن يزيد)
        const amount = credit - debit
        totalRevenue += amount
        revenueByAccount[accountName] = (revenueByAccount[accountName] || 0) + amount
      } else if (
        accountType === "expense" &&
        (accountCode === "5000" || subType === "cogs" || subType === "cost_of_goods_sold")
      ) {
        // تكلفة البضاعة المباعة COGS
        totalCOGS += net
      } else if (accountType === "expense") {
        // مصروفات تشغيلية
        totalExpenses += net
        expenseByAccount[accountName] = (expenseByAccount[accountName] || 0) + net
      } else if (accountType === "asset") {
        totalAssets += net
      } else if (accountType === "liability") {
        totalLiabilities += credit - debit
      } else if (accountType === "equity") {
        totalEquity += credit - debit
      }
    }

    const grossProfit = totalRevenue - totalCOGS
    const netProfit = grossProfit - totalExpenses
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0

    // ══════════════════════════════════════════════════════
    // تجميع أكبر بنود الإيراد والمصروفات
    // ══════════════════════════════════════════════════════
    const topRevenue = Object.entries(revenueByAccount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, amount]) => ({ name, amount }))

    const topExpenses = Object.entries(expenseByAccount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, amount]) => ({ name, amount }))

    return NextResponse.json({
      success: true,
      source: "GL",
      sourceLabel: "General Ledger (الأرقام الرسمية)",
      period,
      fromDate,
      toDate,
      data: {
        // قائمة الدخل
        revenue: Math.round(totalRevenue * 100) / 100,
        cogs: Math.round(totalCOGS * 100) / 100,
        grossProfit: Math.round(grossProfit * 100) / 100,
        operatingExpenses: Math.round(totalExpenses * 100) / 100,
        netProfit: Math.round(netProfit * 100) / 100,
        profitMargin: Math.round(profitMargin * 10) / 10,

        // الميزانية (للفترة)
        assets: Math.round(totalAssets * 100) / 100,
        liabilities: Math.round(totalLiabilities * 100) / 100,
        equity: Math.round(totalEquity * 100) / 100,

        // تفصيل
        topRevenue,
        topExpenses,

        // عدد القيود
        journalLinesCount: (glLines || []).length,
      },
      note: "هذه الأرقام مستخرجة مباشرة من دفتر الأستاذ العام (GL) وهي المرجع الرسمي والمحاسبي الوحيد.",
    })
  } catch (e: any) {
    console.error("Dashboard GL Summary error:", e)
    return serverError(`خطأ في جلب ملخص GL: ${e?.message}`)
  }
}
