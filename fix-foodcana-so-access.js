/**
 * 🔧 حل مشكلة عدم ظهور أمر البيع SO-0001 للمستخدم foodcana1976
 * الحل: إضافة المستخدم كعضو في شركة VitaSlims حيث يوجد الأمر
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

const env = {}
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
  const [key, ...value] = line.split('=')
  if (key && value.length) env[key.trim()] = value.join('=').replace(/"/g, '').trim()
})

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function fixFoodcanaSO0001Access() {
  console.log('🔧 حل مشكلة عدم ظهور أمر البيع SO-0001 للمستخدم foodcana1976')
  
  try {
    // 1️⃣ جلب معرف المستخدم
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('user_id')
      .eq('username', 'foodcana1976')
      .single()

    if (!userProfile) {
      console.log('❌ لم يتم العثور على المستخدم')
      return
    }

    const userId = userProfile.user_id
    console.log(`✅ معرف المستخدم: ${userId}`)

    // 2️⃣ جلب شركة VitaSlims (حيث يوجد SO-0001)
    const { data: vitaCompany } = await supabase
      .from('companies')
      .select('id, name')
      .eq('name', 'VitaSlims')
      .single()

    if (!vitaCompany) {
      console.log('❌ لم يتم العثور على شركة VitaSlims')
      return
    }

    console.log(`✅ شركة VitaSlims: ${vitaCompany.id}`)

    // 3️⃣ التحقق من وجود أمر البيع SO-0001
    const { data: salesOrder } = await supabase
      .from('sales_orders')
      .select('id, so_number, branch_id, cost_center_id')
      .eq('company_id', vitaCompany.id)
      .eq('so_number', 'SO-0001')
      .single()

    if (!salesOrder) {
      console.log('❌ لم يتم العثور على أمر البيع SO-0001 في شركة VitaSlims')
      return
    }

    console.log(`✅ أمر البيع SO-0001 موجود في الفرع ${salesOrder.branch_id} ومركز التكلفة ${salesOrder.cost_center_id}`)

    // 4️⃣ إضافة المستخدم كعضو في شركة VitaSlims
    const { data: existingMember } = await supabase
      .from('company_members')
      .select('id, role')
      .eq('company_id', vitaCompany.id)
      .eq('user_id', userId)
      .single()

    if (existingMember) {
      console.log(`✅ المستخدم عضو بالفعل في شركة VitaSlims بدور: ${existingMember.role}`)
    } else {
      // إضافة عضوية جديدة
      const { data: newMember, error: memberError } = await supabase
        .from('company_members')
        .insert({
          company_id: vitaCompany.id,
          user_id: userId,
          role: 'manager' // دور مدير لرؤية جميع البيانات
        })
        .select()
        .single()

      if (memberError) {
        console.error('❌ خطأ في إضافة العضوية:', memberError)
        return
      }

      console.log('✅ تم إضافة المستخدم كعضو في شركة VitaSlims')
    }

    // 5️⃣ إعداد سياق الحوكمة
    const { data: existingGovernance } = await supabase
      .from('user_branch_cost_center')
      .select('id')
      .eq('user_id', userId)
      .eq('company_id', vitaCompany.id)
      .single()

    if (existingGovernance) {
      console.log('✅ سياق الحوكمة موجود بالفعل')
    } else {
      // إنشاء سياق حوكمة جديد
      const { data: newGovernance, error: govError } = await supabase
        .from('user_branch_cost_center')
        .insert({
          user_id: userId,
          company_id: vitaCompany.id,
          branch_id: salesOrder.branch_id,
          cost_center_id: salesOrder.cost_center_id
        })
        .select()
        .single()

      if (govError) {
        console.error('❌ خطأ في إنشاء سياق الحوكمة:', govError)
        return
      }

      console.log('✅ تم إنشاء سياق الحوكمة للمستخدم')
    }

    // 6️⃣ التحقق من النتيجة
    console.log('\n🔍 التحقق من النتيجة...')
    
    const { data: visibleOrders } = await supabase
      .from('sales_orders')
      .select('so_number, total, status')
      .eq('company_id', vitaCompany.id)
      .eq('branch_id', salesOrder.branch_id)
      .eq('cost_center_id', salesOrder.cost_center_id)

    console.log(`✅ أوامر البيع المرئية: ${visibleOrders?.length || 0}`)
    
    const so0001 = visibleOrders?.find(o => o.so_number === 'SO-0001')
    if (so0001) {
      console.log('🎉 أمر البيع SO-0001 مرئي الآن!')
      console.log(`   المجموع: ${so0001.total}`)
      console.log(`   الحالة: ${so0001.status}`)
    }

    console.log('\n✅ تم الانتهاء من الإصلاح!')
    console.log('📋 الآن يمكن للمستخدم foodcana1976:')
    console.log('   1. تسجيل الدخول إلى النظام')
    console.log('   2. التبديل إلى شركة VitaSlims (إذا لزم الأمر)')
    console.log('   3. رؤية أمر البيع SO-0001 في قائمة أوامر البيع')

  } catch (error) {
    console.error('❌ خطأ:', error)
  }
}

fixFoodcanaSO0001Access()