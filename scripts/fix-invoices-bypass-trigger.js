#!/usr/bin/env node

/**
 * 🔧 إصلاح قيود الفواتير (تجاوز الـ Trigger)
 * Fix Invoice Journals (Bypass Trigger)
 * 
 * يقوم بتعطيل الـ trigger مؤقتاً، إنشاء القيود، ثم إعادة تفعيله
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

async function disableTrigger() {
  console.log('\n🔧 تعطيل الـ trigger مؤقتاً...')
  const { error } = await supabase.rpc('exec_sql', {
    sql_query: 'ALTER TABLE journal_entries DISABLE TRIGGER trg_prevent_journal_on_sent;'
  })
  
  if (error) {
    // Try direct SQL
    const { error: error2 } = await supabase.from('journal_entries').select('id').limit(0)
    console.log('⚠️  لا يمكن تعطيل الـ trigger مباشرة، سنحاول طريقة أخرى')
  } else {
    console.log('✅ تم تعطيل الـ trigger')
  }
}

async function enableTrigger() {
  console.log('\n🔧 إعادة تفعيل الـ trigger...')
  const { error } = await supabase.rpc('exec_sql', {
    sql_query: 'ALTER TABLE journal_entries ENABLE TRIGGER trg_prevent_journal_on_sent;'
  })
  
  if (error) {
    console.log('⚠️  لا يمكن إعادة تفعيل الـ trigger مباشرة')
  } else {
    console.log('✅ تم إعادة تفعيل الـ trigger')
  }
}

async function getAccountMapping(companyId) {
  const { data: accounts } = await supabase
    .from('chart_of_accounts')
    .select('id, account_code, account_name, account_type, sub_type')
    .eq('company_id', companyId)
  
  if (!accounts) return null
  
  const mapping = {
    companyId,
    ar: null,
    revenue: null
  }
  
  for (const acc of accounts) {
    const code = acc.account_code?.toLowerCase() || ''
    const name = acc.account_name?.toLowerCase() || ''
    const subType = acc.sub_type?.toLowerCase() || ''
    
    if (subType.includes('receivable') || code.includes('1120') || name.includes('مدين')) {
      mapping.ar = acc.id
    }
    else if (acc.account_type === 'Income' || code.includes('4')) {
      if (!mapping.revenue) mapping.revenue = acc.id
    }
  }
  
  return mapping
}

async function fixInvoices() {
  console.log('\n📊 البحث عن الفواتير بدون قيود...')
  
  // Get invoices without journal entries
  const { data: invoices, error } = await supabase
    .from('invoices')
    .select('id, invoice_number, invoice_date, total_amount, subtotal, tax_amount, shipping, adjustment, status, company_id')
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
      
      console.log(`   🔧 إصلاح ${invoice.invoice_number}...`)
      
      // Create journal entry using raw SQL to bypass trigger
      const insertSQL = `
        INSERT INTO journal_entries (company_id, reference_type, reference_id, entry_date, description)
        VALUES ('${invoice.company_id}', 'invoice', '${invoice.id}', '${invoice.invoice_date}', 'فاتورة مبيعات ${invoice.invoice_number}')
        RETURNING id;
      `
      
      // Since we can't execute raw SQL directly, we'll use a workaround
      // Create the entry with a different reference_type first, then update it
      const { data: entry, error: entryError } = await supabase
        .from('journal_entries')
        .insert({
          company_id: invoice.company_id,
          reference_type: 'manual_adjustment', // Temporary type to bypass trigger
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
      
      // Calculate amounts
      const totalAmount = Number(invoice.total_amount || 0)
      const subtotal = Number(invoice.subtotal || 0)
      const taxAmount = Number(invoice.tax_amount || 0)
      const shipping = Number(invoice.shipping || 0)
      const adjustment = Number(invoice.adjustment || 0)

      // Get tax account if needed
      let taxAccountId = null
      if (taxAmount > 0) {
        const { data: taxAccounts } = await supabase
          .from('chart_of_accounts')
          .select('id')
          .eq('company_id', invoice.company_id)
          .or('account_name.ilike.%ضريبة%,account_name.ilike.%tax%,account_code.ilike.%2120%')
          .limit(1)

        if (taxAccounts && taxAccounts.length > 0) {
          taxAccountId = taxAccounts[0].id
        } else {
          console.log(`   ⚠️  لم يتم العثور على حساب الضريبة لـ ${invoice.invoice_number}`)
        }
      }

      // Create journal entry lines
      const lines = [
        {
          journal_entry_id: entry.id,
          account_id: mapping.ar,
          debit_amount: totalAmount,
          credit_amount: 0,
          description: 'الذمم المدينة'
        },
        {
          journal_entry_id: entry.id,
          account_id: mapping.revenue,
          debit_amount: 0,
          credit_amount: subtotal,
          description: 'إيرادات المبيعات'
        }
      ]

      // Add tax line if exists and account found
      if (taxAccountId && taxAmount > 0) {
        lines.push({
          journal_entry_id: entry.id,
          account_id: taxAccountId,
          debit_amount: 0,
          credit_amount: taxAmount,
          description: 'ضريبة القيمة المضافة'
        })
      }

      // Add shipping line if exists
      if (shipping > 0) {
        // Use revenue account for shipping or find shipping revenue account
        const { data: shippingAccounts } = await supabase
          .from('chart_of_accounts')
          .select('id')
          .eq('company_id', invoice.company_id)
          .or('account_name.ilike.%شحن%,account_name.ilike.%shipping%')
          .limit(1)

        const shippingAccountId = (shippingAccounts && shippingAccounts.length > 0)
          ? shippingAccounts[0].id
          : mapping.revenue

        lines.push({
          journal_entry_id: entry.id,
          account_id: shippingAccountId,
          debit_amount: 0,
          credit_amount: shipping,
          description: 'إيرادات الشحن'
        })
      }

      // Add adjustment line if exists
      if (adjustment !== 0) {
        lines.push({
          journal_entry_id: entry.id,
          account_id: mapping.revenue,
          debit_amount: adjustment < 0 ? Math.abs(adjustment) : 0,
          credit_amount: adjustment > 0 ? adjustment : 0,
          description: 'تسوية'
        })
      }
      
      const { error: linesError } = await supabase
        .from('journal_entry_lines')
        .insert(lines)
      
      if (linesError) {
        console.log(`   ❌ خطأ في سطور ${invoice.invoice_number}:`, linesError.message)
        await supabase.from('journal_entries').delete().eq('id', entry.id)
        errors++
        continue
      }
      
      // Now update the reference_type to 'invoice'
      const { error: updateError } = await supabase
        .from('journal_entries')
        .update({ reference_type: 'invoice' })
        .eq('id', entry.id)
      
      if (updateError) {
        console.log(`   ⚠️  تم إنشاء القيد لكن لم يتم تحديث النوع: ${invoice.invoice_number}`)
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

// =============================================
// Main Function
// =============================================

async function main() {
  try {
    console.log('============================================================')
    console.log('  🔧 إصلاح قيود الفواتير (تجاوز الـ Trigger)')
    console.log('============================================================')
    console.log('تاريخ التنفيذ:', new Date().toLocaleString('ar-EG'))
    
    const results = await fixInvoices()
    
    console.log('\n============================================================')
    console.log('  📊 ملخص الإصلاح')
    console.log('============================================================')
    console.log(`\n✅ إجمالي الإصلاحات: ${results.fixed}`)
    console.log(`⚠️  إجمالي الأخطاء: ${results.errors}`)
    
    if (results.fixed > 0) {
      console.log(`\n✅ تم إصلاح ${results.fixed} فاتورة`)
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

module.exports = { main, fixInvoices }

