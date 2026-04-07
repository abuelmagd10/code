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

function findFxAccount(accounts, mode, companyName) {
  const normalizedMode = String(mode || "").toLowerCase()
  const directMatch = accounts.find((row) => {
    const code = String(row.account_code || "")
    const name = String(row.account_name || "").toLowerCase()
    if (normalizedMode === "gain") {
      return code === "4400" || (name.includes("fx") && name.includes("gain")) || name.includes("foreign exchange gains") || name.includes("ارباح فروق")
    }
    return code === "5310" || (name.includes("fx") && name.includes("loss")) || name.includes("foreign exchange losses") || name.includes("خسائر فروق")
  })
  if (directMatch) return directMatch

  const fallback = accounts.find((row) => {
    const subType = String(row.sub_type || "").toLowerCase()
    const accountType = String(row.account_type || "").toLowerCase()
    const name = String(row.account_name || "").toLowerCase()
    if (normalizedMode === "gain") {
      return ["other_income", "misc_income", "non_operating_income"].includes(subType)
        || name.includes("other income")
        || (accountType === "revenue")
        || (accountType === "expense")
    }
    return ["other_expense", "misc_expense", "non_operating_expense"].includes(subType)
      || name.includes("other expense")
      || (accountType === "expense")
      || (accountType === "revenue")
  })
  if (!fallback) throw new Error(`FX ${normalizedMode} account was not found for ${companyName}`)
  return fallback
}

async function resolveFxControlledTransaction(supabase, sellerCompany, buyerCompany, effectiveDate, amount, currency, sellerRate, buyerRate) {
  const scenarioKey = stableHash({
    phase: "phase2b3",
    kind: "controlled_intercompany_fx_non_identity",
    sellerCompanyId: sellerCompany.id,
    buyerCompanyId: buyerCompany.id,
    effectiveDate,
    amount,
    currency,
    sellerRate,
    buyerRate,
  })

  const { data, error } = await supabase
    .from("intercompany_transactions")
    .select("*")
    .eq("seller_company_id", sellerCompany.id)
    .eq("buyer_company_id", buyerCompany.id)
    .eq("idempotency_key", `phase2b3-fx-${scenarioKey}`)
    .maybeSingle()
  if (error) throw error
  if (!data) {
    throw new Error("Controlled FX intercompany transaction was not found. Run phase2b3:fx-seed first.")
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
    report.actions.push({ id: "intercompany_fx_settlement_reconciliation", status: "reused", reconciliationId: existing.id })
    return existing
  }

  const inserted = await supabase
    .from("intercompany_reconciliation_results")
    .insert(payload)
    .select("*")
    .single()
  if (inserted.error) throw inserted.error
  report.actions.push({ id: "intercompany_fx_settlement_reconciliation", status: "created", reconciliationId: inserted.data.id })
  return inserted.data
}

function buildSellerSettlementLines({ settlementAmount, carryingAmount, cashAccountId, arAccountId, gainAccountId, lossAccountId }) {
  const difference = Number((settlementAmount - carryingAmount).toFixed(4))
  const lines = [
    {
      account_id: cashAccountId,
      debit_amount: settlementAmount,
      credit_amount: 0,
      description: "Controlled FX settlement receipt",
    },
    {
      account_id: arAccountId,
      debit_amount: 0,
      credit_amount: carryingAmount,
      description: "Controlled FX AR settlement",
    },
  ]
  if (difference > 0.0001) {
    lines.push({
      account_id: gainAccountId,
      debit_amount: 0,
      credit_amount: difference,
      description: "Controlled realized FX gain on settlement",
    })
  }
  else if (difference < -0.0001) {
    lines.push({
      account_id: lossAccountId,
      debit_amount: Math.abs(difference),
      credit_amount: 0,
      description: "Controlled realized FX loss on settlement",
    })
  }
  return { lines, difference }
}

function buildBuyerSettlementLines({ settlementAmount, carryingAmount, cashAccountId, apAccountId, gainAccountId, lossAccountId }) {
  const difference = Number((carryingAmount - settlementAmount).toFixed(4))
  const lines = [
    {
      account_id: apAccountId,
      debit_amount: carryingAmount,
      credit_amount: 0,
      description: "Controlled FX AP settlement",
    },
    {
      account_id: cashAccountId,
      debit_amount: 0,
      credit_amount: settlementAmount,
      description: "Controlled FX settlement payment",
    },
  ]
  if (difference > 0.0001) {
    lines.push({
      account_id: gainAccountId,
      debit_amount: 0,
      credit_amount: difference,
      description: "Controlled realized FX gain on settlement",
    })
  }
  else if (difference < -0.0001) {
    lines.push({
      account_id: lossAccountId,
      debit_amount: Math.abs(difference),
      credit_amount: 0,
      description: "Controlled realized FX loss on settlement",
    })
  }
  return { lines, difference }
}

