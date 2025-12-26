// إنشاء قيود محاسبية للمدفوعات المفقودة في حساب 1012
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = 'https://hfvsbsizokxontflgdyn.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function createMissingPayments() {
  console.log('🔧 إنشاء قيود محاسبية للمدفوعات المفقودة في حساب 1012...\n')
  
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
  const account1012Id = '0baff307-e007-490a-a3ec-a96974ad0bf1'
  
  // جلب الحسابات المطلوبة
  const { data: accounts } = await supabase
    .from('chart_of_accounts')
    .select('id, account_code, account_name')
    .eq('company_id', companyId)
    .in('account_code', ['1012', '1100']) // حساب 1012 و AR
  
  const account1012 = accounts?.find(a => a.account_code === '1012')
  const accountAR = accounts?.find(a => a.account_code === '1100')
  
  if (!account1012 || !accountAR) {
    console.error('❌ لم يتم العثور على الحسابات المطلوبة')
    return
  }
  
  console.log(`✅ الشركة: ${company.name}`)
  console.log(`✅ حساب 1012: ${account1012.account_name}`)
  console.log(`✅ حساب AR: ${accountAR.account_name}\n`)
  
  // المدفوعات المحتملة لفودافون كاش (غير بوسطة/انستاباي)
  const possibleVodafonePayments = [
    { date: '2025-12-19', amount: 600.00, ref: '-', invoice: 'INV-0033' },
    { date: '2025-12-13', amount: 2425.00, ref: '-', invoice: 'INV-0059' },
    { date: '2025-12-13', amount: 1900.00, ref: '-', invoice: 'INV-0056' },
    { date: '2025-12-13', amount: 1900.00, ref: '-', invoice: 'INV-0050' },
    { date: '2025-12-11', amount: 4600.00, ref: '-', invoice: 'INV-0047' },
    { date: '2025-12-11', amount: 1300.00, ref: 'تسجيل دفعة للفاتورة #INV-0045', invoice: 'INV-0045' },
    { date: '2025-12-11', amount: 1500.00, ref: 'تسجيل دفعة للفاتورة #INV-0038', invoice: 'INV-0038' },
    { date: '2025-12-10', amount: 100.00, ref: '-', invoice: 'INV-0021' },
    { date: '2025-12-10', amount: 2000.00, ref: 'فودافون كاش أ. خالد تسجيل دفعة للفاتورة #INV-0021', invoice: 'INV-0021' },
    { date: '2025-12-10', amount: 2550.00, ref: 'فودافون كاش أ. خالد - تسجيل دفعة للفاتورة #INV-0021', invoice: 'INV-0025' },
    { date: '2025-12-08', amount: 1700.00, ref: 'تسجيل دفعة للفاتورة #INV-0024', invoice: 'INV-0024' },
    { date: '2025-12-08', amount: 2970.00, ref: 'تسجيل دفعة للفاتورة #INV-0023', invoice: 'INV-0023' },
    { date: '2025-12-06', amount: 625.00, ref: '-', invoice: 'INV-0015' }
  ]
  
  console.log(`✅ تم تحديد ${possibleVodafonePayments.length} دفعة محتملة\n`)
  
  // جلب الفواتير
  const invoiceNumbers = possibleVodafonePayments.map(p => p.invoice).filter(inv => inv !== 'غير مرتبط')
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number')
    .eq('company_id', companyId)
    .in('invoice_number', invoiceNumbers)
  
  const invoiceMap = new Map((invoices || []).map(inv => [inv.invoice_number, inv.id]))
  
  // التحقق من القيود الموجودة
  console.log('='.repeat(60))
  console.log('🔍 التحقق من القيود الموجودة:')
  console.log('='.repeat(60))
  
  let createdCount = 0
  let skippedCount = 0
  
  for (const payment of possibleVodafonePayments) {
    const invoiceId = invoiceMap.get(payment.invoice)
    
    if (!invoiceId) {
      console.log(`⚠️  الفاتورة ${payment.invoice} غير موجودة - تم التخطي`)
      skippedCount++
      continue
    }
    
    // التحقق من وجود قيد محاسبي لهذه الفاتورة في حساب 1012
    const { data: existingEntries } = await supabase
      .from('journal_entries')
      .select('id')
      .eq('company_id', companyId)
      .eq('reference_type', 'invoice_payment')
      .eq('reference_id', invoiceId)
      .limit(1)
    
    if (existingEntries && existingEntries.length > 0) {
      // التحقق من أن القيد يستخدم حساب 1012
      const { data: existingLines } = await supabase
        .from('journal_entry_lines')
        .select('account_id')
        .eq('journal_entry_id', existingEntries[0].id)
        .eq('account_id', account1012Id)
        .limit(1)
      
      if (existingLines && existingLines.length > 0) {
        console.log(`✅ قيد موجود بالفعل: ${payment.invoice} - ${payment.amount}`)
        skippedCount++
        continue
      }
    }
    
    // إنشاء قيد محاسبي جديد
    console.log(`🔄 إنشاء قيد: ${payment.invoice} - ${payment.amount}`)
    
    const { data: journalEntry, error: entryError } = await supabase
      .from('journal_entries')
      .insert({
        company_id: companyId,
        reference_type: 'invoice_payment',
        reference_id: invoiceId,
        entry_date: payment.date,
        description: `دفعة على فاتورة ${payment.invoice} - ${payment.ref || 'فودافون كاش'}`
      })
      .select()
      .single()
    
    if (entryError) {
      console.error(`❌ خطأ في إنشاء القيد: ${entryError.message}`)
      continue
    }
    
    // إنشاء سطور القيد
    const lines = [
      {
        journal_entry_id: journalEntry.id,
        account_id: account1012Id,
        debit_amount: payment.amount,
        credit_amount: 0,
        description: `دفعة من فودافون كاش - ${payment.invoice}`
      },
      {
        journal_entry_id: journalEntry.id,
        account_id: accountAR.id,
        debit_amount: 0,
        credit_amount: payment.amount,
        description: `تسديد فاتورة ${payment.invoice}`
      }
    ]
    
    const { error: linesError } = await supabase
      .from('journal_entry_lines')
      .insert(lines)
    
    if (linesError) {
      console.error(`❌ خطأ في إنشاء سطور القيد: ${linesError.message}`)
      // حذف القيد في حالة الخطأ
      await supabase.from('journal_entries').delete().eq('id', journalEntry.id)
      continue
    }
    
    console.log(`✅ تم إنشاء القيد بنجاح`)
    createdCount++
  }
  
  console.log('\n' + '='.repeat(60))
  console.log('📊 الملخص:')
  console.log('='.repeat(60))
  console.log(`✅ تم إنشاء: ${createdCount} قيد`)
  console.log(`⏭️  تم التخطي: ${skippedCount} قيد`)
  
  const totalAmount = possibleVodafonePayments
    .filter((p, idx) => idx < createdCount)
    .reduce((sum, p) => sum + p.amount, 0)
  
  console.log(`💰 الإجمالي المنشأ: ${totalAmount.toFixed(2)}`)
  console.log(`\n📊 الرصيد المتوقع في حساب 1012: ${(19165 + totalAmount).toFixed(2)}`)
  
  console.log('\n✅ اكتمل!')
}

createMissingPayments().catch(console.error)

