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
  ensureTransaction,
  ensureDocument,
  ensureReconciliation,
} = require("./run-controlled-intercompany-seed")

function findFxAccount(accounts, mode) {
  const normalizedMode = String(mode || "").toLowerCase()
  return accounts.find((row) => {
    const code = String(row.account_code || "")
    const name = String(row.account_name || "").toLowerCase()
    if (normalizedMode === "gain") {
      return code === "4400" || (name.includes("fx") && name.includes("gain")) || name.includes("foreign exchange gains") || name.includes("ارباح فروق")
    }
    return code === "5310" || (name.includes("fx") && name.includes("loss")) || name.includes("foreign exchange losses") || name.includes("خسائر فروق")
  }) || null
}

async function run() {
  const report = {
    phase: "phase2b3-controlled-intercompany-fx-seed",
    executedAt: nowIso(),
    mode: hasLiveEnv() ? "live" : "static",
    ok: true,
    actions: [],
  }

  if (!hasLiveEnv()) {
    report.ok = false
    report.error = "Supabase live env is missing. Cannot seed controlled intercompany FX scenario."
    return exitWithReport("phase2b3-controlled-intercompany-fx-seed", report)
  }

  const supabase = createServiceClient()
  const effectiveDate = String(process.env.PHASE2B3_FX_SCENARIO_DATE || "2026-04-09")
  const currency = String(process.env.PHASE2B3_FX_SCENARIO_CURRENCY || "USD")
  const amount = Number(process.env.PHASE2B3_FX_SCENARIO_AMOUNT || 2500)
  const sellerRate = Number(process.env.PHASE2B3_FX_SELLER_RATE || 30)
  const buyerRate = Number(process.env.PHASE2B3_FX_BUYER_RATE || 32)
  if (!(amount > 0)) throw new Error("PHASE2B3_FX_SCENARIO_AMOUNT must be greater than zero")
  if (!(sellerRate > 0) || !(buyerRate > 0)) throw new Error("FX scenario rates must be greater than zero")

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
  await ensureAccountingPeriod(supabase, sellerCompany.id, effectiveDate, report, sellerCompany.name)
  await ensureAccountingPeriod(supabase, buyerCompany.id, effectiveDate, report, buyerCompany.name)

  const relationship = await ensureRelationship(
    supabase,
    sellerCompany,
    buyerCompany,
    sellerEntityMapping.legalEntity.id,
    buyerEntityMapping.legalEntity.id,
    effectiveDate,
    report
  )

  const sellerAccounts = await loadActiveAccounts(supabase, sellerCompany.id)
  const buyerAccounts = await loadActiveAccounts(supabase, buyerCompany.id)
  const sellerAr = requireAccount(
    sellerAccounts,
    (row) => row.sub_type === "accounts_receivable",
    `Seller AR account was not found for ${sellerCompany.name}`
  )
  const sellerRevenue = requireAccount(
    sellerAccounts,
    (row) => row.sub_type === "sales_revenue",
    `Seller revenue account was not found for ${sellerCompany.name}`
  )
  const buyerAp = requireAccount(
    buyerAccounts,
    (row) => row.sub_type === "accounts_payable",
    `Buyer AP account was not found for ${buyerCompany.name}`
  )
  const buyerExpense = requireAccount(
    buyerAccounts,
    (row) => ["cogs", "cost_of_goods_sold"].includes(String(row.sub_type || "")) || String(row.account_type || "").toLowerCase() === "expense",
    `Buyer expense/COGS account was not found for ${buyerCompany.name}`
  )

  const fxGainAccount = findFxAccount(sellerAccounts, "gain")
  const fxLossAccount = findFxAccount(sellerAccounts, "loss")
  const sellerLocalAmount = Number((amount * sellerRate).toFixed(4))
  const buyerLocalAmount = Number((amount * buyerRate).toFixed(4))
  const fxDifference = Number((buyerLocalAmount - sellerLocalAmount).toFixed(4))

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
  const baseReferenceId = stableUuid("phase2b3", "controlled_intercompany_fx", scenarioKey)
  const sellerReferenceId = stableUuid("phase2b3", "seller_fx_journal", scenarioKey)
  const buyerReferenceId = stableUuid("phase2b3", "buyer_fx_journal", scenarioKey)
  const sellerInvoiceDocumentId = stableUuid("phase2b3", "seller_fx_invoice_document", scenarioKey)
  const buyerBillDocumentId = stableUuid("phase2b3", "buyer_fx_bill_document", scenarioKey)
  const sellerRateTimestamp = `${effectiveDate}T10:00:00.000Z`
  const buyerRateTimestamp = `${effectiveDate}T14:00:00.000Z`

  await ensureJournalEntryWithLines(supabase, {
    companyId: sellerCompany.id,
    referenceType: "intercompany_fx_seed",
    referenceId: sellerReferenceId,
    entryDate: effectiveDate,
    description: `Phase 2B.3 FX non-identity seller invoice ${buyerCompany.name}`,
    label: `${sellerCompany.name}:fx_seller`,
    lines: [
      {
        account_id: sellerAr.id,
        debit_amount: sellerLocalAmount,
        credit_amount: 0,
        description: "Controlled FX intercompany AR",
      },
      {
        account_id: sellerRevenue.id,
        debit_amount: 0,
        credit_amount: sellerLocalAmount,
        description: "Controlled FX intercompany revenue",
      },
    ],
  }, report)

  await ensureJournalEntryWithLines(supabase, {
    companyId: buyerCompany.id,
    referenceType: "intercompany_fx_seed",
    referenceId: buyerReferenceId,
    entryDate: effectiveDate,
    description: `Phase 2B.3 FX non-identity buyer bill ${sellerCompany.name}`,
    label: `${buyerCompany.name}:fx_buyer`,
    lines: [
      {
        account_id: buyerExpense.id,
        debit_amount: buyerLocalAmount,
        credit_amount: 0,
        description: "Controlled FX intercompany expense/COGS",
      },
      {
        account_id: buyerAp.id,
        debit_amount: 0,
        credit_amount: buyerLocalAmount,
        description: "Controlled FX intercompany AP",
      },
    ],
  }, report)

  const transaction = await ensureTransaction(supabase, {
    transaction_number: `ICFX-${String(scenarioKey).slice(0, 10).toUpperCase()}`,
    intercompany_relationship_id: relationship.id,
    seller_company_id: sellerCompany.id,
    buyer_company_id: buyerCompany.id,
    seller_legal_entity_id: sellerEntityMapping.legalEntity.id,
    buyer_legal_entity_id: buyerEntityMapping.legalEntity.id,
    source_flow_type: "expense_rebill",
    transaction_date: effectiveDate,
    transaction_currency: currency,
    transaction_amount: amount,
    pricing_policy: "market_based",
    pricing_reference: {
      scenario: "phase2b3_fx_non_identity",
      seeded_by: "run-controlled-intercompany-fx-seed",
    },
    operational_context: {
      scenario_key: scenarioKey,
      controlled_scenario: true,
      fx_non_identity: true,
      reference_seed_id: baseReferenceId,
      elimination_targets: {
        seller_ar_account_code: sellerAr.account_code,
        seller_revenue_account_code: sellerRevenue.account_code,
        buyer_ap_account_code: buyerAp.account_code,
        buyer_expense_account_code: buyerExpense.account_code,
      },
      elimination_local_amounts: {
        seller_amount: sellerLocalAmount,
        buyer_amount: buyerLocalAmount,
      },
      fx_difference_handling: {
        mode: "pnl_plus_reserve",
        gain_account_code: fxGainAccount?.account_code || "4400",
        gain_account_name: fxGainAccount?.account_name || "FX Gains",
        loss_account_code: fxLossAccount?.account_code || "5310",
        loss_account_name: fxLossAccount?.account_name || "FX Losses",
        reserve_account_code: "3998",
        reserve_account_name: "FX Timing Reserve",
      },
    },
    seller_exchange_rate: sellerRate,
    seller_rate_source: "controlled_fx_seed_seller",
    seller_rate_timestamp: sellerRateTimestamp,
    buyer_exchange_rate: buyerRate,
    buyer_rate_source: "controlled_fx_seed_buyer",
    buyer_rate_timestamp: buyerRateTimestamp,
    requested_ship_date: effectiveDate,
    status: "reconciled",
    orchestration_status: "reconciled",
    idempotency_key: `phase2b3-fx-${scenarioKey}`,
    created_by: sellerCompany.user_id,
    approved_by: sellerCompany.user_id,
  }, report)

  const sellerInvoice = await ensureDocument(supabase, {
    intercompany_transaction_id: transaction.id,
    company_id: sellerCompany.id,
    side: "seller",
    document_stage: "invoice",
    document_id: sellerInvoiceDocumentId,
    document_number: `ICFX-INV-${String(scenarioKey).slice(0, 8).toUpperCase()}`,
    revision_no: 1,
    document_amount: amount,
    transaction_currency: currency,
    locked_exchange_rate: sellerRate,
    locked_rate_timestamp: sellerRateTimestamp,
    rate_source: "controlled_fx_seed_seller",
    reference_role: "seller_invoice",
    metadata: {
      controlled_scenario: true,
      fx_non_identity: true,
      scenario_key: scenarioKey,
      journal_reference_id: sellerReferenceId,
      local_amount: sellerLocalAmount,
    },
    link_status: "active",
  }, report, "seller_fx_invoice")

  const buyerBill = await ensureDocument(supabase, {
    intercompany_transaction_id: transaction.id,
    company_id: buyerCompany.id,
    side: "buyer",
    document_stage: "bill",
    document_id: buyerBillDocumentId,
    document_number: `ICFX-BILL-${String(scenarioKey).slice(0, 8).toUpperCase()}`,
    revision_no: 1,
    document_amount: amount,
    transaction_currency: currency,
    locked_exchange_rate: buyerRate,
    locked_rate_timestamp: buyerRateTimestamp,
    rate_source: "controlled_fx_seed_buyer",
    reference_role: "buyer_bill",
    metadata: {
      controlled_scenario: true,
      fx_non_identity: true,
      scenario_key: scenarioKey,
      journal_reference_id: buyerReferenceId,
      local_amount: buyerLocalAmount,
    },
    link_status: "active",
  }, report, "buyer_fx_bill")

  const reconciliation = await ensureReconciliation(supabase, {
    intercompany_transaction_id: transaction.id,
    seller_invoice_id: sellerInvoice.document_id,
    buyer_bill_id: buyerBill.document_id,
    seller_receipt_id: null,
    buyer_payment_id: null,
    reconciliation_scope: "billing",
    seller_open_amount: amount,
    buyer_open_amount: amount,
    amount_variance: 0,
    currency_variance: 0,
    date_variance_days: 0,
    tolerance_applied: {
      tolerance_amount: 0,
      tolerance_percent: 0,
      scenario: "phase2b3_fx_non_identity",
    },
    result_status: "matched",
    mismatch_reason: null,
    alert_generated: false,
  }, transaction.id, report)

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
      revenueAccountCode: sellerRevenue.account_code,
      exchangeRate: sellerRate,
      rateTimestamp: sellerRateTimestamp,
      localAmount: sellerLocalAmount,
    },
    buyer: {
      companyId: buyerCompany.id,
      companyName: buyerCompany.name,
      legalEntityId: buyerEntityMapping.legalEntity.id,
      apAccountCode: buyerAp.account_code,
      expenseAccountCode: buyerExpense.account_code,
      exchangeRate: buyerRate,
      rateTimestamp: buyerRateTimestamp,
      localAmount: buyerLocalAmount,
    },
    fxHandling: {
      differenceAmount: Math.abs(fxDifference),
      direction: fxDifference > 0 ? "loss" : "gain",
      gainAccountCode: fxGainAccount?.account_code || "4400",
      lossAccountCode: fxLossAccount?.account_code || "5310",
      reserveAccountCode: "3998",
    },
    transaction: {
      id: transaction.id,
      amount,
      currency,
      effectiveDate,
      scenarioKey,
    },
    reconciliation: {
      id: reconciliation.id,
      resultStatus: reconciliation.result_status,
      scope: reconciliation.reconciliation_scope,
      sellerOpenAmount: numeric(reconciliation.seller_open_amount),
      buyerOpenAmount: numeric(reconciliation.buyer_open_amount),
    },
  }

  exitWithReport("phase2b3-controlled-intercompany-fx-seed", report)
}

run().catch((error) => {
  exitWithReport("phase2b3-controlled-intercompany-fx-seed", {
    phase: "phase2b3-controlled-intercompany-fx-seed",
    executedAt: nowIso(),
    ok: false,
    error: error.message,
  })
})
