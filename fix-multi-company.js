/**
 * 🔧 فحص أدوار المستخدم في جميع الشركات وإصلاح شركة تست
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

const env = {}
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
  const [key, ...value] = line.split('=')
  if (key && value.length) env[key.trim()] = value.join('=').replace(/"/g, '').trim()
})

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function fixMultiCompanyUser() {
  try {
    const userId = '949d65e0-2e8f-4566-b820-4778ed149304'
    const testCompanyId = 'f0ffc062-1e6e-4324-8be4-f5052e881a67'

    console.log('👤 فحص أدوار المستخدم foodcana1976 في جميع الشركات:')
    console.log('=' .repeat(60))

    // جلب جميع عضويات المستخدم
    const { data: memberships } = await supabase
      .from('company_members')
      .select(`
        role,
        companies:company_id (id, name)
      `)
      .eq('user_id', userId)

    if (memberships) {
      memberships.forEach(m => {
        const isTestCompany = m.companies.id === testCompanyId
        console.log(`${isTestCompany ? '🎯' : '🏢'} ${m.companies.name}: ${m.role} ${isTestCompany ? '← شركة تست' : ''}`)
      })
    }

    // فحص الدور الحالي في شركة تست
    const testMembership = memberships?.find(m => m.companies.id === testCompanyId)
    console.log(`\n📋 الدور الحالي في شركة تست: ${testMembership?.role}`)

    // إذا كان الدور employee، نغيره إلى manager
    if (testMembership?.role === 'employee') {
      console.log('🔧 تحديث الدور من employee إلى manager...')
      
      const { error: updateError } = await supabase
        .from('company_members')
        .update({ role: 'manager' })
        .eq('user_id', userId)
        .eq('company_id', testCompanyId)

      if (updateError) {
        console.error('❌ خطأ في تحديث الدور:', updateError)
      } else {
        console.log('✅ تم تحديث الدور إلى manager في شركة تست')
      }
    } else {
      console.log(`✅ الدور الحالي (${testMembership?.role}) مناسب`)
    }

    // فحص أوامر البيع في شركة تست
    const { data: orders } = await supabase
      .from('sales_orders')
      .select('so_number, total, created_by_user_id')
      .eq('company_id', testCompanyId)

    console.log(`\n📋 أوامر البيع في شركة تست: ${orders?.length || 0}`)
    orders?.forEach(o => {
      const isOwner = o.created_by_user_id === userId
      console.log(`  ${isOwner ? '✅' : '📄'} ${o.so_number}: ${o.total} ${isOwner ? '(منشأ بواسطة المستخدم)' : ''}`)
    })

    console.log('\n🎉 الآن المستخدم يجب أن يرى أوامر البيع في شركة تست!')
    console.log('💡 تأكد من أن المستخدم يستخدم شركة "تست" في الموقع')

  } catch (error) {
    console.error('❌ خطأ:', error)
  }
}

fixMultiCompanyUser()