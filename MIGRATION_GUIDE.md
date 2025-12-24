# 🔄 FIFO Migration Guide (Zoho Books Compatible)

## 📋 نظرة عامة

هذا الدليل يشرح كيفية ترحيل نظام المخزون من **Average Cost** إلى **FIFO** (First In First Out) لمطابقة Zoho Books.

---

## ⚠️ قبل البدء

### 1. **Backup قاعدة البيانات**
```sql
-- في Supabase Dashboard → Database → Backups
-- أو استخدم pg_dump
```

### 2. **التحقق من البيئة**
- ✅ Supabase Project: `hfvsbsizokxontflgdyn`
- ✅ Region: `us-east-1`
- ✅ Database: PostgreSQL 15+

---

## 🚀 خطوات التنفيذ

### **الخطوة 1: تنفيذ FIFO System Script**

1. افتح **Supabase Dashboard**
2. اذهب إلى **SQL Editor**
3. انسخ محتوى `scripts/320_fifo_cost_lots_system.sql`
4. نفذ الـ Script

**ما سيتم إنشاؤه:**
- ✅ جدول `fifo_cost_lots` (دفعات الشراء)
- ✅ جدول `fifo_lot_consumptions` (استهلاك الدفعات)
- ✅ دوال: `consume_fifo_lots()`, `reverse_fifo_consumption()`, `calculate_fifo_cogs()`
- ✅ دوال الترحيل: `migrate_existing_purchases_to_fifo()`, `create_opening_stock_fifo_lots()`
- ✅ Views: `v_fifo_lots_summary`, `v_fifo_consumption_details`
- ✅ Triggers: `trg_create_fifo_lot_on_purchase`

---

### **الخطوة 2: ترحيل المشتريات الموجودة**

```sql
-- تنفيذ في SQL Editor
SELECT * FROM migrate_existing_purchases_to_fifo();
```

**النتيجة المتوقعة:**
```
products_migrated | lots_created | total_value
------------------|--------------|-------------
        50        |      120     |  150000.00
```

**ما يحدث:**
- يجلب جميع فواتير الشراء (Bills) من جدول `bills` و `bill_items`
- ينشئ دفعة FIFO لكل منتج في كل فاتورة
- يحسب `unit_cost` من `(line_total / quantity)`

---

### **الخطوة 3: إنشاء دفعات للمخزون الافتتاحي**

```sql
-- للمنتجات التي لها مخزون ولكن بدون فواتير شراء
SELECT * FROM create_opening_stock_fifo_lots();
```

**النتيجة المتوقعة:**
```
products_processed | lots_created | total_value
-------------------|--------------|-------------
        15         |      15      |   25000.00
```

**ما يحدث:**
- يجلب المنتجات التي لها `quantity_on_hand > 0`
- ينشئ دفعة افتتاحية بـ `cost_price` من جدول `products`
- يضع `lot_type = 'opening_stock'`

---

### **الخطوة 4: التحقق من النتائج**

#### **4.1 عرض ملخص الدفعات:**
```sql
SELECT * FROM v_fifo_lots_summary
ORDER BY product_name, lot_date;
```

**مثال على النتيجة:**
```
product_name    | lot_date   | original_qty | remaining_qty | unit_cost | total_value
----------------|------------|--------------|---------------|-----------|-------------
Product A       | 2024-01-01 |     100      |      50       |   10.00   |    500.00
Product A       | 2024-01-15 |      50      |      50       |   12.00   |    600.00
Product B       | 2024-01-10 |      30      |      20       |   15.00   |    300.00
```

#### **4.2 عرض تفاصيل الاستهلاك:**
```sql
SELECT * FROM v_fifo_consumption_details
WHERE consumption_date >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY consumption_date DESC;
```

#### **4.3 التحقق من COGS:**
```sql
-- مقارنة COGS القديم (Average Cost) مع FIFO
SELECT 
  p.name,
  p.cost_price AS avg_cost,
  COALESCE(
    (SELECT SUM(unit_cost * remaining_quantity) / NULLIF(SUM(remaining_quantity), 0)
     FROM fifo_cost_lots 
     WHERE product_id = p.id AND remaining_quantity > 0),
    p.cost_price
  ) AS fifo_weighted_avg
FROM products p
WHERE p.item_type = 'product'
ORDER BY p.name;
```

---

## 🧪 اختبار النظام

### **Test 1: إنشاء فاتورة شراء جديدة**

1. اذهب إلى **Bills** → **New Bill**
2. أضف منتج: 10 وحدات × 100 جنيه
3. احفظ الفاتورة

