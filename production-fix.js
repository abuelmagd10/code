/**
 * 🔧 إصلاح نهائي لتطابق الفروع
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

const env = {}
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
  const [key, ...value] = line.split('=')
  if (key && value.length) env[key.trim()] = value.join('=').replace(/"/g, '').trim()
})

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function finalProductionFix() {
  console.log('🔧 إصلاح نهائي للموقع المباشر')
  
  try {
    const userId = '949d65e0-2e8f-4566-b820-4778ed149304'
    const companyId = 'f0ffc062-1e6e-4324-8be4-f5052e881a67'
    
    // تحديث سياق الحوكمة ليتطابق مع أمر البيع
    const { error: govError } = await supabase
      .from('user_branch_cost_center')
      .update({
        branch_id: '3808e27d-8461-4684-989d-fddbb4f5d029', // فرع مصر الجديدة
        cost_center_id: '1e0ebeb8-3302-4f7b-99ec-b61fd160feec'
      })
      .eq('user_id', userId)
      .eq('company_id', companyId)

    if (govError) {
      console.error('❌ خطأ في تحديث سياق الحوكمة:', govError)
    } else {
      console.log('✅ تم تحديث سياق الحوكمة')
    }

    // التحقق النهائي
    const { data: orders } = await supabase
      .from('sales_orders')
      .select('so_number, total')
      .eq('company_id', companyId)
      .eq('branch_id', '3808e27d-8461-4684-989d-fddbb4f5d029')
      .eq('cost_center_id', '1e0ebeb8-3302-4f7b-99ec-b61fd160feec')
      .eq('created_by_user_id', userId)

    console.log(`🎉 أوامر البيع المرئية: ${orders?.length || 0}`)
    orders?.forEach(o => console.log(`  ✅ ${o.so_number}: ${o.total}`))

    if (orders && orders.length > 0) {
      console.log('\n🌐 الآن يجب أن يظهر أمر البيع في:')
      console.log('   https://7esab.com/sales-orders')
      console.log('\n💡 قد تحتاج لتسجيل خروج وإعادة دخول للمستخدم foodcana1976')
    }

  } catch (error) {
    console.error('❌ خطأ:', error)
  }
}

finalProductionFix()