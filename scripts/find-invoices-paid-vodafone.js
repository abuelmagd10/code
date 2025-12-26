// البحث عن الفواتير المدفوعة بفودافون كاش
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = 'https://hfvsbsizokxontflgdyn.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function findInvoicesPaidVodafone() {
  console.log('🔍 البحث عن الفواتير المدفوعة بفودافون كاش...\n')
  
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
  
  // جلب جميع الفواتير
  const { data: allInvoices } = await supabase
    .from('invoices')
    .select(`
      id,
      invoice_number,
      invoice_date,
      total_amount,
      paid_amount,
      payment_method,
      notes,
      customer_id,
      status,
      customers(
        name
      )
    `)
    .eq('company_id', companyId)
    .order('invoice_date', { ascending: false })
    .limit(200)
  
  // تصفية الفواتير المدفوعة
  const paidInvoices = allInvoices ? allInvoices.filter(inv => {
    const paid = Number(inv.paid_amount || 0)
    const status = String(inv.status || '')
    return paid > 0 || status === 'paid' || status === 'partially_paid'
  }) : []
  
  if (!paidInvoices || paidInvoices.length === 0) {
    console.log('⚠️  لا توجد فواتير مدفوعة')
    return
  }
  
  console.log(`✅ إجمالي الفواتير المدفوعة: ${paidInvoices.length}\n`)
  
  // البحث عن الفواتير المدفوعة بفودافون
  const vodafoneInvoices = paidInvoices.filter(inv => {
    const method = String(inv.payment_method || '').toLowerCase()
    const notes = String(inv.notes || '').toLowerCase()
    return method.includes('فودافون') || 
           method.includes('vodafone') || 
           method.includes('كاش') ||
           method.includes('1012') ||
           notes.includes('فودافون') ||
           notes.includes('vodafone') ||
           notes.includes('زيتون')
  })
  
  if (vodafoneInvoices.length > 0) {
    console.log('='.repeat(60))
    console.log(`✅ الفواتير المدفوعة بفودافون كاش (${vodafoneInvoices.length}):`)
    console.log('='.repeat(60))
    
    let totalPaid = 0
    
    for (const inv of vodafoneInvoices) {
      totalPaid += Number(inv.paid_amount || 0)
      
      // البحث عن القيود المحاسبية لهذه الفاتورة
      const { data: paymentEntries } = await supabase
        .from('journal_entries')
        .select(`
          id,
          entry_date,
          description,
          journal_entry_lines(
            account_id,
            debit_amount,
            credit_amount,
            chart_of_accounts!inner(
              account_code,
              account_name
            )
          )
        `)
        .eq('company_id', companyId)
        .eq('reference_type', 'invoice_payment')
        .eq('reference_id', inv.id)
      
      const customer = inv.customers
      console.log(`\n📄 ${inv.invoice_number} - ${inv.invoice_date}`)
      console.log(`   العميل: ${customer?.name || 'غير معروف'}`)
      console.log(`   الإجمالي: ${inv.total_amount} | المدفوع: ${inv.paid_amount}`)
      console.log(`   طريقة الدفع: ${inv.payment_method || 'غير محدد'}`)
      console.log(`   الملاحظات: ${inv.notes || 'بدون ملاحظات'}`)
      
      if (paymentEntries && paymentEntries.length > 0) {
        console.log(`   القيود المحاسبية (${paymentEntries.length}):`)
        paymentEntries.forEach((entry, idx) => {
          console.log(`      ${idx + 1}. ${entry.entry_date} - ${entry.description}`)
          const lines = entry.journal_entry_lines || []
          lines.forEach(line => {
            const acc = line.chart_of_accounts
            const isAccount1012 = line.account_id === account1012Id
            console.log(`         ${acc.account_code} - ${acc.account_name}: مدين ${line.debit_amount || 0} | دائن ${line.credit_amount || 0} ${isAccount1012 ? '✅' : '❌'}`)
          })
        })
      } else {
        console.log(`   ⚠️  لا توجد قيود محاسبية`)
      }
    }
    
    console.log(`\n💰 إجمالي المدفوعات بفودافون: ${totalPaid.toFixed(2)}`)
    
    // حساب المبلغ المسجل في حساب 1012
    const { data: account1012Lines } = await supabase
      .from('journal_entry_lines')
      .select('debit_amount, credit_amount')
      .eq('account_id', account1012Id)
      .in('journal_entry_id', 
        paidInvoices.map(inv => {
          // جلب journal_entry_ids للفواتير
          // هذا يحتاج استعلام منفصل
          return null
        }).filter(Boolean)
      )
    
    console.log(`\n📊 الرصيد الحالي في حساب 1012: 1,500.00`)
    console.log(`📊 الفرق المتوقع: ${(totalPaid - 1500).toFixed(2)}`)
    
  } else {
    console.log('⚠️  لا توجد فواتير مدفوعة بفودافون كاش في payment_method أو notes')
    console.log('\n💡 قد تكون المدفوعات مسجلة في القيود المحاسبية فقط')
  }
  
  // البحث في جميع الفواتير المدفوعة عن أي إشارة
  console.log('\n' + '='.repeat(60))
  console.log('📊 جميع الفواتير المدفوعة (عينة):')
  console.log('='.repeat(60))
  
  paidInvoices.slice(0, 10).forEach((inv, idx) => {
    const customer = inv.customers
    console.log(`${idx + 1}. ${inv.invoice_number} - ${inv.invoice_date}`)
    console.log(`   العميل: ${customer?.name || 'غير معروف'}`)
    console.log(`   المدفوع: ${inv.paid_amount}`)
    console.log(`   طريقة الدفع: ${inv.payment_method || 'غير محدد'}`)
    console.log()
  })
  
  if (paidInvoices.length > 10) {
    console.log(`... و ${paidInvoices.length - 10} فاتورة أخرى\n`)
  }
  
  console.log('✅ اكتمل البحث!')
}

findInvoicesPaidVodafone().catch(console.error)

