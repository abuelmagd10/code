# دليل تطبيق Phase 1: الإصلاحات الحرجة
# Phase 1 Deployment Guide

**تاريخ الإنشاء:** 2025-01-27  
**الحالة:** ✅ جاهز للتطبيق  
**المدة المقدرة:** 30-45 دقيقة (تطبيق + اختبار)

---

## ⚠️ تحذيرات مهمة قبل البدء

### 1. نسخة احتياطية إلزامية
**يجب عمل نسخة احتياطية كاملة من قاعدة البيانات قبل البدء.**

```sql
-- مثال (PostgreSQL):
pg_dump -U username -d database_name > backup_before_phase1.sql

-- أو من Supabase Dashboard:
-- Settings > Database > Backups > Create Backup
```

### 2. التحقق من البيانات الحالية
**تحقق من عدم وجود بيانات غير متوافقة:**

```sql
-- 1. التحقق من وجود قيود غير متوازنة
SELECT 
  je.id,
  je.description,
  SUM(jel.debit_amount) as total_debit,
  SUM(jel.credit_amount) as total_credit,
  ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) as difference
FROM journal_entries je
JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
GROUP BY je.id, je.description
HAVING ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) > 0.01;

-- إذا وجدت نتائج، يجب إصلاحها قبل التطبيق

-- 2. التحقق من وجود حركات مخزون بدون reference_id
SELECT id, transaction_type, reference_id, created_at
FROM inventory_transactions
WHERE transaction_type IN ('sale', 'sale_reversal', 'purchase', 'purchase_reversal')
AND reference_id IS NULL;

-- إذا وجدت نتائج، يجب إصلاحها قبل التطبيق

-- 3. التحقق من وجود حركات مخزون للفواتير الملغاة
SELECT 
  it.id,
  it.transaction_type,
  it.reference_id,
  i.invoice_number,
  i.status as invoice_status
FROM inventory_transactions it
JOIN invoices i ON i.id = it.reference_id
WHERE it.transaction_type IN ('sale', 'sale_reversal')
AND i.status = 'cancelled';

-- إذا وجدت نتائج، يجب إصلاحها قبل التطبيق
```

---

## 📋 خطوات التطبيق

### الخطوة 1: التحضير

1. **تأكد من الوصول لقاعدة البيانات:**
   ```bash
   # من Supabase Dashboard أو psql
   psql -h your-host -U your-user -d your-database
   ```

2. **تحقق من الملفات موجودة:**
   - `scripts/011_journal_entry_balance_check.sql`
   - `scripts/012_prevent_invoice_edit_after_journal.sql`
   - `scripts/013_inventory_sale_reference_constraint.sql`
   - `scripts/014_prevent_inventory_for_cancelled_invoices.sql`

### الخطوة 2: تطبيق القيود المحاسبية

**الترتيب مهم!** طبق الملفات بالترتيب التالي:

```sql
-- 1. تحقق من توازن القيود
\i scripts/011_journal_entry_balance_check.sql

-- التحقق من التطبيق:
SELECT proname FROM pg_proc WHERE proname = 'check_journal_entry_balance';
-- يجب أن ترى: check_journal_entry_balance

SELECT tgname FROM pg_trigger WHERE tgname LIKE '%journal_balance%';
-- يجب أن ترى: trg_check_journal_balance_insert, trg_check_journal_balance_update, trg_check_journal_balance_delete
```

```sql
-- 2. منع تعديل الفواتير بعد القيود
\i scripts/012_prevent_invoice_edit_after_journal.sql

-- التحقق من التطبيق:
SELECT proname FROM pg_proc WHERE proname = 'prevent_invoice_edit_after_journal';
-- يجب أن ترى: prevent_invoice_edit_after_journal

SELECT tgname FROM pg_trigger WHERE tgname = 'trg_prevent_invoice_edit_after_journal';
-- يجب أن ترى: trg_prevent_invoice_edit_after_journal
```

### الخطوة 3: تطبيق القيود المخزونية

