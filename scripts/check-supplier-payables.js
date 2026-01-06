/**
 * 🔍 فحص ذمم الموردين في شركة "تست"
 * 
 * هذا السكربت يفحص قيم ذمم الموردين ويقارنها مع الفواتير والمرتجعات
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

async function checkSupplierPayables() {
  try {
    console.log('🔍 فحص ذمم الموردين في شركة "تست"...\n')

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

    // جلب جميع الموردين
    const { data: suppliers, error: suppliersError } = await supabase
      .from('suppliers')
      .select('id, name, phone')
      .eq('company_id', companyId)

    if (suppliersError) {
      console.error('❌ خطأ في جلب الموردين:', suppliersError)
      return
    }

    if (!suppliers || suppliers.length === 0) {
      console.log('✅ لا توجد موردين')
      return
    }

    console.log(`📋 تم العثور على ${suppliers.length} مورد:\n`)

    for (const supplier of suppliers) {
      console.log(`\n${'='.repeat(60)}`)
      console.log(`🏢 المورد: ${supplier.name} (${supplier.id})`)
      console.log('='.repeat(60))

      // جلب جميع الفواتير للمورد
      const { data: bills, error: billsError } = await supabase
        .from('bills')
        .select('id, bill_number, bill_date, total_amount, paid_amount, returned_amount, status, return_status')
        .eq('company_id', companyId)
        .eq('supplier_id', supplier.id)
        .not('status', 'in', '(draft,cancelled,voided,fully_returned)')

      if (billsError) {
        console.error(`   ❌ خطأ في جلب الفواتير: ${billsError.message}`)
        continue
      }

      if (!bills || bills.length === 0) {
        console.log('   ✅ لا توجد فواتير')
        continue
      }

      console.log(`\n   📄 عدد الفواتير: ${bills.length}\n`)

      let totalPayables = 0

      for (const bill of bills) {
        const totalAmount = Number(bill.total_amount || 0)
        const paidAmount = Number(bill.paid_amount || 0)
        const returnedAmount = Number(bill.returned_amount || 0)
        
        // حساب الإجمالي الأصلي (قبل المرتجعات)
        const originalTotal = totalAmount + returnedAmount
        
        // حساب المتبقي
        const remaining = totalAmount - paidAmount
        
        // حساب المتبقي الصحيح (إذا كان total_amount صحيح)
        const correctRemaining = originalTotal - paidAmount - returnedAmount

        console.log(`   📋 ${bill.bill_number}:`)
        console.log(`      الإجمالي الحالي (total_amount): ${totalAmount.toFixed(2)}`)
        console.log(`      المرتجع (returned_amount): ${returnedAmount.toFixed(2)}`)
        console.log(`      المدفوع (paid_amount): ${paidAmount.toFixed(2)}`)
        console.log(`      الإجمالي الأصلي (محسوب): ${originalTotal.toFixed(2)}`)
        console.log(`      المتبقي (total_amount - paid_amount): ${remaining.toFixed(2)}`)
        console.log(`      المتبقي الصحيح (originalTotal - paid - returned): ${correctRemaining.toFixed(2)}`)
        console.log(`      الحالة: ${bill.status}`)
        console.log(`      حالة المرتجع: ${bill.return_status || 'لا يوجد'}`)
        
        // التحقق من صحة الحساب
        if (Math.abs(remaining - correctRemaining) > 0.01) {
          console.log(`      ⚠️  تحذير: المتبقي غير صحيح! الفرق: ${Math.abs(remaining - correctRemaining).toFixed(2)}`)
        }

        if (remaining > 0) {
          totalPayables += remaining
        }
      }

      console.log(`\n   💰 إجمالي الذمم الدائنة: ${totalPayables.toFixed(2)}`)
    }

    console.log('\n' + '='.repeat(60))
    console.log('✅ اكتمل الفحص')
    console.log('='.repeat(60))

  } catch (error) {
    console.error('❌ خطأ عام:', error)
  }
}

// تشغيل السكربت
checkSupplierPayables()
  .then(() => {
    console.log('\n✅ اكتمل الفحص')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ فشل الفحص:', error)
    process.exit(1)
  })

