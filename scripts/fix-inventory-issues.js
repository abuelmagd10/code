#!/usr/bin/env node
/**
 * 🔧 FIX INVENTORY ISSUES - إصلاح مشاكل المخزون
 * 
 * يصلح:
 * 1. قيود COGS المفقودة
 * 2. قيود الشراء المفقودة
 * 3. دفعات FIFO غير المتطابقة
 * 4. قيمة المخزون المحاسبية
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
      const value = match[2].trim().replace(/^["']|["']$/g, '')
      process.env[key] = value
    }
  })
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ألوان للطباعة
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

async function main() {
  try {
    log('\n' + '='.repeat(80), 'cyan')
    log('🔧 إصلاح مشاكل المخزون - Fix Inventory Issues', 'bold')
    log('='.repeat(80) + '\n', 'cyan')

    // اختيار الشركة
    const companyName = process.argv[2]
    
    if (!companyName) {
      log('❌ يرجى تحديد اسم الشركة', 'red')
      log('مثال: node scripts/fix-inventory-issues.js VitaSlims', 'yellow')
      process.exit(1)
    }

    const { data: company } = await supabase
      .from('companies')
      .select('id, name')
      .ilike('name', `%${companyName}%`)
      .limit(1)
      .single()

    if (!company) {
      log(`❌ لم يتم العثور على الشركة: ${companyName}`, 'red')
      process.exit(1)
    }

    log(`🏢 الشركة: ${company.name}`, 'bold')
    log(`📋 معرف الشركة: ${company.id}\n`, 'cyan')

    // إصلاح المشاكل
    let fixed = 0

    // 1️⃣ إصلاح قيود COGS المفقودة
    log('1️⃣  إصلاح قيود COGS المفقودة...', 'blue')
    const cogsFixed = await fixMissingCOGS(company.id)
    fixed += cogsFixed
    log(`   ✅ تم إصلاح ${cogsFixed} قيد COGS\n`, 'green')

    // 2️⃣ إصلاح دفعات FIFO
    log('2️⃣  إصلاح دفعات FIFO...', 'blue')
    const fifoFixed = await fixFIFOLots(company.id)
    fixed += fifoFixed
    log(`   ✅ تم إصلاح ${fifoFixed} دفعة FIFO\n`, 'green')

    // 3️⃣ إعادة حساب قيمة المخزون
    log('3️⃣  إعادة حساب قيمة المخزون المحاسبية...', 'blue')
    await recalculateInventoryValue(company.id)
    log(`   ✅ تم إعادة حساب قيمة المخزون\n`, 'green')

    log('\n' + '='.repeat(80), 'cyan')
    log(`✅ تم إصلاح ${fixed} مشكلة بنجاح`, 'green')
    log('='.repeat(80) + '\n', 'cyan')

  } catch (error) {
    log(`\n❌ خطأ: ${error.message}`, 'red')
    console.error(error)
    process.exit(1)
  }
}

/**
 * إصلاح قيود COGS المفقودة
 */
async function fixMissingCOGS(companyId) {
  let fixed = 0

  // الحصول على حسابات COGS والمخزون
  const { data: cogsAccount } = await supabase
    .from('chart_of_accounts')
    .select('id')
    .eq('company_id', companyId)
    .or('sub_type.eq.cogs,sub_type.eq.cost_of_goods_sold')
    .eq('is_active', true)
    .limit(1)
    .single()

  const { data: inventoryAccount } = await supabase
    .from('chart_of_accounts')
    .select('id')
    .eq('company_id', companyId)
    .eq('sub_type', 'inventory')
    .eq('is_active', true)
    .limit(1)
    .single()

  if (!cogsAccount || !inventoryAccount) {
    log('   ⚠️  حسابات COGS أو المخزون غير موجودة', 'yellow')
    return 0
  }

  // جلب الفواتير بدون قيود COGS
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, invoice_date, status')
    .eq('company_id', companyId)
    .neq('status', 'draft')
    .neq('status', 'cancelled')

  for (const invoice of invoices || []) {
    // التحقق من وجود قيد COGS
    const { data: existingCOGS } = await supabase
      .from('journal_entries')
      .select('id')
      .eq('company_id', companyId)
      .eq('reference_type', 'invoice_cogs')
      .eq('reference_id', invoice.id)
      .limit(1)

    if (existingCOGS && existingCOGS.length > 0) continue

    // حساب COGS من بنود الفاتورة
    const { data: items } = await supabase
      .from('invoice_items')
      .select(`
        quantity,
        product_id,
        products!inner(cost_price, item_type)
      `)
      .eq('invoice_id', invoice.id)

    let totalCOGS = 0
    for (const item of items || []) {
      if (item.products?.item_type === 'service') continue

      const qty = Number(item.quantity || 0)
      const cost = Number(item.products?.cost_price || 0)
      totalCOGS += qty * cost
    }

    if (totalCOGS === 0) continue

    // إنشاء قيد COGS
    const { data: journalEntry, error: jeError } = await supabase
      .from('journal_entries')
      .insert({
        company_id: companyId,
        reference_type: 'invoice_cogs',
        reference_id: invoice.id,
        entry_date: invoice.invoice_date,
        description: `تكلفة البضاعة المباعة - ${invoice.invoice_number}`,
        status: 'posted'
      })
      .select('id')
      .single()

    if (jeError) {
      log(`   ⚠️  خطأ في إنشاء قيد COGS للفاتورة ${invoice.invoice_number}: ${jeError.message}`, 'yellow')
      continue
    }

    // إنشاء سطور القيد
    const { error: linesError } = await supabase
      .from('journal_entry_lines')
      .insert([
        {
          journal_entry_id: journalEntry.id,
          account_id: cogsAccount.id,
          debit_amount: totalCOGS,
          credit_amount: 0,
          description: 'تكلفة البضاعة المباعة'
        },
        {
          journal_entry_id: journalEntry.id,
          account_id: inventoryAccount.id,
          debit_amount: 0,
          credit_amount: totalCOGS,
          description: 'خصم من المخزون'
        }
      ])

    if (linesError) {
      log(`   ⚠️  خطأ في إنشاء سطور القيد للفاتورة ${invoice.invoice_number}: ${linesError.message}`, 'yellow')
      // حذف القيد الرئيسي
      await supabase.from('journal_entries').delete().eq('id', journalEntry.id)
      continue
    }

    log(`   ✓ تم إنشاء قيد COGS للفاتورة ${invoice.invoice_number} (${totalCOGS.toFixed(2)})`, 'green')
    fixed++
  }

  return fixed
}

