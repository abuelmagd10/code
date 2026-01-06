// =====================================================
// فحص وإصلاح بضائع لدى الغير لشركة "تست"
// Check and Fix Third Party Inventory for Test Company
// =====================================================

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

// معرف شركة "تست"
const TEST_COMPANY_ID = 'f0ffc062-1e6e-4324-8be4-f5052e881a67'

async function main() {
  console.log('🔍 بدء فحص بضائع لدى الغير لشركة "تست"...\n')

  try {
    // 1. جلب جميع الفواتير المرسلة (Sent/Confirmed) مع shipping_provider_id
    console.log('1️⃣ جلب الفواتير المرسلة مع شركات الشحن...')
    const { data: sentInvoices, error: invoicesErr } = await supabase
      .from('invoices')
      .select(`
        id,
        invoice_number,
        customer_id,
        invoice_date,
        status,
        shipping_provider_id,
        branch_id,
        warehouse_id,
        customers(name),
        shipping_providers(provider_name)
      `)
      .eq('company_id', TEST_COMPANY_ID)
      .in('status', ['sent', 'confirmed'])
      .not('shipping_provider_id', 'is', null)
      .order('invoice_date', { ascending: false })

    if (invoicesErr) throw invoicesErr

    console.log(`   ✅ تم العثور على ${sentInvoices?.length || 0} فاتورة مرسلة مع شركة شحن\n`)

    if (!sentInvoices || sentInvoices.length === 0) {
      console.log('   ℹ️  لا توجد فواتير مرسلة مع شركات شحن')
      return
    }

    // عرض الفواتير
    console.log('   📋 الفواتير المرسلة:')
    sentInvoices.forEach((inv) => {
      console.log(`      - ${inv.invoice_number} (${inv.status}) - ${inv.shipping_providers?.provider_name || 'غير محدد'}`)
    })
    console.log('')

    // 2. جلب سجلات third_party_inventory المرتبطة بهذه الفواتير
    console.log('2️⃣ جلب سجلات بضائع لدى الغير...')
    const invoiceIds = sentInvoices.map((inv) => inv.id)
    const { data: thirdPartyData, error: thirdPartyErr } = await supabase
      .from('third_party_inventory')
      .select('*')
      .eq('company_id', TEST_COMPANY_ID)
      .in('invoice_id', invoiceIds)

    if (thirdPartyErr) throw thirdPartyErr

    console.log(`   ✅ تم العثور على ${thirdPartyData?.length || 0} سجل بضائع لدى الغير\n`)

    // 3. التحقق من الفواتير التي لا تحتوي على سجلات في third_party_inventory
    const invoicesWithThirdParty = new Set((thirdPartyData || []).map((tpi) => tpi.invoice_id))
    const invoicesWithoutThirdParty = sentInvoices.filter((inv) => !invoicesWithThirdParty.has(inv.id))

    console.log('3️⃣ التحقق من الفواتير المفقودة في third_party_inventory...')
    if (invoicesWithoutThirdParty.length > 0) {
      console.log(`   ⚠️  تم العثور على ${invoicesWithoutThirdParty.length} فاتورة بدون سجلات في third_party_inventory:`)
      invoicesWithoutThirdParty.forEach((inv) => {
        console.log(`      - ${inv.invoice_number} (${inv.id})`)
      })
      console.log('')

      // 4. محاولة إنشاء السجلات المفقودة
      console.log('4️⃣ محاولة إنشاء السجلات المفقودة...')
      let createdCount = 0
      let errorCount = 0

      for (const invoice of invoicesWithoutThirdParty) {
        try {
          // جلب بنود الفاتورة
          const { data: invoiceItems, error: itemsErr } = await supabase
            .from('invoice_items')
            .select(`
              product_id,
              quantity,
              unit_price,
              products!inner(id, cost_price, item_type, name)
            `)
            .eq('invoice_id', invoice.id)

          if (itemsErr) throw itemsErr

          // فلترة المنتجات فقط (ليس الخدمات)
          const productItems = (invoiceItems || []).filter(
            (item) => item.product_id && item.products?.item_type !== 'service'
          )

          if (productItems.length === 0) {
            console.log(`      ℹ️  ${invoice.invoice_number}: لا توجد منتجات (فقط خدمات)`)
            continue
          }

          // إنشاء سجلات third_party_inventory
          const thirdPartyRecords = productItems.map((item) => ({
            company_id: TEST_COMPANY_ID,
            shipping_provider_id: invoice.shipping_provider_id,
            product_id: item.product_id,
            invoice_id: invoice.id,
            quantity: Number(item.quantity || 0),
            unit_cost: Number(item.products?.cost_price || 0),
            total_cost: Number(item.quantity || 0) * Number(item.products?.cost_price || 0),
            status: 'open',
            cleared_quantity: 0,
            returned_quantity: 0,
            branch_id: invoice.branch_id || null,
            warehouse_id: invoice.warehouse_id || null,
            notes: `فاتورة مبيعات - ${item.products?.name || ''}`
          }))

          const { error: insertErr } = await supabase
            .from('third_party_inventory')
            .insert(thirdPartyRecords)

          if (insertErr) throw insertErr

          console.log(`      ✅ ${invoice.invoice_number}: تم إنشاء ${thirdPartyRecords.length} سجل`)
          createdCount++
        } catch (err) {
          console.error(`      ❌ ${invoice.invoice_number}: خطأ - ${err.message}`)
          errorCount++
        }
      }

      console.log('')
      console.log(`   📊 ملخص: تم إنشاء ${createdCount} سجل، فشل ${errorCount} سجل`)
    } else {
      console.log('   ✅ جميع الفواتير المرسلة لديها سجلات في third_party_inventory')
    }

    // 5. التحقق من حركات المخزون
    console.log('')
    console.log('5️⃣ التحقق من حركات المخزون...')
    const { data: inventoryTx, error: txErr } = await supabase
      .from('inventory_transactions')
      .select('id, product_id, transaction_type, quantity_change, reference_id')
      .eq('company_id', TEST_COMPANY_ID)
      .in('reference_id', invoiceIds)
      .in('transaction_type', ['sale', 'sale_return'])

    if (txErr) throw txErr

    console.log(`   ✅ تم العثور على ${inventoryTx?.length || 0} حركة مخزون مرتبطة بالفواتير`)

    // 6. ملخص نهائي
    console.log('')
    console.log('📊 الملخص النهائي:')
    console.log(`   - الفواتير المرسلة مع شركات الشحن: ${sentInvoices.length}`)
    console.log(`   - سجلات third_party_inventory: ${thirdPartyData?.length || 0}`)
    console.log(`   - حركات المخزون: ${inventoryTx?.length || 0}`)

    console.log('')
    console.log('✅ تم الانتهاء من فحص بضائع لدى الغير')
  } catch (err) {
    console.error('❌ خطأ عام:', err)
    process.exit(1)
  }
}

main()

