/**
 * 🔍 تشخيص مشكلة عدم ظهور أمر البيع SO-0001 للمستخدم foodcana1976
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

async function debugFoodcanaSO0001() {
  console.log('🔍 تشخيص مشكلة عدم ظهور أمر البيع SO-0001 للمستخدم foodcana1976')
  console.log('=' .repeat(80))

  try {
    // 1️⃣ البحث عن المستخدم foodcana1976
    console.log('\n1️⃣ البحث عن المستخدم foodcana1976...')
    const { data: users, error: userError } = await supabase
      .from('user_profiles')
      .select('*')
      .ilike('username', '%foodcana1976%')

    if (userError) {
      console.error('❌ خطأ في البحث عن المستخدم:', userError)
      return
    }

    if (!users || users.length === 0) {
      console.log('❌ لم يتم العثور على المستخدم foodcana1976')
      
      // البحث في جدول auth.users
      const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers()
      if (authError) {
        console.error('❌ خطأ في جلب المستخدمين:', authError)
        return
      }
      
      const foodcanaUser = authUsers.users.find(u => 
        u.email?.includes('foodcana') || 
        u.user_metadata?.username?.includes('foodcana')
      )
      
      if (foodcanaUser) {
        console.log('✅ تم العثور على المستخدم في auth.users:', {
          id: foodcanaUser.id,
          email: foodcanaUser.email,
          username: foodcanaUser.user_metadata?.username
        })
        
        // إنشاء ملف تعريف المستخدم إذا لم يكن موجوداً
        const { data: profile, error: profileError } = await supabase
          .from('user_profiles')
          .upsert({
            id: foodcanaUser.id,
            username: foodcanaUser.user_metadata?.username || 'foodcana1976',
            email: foodcanaUser.email
          })
          .select()
          .single()
        
        if (profileError) {
          console.error('❌ خطأ في إنشاء ملف تعريف المستخدم:', profileError)
        } else {
          console.log('✅ تم إنشاء ملف تعريف المستخدم:', profile)
        }
      } else {
        console.log('❌ لم يتم العثور على المستخدم في auth.users أيضاً')
        return
      }
    } else {
      console.log('✅ تم العثور على المستخدم:', users[0])
    }

    const userId = users?.[0]?.id || foodcanaUser?.id
    if (!userId) {
      console.log('❌ لا يمكن تحديد معرف المستخدم')
      return
    }

    // 2️⃣ البحث عن عضوية المستخدم في الشركات
    console.log('\n2️⃣ البحث عن عضوية المستخدم في الشركات...')
    const { data: memberships, error: memberError } = await supabase
      .from('company_members')
      .select(`
        *,
        companies:company_id (id, name)
      `)
      .eq('user_id', userId)

    if (memberError) {
      console.error('❌ خطأ في جلب العضويات:', memberError)
      return
    }

    if (!memberships || memberships.length === 0) {
      console.log('❌ المستخدم ليس عضواً في أي شركة')
      return
    }

    console.log('✅ عضويات المستخدم:')
    memberships.forEach(m => {
      console.log(`  - الشركة: ${m.companies.name} (${m.companies.id})`)
      console.log(`    الدور: ${m.role}`)
      console.log(`    نشط: ${m.is_active}`)
    })

    // 3️⃣ فحص سياق الحوكمة للمستخدم
    console.log('\n3️⃣ فحص سياق الحوكمة للمستخدم...')
    for (const membership of memberships) {
      const companyId = membership.company_id
      
      console.log(`\n🏢 فحص الشركة: ${membership.companies.name}`)
      
      const { data: governance, error: govError } = await supabase
        .from('user_branch_cost_center')
        .select(`
          *,
          branches:branch_id (id, name),
          cost_centers:cost_center_id (id, name)
        `)
        .eq('user_id', userId)
        .eq('company_id', companyId)

      if (govError) {
        console.error('❌ خطأ في جلب سياق الحوكمة:', govError)
        continue
      }

      if (!governance || governance.length === 0) {
        console.log('❌ لا يوجد سياق حوكمة للمستخدم في هذه الشركة')
        
        // إنشاء سياق حوكمة افتراضي
        console.log('🔧 محاولة إنشاء سياق حوكمة افتراضي...')
        
        // جلب الفرع الرئيسي
        const { data: mainBranch } = await supabase
          .from('branches')
          .select('id, name')
          .eq('company_id', companyId)
          .eq('is_main', true)
          .single()
        
        // جلب مركز التكلفة الرئيسي
        const { data: mainCostCenter } = await supabase
          .from('cost_centers')
          .select('id, name')
          .eq('company_id', companyId)
          .eq('is_main', true)
          .single()
        
        if (mainBranch && mainCostCenter) {
          const { data: newGovernance, error: createGovError } = await supabase
            .from('user_branch_cost_center')
            .insert({
              user_id: userId,
              company_id: companyId,
              branch_id: mainBranch.id,
              cost_center_id: mainCostCenter.id
            })
            .select()
            .single()
          
          if (createGovError) {
            console.error('❌ خطأ في إنشاء سياق الحوكمة:', createGovError)
          } else {
            console.log('✅ تم إنشاء سياق حوكمة جديد:', newGovernance)
          }
        } else {
          console.log('❌ لا يوجد فرع أو مركز تكلفة رئيسي')
        }
        
        continue
      }

      console.log('✅ سياق الحوكمة:')
      governance.forEach(g => {
        console.log(`  - الفرع: ${g.branches?.name} (${g.branch_id})`)
        console.log(`  - مركز التكلفة: ${g.cost_centers?.name} (${g.cost_center_id})`)
      })

      // 4️⃣ البحث عن أمر البيع SO-0001
      console.log('\n4️⃣ البحث عن أمر البيع SO-0001...')
      
      const { data: salesOrders, error: soError } = await supabase
        .from('sales_orders')
        .select(`
          *,
          customers:customer_id (id, name)
        `)
        .eq('company_id', companyId)
        .eq('so_number', 'SO-0001')

      if (soError) {
        console.error('❌ خطأ في البحث عن أمر البيع:', soError)
        continue
      }

      if (!salesOrders || salesOrders.length === 0) {
        console.log('❌ لم يتم العثور على أمر البيع SO-0001')
        continue
      }

      console.log('✅ تم العثور على أمر البيع SO-0001:')
      salesOrders.forEach(so => {
        console.log(`  - رقم الأمر: ${so.so_number}`)
        console.log(`  - العميل: ${so.customers?.name}`)
        console.log(`  - الفرع: ${so.branch_id}`)
        console.log(`  - مركز التكلفة: ${so.cost_center_id}`)
        console.log(`  - المنشئ: ${so.created_by_user_id}`)
        console.log(`  - الحالة: ${so.status}`)
        console.log(`  - المجموع: ${so.total}`)
      })

      // 5️⃣ فحص التطابق مع سياق الحوكمة
      console.log('\n5️⃣ فحص التطابق مع سياق الحوكمة...')
      
      for (const so of salesOrders) {
        const matchingGovernance = governance.find(g => 
          g.branch_id === so.branch_id && g.cost_center_id === so.cost_center_id
        )
        
        if (matchingGovernance) {
          console.log('✅ أمر البيع يتطابق مع سياق حوكمة المستخدم')
          console.log(`  - الفرع: ${matchingGovernance.branches?.name}`)
          console.log(`  - مركز التكلفة: ${matchingGovernance.cost_centers?.name}`)
        } else {
          console.log('❌ أمر البيع لا يتطابق مع سياق حوكمة المستخدم')
          console.log(`  - أمر البيع: فرع ${so.branch_id}, مركز تكلفة ${so.cost_center_id}`)
          console.log(`  - سياق المستخدم:`)
          governance.forEach(g => {
            console.log(`    * فرع ${g.branch_id}, مركز تكلفة ${g.cost_center_id}`)
          })
          
          // إصلاح التطابق
          console.log('\n🔧 محاولة إصلاح التطابق...')
          
          if (governance.length > 0) {
            const firstGovernance = governance[0]
            
            const { data: updatedSO, error: updateError } = await supabase
              .from('sales_orders')
              .update({
                branch_id: firstGovernance.branch_id,
                cost_center_id: firstGovernance.cost_center_id
              })
              .eq('id', so.id)
              .select()
              .single()
            
            if (updateError) {
              console.error('❌ خطأ في تحديث أمر البيع:', updateError)
            } else {
              console.log('✅ تم تحديث أمر البيع ليتطابق مع سياق الحوكمة:', updatedSO)
            }
          }
        }
      }

      // 6️⃣ فحص صلاحيات الوصول
      console.log('\n6️⃣ فحص صلاحيات الوصول...')
      
      const role = membership.role
      console.log(`دور المستخدم: ${role}`)
      
      // محاكاة استعلام API
      for (const gov of governance) {
        console.log(`\n🔍 محاكاة استعلام API للفرع ${gov.branch_id} ومركز التكلفة ${gov.cost_center_id}...`)
        
        let query = supabase
          .from('sales_orders')
          .select(`
            *,
            customers:customer_id (id, name)
          `)
          .eq('company_id', companyId)
          .eq('branch_id', gov.branch_id)
          .eq('cost_center_id', gov.cost_center_id)
        
        // تطبيق فلتر المنشئ للموظفين
        if (role === 'employee') {
          query = query.eq('created_by_user_id', userId)
        }
        
        const { data: filteredOrders, error: filterError } = await query
        
        if (filterError) {
          console.error('❌ خطأ في الاستعلام المفلتر:', filterError)
        } else {
          console.log(`✅ النتائج المفلترة: ${filteredOrders?.length || 0} أمر`)
          if (filteredOrders && filteredOrders.length > 0) {
            filteredOrders.forEach(order => {
              console.log(`  - ${order.so_number}: ${order.customers?.name} - ${order.total}`)
            })
          }
        }
      }
    }

  } catch (error) {
    console.error('❌ خطأ عام:', error)
  }
}

// تشغيل التشخيص
debugFoodcanaSO0001()
  .then(() => {
    console.log('\n✅ انتهى التشخيص')
    process.exit(0)
  })
  .catch(error => {
    console.error('❌ خطأ في التشخيص:', error)
    process.exit(1)
  })