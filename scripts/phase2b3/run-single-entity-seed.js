const {
  createServiceClient,
  exitWithReport,
  hasLiveEnv,
  stableHash,
  resolveCompanyContext,
  resolveConsolidationGroup,
} = require("./_shared")

function nowIso() {
  return new Date().toISOString()
}

async function resolveVitaSlimsCompany(supabase) {
  const explicitCompanyId = process.env.PHASE2B3_HOST_COMPANY_ID || process.env.PHASE1B_COMPANY_ID
  if (explicitCompanyId) {
    const { data, error } = await supabase
      .from("companies")
      .select("id, name, user_id")
      .eq("id", explicitCompanyId)
      .maybeSingle()
    if (error) throw error
    if (!data) throw new Error(`Configured company was not found: ${explicitCompanyId}`)
    return data
  }

  const targetName = process.env.PHASE2B3_COMPANY_NAME || "VitaSlims"
  const { data, error } = await supabase
    .from("companies")
    .select("id, name, user_id")
    .eq("name", targetName)
    .maybeSingle()
  if (error) throw error
  if (!data) {
    throw new Error(`Company "${targetName}" was not found. Set PHASE2B3_HOST_COMPANY_ID if needed.`)
  }
  return data
}

async function run() {
  const report = {
    phase: "phase2b3-single-entity-seed",
    executedAt: nowIso(),
    mode: hasLiveEnv() ? "live" : "static",
    ok: true,
    actions: [],
  }

  if (!hasLiveEnv()) {
    report.ok = false
    report.actions.push({
      id: "env",
      status: "failed",
      message: "Supabase live env is missing. Cannot seed consolidation master data.",
    })
    return exitWithReport("phase2b3-single-entity-seed", report)
  }

  const supabase = createServiceClient()
  const company = await resolveVitaSlimsCompany(supabase)
  const functionalCurrency = String(process.env.PHASE2B3_FUNCTIONAL_CURRENCY || "EGP")
  const countryCode = String(process.env.PHASE2B3_COUNTRY_CODE || "EG")
  const entityCode = String(process.env.PHASE2B3_ENTITY_CODE || "VITASLIMS_LE")
  const groupCode = String(process.env.PHASE2B3_GROUP_CODE || "VITASLIMS_GROUP")
  const groupName = String(process.env.PHASE2B3_GROUP_NAME || "VitaSlims Group")

  const { data: existingEntity, error: existingEntityError } = await supabase
    .from("legal_entities")
    .select("*")
    .eq("entity_code", entityCode)
    .maybeSingle()
  if (existingEntityError) throw existingEntityError

  let legalEntity = existingEntity
  if (!legalEntity) {
    const inserted = await supabase
      .from("legal_entities")
      .insert({
        entity_code: entityCode,
        legal_name: company.name,
        legal_name_local: company.name,
        country_code: countryCode,
        functional_currency: functionalCurrency,
        status: "active",
      })
      .select("*")
      .single()
    if (inserted.error) throw inserted.error
    legalEntity = inserted.data
    report.actions.push({ id: "legal_entity", status: "created", entityId: legalEntity.id, entityCode })
  } else {
    report.actions.push({ id: "legal_entity", status: "reused", entityId: legalEntity.id, entityCode })
  }

  const { data: existingMapRows, error: mapError } = await supabase
    .from("company_legal_entity_map")
    .select("*")
    .eq("company_id", company.id)
    .eq("status", "active")
    .is("effective_to", null)
  if (mapError) throw mapError

  const conflictingMap = (existingMapRows || []).find((row) => row.legal_entity_id !== legalEntity.id)
  if (conflictingMap) {
    throw new Error(`Company ${company.name} already has an active mapping to another legal entity: ${conflictingMap.legal_entity_id}`)
  }

  if ((existingMapRows || []).length === 0) {
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
    report.actions.push({ id: "company_legal_entity_map", status: "created", mappingId: insertedMap.data.id })
  } else {
    report.actions.push({ id: "company_legal_entity_map", status: "reused", mappingId: existingMapRows[0].id })
  }

  const { data: existingGroup, error: groupError } = await supabase
    .from("consolidation_groups")
    .select("*")
    .eq("group_code", groupCode)
    .maybeSingle()
  if (groupError) throw groupError

  let consolidationGroup = existingGroup
  if (!consolidationGroup) {
    const insertedGroup = await supabase
      .from("consolidation_groups")
      .insert({
        group_code: groupCode,
        group_name: groupName,
        presentation_currency: functionalCurrency,
        reporting_standard: "IFRS",
        status: "active",
      })
      .select("*")
      .single()
    if (insertedGroup.error) throw insertedGroup.error
    consolidationGroup = insertedGroup.data
    report.actions.push({ id: "consolidation_group", status: "created", groupId: consolidationGroup.id, groupCode })
  } else {
    report.actions.push({ id: "consolidation_group", status: "reused", groupId: consolidationGroup.id, groupCode })
  }

  const { data: existingMembers, error: membersError } = await supabase
    .from("consolidation_group_members")
    .select("*")
    .eq("consolidation_group_id", consolidationGroup.id)
    .eq("legal_entity_id", legalEntity.id)
    .eq("scope_status", "included")
  if (membersError) throw membersError

  if ((existingMembers || []).length === 0) {
    const insertedMember = await supabase
      .from("consolidation_group_members")
      .insert({
        consolidation_group_id: consolidationGroup.id,
        legal_entity_id: legalEntity.id,
        scope_status: "included",
      })
      .select("*")
      .single()
    if (insertedMember.error) throw insertedMember.error
    report.actions.push({ id: "consolidation_group_member", status: "created", memberId: insertedMember.data.id })
  } else {
    report.actions.push({ id: "consolidation_group_member", status: "reused", memberId: existingMembers[0].id })
  }

  report.seed = {
    company: { id: company.id, name: company.name },
    legalEntity: { id: legalEntity.id, code: legalEntity.entity_code },
    consolidationGroup: { id: consolidationGroup.id, code: consolidationGroup.group_code },
    deterministicKey: stableHash([company.id, legalEntity.id, consolidationGroup.id]),
  }

  exitWithReport("phase2b3-single-entity-seed", report)
}

run().catch((error) => {
  exitWithReport("phase2b3-single-entity-seed", {
    phase: "phase2b3-single-entity-seed",
    executedAt: nowIso(),
    ok: false,
    error: error.message,
  })
})
