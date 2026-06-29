/**
 * lib/document-totals.ts
 *
 * Single source of truth for computing line-level + header-level totals
 * on every document type that carries items + a header discount + tax:
 *
 *   - Purchase orders + bills
 *   - Sales orders + sales invoices + customer estimates
 *   - Sales returns + purchase returns
 *   - Vendor credits + customer debit notes
 *
 * Why this exists (v3.74.395)
 * ---------------------------
 * Until this commit every form had its own inline `calculateTotals`
 * implementation. The inline copies drifted:
 *   - app/purchase-orders/new      → discount_position was ignored (bug
 *                                     owner reported: changing position
 *                                     produced identical totals).
 *   - app/bills/[id]/edit          → correct.
 *   - app/invoices/new             → correct.
 *   - app/sales-orders/new         → correct.
 *   - others                       → unknown state — some likely broken.
 * Pulling everything into one function eliminates the drift class.
 *
 * Discount-position semantics
 * ---------------------------
 * "before_tax": the discount lowers the taxable base. The tax is
 *   recomputed proportionally on the reduced base. Total = (subtotal -
 *   discount) + adjusted_tax + shipping + adjustment.
 *
 * "after_tax": the tax is computed on the full subtotal. Discount comes
 *   off the after-tax sum. Total = subtotal + tax - discount + shipping
 *   + adjustment.
 *
 * Both branches must reproduce the same total when discount = 0 — the
 * unit tests at the bottom of this file enforce that.
 *
 * tax_inclusive semantics
 * -----------------------
 * When the user toggles "السعر يشمل الضريبة":
 *   line gross  = qty × unit_price × (1 - discPct/100)   ← the displayed line total
 *   line net    = line gross / (1 + taxRate/100)
 *   line tax    = line gross - line net
 * itemsSubtotal aggregates line nets, itemsTax aggregates line taxes.
 *
 * Otherwise (tax_inclusive=false):
 *   line net    = qty × unit_price × (1 - discPct/100)
 *   line tax    = line net × (taxRate/100)
 */

export type DiscountType = "amount" | "percent"
export type DiscountPosition = "before_tax" | "after_tax"

export interface DocumentLineItem {
  quantity: number | string | null | undefined
  unit_price: number | string | null | undefined
  /** Effective tax rate as a percentage (e.g. 14 for VAT 14%). */
  tax_rate?: number | string | null | undefined
  /** Per-line discount percentage applied before the header-level discount. */
  discount_percent?: number | string | null | undefined
}

export interface DocumentTotalsInput {
  items: DocumentLineItem[]
  taxInclusive?: boolean
  discountType?: DiscountType
  discountValue?: number | string | null | undefined
  discountPosition?: DiscountPosition
  shippingCharge?: number | string | null | undefined
  shippingTaxRate?: number | string | null | undefined
  /** Free-form line that shifts the total up or down (rounding fixes, etc.) */
  adjustment?: number | string | null | undefined
}

export interface DocumentTotals {
  /**
   * POST-header-discount subtotal. This is what callers should persist
   * to the `subtotal` column on bills / invoices / purchase_orders /
   * etc. — that matches the historical DB convention (see INV-0011
   * which stored 1500 = 1600 lines − 100 discount).
   *
   * For UI breakdown display use `subtotalBeforeDiscount` instead, so
   * the visible math the user reads is internally consistent:
   *
   *   subtotalBeforeDiscount − discount + tax + shipping + adjustment = total
   */
  subtotal: number
  /** Tax actually charged (already adjusted for before_tax discount + shipping tax). */
  tax: number
  /** Effective header discount in money terms (always positive). */
  discountAmount: number
  /** Final total. */
  total: number
  /** What the tax would have been WITHOUT the header discount. */
  taxBeforeDiscount: number
  /**
   * Sum of line nets BEFORE the header discount (after per-line
   * discount only, excluding tax). Display this in the visible
   * breakdown so the user can mentally add subtotal − discount + tax
   * and arrive at total.
   */
  subtotalBeforeDiscount: number
}

const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

const round2 = (v: number): number => Math.round(v * 100) / 100

/**
 * Compute every total a document-style form needs to display + persist.
 *
 * The function is pure and deterministic — given the same input, it
 * always returns the same output. No I/O. No date-of-today coupling.
 * Easy to unit-test (see bottom of file) and easy to call from server
 * code (route handlers should call it instead of trusting client totals).
 */
