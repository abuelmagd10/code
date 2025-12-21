# تقرير مراجعة شاملة لجداول قاعدة البيانات
# Database Tables Comprehensive Review Report

**تاريخ المراجعة:** 2025-01-28  
**الهدف:** ضمان التوافق الكامل مع النمط المحاسبي الصارم

---

## 📊 الجداول المراجعة

### ✅ الجداول الأساسية (موجودة ومتوافقة)

| الجدول | الحالة | الملاحظات |
|--------|--------|-----------|
| `companies` | ✅ متوافق | جدول أساسي سليم |
| `company_members` | ✅ متوافق | نظام الصلاحيات سليم |
| `chart_of_accounts` | ✅ متوافق | الشجرة المحاسبية سليمة |
| `customers` | ✅ متوافق | جدول العملاء سليم |
| `suppliers` | ✅ متوافق | جدول الموردين سليم |
| `products` | ✅ متوافق | جدول المنتجات سليم |

---

## 🔧 الجداول التي تحتاج إصلاح

### 1️⃣ جدول `invoices` (فواتير البيع)

**المشاكل المكتشفة:**
- ❌ عمود `returned_amount` مفقود
- ❌ عمود `return_status` مفقود  
- ❌ عمود `branch_id` مفقود
- ❌ عمود `cost_center_id` مفقود
- ❌ عمود `warehouse_id` مفقود

**الإصلاح المطلوب:**
```sql
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS returned_amount DECIMAL(15,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS return_status VARCHAR(20);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id);
```

---

### 2️⃣ جدول `invoice_items` (بنود فواتير البيع)

**المشاكل المكتشفة:**
- ❌ عمود `returned_quantity` مفقود

**الإصلاح المطلوب:**
```sql
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS returned_quantity DECIMAL(15,2) DEFAULT 0;
```

---

### 3️⃣ جدول `bills` (فواتير الشراء)

**المشاكل المكتشفة:**
- ❌ عمود `returned_amount` مفقود
- ❌ عمود `return_status` مفقود
- ❌ عمود `branch_id` مفقود
- ❌ عمود `cost_center_id` مفقود
- ❌ عمود `warehouse_id` مفقود

**الإصلاح المطلوب:**
```sql
ALTER TABLE bills ADD COLUMN IF NOT EXISTS returned_amount DECIMAL(15,2) DEFAULT 0;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS return_status VARCHAR(20);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id);
```

---

### 4️⃣ جدول `bill_items` (بنود فواتير الشراء)

**المشاكل المكتشفة:**
- ❌ عمود `returned_quantity` مفقود

**الإصلاح المطلوب:**
```sql
ALTER TABLE bill_items ADD COLUMN IF NOT EXISTS returned_quantity DECIMAL(15,2) DEFAULT 0;
```

---

### 5️⃣ جدول `sales_orders` (أوامر البيع)

**المشاكل المكتشفة:**
- ❌ عمود `branch_id` مفقود
- ❌ عمود `cost_center_id` مفقود
- ❌ عمود `warehouse_id` مفقود

**الإصلاح المطلوب:**
```sql
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id);
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id);
```

---

### 6️⃣ جدول `purchase_orders` (أوامر الشراء)

**المشاكل المكتشفة:**
- ❌ عمود `branch_id` مفقود
- ❌ عمود `cost_center_id` مفقود
- ❌ عمود `warehouse_id` مفقود

**الإصلاح المطلوب:**
```sql
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id);
```

---

### 7️⃣ جدول `inventory_transactions` (حركات المخزون)

**المشاكل المكتشفة:**
- ❌ عمود `reference_type` مفقود
- ❌ عمود `document_id` مفقود
- ❌ عمود `branch_id` مفقود
- ❌ عمود `warehouse_id` مفقود

**الإصلاح المطلوب:**
```sql
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS reference_type VARCHAR(50);
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS document_id UUID;
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id);
```

---

### 8️⃣ جدول `journal_entries` (القيود المحاسبية)

**المشاكل المكتشفة:**
- ❌ عمود `branch_id` مفقود
- ❌ عمود `cost_center_id` مفقود

**الإصلاح المطلوب:**
```sql
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id);
```

---

### 9️⃣ جدول `payments` (المدفوعات)

**المشاكل المكتشفة:**
- ❌ عمود `branch_id` مفقود
- ❌ عمود `cost_center_id` مفقود
- ❌ عمود `account_id` مفقود

**الإصلاح المطلوب:**
```sql
ALTER TABLE payments ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES chart_of_accounts(id);
```

---

## 🆕 الجداول المفقودة

### 1️⃣ جدول `vendor_credits` (أرصدة الموردين الدائنة)

**المشكلة:** الجدول غير موجود ويسبب خطأ 42703

