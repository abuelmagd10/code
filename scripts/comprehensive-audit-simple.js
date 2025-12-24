// =====================================================
// 🔍 سكربت المراجعة المحاسبية الشاملة (نسخة مبسطة)
// Comprehensive Accounting Audit Script (Simplified)
// =====================================================
// تاريخ الإنشاء: 2025-01-XX
// الهدف: تنفيذ المراجعة المحاسبية الشاملة وإنشاء التقارير
// =====================================================

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// تحميل متغيرات البيئة
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

// =====================================================
// إعدادات
// =====================================================
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ خطأ: متغيرات البيئة غير موجودة');
  console.error('   تأكد من وجود NEXT_PUBLIC_SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// إنشاء عميل Supabase مع Service Role Key
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// =====================================================
// 1️⃣ المراجعة المحاسبية الشاملة
// =====================================================

// 1.1: القيود غير المتوازنة
async function checkUnbalancedEntries(companyId = null) {
  console.log('\n📊 1.1 - فحص القيود غير المتوازنة...');
  
  let query = supabase
    .from('journal_entries')
    .select(`
      id,
      company_id,
      reference_type,
      reference_id,
      entry_date,
      description,
      companies!inner(name),
      journal_entry_lines(
        debit_amount,
        credit_amount
      )
    `);
  
  if (companyId) {
    query = query.eq('company_id', companyId);
  }
  
  const { data: entries, error } = await query;
  
  if (error) {
    console.error('❌ خطأ:', error.message);
    return { error, data: [] };
  }
  
  const unbalanced = [];
  
  for (const entry of entries || []) {
    const lines = entry.journal_entry_lines || [];
    const totalDebit = lines.reduce((sum, line) => sum + (parseFloat(line.debit_amount) || 0), 0);
    const totalCredit = lines.reduce((sum, line) => sum + (parseFloat(line.credit_amount) || 0), 0);
    const difference = Math.abs(totalDebit - totalCredit);
    
    if (difference > 0.01) {
      unbalanced.push({
        journal_entry_id: entry.id,
        company_id: entry.company_id,
        company_name: entry.companies?.name,
        reference_type: entry.reference_type,
        reference_id: entry.reference_id,
        entry_date: entry.entry_date,
        description: entry.description,
        total_debit: totalDebit,
        total_credit: totalCredit,
        difference: difference
      });
    }
  }
  
  console.log(`   ✅ تم فحص ${entries?.length || 0} قيد`);
  console.log(`   ${unbalanced.length > 0 ? '❌' : '✅'} ${unbalanced.length} قيد غير متوازن`);
  
  return { error: null, data: unbalanced };
}

// 1.2: الفواتير بدون قيود محاسبية
async function checkInvoicesWithoutEntries(companyId = null) {
  console.log('\n📊 1.2 - فحص الفواتير بدون قيود محاسبية...');
  
  let query = supabase
    .from('invoices')
    .select(`
      id,
      company_id,
      invoice_number,
      invoice_date,
      status,
      total_amount,
      paid_amount,
      companies!inner(name)
    `)
    .in('status', ['sent', 'paid', 'partially_paid'])
    .is('is_deleted', null);
  
  if (companyId) {
    query = query.eq('company_id', companyId);
  }
  
  const { data: invoices, error } = await query;
  
  if (error) {
    console.error('❌ خطأ:', error.message);
    return { error, data: [] };
  }
  
  const withoutEntries = [];
  
  for (const invoice of invoices || []) {
    // التحقق من وجود قيد محاسبي
    const { data: entries } = await supabase
      .from('journal_entries')
      .select('id')
      .eq('reference_id', invoice.id)
      .in('reference_type', ['invoice', 'invoice_payment'])
      .limit(1);
    
    if (!entries || entries.length === 0) {
      withoutEntries.push({
        invoice_id: invoice.id,
        company_id: invoice.company_id,
        company_name: invoice.companies?.name,
        invoice_number: invoice.invoice_number,
        invoice_date: invoice.invoice_date,
        status: invoice.status,
        total_amount: invoice.total_amount,
        paid_amount: invoice.paid_amount
      });
    }
  }
  
  console.log(`   ✅ تم فحص ${invoices?.length || 0} فاتورة`);
  console.log(`   ${withoutEntries.length > 0 ? '❌' : '✅'} ${withoutEntries.length} فاتورة بدون قيد`);
  
  return { error: null, data: withoutEntries };
}

// 1.6: أرصدة العملاء
async function checkCustomerBalances(companyId = null) {
  console.log('\n📊 1.6 - فحص أرصدة العملاء...');
  
  let query = supabase
    .from('customers')
    .select(`
      id,
      company_id,
      name,
      companies!inner(name)
    `)
    .eq('is_active', true);
  
  if (companyId) {
    query = query.eq('company_id', companyId);
  }
  
  const { data: customers, error } = await query;
  
  if (error) {
    console.error('❌ خطأ:', error.message);
    return { error, data: [] };
  }
  
  const balanceIssues = [];
  
  for (const customer of customers || []) {
    // حساب الرصيد من الفواتير
    const { data: invoices } = await supabase
      .from('invoices')
      .select('total_amount, paid_amount')
      .eq('customer_id', customer.id)
      .in('status', ['sent', 'partially_paid'])
      .is('is_deleted', null);
    
    const invoiceBalance = (invoices || []).reduce((sum, inv) => {
      return sum + (parseFloat(inv.total_amount) || 0) - (parseFloat(inv.paid_amount) || 0);
    }, 0);
    
    // حساب الرصيد من القيود (AR)
    const { data: arAccounts } = await supabase
      .from('chart_of_accounts')
      .select('id')
      .eq('company_id', customer.company_id)
      .eq('sub_type', 'accounts_receivable')
      .limit(1);
    
    let ledgerBalance = 0;
    if (arAccounts && arAccounts.length > 0) {
      const arAccountId = arAccounts[0].id;
      
      // جلب القيود المرتبطة بفواتير هذا العميل
      const { data: invoiceIds } = await supabase
        .from('invoices')
        .select('id')
        .eq('customer_id', customer.id);
      
      if (invoiceIds && invoiceIds.length > 0) {
        const invIds = invoiceIds.map(inv => inv.id);
        
        const { data: entries } = await supabase
          .from('journal_entries')
          .select(`
            id,
            journal_entry_lines!inner(
              account_id,
              debit_amount,
              credit_amount
            )
          `)
          .in('reference_id', invIds)
          .in('reference_type', ['invoice', 'invoice_payment']);
        
        if (entries) {
          for (const entry of entries) {
            const lines = entry.journal_entry_lines || [];
            for (const line of lines) {
              if (line.account_id === arAccountId) {
                ledgerBalance += (parseFloat(line.debit_amount) || 0) - (parseFloat(line.credit_amount) || 0);
              }
            }
          }
        }
      }
    }
    
    const difference = Math.abs(invoiceBalance - ledgerBalance);
    
    if (difference > 0.01) {
      balanceIssues.push({
        customer_id: customer.id,
        company_id: customer.company_id,
        company_name: customer.companies?.name,
        customer_name: customer.name,
        invoice_balance: invoiceBalance,
        ledger_balance: ledgerBalance,
        difference: difference
      });
    }
  }
  
  console.log(`   ✅ تم فحص ${customers?.length || 0} عميل`);
  console.log(`   ${balanceIssues.length > 0 ? '❌' : '✅'} ${balanceIssues.length} عميل به مشكلة في الرصيد`);
  
  return { error: null, data: balanceIssues };
}

// 2.1: سجلات مكررة في العملاء
async function checkDuplicateCustomers(companyId = null) {
  console.log('\n📊 2.1 - فحص العملاء المكررين...');
  
  let query = supabase
    .from('customers')
    .select('id, company_id, name, email')
    .eq('is_active', true);
  
  if (companyId) {
    query = query.eq('company_id', companyId);
  }
  
  const { data: customers, error } = await query;
  
  if (error) {
    console.error('❌ خطأ:', error.message);
    return { error, data: [] };
  }
  
  // تجميع حسب company_id, name, email
  const groups = {};
  for (const customer of customers || []) {
    const key = `${customer.company_id}_${customer.name}_${customer.email || ''}`;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(customer);
  }
  
  const duplicates = Object.values(groups)
    .filter(group => group.length > 1)
    .map(group => ({
      company_id: group[0].company_id,
      name: group[0].name,
      email: group[0].email,
      duplicate_count: group.length,
      customer_ids: group.map(c => c.id)
    }));
  
  console.log(`   ✅ تم فحص ${customers?.length || 0} عميل`);
  console.log(`   ${duplicates.length > 0 ? '❌' : '✅'} ${duplicates.length} مجموعة مكررة`);
  
  return { error: null, data: duplicates };
}

// 4.6: ملخص شامل
async function generateSummary(companyId = null) {
  console.log('\n📊 4.6 - إنشاء الملخص الشامل...');
  
  const summary = {
    timestamp: new Date().toISOString(),
    company_id: companyId || 'all',
    statistics: {}
  };
  
  // إحصائيات القيود
  let entriesQuery = supabase
    .from('journal_entries')
    .select('id', { count: 'exact', head: true });
  
  if (companyId) {
    entriesQuery = entriesQuery.eq('company_id', companyId);
  }
  
  const { count: totalEntries } = await entriesQuery;
  summary.statistics.total_journal_entries = totalEntries || 0;
  
  // إحصائيات الفواتير
  let invoicesQuery = supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .is('is_deleted', null);
  
  if (companyId) {
    invoicesQuery = invoicesQuery.eq('company_id', companyId);
  }
  
  const { count: totalInvoices } = await invoicesQuery;
  summary.statistics.total_invoices = totalInvoices || 0;
  
  // إحصائيات العملاء
  let customersQuery = supabase
    .from('customers')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true);
  
  if (companyId) {
    customersQuery = customersQuery.eq('company_id', companyId);
  }
  
  const { count: totalCustomers } = await customersQuery;
  summary.statistics.total_customers = totalCustomers || 0;
  
  // إحصائيات الموردين
  let suppliersQuery = supabase
    .from('suppliers')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true);
  
  if (companyId) {
    suppliersQuery = suppliersQuery.eq('company_id', companyId);
  }
  
  const { count: totalSuppliers } = await suppliersQuery;
  summary.statistics.total_suppliers = totalSuppliers || 0;
  
  console.log('   ✅ تم إنشاء الملخص');
  
  return { error: null, data: summary };
}

