# 🚀 ترقية نظام الإشعارات إلى Enterprise-grade

## 📋 نظرة عامة

تم ترقية نظام الإشعارات ليكون **Enterprise-grade** مع الحفاظ على **100% من التوافق الخلفي**. جميع الدوال والـ APIs الموجودة تعمل كما هي تمامًا، مع إضافة ميزات جديدة اختيارية.

---

## ✨ الميزات الجديدة

### 1️⃣ **Idempotency (منع التكرار)**

تم إضافة دعم `event_key` لمنع إنشاء إشعارات مكررة عند إعادة تنفيذ نفس الحدث.

#### **ما هو event_key؟**

`event_key` هو معرف فريد يمثل حدثًا معينًا. عند محاولة إنشاء إشعار بنفس `event_key` لنفس الشركة، سيتم إرجاع الإشعار الموجود بدلاً من إنشاء إشعار جديد.

#### **كيفية بناء event_key**

الصيغة القياسية:
```
{reference_type}:{reference_id}:{action}
```

**أمثلة:**
```typescript
// طلب نقل مخزون
"stock_transfer_request:TR-1023:created"

// طلب استرداد نقدي
"refund_request:RR-551:created"

// إشعار دائن مورد
"vendor_credit:VC-889:created"

// موافقة على طلب
"refund_request:RR-551:approved"

// تغيير دور مستخدم
"user_role_change:USER-123:manager"
```

#### **مثال على الاستخدام:**

```typescript
import { createNotification } from '@/lib/governance-layer'

// المرة الأولى - ينشئ إشعار جديد
const notificationId1 = await createNotification({
  companyId: 'company-123',
  referenceType: 'stock_transfer',
  referenceId: 'TR-1023',
  title: 'طلب نقل مخزون',
  message: 'يحتاج إلى موافقتك',
  createdBy: 'user-456',
  eventKey: 'stock_transfer_request:TR-1023:created', // ✅ event_key
  severity: 'info',
  category: 'inventory'
})

// المرة الثانية - يعيد نفس الإشعار (لا ينشئ جديد)
const notificationId2 = await createNotification({
  companyId: 'company-123',
  referenceType: 'stock_transfer',
  referenceId: 'TR-1023',
  title: 'طلب نقل مخزون (مكرر)', // ⚠️ لن يتم استخدام هذا العنوان
  message: 'رسالة مختلفة', // ⚠️ لن يتم استخدام هذه الرسالة
  createdBy: 'user-456',
  eventKey: 'stock_transfer_request:TR-1023:created', // ✅ نفس event_key
  severity: 'warning', // ⚠️ لن يتم تحديث severity
  category: 'inventory'
})

// notificationId1 === notificationId2 ✅
// البيانات الأصلية محفوظة (لا يتم تحديثها)
```

#### **ملاحظات مهمة:**

- ✅ `event_key` يجب أن يكون فريدًا داخل نفس الشركة (`company_id`)
- ✅ إذا كان `event_key` موجودًا، يتم إرجاع الإشعار الموجود **بدون تحديث** البيانات
- ✅ `event_key` اختياري - الإشعارات القديمة بدون `event_key` تعمل بشكل طبيعي
- ✅ يمكن استخدام `event_key` مع `assigned_to_role` أو `assigned_to_user` لإنشاء إشعارات مختلفة لنفس الحدث

---

### 2️⃣ **Severity (الأهمية)**

تم إضافة حقل `severity` لتصنيف مستوى أهمية الإشعار.

#### **القيم المسموحة:**

| القيمة | الوصف | الاستخدام |
|--------|-------|-----------|
| `info` | معلومات | إشعارات إعلامية عادية (افتراضي) |
| `warning` | تحذير | يحتاج إلى انتباه |
| `error` | خطأ | مشكلة تحتاج إلى حل |
| `critical` | حرج | مشكلة حرجة تحتاج إلى تدخل فوري |

#### **مثال:**

```typescript
await createNotification({
  // ... معاملات أخرى
  severity: 'critical', // ✅
  category: 'finance'
})
```

---

### 3️⃣ **Category (الفئة)**

تم إضافة حقل `category` لتصنيف نوع الإشعار.

#### **القيم المسموحة:**

