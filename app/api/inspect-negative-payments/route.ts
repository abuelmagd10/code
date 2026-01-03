import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * 🔍 API لفحص المدفوعات السالبة
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    // جلب جميع المدفوعات السالبة مع كل التفاصيل
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

    // محاولة إيجاد الفواتير المرتبطة من خلال الملاحظات
    const enrichedPayments = await Promise.all(
      (negativePayments || []).map(async (payment) => {
        // محاولة استخراج رقم الفاتورة من الملاحظات
        const notes = payment.notes || ""
        const invoiceMatch = notes.match(/INV-\d+/)
        let relatedInvoice = null

        if (invoiceMatch) {
          const invoiceNumber = invoiceMatch[0]
          const { data: invoice } = await supabase
            .from("invoices")
            .select("id, invoice_number, customer_id, total_amount, status")
            .eq("invoice_number", invoiceNumber)
            .eq("company_id", payment.company_id)
            .single()
          
          relatedInvoice = invoice
        }

        return {
          ...payment,
          related_invoice: relatedInvoice
        }
      })
    )

    return NextResponse.json({
      success: true,
      count: negativePayments?.length || 0,
      payments: enrichedPayments
    })

  } catch (error: any) {
    console.error("Error inspecting negative payments:", error)
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 })
  }
}

