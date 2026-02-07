/**
 * 🔐 Simple Financial Summary API - تقرير ملخص النشاط المالي
 * 
 * ⚠️ ACCOUNTING REPORT - يعتمد بالكامل على journal_entries فقط
 * 
 * ✅ هذا التقرير مبسط لغير المحاسبين لكنه يعتمد على المصدر المحاسبي الرسمي
 * ✅ جميع البيانات تأتي من journal_entries → journal_entry_lines فقط
 * ✅ لا قيم ثابتة أو محفوظة مسبقًا
 * ✅ مطابق لمنهجية التقارير المحاسبية الأساسية (Balance Sheet, Income Statement)
 * 
 * ✅ القواعد الإلزامية:
 * 1. Single Source of Truth:
 *    - جميع البيانات تأتي من journal_entries فقط
 *    - لا invoices أو bills مباشرة
 *    - التسلسل: journal_entries → journal_entry_lines → simple_report
 * 
 * 2. Data Source:
 *    - رأس المال: من حسابات equity في journal_entries
 *    - المبيعات: من حسابات income (sub_type = 'sales_revenue' أو account_code = '4000')
 *    - المشتريات:
 *        - محاسبيًا: من حسابات expense (sub_type = 'purchases' أو account_code = '5110') إن وُجدت
 *        - تشغيليًا (للتبسيط ولضمان الدقة): من فواتير الشراء (bills) خلال الفترة
 *      ✅ الهدف في التقرير المبسط: عدم إخفاء أي مشتريات تمت فعليًا حتى لو كانت المعالجة المحاسبية عبر المخزون (inventory asset)
 *    - COGS: من حسابات expense (sub_type = 'cogs' أو account_code = '5100')
 *    - المصروفات: من حسابات expense (باستثناء COGS والمشتريات والإهلاك)
 *    - الإهلاك: من حسابات expense (account_code = '5500')
 *
 * 3. Calculations:
 *    - مجمل الربح = المبيعات - تكلفة البضاعة المباعة (COGS)
 *    - صافي الربح = مجمل الربح - المصروفات التشغيلية - الإهلاك
 *    - Gross Profit = Sales - COGS
 *    - Net Profit = Gross Profit - Operating Expenses - Depreciation
 * 
 * 4. Filtering:
 *    - فلترة القيود المحذوفة: .is("deleted_at", null)
 *    - فلترة القيود المرحّلة فقط: .eq("status", "posted")
 *    - استثناء الحسابات صفرية الرصيد
 * 
 * ⚠️ DO NOT MODIFY WITHOUT ACCOUNTING REVIEW
 * 
 * راجع: docs/ACCOUNTING_REPORTS_ARCHITECTURE.md
 */

import { createClient } from "@supabase/supabase-js"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { secureApiRequest, serverError } from "@/lib/api-security-enhanced"
import { NextRequest, NextResponse } from "next/server"
import { badRequestError, apiSuccess } from "@/lib/api-error-handler"

