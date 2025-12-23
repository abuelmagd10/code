# 🚀 تطبيق تصحيح COGS على Supabase

## 📋 المتطلبات
- حساب Supabase نشط
- صلاحيات Admin على المشروع
- نسخة احتياطية من قاعدة البيانات

---

## 🔧 الطريقة 1: استخدام Supabase Dashboard (موصى بها)

### 1️⃣ فتح SQL Editor
1. افتح [Supabase Dashboard](https://app.supabase.com)
2. اختر مشروعك
3. انتقل إلى **SQL Editor** من القائمة الجانبية

### 2️⃣ تطبيق Trigger للـ COGS التلقائي
1. انسخ محتوى ملف `scripts/011_auto_cogs_trigger.sql`
2. الصقه في SQL Editor
3. اضغط **Run** أو `Ctrl+Enter`
4. تحقق من الرسالة: `Success. No rows returned`

### 3️⃣ تطبيق دالة إصلاح البيانات القديمة
1. انسخ محتوى ملف `scripts/012_fix_historical_cogs.sql`
2. الصقه في SQL Editor
3. اضغط **Run**
4. تحقق من الرسالة: `Success. No rows returned`

### 4️⃣ تحديث دالة Income Statement
1. انسخ محتوى ملف `scripts/enhanced_reports_system.sql`
2. الصقه في SQL Editor
3. اضغط **Run**
4. تحقق من الرسالة: `Success. No rows returned`

### 5️⃣ تشغيل دالة الإصلاح
```sql
-- استبدل YOUR_COMPANY_ID بمعرف شركتك
SELECT * FROM fix_historical_cogs('YOUR_COMPANY_ID');
```

---

## 🔧 الطريقة 2: استخدام Supabase CLI

### 1️⃣ تثبيت Supabase CLI
```bash
# Windows (PowerShell)
scoop install supabase

# macOS
brew install supabase/tap/supabase

# Linux
brew install supabase/tap/supabase
```

### 2️⃣ تسجيل الدخول
```bash
supabase login
```

### 3️⃣ ربط المشروع
```bash
supabase link --project-ref YOUR_PROJECT_REF
```

### 4️⃣ تطبيق السكريبتات
```bash
# تطبيق Trigger
supabase db push --file scripts/011_auto_cogs_trigger.sql

# تطبيق دالة الإصلاح
supabase db push --file scripts/012_fix_historical_cogs.sql

# تحديث Income Statement
supabase db push --file scripts/enhanced_reports_system.sql
```

### 5️⃣ تشغيل دالة الإصلاح
```bash
supabase db execute "SELECT * FROM fix_historical_cogs('YOUR_COMPANY_ID');"
```

---

## 🔧 الطريقة 3: استخدام psql مباشرة

### 1️⃣ الحصول على Connection String
1. افتح Supabase Dashboard
2. انتقل إلى **Settings** → **Database**
3. انسخ **Connection string** (Direct connection)

### 2️⃣ الاتصال بقاعدة البيانات
```bash
# استبدل CONNECTION_STRING بالرابط الخاص بك
psql "CONNECTION_STRING"
```

### 3️⃣ تطبيق السكريبتات
```bash
# من داخل psql
\i scripts/011_auto_cogs_trigger.sql
\i scripts/012_fix_historical_cogs.sql
\i scripts/enhanced_reports_system.sql
```

### 4️⃣ تشغيل دالة الإصلاح
```sql
SELECT * FROM fix_historical_cogs('YOUR_COMPANY_ID');
```

---

## ✅ التحقق من النجاح

### 1. فحص الـ Trigger
```sql
-- يجب أن يظهر trg_auto_cogs_on_sale
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table
FROM information_schema.triggers
WHERE trigger_name = 'trg_auto_cogs_on_sale';
```

### 2. فحص الدالة
```sql
-- يجب أن تظهر fix_historical_cogs
SELECT 
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_name = 'fix_historical_cogs';
```

### 3. فحص قيود COGS
```sql
-- يجب أن يظهر عدد > 0
SELECT COUNT(*) as cogs_entries
FROM journal_entries
WHERE reference_type = 'invoice_cogs';
```

---

## 🔄 استخدام واجهة المستخدم

بعد تطبيق السكريبتات، يمكنك استخدام واجهة المستخدم:

1. **انتقل إلى:**
   ```
   https://your-app.vercel.app/settings/fix-cogs
   ```

2. **اضغط على "تطبيق التصحيحات"**

3. **تحقق من النتائج**

---

## 🔒 الأمان

### RLS (Row Level Security)
السكريبتات تستخدم `SECURITY DEFINER` لتجاوز RLS بشكل آمن.

### الصلاحيات
تأكد من أن المستخدم لديه صلاحيات:
```sql
-- منح صلاحيات التنفيذ
GRANT EXECUTE ON FUNCTION fix_historical_cogs TO authenticated;
GRANT EXECUTE ON FUNCTION auto_create_cogs_journal TO authenticated;
```

---

## 🐛 حل المشاكل

### المشكلة: "permission denied for function"
**الحل:**
```sql
-- منح صلاحيات
GRANT EXECUTE ON FUNCTION fix_historical_cogs TO authenticated;
```

### المشكلة: "COGS accounts not found"
**الحل:**
```sql
-- إنشاء حساب COGS
INSERT INTO chart_of_accounts (
  company_id, account_code, account_name, 
  account_type, sub_type, normal_balance, level
) VALUES (
  'YOUR_COMPANY_ID', '5000', 'تكلفة البضاعة المباعة',
  'expense', 'cost_of_goods_sold', 'debit', 3
);
```

### المشكلة: "trigger already exists"
**الحل:**
```sql
-- حذف الـ Trigger القديم
DROP TRIGGER IF EXISTS trg_auto_cogs_on_sale ON inventory_transactions;
-- ثم أعد تطبيق السكريبت
```

---

## 📊 مراقبة الأداء

### فحص عدد القيود المُنشأة
```sql
SELECT 
  DATE(created_at) as date,
  COUNT(*) as cogs_entries
FROM journal_entries
WHERE reference_type = 'invoice_cogs'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

### فحص الأداء
```sql
-- متوسط وقت تنفيذ الـ Trigger
EXPLAIN ANALYZE
SELECT * FROM inventory_transactions
WHERE transaction_type = 'sale'
LIMIT 1;
```

---

## 🔄 Rollback (التراجع)

إذا حدثت مشكلة، يمكنك التراجع:

### 1. حذف الـ Trigger
```sql
DROP TRIGGER IF EXISTS trg_auto_cogs_on_sale ON inventory_transactions;
DROP FUNCTION IF EXISTS auto_create_cogs_journal();
```

### 2. حذف قيود COGS المُنشأة
```sql
-- ⚠️ احذر: هذا سيحذف جميع قيود COGS
DELETE FROM journal_entry_lines
WHERE journal_entry_id IN (
  SELECT id FROM journal_entries
  WHERE reference_type = 'invoice_cogs'
);

DELETE FROM journal_entries
WHERE reference_type = 'invoice_cogs';
```

### 3. استعادة النسخة الاحتياطية
```bash
# إذا كان لديك نسخة احتياطية
psql "CONNECTION_STRING" < backup.sql
```

---

## 📝 ملاحظات مهمة

1. **النسخ الاحتياطي**: احفظ نسخة احتياطية قبل التطبيق
2. **الاختبار**: اختبر على بيئة تطوير أولاً
3. **الأداء**: الـ Trigger خفيف ولا يؤثر على الأداء
4. **الصيانة**: لا يحتاج صيانة دورية

---

## 🆘 الدعم

إذا واجهت مشاكل:
1. راجع [التوثيق الكامل](docs/COGS_ACCOUNTING_FIX.md)
2. تحقق من [Supabase Logs](https://app.supabase.com/project/_/logs)
3. استخدم SQL Editor للتحقق من الأخطاء

---

## ✅ قائمة التحقق

- [ ] نسخة احتياطية من قاعدة البيانات
- [ ] تطبيق Trigger للـ COGS
- [ ] تطبيق دالة الإصلاح
- [ ] تحديث Income Statement
- [ ] تشغيل دالة الإصلاح
- [ ] التحقق من قيود COGS
- [ ] اختبار التقارير المالية
- [ ] توثيق التغييرات

---

**تاريخ التطبيق**: 2025-12-23  
**الإصدار**: 1.0  
**الحالة**: ✅ جاهز للتطبيق على Supabase

