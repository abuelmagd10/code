/**
 * 🔧 إصلاح قيم returned_quantity في bill_items لشركة "تست"
 * 
 * هذا السكربت يصلح قيم returned_quantity بناءً على المرتجعات الفعلية من inventory_transactions
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// تحميل المتغيرات البيئية من .env.local
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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function fixBillItemsReturnedQuantity() {
  try {
    console.log('🔧 بدء إصلاح قيم returned_quantity في bill_items لشركة "تست"...\n')

    // جلب ID شركة "تست"
    const { data: companies, error: companyError } = await supabase
      .from('companies')
      .select('id, name')
      .eq('name', 'تست')
      .limit(1)

    if (companyError || !companies || companies.length === 0) {
      console.error('❌ لم يتم العثور على شركة "تست"')
      return
    }

    const companyId = companies[0].id
    console.log(`✅ تم العثور على شركة "تست": ${companyId}\n`)

    // جلب جميع الفواتير التي لها مرتجعات
    const { data: bills, error: billsError } = await supabase
      .from('bills')
      .select('id, bill_number, total_amount, returned_amount, status')
      .eq('company_id', companyId)
      .gt('returned_amount', 0)

    if (billsError) {
      console.error('❌ خطأ في جلب الفواتير:', billsError)
      return
    }

    if (!bills || bills.length === 0) {
      console.log('✅ لا توجد فواتير لها مرتجعات')
      return
    }

    console.log(`📋 تم العثور على ${bills.length} فاتورة لها مرتجعات:\n`)

    let fixedCount = 0
    let errorCount = 0

    for (const bill of bills) {
      console.log(`\n${'='.repeat(60)}`)
      console.log(`📄 الفاتورة: ${bill.bill_number} (${bill.id})`)
      console.log('='.repeat(60))

      // جلب بنود الفاتورة
      const { data: items, error: itemsError } = await supabase
        .from('bill_items')
        .select('id, product_id, quantity, returned_quantity, unit_price')
        .eq('bill_id', bill.id)

      if (itemsError) {
        console.error(`   ❌ خطأ في جلب بنود الفاتورة: ${itemsError.message}`)
        continue
      }

      if (!items || items.length === 0) {
        console.log('   ✅ لا توجد بنود')
        continue
      }

      // حساب المرتجع الفعلي من inventory_transactions
      for (const item of items) {
        const { data: transactions, error: txError } = await supabase
          .from('inventory_transactions')
          .select('quantity_change')
          .eq('reference_id', bill.id)
          .eq('product_id', item.product_id)
          .eq('transaction_type', 'purchase_return')

        if (txError) {
          console.error(`   ❌ خطأ في جلب حركات المخزون: ${txError.message}`)
          continue
        }

        // حساب المرتجع الفعلي (مجموع quantity_change السالبة)
        const actualReturned = transactions
          ? Math.abs(transactions.reduce((sum, tx) => sum + Number(tx.quantity_change || 0), 0))
          : 0

        const currentReturned = Number(item.returned_quantity || 0)
        const quantity = Number(item.quantity || 0)

        console.log(`\n   📦 المنتج: ${item.product_id}`)
        console.log(`      الكمية الأصلية: ${quantity}`)
        console.log(`      المرتجع الحالي (returned_quantity): ${currentReturned}`)
        console.log(`      المرتجع الفعلي (من inventory_transactions): ${actualReturned}`)

        // التحقق من الحاجة للإصلاح
        if (Math.abs(currentReturned - actualReturned) > 0.01) {
          console.log(`      🔧 يحتاج إصلاح: ${currentReturned} → ${actualReturned}`)

          // تحديث returned_quantity
          const { error: updateError } = await supabase
            .from('bill_items')
            .update({ returned_quantity: actualReturned })
            .eq('id', item.id)

          if (updateError) {
            console.error(`      ❌ فشل التحديث: ${updateError.message}`)
            errorCount++
          } else {
            console.log(`      ✅ تم التحديث بنجاح`)
            fixedCount++
          }
        } else {
          console.log(`      ✅ القيمة صحيحة`)
        }
      }
    }

    console.log('\n' + '='.repeat(60))
    console.log(`📊 ملخص الإصلاح:`)
    console.log(`   ✅ تم إصلاح: ${fixedCount} بند`)
    console.log(`   ❌ فشل: ${errorCount} بند`)
    console.log('='.repeat(60))

  } catch (error) {
    console.error('❌ خطأ عام:', error)
  }
}

// تشغيل السكربت
fixBillItemsReturnedQuantity()
  .then(() => {
    console.log('\n✅ اكتمل الإصلاح')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ فشل الإصلاح:', error)
    process.exit(1)
  })

