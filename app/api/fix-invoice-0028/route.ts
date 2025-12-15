import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireOwnerOrAdmin } from "@/lib/api-security"
import { apiError, apiSuccess, HTTP_STATUS, internalError, notFoundError } from "@/lib/api-error-handler"

// API خاص لتصحيح الفاتورة INV-0028
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

    const logs: string[] = []
    const invoiceNumber = "INV-0028"

    // 1️⃣ البحث عن الفاتورة في جدول invoices
    logs.push("🔍 البحث عن الفاتورة في جدول invoices...")
    
    const { data: existingInvoice } = await supabase
      .from("invoices")
      .select("*")
      .eq("company_id", companyId)
      .or(`invoice_number.eq.${invoiceNumber},invoice_number.ilike.%0028%`)
      .maybeSingle()

    logs.push(`   النتيجة: ${existingInvoice ? `موجودة (${existingInvoice.invoice_number})` : "غير موجودة"}`)

    // 2️⃣ البحث عن القيود المرتبطة
    logs.push("🔍 البحث عن القيود المحاسبية...")
    
    const { data: journalEntries } = await supabase
      .from("journal_entries")
      .select("*, journal_entry_lines(*)")
      .eq("company_id", companyId)
      .ilike("description", `%${invoiceNumber}%`)

    logs.push(`   وجدنا: ${journalEntries?.length || 0} قيد محاسبي`)

    // 3️⃣ البحث في sales_returns
    logs.push("🔍 البحث في سجلات المرتجعات...")
    
    const { data: salesReturns } = await supabase
      .from("sales_returns")
      .select("*, sales_return_items(*)")
      .eq("company_id", companyId)
      .or(`notes.ilike.%${invoiceNumber}%,return_number.ilike.%0028%`)

    logs.push(`   وجدنا: ${salesReturns?.length || 0} سجل مرتجع`)

    // 4️⃣ استخراج المعلومات من القيود
    let totalAmount = 0
    let customerId: string | null = null
    let invoiceDate = new Date().toISOString().slice(0, 10)

    if (journalEntries && journalEntries.length > 0) {
      const returnEntry = journalEntries.find(e => 
        e.reference_type === "sales_return" || e.description?.includes("مرتجع")
      )
      
      if (returnEntry) {
        invoiceDate = returnEntry.entry_date || invoiceDate
        
        // استخراج المبلغ من سطور القيد
        const lines = returnEntry.journal_entry_lines || []
        for (const line of lines) {
          if (line.debit_amount > 0) {
            totalAmount = Math.max(totalAmount, line.debit_amount)
          }
        }
      }
    }

    // من sales_returns
    if (salesReturns && salesReturns.length > 0) {
      const sr = salesReturns[0]
      totalAmount = sr.total_amount || totalAmount
      customerId = sr.customer_id
      logs.push(`   معلومات المرتجع: المبلغ=${totalAmount}, العميل=${customerId || 'غير محدد'}`)
    }

    // 5️⃣ إنشاء أو تحديث الفاتورة
    let invoiceId: string
    
    if (existingInvoice) {
      logs.push("✏️ تحديث الفاتورة الموجودة...")
      
      const { error: updateErr } = await supabase
        .from("invoices")
        .update({
          invoice_number: invoiceNumber, // التأكد من الرقم الصحيح
          status: "cancelled",
          return_status: "full",
          returned_amount: existingInvoice.total_amount || totalAmount,
          notes: "فاتورة مرتجع كامل - تم تصحيحها"
        })
        .eq("id", existingInvoice.id)

      if (updateErr) {
        logs.push(`   ❌ خطأ في التحديث: ${updateErr.message}`)
      } else {
        logs.push(`   ✅ تم التحديث بنجاح`)
      }
      
      invoiceId = existingInvoice.id
      totalAmount = existingInvoice.total_amount || totalAmount
    } else {
      logs.push("➕ إنشاء الفاتورة...")
      
      const { data: newInvoice, error: insertErr } = await supabase
        .from("invoices")
        .insert({
          company_id: companyId,
          customer_id: customerId,
          invoice_number: invoiceNumber,
          invoice_date: invoiceDate,
          due_date: invoiceDate,
          subtotal: totalAmount,
          tax_amount: 0,
          total_amount: totalAmount,
          paid_amount: 0,
          returned_amount: totalAmount,
          return_status: "full",
          status: "cancelled",
          invoice_type: "sales",
          notes: "فاتورة مرتجع كامل - تم إنشاؤها من القيود اليتيمة"
        })
        .select()
        .single()

      if (insertErr) {
        logs.push(`   ❌ خطأ في الإنشاء: ${insertErr.message}`)
        return internalError("خطأ في إنشاء الفاتورة", insertErr.message)
      }
      
      logs.push(`   ✅ تم إنشاء الفاتورة: ${newInvoice.id}`)
      invoiceId = newInvoice.id
    }

    // 6️⃣ ربط القيود المحاسبية بالفاتورة
    if (journalEntries && journalEntries.length > 0) {
      logs.push("🔗 ربط القيود المحاسبية...")
      
      const entryIds = journalEntries.map(e => e.id)
      const { error: linkErr } = await supabase
        .from("journal_entries")
        .update({ reference_id: invoiceId })
        .in("id", entryIds)

      if (linkErr) {
        logs.push(`   ⚠️ خطأ في الربط: ${linkErr.message}`)
      } else {
        logs.push(`   ✅ تم ربط ${entryIds.length} قيد`)
      }
    }

    // 7️⃣ ربط سجلات المرتجعات
    if (salesReturns && salesReturns.length > 0) {
      logs.push("🔗 ربط سجلات المرتجعات...")
      
      const srIds = salesReturns.map(sr => sr.id)
      const { error: srLinkErr } = await supabase
        .from("sales_returns")
        .update({ invoice_id: invoiceId })
        .in("id", srIds)

      if (srLinkErr) {
        logs.push(`   ⚠️ خطأ: ${srLinkErr.message}`)
      } else {
        logs.push(`   ✅ تم ربط ${srIds.length} سجل مرتجع`)
      }
    }

    logs.push("")
    logs.push("🎉 تم تصحيح الفاتورة INV-0028 بنجاح!")
    logs.push(`   - رقم الفاتورة: ${invoiceNumber}`)
    logs.push(`   - الحالة: cancelled (مرتجع كامل)`)
    logs.push(`   - المبلغ المرتجع: ${totalAmount}`)
    logs.push("")
    logs.push("💡 يمكنك الآن استخدام 'إصلاح فاتورة' لإعادة توليد القيود الصحيحة")

    return apiSuccess({
      ok: true,
      invoice_id: invoiceId,
      invoice_number: invoiceNumber,
      total_amount: totalAmount,
      status: "cancelled",
      return_status: "full",
      logs
    })

  } catch (err: any) {
    console.error("[Fix INV-0028] Error:", err)
    return internalError("حدث خطأ أثناء تصحيح الفاتورة INV-0028", err?.message || "Unknown error")
  }
}

