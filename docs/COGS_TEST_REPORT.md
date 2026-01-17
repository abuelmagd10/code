# تقرير اختبار نظام COGS Professional

## 📋 نظرة عامة

هذا المستند يحتوي على دليل الاختبارات الشاملة لنظام COGS Professional.

---

## 🧪 الاختبارات المطلوبة

### ✅ الاختبار 1: Purchase → Inventory In
**الهدف**: التحقق من إنشاء FIFO Lots عند الشراء

**الإجراءات**:
1. إنشاء/تحديث Bill (مشتريات)
2. تغيير حالة Bill إلى `sent`
3. التحقق من إنشاء FIFO Lots في `fifo_cost_lots`

**التحقق**:
```sql
SELECT COUNT(*) as fifo_lots_count
FROM fifo_cost_lots
WHERE reference_type = 'bill'
  AND reference_id = '[BILL_ID]';
```

**النتيجة المتوقعة**: 
- ✅ يجب أن يكون `fifo_lots_count > 0` لكل منتج مشترى

---

### ✅ الاختبار 2: Invoice Sent → FIFO → COGS Transactions
**الهدف**: التحقق من إنشاء COGS Transactions عند Invoice Sent

**الإجراءات**:
1. إنشاء Invoice جديدة (Draft)
2. إضافة منتجات (من منتجات لديها FIFO Lots)
3. تغيير حالة Invoice إلى `sent`
4. التحقق من:
   - استهلاك FIFO Lots
   - إنشاء COGS Transactions

**التحقق**:
```sql
-- التحقق من COGS Transactions
SELECT * FROM cogs_transactions
WHERE source_type = 'invoice'
  AND source_id = '[INVOICE_ID]';

-- التحقق من FIFO Consumption
SELECT * FROM fifo_lot_consumptions
WHERE reference_type = 'invoice'
  AND reference_id = '[INVOICE_ID]';

-- التحقق من تطابق COGS مع FIFO
SELECT 
  SUM(flc.total_cost) as fifo_total,
  SUM(ct.total_cost) as cogs_total
FROM fifo_lot_consumptions flc
LEFT JOIN cogs_transactions ct ON ct.fifo_consumption_id = flc.id
WHERE flc.reference_id = '[INVOICE_ID]';
```

**النتيجة المتوقعة**:
- ✅ `fifo_total = cogs_total` (مع تحمل 0.01 للأخطاء الحسابية)
- ✅ كل COGS Transaction له `branch_id`, `cost_center_id`, `warehouse_id`
- ✅ `unit_cost` من FIFO Lot وليس من `products.cost_price`

---

### ✅ الاختبار 3: Partial Payment → No Extra COGS
**الهدف**: التحقق من عدم إنشاء COGS إضافي عند الدفع الجزئي

**الإجراءات**:
1. Invoice `sent` (يوجد COGS Transactions)
2. تسجيل Partial Payment
3. التحقق من عدم إنشاء COGS Transactions جديدة

**التحقق**:
```sql
-- عدد COGS Transactions قبل وبعد الدفع
SELECT 
  COUNT(*) as cogs_count
FROM cogs_transactions
WHERE source_type = 'invoice'
  AND source_id = '[INVOICE_ID]';
```

**النتيجة المتوقعة**:
- ✅ نفس عدد COGS Transactions قبل وبعد الدفع
- ✅ لا COGS جديد عند الدفع الجزئي

---

### ✅ الاختبار 4: Full Payment
**الهدف**: التحقق من عدم إنشاء COGS إضافي عند الدفع الكامل

**الإجراءات**:
1. Invoice `sent` (يوجد COGS Transactions)
2. تسجيل Full Payment
3. التحقق من عدم إنشاء COGS Transactions جديدة

**النتيجة المتوقعة**:
- ✅ نفس عدد COGS Transactions قبل وبعد الدفع
- ✅ لا COGS جديد عند الدفع الكامل

---

### ✅ الاختبار 5: Partial Return → COGS Reversal
**الهدف**: التحقق من عكس COGS عند المرتجع الجزئي

**الإجراءات**:
1. Invoice `sent` أو `paid` (يوجد COGS Transactions)
2. إنشاء Partial Return
3. التحقق من:
   - إنشاء COGS Reversal Transactions (`source_type = 'return'`)
   - تطابق `unit_cost` مع COGS الأصلي

