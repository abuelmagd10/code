// =====================================================
// التحقق من الميزانية بعد نقل المبالغ الزائدة
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

async function verifyBalanceSheet() {
  console.log('\n🔍 التحقق من الميزانية بعد نقل المبالغ الزائدة\n');
  
  try {
    // جلب جميع الحسابات
    const { data: accounts } = await supabase
      .from('chart_of_accounts')
      .select('id, account_code, account_name, account_type, sub_type, opening_balance, normal_balance')
      .eq('is_active', true);
    
    if (!accounts || accounts.length === 0) {
      console.log('⚠️ لا توجد حسابات');
      return;
    }
    
    // جلب جميع القيود المحاسبية
    const { data: journalEntries } = await supabase
      .from('journal_entries')
      .select('id')
      .is('deleted_at', null);
    
    const jeIds = journalEntries?.map(je => je.id) || [];
    
    const { data: journalLines } = await supabase
      .from('journal_entry_lines')
      .select('account_id, debit_amount, credit_amount')
      .in('journal_entry_id', jeIds);
    
    // حساب الأرصدة
    const accountBalances = new Map();
    
    accounts.forEach(acc => {
      accountBalances.set(acc.id, {
        account_code: acc.account_code,
        account_name: acc.account_name,
        account_type: acc.account_type,
        sub_type: acc.sub_type,
        opening_balance: acc.opening_balance || 0,
        total_debit: 0,
        total_credit: 0,
        balance: acc.opening_balance || 0
      });
    });
    
    journalLines?.forEach(line => {
      const acc = accountBalances.get(line.account_id);
      if (acc) {
        acc.total_debit += line.debit_amount || 0;
        acc.total_credit += line.credit_amount || 0;
      }
    });
    
    // حساب الرصيد النهائي
    accountBalances.forEach(acc => {
      const isDebitNature = acc.account_type === 'asset' || acc.account_type === 'expense';
      const movement = isDebitNature 
        ? (acc.total_debit - acc.total_credit)
        : (acc.total_credit - acc.total_debit);
      acc.balance = acc.opening_balance + movement;
    });
    
    // حساب الميزانية
    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalEquity = 0;
    let totalIncome = 0;
    let totalExpenses = 0;
    
    accountBalances.forEach(acc => {
      switch (acc.account_type) {
        case 'asset':
          totalAssets += acc.balance;
          break;
        case 'liability':
          totalLiabilities += acc.balance;
          break;
        case 'equity':
          totalEquity += acc.balance;
          break;
        case 'income':
          totalIncome += acc.balance;
          break;
        case 'expense':
          totalExpenses += acc.balance;
          break;
      }
    });
    
    const netIncome = totalIncome - totalExpenses;
    const totalEquityWithIncome = totalEquity + netIncome;
    const liabilitiesPlusEquity = totalLiabilities + totalEquityWithIncome;
    const balanceDifference = totalAssets - liabilitiesPlusEquity;
    
    console.log('='.repeat(80));
    console.log('الميزانية العمومية:');
    console.log('='.repeat(80));
    console.log(`   الأصول: ${totalAssets.toFixed(2)}`);
    console.log(`   الالتزامات: ${totalLiabilities.toFixed(2)}`);
    console.log(`   حقوق الملكية: ${totalEquity.toFixed(2)}`);
    console.log(`   الإيرادات: ${totalIncome.toFixed(2)}`);
    console.log(`   المصروفات: ${totalExpenses.toFixed(2)}`);
    console.log(`   صافي الدخل: ${netIncome.toFixed(2)}`);
    console.log(`   حقوق الملكية + صافي الدخل: ${totalEquityWithIncome.toFixed(2)}`);
    console.log(`   الالتزامات + حقوق الملكية: ${liabilitiesPlusEquity.toFixed(2)}`);
    console.log(`   الفرق: ${balanceDifference.toFixed(2)}`);
    
    if (Math.abs(balanceDifference) < 0.01) {
      console.log(`   ✅ الميزانية متوازنة`);
    } else {
      console.log(`   ⚠️ الميزانية غير متوازنة (الفرق: ${balanceDifference.toFixed(2)})`);
    }
    
    // التحقق من حساب AP
    const apAccounts = Array.from(accountBalances.values())
      .filter(acc => acc.sub_type === 'accounts_payable');
    
    console.log(`\n${'='.repeat(80)}`);
    console.log('حساب الموردين (AP):');
    console.log('='.repeat(80));
    
    apAccounts.forEach(acc => {
      console.log(`   ${acc.account_code} - ${acc.account_name}: ${acc.balance.toFixed(2)}`);
      if (acc.balance < 0) {
        console.log(`      ⚠️ رصيد سالب`);
      }
    });
    
    const totalAP = apAccounts.reduce((sum, acc) => sum + acc.balance, 0);
    console.log(`   إجمالي AP: ${totalAP.toFixed(2)}`);
    
    // التحقق من حساب "مدفوعات مسبقة للموردين"
    const prepaidAccounts = Array.from(accountBalances.values())
      .filter(acc => acc.account_name.includes('مدفوعات مسبقة') || acc.sub_type === 'prepaid_expenses');
    
    console.log(`\n${'='.repeat(80)}`);
    console.log('حساب "مدفوعات مسبقة للموردين":');
    console.log('='.repeat(80));
    
    prepaidAccounts.forEach(acc => {
      console.log(`   ${acc.account_code} - ${acc.account_name}: ${acc.balance.toFixed(2)}`);
    });
    
    const totalPrepaid = prepaidAccounts.reduce((sum, acc) => sum + acc.balance, 0);
    console.log(`   إجمالي مدفوعات مسبقة: ${totalPrepaid.toFixed(2)}`);
    
  } catch (error) {
    console.error('❌ خطأ:', error);
  }
}

verifyBalanceSheet();
