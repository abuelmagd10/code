import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireOwnerOrAdmin } from "@/lib/api-security"
import { apiError, apiSuccess, HTTP_STATUS, internalError, notFoundError } from "@/lib/api-error-handler"

// API خاص لتصحيح الفاتورة INV-0001 - تصحيح المرتجع الجزئي القديم
// الهدف: حذف قيود المرتجع القديمة وتحديث القيد الأصلي للفاتورة
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
    const invoiceNumber = "INV-0001"

    logs.push("🔧 بدء تصحيح الفاتورة INV-0001...")
    logs.push("📌 الهدف: حذف قيود المرتجع القديمة وتحديث القيد الأصلي للفاتورة")

    // 1️⃣ البحث عن الفاتورة
    logs.push("🔍 البحث عن الفاتورة...")
    
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select("*")
      .eq("company_id", companyId)
      .or(`invoice_number.eq.${invoiceNumber},invoice_number.ilike.%0001%`)
      .maybeSingle()

    if (invoiceError || !invoice) {
      logs.push(`❌ لم يتم العثور على الفاتورة: ${invoiceError?.message || 'غير موجودة'}`)
      return apiSuccess({ logs, success: false, error: "Invoice not found" })
    }

    logs.push(`✅ تم العثور على الفاتورة: ${invoice.invoice_number} (الحالة: ${invoice.status})`)

    // 2️⃣ البحث عن القيد الأصلي للفاتورة (invoice)
    logs.push("🔍 البحث عن القيد المحاسبي الأصلي للفاتورة...")
    
    const { data: originalEntry, error: originalEntryError } = await supabase
      .from("journal_entries")
      .select("id, description, entry_date")
      .eq("company_id", companyId)
      .eq("reference_type", "invoice")
      .eq("reference_id", invoice.id)
      .maybeSingle()

    if (originalEntryError || !originalEntry) {
      logs.push(`⚠️ لم يتم العثور على القيد الأصلي: ${originalEntryError?.message || 'غير موجود'}`)
    } else {
      logs.push(`✅ تم العثور على القيد الأصلي: ${originalEntry.id}`)
    }

    // 3️⃣ البحث عن قيود المرتجع القديمة (sales_return)
    logs.push("🔍 البحث عن قيود المرتجع القديمة...")
    
    const { data: returnEntries, error: returnEntriesError } = await supabase
      .from("journal_entries")
      .select("id, description, entry_date")
      .eq("company_id", companyId)
      .eq("reference_type", "sales_return")
      .eq("reference_id", invoice.id)

    if (returnEntriesError) {
      logs.push(`❌ خطأ في البحث عن قيود المرتجع: ${returnEntriesError.message}`)
      return apiSuccess({ logs, success: false, error: returnEntriesError.message })
    }

    logs.push(`📊 وجدنا ${returnEntries?.length || 0} قيد مرتجع قديم`)

    // 4️⃣ جلب إعدادات الحسابات
    logs.push("🔍 جلب إعدادات الحسابات...")
    
    const { data: accountSettings } = await supabase
      .from("account_settings")
      .select("*")
      .eq("company_id", companyId)
      .single()

    if (!accountSettings) {
      logs.push("❌ لم يتم العثور على إعدادات الحسابات")
      return apiSuccess({ logs, success: false, error: "Account settings not found" })
    }

    const mapping = {
      companyId: companyId,
      ar: accountSettings.accounts_receivable_id,
      revenue: accountSettings.sales_revenue_id,
      vatPayable: accountSettings.vat_payable_id,
      shippingAccount: accountSettings.shipping_revenue_id,
    }

    logs.push("✅ تم جلب إعدادات الحسابات")

    // 5️⃣ إذا كان هناك قيد أصلي، جلب قيوده وتحديثها
    if (originalEntry) {
      logs.push("📝 تحديث القيد الأصلي للفاتورة...")
      
      const { data: originalLines, error: linesError } = await supabase
        .from("journal_entry_lines")
        .select("*")
        .eq("journal_entry_id", originalEntry.id)

      if (linesError) {
        logs.push(`❌ خطأ في جلب قيود القيد الأصلي: ${linesError.message}`)
      } else if (originalLines && originalLines.length > 0) {
        // حساب القيم الصحيحة من الفاتورة
        const currentTotal = Number(invoice.total_amount || 0)
        const currentSubtotal = Number(invoice.subtotal || 0)
        const currentTax = Number(invoice.tax_amount || 0)
        const returnedAmount = Number(invoice.returned_amount || 0)
        
        // القيم الأصلية (قبل المرتجع) = القيم الحالية + المرتجع
        const originalTotal = currentTotal + returnedAmount
        const originalSubtotal = currentSubtotal + (returnedAmount * (currentSubtotal / (currentTotal || 1)))
        const originalTax = currentTax + (returnedAmount * (currentTax / (currentTotal || 1)))

        logs.push(`📊 القيم الحالية: Total=${currentTotal}, Subtotal=${currentSubtotal}, Tax=${currentTax}`)
        logs.push(`📊 القيم الأصلية (قبل المرتجع): Total=${originalTotal}, Subtotal=${originalSubtotal}, Tax=${originalTax}`)
        logs.push(`📊 قيمة المرتجع: ${returnedAmount}`)

        // تحديث كل سطر في القيد الأصلي
        for (const line of originalLines) {
          let newDebit = line.debit_amount
          let newCredit = line.credit_amount
          let updated = false

          // تحديث سطر AR (الذمم المدينة)
          if (line.account_id === mapping.ar) {
            newDebit = currentTotal // AR يجب أن يعكس المبلغ الحالي بعد المرتجع
            newCredit = 0
            updated = true
          }
          // تحديث سطر Revenue (الإيراد)
          else if (line.account_id === mapping.revenue) {
            newDebit = 0
            newCredit = currentSubtotal // Revenue يجب أن يعكس الصافي الحالي
            updated = true
          }
          // تحديث سطر VAT (الضريبة)
          else if (mapping.vatPayable && line.account_id === mapping.vatPayable) {
            newDebit = 0
            newCredit = currentTax // VAT يجب أن يعكس الضريبة الحالية
            updated = true
          }

          // تحديث السطر إذا تغيرت القيم
          if (updated && (newDebit !== line.debit_amount || newCredit !== line.credit_amount)) {
            // التحقق من وجود description قبل استخدام replace
            const currentDescription = line.description || ''
            const cleanedDescription = currentDescription.replace(/ \(معدل للمرتجع\)| \(adjusted for return\)/g, '').trim()
            // تجنب المسافة الزائدة في البداية إذا كان الوصف فارغاً
            const newDescription = cleanedDescription 
              ? `${cleanedDescription} (معدل للمرتجع)`
              : '(معدل للمرتجع)'
            
            const { error: updateLineErr } = await supabase
              .from("journal_entry_lines")
              .update({
                debit_amount: newDebit,
                credit_amount: newCredit,
                description: newDescription
              })
              .eq("id", line.id)

            if (updateLineErr) {
              logs.push(`❌ خطأ في تحديث سطر القيد ${line.id}: ${updateLineErr.message}`)
            } else {
              logs.push(`✅ تم تحديث سطر القيد ${line.id} (AR/Revenue/VAT)`)
            }
          }
        }

        logs.push("✅ تم تحديث القيد الأصلي للفاتورة")
      }
    }

    // 6️⃣ حذف قيود المرتجع القديمة
    if (returnEntries && returnEntries.length > 0) {
      logs.push(`🗑️ حذف ${returnEntries.length} قيد مرتجع قديم...`)
      
      for (const returnEntry of returnEntries) {
        // حذف قيود القيد أولاً
        const { error: deleteLinesErr } = await supabase
          .from("journal_entry_lines")
          .delete()
          .eq("journal_entry_id", returnEntry.id)

        if (deleteLinesErr) {
          logs.push(`❌ خطأ في حذف قيود القيد ${returnEntry.id}: ${deleteLinesErr.message}`)
        } else {
          logs.push(`✅ تم حذف قيود القيد ${returnEntry.id}`)
        }

        // حذف القيد نفسه
        const { error: deleteEntryErr } = await supabase
          .from("journal_entries")
          .delete()
          .eq("id", returnEntry.id)

        if (deleteEntryErr) {
          logs.push(`❌ خطأ في حذف القيد ${returnEntry.id}: ${deleteEntryErr.message}`)
        } else {
          logs.push(`✅ تم حذف القيد ${returnEntry.id}`)
        }
      }

      logs.push(`✅ تم حذف جميع قيود المرتجع القديمة`)
    } else {
      logs.push("ℹ️ لا توجد قيود مرتجع قديمة للحذف")
    }

    // 7️⃣ تحديث حركات المخزون لتربط بالقيد الأصلي
    if (originalEntry) {
      logs.push("🔗 تحديث حركات المخزون لتربط بالقيد الأصلي...")
      
      const { data: inventoryTransactions, error: invError } = await supabase
        .from("inventory_transactions")
        .select("id, journal_entry_id, transaction_type")
        .eq("reference_id", invoice.id)
        .eq("transaction_type", "sale_return")

      if (!invError && inventoryTransactions && inventoryTransactions.length > 0) {
        let updatedCount = 0
        for (const tx of inventoryTransactions) {
          if (tx.journal_entry_id !== originalEntry.id) {
            const { error: updateTxErr } = await supabase
              .from("inventory_transactions")
              .update({ journal_entry_id: originalEntry.id })
              .eq("id", tx.id)

            if (updateTxErr) {
              logs.push(`❌ خطأ في تحديث حركة المخزون ${tx.id}: ${updateTxErr.message}`)
            } else {
              updatedCount++
            }
          }
        }
        logs.push(`✅ تم تحديث ${updatedCount} حركة مخزون لتربط بالقيد الأصلي`)
      }
    }

    logs.push("✅ تم الانتهاء من تصحيح الفاتورة INV-0001")
    logs.push("📌 الفاتورة الآن متوافقة مع النمط المحاسبي الجديد")

    return apiSuccess({
      logs,
      success: true,
      invoice_number: invoice.invoice_number,
      invoice_status: invoice.status,
      deleted_return_entries: returnEntries?.length || 0,
      original_entry_updated: !!originalEntry
    })

  } catch (err: any) {
    console.error("Error fixing invoice INV-0001:", err)
    return internalError("حدث خطأ أثناء تصحيح الفاتورة", err?.message)
  }
}

