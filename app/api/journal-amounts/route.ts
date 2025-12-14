import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { secureApiRequest } from "@/lib/api-security"
import { apiError, apiSuccess, HTTP_STATUS, internalError } from "@/lib/api-error-handler"

export async function GET(req: NextRequest) {
  try {
    // === تحصين أمني: استخدام secureApiRequest ===
    const { user, companyId, member, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: false, // لا يتطلب company لأن ids قد تكون من شركات مختلفة (للتحقق فقط)
      requirePermission: { resource: "journal_entries", action: "read" }
    })

    if (error) return error
    // === نهاية التحصين الأمني ===

    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!url || !serviceKey) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في إعدادات الخادم", "Server configuration error")
    }
    const admin = createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } })

    const { searchParams } = new URL(req.url)
    const idsParam = String(searchParams.get("ids") || "")
    const ids = idsParam.split(",").map(s => s.trim()).filter(Boolean)
    if (ids.length === 0) return apiSuccess([])

    const { data, error: dbError } = await admin
      .from("journal_entry_lines")
      .select("journal_entry_id, debit_amount, credit_amount, chart_of_accounts!inner(sub_type)")
      .in("journal_entry_id", ids)

    if (dbError) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في جلب بيانات القيود", dbError.message)
    }

    const sumDebit: Record<string, number> = {}
    const sumCredit: Record<string, number> = {}
    const netCash: Record<string, number> = {}
    for (const l of data || []) {
      const eid = String((l as any).journal_entry_id)
      const d = Number((l as any).debit_amount || 0)
      const c = Number((l as any).credit_amount || 0)
      sumDebit[eid] = (sumDebit[eid] || 0) + d
      sumCredit[eid] = (sumCredit[eid] || 0) + c
      const st = String(((l as any).chart_of_accounts || {}).sub_type || '').toLowerCase()
      if (st === 'cash' || st === 'bank') {
        netCash[eid] = (netCash[eid] || 0) + (d - c)
      }
    }
    const allIds = Array.from(new Set([...(data || []).map((l: any) => String(l.journal_entry_id))]))
    const result = allIds.map((eid) => {
      const cashDelta = Number(netCash[eid] || 0)
      if (cashDelta !== 0) return { journal_entry_id: eid, amount: cashDelta, basis: 'cash' }
      const debit = Number(sumDebit[eid] || 0)
      const credit = Number(sumCredit[eid] || 0)
      const unsigned = Math.max(debit, credit)
      return { journal_entry_id: eid, amount: unsigned, basis: 'unsigned' }
    })
    return apiSuccess(result)
  } catch (e: any) {
    return internalError("حدث خطأ أثناء جلب مبالغ القيود", e?.message)
  }
}
