import { createClient } from "@supabase/supabase-js"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { secureApiRequest, serverError } from "@/lib/api-security-enhanced"
import { NextRequest, NextResponse } from "next/server"
import { badRequestError, apiSuccess } from "@/lib/api-error-handler"

/**
 * v3.74.726 — the WRITE side of this tool is retired.
 *
 * It called fix_historical_cogs(), which has now been dropped. Three defects:
 *
 *  1. Cross-tenant write. The function was SECURITY DEFINER with EXECUTE to
 *     PUBLIC and took p_company_id from the caller with no membership check —
 *     so it was reachable straight from PostgREST, and this API's permission
 *     check protected nothing.
 *  2. Wrong cost. It valued COGS at products.cost_price, the editable snapshot
 *     abandoned in v3.74.702 because it inflates profit.
 *  3. Lots and ledger diverged. It posted the journal without consuming FIFO
 *     lots, so batches still showed stock the ledger had already expensed.
 *
 * A repair tool that corrupts the thing it repairs is worse than no tool. The
 * gap it was written for is closed anyway: auto_create_cogs_journal posts COGS
 * from FIFO on every sale.
 *
 * GET survives as a read-only diagnostic. It writes nothing.
 */

const RETIRED_MESSAGE =
  "أداة تصحيح COGS موقوفة. كانت تحتسب التكلفة من بطاقة المنتج بدل دفعات FIFO، " +
  "فتُنشئ قيوداً بتكلفة خاطئة وتترك الدفعات غير مستهلكة. " +
  "النظام الآن يُسجل COGS من FIFO تلقائياً عند كل عملية بيع، فلا حاجة إليها."

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error: RETIRED_MESSAGE,
      retired_in: "3.74.726",
      superseded_by: "auto_create_cogs_journal + consume_fifo_lots",
    },
    { status: 410 }
  )
}

/**
 * Read-only check: sale movements carrying no COGS journal.
 *
 * v3.74.726 — dropped the old `cost_price > 0` condition. It hid exactly the
 * movements worth seeing: a product whose card reads 0 but whose FIFO lots hold
 * a real cost was silently reported as healthy.
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

    const { data: salesWithoutCOGS } = await supabase
      .from("inventory_transactions")
      .select("id, reference_id, quantity_change, products(item_type)")
      .eq("company_id", companyId)
      .eq("transaction_type", "sale")
      .is("journal_entry_id", null)

    const needsAttention = (salesWithoutCOGS || []).filter(
      (t: any) => t.products?.item_type !== "service"
    )

    return apiSuccess({
      status: needsAttention.length === 0
        ? "✅ كل حركات البيع لها قيد تكلفة"
        : "⚠️ توجد حركات بيع بلا قيد تكلفة",
      sales_without_cogs: needsAttention.length,
      needs_fix: needsAttention.length > 0,
      tool_retired: true,
      recommendation:
        needsAttention.length > 0
          ? "هذه حركات قديمة سابقة لنظام FIFO. لا تُصلَح بزر — تحتاج معالجة مدروسة تستهلك دفعات FIFO الصحيحة. راجعها قبل أى إجراء."
          : "لا يوجد ما يستدعى إجراءً."
    })
  } catch (error: any) {
    console.error("Check COGS status error:", error)
    return serverError(`حدث خطأ أثناء فحص النظام: ${error?.message}`)
  }
}
