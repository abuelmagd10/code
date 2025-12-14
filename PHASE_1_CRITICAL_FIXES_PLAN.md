# خطة Phase 1: الإصلاحات الحرجة قبل الإنتاج
# Phase 1: Critical Fixes Plan (Pre-Production)

**تاريخ الإنشاء:** 2025-01-27  
**الحالة:** ✅ معتمد - جاهز للتنفيذ عند الطلب  
**المدة المقدرة:** 14 ساعة عمل (2-3 أيام)  
**الأولوية:** 🔴 حرجة - مطلوب قبل الإنتاج

---

## 📋 نظرة عامة

هذه الخطة تغطي **الإصلاحات الحرجة فقط** التي تمنع الإنتاج. لا تشمل أي refactor أو تحسينات اختيارية.

**الهدف:** جعل النظام **صالح للإنتاج** من خلال إصلاح الثغرات الأمنية والقيود المحاسبية والمخزونية الحرجة.

---

## 🎯 الإصلاحات المطلوبة (5 إصلاحات حرجة)

### 1️⃣ إصلاح ثغرات الأمان في API Endpoints

**المدة المقدرة:** 4 ساعات  
**الأولوية:** 🔴 حرجة - تمنع الإنتاج

#### 1.1 `/api/member-role` - تغيير دور عضو
**المشكلة:** لا يتحقق من صلاحية المستخدم الطالب  
**الخطورة:** يمكن لأي مستخدم تغيير أدوار الأعضاء

**الإصلاح المطلوب:**
- إضافة `checkPermission()` للتحقق من أن المستخدم `owner` أو `admin`
- إضافة التحقق من `company_id` للتأكد من العضوية
- إرجاع خطأ 403 إذا لم يكن لديه الصلاحية

**الملف:** `app/api/member-role/route.ts`

**الكود المطلوب:**
```typescript
// التحقق من الصلاحيات
const { data: { user } } = await supabase.auth.getUser()
if (!user) {
  return NextResponse.json({ error: "غير مصرح" }, { status: 401 })
}

// التحقق من أن المستخدم owner أو admin
const cid = await getActiveCompanyId(supabase)
const { data: member } = await supabase
  .from("company_members")
  .select("role")
  .eq("company_id", cid)
  .eq("user_id", user.id)
  .single()

if (!member || !["owner", "admin"].includes(member.role)) {
  return NextResponse.json({ error: "غير مصرح" }, { status: 403 })
}
```

---

#### 1.2 `/api/member-delete` - حذف عضو
**المشكلة:** لا يتحقق من صلاحية المستخدم الطالب  
**الخطورة:** يمكن لأي مستخدم حذف أعضاء

**الإصلاح المطلوب:**
- إضافة نفس التحقق من الصلاحيات كما في 1.1
- منع حذف المالك الوحيد

**الملف:** `app/api/member-delete/route.ts`

---

#### 1.3 `/api/company-members` - قائمة الأعضاء
**المشكلة:** لا يتحقق من عضوية المستخدم في الشركة  
**الخطورة:** يمكن لأي مستخدم رؤية أعضاء أي شركة

**الإصلاح المطلوب:**
- إضافة التحقق من `company_id` والتأكد من العضوية
- استخدام `getActiveCompanyId()` بدلاً من قبول `companyId` من المستخدم

**الملف:** `app/api/company-members/route.ts`

---

#### 1.4 `/api/income-statement` - قائمة الدخل
**المشكلة:** يقبل `companyId` من المستخدم بدون التحقق من عضويته  
**الخطورة:** يمكن لأي مستخدم رؤية بيانات مالية لشركات أخرى

**الإصلاح المطلوب:**
- استخدام `getActiveCompanyId()` بدلاً من `searchParams.get("companyId")`
- إضافة التحقق من العضوية

**الملف:** `app/api/income-statement/route.ts`

**الكود المطلوب:**
```typescript
// ❌ الكود الحالي (غير آمن)
const companyId = String(searchParams.get("companyId") || "")

// ✅ الكود المطلوب
const cid = await getActiveCompanyId(supabase)
if (!cid) {
  return NextResponse.json({ error: "لم يتم العثور على الشركة" }, { status: 404 })
}

// التحقق من العضوية
const { data: member } = await supabase
  .from("company_members")
  .select("role")
  .eq("company_id", cid)
  .eq("user_id", user.id)
  .single()

if (!member) {
  return NextResponse.json({ error: "غير مصرح" }, { status: 403 })
}
```

---

### 2️⃣ إضافة قيود محاسبية

**المدة المقدرة:** 6 ساعات  
**الأولوية:** 🔴 حرجة - تمنع الإنتاج

#### 2.1 تحقق من توازن القيود (المدين = الدائن)
**المشكلة:** يمكن إنشاء قيد غير متوازن  
**الخطورة:** أخطاء محاسبية، عدم توازن في الميزانية

**الإصلاح المطلوب:**
- إنشاء Trigger Function للتحقق من توازن القيد قبل الإدراج
- رفض الإدراج إذا كان مجموع المدين ≠ مجموع الدائن

