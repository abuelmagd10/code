# 🔐 مرجع سريع: نظام الأمان والتحديث الفوري

## 📋 نظرة سريعة

هذا النظام يضمن التحديث الفوري للصلاحيات والأدوار والفروع بدون أي Refresh للصفحة.

**⚠️ مهم:** راجع `SECURITY_REALTIME_SYSTEM.md` للتفاصيل الكاملة.

---

## 🎯 القواعد الأساسية

### 1. Single Source of Truth

**الجدول الوحيد:** `company_members`

```typescript
// ✅ صحيح
const { data: member } = await supabase
  .from("company_members")
  .select("role, branch_id")
  .eq("user_id", userId)
  .eq("company_id", companyId)
  .maybeSingle()
```

### 2. Realtime Subscriptions

**الجداول المشتركة:**
- `company_members` (حرج)
- `user_branch_access` (حرج)
- `company_role_permissions` (مهم)

**الفلترة:**
- Supabase: `company_id=eq.${companyId}` فقط
- Client: `affectsCurrentUser` في `handleGovernanceEvent`

### 3. BLIND REFRESH Pattern

```typescript
// ✅ صحيح - بدون شروط
if (affectsCurrentUser) {
  await refreshUserSecurityContext()
}
```

### 4. التسلسل الإلزامي

```
تحديث الداتابيس
  ↓
Realtime event (تلقائي)
  ↓
refreshUserSecurityContext()
  ↓
تحديث UI + إعادة توجيه
```

---

## 📍 الملفات المهمة

| الملف | الوظيفة |
|------|---------|
| `lib/access-context.tsx` | Access Context + refreshUserSecurityContext() |
| `lib/realtime-manager.ts` | Realtime Manager + subscribeToGovernance() |
| `hooks/use-governance-realtime.ts` | Governance Realtime Hook |
| `components/realtime-route-guard.tsx` | Route Protection |

---

## ✅ Checklist للتعديلات

قبل أي تعديل:

- [ ] مراجعة `company_members` table structure
- [ ] اختبار تغيير الدور من Owner/Admin
- [ ] اختبار تغيير الفرع من Owner/Admin
- [ ] التحقق من التحديث الفوري بدون Refresh
- [ ] تحديث `SECURITY_REALTIME_SYSTEM.md`

---

## 🔍 Troubleshooting

### التحديث لا يحدث فوراً

1. Hard Refresh (`Ctrl + Shift + R`)
2. التحقق من Realtime subscriptions في Console
3. التحقق من RLS policies في Supabase

### Filter خاطئ

- التحقق من `filterValid: true` في logs
- Hard Refresh للمتصفح

---

**📚 للمزيد من التفاصيل:** راجع `SECURITY_REALTIME_SYSTEM.md`
