# 📘 Customer Debit Notes - Complete Implementation Guide
# دليل إشعارات مدين العملاء - الدليل الكامل

## 📋 Table of Contents

1. [Overview](#overview)
2. [When to Use](#when-to-use)
3. [Database Schema](#database-schema)
4. [Creating Debit Notes](#creating-debit-notes)
5. [Applying Debit Notes](#applying-debit-notes)
6. [Accounting Integration](#accounting-integration)
7. [Verification](#verification)
8. [Examples](#examples)

---

## 🎯 Overview

Customer Debit Notes are used to **increase** the amount owed by a customer after an invoice has been issued. This is the opposite of Customer Credit Notes (which decrease the amount owed).

### Common Use Cases:
- ✅ Price differences discovered after invoicing
- ✅ Additional fees (shipping, packaging, services)
- ✅ Penalties or late fees
- ✅ Corrections for undercharging
- ✅ Additional services provided

### Key Features:
- ✅ Automatic journal entry creation (Debit AR / Credit Revenue)
- ✅ Multi-currency support
- ✅ Full audit trail
- ✅ Branch and cost center tracking
- ✅ Application tracking to invoices/payments
- ✅ Status management (open → partially_applied → applied)

---

## 📊 When to Use

### ✅ Use Customer Debit Notes When:
1. **Price Increase**: Customer agreed to higher price after invoice
2. **Additional Charges**: Shipping, handling, or service fees
3. **Penalties**: Late payment fees, contract penalties
4. **Corrections**: Invoice was undercharged
5. **Extra Services**: Additional work performed

### ❌ Do NOT Use When:
1. **Original Invoice Error**: Cancel and reissue invoice instead
2. **Customer Dispute**: Resolve dispute first
3. **Decreasing Amount**: Use Customer Credit Note instead

---

## 🗄️ Database Schema

### Tables Created:

#### 1. `customer_debit_notes`
Main table storing debit note headers.

**Key Fields:**
- `company_id`, `branch_id`, `cost_center_id` - ERP context
- `customer_id` - Customer reference
- `source_invoice_id` - Original invoice (required)
- `debit_note_number` - Auto-generated (e.g., "FOO-DN-0001")
- `total_amount`, `applied_amount` - Financial tracking
- `status` - open, partially_applied, applied, cancelled
- `reference_type` - Reason category
- `journal_entry_id` - Linked accounting entry

#### 2. `customer_debit_note_items`
Line items for each debit note.

**Key Fields:**
- `customer_debit_note_id` - Parent reference
- `product_id` - Optional product reference
- `description` - Item description (required)
- `quantity`, `unit_price`, `tax_rate` - Pricing
- `item_type` - product, service, charge, penalty, fee

#### 3. `customer_debit_note_applications`
Tracks how debit notes are applied.

**Key Fields:**
- `customer_debit_note_id` - Debit note reference
- `applied_to_type` - invoice, payment, settlement
- `applied_to_id` - Target record ID
- `amount_applied` - Amount applied

---

## 🔧 Creating Debit Notes

### Method 1: Using SQL Function (Recommended)

```sql
SELECT * FROM create_customer_debit_note(
  p_company_id := 'company-uuid-here',
  p_branch_id := 'branch-uuid-here',
  p_cost_center_id := 'cost-center-uuid-here',
  p_customer_id := 'customer-uuid-here',
  p_source_invoice_id := 'invoice-uuid-here',
  p_debit_note_date := '2026-01-06',
  p_reference_type := 'additional_fees',
  p_reason := 'Additional shipping charges',
  p_items := '[
    {
      "description": "Express shipping",
      "quantity": 1,
      "unit_price": 100.00,
      "tax_rate": 14,
      "item_type": "charge"
    },
    {
      "description": "Packaging materials",
      "quantity": 1,
      "unit_price": 50.00,
      "tax_rate": 14,
      "item_type": "charge"
    }
  ]'::jsonb,
  p_notes := 'Customer requested express delivery'
);
```

### Method 2: Manual Insert (Advanced)

```sql
-- 1. Insert debit note header
INSERT INTO customer_debit_notes (
  company_id,
  branch_id,
  customer_id,
  source_invoice_id,
  debit_note_number,
  debit_note_date,
  reference_type,
  reason,
  notes
) VALUES (
  'company-uuid',
  'branch-uuid',
  'customer-uuid',
  'invoice-uuid',
  generate_customer_debit_note_number('company-uuid'),
  CURRENT_DATE,
  'penalty',
  'Late payment penalty',
  'Invoice overdue by 30 days'
) RETURNING id;

-- 2. Insert items
INSERT INTO customer_debit_note_items (
  customer_debit_note_id,
  description,
  quantity,
  unit_price,
  tax_rate,
  line_total,
  item_type
) VALUES (
  'debit-note-uuid',
  'Late payment fee - 30 days',
  1,
  500.00,
  0,
  500.00,
  'penalty'
);

-- 3. Totals will be calculated automatically by triggers
```

---

## 💼 Applying Debit Notes

### Apply to Invoice

```sql
INSERT INTO customer_debit_note_applications (
  company_id,
  customer_debit_note_id,
  applied_to_type,
  applied_to_id,
  applied_date,
  amount_applied,
  notes
) VALUES (
  'company-uuid',
  'debit-note-uuid',
  'invoice',
  'invoice-uuid',
  CURRENT_DATE,
  150.00,
  'Applied to invoice INV-0001'
);

-- The applied_amount in customer_debit_notes will update automatically
-- Status will change to 'partially_applied' or 'applied' automatically
```

---

## 📊 Accounting Integration

### Journal Entry Created Automatically:

**Entry Type:** `customer_debit`

**Accounts:**
- **Debit**: Accounts Receivable (AR) - Increases customer balance
- **Credit**: Revenue/Other Account - Increases revenue

**Example:**
```
Debit Note: FOO-DN-0001 - 150.00 EGP

Journal Entry:
  Debit:  AR Account          150.00
  Credit: Revenue Account     150.00
```

### Multi-Currency Support:

```sql
SELECT * FROM create_customer_debit_note(
  -- ... other parameters ...
  p_currency_id := 'usd-currency-uuid',
  p_exchange_rate := 30.50
);

-- Amounts stored in both original currency and base currency
-- Journal entry uses base currency (EGP)
```

---

## ✅ Verification

### Quick Health Check:
```bash
psql -f customer_debit_notes_quick_check.sql
```

### Comprehensive Verification:
```bash
psql -f CUSTOMER_DEBIT_NOTES_VERIFICATION.sql
```

### Common Queries:

#### View All Open Debit Notes:
```sql
SELECT 
  debit_note_number,
  customer_id,
  total_amount,
  applied_amount,
  total_amount - applied_amount as remaining
FROM customer_debit_notes
WHERE status IN ('open', 'partially_applied')
ORDER BY debit_note_date DESC;
```

#### View Debit Notes by Customer:
```sql
SELECT 
  c.name as customer_name,
  cdn.debit_note_number,
  cdn.debit_note_date,
  cdn.total_amount,
  cdn.status
FROM customer_debit_notes cdn
JOIN customers c ON cdn.customer_id = c.id
WHERE c.id = 'customer-uuid-here'
ORDER BY cdn.debit_note_date DESC;
```

---

## 📝 Examples

### Example 1: Shipping Charges
```sql
-- Customer ordered products, invoice issued
-- Later, express shipping was requested

SELECT * FROM create_customer_debit_note(
  p_company_id := '...',
  p_customer_id := '...',
  p_source_invoice_id := '...',
  p_reference_type := 'additional_fees',
  p_reason := 'Express shipping upgrade',
  p_items := '[{"description": "Express shipping", "quantity": 1, "unit_price": 200, "tax_rate": 0}]'::jsonb
);
```

### Example 2: Late Payment Penalty
```sql
-- Invoice overdue, apply penalty

SELECT * FROM create_customer_debit_note(
  p_reference_type := 'penalty',
  p_reason := 'Late payment - 45 days overdue',
  p_items := '[{"description": "Late fee", "quantity": 1, "unit_price": 500, "tax_rate": 0, "item_type": "penalty"}]'::jsonb
);
```

### Example 3: Price Correction
```sql
-- Price was undercharged, correct it

SELECT * FROM create_customer_debit_note(
  p_reference_type := 'correction',
  p_reason := 'Price correction - promotional price expired',
  p_items := '[{"description": "Price difference", "quantity": 10, "unit_price": 5, "tax_rate": 14}]'::jsonb
);
```

---

## 🔒 Protection & Guards

### Automatic Protections:
1. ✅ Cannot delete debit note with journal entry
2. ✅ Cannot delete debit note that has been applied
3. ✅ Cannot modify amounts after posting
4. ✅ Cannot apply more than total amount
5. ✅ Prevents duplicate debit notes for same reference
6. ✅ Validates all amounts are positive
7. ✅ Ensures journal entries are balanced

---

## 📚 Related Documentation

- **Vendor Credits**: Similar system for suppliers
- **Customer Credits**: Opposite system (decreases customer balance)
- **Journal Entries**: Accounting integration
- **Invoices**: Source documents

---

**Created:** January 6, 2026  
**Version:** 1.0.0  
**Status:** ✅ Production Ready

