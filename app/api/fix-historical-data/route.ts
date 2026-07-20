import { NextResponse } from "next/server"

/**
 * v3.74.759 — retired.
 *
 * This route called fix_historical_cogs(p_company_id), which was dropped in
 * v3.74.726 for costing COGS from products.cost_price instead of FIFO lots.
 * Since that release it has been returning an error on every use: the RPC
 * resolved to nothing and the catch block reported a failure.
 *
 * That is the part worth recording. In v3.74.726 I dropped the function after
 * finding one caller, and never searched for the others. This route was live
 * and broken for thirty-three releases, and nothing surfaced it — no test
 * covered it, and a settings button that errors looks like a settings button
 * the owner has not pressed.
 *
 * v3.74.759 also dropped three siblings that survived the same sweep:
 *
 *   fix_all_historical_cogs()  looped every company in the database
 *   fix_cogs_clean()           looped every paid invoice, no company filter
 *   recalculate_cogs()         the same, with no "already posted" check at all,
 *                              so each run added another COGS entry per invoice
 *
 * All three were SECURITY DEFINER with EXECUTE granted to anon — reachable from
 * PostgREST without logging in, and unaffected by row-level security.
 *
 * There is no replacement, deliberately. Historical movements predating FIFO
 * cannot be repaired by a button: a correct fix has to consume the right lots
 * in the right order, and getting that wrong silently misstates gross profit.
 * The read-only diagnostic at GET /api/fix-cogs-accounting lists the affected
 * movements without touching them.
 */

const RETIRED_MESSAGE =
  "أداة تصحيح البيانات القديمة موقوفة. كانت تستدعى دالة أُلغيت فى الإصدار 3.74.726 " +
  "لأنها تحتسب التكلفة من بطاقة المنتج بدل دفعات FIFO. " +
  "الحركات القديمة لا تُصحَّح بزر — راجع تقرير /api/fix-cogs-accounting للاطلاع عليها دون تعديل."

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error: RETIRED_MESSAGE,
      retired_in: "3.74.759",
      broken_since: "3.74.726",
      diagnostic: "GET /api/fix-cogs-accounting",
    },
    { status: 410 }
  )
}
