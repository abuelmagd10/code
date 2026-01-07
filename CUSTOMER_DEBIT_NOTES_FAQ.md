# ❓ Customer Debit Notes - FAQ
# الأسئلة الشائعة - إشعارات مدين العملاء

## 📋 General Questions

### 1. What is a Customer Debit Note?
A Customer Debit Note is a document that **increases** the amount a customer owes. It's used when additional charges need to be added after an invoice has been issued.

**Example:** Customer ordered products for 1,000 EGP. Later, they requested express shipping for 100 EGP. A debit note is created for 100 EGP.

---

### 2. When should I use a Customer Debit Note?
Use it when:
- ✅ Price increased after invoice (customer agreed)
- ✅ Additional fees discovered (shipping, packaging)
- ✅ Penalties or late fees
- ✅ Corrections for undercharging
- ✅ Extra services provided

---

### 3. What's the difference between Debit Note and Credit Note?
- **Debit Note**: **Increases** customer balance (customer owes more)
- **Credit Note**: **Decreases** customer balance (customer owes less)

---

### 4. Can I modify an invoice instead of creating a Debit Note?
❌ **No!** Once an invoice is issued and has a journal entry, you should NOT modify it. Use a Debit Note instead to maintain proper audit trail.

---

## 🔧 Technical Questions

### 5. How do I create a Customer Debit Note?
```sql
SELECT * FROM create_customer_debit_note(
  p_company_id := 'company-uuid',
  p_customer_id := 'customer-uuid',
  p_source_invoice_id := 'invoice-uuid',
  p_reference_type := 'additional_fees',
  p_reason := 'Shipping charges',
  p_items := '[{"description": "Shipping", "quantity": 1, "unit_price": 100, "tax_rate": 14}]'::jsonb
);
```

---

### 6. What happens when I create a Debit Note?
1. ✅ Debit note record created
2. ✅ Items added
3. ✅ Totals calculated automatically
4. ✅ Journal entry created (Debit AR / Credit Revenue)
5. ✅ Customer balance increased

---

### 7. Can I delete a Debit Note?
- ✅ **Yes** - If it hasn't been applied and has no journal entry
- ❌ **No** - If it has been applied or has a journal entry

---

### 8. How do I apply a Debit Note to an invoice?
```sql
INSERT INTO customer_debit_note_applications (
  company_id,
  customer_debit_note_id,
  applied_to_type,
  applied_to_id,
  amount_applied
) VALUES (
  'company-uuid',
  'debit-note-uuid',
  'invoice',
  'invoice-uuid',
  100.00
);
```

---

### 9. What are the valid reference types?
- `price_difference` - Price increased after invoice
- `additional_fees` - Shipping, packaging, handling
- `penalty` - Late payment, contract penalties
- `correction` - Undercharging correction
- `service_charge` - Additional services
- `late_fee` - Late payment fees
- `shipping` - Shipping charges
- `other` - Other charges

---

### 10. Can I create a Debit Note in foreign currency?
✅ **Yes!** The system supports multi-currency:
```sql
SELECT * FROM create_customer_debit_note(
  -- ... other params ...
  p_currency_id := 'usd-currency-uuid',
  p_exchange_rate := 30.50
);
```

---

## 💼 Accounting Questions

### 11. What journal entry is created?
```
Debit:  Accounts Receivable (AR)    XXX.XX
Credit: Revenue Account              XXX.XX
```

This increases the customer's balance (AR) and increases revenue.

---

### 12. Which accounts are used?
- **AR Account**: From `profit_distribution_settings` → `accounts_receivable_account`
- **Revenue Account**: From `profit_distribution_settings` → `sales_account`

---

### 13. What if accounts are not configured?
⚠️ The debit note will be created, but **no journal entry** will be created. You'll see a warning message.

---

### 14. Can I reverse a Debit Note?
✅ **Yes** - Cancel it:
```sql
UPDATE customer_debit_notes
SET status = 'cancelled'
WHERE debit_note_number = 'FOO-DN-0001'
  AND applied_amount = 0;
```

---

## 📊 Status Questions

### 15. What are the possible statuses?
- `open` - Not applied yet
- `partially_applied` - Some amount applied
- `applied` - Fully applied
- `cancelled` - Cancelled

---

### 16. How does status change automatically?
- **open** → **partially_applied**: When some amount is applied
- **partially_applied** → **applied**: When fully applied
- **Any** → **cancelled**: Manual cancellation

---

### 17. Can I manually change the status?
❌ **No** - Status is managed automatically based on `applied_amount`.

---

