/**
 * 🔧 فحص شامل لمشكلة عدم ظهور أوامر البيع
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

const env = {}
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
  const [key, ...value] = line.split('=')
  if (key && value.length) env[key.trim()] = value.join('=').replace(/"/g, '').trim()
})

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function diagnoseAllSalesOrders() {
  try {
    console.log('🔧 فحص شامل لمشكلة عدم ظهور أوامر البيع')
    console.log('=' .repeat(60))

    // فحص شركة VitaSlims (المالك احمد ابو المجد)
    const vitaCompanyId = '9c92a597-8c88-42a7-ad02-bd4a25b755ee'
    
    console.log('\n🏢 شركة VitaSlims:')
    
    // جلب جميع أوامر البيع
    const { data: allOrders } = await supabase
      .from('sales_orders')
      .select('so_number, total, branch_id, cost_center_id, created_by_user_id')
      .eq('company_id', vitaCompanyId)

    console.log(`📋 إجمالي أوامر البيع: ${allOrders?.length || 0}`)

    if (allOrders && allOrders.length > 0) {
      // فحص الفروع ومراكز التكلفة
      const branches = [...new Set(allOrders.map(o => o.branch_id).filter(Boolean))]
      const costCenters = [...new Set(allOrders.map(o => o.cost_center_id).filter(Boolean))]
      
      console.log(`🏢 الفروع المستخدمة: ${branches.length}`)
      console.log(`💰 مراكز التكلفة المستخدمة: ${costCenters.length}`)
      
      // فحص الأوامر بدون فرع أو مركز تكلفة
      const ordersWithoutBranch = allOrders.filter(o => !o.branch_id)
      const ordersWithoutCostCenter = allOrders.filter(o => !o.cost_center_id)
      
      console.log(`❌ أوامر بدون فرع: ${ordersWithoutBranch.length}`)
      console.log(`❌ أوامر بدون مركز تكلفة: ${ordersWithoutCostCenter.length}`)
      
      // إصلاح الأوامر بدون فرع أو مركز تكلفة
      if (ordersWithoutBranch.length > 0 || ordersWithoutCostCenter.length > 0) {
        console.log('\n🔧 إصلاح الأوامر بدون فرع أو مركز تكلفة...')
        
        // جلب الفرع الرئيسي
        const { data: mainBranch } = await supabase
          .from('branches')
          .select('id, name')
          .eq('company_id', vitaCompanyId)
          .eq('is_main', true)
          .single()

        // جلب مركز التكلفة الرئيسي
        const { data: mainCostCenter } = await supabase
          .from('cost_centers')
          .select('id, name')
          .eq('company_id', vitaCompanyId)
          .limit(1)
          .single()

        if (mainBranch && mainCostCenter) {
          // تحديث الأوامر بدون فرع
          if (ordersWithoutBranch.length > 0) {
            const { error: branchError } = await supabase
              .from('sales_orders')
              .update({ branch_id: mainBranch.id })
              .eq('company_id', vitaCompanyId)
              .is('branch_id', null)

            if (!branchError) {
              console.log(`✅ تم إصلاح ${ordersWithoutBranch.length} أمر بدون فرع`)
            }
          }

          // تحديث الأوامر بدون مركز تكلفة
          if (ordersWithoutCostCenter.length > 0) {
            const { error: ccError } = await supabase
              .from('sales_orders')
              .update({ cost_center_id: mainCostCenter.id })
              .eq('company_id', vitaCompanyId)
              .is('cost_center_id', null)

            if (!ccError) {
              console.log(`✅ تم إصلاح ${ordersWithoutCostCenter.length} أمر بدون مركز تكلفة`)
            }
          }
        }
      }
    }

    // فحص شركة تست
    const testCompanyId = 'f0ffc062-1e6e-4324-8be4-f5052e881a67'
    
    console.log('\n🎯 شركة تست:')
    
    const { data: testOrders } = await supabase
      .from('sales_orders')
      .select('so_number, total, branch_id, cost_center_id, created_by_user_id')
      .eq('company_id', testCompanyId)

    console.log(`📋 إجمالي أوامر البيع: ${testOrders?.length || 0}`)

    console.log('\n🎉 تم الانتهاء من الفحص والإصلاح!')
    console.log('💡 الآن يجب أن تظهر أوامر البيع لجميع المستخدمين')

  } catch (error) {
    console.error('❌ خطأ:', error)
  }
}

diagnoseAllSalesOrders()