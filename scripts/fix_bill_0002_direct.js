// =====================================================
// إصلاح قيد BILL-0002 مباشرة
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

async function fixBill0002() {
  console.log('\n🔧 إصلاح قيد BILL-0002 مباشرة\n');
  
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
    
    // جلب قيد BILL-0002
    const { data: bill2Entry } = await supabase
      .from('journal_entries')
      .select('id, entry_date, description, reference_type, reference_id')
      .eq('company_id', companyId)
      .ilike('description', '%BILL-0002%')
      .eq('reference_type', 'bill')
      .limit(1)
      .single();
    
    if (!bill2Entry) {
      console.log('   ⚠️ لم يتم العثور على قيد BILL-0002');
      return;
    }
    
    console.log(`   📌 قيد ID: ${bill2Entry.id}`);
    console.log(`   الوصف: ${bill2Entry.description}`);
    
    // جلب سطور القيد
    const { data: lines } = await supabase
      .from('journal_entry_lines')
      .select('id, account_id, debit_amount, credit_amount, description')
      .eq('journal_entry_id', bill2Entry.id);
    
    // جلب الحسابات
    const { data: accounts } = await supabase
      .from('chart_of_accounts')
      .select('id, account_code, account_name, account_type')
      .eq('company_id', companyId)
      .eq('is_active', true);
    
    const accountsMap = new Map(accounts?.map(acc => [acc.id, acc]) || []);
    
    console.log(`\n   السطور الحالية:`);
    lines?.forEach(line => {
      const acc = accountsMap.get(line.account_id);
      const accName = acc ? `${acc.account_code} - ${acc.account_name}` : 'غير معروف';
      console.log(`      ${accName}: Debit ${line.debit_amount}, Credit ${line.credit_amount}`);
    });
    
    // البحث عن سطر Credit لحساب "الأصول المتداولة" (1100)
    const asset1100Account = accounts?.find(acc => acc.account_code === '1100');
    const wrongLine = lines?.find(l => l.account_id === asset1100Account?.id && l.credit_amount > 0);
    
    if (!wrongLine) {
      console.log('\n   ✅ لا يوجد سطر خاطئ');
      return;
    }
    
    console.log(`\n   📌 وجد سطر خاطئ: Credit ${wrongLine.credit_amount} لحساب "الأصول المتداولة"`);
    
    // البحث عن حساب مناسب (المخزون أو المصروفات)
    const inventoryAccount = accounts?.find(acc => acc.account_code.startsWith('114'));
    const expenseAccount = accounts?.find(acc => acc.account_type === 'expense' && acc.account_code.startsWith('50'));
    
    const correctAccountId = inventoryAccount?.id || expenseAccount?.id;
    
    if (!correctAccountId) {
      console.log('   ⚠️ لم يتم العثور على حساب مناسب');
      return;
    }
    
    const correctAccount = accountsMap.get(correctAccountId);
    console.log(`   ✅ سيتم تغيير الحساب إلى: ${correctAccount?.account_code} - ${correctAccount?.account_name}`);
    
    // الحل: تحديث Credit AP من 100,000 إلى 130,000 (100,000 + 30,000)
    const apLine = lines?.find(l => {
      const acc = accountsMap.get(l.account_id);
      return acc && acc.account_code.startsWith('211');
    });
    
    if (apLine) {
      const newAPCredit = Number(apLine.credit_amount || 0) + wrongLine.credit_amount;
      
      // تحديث AP Credit
      const { error: updateAPError } = await supabase
        .from('journal_entry_lines')
        .update({
          credit_amount: newAPCredit,
          description: 'الذمم الدائنة (الموردين) - إصلاح'
        })
        .eq('id', apLine.id);
      
      if (updateAPError) {
        console.error('   ❌ خطأ في تحديث AP:', updateAPError);
        return;
      }
      
      console.log(`   ✅ تم تحديث AP Credit من ${apLine.credit_amount} إلى ${newAPCredit}`);
    }
    
    // حذف السطر الخاطئ (الآن القيد متوازن)
    const { error: deleteError } = await supabase
      .from('journal_entry_lines')
      .delete()
      .eq('id', wrongLine.id);
    
    if (deleteError) {
      console.error('   ❌ خطأ في حذف السطر:', deleteError);
      return;
    }
    
    console.log(`   ✅ تم حذف السطر الخاطئ`);
    console.log(`   ✅ تم إصلاح القيد`);
    
  } catch (error) {
    console.error('❌ خطأ:', error);
  }
}

fixBill0002();
