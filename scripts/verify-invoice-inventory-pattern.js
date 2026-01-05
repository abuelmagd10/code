// scripts/verify-invoice-inventory-pattern.js
// التحقق من تطبيق النمط المحاسبي والمخزني للفواتير

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// قراءة .env.local
try {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/)
      if (match) {
        const key = match[1].trim()
        const value = match[2].trim().replace(/^["']|["']$/g, '')
        if (!process.env[key]) {
          process.env[key] = value
        }
      }
    })
  }
} catch (e) {}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ خطأ: SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY مطلوبان')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

const RESULTS = {
  timestamp: new Date().toISOString(),
  company: 'تست',
  checks: {},
  summary: {
    total: 0,
    passed: 0,
    failed: 0,
    warnings: 0
  }
}

function addResult(checkName, status, message, details = null) {
  RESULTS.checks[checkName] = {
    status, // 'PASS', 'FAIL', 'WARNING'
    message,
    details,
    timestamp: new Date().toISOString()
  }
  
  RESULTS.summary.total++
  if (status === 'PASS') RESULTS.summary.passed++
  else if (status === 'FAIL') RESULTS.summary.failed++
  else RESULTS.summary.warnings++
  
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️'
  console.log(`${icon} ${checkName}: ${message}`)
  if (details) {
    console.log(`   ${JSON.stringify(details, null, 2)}`)
  }
}

