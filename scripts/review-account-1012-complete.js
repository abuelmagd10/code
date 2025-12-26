// مراجعة شاملة لحساب 1012 - فودافون كاش
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = 'https://hfvsbsizokxontflgdyn.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function reviewAccount1012() {
  console.log('🔍 مراجعة شاملة لحساب 1012 - فودافون كاش - الزيتون...\n')
  
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
  
  // جلب الحساب
  const { data: account } = await supabase
    .from('chart_of_accounts')
    .select('*')
    .eq('account_code', '1012')
    .eq('company_id', companyId)
    .limit(1)
    .single()
  
  if (!account) {
    console.error('❌ الحساب 1012 غير موجود')
    return
  }
  
  console.log('='.repeat(60))
  console.log('📊 معلومات الحساب:')
  console.log('='.repeat(60))
  console.log(`الاسم: ${account.account_name}`)
  console.log(`الكود: ${account.account_code}`)
  console.log(`النوع: ${account.account_type}`)
  console.log(`الرصيد الافتتاحي: ${account.opening_balance || 0}`)
  console.log(`الحساب ID: ${account.id}\n`)
  
  // جلب جميع القيود المرتبطة بالحساب
  const { data: journalLines, error: linesError } = await supabase
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
        description,
        status
      )
    `)
    .eq('account_id', account.id)
  
  if (linesError) {
    console.error('❌ خطأ في جلب القيود:', linesError)
    return
  }
  
  console.log('='.repeat(60))
  console.log('📋 جميع القيود المرتبطة بالحساب:')
  console.log('='.repeat(60))
  console.log(`إجمالي القيود: ${journalLines?.length || 0}\n`)
  
  if (!journalLines || journalLines.length === 0) {
    console.log('⚠️  لا توجد قيود مرتبطة بالحساب!')
  } else {
    let totalDebit = 0
    let totalCredit = 0
    let balance = (account.opening_balance || 0)
    
    // تجميع حسب نوع المرجع
    const byReferenceType = {}
    
    journalLines.forEach((line, idx) => {
      const entry = line.journal_entries
      const debit = Number(line.debit_amount || 0)
      const credit = Number(line.credit_amount || 0)
      
      totalDebit += debit
      totalCredit += credit
      balance += debit - credit
      
      const refType = entry.reference_type || 'manual'
      if (!byReferenceType[refType]) {
        byReferenceType[refType] = { count: 0, totalDebit: 0, totalCredit: 0 }
      }
      byReferenceType[refType].count++
      byReferenceType[refType].totalDebit += debit
      byReferenceType[refType].totalCredit += credit
      
      console.log(`${idx + 1}. ${entry.entry_date} - ${refType}`)
      console.log(`   الوصف: ${entry.description || line.description || 'بدون وصف'}`)
      console.log(`   مدين: ${debit.toFixed(2)} | دائن: ${credit.toFixed(2)}`)
      if (entry.reference_id) {
        console.log(`   المرجع: ${entry.reference_id}`)
      }
      console.log(`   الرصيد التراكمي: ${balance.toFixed(2)}`)
      console.log()
    })
    
    console.log('='.repeat(60))
    console.log('📊 ملخص القيود:')
    console.log('='.repeat(60))
    console.log(`إجمالي المدين: ${totalDebit.toFixed(2)}`)
    console.log(`إجمالي الدائن: ${totalCredit.toFixed(2)}`)
    console.log(`الرصيد النهائي: ${balance.toFixed(2)}`)
    console.log(`الرصيد الافتتاحي: ${account.opening_balance || 0}`)
    console.log(`الرصيد من القيود: ${(balance - (account.opening_balance || 0)).toFixed(2)}`)
    
    console.log('\n' + '='.repeat(60))
    console.log('📊 التجميع حسب نوع المرجع:')
    console.log('='.repeat(60))
    Object.entries(byReferenceType).forEach(([type, data]) => {
      console.log(`${type}:`)
      console.log(`  عدد القيود: ${data.count}`)
      console.log(`  إجمالي المدين: ${data.totalDebit.toFixed(2)}`)
      console.log(`  إجمالي الدائن: ${data.totalCredit.toFixed(2)}`)
      console.log(`  الصافي: ${(data.totalDebit - data.totalCredit).toFixed(2)}`)
      console.log()
    })
  }
  
  // التحقق من المدفوعات (payments)
  console.log('='.repeat(60))
  console.log('💳 المدفوعات المرتبطة بالحساب:')
  console.log('='.repeat(60))
  
  // البحث عن payments التي تستخدم هذا الحساب
  const { data: payments } = await supabase
    .from('payments')
    .select('id, payment_date, amount, payment_method, reference_type, reference_id, notes')
    .eq('company_id', companyId)
    .or(`payment_method.ilike.%فودافون%,payment_method.ilike.%vodafone%,payment_method.ilike.%1012%`)
    .order('payment_date', { ascending: false })
  
  if (payments && payments.length > 0) {
    console.log(`✅ تم العثور على ${payments.length} دفعة:\n`)
    payments.forEach((p, idx) => {
      console.log(`${idx + 1}. ${p.payment_date} - ${p.payment_method}`)
      console.log(`   المبلغ: ${p.amount}`)
      console.log(`   المرجع: ${p.reference_type} - ${p.reference_id || 'N/A'}`)
      console.log(`   الملاحظات: ${p.notes || 'بدون ملاحظات'}`)
      console.log()
    })
  } else {
    console.log('⚠️  لا توجد مدفوعات مرتبطة مباشرة')
  }
  
  // التحقق من journal_entries التي قد تكون مدفوعات
  const { data: paymentEntries } = await supabase
    .from('journal_entries')
    .select(`
      id,
      entry_date,
      reference_type,
      reference_id,
      description,
      journal_entry_lines!inner(
        account_id,
        debit_amount,
        credit_amount
      )
    `)
    .eq('company_id', companyId)
    .in('reference_type', ['payment', 'invoice_payment', 'bill_payment', 'bank_transfer', 'bank_deposit', 'cash_withdrawal'])
    .order('entry_date', { ascending: false })
  
  if (paymentEntries && paymentEntries.length > 0) {
    console.log('='.repeat(60))
    console.log('💳 القيود المحاسبية للمدفوعات:')
    console.log('='.repeat(60))
    
    const relevantPayments = paymentEntries.filter(entry => {
      return entry.journal_entry_lines.some(line => line.account_id === account.id)
    })
    
    if (relevantPayments.length > 0) {
      console.log(`✅ تم العثور على ${relevantPayments.length} قيد مدفوعات:\n`)
      relevantPayments.forEach((entry, idx) => {
        const line = entry.journal_entry_lines.find(l => l.account_id === account.id)
        if (line) {
          console.log(`${idx + 1}. ${entry.entry_date} - ${entry.reference_type}`)
          console.log(`   الوصف: ${entry.description || 'بدون وصف'}`)
          console.log(`   مدين: ${line.debit_amount || 0} | دائن: ${line.credit_amount || 0}`)
          console.log(`   المرجع: ${entry.reference_id || 'N/A'}`)
          console.log()
        }
      })
    } else {
      console.log('⚠️  لا توجد قيود مدفوعات مرتبطة بالحساب')
    }
  }
  
  console.log('\n✅ اكتملت المراجعة!')
}

reviewAccount1012().catch(console.error)

