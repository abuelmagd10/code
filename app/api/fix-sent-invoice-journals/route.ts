import { NextRequest, NextResponse } from "next/server"
import { requireOwnerOrAdmin } from "@/lib/api-security"
import { unauthorizedError } from "@/lib/api-error-handler"

/**
 * v3.74.773 — retired. Same class of tool as repair-invoice, retired alongside it.
 *
 * Four functions here — createSalesJournal, createPaymentJournal,
 * createSalesReturnJournal, createPurchaseReturnJournal — each inserted a
 * journal_entries header and then inserted its lines WITHOUT checking the
 * result. supabase-js does not throw on a failed write, so a rejected line
 * insert produced a posted header with zero lines: a journal entry that exists,
 * carries a reference, and moves nothing.
 *
 * Several of those functions then `return true` unconditionally, so the batch
 * report counted the invoice as repaired either way. deleteWrongEntriesForSentInvoice
 * discarded its delete result too, which could remove headers while leaving
 * their lines behind.
 *
 * Like repair-invoice, it computed COGS from products.cost_price instead of
 * FIFO lots.
 *
 * No caller in the application. The integration tests only assert that
 * unauthenticated requests are rejected, and that still holds: authentication
 * runs before the 410 below.
 *
 * The correct treatment for an invoice with a wrong or missing journal is a
 * reversal followed by a normal re-post — not a bulk rewriter that reports
 * success it cannot verify.
 */

const RETIRED_MESSAGE =
  "أداة إصلاح قيود الفواتير المرسلة موقوفة. كانت تُنشئ رأس القيد ثم تُدخل سطوره دون فحص النتيجة، " +
  "فينشأ قيد بلا سطور — موجود فى الدفتر ولا يُحرّك شيئاً — والأداة تعدّه «مُصلَحاً». " +
  "وكانت تحتسب التكلفة من بطاقة المنتج بدل دفعات FIFO. " +
  "القيد الخاطئ يُعالَج بعكسه وإعادة ترحيله عبر المسار الطبيعى."

async function retired(request: NextRequest) {
  // Authentication first — the security contract is unchanged by retirement.
  const { user, companyId, error } = await requireOwnerOrAdmin(request)
  if (error) return error
  if (!user || !companyId) return unauthorizedError()

  return NextResponse.json(
    {
      success: false,
      error: RETIRED_MESSAGE,
      retired_in: "3.74.773",
      reason: "unchecked line inserts produce headers with no lines; COGS from cost_price",
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
