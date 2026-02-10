/**
 * 📊 Daily Payments & Receipts API - المدفوعات والمقبوضات اليومية
 * 
 * ⚠️ OPERATIONAL REPORT (NOT ACCOUNTING REPORT)
 * 
 * ✅ هذا تقرير تشغيلي - يمكنه القراءة من payments مباشرة
 * ✅ ليس تقرير محاسبي رسمي (التقارير المحاسبية تعتمد على journal_entries فقط)
 * 
 * ✅ القواعد:
 * 1. مصدر البيانات: payments (تشغيلي)
 * 2. التجميع: حسب التاريخ (يومي/أسبوعي/شهري)
 * 3. التصنيف: مدفوعات (للموردين) ومقبوضات (من العملاء)
 * 4. الفلترة: حسب التاريخ، طريقة الدفع، الحساب البنكي
 * 
 * ⚠️ ملاحظة مهمة:
 * - هذا التقرير تشغيلي وليس محاسبي رسمي
 * - التقارير المحاسبية الرسمية تعتمد على journal_entries فقط
 * - هذا التقرير يستخدم payments لتوضيح تشغيلي
 * 
 * راجع: docs/OPERATIONAL_REPORTS_GUIDE.md
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { secureApiRequest, serverError, badRequestError } from "@/lib/api-security-enhanced"
import { buildBranchFilter } from "@/lib/branch-access-control"

async function getAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  return url && serviceKey ? createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } }) : null
}

export async function GET(req: NextRequest) {
  try {
    // ✅ إنشاء supabase client للمصادقة
    const authSupabase = await createServerClient()

    // ✅ التحقق من الأمان
    const { user, companyId, branchId, member, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requireBranch: true,
      requirePermission: { resource: "reports", action: "read" },
      supabase: authSupabase
    })

    if (error) return error
    if (!companyId) return badRequestError("معرف الشركة مطلوب")
    if (!branchId) return badRequestError("معرف الفرع مطلوب")

    const admin = await getAdmin()
    if (!admin) {
      return serverError(`خطأ في إعدادات الخادم: ${"Server configuration error"}`)
    }

    const { searchParams } = new URL(req.url)
    const from = String(searchParams.get("from") || "")
    const to = String(searchParams.get("to") || "")
    const paymentType = String(searchParams.get("type") || "all") // all, payments, receipts
    const paymentMethod = searchParams.get("payment_method") || ""
    const accountId = searchParams.get("account_id") || ""
    const groupBy = String(searchParams.get("group_by") || "day") // day, week, month

    if (!from || !to) {
      return badRequestError("من تاريخ وإلى تاريخ مطلوبان")
    }

    const branchFilter = buildBranchFilter(branchId, member.role)

    // ✅ جلب المدفوعات والمقبوضات (تقرير تشغيلي - من payments مباشرة)
    // ⚠️ ملاحظة: هذا تقرير تشغيلي وليس محاسبي رسمي
    let paymentsQuery = admin
      .from("payments")
      .select(`
        id,
        payment_date,
        amount,
        payment_method,
        reference_number,
        notes,
        customer_id,
        supplier_id,
        account_id,
        customers(name),
        suppliers(name),
        chart_of_accounts(account_name, account_code)
      `)
      .eq("company_id", companyId)
      .match(branchFilter)
      .or("is_deleted.is.null,is_deleted.eq.false") // ✅ استثناء المدفوعات المحذوفة
      .gte("payment_date", from)
      .lte("payment_date", to)

    // فلتر النوع (مدفوعات أو مقبوضات)
    if (paymentType === "payments") {
      paymentsQuery = paymentsQuery.not("supplier_id", "is", null)
    } else if (paymentType === "receipts") {
      paymentsQuery = paymentsQuery.not("customer_id", "is", null)
    }

    // فلتر طريقة الدفع
    if (paymentMethod) {
      paymentsQuery = paymentsQuery.eq("payment_method", paymentMethod)
    }

    // فلتر الحساب البنكي
    if (accountId) {
      paymentsQuery = paymentsQuery.eq("account_id", accountId)
    }

    const { data: payments } = await paymentsQuery

    if (!payments || payments.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        summary: {
          total_payments: 0,
          total_receipts: 0,
          net_cash_flow: 0
        }
      })
    }

    // تجميع البيانات حسب الفترة
    const grouped = new Map<string, {
      date: string
      payments: number
      receipts: number
      transactions: Array<{
        id: string
        date: string
        type: "payment" | "receipt"
        amount: number
        method: string
        reference: string
        customer_name?: string
        supplier_name?: string
        account_name?: string
      }>
    }>()

    for (const payment of payments) {
      const paymentDate = new Date(payment.payment_date)
      let periodKey = ""

      if (groupBy === "month") {
        periodKey = `${paymentDate.getFullYear()}-${String(paymentDate.getMonth() + 1).padStart(2, '0')}`
      } else if (groupBy === "week") {
        const weekStart = new Date(paymentDate)
        weekStart.setDate(paymentDate.getDate() - paymentDate.getDay())
        periodKey = `${weekStart.getFullYear()}-W${String(Math.ceil((weekStart.getDate() + 6) / 7)).padStart(2, '0')}`
      } else {
        periodKey = payment.payment_date
      }

      const existing = grouped.get(periodKey) || {
        date: periodKey,
        payments: 0,
        receipts: 0,
        transactions: []
      }

      const amount = Number(payment.amount || 0)
      const isPayment = !!payment.supplier_id
      const isReceipt = !!payment.customer_id

      if (isPayment) {
        existing.payments += amount
      } else if (isReceipt) {
        existing.receipts += amount
      }

      existing.transactions.push({
        id: payment.id,
        date: payment.payment_date,
        type: isPayment ? "payment" : "receipt",
        amount: amount,
        method: payment.payment_method || "unknown",
        reference: payment.reference_number || "",
        customer_name: (payment.customers as any)?.name,
        supplier_name: (payment.suppliers as any)?.name,
        account_name: (payment.chart_of_accounts as any)?.account_name
      })

      grouped.set(periodKey, existing)
    }

    // حساب الإجماليات
    let totalPayments = 0
    let totalReceipts = 0

    for (const group of grouped.values()) {
      totalPayments += group.payments
      totalReceipts += group.receipts
    }

    const result = Array.from(grouped.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(group => ({
        ...group,
        net_cash_flow: group.receipts - group.payments
      }))

    return NextResponse.json({
      success: true,
      data: result,
      summary: {
        total_payments: totalPayments,
        total_receipts: totalReceipts,
        net_cash_flow: totalReceipts - totalPayments
      }
    })
  } catch (e: any) {
    return serverError(`حدث خطأ أثناء جلب تقرير المدفوعات والمقبوضات: ${e?.message || "unknown_error"}`)
  }
}
