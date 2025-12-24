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

async function deepAccountingAnalysis() {
  console.log('\n' + '='.repeat(80));
  console.log('🔍 تحليل محاسبي عميق - VitaSlims');
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

  // 1. Analyze Chart of Accounts
  console.log('1️⃣ تحليل شجرة الحسابات:');
  const { data: accounts } = await supabase
    .from('chart_of_accounts')
    .select('account_code, account_name, account_type')
    .eq('company_id', company.id)
    .order('account_code');

  console.log(`   إجمالي الحسابات: ${accounts?.length || 0}`);
  
  // Group by type
  const accountsByType = {};
  for (const acc of accounts || []) {
    if (!accountsByType[acc.account_type]) {
      accountsByType[acc.account_type] = [];
    }
    accountsByType[acc.account_type].push(acc);
  }

  for (const [type, accs] of Object.entries(accountsByType)) {
    console.log(`   ${type}: ${accs.length} حساب`);
  }
  console.log('');

  // 2. Find COGS-related accounts
  console.log('2️⃣ البحث عن حسابات COGS:');
  const cogsAccounts = accounts?.filter(a => 
    a.account_name.includes('تكلفة') || 
    a.account_name.includes('COGS') ||
    a.account_name.includes('Cost of Goods')
  );
  
  for (const acc of cogsAccounts || []) {
    console.log(`   ${acc.account_code} - ${acc.account_name} (${acc.account_type})`);
    
    // Get balance
    const { data: lines } = await supabase
      .from('journal_entry_lines')
      .select('debit_amount, credit_amount, journal_entries!inner(company_id)')
      .eq('journal_entries.company_id', company.id)
      .eq('account_id', (await supabase.from('chart_of_accounts').select('id').eq('account_code', acc.account_code).eq('company_id', company.id).single()).data.id);
    
    let balance = 0;
    for (const line of lines || []) {
      balance += (line.debit_amount || 0) - (line.credit_amount || 0);
    }
    console.log(`      الرصيد: ${balance.toFixed(2)} جنيه`);
  }
  console.log('');

  // 3. Analyze Journal Entries by Type
  console.log('3️⃣ تحليل القيود المحاسبية حسب النوع:');
  const { data: entries } = await supabase
    .from('journal_entries')
    .select('reference_type')
    .eq('company_id', company.id);

  const entriesByType = {};
  for (const entry of entries || []) {
    const type = entry.reference_type || 'unknown';
    entriesByType[type] = (entriesByType[type] || 0) + 1;
  }

  for (const [type, count] of Object.entries(entriesByType)) {
    console.log(`   ${type}: ${count} قيد`);
  }
  console.log('');

  // 4. Check for Capital Entry
  console.log('4️⃣ البحث عن قيد رأس المال:');
  const { data: capitalAccount } = await supabase
    .from('chart_of_accounts')
    .select('id, account_code, account_name')
    .eq('company_id', company.id)
    .eq('account_code', '3000')
    .single();

  if (capitalAccount) {
    console.log(`   ✅ حساب رأس المال موجود: ${capitalAccount.account_name}`);
    
    const { data: capitalLines } = await supabase
      .from('journal_entry_lines')
      .select('debit_amount, credit_amount, journal_entries!inner(entry_date, description)')
      .eq('account_id', capitalAccount.id);

    console.log(`   عدد القيود: ${capitalLines?.length || 0}`);
    if (capitalLines && capitalLines.length > 0) {
      for (const line of capitalLines) {
        console.log(`      ${line.journal_entries.entry_date}: Dr ${line.debit_amount || 0}, Cr ${line.credit_amount || 0} - ${line.journal_entries.description || ''}`);
      }
    } else {
      console.log('   ❌ لا توجد قيود لرأس المال!');
    }
  } else {
    console.log('   ❌ حساب رأس المال غير موجود!');
  }
  console.log('');

  // 5. Analyze Expense Accounts
  console.log('5️⃣ تحليل حسابات المصروفات (5xxx):');
  const expenseAccounts = accounts?.filter(a => a.account_code.startsWith('5'));
  
  for (const acc of expenseAccounts || []) {
    const { data: accWithId } = await supabase
      .from('chart_of_accounts')
      .select('id')
      .eq('account_code', acc.account_code)
      .eq('company_id', company.id)
      .single();

    const { data: lines } = await supabase
      .from('journal_entry_lines')
      .select('debit_amount')
      .eq('account_id', accWithId.id);

    let total = 0;
    for (const line of lines || []) {
      total += line.debit_amount || 0;
    }

    if (total > 0) {
      console.log(`   ${acc.account_code} - ${acc.account_name}: ${total.toFixed(2)} جنيه`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ اكتمل التحليل');
  console.log('='.repeat(80) + '\n');
}

deepAccountingAnalysis().catch(console.error);