async function closeAndAnnotateTransaction(supabase, transaction, fxSettlementRealization, report) {
  const existingContext = transaction.operational_context || {}
  const nextContext = {
    ...existingContext,
    fx_settlement_realization: fxSettlementRealization,
  }
  const existingHash = stableHash({
    status: transaction.status,
    fx_settlement_realization: existingContext.fx_settlement_realization || null,
  })
  const nextHash = stableHash({
    status: "closed",
    fx_settlement_realization: fxSettlementRealization,
  })
  if (existingHash === nextHash) {
    report.actions.push({ id: "intercompany_fx_transaction_finalize", status: "reused", transactionId: transaction.id, transactionStatus: transaction.status })
    return transaction
  }

  const { data: updated, error } = await supabase
    .from("intercompany_transactions")
    .update({
      status: "closed",
      operational_context: nextContext,
    })
    .eq("id", transaction.id)
    .select("*")
    .single()
  if (error) throw error
  report.actions.push({ id: "intercompany_fx_transaction_finalize", status: "updated", transactionId: updated.id, transactionStatus: updated.status })
  return updated
}

async function run() {
  const report = {
    phase: "phase2b3-controlled-intercompany-fx-settlement-seed",
    executedAt: nowIso(),
    mode: hasLiveEnv() ? "live" : "static",
    ok: true,
    actions: [],
  }

  if (!hasLiveEnv()) {
    report.ok = false
    report.error = "Supabase live env is missing. Cannot seed controlled FX settlement scenario."
    return exitWithReport("phase2b3-controlled-intercompany-fx-settlement-seed", report)
  }

  const supabase = createServiceClient()
  const effectiveDate = String(process.env.PHASE2B3_FX_SCENARIO_DATE || "2026-04-09")
  const settlementDate = String(process.env.PHASE2B3_FX_SETTLEMENT_DATE || "2026-04-10")
  const currency = String(process.env.PHASE2B3_FX_SCENARIO_CURRENCY || "USD")
  const amount = Number(process.env.PHASE2B3_FX_SCENARIO_AMOUNT || 2500)
  const sellerRate = Number(process.env.PHASE2B3_FX_SELLER_RATE || 30)
  const buyerRate = Number(process.env.PHASE2B3_FX_BUYER_RATE || 32)
  const settlementRate = Number(process.env.PHASE2B3_FX_SETTLEMENT_RATE || 31)
  if (!(amount > 0)) throw new Error("PHASE2B3_FX_SCENARIO_AMOUNT must be greater than zero")
  if (!(sellerRate > 0) || !(buyerRate > 0) || !(settlementRate > 0)) throw new Error("FX settlement rates must be greater than zero")

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
    functionalCurrency: String(process.env.PHASE2B3_PRIMARY_FUNCTIONAL_CURRENCY || "EGP"),
    legalName: sellerCompany.name,
  }, report)
  const buyerEntityMapping = await ensureLegalEntityMapping(supabase, buyerCompany, {
    entityCode: String(process.env.PHASE2B3_SECONDARY_ENTITY_CODE || "TEST_LE"),
    countryCode: String(process.env.PHASE2B3_SECONDARY_COUNTRY_CODE || "EG"),
    functionalCurrency: String(process.env.PHASE2B3_SECONDARY_FUNCTIONAL_CURRENCY || "EGP"),
    legalName: buyerCompany.name,
  }, report)

  await ensureGroupMember(supabase, group.id, sellerEntityMapping.legalEntity.id, sellerCompany.name, report)
  await ensureGroupMember(supabase, group.id, buyerEntityMapping.legalEntity.id, buyerCompany.name, report)
  await ensureAccountingPeriod(supabase, sellerCompany.id, settlementDate, report, `${sellerCompany.name}:fx_settlement`)
  await ensureAccountingPeriod(supabase, buyerCompany.id, settlementDate, report, `${buyerCompany.name}:fx_settlement`)

  await ensureRelationship(
    supabase,
    sellerCompany,
    buyerCompany,
    sellerEntityMapping.legalEntity.id,
    buyerEntityMapping.legalEntity.id,
    effectiveDate,
    report
  )

  const { transaction, scenarioKey } = await resolveFxControlledTransaction(
    supabase,
    sellerCompany,
    buyerCompany,
    effectiveDate,
    amount,
    currency,
    sellerRate,
    buyerRate
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
  const sellerFxGain = findFxAccount(sellerAccounts, "gain", sellerCompany.name)
  const sellerFxLoss = findFxAccount(sellerAccounts, "loss", sellerCompany.name)
  const buyerFxGain = findFxAccount(buyerAccounts, "gain", buyerCompany.name)
  const buyerFxLoss = findFxAccount(buyerAccounts, "loss", buyerCompany.name)

  const sellerInvoice = await requireExistingDocument(supabase, transaction.id, "seller", "invoice")
  const buyerBill = await requireExistingDocument(supabase, transaction.id, "buyer", "bill")

  const carryingLocalAmounts = transaction.operational_context?.elimination_local_amounts || {}
  const sellerCarryingAmount = Number(firstDefined(
    carryingLocalAmounts.seller_amount,
    carryingLocalAmounts.seller_local_amount,
    amount * sellerRate
  ).toFixed(4))
  const buyerCarryingAmount = Number(firstDefined(
    carryingLocalAmounts.buyer_amount,
    carryingLocalAmounts.buyer_local_amount,
    amount * buyerRate
  ).toFixed(4))
  const settlementLocalAmount = Number((amount * settlementRate).toFixed(4))
  const reserveReleaseAmount = Number(Math.abs(buyerCarryingAmount - sellerCarryingAmount).toFixed(4))
  const reserveAccountCode = String(transaction.operational_context?.fx_difference_handling?.reserve_account_code || "3998")
  const settlementScenarioKey = stableHash({
    phase: "phase2b3",
    kind: "controlled_intercompany_fx_settlement",
    scenarioKey,
    settlementDate,
    settlementRate,
  })
  const sellerReceiptReferenceId = stableUuid("phase2b3", "seller_fx_settlement_journal", settlementScenarioKey)
  const buyerPaymentReferenceId = stableUuid("phase2b3", "buyer_fx_settlement_journal", settlementScenarioKey)
  const sellerReceiptDocumentId = stableUuid("phase2b3", "seller_fx_settlement_document", settlementScenarioKey)
  const buyerPaymentDocumentId = stableUuid("phase2b3", "buyer_fx_settlement_document", settlementScenarioKey)
  const rateTimestamp = `${settlementDate}T12:00:00.000Z`

  const sellerSettlement = buildSellerSettlementLines({
    settlementAmount: settlementLocalAmount,
    carryingAmount: sellerCarryingAmount,
    cashAccountId: sellerCash.id,
    arAccountId: sellerAr.id,
    gainAccountId: sellerFxGain.id,
    lossAccountId: sellerFxLoss.id,
  })
  const buyerSettlement = buildBuyerSettlementLines({
    settlementAmount: settlementLocalAmount,
    carryingAmount: buyerCarryingAmount,
    cashAccountId: buyerCash.id,
    apAccountId: buyerAp.id,
    gainAccountId: buyerFxGain.id,
    lossAccountId: buyerFxLoss.id,
  })

  const sellerReceiptEntry = await ensureJournalEntryWithLines(supabase, {
    companyId: sellerCompany.id,
    referenceType: "intercompany_fx_settlement_seed",
    referenceId: sellerReceiptReferenceId,
    entryDate: settlementDate,
    description: `Phase 2B.3 controlled FX settlement receipt ${buyerCompany.name}`,
    label: `${sellerCompany.name}:fx_settlement_receipt`,
    lines: sellerSettlement.lines,
  }, report)

  const buyerPaymentEntry = await ensureJournalEntryWithLines(supabase, {
    companyId: buyerCompany.id,
    referenceType: "intercompany_fx_settlement_seed",
    referenceId: buyerPaymentReferenceId,
    entryDate: settlementDate,
    description: `Phase 2B.3 controlled FX settlement payment ${sellerCompany.name}`,
    label: `${buyerCompany.name}:fx_settlement_payment`,
    lines: buyerSettlement.lines,
  }, report)

  const sellerReceipt = await ensureDocument(supabase, {
    intercompany_transaction_id: transaction.id,
    company_id: sellerCompany.id,
    side: "seller",
    document_stage: "receipt",
    document_id: sellerReceiptDocumentId,
    document_number: `ICFX-RCP-${String(settlementScenarioKey).slice(0, 8).toUpperCase()}`,
    revision_no: 1,
    document_amount: amount,
    transaction_currency: currency,
    locked_exchange_rate: settlementRate,
    locked_rate_timestamp: rateTimestamp,
    rate_source: "controlled_fx_settlement_seed",
    reference_role: "seller_receipt",
    metadata: {
      controlled_scenario: true,
      fx_settlement_scenario: true,
      scenario_key: scenarioKey,
      settlement_scenario_key: settlementScenarioKey,
      journal_reference_id: sellerReceiptReferenceId,
      journal_entry_id: sellerReceiptEntry.id,
      carrying_local_amount: sellerCarryingAmount,
      settlement_local_amount: settlementLocalAmount,
      realized_fx_amount: Math.abs(sellerSettlement.difference),
      realized_fx_direction: sellerSettlement.difference >= 0 ? "gain" : "loss",
    },
    link_status: "active",
  }, report, "seller_fx_settlement_receipt")

  const buyerPayment = await ensureDocument(supabase, {
    intercompany_transaction_id: transaction.id,
    company_id: buyerCompany.id,
    side: "buyer",
    document_stage: "payment",
    document_id: buyerPaymentDocumentId,
    document_number: `ICFX-PMT-${String(settlementScenarioKey).slice(0, 8).toUpperCase()}`,
    revision_no: 1,
    document_amount: amount,
    transaction_currency: currency,
    locked_exchange_rate: settlementRate,
    locked_rate_timestamp: rateTimestamp,
    rate_source: "controlled_fx_settlement_seed",
    reference_role: "buyer_payment",
    metadata: {
      controlled_scenario: true,
      fx_settlement_scenario: true,
      scenario_key: scenarioKey,
      settlement_scenario_key: settlementScenarioKey,
      journal_reference_id: buyerPaymentReferenceId,
      journal_entry_id: buyerPaymentEntry.id,
      carrying_local_amount: buyerCarryingAmount,
      settlement_local_amount: settlementLocalAmount,
      realized_fx_amount: Math.abs(buyerSettlement.difference),
      realized_fx_direction: buyerSettlement.difference >= 0 ? "gain" : "loss",
    },
    link_status: "active",
  }, report, "buyer_fx_settlement_payment")

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
      scenario: "phase2b3_fx_settlement",
      settlement_rate: settlementRate,
    },
    result_status: "matched",
    mismatch_reason: null,
    alert_generated: false,
  }, transaction.id, report)

  const finalizedTransaction = await closeAndAnnotateTransaction(supabase, transaction, {
    requires_pnl_cleanup: true,
    scenario: "phase2b3_fx_settlement_realization",
    settlement_rate: settlementRate,
    settlement_rate_timestamp: rateTimestamp,
    seller_realized_fx_amount: Math.abs(sellerSettlement.difference),
    seller_realized_fx_direction: sellerSettlement.difference >= 0 ? "gain" : "loss",
    buyer_realized_fx_amount: Math.abs(buyerSettlement.difference),
    buyer_realized_fx_direction: buyerSettlement.difference >= 0 ? "gain" : "loss",
    reserve_release_amount: reserveReleaseAmount,
    reserve_account_code: reserveAccountCode,
    seller_receipt_document_id: sellerReceipt.document_id,
    buyer_payment_document_id: buyerPayment.document_id,
    seller_receipt_journal_id: sellerReceiptEntry.id,
    buyer_payment_journal_id: buyerPaymentEntry.id,
    settlement_scenario_key: settlementScenarioKey,
  }, report)

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
      fxGainAccountCode: sellerFxGain.account_code,
      fxLossAccountCode: sellerFxLoss.account_code,
      carryingLocalAmount: sellerCarryingAmount,
      settlementLocalAmount,
      realizedFxAmount: Math.abs(sellerSettlement.difference),
      realizedFxDirection: sellerSettlement.difference >= 0 ? "gain" : "loss",
    },
    buyer: {
      companyId: buyerCompany.id,
      companyName: buyerCompany.name,
      legalEntityId: buyerEntityMapping.legalEntity.id,
      apAccountCode: buyerAp.account_code,
      cashAccountCode: buyerCash.account_code,
      fxGainAccountCode: buyerFxGain.account_code,
      fxLossAccountCode: buyerFxLoss.account_code,
      carryingLocalAmount: buyerCarryingAmount,
      settlementLocalAmount,
      realizedFxAmount: Math.abs(buyerSettlement.difference),
      realizedFxDirection: buyerSettlement.difference >= 0 ? "gain" : "loss",
    },
    fxSettlement: {
      currency,
      amount,
      sellerRate,
      buyerRate,
      settlementRate,
      reserveReleaseAmount,
      reserveAccountCode,
      groupRealizedFxNet: Number((sellerSettlement.difference + buyerSettlement.difference).toFixed(4)),
      rateTimestamp,
    },
    transaction: {
      id: finalizedTransaction.id,
      status: finalizedTransaction.status,
      effectiveDate,
      settlementDate,
      scenarioKey,
      settlementScenarioKey,
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

  exitWithReport("phase2b3-controlled-intercompany-fx-settlement-seed", report)
}

function firstDefined(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue
    return numeric(value)
  }
  return 0
}

run().catch((error) => {
  exitWithReport("phase2b3-controlled-intercompany-fx-settlement-seed", {
    phase: "phase2b3-controlled-intercompany-fx-settlement-seed",
    executedAt: nowIso(),
    ok: false,
    error: error.message,
  })
})
