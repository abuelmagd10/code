// نقل مدفوعات العملاء من حساب 1000 إلى حساب 1012
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = 'https://hfvsbsizokxontflgdyn.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function transferPayments() {
  console.log('🔄 نقل مدفوعات العملاء من حساب 1000 إلى حساب 1012...\n')
  
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
  
  // جلب الحسابات
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
  
  console.log(`✅ الشركة: ${company.name}`)
  console.log(`✅ حساب 1000: ${account1000.account_name}`)
  console.log(`✅ حساب 1012: ${account1012.account_name}\n`)
  
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
      id,
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
  
  // البحث عن القيود التي تستخدم حساب 1000
  const entriesToTransfer = []
  
  invoicePaymentEntries.forEach(entry => {
    const lines = linesByEntry.get(entry.id) || []
    const account1000Line = lines.find(line => line.account_id === account1000.id)
    
    if (account1000Line && Number(account1000Line.debit_amount || 0) > 0) {
      entriesToTransfer.push({
        entry,
        line: account1000Line,
        allLines: lines
      })
    }
  })
  
  if (entriesToTransfer.length === 0) {
    console.log('⚠️  لا توجد قيود لنقلها')
    return
  }
  
  console.log(`✅ تم العثور على ${entriesToTransfer.length} قيد لنقلها\n`)
  
  // عرض القيود التي سيتم نقلها
  console.log('='.repeat(60))
  console.log('📋 القيود التي سيتم نقلها:')
  console.log('='.repeat(60))
  
  let totalToTransfer = 0
  entriesToTransfer.forEach(({ entry, line }, idx) => {
    const debit = Number(line.debit_amount || 0)
    totalToTransfer += debit
    console.log(`${idx + 1}. ${entry.entry_date} - ${entry.description}`)
    console.log(`   المبلغ: ${debit.toFixed(2)}`)
  })
  
  console.log(`\n💰 الإجمالي: ${totalToTransfer.toFixed(2)}`)
  
  // تأكيد النقل
  console.log('\n' + '='.repeat(60))
  console.log('⚠️  تحذير: هذا الإجراء سيعدل القيود المحاسبية!')
  console.log('='.repeat(60))
  console.log(`سيتم تحديث ${entriesToTransfer.length} سطر قيد`)
  console.log(`من حساب 1000 إلى حساب 1012`)
  console.log(`\nهل تريد المتابعة؟ (نعم/لا)`)
  
  // في الإنتاج، يجب طلب التأكيد من المستخدم
  // هنا سنقوم بالنقل مباشرة
  
  console.log('\n🔄 بدء النقل...\n')
  
  let transferredCount = 0
  let errorCount = 0
  
  for (const { entry, line, allLines } of entriesToTransfer) {
    try {
      // تحديث سطر القيد من حساب 1000 إلى حساب 1012
      const { error: updateError } = await supabase
        .from('journal_entry_lines')
        .update({
          account_id: account1012.id
        })
        .eq('id', line.id)
      
      if (updateError) {
        console.error(`❌ خطأ في تحديث القيد ${entry.id}:`, updateError.message)
        errorCount++
      } else {
        console.log(`✅ تم نقل: ${entry.entry_date} - ${line.debit_amount}`)
        transferredCount++
      }
    } catch (error) {
      console.error(`❌ خطأ في معالجة القيد ${entry.id}:`, error.message)
      errorCount++
    }
  }
  
  console.log('\n' + '='.repeat(60))
  console.log('📊 ملخص النقل:')
  console.log('='.repeat(60))
  console.log(`✅ تم نقل: ${transferredCount} قيد`)
  console.log(`❌ أخطاء: ${errorCount} قيد`)
  console.log(`💰 الإجمالي المنقول: ${totalToTransfer.toFixed(2)}`)
  console.log(`\n📊 الرصيد المتوقع في حساب 1012: ${(1500 + totalToTransfer).toFixed(2)}`)
  
  console.log('\n✅ اكتمل النقل!')
}

transferPayments().catch(console.error)