```sql
-- 3. منع خروج مخزون بدون فاتورة
\i scripts/013_inventory_sale_reference_constraint.sql

-- التحقق من التطبيق:
SELECT conname FROM pg_constraint 
WHERE conrelid = 'inventory_transactions'::regclass 
AND conname LIKE '%reference%';
-- يجب أن ترى: check_sale_has_reference, check_sale_reversal_has_reference, check_purchase_has_reference, check_purchase_reversal_has_reference
```

```sql
-- 4. منع حركات مخزون للفواتير الملغاة
\i scripts/014_prevent_inventory_for_cancelled_invoices.sql

-- التحقق من التطبيق:
SELECT proname FROM pg_proc WHERE proname = 'prevent_inventory_for_cancelled';
-- يجب أن ترى: prevent_inventory_for_cancelled

SELECT tgname FROM pg_trigger WHERE tgname = 'trg_prevent_inventory_for_cancelled';
-- يجب أن ترى: trg_prevent_inventory_for_cancelled
```

---

## 🧪 الاختبارات الإلزامية

### اختبار 1: تحقق من توازن القيود ✅

```sql
-- اختبار 1.1: قيد متوازن (يجب أن يعمل)
BEGIN;
INSERT INTO journal_entries (company_id, reference_type, entry_date, description)
VALUES ('your-company-id', 'manual_entry', CURRENT_DATE, 'اختبار قيد متوازن')
RETURNING id;
-- احفظ الـ id

INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount)
VALUES 
  ('saved-id', 'account-1-id', 100, 0),
  ('saved-id', 'account-2-id', 0, 100);
-- يجب أن يعمل بدون أخطاء

ROLLBACK; -- للاختبار فقط
```

```sql
-- اختبار 1.2: قيد غير متوازن (يجب أن يفشل)
BEGIN;
INSERT INTO journal_entries (company_id, reference_type, entry_date, description)
VALUES ('your-company-id', 'manual_entry', CURRENT_DATE, 'اختبار قيد غير متوازن')
RETURNING id;
-- احفظ الـ id

INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount)
VALUES 
  ('saved-id', 'account-1-id', 100, 0),
  ('saved-id', 'account-2-id', 0, 50);
-- يجب أن يفشل مع رسالة: "القيد غير متوازن"

ROLLBACK;
```

**النتيجة المتوقعة:** ✅ الاختبار 1.1 يعمل، ❌ الاختبار 1.2 يفشل

---

### اختبار 2: منع تعديل الفواتير بعد القيود ✅

```sql
-- اختبار 2.1: إنشاء فاتورة وقيد محاسبي
BEGIN;
-- إنشاء فاتورة
INSERT INTO invoices (company_id, customer_id, invoice_number, invoice_date, due_date, subtotal, total_amount, status)
VALUES ('your-company-id', 'customer-id', 'TEST-001', CURRENT_DATE, CURRENT_DATE + 30, 1000, 1000, 'sent')
RETURNING id;
-- احفظ الـ id

-- إنشاء قيد محاسبي
INSERT INTO journal_entries (company_id, reference_type, reference_id, entry_date, description)
VALUES ('your-company-id', 'invoice', 'saved-invoice-id', CURRENT_DATE, 'قيد اختبار')
RETURNING id;
-- احفظ الـ id

-- محاولة تعديل الفاتورة (يجب أن يفشل)
UPDATE invoices 
SET subtotal = 2000, total_amount = 2000
WHERE id = 'saved-invoice-id';
-- يجب أن يفشل مع رسالة: "لا يمكن تعديل الفاتورة بعد إنشاء قيود محاسبية"

ROLLBACK;
```

```sql
-- اختبار 2.2: تعديل notes فقط (يجب أن يعمل)
BEGIN;
-- (نفس الخطوات أعلاه لإنشاء فاتورة وقيد)

-- تعديل notes فقط (يجب أن يعمل)
UPDATE invoices 
SET notes = 'ملاحظة جديدة'
WHERE id = 'saved-invoice-id';
-- يجب أن يعمل بدون أخطاء

ROLLBACK;
```

