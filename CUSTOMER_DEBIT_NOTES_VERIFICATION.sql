-- =============================================
-- Customer Debit Notes - Verification Queries
-- إشعارات مدين العملاء - استعلامات التحقق
-- =============================================

-- 1️⃣ Verify table structure
SELECT 
  'customer_debit_notes' as table_name,
  COUNT(*) as total_records,
  COUNT(DISTINCT company_id) as companies,
  COUNT(DISTINCT customer_id) as customers,
  SUM(total_amount) as total_debit_amount,
  SUM(applied_amount) as total_applied,
  SUM(total_amount - applied_amount) as total_remaining
FROM customer_debit_notes;

-- 2️⃣ Verify debit notes by status
SELECT 
  status,
  COUNT(*) as count,
  SUM(total_amount) as total_amount,
  SUM(applied_amount) as applied_amount,
  SUM(total_amount - applied_amount) as remaining_amount
FROM customer_debit_notes
GROUP BY status
ORDER BY status;

-- 3️⃣ Verify debit notes by reference type
SELECT 
  reference_type,
  COUNT(*) as count,
  SUM(total_amount) as total_amount,
  AVG(total_amount) as avg_amount
FROM customer_debit_notes
GROUP BY reference_type
ORDER BY count DESC;

-- 4️⃣ Verify debit notes with journal entries
SELECT 
  COUNT(*) as total_debit_notes,
  COUNT(journal_entry_id) as with_journal_entry,
  COUNT(*) - COUNT(journal_entry_id) as without_journal_entry,
  ROUND(COUNT(journal_entry_id)::DECIMAL / NULLIF(COUNT(*), 0) * 100, 2) as percentage_with_journal
FROM customer_debit_notes;

-- 5️⃣ Verify debit note items
SELECT 
  cdn.debit_note_number,
  cdn.customer_id,
  c.name as customer_name,
  COUNT(cdni.id) as item_count,
  SUM(cdni.line_total) as items_subtotal,
  cdn.subtotal as debit_note_subtotal,
  CASE 
    WHEN ABS(SUM(cdni.line_total) - cdn.subtotal) < 0.01 THEN '✅ Match'
    ELSE '❌ Mismatch'
  END as validation
FROM customer_debit_notes cdn
LEFT JOIN customer_debit_note_items cdni ON cdn.id = cdni.customer_debit_note_id
LEFT JOIN customers c ON cdn.customer_id = c.id
GROUP BY cdn.id, cdn.debit_note_number, cdn.customer_id, c.name, cdn.subtotal
ORDER BY cdn.debit_note_date DESC;

-- 6️⃣ Verify applied amounts match applications
SELECT 
  cdn.debit_note_number,
  cdn.total_amount,
  cdn.applied_amount as recorded_applied,
  COALESCE(SUM(cdna.amount_applied), 0) as calculated_applied,
  CASE 
    WHEN ABS(cdn.applied_amount - COALESCE(SUM(cdna.amount_applied), 0)) < 0.01 THEN '✅ Match'
    ELSE '❌ Mismatch'
  END as validation
FROM customer_debit_notes cdn
LEFT JOIN customer_debit_note_applications cdna ON cdn.id = cdna.customer_debit_note_id
GROUP BY cdn.id, cdn.debit_note_number, cdn.total_amount, cdn.applied_amount
HAVING ABS(cdn.applied_amount - COALESCE(SUM(cdna.amount_applied), 0)) >= 0.01
ORDER BY cdn.debit_note_date DESC;

-- 7️⃣ Verify status consistency
SELECT 
  debit_note_number,
  total_amount,
  applied_amount,
  status,
  CASE 
    WHEN applied_amount >= total_amount AND status = 'applied' THEN '✅ Correct'
    WHEN applied_amount > 0 AND applied_amount < total_amount AND status = 'partially_applied' THEN '✅ Correct'
    WHEN applied_amount = 0 AND status = 'open' THEN '✅ Correct'
    ELSE '❌ Incorrect'
  END as status_validation
FROM customer_debit_notes
WHERE status != 'cancelled'
ORDER BY debit_note_date DESC;

