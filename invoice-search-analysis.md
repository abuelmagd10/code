# تحليل مشكلة البحث عن فاتورة INV-0028

## المشكلة الأساسية
النظام لا يستطيع العثور على فاتورة INV-0028 رغم أنها موجودة في قاعدة البيانات كفاتورة مرتجع كامل.

## الأسباب المحتملة

### 1. مشكلة في بيانات الاعتماد (Credentials)
- ملف `.env.local` يحتوي على قيم وهمية (`dummy.supabase.co`)
- هذا يمنع الاتصال بقاعدة البيانات الفعلية

### 2. مشكلة في منطق البحث (المعالجة)
تم تحسين منطق البحث في `repair-invoice/route.ts` ليشمل:
- البحث الدقيق أولاً
- البحث عن الفواتير المشابهة إذا لم يتم العثور على تطابق دقيق
- البحث عن فواتير المرتجع إذا كان الرقم يحتوي على "SR" أو "return"

### 3. مشكلة في تصنيف الفاتورة
قد تكون INV-0028 مصنفة كـ:
- `invoice_type`: "sales_return" (مرتجع مبيعات)
- `invoice_type`: "return_invoice" (فاتورة مرتجع)
- أو نوع آخر غير متوقع

## الحلول المقترحة

### 1. تحديث بيانات الاعتماد
يجب تحديث ملف `.env.local` بالقيم الفعلية:
```env
NEXT_PUBLIC_SUPABASE_URL=your-actual-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-actual-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-actual-service-role-key
```

### 2. التحقق من وجود الفاتورة
للتحقق من وجود INV-0028، قم بتشغيل هذا الاستعلام في Supabase:

```sql
SELECT 
  id, 
  invoice_number, 
  invoice_type, 
  status, 
  company_id,
  total_amount,
  created_at
FROM invoices 
WHERE invoice_number ILIKE '%0028%' 
   OR invoice_number ILIKE '%inv-0028%';
```

### 3. التحقق من أنواع الفواتير
لرؤية جميع أنواع الفواتير الموجودة:

```sql
SELECT 
  invoice_type, 
  COUNT(*) as count,
  STRING_AGG(DISTINCT invoice_number, ', ' LIMIT 5) as sample_invoices
FROM invoices 
GROUP BY invoice_type 
ORDER BY count DESC;
```

### 4. التحقق من فواتير المرتجع
لرؤية فواتير المرتجع الكامل:

```sql
SELECT 
  invoice_number, 
  invoice_type, 
  status, 
  total_amount,
  company_id
FROM invoices 
WHERE invoice_type IN ('sales_return', 'return_invoice', 'full_return')
ORDER BY created_at DESC 
LIMIT 10;
```

## التعديلات التي تم إجراؤها

### 1. تحسين منطق البحث في `repair-invoice/route.ts`:
```typescript
// محاولة البحث الدقيق أولاً
const { data: exactInvoice } = await supabase
  .from("invoices")
  .select("id, invoice_number, status, subtotal, tax_amount, total_amount, shipping, paid_amount, invoice_date, invoice_type, returned_amount, refund_amount, customer_id, bill_id, supplier_id")
  .eq("company_id", companyId)
  .eq("invoice_number", invoice_number)
  .maybeSingle()

if (exactInvoice) {
  invoice = exactInvoice;
} else {
  // البحث عن الفواتير المشابهة
  const { data: similarInvoices } = await supabase
    .from("invoices")
    .select("id, invoice_number, status, subtotal, tax_amount, total_amount, shipping, paid_amount, invoice_date, invoice_type, returned_amount, refund_amount, customer_id, bill_id, supplier_id")
    .eq("company_id", companyId)
    .or(`invoice_number.ilike.%${invoice_number}%,invoice_number.ilike.${invoice_number}%`)
    .limit(5)
    
  // البحث عن فواتير المرتجع
  if (invoice_number.toLowerCase().includes('sr') || invoice_number.toLowerCase().includes('return')) {
    const { data: returnInvoices } = await supabase
      .from("invoices")
      .select("id, invoice_number, status, subtotal, tax_amount, total_amount, shipping, paid_amount, invoice_date, invoice_type, returned_amount, refund_amount, customer_id, bill_id, supplier_id")
      .eq("company_id", companyId)
      .eq("invoice_type", "sales_return")
      .or(`invoice_number.ilike.%${invoice_number.replace(/[^0-9]/g, '')}%`)
      .limit(5)
  }
}
```

### 2. إنشاء أدوات تصحيح الأخطاء:
- `debug-invoice-search.js`: للبحث عن فواتير محددة
- `test-repair-logic-direct.js`: لاختبار منطق الإصلاح
- `test-database-structure.js`: لفحص بنية قاعدة البيانات

## الخطوات التالية

1. **تحديث بيانات الاعتماد**: قم بتحديث `.env.local` بالقيم الفعلية من Supabase
2. **التحقق من قاعدة البيانات**: استخدم أدوات التصحيح للتحقق من وجود INV-0028
3. **اختبار المنطق المحدث**: بعد تحديث الاعتمادات، اختبر منطق البحث المحسن
4. **التحقق من أنواع الفواتير**: تأكد من أن أنواع الفواتير متسقة مع ما يتوقعه النظام

## ملاحظات مهمة

- تأكد من أن `company_id` في الفاتورة يطابق `company_id` للمستخدم المصادق عليه
- تحقق من أن نوع الفاتورة (invoice_type) يُعرف بشكل صحيح كـ "sales_return" أو ما يعادلها
- تأكد من أن رقم الفاتورة لا يحتوي على مسافات أو أحرف غير مرئية
- تحقق من سياسات RLS (Row Level Security) في Supabase

## توصيات

1. قم بإنشاء فهرس على عمود `invoice_number` لتحسين أداء البحث
2. أضف فهرسًا مركبًا على `(company_id, invoice_number)` للبحث السريع
3. اعتبر استخدام بحث全文 (full-text search) للبحث الأكثر مرونة
4. أضف سجلات الأخطاء والتصحيح لمراقبة مشكلات البحث في المستقبل