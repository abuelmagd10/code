/**
 * 🔧 إصلاح نهائي - نقل أمر البيع إلى فرع مصر الجديدة
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

const env = {}
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
  const [key, ...value] = line.split('=')
  if (key && value.length) env[key.trim()] = value.join('=').replace(/"/g, '').trim()
})

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function moveOrderToCorrectBranch() {
  try {
    const userId = '949d65e0-2e8f-4566-b820-4778ed149304'
    const companyId = 'f0ffc062-1e6e-4324-8be4-f5052e881a67'

    console.log('🔧 نقل أمر البيع إلى فرع مصر الجديدة')

    // جلب فرع مصر الجديدة
    const { data: branch } = await supabase
      .from('branches')
      .select('id, name')
      .eq('company_id', companyId)
      .eq('name', 'مصر الجديدة')
      .single()

    // جلب مركز التكلفة لفرع مصر الجديدة
    const { data: costCenter } = await supabase
      .from('cost_centers')
      .select('id, name')
      .eq('company_id', companyId)
      .eq('branch_id', branch.id)
      .single()

    console.log(`🏢 فرع مصر الجديدة: ${branch.id}`)
    console.log(`💰 مركز التكلفة: ${costCenter.id}`)

    // نقل أمر البيع إلى فرع مصر الجديدة
    const { error: updateError } = await supabase
      .from('sales_orders')
      .update({
        branch_id: branch.id,
        cost_center_id: costCenter.id
      })
      .eq('company_id', companyId)
      .eq('so_number', 'SO-0001')

    if (updateError) {
      console.error('❌ خطأ في نقل أمر البيع:', updateError)
    } else {
      console.log('✅ تم نقل أمر البيع إلى فرع مصر الجديدة')
    }

    // التحقق النهائي
    const { data: orders } = await supabase
      .from('sales_orders')
      .select('so_number, total, branch_id, cost_center_id')
      .eq('company_id', companyId)
      .eq('branch_id', branch.id)
      .eq('cost_center_id', costCenter.id)
      .eq('created_by_user_id', userId)

    console.log(`\n🎉 أوامر البيع في فرع مصر الجديدة: ${orders?.length || 0}`)
    orders?.forEach(o => {
      console.log(`  ✅ ${o.so_number}: ${o.total}`)
    })

    if (orders && orders.length > 0) {
      console.log('\n🌐 الآن يجب أن يظهر أمر البيع في الموقع!')
      console.log('💡 قد تحتاج لإعادة تحميل الصفحة')
    }

  } catch (error) {
    console.error('❌ خطأ:', error)
  }
}

moveOrderToCorrectBranch()