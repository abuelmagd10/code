# ❓ Frequently Asked Questions - Vendor Credits System

## 📋 General Questions

### Q1: What is a Vendor Credit?
**A:** A Vendor Credit (also called Credit Note or Supplier Credit) is a document issued when goods are returned to a supplier. It represents an amount the supplier owes you, which can be applied to future purchases.

### Q2: Why do we need this system?
**A:** Before this system, bill returns existed but no corresponding vendor credits were created. This made it difficult to:
- Track what suppliers owe us
- Apply credits to future bills
- Maintain accurate financial records
- Pass audits

### Q3: How many Vendor Credits were created?
**A:** 4 Vendor Credits were created, totaling 139,800 EGP across 3 companies.

### Q4: Is the system live in production?
**A:** Yes! The system was successfully deployed on January 6, 2026, and is fully operational.

---

## 🔧 Technical Questions

### Q5: How are Vendor Credits created?
**A:** Vendor Credits are created automatically using database functions:
- **Automatic:** When a bill has a return, the system can create a VC automatically
- **Manual:** You can also trigger creation using SQL functions

### Q6: Can I create a Vendor Credit manually?
**A:** Yes, you can use this SQL command:
```sql
SELECT create_vendor_credit_from_bill_return('bill-id-here'::UUID);
```

### Q7: What happens if I try to create a duplicate Vendor Credit?
**A:** The system prevents duplicates. If you try to create a VC for a bill that already has one, it will return the existing VC ID instead of creating a new one.

### Q8: Can I delete a Vendor Credit?
**A:** Only if it's in 'draft' or 'cancelled' status. Vendor Credits with status 'open', 'applied', or 'closed' cannot be deleted to protect financial records.

### Q9: Can I delete a Bill that has a Vendor Credit?
**A:** No. The system prevents deletion of bills that have associated Vendor Credits. You must first delete or cancel the Vendor Credit.

### Q10: How do I cancel a Vendor Credit instead of deleting it?
**A:** Use this SQL command:
```sql
UPDATE vendor_credits
SET status = 'cancelled', updated_at = NOW()
WHERE id = 'vendor-credit-id';
```

---

## 💰 Financial Questions

### Q11: How much in Vendor Credits do we have?
**A:** Currently, there are 139,800 EGP in Vendor Credits across 4 credits:
- FOODCAN: 5,000 EGP
- VitaSlims: 4,800 EGP
- تست: 130,000 EGP (2 credits)

### Q12: Are the amounts accurate?
**A:** Yes! All amounts have been verified to match exactly with the returned amounts from the source bills. The system includes automatic validation to ensure accuracy.

### Q13: Can I apply a Vendor Credit to a bill?
**A:** Yes, but the application logic depends on your business process. The system tracks:
- `total_amount`: Total credit available
- `applied_amount`: Amount already used
- Remaining: `total_amount - applied_amount`

### Q14: What if I try to apply more than the available credit?
**A:** The database has a check constraint that prevents `applied_amount` from exceeding `total_amount`.

---

## 🔍 Verification Questions

### Q15: How do I verify the system is working?
**A:** Run the quick verification script:
```bash
psql -f quick_verify.sql
```
All tests should show ✅ PASS.

### Q16: How do I check how many Vendor Credits exist?
**A:** Use this SQL query:
```sql
SELECT COUNT(*) FROM vendor_credits WHERE reference_type = 'bill_return';
```
Expected result: 4

### Q17: How do I see all Vendor Credits?
**A:** Use this SQL query:
```sql
SELECT 
  vc.credit_number,
  c.name as company,
  s.name as supplier,
  vc.total_amount,
  vc.applied_amount,
  vc.status
FROM vendor_credits vc
JOIN companies c ON c.id = vc.company_id
JOIN suppliers s ON s.id = vc.supplier_id
WHERE vc.reference_type = 'bill_return'
ORDER BY c.name;
```

---

## 🛡️ Security & Protection Questions

### Q18: What protections are in place?
**A:** The system has 4 layers of protection:
1. **Unique Index:** Prevents duplicate credits
2. **Check Constraints:** Validates amounts
3. **Triggers:** Prevents unauthorized deletion
4. **Referential Integrity:** Prevents orphaned records

### Q19: Can someone accidentally create a duplicate credit?
**A:** No. The unique index prevents this at the database level.

### Q20: Can someone delete a Vendor Credit by mistake?
**A:** No. The trigger prevents deletion of credits with status 'open', 'applied', or 'closed'.

### Q21: What if someone tries to create a credit with a negative amount?
**A:** The check constraint will reject it with an error.

---

## 📊 Reporting Questions

