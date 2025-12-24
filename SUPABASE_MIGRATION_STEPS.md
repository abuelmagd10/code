# 🚀 خطوات تنفيذ FIFO Migration على Supabase

## 📋 نظرة عامة
هذا الدليل يشرح كيفية تنفيذ FIFO Migration على قاعدة بيانات Supabase الخاصة بك.

---

## ⚠️ قبل البدء

### 1. **Backup قاعدة البيانات**
1. افتح **Supabase Dashboard**: https://supabase.com/dashboard
2. اختر مشروعك: `hfvsbsizokxontflgdyn`
3. اذهب إلى **Database** → **Backups**
4. اضغط **Create Backup** (أو تأكد من وجود backup حديث)

### 2. **تأكد من الاتصال**
- ✅ Project ID: `hfvsbsizokxontflgdyn`
- ✅ Region: `us-east-1`
- ✅ Status: Active

---

## 🔧 الخطوة 1: تنفيذ FIFO System Script

### 1.1 افتح SQL Editor
1. اذهب إلى **Supabase Dashboard**
2. اختر مشروعك
3. من القائمة الجانبية، اضغط **SQL Editor**
4. اضغط **New Query**

### 1.2 نسخ وتنفيذ Script
1. افتح ملف `scripts/320_fifo_cost_lots_system.sql` من مشروعك
2. انسخ **كامل محتوى الملف** (532 سطر)
3. الصق المحتوى في SQL Editor
4. اضغط **Run** (أو Ctrl+Enter)

### 1.3 التحقق من النجاح
يجب أن ترى رسائل مثل:
```
CREATE TABLE
CREATE INDEX
CREATE FUNCTION
CREATE TRIGGER
CREATE VIEW
```

**إذا ظهرت أخطاء:**
- تأكد من نسخ الملف كاملاً
- تأكد من عدم وجود أخطاء في الصيغة
- تحقق من أن المستخدم لديه صلاحيات كافية

---

## 🔄 الخطوة 2: تنفيذ Migration Script

### 2.1 تنفيذ Script التلقائي
1. في **SQL Editor**، افتح **New Query**
2. افتح ملف `scripts/run_fifo_migration.sql`
3. انسخ **كامل محتوى الملف**
4. الصق في SQL Editor
5. اضغط **Run**

### 2.2 مراقبة التقدم
ستظهر رسائل مثل:
```
NOTICE: ========================================
NOTICE: 🚀 FIFO Migration Started
NOTICE: ========================================
NOTICE: Database: postgres
NOTICE: User: postgres
NOTICE: ========================================

NOTICE: ✅ FIFO tables exist

NOTICE: 📊 Pre-Migration Statistics:
NOTICE: ========================================
NOTICE: Total Products: 50
NOTICE: Total Bills (paid): 120
NOTICE: Existing FIFO Lots: 0
NOTICE: ========================================

NOTICE: 🔄 Step 1: Migrating Existing Purchases...
NOTICE: ========================================
NOTICE: ✅ Migration Complete:
NOTICE:    - Products Migrated: 50
NOTICE:    - Lots Created: 120
NOTICE:    - Total Value: 150000.00
NOTICE: ========================================

NOTICE: 🔄 Step 2: Creating Opening Stock Lots...
NOTICE: ========================================
NOTICE: ✅ Opening Stock Complete:
NOTICE:    - Products Processed: 15
NOTICE:    - Lots Created: 15
NOTICE:    - Total Value: 25000.00
NOTICE: ========================================

NOTICE: 📊 Post-Migration Statistics:
NOTICE: ========================================
NOTICE: Total FIFO Lots: 135
NOTICE: Total Inventory Value: 175000.00
NOTICE: Products with FIFO Lots: 65
NOTICE: ========================================

NOTICE: 🎉 FIFO Migration Completed Successfully!
```

### 2.3 التحقق من النتائج
في نفس SQL Editor، نفذ:
```sql
-- عرض ملخص الدفعات
SELECT * FROM v_fifo_lots_summary
ORDER BY product_name, lot_date
LIMIT 10;
```

يجب أن ترى جدول مثل:
```
product_name    | lot_date   | original_qty | remaining_qty | unit_cost | total_value
----------------|------------|--------------|---------------|-----------|-------------
Product A       | 2024-01-01 |     100      |      50       |   10.00   |    500.00
Product A       | 2024-01-15 |      50      |      50       |   12.00   |    600.00
Product B       | 2024-01-10 |      30      |      20       |   15.00   |    300.00
```

---

## 🧪 الخطوة 3: اختبار النظام

### 3.1 تنفيذ Test Script
1. في **SQL Editor**، افتح **New Query**
2. افتح ملف `scripts/test_fifo_system.sql`
3. انسخ **كامل محتوى الملف**
4. الصق في SQL Editor
5. اضغط **Run**

