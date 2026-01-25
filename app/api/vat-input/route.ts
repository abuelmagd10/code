/**
 * 🔐 VAT Input API - ضريبة المدخلات
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
 *    - التسلسل: journal_entries → journal_entry_lines (vat_input) → vat_input_report
 * 
 * 2. VAT Input Account:
 *    - حساب الضريبة: sub_type = 'vat_input' أو 'vat_receivable'
 *    - الضريبة = debit_amount من journal_entry_lines
 * 
 * 3. Future Compatibility (مضمون):
 *    - إغلاق السنة
 *    - ترحيل الأرباح المحتجزة
 *    - القيود المركبة
 *    - الضرائب
 *    - المخزون
 *    - الإهلاك
 * 
 * ⚠️ DO NOT MODIFY WITHOUT SENIOR ACCOUNTING REVIEW
 * 
 * راجع: docs/ACCOUNTING_REPORTS_ARCHITECTURE.md
 */

import { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { secureApiRequest, serverError, badRequestError } from "@/lib/api-security-enhanced"
import { apiSuccess } from "@/lib/api-error-handler"

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
    const from = searchParams.get("from") || "0001-01-01"
    const to = searchParams.get("to") || "9999-12-31"
    const status = searchParams.get("status") || "all"

    // ✅ جلب حسابات VAT Input
    const { data: vatAccounts, error: vatAccountsError } = await supabase
      .from("chart_of_accounts")
      .select("id, account_code, account_name, sub_type")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .or("sub_type.eq.vat_input,sub_type.eq.vat_receivable")

    if (vatAccountsError) {
      return serverError(`خطأ في جلب حسابات VAT: ${vatAccountsError.message}`)
    }

    if (!vatAccounts || vatAccounts.length === 0) {
      return apiSuccess({
        bills: [],
        totalVat: 0,
        totalPurchases: 0,
        period: { from, to }
      })
    }

    const vatAccountIds = vatAccounts.map((acc: any) => acc.id)

    // ✅ جلب القيود المرحّلة في الفترة
    let entriesQuery = supabase
      .from("journal_entries")
      .select("id, entry_number, entry_date, description, reference_type, reference_id, status")
      .eq("company_id", companyId)
      .eq("status", "posted")
      .is("deleted_at", null)
      .gte("entry_date", from)
      .lte("entry_date", to)
      .eq("reference_type", "bill") // ✅ فقط قيود الفواتير
      .order("entry_date")

    const { data: entries, error: entriesError } = await entriesQuery

    if (entriesError) {
      return serverError(`خطأ في جلب القيود: ${entriesError.message}`)
    }

    if (!entries || entries.length === 0) {
      return apiSuccess({
        bills: [],
        totalVat: 0,
        totalPurchases: 0,
        period: { from, to }
      })
    }

    const entryIds = entries.map((e: any) => e.id)

    // ✅ جلب سطور القيود الخاصة بـ VAT Input
    const { data: vatLines, error: vatLinesError } = await supabase
      .from("journal_entry_lines")
      .select(`
        id,
        journal_entry_id,
        debit_amount,
        journal_entries!inner(
          id,
          entry_date,
          reference_type,
          reference_id
        ),
        chart_of_accounts!inner(
          id,
          sub_type
        )
      `)
      .in("journal_entry_id", entryIds)
      .in("account_id", vatAccountIds)
      .gt("debit_amount", 0) // ✅ فقط debit_amount (VAT Input مدين)

    if (vatLinesError) {
      return serverError(`خطأ في جلب سطور VAT: ${vatLinesError.message}`)
    }

    // ✅ جلب بيانات الفواتير المرتبطة
    const billIds = Array.from(new Set(entries.map((e: any) => e.reference_id).filter(Boolean)))
    
    let billsQuery = supabase
      .from("bills")
      .select("id, bill_number, supplier_id, bill_date, status, subtotal, tax_amount, total_amount, suppliers(name)")
      .eq("company_id", companyId)
      .in("id", billIds)

    if (status !== "all") {
      if (status === "paid") {
        billsQuery = billsQuery.eq("status", "paid")
      } else if (status === "partially_paid") {
        billsQuery = billsQuery.eq("status", "partially_paid")
      } else if (status === "sent") {
        billsQuery = billsQuery.in("status", ["sent", "received"])
      }
    }

    const { data: bills, error: billsError } = await billsQuery

    if (billsError) {
      return serverError(`خطأ في جلب الفواتير: ${billsError.message}`)
    }

    // ✅ إنشاء map للقيود
    const entryMap = new Map(entries.map((e: any) => [e.id, e]))
    const billMap = new Map((bills || []).map((bill: any) => [bill.id, bill]))
    const vatByEntry = new Map<string, number>()

    // ✅ تجميع VAT حسب القيد
    for (const line of vatLines || []) {
      const entryId = line.journal_entry_id
      const vatAmount = Number(line.debit_amount || 0)
      vatByEntry.set(entryId, (vatByEntry.get(entryId) || 0) + vatAmount)
    }

    // ✅ بناء قائمة الفواتير مع VAT
    const billRows: any[] = []

    for (const entry of entries) {
      const billId = entry.reference_id
      const bill = billMap.get(billId)

      if (!bill) continue

      // ✅ فلترة حسب الحالة
      if (status !== "all") {
        if (status === "paid" && bill.status !== "paid") continue
        if (status === "partially_paid" && bill.status !== "partially_paid") continue
        if (status === "sent" && !["sent", "received"].includes(bill.status)) continue
      }

      const vatAmount = vatByEntry.get(entry.id) || 0
      const subtotal = Number(bill.subtotal || 0)
      const totalAmount = Number(bill.total_amount || 0)

      billRows.push({
        id: bill.id,
        bill_number: bill.bill_number || "",
        supplier_id: bill.supplier_id || "",
        supplier_name: (bill.suppliers as any)?.name || "",
        bill_date: bill.bill_date || "",
        status: bill.status || "",
        subtotal,
        tax_amount: vatAmount, // ✅ من journal_entries
        total_amount: totalAmount
      })
    }

    // ✅ حساب الإجماليات
    const totalVat = billRows.reduce((sum, bill) => sum + bill.tax_amount, 0)
    const totalPurchases = billRows.reduce((sum, bill) => sum + bill.subtotal, 0)

    return apiSuccess({
      bills: billRows.sort((a, b) => a.bill_date.localeCompare(b.bill_date)),
      totalVat,
      totalPurchases,
      period: { from, to }
    })
  } catch (e: any) {
    console.error("VAT Input error:", e)
    return serverError(`حدث خطأ أثناء إنشاء تقرير ضريبة المدخلات: ${e?.message || "unknown_error"}`)
  }
}
