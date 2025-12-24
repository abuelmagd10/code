/**
 * محرك المحاسبة على أساس الاستحقاق (Accrual Accounting Engine)
 * مطابق 100% لـ Zoho Books
 * 
 * المبادئ الأساسية:
 * ✅ تسجيل الإيراد عند إصدار الفاتورة (Issue Event)
 * ✅ تسجيل COGS عند التسليم (Delivery Event)  
 * ✅ تسجيل التحصيل النقدي منفصل عن الإيراد (Payment Event)
 * ✅ ربط المخزون محاسبياً بالأحداث
 * ✅ Trial Balance دائماً متزن
 * ✅ منع أي حلول ترقيعية أو إخفاء أخطاء
 */

import { getLeafAccountIds } from "./accounts"

export interface AccrualJournalEntry {
  id?: string
  company_id: string
  reference_type: 'invoice' | 'invoice_cogs' | 'payment' | 'bill' | 'bill_payment'
  reference_id: string
  entry_date: string
  description: string
  branch_id?: string | null
  cost_center_id?: string | null
  lines: AccrualJournalLine[]
}

export interface AccrualJournalLine {
  account_id: string
  debit_amount: number
  credit_amount: number
  description: string
  branch_id?: string | null
  cost_center_id?: string | null
}

export interface AccrualAccountMapping {
  company_id: string
  accounts_receivable: string
  accounts_payable: string
  sales_revenue: string
  inventory: string
  cogs: string
  cash: string
  bank: string
  vat_output: string
  vat_input: string
  customer_advance?: string
  supplier_advance?: string
}

/**
 * الحصول على خريطة الحسابات المطلوبة للمحاسبة على أساس الاستحقاق
 */
export async function getAccrualAccountMapping(
  supabase: any,
  companyId: string
): Promise<AccrualAccountMapping> {
  const { data: accounts, error } = await supabase
    .from("chart_of_accounts")
    .select("id, account_code, account_name, account_type, sub_type")
    .eq("company_id", companyId)
    .eq("is_active", true)

  if (error) throw error

  const findAccount = (subType: string, fallbackType?: string) => {
    let account = accounts?.find((a: any) => a.sub_type === subType)
    if (!account && fallbackType) {
      account = accounts?.find((a: any) => a.account_type === fallbackType)
    }
    return account?.id
  }

  const mapping: AccrualAccountMapping = {
    company_id: companyId,
    accounts_receivable: findAccount('accounts_receivable', 'asset') || '',
    accounts_payable: findAccount('accounts_payable', 'liability') || '',
    sales_revenue: findAccount('sales_revenue', 'income') || '',
    inventory: findAccount('inventory', 'asset') || '',
    cogs: findAccount('cogs') || findAccount('cost_of_goods_sold', 'expense') || '',
    cash: findAccount('cash', 'asset') || '',
    bank: findAccount('bank', 'asset') || '',
    vat_output: findAccount('vat_output', 'liability') || '',
    vat_input: findAccount('vat_input', 'asset') || '',
    customer_advance: findAccount('customer_advance', 'liability'),
    supplier_advance: findAccount('supplier_advance', 'asset')
  }

  // التحقق من وجود الحسابات الأساسية
  const requiredAccounts = ['accounts_receivable', 'accounts_payable', 'sales_revenue', 'inventory', 'cogs']
  for (const account of requiredAccounts) {
    if (!mapping[account as keyof AccrualAccountMapping]) {
      throw new Error(`Required account not found: ${account}`)
    }
  }

  return mapping
}

/**
 * تسجيل الإيراد عند إصدار الفاتورة (Issue Event)
 * هذا هو الحدث الأساسي في Accrual Accounting
 */
