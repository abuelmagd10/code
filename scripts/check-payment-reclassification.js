// التحقق من إعادة تصنيف المدفوعات
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = 'https://hfvsbsizokxontflgdyn.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function checkPaymentReclassification() {
  console.log('🔍 التحقق من إعادة تصنيف المدفوعات...\n')
  
  const referenceId = '0aabbdc3-b657-4b07-aa9c-8372110658d2'
  
  // البحث عن القيد
  const { data: journalEntry } = await supabase
    .from('journal_entries')
    .select('*')
    .eq('id', referenceId)
    .single()
  
  if (journalEntry) {
    console.log('='.repeat(60))
    console.log('📊 معلومات القيد:')
    console.log('='.repeat(60))
    console.log(`التاريخ: ${journalEntry.entry_date}`)
    console.log(`النوع: ${journalEntry.reference_type}`)
    console.log(`الوصف: ${journalEntry.description}`)
    console.log(`المرجع: ${journalEntry.reference_id || 'N/A'}\n`)
    
    // جلب سطور القيد
    const { data: lines } = await supabase
      .from('journal_entry_lines')
      .select(`
        account_id,
        debit_amount,
        credit_amount,
        description,
        chart_of_accounts!inner(
          account_code,
          account_name
        )
      `)
      .eq('journal_entry_id', journalEntry.id)
    
    if (lines && lines.length > 0) {
      console.log('سطور القيد:')
      lines.forEach((line, idx) => {
        const acc = line.chart_of_accounts
        console.log(`${idx + 1}. ${acc.account_code} - ${acc.account_name}`)
        console.log(`   مدين: ${line.debit_amount || 0} | دائن: ${line.credit_amount || 0}`)
        console.log(`   الوصف: ${line.description || 'بدون وصف'}`)
        console.log()
      })
    }
  } else {
    console.log('⚠️  القيد غير موجود')
  }
  
  // البحث عن جميع قيود إعادة التصنيف
  console.log('='.repeat(60))
  console.log('📊 جميع قيود إعادة التصنيف:')
  console.log('='.repeat(60))
  
  const { data: reclassEntries } = await supabase
    .from('journal_entries')
    .select('id, entry_date, description, reference_id')
    .eq('reference_type', 'customer_payment_reclassification')
    .order('entry_date', { ascending: false })
    .limit(20)
  
  if (reclassEntries && reclassEntries.length > 0) {
    console.log(`✅ تم العثور على ${reclassEntries.length} قيد إعادة تصنيف:\n`)
    
    for (const entry of reclassEntries) {
      const { data: entryLines } = await supabase
        .from('journal_entry_lines')
        .select(`
          account_id,
          debit_amount,
          credit_amount,
          chart_of_accounts!inner(
            account_code,
            account_name
          )
        `)
        .eq('journal_entry_id', entry.id)
      
      console.log(`${entry.entry_date} - ${entry.description}`)
      if (entryLines && entryLines.length > 0) {
        entryLines.forEach(line => {
          const acc = line.chart_of_accounts
          console.log(`   ${acc.account_code} - ${acc.account_name}: مدين ${line.debit_amount || 0} | دائن ${line.credit_amount || 0}`)
        })
      }
      console.log(`   المرجع: ${entry.reference_id || 'N/A'}`)
      console.log()
    }
  }
  
  // البحث عن المدفوعات التي قد تكون مرتبطة
  console.log('='.repeat(60))
  console.log('📊 البحث عن المدفوعات المرتبطة:')
  console.log('='.repeat(60))
  
  // البحث في payments
  const { data: payments } = await supabase
    .from('payments')
    .select('*')
    .eq('id', referenceId)
    .limit(1)
  
  if (payments && payments.length > 0) {
    console.log('✅ تم العثور على دفعة مرتبطة:')
    payments.forEach(p => {
      console.log(`   التاريخ: ${p.payment_date}`)
      console.log(`   المبلغ: ${p.amount}`)
      console.log(`   طريقة الدفع: ${p.payment_method}`)
      console.log(`   الحساب: ${p.account_id || 'غير محدد'}`)
      console.log()
    })
  } else {
    console.log('⚠️  لا توجد دفعة مرتبطة مباشرة')
  }
  
  console.log('\n✅ اكتمل التحقق!')
}

checkPaymentReclassification().catch(console.error)

