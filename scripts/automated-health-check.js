#!/usr/bin/env node

/**
 * Automated Health Check System
 * ==============================
 * Runs periodic checks to ensure data integrity
 * Can be scheduled to run daily via cron job
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

const envPath = path.join(__dirname, '..', '.env.local')
const envContent = fs.readFileSync(envPath, 'utf8')
const envVars = {}
envContent.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=')
  if (key && valueParts.length) {
    envVars[key.trim()] = valueParts.join('=').trim()
  }
})

const supabase = createClient(
  envVars.NEXT_PUBLIC_SUPABASE_URL,
  envVars.SUPABASE_SERVICE_ROLE_KEY
)

const log = (msg, color = 'white') => {
  const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    reset: '\x1b[0m'
  }
  const timestamp = new Date().toISOString()
  console.log(`${colors[color]}[${timestamp}] ${msg}${colors.reset}`)
}

const issues = []

async function checkBillsWithoutItems() {
  log('\n1️⃣  Checking bills without items...', 'cyan')
  
  const { data: bills } = await supabase
    .from('bills')
    .select(`
      id,
      bill_number,
      status,
      company_id,
      companies(name)
    `)
    .in('status', ['received', 'paid'])
  
  for (const bill of bills || []) {
    const { data: items } = await supabase
      .from('bill_items')
      .select('id')
      .eq('bill_id', bill.id)
    
    if (!items || items.length === 0) {
      const issue = `❌ Bill ${bill.bill_number} (${bill.companies.name}) has status "${bill.status}" but NO ITEMS`
      log(issue, 'red')
      issues.push({ type: 'CRITICAL', check: 'bills_without_items', message: issue })
    }
  }
  
  if (issues.filter(i => i.check === 'bills_without_items').length === 0) {
    log('✅ All bills have items', 'green')
  }
}

async function checkInvoicesWithoutLines() {
  log('\n2️⃣  Checking invoices without lines...', 'cyan')
  
  const { data: invoices } = await supabase
    .from('invoices')
    .select(`
      id,
      invoice_number,
      status,
      company_id,
      companies(name)
    `)
    .in('status', ['sent', 'paid'])
  
  for (const invoice of invoices || []) {
    const { data: lines } = await supabase
      .from('invoice_lines')
      .select('id')
      .eq('invoice_id', invoice.id)
    
    if (!lines || lines.length === 0) {
      const issue = `❌ Invoice ${invoice.invoice_number} (${invoice.companies.name}) has status "${invoice.status}" but NO LINES`
      log(issue, 'red')
      issues.push({ type: 'CRITICAL', check: 'invoices_without_lines', message: issue })
    }
  }
  
  if (issues.filter(i => i.check === 'invoices_without_lines').length === 0) {
    log('✅ All invoices have lines', 'green')
  }
}

async function checkInventoryBalanceMismatch() {
  log('\n3️⃣  Checking inventory balance mismatches...', 'cyan')
  
  const { data: companies } = await supabase
    .from('companies')
    .select('id, name')
  
  for (const company of companies || []) {
    // Get inventory account
    const { data: invAccount } = await supabase
      .from('chart_of_accounts')
      .select('id')
      .eq('company_id', company.id)
      .eq('sub_type', 'inventory')
      .single()
    
    if (!invAccount) continue
    
    // Calculate accounting balance
    const { data: lines } = await supabase
      .from('journal_entry_lines')
      .select('debit_amount, credit_amount, journal_entries!inner(is_deleted)')
      .eq('account_id', invAccount.id)
    
    let accountingBalance = 0
    for (const line of lines || []) {
      if (line.journal_entries?.is_deleted) continue
      accountingBalance += Number(line.debit_amount || 0) - Number(line.credit_amount || 0)
    }
    
    // Calculate product value
    const { data: products } = await supabase
      .from('products')
      .select('quantity_on_hand, cost_price')
      .eq('company_id', company.id)
      .or('item_type.is.null,item_type.eq.product')
    
    let productValue = 0
    for (const product of products || []) {
      productValue += Number(product.quantity_on_hand || 0) * Number(product.cost_price || 0)
    }
    
    const diff = Math.abs(productValue - accountingBalance)
    
    if (diff > 1000) {
      const issue = `⚠️  ${company.name}: Inventory mismatch - Accounting: ${accountingBalance.toFixed(2)}, Products: ${productValue.toFixed(2)}, Diff: ${diff.toFixed(2)}`
      log(issue, 'yellow')
      issues.push({ type: 'WARNING', check: 'inventory_mismatch', message: issue })
    }
  }
  
  if (issues.filter(i => i.check === 'inventory_mismatch').length === 0) {
    log('✅ All inventory balances match', 'green')
  }
}

async function checkTransactionsWithoutJournal() {
  log('\n4️⃣  Checking transactions without journal entries...', 'cyan')
  
  const { data: transactions } = await supabase
    .from('inventory_transactions')
    .select('id, transaction_type, companies(name)')
    .in('transaction_type', ['purchase', 'sale'])
    .is('journal_entry_id', null)
  
  if (transactions && transactions.length > 0) {
    for (const trans of transactions) {
      const issue = `❌ Transaction ${trans.id} (${trans.companies.name}) type "${trans.transaction_type}" has NO journal_entry_id`
      log(issue, 'red')
      issues.push({ type: 'CRITICAL', check: 'transactions_without_journal', message: issue })
    }
  } else {
    log('✅ All transactions have journal entries', 'green')
  }
}

async function checkUnbalancedJournalEntries() {
  log('\n5️⃣  Checking unbalanced journal entries...', 'cyan')
  
  const { data: entries } = await supabase
    .from('journal_entries')
    .select(`
      id,
      reference_type,
      companies(name),
      journal_entry_lines(debit_amount, credit_amount)
    `)
    .eq('is_deleted', false)
  
  for (const entry of entries || []) {
    let totalDebit = 0
    let totalCredit = 0
    
    for (const line of entry.journal_entry_lines || []) {
      totalDebit += Number(line.debit_amount || 0)
      totalCredit += Number(line.credit_amount || 0)
    }
    
    const diff = Math.abs(totalDebit - totalCredit)
    
    if (diff > 0.01) {
      const issue = `❌ Journal Entry ${entry.id} (${entry.companies.name}) is UNBALANCED - Debit: ${totalDebit}, Credit: ${totalCredit}, Diff: ${diff}`
      log(issue, 'red')
      issues.push({ type: 'CRITICAL', check: 'unbalanced_journal', message: issue })
    }
  }
  
  if (issues.filter(i => i.check === 'unbalanced_journal').length === 0) {
    log('✅ All journal entries are balanced', 'green')
  }
}

async function main() {
  log('='.repeat(80), 'cyan')
  log('🔍 Automated Health Check System', 'cyan')
  log('='.repeat(80), 'cyan')
  
  await checkBillsWithoutItems()
  await checkInvoicesWithoutLines()
  await checkInventoryBalanceMismatch()
  await checkTransactionsWithoutJournal()
  await checkUnbalancedJournalEntries()
  
  // Summary
  log('\n' + '='.repeat(80), 'cyan')
  log('📊 Health Check Summary', 'cyan')
  log('='.repeat(80), 'cyan')
  
  const critical = issues.filter(i => i.type === 'CRITICAL')
  const warnings = issues.filter(i => i.type === 'WARNING')
  
  log(`\nTotal Issues: ${issues.length}`, issues.length > 0 ? 'yellow' : 'green')
  log(`  Critical: ${critical.length}`, critical.length > 0 ? 'red' : 'green')
  log(`  Warnings: ${warnings.length}`, warnings.length > 0 ? 'yellow' : 'green')
  
  if (issues.length === 0) {
    log('\n✅ System is healthy!', 'green')
  } else {
    log('\n⚠️  Issues found - please review', 'yellow')
  }
  
  // Save report
  const report = {
    timestamp: new Date().toISOString(),
    issues,
    summary: {
      total: issues.length,
      critical: critical.length,
      warnings: warnings.length
    }
  }
  
  const reportPath = path.join(__dirname, '..', 'health-check-report.json')
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
  log(`\n📄 Report saved to: ${reportPath}`, 'cyan')
}

main()

