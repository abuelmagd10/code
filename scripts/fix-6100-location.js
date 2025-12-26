// نقل 6100 تكاليف الاتصالات تحت X1
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = 'https://hfvsbsizokxontflgdyn.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function fix6100Location() {
  console.log('🔧 نقل 6100 تكاليف الاتصالات تحت X1...\n')
  
  // جلب company_id
  const { data: companies } = await supabase
    .from('companies')
    .select('id')
    .ilike('name', '%VitaSlims%')
    .limit(1)
    .single()
  
  if (!companies) {
    console.error('❌ لم يتم العثور على الشركة')
    return
  }
  
  const companyId = companies.id
  
  // جلب 6100
  const { data: account6100 } = await supabase
    .from('chart_of_accounts')
    .select('*')
    .eq('account_code', '6100')
    .eq('company_id', companyId)
    .limit(1)
    .single()
  
  if (!account6100) {
    console.log('❌ الحساب 6100 غير موجود')
    return
  }
  
  console.log(`الحساب الحالي: ${account6100.account_name}`)
  console.log(`النوع: ${account6100.account_type}`)
  console.log(`المستوى: ${account6100.level}`)
  
  // جلب الأب الحالي
  if (account6100.parent_id) {
    const { data: currentParent } = await supabase
      .from('chart_of_accounts')
      .select('account_code, account_name')
      .eq('id', account6100.parent_id)
      .single()
    
    if (currentParent) {
      console.log(`الأب الحالي: ${currentParent.account_code} - ${currentParent.account_name}`)
    }
  }
  
  // جلب X1
  const { data: x1Account } = await supabase
    .from('chart_of_accounts')
    .select('id, account_code, account_name')
    .eq('account_code', 'X1')
    .eq('company_id', companyId)
    .limit(1)
    .single()
  
  if (!x1Account) {
    console.log('❌ الحساب X1 غير موجود')
    return
  }
  
  console.log(`\nنقل 6100 تحت: ${x1Account.account_code} - ${x1Account.account_name}`)
  
  // تحديث
  const { error } = await supabase
    .from('chart_of_accounts')
    .update({
      parent_id: x1Account.id,
      level: 3
    })
    .eq('id', account6100.id)
  
  if (error) {
    console.log('❌ خطأ:', error.message)
  } else {
    console.log('✅ تم نقل 6100 تحت X1 بنجاح!')
  }
}

fix6100Location().catch(console.error)

