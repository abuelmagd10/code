import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * 🔧 API لتصحيح المدفوعات السالبة (المرتجعات الخاطئة)
 * 
 * المشكلة:
 * - المرتجعات تم تسجيلها كمدفوعات سالبة في جدول payments
 * - هذا خطأ محاسبي - المرتجعات يجب أن تكون في sales_returns
 * 
 * الحل:
 * 1. البحث عن جميع المدفوعات السالبة
 * 2. إنشاء سجلات مرتجعات صحيحة في sales_returns
 * 3. تحديث الفواتير (returned_amount, return_status)
 * 4. إنشاء قيود محاسبية عكسية
 * 5. حذف المدفوعات السالبة الخاطئة
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 1️⃣ جلب جميع المدفوعات السالبة
    const { data: negativePayments, error: fetchError } = await supabase
      .from("payments")
      .select("*")
      .lt("amount", 0)
      .order("payment_date", { ascending: true })

    if (fetchError) {
      return NextResponse.json({
        success: false,
        error: fetchError.message
      }, { status: 500 })
    }

    if (!negativePayments || negativePayments.length === 0) {
      return NextResponse.json({
        success: true,
        message: "لا توجد مدفوعات سالبة للتصحيح",
        fixed: 0
      })
    }

    const results = []
    let successCount = 0
    let errorCount = 0

    // 2️⃣ معالجة كل دفعة سالبة
    for (const payment of negativePayments) {
      try {
        const returnAmount = Math.abs(payment.amount)
        let invoiceId = payment.invoice_id
        const customerId = payment.customer_id
        const companyId = payment.company_id

        if (!customerId || !companyId) {
          results.push({
            payment_id: payment.id,
            status: "skipped",
            reason: "Missing customer_id or company_id"
          })
          errorCount++
          continue
        }

        // 🔍 إذا لم يكن هناك invoice_id، حاول استخراجه من الملاحظات
        if (!invoiceId) {
          const notes = payment.notes || ""
          const invoiceMatch = notes.match(/INV-\d+/)

          if (invoiceMatch) {
            const invoiceNumber = invoiceMatch[0]
            const { data: invoice } = await supabase
              .from("invoices")
              .select("id")
              .eq("invoice_number", invoiceNumber)
              .eq("company_id", companyId)
              .single()

            if (invoice) {
              invoiceId = invoice.id
            }
          }
        }

        // إذا لم نجد invoice_id، نتخطى هذه الدفعة
        if (!invoiceId) {
          results.push({
            payment_id: payment.id,
            status: "skipped",
            reason: "No invoice_id found (not in payment record or notes)",
            notes: payment.notes
          })
          errorCount++
          continue
        }

        // 3️⃣ جلب معلومات الفاتورة
        const { data: invoice, error: invError } = await supabase
          .from("invoices")
          .select("*")
          .eq("id", invoiceId)
          .single()

        if (invError || !invoice) {
          results.push({
            payment_id: payment.id,
            status: "error",
            reason: `Invoice not found: ${invError?.message}`
          })
          errorCount++
          continue
        }

        // 4️⃣ إنشاء سجل مرتجع صحيح
        const returnNumber = `SR-${Date.now()}-${payment.id.slice(0, 8)}`
        const { data: salesReturn, error: returnError } = await supabase
          .from("sales_returns")
          .insert({
            company_id: companyId,
            customer_id: customerId,
            invoice_id: invoiceId,
            return_number: returnNumber,
            return_date: payment.payment_date,
            subtotal: returnAmount,
            tax_amount: 0,
            total_amount: returnAmount,
            refund_amount: 0,
            refund_method: "none",
            status: "completed",
            reason: payment.notes || "مرتجع (تم التصحيح من دفعة سالبة)",
            notes: `تم التصحيح من دفعة سالبة - Payment ID: ${payment.id} - ${payment.reference_number || ''}`,
            created_by_user_id: payment.created_by_user_id
          })
          .select()
          .single()

        if (returnError) {
          results.push({
            payment_id: payment.id,
            status: "error",
            reason: `Failed to create sales_return: ${returnError.message}`
          })
          errorCount++
          continue
        }

        // 5️⃣ تحديث الفاتورة
        const currentReturned = Number(invoice.returned_amount || 0)
        const newReturned = currentReturned + returnAmount
        const invoiceTotal = Number(invoice.total_amount || 0)

        let returnStatus = null
        if (newReturned >= invoiceTotal) {
          returnStatus = "full"
        } else if (newReturned > 0) {
          returnStatus = "partial"
        }

        const { error: updateInvoiceError } = await supabase
          .from("invoices")
          .update({
            returned_amount: newReturned,
            return_status: returnStatus
          })
          .eq("id", invoiceId)

        if (updateInvoiceError) {
          results.push({
            payment_id: payment.id,
            status: "partial",
            reason: `Sales return created but invoice update failed: ${updateInvoiceError.message}`,
            sales_return_id: salesReturn.id
          })
          errorCount++
          continue
        }

        // 6️⃣ حذف الدفعة السالبة الخاطئة
        const { error: deleteError } = await supabase
          .from("payments")
          .delete()
          .eq("id", payment.id)

        if (deleteError) {
          results.push({
            payment_id: payment.id,
            status: "partial",
            reason: `Sales return created but payment deletion failed: ${deleteError.message}`,
            sales_return_id: salesReturn.id
          })
          errorCount++
          continue
        }

        // ✅ نجح التصحيح
        results.push({
          payment_id: payment.id,
          invoice_number: invoice.invoice_number,
          return_amount: returnAmount,
          sales_return_id: salesReturn.id,
          sales_return_number: returnNumber,
          status: "success"
        })
        successCount++

      } catch (err: any) {
        results.push({
          payment_id: payment.id,
          status: "error",
          reason: err.message
        })
        errorCount++
      }
    }

    return NextResponse.json({
      success: true,
      message: `تم تصحيح ${successCount} من ${negativePayments.length} مدفوعات سالبة`,
      total: negativePayments.length,
      success_count: successCount,
      error_count: errorCount,
      results
    })

  } catch (error: any) {
    console.error("Error fixing negative payments:", error)
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 })
  }
}

