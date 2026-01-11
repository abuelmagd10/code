/**
 * 🔧 حل مشكلة عدم ظهور أمر البيع للمستخدم foodcana1976
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

const env = {}
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
  const [key, ...value] = line.split('=')
  if (key && value.length) env[key.trim()] = value.join('=').replace(/"/g, '').trim()
})

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function fixFoodcanaOrderVisibility() {
  console.log('🔧 حل مشكلة عدم ظهور أمر البيع للمستخدم foodcana1976')
  
  try {
    // جلب معرف المستخدم
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('user_id')
      .eq('username', 'foodcana1976')
      .single()

    const userId = userProfile.user_id
    const companyId = 'f0ffc062-1e6e-4324-8be4-f5052e881a67' // شركة تست

    // جلب فرع مصر الجديدة
    const { data: branch } = await supabase
      .from('branches')
      .select('id, name')
      .eq('company_id', companyId)
      .eq('name', 'مصر الجديدة')
      .single()

    // جلب مركز التكلفة الرئيسي
    const { data: costCenter } = await supabase
      .from('cost_centers')
      .select('id, name')
      .eq('company_id', companyId)
      .limit(1)
      .single()

    console.log(`👤 المستخدم: ${userId}`)
    console.log(`🏢 فرع مصر الجديدة: ${branch?.id}`)
    console.log(`💰 مركز التكلفة: ${costCenter?.id}`)

    // تحديث سياق الحوكمة للمستخدم
    const { error: govError } = await supabase
      .from('user_branch_cost_center')
      .upsert({
        user_id: userId,
        company_id: companyId,
        branch_id: branch.id,
        cost_center_id: costCenter.id
      })

    if (govError) {
      console.error('❌ خطأ في تحديث سياق الحوكمة:', govError)
    } else {
      console.log('✅ تم تحديث سياق الحوكمة')
    }

    // تحديث أمر البيع ليتطابق مع سياق الحوكمة
    const { error: updateError } = await supabase
      .from('sales_orders')
      .update({
        branch_id: branch.id,
        cost_center_id: costCenter.id,
        created_by_user_id: userId
      })
      .eq('company_id', companyId)
      .eq('so_number', 'SO-0001')

    if (updateError) {
      console.error('❌ خطأ في تحديث أمر البيع:', updateError)
    } else {
      console.log('✅ تم تحديث أمر البيع')
    }

    // التحقق من النتيجة
    const { data: visibleOrders } = await supabase
      .from('sales_orders')
      .select('so_number, total, created_by_user_id')
      .eq('company_id', companyId)
      .eq('branch_id', branch.id)
      .eq('cost_center_id', costCenter.id)
      .eq('created_by_user_id', userId)

    console.log(`🎉 أوامر البيع المرئية: ${visibleOrders?.length || 0}`)
    visibleOrders?.forEach(order => {
      console.log(`  ✅ ${order.so_number}: ${order.total}`)
    })

  } catch (error) {
    console.error('❌ خطأ:', error)
  }
}

fixFoodcanaOrderVisibility()