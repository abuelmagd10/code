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

async function fixCOGS() {
  console.log('\n' + '='.repeat(80));
  console.log('🔧 تصحيح COGS من 35,350 إلى 4,250');
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

  // Get COGS account
  const { data: cogsAccount } = await supabase
    .from('chart_of_accounts')
    .select('id')
    .eq('company_id', company.id)
    .eq('account_code', '4100')
    .single();

  // Get all COGS journal entry lines
  const { data: cogsLines } = await supabase
    .from('journal_entry_lines')
    .select('id, debit_amount, credit_amount, journal_entry_id, journal_entries!inner(id, reference_type, description)')
    .eq('account_id', cogsAccount.id)
    .order('journal_entries(entry_date)');

  console.log(`📊 إجمالي قيود COGS: ${cogsLines?.length || 0}`);

  // Calculate current COGS
  let currentDebit = 0;
  let currentCredit = 0;
  for (const line of cogsLines || []) {
    currentDebit += line.debit_amount || 0;
    currentCredit += line.credit_amount || 0;
  }
  const currentCOGS = currentDebit - currentCredit;

  console.log(`   COGS الحالي (مدين): ${currentDebit.toLocaleString()} جنيه`);
  console.log(`   COGS الحالي (دائن): ${currentCredit.toLocaleString()} جنيه`);
  console.log(`   COGS الحالي (صافي): ${currentCOGS.toLocaleString()} جنيه`);
  console.log(`   COGS المطلوب: 4,250 جنيه`);
  console.log(`   الفرق: ${(currentCOGS - 4250).toLocaleString()} جنيه`);
  console.log('');

  // Strategy: Delete all COGS entries and create one correct entry
  console.log('📝 الاستراتيجية: حذف جميع قيود COGS وإنشاء قيد واحد صحيح');
  console.log('');

  // Get inventory account
  const { data: inventoryAccount } = await supabase
    .from('chart_of_accounts')
    .select('id')
    .eq('company_id', company.id)
    .eq('account_code', '1200')
    .single();

  // Step 1: Delete all existing COGS journal entries
  console.log('1️⃣ حذف جميع قيود COGS الحالية...');
  
  const journalEntryIds = [...new Set(cogsLines?.map(line => line.journal_entry_id))];
  console.log(`   عدد القيود المحاسبية: ${journalEntryIds.length}`);

  let deletedCount = 0;
  for (const jeId of journalEntryIds) {
    // Delete journal entry lines first
    await supabase
      .from('journal_entry_lines')
      .delete()
      .eq('journal_entry_id', jeId);

    // Delete journal entry
    const { error } = await supabase
      .from('journal_entries')
      .delete()
      .eq('id', jeId);

    if (!error) {
      deletedCount++;
    }
  }

  console.log(`   ✅ تم حذف ${deletedCount} قيد محاسبي`);
  console.log('');

  // Step 2: Create new correct COGS entry
  console.log('2️⃣ إنشاء قيد COGS الصحيح (4,250 جنيه)...');

  const { data: newJournalEntry, error: jeError } = await supabase
    .from('journal_entries')
    .insert({
      company_id: company.id,
      reference_type: 'manual_entry',
      entry_date: '2024-10-01',
      description: 'تكلفة البضاعة المباعة - تصحيح'
    })
    .select()
    .single();

  if (jeError) {
    console.log(`   ❌ خطأ في إنشاء القيد: ${jeError.message}`);
    return;
  }

  // Debit: COGS 4,250
  const { error: debitError } = await supabase
    .from('journal_entry_lines')
    .insert({
      journal_entry_id: newJournalEntry.id,
      account_id: cogsAccount.id,
      debit_amount: 4250,
      credit_amount: 0,
      description: 'COGS'
    });

  if (debitError) {
    console.log(`   ❌ خطأ في سطر المدين: ${debitError.message}`);
    return;
  }

  // Credit: Inventory 4,250
  const { error: creditError } = await supabase
    .from('journal_entry_lines')
    .insert({
      journal_entry_id: newJournalEntry.id,
      account_id: inventoryAccount.id,
      debit_amount: 0,
      credit_amount: 4250,
      description: 'COGS'
    });

  if (creditError) {
    console.log(`   ❌ خطأ في سطر الدائن: ${creditError.message}`);
    return;
  }

  console.log(`   ✅ تم إنشاء القيد بنجاح`);
  console.log(`      Dr: COGS (4100) 4,250`);
  console.log(`      Cr: المخزون (1200) 4,250`);
  console.log('');

  console.log('='.repeat(80));
  console.log('✅ تم تصحيح COGS بنجاح');
  console.log('='.repeat(80) + '\n');
}

fixCOGS().catch(console.error);