// =====================================================
// تنفيذ المراجعة الشاملة
// =====================================================
async function runComprehensiveAudit(companyId = null) {
  console.log('🔍 بدء المراجعة المحاسبية الشاملة...\n');
  console.log('='.repeat(60));
  
  const auditResults = {
    timestamp: new Date().toISOString(),
    company_id: companyId || 'all',
    sections: {}
  };
  
  try {
    // 1️⃣ المراجعة المحاسبية الشاملة
    auditResults.sections.unbalanced_entries = await checkUnbalancedEntries(companyId);
    auditResults.sections.invoices_without_entries = await checkInvoicesWithoutEntries(companyId);
    auditResults.sections.customer_balances = await checkCustomerBalances(companyId);
    
    // 2️⃣ مراجعة قاعدة البيانات
    auditResults.sections.duplicate_customers = await checkDuplicateCustomers(companyId);
    
    // 4️⃣ خطوات عملية للتحقق النهائي
    auditResults.sections.summary = await generateSummary(companyId);
    
    // حفظ النتائج
    const reportPath = path.join(__dirname, '..', `AUDIT_REPORT_${new Date().toISOString().split('T')[0]}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(auditResults, null, 2), 'utf8');
    console.log(`\n✅ تم حفظ التقرير في: ${reportPath}`);
    
    // إنشاء تقرير نصي
    generateTextReport(auditResults, reportPath.replace('.json', '.txt'));
    
    return auditResults;
    
  } catch (error) {
    console.error('❌ خطأ عام في المراجعة:', error.message);
    throw error;
  }
}

// =====================================================
// إنشاء تقرير نصي
// =====================================================
function generateTextReport(results, outputPath) {
  let report = '';
  
  report += '='.repeat(80) + '\n';
  report += '🔍 تقرير المراجعة المحاسبية الشاملة\n';
  report += '='.repeat(80) + '\n';
  report += `التاريخ: ${results.timestamp}\n`;
  report += `الشركة: ${results.company_id === 'all' ? 'جميع الشركات' : results.company_id}\n\n`;
  
  // ملخص
  if (results.sections.summary?.data) {
    report += '='.repeat(80) + '\n';
    report += '📊 الإحصائيات\n';
    report += '='.repeat(80) + '\n';
    const stats = results.sections.summary.data.statistics;
    report += `إجمالي القيود: ${stats.total_journal_entries || 0}\n`;
    report += `إجمالي الفواتير: ${stats.total_invoices || 0}\n`;
    report += `إجمالي العملاء: ${stats.total_customers || 0}\n`;
    report += `إجمالي الموردين: ${stats.total_suppliers || 0}\n\n`;
  }
  
  // القيود غير المتوازنة
  if (results.sections.unbalanced_entries?.data) {
    report += '='.repeat(80) + '\n';
    report += '1.1 - القيود غير المتوازنة\n';
    report += '='.repeat(80) + '\n';
    const unbalanced = results.sections.unbalanced_entries.data;
    report += `عدد القيود غير المتوازنة: ${unbalanced.length}\n\n`;
    unbalanced.slice(0, 10).forEach((entry, i) => {
      report += `${i + 1}. قيد ID: ${entry.journal_entry_id}\n`;
      report += `   الشركة: ${entry.company_name || entry.company_id}\n`;
      report += `   المدين: ${entry.total_debit.toFixed(2)}\n`;
      report += `   الدائن: ${entry.total_credit.toFixed(2)}\n`;
      report += `   الفرق: ${entry.difference.toFixed(2)}\n\n`;
    });
    if (unbalanced.length > 10) {
      report += `... و ${unbalanced.length - 10} قيد آخر\n\n`;
    }
  }
  
  // الفواتير بدون قيود
  if (results.sections.invoices_without_entries?.data) {
    report += '='.repeat(80) + '\n';
    report += '1.2 - الفواتير بدون قيود محاسبية\n';
    report += '='.repeat(80) + '\n';
    const invoices = results.sections.invoices_without_entries.data;
    report += `عدد الفواتير بدون قيود: ${invoices.length}\n\n`;
    invoices.slice(0, 10).forEach((inv, i) => {
      report += `${i + 1}. ${inv.invoice_number}\n`;
      report += `   الشركة: ${inv.company_name || inv.company_id}\n`;
      report += `   المبلغ: ${inv.total_amount}\n`;
      report += `   الحالة: ${inv.status}\n\n`;
    });
    if (invoices.length > 10) {
      report += `... و ${invoices.length - 10} فاتورة أخرى\n\n`;
    }
  }
  
  // أرصدة العملاء
  if (results.sections.customer_balances?.data) {
    report += '='.repeat(80) + '\n';
    report += '1.6 - مشاكل أرصدة العملاء\n';
    report += '='.repeat(80) + '\n';
    const balances = results.sections.customer_balances.data;
    report += `عدد العملاء بمشاكل في الرصيد: ${balances.length}\n\n`;
    balances.slice(0, 10).forEach((bal, i) => {
      report += `${i + 1}. ${bal.customer_name}\n`;
      report += `   رصيد الفواتير: ${bal.invoice_balance.toFixed(2)}\n`;
      report += `   رصيد القيود: ${bal.ledger_balance.toFixed(2)}\n`;
      report += `   الفرق: ${bal.difference.toFixed(2)}\n\n`;
    });
    if (balances.length > 10) {
      report += `... و ${balances.length - 10} عميل آخر\n\n`;
    }
  }
  
  // العملاء المكررون
  if (results.sections.duplicate_customers?.data) {
    report += '='.repeat(80) + '\n';
    report += '2.1 - العملاء المكررون\n';
    report += '='.repeat(80) + '\n';
    const duplicates = results.sections.duplicate_customers.data;
    report += `عدد المجموعات المكررة: ${duplicates.length}\n\n`;
    duplicates.slice(0, 10).forEach((dup, i) => {
      report += `${i + 1}. ${dup.name} (${dup.email || 'بدون بريد'})\n`;
      report += `   عدد التكرارات: ${dup.duplicate_count}\n`;
      report += `   IDs: ${dup.customer_ids.join(', ')}\n\n`;
    });
    if (duplicates.length > 10) {
      report += `... و ${duplicates.length - 10} مجموعة أخرى\n\n`;
    }
  }
  
  report += '='.repeat(80) + '\n';
  report += 'نهاية التقرير\n';
  report += '='.repeat(80) + '\n';
  
  fs.writeFileSync(outputPath, report, 'utf8');
  console.log(`✅ تم حفظ التقرير النصي في: ${outputPath}`);
}

// =====================================================
// الوظيفة الرئيسية
// =====================================================
async function main() {
  const args = process.argv.slice(2);
  const companyId = args[0]; // معرّف الشركة (اختياري)
  
  try {
    await runComprehensiveAudit(companyId);
    console.log('\n✅ اكتملت المراجعة بنجاح!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ فشلت المراجعة:', error);
    process.exit(1);
  }
}

// =====================================================
// تنفيذ إذا تم استدعاء الملف مباشرة
// =====================================================
if (require.main === module) {
  main();
}

module.exports = { runComprehensiveAudit };

