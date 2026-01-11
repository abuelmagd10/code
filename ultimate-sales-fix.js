/**
 * 🔧 حل نهائي لمشكلة أوامر البيع
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

const env = {}
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
  const [key, ...value] = line.split('=')
  if (key && value.length) env[key.trim()] = value.join('=').replace(/"/g, '').trim()
})

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function ultimateSalesOrdersFix() {
  try {
    const vitaCompanyId = '9c92a597-8c88-42a7-ad02-bd4a25b755ee'
    const ownerId = '92359b0f-d240-4552-b29e-d17ea192cdd1'
    
    console.log('🔧 الحل النهائي لمشكلة أوامر البيع')

    // جلب الفرع الرئيسي
    const { data: mainBranch } = await supabase
      .from('branches')
      .select('id')
      .eq('company_id', vitaCompanyId)
      .eq('is_main', true)
      .single()

    // إنشاء مركز تكلفة رئيسي
    const { data: costCenter, error: ccError } = await supabase
      .from('cost_centers')
      .upsert({
        company_id: vitaCompanyId,
        branch_id: mainBranch.id,
        name: 'مركز التكلفة الرئيسي',
        code: 'CC-MAIN',
        is_main: true
      })
      .select('id')
      .single()

    if (ccError) {
      // استخدام مركز تكلفة موجود
      const { data: existingCC } = await supabase
        .from('cost_centers')
        .select('id')
        .eq('company_id', vitaCompanyId)
        .limit(1)
        .single()
      
      if (existingCC) {
        console.log('✅ استخدام مركز تكلفة موجود')
        
        // إنشاء سياق حوكمة للمالك
        await supabase
          .from('user_branch_cost_center')
          .upsert({
            user_id: ownerId,
            company_id: vitaCompanyId,
            branch_id: mainBranch.id,
            cost_center_id: existingCC.id
          })

        // تحديث جميع أوامر البيع بدون فرع أو مركز تكلفة
        await supabase
          .from('sales_orders')
          .update({
            branch_id: mainBranch.id,
            cost_center_id: existingCC.id
          })
          .eq('company_id', vitaCompanyId)
          .or('branch_id.is.null,cost_center_id.is.null')

        console.log('✅ تم إصلاح جميع أوامر البيع')
      }
    } else {
      console.log('✅ تم إنشاء مركز تكلفة جديد')
      
      // إنشاء سياق حوكمة للمالك
      await supabase
        .from('user_branch_cost_center')
        .upsert({
          user_id: ownerId,
          company_id: vitaCompanyId,
          branch_id: mainBranch.id,
          cost_center_id: costCenter.id
        })

      console.log('✅ تم إنشاء سياق حوكمة للمالك')
    }

    console.log('\n🎉 تم الانتهاء من الإصلاح!')
    console.log('💡 الآن يجب أن تظهر أوامر البيع لجميع المستخدمين')

  } catch (error) {
    console.error('❌ خطأ:', error)
  }
}

ultimateSalesOrdersFix()