/**
 * 🔧 إصلاح قيم المرتجعات في فواتير المشتريات
 * 
 * هذا السكربت يصلح قيم total_amount و returned_amount و paid_amount
 * للفواتير التي تم عمل مرتجع جزئي أو كامل عليها بشكل خاطئ
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

async function fixBillReturnAmounts() {
  try {
    console.log('🔄 بدء إصلاح قيم المرتجعات في فواتير المشتريات...\n')

    // جلب ID شركة "تست"
    const { data: companies, error: companyError } = await supabase
      .from('companies')
      .select('id')
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
      .select('id, bill_number, total_amount, paid_amount, returned_amount, status, return_status')
      .eq('company_id', companyId)
      .gt('returned_amount', 0)
      .not('status', 'in', '(draft,cancelled,voided)')

    if (billsError) {
      console.error('❌ خطأ في جلب الفواتير:', billsError)
      return
    }

    if (!bills || bills.length === 0) {
      console.log('✅ لا توجد فواتير تحتاج إصلاح')
      return
    }

    console.log(`📋 تم العثور على ${bills.length} فاتورة تحتاج مراجعة:\n`)

    let fixedCount = 0
    let errorCount = 0

    for (const bill of bills) {
      const oldTotal = Number(bill.total_amount || 0)
      const oldReturned = Number(bill.returned_amount || 0)
      const oldPaid = Number(bill.paid_amount || 0)

      // حساب الإجمالي الأصلي (قبل أي مرتجع)
      const originalTotal = oldTotal + oldReturned

      // حساب الإجمالي الجديد (بعد المرتجعات)
      const newTotal = Math.max(originalTotal - oldReturned, 0)

      // حساب المدفوع الجديد (يجب أن يكون <= الإجمالي الجديد)
      const newPaid = Math.min(oldPaid, newTotal)

      // التحقق من الحاجة للإصلاح
      const needsFix = oldTotal !== newTotal || oldPaid !== newPaid

      if (needsFix) {
        console.log(`🔧 إصلاح الفاتورة ${bill.bill_number}:`)
        console.log(`   الإجمالي الحالي: ${oldTotal.toFixed(2)} → ${newTotal.toFixed(2)}`)
        console.log(`   المدفوع الحالي: ${oldPaid.toFixed(2)} → ${newPaid.toFixed(2)}`)
        console.log(`   المرتجع: ${oldReturned.toFixed(2)} (بدون تغيير)`)
        console.log(`   الإجمالي الأصلي: ${originalTotal.toFixed(2)}`)
        console.log(`   المتبقي: ${(newTotal - newPaid).toFixed(2)}\n`)

        // تحديث الفاتورة
        const { error: updateError } = await supabase
          .from('bills')
          .update({
            total_amount: newTotal,
            paid_amount: newPaid
          })
          .eq('id', bill.id)

        if (updateError) {
          console.error(`   ❌ فشل تحديث الفاتورة: ${updateError.message}\n`)
          errorCount++
        } else {
          console.log(`   ✅ تم تحديث الفاتورة بنجاح\n`)
          fixedCount++
        }
      } else {
        console.log(`✅ الفاتورة ${bill.bill_number}: القيم صحيحة (لا تحتاج إصلاح)\n`)
      }
    }

    console.log('='.repeat(50))
    console.log(`📊 ملخص الإصلاح:`)
    console.log(`   ✅ تم إصلاح: ${fixedCount} فاتورة`)
    console.log(`   ❌ فشل: ${errorCount} فاتورة`)
    console.log(`   ✅ صحيحة: ${bills.length - fixedCount - errorCount} فاتورة`)
    console.log('='.repeat(50))

  } catch (error) {
    console.error('❌ خطأ عام:', error)
  }
}

// تشغيل السكربت
fixBillReturnAmounts()
  .then(() => {
    console.log('\n✅ اكتمل الإصلاح')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ فشل الإصلاح:', error)
    process.exit(1)
  })

