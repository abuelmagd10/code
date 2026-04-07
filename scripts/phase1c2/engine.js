const {
  chunk,
  createServiceClient,
  ensurePhase1C2ArtifactDir,
  hasLiveEnv,
  numeric,
  printSection,
  resolveCompanyContext,
  stableHash,
  stableUuid,
  sum,
  toIsoDate,
  writeArtifactJson,
} = require("./_shared")

function productLabel(product) {
  return product?.sku || product?.name || product?.product_name || product?.id || "unknown-product"
}

function lower(value) {
  return String(value || "").trim().toLowerCase()
}

function isService(product) {
  return lower(product?.item_type) === "service"
}

function isOptionalTableError(error) {
  const message = String(error?.message || "")
  const code = String(error?.code || "")
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    message.includes("Could not find the table") ||
    (message.includes("relation") && message.includes("does not exist"))
  )
}

async function fetchRows(supabase, table, builder, options = {}) {
  const query = builder ? builder(supabase.from(table).select("*")) : supabase.from(table).select("*")
  const { data, error } = await query
  if (error) {
    if (options.optional && isOptionalTableError(error)) {
      return { rows: [], warning: `${table}: ${error.message}` }
    }
    throw error
  }
  return { rows: data || [], warning: null }
}

async function fetchRowsByIds(supabase, table, idColumn, ids, options = {}) {
  if (!ids || ids.length === 0) {
    return { rows: [], warning: null }
  }

  const allRows = []
  for (const group of chunk(ids, 500)) {
    const { rows, warning } = await fetchRows(
      supabase,
      table,
      (query) => query.in(idColumn, group),
      options
    )
    if (warning) {
      return { rows: allRows, warning }
    }
    allRows.push(...rows)
  }

  return { rows: allRows, warning: null }
}

function buildMap(rows, keyField = "id") {
  const map = new Map()
  for (const row of rows || []) {
    map.set(row[keyField], row)
  }
  return map
}

function buildAggregateMap(rows, keyFn) {
  const map = new Map()

  for (const row of rows || []) {
    const key = keyFn(row)
    const quantity = numeric(row.quantity)
    const explicitLineTotal = row.line_total != null ? numeric(row.line_total) : null
    const explicitUnitPrice = row.unit_price != null ? numeric(row.unit_price) : null
    const computedLineTotal =
      explicitLineTotal != null
        ? explicitLineTotal
        : (explicitUnitPrice != null ? explicitUnitPrice * quantity : 0)

    const bucket = map.get(key) || {
      count: 0,
      quantity: 0,
      totalCost: 0,
      unitCost: 0,
      lineIds: [],
      unitCosts: new Set(),
      rows: [],
    }

    bucket.count += 1
    bucket.quantity += quantity
    bucket.totalCost += computedLineTotal
    if (row.id) {
      bucket.lineIds.push(row.id)
    }
    if (explicitUnitPrice != null) {
      bucket.unitCosts.add(Number(explicitUnitPrice.toFixed(4)))
    }
    bucket.rows.push(row)
    map.set(key, bucket)
  }

  for (const bucket of map.values()) {
    bucket.unitCost = bucket.quantity > 0 ? Number((bucket.totalCost / bucket.quantity).toFixed(4)) : 0
    bucket.hasMixedUnitCost = bucket.unitCosts.size > 1
    delete bucket.unitCosts
  }

  return map
}

function eventPriority(eventType) {
  return {
    opening_stock: 10,
    purchase: 20,
    sales_return: 30,
    adjustment_in: 40,
    sale: 50,
    purchase_return: 60,
    write_off: 70,
    adjustment_out: 80,
  }[eventType] || 99
}

function detectEventType(tx) {
  const txType = lower(tx.transaction_type)
  const refType = lower(tx.reference_type)
  const quantity = numeric(tx.quantity_change != null ? tx.quantity_change : tx.quantity)

  if (txType === "opening_stock" || refType === "opening_stock") return "opening_stock"
  if (txType === "purchase" || refType === "bill") return "purchase"
  if (txType === "purchase_return" || refType === "purchase_return") return "purchase_return"
  if (txType === "sale_return" || refType === "sales_return" || (txType === "return" && quantity > 0)) return "sales_return"
  if (txType === "write_off" || txType === "loss" || txType === "depreciation" || refType === "write_off") return "write_off"
  if (txType === "adjustment_in") return "adjustment_in"
  if (txType === "adjustment_out") return "adjustment_out"
  if (txType === "sale" || refType === "invoice" || quantity < 0) return "sale"
  return quantity >= 0 ? "adjustment_in" : "adjustment_out"
}

function eventDirection(eventType) {
  return ["opening_stock", "purchase", "sales_return", "adjustment_in"].includes(eventType) ? "in" : "out"
}

function pickEffectiveDate(tx, context) {
  return (
    toIsoDate(tx.transaction_date) ||
    toIsoDate(context?.businessDate) ||
    toIsoDate(tx.created_at) ||
    null
  )
}

function pickOrderingCreatedAt(tx, context) {
  return tx.created_at || context?.createdAt || null
}

function orderTuple(event) {
  return [
    event.ordering_date || "",
    event.ordering_created_at || "",
    String(event.ordering_priority || 0).padStart(3, "0"),
    event.ordering_source_id || "",
    event.ordering_source_line_id || "",
  ]
}

function sortEvents(events) {
  return [...events].sort((left, right) => {
    const leftTuple = orderTuple(left)
    const rightTuple = orderTuple(right)
    for (let index = 0; index < leftTuple.length; index += 1) {
      if (leftTuple[index] < rightTuple[index]) return -1
      if (leftTuple[index] > rightTuple[index]) return 1
    }
    return 0
  })
}

function summarizeSource(rows, dateFields = []) {
  const dates = []
  const createdAts = []

  for (const row of rows || []) {
    for (const field of dateFields) {
      const value = toIsoDate(row[field])
      if (value) dates.push(value)
    }
    if (row.created_at) createdAts.push(new Date(row.created_at).toISOString())
  }

  dates.sort()
  createdAts.sort()

  return {
    rowCount: rows.length,
    minEffectiveDate: dates[0] || null,
    maxEffectiveDate: dates[dates.length - 1] || null,
    maxCreatedAt: createdAts[createdAts.length - 1] || null,
  }
}

function filterRowsAsOf(rows, asOfTimestamp) {
  if (!asOfTimestamp) return rows || []
  const cutoff = new Date(asOfTimestamp).getTime()
  if (Number.isNaN(cutoff)) return rows || []

  return (rows || []).filter((row) => {
    if (!row || !row.created_at) return true
    const createdAt = new Date(row.created_at).getTime()
    if (Number.isNaN(createdAt)) return true
    return createdAt <= cutoff
  })
}

