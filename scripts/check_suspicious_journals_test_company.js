// =====================================================
// فحص القيود المشكوك فيها لشركة "تست"
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

async function checkSuspiciousJournals() {
  console.log('\n🔍 فحص القيود المشكوك فيها لشركة "تست"\n');
  
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
    
    // جلب الحسابات
    const { data: accounts } = await supabase
      .from('chart_of_accounts')
      .select('id, account_code, account_name, account_type')
      .eq('company_id', companyId)
      .eq('is_active', true);
    
    const accountsMap = new Map(accounts?.map(acc => [acc.id, acc]) || []);
    
    // فحص قيد "فاتورة شراء BILL-0002"
    console.log('='.repeat(80));
    console.log('1. فحص قيد "فاتورة شراء BILL-0002"');
    console.log('='.repeat(80));
    
    const { data: bill2Entry } = await supabase
      .from('journal_entries')
      .select('id, entry_date, description, reference_type, reference_id')
      .eq('company_id', companyId)
      .ilike('description', '%BILL-0002%')
      .eq('reference_type', 'bill')
      .limit(1)
      .single();
    
    if (bill2Entry) {
      const { data: bill2Lines } = await supabase
        .from('journal_entry_lines')
        .select('account_id, debit_amount, credit_amount, description')
        .eq('journal_entry_id', bill2Entry.id);
      
      console.log(`   القيد ID: ${bill2Entry.id}`);
      console.log(`   التاريخ: ${bill2Entry.entry_date}`);
      console.log(`   الوصف: ${bill2Entry.description}`);
      console.log(`\n   السطور:`);
      
      bill2Lines?.forEach(line => {
        const acc = accountsMap.get(line.account_id);
        const accName = acc ? `${acc.account_code} - ${acc.account_name}` : 'غير معروف';
        console.log(`      ${accName}:`);
        console.log(`         Debit: ${line.debit_amount}, Credit: ${line.credit_amount}`);
      });
    }
    
    // فحص قيود "إشعار دائن مورد"
    console.log('\n' + '='.repeat(80));
    console.log('2. فحص قيود "إشعار دائن مورد"');
    console.log('='.repeat(80));
    
    const { data: vendorCreditEntries } = await supabase
      .from('journal_entries')
      .select('id, entry_date, description, reference_type, reference_id')
      .eq('company_id', companyId)
      .eq('reference_type', 'vendor_credit')
      .order('entry_date', { ascending: false});
    
    for (const entry of vendorCreditEntries || []) {
      const { data: lines } = await supabase
        .from('journal_entry_lines')
        .select('account_id, debit_amount, credit_amount, description')
        .eq('journal_entry_id', entry.id);
      
      console.log(`\n   القيد ID: ${entry.id}`);
      console.log(`   التاريخ: ${entry.entry_date}`);
      console.log(`   الوصف: ${entry.description}`);
      console.log(`   السطور:`);
      
      lines?.forEach(line => {
        const acc = accountsMap.get(line.account_id);
        const accName = acc ? `${acc.account_code} - ${acc.account_name}` : 'غير معروف';
        console.log(`      ${accName}:`);
        console.log(`         Debit: ${line.debit_amount}, Credit: ${line.credit_amount}`);
      });
    }
    
    // فحص قيد "الأصول المتداولة" مع Credit
    console.log('\n' + '='.repeat(80));
    console.log('3. فحص قيود "الأصول المتداولة" (1100)');
    console.log('='.repeat(80));
    
    const { data: asset1100 } = await supabase
      .from('chart_of_accounts')
      .select('id')
      .eq('company_id', companyId)
      .eq('account_code', '1100')
      .single();
    
    if (asset1100) {
      const { data: lines1100 } = await supabase
        .from('journal_entry_lines')
        .select('journal_entry_id, account_id, debit_amount, credit_amount, description')
        .eq('account_id', asset1100.id)
        .gt('credit_amount', 0);
      
      console.log(`   عدد السطور مع Credit: ${lines1100?.length || 0}`);
      
      for (const line of lines1100 || []) {
        const { data: je } = await supabase
          .from('journal_entries')
          .select('entry_date, description, reference_type')
          .eq('id', line.journal_entry_id)
          .single();
        
        console.log(`\n   القيد: ${je?.description || 'N/A'}`);
        console.log(`   التاريخ: ${je?.entry_date || 'N/A'}`);
        console.log(`   النوع: ${je?.reference_type || 'N/A'}`);
        console.log(`   Credit: ${line.credit_amount}`);
      }
    }
    
  } catch (error) {
    console.error('❌ خطأ:', error);
  }
}

checkSuspiciousJournals();
