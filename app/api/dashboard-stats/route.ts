import { NextRequest, NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { secureApiRequest } from "@/lib/api-security-enhanced"
import { serverError, badRequestError } from "@/lib/api-security-enhanced"
import { checkBranchAccess, buildBranchFilter } from "@/lib/branch-access-control"

// API شامل لإحصائيات لوحة التحكم - يقرأ البيانات الفعلية مباشرة
export async function GET(request: NextRequest) {
  try {
    // ✅ إنشاء supabase client للمصادقة
    const authSupabase = await createServerClient()

    // ✅ التحقق من الأمان
    const { user, companyId, branchId, costCenterId, warehouseId, member, error } = await secureApiRequest(request, {
      requireAuth: true,
      requireCompany: true,
      requireBranch: true,
      requirePermission: { resource: "dashboard", action: "read" },
      supabase: authSupabase // ✅ تمرير supabase client
    })

    if (error) return error
    if (!companyId) return badRequestError("معرف الشركة مطلوب")
    if (!branchId) return badRequestError("معرف الفرع مطلوب")

    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)
    const from = searchParams.get("from") || "0001-01-01"
    const to = searchParams.get("to") || "9999-12-31"
    const period = searchParams.get("period") || "month" // today, week, month, year, all

    // حساب التواريخ حسب الفترة
    const now = new Date()
    let fromDate = from
    let toDate = to

    if (period === "today") {
      fromDate = now.toISOString().slice(0, 10)
      toDate = fromDate
    } else if (period === "week") {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      fromDate = weekAgo.toISOString().slice(0, 10)
      toDate = now.toISOString().slice(0, 10)
    } else if (period === "month") {
      fromDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
      toDate = now.toISOString().slice(0, 10)
    } else if (period === "year") {
      fromDate = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10)
      toDate = now.toISOString().slice(0, 10)
    }

    // بناء فلتر الفرع حسب صلاحيات المستخدم
    const branchFilter = buildBranchFilter(branchId!, member.role)

    // =============================================
    // 1. إحصائيات المبيعات من جدول invoices (مفلترة حسب الفرع)
    // =============================================
    const { data: invoices } = await supabase
      .from("invoices")
      .select("id, total_amount, paid_amount, status, invoice_date, tax_amount, shipping")
      .eq("company_id", companyId)
      .match(branchFilter)
      .or("is_deleted.is.null,is_deleted.eq.false")
      .gte("invoice_date", fromDate)
      .lte("invoice_date", toDate)

    const salesStats = {
      total: 0,
      paid: 0,
      unpaid: 0,
      count: 0,
      paidCount: 0,
      sentCount: 0,
      draftCount: 0,
      cancelledCount: 0,
      taxCollected: 0,
      shipping: 0
    }

    for (const inv of invoices || []) {
      if (inv.status === "paid" || inv.status === "partially_paid") {
        salesStats.total += Number(inv.total_amount || 0)
        salesStats.paid += Number(inv.paid_amount || 0)
        salesStats.taxCollected += Number(inv.tax_amount || 0)
        salesStats.shipping += Number(inv.shipping || 0)
        if (inv.status === "paid") salesStats.paidCount++
      } else if (inv.status === "sent") {
        salesStats.total += Number(inv.total_amount || 0)
        salesStats.unpaid += Number(inv.total_amount || 0) - Number(inv.paid_amount || 0)
        salesStats.sentCount++
      } else if (inv.status === "draft") {
        salesStats.draftCount++
      } else if (inv.status === "cancelled") {
        salesStats.cancelledCount++
      }
      salesStats.count++
    }

    // =============================================
    // 2. 📌 النمط المحاسبي الصارم: لا COGS مسجل في القيود
    // =============================================
    // حسب المواصفات الجديدة: لا قيد invoice_cogs
    // COGS يُحسب عند الحاجة من cost_price × quantity المباع
    // للحصول على تكلفة المبيعات الفعلية، يجب حسابها من invoice_items × products.cost_price
    let totalCOGS = 0

    // حساب COGS من الفواتير المرسلة/المدفوعة × سعر التكلفة
    const { data: invoiceItems } = await supabase
      .from("invoice_items")
      .select(`
        quantity,
        product_id,
        invoices!inner(company_id, status, invoice_date),
        products(cost_price, item_type)
      `)
      .eq("invoices.company_id", companyId)
      .in("invoices.status", ["sent", "partially_paid", "paid"])
      .gte("invoices.invoice_date", fromDate)
      .lte("invoices.invoice_date", toDate)

    for (const item of invoiceItems || []) {
      const prod = item.products as any
      if (prod?.item_type !== 'service') {
        totalCOGS += Number(item.quantity || 0) * Number(prod?.cost_price || 0)
      }
    }

    // =============================================
    // 3. إحصائيات المشتريات من جدول bills
    // =============================================
    const { data: bills } = await supabase
      .from("bills")
      .select("id, total_amount, paid_amount, status, bill_date")
      .eq("company_id", companyId)
      .gte("bill_date", fromDate)
      .lte("bill_date", toDate)

    const purchasesStats = {
      total: 0,
      paid: 0,
      unpaid: 0,
      count: 0
    }

    for (const bill of bills || []) {
      if (bill.status !== "draft" && bill.status !== "cancelled") {
        purchasesStats.total += Number(bill.total_amount || 0)
        purchasesStats.paid += Number(bill.paid_amount || 0)
        purchasesStats.unpaid += Number(bill.total_amount || 0) - Number(bill.paid_amount || 0)
        purchasesStats.count++
      }
    }

    // =============================================
    // 4. إحصائيات المصروفات من journal_entries (باستثناء COGS)
    // =============================================
    const { data: expenseEntries } = await supabase
      .from("journal_entry_lines")
      .select("debit_amount, credit_amount, chart_of_accounts!inner(account_type, account_code, sub_type, company_id), journal_entries!inner(entry_date, company_id)")
      .eq("chart_of_accounts.account_type", "expense")
      .eq("chart_of_accounts.company_id", companyId)

    let totalExpenses = 0
    for (const line of expenseEntries || []) {
      const entryDate = (line as any).journal_entries?.entry_date
      const coa = (line as any).chart_of_accounts
      const subType = coa?.sub_type || ""
      const accountCode = coa?.account_code || ""

      // ✅ استثناء COGS من المصروفات التشغيلية
      // COGS يُحسب بشكل منفصل ولا يجب أن يُضاف للمصروفات
      if (accountCode === "5000" || subType === "cogs" || subType === "cost_of_goods_sold") {
        continue // تجاهل COGS
      }

      if (entryDate >= fromDate && entryDate <= toDate) {
        totalExpenses += Number(line.debit_amount || 0) - Number(line.credit_amount || 0)
      }
    }

    // =============================================
    // 5. إحصائيات المخزون من inventory_transactions
    // =============================================
    const { data: products } = await supabase
      .from("products")
      .select("id, name, cost_price, unit_price, reorder_level, item_type")
      .eq("company_id", companyId)
      .or("item_type.is.null,item_type.eq.product")

    // 🔐 فلترة حسب الفرع للمحاسب والمدير
    let transactionsQuery = supabase
      .from("inventory_transactions")
      .select("product_id, quantity_change")
      .eq("company_id", companyId)
      .or("is_deleted.is.null,is_deleted.eq.false")

    const isAccountantOrManager = member.role && ["accountant", "manager"].includes(member.role)
    if (isAccountantOrManager && branchId) {
      transactionsQuery = transactionsQuery.eq("branch_id", branchId)
    }

    const { data: transactions } = await transactionsQuery

    const qtyByProduct: Record<string, number> = {}
    for (const t of transactions || []) {
      const pid = String(t.product_id)
      qtyByProduct[pid] = (qtyByProduct[pid] || 0) + Number(t.quantity_change || 0)
    }

    let inventoryValue = 0
    let inventoryRetailValue = 0
    let lowStockCount = 0
    let outOfStockCount = 0
    let totalQuantity = 0

    for (const p of products || []) {
      const qty = qtyByProduct[p.id] || 0
      totalQuantity += Math.max(0, qty)
      inventoryValue += Math.max(0, qty) * Number(p.cost_price || 0)
      inventoryRetailValue += Math.max(0, qty) * Number(p.unit_price || 0)
      if (qty <= 0) outOfStockCount++
      else if (qty < (p.reorder_level || 5)) lowStockCount++
    }

    // =============================================
    // 6. عدد العملاء والموردين
    // =============================================
    const { count: customersCount } = await supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)

    const { count: suppliersCount } = await supabase
      .from("suppliers")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)

    const { count: productsCount } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)

    // =============================================
    // 7. الذمم المدينة والدائنة
    // =============================================
    const { data: allInvoices } = await supabase
      .from("invoices")
      .select("total_amount, paid_amount, status")
      .eq("company_id", companyId)
      .in("status", ["sent", "partially_paid"])
      .or("is_deleted.is.null,is_deleted.eq.false")

    let receivables = 0
    for (const inv of allInvoices || []) {
      receivables += Number(inv.total_amount || 0) - Number(inv.paid_amount || 0)
    }

    const { data: allBills } = await supabase
      .from("bills")
      .select("total_amount, paid_amount, status")
      .eq("company_id", companyId)
      .in("status", ["received", "partially_paid"])

    let payables = 0
    for (const bill of allBills || []) {
      payables += Number(bill.total_amount || 0) - Number(bill.paid_amount || 0)
    }

    // =============================================
    // 8. حساب الربح الصحيح
    // =============================================
    // الربح الإجمالي = المبيعات المدفوعة - تكلفة البضاعة المباعة
    const grossProfit = salesStats.paid - totalCOGS
    // صافي الربح = الربح الإجمالي - المصروفات (بدون COGS لأنه محسوب)
    const operatingExpenses = totalExpenses - totalCOGS // المصروفات بدون COGS
    const netProfit = grossProfit - Math.max(0, operatingExpenses)

    return NextResponse.json({
      success: true,
      data: {
        period,
        fromDate,
        toDate,
        branchId,
        costCenterId,
        warehouseId,

        // المبيعات
        sales: salesStats,

        // تكلفة البضاعة المباعة
        cogs: totalCOGS,

        // المشتريات
        purchases: purchasesStats,

        // المصروفات
        expenses: totalExpenses,
        operatingExpenses: Math.max(0, operatingExpenses),

        // الأرباح
        grossProfit,
        netProfit,
        profitMargin: salesStats.paid > 0 ? ((grossProfit / salesStats.paid) * 100).toFixed(1) : 0,

        // المخزون
        inventory: {
          totalProducts: products?.length || 0,
          totalQuantity,
          costValue: inventoryValue,
          retailValue: inventoryRetailValue,
          lowStockCount,
          outOfStockCount
        },

        // الذمم
        receivables,
        payables,

        // الأعداد
        counts: {
          customers: customersCount || 0,
          suppliers: suppliersCount || 0,
          products: productsCount || 0,
          invoices: salesStats.count,
          bills: purchasesStats.count
        }
      }
    })

  } catch (e: any) {
    console.error("Dashboard stats error:", e)
    return serverError(`حدث خطأ أثناء جلب الإحصائيات: ${e?.message}`)
  }
}

