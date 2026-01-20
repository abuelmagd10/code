/**
 * اختبارات إقفال الفترات المحاسبية
 * Period Closing Hard Validation Tests
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hfvsbsizokxontflgdyn.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Helper function to create test journal entry
async function createTestJournalEntry(companyId, entryDate, description, lines) {
  const { data: entry, error: entryError } = await supabase
    .from('journal_entries')
    .insert({
      company_id: companyId,
      entry_date: entryDate,
      description: description,
      reference_type: 'manual_entry',
      status: 'posted'
    })
    .select()
    .single();

  if (entryError) throw entryError;

  const entryLines = lines.map(line => ({
    journal_entry_id: entry.id,
    account_id: line.account_id,
    debit_amount: line.debit || 0,
    credit_amount: line.credit || 0,
    description: line.description || ''
  }));

  const { error: linesError } = await supabase
    .from('journal_entry_lines')
    .insert(entryLines);

  if (linesError) throw linesError;

  return entry.id;
}

// Get account IDs
async function getAccountIds(companyId) {
  const { data: accounts } = await supabase
    .from('chart_of_accounts')
    .select('id, account_code, account_name, account_type, sub_type')
    .eq('company_id', companyId)
    .eq('is_active', true);

  const findAccount = (code, subType) => {
    return accounts?.find(acc => 
      (code && acc.account_code === code) || 
      (subType && acc.sub_type === subType)
    )?.id;
  };

  return {
    income: findAccount('4100', 'sales_revenue') || findAccount(null, 'sales_revenue'),
    expense: findAccount('5000', 'cogs') || findAccount('5500'),
    retainedEarnings: findAccount('3200', 'retained_earnings'),
    incomeSummary: findAccount('3300', 'income_summary')
  };
}

// Calculate account balance
async function calculateAccountBalance(companyId, accountId, asOfDate) {
  const { data: entries } = await supabase
    .from('journal_entries')
    .select('id')
    .eq('company_id', companyId)
    .lte('entry_date', asOfDate)
    .is('deleted_at', null);

  if (!entries || entries.length === 0) return 0;

  const { data: lines } = await supabase
    .from('journal_entry_lines')
    .select('debit_amount, credit_amount')
    .eq('account_id', accountId)
    .in('journal_entry_id', entries.map(e => e.id));

  const { data: account } = await supabase
    .from('chart_of_accounts')
    .select('account_type, normal_balance, opening_balance')
    .eq('id', accountId)
    .single();

  let balance = Number(account?.opening_balance || 0);
  
  for (const line of lines || []) {
    const debit = Number(line.debit_amount || 0);
    const credit = Number(line.credit_amount || 0);
    
    if (account?.account_type === 'asset' || account?.account_type === 'expense') {
      balance += debit - credit;
    } else {
      balance += credit - debit;
    }
  }

  return balance;
}

// Test A: Profit
async function testA_Profit(companyId, userId) {
  console.log('\n📊 Test A: إقفال فترة بربح\n');
  console.log('البيانات:');
  console.log('  الفترة: 2026-01-01 إلى 2026-01-31');
  console.log('  الإيرادات: 10,000');
  console.log('  المصروفات: 7,000');
  console.log('  صافي الربح المتوقع: 3,000\n');

  const accountIds = await getAccountIds(companyId);
  
  if (!accountIds.income || !accountIds.expense) {
    console.log('❌ خطأ: حساب الإيرادات أو المصروفات غير موجود');
    return false;
  }

  // إنشاء قيود تجريبية
  console.log('1. إنشاء قيود تجريبية...');
  
  // قيد إيراد
  await createTestJournalEntry(
    companyId,
    '2026-01-15',
    'إيراد تجريبي للاختبار',
    [
      { account_id: accountIds.income, credit: 10000, description: 'إيراد' },
      { account_id: accountIds.retainedEarnings || accountIds.incomeSummary || '1110', debit: 10000, description: 'نقد' }
    ]
  );

  // قيد مصروف
  await createTestJournalEntry(
    companyId,
    '2026-01-20',
    'مصروف تجريبي للاختبار',
    [
      { account_id: accountIds.expense, debit: 7000, description: 'مصروف' },
      { account_id: accountIds.retainedEarnings || accountIds.incomeSummary || '1110', credit: 7000, description: 'نقد' }
    ]
  );

  console.log('   ✅ تم إنشاء القيود\n');

  // إقفال الفترة
  console.log('2. إقفال الفترة...');
  
  const { createPeriodClosingEntry } = require('../lib/period-closing');
  const result = await createPeriodClosingEntry(supabase, {
    companyId,
    periodStart: '2026-01-01',
    periodEnd: '2026-01-31',
    closedByUserId: userId,
    periodName: 'يناير 2026'
  });

  if (!result.success) {
    console.log(`   ❌ فشل إقفال الفترة: ${result.error}`);
    return false;
  }

  console.log(`   ✅ تم إقفال الفترة`);
  console.log(`   Journal Entry ID: ${result.journalEntryId}`);
  console.log(`   صافي الربح: ${result.netIncome}\n`);

  // التحقق من القيد
  console.log('3. التحقق من قيد الإقفال...');
  
  const { data: closingEntry } = await supabase
    .from('journal_entries')
    .select('id, description, reference_type')
    .eq('id', result.journalEntryId)
    .single();

  if (closingEntry?.reference_type !== 'period_closing') {
    console.log(`   ❌ نوع القيد غير صحيح: ${closingEntry?.reference_type}`);
    return false;
  }

  console.log(`   ✅ نوع القيد صحيح: ${closingEntry.reference_type}`);

  // التحقق من سطور القيد
  const { data: closingLines } = await supabase
    .from('journal_entry_lines')
    .select('account_id, debit_amount, credit_amount, chart_of_accounts!inner(account_code, account_name)')
    .eq('journal_entry_id', result.journalEntryId);

  console.log('\n   سطور القيد:');
  for (const line of closingLines || []) {
    const acc = line.chart_of_accounts;
    console.log(`      ${acc.account_code} - ${acc.account_name}: Dr ${line.debit_amount}, Cr ${line.credit_amount}`);
  }

  // التحقق من أرصدة الحسابات
  console.log('\n4. التحقق من الأرصدة...');
  
  const retainedEarningsBalance = await calculateAccountBalance(companyId, accountIds.retainedEarnings, '2026-01-31');
  const incomeSummaryBalance = accountIds.incomeSummary 
    ? await calculateAccountBalance(companyId, accountIds.incomeSummary, '2026-01-31')
    : 0;

  console.log(`   الأرباح المحتجزة: ${retainedEarningsBalance}`);
  console.log(`   Income Summary: ${incomeSummaryBalance}`);

  if (Math.abs(retainedEarningsBalance - 3000) > 0.01) {
    console.log(`   ❌ رصيد الأرباح المحتجزة غير صحيح. المتوقع: 3000, الفعلي: ${retainedEarningsBalance}`);
    return false;
  }

  console.log('   ✅ جميع الأرصدة صحيحة\n');

  return true;
}

// Test B: Loss
async function testB_Loss(companyId, userId) {
  console.log('\n📊 Test B: إقفال فترة بخسارة\n');
  console.log('البيانات:');
  console.log('  الفترة: 2026-02-01 إلى 2026-02-28');
  console.log('  الإيرادات: 5,000');
  console.log('  المصروفات: 8,000');
  console.log('  صافي الخسارة المتوقع: -3,000\n');

  const accountIds = await getAccountIds(companyId);
  
  // إنشاء قيود تجريبية
  console.log('1. إنشاء قيود تجريبية...');
  
  // قيد إيراد
  await createTestJournalEntry(
    companyId,
    '2026-02-15',
    'إيراد تجريبي للاختبار',
    [
      { account_id: accountIds.income, credit: 5000, description: 'إيراد' },
      { account_id: accountIds.retainedEarnings || accountIds.incomeSummary || '1110', debit: 5000, description: 'نقد' }
    ]
  );

  // قيد مصروف
  await createTestJournalEntry(
    companyId,
    '2026-02-20',
    'مصروف تجريبي للاختبار',
    [
      { account_id: accountIds.expense, debit: 8000, description: 'مصروف' },
      { account_id: accountIds.retainedEarnings || accountIds.incomeSummary || '1110', credit: 8000, description: 'نقد' }
    ]
  );

  console.log('   ✅ تم إنشاء القيود\n');

  // إقفال الفترة
  console.log('2. إقفال الفترة...');
  
  const { createPeriodClosingEntry } = require('../lib/period-closing');
  const result = await createPeriodClosingEntry(supabase, {
    companyId,
    periodStart: '2026-02-01',
    periodEnd: '2026-02-28',
    closedByUserId: userId,
    periodName: 'فبراير 2026'
  });

  if (!result.success) {
    console.log(`   ❌ فشل إقفال الفترة: ${result.error}`);
    return false;
  }

  console.log(`   ✅ تم إقفال الفترة`);
  console.log(`   صافي الربح: ${result.netIncome} (خسارة)\n`);

  // التحقق من سطور القيد
  const { data: closingLines } = await supabase
    .from('journal_entry_lines')
    .select('account_id, debit_amount, credit_amount, chart_of_accounts!inner(account_code, account_name)')
    .eq('journal_entry_id', result.journalEntryId);

  console.log('3. التحقق من سطور القيد (يجب أن يكون Dr للأرباح المحتجزة)...');
  for (const line of closingLines || []) {
    const acc = line.chart_of_accounts;
    if (acc.account_code === '3200') {
      if (line.debit_amount !== 3000) {
        console.log(`   ❌ المبلغ غير صحيح. المتوقع: 3000, الفعلي: ${line.debit_amount}`);
        return false;
      }
      console.log(`   ✅ Dr للأرباح المحتجزة: ${line.debit_amount}`);
    }
  }

  console.log('   ✅ القيد صحيح\n');
  return true;
}

// Test C: Prevent Duplicate Closing
async function testC_PreventDuplicate(companyId, userId) {
  console.log('\n📊 Test C: منع إعادة إقفال نفس الفترة\n');

  // محاولة إقفال نفس الفترة مرة أخرى
  console.log('1. محاولة إقفال نفس الفترة مرة أخرى...');
  
  const { createPeriodClosingEntry } = require('../lib/period-closing');
  const result = await createPeriodClosingEntry(supabase, {
    companyId,
    periodStart: '2026-01-01',
    periodEnd: '2026-01-31',
    closedByUserId: userId,
    periodName: 'يناير 2026'
  });

  if (result.success) {
    console.log('   ❌ تم إقفال الفترة مرة أخرى (غير متوقع!)');
    return false;
  }

  console.log(`   ✅ تم منع إعادة الإقفال: ${result.error}\n`);

  // التحقق من عدم وجود قيود جديدة
  const { data: entries } = await supabase
    .from('journal_entries')
    .select('id, description, created_at')
    .eq('company_id', companyId)
    .eq('reference_type', 'period_closing')
    .eq('description', 'إقفال الفترة المحاسبية: يناير 2026')
    .order('created_at', { ascending: false })
    .limit(2);

  if (entries && entries.length > 1) {
    const timeDiff = new Date(entries[0].created_at) - new Date(entries[1].created_at);
    if (timeDiff < 5000) { // أقل من 5 ثواني
      console.log('   ❌ تم إنشاء قيد جديد (غير متوقع!)');
      return false;
    }
  }

  console.log('   ✅ لم يتم إنشاء قيود جديدة\n');
  return true;
}

// Main test runner
async function runTests() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('   اختبارات إقفال الفترات المحاسبية');
  console.log('   Period Closing Hard Validation Tests');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    // Get test company and user
    const { data: companies } = await supabase
      .from('companies')
      .select('id, name')
      .limit(1);

    if (!companies || companies.length === 0) {
      console.log('❌ لا توجد شركات في النظام');
      return;
    }

    const companyId = companies[0].id;
    console.log(`📄 الشركة: ${companies[0].name} (${companyId})\n`);

    // Get user (use first user or create test user)
    const { data: users } = await supabase.auth.admin.listUsers();
    const userId = users?.users[0]?.id || '00000000-0000-0000-0000-000000000000';

    // Run tests
    const testA = await testA_Profit(companyId, userId);
    const testB = await testB_Loss(companyId, userId);
    const testC = await testC_PreventDuplicate(companyId, userId);

    // Summary
    console.log('═══════════════════════════════════════════════════════');
    console.log('   ملخص النتائج');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Test A (ربح): ${testA ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Test B (خسارة): ${testB ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Test C (منع التكرار): ${testC ? '✅ PASS' : '❌ FAIL'}`);
    console.log('═══════════════════════════════════════════════════════\n');

    if (testA && testB && testC) {
      console.log('✅ جميع الاختبارات نجحت!');
      process.exit(0);
    } else {
      console.log('❌ بعض الاختبارات فشلت');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ خطأ في الاختبارات:', error);
    process.exit(1);
  }
}

runTests();