async function fetchSources(supabase, companyId, options = {}) {
  const warnings = []
  const asOfTimestamp = options.asOfTimestamp || null

  const [
    productsResponse,
    inventoryTxResponse,
    billsResponse,
    invoicesResponse,
    salesReturnsResponse,
    purchaseReturnsResponse,
    cogsResponse,
    chartAccountsResponse,
    writeOffsResponse,
  ] = await Promise.all([
    fetchRows(supabase, "products", (query) => query.eq("company_id", companyId)),
    fetchRows(supabase, "inventory_transactions", (query) => query.eq("company_id", companyId)),
    fetchRows(supabase, "bills", (query) => query.eq("company_id", companyId)),
    fetchRows(supabase, "invoices", (query) => query.eq("company_id", companyId).is("deleted_at", null)),
    fetchRows(supabase, "sales_returns", (query) => query.eq("company_id", companyId), { optional: true }),
    fetchRows(supabase, "purchase_returns", (query) => query.eq("company_id", companyId), { optional: true }),
    fetchRows(supabase, "cogs_transactions", (query) => query.eq("company_id", companyId), { optional: true }),
    fetchRows(supabase, "chart_of_accounts", (query) => query.eq("company_id", companyId), { optional: true }),
    fetchRows(supabase, "inventory_write_offs", (query) => query.eq("company_id", companyId), { optional: true }),
  ])

  for (const warning of [
    productsResponse.warning,
    inventoryTxResponse.warning,
    billsResponse.warning,
    invoicesResponse.warning,
    salesReturnsResponse.warning,
    purchaseReturnsResponse.warning,
    cogsResponse.warning,
    chartAccountsResponse.warning,
    writeOffsResponse.warning,
  ]) {
    if (warning) warnings.push(warning)
  }

  const products = filterRowsAsOf(productsResponse.rows, asOfTimestamp)
  const inventoryTransactions = filterRowsAsOf(inventoryTxResponse.rows, asOfTimestamp)
  const bills = filterRowsAsOf(billsResponse.rows, asOfTimestamp)
  const invoices = filterRowsAsOf(invoicesResponse.rows, asOfTimestamp)
  const salesReturns = filterRowsAsOf(salesReturnsResponse.rows, asOfTimestamp)
  const purchaseReturns = filterRowsAsOf(purchaseReturnsResponse.rows, asOfTimestamp)
  const cogsTransactions = filterRowsAsOf(cogsResponse.rows, asOfTimestamp)
  const chartOfAccounts = filterRowsAsOf(chartAccountsResponse.rows, asOfTimestamp)
  const writeOffs = filterRowsAsOf(writeOffsResponse.rows, asOfTimestamp)

  const billIds = bills.map((row) => row.id)
  const invoiceIds = invoices.map((row) => row.id)
  const salesReturnIds = salesReturns.map((row) => row.id)
  const purchaseReturnIds = purchaseReturns.map((row) => row.id)
  const writeOffIds = writeOffs.map((row) => row.id)

  const [
    billItemsResponse,
    invoiceItemsResponse,
    salesReturnItemsResponse,
    purchaseReturnItemsResponse,
    writeOffItemsResponse,
    journalEntriesResponse,
  ] = await Promise.all([
    fetchRowsByIds(supabase, "bill_items", "bill_id", billIds),
    fetchRowsByIds(supabase, "invoice_items", "invoice_id", invoiceIds),
    fetchRowsByIds(supabase, "sales_return_items", "sales_return_id", salesReturnIds, { optional: true }),
    fetchRowsByIds(supabase, "purchase_return_items", "purchase_return_id", purchaseReturnIds, { optional: true }),
    fetchRowsByIds(supabase, "inventory_write_off_items", "write_off_id", writeOffIds, { optional: true }),
    fetchRows(
      supabase,
      "journal_entries",
      (query) =>
        query
          .eq("company_id", companyId)
          .eq("status", "posted")
          .or("is_deleted.is.null,is_deleted.eq.false")
          .is("deleted_at", null),
      { optional: true }
    ),
  ])

  for (const warning of [
    billItemsResponse.warning,
    invoiceItemsResponse.warning,
    salesReturnItemsResponse.warning,
    purchaseReturnItemsResponse.warning,
    writeOffItemsResponse.warning,
    journalEntriesResponse.warning,
  ]) {
    if (warning) warnings.push(warning)
  }

  const journalEntries = filterRowsAsOf(journalEntriesResponse.rows, asOfTimestamp)
  const journalEntryIds = journalEntries.map((row) => row.id)
  const journalLinesResponse = await fetchRowsByIds(
    supabase,
    "journal_entry_lines",
    "journal_entry_id",
    journalEntryIds,
    { optional: true }
  )

  if (journalLinesResponse.warning) warnings.push(journalLinesResponse.warning)

  return {
    warnings,
    products,
    inventoryTransactions,
    bills,
    billItems: filterRowsAsOf(billItemsResponse.rows, asOfTimestamp),
    invoices,
    invoiceItems: filterRowsAsOf(invoiceItemsResponse.rows, asOfTimestamp),
    salesReturns,
    salesReturnItems: filterRowsAsOf(salesReturnItemsResponse.rows, asOfTimestamp),
    purchaseReturns,
    purchaseReturnItems: filterRowsAsOf(purchaseReturnItemsResponse.rows, asOfTimestamp),
    writeOffs,
    writeOffItems: filterRowsAsOf(writeOffItemsResponse.rows, asOfTimestamp),
    cogsTransactions,
    chartOfAccounts,
    journalEntries,
    journalEntryLines: filterRowsAsOf(journalLinesResponse.rows, asOfTimestamp),
    asOfTimestamp,
  }
}

function computeGlInventory(chartOfAccounts, journalEntries, journalEntryLines) {
  const inventoryAccounts = (chartOfAccounts || []).filter((account) => {
    const subType = lower(account.sub_type)
    const accountName = lower(account.account_name)
    return (
      account.is_active !== false &&
      (
        subType === "inventory" ||
        subType === "stock" ||
        accountName.includes("inventory") ||
        accountName.includes("مخزون")
      )
    )
  })

  const inventoryAccountIds = new Set(inventoryAccounts.map((row) => row.id))
  const journalMap = buildMap(journalEntries, "id")
  const byReferenceType = {}
  let total = 0

  for (const line of journalEntryLines || []) {
    if (!inventoryAccountIds.has(line.account_id)) continue
    const amount = numeric(line.debit_amount) - numeric(line.credit_amount)
    total += amount
    const referenceType = journalMap.get(line.journal_entry_id)?.reference_type || "unknown"
    byReferenceType[referenceType] = numeric(byReferenceType[referenceType]) + amount
  }

  return {
    total: Number(total.toFixed(4)),
    byReferenceType,
    inventoryAccountIds: [...inventoryAccountIds],
  }
}

function buildInvoiceCostMap(cogsTransactions) {
  const aggregates = new Map()

  for (const row of cogsTransactions || []) {
    if (lower(row.source_type) !== "invoice") continue
    const key = `${row.source_id}::${row.product_id}`
    const bucket = aggregates.get(key) || { quantity: 0, totalCost: 0 }
    bucket.quantity += numeric(row.quantity)
    bucket.totalCost += numeric(row.total_cost)
    aggregates.set(key, bucket)
  }

  const unitCosts = new Map()
  for (const [key, bucket] of aggregates.entries()) {
    unitCosts.set(key, bucket.quantity > 0 ? Number((bucket.totalCost / bucket.quantity).toFixed(4)) : 0)
  }
  return unitCosts
}

function periodKeyFromDate(value) {
  const iso = toIsoDate(value)
  return iso ? iso.slice(0, 7) : null
}

function buildInboundCostIndexes(sources) {
  const billsById = buildMap(sources.bills)
  const overall = new Map()
  const byPeriod = new Map()
  const periodsByProduct = new Map()

  function appendCost(map, key, quantity, totalCost) {
    const bucket = map.get(key) || { quantity: 0, totalCost: 0 }
    bucket.quantity += quantity
    bucket.totalCost += totalCost
    map.set(key, bucket)
  }

  for (const row of sources.billItems || []) {
    const bill = billsById.get(row.bill_id)
    if (!bill) continue

    const quantity = Math.abs(numeric(row.quantity))
    if (quantity <= 0.0001) continue

    const lineTotal =
      row.line_total != null
        ? numeric(row.line_total)
        : numeric(row.unit_price) * quantity
    const unitCost = quantity > 0 ? Number((lineTotal / quantity).toFixed(4)) : 0
    if (unitCost <= 0) continue

    appendCost(overall, row.product_id, quantity, lineTotal)

    const periodKey = periodKeyFromDate(bill.bill_date || row.created_at)
    if (periodKey) {
      appendCost(byPeriod, `${row.product_id}::${periodKey}`, quantity, lineTotal)
      const periodSet = periodsByProduct.get(row.product_id) || new Set()
      periodSet.add(periodKey)
      periodsByProduct.set(row.product_id, periodSet)
    }
  }

  const productOverallUnitCost = new Map()
  for (const [key, bucket] of overall.entries()) {
    productOverallUnitCost.set(
      key,
      bucket.quantity > 0 ? Number((bucket.totalCost / bucket.quantity).toFixed(4)) : 0
    )
  }

  const productPeriodUnitCost = new Map()
  for (const [key, bucket] of byPeriod.entries()) {
    productPeriodUnitCost.set(
      key,
      bucket.quantity > 0 ? Number((bucket.totalCost / bucket.quantity).toFixed(4)) : 0
    )
  }

  return {
    productOverallUnitCost,
    productPeriodUnitCost,
    periodsByProduct,
  }
}

function resolvePeriodWeightedCost(costIndexes, productId, effectiveDate) {
  if (!costIndexes) {
    return { unitCost: 0, source: null, periodKey: null }
  }

  const targetPeriodKey = periodKeyFromDate(effectiveDate)
  if (targetPeriodKey) {
    const exactKey = `${productId}::${targetPeriodKey}`
    const exactUnitCost = numeric(costIndexes.productPeriodUnitCost.get(exactKey))
    if (exactUnitCost > 0) {
      return {
        unitCost: exactUnitCost,
        source: "same_period",
        periodKey: targetPeriodKey,
      }
    }

    const knownPeriods = [...(costIndexes.periodsByProduct.get(productId) || [])].sort()
    const priorPeriod = knownPeriods.filter((periodKey) => periodKey <= targetPeriodKey).pop() || null
    if (priorPeriod) {
      const priorUnitCost = numeric(costIndexes.productPeriodUnitCost.get(`${productId}::${priorPeriod}`))
      if (priorUnitCost > 0) {
        return {
          unitCost: priorUnitCost,
          source: "prior_period",
          periodKey: priorPeriod,
        }
      }
    }
  }

  const overallUnitCost = numeric(costIndexes.productOverallUnitCost.get(productId))
  if (overallUnitCost > 0) {
    return {
      unitCost: overallUnitCost,
      source: "overall_product",
      periodKey: null,
    }
  }

  return {
    unitCost: 0,
    source: null,
    periodKey: targetPeriodKey,
  }
}

