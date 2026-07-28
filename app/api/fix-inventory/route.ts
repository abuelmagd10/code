import { NextRequest, NextResponse } from "next/server"
import { requireOwnerOrAdmin } from "@/lib/api-security"

/**
 * v3.74.875 — retired. Same family as repair-invoice and
 * fix-sent-invoice-journals, retired in v3.74.773 for the same reason.
 *
 * This endpoint recomputed inventory movements for invoices and bills and
 * rewrote them: 725 lines, six writes, and among them these two —
 *
 *     await supabase.from("journal_entry_lines").delete().eq("journal_entry_id", cogsId)
 *     await supabase.from("journal_entries").delete().eq("id", cogsId)
 *
 * — deleting a COGS journal entry and its lines, with the result discarded.
 *
 * Two things make that unsafe rather than merely untidy:
 *
 *   1. The database refuses it. `prevent_posted_journal_modification` and
 *      `enforce_posted_entry_no_edit` block deleting a posted entry, and
 *      `enforce_je_integrity` blocks writing journal rows outside
 *      `create_journal_entry_atomic`. supabase-js does not throw on a
 *      rejected write, so every one of those refusals was swallowed and the
 *      endpoint carried on as though the repair had happened.
 *
 *   2. It was written before those protections existed. It is not broken by
 *      a bug; it is built for a database that no longer works that way.
 *
 * And measured against production on 2026-07-28 it had nothing to do:
 *
 *     invoices in sent/paid state with no inventory movement ....... 1
 *     of which service-only (no stock is CORRECT for these) ........ 1
 *     ⇒ genuine cases .............................................. 0
 *
 * The one candidate is a service invoice — one service line, no products.
 * An invoice with no goods on it has no goods to move. The endpoint itself
 * excluded services in eight separate places, so it knew that too.
 *
 * Nothing in the application called it: no page, no component, no other
 * route. The only references were integration tests asserting it rejects
 * unauthenticated callers and returns the standard error shape, and both
 * contracts are preserved below — authentication is checked FIRST, so an
 * anonymous request still receives 401 rather than 410.
 *
 * There is no replacement, deliberately. Inventory that disagrees with the
 * ledger is surfaced by `scripts/check-ledger-integrity.js` on every release
 * (inventory vs FIFO is one of its nine checks), and a real divergence is
 * corrected by a documented adjustment through the normal path — not by a
 * tool that rewrites movements in place and reports success either way.
 */

const RETIRED_MESSAGE =
  "أداة إصلاح المخزون موقوفة. كانت تحذف قيد التكلفة وسطوره ثم تُعيد بناء الحركات دون فحص نتيجة الكتابة — " +
  "والقاعدة ترفض حذف قيدٍ مُرحَّل أصلاً، فكان الرفض يُبتلع وتُعلن الأداة النجاح. " +
  "وقياس الإنتاج لم يجد لها حالةً واحدة تعمل عليها: الفاتورة الوحيدة بلا حركة مخزون فاتورةُ خدمةٍ، ولا مخزون للخدمة. " +
  "واختلاف المخزون عن الدفاتر يرصده فحص سلامة الدفاتر فى كل نشر، ويُعالَج بتسويةٍ موثَّقة عبر المسار الطبيعى."

async function retired(request: NextRequest) {
  // Authentication first: the security contract must not change just because
  // the feature is gone. An unauthenticated caller still gets 401, which is
  // what tests/integration/api-security.test.ts asserts.
  const { error } = await requireOwnerOrAdmin(request)
  if (error) return error

  return NextResponse.json(
    {
      success: false,
      error: RETIRED_MESSAGE,
      retired_in: "3.74.875",
      reason: "unchecked delete of a posted COGS entry; the database refuses it and the refusal was swallowed",
      diagnostic: "node scripts/check-ledger-integrity.js --require-db",
    },
    { status: 410 }
  )
}

export async function GET(request: NextRequest) {
  return retired(request)
}

export async function POST(request: NextRequest) {
  return retired(request)
}
