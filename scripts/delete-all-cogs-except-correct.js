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

async function deleteAllCOGSExceptCorrect() {
  console.log('\n' + '='.repeat(80));
  console.log('🗑️  حذف جميع قيود COGS ما عدا القيد الصحيح');
  console.log('='.repeat(80) + '\n');

  // Get VitaSlims company
  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('name', 'VitaSlims')
    .single();

  // Get COGS account
  const { data: cogsAccount } = await supabase
    .from('chart_of_accounts')
    .select('id')
    .eq('company_id', company.id)
    .eq('account_code', '4100')
    .single();

  // Get all COGS journal entries
  const { data: cogsEntries } = await supabase
    .from('journal_entries')
    .select('id, description, entry_date')
    .eq('company_id', company.id)
    .or('description.ilike.%COGS%,description.ilike.%تكلفة البضاعة%,description.ilike.%عكس تكلفة%,description.ilike.%تسوية المخزون%')
    .order('entry_date');

  console.log(`📊 إجمالي قيود COGS: ${cogsEntries?.length || 0}`);
  console.log('');

  // Keep only the correct entry (تكلفة البضاعة المباعة - تصحيح)
  const correctEntry = cogsEntries?.find(e => e.description === 'تكلفة البضاعة المباعة - تصحيح');
  
  if (!correctEntry) {
    console.log('❌ لم يتم العثور على القيد الصحيح');
    return;
  }

  console.log(`✅ القيد الصحيح: ${correctEntry.description} (${correctEntry.entry_date})`);
  console.log('');

  // Delete all other entries
  console.log('🗑️  حذف القيود الأخرى...');
  let deletedCount = 0;

  for (const entry of cogsEntries || []) {
    if (entry.id === correctEntry.id) {
      continue; // Skip the correct entry
    }

    // Delete journal entry lines first
    await supabase
      .from('journal_entry_lines')
      .delete()
      .eq('journal_entry_id', entry.id);

    // Delete journal entry
    const { error } = await supabase
      .from('journal_entries')
      .delete()
      .eq('id', entry.id);

    if (!error) {
      deletedCount++;
      if (deletedCount % 10 === 0) {
        console.log(`   تم حذف ${deletedCount} قيد...`);
      }
    }
  }

  console.log(`   ✅ تم حذف ${deletedCount} قيد`);
  console.log('');

  // Verify final COGS
  console.log('📊 التحقق من COGS النهائي...');
  
  const { data: finalLines } = await supabase
    .from('journal_entry_lines')
    .select('debit_amount, credit_amount')
    .eq('account_id', cogsAccount.id);

  const totalDebit = finalLines?.reduce((sum, line) => sum + (line.debit_amount || 0), 0) || 0;
  const totalCredit = finalLines?.reduce((sum, line) => sum + (line.credit_amount || 0), 0) || 0;
  const netCOGS = totalDebit - totalCredit;

  console.log(`   COGS المدين: ${totalDebit.toLocaleString()} جنيه`);
  console.log(`   COGS الدائن: ${totalCredit.toLocaleString()} جنيه`);
  console.log(`   COGS الصافي: ${netCOGS.toLocaleString()} جنيه`);
  
  if (netCOGS === 4250) {
    console.log(`   ✅ COGS صحيح!`);
  } else {
    console.log(`   ❌ COGS غير صحيح (متوقع: 4,250)`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ اكتمل الحذف');
  console.log('='.repeat(80) + '\n');
}

deleteAllCOGSExceptCorrect().catch(console.error);

