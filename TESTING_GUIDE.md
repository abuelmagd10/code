# 🧪 دليل الاختبار الشامل - Company API Security

## 📋 نظرة عامة

هذا الدليل يوضح كيفية اختبار الـ API الجديد `/api/company-info` للتأكد من:
- ✅ Authentication يعمل بشكل صحيح
- ✅ Authorization يمنع الوصول غير المصرح به
- ✅ Error Handling لا يكشف تفاصيل PostgreSQL
- ✅ Multi-tenant Isolation يعمل بشكل صحيح

---

## 1️⃣ اختبار Authentication

### **Test Case 1.1: طلب بدون تسجيل دخول**

**الهدف:** التأكد من أن API يرفض الطلبات غير المصادق عليها

**الخطوات:**
1. افتح المتصفح في وضع Incognito/Private
2. اذهب إلى: `https://7esab.com/api/company-info`
3. افتح DevTools (F12) → Network tab

**النتيجة المتوقعة:**
```json
{
  "success": false,
  "code": "UNAUTHORIZED",
  "message": "يجب تسجيل الدخول للوصول إلى بيانات الشركة",
  "message_en": "Authentication required",
  "timestamp": "2025-12-23T..."
}
```

**Status Code:** `401 Unauthorized`

✅ **Pass Criteria:** 
- Status code = 401
- Response contains `"code": "UNAUTHORIZED"`
- لا توجد تفاصيل PostgreSQL في الرد

---

### **Test Case 1.2: طلب مع session منتهية**

**الهدف:** التأكد من رفض الطلبات مع session منتهية

**الخطوات:**
1. سجل دخول إلى التطبيق
2. احذف cookies من DevTools → Application → Cookies
3. حاول الوصول إلى `/api/company-info`

**النتيجة المتوقعة:**
```json
{
  "success": false,
  "code": "UNAUTHORIZED",
  "message": "يجب تسجيل الدخول للوصول إلى بيانات الشركة",
  "message_en": "Authentication required"
}
```

**Status Code:** `401 Unauthorized`

---

## 2️⃣ اختبار Authorization

### **Test Case 2.1: الوصول لشركة أنت عضو فيها**

**الهدف:** التأكد من أن المستخدم يمكنه الوصول لشركته

**الخطوات:**
1. سجل دخول إلى التطبيق
2. اذهب إلى Dashboard
3. افتح DevTools → Network tab
4. ابحث عن طلب `/api/company-info`

**النتيجة المتوقعة:**
```json
{
  "success": true,
  "company": {
    "id": "uuid",
    "name": "اسم الشركة",
    "base_currency": "EGP",
    ...
  },
  "message": "تم جلب بيانات الشركة بنجاح",
  "message_en": "Company data fetched successfully"
}
```

**Status Code:** `200 OK`

✅ **Pass Criteria:**
- Status code = 200
- Response contains company data
- `base_currency` field exists (not `currency`)

---

### **Test Case 2.2: محاولة الوصول لشركة أخرى**

**الهدف:** التأكد من عدم إمكانية الوصول لشركات أخرى

**الخطوات:**
1. سجل دخول إلى التطبيق
2. احصل على company_id الخاص بك من DevTools
3. غير الـ UUID في URL إلى UUID عشوائي:
   ```
   /api/company-info?companyId=00000000-0000-0000-0000-000000000000
   ```

**النتيجة المتوقعة:**
```json
{
  "success": false,
  "code": "FORBIDDEN",
  "message": "ليس لديك صلاحية للوصول إلى هذه الشركة",
  "message_en": "Access denied to this company"
}
```

**Status Code:** `403 Forbidden`

✅ **Pass Criteria:**
- Status code = 403
- Response contains `"code": "FORBIDDEN"`
- لا يتم إرجاع بيانات الشركة الأخرى

---

## 3️⃣ اختبار Error Handling

### **Test Case 3.1: شركة غير موجودة**