**النتيجة المتوقعة:** ❌ الاختبار 2.1 يفشل، ✅ الاختبار 2.2 يعمل

---

### اختبار 3: منع خروج مخزون بدون فاتورة ✅

```sql
-- اختبار 3.1: حركة بيع بدون reference_id (يجب أن يفشل)
BEGIN;
INSERT INTO inventory_transactions (
  company_id, 
  product_id, 
  transaction_type, 
  quantity_change, 
  reference_id
)
VALUES (
  'your-company-id',
  'product-id',
  'sale',
  -10,
  NULL  -- بدون reference_id
);
-- يجب أن يفشل مع رسالة constraint violation

ROLLBACK;
```

```sql
-- اختبار 3.2: حركة بيع مع reference_id (يجب أن يعمل)
BEGIN;
INSERT INTO inventory_transactions (
  company_id, 
  product_id, 
  transaction_type, 
  quantity_change, 
  reference_id
)
VALUES (
  'your-company-id',
  'product-id',
  'sale',
  -10,
  'invoice-id'  -- مع reference_id
);
-- يجب أن يعمل بدون أخطاء

ROLLBACK;
```

```sql
-- اختبار 3.3: حركة adjustment بدون reference_id (يجب أن يعمل - مسموح)
BEGIN;
INSERT INTO inventory_transactions (
  company_id, 
  product_id, 
  transaction_type, 
  quantity_change, 
  reference_id
)
VALUES (
  'your-company-id',
  'product-id',
  'adjustment',
  -5,
  NULL  -- adjustment مسموح بدون reference_id
);
-- يجب أن يعمل بدون أخطاء

ROLLBACK;
```

**النتيجة المتوقعة:** ❌ الاختبار 3.1 يفشل، ✅ الاختبار 3.2 يعمل، ✅ الاختبار 3.3 يعمل

---

### اختبار 4: منع حركات مخزون للفواتير الملغاة ✅

```sql
-- اختبار 4.1: حركة مخزون لفاتورة ملغاة (يجب أن يفشل)
BEGIN;
-- إنشاء فاتورة ملغاة
INSERT INTO invoices (company_id, customer_id, invoice_number, invoice_date, due_date, subtotal, total_amount, status)
VALUES ('your-company-id', 'customer-id', 'TEST-002', CURRENT_DATE, CURRENT_DATE + 30, 1000, 1000, 'cancelled')
RETURNING id;
-- احفظ الـ id

-- محاولة إنشاء حركة مخزون (يجب أن يفشل)
INSERT INTO inventory_transactions (
  company_id, 
  product_id, 
  transaction_type, 
  quantity_change, 
  reference_id
)
VALUES (
  'your-company-id',
  'product-id',
  'sale',
  -10,
  'saved-invoice-id'  -- فاتورة ملغاة
);
-- يجب أن يفشل مع رسالة: "لا يمكن إنشاء حركة مخزون لفاتورة ملغاة"

ROLLBACK;
```

```sql
-- اختبار 4.2: حركة مخزون لفاتورة عادية (يجب أن يعمل)
BEGIN;
-- إنشاء فاتورة عادية
INSERT INTO invoices (company_id, customer_id, invoice_number, invoice_date, due_date, subtotal, total_amount, status)
VALUES ('your-company-id', 'customer-id', 'TEST-003', CURRENT_DATE, CURRENT_DATE + 30, 1000, 1000, 'sent')
RETURNING id;
-- احفظ الـ id

-- إنشاء حركة مخزون (يجب أن يعمل)
INSERT INTO inventory_transactions (
  company_id, 
  product_id, 
  transaction_type, 
  quantity_change, 
  reference_id
)
VALUES (
  'your-company-id',
  'product-id',
  'sale',
  -10,
  'saved-invoice-id'  -- فاتورة عادية
);
-- يجب أن يعمل بدون أخطاء

ROLLBACK;
```

