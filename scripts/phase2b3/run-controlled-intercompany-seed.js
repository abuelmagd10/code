const {
  createServiceClient,
  exitWithReport,
  hasLiveEnv,
  stableHash,
  stableUuid,
  numeric,
} = require("./_shared")

function nowIso() {
  return new Date().toISOString()
}

function monthWindow(dateText) {
  const date = new Date(`${dateText}T00:00:00.000Z`)
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const start = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10)
  const end = new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10)
  return {
    start,
    end,
    periodName: `${year}-${String(month + 1).padStart(2, "0")}`,
  }
}

async function resolveCompany(supabase, explicitId, fallbackName) {
  if (explicitId) {
    const { data, error } = await supabase
      .from("companies")
      .select("id, name, user_id")
      .eq("id", explicitId)
      .maybeSingle()
    if (error) throw error
    if (!data) throw new Error(`Company was not found: ${explicitId}`)
    return data
  }

  const { data, error } = await supabase
    .from("companies")
    .select("id, name, user_id")
    .eq("name", fallbackName)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error(`Company "${fallbackName}" was not found`)
  return data
}

async function ensureLegalEntityMapping(supabase, company, options, report) {
  const { entityCode, countryCode, functionalCurrency, legalName } = options
  const { data: activeMaps, error: mapsError } = await supabase
    .from("company_legal_entity_map")
    .select("*")
    .eq("company_id", company.id)
    .eq("status", "active")
    .is("effective_to", null)
  if (mapsError) throw mapsError

  if ((activeMaps || []).length > 1) {
    throw new Error(`Company ${company.name} has multiple active legal entity mappings`)
  }

  let legalEntity = null
  if ((activeMaps || []).length === 1) {
    const existingMap = activeMaps[0]
    const { data, error } = await supabase
      .from("legal_entities")
      .select("*")
      .eq("id", existingMap.legal_entity_id)
      .maybeSingle()
    if (error) throw error
    if (!data) throw new Error(`Mapped legal entity was not found for company ${company.name}`)
    legalEntity = data
    report.actions.push({
      id: `${company.name}:legal_entity_map`,
      status: "reused",
      mappingId: existingMap.id,
      legalEntityId: legalEntity.id,
    })
    return { legalEntity, mapping: existingMap }
  }

  const { data: existingEntity, error: entityError } = await supabase
    .from("legal_entities")
    .select("*")
    .eq("entity_code", entityCode)
    .maybeSingle()
  if (entityError) throw entityError

  legalEntity = existingEntity
  if (!legalEntity) {
    const insertedEntity = await supabase
      .from("legal_entities")
      .insert({
        entity_code: entityCode,
        legal_name: legalName || company.name,
        legal_name_local: legalName || company.name,
        country_code: countryCode,
        functional_currency: functionalCurrency,
        status: "active",
      })
      .select("*")
      .single()
    if (insertedEntity.error) throw insertedEntity.error
    legalEntity = insertedEntity.data
    report.actions.push({
      id: `${company.name}:legal_entity`,
      status: "created",
      legalEntityId: legalEntity.id,
      entityCode,
    })
  } else {
    report.actions.push({
      id: `${company.name}:legal_entity`,
      status: "reused",
      legalEntityId: legalEntity.id,
      entityCode,
    })
  }

  const insertedMap = await supabase
    .from("company_legal_entity_map")
    .insert({
      company_id: company.id,
      legal_entity_id: legalEntity.id,
      is_primary: true,
      status: "active",
    })
    .select("*")
    .single()
  if (insertedMap.error) throw insertedMap.error
  report.actions.push({
    id: `${company.name}:company_legal_entity_map`,
    status: "created",
    mappingId: insertedMap.data.id,
    legalEntityId: legalEntity.id,
  })
  return { legalEntity, mapping: insertedMap.data }
}

async function ensureGroupMember(supabase, groupId, legalEntityId, label, report) {
  const { data, error } = await supabase
    .from("consolidation_group_members")
    .select("*")
    .eq("consolidation_group_id", groupId)
    .eq("legal_entity_id", legalEntityId)
    .eq("scope_status", "included")
    .is("effective_to", null)
  if (error) throw error
  if ((data || []).length > 0) {
    report.actions.push({ id: `${label}:group_member`, status: "reused", memberId: data[0].id })
    return data[0]
  }

  const inserted = await supabase
    .from("consolidation_group_members")
    .insert({
      consolidation_group_id: groupId,
      legal_entity_id: legalEntityId,
      scope_status: "included",
    })
    .select("*")
    .single()
  if (inserted.error) throw inserted.error
  report.actions.push({ id: `${label}:group_member`, status: "created", memberId: inserted.data.id })
  return inserted.data
}

