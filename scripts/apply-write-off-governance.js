/**
 * 🧾 تطبيق قاعدة حوكمة الإهلاك على قاعدة البيانات
 * Stock Depreciation Governance Rule - Database Deployment Script
 * 
 * هذا الـ script ينفذ SQL script تلقائياً على Supabase
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// قراءة متغيرات البيئة
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ خطأ: NEXT_PUBLIC_SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY مطلوبان');
  console.error('   تأكد من تعيينهما في ملف .env.local');
  process.exit(1);
}

// إنشاء Supabase client مع Service Role Key (صلاحيات كاملة)
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

/**
 * تنفيذ SQL script على قاعدة البيانات
 */
async function executeSQLScript() {
  console.log('🚀 بدء تطبيق قاعدة حوكمة الإهلاك...\n');

  try {
    // قراءة SQL script
    const sqlFilePath = path.join(__dirname, '042_write_off_governance_validation.sql');
    
    if (!fs.existsSync(sqlFilePath)) {
      console.error(`❌ ملف SQL غير موجود: ${sqlFilePath}`);
      process.exit(1);
    }

    const sqlScript = fs.readFileSync(sqlFilePath, 'utf8');
    console.log('✅ تم قراءة SQL script بنجاح');
    console.log(`📄 حجم الملف: ${(sqlScript.length / 1024).toFixed(2)} KB\n`);

    // تنفيذ SQL script كاملاً دفعة واحدة
    console.log('⏳ تنفيذ SQL script...\n');

    try {
      // طريقة 1: استخدام REST API مباشرة لتنفيذ SQL
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({ sql_query: sqlScript })
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ تم تنفيذ SQL script بنجاح!\n');
      } else {
        const errorText = await response.text();
        console.log(`⚠️  طريقة exec_sql غير متاحة: ${response.status}`);
        console.log(`   الخطأ: ${errorText.substring(0, 200)}\n`);
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (fetchError) {
      // طريقة 2: تقسيم إلى statements وتنفيذ واحد تلو الآخر
      console.log('⚠️  استخدام طريقة بديلة: تنفيذ statements منفصلة...\n');
      
      // تقسيم SQL script إلى statements منفصلة
      const statements = sqlScript
        .split(/;\s*(?=CREATE|DROP|ALTER)/i)
        .map(s => s.trim())
        .filter(s => {
          const trimmed = s.trim();
          return trimmed.length > 20 && 
                 !trimmed.startsWith('--') && 
                 !trimmed.startsWith('/*') &&
                 (trimmed.toUpperCase().startsWith('CREATE') || 
                  trimmed.toUpperCase().startsWith('DROP'));
        });

      console.log(`📊 عدد الـ statements المهمة: ${statements.length}\n`);

      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i] + ';';
        
        try {
          const statementType = statement.trim().substring(0, 30).toUpperCase();
          console.log(`⏳ [${i + 1}/${statements.length}] ${statementType}...`);
          
          // محاولة استخدام REST API
          const stmtResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': supabaseServiceKey,
              'Authorization': `Bearer ${supabaseServiceKey}`
            },
            body: JSON.stringify({ sql_query: statement })
          });

          if (stmtResponse.ok) {
            console.log(`   ✅ تم بنجاح`);
            successCount++;
          } else {
            const errorText = await stmtResponse.text();
            console.log(`   ⚠️  HTTP ${stmtResponse.status}: ${errorText.substring(0, 100)}`);
            console.log(`   ℹ️  قد تحتاج لتطبيق هذا الـ statement يدوياً`);
            errorCount++;
          }
        } catch (err) {
          console.error(`   ❌ خطأ: ${err.message}`);
          errorCount++;
        }
      }

      console.log('\n' + '='.repeat(60));
      console.log('📊 ملخص التنفيذ:');
      console.log(`   ✅ نجح: ${successCount}`);
      console.log(`   ⚠️  فشل/تحذير: ${errorCount}`);
      console.log('='.repeat(60) + '\n');
    }

    // التحقق من التطبيق
    console.log('🔍 التحقق من التطبيق...\n');

    // محاولة استدعاء الدالة للتحقق
    try {
      const { data: testResult, error: testError } = await supabase.rpc('get_available_inventory_quantity', {
        p_company_id: '00000000-0000-0000-0000-000000000000',
        p_branch_id: null,
        p_warehouse_id: null,
        p_cost_center_id: null,
        p_product_id: '00000000-0000-0000-0000-000000000000'
      });

      if (!testError) {
        console.log('✅ الدالة تعمل بشكل صحيح');
      } else if (testError.code === '42883' || testError.message?.includes('does not exist')) {
        console.log('⚠️  الدالة غير موجودة - يجب تطبيق SQL script يدوياً');
        console.log('   استخدم Supabase Dashboard > SQL Editor');
      } else {
        console.log(`✅ الدالة موجودة (خطأ متوقع في المعاملات: ${testError.message})`);
      }
    } catch (testErr) {
      console.log(`⚠️  لا يمكن التحقق من الدالة: ${testErr.message}`);
      console.log('   قد تحتاج لتطبيق SQL script يدوياً');
    }

    console.log('\n✅ اكتمل التنفيذ!');
    console.log('\n📝 ملاحظات:');
    console.log('   - إذا فشل بعض الـ statements، يمكنك تطبيق SQL script يدوياً من:');
    console.log('     scripts/042_write_off_governance_validation.sql');
    console.log('   - استخدم Supabase Dashboard > SQL Editor لتطبيق الـ script يدوياً');

  } catch (error) {
    console.error('\n❌ خطأ عام:', error.message);
    console.error('\n💡 الحل البديل:');
    console.error('   1. افتح Supabase Dashboard');
    console.error('   2. اذهب إلى SQL Editor');
    console.error('   3. انسخ محتوى: scripts/042_write_off_governance_validation.sql');
    console.error('   4. الصق في SQL Editor واضغط Run');
    process.exit(1);
  }
}

// تشغيل الـ script
executeSQLScript()
  .then(() => {
    console.log('\n🎉 تم بنجاح!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ فشل التنفيذ:', error);
    process.exit(1);
  });