**الملف:** `scripts/011_journal_entry_balance_check.sql` (جديد)

**الكود المطلوب:**
```sql
CREATE OR REPLACE FUNCTION check_journal_entry_balance()
RETURNS TRIGGER AS $$
DECLARE
  total_debit DECIMAL(15, 2);
  total_credit DECIMAL(15, 2);
BEGIN
  -- حساب مجموع المدين والدائن
  SELECT 
    COALESCE(SUM(debit_amount), 0),
    COALESCE(SUM(credit_amount), 0)
  INTO total_debit, total_credit
  FROM journal_entry_lines
  WHERE journal_entry_id = NEW.id;

  -- التحقق من التوازن (مع هامش خطأ صغير للتقريب)
  IF ABS(total_debit - total_credit) > 0.01 THEN
    RAISE EXCEPTION 'القيد غير متوازن: المدين = %, الدائن = %', total_debit, total_credit;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger بعد إدراج/تحديث سطور القيد
CREATE TRIGGER trg_check_journal_balance
AFTER INSERT OR UPDATE ON journal_entry_lines
FOR EACH ROW
EXECUTE FUNCTION check_journal_entry_balance();
```

---

#### 2.2 منع تعديل الفواتير بعد إنشاء قيود محاسبية
**المشكلة:** يمكن تعديل فاتورة بعد إنشاء قيود محاسبية  
**الخطورة:** تناقض في البيانات المحاسبية

**الإصلاح المطلوب:**
- إضافة Function للتحقق من وجود قيود محاسبية
- إضافة Constraint أو Trigger لمنع التعديل

**الملف:** `scripts/012_prevent_invoice_edit_after_journal.sql` (جديد)

**الكود المطلوب:**
```sql
CREATE OR REPLACE FUNCTION prevent_invoice_edit_after_journal()
RETURNS TRIGGER AS $$
DECLARE
  has_journal BOOLEAN;
BEGIN
  -- التحقق من وجود قيود محاسبية
  SELECT EXISTS (
    SELECT 1 FROM journal_entries
    WHERE reference_type IN ('invoice', 'invoice_payment', 'invoice_cogs')
    AND reference_id = NEW.id
  ) INTO has_journal;

  -- إذا كان هناك قيود، منع التعديل (عدا الحقول المسموحة)
  IF has_journal THEN
    -- السماح بتعديل الحقول غير المحاسبية فقط
    IF (
      OLD.invoice_number IS DISTINCT FROM NEW.invoice_number OR
      OLD.customer_id IS DISTINCT FROM NEW.customer_id OR
      OLD.invoice_date IS DISTINCT FROM NEW.invoice_date OR
      OLD.subtotal IS DISTINCT FROM NEW.subtotal OR
      OLD.tax_amount IS DISTINCT FROM NEW.tax_amount OR
      OLD.total_amount IS DISTINCT FROM NEW.total_amount
    ) THEN
      RAISE EXCEPTION 'لا يمكن تعديل الفاتورة بعد إنشاء قيود محاسبية';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_invoice_edit_after_journal
BEFORE UPDATE ON invoices
FOR EACH ROW
EXECUTE FUNCTION prevent_invoice_edit_after_journal();
```

---

### 3️⃣ إضافة قيود مخزون

**المدة المقدرة:** 4 ساعات  
**الأولوية:** 🔴 حرجة - تمنع الإنتاج

#### 3.1 منع خروج مخزون بدون فاتورة
**المشكلة:** يمكن إنشاء `inventory_transactions` من نوع `sale` بدون `reference_id`  
**الخطورة:** مخزون غير دقيق، فقدان منتجات

**الإصلاح المطلوب:**
- إضافة Constraint: `reference_id NOT NULL` لحركات البيع
- أو إضافة CHECK constraint

**الملف:** `scripts/013_inventory_sale_reference_constraint.sql` (جديد)

**الكود المطلوب:**
```sql
-- إضافة constraint: حركات البيع يجب أن يكون لها reference_id
ALTER TABLE inventory_transactions
ADD CONSTRAINT check_sale_has_reference
CHECK (
  transaction_type != 'sale' OR reference_id IS NOT NULL
);

-- إضافة constraint: حركات عكس البيع يجب أن يكون لها reference_id
ALTER TABLE inventory_transactions
ADD CONSTRAINT check_sale_reversal_has_reference
CHECK (
  transaction_type != 'sale_reversal' OR reference_id IS NOT NULL
);
```

---

#### 3.2 منع حركات مخزون للفواتير الملغاة
**المشكلة:** يمكن إنشاء حركة مخزون لفاتورة بحالة `cancelled`  
**الخطورة:** مخزون غير دقيق

**الإصلاح المطلوب:**
- إضافة Trigger للتحقق من حالة الفاتورة قبل إنشاء حركة مخزون

**الملف:** `scripts/014_prevent_inventory_for_cancelled_invoices.sql` (جديد)