## 🔍 Verification Questions

### 18. How do I verify everything is working?
```bash
psql -f customer_debit_notes_quick_check.sql
```

---

### 19. How do I check for errors?
```bash
psql -f CUSTOMER_DEBIT_NOTES_VERIFICATION.sql
```

---

### 20. How do I view all open debit notes?
```sql
SELECT * FROM customer_debit_notes 
WHERE status IN ('open', 'partially_applied')
ORDER BY debit_note_date DESC;
```

---

## 🛡️ Protection Questions

### 21. What protections are in place?
- ✅ Cannot delete applied debit notes
- ✅ Cannot modify posted debit notes
- ✅ Cannot apply more than total amount
- ✅ Prevents duplicate debit notes
- ✅ Validates all amounts are positive
- ✅ Ensures journal entries are balanced

---

### 22. Can I modify a debit note after it's posted?
❌ **No** - Once it has a journal entry, you cannot modify:
- Total amount
- Customer
- Source invoice

You can still update notes and other non-critical fields.

---

### 23. What happens if I try to delete an applied debit note?
You'll get an error:
```
ERROR: Cannot delete customer debit note FOO-DN-0001 - it has been applied (100.00 applied)
```

---

## 📈 Reporting Questions

### 24. How do I see debit notes by customer?
```sql
SELECT 
  c.name,
  COUNT(cdn.id) as debit_note_count,
  SUM(cdn.total_amount) as total_debited
FROM customers c
JOIN customer_debit_notes cdn ON c.id = cdn.customer_id
GROUP BY c.id, c.name
ORDER BY total_debited DESC;
```

---

### 25. How do I see debit notes by type?
```sql
SELECT 
  reference_type,
  COUNT(*) as count,
  SUM(total_amount) as total
FROM customer_debit_notes
GROUP BY reference_type
ORDER BY total DESC;
```

---

## 🔗 Integration Questions

### 26. Does this integrate with invoices?
✅ **Yes** - Every debit note must reference a `source_invoice_id`.

---

### 27. Does this update customer balance?
✅ **Yes** - Through the journal entry (Debit AR).

---

### 28. Can I link to payments?
✅ **Yes** - Use `customer_debit_note_applications` with `applied_to_type = 'payment'`.

---

## 🎯 Best Practices

### 29. Should I create one debit note per charge or combine them?
**Recommended:** Combine related charges in one debit note with multiple items.

**Example:**
```json
[
  {"description": "Express shipping", "unit_price": 100},
  {"description": "Packaging", "unit_price": 50}
]
```

---

### 30. What should I put in the reason field?
Be specific and clear:
- ✅ "Express shipping requested after invoice"
- ✅ "Late payment penalty - 30 days overdue"
- ❌ "Additional charges" (too vague)

---

## 🚨 Troubleshooting

### 31. Debit note created but no journal entry?
Check if accounts are configured:
```sql
SELECT * FROM profit_distribution_settings
WHERE setting_key IN ('accounts_receivable_account', 'sales_account');
```

---

### 32. Totals don't match items?
Run verification:
```sql
SELECT 
  debit_note_number,
  subtotal,
  (SELECT SUM(line_total) FROM customer_debit_note_items WHERE customer_debit_note_id = cdn.id) as calculated
FROM customer_debit_notes cdn
WHERE ABS(subtotal - (SELECT COALESCE(SUM(line_total), 0) FROM customer_debit_note_items WHERE customer_debit_note_id = cdn.id)) >= 0.01;
```

---

### 33. Applied amount doesn't match applications?
This should auto-sync via triggers. If not, check:
```sql
SELECT 
  cdn.debit_note_number,
  cdn.applied_amount,
  COALESCE(SUM(cdna.amount_applied), 0) as calculated
FROM customer_debit_notes cdn
LEFT JOIN customer_debit_note_applications cdna ON cdn.id = cdna.customer_debit_note_id
GROUP BY cdn.id
HAVING ABS(cdn.applied_amount - COALESCE(SUM(cdna.amount_applied), 0)) >= 0.01;
```

---

## 📚 More Help

**Full Guide:** [CUSTOMER_DEBIT_NOTES_GUIDE.md](CUSTOMER_DEBIT_NOTES_GUIDE.md)  
**Commands:** [CUSTOMER_DEBIT_NOTES_COMMANDS.md](CUSTOMER_DEBIT_NOTES_COMMANDS.md)  
**README:** [README_CUSTOMER_DEBIT_NOTES.md](README_CUSTOMER_DEBIT_NOTES.md)

---

**Last Updated:** January 6, 2026

