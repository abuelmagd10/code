// تحليل قائمة مدفوعات العملاء وتحديد مدفوعات فودافون كاش
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = 'https://hfvsbsizokxontflgdyn.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function analyzePaymentsList() {
  console.log('🔍 تحليل قائمة مدفوعات العملاء...\n')
  
  // قائمة المدفوعات من المستخدم
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
  
  // حساب الإجمالي
  const total = payments.reduce((sum, p) => sum + p.amount, 0)
  
  console.log('='.repeat(60))
  console.log('📊 إجمالي مدفوعات العملاء:')
  console.log('='.repeat(60))
  console.log(`💰 الإجمالي: ${total.toFixed(2)}`)
  console.log(`📊 عدد المدفوعات: ${payments.length}\n`)
  
  // البحث عن مدفوعات فودافون كاش
  const vodafonePayments = payments.filter(p => {
    const ref = String(p.ref || '').toLowerCase()
    return ref.includes('فودافون') || 
           ref.includes('vodafone') ||
           ref.includes('1012')
  })
  
  // البحث عن مدفوعات أخرى قد تكون فودافون (بدون مرجع واضح)
  const possibleVodafonePayments = payments.filter(p => {
    const ref = String(p.ref || '').toLowerCase()
    // المدفوعات بدون مرجع أو بمرجع بسيط قد تكون فودافون
    return (p.ref === '-' || p.ref === '') && p.amount > 0
  })
  
  console.log('='.repeat(60))
  console.log('📱 مدفوعات فودافون كاش (مؤكدة):')
  console.log('='.repeat(60))
  
  if (vodafonePayments.length > 0) {
    let vodafoneTotal = 0
    vodafonePayments.forEach((p, idx) => {
      vodafoneTotal += p.amount
      console.log(`${idx + 1}. ${p.date} - ${p.invoice}`)
      console.log(`   المبلغ: ${p.amount.toFixed(2)}`)
      console.log(`   المرجع: ${p.ref}`)
      console.log()
    })
    console.log(`💰 إجمالي مدفوعات فودافون كاش: ${vodafoneTotal.toFixed(2)}\n`)
  } else {
    console.log('⚠️  لا توجد مدفوعات فودافون كاش مؤكدة\n')
  }
  
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
  
  // جلب جميع المدفوعات من قاعدة البيانات
  console.log('='.repeat(60))
  console.log('🔍 البحث عن المدفوعات في قاعدة البيانات:')
  console.log('='.repeat(60))
  
  const { data: dbPayments } = await supabase
    .from('payments')
    .select('*')
    .eq('company_id', companyId)
    .order('payment_date', { ascending: false })
    .limit(100)
  
  if (dbPayments && dbPayments.length > 0) {
    console.log(`✅ تم العثور على ${dbPayments.length} دفعة في قاعدة البيانات\n`)
    
    // البحث عن مدفوعات فودافون
    const dbVodafonePayments = dbPayments.filter(p => {
      const method = String(p.payment_method || '').toLowerCase()
      const notes = String(p.notes || '').toLowerCase()
      const ref = String(p.reference_number || '').toLowerCase()
      return method.includes('فودافون') || 
             method.includes('vodafone') ||
             method.includes('1012') ||
             notes.includes('فودافون') ||
             notes.includes('vodafone') ||
             ref.includes('فودافون') ||
             ref.includes('vodafone')
    })
    
    if (dbVodafonePayments.length > 0) {
      console.log(`✅ مدفوعات فودافون في قاعدة البيانات (${dbVodafonePayments.length}):\n`)
      let dbVodafoneTotal = 0
      dbVodafonePayments.forEach((p, idx) => {
        dbVodafoneTotal += Number(p.amount || 0)
        console.log(`${idx + 1}. ${p.payment_date} - ${p.invoice_id || 'N/A'}`)
        console.log(`   المبلغ: ${p.amount}`)
        console.log(`   طريقة الدفع: ${p.payment_method || 'غير محدد'}`)
        console.log(`   المرجع: ${p.reference_number || 'N/A'}`)
        console.log(`   الحساب: ${p.account_id || 'غير محدد'}`)
        console.log()
      })
      console.log(`💰 إجمالي: ${dbVodafoneTotal.toFixed(2)}\n`)
    }
    
    // مطابقة المدفوعات من القائمة مع قاعدة البيانات
    console.log('='.repeat(60))
    console.log('🔗 مطابقة المدفوعات:')
    console.log('='.repeat(60))
    
    // البحث عن المدفوعات التي قد تكون فودافون من القائمة
    const matchedPayments = []
    
    vodafonePayments.forEach(listPayment => {
      // البحث عن مطابقة في قاعدة البيانات
      const matched = dbPayments.find(dbPayment => {
        return dbPayment.invoice_id && 
               listPayment.invoice !== 'غير مرتبط' &&
               Math.abs(Number(dbPayment.amount || 0) - listPayment.amount) < 0.01 &&
               dbPayment.payment_date === listPayment.date
      })
      
      if (matched) {
        matchedPayments.push({
          list: listPayment,
          db: matched
        })
      }
    })
    
    if (matchedPayments.length > 0) {
      console.log(`✅ تمت مطابقة ${matchedPayments.length} دفعة:\n`)
      matchedPayments.forEach(({ list, db }, idx) => {
        console.log(`${idx + 1}. ${list.date} - ${list.invoice}`)
        console.log(`   المبلغ: ${list.amount.toFixed(2)}`)
        console.log(`   المرجع: ${list.ref}`)
        console.log(`   الحساب في DB: ${db.account_id || 'غير محدد'}`)
        console.log()
      })
    }
  }
  
  console.log('='.repeat(60))
  console.log('📊 الملخص النهائي:')
  console.log('='.repeat(60))
  console.log(`إجمالي مدفوعات العملاء من القائمة: ${total.toFixed(2)}`)
  if (vodafonePayments.length > 0) {
    const vodafoneTotal = vodafonePayments.reduce((sum, p) => sum + p.amount, 0)
    console.log(`إجمالي مدفوعات فودافون كاش (مؤكدة): ${vodafoneTotal.toFixed(2)}`)
  }
  console.log(`\n📊 الرصيد الحالي في حساب 1012: 19,165.00`)
  
  console.log('\n✅ اكتمل التحليل!')
}

analyzePaymentsList().catch(console.error)

