// =====================================================
// فحص القيود المحاسبية غير المتوازنة
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

async function checkUnbalancedJournals() {
  console.log('\n🔍 فحص القيود المحاسبية غير المتوازنة\n');
  
  try {
    // جلب جميع القيود المحاسبية
    const { data: journalEntries } = await supabase
      .from('journal_entries')
      .select('id, company_id, reference_type, reference_id, entry_date, description, status')
      .is('deleted_at', null)
      .order('entry_date', { ascending: false });
    
    if (!journalEntries || journalEntries.length === 0) {
      console.log('⚠️ لا توجد قيود محاسبية');
      return;
    }
    
    console.log(`📊 إجمالي القيود المحاسبية: ${journalEntries.length}\n`);
    
    const jeIds = journalEntries.map(je => je.id);
    
    // جلب جميع سطور القيود
    const { data: journalLines } = await supabase
      .from('journal_entry_lines')
      .select('journal_entry_id, account_id, debit_amount, credit_amount, description')
      .in('journal_entry_id', jeIds);
    
    // حساب التوازن لكل قيد
    const entryBalances = new Map();
    
    journalEntries.forEach(je => {
      entryBalances.set(je.id, {
        entry: je,
        total_debit: 0,
        total_credit: 0,
        imbalance: 0,
        line_count: 0
      });
    });
    
    journalLines?.forEach(line => {
      const balance = entryBalances.get(line.journal_entry_id);
      if (balance) {
        balance.total_debit += line.debit_amount || 0;
        balance.total_credit += line.credit_amount || 0;
        balance.line_count++;
        balance.imbalance = Math.abs(balance.total_debit - balance.total_credit);
      }
    });
    
    // فلترة القيود غير المتوازنة
    const unbalancedEntries = Array.from(entryBalances.values())
      .filter(b => b.imbalance > 0.01)
      .sort((a, b) => b.imbalance - a.imbalance);
    
    console.log('='.repeat(80));
    console.log('القيود المحاسبية غير المتوازنة:');
    console.log('='.repeat(80));
    
    if (unbalancedEntries.length === 0) {
      console.log('✅ جميع القيود متوازنة');
    } else {
      console.log(`⚠️ عدد القيود غير المتوازنة: ${unbalancedEntries.length}\n`);
      
      unbalancedEntries.forEach((balance, idx) => {
        const je = balance.entry;
        console.log(`${idx + 1}. قيد ID: ${je.id}`);
        console.log(`   التاريخ: ${je.entry_date}`);
        console.log(`   النوع: ${je.reference_type || 'غير محدد'}`);
        console.log(`   الوصف: ${je.description || 'لا يوجد'}`);
        console.log(`   الحالة: ${je.status || 'غير محدد'}`);
        console.log(`   عدد السطور: ${balance.line_count}`);
        console.log(`   إجمالي المدين: ${balance.total_debit.toFixed(2)}`);
        console.log(`   إجمالي الدائن: ${balance.total_credit.toFixed(2)}`);
        console.log(`   عدم التوازن: ${balance.imbalance.toFixed(2)} ⚠️`);
        console.log('');
      });
      
      const totalImbalance = unbalancedEntries.reduce((sum, b) => sum + b.imbalance, 0);
      console.log(`إجمالي عدم التوازن: ${totalImbalance.toFixed(2)}`);
    }
    
    return unbalancedEntries;
    
  } catch (error) {
    console.error('❌ خطأ:', error);
    return [];
  }
}

