# 📝 Changelog - Customer Debit Notes Accounting Compliance
# سجل التغييرات - الامتثال المحاسبي لإشعارات مدين العملاء

**Date:** 2026-01-07  
**Version:** 2.0  
**Branch:** `fix/customer-debit-notes-accounting-compliance`

---

## 🎯 Summary

Updated Customer Debit Notes system to comply with proper accounting principles by implementing **claim-first logic** instead of immediate revenue recognition.

---

## 🔄 Changes

### 1️⃣ Database Schema (`096_customer_debit_notes_schema.sql`)

#### Added Columns to `customer_debit_notes`:
- `approval_status` VARCHAR(20) - Workflow: draft → pending_approval → approved/rejected
- `approved_by` UUID - User who approved the debit note
- `approved_at` TIMESTAMPTZ - Timestamp of approval
- `rejection_reason` TEXT - Reason for rejection (if rejected)
- `created_by` UUID - User who created the debit note

#### Added Columns to `customer_debit_note_applications`:
- `branch_id` UUID - Branch where application occurred
- `journal_entry_id` UUID - **MOVED from customer_debit_notes** (created on application)
- `application_method` VARCHAR(50) - How it was applied (manual/automatic)
- `applied_by` UUID - User who applied the debit note

#### Removed:
- `journal_entry_id` from `customer_debit_notes` (moved to applications table)

---

### 2️⃣ Functions (`097_customer_debit_notes_functions.sql`)

#### New Functions:
1. **`submit_debit_note_for_approval()`** - Submit draft for approval
2. **`approve_customer_debit_note()`** - Approve pending debit note (with separation of duties)
3. **`reject_customer_debit_note()`** - Reject pending debit note

#### Updated Functions:
- **`get_customer_debit_note_summary()`** - Added approval fields
- **`get_customer_outstanding_balance()`** - Updated to use new structure

---

### 3️⃣ Apply Function (`097b_apply_debit_note_function.sql`) - **NEW**

#### New Function:
- **`apply_customer_debit_note()`** - Apply approved debit note to invoice/payment
  - Creates journal entry **ONLY** when applied
  - Enforces separation of duties (applier ≠ creator)
  - Validates branch/company/customer match
  - Updates invoice balance
  - Records application in `customer_debit_note_applications`

---

### 4️⃣ Create Function (`098_create_customer_debit_note_function.sql`)

#### Changes:
- **Removed:** Automatic journal entry creation
- **Added:** `created_by` parameter
- **Changed:** Returns `approval_status` instead of `journal_entry_id`
- **Status:** Creates debit note as **DRAFT** (not posted)

---

### 5️⃣ Guards & Triggers (`099_customer_debit_notes_guards.sql`)

#### New Guards:
1. **`prevent_direct_debit_application()`** - Discourages direct INSERT into applications
2. **`check_invoice_time_lock()`** - Prevents creating debit notes for invoices older than 90 days

#### Updated Guards:
- **`prevent_customer_debit_note_modification()`** - Updated to check approval status instead of journal_entry_id

#### New Indexes:
- `idx_customer_debit_notes_approval_status` - For approval workflow queries
- `idx_customer_debit_notes_created_by` - For audit trail
- `idx_customer_debit_notes_approved_by` - For approval tracking
- `idx_customer_debit_applications_applied_by` - For application tracking

---

### 6️⃣ Migration Script (`099b_migration_accounting_compliance.sql`) - **NEW**

#### Purpose:
Migrate existing debit notes from old structure to new structure.

#### Actions:
1. Adds new columns to existing tables
2. Sets existing debit notes to 'approved' status
3. Prepares for journal_entry_id migration
4. Provides verification queries

---

### 7️⃣ Documentation

#### New Files:
1. **`START_HERE_CUSTOMER_DEBIT_NOTES_V2.md`** - Updated quick start guide
2. **`README_ACCOUNTING_COMPLIANCE.md`** - Comprehensive explanation of changes
3. **`CHANGELOG_ACCOUNTING_COMPLIANCE.md`** - This file

#### Updated Files:
- All existing documentation updated to reflect new workflow

---

## 🔐 Security Enhancements

### 1. Separation of Duties
- Creator cannot approve their own debit note
- Creator cannot apply their own debit note
- Enforced at database level

### 2. Time-Lock
- Cannot create debit notes for invoices older than 90 days (configurable)
- Prevents backdating

### 3. Approval Workflow
- All debit notes must be approved before application
- Penalties and corrections require owner approval

### 4. Controlled Application
- Applications must use `apply_customer_debit_note()` function
- Direct INSERT discouraged

---

## 📊 Workflow Comparison

### ❌ Old Workflow:
```
1. Create Debit Note
   └─> Journal Entry Created ❌ (premature revenue recognition)
   └─> Status: open
```

### ✅ New Workflow:
```
1. Create Debit Note
   └─> Status: draft
   └─> NO journal entry

2. Submit for Approval
   └─> Status: pending_approval

3. Approve
   └─> Status: approved
   └─> STILL NO journal entry

4. Apply to Invoice
   └─> Status: applied
   └─> ✅ Journal Entry Created (correct revenue recognition)
```

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

### Upgrading:
```bash
psql -f scripts/099b_migration_accounting_compliance.sql
```

---

## ✅ Testing

Run the test script:
```bash
psql -f scripts/test_accounting_compliance.sql
```

---

## 📚 References

- **Accounting Principle:** Revenue Recognition (IFRS 15 / ASC 606)
- **Best Practice:** Claim-first logic for receivables
- **Security:** Separation of duties (SOX compliance)

---

## 🔮 Future Enhancements

1. **Configurable Time-Lock** - Allow per-company configuration
2. **Multi-Level Approval** - Support for multiple approval levels
3. **Automatic Notifications** - Email/SMS when approval needed
4. **Batch Application** - Apply multiple debit notes at once

---

**For questions or support, see README_ACCOUNTING_COMPLIANCE.md**

