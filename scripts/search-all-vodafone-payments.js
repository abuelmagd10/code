// البحث الشامل عن جميع المدفوعات المرتبطة بفودافون كاش
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = 'https://hfvsbsizokxontflgdyn.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function searchAllVodafonePayments() {
  console.log('🔍 البحث الشامل عن جميع المدفوعات المرتبطة بفودافون كاش...\n')
  
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
  
  // 1. البحث في جميع journal_entries عن كلمات مفتاحية
  console.log('='.repeat(60))
  console.log('1️⃣ البحث في journal_entries:')
  console.log('='.repeat(60))
  
  const { data: allEntries } = await supabase
    .from('journal_entries')
    .select('id, entry_date, reference_type, reference_id, description')
    .eq('company_id', companyId)
    .or('description.ilike.%فودافون%,description.ilike.%vodafone%,description.ilike.%زيتون%,description.ilike.%كاش%')
    .order('entry_date', { ascending: false })
    .limit(100)
  
  if (allEntries && allEntries.length > 0) {
    console.log(`✅ تم العثور على ${allEntries.length} قيد يحتوي على كلمات مفتاحية:\n`)
    
    for (const entry of allEntries) {
      // جلب سطور القيد
      const { data: lines } = await supabase
        .from('journal_entry_lines')
        .select(`
          account_id,
          debit_amount,
          credit_amount,
          description,
          chart_of_accounts!inner(
            account_code,
            account_name
          )
        `)
        .eq('journal_entry_id', entry.id)
      
      console.log(`${entry.entry_date} - ${entry.reference_type}`)
      console.log(`   الوصف: ${entry.description}`)
      if (lines && lines.length > 0) {
        lines.forEach(line => {
          const acc = line.chart_of_accounts
          console.log(`   ${acc.account_code} - ${acc.account_name}: مدين ${line.debit_amount || 0} | دائن ${line.credit_amount || 0}`)
        })
      }
      console.log(`   المرجع: ${entry.reference_id || 'N/A'}`)
      console.log()
    }
  } else {
    console.log('⚠️  لا توجد قيود تحتوي على كلمات مفتاحية')
  }
  
  // 2. البحث في جميع journal_entry_lines المرتبطة بحساب 1012
  console.log('='.repeat(60))
  console.log('2️⃣ جميع القيود المرتبطة بحساب 1012:')
  console.log('='.repeat(60))
  
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
  
  if (account1012Lines && account1012Lines.length > 0) {
    console.log(`✅ تم العثور على ${account1012Lines.length} قيد:\n`)
    
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
    
    console.log(`\n📊 الإجمالي:`)
    console.log(`   إجمالي المدين: ${totalDebit.toFixed(2)}`)
    console.log(`   إجمالي الدائن: ${totalCredit.toFixed(2)}`)
    console.log(`   الرصيد: ${(totalDebit - totalCredit).toFixed(2)}`)
  }
  
  // 3. البحث في invoices عن فواتير مدفوعة بفودافون
  console.log('\n' + '='.repeat(60))
  console.log('3️⃣ البحث في invoices:')
  console.log('='.repeat(60))
  
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, invoice_date, total_amount, paid_amount, payment_method, notes')
    .eq('company_id', companyId)
    .gt('paid_amount', 0)
    .or('payment_method.ilike.%فودافون%,payment_method.ilike.%vodafone%,notes.ilike.%فودافون%,notes.ilike.%vodafone%')
    .order('invoice_date', { ascending: false })
    .limit(50)
  
  if (invoices && invoices.length > 0) {
    console.log(`✅ تم العثور على ${invoices.length} فاتورة:\n`)
    
    let totalPaid = 0
    
    invoices.forEach((inv, idx) => {
      totalPaid += Number(inv.paid_amount || 0)
      console.log(`${idx + 1}. ${inv.invoice_number} - ${inv.invoice_date}`)
      console.log(`   الإجمالي: ${inv.total_amount} | المدفوع: ${inv.paid_amount}`)
      console.log(`   طريقة الدفع: ${inv.payment_method || 'غير محدد'}`)
      console.log(`   الملاحظات: ${inv.notes || 'بدون ملاحظات'}`)
      console.log()
    })
    
    console.log(`💰 إجمالي المدفوعات من الفواتير: ${totalPaid.toFixed(2)}`)
  } else {
    console.log('⚠️  لا توجد فواتير مرتبطة')
  }
  
  // 4. البحث في payments
  console.log('\n' + '='.repeat(60))
  console.log('4️⃣ البحث في payments:')
  console.log('='.repeat(60))
  
  const { data: payments } = await supabase
    .from('payments')
    .select('*')
    .eq('company_id', companyId)
    .or('payment_method.ilike.%فودافون%,payment_method.ilike.%vodafone%,notes.ilike.%فودافون%,notes.ilike.%vodafone%')
    .order('payment_date', { ascending: false })
    .limit(50)
  
  if (payments && payments.length > 0) {
    console.log(`✅ تم العثور على ${payments.length} دفعة:\n`)
    
    let totalAmount = 0
    
    payments.forEach((p, idx) => {
      totalAmount += Number(p.amount || 0)
      console.log(`${idx + 1}. ${p.payment_date} - ${p.payment_method}`)
      console.log(`   المبلغ: ${p.amount}`)
      console.log(`   الحساب: ${p.account_id || 'غير محدد'}`)
      console.log(`   المرجع: ${p.reference_type} - ${p.reference_id || 'N/A'}`)
      console.log(`   الملاحظات: ${p.notes || 'بدون ملاحظات'}`)
      console.log()
    })
    
    console.log(`💰 إجمالي المدفوعات: ${totalAmount.toFixed(2)}`)
  } else {
    console.log('⚠️  لا توجد مدفوعات مرتبطة')
  }
  
  console.log('\n✅ اكتمل البحث!')
}

searchAllVodafonePayments().catch(console.error)

