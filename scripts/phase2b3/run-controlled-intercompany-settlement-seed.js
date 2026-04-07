const {
  createServiceClient,
  exitWithReport,
  hasLiveEnv,
  stableHash,
  stableUuid,
  numeric,
} = require("./_shared")
const {
  nowIso,
  resolveCompany,
  ensureLegalEntityMapping,
  ensureGroupMember,
  ensureAccountingPeriod,
  loadActiveAccounts,
  requireAccount,
  ensureRelationship,
  ensureJournalEntryWithLines,
  ensureDocument,
} = require("./run-controlled-intercompany-seed")

function requireCashOrBankAccount(accounts, companyName) {
  return requireAccount(
    accounts,
    (row) => {
      const subType = String(row.sub_type || "").toLowerCase()
      const accountType = String(row.account_type || "").toLowerCase()
      const accountName = String(row.account_name || "").toLowerCase()
      return ["cash", "bank", "petty_cash", "cash_equivalent"].includes(subType)
        || (accountType === "asset" && (accountName.includes("cash") || accountName.includes("bank") || accountName.includes("صندوق") || accountName.includes("بنك")))
    },
    `Cash/Bank account was not found for ${companyName}`
  )
}

async function resolveControlledTransaction(supabase, sellerCompany, buyerCompany, effectiveDate, amount, currency) {
  const scenarioKey = stableHash({
    phase: "phase2b3",
    kind: "controlled_intercompany",
    sellerCompanyId: sellerCompany.id,
    buyerCompanyId: buyerCompany.id,
    effectiveDate,
    amount,
    currency,
  })

  const { data, error } = await supabase
    .from("intercompany_transactions")
    .select("*")
    .eq("seller_company_id", sellerCompany.id)
    .eq("buyer_company_id", buyerCompany.id)
    .eq("idempotency_key", `phase2b3-controlled-${scenarioKey}`)
    .maybeSingle()
  if (error) throw error
  if (!data) {
    throw new Error("Controlled intercompany base transaction was not found. Run phase2b3:scenario-seed first.")
  }
  return { transaction: data, scenarioKey }
}