### 3.2 مراجعة نتائج الاختبار
ستظهر رسائل مثل:
```
NOTICE: ========================================
NOTICE: 🧪 Test 1: Checking Tables and Functions
NOTICE: ========================================
NOTICE: ✅ Table fifo_cost_lots exists
NOTICE: ✅ Table fifo_lot_consumptions exists
NOTICE: ✅ Function consume_fifo_lots exists
NOTICE: ✅ Function reverse_fifo_consumption exists
NOTICE: ========================================

NOTICE: ========================================
NOTICE: 🧪 Test 2: FIFO Calculation Logic
NOTICE: ========================================
NOTICE: Test Company ID: xxx
NOTICE: Test Product ID: yyy
NOTICE: ✅ Created test lots:
NOTICE:    Lot 1: 10 units @ 100 = 1000
NOTICE:    Lot 2: 5 units @ 120 = 600
NOTICE: ✅ Consumed 12 units
NOTICE:    Expected COGS: (10 × 100) + (2 × 120) = 1240
NOTICE:    Actual COGS: 1240
NOTICE: ✅ FIFO calculation is CORRECT!
NOTICE:    Lot 1 remaining: 0 (expected: 0)
NOTICE:    Lot 2 remaining: 3 (expected: 3)
NOTICE: ✅ Remaining quantities are CORRECT!
NOTICE: ✅ Test data cleaned up
NOTICE: ========================================

NOTICE: 🎉 All Tests Completed!
```

---

## ✅ الخطوة 4: التحقق النهائي

### 4.1 التحقق من البيانات
نفذ الاستعلامات التالية:

```sql
-- 1. عدد الدفعات المنشأة
SELECT COUNT(*) AS total_lots FROM fifo_cost_lots;

-- 2. إجمالي قيمة المخزون
SELECT 
  SUM(remaining_quantity * unit_cost) AS total_inventory_value
FROM fifo_cost_lots;

-- 3. المنتجات بدون دفعات (يجب أن يكون 0)
SELECT COUNT(*) AS products_without_lots
FROM products p
WHERE p.item_type = 'product'
  AND p.quantity_on_hand > 0
  AND NOT EXISTS (
    SELECT 1 FROM fifo_cost_lots fcl
    WHERE fcl.product_id = p.id AND fcl.remaining_quantity > 0
  );
```

### 4.2 مقارنة Average Cost vs FIFO
```sql
SELECT 
  p.name,
  p.cost_price AS avg_cost,
  COALESCE(
    (SELECT SUM(unit_cost * remaining_quantity) / NULLIF(SUM(remaining_quantity), 0)
     FROM fifo_cost_lots 
     WHERE product_id = p.id AND remaining_quantity > 0),
    p.cost_price
  ) AS fifo_weighted_avg,
  p.quantity_on_hand
FROM products p
WHERE p.item_type = 'product'
  AND p.quantity_on_hand > 0
ORDER BY p.name
LIMIT 10;
```

---

## 🎯 الخطوة 5: اختبار من التطبيق

### 5.1 تشغيل التطبيق
```bash
npm run dev
```

### 5.2 اختبار فاتورة شراء جديدة
1. اذهب إلى **Bills** → **New Bill**
2. أضف منتج: 10 وحدات × 100 جنيه
3. احفظ الفاتورة وحدث الحالة إلى **Paid**

**التحقق في Supabase:**
```sql
SELECT * FROM fifo_cost_lots 
WHERE reference_type = 'bill' 
ORDER BY created_at DESC 
LIMIT 1;
```

### 5.3 اختبار فاتورة مبيعات
1. اذهب إلى **Invoices** → **New Invoice**
2. أضف نفس المنتج: 5 وحدات × 150 جنيه
3. احفظ واجعلها **Paid**

**التحقق في Supabase:**
```sql
-- استهلاك الدفعة
SELECT * FROM fifo_lot_consumptions 
WHERE reference_type = 'invoice' 
ORDER BY created_at DESC 
LIMIT 1;

-- قيد COGS
SELECT * FROM journal_entry_lines jel
JOIN journal_entries je ON je.id = jel.journal_entry_id
WHERE je.reference_type = 'cogs'
ORDER BY je.created_at DESC
LIMIT 5;
```

### 5.4 اختبار مرتجع مبيعات
1. افتح الفاتورة المدفوعة
2. اضغط **Partial Return**
3. أدخل:
   - **Return Qty**: 2 وحدات (حالة جيدة)
   - **Damaged**: 1 وحدة (تالفة)
4. اضغط **Process Return**

**التحقق في Supabase:**
```sql
-- عكس الاستهلاك
SELECT * FROM fifo_cost_lots 
WHERE product_id = 'YOUR_PRODUCT_ID';
-- remaining_quantity يجب أن يزيد بـ 2

-- قيد عكس COGS
SELECT * FROM journal_entry_lines jel
JOIN journal_entries je ON je.id = jel.journal_entry_id
WHERE je.reference_type = 'sales_return'
ORDER BY je.created_at DESC
LIMIT 10;
```

### 5.5 اختبار تقرير Inventory Valuation
1. اذهب إلى **Reports** → **Inventory Valuation**
2. فعّل **Show FIFO Layers**
3. اضغط على ▶ بجانب أي منتج لعرض الطبقات
4. تحقق من:
   - ✅ عرض Avg. Cost و FIFO Avg.
   - ✅ عرض طبقات FIFO بالتفصيل
   - ✅ الإجماليات تظهر القيمتين

---

## 🎉 تم بنجاح!

إذا نجحت جميع الخطوات، فقد تم ترحيل نظامك بنجاح إلى FIFO!

**الخطوات التالية:**
- ✅ مراقبة النظام لبضعة أيام
- ✅ مقارنة التقارير القديمة مع الجديدة
- ✅ تدريب المستخدمين على الميزات الجديدة

---

**تم إنشاء هذا الدليل بواسطة:** Augment Agent  
**التاريخ:** 2025-12-24