**الحل:**
```sql
CREATE TABLE vendor_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  bill_id UUID REFERENCES bills(id) ON DELETE SET NULL,
  credit_number VARCHAR(50) NOT NULL,
  credit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  applied_amount DECIMAL(15,2) DEFAULT 0,
  remaining_amount DECIMAL(15,2) GENERATED ALWAYS AS (total_amount - applied_amount) STORED,
  status VARCHAR(20) DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

### 2️⃣ جدول `customer_credits` (أرصدة العملاء الدائنة)

**المشكلة:** مطلوب لمعالجة مرتجعات المبيعات

**الحل:**
```sql
CREATE TABLE customer_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  credit_number VARCHAR(50) NOT NULL,
  credit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  used_amount DECIMAL(15,2) DEFAULT 0,
  remaining_amount DECIMAL(15,2) GENERATED ALWAYS AS (total_amount - used_amount) STORED,
  status VARCHAR(20) DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 📋 الفهارس المطلوبة

### الفهارس المفقودة:
```sql
-- فهارس الفروع ومراكز التكلفة والمخازن
CREATE INDEX idx_invoices_branch ON invoices(branch_id);
CREATE INDEX idx_invoices_cost_center ON invoices(cost_center_id);
CREATE INDEX idx_invoices_warehouse ON invoices(warehouse_id);

CREATE INDEX idx_bills_branch ON bills(branch_id);
CREATE INDEX idx_bills_cost_center ON bills(cost_center_id);
CREATE INDEX idx_bills_warehouse ON bills(warehouse_id);

CREATE INDEX idx_sales_orders_branch ON sales_orders(branch_id);
CREATE INDEX idx_purchase_orders_branch ON purchase_orders(branch_id);

CREATE INDEX idx_inventory_transactions_branch ON inventory_transactions(branch_id);
CREATE INDEX idx_inventory_transactions_warehouse ON inventory_transactions(warehouse_id);

CREATE INDEX idx_journal_entries_branch ON journal_entries(branch_id);
CREATE INDEX idx_payments_branch ON payments(branch_id);

-- فهارس الجداول الجديدة
CREATE INDEX idx_vendor_credits_company ON vendor_credits(company_id);
CREATE INDEX idx_vendor_credits_supplier ON vendor_credits(supplier_id);
CREATE INDEX idx_customer_credits_company ON customer_credits(company_id);
CREATE INDEX idx_customer_credits_customer ON customer_credits(customer_id);
```

---

## 🔒 سياسات RLS المطلوبة

### للجداول الجديدة:
```sql
-- vendor_credits
ALTER TABLE vendor_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vendor_credits_select" ON vendor_credits
  FOR SELECT USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));

-- customer_credits  
ALTER TABLE customer_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customer_credits_select" ON customer_credits
  FOR SELECT USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));
```

---

## 🎯 خطة التنفيذ

### المرحلة 1: تشغيل السكريبت الشامل
1. **افتح Supabase SQL Editor**
2. **انسخ والصق محتوى:** `SUPABASE_COMPREHENSIVE_FIX.sql`
3. **اضغط Run**

### المرحلة 2: التحقق من النتائج
1. **تحقق من إنشاء الجداول الجديدة**
2. **تحقق من إضافة الأعمدة المفقودة**
3. **تحقق من إنشاء الفهارس**
4. **تحقق من تفعيل RLS**

### المرحلة 3: اختبار النظام
1. **اختبار الوصول لجدول vendor_credits**
2. **اختبار إنشاء فواتير مع الفروع والمخازن**
3. **اختبار المرتجعات**
4. **اختبار القيود المحاسبية**

---

## ✅ النتيجة المتوقعة

بعد تطبيق الإصلاحات:

- ✅ **اختفاء خطأ 42703** (vendor_credits not found)
- ✅ **دعم كامل للفروع ومراكز التكلفة والمخازن**
- ✅ **معالجة صحيحة للمرتجعات**
- ✅ **ربط صحيح بين الأوامر والفواتير**
- ✅ **تتبع دقيق لحركات المخزون**
- ✅ **قيود محاسبية مرتبطة بالفروع**
- ✅ **نظام أرصدة العملاء والموردين**

---

## 🚨 تحذيرات مهمة

1. **عمل نسخة احتياطية** من قاعدة البيانات قبل التنفيذ
2. **اختبار السكريبت** في بيئة تطوير أولاً
3. **التحقق من البيانات الموجودة** بعد التنفيذ
4. **مراقبة الأداء** بعد إضافة الفهارس الجديدة

---

**تاريخ الإصدار:** 2025-01-28  
**الإصدار:** 1.0  
**الحالة:** جاهز للتنفيذ ✅