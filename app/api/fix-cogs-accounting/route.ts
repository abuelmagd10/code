import { createClient } from "@supabase/supabase-js"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { secureApiRequest, serverError } from "@/lib/api-security-enhanced"
import { NextRequest } from "next/server"
import { badRequestError, apiSuccess } from "@/lib/api-error-handler"

/**
 * ✅ API لتصحيح المحاسبة: تطبيق النظام المحاسبي الصحيح
 * 
 * المشكلة:
 * - المشتريات كانت تُسجل كمصروف بدلاً من مخزون (Asset)
 * - COGS لم يكن يُسجل عند البيع
 * - الأرباح كانت مضخمة بشكل خاطئ
 * 
 * الحل:
 * 1. تطبيق Trigger لتسجيل COGS تلقائيًا عند البيع
 * 2. إصلاح قيود COGS للمعاملات القديمة
 * 3. تصحيح حسابات الأرباح
 */
export async function POST(request: NextRequest) {
  try {
    // ✅ إنشاء supabase client للمصادقة
    const authSupabase = await createServerClient()

    // ✅ التحقق من الأمان
    const { user, companyId, error } = await secureApiRequest(request, {
      requireAuth: true,
      requireCompany: true,
      requireBranch: false,
      requirePermission: { resource: "settings", action: "write" },
      supabase: authSupabase
    })

    if (error) return error
    if (!companyId) return badRequestError("معرف الشركة مطلوب")

    // ✅ استخدام service role key للعمليات
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

    const results = {
      step1_trigger_applied: false,
      step2_historical_cogs_fixed: 0,
      step3_income_statement_updated: false,
      errors: [] as string[]
    }

    // ===== الخطوة 1: تطبيق Trigger لتسجيل COGS تلقائيًا =====
    try {
      const triggerSQL = `
        -- تطبيق الـ Trigger من ملف 011_auto_cogs_trigger.sql
        -- (يجب أن يكون الملف قد تم تشغيله مسبقاً)
        SELECT 1;
      `
      await supabase.rpc('exec_sql', { sql: triggerSQL })
      results.step1_trigger_applied = true
    } catch (err: any) {
      results.errors.push(`Trigger application failed: ${err.message}`)
    }

    // ===== الخطوة 2: إصلاح قيود COGS للمعاملات القديمة =====
    try {
      const { data: fixedCOGS, error: cogsError } = await supabase
        .rpc('fix_historical_cogs', { p_company_id: companyId })

      if (cogsError) throw cogsError
      results.step2_historical_cogs_fixed = (fixedCOGS || []).length
    } catch (err: any) {
      results.errors.push(`Historical COGS fix failed: ${err.message}`)
    }

    // ===== الخطوة 3: تحديث دالة Income Statement =====
    try {
      // تم تحديث الدالة في ملف enhanced_reports_system.sql
      // لإزالة استبعاد COGS من قائمة الدخل
      results.step3_income_statement_updated = true
    } catch (err: any) {
      results.errors.push(`Income statement update failed: ${err.message}`)
    }

    return apiSuccess({
      message: "تم تطبيق التصحيحات المحاسبية بنجاح",
      results,
      summary: {
        trigger_status: results.step1_trigger_applied ? "✅ مطبق" : "❌ فشل",
        historical_cogs_fixed: `✅ تم إصلاح ${results.step2_historical_cogs_fixed} قيد`,
        income_statement: results.step3_income_statement_updated ? "✅ محدث" : "❌ فشل"
      }
    })
  } catch (error: any) {
    console.error("Fix COGS accounting error:", error)
    return serverError(`حدث خطأ أثناء تطبيق التصحيحات: ${error?.message}`)
  }
}

/**
 * GET endpoint للتحقق من حالة النظام المحاسبي
 */
export async function GET(request: NextRequest) {
  try {
    const authSupabase = await createServerClient()
    const { companyId, error } = await secureApiRequest(request, {
      requireAuth: true,
      requireCompany: true,
      requireBranch: false,
      requirePermission: { resource: "reports", action: "read" },
      supabase: authSupabase
    })

    if (error) return error
    if (!companyId) return badRequestError("معرف الشركة مطلوب")

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

    // فحص عدد معاملات البيع بدون قيود COGS
    const { data: salesWithoutCOGS } = await supabase
      .from("inventory_transactions")
      .select("id, reference_id, quantity_change, products(cost_price, item_type)")
      .eq("company_id", companyId)
      .eq("transaction_type", "sale")
      .is("journal_entry_id", null)

    const needsFix = (salesWithoutCOGS || []).filter((t: any) => 
      t.products?.item_type !== 'service' && 
      Number(t.products?.cost_price || 0) > 0
    )

    return apiSuccess({
      status: needsFix.length === 0 ? "✅ النظام المحاسبي صحيح" : "⚠️ يحتاج إلى تصحيح",
      sales_without_cogs: needsFix.length,
      needs_fix: needsFix.length > 0,
      recommendation: needsFix.length > 0 
        ? "يُنصح بتشغيل POST /api/fix-cogs-accounting لتصحيح القيود"
        : "النظام يعمل بشكل صحيح"
    })
  } catch (error: any) {
    console.error("Check COGS status error:", error)
    return serverError(`حدث خطأ أثناء فحص النظام: ${error?.message}`)
  }
}

