import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

/**
 * 🔍 API لجلب تفاصيل دفعة معينة
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const paymentId = searchParams.get('id')

    if (!paymentId) {
      return NextResponse.json({
        success: false,
        error: "Payment ID is required"
      }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // جلب تفاصيل الدفعة
    const { data: payment, error } = await supabase
      .from("payments")
      .select("*")
      .eq("id", paymentId)
      .single()

    if (error) {
      return NextResponse.json({
        success: false,
        error: error.message
      }, { status: 500 })
    }

    if (!payment) {
      return NextResponse.json({
        success: false,
        error: "Payment not found"
      }, { status: 404 })
    }

    // جلب بيانات العميل إذا كان موجوداً
    let customer = null
    if (payment.customer_id) {
      const { data: cust, error: custErr } = await supabase
        .from("customers")
        .select("id, name")
        .eq("id", payment.customer_id)
        .maybeSingle()
      if (!custErr) customer = cust
    }

    // جلب بيانات الفاتورة إذا كانت موجودة
    let invoice = null
    if (payment.invoice_id) {
      const { data: inv, error: invErr } = await supabase
        .from("invoices")
        .select("id, invoice_number, total_amount, status")
        .eq("id", payment.invoice_id)
        .maybeSingle()
      if (!invErr) invoice = inv
    }

    // محاولة استخراج رقم الفاتورة من الملاحظات إذا لم يكن هناك invoice_id
    let extractedInvoice = null
    if (!payment.invoice_id && payment.notes) {
      const invoiceMatch = payment.notes.match(/INV-\d+/)
      if (invoiceMatch) {
        const invoiceNumber = invoiceMatch[0]
        const { data: inv, error: extErr } = await supabase
          .from("invoices")
          .select("id, invoice_number, customer_id, total_amount, status")
          .eq("invoice_number", invoiceNumber)
          .eq("company_id", payment.company_id)
          .maybeSingle()

        if (!extErr) extractedInvoice = inv
      }
    }

    return NextResponse.json({
      success: true,
      payment: {
        ...payment,
        customer,
        invoice,
        extracted_invoice: extractedInvoice
      }
    })

  } catch (error: any) {
    console.error("Error fetching payment details:", error)
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 })
  }
}

