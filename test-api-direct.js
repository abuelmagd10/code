/**
 * 🧪 اختبار API أوامر البيع مباشرة
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

const env = {}
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
  const [key, ...value] = line.split('=')
  if (key && value.length) env[key.trim()] = value.join('=').replace(/"/g, '').trim()
})

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function testSalesOrdersAPI() {
  console.log('🧪 اختبار API أوامر البيع للمستخدم foodcana1976')
  
  try {
    // محاكاة طلب HTTP GET إلى /api/sales-orders
    const response = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL.replace('/rest/v1', '')}/api/sales-orders`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      }
    })

    if (response.ok) {
      const data = await response.json()
      console.log('✅ استجابة API:', JSON.stringify(data, null, 2))
    } else {
      console.log('❌ خطأ في API:', response.status, response.statusText)
      const errorText = await response.text()
      console.log('تفاصيل الخطأ:', errorText)
    }

  } catch (error) {
    console.error('❌ خطأ في الاتصال:', error)
    
    // اختبار مباشر للبيانات
    console.log('\n🔍 اختبار مباشر للبيانات...')
    
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('user_id')
      .eq('username', 'foodcana1976')
      .single()

    const userId = userProfile?.user_id
    const companyId = 'f0ffc062-1e6e-4324-8be4-f5052e881a67'

    console.log(`👤 المستخدم: ${userId}`)
    console.log(`🏢 الشركة: ${companyId}`)

    // فحص سياق الحوكمة
    const { data: governance } = await supabase
      .from('user_branch_cost_center')
      .select('branch_id, cost_center_id')
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .single()

    console.log(`🏢 الفرع: ${governance?.branch_id}`)
    console.log(`💰 مركز التكلفة: ${governance?.cost_center_id}`)

    // جلب أوامر البيع
    const { data: orders, error: ordersError } = await supabase
      .from('sales_orders')
      .select('so_number, total, created_by_user_id, branch_id, cost_center_id')
      .eq('company_id', companyId)
      .eq('branch_id', governance?.branch_id)
      .eq('cost_center_id', governance?.cost_center_id)
      .eq('created_by_user_id', userId)

    if (ordersError) {
      console.error('❌ خطأ في جلب الأوامر:', ordersError)
    } else {
      console.log(`📋 أوامر البيع: ${orders?.length || 0}`)
      orders?.forEach(order => {
        console.log(`  ✅ ${order.so_number}: ${order.total}`)
      })
    }
  }
}

testSalesOrdersAPI()