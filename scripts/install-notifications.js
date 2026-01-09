/**
 * 🔔 Script لتثبيت جدول الإشعارات تلقائياً
 * 
 * الاستخدام:
 * 1. تأكد من وجود متغيرات البيئة:
 *    - NEXT_PUBLIC_SUPABASE_URL
 *    - SUPABASE_SERVICE_ROLE_KEY (مطلوب للوصول المباشر)
 * 
 * 2. شغّل: node scripts/install-notifications.js
 */

const fs = require('fs');
const path = require('path');

// قراءة ملف SQL
const sqlFile = path.join(__dirname, 'create_notifications_table.sql');
const sqlContent = fs.readFileSync(sqlFile, 'utf8');

console.log('🔔 بدء تثبيت نظام الإشعارات...\n');

// التحقق من وجود متغيرات البيئة
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ خطأ: متغيرات البيئة مفقودة!');
  console.error('   يجب تعيين:');
  console.error('   - NEXT_PUBLIC_SUPABASE_URL');
  console.error('   - SUPABASE_SERVICE_ROLE_KEY');
  console.error('\n💡 يمكنك إضافة هذه المتغيرات في ملف .env.local');
  console.error('   أو تشغيل SQL مباشرة من Supabase Dashboard\n');
  console.log('📋 محتوى SQL جاهز في: scripts/create_notifications_table.sql');
  console.log('   انسخه والصقه في Supabase SQL Editor\n');
  process.exit(1);
}

// استخدام fetch لتنفيذ SQL
async function executeSQL() {
  try {
    console.log('📤 إرسال SQL إلى Supabase...\n');
    
    // تقسيم SQL إلى statements منفصلة
    const statements = sqlContent
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('\\echo'));

    let successCount = 0;
    let errorCount = 0;

    for (const statement of statements) {
      if (statement.length < 10) continue; // تخطي العبارات القصيرة جداً
      
      try {
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': serviceRoleKey,
            'Authorization': `Bearer ${serviceRoleKey}`
          },
          body: JSON.stringify({ sql: statement + ';' })
        });

        if (!response.ok) {
          // محاولة طريقة أخرى - استخدام query endpoint
          const altResponse = await fetch(`${supabaseUrl}/rest/v1/`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': serviceRoleKey,
              'Authorization': `Bearer ${serviceRoleKey}`,
              'Prefer': 'return=minimal'
            },
            body: statement
          });

          if (!altResponse.ok) {
            console.warn(`⚠️  تحذير في statement: ${statement.substring(0, 50)}...`);
            errorCount++;
          } else {
            successCount++;
          }
        } else {
          successCount++;
        }
      } catch (err) {
        console.warn(`⚠️  خطأ في statement: ${err.message}`);
        errorCount++;
      }
    }

    console.log(`\n✅ تم تنفيذ ${successCount} statement بنجاح`);
    if (errorCount > 0) {
      console.log(`⚠️  ${errorCount} statements فشلت (قد تكون موجودة مسبقاً)`);
    }
    
    console.log('\n💡 إذا فشل التنفيذ، استخدم Supabase Dashboard:');
    console.log('   1. افتح Supabase Dashboard');
    console.log('   2. اذهب إلى SQL Editor');
    console.log('   3. انسخ محتوى: scripts/create_notifications_table.sql');
    console.log('   4. الصق وشغّل\n');

  } catch (error) {
    console.error('❌ خطأ في التنفيذ:', error.message);
    console.error('\n💡 استخدم Supabase Dashboard بدلاً من ذلك:');
    console.error('   1. افتح Supabase Dashboard');
    console.error('   2. اذهب إلى SQL Editor');
    console.error('   3. انسخ محتوى: scripts/create_notifications_table.sql');
    console.error('   4. الصق وشغّل\n');
    process.exit(1);
  }
}

// بدء التنفيذ
executeSQL();
