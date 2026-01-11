/**
 * 🔍 فحص API أوامر البيع للمستخدم foodcana1976
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

const env = {}
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
  const [key, ...value] = line.split('=')
  if (key && value.length) env[key.trim()] = value.join('=').replace(/"/g, '').trim()
})

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function testSalesOrdersAPI() {
  console.log('🔍 فحص API أوامر البيع للمستخدم foodcana1976')
  
  try {
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('user_id')
      .eq('username', 'foodcana1976')
      .single()

    const userId = userProfile.user_id
    const companyId = 'f0ffc062-1e6e-4324-8be4-f5052e881a67' // شركة تست

    console.log(`👤 المستخدم: ${userId}`)
    console.log(`🏢 الشركة: ${companyId}`)

    // فحص سياق الحوكمة
    const { data: governance } = await supabase
      .from('user_branch_cost_center')
      .select('branch_id, cost_center_id')
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .single()

    if (!governance) {
      console.log('❌ لا يوجد سياق حوكمة')
      return
    }

    console.log(`🏢 الفرع: ${governance.branch_id}`)
    console.log(`💰 مركز التكلفة: ${governance.cost_center_id}`)

    // محاكاة استعلام API
    const { data: orders, error } = await supabase
      .from('sales_orders')
      .select(`
        *,
        customers:customer_id (id, name, phone, city)
      `)
      .eq('company_id', companyId)
      .eq('branch_id', governance.branch_id)
      .eq('cost_center_id', governance.cost_center_id)
      .eq('created_by_user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('❌ خطأ في API:', error)
      return
    }

    console.log(`\n📋 أوامر البيع المرئية: ${orders?.length || 0}`)
    if (orders && orders.length > 0) {
      orders.forEach(order => {
        console.log(`✅ ${order.so_number}: ${order.customers?.name} - ${order.total}`)
      })
    } else {
      console.log('❌ لا توجد أوامر بيع مرئية')
      
      // فحص جميع أوامر البيع في الشركة
      const { data: allOrders } = await supabase
        .from('sales_orders')
        .select('so_number, branch_id, cost_center_id, created_by_user_id, total')
        .eq('company_id', companyId)

      console.log(`\n🔍 جميع أوامر البيع في الشركة: ${allOrders?.length || 0}`)
      allOrders?.forEach(order => {
        const match = order.branch_id === governance.branch_id && 
                     order.cost_center_id === governance.cost_center_id &&
                     order.created_by_user_id === userId
        console.log(`${match ? '✅' : '❌'} ${order.so_number}: فرع ${order.branch_id}, مركز ${order.cost_center_id}, منشئ ${order.created_by_user_id}`)
      })
    }

  } catch (error) {
    console.error('❌ خطأ:', error)
  }
}

testSalesOrdersAPI()