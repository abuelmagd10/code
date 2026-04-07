function readFlag(name: string, defaultValue = false): boolean {
  const value = process.env[name]
  if (value == null) return defaultValue
  return value !== "false"
}

export const enterpriseFinanceFlags = {
  invoicePostV2: readFlag("ERP_PHASE1_V2_INVOICE_POST", false),
  warehouseApprovalV2: readFlag("ERP_PHASE1_V2_WAREHOUSE_APPROVAL", false),
  paymentV2: readFlag("ERP_PHASE1_V2_PAYMENT", false),
  returnsV2: readFlag("ERP_PHASE1_V2_RETURNS", false),
  observabilityEvents: readFlag("ERP_PHASE1_FINANCIAL_EVENTS", false),
  allowCostFallback: readFlag("ERP_PHASE1_ALLOW_COST_FALLBACK", true),
  intercompanyEnabled: readFlag("ERP_PHASE2A_INTERCOMPANY_ENABLED", false),
  intercompanyConsolidationEnabled: readFlag("ERP_PHASE2A_CONSOLIDATION_ENABLED", false),
  intercompanyDevAutoMirror: readFlag("ERP_PHASE2A_INTERCOMPANY_DEV_AUTO_MIRROR", false),
  intercompanyEvents: readFlag("ERP_PHASE2A_INTERCOMPANY_EVENTS", false),
  consolidationEngineEnabled: readFlag("ERP_PHASE2B_CONSOLIDATION_ENGINE_ENABLED", false),
  consolidationPostingEnabled: readFlag("ERP_PHASE2B_CONSOLIDATION_POSTING_ENABLED", false),
  groupStatementsEnabled: readFlag("ERP_PHASE2B_GROUP_STATEMENTS_ENABLED", false),
  consolidationEvents: readFlag("ERP_PHASE2B_CONSOLIDATION_EVENTS", false),
}

export function getFinancialFeatureFlags() {
  return { ...enterpriseFinanceFlags }
}
