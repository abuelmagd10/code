export const AI_DOMAINS = [
  "sales",
  "inventory",
  "accounting",
  "receivables",
  "returns",
  "pricing",
  "governance",
  "support",
  "dashboard",
] as const

export type AIDomain = (typeof AI_DOMAINS)[number]

export const AI_CAPABILITIES = [
  "guided_assistance",
  "copilot_chat",
  "notification_enrichment",
  "approval_recommendation",
  "forecasting",
  "anomaly_detection",
  "pricing_recommendation",
  "compliance_scan",
  "draft_automation",
] as const

export type AICapability = (typeof AI_CAPABILITIES)[number]

export const AI_CONVERSATION_MODES = [
  "guide",
  "copilot",
  "approvals",
  "analytics",
] as const

export type AIConversationMode = (typeof AI_CONVERSATION_MODES)[number]

export const AI_SEVERITIES = ["info", "warning", "critical"] as const

export type AISeverity = (typeof AI_SEVERITIES)[number]

export const AI_PROMPT_CATEGORIES = [
  "workflow",
  "governance",
  "analytics",
  "prediction",
  "compliance",
] as const

export type AIPromptCategory = (typeof AI_PROMPT_CATEGORIES)[number]

export const AI_DECISIONS = ["approve", "reject", "escalate", "review"] as const

export type AIDecision = (typeof AI_DECISIONS)[number]

export interface AIContextScope {
  companyId: string
  userId: string
  role?: string | null
  branchId?: string | null
  costCenterId?: string | null
  warehouseId?: string | null
  pageKey?: string | null
}

export interface AIInsight {
  domain: AIDomain
  severity: AISeverity
  title: string
  summary: string
  confidenceScore?: number | null
  entityType?: string | null
  entityId?: string | null
  recommendedAction?: string | null
  evidence?: Record<string, unknown> | null
}

export interface AIStatChip {
  label: string
  value: string
  severity?: AISeverity | null
}

export interface AIQuickPrompt {
  label: string
  prompt: string
  category: AIPromptCategory
}

export interface AINextAction {
  title: string
  summary: string
  prompt: string
  severity: AISeverity
  confidenceScore?: number | null
}

export interface AIPredictedAction {
  title: string
  summary: string
  prompt?: string | null
  confidenceScore?: number | null
}

export interface AICopilotInteractivePayload {
  domain: AIDomain
  summary: string
  governanceSummary: string
  metrics: AIStatChip[]
  insights: AIInsight[]
  nextActions: AINextAction[]
  predictedActions: AIPredictedAction[]
  quickPrompts: AIQuickPrompt[]
}

export interface AIRecommendation {
  workflowType: string
  entityType: string
  entityId: string
  stage: string
  decision: AIDecision
  confidenceScore: number
  riskScore: number
  explanation: string
  evidence?: Record<string, unknown> | null
  policyHits?: string[]
}

export interface AIForecast {
  domain: Extract<AIDomain, "sales" | "inventory" | "pricing" | "receivables">
  forecastKey: string
  horizonDays: number
  generatedAt: string
  prediction: Record<string, unknown>
  qualityScore?: number | null
}

export interface AIToolCallAudit {
  toolName: string
  entityType?: string | null
  entityId?: string | null
  input: Record<string, unknown>
  outputHash?: string | null
}