| القيمة | الوصف | الاستخدام |
|--------|-------|-----------|
| `finance` | مالية | إشعارات مالية ومحاسبية |
| `inventory` | مخزون | إشعارات المخزون والنقل |
| `sales` | مبيعات | إشعارات المبيعات والعملاء |
| `approvals` | موافقات | طلبات الموافقة |
| `system` | نظام | إشعارات النظام (افتراضي) |

#### **مثال:**

```typescript
await createNotification({
  // ... معاملات أخرى
  severity: 'high',
  category: 'finance' // ✅
})
```

---

## 🔄 التوافق الخلفي (Backward Compatibility)

### ✅ **جميع الدوال القديمة تعمل كما هي:**

#### **1. SQL Functions:**

```sql
-- ✅ تعمل بدون تغيير
SELECT create_notification(
  p_company_id := '...',
  p_reference_type := '...',
  p_reference_id := '...',
  p_title := '...',
  p_message := '...',
  p_created_by := '...'
  -- ✅ المعاملات الجديدة اختيارية
);
```

#### **2. TypeScript Functions:**

```typescript
// ✅ تعمل بدون تغيير
await createNotification({
  companyId: '...',
  referenceType: '...',
  referenceId: '...',
  title: '...',
  message: '...',
  createdBy: '...'
  // ✅ المعاملات الجديدة اختيارية
})

// ✅ تعمل بدون تغيير
await getUserNotifications({
  userId: '...',
  companyId: '...'
  // ✅ المعاملات الجديدة اختيارية
})
```

### ✅ **القيم الافتراضية:**

- `severity`: `'info'` (إذا لم يتم تمريره)
- `category`: `'system'` (إذا لم يتم تمريره)
- `event_key`: `null` (إذا لم يتم تمريره)

---

## 📚 أمثلة عملية

### **مثال 1: إشعار طلب استرداد نقدي**

```typescript
import { notifyRefundRequestCreated } from '@/lib/notification-helpers'

await notifyRefundRequestCreated({
  companyId: 'company-123',
  refundRequestId: 'RR-551',
  amount: 1000,
  currency: 'SAR',
  createdBy: 'user-456',
  branchId: 'branch-789',
  // ✅ يتم تمرير event_key و severity و category تلقائيًا
  // eventKey: 'refund_request:RR-551:created:manager'
  // severity: 'high'
  // category: 'finance'
})
```

### **مثال 2: إشعار نقل مخزون**

```typescript
import { notifyStockTransferRequest } from '@/lib/notification-helpers'

await notifyStockTransferRequest({
  companyId: 'company-123',
  transferId: 'TR-1023',
  destinationBranchId: 'branch-789',
  destinationWarehouseId: 'warehouse-456',
  createdBy: 'user-123',
  // ✅ يتم تمرير event_key و severity و category تلقائيًا
  // eventKey: 'stock_transfer_request:TR-1023:created'
  // severity: 'info'
  // category: 'inventory'
})
```

### **مثال 3: إشعار مخصص**

```typescript
import { createNotification } from '@/lib/governance-layer'

await createNotification({
  companyId: 'company-123',
  referenceType: 'invoice',
  referenceId: 'INV-001',
  title: 'فاتورة جديدة',
  message: 'تم إنشاء فاتورة جديدة',
  createdBy: 'user-456',
  assignedToRole: 'accountant',
  priority: 'high',
  // ✅ الميزات الجديدة
  eventKey: 'invoice:INV-001:created',
  severity: 'info',
  category: 'sales'
})
```

### **مثال 4: فلترة حسب severity و category**

```typescript
import { getUserNotifications } from '@/lib/governance-layer'

// جلب إشعارات حرجة فقط
const criticalNotifications = await getUserNotifications({
  userId: 'user-123',
  companyId: 'company-123',
  severity: 'critical' // ✅
})

// جلب إشعارات مالية فقط
const financeNotifications = await getUserNotifications({
  userId: 'user-123',
  companyId: 'company-123',
  category: 'finance' // ✅
})

// جلب إشعارات حرجة في الفئة المالية
const criticalFinance = await getUserNotifications({
  userId: 'user-123',
  companyId: 'company-123',
  severity: 'critical',
  category: 'finance'
})
```

---

## 🗄️ التغييرات في قاعدة البيانات

### **الأعمدة الجديدة:**

