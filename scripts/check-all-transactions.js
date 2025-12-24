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

async function checkAllTransactions() {
  console.log('\n' + '='.repeat(80));
  console.log('🔍 التحقق من جميع المعاملات - VitaSlims');
  console.log('='.repeat(80) + '\n');

  // Get VitaSlims company
  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('name', 'VitaSlims')
    .single();

  // 1. Check Invoices
  console.log('1️⃣ الفواتير (Invoices):');
  const { data: invoices } = await supabase
    .from('invoices')
    .select('invoice_number, total_amount, status, payment_status')
    .eq('company_id', company.id)
    .order('invoice_number');
  
  let totalInvoices = 0;
  let paidInvoices = 0;
  let unpaidInvoices = 0;
  let paidCount = 0;
  let unpaidCount = 0;
  
  for (const inv of invoices || []) {
    totalInvoices += inv.total_amount || 0;
    if (inv.payment_status === 'paid') {
      paidInvoices += inv.total_amount || 0;
      paidCount++;
    } else {
      unpaidInvoices += inv.total_amount || 0;
      unpaidCount++;
    }
  }
  
  console.log(`   إجمالي الفواتير: ${totalInvoices.toFixed(2)} جنيه (${(invoices || []).length} فاتورة)`);
  console.log(`   المدفوعة: ${paidInvoices.toFixed(2)} جنيه (${paidCount} فاتورة)`);
  console.log(`   المعلقة: ${unpaidInvoices.toFixed(2)} جنيه (${unpaidCount} فاتورة)`);
  console.log('');

  // 2. Check Bills
  console.log('2️⃣ فواتير الشراء (Bills):');
  const { data: bills } = await supabase
    .from('bills')
    .select('bill_number, total_amount, status, payment_status')
    .eq('company_id', company.id)
    .order('bill_number');

  let totalBills = 0;
  let paidBills = 0;
  let unpaidBills = 0;
  let paidBillsCount = 0;
  let unpaidBillsCount = 0;

  for (const bill of bills || []) {
    totalBills += bill.total_amount || 0;
    if (bill.payment_status === 'paid') {
      paidBills += bill.total_amount || 0;
      paidBillsCount++;
    } else {
      unpaidBills += bill.total_amount || 0;
      unpaidBillsCount++;
    }
  }

  console.log(`   إجمالي فواتير الشراء: ${totalBills.toFixed(2)} جنيه (${(bills || []).length} فاتورة)`);
  console.log(`   المدفوعة: ${paidBills.toFixed(2)} جنيه (${paidBillsCount} فاتورة)`);
  console.log(`   المعلقة: ${unpaidBills.toFixed(2)} جنيه (${unpaidBillsCount} فاتورة)`);
  console.log('');

  // 3. Check Expenses
  console.log('3️⃣ المصروفات (Expenses):');
  const { data: expenses } = await supabase
    .from('expenses')
    .select('expense_number, amount, category, status')
    .eq('company_id', company.id)
    .order('expense_number');

  let totalExpenses = 0;
  const expensesByCategory = {};

  for (const exp of expenses || []) {
    totalExpenses += exp.amount || 0;
    const category = exp.category || 'غير مصنف';
    if (!expensesByCategory[category]) {
      expensesByCategory[category] = 0;
    }
    expensesByCategory[category] += exp.amount || 0;
  }

  console.log(`   إجمالي المصروفات: ${totalExpenses.toFixed(2)} جنيه (${(expenses || []).length} مصروف)`);
  if (Object.keys(expensesByCategory).length > 0) {
    console.log('   تفصيل المصروفات:');
    for (const [category, amount] of Object.entries(expensesByCategory)) {
      console.log(`   - ${category}: ${amount.toFixed(2)} جنيه`);
    }
  }
  console.log('');

  // 4. Check Payments
  console.log('4️⃣ المدفوعات (Payments):');
  const { data: payments } = await supabase
    .from('payments')
    .select('payment_number, amount, payment_type')
    .eq('company_id', company.id)
    .order('payment_number');

  let totalPayments = 0;
  let receivedPayments = 0;
  let madePayments = 0;

  for (const payment of payments || []) {
    totalPayments += payment.amount || 0;
    if (payment.payment_type === 'received') {
      receivedPayments += payment.amount || 0;
    } else if (payment.payment_type === 'made') {
      madePayments += payment.amount || 0;
    }
  }

  console.log(`   إجمالي المدفوعات: ${totalPayments.toFixed(2)} جنيه (${(payments || []).length} دفعة)`);
  console.log(`   المقبوضات: ${receivedPayments.toFixed(2)} جنيه`);
  console.log(`   المدفوعات: ${madePayments.toFixed(2)} جنيه`);
  console.log('');

  console.log('='.repeat(80));
  console.log('✅ اكتمل التحقق');
  console.log('='.repeat(80) + '\n');
}

checkAllTransactions().catch(console.error);