async function ensureAccountingPeriod(supabase, companyId, effectiveDate, report, label) {
  const { data: existing, error } = await supabase
    .from("accounting_periods")
    .select("id, period_name, period_start, period_end, status, is_locked")
    .eq("company_id", companyId)
    .lte("period_start", effectiveDate)
    .gte("period_end", effectiveDate)
    .order("period_start", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (existing) {
    report.actions.push({ id: `${label}:accounting_period`, status: "reused", periodId: existing.id })
    return existing
  }

  const window = monthWindow(effectiveDate)
  const inserted = await supabase
    .from("accounting_periods")
    .insert({
      company_id: companyId,
      period_name: window.periodName,
      period_start: window.start,
      period_end: window.end,
      status: "open",
      is_locked: false,
      notes: "Phase 2B.3 controlled intercompany scenario seed",
    })
    .select("id, period_name, period_start, period_end, status, is_locked")
    .single()
  if (inserted.error) throw inserted.error
  report.actions.push({ id: `${label}:accounting_period`, status: "created", periodId: inserted.data.id })
  return inserted.data
}

async function loadActiveAccounts(supabase, companyId) {
  const { data, error } = await supabase
    .from("chart_of_accounts")
    .select("id, account_code, account_name, account_type, sub_type")
    .eq("company_id", companyId)
    .eq("is_active", true)
  if (error) throw error
  return data || []
}

function requireAccount(accounts, predicate, message) {
  const account = accounts.find(predicate)
  if (!account) throw new Error(message)
  return account
}

async function ensureRelationship(supabase, seller, buyer, sellerEntityId, buyerEntityId, effectiveDate, report) {
  const { data, error } = await supabase
    .from("intercompany_relationships")
    .select("*")
    .eq("seller_company_id", seller.id)
    .eq("buyer_company_id", buyer.id)
    .in("relationship_status", ["draft", "active"])
    .lte("effective_from", effectiveDate)
    .or(`effective_to.is.null,effective_to.gte.${effectiveDate}`)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (data) {
    report.actions.push({ id: "intercompany_relationship", status: "reused", relationshipId: data.id })
    return data
  }

  const inserted = await supabase
    .from("intercompany_relationships")
    .insert({
      seller_company_id: seller.id,
      buyer_company_id: buyer.id,
      seller_legal_entity_id: sellerEntityId,
      buyer_legal_entity_id: buyerEntityId,
      relationship_status: "active",
      pricing_policy: "market_based",
      settlement_policy: "gross_settlement",
      tolerance_amount: 0,
      tolerance_percent: 0,
      date_tolerance_days: 0,
      effective_from: effectiveDate,
    })
    .select("*")
    .single()
  if (inserted.error) throw inserted.error
  report.actions.push({ id: "intercompany_relationship", status: "created", relationshipId: inserted.data.id })
  return inserted.data
}

async function ensureJournalEntryWithLines(supabase, options, report) {
  const {
    companyId,
    referenceType,
    referenceId,
    entryDate,
    description,
    lines,
    label,
  } = options

  const { data: existing, error } = await supabase
    .from("journal_entries")
    .select("id, reference_type, reference_id, entry_date, description, status")
    .eq("company_id", companyId)
    .eq("reference_type", referenceType)
    .eq("reference_id", referenceId)
    .maybeSingle()
  if (error) throw error

  let entry = existing
  if (!entry) {
    const { data: rpcResult, error: rpcError } = await supabase.rpc("create_journal_entry_atomic", {
      p_company_id: companyId,
      p_reference_type: referenceType,
      p_reference_id: referenceId,
      p_entry_date: entryDate,
      p_description: description,
      p_branch_id: null,
      p_cost_center_id: null,
      p_warehouse_id: null,
      p_lines: lines.map((line) => ({
        account_id: line.account_id,
        debit_amount: numeric(line.debit_amount),
        credit_amount: numeric(line.credit_amount),
        description: line.description || null,
        branch_id: null,
        cost_center_id: null,
      })),
    })
    if (rpcError) throw rpcError

    const result = rpcResult || {}
    if (!result.success && !result.entry_id && !result.existing_id) {
      throw new Error(result.error || `Atomic journal RPC failed for ${label}`)
    }

    const journalEntryId = result.entry_id || result.existing_id
    const { data: inserted, error: insertedError } = await supabase
      .from("journal_entries")
      .select("id, reference_type, reference_id, entry_date, description, status")
      .eq("id", journalEntryId)
      .single()
    if (insertedError) throw insertedError
    entry = inserted
    report.actions.push({ id: `${label}:journal_entry`, status: "created", journalEntryId: entry.id })
  } else {
    report.actions.push({ id: `${label}:journal_entry`, status: "reused", journalEntryId: entry.id })
  }

  const { data: existingLines, error: linesError } = await supabase
    .from("journal_entry_lines")
    .select("id, account_id, debit_amount, credit_amount, description")
    .eq("journal_entry_id", entry.id)
  if (linesError) throw linesError

  if ((existingLines || []).length === 0) {
    const insertedLines = await supabase
      .from("journal_entry_lines")
      .insert(lines.map((line) => ({
        journal_entry_id: entry.id,
        account_id: line.account_id,
        debit_amount: numeric(line.debit_amount),
        credit_amount: numeric(line.credit_amount),
        description: line.description,
      })))
      .select("id")
    if (insertedLines.error) throw insertedLines.error
    report.actions.push({ id: `${label}:journal_lines`, status: "created", lineCount: lines.length })
  } else {
    report.actions.push({ id: `${label}:journal_lines`, status: "reused", lineCount: existingLines.length })
  }

  return entry
}

async function ensureTransaction(supabase, payload, report) {
  const { data: existing, error } = await supabase
    .from("intercompany_transactions")
    .select("*")
    .eq("seller_company_id", payload.seller_company_id)
    .eq("buyer_company_id", payload.buyer_company_id)
    .eq("idempotency_key", payload.idempotency_key)
    .maybeSingle()
  if (error) throw error
  if (existing) {
    report.actions.push({ id: "intercompany_transaction", status: "reused", transactionId: existing.id })
    return existing
  }

  const inserted = await supabase
    .from("intercompany_transactions")
    .insert(payload)
    .select("*")
    .single()
  if (inserted.error) throw inserted.error
  report.actions.push({ id: "intercompany_transaction", status: "created", transactionId: inserted.data.id })
  return inserted.data
}

async function ensureDocument(supabase, payload, report, label) {
  const { data: existing, error } = await supabase
    .from("intercompany_documents")
    .select("*")
    .eq("intercompany_transaction_id", payload.intercompany_transaction_id)
    .eq("company_id", payload.company_id)
    .eq("side", payload.side)
    .eq("document_stage", payload.document_stage)
    .eq("document_id", payload.document_id)
    .eq("revision_no", payload.revision_no)
    .maybeSingle()
  if (error) throw error
  if (existing) {
    report.actions.push({ id: `${label}:document`, status: "reused", documentId: existing.id })
    return existing
  }

  const inserted = await supabase
    .from("intercompany_documents")
    .insert(payload)
    .select("*")
    .single()
  if (inserted.error) throw inserted.error
  report.actions.push({ id: `${label}:document`, status: "created", documentId: inserted.data.id })
  return inserted.data
}

async function ensureReconciliation(supabase, payload, transactionId, report) {
  const { data: existing, error } = await supabase
    .from("intercompany_reconciliation_results")
    .select("*")
    .eq("intercompany_transaction_id", transactionId)
    .eq("reconciliation_scope", "billing")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (existing) {
    report.actions.push({ id: "intercompany_reconciliation", status: "reused", reconciliationId: existing.id })
    return existing
  }

  const inserted = await supabase
    .from("intercompany_reconciliation_results")
    .insert(payload)
    .select("*")
    .single()
  if (inserted.error) throw inserted.error
  report.actions.push({ id: "intercompany_reconciliation", status: "created", reconciliationId: inserted.data.id })
  return inserted.data
}

async function run() {
  const report = {
    phase: "phase2b3-controlled-intercompany-seed",
    executedAt: nowIso(),
    mode: hasLiveEnv() ? "live" : "static",
    ok: true,
    actions: [],
  }

  if (!hasLiveEnv()) {
    report.ok = false
    report.error = "Supabase live env is missing. Cannot seed controlled intercompany scenario."
    return exitWithReport("phase2b3-controlled-intercompany-seed", report)
  }

  const supabase = createServiceClient()
  const effectiveDate = String(process.env.PHASE2B3_SCENARIO_DATE || "2026-04-07")
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

  const scenarioKey = stableHash({
    phase: "phase2b3",
    kind: "controlled_intercompany",
    sellerCompanyId: sellerCompany.id,
    buyerCompanyId: buyerCompany.id,
    effectiveDate,
    amount,
    currency,
  })
  const baseReferenceId = stableUuid("phase2b3", "controlled_intercompany", scenarioKey)
  const sellerReferenceId = stableUuid("phase2b3", "seller_journal", scenarioKey)
  const buyerReferenceId = stableUuid("phase2b3", "buyer_journal", scenarioKey)
  const sellerInvoiceDocumentId = stableUuid("phase2b3", "seller_invoice_document", scenarioKey)
  const buyerBillDocumentId = stableUuid("phase2b3", "buyer_bill_document", scenarioKey)
  const rateTimestamp = `${effectiveDate}T12:00:00.000Z`

  await ensureJournalEntryWithLines(supabase, {
    companyId: sellerCompany.id,
    referenceType: "intercompany_seed",
    referenceId: sellerReferenceId,
    entryDate: effectiveDate,
    description: `Phase 2B.3 controlled intercompany seller invoice ${buyerCompany.name}`,
    label: sellerCompany.name,
    lines: [
      {
        account_id: sellerAr.id,
        debit_amount: amount,
        credit_amount: 0,
        description: "Controlled intercompany AR",
      },
      {
        account_id: sellerRevenue.id,
        debit_amount: 0,
        credit_amount: amount,
        description: "Controlled intercompany revenue",
      },
    ],
  }, report)

  await ensureJournalEntryWithLines(supabase, {
    companyId: buyerCompany.id,
    referenceType: "intercompany_seed",
    referenceId: buyerReferenceId,
    entryDate: effectiveDate,
    description: `Phase 2B.3 controlled intercompany buyer bill ${sellerCompany.name}`,
    label: buyerCompany.name,
    lines: [
      {
        account_id: buyerExpense.id,
        debit_amount: amount,
        credit_amount: 0,
        description: "Controlled intercompany expense/COGS",
      },
      {
        account_id: buyerAp.id,
        debit_amount: 0,
        credit_amount: amount,
        description: "Controlled intercompany AP",
      },
    ],
  }, report)

  const transaction = await ensureTransaction(supabase, {
    transaction_number: `IC-${String(scenarioKey).slice(0, 10).toUpperCase()}`,
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
      scenario: "phase2b3_controlled_intercompany",
      seeded_by: "run-controlled-intercompany-seed",
    },
    operational_context: {
      scenario_key: scenarioKey,
      controlled_scenario: true,
      reference_seed_id: baseReferenceId,
      elimination_targets: {
        seller_ar_account_code: sellerAr.account_code,
        seller_revenue_account_code: sellerRevenue.account_code,
        buyer_ap_account_code: buyerAp.account_code,
        buyer_expense_account_code: buyerExpense.account_code,
      },
    },
    seller_exchange_rate: 1,
    seller_rate_source: "controlled_seed_identity",
    seller_rate_timestamp: rateTimestamp,
    buyer_exchange_rate: 1,
    buyer_rate_source: "controlled_seed_identity",
    buyer_rate_timestamp: rateTimestamp,
    requested_ship_date: effectiveDate,
    status: "reconciled",
    orchestration_status: "reconciled",
    idempotency_key: `phase2b3-controlled-${scenarioKey}`,
    created_by: sellerCompany.user_id,
    approved_by: sellerCompany.user_id,
  }, report)

  const sellerInvoice = await ensureDocument(supabase, {
    intercompany_transaction_id: transaction.id,
    company_id: sellerCompany.id,
    side: "seller",
    document_stage: "invoice",
    document_id: sellerInvoiceDocumentId,
    document_number: `IC-INV-${String(scenarioKey).slice(0, 8).toUpperCase()}`,
    revision_no: 1,
    document_amount: amount,
    transaction_currency: currency,
    locked_exchange_rate: 1,
    locked_rate_timestamp: rateTimestamp,
    rate_source: "controlled_seed_identity",
    reference_role: "seller_invoice",
    metadata: {
      controlled_scenario: true,
      scenario_key: scenarioKey,
      journal_reference_id: sellerReferenceId,
    },
    link_status: "active",
  }, report, "seller_invoice")

  const buyerBill = await ensureDocument(supabase, {
    intercompany_transaction_id: transaction.id,
    company_id: buyerCompany.id,
    side: "buyer",
    document_stage: "bill",
    document_id: buyerBillDocumentId,
    document_number: `IC-BILL-${String(scenarioKey).slice(0, 8).toUpperCase()}`,
    revision_no: 1,
    document_amount: amount,
    transaction_currency: currency,
    locked_exchange_rate: 1,
    locked_rate_timestamp: rateTimestamp,
    rate_source: "controlled_seed_identity",
    reference_role: "buyer_bill",
    metadata: {
      controlled_scenario: true,
      scenario_key: scenarioKey,
      journal_reference_id: buyerReferenceId,
    },
    link_status: "active",
  }, report, "buyer_bill")

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
      scenario: "phase2b3_controlled_intercompany",
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
    },
    buyer: {
      companyId: buyerCompany.id,
      companyName: buyerCompany.name,
      legalEntityId: buyerEntityMapping.legalEntity.id,
      apAccountCode: buyerAp.account_code,
      expenseAccountCode: buyerExpense.account_code,
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
    },
  }

  exitWithReport("phase2b3-controlled-intercompany-seed", report)
}

module.exports = {
  nowIso,
  monthWindow,
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
}

if (require.main === module) {
  run().catch((error) => {
    exitWithReport("phase2b3-controlled-intercompany-seed", {
      phase: "phase2b3-controlled-intercompany-seed",
      executedAt: nowIso(),
      ok: false,
      error: error.message,
    })
  })
}
