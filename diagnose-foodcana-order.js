/**
 * 🔍 تشخيص مشكلة عدم ظهور أمر البيع الجديد للمستخدم foodcana1976
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

const env = {}
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
  const [key, ...value] = line.split('=')
  if (key && value.length) env[key.trim()] = value.join('=').replace(/"/g, '').trim()
})

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function diagnoseFoodcanaSalesOrder() {
  console.log('🔍 تشخيص مشكلة عدم ظهور أمر البيع للمستخدم foodcana1976')
  
  try {
    // جلب معرف المستخدم
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('user_id')
      .eq('username', 'foodcana1976')
      .single()

    const userId = userProfile.user_id
    console.log(`✅ معرف المستخدم: ${userId}`)

    // جلب شركة "تست"
    const { data: testCompany } = await supabase
      .from('companies')
      .select('id, name')
      .eq('name', 'تست')
      .single()

    console.log(`✅ شركة تست: ${testCompany.id}`)

    // البحث عن العميل Mahoud Mohamed
    const { data: customer } = await supabase
      .from('customers')
      .select('id, name')
      .eq('company_id', testCompany.id)
      .ilike('name', '%Mahoud Mohamed%')
      .single()

    if (customer) {
      console.log(`✅ العميل: ${customer.name} (${customer.id})`)
    } else {
      console.log('❌ لم يتم العثور على العميل Mahoud Mohamed')
    }

    // البحث عن أوامر البيع للعميل
    const { data: salesOrders } = await supabase
      .from('sales_orders')
      .select(`
        id, so_number, branch_id, cost_center_id, created_by_user_id, status, total,
        customers:customer_id (name)
      `)
      .eq('company_id', testCompany.id)
      .eq('customer_id', customer?.id)
      .order('created_at', { ascending: false })

    if (salesOrders && salesOrders.length > 0) {
      console.log(`\n🔍 أوامر البيع للعميل (${salesOrders.length}):`)
      salesOrders.forEach(so => {
        console.log(`  - ${so.so_number}: ${so.total} - منشئ: ${so.created_by_user_id}`)
        console.log(`    فرع: ${so.branch_id}, مركز تكلفة: ${so.cost_center_id}`)
      })
    } else {
      console.log('❌ لا توجد أوامر بيع للعميل')
    }

    // فحص سياق الحوكمة للمستخدم في شركة تست
    const { data: governance } = await supabase
      .from('user_branch_cost_center')
      .select(`
        branch_id, cost_center_id,
        branches:branch_id (name),
        cost_centers:cost_center_id (name)
      `)
      .eq('user_id', userId)
      .eq('company_id', testCompany.id)

    if (governance && governance.length > 0) {
      console.log('\n✅ سياق الحوكمة للمستخدم:')
      governance.forEach(g => {
        console.log(`  - فرع: ${g.branches?.name} (${g.branch_id})`)
        console.log(`  - مركز تكلفة: ${g.cost_centers?.name} (${g.cost_center_id})`)
      })
    } else {
      console.log('\n❌ لا يوجد سياق حوكمة للمستخدم في شركة تست')
      
      // إنشاء سياق حوكمة
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
        .eq('is_main', true)
        .single()

      if (branch && costCenter) {
        const { error } = await supabase
          .from('user_branch_cost_center')
          .insert({
            user_id: userId,
            company_id: testCompany.id,
            branch_id: branch.id,
            cost_center_id: costCenter.id
          })

        if (!error) {
          console.log(`✅ تم إنشاء سياق حوكمة: فرع ${branch.name}, مركز تكلفة ${costCenter.name}`)
        }
      }
    }

    // محاكاة استعلام API
    if (governance && governance.length > 0) {
      const gov = governance[0]
      console.log('\n🔍 محاكاة استعلام API...')
      
      const { data: visibleOrders } = await supabase
        .from('sales_orders')
        .select('so_number, total, created_by_user_id')
        .eq('company_id', testCompany.id)
        .eq('branch_id', gov.branch_id)
        .eq('cost_center_id', gov.cost_center_id)
        .eq('created_by_user_id', userId) // فلتر الموظف

      console.log(`✅ أوامر البيع المرئية: ${visibleOrders?.length || 0}`)
      if (visibleOrders && visibleOrders.length > 0) {
        visibleOrders.forEach(order => {
          console.log(`  - ${order.so_number}: ${order.total}`)
        })
      }
    }

  } catch (error) {
    console.error('❌ خطأ:', error)
  }
}

diagnoseFoodcanaSalesOrder()