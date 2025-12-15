import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { secureApiRequest } from "@/lib/api-security"
import { apiError, apiSuccess, HTTP_STATUS, internalError, badRequestError } from "@/lib/api-error-handler"

// API للبحث العميق عن فاتورة في كل الجداول المحتملة
export async function GET(request: NextRequest) {
  try {
    // === تحصين أمني: استخدام secureApiRequest ===
    const { user, companyId, member, error } = await secureApiRequest(request, {
      requireAuth: true,
      requireCompany: true,
      requirePermission: { resource: 'invoices', action: 'read' }
    })

    if (error) return error
    if (!companyId || !user) {
      return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على الشركة", "Company not found")
    }
    // === نهاية التحصين الأمني ===

    const supabase = await createClient()

    const params = request.nextUrl.searchParams
    let searchTerm = String(params.get("q") || "").trim()
      .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069\u200B-\u200D\uFEFF]/g, '')

    // تصحيح الأرقام المعكوسة
    const reversedMatch = searchTerm.match(/^(\d+)-([A-Za-z]+)$/)
    if (reversedMatch) {
      searchTerm = `${reversedMatch[2]}-${reversedMatch[1]}`
    }

    const results: any = {
      search_term: searchTerm,
      company: companyId,
      findings: []
    }

    // 1. البحث في invoices
    const { data: invoices, count: invCount } = await supabase
      .from("invoices")
      .select("*", { count: 'exact' })
      .ilike("invoice_number", `%${searchTerm}%`)
    
    if (invoices && invoices.length > 0) {
      results.findings.push({
        table: "invoices",
        found: true,
        count: invCount,
        records: invoices.map(inv => ({
          id: inv.id,
          invoice_number: inv.invoice_number,
          status: inv.status,
          invoice_type: inv.invoice_type,
          total_amount: inv.total_amount,
          is_mine: inv.company_id === companyId
        }))
      })
    }

    // 2. البحث في sales_returns عن طريق description
    const { data: salesReturns } = await supabase
      .from("sales_returns")
      .select("*, invoice:invoice_id(invoice_number, status, id)")
      .or(`return_number.ilike.%${searchTerm}%,notes.ilike.%${searchTerm}%`)
      .eq("company_id", companyId)
    
    if (salesReturns && salesReturns.length > 0) {
      results.findings.push({
        table: "sales_returns",
        found: true,
        count: salesReturns.length,
        records: salesReturns.map(sr => ({
          id: sr.id,
          return_number: sr.return_number,
          status: sr.status,
          linked_invoice: sr.invoice
        }))
      })
    }

    // 3. البحث في invoice_items (ربما الفاتورة موجودة كأصناف)
    const { data: invItems } = await supabase
      .from("invoice_items")
      .select("*, invoice:invoice_id(invoice_number, status, id, company_id)")
      .not("invoice_id", "is", null)
      .limit(50)

    // فلترة للعثور على فاتورة برقم معين
    const matchingItems = invItems?.filter(item => 
      item.invoice?.invoice_number?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    
    if (matchingItems && matchingItems.length > 0) {
      results.findings.push({
        table: "invoice_items",
        found: true,
        count: matchingItems.length,
        invoice_ids: [...new Set(matchingItems.map(i => i.invoice_id))],
        sample_invoice: matchingItems[0]?.invoice
      })
    }

    // 4. البحث في journal_entries
    const { data: journals } = await supabase
      .from("journal_entries")
      .select("id, description, reference_type, entry_date, company_id")
      .ilike("description", `%${searchTerm}%`)
    
    if (journals && journals.length > 0) {
      results.findings.push({
        table: "journal_entries",
        found: true,
        count: journals.length,
        records: journals.map(j => ({
          id: j.id,
          description: j.description,
          type: j.reference_type,
          is_mine: j.company_id === companyId
        }))
      })
    }

    // 5. استخراج invoice_id من القيود للبحث عن الفاتورة المحذوفة
    const invoiceIdMatch = results.findings
      .find((f: any) => f.table === "journal_entries")
      ?.records?.[0]?.description?.match(/invoice_id[:\s]*([a-f0-9-]+)/i)

    if (invoiceIdMatch) {
      const foundInvoiceId = invoiceIdMatch[1]
      const { data: directInv } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", foundInvoiceId)
        .single()
      
      if (directInv) {
        results.findings.push({
          table: "invoices_by_id",
          found: true,
          record: directInv
        })
      }
    }

    // 6. تحديد الحالة
    const hasInvoice = results.findings.some((f: any) => f.table === "invoices" && f.found)
    const hasJournals = results.findings.some((f: any) => f.table === "journal_entries" && f.found)
    
    results.diagnosis = hasInvoice 
      ? "الفاتورة موجودة ويمكن إصلاحها"
      : hasJournals 
        ? "الفاتورة محذوفة لكن القيود موجودة (قيود يتيمة)"
        : "لا توجد أي بيانات لهذه الفاتورة"

    return apiSuccess(results)
  } catch (err: any) {
    return internalError("حدث خطأ أثناء البحث العميق عن الفاتورة", err?.message)
  }
}

