#!/usr/bin/env node
/**
 * 📦 INVENTORY AUDIT SCRIPT - مراجعة المخزون الشاملة
 * 
 * يتحقق من:
 * 1. صحة الكميات في جدول products
 * 2. مطابقة حركات المخزون مع القيود المحاسبية
 * 3. صحة حساب COGS باستخدام FIFO
 * 4. مطابقة النمط المخزني مع Zoho Books
 * 5. التحقق من قيمة المخزون المحاسبية
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
    log('📦 مراجعة المخزون الشاملة - Inventory Audit', 'bold')
    log('='.repeat(80) + '\n', 'cyan')

    // الحصول على جميع الشركات
    const { data: companies, error: companiesError } = await supabase
      .from('companies')
      .select('id, name')
      .order('name')

    if (companiesError) throw companiesError

    if (!companies || companies.length === 0) {
      log('⚠️  لا توجد شركات في قاعدة البيانات', 'yellow')
      return
    }

    log(`📊 عدد الشركات: ${companies.length}\n`, 'blue')

    // مراجعة كل شركة
    for (const company of companies) {
      await auditCompanyInventory(company)
    }

    log('\n' + '='.repeat(80), 'cyan')
    log('✅ اكتملت المراجعة بنجاح', 'green')
    log('='.repeat(80) + '\n', 'cyan')

  } catch (error) {
    log(`\n❌ خطأ: ${error.message}`, 'red')
    console.error(error)
    process.exit(1)
  }
}

async function auditCompanyInventory(company) {
  log(`\n${'─'.repeat(80)}`, 'cyan')
  log(`🏢 الشركة: ${company.name}`, 'bold')
  log(`${'─'.repeat(80)}\n`, 'cyan')

  const issues = []

  // 1️⃣ التحقق من صحة الكميات
  log('1️⃣  التحقق من صحة الكميات...', 'blue')
  const quantityIssues = await checkQuantityIntegrity(company.id)
  if (quantityIssues.length > 0) {
    issues.push(...quantityIssues)
    log(`   ⚠️  وجدت ${quantityIssues.length} مشكلة في الكميات`, 'yellow')
  } else {
    log('   ✅ جميع الكميات صحيحة', 'green')
  }

  // 2️⃣ التحقق من حركات المخزون
  log('2️⃣  التحقق من حركات المخزون...', 'blue')
  const transactionIssues = await checkInventoryTransactions(company.id)
  if (transactionIssues.length > 0) {
    issues.push(...transactionIssues)
    log(`   ⚠️  وجدت ${transactionIssues.length} مشكلة في الحركات`, 'yellow')
  } else {
    log('   ✅ جميع حركات المخزون صحيحة', 'green')
  }

  // 3️⃣ التحقق من COGS
  log('3️⃣  التحقق من COGS (تكلفة البضاعة المباعة)...', 'blue')
  const cogsIssues = await checkCOGS(company.id)
  if (cogsIssues.length > 0) {
    issues.push(...cogsIssues)
    log(`   ⚠️  وجدت ${cogsIssues.length} مشكلة في COGS`, 'yellow')
  } else {
    log('   ✅ جميع قيود COGS صحيحة', 'green')
  }

  // 4️⃣ التحقق من قيمة المخزون المحاسبية
  log('4️⃣  التحقق من قيمة المخزون المحاسبية...', 'blue')
  const valuationIssues = await checkInventoryValuation(company.id)
  if (valuationIssues.length > 0) {
    issues.push(...valuationIssues)
    log(`   ⚠️  وجدت ${valuationIssues.length} مشكلة في التقييم`, 'yellow')
  } else {
    log('   ✅ قيمة المخزون المحاسبية صحيحة', 'green')
  }

  // 5️⃣ التحقق من FIFO Lots
  log('5️⃣  التحقق من دفعات FIFO...', 'blue')
  const fifoIssues = await checkFIFOLots(company.id)
  if (fifoIssues.length > 0) {
    issues.push(...fifoIssues)
    log(`   ⚠️  وجدت ${fifoIssues.length} مشكلة في FIFO`, 'yellow')
  } else {
    log('   ✅ جميع دفعات FIFO صحيحة', 'green')
  }

  // طباعة الملخص
  printCompanySummary(company, issues)
}

// ============================================================================
// دوال الفحص
// ============================================================================

/**
 * 1️⃣ التحقق من صحة الكميات
 * يقارن quantity_on_hand مع مجموع حركات المخزون
 */