function createRunContext(companyContext, sources, options = {}) {
  const summary = {
    products: summarizeSource(sources.products, ["created_at"]),
    inventoryTransactions: summarizeSource(sources.inventoryTransactions, ["transaction_date", "created_at"]),
    bills: summarizeSource(sources.bills, ["bill_date", "created_at"]),
    invoices: summarizeSource(sources.invoices, ["invoice_date", "created_at"]),
    salesReturns: summarizeSource(sources.salesReturns, ["return_date", "created_at"]),
    purchaseReturns: summarizeSource(sources.purchaseReturns, ["return_date", "created_at"]),
    writeOffs: summarizeSource(sources.writeOffs, ["write_off_date", "created_at"]),
    cogsTransactions: summarizeSource(sources.cogsTransactions, ["transaction_date", "created_at"]),
    journalEntries: summarizeSource(sources.journalEntries, ["entry_date", "created_at"]),
  }

  const fallbackCutoff =
    summary.inventoryTransactions.maxCreatedAt ||
    summary.journalEntries.maxCreatedAt ||
    summary.invoices.maxCreatedAt ||
    new Date("1970-01-01T00:00:00.000Z").toISOString()

  const cutoffTimestamp = options.cutoffTimestamp || fallbackCutoff
  const deterministicOrder = {
    primary: "inventory_transactions.transaction_date",
    secondary: "inventory_transactions.created_at",
    tertiary: "inventory_transactions.id",
    quaternary: "event_priority",
  }
  const executionProfile = options.executionProfile || options.mode || "dry_run"

  const sourceSnapshotHash = stableHash({
    companyId: companyContext.companyId,
    cutoffTimestamp,
    summary,
    deterministicOrder,
    executionProfile,
  })

  const runId = stableUuid(companyContext.companyId, cutoffTimestamp, sourceSnapshotHash, options.mode || "dry_run")
  const runKey = `${companyContext.companyId}-${sourceSnapshotHash.slice(0, 12)}`

  return {
    runId,
    runKey,
    cutoffTimestamp,
    generatedAt: cutoffTimestamp,
    sourceSnapshotHash,
    deterministicOrder,
    sourceSummary: summary,
    executionProfile,
  }
}

function buildSourceRows(runContext, companyContext) {
  return Object.entries(runContext.sourceSummary).map(([sourceName, summary]) => ({
    id: stableUuid(runContext.runId, "source", sourceName),
    rebuild_run_id: runContext.runId,
    company_id: companyContext.companyId,
    source_name: sourceName,
    table_name: sourceName,
    row_count: summary.rowCount,
    min_effective_date: summary.minEffectiveDate,
    max_effective_date: summary.maxEffectiveDate,
    snapshot_hash: stableHash({
      sourceName,
      ...summary,
    }),
    extraction_query_signature: `phase1c2:${sourceName}:company_scope`,
    notes: null,
    created_at: runContext.generatedAt,
  }))
}

function buildCanonicalEvents(runContext, companyContext, sources, options = {}) {
  const productsById = buildMap(sources.products)
  const billsById = buildMap(sources.bills)
  const invoicesById = buildMap(sources.invoices)
  const salesReturnsById = buildMap(sources.salesReturns)
  const purchaseReturnsById = buildMap(sources.purchaseReturns)
  const writeOffsById = buildMap(sources.writeOffs)

  const billItemAgg = buildAggregateMap(
    sources.billItems,
    (row) => `${row.bill_id}::${row.product_id}`
  )
  const invoiceItemAgg = buildAggregateMap(
    sources.invoiceItems,
    (row) => `${row.invoice_id}::${row.product_id}`
  )
  const salesReturnItemAgg = buildAggregateMap(
    sources.salesReturnItems,
    (row) => `${row.sales_return_id}::${row.product_id}`
  )
  const purchaseReturnItemAgg = buildAggregateMap(
    sources.purchaseReturnItems,
    (row) => `${row.purchase_return_id}::${row.product_id}`
  )
  const writeOffItemAgg = buildAggregateMap(
    sources.writeOffItems,
    (row) => `${row.write_off_id}::${row.product_id}`
  )
  const invoiceCostMap = buildInvoiceCostMap(sources.cogsTransactions)
  const costIndexes = options.costIndexes || buildInboundCostIndexes(sources)

  const anomalies = []
  const events = []
  const nowIso = runContext.generatedAt

  for (const tx of sources.inventoryTransactions || []) {
    const product = productsById.get(tx.product_id)
    if (!product || isService(product)) continue

    const eventType = detectEventType(tx)
    const direction = eventDirection(eventType)
    const quantity = Math.abs(numeric(tx.quantity_change != null ? tx.quantity_change : tx.quantity))
    if (quantity <= 0) continue

    const referenceId = tx.reference_id || null
    let document = null
    let lineAggregate = null
    let businessDate = null
    let sourceReferenceNumber = null
    let referenceEntity = null
    let costBasisType = null
    let unitCost = null
    let sourceLineTable = null
    let sourceLineId = null
    const auditFlags = []
    const metadata = {
      source_inventory_transaction_id: tx.id,
      source_reference_type: tx.reference_type || null,
      transaction_type: tx.transaction_type || null,
    }

    if (eventType === "purchase") {
      document = billsById.get(referenceId)
      lineAggregate = billItemAgg.get(`${referenceId}::${tx.product_id}`) || null
      businessDate = document?.bill_date || tx.transaction_date || tx.created_at
      sourceReferenceNumber = document?.bill_number || referenceId
      referenceEntity = "bill"
      costBasisType = "bill_item_weighted_average"
      unitCost = numeric(lineAggregate?.unitCost)
      metadata.bill_id = document?.id || null
      metadata.bill_status = document?.status || null
      metadata.bill_item_ids = lineAggregate?.lineIds || []

      if (lineAggregate?.hasMixedUnitCost) {
        auditFlags.push("BILL_PRODUCT_COST_BLEND")
      }

      if (lineAggregate && Math.abs(numeric(lineAggregate.quantity) - quantity) > 0.0001) {
        auditFlags.push("SOURCE_QUANTITY_MISMATCH")
      }

      if (lineAggregate?.lineIds?.length === 1) {
        sourceLineTable = "bill_items"
        sourceLineId = lineAggregate.lineIds[0]
      }

      if (!lineAggregate || unitCost <= 0) {
        auditFlags.push("MISSING_SOURCE_COST")
        unitCost = 0
      }
    } else if (eventType === "sale") {
      document = invoicesById.get(referenceId)
      lineAggregate = invoiceItemAgg.get(`${referenceId}::${tx.product_id}`) || null
      businessDate = document?.invoice_date || tx.transaction_date || tx.created_at
      sourceReferenceNumber = document?.invoice_number || referenceId
      referenceEntity = "invoice"
      costBasisType = "fifo_issue"
      metadata.invoice_id = document?.id || null
      metadata.invoice_status = document?.status || null
      metadata.invoice_item_ids = lineAggregate?.lineIds || []

      if (lineAggregate && Math.abs(numeric(lineAggregate.quantity) - quantity) > 0.0001) {
        auditFlags.push("SOURCE_QUANTITY_MISMATCH")
      }

      if (lineAggregate?.lineIds?.length === 1) {
        sourceLineTable = "invoice_items"
        sourceLineId = lineAggregate.lineIds[0]
      }
    } else if (eventType === "sales_return") {
      document = salesReturnsById.get(referenceId)
      lineAggregate = salesReturnItemAgg.get(`${referenceId}::${tx.product_id}`) || null
      businessDate = document?.return_date || tx.transaction_date || tx.created_at
      sourceReferenceNumber = document?.return_number || referenceId
      referenceEntity = "sales_return"
      costBasisType = "restore_original_invoice_lots"
      metadata.sales_return_id = document?.id || null
      metadata.invoice_id = document?.invoice_id || null
      metadata.sales_return_status = document?.status || null
      metadata.sales_return_item_ids = lineAggregate?.lineIds || []

      if (lineAggregate && Math.abs(numeric(lineAggregate.quantity) - quantity) > 0.0001) {
        auditFlags.push("SOURCE_QUANTITY_MISMATCH")
      }

      if (lineAggregate?.lineIds?.length === 1) {
        sourceLineTable = "sales_return_items"
        sourceLineId = lineAggregate.lineIds[0]
      }

      const invoiceCostKey = document?.invoice_id ? `${document.invoice_id}::${tx.product_id}` : null
      const invoiceRecoveryUnitCost = invoiceCostKey ? numeric(invoiceCostMap.get(invoiceCostKey)) : 0
      const periodWeightedRecovery = resolvePeriodWeightedCost(costIndexes, tx.product_id, businessDate)

      if (invoiceRecoveryUnitCost > 0) {
        metadata.invoice_weighted_return_unit_cost = invoiceRecoveryUnitCost
      }
      if (periodWeightedRecovery.unitCost > 0) {
        metadata.period_weighted_return_unit_cost = periodWeightedRecovery.unitCost
        metadata.period_weighted_return_source = periodWeightedRecovery.source
        metadata.period_weighted_return_period_key = periodWeightedRecovery.periodKey
      }
      if (options.allowCostFallback && numeric(product.cost_price) > 0) {
        metadata.product_cost_price_fallback = numeric(product.cost_price)
      }

      const hasRecoverableSource =
        Boolean(document?.invoice_id) ||
        invoiceRecoveryUnitCost > 0 ||
        periodWeightedRecovery.unitCost > 0 ||
        (options.allowCostFallback && numeric(product.cost_price) > 0)

      if (!hasRecoverableSource) {
        auditFlags.push("MISSING_SOURCE_COST")
      }
    } else if (eventType === "purchase_return") {
      document = purchaseReturnsById.get(referenceId)
      lineAggregate = purchaseReturnItemAgg.get(`${referenceId}::${tx.product_id}`) || null
      businessDate = document?.return_date || tx.transaction_date || tx.created_at
      sourceReferenceNumber = document?.return_number || referenceId
      referenceEntity = "purchase_return"
      costBasisType = "bill_affinity_fifo_issue"
      metadata.purchase_return_id = document?.id || null
      metadata.bill_id = document?.bill_id || null
      metadata.purchase_return_status = document?.status || null
      metadata.bill_item_ids = lineAggregate?.lineIds || []

      if (lineAggregate && Math.abs(numeric(lineAggregate.quantity) - quantity) > 0.0001) {
        auditFlags.push("SOURCE_QUANTITY_MISMATCH")
      }

      if (lineAggregate?.lineIds?.length === 1) {
        sourceLineTable = "purchase_return_items"
        sourceLineId = lineAggregate.lineIds[0]
      }
    } else if (eventType === "write_off") {
      document = writeOffsById.get(referenceId)
      lineAggregate = writeOffItemAgg.get(`${referenceId}::${tx.product_id}`) || null
      businessDate = document?.write_off_date || tx.transaction_date || tx.created_at
      sourceReferenceNumber = document?.write_off_number || referenceId
      referenceEntity = "write_off"
      costBasisType = "fifo_issue"
      metadata.write_off_id = document?.id || null
      metadata.write_off_status = document?.status || null
      metadata.write_off_item_ids = lineAggregate?.lineIds || []

      if (lineAggregate && Math.abs(numeric(lineAggregate.quantity) - quantity) > 0.0001) {
        auditFlags.push("SOURCE_QUANTITY_MISMATCH")
      }
    } else if (eventType === "opening_stock" || eventType === "adjustment_in") {
      businessDate = tx.transaction_date || tx.created_at
      sourceReferenceNumber = referenceId || tx.id
      referenceEntity = lower(tx.reference_type) || eventType
      costBasisType = "manual_or_opening_balance"
      if (options.allowCostFallback && numeric(product.cost_price) > 0) {
        unitCost = numeric(product.cost_price)
        auditFlags.push("COST_FALLBACK_USED")
      } else {
        unitCost = 0
        auditFlags.push("MISSING_SOURCE_COST")
      }
    } else {
      businessDate = tx.transaction_date || tx.created_at
      sourceReferenceNumber = referenceId || tx.id
      referenceEntity = lower(tx.reference_type) || eventType
      costBasisType = "fifo_issue"
    }

    const effectiveDate = pickEffectiveDate(tx, { businessDate })
    const orderingCreatedAt = pickOrderingCreatedAt(tx, { createdAt: document?.created_at })
    const orderingPriority = eventPriority(eventType)
    const orderingSourceId = String(tx.id)
    const orderingSourceLineId = String(sourceLineId || "")
    const orderingKey = [
      effectiveDate || "9999-12-31",
      orderingCreatedAt || "",
      String(orderingPriority).padStart(3, "0"),
      orderingSourceId,
      orderingSourceLineId,
    ].join("|")

    const exceptionState = auditFlags.includes("MISSING_SOURCE_COST")
      ? "blocked"
      : (auditFlags.length > 0 ? "warning" : "clean")

    const event = {
      id: stableUuid(runContext.runId, "event", tx.id, eventType),
      rebuild_run_id: runContext.runId,
      company_id: companyContext.companyId,
      product_id: tx.product_id,
      branch_id: tx.branch_id || document?.branch_id || null,
      cost_center_id: tx.cost_center_id || document?.cost_center_id || null,
      warehouse_id: tx.warehouse_id || document?.warehouse_id || null,
      event_type: eventType,
      direction,
      effective_date: effectiveDate,
      source_created_at: tx.created_at || null,
      ordering_date: effectiveDate,
      ordering_created_at: orderingCreatedAt,
      ordering_priority: orderingPriority,
      ordering_source_id: orderingSourceId,
      ordering_source_line_id: orderingSourceLineId || null,
      ordering_key: orderingKey,
      quantity,
      cost_basis_type: costBasisType,
      unit_cost: unitCost != null ? Number(unitCost.toFixed(4)) : null,
      source_table: "inventory_transactions",
      source_id: tx.id,
      source_line_table: sourceLineTable,
      source_line_id: sourceLineId,
      source_reference_type: tx.reference_type || null,
      source_reference_number: sourceReferenceNumber || null,
      reference_entity: referenceEntity,
      reference_id: referenceId,
      exception_state: exceptionState,
      audit_flags: auditFlags,
      metadata,
      created_at: nowIso,
    }

    events.push(event)

    for (const flag of auditFlags) {
      const severity = flag === "MISSING_SOURCE_COST" ? "blocked" : "warning"
      anomalies.push({
        id: stableUuid(runContext.runId, "anomaly", flag, event.id),
        rebuild_run_id: runContext.runId,
        company_id: companyContext.companyId,
        severity,
        anomaly_type: flag,
        product_id: event.product_id,
        branch_id: event.branch_id,
        cost_center_id: event.cost_center_id,
        warehouse_id: event.warehouse_id,
        source_event_id: event.id,
        reference_entity: event.reference_entity,
        reference_id: event.reference_id,
        quantity: event.quantity,
        amount: null,
        details: {
          source_reference_number: event.source_reference_number,
          event_type: event.event_type,
        },
        created_at: nowIso,
      })
    }
  }

  return {
    events: sortEvents(events),
    anomalies,
  }
}

