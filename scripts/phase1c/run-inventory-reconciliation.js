const {
  chunk,
  createServiceClient,
  exitWithReport,
  hasLiveEnv,
  printSection,
  resolveCompanyContext,
  sum,
  toIsoDate,
} = require("./_shared")

function productLabel(product) {
  return product?.sku || product?.name || product?.product_name || product?.id || "unknown-product"
}

function eventPriority(kind) {
  return {
    opening_stock: 1,
    purchase: 2,
    sales_return: 3,
    adjustment_in: 4,
    sale: 5,
    purchase_return: 6,
    adjustment_out: 7,
  }[kind] || 99
}

async function fetchProducts(supabase, companyId) {
  const selectors = [
    "id, sku, name, quantity_on_hand, cost_price, item_type",
    "id, sku, product_name, quantity_on_hand, cost_price, item_type",
    "id, quantity_on_hand, cost_price, item_type",
  ]

  let lastError = null
  for (const selectClause of selectors) {
    const { data, error } = await supabase
      .from("products")
      .select(selectClause)
      .eq("company_id", companyId)

    if (!error) return data || []
    lastError = error
  }

  throw lastError
}

function buildMap(rows, keyField) {
  const map = new Map()
  for (const row of rows || []) {
    map.set(row[keyField], row)
  }
  return map
}

function numeric(value) {
  return Number(value || 0)
}

function lotValue(lot) {
  return numeric(lot.remaining_quantity) * numeric(lot.unit_cost)
}

async function computeGlInventory(supabase, companyId) {
  const { data: inventoryAccounts, error: accountsError } = await supabase
    .from("chart_of_accounts")
    .select("id, account_name, sub_type, account_type")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .in("sub_type", ["inventory", "stock"])

  if (accountsError) throw accountsError

  const accountIds = (inventoryAccounts || []).map((row) => row.id)
  if (accountIds.length === 0) {
    return { total: 0, byReferenceType: {} }
  }

  const { data: journalEntries, error: journalError } = await supabase
    .from("journal_entries")
    .select("id, reference_type, reference_id, entry_date")
    .eq("company_id", companyId)
    .eq("status", "posted")
    .or("is_deleted.is.null,is_deleted.eq.false")
    .is("deleted_at", null)

  if (journalError) throw journalError

  const journalMap = new Map((journalEntries || []).map((row) => [row.id, row]))
  const totalsByReferenceType = {}
  let total = 0

  for (const group of chunk(Array.from(journalMap.keys()), 500)) {
    const { data: lines, error } = await supabase
      .from("journal_entry_lines")
      .select("journal_entry_id, account_id, debit_amount, credit_amount")
      .in("journal_entry_id", group)
      .in("account_id", accountIds)

    if (error) throw error

    for (const line of lines || []) {
      const amount = numeric(line.debit_amount) - numeric(line.credit_amount)
      total += amount
      const referenceType = journalMap.get(line.journal_entry_id)?.reference_type || "unknown"
      totalsByReferenceType[referenceType] = numeric(totalsByReferenceType[referenceType]) + amount
    }
  }

  return { total, byReferenceType: totalsByReferenceType }
}

function summarizeCurrentLots(products, lots) {
  const byProduct = new Map()
  for (const lot of lots || []) {
    const bucket = byProduct.get(lot.product_id) || {
      productId: lot.product_id,
      remainingQty: 0,
      remainingValue: 0,
      lotsCount: 0,
      openingLots: 0,
      purchaseLots: 0,
    }

    bucket.remainingQty += numeric(lot.remaining_quantity)
    bucket.remainingValue += lotValue(lot)
    bucket.lotsCount += 1
    if (lot.lot_type === "opening_stock") bucket.openingLots += 1
    if (lot.lot_type === "purchase") bucket.purchaseLots += 1

    byProduct.set(lot.product_id, bucket)
  }

  const productMap = buildMap(products, "id")
  return Array.from(byProduct.values()).map((item) => {
    const product = productMap.get(item.productId) || {}
    return {
      ...item,
      productLabel: productLabel(product),
      productQuantityOnHand: numeric(product.quantity_on_hand),
      quantityGap: item.remainingQty - numeric(product.quantity_on_hand),
      valueGapVsProductCost:
        item.remainingValue - (numeric(product.quantity_on_hand) * numeric(product.cost_price)),
    }
  })
}

