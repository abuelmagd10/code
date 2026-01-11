/**
 * 🔧 إصلاح عدم تطابق الفرع ومركز التكلفة
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

const env = {}
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
  const [key, ...value] = line.split('=')
  if (key && value.length) env[key.trim()] = value.join('=').replace(/"/g, '').trim()
})

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function fixBranchMismatch() {
  console.log('🔧 إصلاح عدم تطابق الفرع ومركز التكلفة')
  
  try {
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('user_id')
      .eq('username', 'foodcana1976')
      .single()

    const userId = userProfile.user_id
    const companyId = 'f0ffc062-1e6e-4324-8be4-f5052e881a67'

    // تحديث سياق الحوكمة ليتطابق مع أمر البيع
    const { error } = await supabase
      .from('user_branch_cost_center')
      .update({
        branch_id: '0f489998-d542-4ae9-b001-c1b6f1047f50', // الفرع الرئيسي
        cost_center_id: '1e0ebeb8-3302-4f7b-99ec-b61fd160feec' // مركز التكلفة الصحيح
      })
      .eq('user_id', userId)
      .eq('company_id', companyId)

    if (error) {
      console.error('❌ خطأ:', error)
    } else {
      console.log('✅ تم تحديث سياق الحوكمة')
      
      // التحقق من النتيجة
      const { data: orders } = await supabase
        .from('sales_orders')
        .select('so_number, total')
        .eq('company_id', companyId)
        .eq('branch_id', '0f489998-d542-4ae9-b001-c1b6f1047f50')
        .eq('cost_center_id', '1e0ebeb8-3302-4f7b-99ec-b61fd160feec')
        .eq('created_by_user_id', userId)

      console.log(`🎉 أوامر البيع المرئية: ${orders?.length || 0}`)
      orders?.forEach(order => {
        console.log(`✅ ${order.so_number}: ${order.total}`)
      })
    }

  } catch (error) {
    console.error('❌ خطأ:', error)
  }
}

fixBranchMismatch()