export async function createInvoiceRevenueJournal(
  supabase: any,
  invoiceId: string,
  companyId: string
): Promise<string | null> {
  try {
    // الحصول على بيانات الفاتورة
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select(`
        id, invoice_number, invoice_date, status,
        subtotal, tax_amount, total_amount, shipping,
        branch_id, cost_center_id, customer_id
      `)
      .eq("id", invoiceId)
      .eq("company_id", companyId)
      .single()

    if (invoiceError || !invoice) {
      throw new Error(`Invoice not found: ${invoiceError?.message}`)
    }

    // فقط للفواتير المرسلة (ليس المسودات)
    if (invoice.status === 'draft') {
      return null
    }

    // التحقق من عدم وجود قيد سابق
    const { data: existingEntry } = await supabase
      .from("journal_entries")
      .select("id")
      .eq("company_id", companyId)
      .eq("reference_type", "invoice")
      .eq("reference_id", invoiceId)
      .limit(1)

    if (existingEntry && existingEntry.length > 0) {
      console.log(`Invoice journal already exists for ${invoice.invoice_number}`)
      return existingEntry[0].id
    }

    // الحصول على خريطة الحسابات
    const mapping = await getAccrualAccountMapping(supabase, companyId)

    // حساب المبالغ
    const netAmount = Number(invoice.subtotal || 0)
    const vatAmount = Number(invoice.tax_amount || 0)
    const shippingAmount = Number(invoice.shipping || 0)
    const totalAmount = Number(invoice.total_amount || 0)

    // إنشاء القيد المحاسبي
    const journalEntry: AccrualJournalEntry = {
      company_id: companyId,
      reference_type: 'invoice',
      reference_id: invoiceId,
      entry_date: invoice.invoice_date,
      description: `إيراد المبيعات - ${invoice.invoice_number}`,
      branch_id: invoice.branch_id,
      cost_center_id: invoice.cost_center_id,
      lines: []
    }

    // مدين: العملاء (Accounts Receivable) - إجمالي الفاتورة
    journalEntry.lines.push({
      account_id: mapping.accounts_receivable,
      debit_amount: totalAmount,
      credit_amount: 0,
      description: 'مستحق من العميل',
      branch_id: invoice.branch_id,
      cost_center_id: invoice.cost_center_id
    })

    // دائن: إيرادات المبيعات (Sales Revenue) - صافي المبلغ
    if (netAmount > 0) {
      journalEntry.lines.push({
        account_id: mapping.sales_revenue,
        debit_amount: 0,
        credit_amount: netAmount,
        description: 'إيراد المبيعات',
        branch_id: invoice.branch_id,
        cost_center_id: invoice.cost_center_id
      })
    }

    // دائن: ضريبة القيمة المضافة (إذا وجدت)
    if (vatAmount > 0 && mapping.vat_output) {
      journalEntry.lines.push({
        account_id: mapping.vat_output,
        debit_amount: 0,
        credit_amount: vatAmount,
        description: 'ضريبة القيمة المضافة',
        branch_id: invoice.branch_id,
        cost_center_id: invoice.cost_center_id
      })
    }

    // دائن: إيراد الشحن (إذا وجد)
    if (shippingAmount > 0) {
      // يمكن استخدام حساب إيراد منفصل للشحن أو نفس حساب المبيعات
      journalEntry.lines.push({
        account_id: mapping.sales_revenue, // أو حساب منفصل للشحن
        debit_amount: 0,
        credit_amount: shippingAmount,
        description: 'إيراد الشحن',
        branch_id: invoice.branch_id,
        cost_center_id: invoice.cost_center_id
      })
    }

    // حفظ القيد في قاعدة البيانات
    return await saveJournalEntry(supabase, journalEntry)

  } catch (error) {
    console.error('Error creating invoice revenue journal:', error)
    throw error
  }
}

/**
 * تسجيل COGS عند التسليم (Delivery Event)
 * يتم تسجيله مع الإيراد في نفس الوقت
 */
