# 🔐 إعداد GitHub Secrets للاختبارات التلقائية

## لماذا نحتاج GitHub Secrets؟
لتشغيل الاختبارات تلقائياً على GitHub Actions، نحتاج لإضافة مفاتيح Supabase كـ Secrets.

## الخطوات:

### 1️⃣ الذهاب إلى إعدادات المستودع
```
https://github.com/YOUR_USERNAME/YOUR_REPO/settings/secrets/actions
```

### 2️⃣ إضافة Secrets الجديدة
انقر "New repository secret" وأضف:

#### Secret 1: NEXT_PUBLIC_SUPABASE_URL
```
Name: NEXT_PUBLIC_SUPABASE_URL
Value: https://your-project-id.supabase.co
```

#### Secret 2: NEXT_PUBLIC_SUPABASE_ANON_KEY
```
Name: NEXT_PUBLIC_SUPABASE_ANON_KEY
Value: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### Secret 3: SUPABASE_SERVICE_ROLE_KEY
```
Name: SUPABASE_SERVICE_ROLE_KEY
Value: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 3️⃣ التحقق من الإعداد
بعد إضافة الـ Secrets:
1. اذهب إلى تبويب "Actions" في المستودع
2. سترى الاختبارات تعمل تلقائياً
3. إذا كانت خضراء ✅ = نجحت
4. إذا كانت حمراء ❌ = تحقق من القيم

## 📝 ملاحظات مهمة:
- ⚠️ لا تشارك service_role key علناً
- ✅ GitHub Secrets آمنة ومشفرة
- 🔄 الاختبارات ستعمل تلقائياً عند كل push
- 🎯 يمكنك تحديث القيم في أي وقت

## 🧪 اختبار محلي أولاً:
قبل إعداد GitHub Secrets، تأكد من عمل الاختبارات محلياً:
```bash
# 1. حدث .env.local بقيم حقيقية
# 2. شغل الإعداد
npm run test:setup

# 3. شغل الاختبارات
npm test
npm run test:integration
npm run test:e2e
```

## ✅ عند النجاح:
- الاختبارات المحلية تعمل ✅
- GitHub Actions تعمل تلقائياً ✅
- CI/CD جاهز للإنتاج ✅