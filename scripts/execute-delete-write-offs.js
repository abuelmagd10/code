// Script to execute delete write-offs SQL script
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hfvsbsizokxontflgdyn.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function executeSQL(sql) {
  try {
    // محاولة استخدام RPC exec_sql إذا كان متاحاً
    const { data, error } = await supabase.rpc('exec_sql', { 
      sql_query: sql 
    });

    if (error) {
      // إذا فشل RPC، نحاول استخدام REST API مباشرة
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({ sql_query: sql })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      return await response.json();
    }

    return data;
  } catch (error) {
    throw new Error(`Failed to execute SQL: ${error.message}`);
  }
}

async function executeSQLFile(filePath) {
  try {
    console.log(`\n📖 قراءة الملف: ${filePath}`);
    const sqlContent = fs.readFileSync(filePath, 'utf8');
    
    // تقسيم SQL إلى statements منفصلة
    // نزيل التعليقات والمسافات الزائدة
    const statements = sqlContent
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('/*'));

    console.log(`\n📊 تم العثور على ${statements.length} statement(s)`);

    // تنفيذ كل statement على حدة
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      
      // تخطي التعليقات والـ DO blocks الكبيرة
      if (statement.length < 10 || statement.startsWith('--')) {
        continue;
      }

      try {
        console.log(`\n⏳ تنفيذ statement ${i + 1}/${statements.length}...`);
        console.log(`📝 ${statement.substring(0, 100)}...`);
        
        const result = await executeSQL(statement + ';');
        
        if (result) {
          console.log(`✅ تم تنفيذ statement ${i + 1} بنجاح`);
          if (typeof result === 'string' && result.includes('NOTICE')) {
            console.log(`📢 ${result}`);
          }
        }
      } catch (err) {
        console.error(`❌ خطأ في statement ${i + 1}:`, err.message);
        // الاستمرار في التنفيذ
      }
    }

    console.log('\n✅ تم الانتهاء من تنفيذ السكريبت');
    
  } catch (error) {
    console.error('\n❌ خطأ في تنفيذ السكريبت:', error.message);
    process.exit(1);
  }
}

async function main() {
  console.log('🚀 بدء تنفيذ سكريبت حذف الإهلاكات...\n');
  
  const sqlFile = path.join(__dirname, '043_delete_write_offs_and_restore_inventory.sql');
  
  if (!fs.existsSync(sqlFile)) {
    console.error(`❌ الملف غير موجود: ${sqlFile}`);
    process.exit(1);
  }

  await executeSQLFile(sqlFile);
  
  console.log('\n🎉 تم الانتهاء بنجاح!');
}

main().catch(console.error);
