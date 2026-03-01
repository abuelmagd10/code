# تطبيق الـ Migrations على قاعدة البيانات

## ربط شركات الشحن بالفروع (20260301)

لتطبيق migrations ربط شركات الشحن بالفروع (جدول `branch_shipping_providers`، التحقق، RLS، والـ triggers):

1. افتح **Supabase Dashboard** → مشروعك → **SQL Editor**.
2. انسخ محتوى الملف **`scripts/apply_20260301_branch_shipping_providers.sql`** بالكامل.
3. الصق في محرر الاستعلام واضغط **Run**.

يُطبّق الملف بالترتيب:
- **20260301_001**: جدول الربط، دالة التحقق، RLS، وtriggers على invoices / sales_orders / bills.
- **20260301_002**: trigger سلامة (الفرع وشركة الشحن من نفس الشركة).

---

## إصلاح قيد الدفع: خطأ "Cannot add lines to a posted journal entry" (20260301_003)

إذا ظهر خطأ **400** عند تسجيل دفعة على فاتورة مع رسالة `Cannot add lines to a posted journal entry. Use Reversal instead.` (كود P0001):

1. افتح **Supabase Dashboard** → مشروعك → **SQL Editor**.
2. انسخ محتوى الملف **`scripts/apply_20260301_003_payment_journal_draft_then_posted.sql`** بالكامل.
3. الصق واضغط **Run**.

هذا يحدّث دالة `auto_create_payment_journal()` بحيث تُدخل القيد كـ **draft** ثم تضيف الأسطر ثم ترحّل القيد، فلا يتعارض مع الـ trigger الذي يمنع إضافة أسطر لقالب مرحّل.

---

## التعديلات الأخيرة (20260228)

إذا واجهت تعارضاً في سجل الـ migrations عند تشغيل `npx supabase db push`، يمكنك تطبيق التعديلات الأخيرة يدوياً:

### الخطوات

1. افتح **Supabase Dashboard** → مشروعك → **SQL Editor**.
2. انسخ محتوى الملف **`scripts/apply_20260228_migrations.sql`** بالكامل.
3. الصق في محرر الاستعلام واضغط **Run**.

هذا الملف يطبق:

- **20260228_001**: تحديث دالة `auto_create_payment_journal()` لتمرير `branch_id` عند إنشاء قيد الدفع.
- **20260228_002**: أعمدة اعتماد المسحوبات الشخصية + دالة `approve_shareholder_drawing()`.

### عبر Supabase CLI (عند توافق السجل)

إذا كان سجل الـ migrations متوافقاً مع الملفات المحلية:

```bash
npx supabase db push --linked
```

(ستُطلب كلمة مرور قاعدة البيانات إن لزم.)

### إصلاح سجل الـ migrations

إذا ظهرت رسالة مثل: `Remote migration versions not found in local`، يمكنك إصلاح السجل ثم الدفع:

```bash
# حسب ما تقترحه الرسالة، مثلاً:
npx supabase migration repair --status reverted <version1> <version2>
npx supabase db push --linked
```

أو تطبيق **فقط** التعديلات الجديدة عبر الملف `apply_20260228_migrations.sql` كما في الخطوات أعلاه.
