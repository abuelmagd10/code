# 🛠️ Customer Debit Notes - Useful Commands
# أوامر مفيدة - إشعارات مدين العملاء

## 📋 Quick Reference

### Installation
```bash
# Run all scripts in order
psql -f scripts/096_customer_debit_notes_schema.sql
psql -f scripts/097_customer_debit_notes_functions.sql
psql -f scripts/098_create_customer_debit_note_function.sql
psql -f scripts/099_customer_debit_notes_guards.sql
```

### Verification
```bash
# Quick health check
psql -f customer_debit_notes_quick_check.sql

# Comprehensive verification
psql -f CUSTOMER_DEBIT_NOTES_VERIFICATION.sql
```

---

## 🔍 Query Commands

### 1. View All Debit Notes
```sql
SELECT 
  debit_note_number,
  debit_note_date,
  c.name as customer,
  i.invoice_number,
  total_amount,
  applied_amount,
  status,
  reference_type
FROM customer_debit_notes cdn
JOIN customers c ON cdn.customer_id = c.id
JOIN invoices i ON cdn.source_invoice_id = i.id
ORDER BY debit_note_date DESC
LIMIT 50;
```

### 2. View Open Debit Notes
```sql
SELECT 
  debit_note_number,
  c.name as customer,
  total_amount,
  applied_amount,
  total_amount - applied_amount as remaining,
  debit_note_date
FROM customer_debit_notes cdn
JOIN customers c ON cdn.customer_id = c.id
WHERE status IN ('open', 'partially_applied')
ORDER BY debit_note_date;
```

### 3. View Debit Notes for Specific Customer
```sql
SELECT 
  debit_note_number,
  debit_note_date,
  i.invoice_number,
  reference_type,
  reason,
  total_amount,
  status
FROM customer_debit_notes cdn
JOIN invoices i ON cdn.source_invoice_id = i.id
WHERE customer_id = 'customer-uuid-here'
ORDER BY debit_note_date DESC;
```

### 4. View Debit Note Details with Items
```sql
SELECT 
  cdn.debit_note_number,
  cdn.debit_note_date,
  c.name as customer,
  cdni.description,
  cdni.quantity,
  cdni.unit_price,
  cdni.tax_rate,
  cdni.line_total,
  cdni.item_type
FROM customer_debit_notes cdn
JOIN customers c ON cdn.customer_id = c.id
JOIN customer_debit_note_items cdni ON cdn.id = cdni.customer_debit_note_id
WHERE cdn.debit_note_number = 'FOO-DN-0001'
ORDER BY cdni.created_at;
```

### 5. View Debit Note Applications
```sql
SELECT 
  cdn.debit_note_number,
  cdna.applied_to_type,
  cdna.amount_applied,
  cdna.applied_date,
  cdna.notes
FROM customer_debit_note_applications cdna
JOIN customer_debit_notes cdn ON cdna.customer_debit_note_id = cdn.id
WHERE cdn.debit_note_number = 'FOO-DN-0001'
ORDER BY cdna.applied_date;
```

### 6. View Debit Notes with Journal Entries
```sql
SELECT 
  cdn.debit_note_number,
  cdn.total_amount,
  je.entry_date,
  je.description,
  SUM(jel.debit_amount) as total_debit,
  SUM(jel.credit_amount) as total_credit
FROM customer_debit_notes cdn
JOIN journal_entries je ON cdn.journal_entry_id = je.id
JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
GROUP BY cdn.id, cdn.debit_note_number, cdn.total_amount, je.entry_date, je.description
ORDER BY je.entry_date DESC;
```

---

## 📊 Summary Reports

### 7. Debit Notes by Status
```sql
SELECT 
  status,
  COUNT(*) as count,
  SUM(total_amount) as total,
  SUM(applied_amount) as applied,
  SUM(total_amount - applied_amount) as outstanding
FROM customer_debit_notes
GROUP BY status
ORDER BY status;
```

### 8. Debit Notes by Reference Type
```sql
SELECT 
  reference_type,
  COUNT(*) as count,
  SUM(total_amount) as total_amount,
  AVG(total_amount) as avg_amount
FROM customer_debit_notes
GROUP BY reference_type
ORDER BY total_amount DESC;
```

### 9. Debit Notes by Customer (Top 10)
```sql
SELECT 
  c.name as customer,
  COUNT(cdn.id) as debit_note_count,
  SUM(cdn.total_amount) as total_debited,
  SUM(cdn.applied_amount) as total_applied,
  SUM(cdn.total_amount - cdn.applied_amount) as outstanding
FROM customers c
JOIN customer_debit_notes cdn ON c.id = cdn.customer_id
WHERE cdn.status != 'cancelled'
GROUP BY c.id, c.name
ORDER BY total_debited DESC
LIMIT 10;
```

