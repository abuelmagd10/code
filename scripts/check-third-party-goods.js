// scripts/check-third-party-goods.js
// التحقق من بضائع لدى الغير في شركة "تست"

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

async function checkThirdPartyGoods() {
  console.log('🔍 التحقق من بضائع لدى الغير في شركة "تست"')
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

    // 2. التحقق من وجود جدول third_party_inventory
    console.log('📋 1. التحقق من جدول third_party_inventory...\n')
    
    const { data: thirdPartyGoods, error: tpgError } = await supabase
      .from('third_party_inventory')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
    
    if (tpgError) {
      if (tpgError.message.includes('does not exist')) {
        console.error('❌ جدول third_party_inventory غير موجود في قاعدة البيانات')
        console.error('   يجب إنشاء الجدول أولاً')
        process.exit(1)
      } else {
        console.error('❌ خطأ في جلب البيانات:', tpgError.message)
        process.exit(1)
      }
    }

    console.log(`✅ عدد بضائع لدى الغير: ${thirdPartyGoods?.length || 0}\n`)

    if (thirdPartyGoods && thirdPartyGoods.length > 0) {
      console.log('📦 البضائع الموجودة:')
      for (const item of thirdPartyGoods) {
        console.log(`  - ID: ${item.id}`)
        console.log(`    Invoice ID: ${item.invoice_id}`)
        console.log(`    Product ID: ${item.product_id}`)
        console.log(`    Quantity: ${item.quantity}`)
        console.log(`    Status: ${item.status}`)
        console.log(`    Shipping Provider: ${item.shipping_provider_id}`)
        console.log('')
      }
    }

    // 3. التحقق من فواتير المبيعات المرسلة مع شركة شحن
    console.log('📋 2. التحقق من فواتير المبيعات المرسلة مع شركة شحن...\n')
    
    const { data: sentInvoices, error: invoicesError } = await supabase
      .from('invoices')
      .select('id, invoice_number, status, shipping_provider_id, shipping_providers(provider_name)')
      .eq('company_id', companyId)
      .in('status', ['sent', 'confirmed'])
      .not('shipping_provider_id', 'is', null)
      .order('invoice_date', { ascending: false })
    
    if (invoicesError) {
      console.error('❌ خطأ في جلب الفواتير:', invoicesError.message)
    } else {
      console.log(`✅ عدد فواتير المبيعات المرسلة مع شركة شحن: ${sentInvoices?.length || 0}\n`)

      if (sentInvoices && sentInvoices.length > 0) {
        for (const invoice of sentInvoices) {
          console.log(`📄 فاتورة: ${invoice.invoice_number}`)
          console.log(`   شركة الشحن: ${invoice.shipping_providers?.provider_name || 'غير معروف'}`)
          
          // التحقق من وجود بضائع لدى الغير لهذه الفاتورة
          const { data: goods, error: goodsError } = await supabase
            .from('third_party_inventory')
            .select('id, product_id, quantity, status')
            .eq('company_id', companyId)
            .eq('invoice_id', invoice.id)
            .eq('reference_type', 'invoice')
          
          if (goodsError) {
            console.log(`   ⚠️  خطأ في التحقق: ${goodsError.message}`)
          } else if (!goods || goods.length === 0) {
            console.log(`   ❌ لا توجد بضائع في "بضائع لدى الغير" (يجب أن توجد)`)
            
            // التحقق من عناصر الفاتورة
            const { data: invoiceItems } = await supabase
              .from('invoice_items')
              .select('product_id, quantity, products(item_type)')
              .eq('invoice_id', invoice.id)
            
            const productItems = invoiceItems?.filter((it) => {
              const itemType = it.products?.item_type
              return !itemType || itemType !== 'service'
            }) || []
            
            if (productItems.length > 0) {
              console.log(`   ⚠️  الفاتورة تحتوي على ${productItems.length} منتج (ليس service)`)
              console.log(`   💡 يجب إنشاء بضائع لدى الغير لهذه الفاتورة`)
            } else {
              console.log(`   ℹ️  جميع المنتجات من نوع service (لا حاجة لبضائع لدى الغير)`)
            }
          } else {
            console.log(`   ✅ يوجد ${goods.length} بضاعة في "بضائع لدى الغير"`)
            for (const good of goods) {
              console.log(`      - Product: ${good.product_id}, Quantity: ${good.quantity}, Status: ${good.status}`)
            }
          }
          console.log('')
        }
      } else {
        console.log('ℹ️  لا توجد فواتير مبيعات مرسلة مع شركة شحن')
        console.log('💡 لاختبار "بضائع لدى الغير":')
        console.log('   1. أنشئ فاتورة مبيعات جديدة')
        console.log('   2. اختر شركة شحن')
        console.log('   3. أضف منتجات (ليس services)')
        console.log('   4. أرسل الفاتورة (Status = Sent)')
        console.log('   5. تحقق من صفحة /inventory/third-party')
      }
    }

    // 4. ملاحظة مهمة: فواتير المشتريات (Bills)
    console.log('📋 3. ملاحظة مهمة...\n')
    console.log('⚠️  صفحة "بضائع لدى الغير" مخصصة لـ فواتير المبيعات (Invoices) فقط')
    console.log('⚠️  فواتير المشتريات (Bills) لا تظهر في "بضائع لدى الغير"')
    console.log('💡 لاختبار "بضائع لدى الغير": استخدم فاتورة مبيعات (Invoice) وليس فاتورة مشتريات (Bill)\n')

    // 5. التحقق من فواتير المشتريات (للتوضيح)
    const { data: sentBills, error: billsError } = await supabase
      .from('bills')
      .select('id, bill_number, status, shipping_provider_id')
      .eq('company_id', companyId)
      .in('status', ['sent', 'confirmed'])
      .not('shipping_provider_id', 'is', null)
      .limit(5)
    
    if (!billsError && sentBills && sentBills.length > 0) {
      console.log(`⚠️  تم العثور على ${sentBills.length} فاتورة مشتريات مرسلة مع شركة شحن`)
      console.log('   هذه الفواتير لا تظهر في "بضائع لدى الغير" (هذا طبيعي)')
      console.log('   لأن "بضائع لدى الغير" مخصصة لـ فواتير المبيعات فقط\n')
    }

    console.log('='.repeat(50))
    console.log('✅ تم الانتهاء من التحقق')
    console.log('='.repeat(50))

  } catch (error) {
    console.error('❌ خطأ في التنفيذ:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

// تنفيذ
checkThirdPartyGoods()

