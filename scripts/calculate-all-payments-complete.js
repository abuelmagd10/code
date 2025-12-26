// حساب شامل لجميع مدفوعات الفواتير
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = 'https://hfvsbsizokxontflgdyn.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function calculateAllPayments() {
  console.log('🔍 حساب شامل لجميع مدفوعات الفواتير...\n')
  
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
  
  // جلب حساب 1000
  const { data: account1000 } = await supabase
    .from('chart_of_accounts')
    .select('id, account_code, account_name')
    .eq('account_code', '1000')
    .eq('company_id', companyId)
    .limit(1)
    .single()
  
  if (!account1000) {
    console.error('❌ لم يتم العثور على حساب 1000')
    return
  }
  
  console.log(`✅ الشركة: ${company.name}`)
  console.log(`✅ حساب 1000: ${account1000.account_name}\n`)
  
  // جلب جميع القيود المحاسبية لمدفوعات الفواتير
  const { data: invoicePaymentEntries } = await supabase
    .from('journal_entries')
    .select('id, entry_date, reference_type, reference_id, description')
    .eq('company_id', companyId)
    .eq('reference_type', 'invoice_payment')
    .order('entry_date', { ascending: false })
  
  if (!invoicePaymentEntries || invoicePaymentEntries.length === 0) {
    console.log('⚠️  لا توجد قيود مدفوعات فواتير')
    return
  }
  
  console.log(`✅ تم العثور على ${invoicePaymentEntries.length} قيد مدفوعات فواتير\n`)
  
  // جلب جميع سطور القيود
  const entryIds = invoicePaymentEntries.map(e => e.id)
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
  
  // حساب المبالغ في حساب 1000
  let totalInAccount1000 = 0
  const account1000Entries = []
  
  invoicePaymentEntries.forEach(entry => {
    const lines = linesByEntry.get(entry.id) || []
    
    // البحث عن سطر حساب 1000
    const account1000Line = lines.find(line => line.account_id === account1000.id)
    if (account1000Line) {
      const debit = Number(account1000Line.debit_amount || 0)
      totalInAccount1000 += debit
      account1000Entries.push({
        entry,
        debit,
        lines
      })
    }
  })
  
  // عرض جميع القيود مع الإجمالي
  console.log('='.repeat(60))
  console.log('📋 جميع القيود في حساب 1000:')
  console.log('='.repeat(60))
  
  let runningTotal = 0
  account1000Entries.forEach(({ entry, debit, lines }, idx) => {
    runningTotal += debit
    console.log(`\n${idx + 1}. ${entry.entry_date} - ${entry.description}`)
    console.log(`   المبلغ: ${debit.toFixed(2)}`)
    console.log(`   الإجمالي التراكمي: ${runningTotal.toFixed(2)}`)
    lines.forEach(line => {
      const acc = line.chart_of_accounts
      console.log(`   ${acc.account_code} - ${acc.account_name}: مدين ${line.debit_amount || 0} | دائن ${line.credit_amount || 0}`)
    })
    console.log(`   المرجع: ${entry.reference_id || 'N/A'}`)
  })
  
  console.log('\n' + '='.repeat(60))
  console.log('📊 الملخص النهائي:')
  console.log('='.repeat(60))
  console.log(`إجمالي مدفوعات الفواتير في حساب 1000: ${totalInAccount1000.toFixed(2)}`)
  console.log(`عدد القيود: ${account1000Entries.length}`)
  console.log(`\n📊 الرصيد الحالي في حساب 1012: 1,500.00`)
  console.log(`📊 الرصيد المتوقع في حساب 1012: ${(1500 + totalInAccount1000).toFixed(2)}`)
  console.log(`📊 الفرق: ${totalInAccount1000.toFixed(2)}`)
  
  console.log('\n✅ اكتمل الحساب!')
}

calculateAllPayments().catch(console.error)

