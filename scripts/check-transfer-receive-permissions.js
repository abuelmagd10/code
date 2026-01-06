// =====================================================
// فحص صلاحيات اعتماد الاستلام في طلبات النقل لشركة "تست"
// Check Transfer Receive Permissions for Test Company
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
  console.log('🔍 فحص صلاحيات اعتماد الاستلام في طلبات النقل لشركة "تست"...\n')

  try {
    // 1. جلب طلبات النقل في حالة in_transit أو sent
    console.log('1️⃣ جلب طلبات النقل في حالة in_transit أو sent...')
    const { data: transfers, error: transfersErr } = await supabase
      .from('inventory_transfers')
      .select(`
        id,
        transfer_number,
        status,
        source_warehouse_id,
        destination_warehouse_id,
        source_branch_id,
        destination_branch_id,
        source_warehouses:warehouses!inventory_transfers_source_warehouse_id_fkey(id, name, branch_id),
        destination_warehouses:warehouses!inventory_transfers_destination_warehouse_id_fkey(id, name, branch_id)
      `)
      .eq('company_id', TEST_COMPANY_ID)
      .in('status', ['in_transit', 'sent'])

    if (transfersErr) throw transfersErr

    console.log(`   ✅ تم العثور على ${transfers?.length || 0} طلب نقل\n`)

    if (!transfers || transfers.length === 0) {
      console.log('   ℹ️  لا توجد طلبات نقل في حالة in_transit أو sent')
      return
    }

    // 2. عرض تفاصيل الطلبات
    console.log('2️⃣ تفاصيل طلبات النقل:')
    transfers.forEach((transfer) => {
      console.log(`\n   📦 ${transfer.transfer_number} (${transfer.status})`)
      console.log(`      المخزن المصدر: ${transfer.source_warehouses?.name || 'غير محدد'} (${transfer.source_warehouse_id})`)
      console.log(`      فرع المصدر: ${transfer.source_branch_id || 'غير محدد'}`)
      console.log(`      المخزن الوجهة: ${transfer.destination_warehouses?.name || 'غير محدد'} (${transfer.destination_warehouse_id})`)
      console.log(`      فرع الوجهة: ${transfer.destination_branch_id || 'غير محدد'}`)
      console.log(`      فرع المخزن الوجهة (من جدول warehouses): ${transfer.destination_warehouses?.branch_id || 'غير محدد'}`)
    })

    // 3. جلب مسؤولي المخازن في شركة "تست"
    console.log('\n3️⃣ جلب مسؤولي المخازن في شركة "تست"...')
    const { data: storeManagers, error: managersErr } = await supabase
      .from('company_members')
      .select(`
        user_id,
        role,
        warehouse_id,
        branch_id,
        warehouses(id, name, branch_id)
      `)
      .eq('company_id', TEST_COMPANY_ID)
      .eq('role', 'store_manager')

    if (managersErr) throw managersErr

    console.log(`   ✅ تم العثور على ${storeManagers?.length || 0} مسؤول مخزن\n`)

    if (!storeManagers || storeManagers.length === 0) {
      console.log('   ⚠️  لا توجد مسؤولين مخازن في الشركة')
      return
    }

    // 4. فحص كل طلب نقل مع كل مسؤول مخزن
    console.log('4️⃣ فحص صلاحيات اعتماد الاستلام:\n')
    transfers.forEach((transfer) => {
      console.log(`\n   📦 ${transfer.transfer_number} (${transfer.status}):`)
      console.log(`      المخزن الوجهة: ${transfer.destination_warehouses?.name || 'غير محدد'}`)
      console.log(`      فرع الوجهة: ${transfer.destination_branch_id || 'غير محدد'}`)
      
      const matchingManagers = storeManagers.filter((manager) => {
        const managerWarehouseId = manager.warehouse_id
        const managerBranchId = manager.branch_id
        const transferDestWarehouseId = transfer.destination_warehouse_id
        const transferDestBranchId = transfer.destination_branch_id
        const transferSourceWarehouseId = transfer.source_warehouse_id

        // الشروط:
        // 1. destination_warehouse_id === userWarehouseId
        // 2. destination_branch_id === userBranchId
        // 3. source_warehouse_id !== userWarehouseId

        const condition1 = managerWarehouseId === transferDestWarehouseId
        const condition2 = managerBranchId === transferDestBranchId
        const condition3 = managerWarehouseId !== transferSourceWarehouseId

        return condition1 && condition2 && condition3
      })

      if (matchingManagers.length > 0) {
        console.log(`      ✅ يمكن لـ ${matchingManagers.length} مسؤول مخزن اعتماد الاستلام:`)
        matchingManagers.forEach((manager) => {
          console.log(`         - User ID: ${manager.user_id}`)
          console.log(`           مخزن: ${manager.warehouses?.name || 'غير محدد'} (${manager.warehouse_id})`)
          console.log(`           فرع: ${manager.branch_id || 'غير محدد'}`)
        })
      } else {
        console.log(`      ❌ لا يوجد مسؤول مخزن يمكنه اعتماد الاستلام`)
        console.log(`      🔍 التحقق من الشروط:`)
        
        storeManagers.forEach((manager) => {
          const managerWarehouseId = manager.warehouse_id
          const managerBranchId = manager.branch_id
          const transferDestWarehouseId = transfer.destination_warehouse_id
          const transferDestBranchId = transfer.destination_branch_id
          const transferSourceWarehouseId = transfer.source_warehouse_id

          console.log(`\n         👤 User ID: ${manager.user_id}:`)
          console.log(`            مخزن المستخدم: ${manager.warehouses?.name || 'غير محدد'} (${managerWarehouseId})`)
          console.log(`            فرع المستخدم: ${managerBranchId || 'غير محدد'}`)
          console.log(`            مخزن الوجهة: ${transfer.destination_warehouses?.name || 'غير محدد'} (${transferDestWarehouseId})`)
          console.log(`            فرع الوجهة: ${transferDestBranchId || 'غير محدد'}`)
          console.log(`            مخزن المصدر: ${transfer.source_warehouses?.name || 'غير محدد'} (${transferSourceWarehouseId})`)
          
          const condition1 = managerWarehouseId === transferDestWarehouseId
          const condition2 = managerBranchId === transferDestBranchId
          const condition3 = managerWarehouseId !== transferSourceWarehouseId

          console.log(`            ✅ شرط 1 (destination_warehouse_id === userWarehouseId): ${condition1 ? 'نعم' : 'لا'}`)
          console.log(`            ✅ شرط 2 (destination_branch_id === userBranchId): ${condition2 ? 'نعم' : 'لا'}`)
          console.log(`            ✅ شرط 3 (source_warehouse_id !== userWarehouseId): ${condition3 ? 'نعم' : 'لا'}`)
        })
      }
    })

    console.log('\n✅ تم الانتهاء من فحص صلاحيات اعتماد الاستلام')
  } catch (err) {
    console.error('❌ خطأ عام:', err)
    process.exit(1)
  }
}

main()

