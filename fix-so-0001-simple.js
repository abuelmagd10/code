/**
 * 🔧 حل مشكلة عدم ظهور أمر البيع SO-0001 للمستخدم foodcana1976
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

const env = {}
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
  const [key, ...value] = line.split('=')
  if (key && value.length) env[key.trim()] = value.join('=').replace(/"/g, '').trim()
})

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function fixSO0001Visibility() {
  console.log('🔧 حل مشكلة عدم ظهور أمر البيع SO-0001 للمستخدم foodcana1976')
  
  try {
    // جلب معرف المستخدم
    const { data: user } = await supabase
      .from('user_profiles')
      .select('user_id')
      .eq('username', 'foodcana1976')
      .single()

    const userId = user.user_id

    // جلب شركة "تست"
    const { data: testCompany } = await supabase
      .from('companies')
      .select('id')
      .eq('name', 'تست')
      .single()

    // جلب شركة VitaSlims (حيث يوجد SO-0001)
    const { data: vitaCompany } = await supabase
      .from('companies')
      .select('id')
      .eq('name', 'VitaSlims')
      .single()

    console.log('✅ تم العثور على الشركات')

    // الحل 1: إضافة المستخدم إلى شركة VitaSlims
    const { error: memberError } = await supabase
      .from('company_members')
      .upsert({
        company_id: vitaCompany.id,
        user_id: userId,
        role: 'manager'
      })

    if (memberError) {
      console.error('❌ خطأ في إضافة العضوية:', memberError)
      return
    }

    // إعداد سياق الحوكمة
    const { data: governance } = await supabase
      .from('user_branch_cost_center')
      .select('branch_id, cost_center_id')
      .eq('company_id', testCompany.id)
      .eq('user_id', userId)
      .single()

    if (governance) {
      // إنشاء سياق حوكمة لشركة VitaSlims
      await supabase
        .from('user_branch_cost_center')
        .upsert({
          user_id: userId,
          company_id: vitaCompany.id,
          branch_id: governance.branch_id,
          cost_center_id: governance.cost_center_id
        })
    }

    console.log('✅ تم إضافة المستخدم إلى شركة VitaSlims')
    console.log('🎉 الآن يمكن للمستخدم رؤية أمر البيع SO-0001')

  } catch (error) {
    console.error('❌ خطأ:', error)
  }
}

fixSO0001Visibility()