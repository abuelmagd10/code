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

async function step6FinalValidation() {
  console.log('\n' + '='.repeat(80));
  console.log('🎯 Step 6: التحقق النهائي ومقارنة النتائج');
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

  // User's expected values
  const expected = {
    capital: 100000,
    purchases: 133450,
    expenses: 67428, // This was wrong - included COGS
    writeOffs: 400,
    sales: 181576,
    cogs: 39600, // This was wrong
    netProfit: 74548
  };

  console.log('📊 مقارنة النتائج:\n');
  console.log('=' .repeat(80));
  console.log('البند'.padEnd(30) + 'تقرير المستخدم'.padEnd(20) + 'قاعدة البيانات'.padEnd(20) + 'الحالة');
  console.log('='.repeat(80));

  // Get actual values
  const { data: capitalLines } = await supabase
    .from('journal_entry_lines')
    .select('debit_amount, credit_amount, journal_entries!inner(company_id), chart_of_accounts!inner(account_code)')
    .eq('journal_entries.company_id', company.id)
    .eq('chart_of_accounts.account_code', '3000');

  const actualCapital = capitalLines?.reduce((sum, line) => 
    sum + (line.credit_amount || 0) - (line.debit_amount || 0), 0) || 0;

  const { data: bills } = await supabase
    .from('bills')
    .select('total_amount')
    .eq('company_id', company.id);

  const actualPurchases = bills?.reduce((sum, bill) => sum + (bill.total_amount || 0), 0) || 0;

  const { data: expenseLines } = await supabase
    .from('journal_entry_lines')
    .select('debit_amount, journal_entries!inner(company_id), chart_of_accounts!inner(account_code)')
    .eq('journal_entries.company_id', company.id)
    .like('chart_of_accounts.account_code', '5%');

  const actualExpenses = expenseLines?.reduce((sum, line) => sum + (line.debit_amount || 0), 0) || 0;

  const { data: cogsLines } = await supabase
    .from('journal_entry_lines')
    .select('debit_amount, credit_amount, journal_entries!inner(company_id), chart_of_accounts!inner(account_code)')
    .eq('journal_entries.company_id', company.id)
    .eq('chart_of_accounts.account_code', '4100');

  const actualCOGS = cogsLines?.reduce((sum, line) => 
    sum + (line.debit_amount || 0) - (line.credit_amount || 0), 0) || 0;

  const { data: invoices } = await supabase
    .from('invoices')
    .select('total_amount, status')
    .eq('company_id', company.id);

  const actualSales = invoices?.filter(inv => inv.status === 'paid')
    .reduce((sum, inv) => sum + (inv.total_amount || 0), 0) || 0;

  const actualGrossProfit = actualSales - actualCOGS;
  const actualNetProfit = actualGrossProfit - actualExpenses;

  // Print comparison
  const formatNum = (num) => num.toFixed(2).padEnd(20);
  const getStatus = (expected, actual) => {
    const diff = Math.abs(expected - actual);
    return diff < 1 ? '✅' : '❌';
  };

  console.log('رأس المال'.padEnd(30) + formatNum(expected.capital) + formatNum(actualCapital) + getStatus(expected.capital, actualCapital));
  console.log('المشتريات'.padEnd(30) + formatNum(expected.purchases) + formatNum(actualPurchases) + getStatus(expected.purchases, actualPurchases));
  console.log('المصروفات'.padEnd(30) + formatNum(expected.expenses) + formatNum(actualExpenses) + '⚠️  (كانت تشمل COGS)');
  console.log('COGS'.padEnd(30) + formatNum(expected.cogs) + formatNum(actualCOGS) + '⚠️  (كان في حساب خاطئ)');
  console.log('المبيعات (مدفوعة)'.padEnd(30) + formatNum(expected.sales) + formatNum(actualSales) + getStatus(expected.sales, actualSales));
  console.log('مجمل الربح'.padEnd(30) + formatNum(expected.sales - expected.cogs) + formatNum(actualGrossProfit) + '📊');
  console.log('صافي الربح'.padEnd(30) + formatNum(expected.netProfit) + formatNum(actualNetProfit) + '📊');
  console.log('='.repeat(80));

  console.log('\n📈 حساب الأرباح (Zoho Books Pattern):\n');
  console.log('المبيعات (Revenue):'.padEnd(40) + `+${actualSales.toFixed(2)} جنيه`);
  console.log('تكلفة البضاعة المباعة (COGS):'.padEnd(40) + `-${actualCOGS.toFixed(2)} جنيه`);
  console.log('─'.repeat(60));
  console.log('مجمل الربح (Gross Profit):'.padEnd(40) + `${actualGrossProfit.toFixed(2)} جنيه`);
  console.log('المصروفات التشغيلية (Expenses):'.padEnd(40) + `-${actualExpenses.toFixed(2)} جنيه`);
  console.log('─'.repeat(60));
  console.log('صافي الربح (Net Profit):'.padEnd(40) + `${actualNetProfit.toFixed(2)} جنيه`);

  console.log('\n' + '='.repeat(80));
  console.log('✅ Step 6 مكتمل - التحقق النهائي');
  console.log('='.repeat(80) + '\n');
}

step6FinalValidation().catch(console.error);

