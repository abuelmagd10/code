import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { requireOwnerOrAdmin } from "@/lib/api-security"
import { apiError, apiSuccess, HTTP_STATUS } from "@/lib/api-error-handler"

/**
 * API لإصلاح مرتجع فاتورة مشتريات خاطئ
 * يحذف القيود المحاسبية وحركات المخزون الخاطئة ويعيد حالة الفاتورة
 */
export async function POST(req: NextRequest) {
  try {
    // التحقق من الصلاحيات
    const { user, companyId, error } = await requireOwnerOrAdmin(req)
    if (error) return error
    if (!user || !companyId) {
      return apiError(HTTP_STATUS.UNAUTHORIZED, "غير مصرح", "Unauthorized")
    }

    const body = await req.json()
    const { bill_number } = body

    if (!bill_number) {
      return apiError(HTTP_STATUS.BAD_REQUEST, "رقم الفاتورة مطلوب", "Bill number is required")
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!supabaseUrl || !serviceKey) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في إعدادات الخادم", "Server configuration error")
    }

    const admin = createClient(supabaseUrl, serviceKey, { global: { headers: { apikey: serviceKey } } })

    // 1. جلب الفاتورة
    const { data: bill, error: billError } = await admin
      .from("bills")
      .select("*")
      .eq("company_id", companyId)
      .eq("bill_number", bill_number)
      .single()

    if (billError || !bill) {
      return apiError(HTTP_STATUS.NOT_FOUND, "الفاتورة غير موجودة", "Bill not found")
    }

    const results: any = {
      bill_id: bill.id,
      bill_number: bill.bill_number,
      deleted_entries: [],
      deleted_inventory_transactions: [],
      bill_restored: false
    }

    // 2. حذف القيود المحاسبية للمرتجعات
    const { data: returnEntries } = await admin
      .from("journal_entries")
      .select("id, description")
      .eq("company_id", companyId)
      .eq("reference_type", "purchase_return")
      .eq("reference_id", bill.id)

    if (returnEntries && returnEntries.length > 0) {
      for (const entry of returnEntries) {
        // حذف سطور القيد
        await admin
          .from("journal_entry_lines")
          .delete()
          .eq("journal_entry_id", entry.id)

        // حذف القيد نفسه
        await admin
          .from("journal_entries")
          .delete()
          .eq("id", entry.id)

        results.deleted_entries.push({
          id: entry.id,
          description: entry.description
        })
      }
    }

    // 3. حذف قيود استرداد المال
    const { data: refundEntries } = await admin
      .from("journal_entries")
      .select("id, description")
      .eq("company_id", companyId)
      .eq("reference_type", "purchase_return_refund")
      .eq("reference_id", bill.id)

    if (refundEntries && refundEntries.length > 0) {
      for (const entry of refundEntries) {
        await admin.from("journal_entry_lines").delete().eq("journal_entry_id", entry.id)
        await admin.from("journal_entries").delete().eq("id", entry.id)
        results.deleted_entries.push({ id: entry.id, description: entry.description })
      }
    }

    // 4. حذف حركات المخزون للمرتجعات
    const { data: returnTxs } = await admin
      .from("inventory_transactions")
      .select("id, product_id, quantity_change")
      .eq("company_id", companyId)
      .eq("transaction_type", "purchase_return")
      .eq("reference_id", bill.id)

    if (returnTxs && returnTxs.length > 0) {
      for (const tx of returnTxs) {
        await admin.from("inventory_transactions").delete().eq("id", tx.id)
        results.deleted_inventory_transactions.push(tx)
      }
    }

    // 5. إعادة تعيين حالة الفاتورة
    const { data: billItems } = await admin
      .from("bill_items")
      .select("id")
      .eq("bill_id", bill.id)

    // إعادة تعيين returned_quantity لجميع البنود
    if (billItems && billItems.length > 0) {
      for (const item of billItems) {
        await admin
          .from("bill_items")
          .update({ returned_quantity: 0 })
          .eq("id", item.id)
      }
    }

    // إعادة تعيين حالة الفاتورة
    const { error: updateError } = await admin
      .from("bills")
      .update({
        returned_amount: 0,
        return_status: null,
        status: "paid" // أو الحالة المناسبة
      })
      .eq("id", bill.id)

    if (!updateError) {
      results.bill_restored = true
    }

    return apiSuccess({
      message: "تم إصلاح الفاتورة بنجاح",
      messageEn: "Bill fixed successfully",
      results
    }, HTTP_STATUS.OK)

  } catch (e: any) {
    console.error("Error fixing bill return:", e)
    return apiError(
      HTTP_STATUS.INTERNAL_ERROR,
      "حدث خطأ أثناء إصلاح الفاتورة",
      e?.message || "Unknown error"
    )
  }
}