function affinityRank(lotState, event) {
  if (event.event_type !== "purchase_return") return 0

  const eventBillId = event.metadata?.bill_id || null
  const eventBillItemIds = new Set(event.metadata?.bill_item_ids || [])
  const lotBillId = lotState.metadata?.bill_id || null
  const lotBillItemIds = new Set(lotState.metadata?.bill_item_ids || [])

  const hasItemMatch = [...eventBillItemIds].some((id) => lotBillItemIds.has(id))
  if (hasItemMatch) return 0
  if (eventBillId && lotBillId && eventBillId === lotBillId) return 1
  return 2
}

function sortOpenLots(openLots, event = null) {
  return [...openLots].sort((left, right) => {
    const affinityDiff = affinityRank(left, event) - affinityRank(right, event)
    if (affinityDiff !== 0) return affinityDiff
    if (left.lot_date !== right.lot_date) return String(left.lot_date).localeCompare(String(right.lot_date))
    if (left.source_ordering_key !== right.source_ordering_key) {
      return String(left.source_ordering_key).localeCompare(String(right.source_ordering_key))
    }
    return String(left.id).localeCompare(String(right.id))
  })
}

function createLotRow(runContext, companyContext, event, input) {
  return {
    id: stableUuid(runContext.runId, "lot", event.id, input.lotType, String(input.sequence || 1)),
    rebuild_run_id: runContext.runId,
    company_id: companyContext.companyId,
    product_id: event.product_id,
    branch_id: event.branch_id,
    cost_center_id: event.cost_center_id,
    warehouse_id: event.warehouse_id,
    lot_date: input.lotDate || event.effective_date,
    lot_type: input.lotType,
    source_event_id: event.id,
    source_table: event.source_table,
    source_id: event.source_id,
    source_line_id: event.source_line_id,
    source_reference_number: event.source_reference_number,
    original_quantity: Number(input.quantity.toFixed(4)),
    unit_cost: Number(input.unitCost.toFixed(4)),
    currency_code: "EGP",
    fx_rate: 1,
    audit_flags: input.auditFlags || [],
    metadata: input.metadata || {},
    created_at: runContext.generatedAt,
  }
}

function createConsumptionRow(runContext, companyContext, lotRow, event, input) {
  const quantity = Number(input.quantity.toFixed(4))
  const unitCost = Number(input.unitCost.toFixed(4))
  return {
    id: stableUuid(
      runContext.runId,
      "consumption",
      event.id,
      lotRow.id,
      input.consumptionMode,
      String(input.sequenceInEvent || 1)
    ),
    rebuild_run_id: runContext.runId,
    company_id: companyContext.companyId,
    product_id: event.product_id,
    lot_id: lotRow.id,
    source_event_id: event.id,
    consumption_mode: input.consumptionMode,
    reference_entity: event.reference_entity || event.event_type,
    reference_id: event.reference_id || event.source_id,
    reference_line_id: event.source_line_id || null,
    quantity,
    unit_cost: unitCost,
    total_cost: Number((quantity * unitCost).toFixed(4)),
    consumption_date: event.effective_date,
    sequence_in_event: input.sequenceInEvent || 1,
    origin_type: "rebuild",
    audit_flags: input.auditFlags || [],
    metadata: input.metadata || {},
    created_at: runContext.generatedAt,
  }
}