export function computeDocumentTotals(input: DocumentTotalsInput): DocumentTotals {
  const taxInclusive = !!input.taxInclusive
  const discountType: DiscountType = input.discountType === "percent" ? "percent" : "amount"
  const discountPosition: DiscountPosition =
    input.discountPosition === "after_tax" ? "after_tax" : "before_tax"
  const discountValue = Math.max(0, num(input.discountValue, 0))
  const shippingCharge = Math.max(0, num(input.shippingCharge, 0))
  const shippingTaxRate = Math.max(0, num(input.shippingTaxRate, 0))
  const adjustment = num(input.adjustment, 0)

  // --- Step 1: aggregate lines -----------------------------------------
  let itemsSubtotal = 0
  let itemsTax = 0
  for (const it of input.items || []) {
    const qty = num(it.quantity, 0)
    const price = num(it.unit_price, 0)
    const discPct = num(it.discount_percent, 0)
    const taxRate = num(it.tax_rate, 0)

    const lineGross = qty * price * (1 - discPct / 100)
    if (taxInclusive) {
      const lineNet = lineGross / (1 + taxRate / 100)
      const lineTax = lineGross - lineNet
      itemsSubtotal += lineNet
      itemsTax += lineTax
    } else {
      const lineTax = lineGross * (taxRate / 100)
      itemsSubtotal += lineGross
      itemsTax += lineTax
    }
  }

  const subtotalBeforeDiscount = itemsSubtotal
  const taxBeforeDiscount = itemsTax

  // --- Step 2: shipping tax (always added on top) ----------------------
  const shippingTax = shippingCharge * (shippingTaxRate / 100)

  // --- Step 3: discount + total ----------------------------------------
  let discountAmount = 0
  let finalSubtotal = itemsSubtotal
  let finalTax = itemsTax + shippingTax
  let total: number

  if (discountPosition === "before_tax") {
    // Discount lowers the taxable base. Recompute tax on the reduced
    // base proportionally (mixed-tax-rate lines all shrink by the same
    // factor, which is the only fair way without per-line allocation
    // metadata).
    const rawDiscount =
      discountType === "percent"
        ? itemsSubtotal * (discountValue / 100)
        : discountValue
    discountAmount = Math.min(rawDiscount, itemsSubtotal) // clamp at subtotal
    finalSubtotal = Math.max(0, itemsSubtotal - discountAmount)
    const factor = itemsSubtotal > 0 ? finalSubtotal / itemsSubtotal : 0
    finalTax = itemsTax * factor + shippingTax
    total = finalSubtotal + finalTax + shippingCharge + adjustment
  } else {
    // Tax is computed on the full subtotal; discount comes off the
    // after-tax sum. Percentage discount uses the after-tax total as
    // its base so 10% means 10% of what the customer would owe.
    const afterTaxBase = itemsSubtotal + itemsTax + shippingTax
    const rawDiscount =
      discountType === "percent"
        ? afterTaxBase * (discountValue / 100)
        : discountValue
    discountAmount = Math.min(rawDiscount, afterTaxBase)
    total = Math.max(0, afterTaxBase - discountAmount) + shippingCharge + adjustment
  }

  return {
    // v3.74.396: `subtotal` stays POST-discount to match the DB
    // convention (existing rows persist post-discount). Forms that
    // render the visible breakdown should use `subtotalBeforeDiscount`
    // so the user can read subtotal − discount + tax = total.
    subtotal: round2(finalSubtotal),
    tax: round2(finalTax),
    discountAmount: round2(discountAmount),
    total: round2(total),
    taxBeforeDiscount: round2(taxBeforeDiscount),
    subtotalBeforeDiscount: round2(subtotalBeforeDiscount),
  }
}

// --- Self-tests (development only) ------------------------------------
//
// These assertions live next to the implementation so the contract
// stays visible to anyone touching this file. They are stripped from
// production by tree-shaking — `if (process.env.NODE_ENV !== "production")`
// is dead-code-eliminated. Keep them in sync when you change the
// semantics above.

if (process.env.NODE_ENV !== "production" && typeof window === "undefined") {
  const assertClose = (a: number, b: number, label: string) => {
    if (Math.abs(a - b) > 0.01) {
      // eslint-disable-next-line no-console
      console.warn(`[document-totals] self-test FAIL "${label}": ${a} vs ${b}`)
    }
  }

  // Scenario 1: VAT 14%, tax-inclusive, item gross 10, header discount
  // 2 EGP amount. before vs after positions must differ.
  const items = [{ quantity: 10, unit_price: 1, tax_rate: 14 }]
  const after = computeDocumentTotals({
    items,
    taxInclusive: true,
    discountType: "amount",
    discountValue: 2,
    discountPosition: "after_tax",
  })
  assertClose(after.total, 8.0, "scenario1 after_tax total = 8")

  const before = computeDocumentTotals({
    items,
    taxInclusive: true,
    discountType: "amount",
    discountValue: 2,
    discountPosition: "before_tax",
  })
  assertClose(before.total, 7.72, "scenario1 before_tax total ≈ 7.72")

  // Scenario 2: zero discount — both positions must collapse to the same
  // total (regression guard for the v3.74.395 fix).
  const zeroBefore = computeDocumentTotals({
    items,
    taxInclusive: false,
    discountType: "amount",
    discountValue: 0,
    discountPosition: "before_tax",
  })
  const zeroAfter = computeDocumentTotals({
    items,
    taxInclusive: false,
    discountType: "amount",
    discountValue: 0,
    discountPosition: "after_tax",
  })
  assertClose(zeroBefore.total, zeroAfter.total, "scenario2 zero discount parity")

  // Scenario 3 (owner-reported, v3.74.396): visible breakdown must add
  // up to the total. items × tax 14% exclusive, header discount 10%,
  // before_tax.
  const userScenario = computeDocumentTotals({
    items: [{ quantity: 10, unit_price: 1, tax_rate: 14 }],
    taxInclusive: false,
    discountType: "percent",
    discountValue: 10,
    discountPosition: "before_tax",
  })
  // Expected on screen: subtotal(pre-discount) = 10, discount = 1,
  // tax = 1.26, total = 10.26. The visible math subtotal − discount +
  // tax MUST equal total or the user sees nonsense.
  assertClose(userScenario.subtotal, 9, "scenario3 subtotal (post-discount, for DB) = 9")
  assertClose(userScenario.subtotalBeforeDiscount, 10, "scenario3 subtotalBeforeDiscount (for UI) = 10")
  assertClose(userScenario.discountAmount, 1, "scenario3 discount = 1")
  assertClose(userScenario.tax, 1.26, "scenario3 tax recomputed = 1.26")
  assertClose(userScenario.total, 10.26, "scenario3 total = 10.26")
  // The UI breakdown contract — what the user reads on screen must
  // add up to the total cell on the same screen.
  assertClose(
    userScenario.subtotalBeforeDiscount - userScenario.discountAmount + userScenario.tax,
    userScenario.total,
    "scenario3 UI breakdown math closes (subtotalBeforeDiscount − discount + tax = total)"
  )
}
