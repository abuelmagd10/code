# اختبار نظام التحكم بالوصول

## الخطوات المطلوبة للاختبار

### 1. اختبار صفحة الموردين
- [ ] افتح http://localhost:3000/suppliers
- [ ] تحقق من عدم وجود أخطاء 400 في Console
- [ ] تحقق من ظهور قائمة الموردين بشكل صحيح
- [ ] تحقق من إمكانية إضافة مورد جديد
- [ ] تحقق من حفظ `created_by_user_id` عند الإضافة

### 2. اختبار صفحة العملاء
- [ ] افتح http://localhost:3000/customers
- [ ] تحقق من عدم وجود أخطاء 400 في Console
- [ ] تحقق من ظهور قائمة العملاء بشكل صحيح
- [ ] تحقق من إمكانية إضافة عميل جديد
- [ ] تحقق من حفظ `created_by_user_id` عند الإضافة

### 3. اختبار الفلترة حسب الدور

#### كمالك (Owner)
- [ ] يجب رؤية جميع الموردين/العملاء
- [ ] لا توجد فلترة على `created_by_user_id`

#### كموظف (Employee)
- [ ] يجب رؤية الموردين/العملاء الخاصين بالموظف فقط
- [ ] الفلترة على `created_by_user_id = user.id`

#### كمدير فرع (Branch Manager)
- [ ] يجب رؤية موردين/عملاء الفرع
- [ ] الفلترة على `branch_id = member.branch_id`

### 4. التحقق من قاعدة البيانات

```sql
-- التحقق من وجود الحقول
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name IN ('suppliers', 'customers')
AND column_name IN ('created_by_user_id', 'branch_id', 'cost_center_id', 'warehouse_id')
ORDER BY table_name, column_name;

-- التحقق من Indexes
SELECT indexname, tablename
FROM pg_indexes
WHERE tablename IN ('suppliers', 'customers')
AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

-- عرض بعض الموردين مع الحقول الجديدة
SELECT id, name, created_by_user_id, branch_id, cost_center_id, warehouse_id
FROM suppliers
LIMIT 5;

-- عرض بعض العملاء مع الحقول الجديدة
SELECT id, name, created_by_user_id, branch_id, cost_center_id, warehouse_id
FROM customers
LIMIT 5;
```

### 5. اختبار API مباشرة

```bash
# اختبار API الموردين
curl -X GET "http://localhost:3000/api/suppliers" \
  -H "Authorization: Bearer YOUR_TOKEN"

# اختبار API العملاء
curl -X GET "http://localhost:3000/api/customers" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 6. التحقق من Network Tab

افتح Developer Tools > Network وتحقق من:
- [ ] لا توجد طلبات 400 Bad Request
- [ ] جميع طلبات `/api/suppliers` تعود بـ 200 OK
- [ ] جميع طلبات `/api/customers` تعود بـ 200 OK
- [ ] الفلاتر المطبقة في URL صحيحة

### 7. اختبار الأداء

- [ ] قياس وقت تحميل صفحة الموردين
- [ ] قياس وقت تحميل صفحة العملاء
- [ ] التحقق من أن Indexes تعمل بشكل صحيح

```sql
-- شرح خطة الاستعلام للتحقق من استخدام Index
EXPLAIN ANALYZE
SELECT * FROM suppliers
WHERE created_by_user_id = 'some-uuid'
AND company_id = 'some-company-uuid';
```

## النتائج المتوقعة

### ✅ نجاح الاختبار
- لا توجد أخطاء 400 في Console
- جميع الصفحات تعمل بشكل صحيح
- الفلترة تعمل حسب الدور
- السجلات الجديدة تحفظ `created_by_user_id` تلقائياً

### ❌ فشل الاختبار
- أخطاء 400 في Console
- عدم ظهور الموردين/العملاء
- الفلترة لا تعمل
- `created_by_user_id` يبقى NULL

## ملاحظات

- السجلات القديمة (قبل التحديث) سيكون لديها `NULL` في الحقول الجديدة
- هذا طبيعي ومتوقع
- يمكن تحديثها لاحقاً إذا لزم الأمر

