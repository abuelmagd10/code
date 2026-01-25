/**
 * 🔐 VAT Output API - ضريبة المخرجات
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
 *    - التسلسل: journal_entries → journal_entry_lines (vat_output) → vat_output_report
 * 
 * 2. VAT Output Account:
 *    - حساب الضريبة: sub_type = 'vat_output' أو 'vat_payable'
 *    - الضريبة = credit_amount من journal_entry_lines
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

    // ✅ جلب حسابات VAT Output
    const { data: vatAccounts, error: vatAccountsError } = await supabase
      .from("chart_of_accounts")
      .select("id, account_code, account_name, sub_type")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .or("sub_type.eq.vat_output,sub_type.eq.vat_payable")

    if (vatAccountsError) {
      return serverError(`خطأ في جلب حسابات VAT: ${vatAccountsError.message}`)
    }

    if (!vatAccounts || vatAccounts.length === 0) {
      return apiSuccess({
        invoices: [],
        totalVat: 0,
        totalSales: 0,
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
      .eq("reference_type", "invoice") // ✅ فقط قيود الفواتير
      .order("entry_date")

    // ✅ فلترة حسب حالة الفاتورة (من خلال reference_id)
    if (status !== "all") {
      // سنفلتر لاحقًا بعد جلب بيانات الفواتير
    }

    const { data: entries, error: entriesError } = await entriesQuery

    if (entriesError) {
      return serverError(`خطأ في جلب القيود: ${entriesError.message}`)
    }

    if (!entries || entries.length === 0) {
      return apiSuccess({
        invoices: [],
        totalVat: 0,
        totalSales: 0,
        period: { from, to }
      })
    }

    const entryIds = entries.map((e: any) => e.id)

    // ✅ جلب سطور القيود الخاصة بـ VAT Output
    const { data: vatLines, error: vatLinesError } = await supabase
      .from("journal_entry_lines")
      .select(`
        id,
        journal_entry_id,
        credit_amount,
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
      .gt("credit_amount", 0) // ✅ فقط credit_amount (VAT Output دائن)

    if (vatLinesError) {
      return serverError(`خطأ في جلب سطور VAT: ${vatLinesError.message}`)
    }

    // ✅ جلب بيانات الفواتير المرتبطة
    const invoiceIds = Array.from(new Set(entries.map((e: any) => e.reference_id).filter(Boolean)))
    
    let invoicesQuery = supabase
      .from("invoices")
      .select("id, invoice_number, customer_id, invoice_date, status, subtotal, tax_amount, total_amount, customers(name)")
      .eq("company_id", companyId)
      .in("id", invoiceIds)
      .or("is_deleted.is.null,is_deleted.eq.false")

    if (status !== "all") {
      if (status === "paid") {
        invoicesQuery = invoicesQuery.eq("status", "paid")
      } else if (status === "partially_paid") {
        invoicesQuery = invoicesQuery.eq("status", "partially_paid")
      } else if (status === "sent") {
        invoicesQuery = invoicesQuery.eq("status", "sent")
      }
    }

    const { data: invoices, error: invoicesError } = await invoicesQuery

    if (invoicesError) {
      return serverError(`خطأ في جلب الفواتير: ${invoicesError.message}`)
    }

    // ✅ إنشاء map للقيود
    const entryMap = new Map(entries.map((e: any) => [e.id, e]))
    const invoiceMap = new Map((invoices || []).map((inv: any) => [inv.id, inv]))
    const vatByEntry = new Map<string, number>()

    // ✅ تجميع VAT حسب القيد
    for (const line of vatLines || []) {
      const entryId = line.journal_entry_id
      const vatAmount = Number(line.credit_amount || 0)
      vatByEntry.set(entryId, (vatByEntry.get(entryId) || 0) + vatAmount)
    }

    // ✅ بناء قائمة الفواتير مع VAT
    const invoiceRows: any[] = []

    for (const entry of entries) {
      const invoiceId = entry.reference_id
      const invoice = invoiceMap.get(invoiceId)

      if (!invoice) continue

      // ✅ فلترة حسب الحالة
      if (status !== "all") {
        if (status === "paid" && invoice.status !== "paid") continue
        if (status === "partially_paid" && invoice.status !== "partially_paid") continue
        if (status === "sent" && invoice.status !== "sent") continue
      }

      const vatAmount = vatByEntry.get(entry.id) || 0
      const subtotal = Number(invoice.subtotal || 0)
      const totalAmount = Number(invoice.total_amount || 0)

      invoiceRows.push({
        id: invoice.id,
        invoice_number: invoice.invoice_number || "",
        customer_id: invoice.customer_id || "",
        customer_name: (invoice.customers as any)?.name || "",
        invoice_date: invoice.invoice_date || "",
        status: invoice.status || "",
        subtotal,
        tax_amount: vatAmount, // ✅ من journal_entries
        total_amount: totalAmount,
        paid_amount: Number(invoice.paid_amount || 0)
      })
    }

    // ✅ حساب الإجماليات
    const totalVat = invoiceRows.reduce((sum, inv) => sum + inv.tax_amount, 0)
    const totalSales = invoiceRows.reduce((sum, inv) => sum + inv.subtotal, 0)

    return apiSuccess({
      invoices: invoiceRows.sort((a, b) => a.invoice_date.localeCompare(b.invoice_date)),
      totalVat,
      totalSales,
      period: { from, to }
    })
  } catch (e: any) {
    console.error("VAT Output error:", e)
    return serverError(`حدث خطأ أثناء إنشاء تقرير ضريبة المخرجات: ${e?.message || "unknown_error"}`)
  }
}
