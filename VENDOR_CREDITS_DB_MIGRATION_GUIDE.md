# 🗄️ دليل تنفيذ Vendor Credits على مستوى قاعدة البيانات

## 📋 نظرة عامة

هذا الدليل يشرح كيفية تنفيذ نظام إشعارات دائن الموردين (Vendor Credits) على مستوى قاعدة البيانات للفواتير التي لها مرتجعات موجودة بالفعل.

---

## 🎯 الأهداف

1. ✅ إنشاء Vendor Credits تلقائياً لجميع الفواتير التي لها مرتجعات
2. ✅ تطبيق قيود الحماية (DB Guards) لمنع الأخطاء
3. ✅ ضمان سلامة البيانات والذمم التاريخية
4. ✅ جعل النظام Audit-Ready

---

## 📊 البيانات المستهدفة

### الفواتير المؤهلة:
- ✅ حالة الفاتورة = `paid` أو `partially_paid` أو `fully_returned`
- ✅ لها `returned_amount > 0`
- ✅ لا يوجد لها Vendor Credit مسبقاً

### البيانات الموجودة حالياً:

**VitaSlims:**
- BILL-0001: مرتجع جزئي 4,800 جنيه (حالة: paid)

**شركة تست:**
- BILL-0001: مرتجع كامل 100,000 جنيه (حالة: fully_returned)
- BILL-0002: مرتجع جزئي 30,000 جنيه (حالة: paid)

**إجمالي:** 3 فواتير مؤهلة

---

## 📁 الملفات المطلوبة

### 1. `094_create_vendor_credits_from_existing_returns.sql`
**الوظيفة:** إنشاء دوال DB لإنشاء Vendor Credits

**المحتويات:**
- ✅ `create_vendor_credit_from_bill_return(bill_id)` - دالة لإنشاء VC لفاتورة واحدة
- ✅ `create_vendor_credits_for_all_returns()` - دالة batch لمعالجة جميع الفواتير

**الميزات:**
- توليد رقم إشعار تلقائي (مثل: VIT-VC-0001)
- التحقق من عدم وجود VC مسبقاً
- معالجة الأخطاء بشكل آمن
- تقرير مفصل بالنتائج

---

### 2. `095_vendor_credits_db_guards_and_constraints.sql`
**الوظيفة:** إضافة قيود الحماية والأمان

**القيود المضافة:**

#### أ) Unique Constraints:
```sql
-- منع إنشاء أكثر من VC لنفس الفاتورة
UNIQUE (source_purchase_invoice_id, reference_type)
WHERE reference_type = 'bill_return'
```

#### ب) Check Constraints:
```sql
-- التأكد من أن المبلغ موجب
CHECK (total_amount > 0)

-- التأكد من أن المبلغ المطبق لا يتجاوز الإجمالي
CHECK (applied_amount <= total_amount)
```

#### ج) Triggers:
1. **منع حذف Vendor Credits** (إلا إذا كانت draft أو cancelled)
2. **التحقق من البيانات** قبل الإدراج/التحديث
3. **منع حذف الفواتير** التي لها Vendor Credits

#### د) Indexes:
```sql
-- للبحث السريع
idx_vendor_credits_source_invoice_reference
idx_vendor_credits_reference_lookup
idx_vendor_credits_status_filter
```

---

### 3. `execute-vendor-credits-migration.js`
**الوظيفة:** تنفيذ العملية بالكامل من Node.js

**الخطوات:**
1. ✅ التحقق من البيانات الموجودة
2. ✅ تطبيق DB Guards
3. ✅ إنشاء الدوال
4. ✅ تنفيذ Migration
5. ✅ التحقق من النتائج
6. ✅ إنشاء تقرير JSON

---

## 🚀 خطوات التنفيذ

### الطريقة 1️⃣: تنفيذ تلقائي عبر Node.js (موصى به)

```bash
# 1. تأكد من وجود متغيرات البيئة
# في ملف .env.local:
# NEXT_PUBLIC_SUPABASE_URL=your_url
# SUPABASE_SERVICE_ROLE_KEY=your_key

# 2. نفذ السكريبت
node scripts/execute-vendor-credits-migration.js
```

**النتيجة المتوقعة:**
```
========================================
🚀 Vendor Credits Migration
========================================

📊 STEP 1: Checking current state...
   Found 3 bills with returns

🔒 STEP 3: Applying DB guards and constraints...
✅ Successfully executed: 095_vendor_credits_db_guards_and_constraints.sql

⚙️  STEP 4: Creating migration functions...
✅ Successfully executed: 094_create_vendor_credits_from_existing_returns.sql

🔄 STEP 5: Executing migration...
   Creating vendor credits for all bill returns...

📋 Migration Results:
┌─────────┬─────────────┬──────────────┬─────────────────┬─────────────┬──────────┐
│ (index) │ bill_number │ company_name │ returned_amount │ vendor_cr.. │  status  │
├─────────┼─────────────┼──────────────┼─────────────────┼─────────────┼──────────┤
│    0    │ 'BILL-0001' │ 'VitaSlims'  │     '4800.00'   │  uuid...    │ 'created'│
│    1    │ 'BILL-0001' │ 'تست'        │   '100000.00'   │  uuid...    │ 'created'│
│    2    │ 'BILL-0002' │ 'تست'        │    '30000.00'   │  uuid...    │ 'created'│
└─────────┴─────────────┴──────────────┴─────────────────┴─────────────┴──────────┘

========================================
✅ Migration Completed Successfully
========================================
Duration: 2.34s
Bills with returns: 3
Vendor credits created: 3
Vendor credits skipped: 0
Errors: 0
Total vendor credits: 3
========================================
```