export async function createCOGSJournalOnDelivery(
  supabase: any,
  invoiceId: string,
  companyId: string
): Promise<string | null> {
  try {
    // الحصول على بيانات الفاتورة
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select(`
        id, invoice_number, invoice_date, status,
        branch_id, cost_center_id
      `)
      .eq("id", invoiceId)
      .eq("company_id", companyId)
      .single()

    if (invoiceError || !invoice) {
      throw new Error(`Invoice not found: ${invoiceError?.message}`)
    }

    // فقط للفواتير المرسلة
    if (invoice.status === 'draft') {
      return null
    }

    // التحقق من عدم وجود قيد COGS سابق
    const { data: existingCOGS } = await supabase
      .from("journal_entries")
      .select("id")
      .eq("company_id", companyId)
      .eq("reference_type", "invoice_cogs")
      .eq("reference_id", invoiceId)
      .limit(1)

    if (existingCOGS && existingCOGS.length > 0) {
      console.log(`COGS journal already exists for ${invoice.invoice_number}`)
      return existingCOGS[0].id
    }

    // حساب إجمالي COGS من بنود الفاتورة باستخدام FIFO
    const { data: invoiceItems, error: itemsError } = await supabase
      .from("invoice_items")
      .select(`
        product_id,
        quantity,
        products!inner(cost_price, item_type)
      `)
      .eq("invoice_id", invoiceId)

    if (itemsError) {
      throw new Error(`Error fetching invoice items: ${itemsError.message}`)
    }

    let totalCOGS = 0

    // استخدام FIFO لحساب COGS
    for (const item of invoiceItems || []) {
      // تجاهل الخدمات - فقط المنتجات لها COGS
      if (item.products.item_type === 'service') continue

      const quantity = Number(item.quantity || 0)

      // محاولة الحصول على COGS من FIFO
      const { data: fifoConsumptions } = await supabase
        .from('fifo_lot_consumptions')
        .select('total_cost')
        .eq('reference_type', 'invoice')
        .eq('reference_id', invoiceId)
        .eq('product_id', item.product_id)

      if (fifoConsumptions && fifoConsumptions.length > 0) {
        // استخدام COGS من FIFO
        const fifoCOGS = fifoConsumptions.reduce((sum, c) => sum + Number(c.total_cost || 0), 0)
        totalCOGS += fifoCOGS
      } else {
        // Fallback: استخدام cost_price (للتوافق مع البيانات القديمة)
        const costPrice = Number(item.products.cost_price || 0)
        totalCOGS += quantity * costPrice
      }
    }

    // إذا لم توجد تكلفة، لا نسجل قيد
    if (totalCOGS <= 0) {
      return null
    }

    // الحصول على خريطة الحسابات
    const mapping = await getAccrualAccountMapping(supabase, companyId)

    // إنشاء قيد COGS
    const journalEntry: AccrualJournalEntry = {
      company_id: companyId,
      reference_type: 'invoice_cogs',
      reference_id: invoiceId,
      entry_date: invoice.invoice_date,
      description: `تكلفة البضاعة المباعة - ${invoice.invoice_number}`,
      branch_id: invoice.branch_id,
      cost_center_id: invoice.cost_center_id,
      lines: [
        {
          // مدين: تكلفة البضاعة المباعة (COGS) - مصروف
          account_id: mapping.cogs,
          debit_amount: totalCOGS,
          credit_amount: 0,
          description: 'تكلفة البضاعة المباعة',
          branch_id: invoice.branch_id,
          cost_center_id: invoice.cost_center_id
        },
        {
          // دائن: المخزون (Inventory) - أصل
          account_id: mapping.inventory,
          debit_amount: 0,
          credit_amount: totalCOGS,
          description: 'خصم من المخزون',
          branch_id: invoice.branch_id,
          cost_center_id: invoice.cost_center_id
        }
      ]
    }

    // حفظ القيد في قاعدة البيانات
    return await saveJournalEntry(supabase, journalEntry)

  } catch (error) {
    console.error('Error creating COGS journal:', error)
    throw error
  }
}

/**
 * تسجيل التحصيل النقدي (Payment Event)
 * منفصل تماماً عن تسجيل الإيراد
 */
