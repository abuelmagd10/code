// إصلاح مشاكل شجرة الحسابات تلقائياً
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = 'https://hfvsbsizokxontflgdyn.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function fixCOAStructure() {
  console.log('🔧 بدء إصلاح مشاكل شجرة الحسابات...\n')
  
  // جلب company_id للشركة VitaSlims
  const { data: companies, error: companyError } = await supabase
    .from('companies')
    .select('id, name')
    .ilike('name', '%VitaSlims%')
    .limit(1)
  
  if (companyError || !companies || companies.length === 0) {
    console.error('❌ خطأ في جلب الشركة:', companyError)
    return
  }
  
  const companyId = companies[0].id
  const companyName = companies[0].name
  console.log(`✅ تم العثور على الشركة: ${companyName} (${companyId})\n`)
  
  const fixes = []
  
  // =============================================
  // 1. إصلاح 6100 تكاليف الاتصالات
  // =============================================
  console.log('1️⃣ إصلاح 6100 تكاليف الاتصالات...')
  
  // جلب الحساب
  const { data: account6100, error: err6100 } = await supabase
    .from('chart_of_accounts')
    .select('*')
    .eq('account_code', '6100')
    .eq('company_id', companyId)
    .limit(1)
    .single()
  
  if (err6100 || !account6100) {
    console.log('   ⚠️  الحساب 6100 غير موجود')
  } else {
    if (account6100.account_type === 'asset') {
      // جلب X1
      const { data: x1Account } = await supabase
        .from('chart_of_accounts')
        .select('id')
        .eq('account_code', 'X1')
        .eq('company_id', companyId)
        .limit(1)
        .single()
      
      if (x1Account) {
        const { error: updateError } = await supabase
          .from('chart_of_accounts')
          .update({
            account_type: 'expense',
            normal_balance: 'debit',
            sub_type: 'operating_expense',
            parent_id: x1Account.id,
            level: 3,
            description: (account6100.description || '') + ' [تم التصحيح: كان مصنف كأصول]'
          })
          .eq('id', account6100.id)
        
        if (updateError) {
          console.log('   ❌ خطأ في التحديث:', updateError.message)
        } else {
          console.log('   ✅ تم إصلاح 6100: تغيير من asset إلى expense')
          fixes.push('6100: تم تغيير التصنيف من asset إلى expense')
        }
      } else {
        console.log('   ⚠️  الحساب X1 غير موجود')
      }
    } else {
      console.log('   ✅ الحساب 6100 مصنف بشكل صحيح بالفعل')
    }
  }
  
  // =============================================
  // 2. إصلاح 1100 الذمم المدينة
  // =============================================
  console.log('\n2️⃣ إصلاح 1100 الذمم المدينة...')
  
  const { data: account1100, error: err1100 } = await supabase
    .from('chart_of_accounts')
    .select('*')
    .eq('account_code', '1100')
    .eq('company_id', companyId)
    .eq('level', 1)
    .limit(1)
    .single()
  
  if (err1100 || !account1100) {
    console.log('   ✅ الحساب 1100 ليس في المستوى 1 (لا يحتاج إصلاح)')
  } else {
    // جلب A1AR أولاً
    const { data: a1arAccount } = await supabase
      .from('chart_of_accounts')
      .select('id')
      .eq('account_code', 'A1AR')
      .eq('company_id', companyId)
      .limit(1)
      .single()
    
    let parentId = null
    let newLevel = 3
    
    if (a1arAccount) {
      parentId = a1arAccount.id
      newLevel = 4
    } else {
      // جلب A1
      const { data: a1Account } = await supabase
        .from('chart_of_accounts')
        .select('id')
        .eq('account_code', 'A1')
        .eq('company_id', companyId)
        .limit(1)
        .single()
      
      if (a1Account) {
        parentId = a1Account.id
        newLevel = 3
      }
    }
    
    if (parentId) {
      const { error: updateError } = await supabase
        .from('chart_of_accounts')
        .update({
          parent_id: parentId,
          level: newLevel
        })
        .eq('id', account1100.id)
      
      if (updateError) {
        console.log('   ❌ خطأ في التحديث:', updateError.message)
      } else {
        console.log(`   ✅ تم نقل 1100 إلى المستوى ${newLevel}`)
        fixes.push(`1100: تم نقلها إلى المستوى ${newLevel}`)
      }
    } else {
      console.log('   ⚠️  لم يتم العثور على A1AR أو A1')
    }
  }
  
  // =============================================
  // 3. إصلاح 5200 المصروفات التشغيلية
  // =============================================
  console.log('\n3️⃣ إصلاح 5200 المصروفات التشغيلية...')
  
  const { data: account5200, error: err5200 } = await supabase
    .from('chart_of_accounts')
    .select('*')
    .eq('account_code', '5200')
    .eq('company_id', companyId)
    .eq('level', 1)
    .limit(1)
    .single()
  
  if (err5200 || !account5200) {
    console.log('   ✅ الحساب 5200 ليس في المستوى 1 (لا يحتاج إصلاح)')
  } else {
    // جلب X1
    const { data: x1Account } = await supabase
      .from('chart_of_accounts')
      .select('id')
      .eq('account_code', 'X1')
      .eq('company_id', companyId)
      .limit(1)
      .single()
    
    if (x1Account) {
      const { error: updateError } = await supabase
        .from('chart_of_accounts')
        .update({
          parent_id: x1Account.id,
          level: 3
        })
        .eq('id', account5200.id)
      
      if (updateError) {
        console.log('   ❌ خطأ في التحديث:', updateError.message)
      } else {
        console.log('   ✅ تم نقل 5200 إلى المستوى 3 تحت X1')
        fixes.push('5200: تم نقلها إلى المستوى 3 تحت X1')
      }
    } else {
      console.log('   ⚠️  الحساب X1 غير موجود')
    }
  }
  
  // =============================================
  // 4. توحيد مستويات المصروفات التشغيلية الفرعية
  // =============================================
  console.log('\n4️⃣ توحيد مستويات المصروفات التشغيلية الفرعية (5210-5290)...')
  
  // جلب 5200
  const { data: account5200Parent } = await supabase
    .from('chart_of_accounts')
    .select('id')
    .eq('account_code', '5200')
    .eq('company_id', companyId)
    .limit(1)
    .single()
  
  if (account5200Parent) {
    const expenseCodes = ['5210', '5220', '5230', '5240', '5250', '5260', '5270', '5280', '5290']
    let fixedCount = 0
    
    for (const code of expenseCodes) {
      const { data: expenseAccount } = await supabase
        .from('chart_of_accounts')
        .select('*')
        .eq('account_code', code)
        .eq('company_id', companyId)
        .eq('account_type', 'expense')
        .limit(1)
        .single()
      
      if (expenseAccount && expenseAccount.parent_id !== account5200Parent.id) {
        const { error: updateError } = await supabase
          .from('chart_of_accounts')
          .update({
            parent_id: account5200Parent.id,
            level: 4
          })
          .eq('id', expenseAccount.id)
        
        if (!updateError) {
          fixedCount++
        }
      }
    }
    
    if (fixedCount > 0) {
      console.log(`   ✅ تم توحيد ${fixedCount} حساب تحت 5200`)
      fixes.push(`5210-5290: تم توحيد ${fixedCount} حساب تحت 5200`)
    } else {
      console.log('   ✅ جميع الحسابات في المكان الصحيح')
    }
  } else {
    console.log('   ⚠️  الحساب 5200 غير موجود')
  }
  
  // =============================================
  // 5. عرض النتائج
  // =============================================
  console.log('\n' + '='.repeat(50))
  console.log('📊 ملخص الإصلاحات:')
  console.log('='.repeat(50))
  
  if (fixes.length === 0) {
    console.log('✅ لا توجد إصلاحات مطلوبة - جميع الحسابات صحيحة!')
  } else {
    fixes.forEach((fix, idx) => {
      console.log(`${idx + 1}. ${fix}`)
    })
    console.log(`\n✅ تم إصلاح ${fixes.length} مشكلة`)
  }
  
  // التحقق من النتائج
  console.log('\n' + '='.repeat(50))
  console.log('🔍 التحقق من النتائج:')
  console.log('='.repeat(50))
  
  const checkCodes = ['6100', '1100', '5200']
  for (const code of checkCodes) {
    const { data: account } = await supabase
      .from('chart_of_accounts')
      .select('account_code, account_name, account_type, level, parent_id')
      .eq('account_code', code)
      .eq('company_id', companyId)
      .limit(1)
      .single()
    
    if (account) {
      const { data: parent } = account.parent_id ? await supabase
        .from('chart_of_accounts')
        .select('account_code')
        .eq('id', account.parent_id)
        .single() : { data: null }
      
      console.log(`${code}: ${account.account_name}`)
      console.log(`   النوع: ${account.account_type} | المستوى: ${account.level} | الأب: ${parent?.account_code || 'لا يوجد'}`)
    }
  }
  
  console.log('\n✅ اكتمل الإصلاح!')
}

fixCOAStructure().catch(console.error)

