# نظام بونص المبيعات | Sales Bonus System

## نظرة عامة | Overview

نظام بونص المبيعات هو نظام متكامل لحساب وإدارة عمولات المبيعات للموظفين. يتم حساب البونص تلقائياً عند تحويل الفاتورة إلى حالة "مدفوعة" (Paid).

The Sales Bonus System is an integrated system for calculating and managing sales commissions for employees. Bonuses are automatically calculated when an invoice transitions to "Paid" status.

---

## الميزات الرئيسية | Key Features

### 1. أنواع البونص | Bonus Types
- **نسبة مئوية (Percentage)**: نسبة من قيمة الفاتورة (مثال: 2%)
- **مبلغ ثابت (Fixed)**: مبلغ ثابت لكل فاتورة
- **نظام النقاط (Points)**: نقاط لكل وحدة عملة (مثال: 1 نقطة لكل 100 جنيه)

### 2. الحدود القصوى | Caps
- **الحد اليومي**: حد أقصى للبونص اليومي لكل موظف
- **الحد الشهري**: حد أقصى للبونص الشهري لكل موظف

### 3. طرق الصرف | Payout Modes
- **مع المرتبات (Payroll)**: يُضاف البونص للمرتب الشهري
- **فوري (Immediate)**: يُصرف البونص مباشرة بعد دفع الفاتورة

---

## إعداد النظام | System Setup

### 1. تفعيل النظام | Enable the System

1. اذهب إلى **الإعدادات** (Settings)
2. ابحث عن قسم **إعدادات بونص المبيعات** (Sales Bonus Settings)
3. فعّل خيار **Enable** / **تفعيل**
4. اختر نوع البونص والقيمة
5. حدد الحدود القصوى (اختياري)
6. اختر طريقة الصرف
7. اضغط **حفظ إعدادات البونص**

### 2. ربط الموظفين بالمستخدمين | Link Employees to Users

لكي يحصل الموظف على البونص، يجب ربط حسابه بسجل الموظف:

```sql
UPDATE employees 
SET user_id = 'auth-user-uuid' 
WHERE id = 'employee-id';
```

### 3. تعيين منشئ الفاتورة | Set Invoice Creator

يتم تعيين `created_by_user_id` تلقائياً عند إنشاء الفاتورة.

---

## كيفية العمل | How It Works

### 1. حساب البونص | Bonus Calculation

عند تغيير حالة الفاتورة إلى "مدفوعة":
1. يتحقق النظام من تفعيل البونص للشركة
2. يحدد منشئ الفاتورة (من الفاتورة أو أمر البيع)
3. يحسب قيمة البونص حسب النوع المحدد
4. يتحقق من الحدود القصوى
5. ينشئ سجل البونص بحالة "معلق" (pending)

### 2. ربط البونص بالمرتبات | Attach to Payroll

في صفحة المرتبات:
1. تظهر البونصات المعلقة في بطاقة خاصة
2. اضغط **ربط بالمرتبات** لإضافتها لتشغيل المرتبات الحالي
3. تتحول حالة البونص إلى "مجدول" (scheduled)
4. يُضاف المبلغ لعمود "بونص المبيعات" في قسيمة الراتب

### 3. عكس البونص | Bonus Reversal

عند إرجاع الفاتورة بالكامل:
1. يتم عكس البونص تلقائياً
2. تتحول حالته إلى "ملغي" (reversed)
3. إذا كان مرتبطاً بمرتب، يُخصم من قسيمة الراتب

---

## API Endpoints

### GET /api/bonuses
جلب البونصات مع الفلاتر

**Parameters:**
- `companyId` (required): معرف الشركة
- `userId`: معرف المستخدم
- `status`: حالة البونص (pending, scheduled, paid, reversed)
- `year`: السنة
- `month`: الشهر

### POST /api/bonuses
حساب بونص لفاتورة

**Body:**
```json
{
  "invoiceId": "invoice-uuid",
  "companyId": "company-uuid"
}
```

### POST /api/bonuses/attach-to-payroll
ربط البونصات المعلقة بتشغيل المرتبات

**Body:**
```json
{
  "companyId": "company-uuid",
  "payrollRunId": "payroll-run-uuid"
}
```

### POST /api/bonuses/reverse
عكس بونص

**Body:**
```json
{
  "bonusId": "bonus-uuid",
  "reason": "سبب العكس"
}
```

### GET/PATCH /api/bonuses/settings
إدارة إعدادات البونص للشركة

---

## جدول قاعدة البيانات | Database Schema

### user_bonuses
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | المعرف الفريد |
| company_id | uuid | معرف الشركة |
| user_id | uuid | معرف المستخدم |
| employee_id | uuid | معرف الموظف |
| invoice_id | uuid | معرف الفاتورة |
| bonus_amount | decimal | قيمة البونص |
| bonus_type | text | نوع البونص |
| status | text | الحالة |
| payroll_run_id | uuid | معرف تشغيل المرتبات |
| calculated_at | timestamp | تاريخ الحساب |
| paid_at | timestamp | تاريخ الصرف |

---

## التقارير | Reports

### تقرير بونصات المبيعات
**المسار:** `/reports/sales-bonuses`

يعرض:
- إحصائيات البونصات (إجمالي، معلق، مجدول، مدفوع، ملغي)
- قائمة تفصيلية بجميع البونصات
- فلترة حسب الموظف، الحالة، السنة، الشهر
- تصدير CSV

---

## الأمان | Security

- جميع العمليات تتطلب مصادقة
- فقط المالك والمدير يمكنهم تعديل الإعدادات
- سياسات RLS تحمي البيانات على مستوى الصف
- تسجيل جميع العمليات في سجل المراجعة

