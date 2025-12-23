# 🔧 تصحيح النظام المحاسبي - دليل التطبيق السريع

## 🎯 الهدف
تصحيح حساب الأرباح ليتوافق مع المعايير المحاسبية الدولية (Odoo / Zoho Books / Next ERP)

---

## ⚠️ المشكلة
```
❌ المشتريات تُسجل كمصروف (Expense)
❌ COGS = 0 (لا يُسجل عند البيع)
❌ الربح مضخم بشكل خاطئ
```

## ✅ الحل
```
✅ المشتريات → المخزون (Asset)
✅ عند البيع → COGS يُسجل تلقائيًا
✅ الربح = المبيعات - COGS - المصروفات
```

---

## 🚀 خطوات التطبيق

### الطريقة 1: استخدام واجهة المستخدم (موصى بها)

1. **افتح المتصفح وانتقل إلى:**
   ```
   http://localhost:3000/settings/fix-cogs
   ```

2. **اضغط على "تطبيق التصحيحات"**

3. **انتظر حتى تكتمل العملية**

4. **تحقق من النتائج**

---

### الطريقة 2: تطبيق السكريبتات يدويًا

#### 1️⃣ تطبيق Trigger للـ COGS التلقائي
```bash
# PowerShell
$env:PGPASSWORD="your_password"
psql -h localhost -U postgres -d your_database -f scripts/011_auto_cogs_trigger.sql
```

#### 2️⃣ تطبيق دالة إصلاح البيانات القديمة
```bash
psql -h localhost -U postgres -d your_database -f scripts/012_fix_historical_cogs.sql
```

#### 3️⃣ تحديث دالة Income Statement
```bash
psql -h localhost -U postgres -d your_database -f scripts/enhanced_reports_system.sql
```

#### 4️⃣ تشغيل دالة الإصلاح
```sql
-- استبدل YOUR_COMPANY_ID بمعرف شركتك
SELECT * FROM fix_historical_cogs('YOUR_COMPANY_ID');
```

---

## 📊 التحقق من النجاح

### 1. فحص عدد قيود COGS المُنشأة:
```sql
SELECT COUNT(*) as cogs_entries
FROM journal_entries
WHERE reference_type = 'invoice_cogs';
```

### 2. فحص الأرباح الصحيحة:
```sql
SELECT 
  SUM(CASE WHEN coa.account_type = 'income' 
      THEN jel.credit_amount - jel.debit_amount ELSE 0 END) as revenue,
  SUM(CASE WHEN coa.sub_type IN ('cogs', 'cost_of_goods_sold') 
      THEN jel.debit_amount - jel.credit_amount ELSE 0 END) as cogs,
  SUM(CASE WHEN coa.account_type = 'expense' AND coa.sub_type NOT IN ('cogs', 'cost_of_goods_sold')
      THEN jel.debit_amount - jel.credit_amount ELSE 0 END) as expenses
FROM journal_entry_lines jel
JOIN chart_of_accounts coa ON jel.account_id = coa.id
WHERE coa.company_id = 'YOUR_COMPANY_ID';
```

### 3. فحص معاملات البيع بدون COGS:
```sql
SELECT COUNT(*) as sales_without_cogs
FROM inventory_transactions it
JOIN products p ON it.product_id = p.id
WHERE it.transaction_type = 'sale'
  AND p.item_type != 'service'
  AND it.journal_entry_id IS NULL;
```
**النتيجة المتوقعة**: `0` (جميع المعاملات لها قيود COGS)

---

## 📁 الملفات المُنشأة

```
scripts/
├── 011_auto_cogs_trigger.sql          # Trigger للـ COGS التلقائي
└── 012_fix_historical_cogs.sql        # إصلاح البيانات القديمة

app/
├── api/fix-cogs-accounting/route.ts   # API للتصحيح
└── settings/fix-cogs/page.tsx         # واجهة المستخدم

docs/
└── COGS_ACCOUNTING_FIX.md             # التوثيق الكامل
```

---

## 🔍 مثال عملي

### قبل التصحيح:
```
شراء بضاعة: 5,000 ج.م
بيع بضاعة:  10,000 ج.م
مصروفات:    2,000 ج.م

الربح الظاهر: 10,000 - 2,000 = 8,000 ج.م ❌ (خطأ!)
```

### بعد التصحيح:
```
شراء بضاعة: 5,000 ج.م → المخزون (Asset)
بيع بضاعة:  10,000 ج.م
COGS:        5,000 ج.م (تلقائي)
مصروفات:    2,000 ج.م

الربح الصحيح: 10,000 - 5,000 - 2,000 = 3,000 ج.م ✅
```

---

## ⚡ نصائح مهمة

1. **قبل التطبيق**: احفظ نسخة احتياطية من قاعدة البيانات
   ```bash
   pg_dump -U postgres your_database > backup_before_cogs_fix.sql
   ```

2. **بعد التطبيق**: تحقق من التقارير المالية
   - Simple Report: `/reports/simple-summary`
   - Income Statement: `/reports/income-statement`

3. **للمنتجات الجديدة**: تأكد من تحديد `cost_price` صحيح

4. **الخدمات (Services)**: لا تتأثر بالـ COGS (صحيح محاسبيًا)

---

## 🆘 حل المشاكل

### المشكلة: "COGS accounts not found"
**الحل**: تأكد من وجود حساب COGS في شجرة الحسابات
```sql
INSERT INTO chart_of_accounts (
  company_id, account_code, account_name, 
  account_type, sub_type, normal_balance
) VALUES (
  'YOUR_COMPANY_ID', '5000', 'تكلفة البضاعة المباعة',
  'expense', 'cost_of_goods_sold', 'debit'
);
```

### المشكلة: "cost_price = 0"
**الحل**: حدّث أسعار التكلفة للمنتجات
```sql
UPDATE products 
SET cost_price = unit_price * 0.6  -- مثال: 60% من سعر البيع
WHERE cost_price = 0 OR cost_price IS NULL;
```

---

## 📞 الدعم

للمزيد من المعلومات، راجع:
- [التوثيق الكامل](docs/COGS_ACCOUNTING_FIX.md)
- [Odoo Accounting](https://www.odoo.com/documentation/16.0/applications/finance/accounting.html)
- [GAAP Standards](https://www.investopedia.com/terms/c/cogs.asp)

---

## ✅ قائمة التحقق

- [ ] تطبيق Trigger للـ COGS التلقائي
- [ ] إصلاح البيانات القديمة
- [ ] تحديث دالة Income Statement
- [ ] التحقق من قيود COGS
- [ ] التحقق من الأرباح الصحيحة
- [ ] اختبار التقارير المالية
- [ ] توثيق التغييرات

---

**تاريخ التطبيق**: 2025-12-23  
**الإصدار**: 1.0  
**الحالة**: ✅ جاهز للتطبيق

