import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// API لحذف القيود المحاسبية اليتيمة (المرتبطة بفواتير محذوفة)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    // جلب الشركة الحالية
    const { data: company } = await supabase
      .from("companies")
      .select("id")
      .eq("user_id", user.id)
      .single()

    if (!company) return NextResponse.json({ error: "no company" }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const invoice_number = String(body?.invoice_number || "").trim()
      .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069\u200B-\u200D\uFEFF]/g, '')
    
    if (!invoice_number) {
      return NextResponse.json({ error: "missing invoice_number" }, { status: 400 })
    }

    // تصحيح الأرقام المعكوسة
    let correctedNumber = invoice_number
    const reversedMatch = invoice_number.match(/^(\d+)-([A-Za-z]+)$/)
    if (reversedMatch) {
      correctedNumber = `${reversedMatch[2]}-${reversedMatch[1]}`
    }

    // البحث عن القيود المرتبطة بهذه الفاتورة
    const { data: orphanEntries } = await supabase
      .from("journal_entries")
      .select("id")
      .eq("company_id", company.id)
      .ilike("description", `%${correctedNumber}%`)

    if (!orphanEntries || orphanEntries.length === 0) {
      return NextResponse.json({ 
        message: "لا توجد قيود يتيمة لحذفها",
        deleted_count: 0 
      })
    }

    const entryIds = orphanEntries.map(e => e.id)

    // حذف سطور القيود أولاً
    const { count: linesDeleted } = await supabase
      .from("journal_entry_lines")
      .delete({ count: 'exact' })
      .in("journal_entry_id", entryIds)

    // حذف القيود
    const { count: entriesDeleted } = await supabase
      .from("journal_entries")
      .delete({ count: 'exact' })
      .in("id", entryIds)

    // حذف معاملات المخزون اليتيمة أيضاً
    const { count: txDeleted } = await supabase
      .from("inventory_transactions")
      .delete({ count: 'exact' })
      .eq("company_id", company.id)
      .ilike("notes", `%${correctedNumber}%`)

    return NextResponse.json({
      ok: true,
      message: `تم حذف القيود اليتيمة بنجاح`,
      deleted_entries: entriesDeleted || 0,
      deleted_lines: linesDeleted || 0,
      deleted_inventory_transactions: txDeleted || 0,
      invoice_number: correctedNumber
    })

  } catch (err: any) {
    console.error("[Delete Orphan Entries] Error:", err)
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 })
  }
}