function buildFifoV2Artifacts(runContext, companyContext, sources, canonical, options = {}) {
  const productsById = buildMap(sources.products)
  const costIndexes = options.costIndexes || buildInboundCostIndexes(sources)
  const lotStatesByProduct = new Map()
  const lotStatesById = new Map()
  const saleAllocations = new Map()
  const negativeObligationsByProduct = new Map()
  const lots = []
  const consumptions = []
  const anomalies = [...canonical.anomalies]
  const remediationActions = []
  const nowIso = runContext.generatedAt
  const forwardFillEnabled = options.enableForwardFillResolution === true
  const returnWeightedRecoveryEnabled = options.enableReturnWeightedRecovery === true
  const periodWeightedFallbackEnabled = options.enablePeriodWeightedFallback !== false
  const allowCostFallback = options.allowCostFallback === true

  function pushLot(lotRow) {
    lots.push(lotRow)
    const state = {
      id: lotRow.id,
      product_id: lotRow.product_id,
      lot_date: lotRow.lot_date,
      source_ordering_key: canonical.events.find((event) => event.id === lotRow.source_event_id)?.ordering_key || lotRow.created_at,
      remaining_quantity: numeric(lotRow.original_quantity),
      unit_cost: numeric(lotRow.unit_cost),
      metadata: lotRow.metadata || {},
      lotRow,
    }
    lotStatesById.set(lotRow.id, state)
    const bucket = lotStatesByProduct.get(lotRow.product_id) || []
    bucket.push(state)
    lotStatesByProduct.set(lotRow.product_id, bucket)
    return state
  }

  function addAnomaly(payload) {
    anomalies.push({
      id: stableUuid(runContext.runId, "anomaly", payload.anomaly_type, payload.source_event_id || payload.reference_id || anomalies.length),
      rebuild_run_id: runContext.runId,
      company_id: companyContext.companyId,
      branch_id: payload.branch_id || null,
      cost_center_id: payload.cost_center_id || null,
      warehouse_id: payload.warehouse_id || null,
      created_at: nowIso,
      ...payload,
    })
  }

  function registerSaleAllocation(key, allocation) {
    const bucket = saleAllocations.get(key) || []
    bucket.push({
      ...allocation,
      restorable_quantity: allocation.quantity,
    })
    saleAllocations.set(key, bucket)
  }

  function getOpenBucket(productId) {
    if (!lotStatesByProduct.has(productId)) {
      lotStatesByProduct.set(productId, [])
    }
    return lotStatesByProduct.get(productId)
  }

  function getNegativeBucket(productId) {
    if (!negativeObligationsByProduct.has(productId)) {
      negativeObligationsByProduct.set(productId, [])
    }
    return negativeObligationsByProduct.get(productId)
  }

  function queueNegativeObligation(event, suspenseLot, suspenseConsumption, quantity) {
    const bucket = getNegativeBucket(event.product_id)
    bucket.push({
      id: stableUuid(runContext.runId, "negative-obligation", event.id, String(bucket.length + 1)),
      event,
      suspense_lot_id: suspenseLot.id,
      suspense_consumption_id: suspenseConsumption.id,
      unresolved_quantity: Number(quantity.toFixed(4)),
      created_at: nowIso,
    })
  }

  function resolveNegativeObligationsWithLot(lotState, inboundEvent, sequenceStart = 1) {
    if (!forwardFillEnabled) {
      return sequenceStart
    }

    const bucket = getNegativeBucket(lotState.product_id)
    let sequence = sequenceStart

    for (const obligation of bucket) {
      if (lotState.remaining_quantity <= 0.0001) break
      if (obligation.unresolved_quantity <= 0.0001) continue

      const resolved = Math.min(lotState.remaining_quantity, obligation.unresolved_quantity)
      if (resolved <= 0.0001) continue

      lotState.remaining_quantity = Number((lotState.remaining_quantity - resolved).toFixed(4))
      obligation.unresolved_quantity = Number((obligation.unresolved_quantity - resolved).toFixed(4))

      const remediationConsumption = createConsumptionRow(
        runContext,
        companyContext,
        lotState.lotRow,
        obligation.event,
        {
          consumptionMode: "retro_cost_assignment",
          quantity: resolved,
          unitCost: lotState.unit_cost,
          sequenceInEvent: sequence,
          auditFlags: ["FORWARD_FILL_RESOLUTION_USED"],
          metadata: {
            remediation_mode: "forward_fill",
            resolution_source_event_id: inboundEvent.id,
            resolution_source_reference_number: inboundEvent.source_reference_number,
            suspense_lot_id: obligation.suspense_lot_id,
            suspense_consumption_id: obligation.suspense_consumption_id,
          },
        }
      )

      consumptions.push(remediationConsumption)

      if (obligation.event.event_type === "sale" && obligation.event.reference_entity === "invoice" && obligation.event.reference_id) {
        registerSaleAllocation(`${obligation.event.reference_id}::${obligation.event.product_id}`, {
          lot_id: lotState.id,
          consumption_id: remediationConsumption.id,
          quantity: resolved,
          unit_cost: lotState.unit_cost,
          sequence,
          resolution_mode: "forward_fill",
        })
      }

      remediationActions.push({
        id: stableUuid(runContext.runId, "remediation", "forward_fill", obligation.id, lotState.id, String(sequence)),
        rebuild_run_id: runContext.runId,
        company_id: companyContext.companyId,
        action_type: "NEGATIVE_SUSPENSE_FORWARD_FILL",
        status: "applied",
        product_id: obligation.event.product_id,
        branch_id: obligation.event.branch_id,
        cost_center_id: obligation.event.cost_center_id,
        warehouse_id: obligation.event.warehouse_id,
        source_event_id: obligation.event.id,
        resolution_event_id: inboundEvent.id,
        reference_entity: obligation.event.reference_entity,
        reference_id: obligation.event.reference_id,
        quantity: resolved,
        unit_cost: lotState.unit_cost,
        amount: Number((resolved * lotState.unit_cost).toFixed(4)),
        details: {
          resolution_mode: "forward_fill",
          suspense_lot_id: obligation.suspense_lot_id,
          suspense_consumption_id: obligation.suspense_consumption_id,
          inbound_lot_id: lotState.id,
          inbound_lot_type: lotState.lotRow.lot_type,
        },
        created_at: nowIso,
      })

      sequence += 1
    }

    return sequence
  }

  function resolveReturnBridgeCost(event, knownAllocations) {
    const positiveAllocations = (knownAllocations || []).filter((allocation) =>
      numeric(allocation.unit_cost) > 0 && numeric(allocation.quantity) > 0
    )

    const allocationQuantity = sum(positiveAllocations.map((allocation) => numeric(allocation.quantity)))
    const allocationAmount = sum(
      positiveAllocations.map((allocation) => numeric(allocation.quantity) * numeric(allocation.unit_cost))
    )

    if (returnWeightedRecoveryEnabled && allocationQuantity > 0.0001) {
      return {
        unitCost: Number((allocationAmount / allocationQuantity).toFixed(4)),
        source: "invoice_allocation_weighted_recovery",
        auditFlag: "RETURN_WEIGHTED_RECOVERY_USED",
      }
    }

    const invoiceWeightedUnitCost = numeric(event.metadata?.invoice_weighted_return_unit_cost)
    if (invoiceWeightedUnitCost > 0.0001) {
      return {
        unitCost: invoiceWeightedUnitCost,
        source: "invoice_cogs_weighted_recovery",
        auditFlag: "RETURN_INVOICE_COGS_WEIGHTED_USED",
      }
    }

    if (periodWeightedFallbackEnabled) {
      const periodWeightedUnitCost = numeric(event.metadata?.period_weighted_return_unit_cost)
      if (periodWeightedUnitCost > 0.0001) {
        return {
          unitCost: periodWeightedUnitCost,
          source: event.metadata?.period_weighted_return_source || "period_weighted_fallback",
          auditFlag: "RETURN_PERIOD_WEIGHTED_FALLBACK_USED",
        }
      }
    }

    if (allowCostFallback) {
      const explicitFallbackUnitCost = numeric(event.metadata?.product_cost_price_fallback)
      if (explicitFallbackUnitCost > 0.0001) {
        return {
          unitCost: explicitFallbackUnitCost,
          source: "product_cost_price_fallback",
          auditFlag: "COST_FALLBACK_USED",
        }
      }
    }

    return {
      unitCost: 0,
      source: null,
      auditFlag: null,
    }
  }

  for (const event of canonical.events) {
    const product = productsById.get(event.product_id) || {}
    const openLots = getOpenBucket(event.product_id)

    if (event.direction === "in" && event.event_type !== "sales_return") {
      const lotType =
        event.event_type === "opening_stock" ? "opening_stock" :
        event.event_type === "purchase" ? "purchase" :
        "adjustment_in"

      const lotRow = createLotRow(runContext, companyContext, event, {
        lotType,
        quantity: event.quantity,
        unitCost: numeric(event.unit_cost || 0),
        auditFlags: event.audit_flags,
        metadata: {
          product_label: productLabel(product),
          bill_id: event.metadata?.bill_id || null,
          bill_item_ids: event.metadata?.bill_item_ids || [],
          source_reference_type: event.source_reference_type,
        },
      })

      const lotState = pushLot(lotRow)
      resolveNegativeObligationsWithLot(lotState, event, 1)
      continue
    }

    if (event.event_type === "sales_return") {
      const invoiceId = event.metadata?.invoice_id || null
      const allocationKey = invoiceId ? `${invoiceId}::${event.product_id}` : null
      const knownAllocations = allocationKey
        ? (saleAllocations.get(allocationKey) || []).filter((allocation) => numeric(allocation.unit_cost) > 0.0001)
        : []
      let remaining = numeric(event.quantity)
      let sequence = 1

      if (knownAllocations.length > 0) {
        for (const allocation of [...knownAllocations].reverse()) {
          if (remaining <= 0) break
          if (allocation.restorable_quantity <= 0) continue

          const lotState = lotStatesById.get(allocation.lot_id)
          if (!lotState) continue

          const restored = Math.min(allocation.restorable_quantity, remaining)
          allocation.restorable_quantity = Number((allocation.restorable_quantity - restored).toFixed(4))
          lotState.remaining_quantity = Number((lotState.remaining_quantity + restored).toFixed(4))

          const restoreRow = createConsumptionRow(runContext, companyContext, lotState.lotRow, event, {
            consumptionMode: "restore",
            quantity: restored,
            unitCost: allocation.unit_cost,
            sequenceInEvent: sequence,
            metadata: {
              restored_from_invoice_id: invoiceId,
              restored_from_consumption_id: allocation.consumption_id,
            },
          })

          consumptions.push(restoreRow)
          remaining = Number((remaining - restored).toFixed(4))
          sequence += 1
        }
      }

      if (remaining > 0.0001) {
        const bridgeResolution = resolveReturnBridgeCost(event, knownAllocations)
        const bridgeUnitCost = numeric(bridgeResolution.unitCost)
        const bridgeFlags = [...(event.audit_flags || [])]
        if (bridgeResolution.auditFlag) {
          bridgeFlags.push(bridgeResolution.auditFlag)
        }

        if (bridgeUnitCost <= 0) {
          addAnomaly({
            severity: "blocked",
            anomaly_type: "UNLINKED_SALES_RETURN_COST",
            product_id: event.product_id,
            branch_id: event.branch_id,
            cost_center_id: event.cost_center_id,
            warehouse_id: event.warehouse_id,
            source_event_id: event.id,
            reference_entity: event.reference_entity,
            reference_id: event.reference_id,
            quantity: remaining,
            amount: null,
            details: {
              invoice_id: invoiceId,
              reason: "sales return could not restore original invoice lot lineage and no approved fallback chain was available",
            },
          })
        } else {
          remediationActions.push({
            id: stableUuid(runContext.runId, "remediation", "sales-return-bridge", event.id),
            rebuild_run_id: runContext.runId,
            company_id: companyContext.companyId,
            action_type: "SALES_RETURN_COST_RECOVERY",
            status: "applied",
            product_id: event.product_id,
            branch_id: event.branch_id,
            cost_center_id: event.cost_center_id,
            warehouse_id: event.warehouse_id,
            source_event_id: event.id,
            resolution_event_id: event.id,
            reference_entity: event.reference_entity,
            reference_id: event.reference_id,
            quantity: remaining,
            unit_cost: bridgeUnitCost,
            amount: Number((remaining * bridgeUnitCost).toFixed(4)),
            details: {
              resolution_mode: bridgeResolution.source,
              invoice_id: invoiceId,
              cost_period_key: event.metadata?.period_weighted_return_period_key || null,
            },
            created_at: nowIso,
          })
        }

        const bridgeLot = createLotRow(runContext, companyContext, event, {
          lotType: "sales_return_bridge",
          quantity: remaining,
          unitCost: bridgeUnitCost,
          auditFlags: bridgeFlags,
          metadata: {
            bridged_invoice_id: invoiceId,
            product_label: productLabel(product),
          },
        })

        pushLot(bridgeLot)
      }

      continue
    }

    const candidateLots = sortOpenLots(openLots.filter((lot) => lot.remaining_quantity > 0.0001), event)
    let remaining = numeric(event.quantity)
    let sequence = 1

    for (const lotState of candidateLots) {
      if (remaining <= 0) break
      if (lotState.remaining_quantity <= 0) continue

      const consumed = Math.min(lotState.remaining_quantity, remaining)
      lotState.remaining_quantity = Number((lotState.remaining_quantity - consumed).toFixed(4))

      const consumptionRow = createConsumptionRow(runContext, companyContext, lotState.lotRow, event, {
        consumptionMode: "issue",
        quantity: consumed,
        unitCost: lotState.unit_cost,
        sequenceInEvent: sequence,
        metadata: {
          preferred_bill_id: event.metadata?.bill_id || null,
        },
      })

      consumptions.push(consumptionRow)
      remaining = Number((remaining - consumed).toFixed(4))

      if (event.event_type === "sale" && event.reference_entity === "invoice" && event.reference_id) {
        registerSaleAllocation(`${event.reference_id}::${event.product_id}`, {
          lot_id: lotState.id,
          consumption_id: consumptionRow.id,
          quantity: consumed,
          unit_cost: lotState.unit_cost,
          sequence,
        })
      }

      sequence += 1
    }

    if (event.event_type === "purchase_return" && numeric(event.quantity) > 0 && remaining > 0.0001) {
      addAnomaly({
        severity: "warning",
        anomaly_type: "PURCHASE_RETURN_LOT_AFFINITY_BROKEN",
        product_id: event.product_id,
        branch_id: event.branch_id,
        cost_center_id: event.cost_center_id,
        warehouse_id: event.warehouse_id,
        source_event_id: event.id,
        reference_entity: event.reference_entity,
        reference_id: event.reference_id,
        quantity: remaining,
        amount: null,
        details: {
          bill_id: event.metadata?.bill_id || null,
          note: "purchase return exceeded bill-affinity lots and fell through to generic FIFO or suspense handling",
        },
      })
    }

    if (remaining > 0.0001) {
      const suspenseLot = createLotRow(runContext, companyContext, event, {
        lotType: "negative_suspense",
        quantity: remaining,
        unitCost: 0,
        auditFlags: ["NEGATIVE_STOCK_SUSPENSE"],
        metadata: {
          source_event_id: event.id,
          reason: "outbound movement occurred before enough inbound cost layers existed",
          posting_policy: "non_activatable_until_resolved",
        },
      })

      const suspenseState = pushLot(suspenseLot)
      suspenseState.remaining_quantity = 0

      const suspenseConsumption = createConsumptionRow(runContext, companyContext, suspenseLot, event, {
        consumptionMode: "issue",
        quantity: remaining,
        unitCost: 0,
        sequenceInEvent: sequence,
        auditFlags: ["NEGATIVE_STOCK_SUSPENSE"],
        metadata: {
          suspense: true,
        },
      })

      consumptions.push(suspenseConsumption)

      queueNegativeObligation(event, suspenseLot, suspenseConsumption, remaining)
    }
  }

  for (const bucket of negativeObligationsByProduct.values()) {
    for (const obligation of bucket) {
      if (obligation.unresolved_quantity <= 0.0001) continue
      addAnomaly({
        severity: "blocked",
        anomaly_type: "NEGATIVE_STOCK_SUSPENSE",
        product_id: obligation.event.product_id,
        branch_id: obligation.event.branch_id,
        cost_center_id: obligation.event.cost_center_id,
        warehouse_id: obligation.event.warehouse_id,
        source_event_id: obligation.event.id,
        reference_entity: obligation.event.reference_entity,
        reference_id: obligation.event.reference_id,
        quantity: obligation.unresolved_quantity,
        amount: 0,
        details: {
          source_reference_number: obligation.event.source_reference_number,
          event_type: obligation.event.event_type,
          note: "A zero-cost suspense layer remains unresolved after forward-fill remediation.",
        },
      })
    }
  }

  const lotBalances = lots.map((lot) => {
    const state = lotStatesById.get(lot.id)
    const remainingQuantity = numeric(state?.remaining_quantity)
    return {
      ...lot,
      remaining_quantity: Number(remainingQuantity.toFixed(4)),
      remaining_value: Number((remainingQuantity * numeric(lot.unit_cost)).toFixed(4)),
    }
  })

  return {
    lots,
    consumptions,
    anomalies,
    lotBalances,
    remediationActions,
  }
}

