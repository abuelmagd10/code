# دليل تطبيق التحديثات: ERP Professional Upgrade
# ERP Professional Upgrade - Application Guide

**تاريخ الإنشاء:** 2025-01-27  
**الحالة:** ✅ جاهز للتطبيق

---

## 📋 نظرة عامة

هذا الدليل يوضح كيفية تطبيق التحديثات التي تحول المشروع إلى ERP احترافي بدون كسر الأنماط.

**⚠️ مهم:** تأكد من عمل نسخة احتياطية من قاعدة البيانات قبل التطبيق!

---

## 🔄 خطوات التطبيق

### 1️⃣ تطبيق SQL Scripts

**⚠️ مهم:** استخدم ملفات SQL فقط من مجلد `scripts/` - لا تستخدم ملفات Markdown (.md)

#### الطريقة 1: تطبيق الملفات بشكل منفصل

قم بتطبيق الملفات بالترتيب التالي:

```bash
# 1. إقفال الفترات المحاسبية
psql -d your_database -f scripts/080_accounting_periods.sql

# 2. تحسينات Audit Trail
psql -d your_database -f scripts/081_enhanced_audit_trail.sql

# 3. Views للعرض المالي
psql -d your_database -f scripts/082_invoice_financial_view.sql

# 4. اختبارات القواعد الحرجة
psql -d your_database -f scripts/083_critical_rules_tests.sql
```

#### الطريقة 2: تطبيق جميع الملفات دفعة واحدة

استخدم الملف الموحد `APPLY_ERP_UPGRADE.sql`:

```bash
psql -d your_database -f APPLY_ERP_UPGRADE.sql
```

**ملاحظة:** إذا كنت تستخدم Supabase SQL Editor:
1. افتح كل ملف SQL من مجلد `scripts/` بشكل منفصل
2. قم بتشغيله بالترتيب المذكور أعلاه
3. لا تحاول تشغيل ملفات Markdown (.md) - هذه ملفات توثيق فقط

### 2️⃣ التحقق من التطبيق

بعد تطبيق جميع الملفات، قم بتشغيل الاختبارات:

```sql
-- تشغيل جميع الاختبارات
SELECT * FROM run_all_critical_tests();
```

**النتيجة المتوقعة:**
- ✅ جميع الاختبارات يجب أن تعرض `PASS`
- ❌ أي اختبار يفشل = خطأ يمنع الدمج

### 3️⃣ التحقق من الـ API Routes

الـ API Routes الجديدة موجودة في:
- ✅ `app/api/accounting-periods/route.ts`
- ✅ `app/api/accounting-periods/lock/route.ts`
- ✅ `app/api/accounting-periods/unlock/route.ts`

**لا حاجة لتطبيق أي شيء** - الملفات موجودة وجاهزة للاستخدام.

---

## ✅ Checklist التحقق

### بعد التطبيق، تحقق من:

#### 1. جدول الفترات المحاسبية
```sql
-- التحقق من وجود الجدول
SELECT * FROM accounting_periods LIMIT 1;
```

#### 2. Triggers الحماية
```sql
-- التحقق من وجود Triggers
SELECT tgname FROM pg_trigger 
WHERE tgname IN (
  'trg_prevent_invoice_closed_period',
  'trg_prevent_payment_closed_period',
  'trg_prevent_journal_closed_period',
  'trg_prevent_inventory_closed_period'
);
```

#### 3. Views للعرض المالي
```sql
-- التحقق من وجود Views
SELECT * FROM invoice_financial_view LIMIT 1;
SELECT * FROM invoice_summary_view LIMIT 1;
SELECT * FROM invoice_monthly_summary_view LIMIT 1;
SELECT * FROM customer_balance_view LIMIT 1;
```

#### 4. Audit Trail المحسّن
```sql
-- التحقق من وجود Triggers الجديدة
SELECT tgname FROM pg_trigger 
WHERE tgname IN (
  'audit_products_price_changes',
  'audit_invoices_status_changes',
  'audit_bills_status_changes',
  'audit_purchase_orders_status_changes',
  'audit_customers_detailed'
);
```

---

## 🧪 اختبارات يدوية