export async function GET(request: NextRequest) {
  try {
    // ✅ إنشاء supabase client للمصادقة
    const authSupabase = await createServerClient()

    // ✅ التحقق من الأمان
    const { user, companyId, branchId, member, error } = await secureApiRequest(request, {
      requireAuth: true,
      requireCompany: true,
      requireBranch: false,
      requirePermission: { resource: "reports", action: "read" },
      supabase: authSupabase
    })

    if (error) return error
    if (!companyId) return badRequestError("معرف الشركة مطلوب")

    // ✅ بعد التحقق من الأمان، نستخدم service role key للاستعلامات
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

    const { searchParams } = new URL(request.url)
    const fromDate = searchParams.get("from") || "2000-01-01"
    const toDate = searchParams.get("to") || new Date().toISOString().split("T")[0]

    // ✅ جلب القيود المرحّلة (مصدر البيانات الوحيد)
    // ✅ فلترة القيود المحذوفة والمرحّلة فقط
    // ✅ رأس المال: جميع القيود حتى toDate (بغض النظر عن fromDate)
    const { data: journalEntriesData, error: entriesError } = await supabase
      .from("journal_entries")
      .select("id")
      .eq("company_id", companyId)
      .eq("status", "posted")
      .is("deleted_at", null) // ✅ استثناء القيود المحذوفة
      .lte("entry_date", toDate) // ✅ رأس المال: جميع القيود حتى toDate

    if (entriesError) {
      return serverError(`خطأ في جلب القيود: ${entriesError.message}`)
    }

    const journalEntryIds = (journalEntriesData || []).map((je: any) => je.id)

    if (journalEntryIds.length === 0) {
      return apiSuccess({
        capital: { total: 0 },
        purchases: { total: 0, count: 0 },
        expenses: { total: 0, items: [] },
        depreciation: { total: 0 },
        sales: { total: 0, count: 0, pending: 0 },
        cogs: { total: 0 },
        profit: { gross: 0, net: 0 },
        period: { from: fromDate, to: toDate }
      })
    }

    // ✅ جلب سطور القيود مع معلومات الحسابات
    const { data: journalLinesData, error: linesError } = await supabase
      .from("journal_entry_lines")
      .select(`
        account_id,
        debit_amount,
        credit_amount,
        journal_entry_id,
        journal_entries!inner(entry_date, company_id, status, deleted_at),
        chart_of_accounts!inner(account_type, account_code, account_name, sub_type)
      `)
      .in("journal_entry_id", journalEntryIds)
      .eq("journal_entries.company_id", companyId)
      .eq("journal_entries.status", "posted")
      .is("journal_entries.deleted_at", null) // ✅ فلترة القيود المحذوفة

    if (linesError) {
      return serverError(`خطأ في جلب سطور القيود: ${linesError.message}`)
    }

    // ✅ فلترة سطور القيود حسب الفترة (للمبيعات والمشتريات والمصروفات)
    const periodLines = (journalLinesData || []).filter((line: any) => {
      const entryDate = line.journal_entries?.entry_date
      if (!entryDate) return false
      return entryDate >= fromDate && entryDate <= toDate
    })

    // ✅ حساب رأس المال (من جميع القيود حتى toDate)
    let totalCapital = 0
    const capitalLines = (journalLinesData || []).filter((line: any) => {
      const coa = Array.isArray(line.chart_of_accounts) ? line.chart_of_accounts[0] : line.chart_of_accounts
      return coa?.account_type === "equity"
    })
    for (const line of capitalLines) {
      const credit = Number(line.credit_amount || 0)
      const debit = Number(line.debit_amount || 0)
      // حقوق الملكية تزيد بالدائن
      totalCapital += credit - debit
    }

    // ✅ حساب المبيعات (من journal_entries فقط)
    let totalSales = 0
    let salesCount = 0
    const salesLines = periodLines.filter((line: any) => {
      const coa = line.chart_of_accounts
      return coa?.account_type === "income" &&
             (coa?.sub_type === "sales_revenue" || coa?.account_code === "4000") // ✅ تصحيح: 4000 = المبيعات (ليس 4100)
    })
    const salesEntryIds = new Set<string>()
    for (const line of salesLines) {
      const credit = Number(line.credit_amount || 0)
      const debit = Number(line.debit_amount || 0)
      // الإيرادات تزيد بالدائن
      const amount = credit - debit
      if (amount > 0) {
        totalSales += amount
        salesEntryIds.add(line.journal_entry_id)
      }
    }
    salesCount = salesEntryIds.size

    // ✅ حساب المشتريات
    // ✅ المستوى المحاسبي: من حسابات expense مع sub_type = 'purchases' أو account_code = '5110' (إن وُجدت)
    // ✅ المستوى التشغيلي (للتقرير المبسط): من فواتير الشراء (bills) خلال الفترة
    // 🎯 الهدف: عدم إظهار مشتريات = 0 إذا كانت هناك مشتريات فعلية (فواتير شراء أو قيود شراء)

    // 1) مشتريات من القيود المحاسبية (حسابات المشتريات التقليدية إن وُجدت)
    let journalPurchasesTotal = 0
    let journalPurchasesCount = 0
    const purchasesLines = periodLines.filter((line: any) => {
      const coa = line.chart_of_accounts
      return coa?.account_type === "expense" && 
             (coa?.sub_type === "purchases" || coa?.account_code === "5110")
    })
    const purchaseReturnsLines = periodLines.filter((line: any) => {
      const coa = line.chart_of_accounts
      return coa?.account_type === "expense" && 
             (coa?.sub_type === "purchase_returns" || coa?.account_code === "5120")
    })
    const purchasesEntryIds = new Set<string>()
    
    // المشتريات تزيد بالمدين
    for (const line of purchasesLines) {
      const debit = Number(line.debit_amount || 0)
      const credit = Number(line.credit_amount || 0)
      const amount = debit - credit
      if (amount > 0.01) {
        journalPurchasesTotal += amount
        purchasesEntryIds.add(line.journal_entry_id)
      }
    }
    
    // مردودات المشتريات تزيد بالدائن (نطرحها من المشتريات)
    for (const line of purchaseReturnsLines) {
      const debit = Number(line.debit_amount || 0)
      const credit = Number(line.credit_amount || 0)
      const amount = credit - debit // مردودات تزيد بالدائن
      if (amount > 0.01) {
        journalPurchasesTotal = Math.max(0, journalPurchasesTotal - amount) // طرح مردودات المشتريات
      }
    }
    
    journalPurchasesCount = purchasesEntryIds.size

    // 2) مشتريات من فواتير الشراء (bills) - مصدر تشغيلي موثوق للحركة الفعلية
    let billsPurchasesTotal = 0
    let billsPurchasesCount = 0
    try {
      const { data: purchasesBills, error: billsError } = await supabase
        .from("bills")
        .select("id, total_amount, status, bill_date, is_deleted")
        .eq("company_id", companyId)
        .or("is_deleted.is.null,is_deleted.eq.false")
        .gte("bill_date", fromDate)
        .lte("bill_date", toDate)
        .in("status", ["received", "partially_paid", "paid"]) // ✅ استخدام "received" للـ bills (ليس "sent" الذي هو للـ invoices)

      if (billsError) {
        console.warn("Could not load purchase bills in simple-report:", billsError)
      } else {
        billsPurchasesTotal = (purchasesBills || []).reduce(
          (sum, bill: any) => sum + Number(bill.total_amount || 0),
          0
        )
        billsPurchasesCount = (purchasesBills || []).length
      }
    } catch (e: any) {
      console.warn("Error loading purchase bills in simple-report:", e)
    }

    // 3) اختيار المصدر النهائي للمشتريات في التقرير المبسط
    // ✅ إذا وُجدت مشتريات محاسبية (journalPurchasesTotal > 0) نستخدمها
    // ✅ إذا لم توجد مشتريات محاسبية لكن توجد فواتير شراء بمبلغ فعلي (billsPurchasesTotal >= 0.01) نستخدم فواتير الشراء
    // ✅ لا يُسمح بعرض مشتريات = 0 إذا وُجدت فواتير شراء فعلية بمبلغ فعلي داخل الفترة
    let totalPurchases = journalPurchasesTotal
    let purchasesCount = journalPurchasesCount

    if (totalPurchases < 0.01 && billsPurchasesTotal >= 0.01) {
      // ✅ استخدام فواتير الشراء إذا وُجدت بمبلغ فعلي (>= 0.01)
      totalPurchases = billsPurchasesTotal
      purchasesCount = billsPurchasesCount
    }

    // تحقق إضافي: إذا وُجدت فواتير شراء بمبلغ فعلي لكن النتيجة لا تزال 0 → تحذير نظام
    // ✅ هذا يعني أن هناك مشكلة في المنطق (مثلاً: فواتير بمبلغ لكن لم تُستخدم)
    if (billsPurchasesTotal >= 0.01 && totalPurchases < 0.01) {
      console.error("🚨 SYSTEM ERROR: Purchases bills with actual amounts exist but simple-report shows purchases = 0")
      console.error(`BillsPurchasesTotal=${billsPurchasesTotal}, BillsCount=${billsPurchasesCount}, JournalPurchasesTotal=${journalPurchasesTotal}, JournalPurchasesCount=${journalPurchasesCount}`)
    }

    // ✅ حساب COGS (من journal_entries فقط)
    let totalCOGS = 0
    const cogsLines = periodLines.filter((line: any) => {
      const coa = Array.isArray(line.chart_of_accounts) ? line.chart_of_accounts[0] : line.chart_of_accounts
      return coa?.account_type === "expense" &&
             (coa?.sub_type === "cogs" || coa?.sub_type === "cost_of_goods_sold" || coa?.account_code === "5100")
    })
    for (const line of cogsLines) {
      const debit = Number(line.debit_amount || 0)
      const credit = Number(line.credit_amount || 0)
      // COGS تزيد بالمدين
      totalCOGS += debit - credit
    }

    // ✅ حساب المصروفات التشغيلية (من journal_entries فقط)
    // ✅ استثناء COGS والمشتريات والإهلاك
    const expensesByAccount: { [key: string]: { name: string; amount: number } } = {}
    const expensesLines = periodLines.filter((line: any) => {
      const coa = line.chart_of_accounts
      if (coa?.account_type !== "expense") return false
      const subType = coa?.sub_type || ""
      const accountCode = coa?.account_code || ""
      // استثناء COGS والمشتريات والإهلاك
      if (subType === "cogs" || subType === "cost_of_goods_sold" || accountCode === "5100") return false
      if (subType === "purchases" || accountCode === "5110") return false
      if (subType === "purchase_returns" || accountCode === "5120") return false
      if (accountCode === "5500") return false // ✅ استثناء حساب الإهلاك (يُحسب بشكل منفصل)
      return true
    })

    for (const line of expensesLines) {
      const coaRaw = line.chart_of_accounts as any
      const coa = Array.isArray(coaRaw) ? coaRaw[0] : coaRaw
      const accountName = coa?.account_name || "أخرى"
      const accountCode = coa?.account_code || "0000"
      const debit = Number(line.debit_amount || 0)
      const credit = Number(line.credit_amount || 0)
      // المصروفات تزيد بالمدين
      const amount = debit - credit

      if (Math.abs(amount) < 0.01) continue // استثناء الحسابات صفرية الرصيد

      if (!expensesByAccount[accountCode]) {
        expensesByAccount[accountCode] = { name: accountName, amount: 0 }
      }
      expensesByAccount[accountCode].amount += amount
    }

    const expensesList = Object.values(expensesByAccount).filter(e => e.amount > 0)
    const totalExpenses = expensesList.reduce((sum, e) => sum + e.amount, 0)

    // ✅ حساب الإهلاك (من journal_entries فقط)
    let totalDepreciation = 0
    const depreciationLines = periodLines.filter((line: any) => {
      const coa = line.chart_of_accounts
      return coa?.account_code === "5500"
    })
    for (const line of depreciationLines) {
      const debit = Number(line.debit_amount || 0)
      const credit = Number(line.credit_amount || 0)
      totalDepreciation += debit - credit
    }

    // ✅ حساب المبيعات المعلقة (من invoices - للتوضيح فقط، لا تدخل في الحسابات)
    let pendingSales = 0
    try {
      const { data: pendingSalesData } = await supabase
        .from("invoices")
        .select("total_amount")
        .eq("company_id", companyId)
        .or("is_deleted.is.null,is_deleted.eq.false")
        .eq("status", "sent")
        .gte("invoice_date", fromDate)
        .lte("invoice_date", toDate)

      pendingSales = (pendingSalesData || []).reduce((sum, item) => sum + (item.total_amount || 0), 0)
    } catch (error) {
      console.warn("Could not fetch pending sales:", error)
      pendingSales = 0
    }

    // ✅ حساب مجمل الربح وصافي الربح
    const grossProfit = totalSales - totalCOGS
    // ✅ صافي الربح = مجمل الربح - المصروفات التشغيلية - الإهلاك
    // Net Profit = Gross Profit - Operating Expenses - Depreciation
    const netProfit = grossProfit - totalExpenses - totalDepreciation

    return apiSuccess({
      capital: { total: Math.max(0, totalCapital) },
      purchases: { total: totalPurchases, count: purchasesCount },
      expenses: { total: totalExpenses, items: expensesList },
      depreciation: { total: totalDepreciation },
      sales: { total: totalSales, count: salesCount, pending: pendingSales },
      cogs: { total: totalCOGS },
      profit: { gross: grossProfit, net: netProfit },
      period: { from: fromDate, to: toDate }
    })
  } catch (error: any) {
    console.error("Simple report error:", error)
    return serverError(`حدث خطأ أثناء إنشاء التقرير: ${error?.message || "unknown_error"}`)
  }
}
