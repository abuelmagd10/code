// البحث الشامل عن جميع مدفوعات العملاء
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = 'https://hfvsbsizokxontflgdyn.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function findAllCustomerPayments() {
  console.log('🔍 البحث الشامل عن جميع مدفوعات العملاء...\n')
  
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
  
  // 1. جلب جميع المدفوعات
  console.log('='.repeat(60))
  console.log('1️⃣ جميع المدفوعات في جدول payments:')
  console.log('='.repeat(60))
  
  const { data: allPayments } = await supabase
    .from('payments')
    .select('*')
    .eq('company_id', companyId)
    .order('payment_date', { ascending: false })
  
  console.log(`✅ إجمالي المدفوعات: ${allPayments?.length || 0}\n`)
  
  if (allPayments && allPayments.length > 0) {
    // تصنيف المدفوعات
    const customerPayments = allPayments.filter(p => p.reference_type === 'invoice' && p.invoice_id)
    const supplierPayments = allPayments.filter(p => p.reference_type === 'bill' && p.bill_id)
    const otherPayments = allPayments.filter(p => !customerPayments.includes(p) && !supplierPayments.includes(p))
    
    console.log(`📊 التصنيف:`)
    console.log(`   مدفوعات العملاء: ${customerPayments.length}`)
    console.log(`   مدفوعات الموردين: ${supplierPayments.length}`)
    console.log(`   مدفوعات أخرى: ${otherPayments.length}\n`)
    
    if (customerPayments.length > 0) {
      console.log(`\n💳 مدفوعات العملاء (${customerPayments.length}):\n`)
      
      // البحث عن مدفوعات فودافون
      const vodafonePayments = customerPayments.filter(p => {
        const method = String(p.payment_method || '').toLowerCase()
        const notes = String(p.notes || '').toLowerCase()
        return method.includes('فودافون') || 
               method.includes('vodafone') || 
               method.includes('كاش') ||
               method.includes('1012') ||
               notes.includes('فودافون') ||
               notes.includes('vodafone') ||
               notes.includes('زيتون')
      })
      
      if (vodafonePayments.length > 0) {
        console.log(`✅ مدفوعات فودافون (${vodafonePayments.length}):\n`)
        
        // جلب معلومات الفواتير
        const invoiceIds = [...new Set(vodafonePayments.map(p => p.invoice_id).filter(Boolean))]
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
        
        let total = 0
        const inAccount1012 = []
        const notInAccount1012 = []
        
        vodafonePayments.forEach((p, idx) => {
          total += Number(p.amount || 0)
          const inv = invoiceMap.get(p.invoice_id)
          const customer = inv ? customerMap.get(inv.customer_id) : null
          
          if (p.account_id === account1012Id) {
            inAccount1012.push(p)
          } else {
            notInAccount1012.push(p)
          }
          
          console.log(`${idx + 1}. ${p.payment_date} - ${inv?.invoice_number || 'N/A'}`)
          console.log(`   العميل: ${customer?.name || 'غير معروف'}`)
          console.log(`   المبلغ: ${p.amount}`)
          console.log(`   طريقة الدفع: ${p.payment_method || 'غير محدد'}`)
          console.log(`   الحساب: ${p.account_id === account1012Id ? '✅ 1012' : `❌ ${p.account_id || 'غير محدد'}`}`)
          console.log(`   الملاحظات: ${p.notes || 'بدون ملاحظات'}`)
          console.log()
        })
        
        console.log(`💰 الإجمالي: ${total.toFixed(2)}`)
        console.log(`✅ في حساب 1012: ${inAccount1012.length}`)
        console.log(`❌ في حساب آخر: ${notInAccount1012.length}`)
        
        if (notInAccount1012.length > 0) {
          const missingTotal = notInAccount1012.reduce((sum, p) => sum + Number(p.amount || 0), 0)
          console.log(`\n⚠️  المبلغ المفقود من حساب 1012: ${missingTotal.toFixed(2)}`)
        }
      } else {
        console.log('⚠️  لا توجد مدفوعات فودافون في جدول payments')
      }
    }
  }
  
  // 2. البحث في journal_entries عن مدفوعات الفواتير
  console.log('\n' + '='.repeat(60))
  console.log('2️⃣ قيود مدفوعات الفواتير (invoice_payment):')
  console.log('='.repeat(60))
  
  const { data: invoicePaymentEntries } = await supabase
    .from('journal_entries')
    .select(`
      id,
      entry_date,
      reference_type,
      reference_id,
      description
    `)
    .eq('company_id', companyId)
    .eq('reference_type', 'invoice_payment')
    .order('entry_date', { ascending: false })
    .limit(200)
  
  if (invoicePaymentEntries && invoicePaymentEntries.length > 0) {
    console.log(`✅ تم العثور على ${invoicePaymentEntries.length} قيد\n`)
    
    // جلب سطور القيود
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
    
    // تجميع السطور حسب القيد
    const linesByEntry = new Map()
    if (allLines) {
      allLines.forEach(line => {
        if (!linesByEntry.has(line.journal_entry_id)) {
          linesByEntry.set(line.journal_entry_id, [])
        }
        linesByEntry.get(line.journal_entry_id).push(line)
      })
    }
    
    // البحث عن القيود التي تستخدم حساب 1012
    const account1012Entries = []
    const otherBankEntries = []
    
    invoicePaymentEntries.forEach(entry => {
      const lines = linesByEntry.get(entry.id) || []
      const usesAccount1012 = lines.some(line => line.account_id === account1012Id)
      const usesOtherBank = lines.some(line => {
        const acc = line.chart_of_accounts
        const code = String(acc.account_code || '')
        return (code.startsWith('10') || code.startsWith('11')) && 
               code !== '1012' &&
               (acc.account_name?.includes('بنك') || acc.account_name?.includes('كاش') || acc.account_name?.includes('نقد'))
      })
      
      if (usesAccount1012) {
        account1012Entries.push({ entry, lines })
      } else if (usesOtherBank) {
        otherBankEntries.push({ entry, lines })
      }
    })
    
    if (account1012Entries.length > 0) {
      console.log(`✅ قيود تستخدم حساب 1012 (${account1012Entries.length}):\n`)
      let total = 0
      account1012Entries.forEach(({ entry, lines }, idx) => {
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
    
    if (otherBankEntries.length > 0) {
      console.log(`⚠️  قيود تستخدم حسابات مصرفية أخرى (${otherBankEntries.length}):\n`)
      otherBankEntries.slice(0, 10).forEach(({ entry, lines }, idx) => {
        console.log(`${idx + 1}. ${entry.entry_date} - ${entry.description}`)
        lines.forEach(line => {
          const acc = line.chart_of_accounts
          console.log(`   ${acc.account_code} - ${acc.account_name}: مدين ${line.debit_amount || 0} | دائن ${line.credit_amount || 0}`)
        })
        console.log(`   المرجع: ${entry.reference_id || 'N/A'}`)
        console.log()
      })
      if (otherBankEntries.length > 10) {
        console.log(`... و ${otherBankEntries.length - 10} قيد آخر\n`)
      }
    }
  }
  
  console.log('='.repeat(60))
  console.log('📊 الملخص النهائي:')
  console.log('='.repeat(60))
  console.log(`الرصيد الحالي في حساب 1012: 1,500.00`)
  console.log(`\n✅ اكتمل البحث!`)
}

findAllCustomerPayments().catch(console.error)

