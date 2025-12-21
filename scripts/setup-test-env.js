#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔧 إعداد متغيرات البيئة للاختبارات...');

// التحقق من وجود ملف .env.local
const envLocalPath = path.join(__dirname, '..', '.env.local');
const envTestPath = path.join(__dirname, '..', '.env.test');

if (!fs.existsSync(envLocalPath)) {
  console.log('❌ ملف .env.local غير موجود');
  console.log('📝 يرجى إنشاء ملف .env.local مع قيم Supabase الصحيحة');
  process.exit(1);
}

// قراءة ملف .env.local
const envContent = fs.readFileSync(envLocalPath, 'utf8');

// التحقق من وجود قيم حقيقية
if (envContent.includes('dummy') || envContent.includes('your-project-id')) {
  console.log('⚠️  ملف .env.local يحتوي على قيم وهمية');
  console.log('');
  console.log('📋 لإعداد Supabase:');
  console.log('1. اذهب إلى https://supabase.com/dashboard');
  console.log('2. أنشئ مشروع جديد أو اختر مشروع موجود');
  console.log('3. اذهب إلى Settings > API');
  console.log('4. انسخ القيم التالية:');
  console.log('   - Project URL');
  console.log('   - anon public key');
  console.log('   - service_role key');
  console.log('5. ضع القيم في ملف .env.local');
  console.log('');
  console.log('💡 مثال:');
  console.log('NEXT_PUBLIC_SUPABASE_URL=https://abcdefgh.supabase.co');
  console.log('NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
  console.log('SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
  process.exit(1);
}

// نسخ القيم إلى ملف الاختبار
fs.writeFileSync(envTestPath, envContent);

console.log('✅ تم إعداد متغيرات البيئة للاختبارات');
console.log('🧪 يمكنك الآن تشغيل الاختبارات:');
console.log('   npm test');
console.log('   npm run test:integration');
console.log('   npm run test:e2e');