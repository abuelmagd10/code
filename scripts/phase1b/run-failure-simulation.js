const {
  createServiceClient,
  createUserContextClient,
  exitWithReport,
  hasLiveEnv,
  loadJsonFile,
  printSection,
  randomUuid,
  resolveCompanyContext,
  snapshotInvoiceLifecycle,
} = require("./_shared")

function loadFailureConfig() {
  const filePath = process.env.PHASE1B_FAILURE_SCENARIOS_FILE
  if (!filePath) {
    throw new Error("Provide PHASE1B_FAILURE_SCENARIOS_FILE for failure simulation.")
  }
  return loadJsonFile(filePath)
}

async function snapshotSupplierPaymentState(supabase, companyId, supplierId, paymentDate) {
  const { data: payments, error: paymentsError } = await supabase
    .from("payments")
    .select("id, amount, payment_date, status, supplier_id")
    .eq("company_id", companyId)
    .eq("supplier_id", supplierId)
    .eq("payment_date", paymentDate)
    .or("is_deleted.is.null,is_deleted.eq.false")

  if (paymentsError) throw paymentsError

  const paymentIds = (payments || []).map((item) => item.id)
  let allocations = []
  if (paymentIds.length > 0) {
    const { data: allocationRows, error: allocationError } = await supabase
      .from("payment_allocations")
      .select("id, payment_id, bill_id, allocated_amount")
      .in("payment_id", paymentIds)

    if (allocationError) throw allocationError
    allocations = allocationRows || []
  }

  return {
    paymentsCount: (payments || []).length,
    allocationCount: allocations.length,
  }
}

async function run() {
  const report = {
    phase: "phase1b-failure-simulation",
    executedAt: new Date().toISOString(),
    mode: hasLiveEnv() ? "live" : "static",
    ok: true,
    checks: [],
  }

  if (!hasLiveEnv()) {
    report.ok = false
    report.checks.push({
      id: "env",
      passed: false,
      severity: "critical",
      message: "Supabase live env is missing. Cannot execute failure simulation.",
    })
    return exitWithReport("phase1b-failure-simulation", report)
  }

  const config = loadFailureConfig()
  const supabase = createServiceClient()
  const companyContext = await resolveCompanyContext(supabase)
  report.company = {
    id: companyContext.companyId,
    name: companyContext.company?.name || null,
    resolution: companyContext.resolution,
  }

  if (config.warehouseApproval) {
    printSection("Failure Simulation: Warehouse Approval")
    const args = { ...config.warehouseApproval.args }
    const companyId = args.p_company_id || companyContext.companyId
    const invoiceId = args.p_invoice_id
    const before = await snapshotInvoiceLifecycle(supabase, companyId, invoiceId)

    const brokenRecord = {
      company_id: companyId,
      invoice_id: invoiceId,
      product_id: randomUuid(),
      quantity: 1,
      unit_cost: 1,
      total_cost: 1,
      status: "open",
    }

    const { error } = await supabase.rpc("approve_sales_delivery_v2", {
      ...args,
      p_third_party_inventory_records: [brokenRecord],
      p_idempotency_key: `phase1b-failure:warehouse:${randomUuid()}`,
      p_request_hash: randomUuid(),
    })

    const after = await snapshotInvoiceLifecycle(supabase, companyId, invoiceId)
    const compare = JSON.stringify(before) === JSON.stringify(after)

    report.checks.push({
      id: "warehouse_approval_atomic_rollback",
      passed: !!error && compare,
      severity: "critical",
      message: !!error && compare
        ? "Warehouse approval failure rolled back all observable state."
        : "Warehouse approval failure did not preserve a clean rollback state.",
      data: {
        error: error?.message || null,
        invoiceId,
        companyId,
        beforeShape: before.invoice ? {
          warehouse_status: before.invoice.warehouse_status,
          paid_amount: before.invoice.paid_amount,
          returned_amount: before.invoice.returned_amount,
        } : null,
        afterShape: after.invoice ? {
          warehouse_status: after.invoice.warehouse_status,
          paid_amount: after.invoice.paid_amount,
          returned_amount: after.invoice.returned_amount,
        } : null,
        identicalSnapshot: compare,
      },
    })
  }

  if (config.salesReturn) {
    printSection("Failure Simulation: Sales Return")
    const args = { ...config.salesReturn.args }
    const companyId = args.p_company_id || companyContext.companyId
    const invoiceId = args.p_invoice_id
    const before = await snapshotInvoiceLifecycle(supabase, companyId, invoiceId)

    const invalidLedgerRow = {
      company_id: companyId,
      customer_id: args.p_trace_metadata?.customer_id || randomUuid(),
      source_type: "sales_return",
      source_id: randomUuid(),
      amount: 0,
      description: "phase1b forced failure",
    }

    const { error } = await supabase.rpc("process_sales_return_atomic_v2", {
      ...args,
      p_customer_credit_ledger_entries: [invalidLedgerRow],
      p_idempotency_key: `phase1b-failure:return:${randomUuid()}`,
      p_request_hash: randomUuid(),
    })

    const after = await snapshotInvoiceLifecycle(supabase, companyId, invoiceId)
    const compare = JSON.stringify(before) === JSON.stringify(after)

    report.checks.push({
      id: "sales_return_atomic_rollback",
      passed: !!error && compare,
      severity: "critical",
      message: !!error && compare
        ? "Sales return failure rolled back all observable state."
        : "Sales return failure did not preserve a clean rollback state.",
      data: {
        error: error?.message || null,
        invoiceId,
        companyId,
        identicalSnapshot: compare,
      },
    })
  }

  if (config.supplierPaymentAllocation) {
    printSection("Failure Simulation: Supplier Payment Allocation")
    const args = { ...config.supplierPaymentAllocation.args }
    const companyId = args.p_company_id || companyContext.companyId
    const supplierId = args.p_supplier_id
    const paymentDate = args.p_payment_date
    const before = await snapshotSupplierPaymentState(supabase, companyId, supplierId, paymentDate)

    const userClient = createUserContextClient()
    const brokenAllocations = (args.p_allocations || []).length > 0
      ? args.p_allocations.map((item, index) => (
        index === 0
          ? { ...item, bill_id: randomUuid() }
          : item
      ))
      : [{ bill_id: randomUuid(), amount: 1 }]

    const { error } = await userClient.rpc("process_supplier_payment_allocation", {
      ...args,
      p_allocations: brokenAllocations,
    })

    const after = await snapshotSupplierPaymentState(supabase, companyId, supplierId, paymentDate)
    const compare = JSON.stringify(before) === JSON.stringify(after)

    report.checks.push({
      id: "supplier_payment_allocation_atomic_rollback",
      passed: !!error && compare,
      severity: "critical",
      message: !!error && compare
        ? "Supplier payment allocation failure rolled back all observable state."
        : "Supplier payment allocation failure did not preserve a clean rollback state.",
      data: {
        error: error?.message || null,
        supplierId,
        companyId,
        before,
        after,
        identicalSnapshot: compare,
      },
    })
  }

  report.ok = report.checks.length > 0 && report.checks.every((check) => check.passed)
  exitWithReport("phase1b-failure-simulation", report)
}

run().catch((error) => {
  exitWithReport("phase1b-failure-simulation", {
    phase: "phase1b-failure-simulation",
    executedAt: new Date().toISOString(),
    ok: false,
    error: error.message,
  })
})
