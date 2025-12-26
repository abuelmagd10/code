// إنشاء حركات المخزون المفقودة للمرتجعات
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = 'https://hfvsbsizokxontflgdyn.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function createMissingReturnTransactions() {
  console.log('🔧 إنشاء حركات المخزون المفقودة للمرتجعات...\n')
  
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
  console.log(`✅ الشركة: ${company.name} (${companyId})\n`)
  
  let createdCount = 0
  
  // =============================================
  // 1. مرتجعات المبيعات
  // =============================================
  console.log('1️⃣ معالجة مرتجعات المبيعات...\n')
  
  // جلب جميع مرتجعات المبيعات
  const { data: salesReturns } = await supabase
    .from('sales_returns')
    .select('id, invoice_id, return_number, return_date, journal_entry_id, warehouse_id, branch_id, cost_center_id')
    .eq('company_id', companyId)
    .order('return_date', { ascending: false })
  
  if (!salesReturns || salesReturns.length === 0) {
    console.log('   ⚠️  لا توجد مرتجعات مبيعات')
  } else {
    console.log(`   ✅ تم العثور على ${salesReturns.length} مرتجع مبيعات\n`)
    
    for (const sr of salesReturns) {
      console.log(`   📦 معالجة: ${sr.return_number} (${sr.return_date})`)
      
      // التحقق من وجود حركات مخزون
      const { data: existingTx } = await supabase
        .from('inventory_transactions')
        .select('id')
        .eq('company_id', companyId)
        .eq('transaction_type', 'sale_return')
        .eq('reference_id', sr.invoice_id || sr.id)
        .limit(1)
      
      if (existingTx && existingTx.length > 0) {
        console.log(`      ✅ حركات المخزون موجودة بالفعل`)
        continue
      }
      
      // جلب بنود المرتجع
      const { data: returnItems } = await supabase
        .from('sales_return_items')
        .select('product_id, quantity')
        .eq('sales_return_id', sr.id)
      
      if (!returnItems || returnItems.length === 0) {
        console.log(`      ⚠️  لا توجد بنود للمرتجع`)
        continue
      }
      
      // إنشاء حركات المخزون
      const invTransactions = returnItems
        .filter(item => item.product_id)
        .map(item => ({
          company_id: companyId,
          product_id: item.product_id,
          transaction_type: 'sale_return',
          quantity_change: Number(item.quantity || 0), // موجب لأن البضاعة تعود للمخزون
          reference_id: sr.invoice_id || sr.id,
          journal_entry_id: sr.journal_entry_id || null,
          notes: `مرتجع مبيعات ${sr.return_number}`,
          warehouse_id: sr.warehouse_id || null,
          branch_id: sr.branch_id || null,
          cost_center_id: sr.cost_center_id || null
        }))
      
      if (invTransactions.length > 0) {
        const { error } = await supabase
          .from('inventory_transactions')
          .insert(invTransactions)
        
        if (error) {
          console.log(`      ❌ خطأ: ${error.message}`)
        } else {
          console.log(`      ✅ تم إنشاء ${invTransactions.length} حركة مخزون`)
          createdCount += invTransactions.length
        }
      }
    }
  }
  
  // =============================================
  // 2. مرتجعات المشتريات
  // =============================================
  console.log('\n2️⃣ معالجة مرتجعات المشتريات...\n')
  
  // جلب جميع مرتجعات المشتريات (vendor_credits)
  const { data: vendorCredits } = await supabase
    .from('vendor_credits')
    .select('id, bill_id, credit_number, credit_date, journal_entry_id, warehouse_id, branch_id, cost_center_id')
    .eq('company_id', companyId)
    .order('credit_date', { ascending: false })
  
  if (!vendorCredits || vendorCredits.length === 0) {
    console.log('   ⚠️  لا توجد مرتجعات مشتريات')
  } else {
    console.log(`   ✅ تم العثور على ${vendorCredits.length} مرتجع مشتريات\n`)
    
    for (const vc of vendorCredits) {
      console.log(`   📦 معالجة: ${vc.credit_number} (${vc.credit_date})`)
      
      // التحقق من وجود حركات مخزون
      const { data: existingTx } = await supabase
        .from('inventory_transactions')
        .select('id')
        .eq('company_id', companyId)
        .eq('transaction_type', 'purchase_return')
        .eq('reference_id', vc.bill_id || vc.id)
        .limit(1)
      
      if (existingTx && existingTx.length > 0) {
        console.log(`      ✅ حركات المخزون موجودة بالفعل`)
        continue
      }
      
      // جلب بنود المرتجع
      const { data: creditItems } = await supabase
        .from('vendor_credit_items')
        .select('product_id, quantity')
        .eq('vendor_credit_id', vc.id)
      
      if (!creditItems || creditItems.length === 0) {
        console.log(`      ⚠️  لا توجد بنود للمرتجع`)
        continue
      }
      
      // إنشاء حركات المخزون
      const invTransactions = creditItems
        .filter(item => item.product_id)
        .map(item => ({
          company_id: companyId,
          product_id: item.product_id,
          transaction_type: 'purchase_return',
          quantity_change: -Number(item.quantity || 0), // سالب لأن البضاعة تخرج من المخزون
          reference_id: vc.bill_id || vc.id,
          journal_entry_id: vc.journal_entry_id || null,
          notes: `مرتجع مشتريات ${vc.credit_number}`,
          warehouse_id: vc.warehouse_id || null,
          branch_id: vc.branch_id || null,
          cost_center_id: vc.cost_center_id || null
        }))
      
      if (invTransactions.length > 0) {
        const { error } = await supabase
          .from('inventory_transactions')
          .insert(invTransactions)
        
        if (error) {
          console.log(`      ❌ خطأ: ${error.message}`)
        } else {
          console.log(`      ✅ تم إنشاء ${invTransactions.length} حركة مخزون`)
          createdCount += invTransactions.length
        }
      }
    }
  }
  
  // =============================================
  // 3. التحقق من المرتجعات في invoice_items و bill_items
  // =============================================
  console.log('\n3️⃣ التحقق من المرتجعات في invoice_items و bill_items...\n')
  
  // جلب الفواتير التي لها returned_quantity
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, company_id, warehouse_id, branch_id, cost_center_id')
    .eq('company_id', companyId)
    .gt('returned_amount', 0)
  
  if (invoices && invoices.length > 0) {
    console.log(`   ✅ تم العثور على ${invoices.length} فاتورة بها مرتجعات\n`)
    
    for (const inv of invoices) {
      // جلب بنود الفاتورة
      const { data: invoiceItems } = await supabase
        .from('invoice_items')
        .select('id, product_id, returned_quantity')
        .eq('invoice_id', inv.id)
        .gt('returned_quantity', 0)
      
      if (!invoiceItems || invoiceItems.length === 0) continue
      
      for (const item of invoiceItems) {
        if (!item.product_id) continue
        
        // التحقق من وجود حركة مخزون
        const { data: existingTx } = await supabase
          .from('inventory_transactions')
          .select('id')
          .eq('company_id', companyId)
          .eq('product_id', item.product_id)
          .eq('transaction_type', 'sale_return')
          .eq('reference_id', inv.id)
          .limit(1)
        
        if (existingTx && existingTx.length > 0) continue
        
        // إنشاء حركة مخزون
        const { error } = await supabase
          .from('inventory_transactions')
          .insert({
            company_id: companyId,
            product_id: item.product_id,
            transaction_type: 'sale_return',
            quantity_change: Number(item.returned_quantity || 0),
            reference_id: inv.id,
            notes: `مرتجع من الفاتورة ${inv.invoice_number}`,
            warehouse_id: inv.warehouse_id || null,
            branch_id: inv.branch_id || null,
            cost_center_id: inv.cost_center_id || null
          })
        
        if (!error) {
          console.log(`   ✅ تم إنشاء حركة مخزون للمنتج ${item.product_id} من الفاتورة ${inv.invoice_number}`)
          createdCount++
        }
      }
    }
  }
  
  // جلب فواتير الشراء التي لها returned_quantity
  const { data: bills } = await supabase
    .from('bills')
    .select('id, bill_number, company_id, warehouse_id, branch_id, cost_center_id')
    .eq('company_id', companyId)
    .gt('returned_amount', 0)
  
  if (bills && bills.length > 0) {
    console.log(`\n   ✅ تم العثور على ${bills.length} فاتورة شراء بها مرتجعات\n`)
    
    for (const bill of bills) {
      // جلب بنود الفاتورة
      const { data: billItems } = await supabase
        .from('bill_items')
        .select('id, product_id, returned_quantity')
        .eq('bill_id', bill.id)
        .gt('returned_quantity', 0)
      
      if (!billItems || billItems.length === 0) continue
      
      for (const item of billItems) {
        if (!item.product_id) continue
        
        // التحقق من وجود حركة مخزون
        const { data: existingTx } = await supabase
          .from('inventory_transactions')
          .select('id')
          .eq('company_id', companyId)
          .eq('product_id', item.product_id)
          .eq('transaction_type', 'purchase_return')
          .eq('reference_id', bill.id)
          .limit(1)
        
        if (existingTx && existingTx.length > 0) continue
        
        // إنشاء حركة مخزون
        const { error } = await supabase
          .from('inventory_transactions')
          .insert({
            company_id: companyId,
            product_id: item.product_id,
            transaction_type: 'purchase_return',
            quantity_change: -Number(item.returned_quantity || 0), // سالب
            reference_id: bill.id,
            notes: `مرتجع من فاتورة الشراء ${bill.bill_number}`,
            warehouse_id: bill.warehouse_id || null,
            branch_id: bill.branch_id || null,
            cost_center_id: bill.cost_center_id || null
          })
        
        if (!error) {
          console.log(`   ✅ تم إنشاء حركة مخزون للمنتج ${item.product_id} من فاتورة الشراء ${bill.bill_number}`)
          createdCount++
        }
      }
    }
  }
  
  console.log('\n' + '='.repeat(60))
  console.log('📊 ملخص:')
  console.log('='.repeat(60))
  console.log(`✅ تم إنشاء ${createdCount} حركة مخزون للمرتجعات`)
  console.log('\n✅ اكتمل!')
}

createMissingReturnTransactions().catch(console.error)

