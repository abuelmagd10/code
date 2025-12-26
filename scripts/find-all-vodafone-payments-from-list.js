// البحث عن جميع مدفوعات فودافون كاش من القائمة
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = 'https://hfvsbsizokxontflgdyn.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function findAllVodafonePayments() {
  console.log('🔍 البحث عن جميع مدفوعات فودافون كاش من القائمة...\n')
  
  // قائمة المدفوعات
  const payments = [
    { date: '2025-12-19', amount: 600.00, ref: '-', invoice: 'INV-0033' },
    { date: '2025-12-13', amount: 2000.00, ref: 'INSTA-10/12/2025', invoice: 'INV-0020' },
    { date: '2025-12-13', amount: 4300.00, ref: 'INSTA-9/12/2025', invoice: 'INV-0033' },
    { date: '2025-12-13', amount: 4640.00, ref: 'INSTA-10/12/2025', invoice: 'INV-0037' },
    { date: '2025-12-13', amount: 2425.00, ref: '-', invoice: 'INV-0059' },
    { date: '2025-12-13', amount: 3700.00, ref: 'كاش - مندوب داخلى', invoice: 'INV-0058' },
    { date: '2025-12-13', amount: 1900.00, ref: '-', invoice: 'INV-0056' },
    { date: '2025-12-13', amount: 2000.00, ref: 'BOSTA-42234889', invoice: 'INV-0029' },
    { date: '2025-12-13', amount: 1900.00, ref: '-', invoice: 'INV-0050' },
    { date: '2025-12-13', amount: 1800.00, ref: 'كاش - مندوب داخلى', invoice: 'INV-0040' },
    { date: '2025-12-11', amount: 8900.00, ref: 'BOSTA-10497546', invoice: 'INV-0034' },
    { date: '2025-12-11', amount: -250.00, ref: 'REF-1765662068508', invoice: 'غير مرتبط' },
    { date: '2025-12-11', amount: 4600.00, ref: '-', invoice: 'INV-0047' },
    { date: '2025-12-11', amount: 1300.00, ref: 'تسجيل دفعة للفاتورة #INV-0045', invoice: 'INV-0045' },
    { date: '2025-12-11', amount: 1500.00, ref: 'تسجيل دفعة للفاتورة #INV-0038', invoice: 'INV-0038' },
    { date: '2025-12-10', amount: 9025.00, ref: 'BOSTS-21048408', invoice: 'INV-0019' },
    { date: '2025-12-10', amount: 7980.00, ref: 'BOSTA-77967558', invoice: 'INV-0035' },
    { date: '2025-12-10', amount: 100.00, ref: '-', invoice: 'INV-0021' },
    { date: '2025-12-10', amount: 4100.00, ref: 'BOSTA-86908005', invoice: 'INV-0036' },
    { date: '2025-12-10', amount: 2000.00, ref: 'فودافون كاش أ. خالد تسجيل دفعة للفاتورة #INV-0021', invoice: 'INV-0021' },
    { date: '2025-12-10', amount: 3860.00, ref: 'BOSTA-57352237', invoice: 'INV-0027' },
    { date: '2025-12-10', amount: 2550.00, ref: 'فودافون كاش أ. خالد - تسجيل دفعة للفاتورة #INV-0021', invoice: 'INV-0025' },
    { date: '2025-12-09', amount: 8515.00, ref: 'BOSTA - 39935948', invoice: 'INV-0026' },
    { date: '2025-12-09', amount: 2100.00, ref: 'BOSTA-25799648', invoice: 'INV-0030' },
    { date: '2025-12-08', amount: 1700.00, ref: 'تسجيل دفعة للفاتورة #INV-0024', invoice: 'INV-0024' },
    { date: '2025-12-08', amount: 2970.00, ref: 'تسجيل دفعة للفاتورة #INV-0023', invoice: 'INV-0023' },
    { date: '2025-12-08', amount: 5000.00, ref: 'BOSTA-6397663', invoice: 'INV-0031' },
    { date: '2025-12-08', amount: 4900.00, ref: 'شحن داخلى - محمد', invoice: 'INV-0022' },
    { date: '2025-12-06', amount: 625.00, ref: '-', invoice: 'INV-0015' },
    { date: '2025-12-05', amount: 12700.00, ref: 'Bosta-58984375', invoice: 'INV-0018' },
    { date: '2025-12-05', amount: 5370.00, ref: 'Bosta-52464481', invoice: 'INV-0014' },
    { date: '2025-12-02', amount: 1475.00, ref: 'FT25334MCHSR/B99 تحويل 8000 جم يشمل دفع الفاتورة INV-0013', invoice: 'INV-0015' },
    { date: '2025-11-30', amount: 6525.00, ref: 'FT25334MCHSR/b99 مبلغ 8000 جم شامل دفع جزئى من الفاتورة INV-0015', invoice: 'INV-0013' },
    { date: '2025-11-28', amount: 3690.00, ref: 'Bosta-19845102', invoice: 'INV-0011' },
    { date: '2025-11-28', amount: 5770.00, ref: 'Bosta-82510436', invoice: 'INV-0006' },
    { date: '2025-11-19', amount: 2260.00, ref: 'Bosta-46782636', invoice: 'INV-0012' },
    { date: '2025-11-18', amount: 7055.00, ref: 'cash', invoice: 'INV-0010' },
    { date: '2025-11-16', amount: 3350.00, ref: 'insta-003', invoice: 'INV-0009' },
    { date: '2025-11-10', amount: 2955.00, ref: 'insta-002', invoice: 'INV-0008' },
    { date: '2025-11-05', amount: 2600.00, ref: 'Bosta-16407930', invoice: 'INV-0007' },
    { date: '2025-11-05', amount: 6040.00, ref: 'Bosta-21321829', invoice: 'INV-0005' },
    { date: '2025-10-26', amount: 2100.00, ref: 'Bosta-13566151', invoice: 'INV-0004' },
    { date: '2025-10-23', amount: 3956.00, ref: 'Bosta-66043183', invoice: 'INV-0003' },
    { date: '2025-10-23', amount: 10640.00, ref: 'Bosta-19743585', invoice: 'INV-0002' },
    { date: '2025-10-17', amount: 8100.00, ref: 'insta-001', invoice: 'INV-0001' }
  ]
  
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
  
  // تصنيف المدفوعات
  const confirmedVodafone = [] // مؤكدة بفودافون
  const bostaPayments = [] // بوسطة
  const instaPayments = [] // انستاباي
  const cashPayments = [] // كاش
  const unknownPayments = [] // غير معروف
  const bankTransferPayments = [] // تحويل بنكي
  
  payments.forEach(p => {
    const ref = String(p.ref || '').toLowerCase()
    
    if (ref.includes('فودافون') || ref.includes('vodafone')) {
      confirmedVodafone.push(p)
    } else if (ref.includes('bosta') || ref.includes('بوسطة')) {
      bostaPayments.push(p)
    } else if (ref.includes('insta') || ref.includes('انستا')) {
      instaPayments.push(p)
    } else if (ref.includes('كاش') || ref.includes('cash')) {
      cashPayments.push(p)
    } else if (ref.includes('ft') || ref.includes('تحويل')) {
      bankTransferPayments.push(p)
    } else if (p.ref === '-' || p.ref === '' || ref.includes('تسجيل دفعة')) {
      unknownPayments.push(p)
    } else {
      unknownPayments.push(p)
    }
  })
  
  console.log('='.repeat(60))
  console.log('📊 تصنيف المدفوعات:')
  console.log('='.repeat(60))
  console.log(`✅ فودافون كاش (مؤكدة): ${confirmedVodafone.length} دفعة`)
  console.log(`📦 بوسطة: ${bostaPayments.length} دفعة`)
  console.log(`💳 انستاباي: ${instaPayments.length} دفعة`)
  console.log(`💵 كاش: ${cashPayments.length} دفعة`)
  console.log(`🏦 تحويل بنكي: ${bankTransferPayments.length} دفعة`)
  console.log(`❓ غير معروف: ${unknownPayments.length} دفعة`)
  
  // حساب الإجماليات
  const confirmedVodafoneTotal = confirmedVodafone.reduce((sum, p) => sum + p.amount, 0)
  const unknownTotal = unknownPayments.reduce((sum, p) => sum + p.amount, 0)
  const allTotal = payments.reduce((sum, p) => sum + p.amount, 0)
  
  console.log(`\n💰 إجمالي فودافون كاش (مؤكدة): ${confirmedVodafoneTotal.toFixed(2)}`)
  console.log(`💰 إجمالي غير معروف: ${unknownTotal.toFixed(2)}`)
  console.log(`💰 إجمالي الكلي: ${allTotal.toFixed(2)}`)
  
  // إذا كان المستخدم يقول أن المبلغ كان 18 ألف وكسور، ربما يقصد المدفوعات غير المعروفة
  // أو المدفوعات التي لا تحتوي على مرجع بوسطة/انستاباي
  const possibleVodafone = payments.filter(p => {
    const ref = String(p.ref || '').toLowerCase()
    // استثناء المدفوعات التي هي بوسطة أو انستاباي أو تحويل بنكي
    return !ref.includes('bosta') && 
           !ref.includes('بوسطة') &&
           !ref.includes('insta') &&
           !ref.includes('انستا') &&
           !ref.includes('ft') &&
           !ref.includes('تحويل') &&
           p.amount > 0
  })
  
  const possibleVodafoneTotal = possibleVodafone.reduce((sum, p) => sum + p.amount, 0)
  
  console.log(`\n💡 المدفوعات المحتملة لفودافون كاش (غير بوسطة/انستاباي): ${possibleVodafone.length} دفعة`)
  console.log(`💰 الإجمالي: ${possibleVodafoneTotal.toFixed(2)}`)
  
  // البحث في قاعدة البيانات عن المدفوعات المرتبطة بفواتير محددة
  console.log('\n' + '='.repeat(60))
  console.log('🔍 البحث عن المدفوعات في قاعدة البيانات:')
  console.log('='.repeat(60))
  
  // جلب أرقام الفواتير
  const invoiceNumbers = [...new Set(payments.map(p => p.invoice).filter(inv => inv !== 'غير مرتبط'))]
  
  // جلب الفواتير
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number')
    .eq('company_id', companyId)
    .in('invoice_number', invoiceNumbers)
  
  const invoiceMap = new Map((invoices || []).map(inv => [inv.invoice_number, inv.id]))
  
  // جلب المدفوعات المرتبطة بهذه الفواتير
  const invoiceIds = Array.from(invoiceMap.values())
  const { data: dbPayments } = await supabase
    .from('payments')
    .select('*')
    .eq('company_id', companyId)
    .in('invoice_id', invoiceIds)
    .order('payment_date', { ascending: false })
  
  if (dbPayments && dbPayments.length > 0) {
    console.log(`✅ تم العثور على ${dbPayments.length} دفعة مرتبطة بالفواتير\n`)
    
    // تصنيف المدفوعات حسب الحساب
    const paymentsByAccount = {}
    
    dbPayments.forEach(p => {
      const accountId = String(p.account_id || 'unknown')
      if (!paymentsByAccount[accountId]) {
        paymentsByAccount[accountId] = []
      }
      paymentsByAccount[accountId].push(p)
    })
    
    // جلب أسماء الحسابات
    const accountIds = Object.keys(paymentsByAccount).filter(id => id !== 'unknown')
    const { data: accounts } = await supabase
      .from('chart_of_accounts')
      .select('id, account_code, account_name')
      .in('id', accountIds)
    
    const accountMap = new Map((accounts || []).map(acc => [acc.id, acc]))
    
    console.log('📊 المدفوعات حسب الحساب:\n')
    Object.entries(paymentsByAccount).forEach(([accountId, accountPayments]) => {
      const account = accountMap.get(accountId)
      const total = accountPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
      console.log(`${account ? `${account.account_code} - ${account.account_name}` : 'غير محدد'}: ${accountPayments.length} دفعة - ${total.toFixed(2)}`)
    })
    
    // المدفوعات في حساب 1012
    const account1012Payments = paymentsByAccount[account1012Id] || []
    const account1012Total = account1012Payments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
    
    console.log(`\n✅ المدفوعات في حساب 1012: ${account1012Payments.length} دفعة - ${account1012Total.toFixed(2)}`)
  }
  
  console.log('\n' + '='.repeat(60))
  console.log('📊 الملخص النهائي:')
  console.log('='.repeat(60))
  console.log(`إجمالي مدفوعات العملاء: ${allTotal.toFixed(2)}`)
  console.log(`فودافون كاش (مؤكدة): ${confirmedVodafoneTotal.toFixed(2)}`)
  console.log(`فودافون كاش (محتملة): ${possibleVodafoneTotal.toFixed(2)}`)
  console.log(`\n📊 الرصيد الحالي في حساب 1012: 19,165.00`)
  
  if (possibleVodafoneTotal > 18000 && possibleVodafoneTotal < 20000) {
    console.log(`\n✅ الإجمالي المحتمل (${possibleVodafoneTotal.toFixed(2)}) قريب من 18 ألف وكسور!`)
  }
  
  console.log('\n✅ اكتمل التحليل!')
}

findAllVodafonePayments().catch(console.error)

