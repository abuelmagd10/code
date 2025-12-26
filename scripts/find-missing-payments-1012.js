// البحث عن المدفوعات المفقودة لحساب 1012
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = 'https://hfvsbsizokxontflgdyn.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function findMissingPayments() {
  console.log('🔍 البحث عن المدفوعات المفقودة لحساب 1012...\n')
  
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
  const accountId = '0baff307-e007-490a-a3ec-a96974ad0bf1' // حساب 1012
  
  console.log(`✅ الشركة: ${company.name}\n`)
  
  // 1. البحث في جدول payments
  console.log('='.repeat(60))
  console.log('1️⃣ البحث في جدول payments:')
  console.log('='.repeat(60))
  
  const { data: allPayments } = await supabase
    .from('payments')
    .select('*')
    .eq('company_id', companyId)
    .order('payment_date', { ascending: false })
  
  if (allPayments && allPayments.length > 0) {
    console.log(`✅ تم العثور على ${allPayments.length} دفعة إجمالية\n`)
    
    // البحث عن المدفوعات التي قد تكون مرتبطة بحساب 1012
    const relevantPayments = allPayments.filter(p => {
      const method = String(p.payment_method || '').toLowerCase()
      const notes = String(p.notes || '').toLowerCase()
      return method.includes('فودافون') || 
             method.includes('vodafone') || 
             method.includes('1012') ||
             notes.includes('فودافون') ||
             notes.includes('vodafone') ||
             notes.includes('1012')
    })
    
    if (relevantPayments.length > 0) {
      console.log(`✅ تم العثور على ${relevantPayments.length} دفعة مرتبطة:\n`)
      relevantPayments.forEach((p, idx) => {
        console.log(`${idx + 1}. ${p.payment_date} - ${p.payment_method}`)
        console.log(`   المبلغ: ${p.amount}`)
        console.log(`   المرجع: ${p.reference_type} - ${p.reference_id || 'N/A'}`)
        console.log(`   الحساب: ${p.account_id || 'غير محدد'}`)
        console.log(`   الملاحظات: ${p.notes || 'بدون ملاحظات'}`)
        console.log()
      })
    } else {
      console.log('⚠️  لا توجد مدفوعات مرتبطة مباشرة')
    }
  }
  
  // 2. البحث في journal_entries عن مدفوعات قد تكون استخدمت حساب آخر
  console.log('='.repeat(60))
  console.log('2️⃣ البحث في journal_entries عن مدفوعات:')
  console.log('='.repeat(60))
  
  const { data: paymentJournals } = await supabase
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
    .in('reference_type', ['payment', 'invoice_payment', 'bill_payment', 'customer_payment', 'vendor_payment'])
    .order('entry_date', { ascending: false })
    .limit(50)
  
  if (paymentJournals && paymentJournals.length > 0) {
    console.log(`✅ تم العثور على ${paymentJournals.length} قيد مدفوعات\n`)
    
    // البحث عن القيود التي قد تكون استخدمت حساب آخر بدلاً من 1012
    const suspiciousPayments = paymentJournals.filter(entry => {
      const lines = entry.journal_entry_lines || []
      // البحث عن قيود تستخدم حسابات مصرفية أخرى
      return lines.some(line => {
        const acc = line.chart_of_accounts
        if (!acc) return false
        const code = String(acc.account_code || '')
        const name = String(acc.account_name || '').toLowerCase()
        // حسابات مصرفية أخرى (1010, 1011, 1120, إلخ)
        return (code.startsWith('10') || code.startsWith('11')) && 
               code !== '1012' &&
               (name.includes('بنك') || name.includes('كاش') || name.includes('نقد'))
      })
    })
    
    if (suspiciousPayments.length > 0) {
      console.log(`⚠️  تم العثور على ${suspiciousPayments.length} قيد قد يكون مرتبطاً:\n`)
      suspiciousPayments.forEach((entry, idx) => {
        console.log(`${idx + 1}. ${entry.entry_date} - ${entry.reference_type}`)
        console.log(`   الوصف: ${entry.description || 'بدون وصف'}`)
        const lines = entry.journal_entry_lines || []
        lines.forEach(line => {
          const acc = line.chart_of_accounts
          if (acc) {
            console.log(`   ${acc.account_code} - ${acc.account_name}: مدين ${line.debit_amount || 0} | دائن ${line.credit_amount || 0}`)
          }
        })
        console.log(`   المرجع: ${entry.reference_id || 'N/A'}`)
        console.log()
      })
    }
  }
  
  // 3. البحث في invoices عن مدفوعات
  console.log('='.repeat(60))
  console.log('3️⃣ البحث في invoices عن مدفوعات:')
  console.log('='.repeat(60))
  
  const { data: paidInvoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, invoice_date, total_amount, paid_amount, payment_method, notes')
    .eq('company_id', companyId)
    .gt('paid_amount', 0)
    .order('invoice_date', { ascending: false })
    .limit(50)
  
  if (paidInvoices && paidInvoices.length > 0) {
    console.log(`✅ تم العثور على ${paidInvoices.length} فاتورة مدفوعة\n`)
    
    // البحث عن الفواتير التي قد تكون استخدمت فودافون كاش
    const vodafoneInvoices = paidInvoices.filter(inv => {
      const method = String(inv.payment_method || '').toLowerCase()
      const notes = String(inv.notes || '').toLowerCase()
      return method.includes('فودافون') || 
             method.includes('vodafone') || 
             method.includes('1012') ||
             notes.includes('فودافون') ||
             notes.includes('vodafone')
    })
    
    if (vodafoneInvoices.length > 0) {
      console.log(`✅ تم العثور على ${vodafoneInvoices.length} فاتورة قد تكون مرتبطة:\n`)
      vodafoneInvoices.forEach((inv, idx) => {
        console.log(`${idx + 1}. ${inv.invoice_number} - ${inv.invoice_date}`)
        console.log(`   الإجمالي: ${inv.total_amount} | المدفوع: ${inv.paid_amount}`)
        console.log(`   طريقة الدفع: ${inv.payment_method || 'غير محدد'}`)
        console.log(`   الملاحظات: ${inv.notes || 'بدون ملاحظات'}`)
        console.log()
      })
    }
  }
  
  // 4. حساب الرصيد المتوقع من جميع المدفوعات
  console.log('='.repeat(60))
  console.log('4️⃣ حساب الرصيد المتوقع:')
  console.log('='.repeat(60))
  
  // جمع جميع المدفوعات التي قد تكون مرتبطة
  let expectedBalance = 0
  const allRelatedPayments = []
  
  // البحث عن المدفوعات المرتبطة
  const relevantPayments = allPayments ? allPayments.filter(p => {
    const method = String(p.payment_method || '').toLowerCase()
    const notes = String(p.notes || '').toLowerCase()
    return method.includes('فودافون') || 
           method.includes('vodafone') || 
           method.includes('1012') ||
           notes.includes('فودافون') ||
           notes.includes('vodafone') ||
           notes.includes('1012')
  }) : []
  
  if (relevantPayments && relevantPayments.length > 0) {
    relevantPayments.forEach(p => {
      expectedBalance += Number(p.amount || 0)
      allRelatedPayments.push({ type: 'payment', date: p.payment_date, amount: p.amount })
    })
  }
  
  if (vodafoneInvoices && vodafoneInvoices.length > 0) {
    vodafoneInvoices.forEach(inv => {
      expectedBalance += Number(inv.paid_amount || 0)
      allRelatedPayments.push({ type: 'invoice', date: inv.invoice_date, amount: inv.paid_amount })
    })
  }
  
  console.log(`الرصيد المتوقع من المدفوعات: ${expectedBalance.toFixed(2)}`)
  console.log(`الرصيد الحالي في الحساب: 1500.00`)
  console.log(`الفرق: ${(expectedBalance - 1500).toFixed(2)}`)
  
  if (allRelatedPayments.length > 0) {
    console.log(`\nإجمالي المدفوعات المرتبطة: ${allRelatedPayments.length}`)
  }
  
  console.log('\n✅ اكتمل البحث!')
}

findMissingPayments().catch(console.error)

