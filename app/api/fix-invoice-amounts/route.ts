// API route to fix invoice amounts after return
// This bypasses the trigger by using a special update approach

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function POST(request: NextRequest) {
  try {
    const { invoice_id } = await request.json()
    
    if (!invoice_id) {
      return NextResponse.json({ error: "invoice_id is required" }, { status: 400 })
    }

    // Create admin client that bypasses RLS
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    // Get invoice details
    const { data: invoice, error: fetchError } = await supabaseAdmin
      .from("invoices")
      .select("id, invoice_number, subtotal, total_amount, returned_amount, original_total, status, return_status")
      .eq("id", invoice_id)
      .single()

    if (fetchError || !invoice) {
      return NextResponse.json({ error: "Invoice not found", details: fetchError }, { status: 404 })
    }

    const returnedAmount = Number(invoice.returned_amount || 0)
    const originalTotal = Number(invoice.original_total || invoice.total_amount || 0)
    
    // Calculate new values
    const newSubtotal = Math.max(0, originalTotal - returnedAmount)
    const newTotal = Math.max(0, originalTotal - returnedAmount)

    console.log("Fixing invoice:", {
      invoice_number: invoice.invoice_number,
      original_total: originalTotal,
      returned_amount: returnedAmount,
      new_subtotal: newSubtotal,
      new_total: newTotal
    })

    // Use raw SQL to bypass trigger (requires exec_sql function or direct access)
    // Alternative: temporarily disable trigger, update, re-enable
    
    // Try direct update with the corrected trigger (if it allows decreases)
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("invoices")
      .update({
        subtotal: newSubtotal,
        total_amount: newTotal,
        notes: `[AUTO-FIX ${new Date().toISOString().slice(0, 10)}] تصحيح قيم الفاتورة بعد المرتجع`
      })
      .eq("id", invoice_id)
      .select()
      .single()

    if (updateError) {
      // If trigger blocks, return error with instructions
      return NextResponse.json({
        error: "Cannot update invoice - blocked by trigger",
        details: updateError.message,
        solution: "يجب تعديل الـ trigger في Supabase Dashboard لتسمح بتخفيض القيم عند المرتجعات",
        sql_to_run: `
-- تعطيل الـ trigger مؤقتاً
DROP TRIGGER IF EXISTS trg_prevent_invoice_edit_after_journal ON invoices;

-- تحديث الفاتورة
UPDATE invoices 
SET subtotal = ${newSubtotal}, 
    total_amount = ${newTotal}
WHERE id = '${invoice_id}';

-- إعادة تفعيل الـ trigger (مع الإصلاح)
CREATE OR REPLACE FUNCTION prevent_invoice_edit_after_journal()
RETURNS TRIGGER AS $fn$
DECLARE has_journal BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM journal_entries WHERE reference_type IN ('invoice', 'invoice_payment', 'invoice_cogs') AND reference_id = NEW.id) INTO has_journal;
  IF has_journal THEN
    IF (OLD.invoice_number IS DISTINCT FROM NEW.invoice_number OR OLD.customer_id IS DISTINCT FROM NEW.customer_id OR OLD.invoice_date IS DISTINCT FROM NEW.invoice_date OR OLD.due_date IS DISTINCT FROM NEW.due_date) THEN
      RAISE EXCEPTION 'Cannot edit core invoice data after journal entries';
    END IF;
    IF (NEW.subtotal > OLD.subtotal OR NEW.total_amount > OLD.total_amount) THEN
      RAISE EXCEPTION 'Cannot increase invoice values after journal entries';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_invoice_edit_after_journal BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION prevent_invoice_edit_after_journal();
`
      }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      message: `تم تصحيح الفاتورة ${invoice.invoice_number}`,
      before: { subtotal: invoice.subtotal, total_amount: invoice.total_amount },
      after: { subtotal: newSubtotal, total_amount: newTotal }
    })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
