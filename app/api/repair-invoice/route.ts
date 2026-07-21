import { NextRequest, NextResponse } from "next/server"
import { requireOwnerOrAdmin } from "@/lib/api-security"

/**
 * v3.74.773 — retired.
 *
 * This endpoint deleted an invoice's journal lines and inventory movements and
 * rebuilt them from scratch. Eleven of those writes discarded their result:
 * seven journal_entry_lines inserts, one journal_entry_lines delete, and three
 * inventory_transactions writes.
 *
 * supabase-js does not throw on a failed write. So a failure part-way through
 * the rebuild left the invoice with its ledger lines DELETED AND NOT RECREATED,
 * and the endpoint returned 200. A repair tool that destroys the thing it
 * repairs, and reports success, is worse than no tool.
 *
 * It also valued COGS from products.cost_price rather than FIFO lots — the same
 * defect that caused four functions to be dropped in v3.74.726 and v3.74.759.
 *
 * Nothing in the application called it. The only references were integration
 * tests asserting that it rejects unauthenticated callers, and that contract is
 * preserved below: authentication is still checked first, so an anonymous
 * request still receives 401 rather than 410.
 *
 * There is no replacement, deliberately. An invoice whose ledger is wrong needs
 * a reversal entry and a re-post through the normal path, not a tool that
 * rewrites history in place. The read-only diagnostic at
 * GET /api/fix-cogs-accounting lists affected movements without touching them.
 */

const RETIRED_MESSAGE =
  "أداة إصلاح الفواتير موقوفة. كانت تحذف سطور القيد والمخزون ثم تُعيد بناءها دون فحص نتيجة الكتابة، " +
  "فإن فشلت فى المنتصف تُمحى قيود الفاتورة ولا تُستعاد — وتُرجع الأداة «نجاح». " +
  "كما كانت تحتسب التكلفة من بطاقة المنتج بدل دفعات FIFO. " +
  "الفاتورة الخاطئة تُعالَج بقيد عكسى وإعادة ترحيل عبر المسار الطبيعى، لا بإعادة كتابة التاريخ."

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
      retired_in: "3.74.773",
      reason: "unchecked delete-then-rebuild of ledger lines; COGS from cost_price",
      diagnostic: "GET /api/fix-cogs-accounting",
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
