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

async function step2MigrateCOGS() {
  console.log('\n' + '='.repeat(80));
  console.log('🔧 Step 2: نقل قيود COGS من 5000 إلى 4100');
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

  // Get account IDs
  const { data: account5000 } = await supabase
    .from('chart_of_accounts')
    .select('id')
    .eq('company_id', company.id)
    .eq('account_code', '5000')
    .single();

  const { data: account4100 } = await supabase
    .from('chart_of_accounts')
    .select('id')
    .eq('company_id', company.id)
    .eq('account_code', '4100')
    .single();

  if (!account5000 || !account4100) {
    console.log('❌ أحد الحسابات غير موجود');
    return;
  }

  console.log(`✅ Account 5000 ID: ${account5000.id}`);
  console.log(`✅ Account 4100 ID: ${account4100.id}\n`);

  // Get all lines from account 5000
  console.log('1️⃣ جلب جميع القيود من حساب 5000...');
  const { data: lines } = await supabase
    .from('journal_entry_lines')
    .select('id, debit_amount, credit_amount, description, journal_entry_id')
    .eq('account_id', account5000.id);

  console.log(`   عدد القيود: ${lines?.length || 0}`);
  
  if (!lines || lines.length === 0) {
    console.log('   ⚠️  لا توجد قيود للنقل');
    return;
  }

  const totalDebit = lines.reduce((sum, line) => sum + (line.debit_amount || 0), 0);
  const totalCredit = lines.reduce((sum, line) => sum + (line.credit_amount || 0), 0);
  console.log(`   إجمالي المدين: ${totalDebit.toFixed(2)} جنيه`);
  console.log(`   إجمالي الدائن: ${totalCredit.toFixed(2)} جنيه`);
  console.log('');

  // Update account name for 4100
  console.log('2️⃣ تحديث اسم حساب 4100...');
  const { error: updateError } = await supabase
    .from('chart_of_accounts')
    .update({ 
      account_name: 'Cost of Goods Sold',
      description: 'تكلفة البضاعة المباعة - COGS (Zoho Books Pattern)',
      is_active: true
    })
    .eq('id', account4100.id);

  if (updateError) {
    console.log(`   ❌ خطأ: ${updateError.message}`);
  } else {
    console.log(`   ✅ تم تحديث اسم الحساب`);
  }
  console.log('');

  // Migrate entries
  console.log('3️⃣ نقل القيود من 5000 إلى 4100...');
  let successCount = 0;
  let errorCount = 0;

  for (const line of lines) {
    const { error } = await supabase
      .from('journal_entry_lines')
      .update({ account_id: account4100.id })
      .eq('id', line.id);

    if (error) {
      console.log(`   ❌ خطأ في نقل القيد ${line.id}: ${error.message}`);
      errorCount++;
    } else {
      successCount++;
    }
  }

  console.log(`   ✅ تم نقل ${successCount} قيد بنجاح`);
  if (errorCount > 0) {
    console.log(`   ❌ فشل نقل ${errorCount} قيد`);
  }
  console.log('');

  // Verify migration
  console.log('4️⃣ التحقق من النقل...');
  const { data: newLines } = await supabase
    .from('journal_entry_lines')
    .select('id, debit_amount')
    .eq('account_id', account4100.id);

  const newTotal = newLines?.reduce((sum, line) => sum + (line.debit_amount || 0), 0) || 0;
  console.log(`   عدد القيود في 4100: ${newLines?.length || 0}`);
  console.log(`   الرصيد الجديد: ${newTotal.toFixed(2)} جنيه`);

  const { data: oldLines } = await supabase
    .from('journal_entry_lines')
    .select('id')
    .eq('account_id', account5000.id);

  console.log(`   عدد القيود المتبقية في 5000: ${oldLines?.length || 0}`);

  if (oldLines?.length === 0) {
    console.log(`   ✅ تم نقل جميع القيود بنجاح!`);
  } else {
    console.log(`   ⚠️  لا تزال هناك ${oldLines.length} قيود في 5000`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ Step 2 مكتمل - تم نقل COGS بنجاح');
  console.log('='.repeat(80) + '\n');
}

step2MigrateCOGS().catch(console.error);

