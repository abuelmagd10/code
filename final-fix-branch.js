/**
 * 🔧 إنشاء مركز تكلفة وإصلاح المشكلة
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

const env = {}
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
  const [key, ...value] = line.split('=')
  if (key && value.length) env[key.trim()] = value.join('=').replace(/"/g, '').trim()
})

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function createCostCenterAndFix() {
  try {
    const userId = '949d65e0-2e8f-4566-b820-4778ed149304'
    const companyId = 'f0ffc062-1e6e-4324-8be4-f5052e881a67'
    const branchId = '3808e27d-8461-4684-989d-fddbb4f5d029' // مصر الجديدة

    console.log('🔧 إنشاء مركز تكلفة لفرع مصر الجديدة')

    // إنشاء مركز تكلفة لفرع مصر الجديدة
    const { data: costCenter, error: ccError } = await supabase
      .from('cost_centers')
      .upsert({
        company_id: companyId,
        branch_id: branchId,
        name: 'مركز التكلفة - مصر الجديدة',
        code: 'CC-HELIOPOLIS',
        is_main: false
      })
      .select()
      .single()

    if (ccError) {
      console.log('⚠️ مركز التكلفة موجود، سنستخدم الموجود')
      // استخدام مركز تكلفة موجود
      const { data: existingCC } = await supabase
        .from('cost_centers')
        .select('id, name')
        .eq('company_id', companyId)
        .limit(1)
        .single()
      
      if (existingCC) {
        console.log(`✅ استخدام مركز التكلفة: ${existingCC.name}`)
        
        // نقل أمر البيع
        await supabase
          .from('sales_orders')
          .update({
            branch_id: branchId,
            cost_center_id: existingCC.id
          })
          .eq('company_id', companyId)
          .eq('so_number', 'SO-0001')

        // التحقق
        const { data: orders } = await supabase
          .from('sales_orders')
          .select('so_number, total')
          .eq('company_id', companyId)
          .eq('branch_id', branchId)
          .eq('cost_center_id', existingCC.id)
          .eq('created_by_user_id', userId)

        console.log(`🎉 أوامر البيع المرئية: ${orders?.length || 0}`)
        orders?.forEach(o => console.log(`  ✅ ${o.so_number}: ${o.total}`))
      }
    } else {
      console.log(`✅ تم إنشاء مركز التكلفة: ${costCenter.name}`)
      
      // نقل أمر البيع
      await supabase
        .from('sales_orders')
        .update({
          branch_id: branchId,
          cost_center_id: costCenter.id
        })
        .eq('company_id', companyId)
        .eq('so_number', 'SO-0001')

      console.log('✅ تم نقل أمر البيع')
    }

    console.log('\n🌐 الآن يجب أن يظهر أمر البيع في الموقع!')

  } catch (error) {
    console.error('❌ خطأ:', error)
  }
}

createCostCenterAndFix()