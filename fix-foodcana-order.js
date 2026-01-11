/**
 * 🔧 إصلاح مشكلة أمر البيع للمستخدم foodcana1976
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

const env = {}
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
  const [key, ...value] = line.split('=')
  if (key && value.length) env[key.trim()] = value.join('=').replace(/"/g, '').trim()
})

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function fixFoodcanaSalesOrderIssue() {
  console.log('🔧 إصلاح مشكلة أمر البيع للمستخدم foodcana1976')
  
  try {
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('user_id')
      .eq('username', 'foodcana1976')
      .single()

    const userId = userProfile.user_id

    const { data: testCompany } = await supabase
      .from('companies')
      .select('id')
      .eq('name', 'تست')
      .single()

    // 1️⃣ إصلاح created_by_user_id في أمر البيع
    const { error: updateOrderError } = await supabase
      .from('sales_orders')
      .update({ created_by_user_id: userId })
      .eq('company_id', testCompany.id)
      .eq('so_number', 'SO-0001')

    if (updateOrderError) {
      console.error('❌ خطأ في تحديث أمر البيع:', updateOrderError)
    } else {
      console.log('✅ تم تحديث منشئ أمر البيع')
    }

    // 2️⃣ إنشاء سياق حوكمة للمستخدم
    const { data: branch } = await supabase
      .from('branches')
      .select('id, name')
      .eq('company_id', testCompany.id)
      .ilike('name', '%مصر الجديدة%')
      .single()

    const { data: costCenter } = await supabase
      .from('cost_centers')
      .select('id, name')
      .eq('company_id', testCompany.id)
      .limit(1)
      .single()

    if (branch && costCenter) {
      const { error: govError } = await supabase
        .from('user_branch_cost_center')
        .upsert({
          user_id: userId,
          company_id: testCompany.id,
          branch_id: branch.id,
          cost_center_id: costCenter.id
        })

      if (govError) {
        console.error('❌ خطأ في إنشاء سياق الحوكمة:', govError)
      } else {
        console.log(`✅ تم إنشاء سياق حوكمة: ${branch.name}`)
      }

      // 3️⃣ تحديث أمر البيع ليتطابق مع سياق الحوكمة
      const { error: updateBranchError } = await supabase
        .from('sales_orders')
        .update({
          branch_id: branch.id,
          cost_center_id: costCenter.id
        })
        .eq('company_id', testCompany.id)
        .eq('so_number', 'SO-0001')

      if (updateBranchError) {
        console.error('❌ خطأ في تحديث فرع أمر البيع:', updateBranchError)
      } else {
        console.log('✅ تم تحديث فرع ومركز تكلفة أمر البيع')
      }
    }

    // 4️⃣ التحقق من النتيجة
    const { data: visibleOrders } = await supabase
      .from('sales_orders')
      .select('so_number, total, created_by_user_id')
      .eq('company_id', testCompany.id)
      .eq('branch_id', branch?.id)
      .eq('cost_center_id', costCenter?.id)
      .eq('created_by_user_id', userId)

    console.log(`🎉 أوامر البيع المرئية الآن: ${visibleOrders?.length || 0}`)
    if (visibleOrders && visibleOrders.length > 0) {
      visibleOrders.forEach(order => {
        console.log(`  - ${order.so_number}: ${order.total}`)
      })
    }

  } catch (error) {
    console.error('❌ خطأ:', error)
  }
}

fixFoodcanaSalesOrderIssue()