**التحقق**:
```sql
-- COGS الأصلي
SELECT 
  product_id,
  quantity,
  unit_cost,
  total_cost
FROM cogs_transactions
WHERE source_type = 'invoice'
  AND source_id = '[INVOICE_ID]';

-- COGS Reversal
SELECT 
  product_id,
  quantity,
  unit_cost,
  total_cost
FROM cogs_transactions
WHERE source_type = 'return'
  AND source_id = '[RETURN_ID]';
```

**النتيجة المتوقعة**:
- ✅ COGS Reversal موجود للمنتجات المرتجعة
- ✅ `unit_cost` في Reversal = `unit_cost` في COGS الأصلي (من FIFO)
- ✅ `total_cost` في Reversal متناسب مع الكمية المرتجعة

---

### ✅ الاختبار 6: Full Return → Complete COGS Reversal
**الهدف**: التحقق من عكس جميع COGS عند المرتجع الكامل

**الإجراءات**:
1. Invoice `sent` أو `paid` (يوجد COGS Transactions)
2. إنشاء Full Return
3. التحقق من عكس جميع COGS Transactions

**النتيجة المتوقعة**:
- ✅ جميع COGS Transactions الأصلي لها Reversal
- ✅ `total_cogs_returned = total_cogs_original`

---

## 📊 التحقق من التوازن

### Dashboard Stats
```sql
-- COGS من cogs_transactions (الجديد)
SELECT 
  company_id,
  SUM(total_cost) as total_cogs
FROM cogs_transactions
WHERE source_type = 'invoice'
  AND transaction_date >= '2024-01-01'
  AND transaction_date <= '2024-12-31'
GROUP BY company_id;
```

### Inventory Balance
```sql
-- التحقق من توازن المخزون والـ COGS
SELECT 
  p.name as product_name,
  SUM(CASE WHEN it.transaction_type = 'sale' THEN -it.quantity_change ELSE 0 END) as sold_quantity,
  SUM(CASE WHEN ct.source_type = 'invoice' THEN ct.quantity ELSE 0 END) as cogs_quantity,
  SUM(CASE WHEN ct.source_type = 'return' THEN ct.quantity ELSE 0 END) as returned_quantity
FROM products p
LEFT JOIN inventory_transactions it ON it.product_id = p.id
LEFT JOIN cogs_transactions ct ON ct.product_id = p.id
WHERE p.company_id = '[COMPANY_ID]'
GROUP BY p.id, p.name
HAVING ABS(
  SUM(CASE WHEN it.transaction_type = 'sale' THEN -it.quantity_change ELSE 0 END) -
  (SUM(CASE WHEN ct.source_type = 'invoice' THEN ct.quantity ELSE 0 END) - 
   SUM(CASE WHEN ct.source_type = 'return' THEN ct.quantity ELSE 0 END))
) > 0.01;
```

---

## 🔍 التحقق من الحوكمة

```sql
-- التحقق من وجود الحوكمة في جميع COGS Transactions
SELECT 
  COUNT(*) as total_transactions,
  COUNT(*) FILTER (WHERE branch_id IS NULL) as missing_branch,
  COUNT(*) FILTER (WHERE cost_center_id IS NULL) as missing_cost_center,
  COUNT(*) FILTER (WHERE warehouse_id IS NULL) as missing_warehouse
FROM cogs_transactions
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days';
```

**النتيجة المتوقعة**:
- ✅ `missing_branch = 0`
- ✅ `missing_cost_center = 0`
- ✅ `missing_warehouse = 0`

---

## ✅ Checklist الاختبار

- [ ] تطبيق SQL migration (`scripts/020_create_cogs_transactions_table.sql`)
- [ ] اختبار 1: Purchase → FIFO Lots
- [ ] اختبار 2: Invoice Sent → COGS Transactions
- [ ] اختبار 3: Partial Payment → No Extra COGS
- [ ] اختبار 4: Full Payment → No Extra COGS
- [ ] اختبار 5: Partial Return → COGS Reversal
- [ ] اختبار 6: Full Return → Complete COGS Reversal
- [ ] التحقق من الحوكمة
- [ ] التحقق من Dashboard Stats
- [ ] التحقق من Inventory Balance

---

## 📝 تقرير النتائج

بعد إكمال الاختبارات، يرجى ملء التقرير التالي:

### النتائج:
- ✅ جميع الاختبارات نجحت: [ ]
- ⚠️ بعض الاختبارات تحتاج مراجعة: [ ]
- ❌ فشل الاختبارات: [ ]

### الملاحظات:
```
[اكتب ملاحظاتك هنا]
```

### الخطوات التالية:
- [ ] جاهز للمتابعة إلى Inventory Depreciation
- [ ] يحتاج إصلاحات قبل المتابعة
