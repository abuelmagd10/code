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

async function verifyFinancialReport() {
  console.log('\n' + '='.repeat(80));
  console.log('🔍 التحقق من التقرير المالي - VitaSlims');
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

  // 1. Check Capital (رأس المال)
  console.log('1️⃣ رأس المال المبدئي:');
  const { data: capitalEntries } = await supabase
    .from('journal_entry_lines')
    .select('debit_amount, credit_amount, journal_entries!inner(company_id, entry_date), chart_of_accounts!inner(account_code, account_name)')
    .eq('journal_entries.company_id', company.id)
    .eq('chart_of_accounts.account_code', '3000'); // Capital account

  let capitalCredit = 0;
  for (const line of capitalEntries || []) {
    capitalCredit += (line.credit_amount || 0) - (line.debit_amount || 0);
  }
  console.log(`   رأس المال: ${capitalCredit.toFixed(2)} جنيه`);
  console.log('');

  // 2. Check Purchases (المشتريات)
  console.log('2️⃣ المشتريات:');
  const { data: bills } = await supabase
    .from('bills')
    .select('id, bill_number, total_amount, status')
    .eq('company_id', company.id)
    .order('bill_number');

  let totalPurchases = 0;
  let billCount = 0;
  for (const bill of bills || []) {
    totalPurchases += bill.total_amount || 0;
    billCount++;
  }
  console.log(`   إجمالي المشتريات: ${totalPurchases.toFixed(2)} جنيه`);
  console.log(`   عدد الفواتير: ${billCount}`);
  console.log('');

  // 3. Check Expenses (المصروفات)
  console.log('3️⃣ المصروفات:');
  const { data: expenseLines } = await supabase
    .from('journal_entry_lines')
    .select('debit_amount, credit_amount, journal_entries!inner(company_id), chart_of_accounts!inner(account_code, account_name)')
    .eq('journal_entries.company_id', company.id)
    .like('chart_of_accounts.account_code', '5%'); // Expense accounts start with 5

  const expensesByAccount = {};
  let totalExpenses = 0;
  for (const line of expenseLines || []) {
    const accountName = line.chart_of_accounts.account_name;
    const amount = line.debit_amount || 0;
    if (!expensesByAccount[accountName]) {
      expensesByAccount[accountName] = 0;
    }
    expensesByAccount[accountName] += amount;
    totalExpenses += amount;
  }

  console.log('   تفصيل المصروفات:');
  for (const [account, amount] of Object.entries(expensesByAccount)) {
    console.log(`   - ${account}: ${amount.toFixed(2)} جنيه`);
  }
  console.log(`   إجمالي المصروفات: ${totalExpenses.toFixed(2)} جنيه`);
  console.log('');

  // 4. Check Write-offs (الإهلاك)
  console.log('4️⃣ إهلاك المخزون:');
  const { data: writeOffs } = await supabase
    .from('inventory_write_offs')
    .select('*')
    .eq('company_id', company.id)
    .eq('status', 'approved');

  let totalWriteOffs = 0;
  for (const wo of writeOffs || []) {
    totalWriteOffs += wo.total_cost || 0;
  }
  console.log(`   إجمالي الإهلاك: ${totalWriteOffs.toFixed(2)} جنيه`);
  console.log('');

  // 5. Check Sales (المبيعات)
  console.log('5️⃣ المبيعات:');
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, total_amount, status')
    .eq('company_id', company.id)
    .order('invoice_number');

  let totalSales = 0;
  let paidSales = 0;
  let pendingSales = 0;
  let paidCount = 0;
  let pendingCount = 0;

  for (const inv of invoices || []) {
    totalSales += inv.total_amount || 0;
    if (inv.status === 'paid') {
      paidSales += inv.total_amount || 0;
      paidCount++;
    } else if (inv.status === 'sent' || inv.status === 'draft' || inv.status === 'partially_paid') {
      pendingSales += inv.total_amount || 0;
      pendingCount++;
    }
  }
  console.log(`   إجمالي المبيعات: ${totalSales.toFixed(2)} جنيه`);
  console.log(`   المبيعات المدفوعة: ${paidSales.toFixed(2)} جنيه (${paidCount} فاتورة)`);
  console.log(`   المبيعات المعلقة: ${pendingSales.toFixed(2)} جنيه (${pendingCount} فاتورة)`);
  console.log('');

  // 6. Check COGS (تكلفة البضاعة المباعة)
  console.log('6️⃣ تكلفة البضاعة المباعة (COGS):');
  const { data: cogsEntries } = await supabase
    .from('journal_entry_lines')
    .select('debit_amount, credit_amount, journal_entries!inner(company_id), chart_of_accounts!inner(account_code, account_name)')
    .eq('journal_entries.company_id', company.id)
    .eq('chart_of_accounts.account_code', '4100'); // COGS account

  let totalCOGS = 0;
  for (const line of cogsEntries || []) {
    totalCOGS += line.debit_amount || 0;
  }
  console.log(`   تكلفة البضاعة المباعة: ${totalCOGS.toFixed(2)} جنيه`);
  console.log('');

  // 7. Calculate Profit
  console.log('='.repeat(80));
  console.log('📊 حساب الأرباح:');
  console.log('='.repeat(80));
  const grossProfit = paidSales - totalCOGS;
  const netProfit = grossProfit - totalExpenses;

  console.log(`المبيعات المدفوعة:           +${paidSales.toFixed(2)} جنيه`);
  console.log(`تكلفة البضاعة المباعة:       -${totalCOGS.toFixed(2)} جنيه`);
  console.log(`                              ${'='.repeat(30)}`);
  console.log(`مجمل الربح:                  ${grossProfit.toFixed(2)} جنيه`);
  console.log(`المصروفات التشغيلية:         -${totalExpenses.toFixed(2)} جنيه`);
  console.log(`                              ${'='.repeat(30)}`);
  console.log(`صافي الربح:                  ${netProfit.toFixed(2)} جنيه`);
  console.log('');

  console.log('='.repeat(80));
  console.log('✅ اكتمل التحقق');
  console.log('='.repeat(80) + '\n');
}

verifyFinancialReport().catch(console.error);