**التحقق:**
```sql
SELECT * FROM fifo_cost_lots 
WHERE reference_type = 'bill' 
ORDER BY created_at DESC 
LIMIT 1;
```

**النتيجة المتوقعة:**
- ✅ دفعة جديدة تم إنشاؤها تلقائياً
- ✅ `original_quantity = 10`
- ✅ `remaining_quantity = 10`
- ✅ `unit_cost = 100`

---

### **Test 2: إنشاء فاتورة مبيعات**

1. اذهب إلى **Invoices** → **New Invoice**
2. أضف نفس المنتج: 5 وحدات × 150 جنيه (سعر البيع)
3. احفظ الفاتورة وحدث الحالة إلى **Paid**

**التحقق:**
```sql
-- 1. التحقق من استهلاك الدفعة
SELECT * FROM fifo_lot_consumptions 
WHERE reference_type = 'invoice' 
ORDER BY created_at DESC 
LIMIT 1;

-- 2. التحقق من تحديث remaining_quantity
SELECT * FROM fifo_cost_lots 
WHERE product_id = 'YOUR_PRODUCT_ID'
ORDER BY lot_date;

-- 3. التحقق من قيد COGS
SELECT * FROM journal_entry_lines jel
JOIN journal_entries je ON je.id = jel.journal_entry_id
WHERE je.reference_type = 'cogs'
ORDER BY je.created_at DESC
LIMIT 5;
```

**النتيجة المتوقعة:**
- ✅ `remaining_quantity` انخفضت من 10 إلى 5
- ✅ سجل في `fifo_lot_consumptions` بـ `quantity_consumed = 5`
- ✅ قيد COGS بقيمة `5 × 100 = 500` جنيه

---

### **Test 3: مرتجع مبيعات (Sales Return)**

1. اذهب إلى الفاتورة المدفوعة
2. اضغط **Partial Return**
3. أدخل:
   - **Return Qty**: 2 وحدات (حالة جيدة)
   - **Damaged**: 1 وحدة (تالفة)
4. اضغط **Process Return**

**التحقق:**
```sql
-- 1. التحقق من عكس الاستهلاك
SELECT * FROM fifo_cost_lots 
WHERE product_id = 'YOUR_PRODUCT_ID';
-- remaining_quantity يجب أن يزيد بـ 2 (فقط الحالة الجيدة)

-- 2. التحقق من قيد عكس COGS
SELECT * FROM journal_entry_lines jel
JOIN journal_entries je ON je.id = jel.journal_entry_id
WHERE je.reference_type = 'sales_return'
ORDER BY je.created_at DESC
LIMIT 10;

-- 3. التحقق من رصيد العميل
SELECT * FROM customer_credits
ORDER BY created_at DESC
LIMIT 1;
```

**النتيجة المتوقعة:**
- ✅ `remaining_quantity` زادت بـ 2 (الحالة الجيدة فقط)
- ✅ قيد عكس COGS: مدين المخزون، دائن COGS بقيمة `2 × 100 = 200`
- ✅ رصيد دائن للعميل بقيمة `3 × 150 = 450` (شامل التالفة)

---

## ✅ Checklist

- [ ] تنفيذ `320_fifo_cost_lots_system.sql`
- [ ] تنفيذ `migrate_existing_purchases_to_fifo()`
- [ ] تنفيذ `create_opening_stock_fifo_lots()`
- [ ] التحقق من `v_fifo_lots_summary`
- [ ] اختبار فاتورة شراء جديدة
- [ ] اختبار فاتورة مبيعات
- [ ] اختبار مرتجع مبيعات (حالة جيدة)
- [ ] اختبار مرتجع مبيعات (تالفة)
- [ ] مقارنة COGS القديم مع الجديد

---

## 🆘 استكشاف الأخطاء

### **خطأ: "relation fifo_cost_lots does not exist"**
**الحل:** تأكد من تنفيذ `320_fifo_cost_lots_system.sql` أولاً

### **خطأ: "remaining_quantity cannot be negative"**
**الحل:** تحقق من أن المخزون كافي قبل البيع

### **خطأ: "No FIFO lots available"**
**الحل:** نفذ `create_opening_stock_fifo_lots()` للمنتجات بدون فواتير شراء

---

## 📞 الدعم

إذا واجهت أي مشاكل، تحقق من:
1. Supabase Logs: Dashboard → Logs
2. Browser Console: F12 → Console
3. Network Tab: F12 → Network

---

**تم إنشاء هذا الدليل بواسطة:** Augment Agent
**التاريخ:** 2025-12-24

