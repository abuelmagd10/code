# 🎯 خطة العمل: إكمال تغطية الحوكمة 100%

## ✅ ما تم إنجازه (Completed)

### APIs المحدثة بالنمط الإلزامي:
- ✅ `/api/sales-orders` (GET + POST)
- ✅ `/api/invoices` (GET only)
- ✅ `/api/suppliers` (GET + POST)
- ✅ `/api/customers` (GET + POST) - **تم الترقية**
- ✅ `/api/purchase-orders` (GET + POST) - **تم الترقية**
- ✅ `/api/bills` (GET + POST) - **تم الترقية**
- ✅ `/api/warehouses` (GET + POST) - **تم الترقية**

### الانتهاكات المحذوفة:
- ✅ لا توجد أنماط `OR branch_id IS NULL`
- ✅ لا توجد أنماط `OR warehouse_id IS NULL`
- ✅ لا توجد أنماط `OR cost_center_id IS NULL`

---

## 🔴 المتبقي - أولوية عالية (P0)

### 1. إضافة POST endpoint للفواتير
**الملف**: `app/api/invoices/route.ts`

```typescript
export async function POST(request: NextRequest) {
  const governance = await enforceGovernance()
  const body = await request.json()
  const dataWithGovernance = addGovernanceData(body, governance)
  validateGovernanceData(dataWithGovernance, governance)
  
  const supabase = createClient(cookies())
  const { data, error } = await supabase
    .from("invoices")
    .insert(dataWithGovernance)
    .select()
    .single()
  
  return NextResponse.json({ data })
}
```

### 2. إنشاء API للمدفوعات
**الملف الجديد**: `app/api/payments/route.ts`

```typescript
// GET + POST مع حوكمة كاملة
// يجب أن يحل محل /api/get-payment-details
```

### 3. ترقية APIs القديمة
- ⚠️ `/api/sales-returns` - ترقية من `applyDataVisibilityFilter()` إلى `enforceGovernance()`
- ⚠️ `/api/customer-debit-notes` - ترقية من `applyDataVisibilityFilter()` إلى `enforceGovernance()`
- ⚠️ `/api/vendor-credits` - ترقية من `applyDataVisibilityFilter()` إلى `enforceGovernance()`

---

## 🟡 المتبقي - أولوية متوسطة (P1)

### 4. إضافة POST endpoints
- [ ] `/api/customer-debit-notes` POST
- [ ] `/api/vendor-credits` POST
- [ ] `/api/sales-returns` POST (معطل حالياً)

### 5. مراجعة UPDATE/DELETE endpoints
- [ ] `/api/customers/update` + `/api/customers/delete`
- [ ] `/api/warehouses/[id]` PUT + DELETE
- [ ] `/api/suppliers/[id]` PUT + DELETE (إن وجد)

---

## 🟢 المتبقي - أولوية منخفضة (P2)

### 6. إعادة تفعيل المرتجعات
- [ ] اختبار `/api/sales-returns` بعد الترقية
- [ ] إضافة POST endpoint محمي
- [ ] تحديث README لإزالة تحذير التعطيل

### 7. APIs الإدارية
- [ ] مراجعة `/api/admin/*` للحوكمة
- [ ] مراجعة `/api/fix-*` للحوكمة (إن كانت تحتاج)

---

## 📋 قائمة التحقق (Checklist)

### للقراءة (GET):
- [x] استخدام `enforceGovernance()`
- [x] استخدام `applyGovernanceFilters()`
- [x] إرجاع metadata الحوكمة
- [x] معالجة الأخطاء بشكل صحيح

### للإدخال (POST):
- [x] استخدام `enforceGovernance()`
- [x] استخدام `addGovernanceData()`
- [x] استخدام `validateGovernanceData()`
- [x] إرجاع تأكيد الحوكمة

### للتحديث (PUT):
- [ ] التحقق من الوصول قبل التحديث
- [ ] منع تعديل حقول الحوكمة
- [ ] تسجيل التغييرات

### للحذف (DELETE):
- [ ] التحقق من الوصول قبل الحذف
- [ ] التحقق من عدم وجود تبعيات
- [ ] Soft delete إن أمكن

---

## 🚫 الميزات المحظورة حتى التغطية 100%

### ⛔ معطل حالياً:
1. **المرتجعات (Refunds)** - حتى ترقية API
2. **سير العمل (Workflows)** - حتى تطبيق الحوكمة الكاملة
3. **الموافقات (Approvals)** - حتى التغطية 100%

### ✅ شروط التفعيل:
1. إكمال جميع APIs في P0
2. اختبار الحوكمة بنجاح
3. مراجعة الكود من قبل المراجع
4. تحديث الوثائق

---

## 📊 مؤشرات الأداء الحالية

| المؤشر | قبل | بعد | المستهدف |
|--------|-----|-----|----------|
| APIs محمية بالكامل | 6/12 | 10/12 | 12/12 |
| POST endpoints محمية | 2/12 | 6/12 | 12/12 |
| NULL escapes | 0 | 0 | 0 |
| التغطية الإجمالية | 50% | 83% | 100% |

---

## 🎯 الجدول الزمني

### اليوم 1 (اليوم):
- ✅ إنشاء تقرير التغطية
- ✅ ترقية 4 APIs رئيسية
- ✅ حذف جميع NULL escapes
- [ ] إضافة POST للفواتير
- [ ] إنشاء API المدفوعات

### اليوم 2:
- [ ] ترقية APIs القديمة (3 APIs)
- [ ] إضافة POST endpoints المفقودة
- [ ] اختبار جميع التغييرات

### اليوم 3:
- [ ] مراجعة UPDATE/DELETE
- [ ] إعادة تفعيل المرتجعات
- [ ] اختبار شامل

### اليوم 4:
- [ ] مراجعة نهائية
- [ ] تحديث الوثائق
- [ ] طلب موافقة المراجع

---

## 🔒 النمط الإلزامي (Quick Reference)

### GET Pattern:
```typescript
const governance = await enforceGovernance()
let query = supabase.from('table').select('*')
query = applyGovernanceFilters(query, governance)
```

### POST Pattern:
```typescript
const governance = await enforceGovernance()
const dataWithGovernance = addGovernanceData(body, governance)
validateGovernanceData(dataWithGovernance, governance)
await supabase.from('table').insert(dataWithGovernance)
```

---

## 📝 ملاحظات مهمة

1. **لا تعدل governance-middleware.ts** بدون موافقة
2. **اختبر كل API** بعد التعديل
3. **وثق التغييرات** في CHANGELOG.md
4. **راجع الكود** قبل كل commit
5. **لا تفعل الميزات المحظورة** حتى التغطية 100%

---

## ✅ معايير القبول

### API يعتبر محمي عندما:
- ✅ يستخدم `enforceGovernance()` في أول سطر
- ✅ يطبق `applyGovernanceFilters()` على كل query
- ✅ يستخدم `addGovernanceData()` على كل insert
- ✅ يستخدم `validateGovernanceData()` قبل كل insert
- ✅ لا يحتوي على NULL escapes
- ✅ يرجع metadata الحوكمة

### النظام يعتبر جاهز عندما:
- ✅ جميع APIs محمية (12/12)
- ✅ جميع POST endpoints محمية (12/12)
- ✅ لا توجد NULL escapes (0)
- ✅ اختبار شامل ناجح
- ✅ موافقة المراجع

---

**تاريخ الإنشاء**: 2024-01-15  
**آخر تحديث**: 2024-01-15  
**الحالة**: 🟡 قيد التنفيذ (83% مكتمل)

**الهدف**: 🎯 تغطية 100% خلال 3 أيام
