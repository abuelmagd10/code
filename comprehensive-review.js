const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://hfvsbsizokxontflgdyn.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4'

const supabase = createClient(supabaseUrl, supabaseKey)

async function comprehensiveReview() {
  try {
    console.log('🔍 مراجعة شاملة لقاعدة البيانات والمشروع\n')
    console.log('=' .repeat(80))

    // 1. فحص جميع الجداول الرئيسية
    console.log('\n📋 1. الجداول الرئيسية في النظام:')
    const mainTables = [
      'companies', 'users', 'customers', 'suppliers', 'products',
      'sales_orders', 'invoices', 'bills', 'purchase_orders',
      'journal_entries', 'journal_entry_lines', 'chart_of_accounts',
      'inventory_transactions', 'sales_returns', 'customer_credits'
    ]

    for (const table of mainTables) {
      try {
        const { count } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true })
        console.log(`  ${table}: ${count || 0} سجل`)
      } catch (err) {
        console.log(`  ${table}: ❌ غير موجود أو خطأ`)
      }
    }

    // 2. فحص العلاقات بين الجداول الرئيسية
    console.log('\n🔗 2. العلاقات بين الجداول:')
    const companyId = '3a663f6b-0689-4952-93c1-6d958c737089'
    
    // علاقة أوامر البيع والفواتير
    const { data: soInvoiceRelation } = await supabase
      .from('sales_orders')
      .select(`
        so_number,
        status,
        total_amount,
        invoices!sales_orders_invoice_id_fkey (
          invoice_number,
          status,
          total_amount
        )
      `)
      .eq('company_id', companyId)
      .limit(3)

    console.log('علاقة أوامر البيع - الفواتير:')
    soInvoiceRelation?.forEach(so => {
      console.log(`  ${so.so_number} (${so.status}) -> ${so.invoices?.invoice_number} (${so.invoices?.status})`)
    })

    // 3. فحص سياسات RLS
    console.log('\n🛡️ 3. سياسات الأمان (RLS):')
    const { data: rlsPolicies } = await supabase
      .from('pg_policies')
      .select('tablename, policyname, cmd, qual')
      .in('tablename', ['sales_orders', 'invoices', 'journal_entries'])

    const policyGroups = {}
    rlsPolicies?.forEach(policy => {
      if (!policyGroups[policy.tablename]) policyGroups[policy.tablename] = []
      policyGroups[policy.tablename].push(policy)
    })

    Object.keys(policyGroups).forEach(table => {
      console.log(`  ${table}: ${policyGroups[table].length} سياسة`)
      policyGroups[table].forEach(p => {
        console.log(`    - ${p.policyname} (${p.cmd})`)
      })
    })

    // 4. فحص Triggers والدوال
    console.log('\n⚙️ 4. Triggers والدوال:')
    const { data: triggers } = await supabase
      .from('information_schema.triggers')
      .select('event_object_table, trigger_name, event_manipulation')
      .in('event_object_table', ['sales_orders', 'invoices', 'journal_entries'])

    const triggerGroups = {}
    triggers?.forEach(trigger => {
      if (!triggerGroups[trigger.event_object_table]) triggerGroups[trigger.event_object_table] = []
      triggerGroups[trigger.event_object_table].push(trigger)
    })

    Object.keys(triggerGroups).forEach(table => {
      console.log(`  ${table}:`)
      triggerGroups[table].forEach(t => {
        console.log(`    - ${t.trigger_name} (${t.event_manipulation})`)
      })
    })

    // 5. فحص النمط المحاسبي
    console.log('\n💰 5. النمط المحاسبي الحالي:')
    
    // فحص فاتورة INV-0001
    const { data: invoice } = await supabase
      .from('invoices')
      .select('*')
      .eq('company_id', companyId)
      .eq('invoice_number', 'INV-0001')
      .single()

    console.log('فاتورة INV-0001:')
    console.log(`  الحالة: ${invoice?.status}`)
    console.log(`  الإجمالي: ${invoice?.total_amount}`)
    console.log(`  المرتجع: ${invoice?.returned_amount}`)
    console.log(`  حالة المرتجع: ${invoice?.return_status}`)

    // فحص أمر البيع SO-0001
    const { data: salesOrder } = await supabase
      .from('sales_orders')
      .select('*')
      .eq('company_id', companyId)
      .eq('so_number', 'SO-0001')
      .single()

    console.log('\nأمر البيع SO-0001:')
    console.log(`  الحالة: ${salesOrder?.status}`)
    console.log(`  الإجمالي: ${salesOrder?.total_amount}`)
    console.log(`  total: ${salesOrder?.total}`)

    // 6. فحص القيود المحاسبية
    console.log('\n📊 6. القيود المحاسبية:')
    const { data: journalEntries } = await supabase
      .from('journal_entries')
      .select(`
        reference_type,
        reference_id,
        description,
        journal_entry_lines (
          account_id,
          debit_amount,
          credit_amount
        )
      `)
      .eq('company_id', companyId)
      .eq('reference_id', invoice?.id)

    console.log(`عدد القيود للفاتورة: ${journalEntries?.length || 0}`)
    journalEntries?.forEach(entry => {
      console.log(`  ${entry.reference_type}: ${entry.description}`)
      const totalDebit = entry.journal_entry_lines?.reduce((sum, line) => sum + Number(line.debit_amount), 0) || 0
      const totalCredit = entry.journal_entry_lines?.reduce((sum, line) => sum + Number(line.credit_amount), 0) || 0
      console.log(`    مدين: ${totalDebit}, دائن: ${totalCredit}, متوازن: ${totalDebit === totalCredit ? '✅' : '❌'}`)
    })

    // 7. فحص حركات المخزون
    console.log('\n📦 7. حركات المخزون:')
    const { data: inventoryTx } = await supabase
      .from('inventory_transactions')
      .select('*')
      .eq('reference_id', invoice?.id)

    console.log(`عدد حركات المخزون: ${inventoryTx?.length || 0}`)
    inventoryTx?.forEach(tx => {
      console.log(`  ${tx.transaction_type}: ${tx.quantity_change}`)
    })

    // 8. فحص ذمم العملاء
    console.log('\n👥 8. ذمم العملاء:')
    const { data: customerBalance } = await supabase
      .from('customers')
      .select('name, balance')
      .eq('company_id', companyId)
      .eq('id', invoice?.customer_id)
      .single()

    console.log(`رصيد العميل: ${customerBalance?.balance || 0}`)

    // 9. تحليل التوافق
    console.log('\n🎯 9. تحليل التوافق:')
    const issues = []
    
    if (invoice?.total_amount !== salesOrder?.total_amount) {
      issues.push(`❌ عدم تطابق الإجماليات: فاتورة ${invoice?.total_amount} ≠ أمر ${salesOrder?.total_amount}`)
    }
    
    if (invoice?.status === 'sent' && salesOrder?.status !== 'returned') {
      issues.push(`⚠️ عدم تطابق الحالات: فاتورة ${invoice?.status} vs أمر ${salesOrder?.status}`)
    }

    if (issues.length === 0) {
      console.log('✅ النظام متوافق ومتسق')
    } else {
      console.log('المشاكل المكتشفة:')
      issues.forEach(issue => console.log(`  ${issue}`))
    }

    // 10. توصيات التحسين
    console.log('\n💡 10. توصيات التحسين:')
    console.log('  - تطبيق triggers للمزامنة التلقائية')
    console.log('  - إضافة constraints للتحقق من التوازن')
    console.log('  - تحسين cache الواجهة الأمامية')
    console.log('  - إضافة audit trail شامل')

  } catch (error) {
    console.error('❌ خطأ في المراجعة:', error.message)
  }
}

comprehensiveReview()