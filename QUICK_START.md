# 🚀 دليل التطبيق السريع - تصحيح COGS

## ⚡ التطبيق السريع (3 دقائق)

### الطريقة 1: استخدام السكريبت التلقائي (موصى بها)

#### على Windows (PowerShell):
```powershell
.\apply-cogs-fix.ps1
```

#### على Linux/Mac:
```bash
chmod +x apply-cogs-fix.sh
./apply-cogs-fix.sh
```

**ملاحظة:** السكريبت سيطلب منك:
1. معلومات الاتصال بقاعدة البيانات (Supabase أو محلية)
2. Company ID لتطبيق الإصلاح

---

### الطريقة 2: استخدام Supabase Dashboard

1. **افتح Supabase Dashboard:**
   - انتقل إلى: https://app.supabase.com
   - اختر مشروعك
   - افتح **SQL Editor**

2. **طبّق السكريبتات بالترتيب:**

   **أ) Trigger للـ COGS التلقائي:**
   - انسخ محتوى `scripts/011_auto_cogs_trigger.sql`
   - الصقه في SQL Editor
   - اضغط **Run** (أو Ctrl+Enter)

   **ب) دالة إصلاح البيانات القديمة:**
   - انسخ محتوى `scripts/012_fix_historical_cogs.sql`
   - الصقه في SQL Editor
   - اضغط **Run**

   **ج) تحديث Income Statement:**
   - انسخ محتوى `scripts/enhanced_reports_system.sql`
   - الصقه في SQL Editor
   - اضغط **Run**

3. **شغّل دالة الإصلاح:**
   ```sql
   -- استبدل YOUR_COMPANY_ID بمعرف شركتك
   SELECT * FROM fix_historical_cogs('YOUR_COMPANY_ID');
   ```

---

### الطريقة 3: استخدام واجهة المستخدم

1. **شغّل التطبيق:**
   ```bash
   npm run dev
   ```

2. **افتح المتصفح:**
   ```
   http://localhost:3000/settings/fix-cogs
   ```

3. **اضغط على "تطبيق التصحيحات"**

---

## ✅ التحقق من النجاح

### 1. فحص قيود COGS:
```sql
SELECT COUNT(*) as cogs_entries
FROM journal_entries
WHERE reference_type = 'invoice_cogs';
```
**النتيجة المتوقعة:** عدد > 0

### 2. فحص معاملات البيع بدون COGS:
```sql
SELECT COUNT(*) as sales_without_cogs
FROM inventory_transactions it
JOIN products p ON it.product_id = p.id
WHERE it.transaction_type = 'sale'
  AND p.item_type != 'service'
  AND it.journal_entry_id IS NULL;
```
**النتيجة المتوقعة:** 0

---

## 🔍 الحصول على Company ID

### من Supabase Dashboard:
```sql
SELECT id, name FROM companies;
```

### من التطبيق:
- افتح: `/settings/company`
- انسخ Company ID من الإعدادات

---

## 🐛 حل المشاكل الشائعة

### المشكلة: "psql: command not found"
**الحل:**
- **Windows:** ثبّت PostgreSQL من https://www.postgresql.org/download/windows/
- **Mac:** `brew install postgresql`
- **Linux:** `sudo apt-get install postgresql-client`

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

### المشكلة: "permission denied"
**الحل:**
```sql
-- منح صلاحيات
GRANT EXECUTE ON FUNCTION fix_historical_cogs TO authenticated;
GRANT EXECUTE ON FUNCTION auto_create_cogs_journal TO authenticated;
```

---

## 📊 مثال عملي

### قبل التصحيح:
```
المبيعات:    10,000 ج.م
COGS:             0 ج.م  ❌
المصروفات:    2,000 ج.م
الربح:        8,000 ج.م  ❌ (خطأ!)
```

### بعد التصحيح:
```
المبيعات:    10,000 ج.م
COGS:         5,000 ج.م  ✅
المصروفات:    2,000 ج.م
الربح:        3,000 ج.م  ✅ (صحيح!)
```

---

## 📚 التوثيق الكامل

للمزيد من التفاصيل:
- **دليل التطبيق:** `COGS_FIX_README.md`
- **التوثيق الكامل:** `docs/COGS_ACCOUNTING_FIX.md`
- **سجل التغييرات:** `CHANGELOG_COGS_FIX.md`
- **تطبيق Supabase:** `SUPABASE_DEPLOYMENT.md`

---

## 🆘 الدعم

إذا واجهت مشاكل:
1. راجع `COGS_FIX_README.md` → قسم "حل المشاكل"
2. تحقق من Supabase Logs
3. راجع التوثيق الكامل في `docs/COGS_ACCOUNTING_FIX.md`

---

## ⚠️ تحذيرات مهمة

1. **احفظ نسخة احتياطية** من قاعدة البيانات قبل التطبيق:
   ```bash
   pg_dump -U postgres your_database > backup.sql
   ```

2. **اختبر على بيئة تطوير** أولاً قبل التطبيق على الإنتاج

3. **تأكد من تحديد cost_price** لجميع المنتجات

---

## ✅ قائمة التحقق

- [ ] نسخة احتياطية من قاعدة البيانات
- [ ] تطبيق Trigger للـ COGS
- [ ] تطبيق دالة الإصلاح
- [ ] تحديث Income Statement
- [ ] تشغيل دالة الإصلاح
- [ ] التحقق من قيود COGS
- [ ] اختبار التقارير المالية

---

**تاريخ الإصدار:** 2025-12-23  
**الإصدار:** 1.0  
**الحالة:** ✅ جاهز للتطبيق