async function checkMissingJournals() {
  console.log('\n🔍 فحص القيود المحاسبية المفقودة\n');
  
  try {
    // 1. فحص الفواتير بدون قيود
    const { data: invoices } = await supabase
      .from('invoices')
      .select('id, invoice_number, company_id, status, total_amount')
      .in('status', ['sent', 'paid', 'partially_paid']);
    
    const invoiceIds = invoices?.map(i => i.id) || [];
    
    const { data: invoiceJournals } = await supabase
      .from('journal_entries')
      .select('reference_id')
      .eq('reference_type', 'invoice')
      .in('reference_id', invoiceIds)
      .is('deleted_at', null);
    
    const invoicesWithJournals = new Set(invoiceJournals?.map(j => j.reference_id) || []);
    const invoicesWithoutJournals = invoices?.filter(i => !invoicesWithJournals.has(i.id)) || [];
    
    console.log('='.repeat(80));
    console.log('الفواتير بدون قيود محاسبية:');
    console.log('='.repeat(80));
    
    if (invoicesWithoutJournals.length === 0) {
      console.log('✅ جميع الفواتير لديها قيود محاسبية');
    } else {
      console.log(`⚠️ عدد الفواتير بدون قيود: ${invoicesWithoutJournals.length}\n`);
      invoicesWithoutJournals.forEach((inv, idx) => {
        console.log(`${idx + 1}. ${inv.invoice_number} - المبلغ: ${inv.total_amount} - الحالة: ${inv.status}`);
      });
    }
    
    // 2. فحص فواتير الشراء بدون قيود
    const { data: bills } = await supabase
      .from('bills')
      .select('id, bill_number, company_id, status, total_amount')
      .in('status', ['sent', 'received', 'paid', 'partially_paid']);
    
    const billIds = bills?.map(b => b.id) || [];
    
    const { data: billJournals } = await supabase
      .from('journal_entries')
      .select('reference_id')
      .eq('reference_type', 'bill')
      .in('reference_id', billIds)
      .is('deleted_at', null);
    
    const billsWithJournals = new Set(billJournals?.map(j => j.reference_id) || []);
    const billsWithoutJournals = bills?.filter(b => !billsWithJournals.has(b.id)) || [];
    
    console.log(`\n${'='.repeat(80)}`);
    console.log('فواتير الشراء بدون قيود محاسبية:');
    console.log('='.repeat(80));
    
    if (billsWithoutJournals.length === 0) {
      console.log('✅ جميع فواتير الشراء لديها قيود محاسبية');
    } else {
      console.log(`⚠️ عدد فواتير الشراء بدون قيود: ${billsWithoutJournals.length}\n`);
      billsWithoutJournals.forEach((bill, idx) => {
        console.log(`${idx + 1}. ${bill.bill_number} - المبلغ: ${bill.total_amount} - الحالة: ${bill.status}`);
      });
    }
    
    // 3. فحص المدفوعات بدون قيود
    const { data: payments } = await supabase
      .from('payments')
      .select('id, bill_id, invoice_id, amount, payment_date')
      .not('bill_id', 'is', null)
      .or('invoice_id.is.null');
    
    const paymentIds = payments?.map(p => p.id) || [];
    
    const { data: paymentJournals } = await supabase
      .from('journal_entries')
      .select('reference_id')
      .eq('reference_type', 'bill_payment')
      .in('reference_id', paymentIds)
      .is('deleted_at', null);
    
    const paymentsWithJournals = new Set(paymentJournals?.map(j => j.reference_id) || []);
    const paymentsWithoutJournals = payments?.filter(p => !paymentsWithJournals.has(p.id)) || [];
    
    console.log(`\n${'='.repeat(80)}`);
    console.log('المدفوعات بدون قيود محاسبية:');
    console.log('='.repeat(80));
    
    if (paymentsWithoutJournals.length === 0) {
      console.log('✅ جميع المدفوعات لديها قيود محاسبية');
    } else {
      console.log(`⚠️ عدد المدفوعات بدون قيود: ${paymentsWithoutJournals.length}\n`);
      paymentsWithoutJournals.forEach((pay, idx) => {
        console.log(`${idx + 1}. ID: ${pay.id} - المبلغ: ${pay.amount} - التاريخ: ${pay.payment_date}`);
      });
    }
    
    return {
      invoicesWithoutJournals,
      billsWithoutJournals,
      paymentsWithoutJournals
    };
    
  } catch (error) {
    console.error('❌ خطأ:', error);
    return { invoicesWithoutJournals: [], billsWithoutJournals: [], paymentsWithoutJournals: [] };
  }
}

