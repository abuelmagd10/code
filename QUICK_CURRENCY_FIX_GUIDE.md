# ⚡ دليل الإصلاح السريع - مزامنة العملة
# Quick Fix Guide - Currency Sync

## 🎯 المشكلة
المستخدم المدعو يرى عملة مختلفة عن عملة الشركة (EGP)

## ✅ الحل في 3 خطوات

### **الخطوة 1: تنفيذ SQL Script** (5 دقائق)
```bash
# افتح Supabase SQL Editor
# نفذ الملف: scripts/110_user_currency_preferences.sql
```

أو انسخ والصق:
```sql
ALTER TABLE company_members
  ADD COLUMN IF NOT EXISTS preferred_currency TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS currency_sync_enabled BOOLEAN DEFAULT TRUE;
```

---

### **الخطوة 2: إضافة المزود** (2 دقيقة)

في `app/layout.tsx`:
```tsx
import { CurrencySyncProvider } from './currency-sync-provider'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <CurrencySyncProvider>
          {children}
        </CurrencySyncProvider>
      </body>
    </html>
  )
}
```

---

### **الخطوة 3: إضافة التنبيه** (1 دقيقة)

في `app/page.tsx`:
```tsx
import { CurrencyMismatchAlert } from '@/components/CurrencyMismatchAlert'

export default function Dashboard() {
  return (
    <div>
      <CurrencyMismatchAlert lang="ar" />
      {/* باقي المحتوى */}
    </div>
  )
}
```

---

## 🧪 اختبار سريع

1. سجل دخول كمستخدم مدعو
2. افتح Console (F12)
3. نفذ:
```javascript
console.log(localStorage.getItem('app_currency'))
// يجب أن يكون: "EGP"
```

---

## 📁 الملفات المنشأة

✅ `lib/currency-sync.ts` - مكتبة المزامنة  
✅ `app/currency-sync-provider.tsx` - المزود التلقائي  
✅ `components/CurrencyMismatchAlert.tsx` - التنبيه  
✅ `scripts/110_user_currency_preferences.sql` - قاعدة البيانات  
✅ `app/api/sync-currency/route.ts` - API  

---

## 🔧 استكشاف الأخطاء

### المشكلة: التنبيه لا يظهر
```bash
# تأكد من إضافة المكون للصفحة
# تحقق من Console للأخطاء
```

### المشكلة: العملة لا تتزامن
```bash
# امسح localStorage
localStorage.clear()
# أعد تسجيل الدخول
```

---

## 📚 التوثيق الكامل

- `CURRENCY_SYNC_FIX.md` - شرح مفصل
- `CURRENCY_SYNC_TESTING.md` - دليل الاختبار
- `CURRENCY_SYNC_SOLUTION_SUMMARY.md` - الملخص الشامل

---

**الوقت المتوقع:** 10 دقائق  
**الصعوبة:** ⭐⭐ (سهل)  
**التأثير:** 🟢 عالي