function buildDuplicateLotGroups(lots, products) {
  const counts = {}
  const productMap = buildMap(products, "id")
  for (const lot of lots || []) {
    const key = [
      lot.product_id,
      lot.lot_type || "unknown",
      lot.reference_type || "none",
      lot.reference_id || "none",
    ].join("::")
    counts[key] = counts[key] || {
      key,
      productId: lot.product_id,
      productLabel: productLabel(productMap.get(lot.product_id)),
      lotType: lot.lot_type || null,
      referenceType: lot.reference_type || null,
      referenceId: lot.reference_id || null,
      count: 0,
      totalOriginalQuantity: 0,
      totalRemainingQuantity: 0,
    }
    counts[key].count += 1
    counts[key].totalOriginalQuantity += numeric(lot.original_quantity)
    counts[key].totalRemainingQuantity += numeric(lot.remaining_quantity)
  }

  return Object.values(counts)
    .filter((row) => row.count > 1)
    .sort((left, right) => right.totalRemainingQuantity - left.totalRemainingQuantity)
}

function buildTxQuantityGaps(products, inventoryTransactions) {
  const txTotals = {}
  for (const row of inventoryTransactions || []) {
    txTotals[row.product_id] = numeric(txTotals[row.product_id]) + numeric(row.quantity_change)
  }

  return (products || [])
    .filter((product) => (product.item_type || "product") !== "service")
    .map((product) => ({
      productId: product.id,
      productLabel: productLabel(product),
      productQuantityOnHand: numeric(product.quantity_on_hand),
      transactionQuantity: numeric(txTotals[product.id]),
      gap: numeric(product.quantity_on_hand) - numeric(txTotals[product.id]),
    }))
    .filter((row) => Math.abs(row.gap) > 0.0001)
    .sort((left, right) => Math.abs(right.gap) - Math.abs(left.gap))
}

function buildInvoiceCostMap(cogsTransactions) {
  const map = new Map()

  for (const row of cogsTransactions || []) {
    const key = `${row.source_id}::${row.product_id}`
    const bucket = map.get(key) || { quantity: 0, totalCost: 0 }
    bucket.quantity += numeric(row.quantity)
    bucket.totalCost += numeric(row.total_cost)
    map.set(key, bucket)
  }

  const unitCostMap = new Map()
  for (const [key, bucket] of map.entries()) {
    unitCostMap.set(key, bucket.quantity > 0 ? bucket.totalCost / bucket.quantity : 0)
  }
  return unitCostMap
}

