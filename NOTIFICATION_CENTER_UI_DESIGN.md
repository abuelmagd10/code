# 🎨 Notification Center UI Design - ERP-Grade Professional

## 📋 نظرة عامة

تصميم احترافي لمركز الإشعارات مناسب لتطبيق ERP مؤسسي متعدد الشركات والفروع. يدعم الحوكمة والموافقات مع واجهة مستخدم واضحة وسريعة.

## 🏗️ الهيكل العام

### 🔹 A. Header Bar (الشريط العلوي)

**الموقع**: أعلى Dialog

**المحتوى**:
1. **العنوان**: "مركز الإشعارات" / "Notification Center"
2. **العدادات الديناميكية**:
   - غير مقروء (Unread): Badge أزرق
   - عالي الأولوية (High Priority): Badge برتقالي
   - الإجمالي (Total): عدد الإشعارات
3. **الأزرار السريعة**:
   - 🔘 "تحديد الكل كمقروء" (Mark All Read)
   - 🗑️ "أرشفة الكل المقروء" (Archive Read)
   - 🔄 Refresh يدوي

**التصميم**:
- Gradient background: `from-blue-50 to-indigo-50`
- Border bottom للفصل
- Responsive layout

### 🔹 B. Advanced Filters (شريط الفلاتر)

**الموقع**: تحت Header Bar

**الفلاتر الأساسية**:
1. **الحالة (Status)**:
   - الكل
   - غير مقروء
   - مقروء
   - تم التنفيذ
   - مؤرشف

2. **الأولوية (Priority)**:
   - urgent (عاجل)
   - high (عالي)
   - normal (عادي)
   - low (منخفض)

3. **التصنيف (Category)**:
   - approvals (موافقات)
   - inventory (مخزون)
   - finance (مالية)
   - sales (مبيعات)
   - system (نظام)

4. **النوع (Reference Type)**:
   - write_off (إهلاك)
   - invoice (فاتورة مبيعات)
   - bill (فاتورة مشتريات)
   - purchase_order (أمر شراء)
   - sales_order (أمر بيع)
   - inventory_transfer (نقل مخزون)
   - approval_request (طلب اعتماد)
   - refund_request (طلب استرداد)
   - وغيرها...

5. **الفرع (Branch)** - للمستخدمين Owner/Admin فقط:
   - قائمة بجميع الفروع

6. **المخزن (Warehouse)** - للمستخدمين Owner/Admin فقط:
   - قائمة بجميع المخازن

7. **البحث النصي**:
   - في العنوان
   - في الرسالة
   - في رقم المرجع (reference_id)

**الميزات**:
- ✅ تعمل بدون Refresh
- ✅ مرتبطة بـ Realtime + API
- ✅ تحفظ آخر اختيار (localStorage - اختياري)

### 🔹 C. Notification Cards (كروت الإشعارات)

**التصميم**:

#### السطر العلوي:
- **أيقونة حسب التصنيف**:
  - 🟡 موافقات: `Shield` (amber)
  - 🔵 مخزون: `Package` (blue)
  - 🟢 مالية: `DollarSign` (green)
  - 🔴 مبيعات: `TrendingUp` (purple)
  - ⚪ نظام: `Bell` (gray)

- **العنوان (Bold)**: `font-bold text-base`

- **Badges**:
  - [Priority]: حسب الأولوية (urgent=red, high=orange, normal=blue, low=gray)
  - [Status]: نقطة زرقاء متحركة للـ unread
  - [Actioned]: أيقونة CheckCircle خضراء

#### السطر الثاني:
- **الرسالة**: `text-sm text-gray-700`

#### السطر الثالث (Meta Info):
- 📍 **الفرع**: `MapPin` + اسم الفرع
- 🏬 **المخزن**: `Package` + اسم المخزن
- 👤 **أنشأ بواسطة**: `User` + اسم المستخدم
- 🕒 **الوقت**: `Clock` + "منذ ساعتين"
- 📄 **النوع**: `FileText` + نوع المرجع