### Q22: How do I get a summary of all Vendor Credits?
**A:** Use this query:
```sql
SELECT 
  c.name as company,
  COUNT(vc.id) as total_credits,
  SUM(vc.total_amount) as total_amount,
  SUM(vc.applied_amount) as applied_amount,
  SUM(vc.total_amount - vc.applied_amount) as remaining
FROM vendor_credits vc
JOIN companies c ON c.id = vc.company_id
WHERE vc.reference_type = 'bill_return'
GROUP BY c.name;
```

### Q23: How do I find unapplied Vendor Credits?
**A:** Use this query:
```sql
SELECT 
  vc.credit_number,
  c.name as company,
  vc.total_amount,
  vc.applied_amount,
  (vc.total_amount - vc.applied_amount) as remaining
FROM vendor_credits vc
JOIN companies c ON c.id = vc.company_id
WHERE vc.reference_type = 'bill_return'
  AND vc.applied_amount < vc.total_amount
ORDER BY remaining DESC;
```

---

## 🔧 Troubleshooting Questions

### Q24: I get "Vendor Credit already exists" - is this an error?
**A:** No, this is expected behavior. The system is telling you that a Vendor Credit already exists for that bill, preventing duplicates.

### Q25: I get "Cannot delete Vendor Credit" - what should I do?
**A:** This is a protection feature. If you really need to remove it:
1. Change status to 'cancelled'
2. Then you can delete it

### Q26: I get "Cannot delete bill with vendor credits" - what should I do?
**A:** You must first delete or cancel the associated Vendor Credits before deleting the bill.

### Q27: The function doesn't exist - what happened?
**A:** Re-run the creation script:
```bash
psql -f scripts/094_create_vendor_credits_from_existing_returns.sql
```

### Q28: How do I check if all guards are active?
**A:** Run the verification script:
```bash
psql -f quick_verify.sql
```
It will check all indexes, constraints, and triggers.

---

## 📚 Documentation Questions

### Q29: Where can I find all the documentation?
**A:** See `VENDOR_CREDITS_INDEX.md` for a complete list of all documentation files.

### Q30: Is there documentation in Arabic?
**A:** Yes! See `ملخص_نهائي_Vendor_Credits.md` for a complete summary in Arabic.

### Q31: Where can I find SQL commands for daily use?
**A:** See `USEFUL_COMMANDS.md` for a comprehensive collection of useful SQL commands.

### Q32: Where is the technical implementation guide?
**A:** See `VENDOR_CREDITS_DB_MIGRATION_GUIDE.md` for step-by-step technical details.

---

## 🚀 Future Questions

### Q33: Can this system handle sales returns too?
**A:** Currently it's designed for bill returns (purchase returns). Sales returns would need a similar but separate system.

### Q34: Can we automate credit application?
**A:** Yes, this could be added in the future. The current system tracks available credits, making automation possible.

### Q35: Can we generate reports automatically?
**A:** Yes, all the data is in the database. You can create automated reports using the queries in `USEFUL_COMMANDS.md`.

---

## 💡 Best Practices Questions

### Q36: Should I create Vendor Credits manually or automatically?
**A:** Use the automatic function (`create_vendor_credits_for_all_returns()`) to ensure consistency and avoid errors.

### Q37: How often should I verify the system?
**A:** Run `quick_verify.sql` weekly or after any major changes to ensure everything is working correctly.

### Q38: Should I delete or cancel Vendor Credits?
**A:** Always prefer cancelling over deleting. Cancelling maintains the audit trail.

### Q39: What should I do before making changes to the database?
**A:** Always:
1. Backup the database
2. Test in development first
3. Review the documentation
4. Run verification after changes

---

## 📞 Support Questions

### Q40: Who do I contact for help?
**A:** 
1. First, check this FAQ
2. Then, review `USEFUL_COMMANDS.md`
3. Check `VENDOR_CREDITS_DB_MIGRATION_GUIDE.md` for troubleshooting
4. Contact your database administrator

### Q41: Where can I report a bug?
**A:** Document the issue with:
- What you were trying to do
- What happened
- Error messages
- Steps to reproduce
Then contact your development team.

### Q42: Can I suggest improvements?
**A:** Yes! Document your suggestion with:
- Current behavior
- Desired behavior
- Business justification
- Expected impact

---

## 🎯 Quick Reference

### Most Common Commands:

**Check Vendor Credits count:**
```sql
SELECT COUNT(*) FROM vendor_credits WHERE reference_type = 'bill_return';
```

**View all Vendor Credits:**
```sql
SELECT * FROM vendor_credits WHERE reference_type = 'bill_return';
```

**Create Vendor Credit for a bill:**
```sql
SELECT create_vendor_credit_from_bill_return('bill-id'::UUID);
```

**Verify system health:**
```bash
psql -f quick_verify.sql
```

---

**Last Updated:** 2026-01-06  
**Version:** 1.0.0

**For more information, see:** `VENDOR_CREDITS_INDEX.md`

