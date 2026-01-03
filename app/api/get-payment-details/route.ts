import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

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

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    // جلب تفاصيل الدفعة مع بيانات العميل والفاتورة
    const { data: payment, error } = await supabase
      .from("payments")
      .select(`
        *,
        customer:customers(id, name),
        invoice:invoices(id, invoice_number, total_amount, status)
      `)
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

    // محاولة استخراج رقم الفاتورة من الملاحظات إذا لم يكن هناك invoice_id
    let extractedInvoice = null
    if (!payment.invoice_id && payment.notes) {
      const invoiceMatch = payment.notes.match(/INV-\d+/)
      if (invoiceMatch) {
        const invoiceNumber = invoiceMatch[0]
        const { data: inv } = await supabase
          .from("invoices")
          .select("id, invoice_number, customer_id, total_amount, status")
          .eq("invoice_number", invoiceNumber)
          .eq("company_id", payment.company_id)
          .single()
        
        extractedInvoice = inv
      }
    }

    return NextResponse.json({
      success: true,
      payment: {
        ...payment,
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