```sql
ALTER TABLE notifications 
ADD COLUMN event_key TEXT NULL;

ALTER TABLE notifications 
ADD COLUMN severity TEXT NOT NULL DEFAULT 'info' 
  CHECK (severity IN ('info', 'warning', 'error', 'critical'));

ALTER TABLE notifications 
ADD COLUMN category TEXT NOT NULL DEFAULT 'system' 
  CHECK (category IN ('finance', 'inventory', 'sales', 'approvals', 'system'));
```

### **الفهارس الجديدة:**

```sql
-- فهرس فريد لمنع التكرار
CREATE UNIQUE INDEX idx_notifications_event_key_unique 
ON notifications(company_id, event_key) 
WHERE event_key IS NOT NULL;

-- فهارس للأداء
CREATE INDEX idx_notifications_severity 
ON notifications(company_id, severity, created_at DESC);

CREATE INDEX idx_notifications_category 
ON notifications(company_id, category, created_at DESC);
```

---

## 🧪 الاختبارات

تم إنشاء ملف اختبارات شامل في:
```
scripts/test_notifications_enterprise.js
```

### **الاختبارات المتوفرة:**

1. ✅ **Idempotency Test**: التحقق من أن نفس `event_key` لا ينشئ إشعارات مكررة
2. ✅ **Backward Compatibility Test**: التحقق من أن الإشعارات القديمة تعمل بدون `event_key`
3. ✅ **Severity & Category Test**: التحقق من حفظ وعرض `severity` و `category`
4. ✅ **Filtering Test**: التحقق من فلترة الإشعارات حسب `severity` و `category`

### **تشغيل الاختبارات:**

```bash
# ⚠️ يجب تعيين متغيرات البيئة أولاً
export NEXT_PUBLIC_SUPABASE_URL="your-supabase-url"
export SUPABASE_SERVICE_ROLE_KEY="your-service-key"

# تشغيل الاختبارات
node scripts/test_notifications_enterprise.js
```

---

## 📝 قائمة التحقق (Checklist)

### **قبل التطبيق:**

- [ ] قراءة هذا التوثيق بالكامل
- [ ] فهم كيفية بناء `event_key`
- [ ] تحديد `severity` و `category` المناسبة لكل نوع إشعار

### **التطبيق:**

- [ ] تشغيل `scripts/upgrade_notifications_enterprise.sql` في Supabase SQL Editor
- [ ] التحقق من نجاح الترقية (لا أخطاء)
- [ ] تشغيل الاختبارات للتحقق من كل شيء

### **بعد التطبيق:**

- [ ] تحديث الكود لاستخدام `event_key` في الإشعارات الجديدة
- [ ] تحديث الكود لاستخدام `severity` و `category` عند الحاجة
- [ ] التحقق من أن الإشعارات القديمة تعمل بشكل طبيعي

---

## ⚠️ ملاحظات مهمة

### **1. event_key يجب أن يكون فريدًا:**

```typescript
// ✅ صحيح
eventKey: 'refund_request:RR-551:created:manager'
eventKey: 'refund_request:RR-551:created:owner'

// ❌ خطأ - نفس event_key لنفس company_id
eventKey: 'refund_request:RR-551:created' // للمدير
eventKey: 'refund_request:RR-551:created' // للمالك (سيتم إرجاع إشعار المدير!)
```

**الحل:** إضافة معرف المستلم في `event_key`:
```typescript
eventKey: `${referenceType}:${referenceId}:${action}:${assignedToRole || assignedToUser}`
```

### **2. البيانات الأصلية محفوظة:**

عند استخدام `event_key` موجود، **لا يتم تحديث** البيانات. الإشعار الأصلي يبقى كما هو.

### **3. التوافق الخلفي 100%:**

جميع الإشعارات القديمة بدون `event_key` تعمل بشكل طبيعي. لا حاجة لتحديث الكود القديم.

---

## 🔗 المراجع

- **SQL Migration Script**: `scripts/upgrade_notifications_enterprise.sql`
- **TypeScript Types**: `lib/governance-layer.ts`
- **Helper Functions**: `lib/notification-helpers.ts`
- **UI Component**: `components/NotificationCenter.tsx`
- **Tests**: `scripts/test_notifications_enterprise.js`

---

## 📞 الدعم

إذا واجهت أي مشاكل أو لديك أسئلة:

1. راجع هذا التوثيق
2. تحقق من الاختبارات
3. راجع الكود في `lib/governance-layer.ts` و `lib/notification-helpers.ts`

---

**✅ تم الترقية بنجاح!** 🎉
