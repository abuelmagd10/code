# إصلاحات عاجلة للصلاحيات | Critical Permission Hotfixes

**تاريخ:** 2025-12-09  
**الأولوية:** 🔴 حرجة

---

## Hotfix 1: إصلاح `/api/member-role/route.ts`

### المشكلة
الـ API يسمح لأي مستخدم مصادق بتغيير أدوار أعضاء أي شركة.

### الملف
`app/api/member-role/route.ts`

### الإصلاح المطلوب
إضافة التحقق من صلاحية المستخدم الطالب قبل تنفيذ العملية.

```typescript
// إضافة بعد السطر 1
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"

// إضافة في بداية دالة POST بعد استخراج البيانات
export async function POST(req: Request) {
  const { memberId, role, companyId } = await req.json()
  
  // === بداية الإصلاح ===
  const ssr = createServerComponentClient({ cookies })
  const { data: { user } } = await ssr.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 })
  }
  
  // التحقق من أن المستخدم الطالب هو owner أو admin في الشركة
  const { data: requesterMember } = await admin
    .from("company_members")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .maybeSingle()
  
  if (!requesterMember || !["owner", "admin"].includes(requesterMember.role)) {
    return NextResponse.json({ error: "ليست لديك صلاحية لتغيير الأدوار" }, { status: 403 })
  }
  // === نهاية الإصلاح ===
  
  // باقي الكود...
}
```

---

## Hotfix 2: إصلاح `/api/member-delete/route.ts`

### المشكلة
الـ API يسمح لأي مستخدم مصادق بحذف أعضاء من أي شركة.

### الملف
`app/api/member-delete/route.ts`

### الإصلاح المطلوب

```typescript
// إضافة نفس التحقق من Hotfix 1
export async function POST(req: Request) {
  const { memberId, companyId, deleteUser } = await req.json()
  
  // === بداية الإصلاح ===
  const ssr = createServerComponentClient({ cookies })
  const { data: { user } } = await ssr.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 })
  }
  
  const { data: requesterMember } = await admin
    .from("company_members")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .maybeSingle()
  
  if (!requesterMember || !["owner", "admin"].includes(requesterMember.role)) {
    return NextResponse.json({ error: "ليست لديك صلاحية لحذف الأعضاء" }, { status: 403 })
  }
  // === نهاية الإصلاح ===
  
  // باقي الكود...
}
```

---

## Hotfix 3: إصلاح `/api/company-members/route.ts`

### المشكلة
الـ API يعرض أعضاء أي شركة بدون التحقق من عضوية المستخدم الطالب.

### الملف
`app/api/company-members/route.ts`

### الإصلاح المطلوب

```typescript
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const companyId = searchParams.get("companyId")
  
  if (!companyId) {
    return NextResponse.json({ error: "companyId مطلوب" }, { status: 400 })
  }
  
  // === بداية الإصلاح ===
  const ssr = createServerComponentClient({ cookies })
  const { data: { user } } = await ssr.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 })
  }
  
  // التحقق من أن المستخدم عضو في الشركة
  const { data: membership } = await admin
    .from("company_members")
    .select("id, role")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .maybeSingle()
  
  if (!membership) {
    return NextResponse.json({ error: "لست عضواً في هذه الشركة" }, { status: 403 })
  }
  // === نهاية الإصلاح ===
  
  // باقي الكود...
}
```

---

## Hotfix 4: إصلاح `/api/income-statement/route.ts`

### المشكلة
الـ API يقبل `companyId` من المستخدم بدون التحقق من عضويته في الشركة.

### الملف
`app/api/income-statement/route.ts`

### الإصلاح المطلوب

```typescript
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const companyId = searchParams.get("companyId")
  
  // === بداية الإصلاح ===
  const ssr = createServerComponentClient({ cookies })
  const { data: { user } } = await ssr.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 })
  }
  
  // التحقق من عضوية المستخدم في الشركة
  const { data: membership } = await admin
    .from("company_members")
    .select("id")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .maybeSingle()
  
  if (!membership) {
    return NextResponse.json({ error: "لست عضواً في هذه الشركة" }, { status: 403 })
  }
  // === نهاية الإصلاح ===
  
  // باقي الكود...
}
```

---

## خطوات التطبيق

1. ✅ مراجعة الكود المقترح
2. ⏳ إنشاء branch جديد: `hotfix/permission-checks`
3. ⏳ تطبيق الإصلاحات
4. ⏳ اختبار الإصلاحات محلياً
5. ⏳ إنشاء Pull Request
6. ⏳ مراجعة الكود
7. ⏳ دمج في main
8. ⏳ نشر للإنتاج

---

**ملاحظة:** هذه الإصلاحات ضرورية لمنع الوصول غير المصرح به لبيانات الشركات الأخرى.

