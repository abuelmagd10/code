# دليل تطبيق ترقية نظام COGS إلى ERP Professional

## ✅ الحالة الحالية

تم إنجاز التحديثات التالية:
1. ✅ إنشاء جدول `cogs_transactions` (SQL Migration)
2. ✅ تحديث Invoice Flow لاستخدام FIFO + COGS Transactions
3. ✅ تحديث Sales Returns لإنشاء COGS Reversal
4. ✅ تحديث Dashboard Reports لاستخدام `cogs_transactions`

---

## 📋 خطوات التطبيق

### 1️⃣ تطبيق SQL Migration

#### الطريقة الأولى: من Supabase Dashboard
1. افتح Supabase Dashboard → SQL Editor
2. انسخ محتوى `scripts/020_create_cogs_transactions_table.sql`
3. الصق في SQL Editor واضغط Run

#### الطريقة الثانية: من Command Line (psql)
```bash
psql -h [YOUR_DB_HOST] -U [USERNAME] -d [DATABASE] -f scripts/020_create_cogs_transactions_table.sql
```

#### الطريقة الثالثة: من Supabase CLI
```bash
supabase db execute -f scripts/020_create_cogs_transactions_table.sql
```

---

## ✅ التحقق من نجاح Migration

بعد تطبيق SQL migration، تحقق من:

```sql
-- 1. التحقق من وجود الجدول
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'cogs_transactions';

-- 2. التحقق من وجود الحقول الإلزامية
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'cogs_transactions'
ORDER BY ordinal_position;

-- 3. التحقق من RLS Policies
SELECT policyname, cmd 
FROM pg_policies 
WHERE tablename = 'cogs_transactions';

-- 4. التحقق من Function
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_name = 'calculate_cogs_total';
```

---

## 🧪 اختبار النظام

### اختبار 1: Invoice Sent → COGS Transactions
```sql
-- إنشاء فاتورة تجريبية وإرسالها
-- ثم التحقق من إنشاء COGS transactions
SELECT 
  ct.*,
  p.name as product_name,
  i.invoice_number
FROM cogs_transactions ct
JOIN products p ON ct.product_id = p.id
JOIN invoices i ON ct.source_id = i.id
WHERE ct.source_type = 'invoice'
ORDER BY ct.created_at DESC
LIMIT 10;
```

### اختبار 2: Sales Return → COGS Reversal
```sql
-- إنشاء مرتجع للفاتورة
-- ثم التحقق من عكس COGS
SELECT 
  ct.*,
  p.name as product_name
FROM cogs_transactions ct
JOIN products p ON ct.product_id = p.id
WHERE ct.source_type = 'return'
ORDER BY ct.created_at DESC
LIMIT 10;
```

### اختبار 3: Dashboard Reports
```sql
-- حساب COGS من cogs_transactions (الجديد)
SELECT calculate_cogs_total(
  'YOUR_COMPANY_ID'::UUID,
  '2024-01-01'::DATE,
  '2024-12-31'::DATE
) as total_cogs_from_transactions;
```

---

## 📊 مقارنة البيانات (للتأكد من الدقة)

مقارنة COGS من `cogs_transactions` مع الحساب القديم (`cost_price`):

```sql
-- حساب COGS من cogs_transactions (المصدر الجديد)
WITH new_cogs AS (
  SELECT SUM(total_cost) as total_cogs
  FROM cogs_transactions
  WHERE company_id = 'YOUR_COMPANY_ID'
    AND source_type = 'invoice'
    AND transaction_date BETWEEN '2024-01-01' AND '2024-12-31'
),
-- حساب COGS من cost_price (الطريقة القديمة - للتحقق فقط)
old_cogs AS (
  SELECT SUM(ii.quantity * COALESCE(p.cost_price, 0)) as total_cogs
  FROM invoice_items ii
  JOIN invoices i ON ii.invoice_id = i.id
  JOIN products p ON ii.product_id = p.id
  WHERE i.company_id = 'YOUR_COMPANY_ID'
    AND i.status IN ('sent', 'partially_paid', 'paid')
    AND i.invoice_date BETWEEN '2024-01-01' AND '2024-12-31'
    AND p.item_type != 'service'
)
SELECT 
  new_cogs.total_cogs as new_method_cogs,
  old_cogs.total_cogs as old_method_cogs,
  (new_cogs.total_cogs - old_cogs.total_cogs) as difference,
  CASE 
    WHEN ABS(new_cogs.total_cogs - old_cogs.total_cogs) < 0.01 
    THEN '✅ Match' 
    ELSE '⚠️ Difference' 
  END as status
FROM new_cogs, old_cogs;
```

---

## 🚨 استكشاف الأخطاء

### خطأ: "relation cogs_transactions does not exist"
**الحل**: تأكد من تطبيق SQL migration أولاً

### خطأ: "missing governance: branch_id, cost_center_id, warehouse_id"
**الحل**: تأكد من تعبئة هذه الحقول في الفاتورة قبل الإرسال

### خطأ: "FIFO lots not found"
**الحل**: تأكد من وجود دفعات FIFO للمنتج (من المشتريات)

### خطأ: "COGS transactions not found" في التقارير
**الحل**: هذا طبيعي للفواتير القديمة. النظام سيستخدم fallback إلى `cost_price` تلقائياً

---

## 📝 ملاحظات مهمة

1. **البيانات القديمة**: الفواتير القديمة (قبل تطبيق Migration) قد لا تحتوي على COGS transactions
   - النظام يستخدم fallback إلى `cost_price` للتوافق

2. **الحوكمة الإلزامية**: عند إنشاء فاتورة جديدة، تأكد من:
   - `branch_id` موجود
   - `cost_center_id` موجود  
   - `warehouse_id` موجود

3. **FIFO Engine**: تأكد من وجود دفعات FIFO للمنتجات قبل البيع
   - عند الشراء، يتم إنشاء FIFO lots تلقائياً

---

## ✅ Checklist التطبيق

- [ ] تطبيق SQL migration (`scripts/020_create_cogs_transactions_table.sql`)
- [ ] التحقق من وجود الجدول والحقول
- [ ] التحقق من RLS Policies
- [ ] اختبار Invoice Sent → إنشاء COGS transactions
- [ ] اختبار Sales Return → عكس COGS
- [ ] التحقق من Dashboard Reports
- [ ] مقارنة البيانات القديمة والجديدة

---

## 📚 الملفات المحدثة

- `scripts/020_create_cogs_transactions_table.sql` - SQL Migration
- `lib/cogs-transactions.ts` - COGS Transactions Engine
- `lib/fifo-engine.ts` - إضافة `consumeFIFOLotsWithCOGS()`
- `app/invoices/[id]/page.tsx` - Invoice Flow مع COGS
- `lib/sales-returns.ts` - Sales Returns مع COGS Reversal
- `app/api/dashboard-stats/route.ts` - Dashboard Reports مع `cogs_transactions`

---

## 🎯 النتيجة النهائية

✅ نظام COGS الآن:
- محاسبيًا صحيح (FIFO Engine فقط)
- قابل للتدقيق (سجلات كاملة في `cogs_transactions`)
- يدعم الفروع ومراكز التكلفة والمخازن (الحوكمة الإلزامية)
- جاهز لتقارير مالية رسمية
