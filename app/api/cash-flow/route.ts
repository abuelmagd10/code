import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { secureApiRequest, serverError, badRequestError } from "@/lib/api-security-enhanced"
import { apiSuccess } from "@/lib/api-error-handler"

/**
 * قائمة التدفقات النقدية (Cash Flow Statement)
 * تصنيف التدفقات النقدية إلى: تشغيلية، استثمارية، تمويلية
 */
export async function GET(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  try {
    const { user, companyId, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requireBranch: false,
      requirePermission: { resource: "reports", action: "read" }
    })

    if (error) return error
    if (!companyId) return badRequestError("معرف الشركة مطلوب")

    const { searchParams } = new URL(req.url)
    const from = searchParams.get("from") || "0001-01-01"
    const to = searchParams.get("to") || "9999-12-31"

    // جلب جميع قيود اليومية المرحّلة في الفترة
    const { data: entries, error: entriesError } = await supabase
      .from("journal_entries")
      .select(`
        id,
        entry_date,
        reference_type,
        description,
        status
      `)
      .eq("company_id", companyId)
      .eq("status", "posted")
      .gte("entry_date", from)
      .lte("entry_date", to)
      .order("entry_date")

    if (entriesError) {
      console.error("Cash flow entries error:", entriesError)
      return serverError(`خطأ في جلب القيود: ${entriesError.message}`)
    }

    if (!entries || entries.length === 0) {
      return apiSuccess({
        operating: { total: 0, items: [] },
        investing: { total: 0, items: [] },
        financing: { total: 0, items: [] },
        other: { total: 0, items: [] },
        netCashFlow: 0,
        period: { from, to }
      })
    }

    // جلب سطور القيود للحسابات النقدية فقط
    const entryIds = entries.map(e => e.id)
    const { data: lines, error: linesError } = await supabase
      .from("journal_entry_lines")
      .select(`
        journal_entry_id,
        debit_amount,
        credit_amount,
        chart_of_accounts!inner(
          sub_type
        )
      `)
      .in("journal_entry_id", entryIds)

    if (linesError) {
      console.error("Cash flow lines error:", linesError)
      return serverError(`خطأ في جلب سطور القيود: ${linesError.message}`)
    }

    // حساب التدفق النقدي لكل قيد (فقط الحسابات النقدية: cash, bank)
    const cashFlowByEntry: Record<string, number> = {}
    
    for (const line of lines || []) {
      const entryId = line.journal_entry_id
      const subType = ((line as any).chart_of_accounts?.sub_type || '').toLowerCase()
      
      // فقط الحسابات النقدية
      if (subType === 'cash' || subType === 'bank') {
        const debit = Number(line.debit_amount || 0)
        const credit = Number(line.credit_amount || 0)
        const cashFlow = debit - credit // موجب = تدفق داخل، سالب = تدفق خارج
        
        cashFlowByEntry[entryId] = (cashFlowByEntry[entryId] || 0) + cashFlow
      }
    }

    // تصنيف القيود حسب النوع
    const classify = (referenceType: string): 'operating' | 'investing' | 'financing' | 'other' => {
      const type = referenceType.toLowerCase()
      
      // أنشطة تشغيلية (Operating Activities)
      if ([
        'invoice', 'invoice_payment', 'customer_payment',
        'bill', 'bill_payment', 'supplier_payment',
        'purchase_order_payment', 'po_payment',
        'expense', 'salary', 'payroll'
      ].some(t => type.includes(t))) {
        return 'operating'
      }
      
      // أنشطة استثمارية (Investing Activities)
      if ([
        'asset_purchase', 'asset_sale', 'investment',
        'fixed_asset', 'depreciation'
      ].some(t => type.includes(t))) {
        return 'investing'
      }
      
      // أنشطة تمويلية (Financing Activities)
      if ([
        'loan', 'capital', 'dividend', 'profit_distribution',
        'owner_withdrawal', 'owner_contribution'
      ].some(t => type.includes(t))) {
        return 'financing'
      }
      
      return 'other'
    }

    // تجميع البيانات
    const categories = {
      operating: { total: 0, items: [] as any[] },
      investing: { total: 0, items: [] as any[] },
      financing: { total: 0, items: [] as any[] },
      other: { total: 0, items: [] as any[] }
    }

    for (const entry of entries) {
      const cashFlow = cashFlowByEntry[entry.id] || 0
      
      // تجاهل القيود بدون تأثير نقدي
      if (Math.abs(cashFlow) < 0.01) continue
      
      const category = classify(entry.reference_type || '')
      
      categories[category].items.push({
        id: entry.id,
        date: entry.entry_date,
        type: entry.reference_type,
        description: entry.description,
        amount: cashFlow
      })
      
      categories[category].total += cashFlow
    }

    const netCashFlow = 
      categories.operating.total + 
      categories.investing.total + 
      categories.financing.total + 
      categories.other.total

    return apiSuccess({
      ...categories,
      netCashFlow,
      period: { from, to }
    })
  } catch (e: any) {
    console.error("Cash flow error:", e)
    return serverError(`حدث خطأ أثناء إنشاء قائمة التدفقات النقدية: ${e?.message || "unknown_error"}`)
  }
}

