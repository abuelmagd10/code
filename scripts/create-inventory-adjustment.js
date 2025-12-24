#!/usr/bin/env node

/**
 * إنشاء قيد تسوية للمخزون
 * Create Inventory Adjustment Entry
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

const envPath = path.join(__dirname, '..', '.env.local')
const envContent = fs.readFileSync(envPath, 'utf8')
const envVars = {}
envContent.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=')
  if (key && valueParts.length) {
    envVars[key.trim()] = valueParts.join('=').trim()
  }
})

const supabase = createClient(
  envVars.NEXT_PUBLIC_SUPABASE_URL,
  envVars.SUPABASE_SERVICE_ROLE_KEY
)

const log = (msg, color = 'white') => {
  const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    reset: '\x1b[0m'
  }
  console.log(`${colors[color]}${msg}${colors.reset}`)
}

async function createAdjustment(companyName, execute = false) {
  log(`\n${'='.repeat(80)}`, 'cyan')
  log(`🏢 الشركة: ${companyName}`, 'cyan')
  log('='.repeat(80), 'cyan')

  const { data: company } = await supabase
    .from('companies')
    .select('id, name')
    .ilike('name', `%${companyName}%`)
    .single()

  if (!company) {
    log('❌ الشركة غير موجودة', 'red')
    return
  }

  // 1. حساب قيمة المخزون من المنتجات
  const { data: products } = await supabase
    .from('products')
    .select('quantity_on_hand, cost_price')
    .eq('company_id', company.id)
    .or('item_type.is.null,item_type.eq.product')

  let inventoryValue = 0
  for (const product of products || []) {
    const qty = Number(product.quantity_on_hand || 0)
    const cost = Number(product.cost_price || 0)
    inventoryValue += qty * cost
  }

  log(`\n💰 قيمة المخزون من المنتجات: ${inventoryValue.toFixed(2)} جنيه`, 'cyan')

  // 2. حساب الرصيد المحاسبي الحالي
  const { data: inventoryAccount } = await supabase
    .from('chart_of_accounts')
    .select('id, account_code, account_name')
    .eq('company_id', company.id)
    .eq('sub_type', 'inventory')
    .single()

  if (!inventoryAccount) {
    log('❌ حساب المخزون غير موجود', 'red')
    return
  }

  const { data: lines } = await supabase
    .from('journal_entry_lines')
    .select('debit_amount, credit_amount, journal_entries!inner(is_deleted)')
    .eq('account_id', inventoryAccount.id)

  let accountingBalance = 0
  for (const line of lines || []) {
    if (line.journal_entries?.is_deleted) continue
    accountingBalance += Number(line.debit_amount || 0) - Number(line.credit_amount || 0)
  }

  log(`💰 الرصيد المحاسبي الحالي: ${accountingBalance.toFixed(2)} جنيه`, 'cyan')

  // 3. حساب الفرق
  const adjustment = inventoryValue - accountingBalance

  log(`📊 التسوية المطلوبة: ${adjustment.toFixed(2)} جنيه`, adjustment > 0 ? 'yellow' : 'green')

  if (Math.abs(adjustment) < 10) {
    log('\n✅ الفرق صغير جداً - لا حاجة لتسوية', 'green')
    return
  }

  // 4. البحث عن حساب تسوية المخزون أو COGS
  const { data: adjustmentAccount } = await supabase
    .from('chart_of_accounts')
    .select('id, account_code, account_name')
    .eq('company_id', company.id)
    .or('sub_type.eq.cost_of_goods_sold,account_code.eq.5000')
    .limit(1)
    .single()

  if (!adjustmentAccount) {
    log('❌ حساب التسوية غير موجود', 'red')
    return
  }

  log(`\n📋 قيد التسوية المقترح:`, 'yellow')
  log(`   التاريخ: ${new Date().toISOString().split('T')[0]}`, 'white')
  log(`   الوصف: تسوية المخزون - مطابقة الرصيد المحاسبي مع المخزون الفعلي`, 'white')
  log(`   النوع: inventory_adjustment`, 'white')
  log('', 'white')
  
  if (adjustment > 0) {
    log(`   مدين: ${inventoryAccount.account_code} - ${inventoryAccount.account_name}: ${adjustment.toFixed(2)}`, 'green')
    log(`   دائن: ${adjustmentAccount.account_code} - ${adjustmentAccount.account_name}: ${adjustment.toFixed(2)}`, 'red')
  } else {
    log(`   مدين: ${adjustmentAccount.account_code} - ${adjustmentAccount.account_name}: ${Math.abs(adjustment).toFixed(2)}`, 'green')
    log(`   دائن: ${inventoryAccount.account_code} - ${inventoryAccount.account_name}: ${Math.abs(adjustment).toFixed(2)}`, 'red')
  }

  if (execute) {
    log(`\n🔧 جاري إنشاء قيد التسوية...`, 'yellow')

    // إنشاء القيد
    const { data: journalEntry, error: jeError } = await supabase
      .from('journal_entries')
      .insert({
        company_id: company.id,
        entry_date: new Date().toISOString().split('T')[0],
        reference_type: 'inventory_adjustment',
        description: 'تسوية المخزون - مطابقة الرصيد المحاسبي مع المخزون الفعلي',
        is_deleted: false
      })
      .select()
      .single()

    if (jeError) {
      log(`❌ خطأ في إنشاء القيد: ${jeError.message}`, 'red')
      return
    }

    // إنشاء سطور القيد
    const journalLines = []
    
    if (adjustment > 0) {
      journalLines.push({
        journal_entry_id: journalEntry.id,
        account_id: inventoryAccount.id,
        debit_amount: adjustment,
        credit_amount: 0,
        description: 'تسوية المخزون'
      })
      journalLines.push({
        journal_entry_id: journalEntry.id,
        account_id: adjustmentAccount.id,
        debit_amount: 0,
        credit_amount: adjustment,
        description: 'تسوية المخزون'
      })
    } else {
      journalLines.push({
        journal_entry_id: journalEntry.id,
        account_id: adjustmentAccount.id,
        debit_amount: Math.abs(adjustment),
        credit_amount: 0,
        description: 'تسوية المخزون'
      })
      journalLines.push({
        journal_entry_id: journalEntry.id,
        account_id: inventoryAccount.id,
        debit_amount: 0,
        credit_amount: Math.abs(adjustment),
        description: 'تسوية المخزون'
      })
    }

    const { error: linesError } = await supabase
      .from('journal_entry_lines')
      .insert(journalLines)

    if (linesError) {
      log(`❌ خطأ في إنشاء سطور القيد: ${linesError.message}`, 'red')
      return
    }

    log(`✅ تم إنشاء قيد التسوية بنجاح!`, 'green')
    log(`   معرف القيد: ${journalEntry.id}`, 'white')
  } else {
    log(`\n⚠️  هذا عرض فقط. لإنشاء القيد فعلياً، أضف المعامل: --execute`, 'yellow')
  }

  return {
    companyName: company.name,
    inventoryValue,
    accountingBalance,
    adjustment
  }
}

async function main() {
  log('\n' + '='.repeat(80), 'cyan')
  log('🔧 إنشاء قيد تسوية للمخزون', 'cyan')
  log('='.repeat(80) + '\n', 'cyan')

  const args = process.argv.slice(2)
  const execute = args.includes('--execute')
  const companyNames = args.filter(arg => arg !== '--execute')
  
  if (companyNames.length === 0) {
    companyNames.push('VitaSlims', 'FOODCAN')
  }

  for (const companyName of companyNames) {
    await createAdjustment(companyName, execute)
  }
}

main()

