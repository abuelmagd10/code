/**
 * 🔍 فحص الفروع ومراكز التكلفة في شركة تست
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

const env = {}
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
  const [key, ...value] = line.split('=')
  if (key && value.length) env[key.trim()] = value.join('=').replace(/"/g, '').trim()
})

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function checkTestCompanyStructure() {
  try {
    const { data: testCompany } = await supabase
      .from('companies')
      .select('id')
      .eq('name', 'تست')
      .single()

    console.log('🏢 فروع شركة تست:')
    const { data: branches } = await supabase
      .from('branches')
      .select('id, name, is_main')
      .eq('company_id', testCompany.id)

    if (branches && branches.length > 0) {
      branches.forEach(b => {
        console.log(`  - ${b.name} (${b.id}) ${b.is_main ? '[رئيسي]' : ''}`)
      })
    } else {
      console.log('  ❌ لا توجد فروع')
    }

    console.log('\n💰 مراكز التكلفة:')
    const { data: costCenters } = await supabase
      .from('cost_centers')
      .select('id, name, is_main')
      .eq('company_id', testCompany.id)

    if (costCenters && costCenters.length > 0) {
      costCenters.forEach(cc => {
        console.log(`  - ${cc.name} (${cc.id}) ${cc.is_main ? '[رئيسي]' : ''}`)
      })
    } else {
      console.log('  ❌ لا توجد مراكز تكلفة')
    }

    // فحص أمر البيع الحالي
    console.log('\n📋 أمر البيع الحالي:')
    const { data: salesOrder } = await supabase
      .from('sales_orders')
      .select('so_number, branch_id, cost_center_id, created_by_user_id')
      .eq('company_id', testCompany.id)
      .eq('so_number', 'SO-0001')
      .single()

    if (salesOrder) {
      console.log(`  - رقم الأمر: ${salesOrder.so_number}`)
      console.log(`  - الفرع: ${salesOrder.branch_id}`)
      console.log(`  - مركز التكلفة: ${salesOrder.cost_center_id}`)
      console.log(`  - المنشئ: ${salesOrder.created_by_user_id}`)
    }

  } catch (error) {
    console.error('❌ خطأ:', error)
  }
}

checkTestCompanyStructure()