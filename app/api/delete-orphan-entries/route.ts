import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireOwnerOrAdmin } from "@/lib/api-security"
import { apiError, apiSuccess, HTTP_STATUS, internalError, badRequestError, notFoundError } from "@/lib/api-error-handler"

// API لحذف القيود المحاسبية اليتيمة (المرتبطة بفواتير محذوفة)
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
    const invoice_number = String(body?.invoice_number || "").trim()
      .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069\u200B-\u200D\uFEFF]/g, '')
    
    if (!invoice_number) {
      return badRequestError("رقم الفاتورة مطلوب", ["invoice_number"])
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
      .eq("company_id", companyId)
      .ilike("description", `%${correctedNumber}%`)

    if (!orphanEntries || orphanEntries.length === 0) {
      return apiSuccess({ 
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
      .eq("company_id", companyId)
      .ilike("notes", `%${correctedNumber}%`)

    return apiSuccess({
      ok: true,
      message: `تم حذف القيود اليتيمة بنجاح`,
      deleted_entries: entriesDeleted || 0,
      deleted_lines: linesDeleted || 0,
      deleted_inventory_transactions: txDeleted || 0,
      invoice_number: correctedNumber
    })

  } catch (err: any) {
    console.error("[Delete Orphan Entries] Error:", err)
    return internalError("حدث خطأ أثناء حذف القيود اليتيمة", err?.message || "Unknown error")
  }
}