---

### الطريقة 2️⃣: تنفيذ يدوي عبر Supabase SQL Editor

#### الخطوة 1: تطبيق DB Guards
```sql
-- نفذ محتوى ملف:
-- scripts/095_vendor_credits_db_guards_and_constraints.sql
```

#### الخطوة 2: إنشاء الدوال
```sql
-- نفذ محتوى ملف:
-- scripts/094_create_vendor_credits_from_existing_returns.sql
```

#### الخطوة 3: تنفيذ Migration
```sql
-- نفذ الدالة
SELECT * FROM create_vendor_credits_for_all_returns();
```

#### الخطوة 4: التحقق من النتائج
```sql
-- عرض جميع Vendor Credits المنشأة
SELECT 
  vc.credit_number,
  vc.credit_date,
  vc.total_amount,
  vc.status,
  b.bill_number,
  c.name as company_name,
  s.name as supplier_name
FROM vendor_credits vc
LEFT JOIN bills b ON b.id = vc.source_purchase_invoice_id
LEFT JOIN companies c ON c.id = vc.company_id
LEFT JOIN suppliers s ON s.id = vc.supplier_id
WHERE vc.reference_type = 'bill_return'
ORDER BY c.name, vc.credit_number;
```

---

## ✅ التحقق من النجاح

### 1. عدد Vendor Credits المنشأة
```sql
SELECT COUNT(*) as total_vendor_credits
FROM vendor_credits
WHERE reference_type = 'bill_return';
-- النتيجة المتوقعة: 3
```

### 2. التحقق من الربط الصحيح
```sql
SELECT 
  b.bill_number,
  b.returned_amount,
  vc.credit_number,
  vc.total_amount,
  CASE 
    WHEN b.returned_amount = vc.total_amount THEN '✅ Match'
    ELSE '❌ Mismatch'
  END as validation
FROM bills b
INNER JOIN vendor_credits vc ON vc.source_purchase_invoice_id = b.id
WHERE vc.reference_type = 'bill_return';
```

### 3. التحقق من القيود
```sql
-- محاولة إنشاء VC مكرر (يجب أن تفشل)
SELECT create_vendor_credit_from_bill_return('cec5aa99-335a-4ddc-8fab-5b5b38c7ccdf');
-- النتيجة المتوقعة: "Vendor Credit already exists for bill..."
```

---

## 📊 النتائج المتوقعة

### Vendor Credits المنشأة:

| الشركة | رقم الفاتورة | المبلغ المرتجع | رقم الإشعار | الحالة |
|--------|--------------|----------------|-------------|--------|
| VitaSlims | BILL-0001 | 4,800 | VIT-VC-0001 | open |
| تست | BILL-0001 | 100,000 | -VC-0001 | open |
| تست | BILL-0002 | 30,000 | -VC-0002 | open |

---

## 🔒 القيود المطبقة

### ✅ ما يمكن فعله:
- إنشاء VC جديد لفاتورة ليس لها VC
- تطبيق VC على فواتير المورد
- تحديث حالة VC
- حذف VC بحالة draft أو cancelled

### ❌ ما لا يمكن فعله:
- إنشاء VC مكرر لنفس الفاتورة
- حذف VC بحالة open/applied/closed
- حذف فاتورة لها VC
- تطبيق مبلغ أكبر من total_amount

---

## 🐛 استكشاف الأخطاء

### المشكلة: "Bill is not Paid or Partially Paid"
**الحل:** الفاتورة يجب أن تكون مدفوعة. تحقق من حالة الفاتورة.

### المشكلة: "Vendor Credit already exists"
**الحل:** هذا طبيعي - يمنع الازدواج. لا حاجة لإعادة الإنشاء.

### المشكلة: "Cannot delete Vendor Credit"
**الحل:** غيّر الحالة إلى cancelled أولاً، ثم احذف.

---

## 📞 الدعم

للمساعدة، راجع:
- `docs/VENDOR_CREDITS_AUTOMATIC_SYSTEM.md`
- `VENDOR_CREDITS_IMPLEMENTATION_GUIDE.md`
- نتائج Migration في: `VENDOR_CREDITS_MIGRATION_RESULTS_*.json`

---

**تاريخ:** 2026-01-06  
**الإصدار:** 1.0.0  
**الحالة:** ✅ جاهز للتنفيذ

