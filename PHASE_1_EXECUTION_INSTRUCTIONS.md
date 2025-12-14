# تعليمات تنفيذ Phase 1 - Supabase SQL Editor
# Phase 1 Execution Instructions

**تاريخ الإنشاء:** 2025-01-27  
**المنصة:** Supabase SQL Editor  
**الحالة:** ✅ جاهز للتنفيذ

---

## ⚠️ ملاحظة مهمة

**Supabase SQL Editor لا يدعم أوامر psql مثل:**
- `\echo`
- `\i`
- `\set`

**يجب استخدام SQL خام فقط!**

---

## 🎯 الطريقة الموصى بها (الخيار الأفضل)

### استخدام الملف الموحد النظيف

1. **فتح Supabase Dashboard**
   - الدخول إلى المشروع
   - Database → SQL Editor

2. **فتح الملف النظيف**
   - `scripts/apply_phase1_fixes_clean.sql`
   - هذا الملف **نظيف تماماً** بدون أي أوامر `\`

3. **نسخ ولصق**
   - نسخ محتوى الملف كاملاً
   - لصقه في SQL Editor
   - الضغط على **Run**

4. **التحقق من النتائج**
   - يجب أن ترى رسالة نجاح في نهاية الملف
   - يجب أن ترى نتائج استعلامات التحقق (Functions, Triggers, Constraints)

---

## 📋 الطريقة البديلة (تنفيذ منفصل)

إذا أردت تنفيذ الملفات منفصلة، استخدم الترتيب التالي:

### 1. `scripts/011_journal_entry_balance_check.sql`
- ✅ الملف نظيف - لا يحتوي على أوامر `\`
- نسخ ولصق في SQL Editor
- Run

### 2. `scripts/012_prevent_invoice_edit_after_journal.sql`
- ✅ الملف نظيف - لا يحتوي على أوامر `\`
- نسخ ولصق في SQL Editor
- Run

### 3. `scripts/013_inventory_sale_reference_constraint.sql`
- ✅ الملف نظيف - لا يحتوي على أوامر `\`
- نسخ ولصق في SQL Editor
- Run

### 4. `scripts/014_prevent_inventory_for_cancelled_invoices.sql`
- ✅ الملف نظيف - لا يحتوي على أوامر `\`
- نسخ ولصق في SQL Editor
- Run

---

## ✅ التحقق من التطبيق

بعد التنفيذ، نفذ هذا الاستعلام للتحقق:

```sql
-- التحقق من Functions
SELECT 
  proname as function_name,
  CASE 
    WHEN proname = 'check_journal_entry_balance' THEN '✓'
    WHEN proname = 'prevent_invoice_edit_after_journal' THEN '✓'
    WHEN proname = 'prevent_inventory_for_cancelled' THEN '✓'
    ELSE '✗'
  END as status
FROM pg_proc
WHERE proname IN (
  'check_journal_entry_balance',
  'prevent_invoice_edit_after_journal',
  'prevent_inventory_for_cancelled'
);

-- التحقق من Triggers
SELECT 
  tgname as trigger_name,
  CASE 
    WHEN tgname LIKE '%journal_balance%' THEN '✓'
    WHEN tgname = 'trg_prevent_invoice_edit_after_journal' THEN '✓'
    WHEN tgname = 'trg_prevent_inventory_for_cancelled' THEN '✓'
    ELSE '✗'
  END as status
FROM pg_trigger
WHERE tgname IN (
  'trg_check_journal_balance_insert',
  'trg_check_journal_balance_update',
  'trg_check_journal_balance_delete',
  'trg_prevent_invoice_edit_after_journal',
  'trg_prevent_inventory_for_cancelled'
);

-- التحقق من Constraints
SELECT 
  conname as constraint_name,
  CASE 
    WHEN conname LIKE '%reference%' THEN '✓'
    ELSE '✗'
  END as status
FROM pg_constraint
WHERE conrelid = 'inventory_transactions'::regclass
AND conname LIKE '%reference%';
```

**النتيجة المتوقعة:** يجب أن ترى ✓ لجميع العناصر

---

## 🧪 بعد التطبيق مباشرة

1. **تنفيذ الاختبارات**
   - فتح `PHASE_1_TEST_CHECKLIST.md`
   - تنفيذ جميع الاختبارات المذكورة
   - توثيق النتائج

2. **توثيق النتائج**
   - فتح `PHASE_1_APPLICATION_RESULTS.md`
   - ملء جميع الحقول
   - التوقيع والاعتماد

---

## ✅ معايير النجاح

بعد التنفيذ، يجب أن:

- ✅ لا توجد أخطاء SQL
- ✅ جميع Functions موجودة (3 functions)
- ✅ جميع Triggers موجودة (5 triggers)
- ✅ جميع Constraints موجودة (4 constraints)
- ✅ الاختبارات تنجح كما هو متوقع

---

## 🚨 استكشاف الأخطاء

### خطأ: "function already exists"
**الحل:** هذا طبيعي - الملفات تستخدم `CREATE OR REPLACE FUNCTION`

### خطأ: "constraint already exists"
**الحل:** الملفات تتحقق من الوجود قبل الإضافة - يجب أن يعمل بدون مشاكل

### خطأ: "relation does not exist"
**الحل:** تأكد من أن الجداول موجودة (invoices, bills, journal_entries, etc.)

---

## 📝 الخلاصة

**الملف الموصى به:** `scripts/apply_phase1_fixes_clean.sql`

**الخطوات:**
1. نسخ الملف
2. لصق في Supabase SQL Editor
3. Run
4. التحقق من النتائج
5. تنفيذ الاختبارات
6. توثيق النتائج

---

**✅ جاهز للتنفيذ!**

