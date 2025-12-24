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

async function checkFinancials() {
  console.log('\n' + '='.repeat(80));
  console.log('🔍 التحقق من الأرقام المالية - VitaSlims');
  console.log('='.repeat(80) + '\n');

  // Get VitaSlims company
  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('name', 'VitaSlims')
    .single();

  // 1. Capital
  console.log('1️⃣ رأس المال:');
  const { data: capitalLines } = await supabase
    .from('journal_entry_lines')
    .select('debit, credit, journal_entries!inner(company_id)')
    .eq('account_id', '3000')
    .eq('journal_entries.company_id', company.id);
  
  let capital = 0;
  for (const line of capitalLines || []) {
    capital += (line.credit || 0) - (line.debit || 0);
  }
  console.log(`   ${capital.toFixed(2)} جنيه\n`);

  // 2. Purchases (Bills)
  console.log('2️⃣ المشتريات:');
  const { data: bills } = await supabase
    .from('bills')
    .select('total_amount')
    .eq('company_id', company.id)
    .neq('status', 'cancelled');
  
  const totalPurchases = bills.reduce((sum, b) => sum + (b.total_amount || 0), 0);
  console.log(`   ${totalPurchases.toFixed(2)} جنيه (${bills.length} فاتورة)\n`);

  // 3. Expenses (5xxx accounts)
  console.log('3️⃣ المصروفات:');
  const { data: expenseLines } = await supabase
    .from('journal_entry_lines')
    .select('debit, credit, journal_entries!inner(company_id)')
    .gte('account_id', '5000')
    .lt('account_id', '6000')
    .eq('journal_entries.company_id', company.id);
  
  let totalExpenses = 0;
  for (const line of expenseLines || []) {
    totalExpenses += (line.debit || 0) - (line.credit || 0);
  }
  console.log(`   ${totalExpenses.toFixed(2)} جنيه\n`);

  // 4. Write-offs
  console.log('4️⃣ إهلاك المخزون:');
  const { data: writeOffs } = await supabase
    .from('inventory_write_offs')
    .select('total_cost')
    .eq('company_id', company.id)
    .eq('status', 'approved');
  
  const totalWriteOffs = writeOffs.reduce((sum, w) => sum + (w.total_cost || 0), 0);
  console.log(`   ${totalWriteOffs.toFixed(2)} جنيه\n`);

  // 5. Sales Revenue (4000)
  console.log('5️⃣ المبيعات:');
  const { data: revenueLines } = await supabase
    .from('journal_entry_lines')
    .select('debit, credit, journal_entries!inner(company_id)')
    .eq('account_id', '4000')
    .eq('journal_entries.company_id', company.id);
  
  let totalRevenue = 0;
  for (const line of revenueLines || []) {
    totalRevenue += (line.credit || 0) - (line.debit || 0);
  }
  console.log(`   ${totalRevenue.toFixed(2)} جنيه\n`);

  // 6. COGS (4100)
  console.log('6️⃣ تكلفة البضاعة المباعة (COGS):');
  const { data: cogsLines } = await supabase
    .from('journal_entry_lines')
    .select('debit, credit, journal_entries!inner(company_id)')
    .eq('account_id', '4100')
    .eq('journal_entries.company_id', company.id);
  
  let totalCOGS = 0;
  for (const line of cogsLines || []) {
    totalCOGS += (line.debit || 0) - (line.credit || 0);
  }
  console.log(`   ${totalCOGS.toFixed(2)} جنيه\n`);

  // 7. Calculate Profit
  console.log('='.repeat(80));
  console.log('📊 حساب الأرباح (Zoho Books Pattern):');
  console.log('='.repeat(80));
  
  const grossProfit = totalRevenue - totalCOGS;
  const netProfit = grossProfit - totalExpenses;
  
  console.log(`المبيعات (Revenue):                    +${totalRevenue.toFixed(2)} جنيه`);
  console.log(`تكلفة البضاعة المباعة (COGS):          -${totalCOGS.toFixed(2)} جنيه`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`مجمل الربح (Gross Profit):            ${grossProfit.toFixed(2)} جنيه`);
  console.log(`المصروفات التشغيلية (Expenses):        -${totalExpenses.toFixed(2)} جنيه`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`صافي الربح (Net Profit):              ${netProfit.toFixed(2)} جنيه`);
  console.log('');

  console.log('='.repeat(80));
  console.log('✅ اكتمل التحقق');
  console.log('='.repeat(80) + '\n');
}

checkFinancials().catch(console.error);

