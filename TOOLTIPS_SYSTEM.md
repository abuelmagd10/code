# نظام التلميحات التوضيحية (Enhanced Tooltips System)

نظام متقدم لإضافة التلميحات التوضيحية التلقائية بناءً على التعليقات الموجودة في الكود.

## المميزات

- ✅ استخراج التلميحات تلقائياً من تعليقات الكود
- ✅ دعم اللغة العربية والإنجليزية
- ✅ تصنيف التلميحات حسب النوع (واجهة، مكونات، دوال)
- ✅ واجهة إدارة شاملة للتلميحات
- ✅ أمثلة تفاعلية لاستخدام التلميحات
- ✅ تحديث التلميحات تلقائياً عند تغيير الكود
- ✅ دعم مواضع مختلفة للتلميحات (أعلى، أسفل، يمين، يسار)

## الملفات المضافة

### المكونات الأساسية
- `components/ui/enhanced-tooltip.tsx` - مكون التلميحات المحسن
- `components/TooltipManager.tsx` - واجهة إدارة التلميحات
- `components/TooltipExamples.tsx` - أمثلة تفاعلية
- `components/enhanced-sidebar.tsx` - قائمة جانبية محسنة بالتلميحات

### الأدوات والسكريپتات
- `lib/tooltip-extractor.ts` - مكتبة استخراج التلميحات (TypeScript)
- `scripts/extract-tooltips-simple.js` - سكريپت استخراج التلميحات (Node.js)
- `scripts/extract-tooltips.js` - سكريپت تشغيل العملية

### API والصفحات
- `app/api/update-tooltips/route.ts` - API endpoint لتحديث التلميحات
- `app/settings/tooltips/page.tsx` - صفحة إدارة التلميحات

### الملفات المحدثة
- `components/ui/button.tsx` - تحديث مكون Button لدعم التلميحات
- `tooltips.json` - ملف التلميحات المستخرجة

## كيفية الاستخدام

### 1. استخراج التلميحات من الكود

```bash
# تشغيل سكريپت استخراج التلميحات
node scripts/extract-tooltips-simple.js
```

### 2. استخدام التلميحات في المكونات

```tsx
import { EnhancedTooltip } from '@/components/ui/enhanced-tooltip'

// استخدام تلميح تلقائي بناءً على اسم الدالة
<EnhancedTooltip functionName="save">
  <Button>حفظ</Button>
</EnhancedTooltip>

// استخدام تلميح مخصص
<EnhancedTooltip content="هذا تلميح مخصص">
  <Button>زر مخصص</Button>
</EnhancedTooltip>

// تخصيص موضع التلميح
<EnhancedTooltip content="تلميح سفلي" side="bottom">
  <Button>زر</Button>
</EnhancedTooltip>
```

### 3. استخدام Button المحسن

```tsx
import { Button } from '@/components/ui/button'

// زر مع تلميح تلقائي
<Button functionName="save">حفظ</Button>

// زر مع تلميح مخصص
<Button tooltip="حفظ البيانات المدخلة">حفظ</Button>

// زر مع تلميح في موضع مخصص
<Button tooltip="حذف العنصر" tooltipSide="left">حذف</Button>
```

## إدارة التلميحات

### الوصول لواجهة الإدارة
انتقل إلى: `/settings/tooltips`

### المميزات المتاحة
- عرض جميع التلميحات المستخرجة
- البحث والفلترة حسب الفئة
- تحديث التلميحات من الكود
- عرض أمثلة تفاعلية
- إحصائيات التلميحات

## API Endpoints

### تحديث التلميحات
```
POST /api/update-tooltips
```

### قراءة التلميحات
```
GET /api/update-tooltips
```

## تصنيف التلميحات

### واجهة المستخدم (UI)
- أزرار، حقول إدخال، بطاقات، حوارات

### المكونات (Components)
- لوحة التحكم، القائمة الجانبية، الرأس، التذييل

### الدوال (Functions)
- دوال، طرق، معالجات الأحداث

### أخرى (Other)
- باقي العناصر غير المصنفة

## التخصيص

### إضافة تلميحات جديدة يدوياً

```tsx
// في ملف enhanced-tooltip.tsx
const tooltipMap: Record<string, string> = {
  // إضافة تلميحات جديدة
  'custom_function': 'وصف الدالة المخصصة',
  'special_button': 'وصف الزر الخاص',
  // ...
}
```

### تحديث التلميحات برمجياً

```tsx
import { updateTooltipMap } from '@/components/ui/enhanced-tooltip'

// إضافة تلميحات جديدة
updateTooltipMap({
  'new_tooltip': 'تلميح جديد',
  'another_tooltip': 'تلميح آخر'
})
```

## أفضل الممارسات

### كتابة التعليقات في الكود
```tsx
// إدارة العملاء - عرض وتعديل بيانات العملاء
function CustomerManager() {
  // ...
}

// حفظ البيانات - حفظ التغييرات في قاعدة البيانات
const saveData = () => {
  // ...
}
```

### استخدام التلميحات
- استخدم أسماء دوال واضحة ومعبرة
- اكتب تعليقات مفيدة وواضحة
- حدث التلميحات بانتظام عند تغيير الكود
- استخدم مواضع مناسبة للتلميحات

## الصيانة

### تحديث دوري للتلميحات
```bash
# تشغيل التحديث كل فترة
node scripts/extract-tooltips-simple.js
```

### مراقبة الأداء
- تأكد من عدم وجود تلميحات مكررة
- راقب حجم ملف tooltips.json
- احذف التلميحات غير المستخدمة

## استكشاف الأخطاء

### مشاكل شائعة

1. **التلميحات لا تظهر**
   - تأكد من استيراد EnhancedTooltip
   - تحقق من وجود التلميح في tooltipMap

2. **التلميحات لا تتحدث**
   - شغل سكريپت الاستخراج
   - تأكد من وجود تعليقات في الكود

3. **أخطاء في API**
   - تحقق من صلاحيات الملفات
   - راجع سجلات الخادم

## المساهمة

لإضافة مميزات جديدة أو إصلاح مشاكل:

1. أضف التعليقات المناسبة في الكود
2. شغل سكريپت الاستخراج
3. اختبر التلميحات في واجهة الإدارة
4. تأكد من عمل الأمثلة التفاعلية

## الترخيص

هذا النظام جزء من مشروع ERB VitaSlims ويخضع لنفس ترخيص المشروع.