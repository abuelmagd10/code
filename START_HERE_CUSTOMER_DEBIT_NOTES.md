# 🎯 START HERE - Customer Debit Notes (UPDATED - Accounting Compliant)
# ابدأ هنا - إشعارات مدين العملاء (محدث - متوافق محاسبياً)

## ⚡ 60-Second Overview

**What is it?** System to create **CLAIMS** for additional charges against customers.

**When to use?** Price differences, shipping fees, penalties, corrections.

**🔒 IMPORTANT:** Creating a debit note = **CLAIM ONLY** (not revenue). Revenue is recognized when approved and applied.

**Status:** ✅ Production Ready - Accounting Compliant

---

## 🚀 Quick Start (5 Steps)

### Step 1: Install/Update (3 minutes)
```bash
# New installation
psql -f scripts/096_customer_debit_notes_schema.sql
psql -f scripts/097_customer_debit_notes_functions.sql
psql -f scripts/097b_apply_debit_note_function.sql
psql -f scripts/098_create_customer_debit_note_function.sql
psql -f scripts/099_customer_debit_notes_guards.sql

# OR if upgrading from old version
psql -f scripts/099b_migration_accounting_compliance.sql
```

### Step 2: Create Debit Note (Draft)
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
  p_items := '[{"description": "Express shipping", "quantity": 1, "unit_price": 100.00, "tax_rate": 14}]'::jsonb,
  p_created_by := 'user-uuid'
);
-- Returns: debit_note_id, debit_note_number, total_amount, approval_status='draft'
```

### Step 3: Submit for Approval
```sql
SELECT * FROM submit_debit_note_for_approval(
  p_debit_note_id := 'debit-note-uuid',
  p_submitted_by := 'user-uuid'
);
-- Status changes: draft → pending_approval
```

### Step 4: Approve (Different User)
```sql
SELECT * FROM approve_customer_debit_note(
  p_debit_note_id := 'debit-note-uuid',
  p_approved_by := 'approver-uuid', -- MUST be different from creator
  p_notes := 'Approved - valid charge'
);
-- Status changes: pending_approval → approved
```

### Step 5: Apply to Invoice (Creates Journal Entry)
```sql
SELECT * FROM apply_customer_debit_note(
  p_debit_note_id := 'debit-note-uuid',
  p_applied_to_type := 'invoice',
  p_applied_to_id := 'invoice-uuid',
  p_amount_to_apply := 114.00, -- Total amount
  p_applied_by := 'user-uuid', -- MUST be different from creator
  p_notes := 'Applied to invoice'
);
-- ✅ NOW journal entry is created (revenue recognition)
```

**Done!** ✅ Debit note is now applied and revenue is recognized.

---

## 🔒 Key Differences from Old System

| Aspect | ❌ Old System | ✅ New System (Compliant) |
|--------|--------------|--------------------------|
| **Journal Entry** | Created on debit note creation | Created on application |
| **Revenue Recognition** | Immediate | When approved + applied |
| **Approval** | None | Required workflow |
| **Separation of Duties** | None | Creator ≠ Approver ≠ Applier |
| **Accounting Principle** | Wrong (premature revenue) | Correct (claim-first) |

---

## 📊 Workflow States

```
1. DRAFT → 2. PENDING_APPROVAL → 3. APPROVED → 4. APPLIED
   ↓                                    ↓
REJECTED                           PARTIALLY_APPLIED
```

### Status Meanings:
- **draft** - Just created, can be edited
- **pending_approval** - Submitted, waiting for approval
- **approved** - Approved, ready to apply
- **rejected** - Rejected, cannot be applied
- **open** - Approved but not yet applied
- **partially_applied** - Some amount applied
- **applied** - Fully applied (revenue recognized)

---

## 🔐 Security & Guards

### ✅ Enforced Rules:
1. **Separation of Duties** - Creator cannot approve or apply their own debit note
2. **Time-Lock** - Cannot create debit notes for invoices older than 90 days (configurable)
3. **Approval Required** - Penalties and corrections require owner approval
4. **No Direct INSERT** - Applications must use `apply_customer_debit_note()` function
5. **Branch/Company Match** - Debit note and invoice must match
6. **Amount Validation** - Cannot apply more than remaining balance

---

## 📚 Documentation

### Quick Reference:
→ **[CUSTOMER_DEBIT_NOTES_COMMANDS.md](CUSTOMER_DEBIT_NOTES_COMMANDS.md)** - All commands

### Complete Guide:
→ **[CUSTOMER_DEBIT_NOTES_GUIDE.md](CUSTOMER_DEBIT_NOTES_GUIDE.md)** - Full documentation

### FAQ:
→ **[CUSTOMER_DEBIT_NOTES_FAQ.md](CUSTOMER_DEBIT_NOTES_FAQ.md)** - 33 Q&A

### Arabic:
→ **[ملخص_إشعارات_مدين_العملاء.md](ملخص_إشعارات_مدين_العملاء.md)** - الملخص بالعربية

---

## ⚠️ Migration from Old System

If you have existing debit notes from the old system:

```bash
psql -f scripts/099b_migration_accounting_compliance.sql
```

This will:
- Add new approval columns
- Set existing debit notes to 'approved' status
- Prepare for journal entry migration

---

## 🆘 Need Help?

1. **Quick Check:** Run `customer_debit_notes_quick_check.sql`
2. **Full Verification:** Run `CUSTOMER_DEBIT_NOTES_VERIFICATION.sql`
3. **Read FAQ:** See `CUSTOMER_DEBIT_NOTES_FAQ.md`

---

**Last Updated:** 2026-01-07 (Accounting Compliance Update)