**الهدف:** التأكد من معالجة الحالة بشكل آمن

**الخطوات:**
1. سجل دخول
2. اطلب: `/api/company-info?companyId=99999999-9999-9999-9999-999999999999`

**النتيجة المتوقعة:**
```json
{
  "success": true,
  "company": null,
  "message": "لم يتم العثور على شركة",
  "message_en": "Company not found"
}
```

**Status Code:** `200 OK` (ليس 404!)

✅ **Pass Criteria:**
- Status code = 200
- `company: null`
- لا توجد أخطاء PostgreSQL

---

### **Test Case 3.2: فحص عدم كشف أخطاء PostgreSQL**

**الهدف:** التأكد من عدم كشف تفاصيل قاعدة البيانات

**الخطوات:**
1. راجع جميع الـ test cases السابقة
2. تأكد من عدم وجود أي من التالي في الـ responses:
   - `"code": "42703"` (PostgreSQL error code)
   - `"relation"` أو `"column"`
   - `"pg_"` أو `"postgres"`
   - Stack traces
   - Database connection strings

✅ **Pass Criteria:**
- لا توجد تفاصيل PostgreSQL في أي response
- جميع الأخطاء تستخدم error codes موحدة (UNAUTHORIZED, FORBIDDEN, etc.)

---

## 4️⃣ اختبار Multi-tenant Isolation

### **Test Case 4.1: عزل البيانات بين الشركات**

**الهدف:** التأكد من أن كل مستخدم يرى شركاته فقط

**الخطوات:**
1. سجل دخول بحساب User A
2. احصل على company_id
3. سجل خروج
4. سجل دخول بحساب User B
5. حاول الوصول إلى company_id الخاص بـ User A

**النتيجة المتوقعة:**
```json
{
  "success": false,
  "code": "FORBIDDEN",
  "message": "ليس لديك صلاحية للوصول إلى هذه الشركة"
}
```

**Status Code:** `403 Forbidden`

---

## 5️⃣ اختبار Performance

### **Test Case 5.1: سرعة الاستجابة**

**الهدف:** التأكد من أن API سريع

**الخطوات:**
1. افتح DevTools → Network tab
2. اذهب إلى Dashboard
3. راقب وقت استجابة `/api/company-info`

**النتيجة المتوقعة:**
- Response time < 500ms (في الظروف العادية)
- No timeout errors

---

## 📊 Checklist النهائي

قبل النشر إلى Production، تأكد من:

- [ ] ✅ جميع test cases تمر بنجاح
- [ ] ✅ لا توجد أخطاء PostgreSQL مكشوفة
- [ ] ✅ Authentication يعمل بشكل صحيح
- [ ] ✅ Authorization يمنع الوصول غير المصرح به
- [ ] ✅ Multi-tenant isolation يعمل
- [ ] ✅ Error messages واضحة وآمنة
- [ ] ✅ Response times مقبولة
- [ ] ✅ Build ينجح بدون أخطاء
- [ ] ✅ لا توجد console errors في المتصفح

---

## 🐛 Troubleshooting

### **مشكلة: 401 حتى بعد تسجيل الدخول**

**الحل:**
1. امسح cookies: DevTools → Application → Clear site data
2. امسح Service Worker
3. Hard reload: `Ctrl + Shift + R`

### **مشكلة: 500 Internal Server Error**

**الحل:**
1. افحص Vercel logs
2. تأكد من أن Migration تم تنفيذه على Database
3. تأكد من أن `base_currency` column موجود

### **مشكلة: لا يزال يظهر error 42703**

**الحل:**
1. احذف `.next` folder: `Remove-Item -Path ".next" -Recurse -Force`
2. أعد البناء: `npm run build`
3. امسح browser cache
4. أعد نشر على Vercel

---

**تاريخ الإنشاء:** 2025-12-23  
**الحالة:** ✅ جاهز للاختبار