### 10. Monthly Debit Notes Summary
```sql
SELECT 
  DATE_TRUNC('month', debit_note_date) as month,
  COUNT(*) as count,
  SUM(total_amount) as total_amount
FROM customer_debit_notes
WHERE debit_note_date >= CURRENT_DATE - INTERVAL '12 months'
GROUP BY DATE_TRUNC('month', debit_note_date)
ORDER BY month DESC;
```

---

## 🔧 Maintenance Commands

### 11. Find Debit Notes Without Journal Entries
```sql
SELECT 
  debit_note_number,
  debit_note_date,
  total_amount,
  status
FROM customer_debit_notes
WHERE journal_entry_id IS NULL
  AND status != 'cancelled'
ORDER BY debit_note_date;
```

### 12. Find Mismatched Totals
```sql
SELECT 
  cdn.debit_note_number,
  cdn.subtotal as recorded_subtotal,
  SUM(cdni.line_total) as calculated_subtotal,
  cdn.subtotal - SUM(cdni.line_total) as difference
FROM customer_debit_notes cdn
LEFT JOIN customer_debit_note_items cdni ON cdn.id = cdni.customer_debit_note_id
GROUP BY cdn.id, cdn.debit_note_number, cdn.subtotal
HAVING ABS(cdn.subtotal - COALESCE(SUM(cdni.line_total), 0)) >= 0.01;
```

### 13. Find Mismatched Applied Amounts
```sql
SELECT 
  cdn.debit_note_number,
  cdn.applied_amount as recorded_applied,
  COALESCE(SUM(cdna.amount_applied), 0) as calculated_applied,
  cdn.applied_amount - COALESCE(SUM(cdna.amount_applied), 0) as difference
FROM customer_debit_notes cdn
LEFT JOIN customer_debit_note_applications cdna ON cdn.id = cdna.customer_debit_note_id
GROUP BY cdn.id, cdn.debit_note_number, cdn.applied_amount
HAVING ABS(cdn.applied_amount - COALESCE(SUM(cdna.amount_applied), 0)) >= 0.01;
```

---

## 🎯 Common Tasks

### 14. Create Simple Debit Note (Shipping Fee)
```sql
SELECT * FROM create_customer_debit_note(
  p_company_id := 'your-company-uuid',
  p_branch_id := 'your-branch-uuid',
  p_cost_center_id := NULL,
  p_customer_id := 'customer-uuid',
  p_source_invoice_id := 'invoice-uuid',
  p_debit_note_date := CURRENT_DATE,
  p_reference_type := 'additional_fees',
  p_reason := 'Additional shipping charges',
  p_items := '[
    {
      "description": "Express shipping",
      "quantity": 1,
      "unit_price": 100.00,
      "tax_rate": 14,
      "item_type": "charge"
    }
  ]'::jsonb
);
```

### 15. Apply Debit Note to Invoice
```sql
INSERT INTO customer_debit_note_applications (
  company_id,
  customer_debit_note_id,
  applied_to_type,
  applied_to_id,
  amount_applied,
  notes
) VALUES (
  'company-uuid',
  'debit-note-uuid',
  'invoice',
  'invoice-uuid',
  100.00,
  'Applied to invoice'
);
```

### 16. Cancel Debit Note
```sql
UPDATE customer_debit_notes
SET 
  status = 'cancelled',
  notes = COALESCE(notes || E'\n', '') || 'Cancelled on ' || CURRENT_DATE::TEXT
WHERE debit_note_number = 'FOO-DN-0001'
  AND applied_amount = 0
  AND journal_entry_id IS NULL;
```

---

## 📈 Analytics

### 17. Customer AR Impact
```sql
SELECT 
  c.name as customer,
  SUM(i.total_amount) as total_invoiced,
  SUM(cdn.total_amount) as total_debit_notes,
  SUM(i.total_amount) + SUM(cdn.total_amount) as total_ar
FROM customers c
LEFT JOIN invoices i ON c.id = i.customer_id
LEFT JOIN customer_debit_notes cdn ON c.id = cdn.customer_id AND cdn.status != 'cancelled'
GROUP BY c.id, c.name
HAVING SUM(cdn.total_amount) > 0
ORDER BY total_debit_notes DESC;
```

---

**Quick Tips:**
- Always verify with `customer_debit_notes_quick_check.sql` after changes
- Use `reference_type` to categorize debit notes
- Check journal entries are balanced
- Monitor outstanding amounts regularly

