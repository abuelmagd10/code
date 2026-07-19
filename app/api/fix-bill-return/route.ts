import { NextResponse } from "next/server"

/**
 * v3.74.733 — RETIRED. This endpoint destroyed accounting records instead of
 * reversing them.
 *
 * What it did, on a bill identified only by its number:
 *   - hard DELETE of every journal_entry_lines row, then the journal_entries
 *     themselves, for reference_type purchase_return and purchase_return_refund
 *   - hard DELETE of the matching inventory_transactions rows
 *   - reset every bill_items.returned_quantity to 0
 *   - forced the bill to status "paid", with the author's own comment beside it
 *     reading "أو الحالة المناسبة" — or whatever status is appropriate
 *
 * Three separate problems, any one disqualifying:
 *
 *  1. AUDIT TRAIL DESTROYED. Accounting corrections are made by posting a
 *     reversing entry, never by deleting the original. After this ran there was
 *     no record that the return had ever existed, and no trace of the deletion.
 *
 *  2. FIFO LEFT INCONSISTENT. reduce_fifo_lots_on_purchase_return records rows
 *     in fifo_lot_consumptions. Deleting the inventory transactions leaves those
 *     consumption rows pointing at movements that no longer exist, so lots and
 *     ledger disagree with nothing to explain why.
 *
 *  3. STATUS GUESSED. Forcing "paid" marks a bill as settled regardless of what
 *     was actually paid. The comment admits the value is a guess.
 *
 * A repair tool has to leave the books more explicable than it found them. This
 * one erased the evidence.
 *
 * A correct version would post reversing entries, call the FIFO restore path,
 * and recompute status from the payments — it would not be this file with a
 * patch, so the file is closed rather than edited.
 */
export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error:
        "أداة إصلاح مرتجع فاتورة المشتريات موقوفة. كانت تحذف القيود المحاسبية وحركات المخزون " +
        "نهائياً بدل عكسها، فتمحو أثر العملية من الدفاتر، وتترك دفعات FIFO معلّقة، " +
        "وتفرض حالة «مدفوعة» على الفاتورة دون التحقق من السداد.",
      retired_in: "3.74.733",
    },
    { status: 410 }
  )
}
