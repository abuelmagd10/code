#!/usr/bin/env node
/**
 * سكريبت مراجعة بيانات الشركات
 * Company Data Audit Script
 *
 * الغرض: فحص جميع بيانات الشركات والتحقق من صحة البيانات المحاسبية
 * Purpose: Audit all company data and verify accounting data integrity
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// قراءة ملف .env.local
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) {
    console.error('❌ خطأ: لم يتم العثور على ملف .env.local');
    console.error('❌ Error: .env.local file not found');
    process.exit(1);
  }

  const envContent = fs.readFileSync(envPath, 'utf8');
  const lines = envContent.split('\n');

  lines.forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      const value = valueParts.join('=').trim();
      if (key && value) {
        process.env[key.trim()] = value.replace(/^["']|["']$/g, '');
      }
    }
  });
}

loadEnv();

// إعداد Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ خطأ: لم يتم العثور على بيانات Supabase في ملف .env.local');
  console.error('❌ Error: Supabase credentials not found in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================================================
// دوال مساعدة
// Helper Functions
// ============================================================================

function printSection(title, titleEn = '') {
  console.log('\n' + '='.repeat(80));
  console.log(`📊 ${title}`);
  if (titleEn) console.log(`   ${titleEn}`);
  console.log('='.repeat(80));
}

function printTable(data, columns) {
  if (!data || data.length === 0) {
    console.log('   لا توجد بيانات / No data');
    return;
  }
  
  console.table(data, columns);
}

// ============================================================================
// الجزء 1: عرض جميع الشركات
// Part 1: Display All Companies
// ============================================================================

async function displayAllCompanies() {
  printSection('الشركات المسجلة في النظام', 'Registered Companies');
  
  const { data: companies, error } = await supabase
    .from('companies')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('❌ خطأ:', error.message);
    return [];
  }
  
  // حساب الإحصائيات لكل شركة
  const companiesWithStats = await Promise.all(
    companies.map(async (company) => {
      const [customers, suppliers, invoices, bills] = await Promise.all([
        supabase.from('customers').select('id', { count: 'exact', head: true }).eq('company_id', company.id),
        supabase.from('suppliers').select('id', { count: 'exact', head: true }).eq('company_id', company.id),
        supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('company_id', company.id),
        supabase.from('bills').select('id', { count: 'exact', head: true }).eq('company_id', company.id),
      ]);
      
      return {
        name: company.name,
        active: company.is_active ? '✅' : '❌',
        customers: customers.count || 0,
        suppliers: suppliers.count || 0,
        invoices: invoices.count || 0,
        bills: bills.count || 0,
        created: new Date(company.created_at).toLocaleDateString('ar-EG'),
      };
    })
  );
  
  printTable(companiesWithStats, ['name', 'active', 'customers', 'suppliers', 'invoices', 'bills', 'created']);
  
  return companies;
}

// ============================================================================
// الجزء 2: التحقق من حسابات AR/AP
// Part 2: Check AR/AP Accounts
// ============================================================================

async function checkARAPAccounts(companies) {
  printSection('التحقق من حسابات AR/AP', 'AR/AP Accounts Check');
  
  const results = await Promise.all(
    companies.map(async (company) => {
      const [arAccount, apAccount] = await Promise.all([
        supabase
          .from('chart_of_accounts')
          .select('id, account_name, account_code')
          .eq('company_id', company.id)
          .eq('sub_type', 'accounts_receivable')
          .eq('is_active', true)
          .limit(1)
          .single(),
        supabase
          .from('chart_of_accounts')
          .select('id, account_name, account_code')
          .eq('company_id', company.id)
          .eq('sub_type', 'accounts_payable')
          .eq('is_active', true)
          .limit(1)
          .single(),
      ]);
      
      return {
        company: company.name,
        ar_status: arAccount.data ? '✅ موجود' : '❌ غير موجود',
        ar_name: arAccount.data?.account_name || '-',
        ar_code: arAccount.data?.account_code || '-',
        ap_status: apAccount.data ? '✅ موجود' : '❌ غير موجود',
        ap_name: apAccount.data?.account_name || '-',
        ap_code: apAccount.data?.account_code || '-',
      };
    })
  );
  
  printTable(results, ['company', 'ar_status', 'ar_name', 'ar_code', 'ap_status', 'ap_name', 'ap_code']);
  
  return results;
}

// ============================================================================
// الجزء 3: التحقق من الفواتير بدون قيود
// Part 3: Check Invoices Without Journal Entries
// ============================================================================

async function checkInvoicesWithoutJournalEntries(companies) {
  printSection('الفواتير بدون قيود محاسبية', 'Invoices Without Journal Entries');
  
  const results = await Promise.all(
    companies.map(async (company) => {
      const { data: invoices } = await supabase
        .from('invoices')
        .select('id, invoice_number, status')
        .eq('company_id', company.id)
        .not('status', 'in', '(draft,cancelled)');
      
      if (!invoices || invoices.length === 0) {
        return {
          company: company.name,
          total: 0,
          with_entries: 0,
          without_entries: 0,
          percentage: '0%',
        };
      }
      
      const invoicesWithEntries = await Promise.all(
        invoices.map(async (invoice) => {
          const { data: je } = await supabase
            .from('journal_entries')
            .select('id')
            .eq('reference_id', invoice.id)
            .eq('reference_type', 'invoice')
            .eq('is_deleted', false)
            .limit(1)
            .single();
          
          return je ? 1 : 0;
        })
      );
      
      const withEntries = invoicesWithEntries.reduce((sum, val) => sum + val, 0);
      const withoutEntries = invoices.length - withEntries;
      const percentage = ((withEntries / invoices.length) * 100).toFixed(1);
      
      return {
        company: company.name,
        total: invoices.length,
        with_entries: withEntries,
        without_entries: withoutEntries,
        percentage: `${percentage}%`,
      };
    })
  );
  
  printTable(results, ['company', 'total', 'with_entries', 'without_entries', 'percentage']);

  return results;
}

// ============================================================================
// الجزء 4: مقارنة الذمم المدينة (القديمة vs الجديدة)
// Part 4: Compare Receivables (Old vs New)
// ============================================================================

async function compareReceivables(companies) {
  printSection('مقارنة الذمم المدينة (القديمة vs الجديدة)', 'Receivables Comparison (Old vs New)');

  const allResults = [];

  for (const company of companies) {
    // جلب حساب AR
    const { data: arAccount } = await supabase
      .from('chart_of_accounts')
      .select('id')
      .eq('company_id', company.id)
      .eq('sub_type', 'accounts_receivable')
      .eq('is_active', true)
      .limit(1)
      .single();

    if (!arAccount) {
      console.log(`⚠️  ${company.name}: لا يوجد حساب AR`);
      continue;
    }

    // جلب جميع العملاء
    const { data: customers } = await supabase
      .from('customers')
      .select('id, name')
      .eq('company_id', company.id);

    if (!customers || customers.length === 0) continue;

    for (const customer of customers) {
      // الطريقة القديمة: من الفواتير
      const { data: invoices } = await supabase
        .from('invoices')
        .select('total_amount, paid_amount, status')
        .eq('company_id', company.id)
        .eq('customer_id', customer.id)
        .in('status', ['sent', 'partially_paid', 'overdue']);

      const oldMethodBalance = (invoices || []).reduce((sum, inv) => {
        return sum + (inv.total_amount - (inv.paid_amount || 0));
      }, 0);

      // الطريقة الجديدة: من القيود
      const { data: journalLines } = await supabase
        .from('journal_entry_lines')
        .select(`
          debit_amount,
          credit_amount,
          journal_entries!inner(
            id,
            reference_type,
            reference_id,
            is_deleted
          )
        `)
        .eq('account_id', arAccount.id);

      let newMethodBalance = 0;
      if (journalLines) {
        for (const line of journalLines) {
          const je = line.journal_entries;
          if (je.is_deleted) continue;
          if (je.reference_type !== 'invoice') continue;

          // التحقق من أن القيد يخص هذا العميل
          const { data: invoice } = await supabase
            .from('invoices')
            .select('customer_id')
            .eq('id', je.reference_id)
            .eq('customer_id', customer.id)
            .single();

          if (invoice) {
            newMethodBalance += (line.debit_amount || 0) - (line.credit_amount || 0);
          }
        }
      }

      const difference = oldMethodBalance - newMethodBalance;
      const status = Math.abs(difference) < 0.01 ? '✅ متطابق' :
                     (newMethodBalance === 0 && oldMethodBalance > 0) ? '⚠️ لا يوجد قيود' :
                     '❌ غير متطابق';

      if (oldMethodBalance !== 0 || newMethodBalance !== 0) {
        allResults.push({
          company: company.name,
          customer: customer.name,
          old_balance: oldMethodBalance.toFixed(2),
          new_balance: newMethodBalance.toFixed(2),
          difference: difference.toFixed(2),
          status,
        });
      }
    }
  }

  if (allResults.length > 0) {
    printTable(allResults, ['company', 'customer', 'old_balance', 'new_balance', 'difference', 'status']);
  } else {
    console.log('   ✅ لا توجد فروقات / No differences found');
  }

  return allResults;
}

// ============================================================================
// الجزء 5: مقارنة الذمم الدائنة (القديمة vs الجديدة)
// Part 5: Compare Payables (Old vs New)
// ============================================================================

async function comparePayables(companies) {
  printSection('مقارنة الذمم الدائنة (القديمة vs الجديدة)', 'Payables Comparison (Old vs New)');

  const allResults = [];

  for (const company of companies) {
    // جلب حساب AP
    const { data: apAccount } = await supabase
      .from('chart_of_accounts')
      .select('id')
      .eq('company_id', company.id)
      .eq('sub_type', 'accounts_payable')
      .eq('is_active', true)
      .limit(1)
      .single();

    if (!apAccount) {
      console.log(`⚠️  ${company.name}: لا يوجد حساب AP`);
      continue;
    }

    // جلب جميع الموردين
    const { data: suppliers } = await supabase
      .from('suppliers')
      .select('id, name')
      .eq('company_id', company.id);

    if (!suppliers || suppliers.length === 0) continue;

    for (const supplier of suppliers) {
      // الطريقة القديمة: من الفواتير
      const { data: bills } = await supabase
        .from('bills')
        .select('total_amount, paid_amount, status')
        .eq('company_id', company.id)
        .eq('supplier_id', supplier.id)
        .in('status', ['open', 'partially_paid', 'overdue']);

      const oldMethodBalance = (bills || []).reduce((sum, bill) => {
        return sum + (bill.total_amount - (bill.paid_amount || 0));
      }, 0);

      // الطريقة الجديدة: من القيود
      const { data: journalLines } = await supabase
        .from('journal_entry_lines')
        .select(`
          debit_amount,
          credit_amount,
          journal_entries!inner(
            id,
            reference_type,
            reference_id,
            is_deleted
          )
        `)
        .eq('account_id', apAccount.id);

      let newMethodBalance = 0;
      if (journalLines) {
        for (const line of journalLines) {
          const je = line.journal_entries;
          if (je.is_deleted) continue;
          if (je.reference_type !== 'bill') continue;

          // التحقق من أن القيد يخص هذا المورد
          const { data: bill } = await supabase
            .from('bills')
            .select('supplier_id')
            .eq('id', je.reference_id)
            .eq('supplier_id', supplier.id)
            .single();

          if (bill) {
            newMethodBalance += (line.credit_amount || 0) - (line.debit_amount || 0);
          }
        }
      }

      const difference = oldMethodBalance - newMethodBalance;
      const status = Math.abs(difference) < 0.01 ? '✅ متطابق' :
                     (newMethodBalance === 0 && oldMethodBalance > 0) ? '⚠️ لا يوجد قيود' :
                     '❌ غير متطابق';

      if (oldMethodBalance !== 0 || newMethodBalance !== 0) {
        allResults.push({
          company: company.name,
          supplier: supplier.name,
          old_balance: oldMethodBalance.toFixed(2),
          new_balance: newMethodBalance.toFixed(2),
          difference: difference.toFixed(2),
          status,
        });
      }
    }
  }

  if (allResults.length > 0) {
    printTable(allResults, ['company', 'supplier', 'old_balance', 'new_balance', 'difference', 'status']);
  } else {
    console.log('   ✅ لا توجد فروقات / No differences found');
  }

  return allResults;
}

// ============================================================================
// الدالة الرئيسية
// Main Function
// ============================================================================

async function main() {
  console.log('\n🔍 بدء مراجعة بيانات الشركات...');
  console.log('🔍 Starting company data audit...\n');

  try {
    // 1. عرض جميع الشركات
    const companies = await displayAllCompanies();

    if (!companies || companies.length === 0) {
      console.log('\n❌ لا توجد شركات في قاعدة البيانات');
      console.log('❌ No companies found in database');
      return;
    }

    // 2. التحقق من حسابات AR/AP
    await checkARAPAccounts(companies);

    // 3. التحقق من الفواتير بدون قيود
    await checkInvoicesWithoutJournalEntries(companies);

    // 4. مقارنة الذمم المدينة
    const receivablesDiff = await compareReceivables(companies);

    // 5. مقارنة الذمم الدائنة
    const payablesDiff = await comparePayables(companies);

    // ملخص نهائي
    printSection('ملخص نهائي', 'Final Summary');

    const totalReceivablesDiff = receivablesDiff.filter(r => r.status !== '✅ متطابق').length;
    const totalPayablesDiff = payablesDiff.filter(p => p.status !== '✅ متطابق').length;

    console.log(`\n📊 إجمالي الشركات: ${companies.length}`);
    console.log(`📊 Total Companies: ${companies.length}`);

    console.log(`\n📊 فروقات الذمم المدينة: ${totalReceivablesDiff}`);
    console.log(`📊 Receivables Differences: ${totalReceivablesDiff}`);

    console.log(`\n📊 فروقات الذمم الدائنة: ${totalPayablesDiff}`);
    console.log(`📊 Payables Differences: ${totalPayablesDiff}`);

    if (totalReceivablesDiff === 0 && totalPayablesDiff === 0) {
      console.log('\n✅ جميع البيانات متطابقة! النظام يعمل بشكل صحيح.');
      console.log('✅ All data matches! System is working correctly.');
    } else {
      console.log('\n⚠️  يوجد فروقات تحتاج إلى مراجعة وتصحيح.');
      console.log('⚠️  There are differences that need review and correction.');
    }

    console.log('\n✅ انتهت المراجعة بنجاح!');
    console.log('✅ Audit completed successfully!\n');

  } catch (error) {
    console.error('\n❌ خطأ أثناء المراجعة:', error.message);
    console.error('❌ Error during audit:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// تشغيل السكريبت
main();

