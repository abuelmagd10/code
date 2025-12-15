// =============================================
// API: تطبيق إصلاح مشكلة إهلاك المخزون
// Apply Write-off Balance Fix
// =============================================
//
import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireOwnerOrAdmin } from "@/lib/api-security"
import { apiError, apiSuccess, HTTP_STATUS, internalError } from "@/lib/api-error-handler"

export async function POST(request: NextRequest) {
  try {
    // ✅ تحصين موحد: المالك أو الـ admin فقط يمكنه تشغيل هذا الإصلاح
    const { user, companyId, error } = await requireOwnerOrAdmin(request)
    if (error) return error

    if (!user || !companyId) {
      return internalError("خطأ غير متوقع في هوية المستخدم أو الشركة")
    }

    const supabase = await createClient()

    // تطبيق الإصلاح عبر RPC
    // ملاحظة: يجب أولاً تطبيق ملف scripts/apply_write_off_fix_function.sql في SQL Editor
    // لإنشاء الدالة apply_write_off_balance_fix()
    const { data, error: rpcError } = await supabase.rpc("apply_write_off_balance_fix")

    if (rpcError) {
      // إذا لم تكن الدالة موجودة، نعطي تعليمات
      if (rpcError.message.includes("function") || rpcError.message.includes("does not exist")) {
        return apiError(
          HTTP_STATUS.BAD_REQUEST,
          "الدالة غير موجودة. يجب تطبيق الإصلاح أولاً من SQL Editor",
          "Fix function is missing. Please apply it from SQL Editor first",
          {
            instructions: [
              "1. افتح Supabase Dashboard",
              "2. اذهب إلى Database → SQL Editor",
              "3. افتح ملف: scripts/apply_write_off_fix_function.sql",
              "4. انسخ المحتوى والصقه في SQL Editor",
              "5. اضغط Run",
              "6. ثم أعد المحاولة من هنا"
            ],
            file_path: "scripts/apply_write_off_fix_function.sql"
          }
        )
      }

      return internalError("فشل تنفيذ دالة إصلاح الإهلاك", {
        error: rpcError.message
      })
    }

    return apiSuccess({
      success: data?.success || false,
      message: data?.message || "تم تطبيق الإصلاح",
      changes: data?.changes,
      error: data?.error
    })

  } catch (error: any) {
    console.error("Apply fix error:", error)
    return internalError("حدث خطأ أثناء محاولة تطبيق الإصلاح", {
      error: error?.message || "unknown_error"
    })
  }
}


