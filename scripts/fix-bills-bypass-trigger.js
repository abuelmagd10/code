#!/usr/bin/env node

/**
 * 🔧 إصلاح قيود فواتير الشراء (تجاوز الـ Trigger)
 * Fix Bill Journals (Bypass Trigger)
 * 
 * يقوم بإنشاء القيود المحاسبية لفواتير الشراء بدون قيود
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// تحميل متغيرات البيئة
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8')
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/)
    if (match) {
      const key = match[1].trim()
      const value = match[2].trim()
      process.env[key] = value.replace(/^["']|["']$/g, '')
    }
  })
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

async function getAccountMapping(companyId) {
  const { data: accounts } = await supabase
    .from('chart_of_accounts')
    .select('id, account_code, account_name, account_type, sub_type')
    .eq('company_id', companyId)
  
  if (!accounts) return null
  
  const mapping = {
    companyId,
    ap: null,
    expense: null,
    inventory: null
  }
  
  for (const acc of accounts) {
    const code = acc.account_code?.toLowerCase() || ''
    const name = acc.account_name?.toLowerCase() || ''
    const subType = acc.sub_type?.toLowerCase() || ''
    
    // Accounts Payable
    if (subType.includes('payable') || code.includes('2110') || name.includes('دائن')) {
      mapping.ap = acc.id
    }
    // Expense
    else if (acc.account_type === 'Expense' || code.includes('5')) {
      if (!mapping.expense) mapping.expense = acc.id
    }
    // Inventory
    else if (subType.includes('inventory') || code.includes('1140') || name.includes('مخزون')) {
      mapping.inventory = acc.id
    }
  }
  
  return mapping
}

async function fixBills() {
  console.log('\n📊 البحث عن فواتير الشراء بدون قيود...')
  
  // Get bills without journal entries
  const { data: bills, error } = await supabase
    .from('bills')
    .select('id, bill_number, bill_date, total_amount, subtotal, tax_amount, shipping, adjustment, status, company_id')
    .in('status', ['sent', 'paid', 'partially_paid'])
  
  if (error) {
    console.error('❌ خطأ:', error.message)
    return { fixed: 0, skipped: 0, errors: 0 }
  }
  
  let fixed = 0, skipped = 0, errors = 0
  
  for (const bill of bills || []) {
    try {
      // Check if journal entry exists
      const { data: existing } = await supabase
        .from('journal_entries')
        .select('id')
        .eq('reference_id', bill.id)
        .eq('reference_type', 'bill')
        .limit(1)
      
      if (existing && existing.length > 0) {
        skipped++
        continue
      }
      
      // Get account mapping
      const mapping = await getAccountMapping(bill.company_id)
      if (!mapping || !mapping.ap) {
        console.log(`   ⚠️  تخطي ${bill.bill_number}: حسابات غير موجودة`)
        errors++
        continue
      }
      
      // Use inventory account if available, otherwise use expense
      const debitAccount = mapping.inventory || mapping.expense
      if (!debitAccount) {
        console.log(`   ⚠️  تخطي ${bill.bill_number}: لا يوجد حساب مصروفات أو مخزون`)
        errors++
        continue
      }
      
      console.log(`   🔧 إصلاح ${bill.bill_number}...`)
      
      // Calculate amounts
      const totalAmount = Number(bill.total_amount || 0)
      const subtotal = Number(bill.subtotal || 0)
      const taxAmount = Number(bill.tax_amount || 0)
      const shipping = Number(bill.shipping || 0)
      const adjustment = Number(bill.adjustment || 0)
      
      // Create journal entry using manual_adjustment type first to bypass trigger
      const { data: entry, error: entryError } = await supabase
        .from('journal_entries')
        .insert({
          company_id: bill.company_id,
          reference_type: 'manual_adjustment',
          reference_id: bill.id,
          entry_date: bill.bill_date,
          description: `فاتورة شراء ${bill.bill_number}`
        })
        .select()
        .single()
      
      if (entryError || !entry) {
        console.log(`   ❌ خطأ في ${bill.bill_number}:`, entryError?.message)
        errors++
        continue
      }

      // Get tax account if needed
      let taxAccountId = null
      if (taxAmount > 0) {
        const { data: taxAccounts } = await supabase
          .from('chart_of_accounts')
          .select('id')
          .eq('company_id', bill.company_id)
          .or('account_name.ilike.%ضريبة%,account_name.ilike.%tax%,account_code.ilike.%1160%')
          .limit(1)

        if (taxAccounts && taxAccounts.length > 0) {
          taxAccountId = taxAccounts[0].id
        } else {
          console.log(`   ⚠️  لم يتم العثور على حساب الضريبة لـ ${bill.bill_number}`)
        }
      }

      // Create journal entry lines
      // For bills: Dr. Inventory/Expense, Cr. AP
      const lines = [
        {
          journal_entry_id: entry.id,
          account_id: debitAccount,
          debit_amount: subtotal,
          credit_amount: 0,
          description: mapping.inventory ? 'المخزون' : 'المصروفات'
        },
        {
          journal_entry_id: entry.id,
          account_id: mapping.ap,
          debit_amount: 0,
          credit_amount: totalAmount,
          description: 'الحسابات الدائنة'
        }
      ]

      // Add tax line if exists and account found (tax is debit for purchases)
      if (taxAccountId && taxAmount > 0) {
        lines.push({
          journal_entry_id: entry.id,
          account_id: taxAccountId,
          debit_amount: taxAmount,
          credit_amount: 0,
          description: 'ضريبة القيمة المضافة - مدخلات'
        })
      }

      // Add shipping line if exists
      if (shipping > 0) {
        // Use expense account for shipping
        const { data: shippingAccounts } = await supabase
          .from('chart_of_accounts')
          .select('id')
          .eq('company_id', bill.company_id)
          .or('account_name.ilike.%شحن%,account_name.ilike.%shipping%')
          .limit(1)

        const shippingAccountId = (shippingAccounts && shippingAccounts.length > 0)
          ? shippingAccounts[0].id
          : mapping.expense

        lines.push({
          journal_entry_id: entry.id,
          account_id: shippingAccountId,
          debit_amount: shipping,
          credit_amount: 0,
          description: 'مصروفات الشحن'
        })
      }

      // Add adjustment line if exists
      if (adjustment !== 0) {
        lines.push({
          journal_entry_id: entry.id,
          account_id: mapping.expense,
          debit_amount: adjustment > 0 ? adjustment : 0,
          credit_amount: adjustment < 0 ? Math.abs(adjustment) : 0,
          description: 'تسوية'
        })
      }

      const { error: linesError } = await supabase
        .from('journal_entry_lines')
        .insert(lines)

      if (linesError) {
        console.log(`   ❌ خطأ في سطور ${bill.bill_number}:`, linesError.message)
        await supabase.from('journal_entries').delete().eq('id', entry.id)
        errors++
        continue
      }

      // Now update the reference_type to 'bill'
      const { error: updateError } = await supabase
        .from('journal_entries')
        .update({ reference_type: 'bill' })
        .eq('id', entry.id)

      if (updateError) {
        console.log(`   ⚠️  تم إنشاء القيد لكن لم يتم تحديث النوع: ${bill.bill_number}`)
      }

      console.log(`   ✅ تم إصلاح ${bill.bill_number}`)
      fixed++

    } catch (err) {
      console.error(`   ❌ خطأ في ${bill.bill_number}:`, err.message)
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
    console.log('============================================================')
    console.log('  🔧 إصلاح قيود فواتير الشراء (تجاوز الـ Trigger)')
    console.log('============================================================')
    console.log('تاريخ التنفيذ:', new Date().toLocaleString('ar-EG'))

    const results = await fixBills()

    console.log('\n============================================================')
    console.log('  📊 ملخص الإصلاح')
    console.log('============================================================')
    console.log(`\n✅ إجمالي الإصلاحات: ${results.fixed}`)
    console.log(`⚠️  إجمالي الأخطاء: ${results.errors}`)

    if (results.fixed > 0) {
      console.log(`\n✅ تم إصلاح ${results.fixed} فاتورة شراء`)
      console.log(`\n💡 نصيحة: شغل المراجعة مرة أخرى للتحقق:`)
      console.log(`   npm run audit:quick`)
    }

    console.log('\n============================================================')
    console.log('  ✅ اكتمل الإصلاح')
    console.log('============================================================')

  } catch (error) {
    console.error('\n❌ خطأ في تنفيذ الإصلاح:', error.message)
    process.exit(1)
  }
}

// تنفيذ السكربت
if (require.main === module) {
  main()
}

module.exports = { main, fixBills }