**النتيجة المتوقعة:** ❌ الاختبار 4.1 يفشل، ✅ الاختبار 4.2 يعمل

---

### اختبار 5: حماية API Endpoints ✅

**يجب اختبار من المتصفح أو Postman:**

1. **اختبار `/api/member-role`:**
   - محاولة تغيير دور عضو بدون صلاحيات → يجب أن يرجع 403
   - تغيير دور عضو مع صلاحيات owner/admin → يجب أن يعمل

2. **اختبار `/api/income-statement`:**
   - محاولة الوصول بدون تسجيل دخول → يجب أن يرجع 401
   - محاولة الوصول لشركة غير عضو فيها → يجب أن يرجع 403
   - الوصول لشركة عضو فيها → يجب أن يعمل

---

## ✅ قائمة التحقق النهائية

قبل اعتبار Phase 1 مكتملاً، تأكد من:

- [ ] تم عمل نسخة احتياطية من قاعدة البيانات
- [ ] تم تطبيق جميع ملفات SQL الأربعة بنجاح
- [ ] تم التحقق من وجود جميع Functions و Triggers و Constraints
- [ ] ✅ اختبار 1: تحقق من توازن القيود - نجح
- [ ] ✅ اختبار 2: منع تعديل الفواتير بعد القيود - نجح
- [ ] ✅ اختبار 3: منع خروج مخزون بدون فاتورة - نجح
- [ ] ✅ اختبار 4: منع حركات مخزون للفواتير الملغاة - نجح
- [ ] ✅ اختبار 5: حماية API Endpoints - نجح
- [ ] لا توجد أخطاء في سجلات قاعدة البيانات
- [ ] النظام يعمل بشكل طبيعي في بيئة التطوير

---

## 🚨 استكشاف الأخطاء

### مشكلة: فشل تطبيق constraint
**السبب:** قد تكون هناك بيانات موجودة غير متوافقة

**الحل:**
```sql
-- 1. تحقق من البيانات غير المتوافقة (استخدم الاستعلامات في بداية الدليل)
-- 2. أصلح البيانات يدوياً
-- 3. أعد تطبيق الملف
```

### مشكلة: Trigger لا يعمل
**السبب:** قد يكون هناك trigger آخر بنفس الاسم

**الحل:**
```sql
-- تحقق من Triggers الموجودة
SELECT tgname FROM pg_trigger WHERE tgname LIKE '%journal_balance%';

-- احذف الـ trigger القديم إذا لزم
DROP TRIGGER IF EXISTS old_trigger_name ON table_name;
```

### مشكلة: Function موجودة مسبقاً
**السبب:** قد تكون Function موجودة من قبل

**الحل:**
```sql
-- الملفات تستخدم CREATE OR REPLACE، لذا يجب أن تعمل
-- إذا فشلت، احذف Function يدوياً أولاً:
DROP FUNCTION IF EXISTS function_name CASCADE;
```

---

## 📝 سجل التطبيق

**تاريخ التطبيق:** _______________  
**المطبق بواسطة:** _______________  
**بيئة التطبيق:** [ ] Development [ ] Staging [ ] Production

**النتائج:**
- [ ] جميع الملفات طُبقت بنجاح
- [ ] جميع الاختبارات نجحت
- [ ] لا توجد أخطاء
- [ ] النظام يعمل بشكل طبيعي

**ملاحظات:**
_________________________________________________
_________________________________________________

---

## ✅ الخلاصة

بعد إكمال جميع الخطوات والاختبارات بنجاح:

**Phase 1 جاهز للإنتاج! ✅**

النظام الآن محمي بـ:
- ✅ قيود محاسبية متوازنة
- ✅ حماية الفواتير من التعديل بعد القيود
- ✅ حماية المخزون من الخروج بدون فاتورة
- ✅ حماية من حركات المخزون للفواتير الملغاة
- ✅ حماية API Endpoints بالصلاحيات

---

**📅 تاريخ الإنشاء:** 2025-01-27  
**✅ جاهز للتطبيق والاختبار**

