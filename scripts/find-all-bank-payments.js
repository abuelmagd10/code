// البحث عن جميع قيود مدفوعات العملاء في جميع الحسابات المصرفية
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = 'https://hfvsbsizokxontflgdyn.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function findAllBankPayments() {
  console.log('🔍 البحث عن جميع قيود مدفوعات العملاء في جميع الحسابات المصرفية...\n')
  
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
  
  // جلب جميع الحسابات المصرفية
  const { data: bankAccounts } = await supabase
    .from('chart_of_accounts')
    .select('id, account_code, account_name, account_type, sub_type')
    .eq('company_id', companyId)
    .in('account_code', ['1000', '1010', '1011', '1012', '1120', '1121', '1110', '1115'])
    .or('account_type.eq.asset,sub_type.eq.bank,sub_type.eq.cash')
  
  if (!bankAccounts || bankAccounts.length === 0) {
    console.error('❌ لم يتم العثور على حسابات مصرفية')
    return
  }
  
  console.log(`✅ الشركة: ${company.name}`)
  console.log(`✅ الحسابات المصرفية: ${bankAccounts.length}\n`)
  
  bankAccounts.forEach(acc => {
    console.log(`   ${acc.account_code} - ${acc.account_name}`)
  })
  console.log()
  
  // جلب جميع القيود المرتبطة بمدفوعات العملاء
  const { data: allEntries } = await supabase
    .from('journal_entries')
    .select('id, entry_date, reference_type, reference_id, description')
    .eq('company_id', companyId)
    .in('reference_type', ['invoice_payment', 'customer_payment', 'payment'])
    .order('entry_date', { ascending: false })
  
  if (!allEntries || allEntries.length === 0) {
    console.log('⚠️  لا توجد قيود مدفوعات عملاء')
    return
  }
  
  console.log(`✅ تم العثور على ${allEntries.length} قيد مدفوعات عملاء\n`)
  
  // جلب جميع سطور القيود
  const entryIds = allEntries.map(e => e.id)
  const { data: allLines } = await supabase
    .from('journal_entry_lines')
    .select(`
      journal_entry_id,
      account_id,
      debit_amount,
      credit_amount,
      chart_of_accounts!inner(
        account_code,
        account_name
      )
    `)
    .in('journal_entry_id', entryIds)
  
  if (!allLines || allLines.length === 0) {
    console.log('⚠️  لا توجد سطور قيود')
    return
  }
  
  // تجميع السطور حسب القيد
  const linesByEntry = new Map()
  allLines.forEach(line => {
    if (!linesByEntry.has(line.journal_entry_id)) {
      linesByEntry.set(line.journal_entry_id, [])
    }
    linesByEntry.get(line.journal_entry_id).push(line)
  })
  
  // حساب المبالغ لكل حساب مصرفي
  const totalsByAccount = {}
  const entriesByAccount = {}
  
  bankAccounts.forEach(acc => {
    totalsByAccount[acc.account_code] = 0
    entriesByAccount[acc.account_code] = []
  })
  
  allEntries.forEach(entry => {
    const lines = linesByEntry.get(entry.id) || []
    
    bankAccounts.forEach(acc => {
      const accountLine = lines.find(line => line.account_id === acc.id)
      if (accountLine) {
        const debit = Number(accountLine.debit_amount || 0)
        totalsByAccount[acc.account_code] += debit
        entriesByAccount[acc.account_code].push({
          entry,
          debit,
          lines
        })
      }
    })
  })
  
  // عرض النتائج
  console.log('='.repeat(60))
  console.log('📊 إجمالي مدفوعات العملاء حسب الحساب:')
  console.log('='.repeat(60))
  
  let grandTotal = 0
  
  Object.entries(totalsByAccount).forEach(([code, total]) => {
    if (total !== 0) {
      const acc = bankAccounts.find(a => a.account_code === code)
      console.log(`\n${code} - ${acc?.account_name || 'غير معروف'}: ${total.toFixed(2)}`)
      console.log(`   عدد القيود: ${entriesByAccount[code].length}`)
      grandTotal += total
    }
  })
  
  console.log(`\n💰 الإجمالي الكلي: ${grandTotal.toFixed(2)}`)
  
  // عرض تفاصيل حساب 1000
  if (entriesByAccount['1000'] && entriesByAccount['1000'].length > 0) {
    console.log('\n' + '='.repeat(60))
    console.log('📋 تفاصيل قيود حساب 1000:')
    console.log('='.repeat(60))
    
    let runningTotal = 0
    entriesByAccount['1000'].forEach(({ entry, debit, lines }, idx) => {
      runningTotal += debit
      console.log(`\n${idx + 1}. ${entry.entry_date} - ${entry.reference_type}`)
      console.log(`   الوصف: ${entry.description || 'بدون وصف'}`)
      console.log(`   المبلغ: ${debit.toFixed(2)}`)
      console.log(`   الإجمالي التراكمي: ${runningTotal.toFixed(2)}`)
    })
  }
  
  console.log('\n' + '='.repeat(60))
  console.log('📊 الملخص النهائي:')
  console.log('='.repeat(60))
  console.log(`إجمالي مدفوعات العملاء في حساب 1000: ${totalsByAccount['1000']?.toFixed(2) || '0.00'}`)
  console.log(`إجمالي مدفوعات العملاء في حساب 1012: ${totalsByAccount['1012']?.toFixed(2) || '0.00'}`)
  console.log(`إجمالي مدفوعات العملاء في جميع الحسابات: ${grandTotal.toFixed(2)}`)
  console.log(`\n📊 الرصيد الحالي في حساب 1012: 1,500.00`)
  
  if (totalsByAccount['1000'] > 0) {
    const expectedBalance = 1500 + totalsByAccount['1000']
    console.log(`📊 الرصيد المتوقع في حساب 1012: ${expectedBalance.toFixed(2)}`)
    console.log(`📊 الفرق: ${totalsByAccount['1000'].toFixed(2)}`)
  }
  
  console.log('\n✅ اكتمل البحث!')
}

findAllBankPayments().catch(console.error)

