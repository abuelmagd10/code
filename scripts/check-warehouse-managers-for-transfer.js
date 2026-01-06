// =====================================================
// فحص مسؤولي المخازن المرتبطين بمخزن الوجهة في طلب النقل
// Check Warehouse Managers for Transfer Destination
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
  console.log('🔍 فحص مسؤولي المخازن المرتبطين بمخزن الوجهة...\n')

  try {
    // 1. جلب طلبات النقل في حالة in_transit
    const { data: transfers, error: transfersErr } = await supabase
      .from('inventory_transfers')
      .select(`
        id,
        transfer_number,
        status,
        destination_warehouse_id,
        destination_branch_id,
        destination_warehouses:warehouses!inventory_transfers_destination_warehouse_id_fkey(id, name, branch_id)
      `)
      .eq('company_id', TEST_COMPANY_ID)
      .in('status', ['in_transit', 'sent'])

    if (transfersErr) throw transfersErr

    if (!transfers || transfers.length === 0) {
      console.log('   ℹ️  لا توجد طلبات نقل في حالة in_transit أو sent')
      return
    }

    for (const transfer of transfers) {
      console.log(`\n📦 ${transfer.transfer_number} (${transfer.status}):`)
      console.log(`   المخزن الوجهة: ${transfer.destination_warehouses?.name || 'غير محدد'} (${transfer.destination_warehouse_id})`)
      console.log(`   فرع الوجهة (من inventory_transfers): ${transfer.destination_branch_id || 'غير محدد'}`)
      console.log(`   فرع المخزن (من warehouses): ${transfer.destination_warehouses?.branch_id || 'غير محدد'}`)

      // 2. جلب مسؤولي المخازن المرتبطين بهذا المخزن
      const { data: managers, error: managersErr } = await supabase
        .from('company_members')
        .select(`
          user_id,
          role,
          warehouse_id,
          branch_id,
          warehouses(id, name, branch_id)
        `)
        .eq('company_id', TEST_COMPANY_ID)
        .eq('warehouse_id', transfer.destination_warehouse_id)
        .eq('role', 'store_manager')

      if (managersErr) throw managersErr

      console.log(`\n   👥 مسؤولي المخازن المرتبطين بهذا المخزن: ${managers?.length || 0}`)
      
      if (managers && managers.length > 0) {
        managers.forEach((manager) => {
          console.log(`\n      👤 User ID: ${manager.user_id}`)
          console.log(`         مخزن: ${manager.warehouses?.name || 'غير محدد'} (${manager.warehouse_id})`)
          console.log(`         فرع المستخدم: ${manager.branch_id || 'غير محدد'}`)
          console.log(`         فرع المخزن: ${manager.warehouses?.branch_id || 'غير محدد'}`)
          console.log(`         فرع الوجهة (من transfer): ${transfer.destination_branch_id || 'غير محدد'}`)
          
          // التحقق من الشروط
          const condition1 = manager.warehouse_id === transfer.destination_warehouse_id
          const condition2a = manager.branch_id === transfer.destination_branch_id
          const condition2b = manager.branch_id === transfer.destination_warehouses?.branch_id
          const condition3 = manager.warehouse_id !== transfer.destination_warehouse_id ? false : true // هذا دائماً true لأننا فلترنا بنفس warehouse_id

          console.log(`\n         ✅ شرط 1 (destination_warehouse_id === userWarehouseId): ${condition1 ? 'نعم' : 'لا'}`)
          console.log(`         ✅ شرط 2a (destination_branch_id === userBranchId من transfer): ${condition2a ? 'نعم' : 'لا'}`)
          console.log(`         ✅ شرط 2b (warehouse.branch_id === userBranchId): ${condition2b ? 'نعم' : 'لا'}`)
          
          if (condition1 && (condition2a || condition2b)) {
            console.log(`         ✅ يمكنه اعتماد الاستلام`)
          } else {
            console.log(`         ❌ لا يمكنه اعتماد الاستلام`)
            if (!condition2a && !condition2b) {
              console.log(`         ⚠️  المشكلة: فرع المستخدم (${manager.branch_id}) لا يطابق فرع الوجهة (${transfer.destination_branch_id} أو ${transfer.destination_warehouses?.branch_id})`)
            }
          }
        })
      } else {
        console.log(`      ⚠️  لا يوجد مسؤول مخزن مرتبط بهذا المخزن`)
      }
    }

    console.log('\n✅ تم الانتهاء من الفحص')
  } catch (err) {
    console.error('❌ خطأ عام:', err)
    process.exit(1)
  }
}

main()

