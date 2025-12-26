// البحث عن المدفوعات المسجلة في حساب خاطئ (1000 بدلاً من 1012)
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = 'https://hfvsbsizokxontflgdyn.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function findMisplacedPayments() {
  console.log('🔍 البحث عن المدفوعات المسجلة في حساب خاطئ (1000 بدلاً من 1012)...\n')
  
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
  
  // جلب حساب 1000 و 1012
  const { data: account1000 } = await supabase
    .from('chart_of_accounts')
    .select('id, account_code, account_name')
    .eq('account_code', '1000')
    .eq('company_id', companyId)
    .limit(1)
    .single()
  
  const { data: account1012 } = await supabase
    .from('chart_of_accounts')
    .select('id, account_code, account_name')
    .eq('account_code', '1012')
    .eq('company_id', companyId)
    .limit(1)
    .single()
  
  if (!account1000 || !account1012) {
    console.error('❌ لم يتم العثور على الحسابات')
    return
  }
  
  console.log(`✅ حساب 1000: ${account1000.account_name} (${account1000.id})`)
  console.log(`✅ حساب 1012: ${account1012.account_name} (${account1012.id})\n`)
  
  // جلب جميع القيود في حساب 1000 التي قد تكون مدفوعات فودافون
  const { data: cashEntries } = await supabase
    .from('journal_entry_lines')
    .select(`
      id,
      debit_amount,
      credit_amount,
      description,
      journal_entries!inner(
        id,
        entry_date,
        reference_type,
        reference_id,
        description
      )
    `)
    .eq('account_id', account1000.id)
    .in('journal_entries.reference_type', ['payment', 'invoice_payment', 'customer_payment'])
    .order('journal_entries.entry_date', { ascending: false })
  
  console.log('='.repeat(60))
  console.log('📊 القيود في حساب 1000 (الخزينة الرئيسية):')
  console.log('='.repeat(60))
  console.log(`إجمالي القيود: ${cashEntries?.length || 0}\n`)
  
  if (!cashEntries || cashEntries.length === 0) {
    console.log('⚠️  لا توجد قيود مدفوعات في حساب 1000')
  } else {
    // البحث عن المدفوعات التي قد تكون فودافون
    const suspiciousPayments = []
    
    cashEntries.forEach(line => {
      const entry = line.journal_entries
      const desc = String(entry.description || line.description || '').toLowerCase()
      const debit = Number(line.debit_amount || 0)
      
      // البحث عن كلمات مفتاحية تشير إلى فودافون
      if (desc.includes('فودافون') || 
          desc.includes('vodafone') || 
          desc.includes('كاش') ||
          desc.includes('mobile') ||
          desc.includes('زيتون')) {
        suspiciousPayments.push({
          date: entry.entry_date,
          description: entry.description || line.description,
          debit: debit,
          credit: Number(line.credit_amount || 0),
          reference_type: entry.reference_type,
          reference_id: entry.reference_id,
          journal_entry_id: entry.id,
          line_id: line.id
        })
      }
    })
    
    if (suspiciousPayments.length > 0) {
      console.log(`⚠️  تم العثور على ${suspiciousPayments.length} قيد قد يكون مسجلاً في حساب خاطئ:\n`)
      
      let totalMisplaced = 0
      
      suspiciousPayments.forEach((p, idx) => {
        console.log(`${idx + 1}. ${p.date} - ${p.reference_type}`)
        console.log(`   الوصف: ${p.description}`)
        console.log(`   مدين: ${p.debit.toFixed(2)} | دائن: ${p.credit.toFixed(2)}`)
        console.log(`   المرجع: ${p.reference_id || 'N/A'}`)
        console.log(`   قيد ID: ${p.journal_entry_id}`)
        console.log(`   سطر ID: ${p.line_id}`)
        console.log()
        
        totalMisplaced += p.debit
      })
      
      console.log(`\n💰 إجمالي المدفوعات المسجلة في حساب خاطئ: ${totalMisplaced.toFixed(2)}`)
      console.log(`💰 الرصيد الحالي في حساب 1012: 1500.00`)
      console.log(`💰 الرصيد المتوقع: ${(1500 + totalMisplaced).toFixed(2)}`)
      
      return {
        suspiciousPayments,
        totalMisplaced,
        expectedBalance: 1500 + totalMisplaced
      }
    } else {
      console.log('✅ لا توجد قيود مشبوهة - جميع القيود في الحساب الصحيح')
    }
  }
  
  // البحث في جدول payments
  console.log('\n' + '='.repeat(60))
  console.log('📊 البحث في جدول payments:')
  console.log('='.repeat(60))
  
  const { data: allPayments } = await supabase
    .from('payments')
    .select('*')
    .eq('company_id', companyId)
    .order('payment_date', { ascending: false })
  
  if (allPayments && allPayments.length > 0) {
    // البحث عن المدفوعات التي قد تكون فودافون
    const vodafonePayments = allPayments.filter(p => {
      const method = String(p.payment_method || '').toLowerCase()
      const notes = String(p.notes || '').toLowerCase()
      const accountId = String(p.account_id || '')
      
      return (method.includes('فودافون') || 
              method.includes('vodafone') || 
              method.includes('كاش') ||
              method.includes('mobile') ||
              notes.includes('فودافون') ||
              notes.includes('vodafone') ||
              notes.includes('زيتون')) &&
             accountId !== account1012.id
    })
    
    if (vodafonePayments.length > 0) {
      console.log(`⚠️  تم العثور على ${vodafonePayments.length} دفعة قد تكون في حساب خاطئ:\n`)
      
      vodafonePayments.forEach((p, idx) => {
        console.log(`${idx + 1}. ${p.payment_date} - ${p.payment_method}`)
        console.log(`   المبلغ: ${p.amount}`)
        console.log(`   الحساب الحالي: ${p.account_id || 'غير محدد'}`)
        console.log(`   المرجع: ${p.reference_type} - ${p.reference_id || 'N/A'}`)
        console.log(`   الملاحظات: ${p.notes || 'بدون ملاحظات'}`)
        console.log()
      })
    } else {
      console.log('✅ لا توجد مدفوعات مشبوهة في جدول payments')
    }
  }
  
  console.log('\n✅ اكتمل البحث!')
}

findMisplacedPayments().catch(console.error)