function buildProductValuation(runContext, sources, lotBalances) {
  const txTotals = {}

  for (const tx of sources.inventoryTransactions || []) {
    txTotals[tx.product_id] = numeric(txTotals[tx.product_id]) + numeric(tx.quantity_change != null ? tx.quantity_change : tx.quantity)
  }

  const grouped = new Map()
  for (const lot of lotBalances || []) {
    const key = lot.product_id
    const bucket = grouped.get(key) || {
      product_id: lot.product_id,
      quantity_on_hand: 0,
      inventory_value: 0,
      open_lot_count: 0,
      suspense_lot_count: 0,
    }

    bucket.quantity_on_hand += numeric(lot.remaining_quantity)
    bucket.inventory_value += numeric(lot.remaining_value)
    if (numeric(lot.remaining_quantity) > 0.0001) {
      bucket.open_lot_count += 1
    }
    if (lot.lot_type === "negative_suspense") {
      bucket.suspense_lot_count += 1
    }
    grouped.set(key, bucket)
  }

  const rows = []
  for (const product of sources.products || []) {
    if (isService(product)) continue
    const aggregate = grouped.get(product.id) || {
      product_id: product.id,
      quantity_on_hand: 0,
      inventory_value: 0,
      open_lot_count: 0,
      suspense_lot_count: 0,
    }

    rows.push({
      rebuild_run_id: runContext.runId,
      product_id: product.id,
      product_label: productLabel(product),
      system_quantity_on_hand: numeric(product.quantity_on_hand),
      transaction_quantity_on_hand: numeric(txTotals[product.id]),
      rebuilt_quantity_on_hand: Number(aggregate.quantity_on_hand.toFixed(4)),
      rebuilt_inventory_value: Number(aggregate.inventory_value.toFixed(4)),
      quantity_gap_vs_products: Number((aggregate.quantity_on_hand - numeric(product.quantity_on_hand)).toFixed(4)),
      quantity_gap_vs_inventory_transactions: Number((aggregate.quantity_on_hand - numeric(txTotals[product.id])).toFixed(4)),
      open_lot_count: aggregate.open_lot_count,
      suspense_lot_count: aggregate.suspense_lot_count,
    })
  }

  return rows.sort((left, right) => right.rebuilt_inventory_value - left.rebuilt_inventory_value)
}

