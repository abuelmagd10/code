# 🔒 Customer Debit Notes - Accounting Compliance Update
# تحديث الامتثال المحاسبي - إشعارات مدين العملاء

**Date:** 2026-01-07  
**Version:** 2.0 (Accounting Compliant)  
**Status:** ✅ Production Ready

---

## 🎯 What Changed?

The Customer Debit Notes system has been updated to comply with **proper accounting principles**.

### ❌ Old System (Incorrect):
- Created journal entry **immediately** when debit note was created
- Recognized revenue **before** approval or application
- No approval workflow
- No separation of duties

### ✅ New System (Correct):
- Debit note creation = **CLAIM ONLY** (no journal entry)
- Journal entry created **ONLY** when debit note is applied
- **Approval workflow** required
- **Separation of duties** enforced
- Revenue recognized at the **correct time**

---

## 📊 Accounting Principle

### Claim-First Logic:

```
1. CREATE Debit Note
   └─> Status: DRAFT
   └─> Accounting Impact: NONE (it's just a claim)

2. SUBMIT for Approval
   └─> Status: PENDING_APPROVAL
   └─> Accounting Impact: NONE

3. APPROVE Debit Note
   └─> Status: APPROVED
   └─> Accounting Impact: NONE (still just an approved claim)

4. APPLY to Invoice/Payment
   └─> Status: APPLIED
   └─> Accounting Impact: ✅ JOURNAL ENTRY CREATED
       Debit: Accounts Receivable (AR)
       Credit: Revenue Account
```

**Revenue is recognized ONLY at step 4** (when applied).

---

## 🔄 Workflow States

### Approval Status:
- `draft` - Just created
- `pending_approval` - Submitted for approval
- `approved` - Approved, ready to apply
- `rejected` - Rejected, cannot be applied

### Application Status:
- `open` - Not yet applied
- `partially_applied` - Some amount applied
- `applied` - Fully applied

---

## 🔐 Security & Guards

### 1️⃣ Separation of Duties
```sql
-- ❌ BLOCKED: Creator cannot approve their own debit note
SELECT * FROM approve_customer_debit_note(
  p_debit_note_id := 'xxx',
  p_approved_by := 'creator-uuid' -- ERROR!
);

-- ✅ ALLOWED: Different user approves
SELECT * FROM approve_customer_debit_note(
  p_debit_note_id := 'xxx',
  p_approved_by := 'approver-uuid' -- OK
);
```

### 2️⃣ Time-Lock for Old Invoices
```sql
-- ❌ BLOCKED: Invoice is 120 days old (limit: 90 days)
SELECT * FROM create_customer_debit_note(
  p_source_invoice_id := 'old-invoice-uuid' -- ERROR!
);
```

### 3️⃣ Approval Required for Penalties/Corrections
```sql
-- Penalties and corrections require owner approval
SELECT * FROM create_customer_debit_note(
  p_reference_type := 'penalty' -- Requires owner approval
);
```

### 4️⃣ No Direct INSERT into Applications
```sql
-- ❌ DISCOURAGED: Direct INSERT
INSERT INTO customer_debit_note_applications (...); -- Warning!

-- ✅ REQUIRED: Use function
SELECT * FROM apply_customer_debit_note(...); -- OK
```

### 5️⃣ Branch/Company/Customer Match
```sql
-- ❌ BLOCKED: Branch mismatch
SELECT * FROM apply_customer_debit_note(
  p_debit_note_id := 'debit-note-from-branch-A',
  p_applied_to_id := 'invoice-from-branch-B' -- ERROR!
);
```

---

## 📦 New Files

### SQL Scripts:
1. `scripts/096_customer_debit_notes_schema.sql` - **UPDATED** (added approval columns)
2. `scripts/097_customer_debit_notes_functions.sql` - **UPDATED** (added approval functions)
3. `scripts/097b_apply_debit_note_function.sql` - **NEW** (controlled application)
4. `scripts/098_create_customer_debit_note_function.sql` - **UPDATED** (no journal entry)
5. `scripts/099_customer_debit_notes_guards.sql` - **UPDATED** (added guards)
6. `scripts/099b_migration_accounting_compliance.sql` - **NEW** (migration script)

### Documentation:
1. `START_HERE_CUSTOMER_DEBIT_NOTES_V2.md` - **NEW** (updated quick start)
2. `README_ACCOUNTING_COMPLIANCE.md` - **NEW** (this file)

---

## 🚀 Installation

### New Installation:
```bash
psql -f scripts/096_customer_debit_notes_schema.sql
psql -f scripts/097_customer_debit_notes_functions.sql
psql -f scripts/097b_apply_debit_note_function.sql
psql -f scripts/098_create_customer_debit_note_function.sql
psql -f scripts/099_customer_debit_notes_guards.sql
```

### Upgrading from Old Version:
```bash
psql -f scripts/099b_migration_accounting_compliance.sql
```

---

## 📝 Usage Example

### Complete Workflow:
```sql
-- 1. Create (Draft)
SELECT * FROM create_customer_debit_note(
  p_company_id := 'company-uuid',
  p_branch_id := 'branch-uuid',
  p_customer_id := 'customer-uuid',
  p_source_invoice_id := 'invoice-uuid',
  p_debit_note_date := CURRENT_DATE,
  p_reference_type := 'additional_fees',
  p_reason := 'Shipping charges',
  p_items := '[{"description": "Shipping", "quantity": 1, "unit_price": 100, "tax_rate": 14}]'::jsonb,
  p_created_by := 'user-1-uuid'
);
-- Returns: debit_note_id, approval_status='draft'

-- 2. Submit for Approval
SELECT * FROM submit_debit_note_for_approval(
  p_debit_note_id := 'debit-note-uuid',
  p_submitted_by := 'user-1-uuid'
);
-- Status: draft → pending_approval

-- 3. Approve (Different User)
SELECT * FROM approve_customer_debit_note(
  p_debit_note_id := 'debit-note-uuid',
  p_approved_by := 'user-2-uuid', -- Different user!
  p_notes := 'Approved'
);
-- Status: pending_approval → approved

-- 4. Apply (Creates Journal Entry)
SELECT * FROM apply_customer_debit_note(
  p_debit_note_id := 'debit-note-uuid',
  p_applied_to_type := 'invoice',
  p_applied_to_id := 'invoice-uuid',
  p_amount_to_apply := 114.00,
  p_applied_by := 'user-3-uuid', -- Different user!
  p_notes := 'Applied'
);
-- ✅ Journal entry created NOW
-- Status: open → applied
```

---

## ✅ Benefits

1. **Accounting Compliance** - Follows proper revenue recognition principles
2. **Audit Trail** - Complete history of who created, approved, and applied
3. **Security** - Separation of duties prevents fraud
4. **Flexibility** - Can reject or modify before approval
5. **Control** - Time-lock prevents backdating

---

## 📚 Documentation

- **Quick Start:** `START_HERE_CUSTOMER_DEBIT_NOTES_V2.md`
- **Complete Guide:** `CUSTOMER_DEBIT_NOTES_GUIDE.md`
- **Commands:** `CUSTOMER_DEBIT_NOTES_COMMANDS.md`
- **FAQ:** `CUSTOMER_DEBIT_NOTES_FAQ.md`

---

**For questions or support, see the FAQ or contact the development team.**

