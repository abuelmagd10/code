// التحقق من حركات المرتجعات في المخزون
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = 'https://hfvsbsizokxontflgdyn.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function checkInventoryReturns() {
  console.log('🔍 التحقق من حركات المرتجعات في المخزون...\n')
  
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
  
  // جلب جميع حركات المرتجعات
  const { data: saleReturns, error: saleReturnsError } = await supabase
    .from('inventory_transactions')
    .select('id, product_id, quantity_change, transaction_type, reference_id, created_at, notes')
    .eq('company_id', companyId)
    .in('transaction_type', ['sale_return', 'sales_return'])
    .order('created_at', { ascending: false })
  
  const { data: purchaseReturns, error: purchaseReturnsError } = await supabase
    .from('inventory_transactions')
    .select('id, product_id, quantity_change, transaction_type, reference_id, created_at, notes')
    .eq('company_id', companyId)
    .in('transaction_type', ['purchase_return', 'purchase_reversal'])
    .order('created_at', { ascending: false })
  
  if (saleReturnsError) {
    console.error('❌ خطأ في جلب مرتجعات المبيعات:', saleReturnsError)
  }
  
  if (purchaseReturnsError) {
    console.error('❌ خطأ في جلب مرتجعات المشتريات:', purchaseReturnsError)
  }
  
  console.log('='.repeat(60))
  console.log('📊 مرتجعات المبيعات (sale_return):')
  console.log('='.repeat(60))
  
  if (!saleReturns || saleReturns.length === 0) {
    console.log('⚠️  لا توجد حركات مرتجعات مبيعات!')
  } else {
    console.log(`✅ تم العثور على ${saleReturns.length} حركة مرتجع مبيعات:\n`)
    
    // تجميع حسب المنتج
    const byProduct = {}
    
    saleReturns.forEach(tx => {
      const pid = String(tx.product_id || '')
      if (!byProduct[pid]) {
        byProduct[pid] = { total: 0, transactions: [] }
      }
      byProduct[pid].total += Number(tx.quantity_change || 0)
      byProduct[pid].transactions.push(tx)
    })
    
    // جلب أسماء المنتجات
    const productIds = Object.keys(byProduct)
    const { data: products } = await supabase
      .from('products')
      .select('id, name, code')
      .in('id', productIds)
    
    const productMap = new Map((products || []).map((p) => [p.id, p]))
    
    Object.entries(byProduct).forEach(([pid, data]) => {
      const product = productMap.get(pid)
      console.log(`\n${product?.code || pid} - ${product?.name || 'غير معروف'}:`)
      console.log(`  إجمالي المرتجعات: ${data.total}`)
      console.log(`  عدد الحركات: ${data.transactions.length}`)
      data.transactions.forEach(tx => {
        console.log(`    - ${tx.quantity_change} (${tx.created_at?.slice(0, 10)}) - ${tx.notes || 'بدون ملاحظات'}`)
      })
    })
  }
  
  console.log('\n' + '='.repeat(60))
  console.log('📊 مرتجعات المشتريات (purchase_return):')
  console.log('='.repeat(60))
  
  if (!purchaseReturns || purchaseReturns.length === 0) {
    console.log('⚠️  لا توجد حركات مرتجعات مشتريات!')
  } else {
    console.log(`✅ تم العثور على ${purchaseReturns.length} حركة مرتجع مشتريات:\n`)
    
    // تجميع حسب المنتج
    const byProduct2 = {}
    
    purchaseReturns.forEach(tx => {
      const pid = String(tx.product_id || '')
      if (!byProduct2[pid]) {
        byProduct2[pid] = { total: 0, transactions: [] }
      }
      byProduct2[pid].total += Math.abs(Number(tx.quantity_change || 0))
      byProduct2[pid].transactions.push(tx)
    })
    
    // جلب أسماء المنتجات
    const productIds2 = Object.keys(byProduct2)
    const { data: products2 } = await supabase
      .from('products')
      .select('id, name, code')
      .in('id', productIds2)
    
    const productMap2 = new Map((products2 || []).map((p) => [p.id, p]))
    
    Object.entries(byProduct2).forEach(([pid, data]) => {
      const product = productMap2.get(pid)
      console.log(`\n${product?.code || pid} - ${product?.name || 'غير معروف'}:`)
      console.log(`  إجمالي المرتجعات: ${data.total}`)
      console.log(`  عدد الحركات: ${data.transactions.length}`)
      data.transactions.forEach(tx => {
        console.log(`    - ${Math.abs(tx.quantity_change)} (${tx.created_at?.slice(0, 10)}) - ${tx.notes || 'بدون ملاحظات'}`)
      })
    })
  }
  
  // التحقق من sales_returns و vendor_credits
  console.log('\n' + '='.repeat(60))
  console.log('📊 سجلات المرتجعات:')
  console.log('='.repeat(60))
  
  const { data: salesReturnsRecords } = await supabase
    .from('sales_returns')
    .select('id, return_number, return_date, total_amount, invoice_id')
    .eq('company_id', companyId)
    .order('return_date', { ascending: false })
    .limit(10)
  
  const { data: vendorCredits } = await supabase
    .from('vendor_credits')
    .select('id, credit_number, credit_date, total_amount, bill_id')
    .eq('company_id', companyId)
    .order('credit_date', { ascending: false })
    .limit(10)
  
  console.log(`\nسجلات مرتجعات المبيعات: ${salesReturnsRecords?.length || 0}`)
  if (salesReturnsRecords && salesReturnsRecords.length > 0) {
    salesReturnsRecords.forEach(sr => {
      console.log(`  - ${sr.return_number} (${sr.return_date}) - ${sr.total_amount}`)
    })
  }
  
  console.log(`\nسجلات مرتجعات المشتريات: ${vendorCredits?.length || 0}`)
  if (vendorCredits && vendorCredits.length > 0) {
    vendorCredits.forEach(vc => {
      console.log(`  - ${vc.credit_number} (${vc.credit_date}) - ${vc.total_amount}`)
    })
  }
  
  console.log('\n✅ اكتمل التحقق!')
}

checkInventoryReturns().catch(console.error)