-- 8️⃣ Verify journal entry balance
SELECT 
  cdn.debit_note_number,
  cdn.total_amount,
  je.id as journal_entry_id,
  SUM(jel.debit_amount) as total_debit,
  SUM(jel.credit_amount) as total_credit,
  SUM(jel.debit_amount) - SUM(jel.credit_amount) as balance,
  CASE 
    WHEN ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) < 0.01 THEN '✅ Balanced'
    ELSE '❌ Unbalanced'
  END as validation
FROM customer_debit_notes cdn
INNER JOIN journal_entries je ON cdn.journal_entry_id = je.id
INNER JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
GROUP BY cdn.id, cdn.debit_note_number, cdn.total_amount, je.id
HAVING ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) >= 0.01;

-- 9️⃣ Verify debit notes per customer
SELECT 
  c.name as customer_name,
  COUNT(cdn.id) as debit_note_count,
  SUM(cdn.total_amount) as total_debited,
  SUM(cdn.applied_amount) as total_applied,
  SUM(cdn.total_amount - cdn.applied_amount) as total_outstanding
FROM customers c
LEFT JOIN customer_debit_notes cdn ON c.id = cdn.customer_id
WHERE cdn.status != 'cancelled' OR cdn.id IS NULL
GROUP BY c.id, c.name
HAVING COUNT(cdn.id) > 0
ORDER BY total_outstanding DESC;

-- 🔟 Verify debit notes per invoice
SELECT 
  i.invoice_number,
  c.name as customer_name,
  i.total_amount as invoice_amount,
  COUNT(cdn.id) as debit_note_count,
  SUM(cdn.total_amount) as total_additional_charges,
  ROUND((SUM(cdn.total_amount) / NULLIF(i.total_amount, 0) * 100), 2) as percentage_of_invoice
FROM invoices i
LEFT JOIN customer_debit_notes cdn ON i.id = cdn.source_invoice_id
LEFT JOIN customers c ON i.customer_id = c.id
WHERE cdn.status != 'cancelled' OR cdn.id IS NULL
GROUP BY i.id, i.invoice_number, c.name, i.total_amount
HAVING COUNT(cdn.id) > 0
ORDER BY total_additional_charges DESC;

-- 1️⃣1️⃣ Check for orphaned records
SELECT 'Orphaned debit note items' as issue, COUNT(*) as count
FROM customer_debit_note_items cdni
WHERE NOT EXISTS (
  SELECT 1 FROM customer_debit_notes cdn WHERE cdn.id = cdni.customer_debit_note_id
)
UNION ALL
SELECT 'Orphaned applications' as issue, COUNT(*) as count
FROM customer_debit_note_applications cdna
WHERE NOT EXISTS (
  SELECT 1 FROM customer_debit_notes cdn WHERE cdn.id = cdna.customer_debit_note_id
);

-- 1️⃣2️⃣ Verify multi-currency debit notes
SELECT 
  debit_note_number,
  original_currency,
  original_total_amount,
  exchange_rate,
  total_amount as base_currency_amount,
  CASE 
    WHEN ABS(original_total_amount * exchange_rate - total_amount) < 0.01 THEN '✅ Correct'
    ELSE '❌ Incorrect'
  END as currency_validation
FROM customer_debit_notes
WHERE original_currency != 'EGP'
ORDER BY debit_note_date DESC;

-- 1️⃣3️⃣ Summary Report
SELECT 
  '📊 Total Debit Notes' as metric,
  COUNT(*)::TEXT as value
FROM customer_debit_notes
UNION ALL
SELECT '💰 Total Amount', TO_CHAR(SUM(total_amount), 'FM999,999,999.00')
FROM customer_debit_notes
UNION ALL
SELECT '✅ Applied Amount', TO_CHAR(SUM(applied_amount), 'FM999,999,999.00')
FROM customer_debit_notes
UNION ALL
SELECT '⏳ Outstanding Amount', TO_CHAR(SUM(total_amount - applied_amount), 'FM999,999,999.00')
FROM customer_debit_notes
WHERE status != 'cancelled';

