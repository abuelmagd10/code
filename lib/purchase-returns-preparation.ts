/**
 * 📌 Purchase Returns Preparation Functions
 * دوال تجهيز بيانات مرتجعات المشتريات (Calculate Phase)
 *
 * Pattern: Calculate-then-Commit
 * - NO database writes
 * - Returns structured payloads for process_purchase_return_atomic RPC
 *
 * Accounting rules enforced here:
 *   Credit return  → Dr AP / Dr VendorCreditLiability  |  Cr Inventory/Expense + Cr VAT Input
 *   Cash/Bank      → Dr Cash / Dr Bank                  |  Cr Inventory/Expense + Cr VAT Input
 *
 * When vatInput is NOT configured the VAT amount falls back into the
 * Inventory/Expense line so the entry stays balanced.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Input types ─────────────────────────────────────────────────────────────

export interface PurchaseReturnItem {
  item_id:          string
  product_id:       string | null
  product_name:     string
  return_qty:       number
  unit_price:       number
  tax_rate:         number
  discount_percent: number
}

export interface PurchaseReturnParams {
  billId:          string
  billNumber:      string
  companyId:       string
  supplierId:      string
  branchId:        string
  warehouseId:     string
  costCenterId:    string
  returnItems:     PurchaseReturnItem[]
  returnMethod:    'credit' | 'cash' | 'bank'
  returnAccountId?: string | null
  isPaid:          boolean
  lang:            'ar' | 'en'
}

// ─── Payload sub-types ────────────────────────────────────────────────────────

interface JournalHeader {
  company_id:        string
  branch_id:         string
  cost_center_id:    string
  entry_date:        string
  description:       string
  reference_type:    string
  status:            string
  validation_status: string
}

interface JournalLine {
  account_id:    string
  description:   string
  debit_amount:  number
  credit_amount: number
}

interface ReturnItemPayload {
  bill_item_id:     string
  product_id:       string | null
  quantity:         number
  description:      string
  unit_price:       number
  tax_rate:         number
  discount_percent: number
  line_total:       number   // net without tax
}

// ─── Result type ──────────────────────────────────────────────────────────────

export interface PurchaseReturnResult {
  success: boolean
  error?:  string
  payload?: {
    purchaseReturn: {
      company_id:        string
      supplier_id:       string
      bill_id:           string
      return_number:     string
      return_date:       string
      subtotal:          number
      tax_amount:        number
      total_amount:      number
      settlement_method: string
      status:            string
      reason:            string
      notes:             string
      branch_id:         string
      cost_center_id:    string
      warehouse_id:      string
    }
    returnItems:       ReturnItemPayload[]
    vendorCredit?:     {
      company_id:     string
      supplier_id:    string
      bill_id:        string
      credit_number:  string
      credit_date:    string
      status:         string
      subtotal:       number
      tax_amount:     number
      total_amount:   number
      applied_amount: number
      branch_id:      string
      cost_center_id: string
      warehouse_id:   string
      notes:          string
    }
    vendorCreditItems?: Array<{
      product_id:       string
      description:      string
      quantity:         number
      unit_price:       number
      tax_rate:         number
      discount_percent: number
      line_total:       number
    }>
    journalHeader: JournalHeader
    journalLines:  JournalLine[]
    billUpdate: {
      status?:          string
      returned_amount?: number
      return_status?:   string
    }
  }
}

// ─── Main preparation function ────────────────────────────────────────────────

/**
 * Prepares the full payload for process_purchase_return_atomic RPC.
 *
 * Key differences from the old prepare function:
 * 1. VAT is reversed into its own journal line (Cr VAT Input).
 * 2. pre-validates available quantities against current bill_items.
 * 3. Produces returnItems[] for p_return_items (new RPC handles inventory
 *    transactions and bill_items.returned_quantity internally with proper locks).
 * 4. Separates journalHeader / journalLines (new RPC signature).
 * 5. No inventoryTransactions or billItemsUpdate in the payload (handled by RPC).
 */