function buildDryRunEvents({
  products,
  openingLots,
  bills,
  billItems,
  invoices,
  invoiceItems,
  salesReturns,
  salesReturnItems,
  purchaseReturns,
  purchaseReturnItems,
  inventoryTransactions,
  invoiceCostMap,
}) {
  const productMap = buildMap(products, "id")
  const billMap = buildMap(bills, "id")
  const invoiceMap = buildMap(invoices, "id")
  const salesReturnMap = buildMap(salesReturns, "id")
  const purchaseReturnMap = buildMap(purchaseReturns, "id")
  const events = []
  let sequence = 0

  for (const lot of openingLots || []) {
    const product = productMap.get(lot.product_id)
    if (!product || product.item_type === "service") continue
    events.push({
      sequence: sequence++,
      productId: lot.product_id,
      productLabel: productLabel(product),
      kind: "opening_stock",
      date: toIsoDate(lot.lot_date) || toIsoDate(lot.created_at),
      quantity: numeric(lot.original_quantity),
      unitCost: numeric(lot.unit_cost),
      sourceId: lot.id,
      sourceRef: "opening_stock",
      auditFlags: [],
    })
  }

  for (const item of billItems || []) {
    const product = productMap.get(item.product_id)
    if (!product || product.item_type === "service") continue
    const bill = billMap.get(item.bill_id)
    const unitCost = numeric(item.unit_price) || (
      numeric(item.quantity) > 0 ? numeric(item.line_total) / numeric(item.quantity) : 0
    )
    events.push({
      sequence: sequence++,
      productId: item.product_id,
      productLabel: productLabel(product),
      kind: "purchase",
      date: toIsoDate(bill?.bill_date),
      quantity: numeric(item.quantity),
      unitCost,
      sourceId: item.bill_id,
      sourceRef: bill?.bill_number || item.bill_id,
      auditFlags: [],
    })
  }

  for (const item of invoiceItems || []) {
    const product = productMap.get(item.product_id)
    if (!product || product.item_type === "service") continue
    const invoice = invoiceMap.get(item.invoice_id)
    events.push({
      sequence: sequence++,
      productId: item.product_id,
      productLabel: productLabel(product),
      kind: "sale",
      date: toIsoDate(invoice?.invoice_date),
      quantity: numeric(item.quantity),
      unitCost: null,
      sourceId: item.invoice_id,
      sourceRef: invoice?.invoice_number || item.invoice_id,
      auditFlags: [],
    })
  }

  for (const item of salesReturnItems || []) {
    const product = productMap.get(item.product_id)
    if (!product || product.item_type === "service") continue
    const salesReturn = salesReturnMap.get(item.sales_return_id)
    const invoiceId = salesReturn?.invoice_id || null
    const key = invoiceId ? `${invoiceId}::${item.product_id}` : null
    const derivedUnitCost = key ? invoiceCostMap.get(key) : null
    const fallbackUsed = !derivedUnitCost && numeric(product.cost_price) > 0
    events.push({
      sequence: sequence++,
      productId: item.product_id,
      productLabel: productLabel(product),
      kind: "sales_return",
      date: toIsoDate(salesReturn?.return_date),
      quantity: numeric(item.quantity),
      unitCost: numeric(derivedUnitCost) || numeric(product.cost_price),
      sourceId: item.sales_return_id,
      sourceRef: salesReturn?.return_number || item.sales_return_id,
      auditFlags: fallbackUsed ? ["COST_FALLBACK_USED"] : [],
    })
  }

  for (const item of purchaseReturnItems || []) {
    const product = productMap.get(item.product_id)
    if (!product || product.item_type === "service") continue
    const purchaseReturn = purchaseReturnMap.get(item.purchase_return_id)
    const bill = billMap.get(purchaseReturn?.bill_id)
    const matchingBillItem = (billItems || []).find(
      (candidate) => candidate.bill_id === purchaseReturn?.bill_id && candidate.product_id === item.product_id
    )
    const derivedUnitCost = numeric(matchingBillItem?.unit_price) || (
      numeric(matchingBillItem?.quantity) > 0
        ? numeric(matchingBillItem?.line_total) / numeric(matchingBillItem?.quantity)
        : 0
    )
    const fallbackUsed = !derivedUnitCost && numeric(product.cost_price) > 0
    events.push({
      sequence: sequence++,
      productId: item.product_id,
      productLabel: productLabel(product),
      kind: "purchase_return",
      date: toIsoDate(purchaseReturn?.created_at || bill?.bill_date),
      quantity: numeric(item.quantity),
      unitCost: derivedUnitCost || numeric(product.cost_price),
      sourceId: item.purchase_return_id,
      sourceRef: purchaseReturn?.return_number || item.purchase_return_id,
      auditFlags: fallbackUsed ? ["COST_FALLBACK_USED"] : [],
    })
  }

  for (const tx of inventoryTransactions || []) {
    if (["purchase", "sale", "return", "purchase_return"].includes(tx.transaction_type)) continue

    const product = productMap.get(tx.product_id)
    if (!product || product.item_type === "service") continue

    const quantity = Math.abs(numeric(tx.quantity_change))
    const kind = numeric(tx.quantity_change) >= 0 ? "adjustment_in" : "adjustment_out"
    events.push({
      sequence: sequence++,
      productId: tx.product_id,
      productLabel: productLabel(product),
      kind,
      date: toIsoDate(tx.created_at),
      quantity,
      unitCost: numeric(product.cost_price),
      sourceId: tx.id,
      sourceRef: tx.reference_id || tx.id,
      auditFlags: numeric(product.cost_price) > 0 ? ["COST_FALLBACK_USED"] : [],
    })
  }

  return events
    .filter((event) => !!event.date && numeric(event.quantity) > 0)
    .sort((left, right) => {
      if (left.date !== right.date) return left.date.localeCompare(right.date)
      const priorityDiff = eventPriority(left.kind) - eventPriority(right.kind)
      if (priorityDiff !== 0) return priorityDiff
      return left.sequence - right.sequence
    })
}