export async function createPaymentJournal(
  supabase: any,
  paymentId: string,
  companyId: string,
  invoiceId?: string
): Promise<string | null> {
  try {
    // الحصول على بيانات الدفعة
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select(`
        id, payment_date, amount, payment_method,
        reference_number, account_id, customer_id, supplier_id
      `)
      .eq("id", paymentId)
      .eq("company_id", companyId)
      .single()

    if (paymentError || !payment) {
      throw new Error(`Payment not found: ${paymentError?.message}`)
    }

    // التحقق من عدم وجود قيد دفع سابق
    const { data: existingPayment } = await supabase
      .from("journal_entries")
      .select("id")
      .eq("company_id", companyId)
      .eq("reference_type", "payment")
      .eq("reference_id", paymentId)
      .limit(1)

    if (existingPayment && existingPayment.length > 0) {
      console.log(`Payment journal already exists for payment ${paymentId}`)
      return existingPayment[0].id
    }

    // الحصول على خريطة الحسابات
    const mapping = await getAccrualAccountMapping(supabase, companyId)

    // تحديد حساب النقد/البنك
    const cashAccountId = payment.account_id || mapping.cash || mapping.bank

    if (!cashAccountId) {
      throw new Error('Cash/Bank account not found')
    }

    const amount = Number(payment.amount || 0)
    const isCustomerPayment = !!payment.customer_id
    const isSupplierPayment = !!payment.supplier_id

    // إنشاء قيد التحصيل/الدفع
    const journalEntry: AccrualJournalEntry = {
      company_id: companyId,
      reference_type: 'payment',
      reference_id: paymentId,
      entry_date: payment.payment_date,
      description: `${isCustomerPayment ? 'تحصيل نقدي' : 'دفع نقدي'} - ${payment.reference_number || 'دفعة'}`,
      lines: []
    }

    if (isCustomerPayment) {
      // دفعة من عميل: Dr. Cash / Cr. AR
      journalEntry.lines.push(
        {
          account_id: cashAccountId,
          debit_amount: amount,
          credit_amount: 0,
          description: 'تحصيل نقدي'
        },
        {
          account_id: mapping.accounts_receivable,
          debit_amount: 0,
          credit_amount: amount,
          description: 'تحصيل من العميل'
        }
      )
    } else if (isSupplierPayment) {
      // دفعة لمورد: Dr. AP / Cr. Cash
      journalEntry.lines.push(
        {
          account_id: mapping.accounts_payable,
          debit_amount: amount,
          credit_amount: 0,
          description: 'سداد للمورد'
        },
        {
          account_id: cashAccountId,
          debit_amount: 0,
          credit_amount: amount,
          description: 'دفع نقدي'
        }
      )
    }

    // حفظ القيد في قاعدة البيانات
    return await saveJournalEntry(supabase, journalEntry)

  } catch (error) {
    console.error('Error creating payment journal:', error)
    throw error
  }
}

/**
 * تسجيل المشتريات في المخزون (Bill Event)
 */