function buildWarehouseValuation(runContext, lotBalances) {
  const grouped = new Map()
  for (const lot of lotBalances || []) {
    const key = `${lot.warehouse_id || "none"}`
    const bucket = grouped.get(key) || {
      rebuild_run_id: runContext.runId,
      warehouse_id: lot.warehouse_id || null,
      quantity_on_hand: 0,
      inventory_value: 0,
      open_lot_count: 0,
    }
    bucket.quantity_on_hand += numeric(lot.remaining_quantity)
    bucket.inventory_value += numeric(lot.remaining_value)
    if (numeric(lot.remaining_quantity) > 0.0001) bucket.open_lot_count += 1
    grouped.set(key, bucket)
  }

  return [...grouped.values()].sort((left, right) => right.inventory_value - left.inventory_value)
}

function buildEventCompletenessSummary(sources, canonical) {
  const productsById = buildMap(sources.products)
  const eligibleTransactions = (sources.inventoryTransactions || []).filter((tx) => {
    const product = productsById.get(tx.product_id)
    if (!product || isService(product)) return false
    return Math.abs(numeric(tx.quantity_change != null ? tx.quantity_change : tx.quantity)) > 0.0001
  })

  const eventSourceIds = new Set((canonical.events || []).map((event) => String(event.source_id)))
  const missingTransactions = eligibleTransactions.filter((tx) => !eventSourceIds.has(String(tx.id)))

  const expectedByType = {}
  const producedByType = {}
  for (const tx of eligibleTransactions) {
    const key = detectEventType(tx)
    expectedByType[key] = (expectedByType[key] || 0) + 1
  }
  for (const event of canonical.events || []) {
    producedByType[event.event_type] = (producedByType[event.event_type] || 0) + 1
  }

  return {
    expectedCount: eligibleTransactions.length,
    producedCount: canonical.events.length,
    missingCount: missingTransactions.length,
    missingTransactions: missingTransactions.slice(0, 100).map((tx) => ({
      inventory_transaction_id: tx.id,
      product_id: tx.product_id,
      transaction_type: tx.transaction_type,
      reference_type: tx.reference_type,
      reference_id: tx.reference_id,
      created_at: tx.created_at || null,
      transaction_date: tx.transaction_date || null,
    })),
    expectedByType,
    producedByType,
  }
}

function buildSuspenseResolutionBacklog(runContext, canonical, anomalies) {
  const eventMap = new Map((canonical.events || []).map((event) => [event.id, event]))
  return (anomalies || [])
    .filter((row) => row.anomaly_type === "NEGATIVE_STOCK_SUSPENSE")
    .map((row) => {
      const event = eventMap.get(row.source_event_id)
      const eventType = event?.event_type || null
      let recommendedResolution = "manual_historical_review"

      if (eventType === "sale") {
        recommendedResolution = "backfill_missing_inbound_purchase_or_opening_balance"
      } else if (eventType === "purchase_return") {
        recommendedResolution = "restore_purchase_lot_affinity_or_reduce_return_scope"
      } else if (eventType === "write_off") {
        recommendedResolution = "confirm_write_off_effective_date_or_missing_inbound_cost_layer"
      } else if (eventType === "adjustment_out") {
        recommendedResolution = "attach_adjustment_to_approved_opening_or_manual_cost_bridge"
      }

      return {
        rebuild_run_id: runContext.runId,
        anomaly_id: row.id,
        source_event_id: row.source_event_id,
        product_id: row.product_id,
        quantity: row.quantity,
        event_type: eventType,
        reference_entity: row.reference_entity,
        reference_id: row.reference_id,
        recommended_resolution: recommendedResolution,
        close_required_before_cutover: true,
      }
    })
}

function buildValidationResults(runContext, companyContext, productValuationRows, anomalies, glInventory, completeness) {
  const validations = []
  const nowIso = runContext.generatedAt

  const productQtyFailures = productValuationRows.filter((row) => Math.abs(row.quantity_gap_vs_products) > 0.0001)
  const txQtyFailures = productValuationRows.filter((row) => Math.abs(row.quantity_gap_vs_inventory_transactions) > 0.0001)
  const blockedAnomalies = anomalies.filter((row) => ["blocked", "error"].includes(lower(row.severity)))
  const missingCostAnomalies = anomalies.filter((row) => row.anomaly_type === "MISSING_SOURCE_COST" || row.anomaly_type === "UNLINKED_SALES_RETURN_COST")
  const suspenseAnomalies = anomalies.filter((row) => row.anomaly_type === "NEGATIVE_STOCK_SUSPENSE")
  const fifoInventoryValue = Number(sum(productValuationRows.map((row) => row.rebuilt_inventory_value)).toFixed(4))
  const glDifference = Number((fifoInventoryValue - numeric(glInventory.total)).toFixed(4))

  const globalChecks = [
    {
      validation_key: "quantity_vs_products",
      status: productQtyFailures.length === 0 ? "passed" : "failed",
      metric_value: productQtyFailures.length,
      expected_value: 0,
      difference_value: productQtyFailures.length,
      details: {
        failed_products: productQtyFailures.slice(0, 50),
      },
    },
    {
      validation_key: "quantity_vs_inventory_transactions",
      status: txQtyFailures.length === 0 ? "passed" : "failed",
      metric_value: txQtyFailures.length,
      expected_value: 0,
      difference_value: txQtyFailures.length,
      details: {
        failed_products: txQtyFailures.slice(0, 50),
      },
    },
    {
      validation_key: "gl_inventory_variance",
      status: Math.abs(glDifference) <= 1 ? "passed" : "failed",
      metric_value: fifoInventoryValue,
      expected_value: numeric(glInventory.total),
      difference_value: glDifference,
      details: {
        gl_by_reference_type: glInventory.byReferenceType,
      },
    },
    {
      validation_key: "blocked_anomalies",
      status: blockedAnomalies.length === 0 ? "passed" : "blocked",
      metric_value: blockedAnomalies.length,
      expected_value: 0,
      difference_value: blockedAnomalies.length,
      details: {
        blocked_sample: blockedAnomalies.slice(0, 50),
      },
    },
    {
      validation_key: "missing_cost_anomalies",
      status: missingCostAnomalies.length === 0 ? "passed" : "blocked",
      metric_value: missingCostAnomalies.length,
      expected_value: 0,
      difference_value: missingCostAnomalies.length,
      details: {
        sample: missingCostAnomalies.slice(0, 50),
      },
    },
    {
      validation_key: "negative_stock_suspense",
      status: suspenseAnomalies.length === 0 ? "passed" : "blocked",
      metric_value: suspenseAnomalies.length,
      expected_value: 0,
      difference_value: suspenseAnomalies.length,
      details: {
        sample: suspenseAnomalies.slice(0, 50),
      },
    },
    {
      validation_key: "event_completeness",
      status: completeness.missingCount === 0 && completeness.expectedCount === completeness.producedCount ? "passed" : "failed",
      metric_value: completeness.producedCount,
      expected_value: completeness.expectedCount,
      difference_value: completeness.producedCount - completeness.expectedCount,
      details: completeness,
    },
  ]

  for (const check of globalChecks) {
    validations.push({
      id: stableUuid(runContext.runId, "validation", check.validation_key, "company"),
      rebuild_run_id: runContext.runId,
      company_id: companyContext.companyId,
      scope_type: "company",
      scope_id: companyContext.companyId,
      scope_label: companyContext.company?.name || companyContext.companyId,
      created_at: nowIso,
      ...check,
    })
  }

  return {
    validations,
    fifoInventoryValue,
    glDifference,
  }
}