function simulateFifo(products, events) {
  const productMap = buildMap(products, "id")
  const lotsByProduct = new Map()
  const shortages = []
  const fallbackEvents = []

  for (const event of events) {
    const productId = event.productId
    const product = productMap.get(productId) || {}
    const lots = lotsByProduct.get(productId) || []

    if ((event.auditFlags || []).length > 0) {
      fallbackEvents.push({
        productId,
        productLabel: event.productLabel,
        date: event.date,
        kind: event.kind,
        sourceRef: event.sourceRef,
        auditFlags: event.auditFlags,
        fallbackUnitCost: event.unitCost,
      })
    }

    if (["opening_stock", "purchase", "sales_return", "adjustment_in"].includes(event.kind)) {
      lots.push({
        date: event.date,
        sequence: event.sequence,
        sourceRef: event.sourceRef,
        remainingQty: numeric(event.quantity),
        unitCost: numeric(event.unitCost),
      })
      lotsByProduct.set(productId, lots)
      continue
    }

    let remaining = numeric(event.quantity)
    lots.sort((left, right) => {
      if (left.date !== right.date) return left.date.localeCompare(right.date)
      return left.sequence - right.sequence
    })

    for (const lot of lots) {
      if (remaining <= 0) break
      const consumed = Math.min(lot.remainingQty, remaining)
      lot.remainingQty -= consumed
      remaining -= consumed
    }

    if (remaining > 0) {
      shortages.push({
        productId,
        productLabel: event.productLabel || productLabel(product),
        date: event.date,
        kind: event.kind,
        sourceRef: event.sourceRef,
        missingQuantity: remaining,
      })
    }

    lotsByProduct.set(productId, lots.filter((lot) => lot.remainingQty > 0.0001))
  }

  const remainingByProduct = []
  for (const product of products || []) {
    if ((product.item_type || "product") === "service") continue
    const lots = lotsByProduct.get(product.id) || []
    const remainingQty = sum(lots.map((lot) => lot.remainingQty))
    const remainingValue = sum(lots.map((lot) => lot.remainingQty * lot.unitCost))

    remainingByProduct.push({
      productId: product.id,
      productLabel: productLabel(product),
      productQuantityOnHand: numeric(product.quantity_on_hand),
      rebuiltQuantity: remainingQty,
      rebuiltValue: remainingValue,
      quantityGap: remainingQty - numeric(product.quantity_on_hand),
      lotsCount: lots.length,
    })
  }

  return {
    shortages,
    fallbackEvents,
    remainingByProduct,
  }
}

