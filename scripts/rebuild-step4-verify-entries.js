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

async function step4VerifyEntries() {
  console.log('\n' + '='.repeat(80));
  console.log('🔧 Step 4: التحقق من جميع القيود المحاسبية');
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

  // Get all journal entries
  console.log('1️⃣ جلب جميع القيود المحاسبية...');
  const { data: entries } = await supabase
    .from('journal_entries')
    .select('id, entry_date, reference_type, description')
    .eq('company_id', company.id)
    .order('entry_date');

  console.log(`   إجمالي القيود: ${entries?.length || 0}`);
  console.log('');

  // Check balance for each entry
  console.log('2️⃣ التحقق من توازن القيود...');
  let balancedCount = 0;
  let unbalancedCount = 0;
  const unbalancedEntries = [];

  for (const entry of entries || []) {
    const { data: lines } = await supabase
      .from('journal_entry_lines')
      .select('debit_amount, credit_amount')
      .eq('journal_entry_id', entry.id);

    const totalDebit = lines?.reduce((sum, line) => sum + (line.debit_amount || 0), 0) || 0;
    const totalCredit = lines?.reduce((sum, line) => sum + (line.credit_amount || 0), 0) || 0;
    const diff = Math.abs(totalDebit - totalCredit);

    if (diff < 0.01) { // Allow for rounding errors
      balancedCount++;
    } else {
      unbalancedCount++;
      unbalancedEntries.push({
        id: entry.id,
        date: entry.entry_date,
        type: entry.reference_type,
        description: entry.description,
        debit: totalDebit,
        credit: totalCredit,
        diff: diff
      });
    }
  }

  console.log(`   ✅ قيود متوازنة: ${balancedCount}`);
  console.log(`   ❌ قيود غير متوازنة: ${unbalancedCount}`);

  if (unbalancedEntries.length > 0) {
    console.log('\n   ⚠️  القيود غير المتوازنة:');
    for (const entry of unbalancedEntries.slice(0, 10)) {
      console.log(`      ${entry.date} | ${entry.type} | Dr: ${entry.debit.toFixed(2)} | Cr: ${entry.credit.toFixed(2)} | Diff: ${entry.diff.toFixed(2)}`);
    }
    if (unbalancedEntries.length > 10) {
      console.log(`      ... و ${unbalancedEntries.length - 10} قيد آخر`);
    }
  }
  console.log('');

  // Check key accounts
  console.log('3️⃣ التحقق من الحسابات الرئيسية...');
  
  const keyAccounts = [
    { code: '1000', name: 'النقدية' },
    { code: '1200', name: 'المخزون' },
    { code: '2100', name: 'الموردون' },
    { code: '3000', name: 'رأس المال' },
    { code: '4000', name: 'المبيعات' },
    { code: '4100', name: 'COGS' },
    { code: '5100', name: 'المصروفات' }
  ];

  for (const acc of keyAccounts) {
    const { data: account } = await supabase
      .from('chart_of_accounts')
      .select('id, account_name')
      .eq('company_id', company.id)
      .eq('account_code', acc.code)
      .single();

    if (!account) {
      console.log(`   ⚠️  ${acc.code} - ${acc.name}: غير موجود`);
      continue;
    }

    const { data: lines } = await supabase
      .from('journal_entry_lines')
      .select('debit_amount, credit_amount')
      .eq('account_id', account.id);

    const totalDebit = lines?.reduce((sum, line) => sum + (line.debit_amount || 0), 0) || 0;
    const totalCredit = lines?.reduce((sum, line) => sum + (line.credit_amount || 0), 0) || 0;
    const balance = totalDebit - totalCredit;

    console.log(`   ${acc.code} - ${account.account_name}:`);
    console.log(`      Dr: ${totalDebit.toFixed(2)} | Cr: ${totalCredit.toFixed(2)} | Balance: ${balance.toFixed(2)}`);
  }

  console.log('\n' + '='.repeat(80));
  if (unbalancedCount === 0) {
    console.log('✅ Step 4 مكتمل - جميع القيود متوازنة');
  } else {
    console.log(`⚠️  Step 4 مكتمل - يوجد ${unbalancedCount} قيد غير متوازن`);
  }
  console.log('='.repeat(80) + '\n');
}

step4VerifyEntries().catch(console.error);

