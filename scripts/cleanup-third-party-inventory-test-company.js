// =====================================================
// حذف بيانات نقل المخزون لدى شركة "تست"
// Cleanup Third Party Inventory Data for Test Company
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
  console.log('🗑️  بدء حذف بيانات نقل المخزون لدى شركة "تست"...\n')

  try {
    // 1. جلب سجلات third_party_inventory
    console.log('1️⃣ جلب سجلات third_party_inventory...')
    const { data: thirdPartyData, error: thirdPartyErr } = await supabase
      .from('third_party_inventory')
      .select('id, invoice_id, product_id, quantity')
      .eq('company_id', TEST_COMPANY_ID)

    if (thirdPartyErr) throw thirdPartyErr

    const thirdPartyCount = thirdPartyData?.length || 0
    console.log(`   ✅ تم العثور على ${thirdPartyCount} سجل\n`)

    // 2. جلب حركات المخزون المرتبطة (sale, sale_return)
    console.log('2️⃣ جلب حركات المخزون المرتبطة...')
    
    // جلب معرفات الفواتير من third_party_inventory
    const invoiceIds = Array.from(new Set((thirdPartyData || []).map((tpi) => tpi.invoice_id)))
    
    let inventoryTxCount = 0
    if (invoiceIds.length > 0) {
      const { data: inventoryTx, error: txErr } = await supabase
        .from('inventory_transactions')
        .select('id, product_id, transaction_type, quantity_change, reference_id')
        .eq('company_id', TEST_COMPANY_ID)
        .in('reference_id', invoiceIds)
        .in('transaction_type', ['sale', 'sale_return'])

      if (txErr) throw txErr
      inventoryTxCount = inventoryTx?.length || 0
      console.log(`   ✅ تم العثور على ${inventoryTxCount} حركة مخزون مرتبطة\n`)
    } else {
      console.log('   ℹ️  لا توجد فواتير مرتبطة\n')
    }

    // 3. حذف حركات المخزون أولاً
    if (inventoryTxCount > 0 && invoiceIds.length > 0) {
      console.log('3️⃣ حذف حركات المخزون...')
      const { error: deleteTxErr } = await supabase
        .from('inventory_transactions')
        .delete()
        .eq('company_id', TEST_COMPANY_ID)
        .in('reference_id', invoiceIds)
        .in('transaction_type', ['sale', 'sale_return'])

      if (deleteTxErr) throw deleteTxErr
      console.log(`   ✅ تم حذف ${inventoryTxCount} حركة مخزون\n`)
    } else {
      console.log('3️⃣ لا توجد حركات مخزون للحذف\n')
    }

    // 4. حذف سجلات third_party_inventory
    if (thirdPartyCount > 0) {
      console.log('4️⃣ حذف سجلات third_party_inventory...')
      const { error: deleteThirdPartyErr } = await supabase
        .from('third_party_inventory')
        .delete()
        .eq('company_id', TEST_COMPANY_ID)

      if (deleteThirdPartyErr) throw deleteThirdPartyErr
      console.log(`   ✅ تم حذف ${thirdPartyCount} سجل third_party_inventory\n`)
    } else {
      console.log('4️⃣ لا توجد سجلات third_party_inventory للحذف\n')
    }

    // 5. التحقق من وجود حركات مخزون أخرى مرتبطة بشركات الشحن
    console.log('5️⃣ التحقق من حركات المخزون الأخرى المرتبطة بشركات الشحن...')
    const { data: shippingTx, error: shippingTxErr } = await supabase
      .from('inventory_transactions')
      .select('id, product_id, transaction_type, shipping_provider_id')
      .eq('company_id', TEST_COMPANY_ID)
      .not('shipping_provider_id', 'is', null)

    if (shippingTxErr) throw shippingTxErr

    const shippingTxCount = shippingTx?.length || 0
    if (shippingTxCount > 0) {
      console.log(`   ⚠️  تم العثور على ${shippingTxCount} حركة مخزون مرتبطة بشركات الشحن`)
      console.log('   هل تريد حذفها أيضاً؟ (نعم - سيتم الحذف)')
      
      // حذفها تلقائياً
      const { error: deleteShippingTxErr } = await supabase
        .from('inventory_transactions')
        .delete()
        .eq('company_id', TEST_COMPANY_ID)
        .not('shipping_provider_id', 'is', null)

      if (deleteShippingTxErr) throw deleteShippingTxErr
      console.log(`   ✅ تم حذف ${shippingTxCount} حركة مخزون مرتبطة بشركات الشحن\n`)
    } else {
      console.log('   ✅ لا توجد حركات مخزون أخرى مرتبطة بشركات الشحن\n')
    }

    // 6. ملخص نهائي
    console.log('📊 الملخص النهائي:')
    console.log(`   ✅ تم حذف ${thirdPartyCount} سجل third_party_inventory`)
    console.log(`   ✅ تم حذف ${inventoryTxCount} حركة مخزون (sale/sale_return)`)
    console.log(`   ✅ تم حذف ${shippingTxCount} حركة مخزون مرتبطة بشركات الشحن`)
    console.log('')
    console.log('✅ تم الانتهاء من حذف بيانات نقل المخزون')

    // 7. التحقق من النتيجة
    console.log('')
    console.log('🔍 التحقق من النتيجة...')
    const { data: remainingThirdParty, error: checkThirdPartyErr } = await supabase
      .from('third_party_inventory')
      .select('id')
      .eq('company_id', TEST_COMPANY_ID)
      .limit(1)

    if (checkThirdPartyErr) throw checkThirdPartyErr

    if (remainingThirdParty && remainingThirdParty.length > 0) {
      console.log('   ⚠️  لا يزال هناك سجلات متبقية في third_party_inventory')
    } else {
      console.log('   ✅ تم حذف جميع سجلات third_party_inventory بنجاح')
    }

  } catch (err) {
    console.error('❌ خطأ عام:', err)
    process.exit(1)
  }
}

main()

