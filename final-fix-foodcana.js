/**
 * 🔧 الحل النهائي لمشكلة أمر البيع للمستخدم foodcana1976
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

const env = {}
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
  const [key, ...value] = line.split('=')
  if (key && value.length) env[key.trim()] = value.join('=').replace(/"/g, '').trim()
})

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function finalFixFoodcanaSalesOrder() {
  console.log('🔧 الحل النهائي لمشكلة أمر البيع')
  
  try {
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('user_id')
      .eq('username', 'foodcana1976')
      .single()

    const userId = userProfile.user_id

    const { data: testCompany } = await supabase
      .from('companies')
      .select('id')
      .eq('name', 'تست')
      .single()

    // جلب بيانات أمر البيع الحالي
    const { data: salesOrder } = await supabase
      .from('sales_orders')
      .select('branch_id, cost_center_id')
      .eq('company_id', testCompany.id)
      .eq('so_number', 'SO-0001')
      .single()

    console.log(`✅ أمر البيع في الفرع: ${salesOrder.branch_id}`)
    console.log(`✅ مركز التكلفة: ${salesOrder.cost_center_id}`)

    // إنشاء سياق حوكمة للمستخدم بنفس الفرع ومركز التكلفة
    const { error: govError } = await supabase
      .from('user_branch_cost_center')
      .upsert({
        user_id: userId,
        company_id: testCompany.id,
        branch_id: salesOrder.branch_id,
        cost_center_id: salesOrder.cost_center_id
      })

    if (govError) {
      console.error('❌ خطأ في إنشاء سياق الحوكمة:', govError)
    } else {
      console.log('✅ تم إنشاء سياق الحوكمة')
    }

    // التحقق من النتيجة
    const { data: visibleOrders } = await supabase
      .from('sales_orders')
      .select('so_number, total')
      .eq('company_id', testCompany.id)
      .eq('branch_id', salesOrder.branch_id)
      .eq('cost_center_id', salesOrder.cost_center_id)
      .eq('created_by_user_id', userId)

    console.log(`🎉 أوامر البيع المرئية: ${visibleOrders?.length || 0}`)
    if (visibleOrders && visibleOrders.length > 0) {
      visibleOrders.forEach(order => {
        console.log(`  ✅ ${order.so_number}: ${order.total}`)
      })
    }

  } catch (error) {
    console.error('❌ خطأ:', error)
  }
}

finalFixFoodcanaSalesOrder()