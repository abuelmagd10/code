/**
 * Bundle expansion helpers — client-side glue between
 *   GET /api/products/[id]/bundle/expand?qty=N
 * and the invoice / sales-order item arrays the UI builds before submit.
 */

export interface ExpandedBundleRow {
  child_product_id:      string
  parent_product_id:     string
  parent_name:           string
  name:                  string
  sku?:                  string
  quantity:              number
  unit_price:            number
  effective_unit_price:  number
  cost_price:            number
  is_optional:           boolean
  auto_deduct_inventory: boolean
  price_handling:        "add_to_total" | "included" | "free"
  income_account_id:     string | null
  expense_account_id:    string | null
  display_order:         number
  description_hint:      string
}

export interface BundleExpandResponse {
  success:      boolean
  parent:       { product_id: string; parent_qty: number }
  rows:         ExpandedBundleRow[]
  has_optional: boolean
}

/**
 * Loose shape of an invoice / sales-order line item the UI builds before POST.
 * The two underscored fields are UI-only markers that MUST be stripped before
 * the request body is sent to the API.
 */
export interface InvoiceLineDraft {
  product_id:        string
  description?:      string
  quantity:          number
  unit_price:        number
  tax_rate?:         number
  // legacy fields some pages add (kept for compatibility)
  line_total?:       number
  discount_percent?: number
  // ── UI-only markers, stripped by stripBundleMarkers() ──
  __bundle_parent_id?: string
  __bundle_role?:      "parent" | "child"
  __bundle_locked?:    boolean
  __bundle_handling?:  ExpandedBundleRow["price_handling"]
}

/**
 * Convert one expanded bundle row into a UI-ready invoice line.
 * Tax rate is inherited from the parent line if provided, else 0 (services
 * usually keep tax with the parent; reports still see each line independently
 * since they read the tax_rate column directly).
 */
export function bundleRowToInvoiceItem(
  r: ExpandedBundleRow,
  options: { taxRate?: number } = {}
): InvoiceLineDraft {
  const qty       = Number(r.quantity || 0)
  const unitPrice = Number(r.effective_unit_price || 0)
  const taxRate   = Number(options.taxRate ?? 0)

  return {
    product_id:        r.child_product_id,
    description:       r.description_hint,
    quantity:          qty,
    unit_price:        unitPrice,
    tax_rate:          taxRate,
    line_total:        +(qty * unitPrice).toFixed(4),
    discount_percent:  0,
    __bundle_parent_id: r.parent_product_id,
    __bundle_role:      "child",
    __bundle_locked:    !r.is_optional, // mandatory children cannot be deleted manually
    __bundle_handling:  r.price_handling,
  }
}

/**
 * Strip every UI-only marker before POSTing the items to the API.
 * Idempotent — safe to call twice.
 */
export function stripBundleMarkers<T extends InvoiceLineDraft>(items: T[]): Array<Omit<T,
  "__bundle_parent_id" | "__bundle_role" | "__bundle_locked" | "__bundle_handling">> {
  return items.map((it) => {
    const { __bundle_parent_id, __bundle_role, __bundle_locked, __bundle_handling, ...clean } = it as any
    return clean
  })
}