#### السطر الرابع (Actions):
- **أزرار الإجراءات** حسب النوع والحالة

**الألوان حسب الأولوية**:
- **urgent**: `bg-red-50` + `border-red-200` + أيقونة `Zap` حمراء
- **high**: `bg-orange-50` + `border-orange-200` + أيقونة `AlertTriangle` برتقالية
- **normal**: `bg-blue-50` + `border-blue-200` + أيقونة `Info` زرقاء
- **low**: `bg-gray-50` + `border-gray-200` + أيقونة `AlertCircle` رمادية

**الألوان حسب الحالة**:
- **unread**: `bg-blue-50` + `border-l-4 border-l-blue-500`
- **read**: `bg-white`
- **actioned**: `bg-green-50` + `border-l-4 border-l-green-500`
- **archived**: `bg-gray-50` + `opacity-60`

## 🎯 Context Actions (أزرار الإجراءات الذكية)

### قواعد العرض:

#### 1. إشعارات الموافقات (Approvals) - للمستخدمين Owner/Admin:

**إذا الحالة = unread أو read**:
- ✅ **"اعتماد"** (Approve): زر أخضر
- 🔴 **"رفض"** (Reject): زر أحمر
- 🔍 **"فتح المرجع"** (Open Reference): زر outline

**إذا الحالة = actioned**:
- 🔍 **"عرض التفاصيل"** (View Details) فقط

#### 2. إشعارات عادية:

**إذا الحالة = unread أو read**:
- 🔍 **"فتح المرجع"** (Open Reference)
- 👁️ **"تمييز كمقروء"** (Mark as Read) - إذا unread
- ✅ **"تم التنفيذ"** (Actioned)
- 🗂️ **"أرشفة"** (Archive)

**إذا الحالة = actioned**:
- 🔍 **"عرض التفاصيل"** فقط

**إذا الحالة = archived**:
- لا توجد أزرار (مؤرشفة)

## 🔗 Deep Linking

### خريطة reference_type إلى route:

```typescript
const REFERENCE_TYPE_TO_ROUTE = {
  // المخزون
  'write_off': (id) => `/inventory/write-offs?highlight=${id}`,
  'inventory_transfer': (id) => `/inventory-transfers/${id}`,
  
  // المبيعات
  'invoice': (id) => `/invoices/${id}`,
  'sales_order': (id) => `/sales-orders/${id}`,
  'customer_debit_note': (id) => `/customer-debit-notes?highlight=${id}`,
  
  // المشتريات
  'bill': (id) => `/bills/${id}`,
  'purchase_order': (id) => `/purchase-orders/${id}`,
  'vendor_credit': (id) => `/vendor-credits?highlight=${id}`,
  
  // المالية
  'payment': (id) => `/payments?highlight=${id}`,
  'journal_entry': (id) => `/journal-entries/${id}`,
  'depreciation': (id) => `/fixed-assets?highlight=depreciation-${id}`,
  
  // الموافقات
  'approval_request': (id) => `/approvals?highlight=${id}`,
  'refund_request': (id) => `/payments?highlight=refund-${id}`,
}
```

### السلوك:
1. عند الضغط على الإشعار → فتح الصفحة الصحيحة
2. تمرير `reference_id` كـ query param أو route param
3. إغلاق Notification Center تلقائياً
4. بدون Reload
5. بدون فقد السياق

## 🎨 نظام الألوان

### حسب الأولوية:

| الأولوية | الخلفية | الحدود | الأيقونة | Badge |
|---------|---------|--------|---------|-------|
| urgent | `bg-red-50` | `border-red-200` | `Zap` أحمر | أحمر |
| high | `bg-orange-50` | `border-orange-200` | `AlertTriangle` برتقالي | برتقالي |
| normal | `bg-blue-50` | `border-blue-200` | `Info` أزرق | أزرق |
| low | `bg-gray-50` | `border-gray-200` | `AlertCircle` رمادي | رمادي |

### حسب الحالة:

