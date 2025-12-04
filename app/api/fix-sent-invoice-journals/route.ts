import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// API لإصلاح القيود المحاسبية الخاطئة للفواتير المرسلة
// الفواتير المرسلة يجب ألا تحتوي على قيود محاسبية (فقط خصم المخزون)
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 })
    }

    const { data: company } = await supabase
      .from("companies")
      .select("id")
      .eq("user_id", user.id)
      .single()
    if (!company) {
      return NextResponse.json({ error: "لم يتم العثور على الشركة" }, { status: 404 })
    }

    // جلب الفواتير المرسلة فقط
    const { data: sentInvoices } = await supabase
      .from("invoices")
      .select("id, invoice_number, status")
      .eq("company_id", company.id)
      .eq("status", "sent")

    if (!sentInvoices || sentInvoices.length === 0) {
      return NextResponse.json({ 
        message: "لا توجد فواتير مرسلة تحتاج إصلاح",
        fixed: 0 
      })
    }

    const invoiceIds = sentInvoices.map(inv => inv.id)
    let fixedCount = 0
    const fixedInvoices: string[] = []

    // البحث عن القيود المحاسبية الخاطئة للفواتير المرسلة
    const { data: wrongEntries } = await supabase
      .from("journal_entries")
      .select("id, reference_id, reference_type")
      .eq("company_id", company.id)
      .in("reference_id", invoiceIds)
      .in("reference_type", ["invoice", "invoice_cogs", "invoice_payment"])

    if (wrongEntries && wrongEntries.length > 0) {
      const entryIds = wrongEntries.map(e => e.id)
      
      // حذف سطور القيود أولاً
      await supabase
        .from("journal_entry_lines")
        .delete()
        .in("journal_entry_id", entryIds)

      // ثم حذف القيود نفسها
      await supabase
        .from("journal_entries")
        .delete()
        .in("id", entryIds)

      // تحديد الفواتير التي تم إصلاحها
      const fixedInvoiceIds = [...new Set(wrongEntries.map(e => e.reference_id))]
      fixedCount = fixedInvoiceIds.length
      
      for (const invId of fixedInvoiceIds) {
        const inv = sentInvoices.find(i => i.id === invId)
        if (inv) fixedInvoices.push(inv.invoice_number)
      }
    }

    return NextResponse.json({
      message: `تم إصلاح ${fixedCount} فاتورة مرسلة`,
      fixed: fixedCount,
      invoices: fixedInvoices,
      deletedEntries: wrongEntries?.length || 0
    })

  } catch (error: any) {
    console.error("Error fixing sent invoice journals:", error)
    return NextResponse.json({ error: error.message || "خطأ في الإصلاح" }, { status: 500 })
  }
}

// GET لعرض الفواتير المرسلة التي تحتوي على قيود خاطئة
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 })
    }

    const { data: company } = await supabase
      .from("companies")
      .select("id")
      .eq("user_id", user.id)
      .single()
    if (!company) {
      return NextResponse.json({ error: "لم يتم العثور على الشركة" }, { status: 404 })
    }

    // جلب الفواتير المرسلة
    const { data: sentInvoices } = await supabase
      .from("invoices")
      .select("id, invoice_number, total_amount, invoice_date")
      .eq("company_id", company.id)
      .eq("status", "sent")

    if (!sentInvoices || sentInvoices.length === 0) {
      return NextResponse.json({ 
        sentInvoices: [],
        invoicesWithWrongEntries: [],
        totalWrongEntries: 0
      })
    }

    const invoiceIds = sentInvoices.map(inv => inv.id)

    // البحث عن القيود المحاسبية الخاطئة
    const { data: wrongEntries } = await supabase
      .from("journal_entries")
      .select("id, reference_id, reference_type, description")
      .eq("company_id", company.id)
      .in("reference_id", invoiceIds)
      .in("reference_type", ["invoice", "invoice_cogs", "invoice_payment"])

    const invoicesWithWrongEntries = sentInvoices.filter(inv => 
      wrongEntries?.some(e => e.reference_id === inv.id)
    )

    return NextResponse.json({
      sentInvoices: sentInvoices.length,
      invoicesWithWrongEntries: invoicesWithWrongEntries.map(inv => ({
        ...inv,
        entries: wrongEntries?.filter(e => e.reference_id === inv.id) || []
      })),
      totalWrongEntries: wrongEntries?.length || 0
    })

  } catch (error: any) {
    console.error("Error checking sent invoice journals:", error)
    return NextResponse.json({ error: error.message || "خطأ في الفحص" }, { status: 500 })
  }
}