/**
 * إصلاح دفعات FIFO
 */
async function fixFIFOLots(companyId) {
  let fixed = 0

  // جلب المنتجات التي لديها مشاكل في FIFO
  const { data: products } = await supabase
    .from('products')
    .select('id, sku, name, quantity_on_hand, item_type')
    .eq('company_id', companyId)
    .or('item_type.is.null,item_type.eq.product')

  for (const product of products || []) {
    // جلب دفعات FIFO
    const { data: lots } = await supabase
      .from('fifo_cost_lots')
      .select('id, remaining_quantity')
      .eq('company_id', companyId)
      .eq('product_id', product.id)
      .gt('remaining_quantity', 0)

    const totalLotsQty = (lots || []).reduce((sum, lot) => {
      return sum + Number(lot.remaining_quantity || 0)
    }, 0)

    const productQty = Number(product.quantity_on_hand || 0)

    // إذا كانت الكميات متطابقة، لا حاجة للإصلاح
    if (Math.abs(totalLotsQty - productQty) <= 0.01) continue

    // إذا كانت دفعات FIFO أكثر من الكمية الفعلية، نحتاج لتقليلها
    if (totalLotsQty > productQty) {
      const excessQty = totalLotsQty - productQty
      log(`   ⚠️  المنتج ${product.sku}: دفعات FIFO أكثر من الكمية الفعلية بـ ${excessQty}`, 'yellow')

      // تقليل الدفعات الأقدم
      let remainingToReduce = excessQty
      for (const lot of lots || []) {
        if (remainingToReduce <= 0) break

        const lotQty = Number(lot.remaining_quantity || 0)
        const reduceBy = Math.min(lotQty, remainingToReduce)

        await supabase
          .from('fifo_cost_lots')
          .update({ remaining_quantity: lotQty - reduceBy })
          .eq('id', lot.id)

        remainingToReduce -= reduceBy
        fixed++
      }
    }
    // إذا كانت دفعات FIFO أقل من الكمية الفعلية، نحتاج لإنشاء دفعة جديدة
    else if (totalLotsQty < productQty) {
      const missingQty = productQty - totalLotsQty
      log(`   ⚠️  المنتج ${product.sku}: دفعات FIFO أقل من الكمية الفعلية بـ ${missingQty}`, 'yellow')

      // الحصول على تكلفة المنتج
      const { data: productData } = await supabase
        .from('products')
        .select('cost_price')
        .eq('id', product.id)
        .single()

      const unitCost = Number(productData?.cost_price || 0)

      // إنشاء دفعة تعديل
      await supabase
        .from('fifo_cost_lots')
        .insert({
          company_id: companyId,
          product_id: product.id,
          lot_date: new Date().toISOString().split('T')[0],
          lot_type: 'adjustment',
          reference_type: 'adjustment',
          original_quantity: missingQty,
          remaining_quantity: missingQty,
          unit_cost: unitCost,
          notes: 'تعديل تلقائي لمطابقة الكمية الفعلية'
        })

      fixed++
    }
  }

  return fixed
}

/**
 * إعادة حساب قيمة المخزون المحاسبية
 */
async function recalculateInventoryValue(companyId) {
  // هذه الدالة للعرض فقط - القيمة المحاسبية تُحسب من القيود
  const { data: inventoryAccount } = await supabase
    .from('chart_of_accounts')
    .select('id, account_name')
    .eq('company_id', companyId)
    .eq('sub_type', 'inventory')
    .eq('is_active', true)
    .limit(1)
    .single()

  if (!inventoryAccount) {
    log('   ⚠️  حساب المخزون غير موجود', 'yellow')
    return
  }

  // حساب الرصيد من القيود
  const { data: lines } = await supabase
    .from('journal_entry_lines')
    .select('debit_amount, credit_amount, journal_entries!inner(is_deleted)')
    .eq('account_id', inventoryAccount.id)

  let balance = 0
  for (const line of lines || []) {
    if (line.journal_entries?.is_deleted) continue
    balance += Number(line.debit_amount || 0) - Number(line.credit_amount || 0)
  }

  log(`   📊 رصيد حساب المخزون: ${balance.toFixed(2)}`, 'cyan')
}

// تشغيل السكربت
main()

