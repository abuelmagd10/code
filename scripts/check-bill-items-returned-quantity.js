/**
 * 🔍 فحص قيم returned_quantity في bill_items لشركة "تست"
 * 
 * هذا السكربت يفحص قيم returned_quantity ويقارنها مع المرتجعات الفعلية
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

async function checkBillItemsReturnedQuantity() {
  try {
    console.log('🔍 فحص قيم returned_quantity في bill_items لشركة "تست"...\n')

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

    for (const bill of bills) {
      console.log(`\n${'='.repeat(60)}`)
      console.log(`📄 الفاتورة: ${bill.bill_number} (${bill.id})`)
      console.log(`   الإجمالي: ${Number(bill.total_amount || 0).toFixed(2)}`)
      console.log(`   المرتجع: ${Number(bill.returned_amount || 0).toFixed(2)}`)
      console.log('='.repeat(60))

      // جلب بنود الفاتورة
      const { data: items, error: itemsError } = await supabase
        .from('bill_items')
        .select('id, product_id, quantity, returned_quantity, unit_price, tax_rate')
        .eq('bill_id', bill.id)

      if (itemsError) {
        console.error(`   ❌ خطأ في جلب بنود الفاتورة: ${itemsError.message}`)
        continue
      }

      if (!items || items.length === 0) {
        console.log('   ✅ لا توجد بنود')
        continue
      }

      console.log(`\n   📦 عدد البنود: ${items.length}\n`)

      let needsFix = false
      const itemsToFix = []

      for (const item of items) {
        const quantity = Number(item.quantity || 0)
        const returnedQty = Number(item.returned_quantity || 0)
        const availableQty = quantity - returnedQty

        console.log(`   📦 المنتج: ${item.product_id}`)
        console.log(`      الكمية الأصلية: ${quantity}`)
        console.log(`      المرتجع (returned_quantity): ${returnedQty}`)
        console.log(`      المتاح (quantity - returned_quantity): ${availableQty}`)

        // التحقق من صحة القيمة
        if (returnedQty < 0) {
          console.log(`      ⚠️  تحذير: returned_quantity سالب!`)
          needsFix = true
          itemsToFix.push({ ...item, correctReturnedQty: 0 })
        } else if (returnedQty > quantity) {
          console.log(`      ❌ خطأ: returned_quantity أكبر من quantity!`)
          needsFix = true
          itemsToFix.push({ ...item, correctReturnedQty: quantity })
        } else {
          console.log(`      ✅ القيمة صحيحة`)
        }
        console.log('')
      }

      if (needsFix) {
        console.log(`   🔧 يحتاج إصلاح: ${itemsToFix.length} بند\n`)
        itemsToFix.forEach(item => {
          console.log(`      - ${item.id}: ${item.returned_quantity} → ${item.correctReturnedQty}`)
        })
      } else {
        console.log(`   ✅ جميع القيم صحيحة\n`)
      }
    }

    console.log('\n' + '='.repeat(60))
    console.log('✅ اكتمل الفحص')
    console.log('='.repeat(60))

  } catch (error) {
    console.error('❌ خطأ عام:', error)
  }
}

// تشغيل السكربت
checkBillItemsReturnedQuantity()
  .then(() => {
    console.log('\n✅ اكتمل الفحص')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ فشل الفحص:', error)
    process.exit(1)
  })

