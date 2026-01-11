/**
 * 🔧 فحص دور المستخدم وإصلاح أوامر البيع
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

const env = {}
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
  const [key, ...value] = line.split('=')
  if (key && value.length) env[key.trim()] = value.join('=').replace(/"/g, '').trim()
})

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function fixUserRole() {
  try {
    const userId = '949d65e0-2e8f-4566-b820-4778ed149304'
    const companyId = 'f0ffc062-1e6e-4324-8be4-f5052e881a67'

    // فحص دور المستخدم الحالي
    const { data: member } = await supabase
      .from('company_members')
      .select('role')
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .single()

    console.log(`👤 دور المستخدم الحالي: ${member?.role}`)

    // تحديث الدور إلى manager لرؤية جميع الأوامر
    const { error: roleError } = await supabase
      .from('company_members')
      .update({ role: 'manager' })
      .eq('user_id', userId)
      .eq('company_id', companyId)

    if (roleError) {
      console.error('❌ خطأ في تحديث الدور:', roleError)
    } else {
      console.log('✅ تم تحديث دور المستخدم إلى manager')
    }

    // فحص أوامر البيع مرة أخرى
    const { data: orders } = await supabase
      .from('sales_orders')
      .select('so_number, total, created_by_user_id')
      .eq('company_id', companyId)

    console.log(`📋 جميع أوامر البيع في الشركة: ${orders?.length || 0}`)
    orders?.forEach(o => {
      const isOwner = o.created_by_user_id === userId
      console.log(`  ${isOwner ? '✅' : '❌'} ${o.so_number}: ${o.total} - منشئ: ${o.created_by_user_id}`)
    })

    // الآن بدور manager يجب أن يرى جميع الأوامر
    console.log('\n🎉 بدور manager، المستخدم يجب أن يرى جميع أوامر البيع')

  } catch (error) {
    console.error('❌ خطأ:', error)
  }
}

fixUserRole()