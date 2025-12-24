const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length) {
    envVars[key.trim()] = valueParts.join('=').trim();
  }
});

const supabase = createClient(
  envVars.NEXT_PUBLIC_SUPABASE_URL,
  envVars.SUPABASE_SERVICE_ROLE_KEY
);

async function step1VerifyCOGSAccount() {
  console.log('\n' + '='.repeat(80));
  console.log('🔧 Step 1: التحقق من حساب COGS (4100)');
  console.log('='.repeat(80) + '\n');

  // Get VitaSlims company
  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('name', 'VitaSlims')
    .single();

  if (!company) {
    console.log('❌ الشركة غير موجودة');
    return;
  }

  console.log(`✅ Company ID: ${company.id}\n`);

  // Check if account 4100 exists
  console.log('1️⃣ التحقق من وجود حساب 4100...');
  const { data: account4100 } = await supabase
    .from('chart_of_accounts')
    .select('*')
    .eq('company_id', company.id)
    .eq('account_code', '4100')
    .single();

  if (account4100) {
    console.log(`   ✅ حساب 4100 موجود:`);
    console.log(`      الاسم: ${account4100.account_name}`);
    console.log(`      النوع: ${account4100.account_type}`);
    console.log(`      الحالة: ${account4100.is_active ? 'نشط' : 'غير نشط'}`);
    
    // Check if type is correct
    if (account4100.account_type !== 'income') {
      console.log(`   ⚠️  النوع خاطئ! يجب أن يكون 'income' وليس '${account4100.account_type}'`);
      console.log(`   🔧 تصحيح النوع...`);
      
      const { error } = await supabase
        .from('chart_of_accounts')
        .update({ account_type: 'income', account_name: 'Cost of Goods Sold' })
        .eq('id', account4100.id);

      if (error) {
        console.log(`   ❌ خطأ في التحديث: ${error.message}`);
      } else {
        console.log(`   ✅ تم تصحيح النوع إلى 'income'`);
      }
    } else {
      console.log(`   ✅ النوع صحيح (income)`);
    }
  } else {
    console.log(`   ❌ حساب 4100 غير موجود`);
    console.log(`   🔧 إنشاء حساب 4100...`);
    
    const { data: newAccount, error } = await supabase
      .from('chart_of_accounts')
      .insert({
        company_id: company.id,
        account_code: '4100',
        account_name: 'Cost of Goods Sold',
        account_type: 'income',
        description: 'تكلفة البضاعة المباعة - COGS',
        is_active: true
      })
      .select()
      .single();

    if (error) {
      console.log(`   ❌ خطأ في الإنشاء: ${error.message}`);
    } else {
      console.log(`   ✅ تم إنشاء حساب 4100 بنجاح`);
      console.log(`      ID: ${newAccount.id}`);
    }
  }

  console.log('');

  // Check account 5000
  console.log('2️⃣ التحقق من حساب 5000 (الحساب الخاطئ)...');
  const { data: account5000 } = await supabase
    .from('chart_of_accounts')
    .select('*')
    .eq('company_id', company.id)
    .eq('account_code', '5000')
    .single();

  if (account5000) {
    console.log(`   ✅ حساب 5000 موجود:`);
    console.log(`      الاسم: ${account5000.account_name}`);
    console.log(`      النوع: ${account5000.account_type}`);
    
    // Count entries
    const { data: lines } = await supabase
      .from('journal_entry_lines')
      .select('id, debit_amount')
      .eq('account_id', account5000.id);

    const total = lines?.reduce((sum, line) => sum + (line.debit_amount || 0), 0) || 0;
    
    console.log(`      عدد القيود: ${lines?.length || 0}`);
    console.log(`      الرصيد: ${total.toFixed(2)} جنيه`);
  } else {
    console.log(`   ⚠️  حساب 5000 غير موجود`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ Step 1 مكتمل - جاهز للخطوة التالية');
  console.log('='.repeat(80) + '\n');
}

step1VerifyCOGSAccount().catch(console.error);