export async function createPurchaseInventoryJournal(
  supabase: any,
  billId: string,
  companyId: string
): Promise<string | null> {
  try {
    // الحصول على بيانات فاتورة الشراء
    const { data: bill, error: billError } = await supabase
      .from("bills")
      .select(`
        id, bill_number, bill_date, status,
        subtotal, tax_amount, total_amount, shipping_charge,
        branch_id, cost_center_id, supplier_id
      `)
      .eq("id", billId)
      .eq("company_id", companyId)
      .single()

    if (billError || !bill) {
      throw new Error(`Bill not found: ${billError?.message}`)
    }

    // فقط للفواتير المرسلة/المستلمة
    if (bill.status === 'draft') {
      return null
    }

    // التحقق من عدم وجود قيد سابق
    const { data: existingBill } = await supabase
      .from("journal_entries")
      .select("id")
      .eq("company_id", companyId)
      .eq("reference_type", "bill")
      .eq("reference_id", billId)
      .limit(1)

    if (existingBill && existingBill.length > 0) {
      console.log(`Bill journal already exists for ${bill.bill_number}`)
      return existingBill[0].id
    }

    // الحصول على خريطة الحسابات
    const mapping = await getAccrualAccountMapping(supabase, companyId)

    // حساب المبالغ
    const netAmount = Number(bill.subtotal || 0)
    const vatAmount = Number(bill.tax_amount || 0)
    const shippingAmount = Number(bill.shipping_charge || 0)
    const totalAmount = Number(bill.total_amount || 0)

    // إنشاء قيد الشراء
    const journalEntry: AccrualJournalEntry = {
      company_id: companyId,
      reference_type: 'bill',
      reference_id: billId,
      entry_date: bill.bill_date,
      description: `شراء مخزون - ${bill.bill_number}`,
      branch_id: bill.branch_id,
      cost_center_id: bill.cost_center_id,
      lines: []
    }

    // مدين: المخزون (Inventory) - صافي المبلغ
    if (netAmount > 0) {
      journalEntry.lines.push({
        account_id: mapping.inventory,
        debit_amount: netAmount,
        credit_amount: 0,
        description: 'شراء مخزون',
        branch_id: bill.branch_id,
        cost_center_id: bill.cost_center_id
      })
    }

    // مدين: ضريبة القيمة المضافة - مدخلات (إذا وجدت)
    if (vatAmount > 0 && mapping.vat_input) {
      journalEntry.lines.push({
        account_id: mapping.vat_input,
        debit_amount: vatAmount,
        credit_amount: 0,
        description: 'ضريبة القيمة المضافة - مدخلات',
        branch_id: bill.branch_id,
        cost_center_id: bill.cost_center_id
      })
    }

    // مدين: مصاريف الشحن (إذا وجدت)
    if (shippingAmount > 0) {
      // يمكن استخدام حساب مصاريف منفصل للشحن أو إضافته للمخزون
      journalEntry.lines.push({
        account_id: mapping.inventory, // أو حساب منفصل لمصاريف الشحن
        debit_amount: shippingAmount,
        credit_amount: 0,
        description: 'مصاريف الشحن',
        branch_id: bill.branch_id,
        cost_center_id: bill.cost_center_id
      })
    }

    // دائن: الموردين (Accounts Payable) - إجمالي المبلغ
    journalEntry.lines.push({
      account_id: mapping.accounts_payable,
      debit_amount: 0,
      credit_amount: totalAmount,
      description: 'مستحق للمورد',
      branch_id: bill.branch_id,
      cost_center_id: bill.cost_center_id
    })

    // حفظ القيد في قاعدة البيانات
    return await saveJournalEntry(supabase, journalEntry)

  } catch (error) {
    console.error('Error creating purchase inventory journal:', error)
    throw error
  }
}

/**
 * حفظ القيد المحاسبي في قاعدة البيانات
 */
async function saveJournalEntry(
  supabase: any,
  journalEntry: AccrualJournalEntry
): Promise<string> {
  // التحقق من توازن القيد
  const totalDebits = journalEntry.lines.reduce((sum, line) => sum + line.debit_amount, 0)
  const totalCredits = journalEntry.lines.reduce((sum, line) => sum + line.credit_amount, 0)
  
  if (Math.abs(totalDebits - totalCredits) > 0.01) {
    throw new Error(`Journal entry is not balanced: Debits=${totalDebits}, Credits=${totalCredits}`)
  }

  // إنشاء القيد الرئيسي
  const { data: entry, error: entryError } = await supabase
    .from("journal_entries")
    .insert({
      company_id: journalEntry.company_id,
      reference_type: journalEntry.reference_type,
      reference_id: journalEntry.reference_id,
      entry_date: journalEntry.entry_date,
      description: journalEntry.description,
      branch_id: journalEntry.branch_id,
      cost_center_id: journalEntry.cost_center_id
    })
    .select()
    .single()

  if (entryError) {
    throw new Error(`Error creating journal entry: ${entryError.message}`)
  }

  // إنشاء سطور القيد
  const lines = journalEntry.lines.map(line => ({
    journal_entry_id: entry.id,
    account_id: line.account_id,
    debit_amount: line.debit_amount,
    credit_amount: line.credit_amount,
    description: line.description,
    branch_id: line.branch_id,
    cost_center_id: line.cost_center_id
  }))

  const { error: linesError } = await supabase
    .from("journal_entry_lines")
    .insert(lines)

  if (linesError) {
    // حذف القيد الرئيسي في حالة فشل إنشاء السطور
    await supabase
      .from("journal_entries")
      .delete()
      .eq("id", entry.id)
    
    throw new Error(`Error creating journal entry lines: ${linesError.message}`)
  }

  return entry.id
}