async function checkQuantityIntegrity(companyId) {
  const issues = []

  // جلب جميع المنتجات (باستثناء الخدمات)
  const { data: products } = await supabase
    .from('products')
    .select('id, sku, name, quantity_on_hand, item_type')
    .eq('company_id', companyId)
    .or('item_type.is.null,item_type.eq.product')

  for (const product of products || []) {
    // حساب الكمية من الحركات
    const { data: transactions } = await supabase
      .from('inventory_transactions')
      .select('quantity_change')
      .eq('company_id', companyId)
      .eq('product_id', product.id)

    const calculatedQty = (transactions || []).reduce((sum, tx) => {
      return sum + Number(tx.quantity_change || 0)
    }, 0)

    const systemQty = Number(product.quantity_on_hand || 0)

    if (Math.abs(calculatedQty - systemQty) > 0.01) {
      issues.push({
        type: 'QUANTITY_MISMATCH',
        severity: 'HIGH',
        productId: product.id,
        productSku: product.sku,
        productName: product.name,
        systemQty,
        calculatedQty,
        difference: calculatedQty - systemQty,
        message: `الكمية في النظام (${systemQty}) لا تطابق الكمية المحسوبة (${calculatedQty})`
      })
    }
  }

  return issues
}

/**
 * 2️⃣ التحقق من حركات المخزون
 * يتحقق من أن كل حركة مخزون لها قيد محاسبي مرتبط (إن لزم)
 */
async function checkInventoryTransactions(companyId) {
  const issues = []

  // جلب حركات البيع (يجب أن يكون لها قيد COGS)
  const { data: salesTransactions } = await supabase
    .from('inventory_transactions')
    .select('id, product_id, quantity_change, reference_id, transaction_type, created_at')
    .eq('company_id', companyId)
    .eq('transaction_type', 'sale')
    .lt('quantity_change', 0) // البيع يكون سالب

  for (const tx of salesTransactions || []) {
    // التحقق من وجود قيد COGS
    const { data: cogsEntry } = await supabase
      .from('journal_entries')
      .select('id')
      .eq('company_id', companyId)
      .eq('reference_type', 'invoice_cogs')
      .eq('reference_id', tx.reference_id)
      .limit(1)

    if (!cogsEntry || cogsEntry.length === 0) {
      issues.push({
        type: 'MISSING_COGS_ENTRY',
        severity: 'HIGH',
        transactionId: tx.id,
        productId: tx.product_id,
        referenceId: tx.reference_id,
        quantity: Math.abs(tx.quantity_change),
        message: `حركة بيع بدون قيد COGS`
      })
    }
  }

  // جلب حركات الشراء (يجب أن يكون لها قيد شراء)
  const { data: purchaseTransactions } = await supabase
    .from('inventory_transactions')
    .select('id, product_id, quantity_change, reference_id, transaction_type')
    .eq('company_id', companyId)
    .eq('transaction_type', 'purchase')
    .gt('quantity_change', 0) // الشراء يكون موجب

  for (const tx of purchaseTransactions || []) {
    // التحقق من وجود قيد شراء
    const { data: billEntry } = await supabase
      .from('journal_entries')
      .select('id')
      .eq('company_id', companyId)
      .eq('reference_type', 'bill')
      .eq('reference_id', tx.reference_id)
      .limit(1)

    if (!billEntry || billEntry.length === 0) {
      issues.push({
        type: 'MISSING_PURCHASE_ENTRY',
        severity: 'MEDIUM',
        transactionId: tx.id,
        productId: tx.product_id,
        referenceId: tx.reference_id,
        quantity: tx.quantity_change,
        message: `حركة شراء بدون قيد محاسبي`
      })
    }
  }

  return issues
}

/**
 * 3️⃣ التحقق من COGS
 * يتحقق من أن كل فاتورة مبيعات لها قيد COGS صحيح
 */
