# 📋 Ready to Paste - Customer Debit Notes Installation
# جاهز للنسخ واللصق - تثبيت إشعارات مدين العملاء

**Instructions:** Copy each script below **COMPLETELY** and paste into Supabase SQL Editor

---

## ⚠️ IMPORTANT - Read First!

**DO NOT** select partial code!  
**DO NOT** run incomplete scripts!  

✅ **CORRECT:** Copy the **ENTIRE** script from `CREATE OR REPLACE` to the final semicolon `;`  
❌ **WRONG:** Selecting only part of the function

---

## 📝 How to Execute

For each script below:

1. **Select ALL** the code (from `CREATE OR REPLACE` to the last `;`)
2. **Copy** (Ctrl+C)
3. **Open Supabase SQL Editor:**
   ```
   https://supabase.com/dashboard/project/hfvsbsizokxontflgdyn/sql
   ```
4. **Paste** (Ctrl+V)
5. **Click "Run"**
6. **Wait for success message**
7. **Move to next script**

---

## 🔧 Script 1 of 3: Apply Debit Note Function

**File:** `scripts/097b_apply_debit_note_function.sql`

**What it does:**
- Creates the main function to apply debit notes
- Creates journal entries for revenue recognition
- Enforces separation of duties
- Updates invoice balances

**Status:** ⏳ Pending

**Action:** 
1. Open file: `scripts/097b_apply_debit_note_function.sql`
2. Select ALL content (Ctrl+A)
3. Copy (Ctrl+C)
4. Paste into Supabase SQL Editor
5. Click "Run"

---

## 🔧 Script 2 of 3: Create Debit Note Function

**File:** `scripts/098_create_customer_debit_note_function.sql`

**What it does:**
- Creates the main function to create debit notes
- Handles JSONB items array
- Auto-generates debit note numbers
- Creates in DRAFT status (no journal entry)

**Status:** ⏳ Pending

**Action:**
1. Open file: `scripts/098_create_customer_debit_note_function.sql`
2. Select ALL content (Ctrl+A)
3. Copy (Ctrl+C)
4. Paste into Supabase SQL Editor
5. Click "Run"

---

## 🔧 Script 3 of 3: Guards & Constraints

**File:** `scripts/099_customer_debit_notes_guards.sql`

**What it does:**
- Creates unique indexes
- Adds time-lock validation (90 days)
- Enforces business rules
- Prevents duplicate debit notes

**Status:** ⏳ Pending

**Action:**
1. Open file: `scripts/099_customer_debit_notes_guards.sql`
2. Select ALL content (Ctrl+A)
3. Copy (Ctrl+C)
4. Paste into Supabase SQL Editor
5. Click "Run"

---

## ✅ Verification After Installation

After executing all 3 scripts, run this query to verify:

```sql
-- Check all functions exist
SELECT 
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_name LIKE '%debit%'
  AND routine_schema = 'public'
ORDER BY routine_name;

-- Expected results (11 functions):
-- 1. apply_customer_debit_note
-- 2. approve_customer_debit_note
-- 3. calculate_customer_debit_note_totals
-- 4. create_customer_debit_note
-- 5. generate_customer_debit_note_number
-- 6. prevent_customer_debit_note_deletion
-- 7. reject_customer_debit_note
-- 8. submit_debit_note_for_approval
-- 9. sync_customer_debit_note_applied_amount
-- 10. update_customer_debit_note_status
-- 11. check_invoice_time_lock (from guards)
-- 12. prevent_direct_debit_application (from guards)
```

---

## 🎯 Quick Checklist

- [ ] Script 1: `097b_apply_debit_note_function.sql` executed
- [ ] Script 2: `098_create_customer_debit_note_function.sql` executed
- [ ] Script 3: `099_customer_debit_notes_guards.sql` executed
- [ ] Verification query shows all functions
- [ ] No errors in Supabase SQL Editor

---

## 🆘 Troubleshooting

### Error: "unterminated dollar-quoted string"
**Cause:** You selected only part of the function  
**Solution:** Select the **ENTIRE** file content and try again

### Error: "function already exists"
**Cause:** Script was already executed  
**Solution:** This is OK! The script uses `CREATE OR REPLACE` so it will update the function

### Error: "relation does not exist"
**Cause:** Scripts 096 and 097 were not executed first  
**Solution:** Check that tables exist:
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_name LIKE 'customer_debit%';
```

---

## 📚 Next Steps After Installation

1. ✅ Read the Quick Start Guide:
   - [START_HERE_CUSTOMER_DEBIT_NOTES.md](START_HERE_CUSTOMER_DEBIT_NOTES.md)

2. ✅ Test the system:
   - Create a test debit note
   - Submit for approval
   - Approve it
   - Apply to invoice

3. ✅ Review the FAQ:
   - [CUSTOMER_DEBIT_NOTES_FAQ.md](CUSTOMER_DEBIT_NOTES_FAQ.md)

---

**Good luck! 🚀**