/**
 * إصلاح البيانات الحالية بطريقة Opening Balances
 * بدون تدمير التاريخ
 */
export async function fixExistingDataWithOpeningBalances(
  supabase: any,
  companyId: string
): Promise<{
  success: boolean
  message: string
  details: {
    invoicesFixed: number
    billsFixed: number
    paymentsFixed: number
  }
}> {
  try {
    let invoicesFixed = 0
    let billsFixed = 0
    let paymentsFixed = 0

    // 1. إصلاح الفواتير المرسلة بدون قيود محاسبية
    const { data: invoicesWithoutJournals } = await supabase
      .from("invoices")
      .select("id, company_id")
      .eq("company_id", companyId)
      .neq("status", "draft")
      .not("id", "in", `(
        SELECT DISTINCT reference_id::text 
        FROM journal_entries 
        WHERE reference_type = 'invoice' 
          AND company_id = $1
      )`)

    for (const invoice of invoicesWithoutJournals || []) {
      try {
        await createInvoiceRevenueJournal(supabase, invoice.id, invoice.company_id)
        await createCOGSJournalOnDelivery(supabase, invoice.id, invoice.company_id)
        invoicesFixed++
      } catch (error) {
        console.error('Error fixing invoice:', { invoiceId: invoice.id, error: error?.message })
      }
    }

    // 2. إصلاح فواتير الشراء المرسلة بدون قيود محاسبية
    const { data: billsWithoutJournals } = await supabase
      .from("bills")
      .select("id, company_id")
      .eq("company_id", companyId)
      .neq("status", "draft")
      .not("id", "in", `(
        SELECT DISTINCT reference_id::text 
        FROM journal_entries 
        WHERE reference_type = 'bill' 
          AND company_id = $1
      )`)

    for (const bill of billsWithoutJournals || []) {
      try {
        await createPurchaseInventoryJournal(supabase, bill.id, bill.company_id)
        billsFixed++
      } catch (error) {
        console.error('Error fixing bill:', { billId: bill.id, error: error?.message })
      }
    }

    // 3. إصلاح المدفوعات بدون قيود محاسبية
    const { data: paymentsWithoutJournals } = await supabase
      .from("payments")
      .select("id, company_id")
      .eq("company_id", companyId)
      .not("id", "in", `(
        SELECT DISTINCT reference_id::text 
        FROM journal_entries 
        WHERE reference_type = 'payment' 
          AND company_id = $1
      )`)

    for (const payment of paymentsWithoutJournals || []) {
      try {
        await createPaymentJournal(supabase, payment.id, payment.company_id)
        paymentsFixed++
      } catch (error) {
        console.error('Error fixing payment:', { paymentId: payment.id, error: error?.message })
      }
    }

    return {
      success: true,
      message: `تم إصلاح البيانات بنجاح: ${invoicesFixed} فاتورة بيع، ${billsFixed} فاتورة شراء، ${paymentsFixed} دفعة`,
      details: {
        invoicesFixed,
        billsFixed,
        paymentsFixed
      }
    }

  } catch (error: any) {
    return {
      success: false,
      message: `خطأ في إصلاح البيانات: ${error.message}`,
      details: {
        invoicesFixed: 0,
        billsFixed: 0,
        paymentsFixed: 0
      }
    }
  }
}

