import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireOwnerOrAdmin } from "@/lib/api-security"
import { apiError, apiSuccess, HTTP_STATUS, internalError, badRequestError, notFoundError } from "@/lib/api-error-handler"

// API لإصلاح مشاكل صحة البيانات تلقائياً
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

    const body = await request.json()
    const { fix_type } = body

    if (!fix_type) {
      return badRequestError("نوع الإصلاح مطلوب", ["fix_type"])
    }

    const results: any = { fixed: 0, errors: [] }

    switch (fix_type) {
      // ======================================
      // 1. مزامنة أرصدة المخزون
      // ======================================
      case "sync_stock": {
        const { data, error } = await supabase.rpc("sync_all_stock_quantities", {
          p_company_id: companyId
        })
        if (error) {
          return internalError("خطأ في مزامنة المخزون", error.message)
        }
        results.fixed = data?.fixed_count || 0
        results.message = `تم مزامنة ${results.fixed} منتج`
        break
      }

      // ======================================
      // 2. حذف حركات المخزون للفواتير الملغاة
      // ======================================
      case "remove_orphan_transactions": {
        const { data, error } = await supabase.rpc("remove_cancelled_invoice_sale_transactions", {
          p_company_id: companyId
        })
        if (error) {
          return internalError("خطأ في حذف الحركات الخاطئة", error.message)
        }
        results.fixed = data?.deleted_count || 0
        results.message = `تم حذف ${results.fixed} حركة خاطئة`
        break
      }

      // ======================================
      // 3. إصلاح قيود المرتجعات الخاطئة
      // ======================================
      case "fix_return_entries": {
        const { data, error } = await supabase.rpc("fix_wrong_return_account_entries", {
          p_company_id: companyId
        })
        if (error) {
          return internalError("خطأ في إصلاح قيود المرتجعات", error.message)
        }
        results.fixed = data?.fixed_count || 0
        results.message = `تم إصلاح ${results.fixed} قيد`
        break
      }

      default:
        return badRequestError("نوع الإصلاح غير معروف. يجب أن يكون: sync_stock, remove_orphan_transactions, أو fix_return_entries", ["fix_type"])
    }

    return apiSuccess({
      success: true,
      fix_type,
      ...results
    })
  } catch (error: any) {
    console.error("Fix error:", error)
    return internalError("حدث خطأ أثناء إصلاح البيانات", error.message)
  }
}