export async function preparePurchaseReturnData(
  supabase: SupabaseClient,
  params: PurchaseReturnParams,
  accountMapping: {
    companyId:              string
    ap:                     string
    inventory?:             string
    expense?:               string
    vatInput?:              string
    vendorCreditLiability?: string
    cash?:                  string
    bank?:                  string
  }
): Promise<PurchaseReturnResult> {
  try {
    const {
      billId, billNumber, companyId, supplierId,
      branchId, warehouseId, costCenterId,
      returnItems, returnMethod, returnAccountId, isPaid, lang,
    } = params

    if (!branchId || !warehouseId || !costCenterId) {
      return {
        success: false,
        error: lang === 'en'
          ? 'Branch, Warehouse, and Cost Center are required'
          : 'الفرع والمخزن ومركز التكلفة مطلوبة',
      }
    }

    // ── 1) Pre-fetch bill_items for client-side quantity validation ────────────
    // The RPC will also validate with a FOR UPDATE lock, but we validate here
    // early to give a clear error before hitting the DB transaction.
    const itemIds = returnItems.map(it => it.item_id).filter(Boolean)
    const { data: currentBillItems, error: biErr } = await supabase
      .from('bill_items')
      .select('id, quantity, returned_quantity')
      .in('id', itemIds)

    if (biErr) {
      return { success: false, error: `Failed to fetch bill items: ${biErr.message}` }
    }

    const billItemMap: Record<string, { quantity: number; returned_quantity: number }> = {}
    for (const bi of currentBillItems || []) {
      billItemMap[bi.id] = {
        quantity:          Number(bi.quantity          || 0),
        returned_quantity: Number(bi.returned_quantity || 0),
      }
    }

    for (const item of returnItems) {
      if (item.return_qty <= 0) continue
      const current = billItemMap[item.item_id]
      if (!current) continue
      const available = current.quantity - current.returned_quantity
      if (item.return_qty > available) {
        return {
          success: false,
          error: lang === 'en'
            ? `Cannot return ${item.return_qty} units of "${item.product_name}". Available: ${available}`
            : `لا يمكن إرجاع ${item.return_qty} وحدة من "${item.product_name}". المتاح: ${available}`,
        }
      }
    }

    // ── 2) Calculate return totals ────────────────────────────────────────────
    let returnedSubtotal = 0
    let returnedTax      = 0

    for (const item of returnItems) {
      if (item.return_qty <= 0) continue
      const lineNet = item.unit_price * (1 - (item.discount_percent || 0) / 100) * item.return_qty
      returnedSubtotal += lineNet
      returnedTax      += lineNet * (item.tax_rate || 0) / 100
    }

    const returnTotal = returnedSubtotal + returnedTax

    // ── 3) Return number / date ───────────────────────────────────────────────
    const returnNumber = `PRET-${Date.now().toString().slice(-8)}`
    const returnDate   = new Date().toISOString().slice(0, 10)

    // ── 4) Purchase return header ─────────────────────────────────────────────
    const purchaseReturn = {
      company_id:        companyId,
      supplier_id:       supplierId,
      bill_id:           billId,
      return_number:     returnNumber,
      return_date:       returnDate,
      subtotal:          returnedSubtotal,
      tax_amount:        returnedTax,
      total_amount:      returnTotal,
      settlement_method: returnMethod,
      status:            'completed',
      reason:            lang === 'en' ? 'Purchase return'   : 'مرتجع مشتريات',
      notes:             lang === 'en'
        ? `Purchase return for bill ${billNumber}`
        : `مرتجع مشتريات للفاتورة ${billNumber}`,
      branch_id:      branchId,
      cost_center_id: costCenterId,
      warehouse_id:   warehouseId,
    }

    // ── 5) Return items payload (p_return_items) ──────────────────────────────
    // The new RPC uses this array to:
    //  a) insert purchase_return_items
    //  b) create inventory_transactions (with proper reference_id = purchase_return.id)
    //  c) increment bill_items.returned_quantity with COALESCE + lock
    const returnItemsPayload: ReturnItemPayload[] = returnItems
      .filter(item => item.return_qty > 0)
      .map(item => {
        const lineNet = item.unit_price * (1 - (item.discount_percent || 0) / 100) * item.return_qty
        return {
          bill_item_id:     item.item_id,
          product_id:       item.product_id,
          quantity:         item.return_qty,
          description:      item.product_name,
          unit_price:       item.unit_price,
          tax_rate:         item.tax_rate         || 0,
          discount_percent: item.discount_percent || 0,
          line_total:       lineNet,
        }
      })

    // ── 6) Vendor Credit (credit returns on paid bills only) ──────────────────
    // For unpaid bills with credit return: AP is reduced directly via journal.
    // For paid bills with credit return: a vendor_credit record tracks the credit.
    let vendorCredit: any     = undefined
    let vendorCreditItems: any[] = []

    if (returnMethod === 'credit' && isPaid) {
      const creditNumber = `VC-${Date.now().toString().slice(-8)}`
      vendorCredit = {
        company_id:     companyId,
        supplier_id:    supplierId,
        bill_id:        billId,
        credit_number:  creditNumber,
        credit_date:    returnDate,
        status:         'open',
        subtotal:       returnedSubtotal,
        tax_amount:     returnedTax,
        total_amount:   returnTotal,
        applied_amount: 0,
        branch_id:      branchId,
        cost_center_id: costCenterId,
        warehouse_id:   warehouseId,
        notes: lang === 'en'
          ? `Vendor credit for purchase return ${returnNumber}`
          : `إشعار دائن للمرتجع ${returnNumber}`,
      }

      vendorCreditItems = returnItems
        .filter(item => item.product_id && item.return_qty > 0)
        .map(item => {
          const lineNet = item.unit_price * (1 - (item.discount_percent || 0) / 100) * item.return_qty
          return {
            product_id:       item.product_id!,
            description:      item.product_name,
            quantity:         item.return_qty,
            unit_price:       item.unit_price,
            tax_rate:         item.tax_rate         || 0,
            discount_percent: item.discount_percent || 0,
            line_total:       lineNet,
          }
        })
    }

    // ── 7) Journal entry lines ────────────────────────────────────────────────
    //
    // Inventory vs Expense mapping:
    //   accountMapping.inventory is set for product/goods bills → Cr Inventory
    //   accountMapping.expense   is fallback for service/overhead bills → Cr Expense
    //   The caller (findAccountIds) prefers inventory; we honour that preference here.
    //
    // VAT Input reversal:
    //   When vatInput is configured AND returnedTax > 0:
    //     Cr Inventory/Expense = returnedSubtotal  (excluding tax)
    //     Cr VAT Input         = returnedTax
    //   Otherwise (no vatInput account):
    //     Cr Inventory/Expense = returnTotal       (balanced fallback)

    const invOrExp    = accountMapping.inventory || accountMapping.expense
    const hasVatSplit = !!(accountMapping.vatInput && returnedTax > 0.005)

    const journalLines: JournalLine[] = []

    // — Debit side ————————————————————————————————————————————————————————————
    if (returnMethod === 'credit') {
      // For unpaid bills: Dr AP directly reduces what we owe.
      // For paid bills: Dr Vendor Credit Liability (AP Contra) or AP if not set.
      const debitAccount = accountMapping.vendorCreditLiability || accountMapping.ap
      journalLines.push({
        account_id:    debitAccount,
        description:   lang === 'en'
          ? (isPaid ? 'Vendor Credit Liability (AP Contra)' : 'Accounts Payable reduction')
          : (isPaid ? 'إشعار دائن المورد (AP Contra)'        : 'تخفيض الذمم الدائنة'),
        debit_amount:  returnTotal,
        credit_amount: 0,
      })
    } else {
      // Cash / Bank refund: supplier returns money to us
      const refundAccount = returnAccountId
        || (returnMethod === 'cash' ? accountMapping.cash : accountMapping.bank)

      if (!refundAccount) {
        return {
          success: false,
          error: lang === 'en' ? 'No refund account found' : 'لم يتم العثور على حساب للاسترداد',
        }
      }

      journalLines.push({
        account_id:    refundAccount,
        description:   returnMethod === 'cash'
          ? (lang === 'en' ? 'Cash refund received'  : 'استرداد نقدي مستلم')
          : (lang === 'en' ? 'Bank refund received'  : 'استرداد بنكي مستلم'),
        debit_amount:  returnTotal,
        credit_amount: 0,
      })
    }

    // — Credit side — Inventory / Expense ─────────────────────────────────────
    if (invOrExp) {
      journalLines.push({
        account_id:    invOrExp,
        description:   accountMapping.inventory
          ? (lang === 'en' ? 'Inventory returned to supplier' : 'مخزون مرتجع للمورد')
          : (lang === 'en' ? 'Expense reversal'               : 'عكس المصروف'),
        debit_amount:  0,
        // If vatInput is available: credit only the net subtotal here.
        // If vatInput is NOT available: credit the full total (balanced fallback).
        credit_amount: hasVatSplit ? returnedSubtotal : returnTotal,
      })
    }

    // — Credit side — VAT Input reversal ──────────────────────────────────────
    if (hasVatSplit && accountMapping.vatInput) {
      journalLines.push({
        account_id:    accountMapping.vatInput,
        description:   lang === 'en'
          ? 'VAT Input reversal (purchase return)'
          : 'عكس ضريبة المدخلات (مرتجع مشتريات)',
        debit_amount:  0,
        credit_amount: returnedTax,
      })
    }

    // ── 8) Journal header ─────────────────────────────────────────────────────
    const journalHeader: JournalHeader = {
      company_id:        companyId,
      branch_id:         branchId,
      cost_center_id:    costCenterId,
      entry_date:        returnDate,
      description:       lang === 'en'
        ? `Purchase return for bill ${billNumber}`
        : `مرتجع مشتريات للفاتورة ${billNumber}`,
      reference_type:    'purchase_return',
      status:            'posted',
      validation_status: 'valid',
    }

    // ── 9) Bill update ────────────────────────────────────────────────────────
    const { data: currentBill } = await supabase
      .from('bills')
      .select('total_amount, returned_amount, status')
      .eq('id', billId)
      .single()

    const billUpdate: Record<string, any> = {}
    if (currentBill) {
      const newReturnedAmount = (Number(currentBill.returned_amount) || 0) + returnTotal
      billUpdate.returned_amount = newReturnedAmount

      if (newReturnedAmount >= Number(currentBill.total_amount) - 0.005) {
        billUpdate.return_status = 'fully_returned'
        if (!isPaid) billUpdate.status = 'fully_returned'
      } else if (newReturnedAmount > 0.005) {
        billUpdate.return_status = 'partially_returned'
      }
    }

    // ── 10) Final payload ─────────────────────────────────────────────────────
    return {
      success: true,
      payload: {
        purchaseReturn,
        returnItems:       returnItemsPayload,
        vendorCredit,
        vendorCreditItems: vendorCreditItems.length > 0 ? vendorCreditItems : undefined,
        journalHeader,
        journalLines,
        billUpdate,
      },
    }
  } catch (error: any) {
    return { success: false, error: `Preparation failed: ${error.message}` }
  }
}
