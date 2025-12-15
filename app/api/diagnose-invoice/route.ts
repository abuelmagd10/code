import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { secureApiRequest } from "@/lib/api-security"
import { apiError, apiSuccess, HTTP_STATUS, internalError, badRequestError } from "@/lib/api-error-handler"

// API للتشخيص - البحث عن فاتورة في جميع الجداول
export async function GET(request: NextRequest) {
  try {
    // === تحصين أمني: استخدام secureApiRequest ===
    const { user, companyId, member, error } = await secureApiRequest(request, {
      requireAuth: true,
      requireCompany: true,
      permissions: ['invoices:read']
    })

    if (error) return error
    if (!companyId || !user) {
      return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على الشركة", "Company not found")
    }
    // === نهاية التحصين الأمني ===

    const supabase = await createClient()
    
    // جلب اسم الشركة
    const { data: company } = await supabase
      .from("companies")
      .select("id, name")
      .eq("id", companyId)
      .single()

    const params = request.nextUrl.searchParams
    let searchTerm = String(params.get("q") || "").trim()
    
    if (!searchTerm) {
      return badRequestError("مصطلح البحث مطلوب (q)", ["q"])
    }

    // تصحيح الأرقام المعكوسة
    const reversedMatch = searchTerm.match(/^(\d+)-([A-Za-z]+)$/)
    if (reversedMatch) {
      searchTerm = `${reversedMatch[2]}-${reversedMatch[1]}`
    }

    const results: any = {
      search_term: searchTerm,
      current_company: company ? { id: company.id, name: company.name } : null,
      found_in: []
    }

    // 1. البحث في جدول invoices
    const { data: invoices } = await supabase
      .from("invoices")
      .select("id, invoice_number, status, invoice_type, total_amount, returned_amount, company_id")
      .or(`invoice_number.ilike.%${searchTerm}%`)
      .limit(10)

    if (invoices && invoices.length > 0) {
      results.found_in.push({
        table: "invoices",
        count: invoices.length,
        records: invoices.map(inv => ({
          ...inv,
          is_your_company: inv.company_id === companyId
        }))
      })
    }

    // 2. البحث في جدول sales_returns
    const { data: salesReturns } = await supabase
      .from("sales_returns")
      .select("id, return_number, invoice_id, status, total_amount, company_id")
      .or(`return_number.ilike.%${searchTerm}%`)
      .limit(10)

    if (salesReturns && salesReturns.length > 0) {
      results.found_in.push({
        table: "sales_returns",
        count: salesReturns.length,
        records: salesReturns.map(sr => ({
          ...sr,
          is_your_company: sr.company_id === companyId
        }))
      })
    }

    // 3. البحث في جدول bills (فواتير الشراء)
    const { data: bills } = await supabase
      .from("bills")
      .select("id, bill_number, status, total_amount, returned_amount, company_id")
      .or(`bill_number.ilike.%${searchTerm}%`)
      .limit(10)

    if (bills && bills.length > 0) {
      results.found_in.push({
        table: "bills",
        count: bills.length,
        records: bills.map(b => ({
          ...b,
          is_your_company: b.company_id === companyId
        }))
      })
    }

    // 4. البحث في journal_entries بالوصف
    const { data: journals } = await supabase
      .from("journal_entries")
      .select("id, entry_date, description, reference_type, reference_id, company_id")
      .ilike("description", `%${searchTerm}%`)
      .limit(10)

    if (journals && journals.length > 0) {
      results.found_in.push({
        table: "journal_entries",
        count: journals.length,
        records: journals.map(j => ({
          ...j,
          is_your_company: j.company_id === companyId
        }))
      })
    }

    // 5. البحث عن الفاتورة بالرقم فقط (بدون prefix)
    const numericPart = searchTerm.replace(/[^0-9]/g, '')
    if (numericPart && numericPart !== searchTerm) {
      const { data: numericInvoices } = await supabase
        .from("invoices")
        .select("id, invoice_number, status, invoice_type, total_amount, company_id")
        .or(`invoice_number.ilike.%${numericPart}%`)
        .limit(10)

      if (numericInvoices && numericInvoices.length > 0) {
        const newRecords = numericInvoices.filter(
          inv => !invoices?.find(i => i.id === inv.id)
        )
        if (newRecords.length > 0) {
          results.found_in.push({
            table: "invoices (numeric search)",
            count: newRecords.length,
            records: newRecords.map(inv => ({
              ...inv,
              is_your_company: inv.company_id === companyId
            }))
          })
        }
      }
    }

    // ملخص
    results.summary = {
      total_found: results.found_in.reduce((sum: number, t: any) => sum + t.count, 0),
      in_your_company: results.found_in.reduce((sum: number, t: any) => 
        sum + t.records.filter((r: any) => r.is_your_company).length, 0
      ),
      tables_searched: ["invoices", "sales_returns", "bills", "journal_entries"]
    }

    return apiSuccess(results)

  } catch (err: any) {
    console.error("[Diagnose Invoice] Error:", err)
    return internalError("حدث خطأ أثناء تشخيص الفاتورة", err?.message || "Unknown error")
  }
}

