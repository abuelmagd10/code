import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

/**
 * 🔧 دالة لتوليد رقم مرتجع تلقائي
 */
async function generateReturnNumber(supabase: any, companyId: string): Promise<string> {
  const { data: lastReturn } = await supabase
    .from("sales_returns")
    .select("return_number")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lastReturn?.return_number) {
    const match = lastReturn.return_number.match(/RET-(\d+)/)
    if (match) {
      const nextNum = parseInt(match[1]) + 1
      return `RET-${String(nextNum).padStart(4, '0')}`
    }
  }

  return "RET-0001"
}

/**
 * 🔧 API لإصلاح الدفعات المتبقية تلقائياً
 */
export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const results: any[] = []

  try {
    // 1️⃣ جلب جميع المدفوعات السالبة المتبقية
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
        message: "No negative payments found",
        total: 0,
        results: []
      })
    }

    // 2️⃣ معالجة كل دفعة
    for (const payment of negativePayments) {
      try {
        const returnAmount = Math.abs(payment.amount)

        // 🔍 الحالة 1: الدفعة ليس لها customer_id أو company_id
        if (!payment.customer_id || !payment.company_id) {
          // حذف الدفعة مباشرة - بيانات غير صالحة
          const { error: deleteErr } = await supabase
            .from("payments")
            .delete()
            .eq("id", payment.id)

          if (deleteErr) {
            results.push({
              payment_id: payment.id,
              status: "error",
              action: "delete_invalid",
              reason: `Failed to delete: ${deleteErr.message}`
            })
          } else {
            results.push({
              payment_id: payment.id,
              status: "success",
              action: "deleted",
              reason: "Missing customer_id or company_id - invalid record"
            })
          }
          continue
        }

        // 🔍 الحالة 2: محاولة إيجاد الفاتورة
        let invoiceId = payment.invoice_id
        let invoiceNumber = null

        // محاولة استخراج من الملاحظات
        if (!invoiceId && payment.notes) {
          const invoiceMatch = payment.notes.match(/INV-\d+/)
          if (invoiceMatch) {
            invoiceNumber = invoiceMatch[0]
            const { data: inv } = await supabase
              .from("invoices")
              .select("id, invoice_number")
              .eq("invoice_number", invoiceNumber)
              .eq("company_id", payment.company_id)
              .maybeSingle()

            if (inv) {
              invoiceId = inv.id
            }
          }
        }

        // 🔍 الحالة 3: إذا لم نجد فاتورة، نبحث عن آخر فاتورة للعميل في نفس الفترة
        if (!invoiceId) {
          const paymentDate = new Date(payment.payment_date)
          const startDate = new Date(paymentDate)
          startDate.setDate(startDate.getDate() - 30) // آخر 30 يوم

          const { data: recentInvoices } = await supabase
            .from("invoices")
            .select("id, invoice_number, invoice_date, total_amount")
            .eq("customer_id", payment.customer_id)
            .eq("company_id", payment.company_id)
            .gte("invoice_date", startDate.toISOString().split('T')[0])
            .lte("invoice_date", payment.payment_date)
            .order("invoice_date", { ascending: false })
            .limit(1)

          if (recentInvoices && recentInvoices.length > 0) {
            invoiceId = recentInvoices[0].id
            invoiceNumber = recentInvoices[0].invoice_number
          }
        }

        // إذا لم نجد فاتورة نهائياً، نحذف الدفعة
        if (!invoiceId) {
          const { error: deleteErr } = await supabase
            .from("payments")
            .delete()
            .eq("id", payment.id)

          if (deleteErr) {
            results.push({
              payment_id: payment.id,
              status: "error",
              action: "delete_no_invoice",
              reason: `Failed to delete: ${deleteErr.message}`
            })
          } else {
            results.push({
              payment_id: payment.id,
              status: "success",
              action: "deleted",
              reason: "No invoice found - orphaned payment",
              amount: returnAmount
            })
          }
          continue
        }

        // 🎯 الآن لدينا invoice_id، ننشئ المرتجع
        // توليد رقم المرتجع
        const returnNumber = await generateReturnNumber(supabase, payment.company_id)

        const { data: newReturn, error: returnError } = await supabase
          .from("sales_returns")
          .insert({
            return_number: returnNumber,
            invoice_id: invoiceId,
            customer_id: payment.customer_id,
            company_id: payment.company_id,
            return_date: payment.payment_date,
            total_amount: returnAmount,
            notes: `Converted from negative payment ${payment.id}. Original notes: ${payment.notes || 'N/A'}`,
            status: "completed"
          })
          .select()
          .single()

        if (returnError) {
          results.push({
            payment_id: payment.id,
            invoice_number: invoiceNumber,
            status: "error",
            action: "create_return",
            reason: returnError.message
          })
          continue
        }

        // تحديث الفاتورة
        const { data: invoice } = await supabase
          .from("invoices")
          .select("total_amount, returned_amount")
          .eq("id", invoiceId)
          .single()

        if (invoice) {
          const newReturnedAmount = (invoice.returned_amount || 0) + returnAmount
          const totalAmount = invoice.total_amount || 0
          const newStatus = newReturnedAmount >= totalAmount ? "full" : "partial"

          await supabase
            .from("invoices")
            .update({
              returned_amount: newReturnedAmount,
              return_status: newStatus
            })
            .eq("id", invoiceId)
        }

        // حذف الدفعة السالبة
        await supabase
          .from("payments")
          .delete()
          .eq("id", payment.id)

        results.push({
          payment_id: payment.id,
          invoice_number: invoiceNumber,
          return_amount: returnAmount,
          status: "success",
          action: "converted_to_return"
        })

      } catch (err: any) {
        results.push({
          payment_id: payment.id,
          status: "error",
          action: "exception",
          reason: err.message
        })
      }
    }

    const successCount = results.filter(r => r.status === "success").length
    const errorCount = results.filter(r => r.status === "error").length

    return NextResponse.json({
      success: true,
      message: `Processed ${negativePayments.length} payments: ${successCount} succeeded, ${errorCount} failed`,
      total: negativePayments.length,
      success_count: successCount,
      error_count: errorCount,
      results
    })

  } catch (error: any) {
    console.error("Error in auto-fix:", error)
    return NextResponse.json({
      success: false,
      error: error.message,
      results
    }, { status: 500 })
  }
}

