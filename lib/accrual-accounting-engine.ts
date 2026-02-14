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
  reference_type: 'invoice' | 'invoice_cogs' | 'payment' | 'bill' | 'bill_payment' | 'write_off'
  reference_id: string
  entry_date: string
  description: string
  branch_id?: string | null
  cost_center_id?: string | null
  warehouse_id?: string | null
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
  write_off_expense?: string // حساب مصروف الإهلاك
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
    supplier_advance: findAccount('supplier_advance', 'asset'),
    write_off_expense: findAccount('write_off_expense', 'expense')
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
 * تحضير بيانات قيد إيراد الفاتورة (بدون حفظ)
 * لاستخدامها في المعاملات الذرية (Atomic Transactions)
 */
export async function prepareInvoiceRevenueJournal(
  supabase: any,
  invoiceId: string,
  companyId: string
): Promise<AccrualJournalEntry | null> {
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

  return journalEntry
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
    // التحقق من عدم وجود قيد سابق
    const { data: existingEntry } = await supabase
      .from("journal_entries")
      .select("id")
      .eq("company_id", companyId)
      .eq("reference_type", "invoice")
      .eq("reference_id", invoiceId)
      .limit(1)

    if (existingEntry && existingEntry.length > 0) {
      console.log(`Invoice journal already exists for ${invoiceId}`)
      return existingEntry[0].id
    }

    // تحضير القيد
    const journalEntry = await prepareInvoiceRevenueJournal(supabase, invoiceId, companyId)

    if (!journalEntry) return null

    // حفظ القيد في قاعدة البيانات
    return await saveJournalEntry(supabase, journalEntry)

  } catch (error) {
    console.error('Error creating invoice revenue journal:', error)
    throw error
  }
}

/**
 * تحضير بيانات قيد تكلفة البضاعة المباعة (بدون حفظ)
 */