**الكود المطلوب:**
```sql
CREATE OR REPLACE FUNCTION prevent_inventory_for_cancelled()
RETURNS TRIGGER AS $$
DECLARE
  invoice_status TEXT;
  bill_status TEXT;
BEGIN
  -- إذا كانت الحركة مرتبطة بفاتورة بيع
  IF NEW.transaction_type IN ('sale', 'sale_reversal') AND NEW.reference_id IS NOT NULL THEN
    SELECT status INTO invoice_status
    FROM invoices
    WHERE id = NEW.reference_id;

    IF invoice_status = 'cancelled' THEN
      RAISE EXCEPTION 'لا يمكن إنشاء حركة مخزون لفاتورة ملغاة';
    END IF;
  END IF;

  -- إذا كانت الحركة مرتبطة بفاتورة شراء
  IF NEW.transaction_type IN ('purchase', 'purchase_reversal') AND NEW.reference_id IS NOT NULL THEN
    SELECT status INTO bill_status
    FROM bills
    WHERE id = NEW.reference_id;

    IF bill_status = 'cancelled' THEN
      RAISE EXCEPTION 'لا يمكن إنشاء حركة مخزون لفاتورة شراء ملغاة';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_inventory_for_cancelled
BEFORE INSERT ON inventory_transactions
FOR EACH ROW
EXECUTE FUNCTION prevent_inventory_for_cancelled();
```

---

## 📊 جدول التنفيذ

| # | المهمة | الملف | المدة | الأولوية | الحالة |
|---|--------|-------|-------|----------|--------|
| 1.1 | إصلاح `/api/member-role` | `app/api/member-role/route.ts` | 1 ساعة | 🔴 | ⏳ في الانتظار |
| 1.2 | إصلاح `/api/member-delete` | `app/api/member-delete/route.ts` | 1 ساعة | 🔴 | ⏳ في الانتظار |
| 1.3 | إصلاح `/api/company-members` | `app/api/company-members/route.ts` | 1 ساعة | 🔴 | ⏳ في الانتظار |
| 1.4 | إصلاح `/api/income-statement` | `app/api/income-statement/route.ts` | 1 ساعة | 🔴 | ⏳ في الانتظار |
| 2.1 | تحقق من توازن القيود | `scripts/011_journal_entry_balance_check.sql` | 3 ساعات | 🔴 | ⏳ في الانتظار |
| 2.2 | منع تعديل الفواتير بعد القيود | `scripts/012_prevent_invoice_edit_after_journal.sql` | 3 ساعات | 🔴 | ⏳ في الانتظار |
| 3.1 | منع خروج مخزون بدون فاتورة | `scripts/013_inventory_sale_reference_constraint.sql` | 2 ساعة | 🔴 | ⏳ في الانتظار |
| 3.2 | منع حركات مخزون للفواتير الملغاة | `scripts/014_prevent_inventory_for_cancelled_invoices.sql` | 2 ساعة | 🔴 | ⏳ في الانتظار |

**المدة الإجمالية:** 14 ساعة عمل

---

## ✅ معايير النجاح

بعد تنفيذ Phase 1، يجب أن يكون:

1. ✅ **جميع API endpoints محمية** - لا يمكن الوصول بدون صلاحيات
2. ✅ **جميع القيود متوازنة** - المدين = الدائن دائماً
3. ✅ **الفواتير محمية** - لا يمكن تعديلها بعد إنشاء قيود
4. ✅ **المخزون محمي** - لا يمكن خروج مخزون بدون فاتورة
5. ✅ **لا حركات مخزون للفواتير الملغاة**

---

## 🧪 اختبارات مطلوبة

بعد كل إصلاح، يجب اختبار:

1. **اختبارات الأمان:**
   - محاولة الوصول لـ API بدون صلاحيات → يجب أن يفشل
   - محاولة تغيير دور عضو بدون صلاحيات → يجب أن يفشل

2. **اختبارات المحاسبة:**
   - محاولة إنشاء قيد غير متوازن → يجب أن يفشل
   - محاولة تعديل فاتورة بعد قيود → يجب أن يفشل

3. **اختبارات المخزون:**
   - محاولة إنشاء حركة بيع بدون reference_id → يجب أن يفشل
   - محاولة إنشاء حركة لفاتورة ملغاة → يجب أن يفشل

---

## 📝 ملاحظات مهمة

1. **لا refactor:** هذه الإصلاحات فقط، بدون تحسينات معمارية
2. **لا تغيير سلوك:** فقط إضافة حماية وقيود
3. **اختبار شامل:** يجب اختبار كل إصلاح قبل الانتقال للتالي
4. **توثيق:** توثيق كل تغيير في commit message

---

## 🚀 الخطوات التالية

1. **مراجعة الخطة:** التأكد من فهم جميع الإصلاحات
2. **الموافقة:** الحصول على موافقة صريحة للبدء
3. **التنفيذ:** تنفيذ الإصلاحات واحداً تلو الآخر
4. **الاختبار:** اختبار كل إصلاح بعد تنفيذه
5. **التوثيق:** توثيق التغييرات

---

**✅ الخطة جاهزة للتنفيذ**  
**📅 تاريخ الإنشاء:** 2025-01-27  
**⏳ في انتظار الموافقة للبدء**

