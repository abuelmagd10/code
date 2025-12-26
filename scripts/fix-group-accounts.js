// إصلاح الحسابات التي يجب أن تكون حسابات نهائية وليست مجموعات
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = 'https://hfvsbsizokxontflgdyn.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// الحسابات التي يجب أن تكون حسابات نهائية (leaf) وليست مجموعات
const leafAccounts = [
  { code: '1100', name: 'الذمم المدينة (العملاء)', shouldBeGroup: false },
  { code: '1000', name: 'الخزينة الرئيسية', shouldBeGroup: false },
  { code: '2000', name: 'الحسابات الدائنة', shouldBeGroup: false },
  { code: '2100', name: 'الالتزامات المتداولة', shouldBeGroup: false },
]

async function fixGroupAccounts() {
  console.log('🔧 إصلاح الحسابات التي يجب أن تكون حسابات نهائية...\n')
  
  // جلب company_id
  const { data: company } = await supabase
    .from('companies')
    .select('id, name')
    .ilike('name', '%VitaSlims%')
    .limit(1)
    .single()
  
  if (!company) {
    console.error('❌ لم يتم العثور على الشركة')
    return
  }
  
  const companyId = company.id
  console.log(`✅ الشركة: ${company.name}\n`)
  
  for (const acc of leafAccounts) {
    console.log(`${acc.code}: ${acc.name}`)
    
    // جلب الحساب
    const { data: account } = await supabase
      .from('chart_of_accounts')
      .select('*')
      .eq('account_code', acc.code)
      .eq('company_id', companyId)
      .limit(1)
      .single()
    
    if (!account) {
      console.log(`   ⚠️  الحساب غير موجود`)
      continue
    }
    
    // التحقق إذا كان له أبناء (children)
    const { data: children } = await supabase
      .from('chart_of_accounts')
      .select('id, account_code, account_name')
      .eq('parent_id', account.id)
      .eq('company_id', companyId)
    
    if (children && children.length > 0) {
      console.log(`   ℹ️  الحساب له ${children.length} حساب فرعي:`)
      children.forEach(child => {
        console.log(`      - ${child.account_code}: ${child.account_name}`)
      })
      
      // إذا كان يجب أن يكون حساب نهائي، نقل الأبناء إلى الأب
      if (!acc.shouldBeGroup && account.parent_id) {
        console.log(`   🔄 نقل الأبناء إلى الأب...`)
        
        const { data: parent } = await supabase
          .from('chart_of_accounts')
          .select('id')
          .eq('id', account.parent_id)
          .single()
        
        if (parent) {
          for (const child of children) {
            const { error } = await supabase
              .from('chart_of_accounts')
              .update({ parent_id: parent.id })
              .eq('id', child.id)
            
            if (!error) {
              console.log(`      ✅ تم نقل ${child.account_code} إلى الأب`)
            }
          }
        }
      }
    } else {
      console.log(`   ✅ الحساب ليس له أبناء (حساب نهائي)`)
    }
  }
  
  console.log('\n✅ اكتمل التحقق!')
}

fixGroupAccounts().catch(console.error)