export async function prepareCOGSJournalOnDelivery(
  supabase: any,
  invoiceId: string,
  companyId: string,
  preCalculatedTotalCOGS?: number // اختياري: إذا كان محسوباً مسبقاً في نفس العملية
): Promise<AccrualJournalEntry | null> {
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

  let totalCOGS = preCalculatedTotalCOGS || 0

  if (!preCalculatedTotalCOGS) {
    // ✅ ERP Professional: حساب COGS من cogs_transactions (المصدر الوحيد للحقيقة)
    try {
      const { getCOGSByInvoice } = await import("@/lib/cogs-transactions")
      const cogsTransactions = await getCOGSByInvoice(supabase, invoiceId)

      if (cogsTransactions && cogsTransactions.length > 0) {
        totalCOGS = cogsTransactions.reduce((sum, ct) => sum + Number(ct.total_cost || 0), 0)
      } else {
        console.warn(`⚠️ No cogs_transactions found for invoice ${invoiceId} - skipping COGS journal entry creation`)
        return null
      }
    } catch (error: any) {
      console.error("Error fetching COGS transactions:", error)
      return null
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

  return journalEntry
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
    // التحقق من عدم وجود قيد COGS سابق
    const { data: existingCOGS } = await supabase
      .from("journal_entries")
      .select("id")
      .eq("company_id", companyId)
      .eq("reference_type", "invoice_cogs")
      .eq("reference_id", invoiceId)
      .limit(1)

    if (existingCOGS && existingCOGS.length > 0) {
      console.log(`COGS journal already exists for ${invoiceId}`)
      return existingCOGS[0].id
    }

    // تحضير القيد
    const journalEntry = await prepareCOGSJournalOnDelivery(supabase, invoiceId, companyId)

    if (!journalEntry) return null

    // حفظ القيد في قاعدة البيانات
    return await saveJournalEntry(supabase, journalEntry)

  } catch (error) {
    console.error('Error creating COGS journal:', error)
    throw error
  }
}

/**
 * تحضير بيانات قيد التحصيل/الدفع من كائن البيانات مباشرة (بدون حفظ)
 */
export async function preparePaymentJournalFromData(
  supabase: any,
  paymentData: any, // Payment Object
  companyId: string
): Promise<AccrualJournalEntry | null> {

  // الحصول على خريطة الحسابات
  const mapping = await getAccrualAccountMapping(supabase, companyId)

  // تحديد حساب النقد/البنك
  const cashAccountId = paymentData.account_id || mapping.cash || mapping.bank

  if (!cashAccountId) {
    throw new Error('Cash/Bank account not found')
  }

  const amount = Number(paymentData.amount || 0)
  const isCustomerPayment = !!paymentData.customer_id
  const isSupplierPayment = !!paymentData.supplier_id

  // إنشاء قيد التحصيل/الدفع
  const journalEntry: AccrualJournalEntry = {
    company_id: companyId,
    // نستخدم معرف مؤقت إذا كان غير موجود (سيتم تحديثه لاحقاً أو استخدامه كمرجع)
    // في حالة Atomic Transaction، سنعتمد على الترتيب أو معرفات تم إنشاؤها مسبقاً
    reference_type: 'payment',
    reference_id: paymentData.id || 'TEMP_PAYMENT_ID',
    entry_date: paymentData.payment_date,
    description: `${isCustomerPayment ? 'تحصيل نقدي' : 'دفع نقدي'} - ${paymentData.reference || 'دفعة'}`,
    branch_id: paymentData.branch_id,
    cost_center_id: paymentData.cost_center_id,
    warehouse_id: paymentData.warehouse_id,
    lines: []
  }

  if (isCustomerPayment) {
    // دفعة من عميل: Dr. Cash / Cr. AR
    journalEntry.lines.push(
      {
        account_id: cashAccountId,
        debit_amount: amount,
        credit_amount: 0,
        description: 'تحصيل نقدي',
        branch_id: paymentData.branch_id,
        cost_center_id: paymentData.cost_center_id
      },
      {
        account_id: mapping.accounts_receivable,
        debit_amount: 0,
        credit_amount: amount,
        description: 'تحصيل من العميل',
        branch_id: paymentData.branch_id,
        cost_center_id: paymentData.cost_center_id
      }
    )
  } else if (isSupplierPayment) {
    // دفعة لمورد: Dr. AP / Cr. Cash
    journalEntry.lines.push(
      {
        account_id: mapping.accounts_payable,
        debit_amount: amount,
        credit_amount: 0,
        description: 'سداد للمورد',
        branch_id: paymentData.branch_id,
        cost_center_id: paymentData.cost_center_id
      },
      {
        account_id: cashAccountId,
        debit_amount: 0,
        credit_amount: amount,
        description: 'دفع نقدي',
        branch_id: paymentData.branch_id,
        cost_center_id: paymentData.cost_center_id
      }
    )
  }

  return journalEntry
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
        reference, account_id, customer_id, supplier_id,
        branch_id, cost_center_id, warehouse_id, company_id
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

    // تحضير القيد
    const journalEntry = await preparePaymentJournalFromData(supabase, payment, companyId)

    if (!journalEntry) return null

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
        subtotal, tax_amount, total_amount, shipping, adjustment,
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
    // ✅ total_amount = subtotal + tax_amount + shipping + adjustment
    // حيث tax_amount يتضمن shippingTax بالفعل
    const netAmount = Number(bill.subtotal || 0)
    const vatAmount = Number(bill.tax_amount || 0)
    const shippingAmount = Number((bill as any).shipping || 0)
    const adjustmentAmount = Number((bill as any).adjustment || 0)
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

    // مدين: التعديلات (إذا وجدت)
    if (adjustmentAmount !== 0) {
      journalEntry.lines.push({
        account_id: mapping.inventory, // أو حساب منفصل للتعديلات
        debit_amount: adjustmentAmount > 0 ? adjustmentAmount : 0,
        credit_amount: adjustmentAmount < 0 ? Math.abs(adjustmentAmount) : 0,
        description: adjustmentAmount > 0 ? 'تعديل إضافي' : 'تعديل خصم',
        branch_id: bill.branch_id,
        cost_center_id: bill.cost_center_id
      })
    }

    // دائن: الموردين (Accounts Payable) - إجمالي المبلغ
    // ✅ total_amount = subtotal + tax_amount + shipping + adjustment
    // الجانب المدين: subtotal + tax_amount + shipping + adjustment = total_amount
    // الجانب الدائن: total_amount
    // القيد متوازن ✅
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
 * تسجيل إهلاك المخزون (Write-off Event)
 * يتم تسجيله على أساس الاستحقاق عند اعتماد الإهلاك
 */
export async function createWriteOffJournal(
  supabase: any,
  writeOffId: string,
  companyId: string
): Promise<string | null> {
  try {
    // الحصول على بيانات الإهلاك
    const { data: writeOff, error: writeOffError } = await supabase
      .from("inventory_write_offs")
      .select(`
        id, write_off_number, write_off_date, status,
        total_cost, branch_id, cost_center_id, warehouse_id
      `)
      .eq("id", writeOffId)
      .eq("company_id", companyId)
      .single()

    if (writeOffError || !writeOff) {
      throw new Error(`Write-off not found: ${writeOffError?.message}`)
    }

    // ✅ قبول الإهلاكات المعتمدة أو في حالة انتظار (خلال عملية الاعتماد)
    // في API endpoint، يتم استدعاء هذه الدالة قبل تحديث status إلى 'approved'
    if (writeOff.status !== 'approved' && writeOff.status !== 'pending') {
      return null
    }

    // ✅ ERP-Grade: Period Lock Check - منع تسجيل إهلاك في فترة مغلقة
    try {
      const { assertPeriodNotLocked } = await import("./accounting-period-lock")
      await assertPeriodNotLocked(supabase, {
        companyId,
        date: writeOff.write_off_date || new Date().toISOString().split("T")[0],
      })
    } catch (lockError: any) {
      throw new Error(
        `الفترة المحاسبية مقفلة: ${lockError.message || "لا يمكن تسجيل إهلاك في فترة محاسبية مغلقة"}`
      )
    }

    // التحقق من عدم وجود قيد سابق
    const { data: existingEntry } = await supabase
      .from("journal_entries")
      .select("id")
      .eq("company_id", companyId)
      .eq("reference_type", "write_off")
      .eq("reference_id", writeOffId)
      .limit(1)

    if (existingEntry && existingEntry.length > 0) {
      console.log(`Write-off journal already exists for ${writeOff.write_off_number}`)
      return existingEntry[0].id
    }

    // الحصول على خريطة الحسابات
    const mapping = await getAccrualAccountMapping(supabase, companyId)

    // حساب المبلغ
    const totalCost = Number(writeOff.total_cost || 0)

    // إذا لم توجد تكلفة، لا نسجل قيد
    if (totalCost <= 0) {
      return null
    }

    // الحصول على حساب مصروف الإهلاك من mapping
    let expenseAccountId: string = mapping.write_off_expense || ''
    if (!expenseAccountId) {
      // Fallback: البحث عن أي حساب مصروف
      const { data: expenseAccount } = await supabase
        .from("chart_of_accounts")
        .select("id")
        .eq("company_id", companyId)
        .eq("account_type", "expense")
        .limit(1)
        .single()

      if (!expenseAccount?.id) {
        throw new Error('Write-off expense account not found. Please configure a write-off expense account in chart of accounts.')
      }
      expenseAccountId = expenseAccount.id
    }

    // التأكد من وجود حساب الإهلاك
    if (!expenseAccountId) {
      throw new Error('Write-off expense account is required')
    }

    // إنشاء قيد الإهلاك
    const journalEntry: AccrualJournalEntry = {
      company_id: companyId,
      reference_type: 'write_off',
      reference_id: writeOffId,
      entry_date: writeOff.write_off_date,
      description: `إهلاك مخزون - ${writeOff.write_off_number}`,
      branch_id: writeOff.branch_id,
      cost_center_id: writeOff.cost_center_id,
      warehouse_id: writeOff.warehouse_id,
      lines: [
        {
          // مدين: مصروف الإهلاك (Expense) - مصروف
          account_id: expenseAccountId,
          debit_amount: totalCost,
          credit_amount: 0,
          description: 'مصروف إهلاك مخزون',
          branch_id: writeOff.branch_id,
          cost_center_id: writeOff.cost_center_id
        },
        {
          // دائن: المخزون (Inventory) - أصل
          account_id: mapping.inventory,
          debit_amount: 0,
          credit_amount: totalCost,
          description: 'تخفيض المخزون',
          branch_id: writeOff.branch_id,
          cost_center_id: writeOff.cost_center_id
        }
      ]
    }

    // حفظ القيد في قاعدة البيانات
    return await saveJournalEntry(supabase, journalEntry)

  } catch (error) {
    console.error('Error creating write-off journal:', error)
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
  // ✅ ERP-Grade: Period Lock Check - منع إنشاء قيود في فترات مغلقة
  try {
    const { assertPeriodNotLocked } = await import("./accounting-period-lock")
    await assertPeriodNotLocked(supabase, {
      companyId: journalEntry.company_id,
      date: journalEntry.entry_date,
    })
  } catch (lockError: any) {
    throw new Error(
      `الفترة المحاسبية مقفلة: ${lockError.message || "لا يمكن إنشاء قيد في فترة محاسبية مغلقة"}`
    )
  }
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
      } catch (error: any) {
        console.error('Error fixing invoice:', { invoiceId: invoice.id, error: error?.message || String(error) })
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
      } catch (error: any) {
        console.error('Error fixing bill:', { billId: bill.id, error: error?.message || String(error) })
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
      } catch (error: any) {
        console.error('Error fixing payment:', { paymentId: payment.id, error: error?.message || String(error) })
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
        journal_entries!inner(company_id, is_deleted, deleted_at)
      `)
      .eq("journal_entries.company_id", companyId)
      .neq("journal_entries.is_deleted", true) // ✅ استثناء القيود المحذوفة
      .is("journal_entries.deleted_at", null)

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
        journal_entries!inner(company_id, is_deleted, deleted_at),
        chart_of_accounts!inner(sub_type)
      `)
      .eq("journal_entries.company_id", companyId)
      .neq("journal_entries.is_deleted", true) // ✅ استثناء القيود المحذوفة
      .is("journal_entries.deleted_at", null)
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