async function reviewJournalsManually() {
  console.log('\n🔍 مراجعة القيود المحاسبية يدوياً\n');
  
  try {
    // جلب القيود المحاسبية مع تفاصيلها
    const { data: journalEntries } = await supabase
      .from('journal_entries')
      .select('id, company_id, reference_type, reference_id, entry_date, description, status')
      .is('deleted_at', null)
      .order('entry_date', { ascending: false })
      .limit(50); // آخر 50 قيد
    
    if (!journalEntries || journalEntries.length === 0) {
      console.log('⚠️ لا توجد قيود محاسبية');
      return;
    }
    
    const jeIds = journalEntries.map(je => je.id);
    
    // جلب سطور القيود
    const { data: journalLines } = await supabase
      .from('journal_entry_lines')
      .select('journal_entry_id, account_id, debit_amount, credit_amount, description')
      .in('journal_entry_id', jeIds);
    
    // جلب الحسابات
    const accountIds = [...new Set(journalLines?.map(jl => jl.account_id).filter(Boolean) || [])];
    const { data: accounts } = await supabase
      .from('chart_of_accounts')
      .select('id, account_code, account_name, account_type')
      .in('id', accountIds);
    
    const accountsMap = new Map(accounts?.map(a => [a.id, a]) || []);
    
    // جلب الشركات
    const companyIds = [...new Set(journalEntries.map(je => je.company_id).filter(Boolean))];
    const { data: companies } = await supabase
      .from('companies')
      .select('id, name')
      .in('id', companyIds);
    
    const companiesMap = new Map(companies?.map(c => [c.id, c]) || []);
    
    console.log('='.repeat(80));
    console.log('آخر 50 قيد محاسبي للمراجعة:');
    console.log('='.repeat(80));
    
    journalEntries.forEach((je, idx) => {
      const company = companiesMap.get(je.company_id);
      const lines = journalLines?.filter(jl => jl.journal_entry_id === je.id) || [];
      const totalDebit = lines.reduce((sum, l) => sum + (l.debit_amount || 0), 0);
      const totalCredit = lines.reduce((sum, l) => sum + (l.credit_amount || 0), 0);
      const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;
      
      console.log(`\n${idx + 1}. قيد ID: ${je.id}`);
      console.log(`   الشركة: ${company?.name || 'غير معروف'}`);
      console.log(`   التاريخ: ${je.entry_date}`);
      console.log(`   النوع: ${je.reference_type || 'غير محدد'}`);
      console.log(`   الوصف: ${je.description || 'لا يوجد'}`);
      console.log(`   الحالة: ${je.status || 'غير محدد'}`);
      console.log(`   عدد السطور: ${lines.length}`);
      console.log(`   إجمالي المدين: ${totalDebit.toFixed(2)}`);
      console.log(`   إجمالي الدائن: ${totalCredit.toFixed(2)}`);
      console.log(`   ${isBalanced ? '✅ متوازن' : '⚠️ غير متوازن'}`);
      
      if (lines.length > 0) {
        console.log(`   السطور:`);
        lines.forEach((line, lineIdx) => {
          const account = accountsMap.get(line.account_id);
          const accName = account ? `${account.account_code} - ${account.account_name}` : 'غير معروف';
          if (line.debit_amount > 0) {
            console.log(`      ${lineIdx + 1}. Debit: ${line.debit_amount.toFixed(2)} → ${accName}`);
          }
          if (line.credit_amount > 0) {
            console.log(`      ${lineIdx + 1}. Credit: ${line.credit_amount.toFixed(2)} → ${accName}`);
          }
        });
      }
    });
    
  } catch (error) {
    console.error('❌ خطأ:', error);
  }
}

async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('فحص شامل للقيود المحاسبية');
  console.log('='.repeat(80));
  
  const unbalanced = await checkUnbalancedJournals();
  const missing = await checkMissingJournals();
  await reviewJournalsManually();
  
  console.log(`\n${'='.repeat(80)}`);
  console.log('الملخص النهائي:');
  console.log('='.repeat(80));
  console.log(`   القيود غير المتوازنة: ${unbalanced.length}`);
  console.log(`   الفواتير بدون قيود: ${missing.invoicesWithoutJournals.length}`);
  console.log(`   فواتير الشراء بدون قيود: ${missing.billsWithoutJournals.length}`);
  console.log(`   المدفوعات بدون قيود: ${missing.paymentsWithoutJournals.length}`);
}

main();
