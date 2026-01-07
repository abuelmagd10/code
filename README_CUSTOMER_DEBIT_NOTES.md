# 📘 Customer Debit Notes System
# نظام إشعارات مدين العملاء

## ⚡ Quick Start

**What is this?** Customer Debit Notes increase the amount a customer owes after an invoice is issued.

**When to use?** Price differences, additional fees, penalties, corrections.

**Status:** ✅ Production Ready

---

## 🎯 Quick Actions

### 1️⃣ Install (First Time)
```bash
psql -f scripts/096_customer_debit_notes_schema.sql
psql -f scripts/097_customer_debit_notes_functions.sql
psql -f scripts/098_create_customer_debit_note_function.sql
psql -f scripts/099_customer_debit_notes_guards.sql
```

### 2️⃣ Verify Installation
```bash
psql -f customer_debit_notes_quick_check.sql
```

### 3️⃣ Create Your First Debit Note
```sql
SELECT * FROM create_customer_debit_note(
  p_company_id := 'your-company-uuid',
  p_branch_id := 'your-branch-uuid',
  p_cost_center_id := NULL,
  p_customer_id := 'customer-uuid',
  p_source_invoice_id := 'invoice-uuid',
  p_debit_note_date := CURRENT_DATE,
  p_reference_type := 'additional_fees',
  p_reason := 'Shipping charges',
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

---

## 📚 Documentation

### Essential Docs:
1. **[CUSTOMER_DEBIT_NOTES_GUIDE.md](CUSTOMER_DEBIT_NOTES_GUIDE.md)** - Complete guide
2. **[CUSTOMER_DEBIT_NOTES_COMMANDS.md](CUSTOMER_DEBIT_NOTES_COMMANDS.md)** - Useful commands
3. **[CUSTOMER_DEBIT_NOTES_FAQ.md](CUSTOMER_DEBIT_NOTES_FAQ.md)** - Common questions

### SQL Files:
4. **[scripts/096_customer_debit_notes_schema.sql](scripts/096_customer_debit_notes_schema.sql)** - Database schema
5. **[scripts/097_customer_debit_notes_functions.sql](scripts/097_customer_debit_notes_functions.sql)** - Functions & triggers
6. **[scripts/098_create_customer_debit_note_function.sql](scripts/098_create_customer_debit_note_function.sql)** - Main creation function
7. **[scripts/099_customer_debit_notes_guards.sql](scripts/099_customer_debit_notes_guards.sql)** - Guards & constraints

### Verification:
8. **[CUSTOMER_DEBIT_NOTES_VERIFICATION.sql](CUSTOMER_DEBIT_NOTES_VERIFICATION.sql)** - Comprehensive checks
9. **[customer_debit_notes_quick_check.sql](customer_debit_notes_quick_check.sql)** - Quick health check

---

## 🔑 Key Features

### ✅ What It Does:
- ✅ Creates debit notes to increase customer balance
- ✅ Automatic journal entry creation (Debit AR / Credit Revenue)
- ✅ Multi-currency support
- ✅ Branch and cost center tracking
- ✅ Full audit trail
- ✅ Application tracking to invoices
- ✅ Status management (open → applied)

### 🔒 Protection:
- ✅ Cannot delete applied debit notes
- ✅ Cannot modify posted debit notes
- ✅ Prevents duplicate debit notes
- ✅ Validates all amounts
- ✅ Ensures balanced journal entries

---

## 📊 Use Cases

### 1. Additional Fees
```sql
-- Customer needs express shipping after invoice
p_reference_type := 'additional_fees'
p_reason := 'Express shipping upgrade'
```

### 2. Penalties
```sql
-- Late payment penalty
p_reference_type := 'penalty'
p_reason := 'Late payment - 30 days overdue'
```

### 3. Price Corrections
```sql
-- Price was undercharged
p_reference_type := 'correction'
p_reason := 'Price correction - promotional price expired'
```

### 4. Service Charges
```sql
-- Additional services provided
p_reference_type := 'service_charge'
p_reason := 'Installation and setup service'
```

---

## 🗄️ Database Tables

### 1. `customer_debit_notes`
Main table storing debit note headers.

**Key Fields:**
- `debit_note_number` - Auto-generated (e.g., "FOO-DN-0001")
- `customer_id` - Customer reference
- `source_invoice_id` - Original invoice (required)
- `total_amount` - Total debit amount
- `applied_amount` - Amount applied to invoices
- `status` - open, partially_applied, applied, cancelled
- `journal_entry_id` - Linked accounting entry

### 2. `customer_debit_note_items`
Line items for each debit note.

### 3. `customer_debit_note_applications`
Tracks how debit notes are applied to invoices/payments.

---

## 💼 Accounting Integration

### Journal Entry Created:
```
Reference Type: customer_debit
Entry:
  Debit:  Accounts Receivable (AR)    XXX.XX
  Credit: Revenue Account              XXX.XX
```

**Effect:** Increases customer balance (AR) and revenue.

---

## 🛠️ Common Commands

### View All Debit Notes:
```sql
SELECT * FROM customer_debit_notes ORDER BY debit_note_date DESC;
```

### View Open Debit Notes:
```sql
SELECT * FROM customer_debit_notes 
WHERE status IN ('open', 'partially_applied');
```

### View Debit Notes for Customer:
```sql
SELECT * FROM customer_debit_notes 
WHERE customer_id = 'customer-uuid-here';
```

### Apply Debit Note:
```sql
INSERT INTO customer_debit_note_applications (
  company_id, customer_debit_note_id, 
  applied_to_type, applied_to_id, amount_applied
) VALUES (
  'company-uuid', 'debit-note-uuid',
  'invoice', 'invoice-uuid', 100.00
);
```

---

## ✅ Verification

### Quick Check:
```bash
psql -f customer_debit_notes_quick_check.sql
```

### Full Verification:
```bash
psql -f CUSTOMER_DEBIT_NOTES_VERIFICATION.sql
```

---

## 🎓 Examples

See **[CUSTOMER_DEBIT_NOTES_GUIDE.md](CUSTOMER_DEBIT_NOTES_GUIDE.md)** for detailed examples.

---

## 🔗 Related Systems

- **Vendor Credits** - Similar system for suppliers
- **Customer Credits** - Opposite (decreases customer balance)
- **Invoices** - Source documents
- **Journal Entries** - Accounting integration

---

## 📞 Support

**Questions?** See [CUSTOMER_DEBIT_NOTES_FAQ.md](CUSTOMER_DEBIT_NOTES_FAQ.md)

**Commands?** See [CUSTOMER_DEBIT_NOTES_COMMANDS.md](CUSTOMER_DEBIT_NOTES_COMMANDS.md)

**Full Guide?** See [CUSTOMER_DEBIT_NOTES_GUIDE.md](CUSTOMER_DEBIT_NOTES_GUIDE.md)

---

**Created:** January 6, 2026  
**Version:** 1.0.0  
**Status:** ✅ Production Ready