function buildReconciliationBatch(runContext, companyContext, validationSummary, glInventory, productValuationRows, warehouseValuationRows, anomalies) {
  const blockedAnomalies = anomalies.filter((row) => ["blocked", "error"].includes(lower(row.severity)))
  const differenceValue = Number((validationSummary.fifoInventoryValue - numeric(glInventory.total)).toFixed(4))

  return [{
    id: stableUuid(runContext.runId, "gl-reconciliation", "company"),
    rebuild_run_id: runContext.runId,
    company_id: companyContext.companyId,
    scope_type: "company",
    scope_id: companyContext.companyId,
    scope_label: companyContext.company?.name || companyContext.companyId,
    gl_inventory_value: Number(numeric(glInventory.total).toFixed(4)),
    fifo_inventory_value: Number(validationSummary.fifoInventoryValue.toFixed(4)),
    difference_value: differenceValue,
    difference_type:
      Math.abs(differenceValue) <= 1
        ? "matched"
        : (differenceValue > 0 ? "fifo_over_gl" : "gl_over_fifo"),
    difference_classification: {
      posting_grain: "company",
      analytical_breakdowns: ["warehouse", "product"],
      auto_write_off_allowed: false,
      write_off_policy: "manual_only_after_validation",
      blocked_by: blockedAnomalies.slice(0, 20).map((row) => row.anomaly_type),
    },
    recommended_adjustment_account_id: null,
    recommended_entry_json: {
      policy: "manual_review_required",
      posting_grain: "company",
      note: "No write-off or GL adjustment may be posted until FIFO v2 validation passes, accounting-validation is clean, and cutover guard rails are satisfied.",
      analytical_support: {
        top_products: productValuationRows.slice(0, 20),
        top_warehouses: warehouseValuationRows.slice(0, 20),
      },
    },
    status: "pending",
    approved_by: null,
    approved_at: null,
    posted_journal_entry_id: null,
    created_at: runContext.generatedAt,
  }]
}

function buildRunSummary(runContext, companyContext, canonical, artifacts, validationSummary, glInventory) {
  const blockedAnomalies = artifacts.anomalies.filter((row) => ["blocked", "error"].includes(lower(row.severity)))
  return {
    run: {
      id: runContext.runId,
      key: runContext.runKey,
      company_id: companyContext.companyId,
      company_name: companyContext.company?.name || null,
      mode: runContext.executionProfile || "dry_run",
      cutoff_timestamp: runContext.cutoffTimestamp,
      as_of_timestamp: runContext.cutoffTimestamp,
      source_snapshot_hash: runContext.sourceSnapshotHash,
      deterministic_order: runContext.deterministicOrder,
      cost_source_priority_matrix: runContext.costSourcePriorityMatrix,
    },
    counts: {
      events: canonical.events.length,
      lots: artifacts.lots.length,
      consumptions: artifacts.consumptions.length,
      anomalies: artifacts.anomalies.length,
      blocked_anomalies: blockedAnomalies.length,
    },
    valuation: {
      fifo_inventory_value: validationSummary.fifoInventoryValue,
      gl_inventory_value: Number(numeric(glInventory.total).toFixed(4)),
      difference_value: validationSummary.glDifference,
    },
    status: {
      ok:
        blockedAnomalies.length === 0 &&
        Math.abs(validationSummary.glDifference) <= 1,
      activation_ready: false,
      cutover_blocked: true,
      reasons: [
        blockedAnomalies.length > 0 ? "Blocked anomalies remain in FIFO v2 dry-run artifacts." : null,
        Math.abs(validationSummary.glDifference) > 1 ? "FIFO v2 inventory value does not yet match GL within tolerance." : null,
        "Phase 1C.2 is dry-run only; live cutover is explicitly disabled.",
      ].filter(Boolean),
    },
  }
}

async function runPhase1C2DryRun(options = {}) {
  if (!hasLiveEnv()) {
    throw new Error("Supabase live env is missing. Phase 1C.2 dry-run extractor requires read access to source data.")
  }

  const supabase = options.supabase || createServiceClient()
  const companyContext = options.companyContext || await resolveCompanyContext(supabase)
  const asOfTimestamp = options.asOfTimestamp || new Date().toISOString()
  const executionProfile = options.executionProfile || options.mode || "dry_run"

  printSection("Loading Phase 1C.2 Sources")
  const sources = await fetchSources(supabase, companyContext.companyId, { asOfTimestamp })
  const costIndexes = buildInboundCostIndexes(sources)
  const runContext = createRunContext(companyContext, sources, {
    mode: executionProfile,
    cutoffTimestamp: asOfTimestamp,
    executionProfile,
  })
  runContext.costSourcePriorityMatrix = {
    purchase: ["bill_items.unit_price", "bill_items.line_total/quantity", "forward_fill_to_negative_suspense"],
    purchase_return: ["bill-affinity remaining lots", "same-bill product FIFO", "generic FIFO with anomaly"],
    sale: ["fifo issue allocation only"],
    sales_return: [
      "original invoice lot restoration",
      "invoice allocation weighted recovery",
      "invoice product weighted recovery cost",
      "period weighted fallback",
      "approved fallback only",
    ],
    adjustment_in: ["explicit adjustment cost", "approved opening bridge", "approved manual cost bridge"],
    adjustment_out: ["fifo issue allocation only"],
    write_off: ["fifo issue allocation only"],
  }

  printSection("Building Canonical Events")
  const canonical = buildCanonicalEvents(runContext, companyContext, sources, {
    allowCostFallback: options.allowCostFallback === true,
    costIndexes,
  })

  printSection("Building FIFO V2 Dry-Run Artifacts")
  const artifacts = buildFifoV2Artifacts(runContext, companyContext, sources, canonical, {
    costIndexes,
    allowCostFallback: options.allowCostFallback === true,
    enableForwardFillResolution: options.enableForwardFillResolution === true,
    enableReturnWeightedRecovery: options.enableReturnWeightedRecovery === true,
    enablePeriodWeightedFallback: options.enablePeriodWeightedFallback !== false,
  })

  printSection("Validating FIFO V2")
  const glInventory = computeGlInventory(sources.chartOfAccounts, sources.journalEntries, sources.journalEntryLines)
  const productValuationRows = buildProductValuation(runContext, sources, artifacts.lotBalances)
  const warehouseValuationRows = buildWarehouseValuation(runContext, artifacts.lotBalances)
  const completeness = buildEventCompletenessSummary(sources, canonical)
  const suspenseResolutionBacklog = buildSuspenseResolutionBacklog(runContext, canonical, artifacts.anomalies)
  const validationSummary = buildValidationResults(runContext, companyContext, productValuationRows, artifacts.anomalies, glInventory, completeness)
  const reconciliationBatches = buildReconciliationBatch(
    runContext,
    companyContext,
    validationSummary,
    glInventory,
    productValuationRows,
    warehouseValuationRows,
    artifacts.anomalies
  )
  const runSummary = buildRunSummary(runContext, companyContext, canonical, artifacts, validationSummary, glInventory)
  const sourceRows = buildSourceRows(runContext, companyContext)

  if (options.persistArtifacts !== false) {
    ensurePhase1C2ArtifactDir(runContext.runKey)
    writeArtifactJson(runContext.runKey, "fifo_rebuild_runs.json", [{
      id: runContext.runId,
      company_id: companyContext.companyId,
      mode: "dry_run",
      status: "completed",
      cutoff_timestamp: runContext.cutoffTimestamp,
      source_snapshot_hash: runContext.sourceSnapshotHash,
      idempotency_key: runContext.sourceSnapshotHash,
      deterministic_order: runContext.deterministicOrder,
      requested_by: null,
      summary_json: runSummary,
      validation_status: runSummary.status.ok ? "passed" : "blocked",
      started_at: runContext.generatedAt,
      completed_at: runContext.generatedAt,
      created_at: runContext.generatedAt,
    }])
    writeArtifactJson(runContext.runKey, "fifo_rebuild_run_sources.json", sourceRows)
    writeArtifactJson(runContext.runKey, "fifo_rebuild_events_v2.json", canonical.events)
    writeArtifactJson(runContext.runKey, "fifo_cost_lots_v2.json", artifacts.lots)
    writeArtifactJson(runContext.runKey, "fifo_lot_consumptions_v2.json", artifacts.consumptions)
    writeArtifactJson(runContext.runKey, "fifo_rebuild_anomalies_v2.json", artifacts.anomalies)
    writeArtifactJson(runContext.runKey, "fifo_rebuild_validation_results.json", validationSummary.validations)
    writeArtifactJson(runContext.runKey, "fifo_gl_reconciliation_batches.json", reconciliationBatches)
    writeArtifactJson(runContext.runKey, "inventory_valuation_per_product.json", productValuationRows)
    writeArtifactJson(runContext.runKey, "inventory_valuation_per_warehouse.json", warehouseValuationRows)
    writeArtifactJson(runContext.runKey, "event_completeness.json", completeness)
    writeArtifactJson(runContext.runKey, "suspense_resolution_backlog.json", suspenseResolutionBacklog)
    writeArtifactJson(runContext.runKey, "remediation_actions.json", artifacts.remediationActions || [])
    writeArtifactJson(runContext.runKey, "summary.json", runSummary)
  }

  return {
    companyContext,
    runContext,
    warnings: sources.warnings,
    sourceRows,
    canonicalEvents: canonical.events,
    lots: artifacts.lots,
    consumptions: artifacts.consumptions,
    anomalies: artifacts.anomalies,
    remediationActions: artifacts.remediationActions || [],
    eventCompleteness: completeness,
    suspenseResolutionBacklog,
    validations: validationSummary.validations,
    reconciliationBatches,
    productValuationRows,
    warehouseValuationRows,
    summary: runSummary,
  }
}

module.exports = {
  runPhase1C2DryRun,
}
