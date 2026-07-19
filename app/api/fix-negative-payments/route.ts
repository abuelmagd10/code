import { NextResponse } from "next/server"

/**
 * v3.74.733 — RETIRED. This endpoint wrote across every company in the database.
 *
 * What it did:
 *   const { error: authError } = await requireOwnerOrAdmin(req)   // companyId DISCARDED
 *   supabase.from("payments").select("*").lt("amount", 0)         // NO company filter
 *
 * It then took company_id from each PAYMENT ROW rather than from the caller's
 * session, created sales returns, and deleted the payments — using the service
 * role, so RLS never applied.
 *
 * An owner or admin of any single company pressing this button rewrote the
 * payment history of EVERY tenant in the system. The permission check confirmed
 * they were an owner somewhere; it never constrained what they touched.
 *
 * Compare app/api/inspect-negative-payments/route.ts, the read-only twin of
 * this file: it keeps companyId from requireOwnerOrAdmin and applies
 * .eq("company_id", companyId). Same feature, one line apart — the safe one
 * only reads, the destructive one is the one missing the filter.
 *
 * Beyond scoping, the repair itself is pre-FIFO: it creates returns without
 * consuming or restoring FIFO lots, so batches and ledger diverge.
 *
 * GET-side diagnosis remains available and company-scoped at
 * /api/inspect-negative-payments.
 */
export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error:
        "أداة تصحيح المدفوعات السالبة موقوفة. كانت تعمل على مدفوعات كل الشركات " +
        "بلا تقييد بشركة المستخدم، وتحذف مدفوعات وتُنشئ مرتجعات بمنطق سابق لنظام FIFO. " +
        "للفحص فقط استخدم /api/inspect-negative-payments.",
      retired_in: "3.74.733",
      read_only_alternative: "/api/inspect-negative-payments",
    },
    { status: 410 }
  )
}
