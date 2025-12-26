// التحقق الكامل من مدفوعات حساب 1012
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = 'https://hfvsbsizokxontflgdyn.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function verifyPayments() {
  console.log('🔍 التحقق الكامل من مدفوعات حساب 1012...\n')
  
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
  
  console.log(`✅ الشركة: ${company.name}\n`)
  
  // جلب جميع المدفوعات في حساب 1012
  const { data: account1012Payments } = await supabase
    .from('payments')
    .select(`
      id,
      payment_date,
      amount,
      payment_method,
      reference_number,
      notes,
      invoice_id,
      invoices(
        invoice_number
      )
    `)
    .eq('company_id', companyId)
    .eq('account_id', account1012Id)
    .order('payment_date', { ascending: false })
  
  if (!account1012Payments || account1012Payments.length === 0) {
    console.log('⚠️  لا توجد مدفوعات في حساب 1012')
  } else {
    console.log('='.repeat(60))
    console.log(`📊 المدفوعات في حساب 1012 (${account1012Payments.length}):`)
    console.log('='.repeat(60))
    
    let total = 0
    account1012Payments.forEach((p, idx) => {
      total += Number(p.amount || 0)
      console.log(`${idx + 1}. ${p.payment_date} - ${p.invoices?.invoice_number || 'N/A'}`)
      console.log(`   المبلغ: ${p.amount}`)
      console.log(`   طريقة الدفع: ${p.payment_method || 'غير محدد'}`)
      console.log(`   المرجع: ${p.reference_number || p.notes || 'N/A'}`)
      console.log()
    })
    
    console.log(`💰 الإجمالي: ${total.toFixed(2)}\n`)
  }
  
  // جلب جميع القيود المحاسبية في حساب 1012
  const { data: account1012Lines } = await supabase
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
    .eq('account_id', account1012Id)
    .order('journal_entries.entry_date', { ascending: false })
  
  if (!account1012Lines || account1012Lines.length === 0) {
    console.log('⚠️  لا توجد قيود في حساب 1012')
  } else {
    console.log('='.repeat(60))
    console.log(`📊 القيود المحاسبية في حساب 1012 (${account1012Lines.length}):`)
    console.log('='.repeat(60))
    
    let totalDebit = 0
    let totalCredit = 0
    
    account1012Lines.forEach((line, idx) => {
      const entry = line.journal_entries
      const debit = Number(line.debit_amount || 0)
      const credit = Number(line.credit_amount || 0)
      
      totalDebit += debit
      totalCredit += credit
      
      console.log(`${idx + 1}. ${entry.entry_date} - ${entry.reference_type}`)
      console.log(`   الوصف: ${entry.description || line.description || 'بدون وصف'}`)
      console.log(`   مدين: ${debit.toFixed(2)} | دائن: ${credit.toFixed(2)}`)
      console.log(`   المرجع: ${entry.reference_id || 'N/A'}`)
      console.log()
    })
    
    console.log(`💰 إجمالي المدين: ${totalDebit.toFixed(2)}`)
    console.log(`💰 إجمالي الدائن: ${totalCredit.toFixed(2)}`)
    console.log(`💰 الرصيد: ${(totalDebit - totalCredit).toFixed(2)}\n`)
  }
  
  // قائمة المدفوعات من المستخدم (المدفوعات المحتملة لفودافون)
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
  
  const possibleVodafoneTotal = possibleVodafonePayments.reduce((sum, p) => sum + p.amount, 0)
  
  console.log('='.repeat(60))
  console.log('📋 المدفوعات المحتملة لفودافون كاش من القائمة:')
  console.log('='.repeat(60))
  console.log(`عدد المدفوعات: ${possibleVodafonePayments.length}`)
  console.log(`💰 الإجمالي: ${possibleVodafoneTotal.toFixed(2)}\n`)
  
  possibleVodafonePayments.forEach((p, idx) => {
    console.log(`${idx + 1}. ${p.date} - ${p.invoice} - ${p.amount.toFixed(2)}`)
  })
  
  console.log('\n' + '='.repeat(60))
  console.log('📊 المقارنة:')
  console.log('='.repeat(60))
  console.log(`المدفوعات في حساب 1012 (من DB): ${account1012Payments ? account1012Payments.reduce((sum, p) => sum + Number(p.amount || 0), 0).toFixed(2) : '0.00'}`)
  console.log(`المدفوعات المحتملة من القائمة: ${possibleVodafoneTotal.toFixed(2)}`)
  console.log(`الرصيد الحالي في حساب 1012: 19,165.00`)
  
  if (possibleVodafoneTotal > 18000 && possibleVodafoneTotal < 20000) {
    console.log(`\n✅ الإجمالي المحتمل (${possibleVodafoneTotal.toFixed(2)}) قريب من 18 ألف وكسور!`)
  }
  
  console.log('\n✅ اكتمل التحقق!')
}

verifyPayments().catch(console.error)