async function verifyInvoiceInventoryPattern() {
  console.log('🔍 التحقق من النمط المحاسبي والمخزني للفواتير')
  console.log('==========================================\n')

  try {
    // 1. العثور على شركة "تست"
    const { data: companies, error: companyError } = await supabase
      .from('companies')
      .select('id, name')
      .or('name.eq.تست,name.ilike.%تست%')
      .limit(1)
    
    if (companyError || !companies || companies.length === 0) {
      console.error('❌ لم يتم العثور على شركة "تست"')
      process.exit(1)
    }

    const companyId = companies[0].id
    console.log(`✅ تم العثور على شركة "${companies[0].name}" - ID: ${companyId}\n`)

    // 2. التحقق من فواتير البيع المرسلة (Sent)
    console.log('📋 1. التحقق من فواتير البيع المرسلة (Sent)...\n')
    
    const { data: sentInvoices, error: invoicesError } = await supabase
      .from('invoices')
      .select('id, invoice_number, status, invoice_date, total_amount')
      .eq('company_id', companyId)
      .in('status', ['sent', 'confirmed'])
      .order('invoice_date', { ascending: false })
    
    if (invoicesError) {
      addResult('Check Sent Invoices Query', 'FAIL', `خطأ في جلب الفواتير: ${invoicesError.message}`)
    } else {
      addResult('Check Sent Invoices Count', 'PASS', `عدد فواتير البيع المرسلة: ${sentInvoices?.length || 0}`, {
        count: sentInvoices?.length || 0
      })

      // التحقق من كل فاتورة مرسلة
      if (sentInvoices && sentInvoices.length > 0) {
        for (const invoice of sentInvoices) {
          // 2.1 التحقق من عدم وجود قيود محاسبية (Cash Basis: القيود تُنشأ عند الدفع فقط)
          const { data: journalEntries, error: jeError } = await supabase
            .from('journal_entries')
            .select('id, entry_date, description, status, reference_type')
            .eq('company_id', companyId)
            .in('reference_type', ['invoice', 'invoice_payment'])
            .or(`reference_id.eq.${invoice.id},reference_id.in.(SELECT id FROM payments WHERE invoice_id.eq.${invoice.id})`)
          
          if (jeError) {
            addResult(`Invoice ${invoice.invoice_number} - Journal Check`, 'WARNING', 
              `خطأ في التحقق من القيود: ${jeError.message}`)
          } else if (journalEntries && journalEntries.length > 0) {
            // فحص إذا كانت القيود مرتبطة بالدفع فقط
            const paymentRelated = journalEntries.filter(je => je.reference_type === 'invoice_payment')
            const invoiceRelated = journalEntries.filter(je => je.reference_type === 'invoice')
            
            if (invoiceRelated.length > 0) {
              addResult(`Invoice ${invoice.invoice_number} - No Journal Entries`, 'FAIL',
                `فاتورة مرسلة تحتوي على ${invoiceRelated.length} قيد محاسبي مباشر (يجب أن تكون 0)`, {
                  invoice_id: invoice.id,
                  invoice_number: invoice.invoice_number,
                  journal_entries: invoiceRelated
                })
            } else if (paymentRelated.length > 0) {
              addResult(`Invoice ${invoice.invoice_number} - Payment Journals Only`, 'PASS',
                `القيود مرتبطة بالدفع فقط (${paymentRelated.length} قيد) - صحيح`)
            } else {
              addResult(`Invoice ${invoice.invoice_number} - No Journal Entries`, 'PASS',
                'لا توجد قيود محاسبية (صحيح)')
            }
          } else {
            addResult(`Invoice ${invoice.invoice_number} - No Journal Entries`, 'PASS',
              'لا توجد قيود محاسبية (صحيح)')
          }

          // 2.2 التحقق من وجود حركات مخزون
          const { data: inventoryTx, error: invError } = await supabase
            .from('inventory_transactions')
            .select('id, product_id, quantity_change, transaction_type, reference_id, warehouse_id, branch_id')
            .eq('company_id', companyId)
            .eq('reference_id', invoice.id)
          
          if (invError) {
            addResult(`Invoice ${invoice.invoice_number} - Inventory Check`, 'WARNING',
              `خطأ في التحقق من المخزون: ${invError.message}`)
          } else if (!inventoryTx || inventoryTx.length === 0) {
            // التحقق من أن الفاتورة تحتوي على منتجات (ليس services فقط)
            const { data: invoiceItems } = await supabase
              .from('invoice_items')
              .select('product_id, products(item_type)')
              .eq('invoice_id', invoice.id)
            
            const hasProducts = invoiceItems?.some((item) => {
              const itemType = item.products?.item_type
              return !itemType || itemType !== 'service'
            })
            
            if (hasProducts) {
              addResult(`Invoice ${invoice.invoice_number} - Has Inventory Transactions`, 'FAIL',
                'فاتورة مرسلة تحتوي على منتجات ولكن لا توجد حركات مخزون', {
                  invoice_id: invoice.id,
                  invoice_items: invoiceItems?.length || 0
                })
            } else {
              addResult(`Invoice ${invoice.invoice_number} - Has Inventory Transactions`, 'PASS',
                'لا توجد حركات مخزون (جميع المنتجات من نوع service)')
            }
          } else {
            // التحقق من أن جميع الحركات سالبة (Stock Out)
            const allNegative = inventoryTx.every(tx => Number(tx.quantity_change) < 0)
            if (allNegative) {
              addResult(`Invoice ${invoice.invoice_number} - Inventory Stock Out`, 'PASS',
                `تم خصم المخزون بشكل صحيح (${inventoryTx.length} حركة)`)
            } else {
              addResult(`Invoice ${invoice.invoice_number} - Inventory Stock Out`, 'FAIL',
                'بعض حركات المخزون ليست سالبة (يجب أن تكون جميعها Stock Out)', {
                  transactions: inventoryTx
                })
            }
          }
          
          // 2.3 التحقق من بضائع لدى الغير (إذا كانت هناك شركة شحن)
          const { data: invoiceData } = await supabase
            .from('invoices')
            .select('id, shipping_provider_id, shipping_providers(name)')
            .eq('id', invoice.id)
            .single()
          
          if (invoiceData?.shipping_provider_id) {
            // التحقق من وجود بضائع لدى الغير
            const { data: thirdPartyGoods, error: tpgError } = await supabase
              .from('third_party_goods')
              .select('id, product_id, quantity, status')
              .eq('company_id', companyId)
              .eq('reference_id', invoice.id)
              .eq('reference_type', 'invoice')
            
            if (tpgError && !tpgError.message.includes('does not exist')) {
              addResult(`Invoice ${invoice.invoice_number} - Third Party Goods Check`, 'WARNING',
                `خطأ في التحقق من بضائع لدى الغير: ${tpgError.message}`)
            } else if (!thirdPartyGoods || thirdPartyGoods.length === 0) {
              addResult(`Invoice ${invoice.invoice_number} - Third Party Goods`, 'WARNING',
                `فاتورة مرسلة مع شركة شحن ولكن لا توجد بضائع في "بضائع لدى الغير"`, {
                  shipping_provider: invoiceData.shipping_providers?.name,
                  invoice_id: invoice.id
                })
            } else {
              addResult(`Invoice ${invoice.invoice_number} - Third Party Goods`, 'PASS',
                `تم تسجيل ${thirdPartyGoods.length} بضاعة في "بضائع لدى الغير"`)
            }
          }
        }
      }
    }

    // 3. التحقق من فواتير الشراء المستلمة (Received)
    console.log('\n📋 2. التحقق من فواتير الشراء المستلمة (Received)...\n')
    
    const { data: receivedBills, error: billsError } = await supabase
      .from('bills')
      .select('id, bill_number, status, bill_date, total_amount')
      .eq('company_id', companyId)
      .in('status', ['received', 'confirmed'])
      .order('bill_date', { ascending: false })
    
    if (billsError) {
      addResult('Check Received Bills Query', 'FAIL', `خطأ في جلب فواتير الشراء: ${billsError.message}`)
    } else {
      addResult('Check Received Bills Count', 'PASS', `عدد فواتير الشراء المستلمة: ${receivedBills?.length || 0}`, {
        count: receivedBills?.length || 0
      })

      // التحقق من كل فاتورة شراء مستلمة
      if (receivedBills && receivedBills.length > 0) {
        for (const bill of receivedBills) {
          // 3.1 التحقق من عدم وجود قيود محاسبية
          const { data: journalEntries, error: jeError } = await supabase
            .from('journal_entries')
            .select('id, entry_date, description, status')
            .eq('company_id', companyId)
            .eq('reference_type', 'bill')
            .eq('reference_id', bill.id)
          
          if (jeError) {
            addResult(`Bill ${bill.bill_number} - Journal Check`, 'WARNING',
              `خطأ في التحقق من القيود: ${jeError.message}`)
          } else if (journalEntries && journalEntries.length > 0) {
            addResult(`Bill ${bill.bill_number} - No Journal Entries`, 'FAIL',
              `فاتورة شراء مستلمة تحتوي على ${journalEntries.length} قيد محاسبي (يجب أن تكون 0)`, {
                bill_id: bill.id,
                bill_number: bill.bill_number,
                journal_entries: journalEntries
              })
          } else {
            addResult(`Bill ${bill.bill_number} - No Journal Entries`, 'PASS',
              'لا توجد قيود محاسبية (صحيح)')
          }

          // 3.2 التحقق من وجود حركات مخزون
          const { data: inventoryTx, error: invError } = await supabase
            .from('inventory_transactions')
            .select('id, product_id, quantity_change, transaction_type, reference_id')
            .eq('company_id', companyId)
            .eq('reference_id', bill.id)
          
          if (invError) {
            addResult(`Bill ${bill.bill_number} - Inventory Check`, 'WARNING',
              `خطأ في التحقق من المخزون: ${invError.message}`)
          } else if (!inventoryTx || inventoryTx.length === 0) {
            addResult(`Bill ${bill.bill_number} - Has Inventory Transactions`, 'WARNING',
              'لا توجد حركات مخزون (قد يكون المنتج service)')
          } else {
            // التحقق من أن جميع الحركات موجبة (Stock In)
            const allPositive = inventoryTx.every(tx => Number(tx.quantity_change) > 0)
            if (allPositive) {
              addResult(`Bill ${bill.bill_number} - Inventory Stock In`, 'PASS',
                `تم زيادة المخزون بشكل صحيح (${inventoryTx.length} حركة)`)
            } else {
              addResult(`Bill ${bill.bill_number} - Inventory Stock In`, 'FAIL',
                'بعض حركات المخزون ليست موجبة (يجب أن تكون جميعها Stock In)', {
                  transactions: inventoryTx
                })
            }
          }
        }
      }
    }

    // 4. التحقق من فواتير البيع المدفوعة (Paid)
    console.log('\n📋 3. التحقق من فواتير البيع المدفوعة (Paid)...\n')
    
    const { data: paidInvoices, error: paidError } = await supabase
      .from('invoices')
      .select('id, invoice_number, status, invoice_date, total_amount, paid_amount')
      .eq('company_id', companyId)
      .in('status', ['paid', 'partially_paid'])
      .order('invoice_date', { ascending: false })
    
    if (paidError) {
      addResult('Check Paid Invoices Query', 'FAIL', `خطأ في جلب الفواتير المدفوعة: ${paidError.message}`)
    } else {
      addResult('Check Paid Invoices Count', 'PASS', `عدد فواتير البيع المدفوعة: ${paidInvoices?.length || 0}`, {
        count: paidInvoices?.length || 0
      })

      // التحقق من أن الفواتير المدفوعة تحتوي على قيود محاسبية
      if (paidInvoices && paidInvoices.length > 0) {
        for (const invoice of paidInvoices) {
          const { data: journalEntries, error: jeError } = await supabase
            .from('journal_entries')
            .select('id, entry_date, description, status, reference_type')
            .eq('company_id', companyId)
            .in('reference_type', ['invoice', 'invoice_payment'])
            .or(`reference_id.eq.${invoice.id},reference_id.in.(SELECT id FROM payments WHERE invoice_id.eq.${invoice.id})`)
          
          if (jeError) {
            addResult(`Paid Invoice ${invoice.invoice_number} - Journal Check`, 'WARNING',
              `خطأ في التحقق من القيود: ${jeError.message}`)
          } else if (!journalEntries || journalEntries.length === 0) {
            addResult(`Paid Invoice ${invoice.invoice_number} - Has Journal Entries`, 'FAIL',
              'فاتورة مدفوعة لا تحتوي على قيود محاسبية (يجب أن تحتوي على قيود)', {
                invoice_id: invoice.id,
                invoice_number: invoice.invoice_number,
                paid_amount: invoice.paid_amount
              })
          } else {
            addResult(`Paid Invoice ${invoice.invoice_number} - Has Journal Entries`, 'PASS',
              `تحتوي على ${journalEntries.length} قيد محاسبي (صحيح)`)
          }
        }
      }
    }

    // 5. ملخص النتائج
    console.log('\n' + '='.repeat(50))
    console.log('📊 ملخص النتائج:')
    console.log('='.repeat(50))
    console.log(`إجمالي الفحوصات: ${RESULTS.summary.total}`)
    console.log(`✅ نجحت: ${RESULTS.summary.passed}`)
    console.log(`❌ فشلت: ${RESULTS.summary.failed}`)
    console.log(`⚠️  تحذيرات: ${RESULTS.summary.warnings}`)
    console.log('='.repeat(50))

    // حفظ النتائج
    const resultsPath = path.join(__dirname, '..', `INVOICE_INVENTORY_VERIFICATION_${new Date().toISOString().split('T')[0]}.json`)
    fs.writeFileSync(resultsPath, JSON.stringify(RESULTS, null, 2))
    console.log(`\n💾 تم حفظ النتائج في: ${resultsPath}`)

    if (RESULTS.summary.failed > 0) {
      console.log('\n❌ تم اكتشاف أخطاء في النمط المحاسبي/المخزني!')
      process.exit(1)
    } else {
      console.log('\n✅ جميع الفحوصات نجحت!')
      process.exit(0)
    }

  } catch (error) {
    console.error('\n❌ خطأ في التنفيذ:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

// تنفيذ
verifyInvoiceInventoryPattern()

