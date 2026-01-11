/**
 * 🔧 إصلاح مشكلة عضوية المستخدم foodcana1976
 * إضافة المستخدم إلى الشركة المناسبة وإعداد سياق الحوكمة
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

// قراءة متغيرات البيئة من .env.local
function loadEnvFile() {
  try {
    const envContent = fs.readFileSync('.env.local', 'utf8')
    const envVars = {}
    
    envContent.split('\n').forEach(line => {
      const [key, ...valueParts] = line.split('=')
      if (key && valueParts.length > 0) {
        envVars[key.trim()] = valueParts.join('=').replace(/"/g, '').trim()
      }
    })
    
    return envVars
  } catch (error) {
    console.error('❌ خطأ في قراءة ملف .env.local:', error.message)
    return {}
  }
}

const env = loadEnvFile()
const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
)

async function fixFoodcanaMembership() {
  console.log('🔧 إصلاح مشكلة عضوية المستخدم foodcana1976')
  console.log('=' .repeat(60))

  try {
    // 1️⃣ جلب معرف المستخدم
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('username', 'foodcana1976')
      .single()

    if (!userProfile) {
      console.log('❌ لم يتم العثور على المستخدم')
      return
    }

    const userId = userProfile.user_id
    console.log(`✅ معرف المستخدم: ${userId}`)

    // 2️⃣ البحث عن الشركات المتاحة
    console.log('\n2️⃣ البحث عن الشركات المتاحة...')
    const { data: companies, error: companiesError } = await supabase
      .from('companies')
      .select('*')
      .order('created_at', { ascending: true })

    if (companiesError) {
      console.error('❌ خطأ في جلب الشركات:', companiesError)
      return
    }

    if (!companies || companies.length === 0) {
      console.log('❌ لا توجد شركات في النظام')
      return
    }

    console.log('✅ الشركات المتاحة:')
    companies.forEach((company, index) => {
      console.log(`  ${index + 1}. ${company.name} (${company.id})`)
    })

    // 3️⃣ البحث عن أمر البيع SO-0001 لتحديد الشركة المناسبة
    console.log('\n3️⃣ البحث عن أمر البيع SO-0001...')
    
    let targetCompany = null
    let salesOrder = null

    for (const company of companies) {
      const { data: orders } = await supabase
        .from('sales_orders')
        .select(`
          *,
          customers:customer_id (id, name)
        `)
        .eq('company_id', company.id)
        .eq('so_number', 'SO-0001')

      if (orders && orders.length > 0) {
        targetCompany = company
        salesOrder = orders[0]
        console.log(`✅ تم العثور على أمر البيع SO-0001 في شركة: ${company.name}`)
        console.log(`  - العميل: ${salesOrder.customers?.name}`)
        console.log(`  - المجموع: ${salesOrder.total}`)
        console.log(`  - الفرع: ${salesOrder.branch_id}`)
        console.log(`  - مركز التكلفة: ${salesOrder.cost_center_id}`)
        break
      }
    }

    if (!targetCompany) {
      console.log('❌ لم يتم العثور على أمر البيع SO-0001 في أي شركة')
      // استخدام أول شركة كافتراضي
      targetCompany = companies[0]
      console.log(`🔄 سيتم استخدام الشركة الافتراضية: ${targetCompany.name}`)
    }

    // 4️⃣ إضافة المستخدم كعضو في الشركة
    console.log(`\n4️⃣ إضافة المستخدم كعضو في شركة ${targetCompany.name}...`)
    
    // فحص العضوية الحالية
    const { data: existingMembership } = await supabase
      .from('company_members')
      .select('*')
      .eq('company_id', targetCompany.id)
      .eq('user_id', userId)
      .single()

    if (existingMembership) {
      console.log('✅ المستخدم عضو بالفعل في الشركة')
      
      // تحديث العضوية لتكون نشطة
      const { error: updateError } = await supabase
        .from('company_members')
        .update({ 
          role: 'manager' // إعطاء دور مدير لرؤية جميع البيانات
        })
        .eq('id', existingMembership.id)

      if (updateError) {
        console.error('❌ خطأ في تحديث العضوية:', updateError)
      } else {
        console.log('✅ تم تحديث العضوية بنجاح')
      }
    } else {
      // إنشاء عضوية جديدة
      const { data: newMembership, error: membershipError } = await supabase
        .from('company_members')
        .insert({
          company_id: targetCompany.id,
          user_id: userId,
          role: 'manager', // إعطاء دور مدير لرؤية جميع البيانات
          invited_by: null
        })
        .select()
        .single()

      if (membershipError) {
        console.error('❌ خطأ في إنشاء العضوية:', membershipError)
        return
      }

      console.log('✅ تم إنشاء العضوية بنجاح:', newMembership)
    }

    // 5️⃣ إعداد سياق الحوكمة
    console.log('\n5️⃣ إعداد سياق الحوكمة...')
    
    // جلب الفرع الرئيسي أو الفرع المرتبط بأمر البيع
    let targetBranchId = salesOrder?.branch_id
    let targetCostCenterId = salesOrder?.cost_center_id

    if (!targetBranchId) {
      const { data: mainBranch } = await supabase
        .from('branches')
        .select('id, name')
        .eq('company_id', targetCompany.id)
        .eq('is_main', true)
        .single()

      if (mainBranch) {
        targetBranchId = mainBranch.id
        console.log(`✅ استخدام الفرع الرئيسي: ${mainBranch.name}`)
      } else {
        // جلب أول فرع متاح
        const { data: firstBranch } = await supabase
          .from('branches')
          .select('id, name')
          .eq('company_id', targetCompany.id)
          .limit(1)
          .single()

        if (firstBranch) {
          targetBranchId = firstBranch.id
          console.log(`✅ استخدام أول فرع متاح: ${firstBranch.name}`)
        }
      }
    }

    if (!targetCostCenterId) {
      const { data: mainCostCenter } = await supabase
        .from('cost_centers')
        .select('id, name')
        .eq('company_id', targetCompany.id)
        .eq('is_main', true)
        .single()

      if (mainCostCenter) {
        targetCostCenterId = mainCostCenter.id
        console.log(`✅ استخدام مركز التكلفة الرئيسي: ${mainCostCenter.name}`)
      } else {
        // جلب أول مركز تكلفة متاح
        const { data: firstCostCenter } = await supabase
          .from('cost_centers')
          .select('id, name')
          .eq('company_id', targetCompany.id)
          .limit(1)
          .single()

        if (firstCostCenter) {
          targetCostCenterId = firstCostCenter.id
          console.log(`✅ استخدام أول مركز تكلفة متاح: ${firstCostCenter.name}`)
        }
      }
    }

    if (!targetBranchId || !targetCostCenterId) {
      console.log('❌ لا يمكن تحديد الفرع أو مركز التكلفة')
      return
    }

    // فحص سياق الحوكمة الحالي
    const { data: existingGovernance } = await supabase
      .from('user_branch_cost_center')
      .select('*')
      .eq('user_id', userId)
      .eq('company_id', targetCompany.id)
      .single()

    if (existingGovernance) {
      console.log('✅ سياق الحوكمة موجود بالفعل')
      
      // تحديث سياق الحوكمة
      const { error: updateGovError } = await supabase
        .from('user_branch_cost_center')
        .update({
          branch_id: targetBranchId,
          cost_center_id: targetCostCenterId
        })
        .eq('id', existingGovernance.id)

      if (updateGovError) {
        console.error('❌ خطأ في تحديث سياق الحوكمة:', updateGovError)
      } else {
        console.log('✅ تم تحديث سياق الحوكمة بنجاح')
      }
    } else {
      // إنشاء سياق حوكمة جديد
      const { data: newGovernance, error: govError } = await supabase
        .from('user_branch_cost_center')
        .insert({
          user_id: userId,
          company_id: targetCompany.id,
          branch_id: targetBranchId,
          cost_center_id: targetCostCenterId
        })
        .select()
        .single()

      if (govError) {
        console.error('❌ خطأ في إنشاء سياق الحوكمة:', govError)
        return
      }

      console.log('✅ تم إنشاء سياق الحوكمة بنجاح:', newGovernance)
    }

    // 6️⃣ التحقق من النتيجة
    console.log('\n6️⃣ التحقق من النتيجة...')
    
    // محاكاة استعلام API
    const { data: visibleOrders, error: queryError } = await supabase
      .from('sales_orders')
      .select(`
        *,
        customers:customer_id (id, name)
      `)
      .eq('company_id', targetCompany.id)
      .eq('branch_id', targetBranchId)
      .eq('cost_center_id', targetCostCenterId)

    if (queryError) {
      console.error('❌ خطأ في الاستعلام:', queryError)
    } else {
      console.log(`✅ أوامر البيع المرئية للمستخدم: ${visibleOrders?.length || 0}`)
      
      const so0001 = visibleOrders?.find(order => order.so_number === 'SO-0001')
      if (so0001) {
        console.log('🎉 أمر البيع SO-0001 مرئي الآن للمستخدم!')
        console.log(`  - العميل: ${so0001.customers?.name}`)
        console.log(`  - المجموع: ${so0001.total}`)
        console.log(`  - الحالة: ${so0001.status}`)
      } else {
        console.log('❌ أمر البيع SO-0001 لا يزال غير مرئي')
      }
    }

    console.log('\n✅ تم الانتهاء من الإصلاح!')
    console.log('📋 ملخص الإجراءات:')
    console.log(`  - تم إضافة المستخدم foodcana1976 إلى شركة: ${targetCompany.name}`)
    console.log(`  - تم إعطاء المستخدم دور: manager`)
    console.log(`  - تم ربط المستخدم بالفرع: ${targetBranchId}`)
    console.log(`  - تم ربط المستخدم بمركز التكلفة: ${targetCostCenterId}`)

  } catch (error) {
    console.error('❌ خطأ عام:', error)
  }
}

// تشغيل الإصلاح
fixFoodcanaMembership()
  .then(() => {
    console.log('\n🏁 انتهى الإصلاح')
    process.exit(0)
  })
  .catch(error => {
    console.error('❌ خطأ في الإصلاح:', error)
    process.exit(1)
  })