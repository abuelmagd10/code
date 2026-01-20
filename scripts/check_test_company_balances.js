// =====================================================
// فحص الأرصدة الفعلية لشركة "تست"
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

async function checkTestCompanyBalances() {
  console.log('\n🔍 فحص الأرصدة الفعلية لشركة "تست"\n');
  
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
    console.log(`📄 شركة: ${companies[0].name} (ID: ${companyId})\n`);
    
    // جلب جميع الحسابات النشطة
    const { data: accounts } = await supabase
      .from('chart_of_accounts')
      .select('id, account_code, account_name, account_type, sub_type, opening_balance')
      .eq('company_id', companyId)
      .eq('is_active', true);
    
    if (!accounts || accounts.length === 0) {
      console.log('⚠️ لا توجد حسابات نشطة');
      return;
    }
    
    // جلب جميع القيود
    const { data: journalEntries } = await supabase
      .from('journal_entries')
      .select('id')
      .eq('company_id', companyId)
      .is('deleted_at', null);
    
    const jeIds = journalEntries?.map(je => je.id) || [];
    
    // جلب سطور القيود
    let journalLines = [];
    if (jeIds.length > 0) {
      const { data: lines } = await supabase
        .from('journal_entry_lines')
        .select('account_id, debit_amount, credit_amount')
        .in('journal_entry_id', jeIds);
      
      journalLines = lines || [];
    }
    
    // حساب الأرصدة
    const balances = new Map();
    
    accounts.forEach(acc => {
      balances.set(acc.id, {
        code: acc.account_code,
        name: acc.account_name,
        type: acc.account_type,
        sub_type: acc.sub_type,
        opening: Number(acc.opening_balance || 0),
        balance: Number(acc.opening_balance || 0)
      });
    });
    
    // حساب الحركات
    journalLines.forEach(line => {
      const balance = balances.get(line.account_id);
      if (balance) {
        const debit = Number(line.debit_amount || 0);
        const credit = Number(line.credit_amount || 0);
        
        const isDebitNature = balance.type === 'asset' || balance.type === 'expense';
        const movement = isDebitNature ? (debit - credit) : (credit - debit);
        balance.balance += movement;
      }
    });
    
    // تجميع حسب النوع
    const byType = {
      asset: [],
      liability: [],
      equity: [],
      income: [],
      expense: []
    };
    
    balances.forEach((balance, accountId) => {
      if (Math.abs(balance.balance) >= 0.01) {
        byType[balance.type].push({
          account_id: accountId,
          ...balance
        });
      }
    });
    
    // عرض الأصول
    console.log('='.repeat(80));
    console.log('الأصول:');
    console.log('='.repeat(80));
    let totalAssets = 0;
    byType.asset.forEach(acc => {
      console.log(`   ${acc.code} - ${acc.name}: ${acc.balance.toFixed(2)}`);
      totalAssets += acc.balance;
    });
    console.log(`   إجمالي الأصول: ${totalAssets.toFixed(2)}\n`);
    
    // عرض الالتزامات
    console.log('='.repeat(80));
    console.log('الالتزامات:');
    console.log('='.repeat(80));
    let totalLiabilities = 0;
    byType.liability.forEach(acc => {
      console.log(`   ${acc.code} - ${acc.name}: ${acc.balance.toFixed(2)}`);
      totalLiabilities += acc.balance;
    });
    console.log(`   إجمالي الالتزامات: ${totalLiabilities.toFixed(2)}\n`);
    
    // عرض حقوق الملكية
    console.log('='.repeat(80));
    console.log('حقوق الملكية:');
    console.log('='.repeat(80));
    let totalEquity = 0;
    byType.equity.forEach(acc => {
      console.log(`   ${acc.code} - ${acc.name}: ${acc.balance.toFixed(2)}`);
      totalEquity += acc.balance;
    });
    
    // حساب صافي الدخل
    const totalIncome = byType.income.reduce((sum, acc) => sum + acc.balance, 0);
    const totalExpense = byType.expense.reduce((sum, acc) => sum + acc.balance, 0);
    const netIncome = totalIncome - totalExpense;
    
    console.log(`   الأرباح/الخسائر الجارية: ${netIncome.toFixed(2)}`);
    const equityTotal = totalEquity + netIncome;
    console.log(`   إجمالي حقوق الملكية: ${equityTotal.toFixed(2)}\n`);
    
    // التحقق من التوازن
    console.log('='.repeat(80));
    console.log('التحقق من التوازن:');
    console.log('='.repeat(80));
    const totalLiabilitiesAndEquity = totalLiabilities + equityTotal;
    const difference = totalAssets - totalLiabilitiesAndEquity;
    
    console.log(`   الأصول: ${totalAssets.toFixed(2)}`);
    console.log(`   الالتزامات: ${totalLiabilities.toFixed(2)}`);
    console.log(`   حقوق الملكية: ${equityTotal.toFixed(2)}`);
    console.log(`   الالتزامات + حقوق الملكية: ${totalLiabilitiesAndEquity.toFixed(2)}`);
    console.log(`   الفرق: ${difference.toFixed(2)}`);
    
    if (Math.abs(difference) < 0.01) {
      console.log(`   ✅ الميزانية متوازنة`);
    } else {
      console.log(`   ❌ الميزانية غير متوازنة`);
    }
    
    // عرض الحسابات السالبة غير المنطقية
    console.log('\n' + '='.repeat(80));
    console.log('الحسابات السالبة غير المنطقية:');
    console.log('='.repeat(80));
    
    byType.asset.forEach(acc => {
      if (acc.balance < 0) {
        console.log(`   ⚠️ ${acc.code} - ${acc.name}: ${acc.balance.toFixed(2)} (رصيد سالب لحساب أصل)`);
      }
    });
    
    byType.liability.forEach(acc => {
      if (acc.balance < 0 && acc.sub_type !== 'accounts_payable') {
        console.log(`   ⚠️ ${acc.code} - ${acc.name}: ${acc.balance.toFixed(2)} (رصيد سالب لحساب التزام)`);
      }
    });
    
  } catch (error) {
    console.error('❌ خطأ:', error);
  }
}

checkTestCompanyBalances();
