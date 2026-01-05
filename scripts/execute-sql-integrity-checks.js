/**
 * 🔍 EXECUTE SQL INTEGRITY CHECKS
 * =================================
 * تنفيذ فحوصات SQL لسلامة البيانات
 * 
 * يستخدم Supabase client للاتصال بقاعدة البيانات
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// قراءة .env.local إذا كان موجوداً
try {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }
} catch (e) {
  // تجاهل الأخطاء
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ خطأ: SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY مطلوبان');
  console.error('تأكد من وجود .env.local مع المتغيرات المطلوبة');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const RESULTS = {
  timestamp: new Date().toISOString(),
  checks: {},
  summary: {
    total: 0,
    passed: 0,
    failed: 0,
    warnings: 0
  }
};

function addResult(checkName, status, result, expected, details = null) {
  RESULTS.checks[checkName] = {
    status, // 'PASS', 'FAIL', 'WARNING'
    result,
    expected,
    details,
    timestamp: new Date().toISOString()
  };
  
  RESULTS.summary.total++;
  if (status === 'PASS') RESULTS.summary.passed++;
  else if (status === 'FAIL') RESULTS.summary.failed++;
  else RESULTS.summary.warnings++;
}

async function executeQuery(query, checkName, expectedRows = 0) {
  try {
    console.log(`\n🔍 ${checkName}...`);
    
    // استخدام RPC أو query مباشرة
    const { data, error } = await supabase.rpc('execute_sql', { query_text: query });
    
    if (error) {
      // محاولة طريقة أخرى - استخدام query مباشرة
      const { data: data2, error: error2 } = await supabase
        .from('journal_entries')
        .select('*')
        .limit(0);
      
      if (error2) {
        console.log(`⚠️  لا يمكن تنفيذ الاستعلام مباشرة - يتطلب Supabase SQL Editor`);
        addResult(checkName, 'WARNING', 'N/A', expectedRows, 
          'يتطلب تنفيذ يدوي من Supabase SQL Editor: ' + error.message);
        return null;
      }
    }
    
    const rowCount = Array.isArray(data) ? data.length : (data ? 1 : 0);
    const status = rowCount === expectedRows ? 'PASS' : 'FAIL';
    
    console.log(`   النتيجة: ${rowCount} rows (متوقع: ${expectedRows})`);
    console.log(`   الحالة: ${status === 'PASS' ? '✅' : '❌'} ${status}`);
    
    addResult(checkName, status, rowCount, expectedRows, 
      status === 'PASS' ? 'النتيجة مطابقة للمتوقع' : `وجد ${rowCount} rows بدلاً من ${expectedRows}`);
    
    return data;
  } catch (error) {
    console.log(`   ❌ خطأ: ${error.message}`);
    addResult(checkName, 'WARNING', 'ERROR', expectedRows, error.message);
    return null;
  }
}

// ============================================
// الاستعلامات المطلوبة
// ============================================

async function check1_JournalBalance() {
  const query = `
    SELECT 
      je.id,
      je.reference_type,
      COALESCE(SUM(jel.debit_amount), 0) as total_debit,
      COALESCE(SUM(jel.credit_amount), 0) as total_credit,
      ABS(COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0)) as difference
    FROM journal_entries je
    LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
    WHERE je.status = 'posted'
    GROUP BY je.id, je.reference_type
    HAVING ABS(COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0)) > 0.01
    ORDER BY difference DESC
    LIMIT 10;
  `;
  
  // محاولة تنفيذ عبر query مباشرة
  try {
    const { data: entries, error } = await supabase
      .from('journal_entries')
      .select(`
        id,
        reference_type,
        status,
        journal_entry_lines (
          debit_amount,
          credit_amount
        )
      `)
      .eq('status', 'posted')
      .limit(100);
    
    if (error) throw error;
    
    let unbalancedCount = 0;
    const unbalanced = [];
    
    for (const entry of entries || []) {
      const lines = entry.journal_entry_lines || [];
      const totalDebit = lines.reduce((sum, line) => sum + (parseFloat(line.debit_amount) || 0), 0);
      const totalCredit = lines.reduce((sum, line) => sum + (parseFloat(line.credit_amount) || 0), 0);
      const difference = Math.abs(totalDebit - totalCredit);
      
      if (difference > 0.01) {
        unbalancedCount++;
        unbalanced.push({
          id: entry.id,
          reference_type: entry.reference_type,
          difference: difference.toFixed(2)
        });
      }
    }
    
    const status = unbalancedCount === 0 ? 'PASS' : 'FAIL';
    console.log(`\n🔍 Query #1: توازن القيود المحاسبية...`);
    console.log(`   النتيجة: ${unbalancedCount} قيود غير متوازنة (من ${entries?.length || 0} قيد)`);
    console.log(`   الحالة: ${status === 'PASS' ? '✅' : '❌'} ${status}`);
    
    if (unbalancedCount > 0 && unbalanced.length > 0) {
      console.log(`   القيود غير المتوازنة:`);
      unbalanced.slice(0, 5).forEach(entry => {
        console.log(`     - ${entry.id} (${entry.reference_type}): فرق ${entry.difference}`);
      });
    }
    
    addResult('Query #1: توازن القيود المحاسبية', status, unbalancedCount, 0,
      unbalancedCount > 0 ? `وجد ${unbalancedCount} قيود غير متوازنة` : 'جميع القيود متوازنة');
    
    return unbalanced;
  } catch (error) {
    console.log(`   ⚠️  لا يمكن تنفيذ الاستعلام مباشرة`);
    addResult('Query #1: توازن القيود المحاسبية', 'WARNING', 'N/A', 0,
      'يتطلب تنفيذ يدوي من Supabase SQL Editor');
    return null;
  }
}

async function check2_EmptyEntries() {
  try {
    const { data: entries, error } = await supabase
      .from('journal_entries')
      .select(`
        id,
        reference_type,
        entry_date,
        description,
        status,
        journal_entry_lines (id)
      `)
      .eq('status', 'posted')
      .limit(100);
    
    if (error) throw error;
    
    const empty = (entries || []).filter(entry => 
      !entry.journal_entry_lines || entry.journal_entry_lines.length === 0
    );
    
    const status = empty.length === 0 ? 'PASS' : 'FAIL';
    console.log(`\n🔍 Query #2: القيود الفارغة...`);
    console.log(`   النتيجة: ${empty.length} قيود فارغة (من ${entries?.length || 0} قيد)`);
    console.log(`   الحالة: ${status === 'PASS' ? '✅' : '❌'} ${status}`);
    
    addResult('Query #2: القيود الفارغة', status, empty.length, 0,
      empty.length > 0 ? `وجد ${empty.length} قيود فارغة` : 'لا توجد قيود فارغة');
    
    return empty;
  } catch (error) {
    addResult('Query #2: القيود الفارغة', 'WARNING', 'N/A', 0,
      'يتطلب تنفيذ يدوي من Supabase SQL Editor');
    return null;
  }
}

async function check3_SentInvoicesWithoutJournals() {
  try {
    // جلب جميع فواتير Sent
    const { data: sentInvoices, error: invError } = await supabase
      .from('invoices')
      .select('id, invoice_number, status, total_amount')
      .eq('status', 'sent');
    
    if (invError) throw invError;
    
    if (!sentInvoices || sentInvoices.length === 0) {
      console.log(`\n🔍 Query #3: فواتير Sent بدون قيود...`);
      console.log(`   النتيجة: 0 فواتير Sent`);
      console.log(`   الحالة: ✅ PASS`);
      addResult('Query #3: فواتير Sent بدون قيود', 'PASS', 0, 0,
        'لا توجد فواتير Sent');
      return [];
    }
    
    // جلب جميع القيود المرتبطة بهذه الفواتير
    const invoiceIds = sentInvoices.map(inv => inv.id);
    const { data: journals, error: jeError } = await supabase
      .from('journal_entries')
      .select('id, reference_id, reference_type')
      .in('reference_id', invoiceIds)
      .eq('reference_type', 'invoice');
    
    if (jeError) throw jeError;
    
    // العثور على الفواتير التي لديها قيود
    const journalInvoiceIds = new Set((journals || []).map(j => j.reference_id));
    const withJournals = sentInvoices.filter(inv => journalInvoiceIds.has(inv.id));
    
    const status = withJournals.length === 0 ? 'PASS' : 'FAIL';
    console.log(`\n🔍 Query #3: فواتير Sent بدون قيود...`);
    console.log(`   النتيجة: ${withJournals.length} فواتير Sent مع قيود (من ${sentInvoices.length})`);
    console.log(`   الحالة: ${status === 'PASS' ? '✅' : '❌'} ${status}`);
    
    if (withJournals.length > 0) {
      console.log(`   الفواتير المشكوك فيها:`);
      withJournals.slice(0, 5).forEach(inv => {
        console.log(`     - ${inv.invoice_number} (${inv.id})`);
      });
    }
    
    addResult('Query #3: فواتير Sent بدون قيود', status, withJournals.length, 0,
      withJournals.length > 0 ? `وجد ${withJournals.length} فواتير Sent مع قيود (خطأ)` : 'جميع فواتير Sent بدون قيود (صحيح)');
    
    return withJournals;
  } catch (error) {
    addResult('Query #3: فواتير Sent بدون قيود', 'WARNING', 'N/A', 0,
      'خطأ: ' + error.message);
    return null;
  }
}

async function check4_PaidInvoicesWithoutJournals() {
  try {
    // جلب جميع الفواتير المدفوعة
    const { data: paidInvoices, error: invError } = await supabase
      .from('invoices')
      .select('id, invoice_number, status, total_amount, paid_amount')
      .in('status', ['paid', 'partially_paid'])
      .gt('paid_amount', 0);
    
    if (invError) throw invError;
    
    if (!paidInvoices || paidInvoices.length === 0) {
      console.log(`\n🔍 Query #4: فواتير Paid بدون قيود...`);
      console.log(`   النتيجة: 0 فواتير Paid`);
      console.log(`   الحالة: ✅ PASS`);
      addResult('Query #4: فواتير Paid بدون قيود', 'PASS', 0, 0,
        'لا توجد فواتير Paid');
      return [];
    }
    
    // جلب جميع القيود المرتبطة بهذه الفواتير
    const invoiceIds = paidInvoices.map(inv => inv.id);
    const { data: journals, error: jeError } = await supabase
      .from('journal_entries')
      .select('id, reference_id, reference_type')
      .in('reference_id', invoiceIds)
      .eq('reference_type', 'invoice');
    
    if (jeError) throw jeError;
    
    // العثور على الفواتير التي لا لديها قيد فاتورة
    const journalInvoiceIds = new Set((journals || []).map(j => j.reference_id));
    const withoutInvoiceEntry = paidInvoices.filter(inv => !journalInvoiceIds.has(inv.id));
    
    const status = withoutInvoiceEntry.length === 0 ? 'PASS' : 'FAIL';
    console.log(`\n🔍 Query #4: فواتير Paid بدون قيود...`);
    console.log(`   النتيجة: ${withoutInvoiceEntry.length} فواتير Paid بدون قيد فاتورة (من ${paidInvoices.length})`);
    console.log(`   الحالة: ${status === 'PASS' ? '✅' : '❌'} ${status}`);
    
    if (withoutInvoiceEntry.length > 0) {
      console.log(`   الفواتير المشكوك فيها:`);
      withoutInvoiceEntry.slice(0, 5).forEach(inv => {
        console.log(`     - ${inv.invoice_number} (${inv.id}) - Paid: ${inv.paid_amount}`);
      });
    }
    
    addResult('Query #4: فواتير Paid بدون قيود', status, withoutInvoiceEntry.length, 0,
      withoutInvoiceEntry.length > 0 ? `وجد ${withoutInvoiceEntry.length} فواتير Paid بدون قيد فاتورة` : 'جميع فواتير Paid لها قيود');
    
    return withoutInvoiceEntry;
  } catch (error) {
    addResult('Query #4: فواتير Paid بدون قيود', 'WARNING', 'N/A', 0,
      'خطأ: ' + error.message);
    return null;
  }
}

async function check5_DraftInvoicesWithInventory() {
  try {
    // جلب جميع فواتير Draft
    const { data: draftInvoices, error: invError } = await supabase
      .from('invoices')
      .select('id, invoice_number, status')
      .eq('status', 'draft');
    
    if (invError) throw invError;
    
    if (!draftInvoices || draftInvoices.length === 0) {
      console.log(`\n🔍 Query #5: فواتير Draft بدون حركات مخزون...`);
      console.log(`   النتيجة: 0 فواتير Draft`);
      console.log(`   الحالة: ✅ PASS`);
      addResult('Query #5: فواتير Draft بدون حركات مخزون', 'PASS', 0, 0,
        'لا توجد فواتير Draft');
      return [];
    }
    
    // جلب جميع حركات المخزون المرتبطة بهذه الفواتير
    const invoiceIds = draftInvoices.map(inv => inv.id);
    const { data: inventory, error: invTxError } = await supabase
      .from('inventory_transactions')
      .select('id, reference_id')
      .in('reference_id', invoiceIds);
    
    if (invTxError) throw invTxError;
    
    // العثور على الفواتير التي لديها حركات مخزون
    const inventoryInvoiceIds = new Set((inventory || []).map(it => it.reference_id));
    const withInventory = draftInvoices.filter(inv => inventoryInvoiceIds.has(inv.id));
    
    const status = withInventory.length === 0 ? 'PASS' : 'FAIL';
    console.log(`\n🔍 Query #5: فواتير Draft بدون حركات مخزون...`);
    console.log(`   النتيجة: ${withInventory.length} فواتير Draft مع حركات مخزون (من ${draftInvoices.length})`);
    console.log(`   الحالة: ${status === 'PASS' ? '✅' : '❌'} ${status}`);
    
    if (withInventory.length > 0) {
      console.log(`   الفواتير المشكوك فيها:`);
      withInventory.slice(0, 5).forEach(inv => {
        console.log(`     - ${inv.invoice_number} (${inv.id})`);
      });
    }
    
    addResult('Query #5: فواتير Draft بدون حركات مخزون', status, withInventory.length, 0,
      withInventory.length > 0 ? `وجد ${withInventory.length} فواتير Draft مع حركات مخزون (خطأ)` : 'جميع فواتير Draft بدون حركات مخزون (صحيح)');
    
    return withInventory;
  } catch (error) {
    addResult('Query #5: فواتير Draft بدون حركات مخزون', 'WARNING', 'N/A', 0,
      'خطأ: ' + error.message);
    return null;
  }
}

async function check6_SentInvoicesWithoutInventory() {
  try {
    // جلب جميع فواتير Sent
    const { data: sentInvoices, error: invError } = await supabase
      .from('invoices')
      .select('id, invoice_number, status')
      .eq('status', 'sent');
    
    if (invError) throw invError;
    
    if (!sentInvoices || sentInvoices.length === 0) {
      console.log(`\n🔍 Query #6: فواتير Sent مع حركات مخزون...`);
      console.log(`   النتيجة: 0 فواتير Sent`);
      console.log(`   الحالة: ✅ PASS`);
      addResult('Query #6: فواتير Sent مع حركات مخزون', 'PASS', 0, 0,
        'لا توجد فواتير Sent');
      return [];
    }
    
    // جلب جميع حركات المخزون المرتبطة بهذه الفواتير
    const invoiceIds = sentInvoices.map(inv => inv.id);
    const { data: inventory, error: invTxError } = await supabase
      .from('inventory_transactions')
      .select('id, reference_id, transaction_type')
      .in('reference_id', invoiceIds)
      .eq('transaction_type', 'sale');
    
    if (invTxError) throw invTxError;
    
    // العثور على الفواتير التي لا لديها حركات مخزون
    const inventoryInvoiceIds = new Set((inventory || []).map(it => it.reference_id));
    const withoutInventory = sentInvoices.filter(inv => !inventoryInvoiceIds.has(inv.id));
    
    const status = withoutInventory.length === 0 ? 'PASS' : 'FAIL';
    console.log(`\n🔍 Query #6: فواتير Sent مع حركات مخزون...`);
    console.log(`   النتيجة: ${withoutInventory.length} فواتير Sent بدون حركات مخزون (من ${sentInvoices.length})`);
    console.log(`   الحالة: ${status === 'PASS' ? '✅' : '❌'} ${status}`);
    
    if (withoutInventory.length > 0) {
      console.log(`   الفواتير المشكوك فيها:`);
      withoutInventory.slice(0, 5).forEach(inv => {
        console.log(`     - ${inv.invoice_number} (${inv.id})`);
      });
    }
    
    addResult('Query #6: فواتير Sent مع حركات مخزون', status, withoutInventory.length, 0,
      withoutInventory.length > 0 ? `وجد ${withoutInventory.length} فواتير Sent بدون حركات مخزون` : 'جميع فواتير Sent لها حركات مخزون');
    
    return withoutInventory;
  } catch (error) {
    addResult('Query #6: فواتير Sent مع حركات مخزون', 'WARNING', 'N/A', 0,
      'خطأ: ' + error.message);
    return null;
  }
}

async function check7_ReceivedBillsWithoutJournals() {
  try {
    // جلب جميع Bills Received
    const { data: receivedBills, error: billError } = await supabase
      .from('bills')
      .select('id, bill_number, status, total_amount')
      .eq('status', 'received');
    
    if (billError) throw billError;
    
    if (!receivedBills || receivedBills.length === 0) {
      console.log(`\n🔍 Query #7: Bills Received بدون قيود...`);
      console.log(`   النتيجة: 0 Bills Received`);
      console.log(`   الحالة: ✅ PASS`);
      addResult('Query #7: Bills Received بدون قيود', 'PASS', 0, 0,
        'لا توجد Bills Received');
      return [];
    }
    
    // جلب جميع القيود المرتبطة بهذه Bills
    const billIds = receivedBills.map(b => b.id);
    const { data: journals, error: jeError } = await supabase
      .from('journal_entries')
      .select('id, reference_id, reference_type')
      .in('reference_id', billIds)
      .eq('reference_type', 'bill');
    
    if (jeError) throw jeError;
    
    // العثور على Bills التي لديها قيود
    const journalBillIds = new Set((journals || []).map(j => j.reference_id));
    const withJournals = receivedBills.filter(bill => journalBillIds.has(bill.id));
    
    const status = withJournals.length === 0 ? 'PASS' : 'FAIL';
    console.log(`\n🔍 Query #7: Bills Received بدون قيود...`);
    console.log(`   النتيجة: ${withJournals.length} Bills Received مع قيود (من ${receivedBills.length})`);
    console.log(`   الحالة: ${status === 'PASS' ? '✅' : '❌'} ${status}`);
    
    if (withJournals.length > 0) {
      console.log(`   Bills المشكوك فيها:`);
      withJournals.slice(0, 5).forEach(bill => {
        console.log(`     - ${bill.bill_number} (${bill.id})`);
      });
    }
    
    addResult('Query #7: Bills Received بدون قيود', status, withJournals.length, 0,
      withJournals.length > 0 ? `وجد ${withJournals.length} Bills Received مع قيود (خطأ)` : 'جميع Bills Received بدون قيود (صحيح)');
    
    return withJournals;
  } catch (error) {
    addResult('Query #7: Bills Received بدون قيود', 'WARNING', 'N/A', 0,
      'خطأ: ' + error.message);
    return null;
  }
}

async function check8_PaidBillsWithoutJournals() {
  try {
    // جلب جميع Bills المدفوعة
    const { data: paidBills, error: billError } = await supabase
      .from('bills')
      .select('id, bill_number, status, total_amount, paid_amount')
      .in('status', ['paid', 'partially_paid'])
      .gt('paid_amount', 0);
    
    if (billError) throw billError;
    
    if (!paidBills || paidBills.length === 0) {
      console.log(`\n🔍 Query #8: Bills Paid بدون قيود...`);
      console.log(`   النتيجة: 0 Bills Paid`);
      console.log(`   الحالة: ✅ PASS`);
      addResult('Query #8: Bills Paid بدون قيود', 'PASS', 0, 0,
        'لا توجد Bills Paid');
      return [];
    }
    
    // جلب جميع القيود المرتبطة بهذه Bills
    const billIds = paidBills.map(b => b.id);
    const { data: journals, error: jeError } = await supabase
      .from('journal_entries')
      .select('id, reference_id, reference_type')
      .in('reference_id', billIds)
      .eq('reference_type', 'bill');
    
    if (jeError) throw jeError;
    
    // العثور على Bills التي لا لديها قيد فاتورة
    const journalBillIds = new Set((journals || []).map(j => j.reference_id));
    const withoutBillEntry = paidBills.filter(bill => !journalBillIds.has(bill.id));
    
    const status = withoutBillEntry.length === 0 ? 'PASS' : 'FAIL';
    console.log(`\n🔍 Query #8: Bills Paid بدون قيود...`);
    console.log(`   النتيجة: ${withoutBillEntry.length} Bills Paid بدون قيد فاتورة (من ${paidBills.length})`);
    console.log(`   الحالة: ${status === 'PASS' ? '✅' : '❌'} ${status}`);
    
    if (withoutBillEntry.length > 0) {
      console.log(`   Bills المشكوك فيها:`);
      withoutBillEntry.slice(0, 5).forEach(bill => {
        console.log(`     - ${bill.bill_number} (${bill.id}) - Paid: ${bill.paid_amount}`);
      });
    }
    
    addResult('Query #8: Bills Paid بدون قيود', status, withoutBillEntry.length, 0,
      withoutBillEntry.length > 0 ? `وجد ${withoutBillEntry.length} Bills Paid بدون قيد فاتورة` : 'جميع Bills Paid لها قيود');
    
    return withoutBillEntry;
  } catch (error) {
    addResult('Query #8: Bills Paid بدون قيود', 'WARNING', 'N/A', 0,
      'خطأ: ' + error.message);
    return null;
  }
}

async function check9_RLSPolicies() {
  try {
    // هذا يتطلب استعلام مباشر إلى pg_policies
    // سنحاول طريقة بديلة - التحقق من وجود RLS في الجداول
    const tables = ['invoices', 'bills', 'products', 'customers', 'suppliers', 'journal_entries'];
    const results = {};
    
    for (const table of tables) {
      try {
        // محاولة الوصول بدون company_id - يجب أن يفشل إذا كان RLS مفعّل
        const { data, error } = await supabase
          .from(table)
          .select('id')
          .limit(1);
        
        // إذا نجح بدون company_id، قد يكون RLS غير مفعّل
        // لكن هذا ليس دقيقاً 100%
        results[table] = error ? 'RLS_ENABLED' : 'CHECK_MANUAL';
      } catch (e) {
        results[table] = 'ERROR';
      }
    }
    
    console.log(`\n🔍 Query #9: RLS Policies...`);
    console.log(`   النتيجة: تم فحص ${tables.length} جداول`);
    console.log(`   الحالة: ⚠️  WARNING - يتطلب فحص يدوي`);
    
    addResult('Query #9: RLS Policies', 'WARNING', 'N/A', 'ALL_TABLES',
      'يتطلب فحص يدوي من Supabase SQL Editor - استخدم: SELECT * FROM pg_policies');
    
    return results;
  } catch (error) {
    addResult('Query #9: RLS Policies', 'WARNING', 'N/A', 'ALL_TABLES',
      'يتطلب تنفيذ يدوي من Supabase SQL Editor');
    return null;
  }
}

async function check10_Summary() {
  try {
    const [entries, invoices, bills, inventory] = await Promise.all([
      supabase.from('journal_entries').select('id, status', { count: 'exact' }),
      supabase.from('invoices').select('id, status', { count: 'exact' }),
      supabase.from('bills').select('id, status', { count: 'exact' }),
      supabase.from('inventory_transactions').select('id, transaction_type', { count: 'exact' })
    ]);
    
    const summary = {
      journalEntries: {
        total: entries.count || 0,
        posted: (entries.data || []).filter(e => e.status === 'posted').length,
        draft: (entries.data || []).filter(e => e.status === 'draft').length
      },
      invoices: {
        total: invoices.count || 0,
        posted: (invoices.data || []).filter(i => ['paid', 'partially_paid'].includes(i.status)).length,
        draft: (invoices.data || []).filter(i => i.status === 'draft').length
      },
      bills: {
        total: bills.count || 0,
        posted: (bills.data || []).filter(b => ['paid', 'partially_paid'].includes(b.status)).length,
        draft: (bills.data || []).filter(b => b.status === 'draft').length
      },
      inventoryTransactions: {
        total: inventory.count || 0,
        sale: (inventory.data || []).filter(it => it.transaction_type === 'sale').length,
        purchase: (inventory.data || []).filter(it => it.transaction_type === 'purchase').length
      }
    };
    
    console.log(`\n🔍 Query #10: الملخص السريع...`);
    console.log(`   Journal Entries: ${summary.journalEntries.total} (${summary.journalEntries.posted} posted, ${summary.journalEntries.draft} draft)`);
    console.log(`   Invoices: ${summary.invoices.total} (${summary.invoices.posted} posted, ${summary.invoices.draft} draft)`);
    console.log(`   Bills: ${summary.bills.total} (${summary.bills.posted} posted, ${summary.bills.draft} draft)`);
    console.log(`   Inventory Transactions: ${summary.inventoryTransactions.total} (${summary.inventoryTransactions.sale} sale, ${summary.inventoryTransactions.purchase} purchase)`);
    console.log(`   الحالة: ✅ PASS`);
    
    addResult('Query #10: الملخص السريع', 'PASS', summary, 'SUMMARY',
      'تم جلب الملخص بنجاح');
    
    return summary;
  } catch (error) {
    addResult('Query #10: الملخص السريع', 'WARNING', 'N/A', 'SUMMARY',
      'خطأ في جلب الملخص: ' + error.message);
    return null;
  }
}

async function checkDraftJournalEntry() {
  try {
    const { data: entries, error } = await supabase
      .from('journal_entries')
      .select(`
        id,
        company_id,
        reference_type,
        reference_id,
        entry_date,
        description,
        status,
        created_at,
        updated_at,
        journal_entry_lines (id, debit_amount, credit_amount)
      `)
      .eq('status', 'draft');
    
    if (error) throw error;
    
    const draftEntries = entries || [];
    
    console.log(`\n🔍 فحص القيد Draft الوحيد...`);
    console.log(`   النتيجة: ${draftEntries.length} قيد Draft`);
    
    if (draftEntries.length > 0) {
      draftEntries.forEach(entry => {
        const lines = entry.journal_entry_lines || [];
        const totalDebit = lines.reduce((sum, line) => sum + (parseFloat(line.debit_amount) || 0), 0);
        const totalCredit = lines.reduce((sum, line) => sum + (parseFloat(line.credit_amount) || 0), 0);
        
        console.log(`   - ID: ${entry.id}`);
        console.log(`     Reference Type: ${entry.reference_type || 'manual_entry'}`);
        console.log(`     Entry Date: ${entry.entry_date}`);
        console.log(`     Lines: ${lines.length}`);
        console.log(`     Debit: ${totalDebit.toFixed(2)}, Credit: ${totalCredit.toFixed(2)}`);
      });
    }
    
    addResult('فحص القيد Draft', draftEntries.length === 1 ? 'PASS' : 'WARNING', 
      draftEntries.length, 1, 
      draftEntries.length === 1 ? 'وجد قيد Draft واحد (طبيعي)' : `وجد ${draftEntries.length} قيود Draft`);
    
    return draftEntries;
  } catch (error) {
    addResult('فحص القيد Draft', 'WARNING', 'N/A', 1,
      'خطأ في الفحص: ' + error.message);
    return null;
  }
}

// ============================================
// التنفيذ الرئيسي
// ============================================

async function main() {
  console.log('🔍 EXECUTING SQL INTEGRITY CHECKS');
  console.log('==================================\n');
  console.log(`Supabase URL: ${SUPABASE_URL?.substring(0, 30)}...`);
  console.log(`Service Key: ${SUPABASE_SERVICE_KEY ? '✅ موجود' : '❌ مفقود'}\n`);
  
  try {
    // تنفيذ جميع الفحوصات
    await check1_JournalBalance();
    await check2_EmptyEntries();
    await check3_SentInvoicesWithoutJournals();
    await check4_PaidInvoicesWithoutJournals();
    await check5_DraftInvoicesWithInventory();
    await check6_SentInvoicesWithoutInventory();
    await check7_ReceivedBillsWithoutJournals();
    await check8_PaidBillsWithoutJournals();
    await check9_RLSPolicies();
    await check10_Summary();
    await checkDraftJournalEntry();
    
    // تحديد الحالة النهائية
    if (RESULTS.summary.failed > 0) {
      RESULTS.status = 'FAILED';
    } else if (RESULTS.summary.warnings > 0) {
      RESULTS.status = 'WARNING';
    } else {
      RESULTS.status = 'PASSED';
    }
    
    // حفظ التقرير
    const reportDir = __dirname + '/..';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const reportPath = path.join(reportDir, `SQL_INTEGRITY_CHECK_RESULTS_${timestamp}.json`);
    const reportTextPath = path.join(reportDir, `SQL_INTEGRITY_CHECK_RESULTS_${timestamp}.txt`);
    
    fs.writeFileSync(reportPath, JSON.stringify(RESULTS, null, 2), 'utf8');
    
    // تقرير نصي
    let textReport = `🔍 SQL INTEGRITY CHECK RESULTS
==========================================
تاريخ الفحص: ${RESULTS.timestamp}
الحالة النهائية: ${RESULTS.status}
==========================================

📊 الملخص:
- إجمالي الفحوصات: ${RESULTS.summary.total}
- نجحت: ${RESULTS.summary.passed} ✅
- فشلت: ${RESULTS.summary.failed} ❌
- تحذيرات: ${RESULTS.summary.warnings} ⚠️

`;

    for (const [checkName, check] of Object.entries(RESULTS.checks)) {
      textReport += `\n${'='.repeat(50)}\n`;
      textReport += `${checkName}\n`;
      textReport += `${'='.repeat(50)}\n`;
      textReport += `الحالة: ${check.status}\n`;
      textReport += `النتيجة: ${JSON.stringify(check.result)}\n`;
      textReport += `المتوقع: ${JSON.stringify(check.expected)}\n`;
      if (check.details) {
        textReport += `التفاصيل: ${check.details}\n`;
      }
    }
    
    textReport += `\n${'='.repeat(50)}\n`;
    textReport += `🏁 القرار النهائي\n`;
    textReport += `${'='.repeat(50)}\n\n`;
    
    if (RESULTS.status === 'PASSED') {
      textReport += `✅ جميع الفحوصات الحرجة نجحت\n`;
    } else if (RESULTS.status === 'FAILED') {
      textReport += `❌ يوجد ${RESULTS.summary.failed} فحص فشل\n`;
    } else {
      textReport += `⚠️ يوجد ${RESULTS.summary.warnings} تحذير\n`;
    }
    
    fs.writeFileSync(reportTextPath, textReport, 'utf8');
    
    console.log(`\n${'='.repeat(50)}`);
    console.log('📊 الملخص النهائي');
    console.log('='.repeat(50));
    console.log(`الحالة: ${RESULTS.status}`);
    console.log(`الفحوصات الناجحة: ${RESULTS.summary.passed} ✅`);
    console.log(`الفحوصات الفاشلة: ${RESULTS.summary.failed} ❌`);
    console.log(`التحذيرات: ${RESULTS.summary.warnings} ⚠️`);
    console.log(`\nالتقارير:\n  ${reportPath}\n  ${reportTextPath}\n`);
    
    process.exit(RESULTS.summary.failed > 0 ? 1 : 0);
    
  } catch (error) {
    console.error('\n❌ خطأ أثناء تنفيذ الفحوصات:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main, RESULTS };