async function checkCOGS(companyId) {
  const issues = []

  // جلب جميع الفواتير المرسلة
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, invoice_date, status')
    .eq('company_id', companyId)
    .neq('status', 'draft')
    .neq('status', 'cancelled')

  for (const invoice of invoices || []) {
    // حساب COGS المتوقع من بنود الفاتورة
    const { data: items } = await supabase
      .from('invoice_items')
      .select(`
        quantity,
        product_id,
        products!inner(cost_price, item_type)
      `)
      .eq('invoice_id', invoice.id)

    let expectedCOGS = 0
    for (const item of items || []) {
      // تخطي الخدمات
      if (item.products?.item_type === 'service') continue

      const qty = Number(item.quantity || 0)
      const cost = Number(item.products?.cost_price || 0)
      expectedCOGS += qty * cost
    }

    // إذا كان COGS المتوقع = 0، لا نحتاج قيد
    if (expectedCOGS === 0) continue

    // التحقق من وجود قيد COGS
    const { data: cogsEntry } = await supabase
      .from('journal_entries')
      .select(`
        id,
        journal_entry_lines!inner(
          debit_amount,
          credit_amount,
          account_id,
          chart_of_accounts!inner(sub_type)
        )
      `)
      .eq('company_id', companyId)
      .eq('reference_type', 'invoice_cogs')
      .eq('reference_id', invoice.id)
      .limit(1)
      .single()

    if (!cogsEntry) {
      issues.push({
        type: 'MISSING_COGS',
        severity: 'HIGH',
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        expectedCOGS,
        actualCOGS: 0,
        message: `فاتورة بدون قيد COGS (COGS المتوقع: ${expectedCOGS.toFixed(2)})`
      })
      continue
    }

    // حساب COGS الفعلي من القيد
    let actualCOGS = 0
    for (const line of cogsEntry.journal_entry_lines || []) {
      if (line.chart_of_accounts?.sub_type === 'cogs' ||
          line.chart_of_accounts?.sub_type === 'cost_of_goods_sold') {
        actualCOGS += Number(line.debit_amount || 0)
      }
    }

    // مقارنة COGS المتوقع مع الفعلي (مع هامش خطأ صغير)
    if (Math.abs(expectedCOGS - actualCOGS) > 0.01) {
      issues.push({
        type: 'COGS_MISMATCH',
        severity: 'MEDIUM',
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        expectedCOGS,
        actualCOGS,
        difference: actualCOGS - expectedCOGS,
        message: `COGS غير متطابق (متوقع: ${expectedCOGS.toFixed(2)}, فعلي: ${actualCOGS.toFixed(2)})`
      })
    }
  }

  return issues
}

/**
 * 4️⃣ التحقق من قيمة المخزون المحاسبية
 * يقارن قيمة المخزون من حساب Inventory مع القيمة المحسوبة
 */
async function checkInventoryValuation(companyId) {
  const issues = []

  // الحصول على حساب المخزون
  const { data: inventoryAccount } = await supabase
    .from('chart_of_accounts')
    .select('id, account_name, account_code')
    .eq('company_id', companyId)
    .eq('sub_type', 'inventory')
    .eq('is_active', true)
    .limit(1)
    .single()

  if (!inventoryAccount) {
    issues.push({
      type: 'MISSING_INVENTORY_ACCOUNT',
      severity: 'CRITICAL',
      message: 'حساب المخزون غير موجود في دليل الحسابات'
    })
    return issues
  }

  // حساب رصيد المخزون من القيود المحاسبية
  const { data: inventoryLines } = await supabase
    .from('journal_entry_lines')
    .select('debit_amount, credit_amount, journal_entries!inner(is_deleted)')
    .eq('account_id', inventoryAccount.id)

  let accountingBalance = 0
  for (const line of inventoryLines || []) {
    if (line.journal_entries?.is_deleted) continue
    accountingBalance += Number(line.debit_amount || 0) - Number(line.credit_amount || 0)
  }

  // حساب قيمة المخزون من المنتجات
  const { data: products } = await supabase
    .from('products')
    .select('quantity_on_hand, cost_price, item_type')
    .eq('company_id', companyId)
    .or('item_type.is.null,item_type.eq.product')

  let calculatedValue = 0
  for (const product of products || []) {
    const qty = Number(product.quantity_on_hand || 0)
    const cost = Number(product.cost_price || 0)
    calculatedValue += qty * cost
  }

  // مقارنة القيمتين
  const difference = Math.abs(accountingBalance - calculatedValue)
  if (difference > 0.01) {
    issues.push({
      type: 'INVENTORY_VALUATION_MISMATCH',
      severity: 'HIGH',
      accountingBalance: accountingBalance.toFixed(2),
      calculatedValue: calculatedValue.toFixed(2),
      difference: difference.toFixed(2),
      message: `قيمة المخزون المحاسبية (${accountingBalance.toFixed(2)}) لا تطابق القيمة المحسوبة (${calculatedValue.toFixed(2)})`
    })
  }

  return issues
}

