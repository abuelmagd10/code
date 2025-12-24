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

async function comprehensiveAnalysis() {
  console.log('\n' + '='.repeat(80));
  console.log('📊 التحليل المالي الشامل - VitaSlims');
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

  // Expected values from user
  const expected = {
    capital: 200000,
    purchases: 133450,
    sales: 181576,
    cogs: 4250,
    expenses: {
      'مصروفات تشغيلية': 16049,
      'اهلاك مخزون': 400,
      'إعلانات': 27025,
      'اتصالات': 1045,
      'مرتبات': 12000,
      'إيجار': 6000,
      'بوسطة': 4259,
      'مندوب': 650
    },
    totalExpenses: 67428,
    netProfit: 109898
  };

  console.log('📋 القيم المتوقعة من المستخدم:');
  console.log('─'.repeat(80));
  console.log(`رأس المال:                    ${expected.capital.toLocaleString()} جنيه`);
  console.log(`المشتريات:                    ${expected.purchases.toLocaleString()} جنيه`);
  console.log(`المبيعات:                     ${expected.sales.toLocaleString()} جنيه`);
  console.log(`COGS:                         ${expected.cogs.toLocaleString()} جنيه`);
  console.log(`المصروفات:                    ${expected.totalExpenses.toLocaleString()} جنيه`);
  console.log(`صافي الربح:                   ${expected.netProfit.toLocaleString()} جنيه`);
  console.log('');

  // Get actual values
  console.log('📊 القيم الفعلية من قاعدة البيانات:');
  console.log('─'.repeat(80));

  // Capital
  const { data: capitalAccount } = await supabase
    .from('chart_of_accounts')
    .select('id')
    .eq('company_id', company.id)
    .eq('account_code', '3000')
    .single();

  const { data: capitalLines } = await supabase
    .from('journal_entry_lines')
    .select('debit_amount, credit_amount')
    .eq('account_id', capitalAccount.id);

  const actualCapital = capitalLines?.reduce((sum, line) => 
    sum + (line.credit_amount || 0) - (line.debit_amount || 0), 0) || 0;

  console.log(`رأس المال:                    ${actualCapital.toLocaleString()} جنيه ${actualCapital === expected.capital ? '✅' : '❌'}`);

  // Purchases
  const { data: bills } = await supabase
    .from('bills')
    .select('total_amount')
    .eq('company_id', company.id);

  const actualPurchases = bills?.reduce((sum, bill) => sum + (bill.total_amount || 0), 0) || 0;
  console.log(`المشتريات:                    ${actualPurchases.toLocaleString()} جنيه ${actualPurchases === expected.purchases ? '✅' : '❌'}`);

  // Sales
  const { data: invoices } = await supabase
    .from('invoices')
    .select('total_amount, status')
    .eq('company_id', company.id);

  const actualSales = invoices?.filter(inv => inv.status === 'paid')
    .reduce((sum, inv) => sum + (inv.total_amount || 0), 0) || 0;

  console.log(`المبيعات (مدفوعة):            ${actualSales.toLocaleString()} جنيه ${actualSales === expected.sales ? '✅' : '❌'}`);

  // COGS
  const { data: cogsAccount } = await supabase
    .from('chart_of_accounts')
    .select('id')
    .eq('company_id', company.id)
    .eq('account_code', '4100')
    .single();

  const { data: cogsLines } = await supabase
    .from('journal_entry_lines')
    .select('debit_amount, credit_amount')
    .eq('account_id', cogsAccount.id);

  const cogsDebit = cogsLines?.reduce((sum, line) => sum + (line.debit_amount || 0), 0) || 0;
  const cogsCredit = cogsLines?.reduce((sum, line) => sum + (line.credit_amount || 0), 0) || 0;
  const actualCOGS = cogsDebit - cogsCredit;

  console.log(`COGS (إجمالي):                ${cogsDebit.toLocaleString()} جنيه`);
  console.log(`COGS (مرتجعات):               ${cogsCredit.toLocaleString()} جنيه`);
  console.log(`COGS (صافي):                  ${actualCOGS.toLocaleString()} جنيه ${actualCOGS === expected.cogs ? '✅' : '❌'}`);

  // Expenses breakdown
  console.log('\nالمصروفات (تفصيلي):');
  
  const expenseAccounts = [
    { code: '5100', name: 'مصروفات تشغيلية', expected: 16049 },
    { code: '5500', name: 'اهلاك مخزون', expected: 400 },
    { code: '5260', name: 'إعلانات', expected: 27025 },
    { code: '5240', name: 'اتصالات', expected: 1045 },
    { code: '5210', name: 'مرتبات', expected: 12000 },
    { code: '5220', name: 'إيجار', expected: 6000 }
  ];

  let totalActualExpenses = 0;

  for (const expAcc of expenseAccounts) {
    const { data: account } = await supabase
      .from('chart_of_accounts')
      .select('id, account_name')
      .eq('company_id', company.id)
      .eq('account_code', expAcc.code)
      .maybeSingle();

    if (account) {
      const { data: lines } = await supabase
        .from('journal_entry_lines')
        .select('debit_amount')
        .eq('account_id', account.id);

      const total = lines?.reduce((sum, line) => sum + (line.debit_amount || 0), 0) || 0;
      totalActualExpenses += total;
      const status = Math.abs(total - expAcc.expected) < 1 ? '✅' : (total === 0 ? '❌ مفقود' : '⚠️');
      console.log(`  ${expAcc.code} - ${account.account_name}: ${total.toLocaleString()} جنيه (متوقع: ${expAcc.expected.toLocaleString()}) ${status}`);
    } else {
      console.log(`  ${expAcc.code} - ${expAcc.name}: ❌ الحساب غير موجود`);
    }
  }

  // Add shipping expenses
  const shippingAccounts = await supabase
    .from('chart_of_accounts')
    .select('id, account_code, account_name')
    .eq('company_id', company.id)
    .or('account_name.ilike.%بوسطة%,account_name.ilike.%مندوب%');

  for (const acc of shippingAccounts.data || []) {
    const { data: lines } = await supabase
      .from('journal_entry_lines')
      .select('debit_amount')
      .eq('account_id', acc.id);

    const total = lines?.reduce((sum, line) => sum + (line.debit_amount || 0), 0) || 0;
    totalActualExpenses += total;
    console.log(`  ${acc.account_code} - ${acc.account_name}: ${total.toLocaleString()} جنيه ✅`);
  }

  console.log(`\nإجمالي المصروفات الفعلية:     ${totalActualExpenses.toLocaleString()} جنيه`);
  console.log(`إجمالي المصروفات المتوقعة:     ${expected.totalExpenses.toLocaleString()} جنيه`);
  console.log(`الفرق:                         ${(expected.totalExpenses - totalActualExpenses).toLocaleString()} جنيه ${totalActualExpenses === expected.totalExpenses ? '✅' : '❌'}`);

  // Calculate profit
  console.log('\n' + '='.repeat(80));
  console.log('💰 حساب الأرباح:');
  console.log('='.repeat(80));
  
  const actualGrossProfit = actualSales - actualCOGS;
  const actualNetProfit = actualGrossProfit - totalActualExpenses;

  console.log(`المبيعات:                     +${actualSales.toLocaleString()} جنيه`);
  console.log(`COGS:                         -${actualCOGS.toLocaleString()} جنيه`);
  console.log(`─`.repeat(60));
  console.log(`مجمل الربح:                   ${actualGrossProfit.toLocaleString()} جنيه`);
  console.log(`المصروفات:                    -${totalActualExpenses.toLocaleString()} جنيه`);
  console.log(`─`.repeat(60));
  console.log(`صافي الربح (فعلي):            ${actualNetProfit.toLocaleString()} جنيه`);
  console.log(`صافي الربح (متوقع):           ${expected.netProfit.toLocaleString()} جنيه`);
  console.log(`الفرق:                         ${(expected.netProfit - actualNetProfit).toLocaleString()} جنيه ${Math.abs(actualNetProfit - expected.netProfit) < 1 ? '✅' : '❌'}`);

  console.log('\n' + '='.repeat(80));
  console.log('✅ اكتمل التحليل');
  console.log('='.repeat(80) + '\n');
}

comprehensiveAnalysis().catch(console.error);

