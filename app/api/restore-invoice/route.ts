import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireOwnerOrAdmin } from "@/lib/api-security"
import { apiError, apiSuccess, HTTP_STATUS, internalError, badRequestError, notFoundError } from "@/lib/api-error-handler"

// API لاستعادة فاتورة محذوفة من القيود اليتيمة
export async function POST(request: NextRequest) {
  try {
    // === تحصين أمني: استخدام requireOwnerOrAdmin ===
    const { user, companyId, member, error } = await requireOwnerOrAdmin(request)

    if (error) return error
    if (!companyId || !user) {
      return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على الشركة", "Company not found")
    }
    // === نهاية التحصين الأمني ===

    const supabase = await createClient()

    const body = await request.json().catch(() => ({}))
    let invoiceNumber = String(body?.invoice_number || "").trim()
      .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069\u200B-\u200D\uFEFF]/g, '')

    // تصحيح الأرقام المعكوسة
    const reversedMatch = invoiceNumber.match(/^(\d+)-([A-Za-z]+)$/)
    if (reversedMatch) {
      invoiceNumber = `${reversedMatch[2]}-${reversedMatch[1]}`
    }

    if (!invoiceNumber) {
      return badRequestError("رقم الفاتورة مطلوب", ["invoice_number"])
    }

    // 1. التحقق من أن الفاتورة غير موجودة
    const { data: existingInvoice } = await supabase
      .from("invoices")
      .select("id, invoice_number")
      .eq("company_id", companyId)
      .ilike("invoice_number", invoiceNumber)
      .maybeSingle()

    if (existingInvoice) {
      return badRequestError("الفاتورة موجودة بالفعل في النظام. استخدم وظيفة 'إصلاح فاتورة' بدلاً من الاستعادة", ["invoice_number"])
    }

    // 2. البحث عن القيود المرتبطة بهذه الفاتورة
    const { data: journalEntries } = await supabase
      .from("journal_entries")
      .select("id, description, reference_type, entry_date, reference_id")
      .eq("company_id", companyId)
      .ilike("description", `%${invoiceNumber}%`)

    if (!journalEntries || journalEntries.length === 0) {
      return notFoundError("القيود المحاسبية", "لا توجد قيود محاسبية مرتبطة بهذه الفاتورة. لا يمكن استعادة الفاتورة بدون بيانات")
    }

    // 3. البحث عن سجل المرتجع في sales_returns
    const { data: salesReturns } = await supabase
      .from("sales_returns")
      .select("*, sales_return_items(*)")
      .eq("company_id", companyId)
      .or(`notes.ilike.%${invoiceNumber}%,return_number.ilike.%${invoiceNumber}%`)

    // 4. استخراج معلومات الفاتورة من القيود
    const returnEntry = journalEntries.find(e =>
      e.reference_type === "sales_return" ||
      e.description?.includes("مرتجع")
    )

    // 📌 النمط المحاسبي الصارم: لا invoice_cogs_reversal
    // COGS يُحسب عند الحاجة من cost_price × quantity المباع

    // 5. جلب سطور القيود للحصول على المبالغ
    let totalAmount = 0
    let taxAmount = 0
    let customerId: string | null = null

    if (returnEntry) {
      const { data: lines } = await supabase
        .from("journal_entry_lines")
        .select("*, chart_of_accounts(account_type, sub_type)")
        .eq("journal_entry_id", returnEntry.id)

      // استخراج المبلغ من سطور القيد
      const revenueLine = lines?.find((l: any) => 
        l.chart_of_accounts?.account_type === "revenue" ||
        l.chart_of_accounts?.sub_type === "sales_revenue"
      )
      const arLine = lines?.find((l: any) => 
        l.chart_of_accounts?.sub_type === "accounts_receivable"
      )

      totalAmount = Math.abs(revenueLine?.debit_amount || revenueLine?.credit_amount || 0)
      
      // البحث عن العميل من sales_returns
      if (salesReturns && salesReturns.length > 0) {
        customerId = salesReturns[0].customer_id
        totalAmount = salesReturns[0].total_amount || totalAmount
        taxAmount = salesReturns[0].tax_amount || 0
      }
    }

    // 6. إنشاء الفاتورة المستعادة
    const subtotal = totalAmount - taxAmount
    const invoiceDate = returnEntry?.entry_date || new Date().toISOString().slice(0, 10)

    const { data: newInvoice, error: insertErr } = await supabase
      .from("invoices")
      .insert({
        company_id: companyId,
        customer_id: customerId,
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
        due_date: invoiceDate,
        subtotal: subtotal,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        paid_amount: 0,
        returned_amount: totalAmount, // مرتجع كامل
        return_status: "full",
        status: "cancelled", // لأنها مرتجع كامل
        invoice_type: "sales",
        notes: "فاتورة مستعادة من القيود اليتيمة - مرتجع كامل"
      })
      .select()
      .single()

    if (insertErr) {
      return internalError("فشل في إنشاء الفاتورة", insertErr.message)
    }

    // 7. تحديث القيود لربطها بالفاتورة الجديدة
    const entryIds = journalEntries.map(e => e.id)
    await supabase
      .from("journal_entries")
      .update({ reference_id: newInvoice.id })
      .in("id", entryIds)

    // 8. تحديث sales_returns لربطها بالفاتورة
    if (salesReturns && salesReturns.length > 0) {
      await supabase
        .from("sales_returns")
        .update({ invoice_id: newInvoice.id })
        .in("id", salesReturns.map(sr => sr.id))
    }

    return apiSuccess({
      ok: true,
      message: "تم استعادة الفاتورة بنجاح",
      invoice: {
        id: newInvoice.id,
        invoice_number: newInvoice.invoice_number,
        total_amount: newInvoice.total_amount,
        status: newInvoice.status,
        return_status: newInvoice.return_status
      },
      linked_entries: entryIds.length,
      linked_returns: salesReturns?.length || 0,
      next_step: "يمكنك الآن استخدام 'إصلاح فاتورة' لإعادة توليد القيود الصحيحة"
    })

  } catch (err: any) {
    console.error("[Restore Invoice] Error:", err)
    return internalError("حدث خطأ أثناء استعادة الفاتورة", err?.message || "Unknown error")
  }
}