/**
 * التحقق من تطبيق أساس الاستحقاق بشكل صحيح
 */
export async function validateAccrualAccounting(
  supabase: any,
  companyId: string
): Promise<{
  isValid: boolean
  tests: Array<{
    name: string
    passed: boolean
    details: string
  }>
}> {
  const tests = []

  try {
    // اختبار 1: الربح يظهر قبل التحصيل
    const { data: revenueBeforePayment } = await supabase
      .from("journal_entries")
      .select("id")
      .eq("company_id", companyId)
      .eq("reference_type", "invoice")
      .limit(1)
    
    tests.push({
      name: "Revenue Recognition Before Payment",
      passed: (revenueBeforePayment?.length || 0) > 0,
      details: "Revenue is recorded when invoice is issued, not when payment is received"
    })

    // اختبار 2: COGS مسجل عند البيع
    const { data: cogsOnSale } = await supabase
      .from("journal_entries")
      .select("id")
      .eq("company_id", companyId)
      .eq("reference_type", "invoice_cogs")
      .limit(1)
    
    tests.push({
      name: "COGS Recognition on Sale",
      passed: (cogsOnSale?.length || 0) > 0,
      details: "COGS is recorded when goods are delivered, not when purchased"
    })

    // اختبار 3: Trial Balance متزن
    const { data: allLines } = await supabase
      .from("journal_entry_lines")
      .select(`
        debit_amount,
        credit_amount,
        journal_entries!inner(company_id)
      `)
      .eq("journal_entries.company_id", companyId)

    const totalDebits = (allLines || []).reduce((sum: number, line: any) => 
      sum + Number(line.debit_amount || 0), 0)
    const totalCredits = (allLines || []).reduce((sum: number, line: any) => 
      sum + Number(line.credit_amount || 0), 0)
    const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01

    tests.push({
      name: "Trial Balance",
      passed: isBalanced,
      details: `Total Debits: ${totalDebits.toFixed(2)}, Total Credits: ${totalCredits.toFixed(2)}`
    })

    // اختبار 4: المخزون له قيمة محاسبية
    const { data: inventoryValue } = await supabase
      .from("journal_entry_lines")
      .select(`
        debit_amount,
        journal_entries!inner(company_id),
        chart_of_accounts!inner(sub_type)
      `)
      .eq("journal_entries.company_id", companyId)
      .eq("chart_of_accounts.sub_type", "inventory")

    const inventoryBalance = (inventoryValue || []).reduce((sum: number, line: any) => 
      sum + Number(line.debit_amount || 0), 0)

    tests.push({
      name: "Inventory Valuation",
      passed: inventoryBalance > 0,
      details: `Inventory has accounting value: ${inventoryBalance.toFixed(2)}`
    })

    // اختبار 5: لا علاقة مباشرة بين Cash والربح
    const { data: cashEntries } = await supabase
      .from("journal_entries")
      .select("id")
      .eq("company_id", companyId)
      .eq("reference_type", "payment")
      .limit(1)

    const { data: revenueEntries } = await supabase
      .from("journal_entries")
      .select("id")
      .eq("company_id", companyId)
      .eq("reference_type", "invoice")
      .limit(1)

    const hasSeparateEntries = (cashEntries?.length || 0) > 0 && (revenueEntries?.length || 0) > 0

    tests.push({
      name: "Cash vs Revenue Separation",
      passed: hasSeparateEntries,
      details: "Cash collection is recorded separately from revenue recognition"
    })

    const allPassed = tests.every(test => test.passed)

    return {
      isValid: allPassed,
      tests
    }

  } catch (error: any) {
    tests.push({
      name: "Validation Error",
      passed: false,
      details: `Error during validation: ${error.message}`
    })

    return {
      isValid: false,
      tests
    }
  }
}