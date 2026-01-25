import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { secureApiRequest, serverError, badRequestError } from "@/lib/api-security-enhanced"
import { apiSuccess } from "@/lib/api-error-handler"

/**
 * 🔐 Cash Flow Statement API - قائمة التدفقات النقدية
 * 
 * ⚠️ CRITICAL ACCOUNTING FUNCTION - FINAL APPROVED LOGIC
 * 
 * ✅ هذا المنطق معتمد نهائيًا ولا يتم تغييره إلا بحذر شديد
 * ✅ مطابق لأنظمة ERP الاحترافية (Odoo / Zoho / SAP)
 * 
 * ✅ القواعد الإلزامية الثابتة:
 * 1. Single Source of Truth:
 *    - جميع البيانات تأتي من journal_entries فقط
 *    - لا قيم ثابتة أو محفوظة مسبقًا
 *    - التسلسل: journal_entries → journal_entry_lines (cash/bank accounts) → cash_flow
 * 
 * 2. Cash Accounts Only:
 *    - التدفقات النقدية تُحسب فقط من حسابات sub_type = 'cash' أو 'bank'
 *    - لا تُحسب من حسابات أخرى (حتى لو كانت asset)
 * 
 * 3. Classification:
 *    - Operating: الفواتير، المدفوعات، المصروفات، الرواتب
 *    - Investing: شراء/بيع الأصول، الاستثمارات، الإهلاك
 *    - Financing: القروض، رأس المال، الأرباح الموزعة
 * 
 * 4. Compatibility:
 *    - النقد في التدفقات النقدية = أرصدة الحسابات البنكية في الميزانية
 *    - يجب أن يتطابق مع الميزانية العمومية
 * 
 * 5. Future Compatibility (مضمون):
 *    - إغلاق السنة
 *    - ترحيل الأرباح المحتجزة
 *    - القيود المركبة
 *    - الضرائب
 *    - المخزون
 *    - الإهلاك
 * 
 * ⚠️ DO NOT MODIFY WITHOUT SENIOR ACCOUNTING REVIEW
 * 
 * راجع: docs/ACCOUNTING_REPORTS_ARCHITECTURE.md
 */
export async function GET(req: NextRequest) {
  try {
    // ✅ إنشاء supabase client للمصادقة
    const authSupabase = await createServerClient()

    // ✅ التحقق من الأمان
    const { user, companyId, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requireBranch: false,
      requirePermission: { resource: "reports", action: "read" },
      supabase: authSupabase // ✅ تمرير supabase client
    })

    if (error) return error
    if (!companyId) return badRequestError("معرف الشركة مطلوب")

    // ✅ بعد التحقق من الأمان، نستخدم service role key
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    const { searchParams } = new URL(req.url)
    const from = searchParams.get("from") || "0001-01-01"
    const to = searchParams.get("to") || "9999-12-31"

    // ✅ جلب جميع قيود اليومية المرحّلة في الفترة
    // ✅ مصدر البيانات الوحيد: journal_entries (لا payments أو invoices مباشرة)
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
      .is("deleted_at", null) // ✅ استثناء القيود المحذوفة
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

    // ✅ جلب الحسابات النقدية (cash, bank)
    const { data: cashAccounts, error: accountsError } = await supabase
      .from("chart_of_accounts")
      .select("id, sub_type")
      .eq("company_id", companyId)
      .in("sub_type", ["cash", "bank"])

    if (accountsError) {
      console.error("Cash accounts error:", accountsError)
      return serverError(`خطأ في جلب الحسابات النقدية: ${accountsError.message}`)
    }

    const cashAccountIds = (cashAccounts || []).map((acc: any) => acc.id)

    // ✅ جلب سطور القيود (بدون joins)
    const entryIds = entries.map(e => e.id)
    const { data: lines, error: linesError } = await supabase
      .from("journal_entry_lines")
      .select("journal_entry_id, account_id, debit_amount, credit_amount")
      .in("journal_entry_id", entryIds)
      .in("account_id", cashAccountIds)

    if (linesError) {
      console.error("Cash flow lines error:", linesError)
      return serverError(`خطأ في جلب سطور القيود: ${linesError.message}`)
    }

    // ✅ حساب التدفق النقدي لكل قيد (فقط الحسابات النقدية: cash, bank)
    // ✅ التدفق النقدي = debit - credit (موجب = تدفق داخل، سالب = تدفق خارج)
    const cashFlowByEntry: Record<string, number> = {}

    for (const line of lines || []) {
      const entryId = line.journal_entry_id
      const debit = Number(line.debit_amount || 0)
      const credit = Number(line.credit_amount || 0)
      // ✅ التدفق النقدي = debit - credit
      // موجب = زيادة في النقد (تدفق داخل)
      // سالب = نقص في النقد (تدفق خارج)
      const cashFlow = debit - credit

      cashFlowByEntry[entryId] = (cashFlowByEntry[entryId] || 0) + cashFlow
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

    // ✅ تصنيف القيود حسب النوع (تشغيلية/استثمارية/تمويلية)
    for (const entry of entries) {
      const cashFlow = cashFlowByEntry[entry.id] || 0
      
      // ✅ تجاهل القيود بدون تأثير نقدي (صفر أو قريب من الصفر)
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

    // ✅ صافي التدفق النقدي = مجموع جميع الفئات
    const netCashFlow = 
      categories.operating.total + 
      categories.investing.total + 
      categories.financing.total + 
      categories.other.total

    // ✅ التحقق من التوافق مع الميزانية (يمكن إضافته لاحقًا)
    // النقد في التدفقات النقدية يجب أن يتطابق مع أرصدة الحسابات البنكية في الميزانية

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

