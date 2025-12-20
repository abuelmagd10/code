# 🌐 موقع 7ESAB ERP - دليل النشر والتشغيل

## 📋 الملفات المنشأة

### 🏠 الصفحات الأساسية
- `website/pages/index.tsx` - الصفحة الرئيسية
- `website/pages/signup.tsx` - صفحة الاشتراك
- `website/pages/welcome.tsx` - صفحة الترحيب

### 🔌 APIs
- `app/api/subscription/create/route.ts` - إنشاء الاشتراكات

## 🚀 خطوات النشر

### 1. إعداد النطاق
```bash
# إعداد النطاق الفرعي للموقع
website.7esab-erp.com
# أو
www.7esab-erp.com
```

### 2. متغيرات البيئة
```env
# إضافة للملف .env.local
NEXT_PUBLIC_WEBSITE_URL=https://www.7esab-erp.com
NEXT_PUBLIC_APP_URL=https://app.7esab-erp.com
SENDGRID_API_KEY=your_sendgrid_key
STRIPE_SECRET_KEY=your_stripe_key
STRIPE_PUBLISHABLE_KEY=your_stripe_public_key
```

### 3. قاعدة البيانات
```sql
-- إضافة جداول الاشتراكات
CREATE TABLE subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id),
  event_type TEXT NOT NULL,
  plan TEXT NOT NULL,
  billing_cycle TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- تحديث جدول الشركات
ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_plan TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS billing_cycle TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'trial';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP;
```

## 🎯 الميزات المنفذة

### ✅ الصفحة الرئيسية
- عرض الميزات والخصائص
- أقسام التسعير
- آراء العملاء
- دعوة للاشتراك

### ✅ صفحة الاشتراك
- اختيار الخطة (شهري/سنوي)
- نموذج بيانات الشركة
- تكامل مع قاعدة البيانات
- تجربة مجانية 30 يوم

### ✅ صفحة الترحيب
- رسالة نجاح الاشتراك
- خطوات البدء
- روابط سريعة للنظام

## 🔧 التخصيص والتطوير

### إضافة بوابة دفع
```typescript
// في signup.tsx
import { loadStripe } from '@stripe/stripe-js'

const stripe = await loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)
```

### إضافة نظام البريد الإلكتروني
```typescript
// في subscription/create/route.ts
import sgMail from '@sendgrid/mail'
sgMail.setApiKey(process.env.SENDGRID_API_KEY!)
```

### تحسين SEO
```typescript
// إضافة metadata لكل صفحة
export const metadata = {
  title: '7ESAB ERP - نظام إدارة الأعمال الأكثر تطوراً',
  description: 'حل شامل لإدارة المحاسبة والمخزون والمبيعات',
  keywords: 'ERP, محاسبة, مخزون, إدارة أعمال'
}
```

## 📊 التحليلات والمتابعة

### Google Analytics
```html
<!-- إضافة في layout.tsx -->
<Script src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID" />
```

### تتبع التحويلات
```typescript
// تتبع الاشتراكات الجديدة
gtag('event', 'sign_up', {
  method: 'website',
  value: planPrice
})
```

## 🔒 الأمان

### SSL Certificate
- تفعيل HTTPS
- إعادة توجيه HTTP إلى HTTPS

### حماية البيانات
- تشفير كلمات المرور
- حماية من CSRF
- تحقق من البريد الإلكتروني

## 📱 التجاوب

الموقع مُحسّن للعمل على:
- 💻 أجهزة الكمبيوتر
- 📱 الهواتف الذكية  
- 📟 الأجهزة اللوحية

## 🎨 التصميم

- ألوان متناسقة مع هوية التطبيق
- تصميم حديث ومتجاوب
- تجربة مستخدم سلسة
- سرعة تحميل عالية

---

**✅ الموقع جاهز للنشر والاستخدام الفعلي**