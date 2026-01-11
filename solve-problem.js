/**
 * 🔧 حل نهائي - البحث بالكود
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

const env = {}
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
  const [key, ...value] = line.split('=')
  if (key && value.length) env[key.trim()] = value.join('=').replace(/"/g, '').trim()
})

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function solveProblem() {
  try {
    const userId = '949d65e0-2e8f-4566-b820-4778ed149304'
    const companyId = 'f0ffc062-1e6e-4324-8be4-f5052e881a67'
    const branchId = '3808e27d-8461-4684-989d-fddbb4f5d029' // مصر الجديدة

    // البحث عن مركز التكلفة بالكود CC-BR01
    const { data: costCenter } = await supabase
      .from('cost_centers')
      .select('id, name, code')
      .eq('company_id', companyId)
      .eq('code', 'CC-BR01')
      .single()

    if (!costCenter) {
      console.log('❌ لم يتم العثور على مركز التكلفة CC-BR01')
      return
    }

    console.log(`💰 مركز التكلفة: ${costCenter.name} - ${costCenter.code} (${costCenter.id})`)

    // تحديث سياق الحوكمة
    await supabase
      .from('user_branch_cost_center')
      .upsert({
        user_id: userId,
        company_id: companyId,
        branch_id: branchId,
        cost_center_id: costCenter.id
      })

    // تحديث أمر البيع
    await supabase
      .from('sales_orders')
      .update({
        branch_id: branchId,
        cost_center_id: costCenter.id,
        created_by_user_id: userId
      })
      .eq('company_id', companyId)
      .eq('so_number', 'SO-0001')

    // التحقق
    const { data: orders } = await supabase
      .from('sales_orders')
      .select('so_number, total')
      .eq('company_id', companyId)
      .eq('branch_id', branchId)
      .eq('cost_center_id', costCenter.id)
      .eq('created_by_user_id', userId)

    console.log(`🎉 أوامر البيع المرئية: ${orders?.length || 0}`)
    orders?.forEach(o => console.log(`  ✅ ${o.so_number}: ${o.total}`))

  } catch (error) {
    console.error('❌ خطأ:', error)
  }
}

solveProblem()