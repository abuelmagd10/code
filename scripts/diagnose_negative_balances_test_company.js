// =====================================================
// تشخيص الأرصدة السالبة لشركة "تست"
// =====================================================

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hfvsbsizokxontflgdyn.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function diagnoseNegativeBalances() {
  console.log('\n🔍 تشخيص الأرصدة السالبة لشركة "تست"\n');
  
  try {
    // جلب شركة "تست"
    const { data: companies } = await supabase
      .from('companies')
      .select('id, name')
      .ilike('name', '%تست%')
      .limit(1);
    
    if (!companies || companies.length === 0) {
      console.log('⚠️ لم يتم العثور على شركة "تست"');
      return;
    }
    
    const companyId = companies[0].id;
    
    // جلب الحسابات السالبة
    const { data: accounts } = await supabase
      .from('chart_of_accounts')
      .select('id, account_code, account_name, account_type, sub_type, opening_balance')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .in('account_code', ['1100', '1110', '1130', '1140']);
    
    // جلب جميع القيود
    const { data: journalEntries } = await supabase
      .from('journal_entries')
      .select('id, entry_date, description, reference_type')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('entry_date', { ascending: false });
    
    const jeIds = journalEntries?.map(je => je.id) || [];
    
    // جلب سطور القيود للحسابات المحددة
    const accountIds = accounts?.map(acc => acc.id) || [];
    
    let journalLines = [];
    if (jeIds.length > 0 && accountIds.length > 0) {
      const { data: lines } = await supabase
        .from('journal_entry_lines')
        .select('journal_entry_id, account_id, debit_amount, credit_amount, description')
        .in('journal_entry_id', jeIds)
        .in('account_id', accountIds);
      
      journalLines = lines || [];
    }
    
    // تحليل كل حساب
    accounts?.forEach(acc => {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`${acc.account_code} - ${acc.account_name}`);
      console.log('='.repeat(80));
      
      const openingBalance = Number(acc.opening_balance || 0);
      console.log(`   الرصيد الافتتاحي: ${openingBalance.toFixed(2)}`);
      
      const accountLines = journalLines.filter(l => l.account_id === acc.id);
      let totalDebit = 0;
      let totalCredit = 0;
      
      console.log(`\n   القيود المحاسبية (${accountLines.length} سطر):`);
      
      accountLines.forEach(line => {
        const debit = Number(line.debit_amount || 0);
        const credit = Number(line.credit_amount || 0);
        totalDebit += debit;
        totalCredit += credit;
        
        const je = journalEntries?.find(e => e.id === line.journal_entry_id);
        const movement = acc.account_type === 'asset' ? (debit - credit) : (credit - debit);
        
        console.log(`      ${je?.entry_date || 'N/A'} - ${je?.description || 'N/A'}`);
        console.log(`         Debit: ${debit.toFixed(2)}, Credit: ${credit.toFixed(2)}, Movement: ${movement.toFixed(2)}`);
      });
      
      const isDebitNature = acc.account_type === 'asset' || acc.account_type === 'expense';
      const netMovement = isDebitNature ? (totalDebit - totalCredit) : (totalCredit - totalDebit);
      const finalBalance = openingBalance + netMovement;
      
      console.log(`\n   إجمالي Debit: ${totalDebit.toFixed(2)}`);
      console.log(`   إجمالي Credit: ${totalCredit.toFixed(2)}`);
      console.log(`   صافي الحركة: ${netMovement.toFixed(2)}`);
      console.log(`   الرصيد النهائي: ${finalBalance.toFixed(2)}`);
      
      if (finalBalance < 0 && acc.account_type === 'asset') {
        console.log(`   ⚠️ رصيد سالب غير منطقي لحساب أصل!`);
      }
    });
    
  } catch (error) {
    console.error('❌ خطأ:', error);
  }
}

diagnoseNegativeBalances();
