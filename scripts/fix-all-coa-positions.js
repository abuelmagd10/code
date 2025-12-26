// إصلاح جميع الحسابات في الأماكن الخاطئة
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = 'https://hfvsbsizokxontflgdyn.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// قائمة الإصلاحات المطلوبة
const fixes = [
  // حسابات أصول في المستوى 1 يجب نقلها
  { code: '1300', name: 'مصروفات مدفوعة مقدماً', targetParent: 'A1O', targetLevel: 4, type: 'asset' },
  { code: '1400', name: 'سلف للموردين', targetParent: 'A1O', targetLevel: 4, type: 'asset' },
  { code: '1200', name: 'المخزون', targetParent: 'A1INVG', targetLevel: 4, type: 'asset', fallback: 'A1' },
  
  // حسابات التزامات في المستوى 1
  { code: '1500', name: 'سلف من العملاء', targetParent: 'L1O', targetLevel: 4, type: 'liability' },
  { code: '2500', name: 'حساب التسوية المؤقتة', targetParent: 'L1O', targetLevel: 4, type: 'liability' },
  
  // حسابات حقوق الملكية في المستوى 1
  { code: '3101', name: 'رأس مال - رأس مال – أحمد أبو المجد', targetParent: '3100', targetLevel: 4, type: 'equity', fallback: 'E1' },
  { code: '3102', name: 'رأس مال - رأس مال – ماجد زيتون', targetParent: '3100', targetLevel: 4, type: 'equity', fallback: 'E1' },
  
  // حسابات إيرادات في المستوى 1
  { code: '4150', name: 'إيرادات الشحن', targetParent: '4300', targetLevel: 3, type: 'income', fallback: 'I1' },
  { code: '4200', name: 'إيرادات الخدمات', targetParent: 'I1', targetLevel: 3, type: 'income' },
  
  // حسابات مصروفات في المستوى 1 أو 2
  { code: '5500', name: 'اهلاك مخزون شركات الشحن', targetParent: '5200', targetLevel: 4, type: 'expense', fallback: 'X1' },
  { code: '6110', name: 'مرتبات موظفين', targetParent: '5210', targetLevel: 4, type: 'expense', fallback: '5200' },
  { code: '7100', name: 'مصاريف شحن مندوب', targetParent: '5200', targetLevel: 4, type: 'expense', fallback: 'X1' },
  { code: '6000', name: 'تكاليف اعلانات الميديا', targetParent: '5260', targetLevel: 4, type: 'expense', fallback: '5200' },
  { code: '6111', name: 'ايجار مكتب', targetParent: '5220', targetLevel: 4, type: 'expense', fallback: '5200' },
  { code: '7000', name: 'مصاريف شركة بوسطة للشحن', targetParent: '5200', targetLevel: 4, type: 'expense', fallback: 'X1' },
  { code: '5210', name: 'الرواتب والأجور', targetParent: '5200', targetLevel: 4, type: 'expense' },
]

async function getParentId(companyId, parentCode) {
  const { data } = await supabase
    .from('chart_of_accounts')
    .select('id')
    .eq('account_code', parentCode)
    .eq('company_id', companyId)
    .limit(1)
    .single()
  
  return data?.id || null
}

async function fixAllPositions() {
  console.log('🔧 بدء إصلاح جميع الحسابات في الأماكن الخاطئة...\n')
  
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
  console.log(`✅ الشركة: ${company.name} (${companyId})\n`)
  
  const results = []
  
  for (const fix of fixes) {
    console.log(`\n${fix.code}: ${fix.name}`)
    
    // جلب الحساب
    const { data: account } = await supabase
      .from('chart_of_accounts')
      .select('*')
      .eq('account_code', fix.code)
      .eq('company_id', companyId)
      .limit(1)
      .single()
    
    if (!account) {
      console.log(`   ⚠️  الحساب غير موجود`)
      continue
    }
    
    // التحقق من النوع
    if (account.account_type !== fix.type) {
      console.log(`   ⚠️  النوع غير صحيح: ${account.account_type} (يجب أن يكون ${fix.type})`)
      continue
    }
    
    // التحقق إذا كان يحتاج إصلاح
    let needsFix = false
    
    if (fix.targetLevel === 1 && account.level !== 1) {
      needsFix = true
    } else if (fix.targetLevel > 1 && account.level === 1) {
      needsFix = true
    } else if (fix.targetLevel > 1 && account.level !== fix.targetLevel) {
      needsFix = true
    }
    
    // جلب الأب المطلوب
    let parentId = await getParentId(companyId, fix.targetParent)
    
    // إذا لم يوجد الأب المطلوب، استخدم fallback
    if (!parentId && fix.fallback) {
      parentId = await getParentId(companyId, fix.fallback)
      if (parentId) {
        console.log(`   ℹ️  استخدام fallback: ${fix.fallback}`)
      }
    }
    
    if (!parentId) {
      console.log(`   ⚠️  الحساب الأب ${fix.targetParent} غير موجود`)
      if (fix.fallback) {
        console.log(`   ⚠️  Fallback ${fix.fallback} أيضاً غير موجود`)
      }
      continue
    }
    
    // التحقق من الأب الحالي
    if (account.parent_id === parentId && account.level === fix.targetLevel) {
      console.log(`   ✅ الحساب في المكان الصحيح`)
      continue
    }
    
    // تحديث
    const { error } = await supabase
      .from('chart_of_accounts')
      .update({
        parent_id: parentId,
        level: fix.targetLevel
      })
      .eq('id', account.id)
    
    if (error) {
      console.log(`   ❌ خطأ: ${error.message}`)
      results.push({ code: fix.code, status: 'error', message: error.message })
    } else {
      console.log(`   ✅ تم النقل إلى المستوى ${fix.targetLevel} تحت ${fix.targetParent}`)
      results.push({ code: fix.code, status: 'fixed', level: fix.targetLevel, parent: fix.targetParent })
    }
  }
  
  // ملخص
  console.log('\n' + '='.repeat(60))
  console.log('📊 ملخص الإصلاحات:')
  console.log('='.repeat(60))
  
  const fixed = results.filter(r => r.status === 'fixed')
  const errors = results.filter(r => r.status === 'error')
  
  console.log(`✅ تم إصلاح: ${fixed.length} حساب`)
  if (errors.length > 0) {
    console.log(`❌ أخطاء: ${errors.length} حساب`)
  }
  
  if (fixed.length > 0) {
    console.log('\nالحسابات المُصلحة:')
    fixed.forEach(r => {
      console.log(`  - ${r.code}: المستوى ${r.level} تحت ${r.parent}`)
    })
  }
  
  console.log('\n✅ اكتمل الإصلاح!')
}

fixAllPositions().catch(console.error)