| الحالة | الخلفية | الحدود | المؤشر |
|--------|---------|--------|--------|
| unread | `bg-blue-50` | `border-l-4 border-l-blue-500` | نقطة زرقاء متحركة |
| read | `bg-white` | عادي | - |
| actioned | `bg-green-50` | `border-l-4 border-l-green-500` | CheckCircle أخضر |
| archived | `bg-gray-50` | عادي | `opacity-60` |

## 📊 الترتيب والفرز

### الترتيب الافتراضي:
1. **urgent** أولاً
2. ثم **high**
3. ثم **normal**
4. ثم **low**
5. داخل كل أولوية: **الأحدث أولاً**

### إمكانية التغيير (مستقبلاً):
- حسب التاريخ (أحدث → أقدم)
- حسب الأولوية (urgent → low)
- حسب النوع (approvals → inventory → ...)

## 🔄 حالات خاصة

### 1. حالة التحميل (Loading State)

**Skeleton Loader**:
```tsx
<div className="space-y-3">
  {[1, 2, 3, 4, 5].map(i => (
    <div className="p-4 rounded-lg border">
      <Skeleton className="w-5 h-5" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-full" />
    </div>
  ))}
</div>
```

### 2. حالة فارغة (Empty State)

**التصميم**:
- أيقونة `Bell` كبيرة (w-20 h-20)
- عنوان: "لا توجد إشعارات حالياً"
- رسالة: "كل شيء تحت السيطرة 👌"
- تصميم مركزي وجميل

### 3. حالة الخطأ (Error State)

**التصميم**:
- أيقونة `AlertCircle`
- رسالة خطأ واضحة
- زر "إعادة المحاولة"

## 🚀 الأداء والتقنية

### Realtime Updates:
- ✅ دعم Realtime بدون Refresh
- ✅ تحديث العداد في Sidebar فوراً
- ✅ منع duplicate events
- ✅ احترام الصلاحيات والفروع

### Optimization:
- ✅ استخدام `useMemo` للـ displayNotifications
- ✅ استخدام `useCallback` للدوال
- ✅ Lazy loading للـ user names
- ✅ Debounce للبحث (مستقبلاً)

## 📱 Responsive Design

- **Desktop**: Grid layout للفلاتر (6 columns)
- **Tablet**: Grid layout (4 columns)
- **Mobile**: Grid layout (2 columns)
- **Dialog**: `max-w-4xl` على Desktop، full-width على Mobile

## 🧪 سيناريوهات الاستخدام

### 1. موافقة على إهلاك

**الخطوات**:
1. إشعار جديد: "طلب اعتماد إهلاك جديد"
2. المستخدم (Owner) يرى:
   - Badge: [High] [Approvals]
   - أزرار: "اعتماد" و "رفض"
3. الضغط على "اعتماد" → تنفيذ الموافقة
4. الإشعار يصبح `actioned`

### 2. فتح فاتورة من إشعار

**الخطوات**:
1. إشعار: "فاتورة جديدة رقم INV-001"
2. الضغط على الإشعار
3. فتح `/invoices/INV-001` تلقائياً
4. إغلاق Notification Center

### 3. فلترة حسب النوع

**الخطوات**:
1. اختيار "النوع" → "إهلاك"
2. عرض إشعارات الإهلاك فقط
3. تحديث فوري بدون Refresh

## 📚 المراجع

- `components/NotificationCenter.tsx` - المكون الرئيسي
- `lib/notification-routing.ts` - Deep Linking
- `lib/governance-layer.ts` - Notification Types
- `hooks/use-realtime-table.ts` - Realtime Integration

## ✅ Checklist

- [x] Header Bar مع عدادات
- [x] Advanced Filters
- [x] Notification Card محسّن
- [x] Context Actions
- [x] Deep Linking
- [x] Skeleton Loader
- [x] Empty State
- [x] نظام الألوان
- [x] Responsive Design
- [x] Realtime Integration
- [x] التوثيق

---

**🎉 Notification Center جاهز للإنتاج!**