### اختبار 1: إقفال الفترة المحاسبية

```sql
-- 1. إنشاء فترة محاسبية
INSERT INTO accounting_periods (
  company_id,
  period_name,
  period_start,
  period_end,
  status
) VALUES (
  'your-company-id',
  'يناير 2025',
  '2025-01-01',
  '2025-01-31',
  'open'
);

-- 2. إغلاق الفترة
SELECT close_accounting_period(
  'period-id',
  'user-id',
  'ملاحظات إغلاق الفترة'
);

-- 3. محاولة إنشاء فاتورة في الفترة المغلقة (يجب أن يفشل)
INSERT INTO invoices (
  company_id,
  customer_id,
  invoice_number,
  invoice_date,
  due_date,
  total_amount
) VALUES (
  'your-company-id',
  'customer-id',
  'INV-001',
  '2025-01-15', -- داخل الفترة المغلقة
  '2025-02-15',
  1000
);
-- يجب أن يظهر خطأ: "الفترة المحاسبية مغلقة"
```

### اختبار 2: Audit Trail

```sql
-- 1. تعديل سعر منتج
UPDATE products 
SET unit_price = 150 
WHERE id = 'product-id';

-- 2. التحقق من تسجيل التغيير
SELECT * FROM audit_logs 
WHERE target_table = 'products' 
  AND action = 'UPDATE'
ORDER BY created_at DESC 
LIMIT 1;
-- يجب أن يحتوي على old_data و new_data للأسعار
```

### اختبار 3: Views للعرض المالي

```sql
-- استخدام View للعرض المالي
SELECT 
  invoice_number,
  original_total,
  total_returns,
  net_invoice_total,
  paid_amount,
  customer_credit,
  payment_status
FROM invoice_financial_view
WHERE company_id = 'your-company-id'
LIMIT 10;
```

---

## 🚨 استكشاف الأخطاء

### مشكلة: Triggers لا تعمل

**الحل:**
```sql
-- التحقق من وجود Functions
SELECT proname FROM pg_proc 
WHERE proname IN (
  'check_period_lock',
  'can_modify_transaction',
  'prevent_invoice_in_closed_period'
);

-- إعادة إنشاء Triggers إذا لزم الأمر
-- (راجع scripts/080_accounting_periods.sql)
```

### مشكلة: Views لا تعمل

**الحل:**
```sql
-- التحقق من وجود الجداول المطلوبة
SELECT table_name FROM information_schema.tables 
WHERE table_name IN ('invoices', 'sales_returns', 'customers');

-- إعادة إنشاء Views إذا لزم الأمر
-- (راجع scripts/082_invoice_financial_view.sql)
```

### مشكلة: RLS Policies تمنع الوصول

**الحل:**
```sql
-- التحقق من RLS Policies
SELECT * FROM pg_policies 
WHERE tablename = 'accounting_periods';

-- التحقق من عضوية المستخدم
SELECT * FROM company_members 
WHERE company_id = 'your-company-id' 
  AND user_id = 'your-user-id';
```

---

## 📚 المراجع

- **تقرير المراجعة:** `ERP_PROFESSIONAL_UPGRADE_REVIEW.md`
- **تقرير التحقق النهائي:** `ERP_PROFESSIONAL_UPGRADE_FINAL_REPORT.md`
- **SQL Scripts:**
  - `scripts/080_accounting_periods.sql`
  - `scripts/081_enhanced_audit_trail.sql`
  - `scripts/082_invoice_financial_view.sql`
  - `scripts/083_critical_rules_tests.sql`

---

## ✅ الخلاصة

بعد تطبيق جميع التحديثات:

1. ✅ **إقفال الفترات المحاسبية** - يعمل بشكل صحيح
2. ✅ **Audit Trail محسّن** - يسجل جميع العمليات الحرجة
3. ✅ **Views للعرض المالي** - جاهزة للاستخدام
4. ✅ **اختبارات تلقائية** - جميع الاختبارات تمر

**المشروع الآن ERP احترافي جاهز للإنتاج! 🎉**

---

**⚠️ تذكير:** تأكد من عمل نسخة احتياطية قبل التطبيق!
