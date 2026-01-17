# تقرير اختبار Write-Off End-to-End

## 📋 نظرة عامة

هذا التقرير يوثق نتائج اختبار Write-Off End-to-End بعد تحديث النظام لاستخدام FIFO Engine + COGS Transactions.

---

## 🧪 السيناريوهات المختبرة

### ✅ الاختبار 1: Write-Off جزئي من مخزن واحد

**الهدف**: التحقق من إهلاك كمية جزئية من منتج في مخزن محدد.

**الإجراءات**:
1. إنشاء Write-Off جديد
2. إضافة منتج برصيد كافٍ (مثلاً: رصيد 100، إهلاك 20)
3. تحديد `branch_id`, `cost_center_id`, `warehouse_id`
4. الموافقة على Write-Off

**النتائج المتوقعة**:
- ✅ استهلاك FIFO Lots (20 وحدة)
- ✅ إنشاء `cogs_transactions` مع `source_type = 'depreciation'`
- ✅ `unit_cost` من FIFO (وليس من `products.cost_price`)
- ✅ تحديث `journal_entries` مع COGS الصحيح

**النتائج الفعلية**:
```
[يتم تعبئتها بعد الاختبار]
```

**الحالة**: ⏳ في انتظار الاختبار

---

### ✅ الاختبار 2: Write-Off كامل لمنتج له أكثر من FIFO Lot

**الهدف**: التحقق من إهلاك منتج يستخدم أكثر من FIFO Lot (ترتيب FIFO).

**الإجراءات**:
1. تحديد منتج له أكثر من FIFO Lot (مثلاً: Lot 1: 50 وحدة @ 10, Lot 2: 30 وحدة @ 12)
2. إنشاء Write-Off لاستهلاك كامل الرصيد (80 وحدة)
3. الموافقة على Write-Off

**النتائج المتوقعة**:
- ✅ استهلاك FIFO Lots بترتيب FIFO (Lot 1 أولاً، ثم Lot 2)
- ✅ `unit_cost` المتوسط = (50×10 + 30×12) / 80 = 10.75
- ✅ إنشاء `cogs_transactions` لكل Lot مستهلك
- ✅ `total_cost` = 50×10 + 30×12 = 860

**النتائج الفعلية**:
```
[يتم تعبئتها بعد الاختبار]
```

**الحالة**: ⏳ في انتظار الاختبار

---

### ❌ الاختبار 3: محاولة Write-Off برصيد غير كافٍ (يجب الرفض)

**الهدف**: التحقق من رفض Write-Off عندما الرصيد غير كافٍ.

**الإجراءات**:
1. تحديد منتج برصيد محدود (مثلاً: رصيد 10)
2. إنشاء Write-Off لكمية أكبر (مثلاً: 20)
3. محاولة الموافقة على Write-Off

**النتائج المتوقعة**:
- ❌ رفض Write-Off مع رسالة خطأ واضحة
- ❌ لا يتم استهلاك FIFO Lots
- ❌ لا يتم إنشاء `cogs_transactions`
- ❌ `status` يبقى `pending`

**النتائج الفعلية**:
```
[يتم تعبئتها بعد الاختبار]
```

**الحالة**: ⏳ في انتظار الاختبار

---

### ✅ الاختبار 4: Write-Off مع تعدد الفروع / المخازن

**الهدف**: التحقق من إهلاك منتجات في فروع/مخازن مختلفة.

**الإجراءات**:
1. إنشاء Write-Offs متعددة:
   - Write-Off 1: Branch A, Warehouse 1
   - Write-Off 2: Branch B, Warehouse 2
2. الموافقة على جميع Write-Offs

**النتائج المتوقعة**:
- ✅ كل Write-Off يستخدم FIFO Lots من فرع/مخزن محدد
- ✅ `cogs_transactions` لها `branch_id`, `warehouse_id` صحيح
- ✅ لا خلط بين FIFO Lots من فروع/مخازن مختلفة

**النتائج الفعلية**:
```
[يتم تعبئتها بعد الاختبار]
```

**الحالة**: ⏳ في انتظار الاختبار

---

## 🔍 التحقق من البيانات

### 1. FIFO Consumptions

```sql
SELECT 
  flc.*,
  p.name as product_name,
  wo.write_off_number
FROM fifo_lot_consumptions flc
JOIN products p ON flc.product_id = p.id
JOIN inventory_write_offs wo ON flc.reference_id = wo.id
WHERE flc.reference_type = 'write_off'
  AND flc.consumption_date >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY flc.consumption_date DESC;
```

**النتائج**:
```
[يتم تعبئتها بعد الاختبار]
```

---

### 2. COGS Transactions

