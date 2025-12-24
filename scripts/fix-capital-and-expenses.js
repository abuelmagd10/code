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

async function fixCapitalAndExpenses() {
  console.log('\n' + '='.repeat(80));
  console.log('🔧 تصحيح رأس المال والمصروفات');
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

  // Step 1: Fix Capital from 100,000 to 200,000
  console.log('1️⃣ تصحيح رأس المال من 100,000 إلى 200,000...');
  
  const { data: capitalAccount } = await supabase
    .from('chart_of_accounts')
    .select('id')
    .eq('company_id', company.id)
    .eq('account_code', '3000')
    .single();

  const { data: cashAccount } = await supabase
    .from('chart_of_accounts')
    .select('id')
    .eq('company_id', company.id)
    .eq('account_code', '1000')
    .single();

  // Find the existing capital entry
  const { data: existingEntry } = await supabase
    .from('journal_entries')
    .select('id')
    .eq('company_id', company.id)
    .eq('reference_type', 'manual_entry')
    .eq('description', 'قيد افتتاحي - رأس المال')
    .single();

  if (existingEntry) {
    // Update existing lines
    const { data: lines } = await supabase
      .from('journal_entry_lines')
      .select('id, account_id')
      .eq('journal_entry_id', existingEntry.id);

    for (const line of lines || []) {
      if (line.account_id === cashAccount.id) {
        // Update debit to 200,000
        await supabase
          .from('journal_entry_lines')
          .update({ debit_amount: 200000 })
          .eq('id', line.id);
        console.log('   ✅ تم تحديث المدين (النقدية) إلى 200,000');
      } else if (line.account_id === capitalAccount.id) {
        // Update credit to 200,000
        await supabase
          .from('journal_entry_lines')
          .update({ credit_amount: 200000 })
          .eq('id', line.id);
        console.log('   ✅ تم تحديث الدائن (رأس المال) إلى 200,000');
      }
    }
  }
  console.log('');

  // Step 2: Check current expenses
  console.log('2️⃣ التحقق من المصروفات الحالية...');
  
  const { data: expenseAccounts } = await supabase
    .from('chart_of_accounts')
    .select('id, account_code, account_name')
    .eq('company_id', company.id)
    .like('account_code', '5%')
    .order('account_code');

  console.log('   الحسابات الموجودة:');
  for (const acc of expenseAccounts || []) {
    const { data: lines } = await supabase
      .from('journal_entry_lines')
      .select('debit_amount')
      .eq('account_id', acc.id);
    
    const total = lines?.reduce((sum, line) => sum + (line.debit_amount || 0), 0) || 0;
    console.log(`   ${acc.account_code} - ${acc.account_name}: ${total.toFixed(2)} جنيه`);
  }
  console.log('');

  // Step 3: Verify expected expenses
  console.log('3️⃣ المصروفات المتوقعة:');
  const expectedExpenses = {
    'مصروفات تشغيلية': 16049,
    'اهلاك مخزون شركات الشحن': 400,
    'تكاليف اعلانات الميديا': 27025,
    'تكاليف الاتصالات': 1045,
    'مرتبات موظفين': 12000,
    'ايجار مكتب': 6000,
    'مصاريف شركة بوسطة للشحن': 4259,
    'مصاريف شحن مندوب': 650
  };

  let totalExpected = 0;
  for (const [name, amount] of Object.entries(expectedExpenses)) {
    console.log(`   ${name}: ${amount.toFixed(2)} جنيه`);
    totalExpected += amount;
  }
  console.log(`   ─────────────────────────────────────`);
  console.log(`   الإجمالي المتوقع: ${totalExpected.toFixed(2)} جنيه`);
  console.log('');

  // Step 4: Check COGS
  console.log('4️⃣ التحقق من COGS...');
  const { data: cogsAccount } = await supabase
    .from('chart_of_accounts')
    .select('id')
    .eq('company_id', company.id)
    .eq('account_code', '4100')
    .single();

  const { data: cogsLines } = await supabase
    .from('journal_entry_lines')
    .select('debit_amount, credit_amount')
    .eq('account_id', cogsAccount.id);

  const cogsDebit = cogsLines?.reduce((sum, line) => sum + (line.debit_amount || 0), 0) || 0;
  const cogsCredit = cogsLines?.reduce((sum, line) => sum + (line.credit_amount || 0), 0) || 0;
  const cogsNet = cogsDebit - cogsCredit;

  console.log(`   COGS المدين: ${cogsDebit.toFixed(2)} جنيه`);
  console.log(`   COGS الدائن: ${cogsCredit.toFixed(2)} جنيه`);
  console.log(`   COGS الصافي: ${cogsNet.toFixed(2)} جنيه`);
  console.log(`   COGS المتوقع: 4,250.00 جنيه`);
  console.log('');

  console.log('='.repeat(80));
  console.log('✅ اكتمل التحليل');
  console.log('='.repeat(80) + '\n');
}

fixCapitalAndExpenses().catch(console.error);