async function requireExistingDocument(supabase, transactionId, side, stage) {
  const { data, error } = await supabase
    .from("intercompany_documents")
    .select("*")
    .eq("intercompany_transaction_id", transactionId)
    .eq("side", side)
    .eq("document_stage", stage)
    .eq("link_status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error(`Required intercompany document is missing for ${side}:${stage}`)
  return data
}

async function ensureSettlementReconciliation(supabase, payload, transactionId, report) {
  const { data: existing, error } = await supabase
    .from("intercompany_reconciliation_results")
    .select("*")
    .eq("intercompany_transaction_id", transactionId)
    .eq("reconciliation_scope", "full_cycle")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (existing) {
    report.actions.push({ id: "intercompany_settlement_reconciliation", status: "reused", reconciliationId: existing.id })
    return existing
  }

  const inserted = await supabase
    .from("intercompany_reconciliation_results")
    .insert(payload)
    .select("*")
    .single()
  if (inserted.error) throw inserted.error
  report.actions.push({ id: "intercompany_settlement_reconciliation", status: "created", reconciliationId: inserted.data.id })
  return inserted.data
}

async function closeTransactionIfNeeded(supabase, transactionId, report) {
  const { data: existing, error } = await supabase
    .from("intercompany_transactions")
    .select("id, status")
    .eq("id", transactionId)
    .single()
  if (error) throw error
  if (existing.status === "closed") {
    report.actions.push({ id: "intercompany_transaction_close", status: "reused", transactionId })
    return existing
  }

  const { data: updated, error: updateError } = await supabase
    .from("intercompany_transactions")
    .update({ status: "closed" })
    .eq("id", transactionId)
    .select("id, status")
    .single()
  if (updateError) throw updateError
  report.actions.push({ id: "intercompany_transaction_close", status: "updated", transactionId, transactionStatus: updated.status })
  return updated
}

async function run() {
  const report = {
    phase: "phase2b3-controlled-intercompany-settlement-seed",
    executedAt: nowIso(),
    mode: hasLiveEnv() ? "live" : "static",
    ok: true,
    actions: [],
  }

  if (!hasLiveEnv()) {
    report.ok = false
    report.error = "Supabase live env is missing. Cannot seed controlled intercompany settlement scenario."
    return exitWithReport("phase2b3-controlled-intercompany-settlement-seed", report)
  }

  const supabase = createServiceClient()
  const effectiveDate = String(process.env.PHASE2B3_SCENARIO_DATE || "2026-04-07")
  const settlementDate = String(process.env.PHASE2B3_SETTLEMENT_DATE || "2026-04-08")
  const currency = String(process.env.PHASE2B3_SCENARIO_CURRENCY || "EGP")
  const amount = Number(process.env.PHASE2B3_SCENARIO_AMOUNT || 2500)
  if (!(amount > 0)) throw new Error("PHASE2B3_SCENARIO_AMOUNT must be greater than zero")

  const sellerCompany = await resolveCompany(
    supabase,
    process.env.PHASE2B3_HOST_COMPANY_ID || process.env.PHASE1B_COMPANY_ID,
    process.env.PHASE2B3_PRIMARY_COMPANY_NAME || "VitaSlims"
  )
  const buyerCompany = await resolveCompany(
    supabase,
    process.env.PHASE2B3_SECONDARY_COMPANY_ID,
    process.env.PHASE2B3_SECONDARY_COMPANY_NAME || "تست"
  )
  if (sellerCompany.id === buyerCompany.id) throw new Error("Seller and buyer companies must be different")

  const groupCode = String(process.env.PHASE2B3_GROUP_CODE || "VITASLIMS_GROUP")
  const { data: group, error: groupError } = await supabase
    .from("consolidation_groups")
    .select("*")
    .eq("group_code", groupCode)
    .maybeSingle()
  if (groupError) throw groupError
  if (!group) throw new Error(`Consolidation group ${groupCode} was not found`)

  const sellerEntityMapping = await ensureLegalEntityMapping(supabase, sellerCompany, {
    entityCode: String(process.env.PHASE2B3_PRIMARY_ENTITY_CODE || "VITASLIMS_LE"),
    countryCode: String(process.env.PHASE2B3_PRIMARY_COUNTRY_CODE || "EG"),
    functionalCurrency: String(process.env.PHASE2B3_PRIMARY_FUNCTIONAL_CURRENCY || currency),
    legalName: sellerCompany.name,
  }, report)
  const buyerEntityMapping = await ensureLegalEntityMapping(supabase, buyerCompany, {
    entityCode: String(process.env.PHASE2B3_SECONDARY_ENTITY_CODE || "TEST_LE"),
    countryCode: String(process.env.PHASE2B3_SECONDARY_COUNTRY_CODE || "EG"),
    functionalCurrency: String(process.env.PHASE2B3_SECONDARY_FUNCTIONAL_CURRENCY || currency),
    legalName: buyerCompany.name,
  }, report)

  await ensureGroupMember(supabase, group.id, sellerEntityMapping.legalEntity.id, sellerCompany.name, report)
  await ensureGroupMember(supabase, group.id, buyerEntityMapping.legalEntity.id, buyerCompany.name, report)
  await ensureAccountingPeriod(supabase, sellerCompany.id, settlementDate, report, `${sellerCompany.name}:settlement`)
  await ensureAccountingPeriod(supabase, buyerCompany.id, settlementDate, report, `${buyerCompany.name}:settlement`)

  await ensureRelationship(
    supabase,
    sellerCompany,
    buyerCompany,
    sellerEntityMapping.legalEntity.id,
    buyerEntityMapping.legalEntity.id,
    effectiveDate,
    report
  )

  const { transaction, scenarioKey } = await resolveControlledTransaction(
    supabase,
    sellerCompany,
    buyerCompany,
    effectiveDate,
    amount,
    currency
  )

  const sellerAccounts = await loadActiveAccounts(supabase, sellerCompany.id)
  const buyerAccounts = await loadActiveAccounts(supabase, buyerCompany.id)
  const sellerAr = requireAccount(
    sellerAccounts,
    (row) => row.sub_type === "accounts_receivable",
    `Seller AR account was not found for ${sellerCompany.name}`
  )
  const buyerAp = requireAccount(
    buyerAccounts,
    (row) => row.sub_type === "accounts_payable",
    `Buyer AP account was not found for ${buyerCompany.name}`
  )
  const sellerCash = requireCashOrBankAccount(sellerAccounts, sellerCompany.name)
  const buyerCash = requireCashOrBankAccount(buyerAccounts, buyerCompany.name)

  const sellerInvoice = await requireExistingDocument(supabase, transaction.id, "seller", "invoice")
  const buyerBill = await requireExistingDocument(supabase, transaction.id, "buyer", "bill")

  const sellerReceiptReferenceId = stableUuid("phase2b3", "seller_receipt_journal", scenarioKey)
  const buyerPaymentReferenceId = stableUuid("phase2b3", "buyer_payment_journal", scenarioKey)
  const sellerReceiptDocumentId = stableUuid("phase2b3", "seller_receipt_document", scenarioKey)
  const buyerPaymentDocumentId = stableUuid("phase2b3", "buyer_payment_document", scenarioKey)
  const rateTimestamp = `${settlementDate}T12:00:00.000Z`

  const sellerReceiptEntry = await ensureJournalEntryWithLines(supabase, {
    companyId: sellerCompany.id,
    referenceType: "intercompany_settlement_seed",
    referenceId: sellerReceiptReferenceId,
    entryDate: settlementDate,
    description: `Phase 2B.3 controlled intercompany settlement receipt ${buyerCompany.name}`,
    label: `${sellerCompany.name}:settlement_receipt`,
    lines: [
      {
        account_id: sellerCash.id,
        debit_amount: amount,
        credit_amount: 0,
        description: "Controlled intercompany settlement receipt",
      },
      {
        account_id: sellerAr.id,
        debit_amount: 0,
        credit_amount: amount,
        description: "Controlled intercompany AR settlement",
      },
    ],
  }, report)

  const buyerPaymentEntry = await ensureJournalEntryWithLines(supabase, {
    companyId: buyerCompany.id,
    referenceType: "intercompany_settlement_seed",
    referenceId: buyerPaymentReferenceId,
    entryDate: settlementDate,
    description: `Phase 2B.3 controlled intercompany settlement payment ${sellerCompany.name}`,
    label: `${buyerCompany.name}:settlement_payment`,
    lines: [
      {
        account_id: buyerAp.id,
        debit_amount: amount,
        credit_amount: 0,
        description: "Controlled intercompany AP settlement",
      },
      {
        account_id: buyerCash.id,
        debit_amount: 0,
        credit_amount: amount,
        description: "Controlled intercompany settlement payment",
      },
    ],
  }, report)

  const sellerReceipt = await ensureDocument(supabase, {
    intercompany_transaction_id: transaction.id,
    company_id: sellerCompany.id,
    side: "seller",
    document_stage: "receipt",
    document_id: sellerReceiptDocumentId,
    document_number: `IC-RCP-${String(scenarioKey).slice(0, 8).toUpperCase()}`,
    revision_no: 1,
    document_amount: amount,
    transaction_currency: currency,
    locked_exchange_rate: 1,
    locked_rate_timestamp: rateTimestamp,
    rate_source: "controlled_seed_identity",
    reference_role: "seller_receipt",
    metadata: {
      controlled_scenario: true,
      settlement_scenario: true,
      scenario_key: scenarioKey,
      journal_reference_id: sellerReceiptReferenceId,
      journal_entry_id: sellerReceiptEntry.id,
    },
    link_status: "active",
  }, report, "seller_receipt")

  const buyerPayment = await ensureDocument(supabase, {
    intercompany_transaction_id: transaction.id,
    company_id: buyerCompany.id,
    side: "buyer",
    document_stage: "payment",
    document_id: buyerPaymentDocumentId,
    document_number: `IC-PMT-${String(scenarioKey).slice(0, 8).toUpperCase()}`,
    revision_no: 1,
    document_amount: amount,
    transaction_currency: currency,
    locked_exchange_rate: 1,
    locked_rate_timestamp: rateTimestamp,
    rate_source: "controlled_seed_identity",
    reference_role: "buyer_payment",
    metadata: {
      controlled_scenario: true,
      settlement_scenario: true,
      scenario_key: scenarioKey,
      journal_reference_id: buyerPaymentReferenceId,
      journal_entry_id: buyerPaymentEntry.id,
    },
    link_status: "active",
  }, report, "buyer_payment")

  const settlementReconciliation = await ensureSettlementReconciliation(supabase, {
    intercompany_transaction_id: transaction.id,
    seller_invoice_id: sellerInvoice.document_id,
    buyer_bill_id: buyerBill.document_id,
    seller_receipt_id: sellerReceipt.document_id,
    buyer_payment_id: buyerPayment.document_id,
    reconciliation_scope: "full_cycle",
    seller_open_amount: 0,
    buyer_open_amount: 0,
    amount_variance: 0,
    currency_variance: 0,
    date_variance_days: 0,
    tolerance_applied: {
      tolerance_amount: 0,
      tolerance_percent: 0,
      scenario: "phase2b3_controlled_settlement",
    },
    result_status: "matched",
    mismatch_reason: null,
    alert_generated: false,
  }, transaction.id, report)

  const closedTransaction = await closeTransactionIfNeeded(supabase, transaction.id, report)

  report.seed = {
    group: {
      id: group.id,
      code: group.group_code,
    },
    seller: {
      companyId: sellerCompany.id,
      companyName: sellerCompany.name,
      legalEntityId: sellerEntityMapping.legalEntity.id,
      arAccountCode: sellerAr.account_code,
      cashAccountCode: sellerCash.account_code,
    },
    buyer: {
      companyId: buyerCompany.id,
      companyName: buyerCompany.name,
      legalEntityId: buyerEntityMapping.legalEntity.id,
      apAccountCode: buyerAp.account_code,
      cashAccountCode: buyerCash.account_code,
    },
    transaction: {
      id: transaction.id,
      status: closedTransaction.status,
      amount: numeric(transaction.transaction_amount),
      currency: transaction.transaction_currency,
      effectiveDate: transaction.transaction_date,
      settlementDate,
      scenarioKey,
    },
    settlement: {
      sellerReceiptJournalId: sellerReceiptEntry.id,
      buyerPaymentJournalId: buyerPaymentEntry.id,
      sellerReceiptDocumentId: sellerReceipt.id,
      buyerPaymentDocumentId: buyerPayment.id,
    },
    reconciliation: {
      id: settlementReconciliation.id,
      scope: settlementReconciliation.reconciliation_scope,
      resultStatus: settlementReconciliation.result_status,
      sellerOpenAmount: numeric(settlementReconciliation.seller_open_amount),
      buyerOpenAmount: numeric(settlementReconciliation.buyer_open_amount),
    },
  }

  exitWithReport("phase2b3-controlled-intercompany-settlement-seed", report)
}

run().catch((error) => {
  exitWithReport("phase2b3-controlled-intercompany-settlement-seed", {
    phase: "phase2b3-controlled-intercompany-settlement-seed",
    executedAt: nowIso(),
    ok: false,
    error: error.message,
  })
})
