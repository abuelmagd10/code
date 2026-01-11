/**
 * 🔧 حل نهائي لمشكلة أمر البيع - استخدام مركز التكلفة الصحيح
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

const env = {}
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
  const [key, ...value] = line.split('=')
  if (key && value.length) env[key.trim()] = value.join('=').replace(/"/g, '').trim()
})

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function finalSolution() {
  try {
    const userId = '949d65e0-2e8f-4566-b820-4778ed149304'
    const companyId = 'f0ffc062-1e6e-4324-8be4-f5052e881a67'

    // جلب فرع مصر الجديدة
    const { data: branch } = await supabase
      .from('branches')
      .select('id, name')
      .eq('company_id', companyId)
      .eq('name', 'مصر الجديدة')
      .single()

    // جلب مركز التكلفة الخاص بفرع مصر الجديدة
    const { data: costCenter } = await supabase
      .from('cost_centers')
      .select('id, name, code')
      .eq('company_id', companyId)
      .eq('branch_id', branch.id)
      .single()

    console.log(`🏢 الفرع: ${branch.name} (${branch.id})`)
    console.log(`💰 مركز التكلفة: ${costCenter.name} - ${costCenter.code} (${costCenter.id})`)

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

    // التحقق من النتيجة النهائية
    const { data: visibleOrders } = await supabase
      .from('sales_orders')
      .select('so_number, total, created_by_user_id, branch_id, cost_center_id')
      .eq('company_id', companyId)
      .eq('branch_id', branch.id)
      .eq('cost_center_id', costCenter.id)
      .eq('created_by_user_id', userId)

    console.log(`\n🎉 النتيجة النهائية:`)
    console.log(`📋 أوامر البيع المرئية للمستخدم foodcana1976: ${visibleOrders?.length || 0}`)
    
    if (visibleOrders && visibleOrders.length > 0) {
      visibleOrders.forEach(order => {
        console.log(`  ✅ ${order.so_number}: ${order.total} جنيه`)
        console.log(`     الفرع: ${order.branch_id}`)
        console.log(`     مركز التكلفة: ${order.cost_center_id}`)
        console.log(`     المنشئ: ${order.created_by_user_id}`)
      })
      console.log('\n🎊 تم حل المشكلة! الآن يمكن للمستخدم رؤية أمر البيع.')
    } else {
      console.log('❌ لا تزال المشكلة موجودة')
    }

  } catch (error) {
    console.error('❌ خطأ:', error)
  }
}

finalSolution()