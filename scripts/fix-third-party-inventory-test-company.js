// =====================================================
// إصلاح بضائع لدى الغير لشركة "تست"
// Fix Third Party Inventory for Test Company
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
  console.log('🔍 بدء فحص وإصلاح بضائع لدى الغير لشركة "تست"...\n')

  try {
    // 1. جلب جميع الفواتير في شركة "تست"
    console.log('1️⃣ جلب جميع الفواتير...')
    const { data: allInvoices, error: invoicesErr } = await supabase
      .from('invoices')
      .select(`
        id,
        invoice_number,
        status,
        shipping_provider_id,
        shipping_providers(provider_name)
      `)
      .eq('company_id', TEST_COMPANY_ID)
      .order('invoice_date', { ascending: false })

    if (invoicesErr) throw invoicesErr

    console.log(`   ✅ تم العثور على ${allInvoices?.length || 0} فاتورة\n`)

    // 2. عرض الفواتير المرسلة
    const sentInvoices = (allInvoices || []).filter((inv) => 
      ['sent', 'confirmed'].includes(inv.status?.toLowerCase())
    )

    console.log(`2️⃣ الفواتير المرسلة (Sent/Confirmed): ${sentInvoices.length}`)
    sentInvoices.forEach((inv) => {
      const hasProvider = !!inv.shipping_provider_id
      const providerName = inv.shipping_providers?.provider_name || 'غير محدد'
      console.log(`   ${hasProvider ? '✅' : '❌'} ${inv.invoice_number} (${inv.status}) - ${providerName}`)
    })
    console.log('')

    // 3. جلب شركات الشحن المتاحة
    console.log('3️⃣ جلب شركات الشحن المتاحة...')
    const { data: shippingProviders, error: providersErr } = await supabase
      .from('shipping_providers')
      .select('id, provider_name')
      .eq('company_id', TEST_COMPANY_ID)

    if (providersErr) throw providersErr

    console.log(`   ✅ تم العثور على ${shippingProviders?.length || 0} شركة شحن:`)
    shippingProviders?.forEach((provider) => {
      console.log(`      - ${provider.provider_name} (${provider.id})`)
    })
    console.log('')

    // 4. التحقق من الفواتير المرسلة بدون شركة شحن
    const sentWithoutProvider = sentInvoices.filter((inv) => !inv.shipping_provider_id)

    if (sentWithoutProvider.length > 0 && shippingProviders && shippingProviders.length > 0) {
      console.log(`4️⃣ تم العثور على ${sentWithoutProvider.length} فاتورة مرسلة بدون شركة شحن`)
      console.log('   هل تريد إضافة شركة شحن تلقائياً؟ (سيتم استخدام أول شركة شحن متاحة)')
      console.log('')

      // استخدام أول شركة شحن متاحة
      const defaultProvider = shippingProviders[0]
      console.log(`   🔧 إضافة شركة الشحن "${defaultProvider.provider_name}" للفواتير...`)

      for (const invoice of sentWithoutProvider) {
        const { error: updateErr } = await supabase
          .from('invoices')
          .update({ shipping_provider_id: defaultProvider.id })
          .eq('id', invoice.id)

        if (updateErr) {
          console.error(`      ❌ ${invoice.invoice_number}: خطأ - ${updateErr.message}`)
        } else {
          console.log(`      ✅ ${invoice.invoice_number}: تم إضافة شركة الشحن`)
        }
      }
      console.log('')
    }

    // 5. جلب الفواتير المرسلة مع شركات الشحن (بعد التحديث)
    console.log('5️⃣ جلب الفواتير المرسلة مع شركات الشحن (بعد التحديث)...')
    const { data: updatedSentInvoices, error: updatedErr } = await supabase
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
        shipping_providers(provider_name)
      `)
      .eq('company_id', TEST_COMPANY_ID)
      .in('status', ['sent', 'confirmed'])
      .not('shipping_provider_id', 'is', null)
      .order('invoice_date', { ascending: false })

    if (updatedErr) throw updatedErr

    console.log(`   ✅ تم العثور على ${updatedSentInvoices?.length || 0} فاتورة مرسلة مع شركة شحن\n`)

    if (!updatedSentInvoices || updatedSentInvoices.length === 0) {
      console.log('   ℹ️  لا توجد فواتير مرسلة مع شركات شحن بعد التحديث')
      return
    }

    // 6. التحقق من سجلات third_party_inventory
    const invoiceIds = updatedSentInvoices.map((inv) => inv.id)
    const { data: thirdPartyData, error: thirdPartyErr } = await supabase
      .from('third_party_inventory')
      .select('*')
      .eq('company_id', TEST_COMPANY_ID)
      .in('invoice_id', invoiceIds)

    if (thirdPartyErr) throw thirdPartyErr

    console.log(`6️⃣ سجلات third_party_inventory: ${thirdPartyData?.length || 0}`)

    // 7. إنشاء السجلات المفقودة
    const invoicesWithThirdParty = new Set((thirdPartyData || []).map((tpi) => tpi.invoice_id))
    const invoicesWithoutThirdParty = updatedSentInvoices.filter((inv) => !invoicesWithThirdParty.has(inv.id))

    if (invoicesWithoutThirdParty.length > 0) {
      console.log(`\n7️⃣ إنشاء سجلات third_party_inventory للفواتير المفقودة (${invoicesWithoutThirdParty.length})...`)

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
        } catch (err) {
          console.error(`      ❌ ${invoice.invoice_number}: خطأ - ${err.message}`)
        }
      }
    } else {
      console.log('   ✅ جميع الفواتير لديها سجلات في third_party_inventory')
    }

    console.log('')
    console.log('✅ تم الانتهاء من إصلاح بضائع لدى الغير')
  } catch (err) {
    console.error('❌ خطأ عام:', err)
    process.exit(1)
  }
}

main()

