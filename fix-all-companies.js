/**
 * 🔧 إصلاح شامل لسياق الحوكمة في جميع الشركات
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

const env = {}
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
  const [key, ...value] = line.split('=')
  if (key && value.length) env[key.trim()] = value.join('=').replace(/"/g, '').trim()
})

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function fixAllCompaniesGovernance() {
  try {
    const userId = '949d65e0-2e8f-4566-b820-4778ed149304'

    console.log('🔧 إصلاح شامل لسياق الحوكمة في جميع الشركات')
    console.log('=' .repeat(60))

    // جلب جميع عضويات المستخدم
    const { data: memberships } = await supabase
      .from('company_members')
      .select(`
        role,
        companies:company_id (id, name)
      `)
      .eq('user_id', userId)

    for (const membership of memberships || []) {
      const companyId = membership.companies.id
      const companyName = membership.companies.name
      
      console.log(`\n🏢 معالجة شركة: ${companyName}`)

      // فحص سياق الحوكمة الحالي
      const { data: governance } = await supabase
        .from('user_branch_cost_center')
        .select('branch_id, cost_center_id')
        .eq('user_id', userId)
        .eq('company_id', companyId)
        .single()

      if (!governance) {
        console.log('❌ لا يوجد سياق حوكمة')
        
        // إنشاء سياق حوكمة جديد
        const { data: mainBranch } = await supabase
          .from('branches')
          .select('id, name')
          .eq('company_id', companyId)
          .eq('is_main', true)
          .single()

        const { data: mainCostCenter } = await supabase
          .from('cost_centers')
          .select('id, name')
          .eq('company_id', companyId)
          .limit(1)
          .single()

        if (mainBranch && mainCostCenter) {
          const { error: govError } = await supabase
            .from('user_branch_cost_center')
            .insert({
              user_id: userId,
              company_id: companyId,
              branch_id: mainBranch.id,
              cost_center_id: mainCostCenter.id
            })

          if (!govError) {
            console.log(`✅ تم إنشاء سياق حوكمة: ${mainBranch.name}`)
          }
        }
      } else {
        console.log(`✅ سياق الحوكمة موجود`)
      }

      // فحص أوامر البيع والفواتير
      const { data: salesOrders } = await supabase
        .from('sales_orders')
        .select('so_number, total, created_by_user_id')
        .eq('company_id', companyId)

      const { data: invoices } = await supabase
        .from('invoices')
        .select('invoice_number, total_amount, created_by_user_id')
        .eq('company_id', companyId)

      console.log(`📋 أوامر البيع: ${salesOrders?.length || 0}`)
      console.log(`🧾 الفواتير: ${invoices?.length || 0}`)

      // عد الأوامر والفواتير المنشأة بواسطة المستخدم
      const userOrders = salesOrders?.filter(o => o.created_by_user_id === userId) || []
      const userInvoices = invoices?.filter(i => i.created_by_user_id === userId) || []

      console.log(`👤 أوامر المستخدم: ${userOrders.length}`)
      console.log(`👤 فواتير المستخدم: ${userInvoices.length}`)
    }

    console.log('\n🎉 تم الانتهاء من الإصلاح الشامل!')
    console.log('💡 الآن يجب أن تظهر أوامر البيع والفواتير في جميع الشركات')

  } catch (error) {
    console.error('❌ خطأ:', error)
  }
}

fixAllCompaniesGovernance()