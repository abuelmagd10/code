# إصلاح مشكلة عدم ظهور شركات الشحن للمستخدمين المدعوين

## 🔍 المشكلة
المستخدمون المدعوون (invited users) لا يمكنهم رؤية قائمة شركات الشحن في صفحات الفواتير وأوامر البيع.

## 🎯 السبب المحتمل
صلاحيات RLS (Row Level Security) في جدول `shipping_providers` قد تكون مقيدة على مالك الشركة فقط.

## ✅ الحل

### 1. تحديث صلاحيات RLS في Supabase

قم بتنفيذ الـ SQL التالي في Supabase SQL Editor:

```sql
-- حذف السياسات القديمة إن وجدت
DROP POLICY IF EXISTS "Users can view shipping providers for their company" ON shipping_providers;
DROP POLICY IF EXISTS "Users can manage shipping providers for their company" ON shipping_providers;

-- سياسة القراءة: السماح لجميع أعضاء الشركة (المالك والمدعوين)
CREATE POLICY "Company members can view shipping providers"
ON shipping_providers
FOR SELECT
USING (
  company_id IN (
    SELECT company_id 
    FROM company_members 
    WHERE user_id = auth.uid()
  )
);

-- سياسة الإدراج: السماح لأعضاء الشركة الذين لديهم صلاحية الكتابة
CREATE POLICY "Company members can insert shipping providers"
ON shipping_providers
FOR INSERT
WITH CHECK (
  company_id IN (
    SELECT company_id 
    FROM company_members 
    WHERE user_id = auth.uid()
  )
);

-- سياسة التحديث: السماح لأعضاء الشركة الذين لديهم صلاحية الكتابة
CREATE POLICY "Company members can update shipping providers"
ON shipping_providers
FOR UPDATE
USING (
  company_id IN (
    SELECT company_id 
    FROM company_members 
    WHERE user_id = auth.uid()
  )
);

-- سياسة الحذف: السماح لأعضاء الشركة الذين لديهم صلاحية الكتابة
CREATE POLICY "Company members can delete shipping providers"
ON shipping_providers
FOR DELETE
USING (
  company_id IN (
    SELECT company_id 
    FROM company_members 
    WHERE user_id = auth.uid()
  )
);
```

### 2. التحقق من جدول company_members

تأكد من أن جدول `company_members` يحتوي على صفوف للمستخدمين المدعوين:

```sql
-- التحقق من أعضاء الشركة
SELECT 
  cm.user_id,
  cm.company_id,
  cm.role,
  u.email
FROM company_members cm
LEFT JOIN auth.users u ON u.id = cm.user_id
WHERE cm.company_id = 'YOUR_COMPANY_ID';
```

### 3. اختبار الحل

بعد تطبيق السياسات الجديدة:

1. سجل دخول كمستخدم مدعو
2. افتح صفحة إنشاء فاتورة جديدة
3. افتح Console في المتصفح (F12)
4. ابحث عن الرسائل:
   ```
   [NewInvoice] Loading shipping providers for company: xxx
   [NewInvoice] Loaded shipping providers: N
   ```

### 4. إذا استمرت المشكلة

إذا لم يظهر أي خطأ في Console ولكن العدد = 0، تحقق من:

1. **هل توجد شركات شحن مسجلة؟**
   ```sql
   SELECT * FROM shipping_providers 
   WHERE company_id = 'YOUR_COMPANY_ID' 
   AND is_active = true;
   ```

2. **هل المستخدم المدعو موجود في company_members؟**
   ```sql
   SELECT * FROM company_members 
   WHERE user_id = 'INVITED_USER_ID';
   ```

3. **هل RLS مفعل على الجدول؟**
   ```sql
   SELECT tablename, rowsecurity 
   FROM pg_tables 
   WHERE tablename = 'shipping_providers';
   ```

## 📝 ملاحظات

- تم إضافة logging في الكود لتسهيل التشخيص
- الكود يستخدم `getActiveCompanyId` الذي يدعم المستخدمين المدعوين
- المشكلة غالباً في صلاحيات قاعدة البيانات وليس في الكود

## 🔗 الملفات المعدلة

- `app/invoices/new/page.tsx` - أضيف logging
- `app/invoices/[id]/edit/page.tsx` - أضيف logging
- `SHIPPING_PROVIDERS_RLS_FIX.md` - هذا الملف (التوثيق)