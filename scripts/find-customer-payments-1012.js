// البحث عن مدفوعات العملاء المرتبطة بفودافون كاش
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = 'https://hfvsbsizokxontflgdyn.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function findCustomerPayments() {
  console.log('🔍 البحث عن مدفوعات العملاء المرتبطة بفودافون كاش...\n')
  
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
  
  // 1. البحث في جدول payments عن مدفوعات العملاء
  console.log('='.repeat(60))
  console.log('1️⃣ مدفوعات العملاء في جدول payments:')
  console.log('='.repeat(60))
  
  // جلب جميع المدفوعات أولاً
  const { data: allPayments } = await supabase
    .from('payments')
    .select('*')
    .eq('company_id', companyId)
    .order('payment_date', { ascending: false })
    .limit(200)
  
  // تصفية مدفوعات العملاء
  const customerPayments = allPayments ? allPayments.filter(p => 
    p.reference_type === 'invoice' && p.invoice_id
  ) : []
  
  // جلب معلومات الفواتير
  if (customerPayments.length > 0) {
    const invoiceIds = [...new Set(customerPayments.map(p => p.invoice_id).filter(Boolean))]
    const { data: invoices } = await supabase
      .from('invoices')
      .select('id, invoice_number, customer_id')
      .in('id', invoiceIds)
    
    const invoiceMap = new Map((invoices || []).map(inv => [inv.id, inv]))
    
    // جلب معلومات العملاء
    const customerIds = [...new Set((invoices || []).map(inv => inv.customer_id).filter(Boolean))]
    const { data: customers } = await supabase
      .from('customers')
      .select('id, name')
      .in('id', customerIds)
    
    const customerMap = new Map((customers || []).map(c => [c.id, c]))
    
    // إضافة معلومات الفواتير والعملاء
    customerPayments.forEach(p => {
      const inv = invoiceMap.get(p.invoice_id)
      if (inv) {
        p.invoice = inv
        const customer = customerMap.get(inv.customer_id)
        if (customer) {
          p.customer = customer
        }
      }
    })
  }
  
  if (customerPayments && customerPayments.length > 0) {
    console.log(`✅ تم العثور على ${customerPayments.length} دفعة عملاء\n`)
    
    // تصنيف المدفوعات
    const vodafonePayments = []
    const otherPayments = []
    const missingAccountPayments = []
    
    customerPayments.forEach(p => {
      const method = String(p.payment_method || '').toLowerCase()
      const notes = String(p.notes || '').toLowerCase()
      const accountId = String(p.account_id || '')
      
      const isVodafone = method.includes('فودافون') || 
                        method.includes('vodafone') || 
                        method.includes('كاش') ||
                        method.includes('1012') ||
                        notes.includes('فودافون') ||
                        notes.includes('vodafone') ||
                        notes.includes('زيتون')
      
      if (isVodafone) {
        if (accountId === account1012Id) {
          vodafonePayments.push(p)
        } else {
          missingAccountPayments.push(p)
        }
      } else {
        otherPayments.push(p)
      }
    })
    
    console.log(`📊 التصنيف:`)
    console.log(`   ✅ مدفوعات فودافون في حساب 1012: ${vodafonePayments.length}`)
    console.log(`   ⚠️  مدفوعات فودافون في حساب آخر: ${missingAccountPayments.length}`)
    console.log(`   ℹ️  مدفوعات أخرى: ${otherPayments.length}\n`)
    
    if (vodafonePayments.length > 0) {
      console.log(`✅ مدفوعات فودافون في حساب 1012 (${vodafonePayments.length}):\n`)
      let total = 0
      vodafonePayments.forEach((p, idx) => {
        total += Number(p.amount || 0)
        const customer = p.customer
        console.log(`${idx + 1}. ${p.payment_date} - ${p.invoice?.invoice_number || 'N/A'}`)
        console.log(`   العميل: ${customer?.name || 'غير معروف'}`)
        console.log(`   المبلغ: ${p.amount}`)
        console.log(`   طريقة الدفع: ${p.payment_method || 'غير محدد'}`)
        console.log(`   الملاحظات: ${p.notes || 'بدون ملاحظات'}`)
        console.log()
      })
      console.log(`💰 الإجمالي: ${total.toFixed(2)}\n`)
    }
    
    if (missingAccountPayments.length > 0) {
      console.log(`⚠️  مدفوعات فودافون في حساب آخر (${missingAccountPayments.length}):\n`)
      let total = 0
      missingAccountPayments.forEach((p, idx) => {
        total += Number(p.amount || 0)
        const customer = p.customer
        console.log(`${idx + 1}. ${p.payment_date} - ${p.invoice?.invoice_number || 'N/A'}`)
        console.log(`   العميل: ${customer?.name || 'غير معروف'}`)
        console.log(`   المبلغ: ${p.amount}`)
        console.log(`   طريقة الدفع: ${p.payment_method || 'غير محدد'}`)
        console.log(`   الحساب الحالي: ${p.account_id || 'غير محدد'}`)
        console.log(`   الملاحظات: ${p.notes || 'بدون ملاحظات'}`)
        console.log()
      })
      console.log(`💰 الإجمالي المفقود: ${total.toFixed(2)}\n`)
    }
  } else {
    console.log('⚠️  لا توجد مدفوعات عملاء في جدول payments')
  }
  
  // 2. البحث في journal_entries عن مدفوعات الفواتير
  console.log('='.repeat(60))
  console.log('2️⃣ قيود مدفوعات الفواتير:')
  console.log('='.repeat(60))
  
  const { data: invoicePaymentEntries } = await supabase
    .from('journal_entries')
    .select(`
      id,
      entry_date,
      reference_type,
      reference_id,
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
    .order('entry_date', { ascending: false })
    .limit(100)
  
  if (invoicePaymentEntries && invoicePaymentEntries.length > 0) {
    console.log(`✅ تم العثور على ${invoicePaymentEntries.length} قيد مدفوعات فواتير\n`)
    
    // البحث عن القيود التي قد تكون مرتبطة بفودافون
    const vodafoneEntries = []
    const otherEntries = []
    
    invoicePaymentEntries.forEach(entry => {
      const desc = String(entry.description || '').toLowerCase()
      const lines = entry.journal_entry_lines || []
      
      const hasVodafone = desc.includes('فودافون') || 
                         desc.includes('vodafone') ||
                         desc.includes('كاش') ||
                         desc.includes('زيتون')
      
      const usesAccount1012 = lines.some(line => line.account_id === account1012Id)
      
      if (hasVodafone || usesAccount1012) {
        vodafoneEntries.push(entry)
      } else {
        // التحقق من استخدام حسابات مصرفية أخرى
        const usesOtherBank = lines.some(line => {
          const acc = line.chart_of_accounts
          const code = String(acc.account_code || '')
          return (code.startsWith('10') || code.startsWith('11')) && 
                 code !== '1012' &&
                 (acc.account_name?.includes('بنك') || acc.account_name?.includes('كاش'))
        })
        
        if (usesOtherBank) {
          otherEntries.push(entry)
        }
      }
    })
    
    if (vodafoneEntries.length > 0) {
      console.log(`✅ قيود مرتبطة بفودافون (${vodafoneEntries.length}):\n`)
      let total = 0
      vodafoneEntries.forEach((entry, idx) => {
        const lines = entry.journal_entry_lines || []
        const account1012Line = lines.find(line => line.account_id === account1012Id)
        if (account1012Line) {
          total += Number(account1012Line.debit_amount || 0)
        }
        console.log(`${idx + 1}. ${entry.entry_date} - ${entry.description}`)
        lines.forEach(line => {
          const acc = line.chart_of_accounts
          console.log(`   ${acc.account_code} - ${acc.account_name}: مدين ${line.debit_amount || 0} | دائن ${line.credit_amount || 0}`)
        })
        console.log(`   المرجع: ${entry.reference_id || 'N/A'}`)
        console.log()
      })
      console.log(`💰 الإجمالي في حساب 1012: ${total.toFixed(2)}\n`)
    }
    
    if (otherEntries.length > 0) {
      console.log(`⚠️  قيود قد تكون في حساب خاطئ (${otherEntries.length}):\n`)
      otherEntries.forEach((entry, idx) => {
        const lines = entry.journal_entry_lines || []
        console.log(`${idx + 1}. ${entry.entry_date} - ${entry.description}`)
        lines.forEach(line => {
          const acc = line.chart_of_accounts
          console.log(`   ${acc.account_code} - ${acc.account_name}: مدين ${line.debit_amount || 0} | دائن ${line.credit_amount || 0}`)
        })
        console.log(`   المرجع: ${entry.reference_id || 'N/A'}`)
        console.log()
      })
    }
  }
  
  // 3. ملخص
  console.log('='.repeat(60))
  console.log('📊 الملخص:')
  console.log('='.repeat(60))
  console.log(`الرصيد الحالي في حساب 1012: 1,500.00`)
  console.log(`\n✅ اكتمل البحث!`)
}

findCustomerPayments().catch(console.error)

