# 🔒 ملفات تطبيق الحوكمة

## 📁 الملفات حسب الاستخدام

### 1️⃣ ملفات SQL (للتشغيل في Supabase SQL Editor)

#### ✅ sql/enforce-governance-constraints.sql
**الاستخدام**: شغله في Supabase SQL Editor
**الوظيفة**: 
- إضافة قيود NOT NULL
- إنشاء Triggers
- تفعيل Row Level Security
- إنشاء فهارس

**كيفية التشغيل**:
```
1. افتح Supabase Dashboard
2. اذهب إلى SQL Editor
3. انسخ محتوى الملف
4. اضغط Run
```

---

### 2️⃣ ملفات TypeScript (للاستخدام في Next.js)

#### ✅ lib/governance-middleware.ts
**الاستخدام**: استيراده في API routes
**الوظيفة**: Middleware للحوكمة

```typescript
import { enforceGovernance } from '@/lib/governance-middleware'
```

#### ✅ app/api/sales-orders/route.example.ts
**الاستخدام**: مثال للنسخ - ليس للتشغيل مباشرة
**الوظيفة**: يوضح كيفية استخدام middleware

**كيفية الاستخدام**:
```
1. افتح الملف الحقيقي: app/api/sales-orders/route.ts
2. انسخ الكود من route.example.ts
3. طبقه في route.ts
```

---

## 🚀 خطوات التطبيق الصحيحة

### الخطوة 1: قاعدة البيانات (Supabase SQL Editor)

```sql
-- شغل هذا الملف في Supabase SQL Editor
-- sql/enforce-governance-constraints.sql
```

### الخطوة 2: تطبيق Middleware في APIs

#### مثال: تحديث app/api/sales-orders/route.ts

```typescript
// قبل التحديث
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

export async function GET() {
  const supabase = createClient(cookies())
  const { data } = await supabase.from('sales_orders').select('*')
  return Response.json({ data })
}

// بعد التحديث
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { enforceGovernance, applyGovernanceFilters } from '@/lib/governance-middleware'

export async function GET() {
  const governance = await enforceGovernance()
  const supabase = createClient(cookies())
  
  let query = supabase.from('sales_orders').select('*')
  query = applyGovernanceFilters(query, governance)
  
  const { data } = await query
  return Response.json({ data })
}
```

---

## ❌ أخطاء شائعة

### خطأ 1: تشغيل ملف TypeScript في SQL Editor
```
❌ لا تشغل route.example.ts في Supabase
✅ استخدمه كمرجع للنسخ فقط
```

### خطأ 2: تشغيل ملف SQL في Terminal
```
❌ لا تشغل enforce-governance-constraints.sql في terminal
✅ شغله في Supabase SQL Editor
```

---

## 📋 قائمة التحقق

### في Supabase SQL Editor:
- [ ] شغل sql/enforce-governance-constraints.sql
- [ ] تحقق من النتيجة: "Governance constraints applied successfully"

### في الكود:
- [ ] أنشئ lib/governance-middleware.ts
- [ ] حدث app/api/sales-orders/route.ts
- [ ] حدث app/api/invoices/route.ts
- [ ] حدث app/api/inventory/route.ts

### اختبار:
- [ ] جرب إدخال بيانات بدون حوكمة (يجب أن يفشل)
- [ ] جرب قراءة البيانات (يجب أن ترى فقط بيانات شركتك)

---

## 🆘 إذا واجهت مشاكل

### المشكلة: "syntax error at or near import"
**السبب**: تحاول تشغيل ملف TypeScript في SQL Editor
**الحل**: استخدم الملف كمرجع فقط، لا تشغله

### المشكلة: "function enforceGovernance not found"
**السبب**: لم تنشئ ملف governance-middleware.ts
**الحل**: أنشئ الملف في lib/governance-middleware.ts

### المشكلة: "column does not exist"
**السبب**: لم تشغل سكريبت قاعدة البيانات
**الحل**: شغل sql/enforce-governance-constraints.sql في Supabase

---

## 📞 الملفات المطلوبة

### ملفات SQL (شغلها في Supabase):
1. ✅ sql/enforce-governance-constraints.sql

### ملفات TypeScript (استخدمها في Next.js):
1. ✅ lib/governance-middleware.ts
2. 📖 app/api/sales-orders/route.example.ts (مرجع فقط)

### ملفات التوثيق:
1. 📖 GOVERNANCE_ENFORCEMENT_GUIDE.md
2. 📖 GOVERNANCE_RULES.md
3. 📖 FILES_USAGE.md (هذا الملف)

---

**ملاحظة مهمة**: 
- ملفات `.sql` → Supabase SQL Editor
- ملفات `.ts` → Next.js Project
- ملفات `.example.ts` → مرجع للنسخ فقط
