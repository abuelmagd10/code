/**
 * 🔧 إنشاء سياق حوكمة للمالك احمد ابو المجد
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

const env = {}
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
  const [key, ...value] = line.split('=')
  if (key && value.length) env[key.trim()] = value.join('=').replace(/"/g, '').trim()
})

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function createOwnerGovernance() {
  try {
    const vitaCompanyId = '9c92a597-8c88-42a7-ad02-bd4a25b755ee'
    
    // البحث عن المالك احمد ابو المجد
    const { data: owner } = await supabase
      .from('user_profiles')
      .select('user_id')
      .eq('username', 'abuelmagd')
      .single()

    if (!owner) {
      console.log('❌ لم يتم العثور على المالك')
      return
    }

    console.log(`👤 المالك: ${owner.user_id}`)

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

    console.log(`🏢 الفرع الرئيسي: ${mainBranch?.name}`)
    console.log(`💰 مركز التكلفة: ${mainCostCenter?.name}`)

    // إنشاء سياق حوكمة للمالك
    const { error: govError } = await supabase
      .from('user_branch_cost_center')
      .upsert({
        user_id: owner.user_id,
        company_id: vitaCompanyId,
        branch_id: mainBranch.id,
        cost_center_id: mainCostCenter.id
      })

    if (govError) {
      console.error('❌ خطأ في إنشاء سياق الحوكمة:', govError)
    } else {
      console.log('✅ تم إنشاء سياق الحوكمة للمالك')
    }

    console.log('\n🎉 الآن يجب أن تظهر أوامر البيع للمالك!')

  } catch (error) {
    console.error('❌ خطأ:', error)
  }
}

createOwnerGovernance()