#!/usr/bin/env node

/**
 * 🔧 إصلاح القيود المحاسبية المفقودة
 * Fix Missing Journal Entries Script
 * 
 * يقوم بإنشاء القيود المحاسبية المفقودة للفواتير والمدفوعات
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// تحميل متغيرات البيئة
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })
} catch (e) {
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

// =============================================
// Account Mapping Functions
// =============================================

async function getAccountMapping(companyId) {
  const { data: accounts } = await supabase
    .from('chart_of_accounts')
    .select('id, account_code, account_name, account_type, sub_type')
    .eq('company_id', companyId)
  
  if (!accounts) return null
  
  const mapping = {
    companyId,
    ar: null,
    ap: null,
    revenue: null,
    cogs: null,
    inventory: null,
    cash: null,
    bank: null,
    customerAdvance: null,
    supplierAdvance: null
  }
  
  for (const acc of accounts) {
    const code = acc.account_code?.toLowerCase() || ''
    const name = acc.account_name?.toLowerCase() || ''
    const subType = acc.sub_type?.toLowerCase() || ''
    
    // Accounts Receivable
    if (subType.includes('receivable') || code.includes('1120') || name.includes('مدين')) {
      mapping.ar = acc.id
    }
    // Accounts Payable
    else if (subType.includes('payable') || code.includes('2110') || name.includes('دائن')) {
      mapping.ap = acc.id
    }
    // Revenue
    else if (acc.account_type === 'Income' || code.includes('4')) {
      if (!mapping.revenue) mapping.revenue = acc.id
    }
    // COGS
    else if (subType.includes('cogs') || code.includes('5110') || name.includes('تكلفة')) {
      mapping.cogs = acc.id
    }
    // Inventory
    else if (subType.includes('inventory') || code.includes('1140') || name.includes('مخزون')) {
      mapping.inventory = acc.id
    }
    // Cash
    else if (subType.includes('cash') || code.includes('1010') || name.includes('نقد')) {
      mapping.cash = acc.id
    }
    // Bank
    else if (subType.includes('bank') || code.includes('1020') || name.includes('بنك')) {
      mapping.bank = acc.id
    }
    // Customer Advance
    else if (name.includes('سلف') && name.includes('عملاء')) {
      mapping.customerAdvance = acc.id
    }
    // Supplier Advance
    else if (name.includes('سلف') && name.includes('مورد')) {
      mapping.supplierAdvance = acc.id
    }
  }
  
  return mapping
}

// =============================================
// Fix Functions
// =============================================

async function fixInvoiceJournals() {
  printSection('1. إصلاح قيود الفواتير')
  
  const { data: invoices, error } = await supabase
    .from('invoices')
    .select(`
      id,
      invoice_number,
      invoice_date,
      total_amount,
      subtotal,
      tax_amount,
      discount_value,
      status,
      company_id,
      customer_id,
      companies!inner(name)
    `)
    .in('status', ['sent', 'paid', 'partially_paid'])
  
  if (error) {
    console.error('❌ خطأ:', error.message)
    return { fixed: 0, skipped: 0, errors: 0 }
  }
  
  let fixed = 0, skipped = 0, errors = 0
  
  for (const invoice of invoices || []) {
    try {
      // Check if journal entry exists
      const { data: existing } = await supabase
        .from('journal_entries')
        .select('id')
        .eq('reference_id', invoice.id)
        .eq('reference_type', 'invoice')
        .limit(1)
      
      if (existing && existing.length > 0) {
        skipped++
        continue
      }
      
      // Get account mapping
      const mapping = await getAccountMapping(invoice.company_id)
      if (!mapping || !mapping.ar || !mapping.revenue) {
        console.log(`   ⚠️  تخطي ${invoice.invoice_number}: حسابات غير موجودة`)
        errors++
        continue
      }

      // Create journal entry
      const { data: entry, error: entryError } = await supabase
        .from('journal_entries')
        .insert({
          company_id: invoice.company_id,
          reference_type: 'invoice',
          reference_id: invoice.id,
          entry_date: invoice.invoice_date,
          description: `فاتورة مبيعات ${invoice.invoice_number}`
        })
        .select()
        .single()

      if (entryError || !entry) {
        console.log(`   ❌ خطأ في ${invoice.invoice_number}:`, entryError?.message)
        errors++
        continue
      }

      // Create journal entry lines
      const lines = [
        {
          journal_entry_id: entry.id,
          account_id: mapping.ar,
          debit_amount: Number(invoice.total_amount || 0),
          credit_amount: 0,
          description: 'الذمم المدينة'
        },
        {
          journal_entry_id: entry.id,
          account_id: mapping.revenue,
          debit_amount: 0,
          credit_amount: Number(invoice.subtotal || 0),
          description: 'إيرادات المبيعات'
        }
      ]

      // Add tax line if exists
      if (Number(invoice.tax_amount || 0) > 0) {
        // Find tax account
        const { data: taxAccounts } = await supabase
          .from('chart_of_accounts')
          .select('id')
          .eq('company_id', invoice.company_id)
          .or('account_name.ilike.%ضريبة%,account_name.ilike.%tax%')
          .limit(1)

        if (taxAccounts && taxAccounts.length > 0) {
          lines.push({
            journal_entry_id: entry.id,
            account_id: taxAccounts[0].id,
            debit_amount: 0,
            credit_amount: Number(invoice.tax_amount || 0),
            description: 'ضريبة القيمة المضافة'
          })
        }
      }

      const { error: linesError } = await supabase
        .from('journal_entry_lines')
        .insert(lines)

      if (linesError) {
        console.log(`   ❌ خطأ في سطور ${invoice.invoice_number}:`, linesError.message)
        // Delete the entry if lines failed
        await supabase.from('journal_entries').delete().eq('id', entry.id)
        errors++
        continue
      }

      console.log(`   ✅ تم إصلاح ${invoice.invoice_number}`)
      fixed++

    } catch (err) {
      console.error(`   ❌ خطأ في ${invoice.invoice_number}:`, err.message)
      errors++
    }
  }

  console.log(`\n📊 النتائج:`)
  console.log(`   • تم الإصلاح: ${fixed}`)
  console.log(`   • تم التخطي: ${skipped}`)
  console.log(`   • أخطاء: ${errors}`)

  return { fixed, skipped, errors }
}

async function fixPaymentJournals() {
  printSection('2. إصلاح قيود المدفوعات')

  const { data: payments, error } = await supabase
    .from('payments')
    .select(`
      id,
      payment_date,
      amount,
      payment_method,
      customer_id,
      supplier_id,
      invoice_id,
      bill_id,
      company_id
    `)

  if (error) {
    console.error('❌ خطأ:', error.message)
    return { fixed: 0, skipped: 0, errors: 0 }
  }

  let fixed = 0, skipped = 0, errors = 0

  for (const payment of payments || []) {
    try {
      // Determine payment type
      const isCustomer = !!payment.customer_id
      const isSupplier = !!payment.supplier_id
      const hasInvoice = !!payment.invoice_id
      const hasBill = !!payment.bill_id

      // Check if journal entry exists
      const referenceTypes = []
      if (hasInvoice) referenceTypes.push('invoice_payment')
      if (hasBill) referenceTypes.push('bill_payment')
      if (isCustomer && !hasInvoice) referenceTypes.push('customer_payment')
      if (isSupplier && !hasBill) referenceTypes.push('supplier_payment')

      const { data: existing } = await supabase
        .from('journal_entries')
        .select('id')
        .or(`reference_id.eq.${payment.id},reference_id.eq.${payment.invoice_id || 'null'},reference_id.eq.${payment.bill_id || 'null'}`)
        .in('reference_type', referenceTypes.length > 0 ? referenceTypes : ['customer_payment', 'supplier_payment'])
        .limit(1)

      if (existing && existing.length > 0) {
        skipped++
        continue
      }

      // Get account mapping
      const mapping = await getAccountMapping(payment.company_id)
      if (!mapping) {
        errors++
        continue
      }

      // Create journal entry based on payment type
      if (hasInvoice && mapping.ar && (mapping.cash || mapping.bank)) {
        // Invoice payment: Dr. Cash/Bank, Cr. AR
        const { data: entry } = await supabase
          .from('journal_entries')
          .insert({
            company_id: payment.company_id,
            reference_type: 'invoice_payment',
            reference_id: payment.invoice_id,
            entry_date: payment.payment_date,
            description: `دفعة على فاتورة`
          })
          .select()
          .single()

        if (entry) {
          await supabase.from('journal_entry_lines').insert([
            {
              journal_entry_id: entry.id,
              account_id: mapping.cash || mapping.bank,
              debit_amount: Number(payment.amount || 0),
              credit_amount: 0,
              description: 'نقد/بنك'
            },
            {
              journal_entry_id: entry.id,
              account_id: mapping.ar,
              debit_amount: 0,
              credit_amount: Number(payment.amount || 0),
              description: 'الذمم المدينة'
            }
          ])
          fixed++
          console.log(`   ✅ تم إصلاح دفعة فاتورة`)
        }
      } else if (hasBill && mapping.ap && (mapping.cash || mapping.bank)) {
        // Bill payment: Dr. AP, Cr. Cash/Bank
        const { data: entry } = await supabase
          .from('journal_entries')
          .insert({
            company_id: payment.company_id,
            reference_type: 'bill_payment',
            reference_id: payment.bill_id,
            entry_date: payment.payment_date,
            description: `دفعة على فاتورة شراء`
          })
          .select()
          .single()

        if (entry) {
          await supabase.from('journal_entry_lines').insert([
            {
              journal_entry_id: entry.id,
              account_id: mapping.ap,
              debit_amount: Number(payment.amount || 0),
              credit_amount: 0,
              description: 'الحسابات الدائنة'
            },
            {
              journal_entry_id: entry.id,
              account_id: mapping.cash || mapping.bank,
              debit_amount: 0,
              credit_amount: Number(payment.amount || 0),
              description: 'نقد/بنك'
            }
          ])
          fixed++
          console.log(`   ✅ تم إصلاح دفعة فاتورة شراء`)
        }
      } else if (isCustomer && mapping.customerAdvance && (mapping.cash || mapping.bank)) {
        // Customer advance payment
        const { data: entry } = await supabase
          .from('journal_entries')
          .insert({
            company_id: payment.company_id,
            reference_type: 'customer_payment',
            reference_id: payment.id,
            entry_date: payment.payment_date,
            description: `سداد عميل (${payment.payment_method})`
          })
          .select()
          .single()

        if (entry) {
          await supabase.from('journal_entry_lines').insert([
            {
              journal_entry_id: entry.id,
              account_id: mapping.cash || mapping.bank,
              debit_amount: Number(payment.amount || 0),
              credit_amount: 0,
              description: 'نقد/بنك'
            },
            {
              journal_entry_id: entry.id,
              account_id: mapping.customerAdvance,
              debit_amount: 0,
              credit_amount: Number(payment.amount || 0),
              description: 'سلف من العملاء'
            }
          ])
          fixed++
          console.log(`   ✅ تم إصلاح دفعة عميل`)
        }
      } else if (isSupplier && mapping.supplierAdvance && (mapping.cash || mapping.bank)) {
        // Supplier advance payment
        const { data: entry } = await supabase
          .from('journal_entries')
          .insert({
            company_id: payment.company_id,
            reference_type: 'supplier_payment',
            reference_id: payment.id,
            entry_date: payment.payment_date,
            description: `سداد مورّد (${payment.payment_method})`
          })
          .select()
          .single()

        if (entry) {
          await supabase.from('journal_entry_lines').insert([
            {
              journal_entry_id: entry.id,
              account_id: mapping.supplierAdvance,
              debit_amount: Number(payment.amount || 0),
              credit_amount: 0,
              description: 'سلف للموردين'
            },
            {
              journal_entry_id: entry.id,
              account_id: mapping.cash || mapping.bank,
              debit_amount: 0,
              credit_amount: Number(payment.amount || 0),
              description: 'نقد/بنك'
            }
          ])
          fixed++
          console.log(`   ✅ تم إصلاح دفعة مورد`)
        }
      } else {
        skipped++
      }

    } catch (err) {
      console.error(`   ❌ خطأ:`, err.message)
      errors++
    }
  }

  console.log(`\n📊 النتائج:`)
  console.log(`   • تم الإصلاح: ${fixed}`)
  console.log(`   • تم التخطي: ${skipped}`)
  console.log(`   • أخطاء: ${errors}`)

  return { fixed, skipped, errors }
}

// =============================================
// Main Function
// =============================================

async function main() {
  try {
    printHeader('🔧 إصلاح القيود المحاسبية المفقودة')
    console.log('تاريخ التنفيذ:', new Date().toLocaleString('ar-EG'))

    const results = {
      invoices: await fixInvoiceJournals(),
      payments: await fixPaymentJournals()
    }

    printHeader('📊 ملخص الإصلاح')
    console.log(`\n✅ الفواتير:`)
    console.log(`   • تم الإصلاح: ${results.invoices.fixed}`)
    console.log(`   • تم التخطي: ${results.invoices.skipped}`)
    console.log(`   • أخطاء: ${results.invoices.errors}`)

    console.log(`\n✅ المدفوعات:`)
    console.log(`   • تم الإصلاح: ${results.payments.fixed}`)
    console.log(`   • تم التخطي: ${results.payments.skipped}`)
    console.log(`   • أخطاء: ${results.payments.errors}`)

    const totalFixed = results.invoices.fixed + results.payments.fixed
    const totalErrors = results.invoices.errors + results.payments.errors

    console.log(`\n📈 الإجمالي:`)
    console.log(`   • إجمالي الإصلاحات: ${totalFixed}`)
    console.log(`   • إجمالي الأخطاء: ${totalErrors}`)

    if (totalFixed > 0) {
      console.log(`\n✅ تم إصلاح ${totalFixed} قيد محاسبي`)
      console.log(`\n💡 نصيحة: شغل المراجعة مرة أخرى للتحقق:`)
      console.log(`   npm run audit:quick`)
    }

    printHeader('✅ اكتمل الإصلاح')

  } catch (error) {
    console.error('\n❌ خطأ في تنفيذ الإصلاح:', error.message)
    process.exit(1)
  }
}

// تنفيذ السكربت
if (require.main === module) {
  main()
}

module.exports = { main, fixInvoiceJournals, fixPaymentJournals }

