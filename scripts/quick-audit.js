#!/usr/bin/env node

/**
 * 🔍 المراجعة المحاسبية السريعة
 * Quick Accounting Audit Script
 * 
 * سكربت بسيط لتنفيذ المراجعة المحاسبية الأساسية
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// تحميل متغيرات البيئة
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })
} catch (e) {
  // dotenv not installed, try to load .env.local manually
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/)
      if (match) {
        process.env[match[1].trim()] = match[2].trim()
      }
    })
  }
}

// =============================================
// Configuration
// =============================================
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ خطأ: متغيرات البيئة غير موجودة')
  console.error('   تأكد من وجود NEXT_PUBLIC_SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY في .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

// =============================================
// Helper Functions
// =============================================

function printHeader(title) {
  console.log('\n' + '='.repeat(60))
  console.log(`  ${title}`)
  console.log('='.repeat(60))
}

function printSection(title) {
  console.log(`\n📊 ${title}`)
  console.log('-'.repeat(60))
}

function printResult(label, value, isError = false) {
  const icon = isError ? '❌' : '✅'
  console.log(`${icon} ${label}: ${value}`)
}

// =============================================
// Audit Functions
// =============================================

async function checkUnbalancedEntries() {
  printSection('1. التحقق من القيود غير المتوازنة')
  
  const { data, error } = await supabase.rpc('get_unbalanced_journal_entries')
  
  if (error) {
    // Fallback: استعلام مباشر
    const { data: entries, error: entriesError } = await supabase
      .from('journal_entries')
      .select(`
        id,
        entry_date,
        description,
        reference_type,
        companies!inner(name)
      `)
    
    if (entriesError) {
      printResult('خطأ في الاستعلام', entriesError.message, true)
      return { total: 0, unbalanced: 0 }
    }
    
    // حساب التوازن يدوياً
    let unbalancedCount = 0
    for (const entry of entries || []) {
      const { data: lines } = await supabase
        .from('journal_entry_lines')
        .select('debit_amount, credit_amount')
        .eq('journal_entry_id', entry.id)
      
      const totalDebit = (lines || []).reduce((sum, l) => sum + Number(l.debit_amount || 0), 0)
      const totalCredit = (lines || []).reduce((sum, l) => sum + Number(l.credit_amount || 0), 0)
      
      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        unbalancedCount++
        console.log(`   ⚠️  قيد غير متوازن: ${entry.description || entry.id}`)
        console.log(`      المدين: ${totalDebit.toFixed(2)}, الدائن: ${totalCredit.toFixed(2)}`)
      }
    }
    
    printResult('إجمالي القيود', entries?.length || 0)
    printResult('القيود غير المتوازنة', unbalancedCount, unbalancedCount > 0)
    
    return { total: entries?.length || 0, unbalanced: unbalancedCount }
  }
  
  printResult('القيود غير المتوازنة', data?.length || 0, (data?.length || 0) > 0)
  return { total: 0, unbalanced: data?.length || 0 }
}

async function checkInvoicesWithoutEntries() {
  printSection('2. التحقق من الفواتير بدون قيود محاسبية')
  
  const { data: invoices, error } = await supabase
    .from('invoices')
    .select(`
      id,
      invoice_number,
      invoice_date,
      total_amount,
      status,
      companies!inner(name),
      customers!inner(name)
    `)
    .in('status', ['sent', 'paid', 'partially_paid'])
    .or('is_deleted.is.null,is_deleted.eq.false')
  
  if (error) {
    printResult('خطأ في الاستعلام', error.message, true)
    return { total: 0, missing: 0 }
  }
  
  let missingCount = 0
  for (const invoice of invoices || []) {
    const { data: entries } = await supabase
      .from('journal_entries')
      .select('id')
      .eq('reference_id', invoice.id)
      .in('reference_type', ['invoice', 'invoice_payment'])
      .limit(1)
    
    if (!entries || entries.length === 0) {
      missingCount++
      console.log(`   ⚠️  فاتورة بدون قيد: ${invoice.invoice_number} - ${invoice.total_amount}`)
    }
  }
  
  printResult('إجمالي الفواتير', invoices?.length || 0)
  printResult('فواتير بدون قيود', missingCount, missingCount > 0)
  
  return { total: invoices?.length || 0, missing: missingCount }
}

async function checkBillsWithoutEntries() {
  printSection('3. التحقق من فواتير الشراء بدون قيود محاسبية')
  
  const { data: bills, error } = await supabase
    .from('bills')
    .select(`
      id,
      bill_number,
      bill_date,
      total_amount,
      status
    `)
    .in('status', ['sent', 'paid', 'partially_paid', 'received'])
    .or('is_deleted.is.null,is_deleted.eq.false')
  
  if (error) {
    printResult('خطأ في الاستعلام', error.message, true)
    return { total: 0, missing: 0 }
  }
  
  let missingCount = 0
  for (const bill of bills || []) {
    const { data: entries } = await supabase
      .from('journal_entries')
      .select('id')
      .eq('reference_id', bill.id)
      .in('reference_type', ['bill', 'bill_payment'])
      .limit(1)
    
    if (!entries || entries.length === 0) {
      missingCount++
    }
  }
  
  printResult('إجمالي فواتير الشراء', bills?.length || 0)
  printResult('فواتير بدون قيود', missingCount, missingCount > 0)

  return { total: bills?.length || 0, missing: missingCount }
}

async function checkPaymentsWithoutEntries() {
  printSection('4. التحقق من المدفوعات بدون قيود محاسبية')

  const { data: payments, error } = await supabase
    .from('payments')
    .select('id, payment_date, amount, invoice_id, bill_id')

  if (error) {
    printResult('خطأ في الاستعلام', error.message, true)
    return { total: 0, missing: 0 }
  }

  let missingCount = 0
  for (const payment of payments || []) {
    const { data: entries } = await supabase
      .from('journal_entries')
      .select('id')
      .or(`reference_id.eq.${payment.id},reference_id.eq.${payment.invoice_id},reference_id.eq.${payment.bill_id}`)
      .in('reference_type', ['customer_payment', 'supplier_payment', 'invoice_payment', 'bill_payment'])
      .limit(1)

    if (!entries || entries.length === 0) {
      missingCount++
    }
  }

  printResult('إجمالي المدفوعات', payments?.length || 0)
  printResult('مدفوعات بدون قيود', missingCount, missingCount > 0)

  return { total: payments?.length || 0, missing: missingCount }
}

async function checkDuplicateRecords() {
  printSection('5. التحقق من السجلات المكررة')

  // التحقق من العملاء المكررين
  const { data: customers, error: custError } = await supabase
    .from('customers')
    .select('name, email, company_id')

  const customerDuplicates = new Map()
  if (!custError && customers) {
    customers.forEach(c => {
      const key = `${c.company_id}-${c.name}-${c.email}`
      customerDuplicates.set(key, (customerDuplicates.get(key) || 0) + 1)
    })
  }

  const custDupCount = Array.from(customerDuplicates.values()).filter(count => count > 1).length
  printResult('عملاء مكررون', custDupCount, custDupCount > 0)

  // التحقق من الموردين المكررين
  const { data: suppliers, error: suppError } = await supabase
    .from('suppliers')
    .select('name, email, company_id')

  const supplierDuplicates = new Map()
  if (!suppError && suppliers) {
    suppliers.forEach(s => {
      const key = `${s.company_id}-${s.name}-${s.email}`
      supplierDuplicates.set(key, (supplierDuplicates.get(key) || 0) + 1)
    })
  }

  const suppDupCount = Array.from(supplierDuplicates.values()).filter(count => count > 1).length
  printResult('موردون مكررون', suppDupCount, suppDupCount > 0)

  return { customers: custDupCount, suppliers: suppDupCount }
}

async function generateSummaryReport(results) {
  printHeader('📄 ملخص المراجعة')

  const totalIssues =
    results.unbalancedEntries.unbalanced +
    results.invoicesWithoutEntries.missing +
    results.billsWithoutEntries.missing +
    results.paymentsWithoutEntries.missing +
    results.duplicateRecords.customers +
    results.duplicateRecords.suppliers

  console.log('\n📊 الإحصائيات:')
  console.log(`   • إجمالي القيود: ${results.unbalancedEntries.total}`)
  console.log(`   • إجمالي الفواتير: ${results.invoicesWithoutEntries.total}`)
  console.log(`   • إجمالي فواتير الشراء: ${results.billsWithoutEntries.total}`)
  console.log(`   • إجمالي المدفوعات: ${results.paymentsWithoutEntries.total}`)

  console.log('\n⚠️  المشاكل المكتشفة:')
  console.log(`   • قيود غير متوازنة: ${results.unbalancedEntries.unbalanced}`)
  console.log(`   • فواتير بدون قيود: ${results.invoicesWithoutEntries.missing}`)
  console.log(`   • فواتير شراء بدون قيود: ${results.billsWithoutEntries.missing}`)
  console.log(`   • مدفوعات بدون قيود: ${results.paymentsWithoutEntries.missing}`)
  console.log(`   • عملاء مكررون: ${results.duplicateRecords.customers}`)
  console.log(`   • موردون مكررون: ${results.duplicateRecords.suppliers}`)

  console.log(`\n📈 إجمالي المشاكل: ${totalIssues}`)

  if (totalIssues === 0) {
    console.log('\n✅ ممتاز! لا توجد مشاكل محاسبية')
  } else {
    console.log('\n⚠️  يوجد مشاكل تحتاج إلى إصلاح')
    console.log('   راجع الدليل: ACCOUNTING_AUDIT_EXECUTION_GUIDE.md')
  }

  // حفظ التقرير
  const timestamp = new Date().toISOString().split('T')[0]
  const reportPath = path.join(__dirname, '..', `QUICK_AUDIT_REPORT_${timestamp}.json`)

  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    results,
    totalIssues
  }, null, 2))

  console.log(`\n📄 تم حفظ التقرير في: ${reportPath}`)
}

// =============================================
// Main Function
// =============================================

async function main() {
  try {
    printHeader('🔍 المراجعة المحاسبية السريعة')
    console.log('تاريخ التنفيذ:', new Date().toLocaleString('ar-EG'))

    const results = {
      unbalancedEntries: await checkUnbalancedEntries(),
      invoicesWithoutEntries: await checkInvoicesWithoutEntries(),
      billsWithoutEntries: await checkBillsWithoutEntries(),
      paymentsWithoutEntries: await checkPaymentsWithoutEntries(),
      duplicateRecords: await checkDuplicateRecords()
    }

    await generateSummaryReport(results)

    printHeader('✅ اكتملت المراجعة')

  } catch (error) {
    console.error('\n❌ خطأ في تنفيذ المراجعة:', error.message)
    process.exit(1)
  }
}

// تنفيذ السكربت
if (require.main === module) {
  main()
}

module.exports = { main }

