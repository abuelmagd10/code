/**
 * 🌐 فحص حالة أمر البيع على الموقع المباشر
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

const env = {}
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
  const [key, ...value] = line.split('=')
  if (key && value.length) env[key.trim()] = value.join('=').replace(/"/g, '').trim()
})

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function checkProductionStatus() {
  console.log('🌐 فحص حالة أمر البيع على الموقع المباشر')
  console.log('الموقع: https://7esab.com/sales-orders')
  console.log('=' .repeat(50))
  
  try {
    const userId = '949d65e0-2e8f-4566-b820-4778ed149304' // foodcana1976
    const companyId = 'f0ffc062-1e6e-4324-8be4-f5052e881a67' // شركة تست

    // 1️⃣ فحص سياق الحوكمة
    const { data: governance } = await supabase
      .from('user_branch_cost_center')
      .select('branch_id, cost_center_id')
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .single()

    console.log('👤 المستخدم: foodcana1976')
    console.log(`🏢 الفرع: ${governance?.branch_id}`)
    console.log(`💰 مركز التكلفة: ${governance?.cost_center_id}`)

    // 2️⃣ فحص أمر البيع
    const { data: salesOrder } = await supabase
      .from('sales_orders')
      .select('so_number, total, created_by_user_id, branch_id, cost_center_id, status')
      .eq('company_id', companyId)
      .eq('so_number', 'SO-0001')
      .single()

    if (salesOrder) {
      console.log('\n📋 أمر البيع SO-0001:')
      console.log(`   المجموع: ${salesOrder.total}`)
      console.log(`   الحالة: ${salesOrder.status}`)
      console.log(`   المنشئ: ${salesOrder.created_by_user_id}`)
      console.log(`   الفرع: ${salesOrder.branch_id}`)
      console.log(`   مركز التكلفة: ${salesOrder.cost_center_id}`)
    }

    // 3️⃣ فحص التطابق
    const isVisible = governance && salesOrder && 
      governance.branch_id === salesOrder.branch_id &&
      governance.cost_center_id === salesOrder.cost_center_id &&
      salesOrder.created_by_user_id === userId

    console.log('\n🔍 نتيجة الفحص:')
    if (isVisible) {
      console.log('✅ أمر البيع SO-0001 مرئي للمستخدم foodcana1976')
      console.log('🎉 يجب أن يظهر في الموقع: https://7esab.com/sales-orders')
    } else {
      console.log('❌ أمر البيع غير مرئي للمستخدم')
      console.log('🔧 يحتاج إصلاح إضافي')
    }

    // 4️⃣ فحص العميل
    const { data: customer } = await supabase
      .from('customers')
      .select('name')
      .eq('id', salesOrder?.customer_id)
      .single()

    if (customer) {
      console.log(`👤 العميل: ${customer.name}`)
    }

  } catch (error) {
    console.error('❌ خطأ:', error)
  }
}

checkProductionStatus()