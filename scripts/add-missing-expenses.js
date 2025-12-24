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

async function addMissingExpenses() {
  console.log('\n' + '='.repeat(80));
  console.log('💰 إضافة المصروفات المفقودة');
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

  // Get cash account
  const { data: cashAccount } = await supabase
    .from('chart_of_accounts')
    .select('id')
    .eq('company_id', company.id)
    .eq('account_code', '1000')
    .single();

  // Define missing expenses
  const missingExpenses = [
    {
      accountCode: '5260',
      accountName: 'مصاريف التسويق',
      amount: 27025,
      description: 'تكاليف إعلانات الميديا',
      date: '2024-10-01'
    },
    {
      accountCode: '5240',
      accountName: 'الاتصالات والإنترنت',
      amount: 1045,
      description: 'تكاليف الاتصالات',
      date: '2024-10-01'
    },
    {
      accountCode: '5210',
      accountName: 'الرواتب والأجور',
      amount: 12000,
      description: 'مرتبات موظفين (أكتوبر + نوفمبر)',
      date: '2024-10-01'
    },
    {
      accountCode: '5220',
      accountName: 'الإيجار',
      amount: 6000,
      description: 'ايجار مكتب (أكتوبر + نوفمبر)',
      date: '2024-10-01'
    }
  ];

  let totalAdded = 0;
  let successCount = 0;

  for (const expense of missingExpenses) {
    console.log(`\n📝 إضافة: ${expense.description} (${expense.amount.toLocaleString()} جنيه)`);

    // Get or verify expense account
    const { data: expenseAccount } = await supabase
      .from('chart_of_accounts')
      .select('id, account_name')
      .eq('company_id', company.id)
      .eq('account_code', expense.accountCode)
      .maybeSingle();

    if (!expenseAccount) {
      console.log(`   ❌ الحساب ${expense.accountCode} غير موجود`);
      continue;
    }

    console.log(`   ✅ الحساب: ${expenseAccount.account_name}`);

    // Create journal entry
    const { data: journalEntry, error: jeError } = await supabase
      .from('journal_entries')
      .insert({
        company_id: company.id,
        reference_type: 'manual_entry',
        entry_date: expense.date,
        description: expense.description
      })
      .select()
      .single();

    if (jeError) {
      console.log(`   ❌ خطأ في إنشاء القيد: ${jeError.message}`);
      continue;
    }

    // Create debit line (expense)
    const { error: debitError } = await supabase
      .from('journal_entry_lines')
      .insert({
        journal_entry_id: journalEntry.id,
        account_id: expenseAccount.id,
        debit_amount: expense.amount,
        credit_amount: 0,
        description: expense.description
      });

    if (debitError) {
      console.log(`   ❌ خطأ في سطر المدين: ${debitError.message}`);
      continue;
    }

    // Create credit line (cash)
    const { error: creditError } = await supabase
      .from('journal_entry_lines')
      .insert({
        journal_entry_id: journalEntry.id,
        account_id: cashAccount.id,
        debit_amount: 0,
        credit_amount: expense.amount,
        description: expense.description
      });

    if (creditError) {
      console.log(`   ❌ خطأ في سطر الدائن: ${creditError.message}`);
      continue;
    }

    console.log(`   ✅ تم إضافة القيد بنجاح`);
    console.log(`      Dr: ${expenseAccount.account_name} ${expense.amount.toLocaleString()}`);
    console.log(`      Cr: النقدية ${expense.amount.toLocaleString()}`);

    totalAdded += expense.amount;
    successCount++;
  }

  console.log('\n' + '='.repeat(80));
  console.log(`✅ تم إضافة ${successCount} من ${missingExpenses.length} مصروف`);
  console.log(`💰 إجمالي المبلغ المضاف: ${totalAdded.toLocaleString()} جنيه`);
  console.log('='.repeat(80) + '\n');
}

addMissingExpenses().catch(console.error);

