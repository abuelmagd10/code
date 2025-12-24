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

async function step3CreateCapital() {
  console.log('\n' + '='.repeat(80));
  console.log('🔧 Step 3: إنشاء قيد رأس المال الافتتاحي');
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

  // Get required accounts
  console.log('1️⃣ جلب الحسابات المطلوبة...');
  
  // Capital account (3000)
  const { data: capitalAccount } = await supabase
    .from('chart_of_accounts')
    .select('id, account_code, account_name')
    .eq('company_id', company.id)
    .eq('account_code', '3000')
    .single();

  // Cash/Bank account (1000 or 1100)
  const { data: cashAccount } = await supabase
    .from('chart_of_accounts')
    .select('id, account_code, account_name')
    .eq('company_id', company.id)
    .eq('account_code', '1000')
    .single();

  if (!capitalAccount) {
    console.log('   ❌ حساب رأس المال (3000) غير موجود');
    return;
  }

  if (!cashAccount) {
    console.log('   ❌ حساب النقدية (1000) غير موجود');
    return;
  }

  console.log(`   ✅ ${capitalAccount.account_code} - ${capitalAccount.account_name}`);
  console.log(`   ✅ ${cashAccount.account_code} - ${cashAccount.account_name}`);
  console.log('');

  // Check if capital entry already exists
  console.log('2️⃣ التحقق من وجود قيد رأس المال...');
  const { data: existingLines } = await supabase
    .from('journal_entry_lines')
    .select('id, debit_amount, credit_amount')
    .eq('account_id', capitalAccount.id);

  if (existingLines && existingLines.length > 0) {
    const balance = existingLines.reduce((sum, line) => 
      sum + (line.credit_amount || 0) - (line.debit_amount || 0), 0);
    console.log(`   ⚠️  يوجد ${existingLines.length} قيد في حساب رأس المال`);
    console.log(`   الرصيد الحالي: ${balance.toFixed(2)} جنيه`);
    console.log(`   هل تريد إضافة قيد جديد؟ (سيتم الإضافة)`);
  } else {
    console.log(`   ✅ لا توجد قيود سابقة - جاهز للإنشاء`);
  }
  console.log('');

  // Create journal entry
  console.log('3️⃣ إنشاء قيد رأس المال...');
  const capitalAmount = 100000; // 100,000 EGP
  const entryDate = '2024-01-01'; // تاريخ بدء النشاط

  const { data: journalEntry, error: jeError } = await supabase
    .from('journal_entries')
    .insert({
      company_id: company.id,
      reference_type: 'manual_entry',
      entry_date: entryDate,
      description: 'قيد افتتاحي - رأس المال'
    })
    .select()
    .single();

  if (jeError) {
    console.log(`   ❌ خطأ في إنشاء القيد: ${jeError.message}`);
    return;
  }

  console.log(`   ✅ تم إنشاء القيد: ${journalEntry.id}`);
  console.log('');

  // Create journal entry lines
  console.log('4️⃣ إنشاء سطور القيد...');
  
  // Debit: Cash 100,000
  const { error: debitError } = await supabase
    .from('journal_entry_lines')
    .insert({
      journal_entry_id: journalEntry.id,
      account_id: cashAccount.id,
      debit_amount: capitalAmount,
      credit_amount: 0,
      description: 'رأس المال الافتتاحي'
    });

  if (debitError) {
    console.log(`   ❌ خطأ في سطر المدين: ${debitError.message}`);
    return;
  }
  console.log(`   ✅ Dr: ${cashAccount.account_name} ${capitalAmount.toFixed(2)}`);

  // Credit: Capital 100,000
  const { error: creditError } = await supabase
    .from('journal_entry_lines')
    .insert({
      journal_entry_id: journalEntry.id,
      account_id: capitalAccount.id,
      debit_amount: 0,
      credit_amount: capitalAmount,
      description: 'رأس المال الافتتاحي'
    });

  if (creditError) {
    console.log(`   ❌ خطأ في سطر الدائن: ${creditError.message}`);
    return;
  }
  console.log(`   ✅ Cr: ${capitalAccount.account_name} ${capitalAmount.toFixed(2)}`);
  console.log('');

  // Verify entry
  console.log('5️⃣ التحقق من القيد...');
  const { data: verifyLines } = await supabase
    .from('journal_entry_lines')
    .select('debit_amount, credit_amount')
    .eq('journal_entry_id', journalEntry.id);

  const totalDebit = verifyLines?.reduce((sum, line) => sum + (line.debit_amount || 0), 0) || 0;
  const totalCredit = verifyLines?.reduce((sum, line) => sum + (line.credit_amount || 0), 0) || 0;

  console.log(`   إجمالي المدين: ${totalDebit.toFixed(2)} جنيه`);
  console.log(`   إجمالي الدائن: ${totalCredit.toFixed(2)} جنيه`);
  console.log(`   الفرق: ${(totalDebit - totalCredit).toFixed(2)} جنيه`);

  if (totalDebit === totalCredit) {
    console.log(`   ✅ القيد متوازن!`);
  } else {
    console.log(`   ❌ القيد غير متوازن!`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ Step 3 مكتمل - تم إنشاء قيد رأس المال');
  console.log('='.repeat(80) + '\n');
}

step3CreateCapital().catch(console.error);

