// =====================================================
// حذف بيانات طلبات النقل (Inventory Transfers) لشركة "تست"
// Cleanup Inventory Transfers Data for Test Company
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
  console.log('🗑️  بدء حذف بيانات طلبات النقل لشركة "تست"...\n')

  try {
    // 1. جلب طلبات النقل
    console.log('1️⃣ جلب طلبات النقل...')
    const { data: transfers, error: transfersErr } = await supabase
      .from('inventory_transfers')
      .select('id, transfer_number, status')
      .eq('company_id', TEST_COMPANY_ID)

    if (transfersErr) throw transfersErr

    const transfersCount = transfers?.length || 0
    console.log(`   ✅ تم العثور على ${transfersCount} طلب نقل\n`)

    if (transfersCount > 0) {
      console.log('   📋 طلبات النقل:')
      transfers.forEach((transfer) => {
        console.log(`      - ${transfer.transfer_number} (${transfer.status})`)
      })
      console.log('')
    }

    // 2. جلب بنود طلبات النقل
    console.log('2️⃣ جلب بنود طلبات النقل...')
    const transferIds = transfers?.map((t) => t.id) || []
    let transferItemsCount = 0

    if (transferIds.length > 0) {
      const { data: transferItems, error: itemsErr } = await supabase
        .from('inventory_transfer_items')
        .select('id, transfer_id, product_id, quantity_requested')
        .in('transfer_id', transferIds)

      if (itemsErr) throw itemsErr
      transferItemsCount = transferItems?.length || 0
      console.log(`   ✅ تم العثور على ${transferItemsCount} بند نقل\n`)
    } else {
      console.log('   ℹ️  لا توجد طلبات نقل\n')
    }

    // 3. جلب حركات المخزون المرتبطة
    console.log('3️⃣ جلب حركات المخزون المرتبطة...')
    let inventoryTxCount = 0

    if (transferIds.length > 0) {
      const { data: inventoryTx, error: txErr } = await supabase
        .from('inventory_transactions')
        .select('id, product_id, transaction_type, reference_id')
        .eq('company_id', TEST_COMPANY_ID)
        .in('reference_id', transferIds)
        .in('transaction_type', ['transfer_out', 'transfer_in', 'transfer_cancelled'])

      if (txErr) throw txErr
      inventoryTxCount = inventoryTx?.length || 0
      console.log(`   ✅ تم العثور على ${inventoryTxCount} حركة مخزون مرتبطة\n`)
    } else {
      console.log('   ℹ️  لا توجد حركات مخزون مرتبطة\n')
    }

    // 4. حذف حركات المخزون أولاً
    if (inventoryTxCount > 0 && transferIds.length > 0) {
      console.log('4️⃣ حذف حركات المخزون المرتبطة...')
      const { error: deleteTxErr } = await supabase
        .from('inventory_transactions')
        .delete()
        .eq('company_id', TEST_COMPANY_ID)
        .in('reference_id', transferIds)
        .in('transaction_type', ['transfer_out', 'transfer_in', 'transfer_cancelled'])

      if (deleteTxErr) throw deleteTxErr
      console.log(`   ✅ تم حذف ${inventoryTxCount} حركة مخزون\n`)
    } else {
      console.log('4️⃣ لا توجد حركات مخزون للحذف\n')
    }

    // 5. حذف بنود طلبات النقل
    if (transferItemsCount > 0 && transferIds.length > 0) {
      console.log('5️⃣ حذف بنود طلبات النقل...')
      const { error: deleteItemsErr } = await supabase
        .from('inventory_transfer_items')
        .delete()
        .in('transfer_id', transferIds)

      if (deleteItemsErr) throw deleteItemsErr
      console.log(`   ✅ تم حذف ${transferItemsCount} بند نقل\n`)
    } else {
      console.log('5️⃣ لا توجد بنود نقل للحذف\n')
    }

    // 6. حذف طلبات النقل
    if (transfersCount > 0) {
      console.log('6️⃣ حذف طلبات النقل...')
      const { error: deleteTransfersErr } = await supabase
        .from('inventory_transfers')
        .delete()
        .eq('company_id', TEST_COMPANY_ID)

      if (deleteTransfersErr) throw deleteTransfersErr
      console.log(`   ✅ تم حذف ${transfersCount} طلب نقل\n`)
    } else {
      console.log('6️⃣ لا توجد طلبات نقل للحذف\n')
    }

    // 7. ملخص نهائي
    console.log('📊 الملخص النهائي:')
    console.log(`   ✅ تم حذف ${transfersCount} طلب نقل`)
    console.log(`   ✅ تم حذف ${transferItemsCount} بند نقل`)
    console.log(`   ✅ تم حذف ${inventoryTxCount} حركة مخزون`)
    console.log('')
    console.log('✅ تم الانتهاء من حذف بيانات طلبات النقل')

    // 8. التحقق من النتيجة
    console.log('')
    console.log('🔍 التحقق من النتيجة...')
    const { data: remainingTransfers, error: checkTransfersErr } = await supabase
      .from('inventory_transfers')
      .select('id')
      .eq('company_id', TEST_COMPANY_ID)
      .limit(1)

    if (checkTransfersErr) throw checkTransfersErr

    if (remainingTransfers && remainingTransfers.length > 0) {
      console.log('   ⚠️  لا يزال هناك طلبات نقل متبقية')
    } else {
      console.log('   ✅ تم حذف جميع طلبات النقل بنجاح')
    }

    // التحقق من البنود
    const { data: remainingItems, error: checkItemsErr } = await supabase
      .from('inventory_transfer_items')
      .select('id')
      .limit(1)

    if (checkItemsErr) {
      console.log('   ⚠️  خطأ في التحقق من البنود:', checkItemsErr.message)
    } else if (remainingItems && remainingItems.length > 0) {
      // التحقق من أن البنود المتبقية ليست لشركة "تست"
      const { data: testCompanyItems } = await supabase
        .from('inventory_transfer_items')
        .select('id, inventory_transfers!inner(company_id)')
        .eq('inventory_transfers.company_id', TEST_COMPANY_ID)
        .limit(1)

      if (testCompanyItems && testCompanyItems.length > 0) {
        console.log('   ⚠️  لا يزال هناك بنود نقل متبقية لشركة "تست"')
      } else {
        console.log('   ✅ تم حذف جميع بنود النقل لشركة "تست"')
      }
    } else {
      console.log('   ✅ لا توجد بنود نقل متبقية')
    }

  } catch (err) {
    console.error('❌ خطأ عام:', err)
    process.exit(1)
  }
}

main()

