/**
 * 🔧 حل نهائي مع معالجة الأخطاء
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

const env = {}
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
  const [key, ...value] = line.split('=')
  if (key && value.length) env[key.trim()] = value.join('=').replace(/"/g, '').trim()
})

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function ultimateFix() {
  try {
    const userId = '949d65e0-2e8f-4566-b820-4778ed149304'
    const companyId = 'f0ffc062-1e6e-4324-8be4-f5052e881a67'
    const branchId = '3808e27d-8461-4684-989d-fddbb4f5d029'

    console.log('🔧 الحل النهائي لمشكلة أمر البيع...')

    // محاولة إنشاء مركز تكلفة
    let costCenterId
    try {
      const { data: newCC, error: ccError } = await supabase
        .from('cost_centers')
        .insert({
          company_id: companyId,
          branch_id: branchId,
          name: 'مركز التكلفة - مصر الجديدة',
          code: 'CC-BR01',
          is_main: false
        })
        .select('id')
        .single()

      if (ccError) {
        console.log('⚠️ مركز التكلفة موجود بالفعل، سنبحث عنه...')
        
        // البحث عن مركز تكلفة موجود
        const { data: existingCC } = await supabase
          .from('cost_centers')
          .select('id')
          .eq('company_id', companyId)
          .limit(1)
          .single()

        costCenterId = existingCC?.id
      } else {
        costCenterId = newCC.id
        console.log(`✅ تم إنشاء مركز تكلفة جديد: ${costCenterId}`)
      }
    } catch (e) {
      console.log('⚠️ خطأ في إنشاء مركز التكلفة، سنستخدم معرف ثابت')
      costCenterId = 'd0965e78-1ba4-4741-8f9c-b9e7b590208f' // معرف مؤقت
    }

    if (!costCenterId) {
      console.log('❌ لا يمكن الحصول على معرف مركز التكلفة')
      return
    }

    console.log(`💰 معرف مركز التكلفة: ${costCenterId}`)

    // تحديث سياق الحوكمة
    await supabase
      .from('user_branch_cost_center')
      .upsert({
        user_id: userId,
        company_id: companyId,
        branch_id: branchId,
        cost_center_id: costCenterId
      })

    console.log('✅ تم تحديث سياق الحوكمة')

    // تحديث أمر البيع
    await supabase
      .from('sales_orders')
      .update({
        branch_id: branchId,
        cost_center_id: costCenterId,
        created_by_user_id: userId
      })
      .eq('company_id', companyId)
      .eq('so_number', 'SO-0001')

    console.log('✅ تم تحديث أمر البيع')

    // التحقق النهائي
    const { data: orders } = await supabase
      .from('sales_orders')
      .select('so_number, total')
      .eq('company_id', companyId)
      .eq('branch_id', branchId)
      .eq('cost_center_id', costCenterId)
      .eq('created_by_user_id', userId)

    console.log(`\n🎉 أوامر البيع المرئية: ${orders?.length || 0}`)
    if (orders && orders.length > 0) {
      orders.forEach(o => console.log(`  ✅ ${o.so_number}: ${o.total}`))
      console.log('\n🎊 تم حل المشكلة! المستخدم foodcana1976 يمكنه الآن رؤية أمر البيع SO-0001')
    } else {
      console.log('❌ لا تزال هناك مشكلة')
    }

  } catch (error) {
    console.error('❌ خطأ عام:', error)
  }
}

ultimateFix()