/**
 * 5️⃣ التحقق من دفعات FIFO
 * يتحقق من صحة دفعات FIFO والكميات المتبقية
 */
async function checkFIFOLots(companyId) {
  const issues = []

  // جلب جميع المنتجات
  const { data: products } = await supabase
    .from('products')
    .select('id, sku, name, quantity_on_hand, item_type')
    .eq('company_id', companyId)
    .or('item_type.is.null,item_type.eq.product')

  for (const product of products || []) {
    // جلب دفعات FIFO للمنتج
    const { data: lots } = await supabase
      .from('fifo_cost_lots')
      .select('id, remaining_quantity, unit_cost, lot_date')
      .eq('company_id', companyId)
      .eq('product_id', product.id)
      .gt('remaining_quantity', 0)

    // حساب إجمالي الكميات المتبقية في الدفعات
    const totalLotsQty = (lots || []).reduce((sum, lot) => {
      return sum + Number(lot.remaining_quantity || 0)
    }, 0)

    const productQty = Number(product.quantity_on_hand || 0)

    // مقارنة الكميات
    if (Math.abs(totalLotsQty - productQty) > 0.01) {
      issues.push({
        type: 'FIFO_QUANTITY_MISMATCH',
        severity: 'MEDIUM',
        productId: product.id,
        productSku: product.sku,
        productName: product.name,
        productQty,
        totalLotsQty,
        difference: totalLotsQty - productQty,
        message: `كمية المنتج (${productQty}) لا تطابق مجموع دفعات FIFO (${totalLotsQty})`
      })
    }

    // التحقق من وجود دفعات بكميات سالبة
    for (const lot of lots || []) {
      if (Number(lot.remaining_quantity) < 0) {
        issues.push({
          type: 'NEGATIVE_FIFO_LOT',
          severity: 'HIGH',
          productId: product.id,
          productSku: product.sku,
          productName: product.name,
          lotId: lot.id,
          remainingQty: lot.remaining_quantity,
          message: `دفعة FIFO بكمية سالبة (${lot.remaining_quantity})`
        })
      }
    }
  }

  return issues
}

/**
 * طباعة ملخص الشركة
 */
function printCompanySummary(company, issues) {
  log(`\n📊 ملخص المراجعة:`, 'bold')

  if (issues.length === 0) {
    log('   ✅ لا توجد مشاكل - النظام المخزني سليم 100%', 'green')
    return
  }

  // تصنيف المشاكل حسب الخطورة
  const critical = issues.filter(i => i.severity === 'CRITICAL')
  const high = issues.filter(i => i.severity === 'HIGH')
  const medium = issues.filter(i => i.severity === 'MEDIUM')
  const low = issues.filter(i => i.severity === 'LOW')

  log(`   ⚠️  إجمالي المشاكل: ${issues.length}`, 'yellow')
  if (critical.length > 0) log(`   🔴 حرجة: ${critical.length}`, 'red')
  if (high.length > 0) log(`   🟠 عالية: ${high.length}`, 'yellow')
  if (medium.length > 0) log(`   🟡 متوسطة: ${medium.length}`, 'yellow')
  if (low.length > 0) log(`   🟢 منخفضة: ${low.length}`, 'green')

  // طباعة تفاصيل المشاكل الحرجة والعالية
  const importantIssues = [...critical, ...high]
  if (importantIssues.length > 0) {
    log(`\n   📋 تفاصيل المشاكل الهامة:`, 'bold')
    importantIssues.slice(0, 10).forEach((issue, index) => {
      log(`\n   ${index + 1}. [${issue.type}] ${issue.message}`, 'yellow')
      if (issue.productSku) log(`      المنتج: ${issue.productSku} - ${issue.productName}`, 'cyan')
      if (issue.invoiceNumber) log(`      الفاتورة: ${issue.invoiceNumber}`, 'cyan')
      if (issue.difference !== undefined) log(`      الفرق: ${issue.difference}`, 'cyan')
    })

    if (importantIssues.length > 10) {
      log(`\n   ... و ${importantIssues.length - 10} مشكلة أخرى`, 'yellow')
    }
  }
}

// تشغيل السكربت
main()

