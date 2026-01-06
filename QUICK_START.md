# ⚡ Quick Start Guide - Vendor Credits System

## 🎯 What You Need to Know in 60 Seconds

### ✅ Status: **LIVE & WORKING**
- **4 Vendor Credits** created
- **139,800 EGP** tracked
- **0 errors**
- **100% success rate**

---

## 🚀 Quick Actions

### 1. Verify It's Working (30 seconds)
```bash
psql -f quick_verify.sql
```
✅ All tests should show "PASS"

### 2. View All Vendor Credits (10 seconds)
```sql
SELECT 
  credit_number,
  total_amount,
  status
FROM vendor_credits
WHERE reference_type = 'bill_return';
```
Expected: 4 rows

### 3. Check Total Amount (5 seconds)
```sql
SELECT SUM(total_amount) 
FROM vendor_credits 
WHERE reference_type = 'bill_return';
```
Expected: 139,800

---

## 📊 What Was Created

| Company | Credit # | Amount | Status |
|---------|----------|--------|--------|
| FOODCAN | FOO-VC-0001 | 5,000 | open |
| VitaSlims | VIT-VC-0001 | 4,800 | open |
| تست | VC-VC-0001 | 100,000 | open |
| تست | VC-VC-0002 | 30,000 | open |

---

## 🔒 What's Protected

✅ **Can't create duplicates** - Unique index prevents it  
✅ **Can't delete active credits** - Trigger blocks it  
✅ **Can't use negative amounts** - Check constraint stops it  
✅ **Can't delete bills with credits** - Trigger prevents it

---

## 📚 Need More Info?

### Quick Reference:
- **Commands:** `USEFUL_COMMANDS.md`
- **FAQ:** `FAQ.md`
- **Arabic:** `ملخص_نهائي_Vendor_Credits.md`

### Detailed Docs:
- **Full Guide:** `VENDOR_CREDITS_DB_MIGRATION_GUIDE.md`
- **Success Report:** `VENDOR_CREDITS_MIGRATION_SUCCESS_2026-01-06.md`
- **All Files:** `VENDOR_CREDITS_INDEX.md`

---

## 🛠️ Common Tasks

### Create Vendor Credit for New Bill Return
```sql
SELECT create_vendor_credit_from_bill_return('bill-id-here'::UUID);
```

### Find Unapplied Credits
```sql
SELECT 
  credit_number,
  total_amount - applied_amount as remaining
FROM vendor_credits
WHERE reference_type = 'bill_return'
  AND applied_amount < total_amount;
```

### Get Summary by Company
```sql
SELECT 
  c.name,
  COUNT(vc.id) as credits,
  SUM(vc.total_amount) as total
FROM vendor_credits vc
JOIN companies c ON c.id = vc.company_id
WHERE vc.reference_type = 'bill_return'
GROUP BY c.name;
```

---

## ✅ Quick Checklist

- [ ] Run `quick_verify.sql` - All pass?
- [ ] Check count - Shows 4?
- [ ] Check total - Shows 139,800?
- [ ] Review credits - All look correct?
- [ ] Read FAQ - Understand the system?

---

## 🎉 You're Ready!

The system is working perfectly. Use `USEFUL_COMMANDS.md` for daily operations.

**Questions?** → See `FAQ.md`  
**Need details?** → See `VENDOR_CREDITS_INDEX.md`  
**بالعربية؟** → See `ملخص_نهائي_Vendor_Credits.md`

---

**Status:** ✅ Production Ready  
**Last Updated:** 2026-01-06