```sql
SELECT 
  ct.*,
  p.name as product_name,
  wo.write_off_number
FROM cogs_transactions ct
JOIN products p ON ct.product_id = p.id
JOIN inventory_write_offs wo ON ct.source_id = wo.id
WHERE ct.source_type = 'depreciation'
  AND ct.transaction_date >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY ct.transaction_date DESC;
```

**النتائج**:
```
[يتم تعبئتها بعد الاختبار]
```

---

### 3. Journal Entries

```sql
SELECT 
  je.*,
  wo.write_off_number,
  COUNT(DISTINCT jel.id) as lines_count,
  SUM(jel.debit_amount) as total_debit,
  SUM(jel.credit_amount) as total_credit
FROM journal_entries je
JOIN inventory_write_offs wo ON je.reference_id = wo.id
LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
WHERE je.reference_type = 'write_off'
  AND je.entry_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY je.id, wo.write_off_number
ORDER BY je.entry_date DESC;
```

**النتائج**:
```
[يتم تعبئتها بعد الاختبار]
```

---

### 4. Dashboard Stats (COGS من cogs_transactions)

```sql
SELECT 
  'Write-Off COGS' as source_type,
  SUM(ct.total_cost) as total_cogs,
  COUNT(DISTINCT ct.source_id) as write_offs_count,
  COUNT(DISTINCT ct.product_id) as products_count
FROM cogs_transactions ct
WHERE ct.source_type = 'depreciation'
  AND ct.transaction_date >= CURRENT_DATE - INTERVAL '30 days';
```

**النتائج**:
```
[يتم تعبئتها بعد الاختبار]
```

---

## ✅ Integrity Check

### مقارنة FIFO vs COGS vs Journal

```sql
SELECT 
  wo.write_off_number,
  COALESCE(SUM(flc.total_cost), 0) as fifo_total_cost,
  COALESCE(SUM(ct.total_cost), 0) as cogs_total_cost,
  wo.total_cost as write_off_total_cost,
  CASE 
    WHEN ABS(COALESCE(SUM(flc.total_cost), 0) - COALESCE(SUM(ct.total_cost), 0)) < 0.01
      AND ABS(COALESCE(SUM(ct.total_cost), 0) - wo.total_cost) < 0.01
    THEN '✅ سليم'
    ELSE '❌ عدم تطابق'
  END as integrity_status
FROM inventory_write_offs wo
LEFT JOIN fifo_lot_consumptions flc ON flc.reference_id = wo.id AND flc.reference_type = 'write_off'
LEFT JOIN cogs_transactions ct ON ct.source_id = wo.id AND ct.source_type = 'depreciation'
WHERE wo.status = 'approved'
  AND wo.write_off_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY wo.id, wo.write_off_number, wo.total_cost;
```

**النتائج**:
```
[يتم تعبئتها بعد الاختبار]
```

---

## 🧾 Governance Check

### التحقق من الحوكمة

```sql
SELECT 
  wo.write_off_number,
  wo.branch_id IS NOT NULL as has_branch,
  wo.cost_center_id IS NOT NULL as has_cost_center,
  wo.warehouse_id IS NOT NULL as has_warehouse,
  CASE 
    WHEN wo.branch_id IS NOT NULL 
      AND wo.cost_center_id IS NOT NULL 
      AND wo.warehouse_id IS NOT NULL 
    THEN '✅ سليم'
    ELSE '❌ تفتقد الحوكمة'
  END as governance_status
FROM inventory_write_offs wo
WHERE wo.write_off_date >= CURRENT_DATE - INTERVAL '30 days';
```

**النتائج**:
```
[يتم تعبئتها بعد الاختبار]
```

---

## 📊 الملخص النهائي

### ✅ الاختبارات الناجحة
- [ ] اختبار 1: Write-Off جزئي
- [ ] اختبار 2: Write-Off متعدد Lots
- [ ] اختبار 3: رفض Write-Off برصيد غير كافٍ
- [ ] اختبار 4: Write-Off متعدد الفروع/المخازن

### 🔍 التحقق من البيانات
- [ ] FIFO Consumptions
- [ ] COGS Transactions
- [ ] Journal Entries
- [ ] Dashboard Stats

### ✅ Integrity & Governance
- [ ] Integrity Check (FIFO = COGS = Journal)
- [ ] Governance Check (branch/cost_center/warehouse)

---

## 📝 الملاحظات

```
[يتم إضافة الملاحظات بعد الاختبار]
```

---

## ✅ الخلاصة

**الحالة**: ⏳ في انتظار الاختبار

**النتيجة النهائية**: 
- ✅ النظام جاهز للاختبار
- ⏳ في انتظار نتائج الاختبارات الفعلية

---

**تاريخ الاختبار**: _______________  
**مختبر بواسطة**: _______________  
**النتيجة**: _______________
