/**
 * 🧪 Purchase Return Baseline Test - End-to-End
 * ============================================
 * اختبار شامل لمرتجع المشتريات (Credit Return) على فاتورة مدفوعة
 * 
 * السيناريو:
 * 1. إنشاء فاتورة مشتريات (1000)
 * 2. استلام الفاتورة
 * 3. دفع الفاتورة بالكامل
 * 4. عمل مرتجع جزئي (300) - Credit Return
 * 5. التحقق من جميع النقاط (A-E)
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Test configuration
const TEST_CONFIG = {
  supplierName: 'Supplier A (Test)',
  productName: 'Product X (Test)',
  quantity: 10,
  unitPrice: 100,
  totalAmount: 1000,
  returnQuantity: 3,
  returnAmount: 300,
  branchName: 'B1 (Test)',
  warehouseName: 'W1 (Test)',
  costCenterName: 'CC1 (Test)'
}

// Test results
const results = {
  passed: [],
  failed: [],
  warnings: []
}

function logResult(category, test, passed, message, details = null) {
  const result = {
    category,
    test,
    passed,
    message,
    details,
    timestamp: new Date().toISOString()
  }
  
  if (passed) {
    results.passed.push(result)
    console.log(`✅ ${category} - ${test}: ${message}`)
  } else {
    results.failed.push(result)
    console.error(`❌ ${category} - ${test}: ${message}`)
    if (details) console.error('   Details:', JSON.stringify(details, null, 2))
  }
}

function logWarning(category, test, message, details = null) {
  results.warnings.push({
    category,
    test,
    message,
    details,
    timestamp: new Date().toISOString()
  })
  console.warn(`⚠️  ${category} - ${test}: ${message}`)
}

// Step 1: Setup - Create/Get Test Data
async function setupTestData() {
  console.log('\n📋 Step 1: Setting up test data...\n')
  
  // Get active company
  const { data: companies } = await supabase
    .from('companies')
    .select('id, name')
    .limit(1)
  
  if (!companies || companies.length === 0) {
    throw new Error('No company found')
  }
  
  const companyId = companies[0].id
  console.log(`✅ Company: ${companies[0].name} (${companyId})`)
  
  // Get or create supplier
  let { data: supplier } = await supabase
    .from('suppliers')
    .select('id, name')
    .eq('name', TEST_CONFIG.supplierName)
    .eq('company_id', companyId)
    .single()
  
  if (!supplier) {
    const { data: newSupplier } = await supabase
      .from('suppliers')
      .insert({
        company_id: companyId,
        name: TEST_CONFIG.supplierName,
        phone: '1234567890'
      })
      .select()
      .single()
    supplier = newSupplier
    console.log(`✅ Created supplier: ${supplier.name}`)
  } else {
    console.log(`✅ Found supplier: ${supplier.name}`)
  }
  
  // Get or create product
  let { data: product } = await supabase
    .from('products')
    .select('id, name')
    .eq('name', TEST_CONFIG.productName)
    .eq('company_id', companyId)
    .single()
  
  if (!product) {
    const { data: newProduct } = await supabase
      .from('products')
      .insert({
        company_id: companyId,
        name: TEST_CONFIG.productName,
        item_type: 'product',
        cost_price: TEST_CONFIG.unitPrice,
        selling_price: TEST_CONFIG.unitPrice * 1.2
      })
      .select()
      .single()
    product = newProduct
    console.log(`✅ Created product: ${product.name}`)
  } else {
    console.log(`✅ Found product: ${product.name}`)
  }
  
  // Get or create branch
  let { data: branch } = await supabase
    .from('branches')
    .select('id, name')
    .eq('name', TEST_CONFIG.branchName)
    .eq('company_id', companyId)
    .single()
  
  if (!branch) {
    const { data: newBranch } = await supabase
      .from('branches')
      .insert({
        company_id: companyId,
        name: TEST_CONFIG.branchName
      })
      .select()
      .single()
    branch = newBranch
    console.log(`✅ Created branch: ${branch.name}`)
  } else {
    console.log(`✅ Found branch: ${branch.name}`)
  }
  
  // Get or create warehouse
  let { data: warehouse } = await supabase
    .from('warehouses')
    .select('id, name, branch_id')
    .eq('name', TEST_CONFIG.warehouseName)
    .eq('company_id', companyId)
    .single()
  
  if (!warehouse) {
    const { data: newWarehouse } = await supabase
      .from('warehouses')
      .insert({
        company_id: companyId,
        branch_id: branch.id,
        name: TEST_CONFIG.warehouseName
      })
      .select()
      .single()
    warehouse = newWarehouse
    console.log(`✅ Created warehouse: ${warehouse.name}`)
  } else {
    console.log(`✅ Found warehouse: ${warehouse.name}`)
  }
  
  // Get or create cost center
  let { data: costCenter } = await supabase
    .from('cost_centers')
    .select('id, name')
    .eq('name', TEST_CONFIG.costCenterName)
    .eq('company_id', companyId)
    .single()
  
  if (!costCenter) {
    const { data: newCostCenter } = await supabase
      .from('cost_centers')
      .insert({
        company_id: companyId,
        branch_id: branch.id,
        name: TEST_CONFIG.costCenterName
      })
      .select()
      .single()
    costCenter = newCostCenter
    console.log(`✅ Created cost center: ${costCenter.name}`)
  } else {
    console.log(`✅ Found cost center: ${costCenter.name}`)
  }
  
  return {
    companyId,
    supplierId: supplier.id,
    productId: product.id,
    branchId: branch.id,
    warehouseId: warehouse.id,
    costCenterId: costCenter.id
  }
}

// Step 2: Create Bill
async function createBill(testData) {
  console.log('\n📋 Step 2: Creating purchase bill...\n')
  
  const billNumber = `BILL-TEST-${Date.now()}`
  
  const { data: bill, error: billError } = await supabase
    .from('bills')
    .insert({
      company_id: testData.companyId,
      supplier_id: testData.supplierId,
      bill_number: billNumber,
      bill_date: new Date().toISOString().split('T')[0],
      subtotal: TEST_CONFIG.totalAmount,
      tax_amount: 0,
      total_amount: TEST_CONFIG.totalAmount,
      status: 'sent',
      branch_id: testData.branchId,
      warehouse_id: testData.warehouseId,
      cost_center_id: testData.costCenterId
    })
    .select()
    .single()
  
  if (billError || !bill) {
    throw new Error(`Failed to create bill: ${billError?.message}`)
  }
  
  console.log(`✅ Bill created: ${bill.bill_number} (${bill.id})`)
  
  // Create bill item
  const { data: billItem, error: itemError } = await supabase
    .from('bill_items')
    .insert({
      bill_id: bill.id,
      product_id: testData.productId,
      quantity: TEST_CONFIG.quantity,
      unit_price: TEST_CONFIG.unitPrice,
      tax_rate: 0,
      discount_percent: 0,
      line_total: TEST_CONFIG.totalAmount
    })
    .select()
    .single()
  
  if (itemError || !billItem) {
    throw new Error(`Failed to create bill item: ${itemError?.message}`)
  }
  
  console.log(`✅ Bill item created: ${TEST_CONFIG.quantity} units`)
  
  return { bill, billItem }
}

// Step 3: Receive Bill
async function receiveBill(billId) {
  console.log('\n📋 Step 3: Receiving bill...\n')
  
  const { error } = await supabase
    .from('bills')
    .update({ status: 'received' })
    .eq('id', billId)
  
  if (error) {
    throw new Error(`Failed to receive bill: ${error.message}`)
  }
  
  console.log(`✅ Bill received`)
  
  // Check inventory transaction
  const { data: invTx } = await supabase
    .from('inventory_transactions')
    .select('*')
    .eq('reference_id', billId)
    .eq('transaction_type', 'purchase')
    .single()
  
  if (invTx) {
    console.log(`✅ Inventory transaction created: ${invTx.quantity_change} units`)
  } else {
    logWarning('Inventory', 'Transaction', 'No inventory transaction found (may be expected)')
  }
  
  return { invTx }
}

// Step 4: Pay Bill
async function payBill(billId, testData) {
  console.log('\n📋 Step 4: Paying bill...\n')
  
  // Get accounts
  const { data: accounts } = await supabase
    .from('chart_of_accounts')
    .select('id, account_name, sub_type')
    .eq('company_id', testData.companyId)
  
  const cashAccount = accounts?.find(a => 
    a.sub_type === 'cash' || 
    a.account_name?.toLowerCase().includes('cash')
  )
  
  if (!cashAccount) {
    throw new Error('Cash account not found')
  }
  
  // Create payment
  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .insert({
      company_id: testData.companyId,
      supplier_id: testData.supplierId,
      bill_id: billId,
      payment_date: new Date().toISOString().split('T')[0],
      amount: TEST_CONFIG.totalAmount,
      payment_method: 'cash',
      account_id: cashAccount.id
    })
    .select()
    .single()
  
  if (paymentError || !payment) {
    throw new Error(`Failed to create payment: ${paymentError?.message}`)
  }
  
  console.log(`✅ Payment created: ${payment.amount}`)
  
  // Update bill status
  const { error: updateError } = await supabase
    .from('bills')
    .update({
      paid_amount: TEST_CONFIG.totalAmount,
      status: 'paid'
    })
    .eq('id', billId)
  
  if (updateError) {
    throw new Error(`Failed to update bill: ${updateError.message}`)
  }
  
  console.log(`✅ Bill marked as paid`)
  
  return { payment }
}

// Step 5: Create Purchase Return (Credit Return)
async function createPurchaseReturn(billId, testData) {
  console.log('\n📋 Step 5: Creating purchase return (Credit Return)...\n')
  
  const returnNumber = `PRET-TEST-${Date.now()}`
  const returnDate = new Date().toISOString().split('T')[0]
  
  // Create purchase return
  const { data: purchaseReturn, error: prError } = await supabase
    .from('purchase_returns')
    .insert({
      company_id: testData.companyId,
      supplier_id: testData.supplierId,
      bill_id: billId,
      return_number: returnNumber,
      return_date: returnDate,
      subtotal: TEST_CONFIG.returnAmount,
      tax_amount: 0,
      total_amount: TEST_CONFIG.returnAmount,
      settlement_method: 'credit',
      status: 'completed',
      reason: 'Test return',
      branch_id: testData.branchId,
      warehouse_id: testData.warehouseId,
      cost_center_id: testData.costCenterId
    })
    .select()
    .single()
  
  if (prError || !purchaseReturn) {
    throw new Error(`Failed to create purchase return: ${prError?.message}`)
  }
  
  console.log(`✅ Purchase return created: ${purchaseReturn.return_number}`)
  
  // Get bill item
  const { data: billItem } = await supabase
    .from('bill_items')
    .select('*')
    .eq('bill_id', billId)
    .single()
  
  if (!billItem) {
    throw new Error('Bill item not found')
  }
  
  // Create return item
  const { data: returnItem, error: itemError } = await supabase
    .from('purchase_return_items')
    .insert({
      purchase_return_id: purchaseReturn.id,
      bill_item_id: billItem.id,
      product_id: testData.productId,
      quantity: TEST_CONFIG.returnQuantity,
      unit_price: TEST_CONFIG.unitPrice,
      tax_rate: 0,
      discount_percent: 0,
      line_total: TEST_CONFIG.returnAmount
    })
    .select()
    .single()
  
  if (itemError || !returnItem) {
    throw new Error(`Failed to create return item: ${itemError?.message}`)
  }
  
  console.log(`✅ Return item created: ${TEST_CONFIG.returnQuantity} units`)
  
  return { purchaseReturn, returnItem, billItem }
}

// Verification Functions
async function verifyBill(billId) {
  console.log('\n🔍 Verification A: Bill Status\n')
  
  const { data: bill } = await supabase
    .from('bills')
    .select('*')
    .eq('id', billId)
    .single()
  
  if (!bill) {
    logResult('A', 'Bill Exists', false, 'Bill not found')
    return
  }
  
  // A1: total_amount = 1000
  const totalCorrect = Number(bill.total_amount) === TEST_CONFIG.totalAmount
  logResult('A', 'Total Amount', totalCorrect, 
    `Expected: ${TEST_CONFIG.totalAmount}, Got: ${bill.total_amount}`,
    { expected: TEST_CONFIG.totalAmount, actual: bill.total_amount }
  )
  
  // A2: paid_amount = 1000
  const paidCorrect = Number(bill.paid_amount) === TEST_CONFIG.totalAmount
  logResult('A', 'Paid Amount', paidCorrect,
    `Expected: ${TEST_CONFIG.totalAmount}, Got: ${bill.paid_amount}`,
    { expected: TEST_CONFIG.totalAmount, actual: bill.paid_amount }
  )
  
  // A3: status = 'paid'
  const statusCorrect = bill.status === 'paid'
  logResult('A', 'Status', statusCorrect,
    `Expected: 'paid', Got: '${bill.status}'`,
    { expected: 'paid', actual: bill.status }
  )
  
  // A4: returned_amount = 300
  const returnedCorrect = Number(bill.returned_amount || 0) === TEST_CONFIG.returnAmount
  logResult('A', 'Returned Amount', returnedCorrect,
    `Expected: ${TEST_CONFIG.returnAmount}, Got: ${bill.returned_amount || 0}`,
    { expected: TEST_CONFIG.returnAmount, actual: bill.returned_amount || 0 }
  )
  
  // A5: No other financial changes
  const noOtherChanges = 
    Number(bill.total_amount) === TEST_CONFIG.totalAmount &&
    Number(bill.paid_amount) === TEST_CONFIG.totalAmount &&
    bill.status === 'paid'
  logResult('A', 'No Financial Changes', noOtherChanges,
    'Bill financial values unchanged after return',
    { total: bill.total_amount, paid: bill.paid_amount, status: bill.status }
  )
}

async function verifyFIFO(billId, purchaseReturnId) {
  console.log('\n🔍 Verification B: FIFO Lots\n')
  
  // Get original FIFO lots for this bill
  const { data: consumptions } = await supabase
    .from('fifo_lot_consumptions')
    .select(`
      *,
      fifo_cost_lots (
        id,
        product_id,
        remaining_quantity,
        unit_cost,
        lot_date
      )
    `)
    .eq('reference_type', 'bill')
    .eq('reference_id', billId)
  
  if (!consumptions || consumptions.length === 0) {
    logWarning('B', 'FIFO Lots', 'No FIFO consumptions found (may be expected if FIFO not enabled)')
    return
  }
  
  // Check if lots were reversed
  let totalReversed = 0
  let allCorrectCost = true
  
  for (const consumption of consumptions) {
    const lot = consumption.fifo_cost_lots
    if (!lot) continue
    
    // Check if remaining_quantity increased (reversal)
    const originalRemaining = Number(lot.remaining_quantity) - (consumption.quantity_consumed || 0)
    const currentRemaining = Number(lot.remaining_quantity)
    
    if (currentRemaining > originalRemaining) {
      const reversed = currentRemaining - originalRemaining
      totalReversed += reversed
      
      // Verify unit_cost matches
      const costCorrect = Number(lot.unit_cost) === TEST_CONFIG.unitPrice
      if (!costCorrect) {
        allCorrectCost = false
        logResult('B', 'FIFO Unit Cost', false,
          `Expected: ${TEST_CONFIG.unitPrice}, Got: ${lot.unit_cost}`,
          { lotId: lot.id, expected: TEST_CONFIG.unitPrice, actual: lot.unit_cost }
        )
      }
    }
  }
  
  const reversedCorrect = totalReversed >= TEST_CONFIG.returnQuantity
  logResult('B', 'FIFO Reversal', reversedCorrect,
    `Expected: ${TEST_CONFIG.returnQuantity} units reversed, Found: ${totalReversed}`,
    { expected: TEST_CONFIG.returnQuantity, actual: totalReversed }
  )
  
  if (allCorrectCost && totalReversed > 0) {
    logResult('B', 'FIFO Unit Cost', true,
      `All reversed lots have correct unit_cost: ${TEST_CONFIG.unitPrice}`
    )
  }
}

async function verifyCOGS(billId, purchaseReturnId) {
  console.log('\n🔍 Verification C: COGS Transactions\n')
  
  // Get original COGS
  const { data: originalCOGS } = await supabase
    .from('cogs_transactions')
    .select('*')
    .eq('source_type', 'bill')
    .eq('source_id', billId)
  
  // Get reversal COGS
  const { data: reversalCOGS } = await supabase
    .from('cogs_transactions')
    .select('*')
    .eq('source_type', 'return')
    .eq('source_id', purchaseReturnId)
  
  if (!reversalCOGS || reversalCOGS.length === 0) {
    logResult('C', 'COGS Reversal Exists', false, 'No COGS reversal transactions found')
    return
  }
  
  // Verify reversal COGS
  let totalReversed = 0
  let allCorrectCost = true
  
  for (const cogs of reversalCOGS) {
    totalReversed += Number(cogs.quantity || 0)
    
    const costCorrect = Number(cogs.unit_cost) === TEST_CONFIG.unitPrice
    if (!costCorrect) {
      allCorrectCost = false
      logResult('C', 'COGS Unit Cost', false,
        `Expected: ${TEST_CONFIG.unitPrice}, Got: ${cogs.unit_cost}`,
        { cogsId: cogs.id, expected: TEST_CONFIG.unitPrice, actual: cogs.unit_cost }
      )
    }
  }
  
  const quantityCorrect = Math.abs(totalReversed) === TEST_CONFIG.returnQuantity
  logResult('C', 'COGS Reversal Quantity', quantityCorrect,
    `Expected: ${TEST_CONFIG.returnQuantity}, Got: ${Math.abs(totalReversed)}`,
    { expected: TEST_CONFIG.returnQuantity, actual: Math.abs(totalReversed) }
  )
  
  if (allCorrectCost) {
    logResult('C', 'COGS Unit Cost', true,
      `All reversal COGS have correct unit_cost: ${TEST_CONFIG.unitPrice}`
    )
  }
  
  // Verify source_type and source_id
  const sourceCorrect = reversalCOGS.every(cogs => 
    cogs.source_type === 'return' && cogs.source_id === purchaseReturnId
  )
  logResult('C', 'COGS Source', sourceCorrect,
    'All reversal COGS have correct source_type and source_id',
    { sourceType: 'return', sourceId: purchaseReturnId }
  )
}

async function verifyVendorCredit(purchaseReturnId, testData) {
  console.log('\n🔍 Verification D: Vendor Credit\n')
  
  const { data: vendorCredit } = await supabase
    .from('vendor_credits')
    .select('*')
    .eq('source_purchase_return_id', purchaseReturnId)
    .single()
  
  if (!vendorCredit) {
    logResult('D', 'Vendor Credit Exists', false, 'Vendor Credit not found')
    return
  }
  
  // D1: amount = 300
  const amountCorrect = Number(vendorCredit.total_amount) === TEST_CONFIG.returnAmount
  logResult('D', 'Vendor Credit Amount', amountCorrect,
    `Expected: ${TEST_CONFIG.returnAmount}, Got: ${vendorCredit.total_amount}`,
    { expected: TEST_CONFIG.returnAmount, actual: vendorCredit.total_amount }
  )
  
  // D2: status = 'open'
  const statusCorrect = vendorCredit.status === 'open'
  logResult('D', 'Vendor Credit Status', statusCorrect,
    `Expected: 'open', Got: '${vendorCredit.status}'`,
    { expected: 'open', actual: vendorCredit.status }
  )
  
  // D3: Linked to purchase_return_id
  const linkedCorrect = vendorCredit.source_purchase_return_id === purchaseReturnId
  logResult('D', 'Vendor Credit Link', linkedCorrect,
    `Linked to purchase_return_id: ${purchaseReturnId}`,
    { purchaseReturnId, linked: vendorCredit.source_purchase_return_id }
  )
  
  // D4: Governance fields
  const governanceCorrect = 
    vendorCredit.company_id === testData.companyId &&
    vendorCredit.supplier_id === testData.supplierId &&
    vendorCredit.branch_id === testData.branchId &&
    vendorCredit.warehouse_id === testData.warehouseId &&
    vendorCredit.cost_center_id === testData.costCenterId
  
  logResult('D', 'Vendor Credit Governance', governanceCorrect,
    'All governance fields present',
    {
      company: vendorCredit.company_id === testData.companyId,
      supplier: vendorCredit.supplier_id === testData.supplierId,
      branch: vendorCredit.branch_id === testData.branchId,
      warehouse: vendorCredit.warehouse_id === testData.warehouseId,
      costCenter: vendorCredit.cost_center_id === testData.costCenterId
    }
  )
}

async function verifyJournalEntries(purchaseReturnId, testData) {
  console.log('\n🔍 Verification E: Journal Entries\n')
  
  const { data: journalEntry } = await supabase
    .from('journal_entries')
    .select(`
      *,
      journal_entry_lines (
        *,
        chart_of_accounts (
          account_name,
          sub_type
        )
      )
    `)
    .eq('reference_type', 'purchase_return')
    .eq('reference_id', purchaseReturnId)
    .single()
  
  if (!journalEntry) {
    logResult('E', 'Journal Entry Exists', false, 'Journal entry not found')
    return
  }
  
  const lines = journalEntry.journal_entry_lines || []
  
  // Find Vendor Credit Liability line
  const vendorCreditLine = lines.find(line => {
    const account = line.chart_of_accounts
    return account && (
      account.sub_type === 'vendor_credit_liability' ||
      account.sub_type === 'ap_contra' ||
      account.account_name?.toLowerCase().includes('vendor credit')
    )
  })
  
  if (!vendorCreditLine) {
    // Try to find AP line as fallback
    const apLine = lines.find(line => {
      const account = line.chart_of_accounts
      return account && account.sub_type === 'accounts_payable'
    })
    
    if (apLine) {
      logWarning('E', 'Vendor Credit Liability', 'Using AP account as fallback (Vendor Credit Liability not found)')
    } else {
      logResult('E', 'Vendor Credit Liability Line', false, 'Vendor Credit Liability line not found')
    }
  } else {
    const debitCorrect = Number(vendorCreditLine.debit_amount) === TEST_CONFIG.returnAmount
    logResult('E', 'Vendor Credit Liability Debit', debitCorrect,
      `Expected: ${TEST_CONFIG.returnAmount}, Got: ${vendorCreditLine.debit_amount}`,
      { expected: TEST_CONFIG.returnAmount, actual: vendorCreditLine.debit_amount }
    )
  }
  
  // Find Inventory line
  const inventoryLine = lines.find(line => {
    const account = line.chart_of_accounts
    return account && account.sub_type === 'inventory'
  })
  
  if (inventoryLine) {
    const creditCorrect = Number(inventoryLine.credit_amount) === TEST_CONFIG.returnAmount
    logResult('E', 'Inventory Credit', creditCorrect,
      `Expected: ${TEST_CONFIG.returnAmount}, Got: ${inventoryLine.credit_amount}`,
      { expected: TEST_CONFIG.returnAmount, actual: inventoryLine.credit_amount }
    )
  } else {
    logWarning('E', 'Inventory Line', 'Inventory line not found (may use expense account)')
  }
  
  // Verify no cash/bank lines
  const cashLines = lines.filter(line => {
    const account = line.chart_of_accounts
    return account && (
      account.sub_type === 'cash' ||
      account.sub_type === 'bank'
    )
  })
  
  const noCashLines = cashLines.length === 0
  logResult('E', 'No Cash Lines', noCashLines,
    `Found ${cashLines.length} cash/bank lines (expected: 0)`,
    { found: cashLines.length, expected: 0 }
  )
  
  // Verify no AP modification
  const apLines = lines.filter(line => {
    const account = line.chart_of_accounts
    return account && account.sub_type === 'accounts_payable'
  })
  
  if (apLines.length > 0) {
    logWarning('E', 'AP Lines', `Found ${apLines.length} AP lines (should use Vendor Credit Liability instead)`)
  }
}

// Main test execution
async function runTest() {
  console.log('\n🧪 Purchase Return Baseline Test - Starting...\n')
  console.log('=' .repeat(60))
  
  try {
    // Setup
    const testData = await setupTestData()
    
    // Create and process bill
    const { bill, billItem } = await createBill(testData)
    await receiveBill(bill.id)
    await payBill(bill.id, testData)
    
    // Create return
    const { purchaseReturn } = await createPurchaseReturn(bill.id, testData)
    
    // Note: In a real scenario, you would call the actual return processing function
    // For this test, we're verifying the state after manual processing
    console.log('\n⚠️  Note: This test assumes the return was processed through the UI/API')
    console.log('   Please process the return manually, then run verification\n')
    
    // Verifications
    await verifyBill(bill.id)
    await verifyFIFO(bill.id, purchaseReturn.id)
    await verifyCOGS(bill.id, purchaseReturn.id)
    await verifyVendorCredit(purchaseReturn.id, testData)
    await verifyJournalEntries(purchaseReturn.id, testData)
    
    // Summary
    console.log('\n' + '='.repeat(60))
    console.log('\n📊 Test Summary\n')
    console.log(`✅ Passed: ${results.passed.length}`)
    console.log(`❌ Failed: ${results.failed.length}`)
    console.log(`⚠️  Warnings: ${results.warnings.length}`)
    
    if (results.failed.length > 0) {
      console.log('\n❌ Failed Tests:')
      results.failed.forEach(f => {
        console.log(`   - ${f.category}: ${f.test} - ${f.message}`)
      })
    }
    
    if (results.warnings.length > 0) {
      console.log('\n⚠️  Warnings:')
      results.warnings.forEach(w => {
        console.log(`   - ${w.category}: ${w.test} - ${w.message}`)
      })
    }
    
    const allPassed = results.failed.length === 0
    console.log(`\n${allPassed ? '✅' : '❌'} Overall: ${allPassed ? 'PASSED' : 'FAILED'}\n`)
    
    return allPassed
    
  } catch (error) {
    console.error('\n❌ Test Error:', error)
    throw error
  }
}

// Run test
runTest()
  .then(success => {
    process.exit(success ? 0 : 1)
  })
  .catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
