# 🚀 إعداد Supabase للاختبارات

## الخطوات السريعة:

### 1️⃣ إنشاء مشروع Supabase
```bash
# اذهب إلى https://supabase.com/dashboard
# انقر "New Project"
# اختر اسم المشروع وكلمة المرور
```

### 2️⃣ الحصول على المفاتيح
```bash
# في لوحة تحكم Supabase:
# Settings > API
# انسخ:
# - Project URL
# - anon public key  
# - service_role key
```

### 3️⃣ تحديث متغيرات البيئة
```bash
# حرر ملف .env.local
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...
```

### 4️⃣ تشغيل الإعداد
```bash
npm run test:setup
```

### 5️⃣ تشغيل الاختبارات
```bash
npm test                 # جميع الاختبارات
npm run test:critical    # الاختبارات الحرجة
npm run test:integration # اختبارات التكامل
npm run test:e2e         # الاختبارات الشاملة
```

## ✅ التحقق من النجاح
- إذا رأيت "32 passed" في الاختبارات الحرجة = ✅
- إذا رأيت اختبارات التكامل تعمل = ✅
- إذا رأيت "Missing Supabase credentials" = ❌ تحقق من الخطوات أعلاه