async function run() {
  const report = {
    phase: "phase1c-inventory-reconciliation",
    executedAt: new Date().toISOString(),
    mode: hasLiveEnv() ? "live" : "static",
    ok: true,
  }

  if (!hasLiveEnv()) {
    report.ok = false
    report.error = "Supabase live env is missing. Cannot analyze inventory reconciliation."
    return exitWithReport("phase1c-inventory-reconciliation", report)
  }

  const supabase = createServiceClient()
  const companyContext = await resolveCompanyContext(supabase)
  const companyId = companyContext.companyId
  report.company = {
    id: companyId,
    name: companyContext.company?.name || null,
    resolution: companyContext.resolution,
  }

  printSection("Loading Inventory Sources")
  const products = await fetchProducts(supabase, companyId)
  const stockProducts = products.filter((product) => (product.item_type || "product") !== "service")

  const [
    glInventory,
    fifoLotsResponse,
    fifoConsumptionsResponse,
    inventoryTransactionsResponse,
    billsResponse,
    billItemsResponse,
    invoicesResponse,
    invoiceItemsResponse,
    salesReturnsResponse,
    salesReturnItemsResponse,
    purchaseReturnsResponse,
    purchaseReturnItemsResponse,
    cogsTransactionsResponse,
  ] = await Promise.all([
    computeGlInventory(supabase, companyId),
    supabase
      .from("fifo_cost_lots")
      .select("id, product_id, lot_date, lot_type, reference_type, reference_id, original_quantity, remaining_quantity, unit_cost, created_at")
      .eq("company_id", companyId),
    supabase
      .from("fifo_lot_consumptions")
      .select("id, lot_id, product_id, reference_type, reference_id, quantity_consumed, unit_cost, total_cost, consumption_date, created_at")
      .eq("company_id", companyId),
    supabase
      .from("inventory_transactions")
      .select("id, product_id, transaction_type, reference_type, reference_id, quantity_change, created_at")
      .eq("company_id", companyId),
    supabase.from("bills").select("id, bill_number, bill_date, status").eq("company_id", companyId),
    supabase.from("bill_items").select("bill_id, product_id, quantity, unit_price, line_total"),
    supabase.from("invoices").select("id, invoice_number, invoice_date, status").eq("company_id", companyId).is("deleted_at", null),
    supabase.from("invoice_items").select("invoice_id, product_id, quantity"),
    supabase.from("sales_returns").select("id, invoice_id, return_number, return_date, status").eq("company_id", companyId),
    supabase.from("sales_return_items").select("sales_return_id, product_id, quantity"),
    supabase.from("purchase_returns").select("id, bill_id, return_number, created_at, status").eq("company_id", companyId),
    supabase.from("purchase_return_items").select("purchase_return_id, product_id, quantity"),
    supabase
      .from("cogs_transactions")
      .select("source_type, source_id, product_id, quantity, unit_cost, total_cost")
      .eq("company_id", companyId)
      .eq("source_type", "invoice"),
  ])

  const queryErrors = [
    fifoLotsResponse.error,
    fifoConsumptionsResponse.error,
    inventoryTransactionsResponse.error,
    billsResponse.error,
    billItemsResponse.error,
    invoicesResponse.error,
    invoiceItemsResponse.error,
    salesReturnsResponse.error,
    salesReturnItemsResponse.error,
    purchaseReturnsResponse.error,
    purchaseReturnItemsResponse.error,
    cogsTransactionsResponse.error,
  ].filter(Boolean)

  if (queryErrors.length > 0) {
    throw queryErrors[0]
  }

  const fifoLots = fifoLotsResponse.data || []
  const fifoConsumptions = fifoConsumptionsResponse.data || []
  const inventoryTransactions = inventoryTransactionsResponse.data || []
  const bills = billsResponse.data || []
  const billItems = billItemsResponse.data || []
  const invoices = invoicesResponse.data || []
  const invoiceItems = invoiceItemsResponse.data || []
  const salesReturns = salesReturnsResponse.data || []
  const salesReturnItems = salesReturnItemsResponse.data || []
  const purchaseReturns = purchaseReturnsResponse.data || []
  const purchaseReturnItems = purchaseReturnItemsResponse.data || []
  const cogsTransactions = cogsTransactionsResponse.data || []

  printSection("Current State Summary")
  const currentPositiveLots = fifoLots.filter((lot) => numeric(lot.remaining_quantity) > 0)
  const currentFifoValue = sum(currentPositiveLots.map((lot) => lotValue(lot)))
  const lotSummaries = summarizeCurrentLots(stockProducts, currentPositiveLots)
  const lotQuantityGaps = lotSummaries
    .filter((row) => Math.abs(row.quantityGap) > 0.0001)
    .sort((left, right) => Math.abs(right.quantityGap) - Math.abs(left.quantityGap))

  const txQuantityGaps = buildTxQuantityGaps(stockProducts, inventoryTransactions)
  const duplicateLotGroups = buildDuplicateLotGroups(fifoLots, stockProducts)

  report.current = {
    glInventoryValue: glInventory.total,
    fifoInventoryValue: currentFifoValue,
    difference: currentFifoValue - glInventory.total,
    glByReferenceType: glInventory.byReferenceType,
    fifoLotsCount: fifoLots.length,
    positiveLotsCount: currentPositiveLots.length,
    fifoConsumptionsCount: fifoConsumptions.length,
    stockProductsCount: stockProducts.length,
    productQuantityMatchesInventoryTransactions: txQuantityGaps.length === 0,
    transactionQuantityGapSample: txQuantityGaps.slice(0, 20),
    currentLotQuantityGapSample: lotQuantityGaps.slice(0, 20),
    duplicateLotGroupSample: duplicateLotGroups.slice(0, 20),
  }

  printSection("Dry-Run FIFO Rebuild")
  const invoiceCostMap = buildInvoiceCostMap(cogsTransactions)
  const openingLots = fifoLots.filter((lot) => lot.lot_type === "opening_stock")
  const dryRunEvents = buildDryRunEvents({
    products: stockProducts,
    openingLots,
    bills,
    billItems,
    invoices,
    invoiceItems,
    salesReturns,
    salesReturnItems,
    purchaseReturns,
    purchaseReturnItems,
    inventoryTransactions,
    invoiceCostMap,
  })
  const simulation = simulateFifo(stockProducts, dryRunEvents)
  const rebuiltValue = sum(simulation.remainingByProduct.map((row) => row.rebuiltValue))
  const rebuiltQuantityGaps = simulation.remainingByProduct
    .filter((row) => Math.abs(row.quantityGap) > 0.0001)
    .sort((left, right) => Math.abs(right.quantityGap) - Math.abs(left.quantityGap))

  report.dryRun = {
    eventsCount: dryRunEvents.length,
    rebuiltInventoryValue: rebuiltValue,
    rebuiltVsGlDifference: rebuiltValue - glInventory.total,
    rebuiltVsCurrentFifoDifference: rebuiltValue - currentFifoValue,
    shortagesCount: simulation.shortages.length,
    shortageSample: simulation.shortages.slice(0, 20),
    fallbackCount: simulation.fallbackEvents.length,
    fallbackSample: simulation.fallbackEvents.slice(0, 20),
    rebuiltQuantityGapSample: rebuiltQuantityGaps.slice(0, 20),
  }

  report.recommendation = {
    existingRepairRpcSafeToRerun:
      fifoConsumptions.length === 0 &&
      duplicateLotGroups.length === 0 &&
      lotQuantityGaps.length === 0,
    recommendedStrategy:
      simulation.shortages.length <= 5
        ? "Build a dedicated atomic FIFO rebuild using historical bill/invoice/return dates, then post a separate audited GL reconciliation entry."
        : "Do not mutate live FIFO yet. Build a dedicated atomic FIFO rebuild first, then reconcile GL after dry-run approval.",
    blockers: [
      lotQuantityGaps.length > 0 ? "Current FIFO remaining quantities do not match products.quantity_on_hand." : null,
      fifoConsumptions.length > 0 ? "Existing fifo_lot_consumptions means rerunning legacy consumption RPCs is not idempotent." : null,
      duplicateLotGroups.length > 0 ? "Duplicate FIFO lot groups exist and must be reviewed before any legacy full_repair is executed." : null,
    ].filter(Boolean),
  }

  report.ok =
    txQuantityGaps.length === 0 &&
    Math.abs(currentFifoValue - glInventory.total) <= 1 &&
    lotQuantityGaps.length === 0

  exitWithReport("phase1c-inventory-reconciliation", report)
}

run().catch((error) => {
  exitWithReport("phase1c-inventory-reconciliation", {
    phase: "phase1c-inventory-reconciliation",
    executedAt: new Date().toISOString(),
    ok: false,
    error: error.message,
  })
})
