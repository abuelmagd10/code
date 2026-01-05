// scripts/fix-missing-purchase-return-inventory.js
// إصلاح حركات المخزون المفقودة لمرتجع المشتريات

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// قراءة .env.local
try {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/)
      if (match) {
        const key = match[1].trim()
        const value = match[2].trim().replace(/^["']|["']$/g, '')
        if (!process.env[key]) {
          process.env[key] = value
        }
      }
    })
  }
} catch (e) {}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ خطأ: SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY مطلوبان')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function fixMissingInventoryTransactions() {
  console.log('🔧 إصلاح حركات المخزون المفقودة لمرتجعات المشتريات')
  console.log('==========================================\n')

  try {
    // 1. العثور على شركة "تست"
    const { data: companies, error: companyError } = await supabase
      .from('companies')
      .select('id, name')
      .or('name.eq.تست,name.ilike.%تست%')
      .limit(1)
    
    if (companyError || !companies || companies.length === 0) {
      console.error('❌ لم يتم العثور على شركة "تست"')
      process.exit(1)
    }

    const companyId = companies[0].id
    console.log(`✅ تم العثور على شركة "${companies[0].name}" - ID: ${companyId}\n`)

    // 2. البحث عن فواتير المشتريات المرتجعة بدون حركات مخزون
    const { data: returnedBills, error: billsError } = await supabase
      .from('bills')
      .select('id, bill_number, status, return_status, returned_amount, total_amount, bill_date')
      .eq('company_id', companyId)
      .not('return_status', 'is', null)
      .order('bill_date', { ascending: false })
    
    if (billsError) {
      console.error('❌ خطأ في جلب الفواتير:', billsError.message)
      process.exit(1)
    }

    if (!returnedBills || returnedBills.length === 0) {
      console.log('ℹ️  لا توجد فواتير مشتريات مرتجعة')
      return
    }

    console.log(`📋 تم العثور على ${returnedBills.length} فاتورة مرتجعة\n`)

    let fixedCount = 0
    let skippedCount = 0

    for (const bill of returnedBills) {
      console.log(`\n📄 فاتورة: ${bill.bill_number} (${bill.return_status === 'full' ? 'مرتجع كامل' : 'مرتجع جزئي'})`)

      // التحقق من وجود حركات مخزون
      const { data: existingTx, error: txError } = await supabase
        .from('inventory_transactions')
        .select('id')
        .eq('company_id', companyId)
        .eq('reference_id', bill.id)
        .eq('transaction_type', 'purchase_return')
        .limit(1)
      
      if (txError) {
        console.error(`  ❌ خطأ في التحقق من الحركات: ${txError.message}`)
        continue
      }

      if (existingTx && existingTx.length > 0) {
        console.log(`  ✅ توجد حركات مخزون بالفعل (${existingTx.length})`)
        skippedCount++
        continue
      }

      // جلب القيود المحاسبية للمرتجع
      const { data: journalEntries, error: jeError } = await supabase
        .from('journal_entries')
        .select('id, entry_date')
        .eq('company_id', companyId)
        .eq('reference_type', 'purchase_return')
        .eq('reference_id', bill.id)
        .order('entry_date', { ascending: false })
        .limit(1)
      
      if (jeError || !journalEntries || journalEntries.length === 0) {
        console.log(`  ⚠️  لا توجد قيود محاسبية للمرتجع - تخطي`)
        skippedCount++
        continue
      }

      const journalEntryId = journalEntries[0].id

      // جلب بنود الفاتورة المرتجعة
      const { data: billItems, error: itemsError } = await supabase
        .from('bill_items')
        .select('id, product_id, quantity, returned_quantity, products(id, item_type, name)')
        .eq('bill_id', bill.id)
        .gt('returned_quantity', 0)
      
      if (itemsError) {
        console.error(`  ❌ خطأ في جلب بنود الفاتورة: ${itemsError.message}`)
        continue
      }

      if (!billItems || billItems.length === 0) {
        console.log(`  ⚠️  لا توجد بنود مرتجعة - تخطي`)
        skippedCount++
        continue
      }

      // إنشاء حركات المخزون
      const invTx = billItems
        .filter((item) => {
          // فلترة المنتجات فقط (ليس services)
          const itemType = item.products?.item_type
          return item.product_id && itemType !== 'service'
        })
        .map((item) => ({
          company_id: companyId,
          product_id: item.product_id,
          transaction_type: 'purchase_return',
          quantity_change: -Number(item.returned_quantity || 0), // سالب (Stock Out)
          reference_id: bill.id,
          journal_entry_id: journalEntryId,
          notes: `مرتجع مشتريات للفاتورة ${bill.bill_number} (إصلاح تلقائي)`
        }))

      if (invTx.length === 0) {
        console.log(`  ⚠️  لا توجد منتجات للعودة (جميعها services) - تخطي`)
        skippedCount++
        continue
      }

      // إدراج حركات المخزون
      const { error: insertError } = await supabase
        .from('inventory_transactions')
        .insert(invTx)
      
      if (insertError) {
        console.error(`  ❌ فشل إنشاء حركات المخزون: ${insertError.message}`)
        continue
      }

      console.log(`  ✅ تم إنشاء ${invTx.length} حركة مخزون`)
      fixedCount++

      // التحقق من أن Trigger طبق التغييرات
      for (const tx of invTx) {
        const { data: product } = await supabase
          .from('products')
          .select('id, sku, name, quantity_on_hand')
          .eq('id', tx.product_id)
          .single()
        
        if (product) {
          console.log(`     - ${product.sku || product.name}: المخزون الحالي = ${product.quantity_on_hand}`)
        }
      }
    }

    console.log('\n' + '='.repeat(50))
    console.log('📊 الملخص:')
    console.log('='.repeat(50))
    console.log(`✅ تم إصلاح: ${fixedCount} فاتورة`)
    console.log(`⏭️  تم التخطي: ${skippedCount} فاتورة`)
    console.log('='.repeat(50))

    if (fixedCount > 0) {
      console.log('\n✅ تم إصلاح حركات المخزون المفقودة بنجاح!')
      console.log('💡 الـ Trigger سيحدث products.quantity_on_hand تلقائياً')
    } else {
      console.log('\nℹ️  لا توجد حركات مخزون مفقودة')
    }

  } catch (error) {
    console.error('\n❌ خطأ في التنفيذ:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

// تنفيذ
fixMissingInventoryTransactions()

