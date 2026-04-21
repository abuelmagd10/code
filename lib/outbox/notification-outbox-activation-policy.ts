import type { NotificationDispatcherMode } from "@/lib/outbox/notification-outbox-activation-gate.service"

export const GOVERNANCE_REPLAY_CANARY_EVENT_TYPES = [
  "governance.replay_commit_intent_issued",
  "governance.replay_execution_activated",
] as const

export const SUPPORTED_NOTIFICATION_OUTBOX_CANARY_EVENT_TYPES = [
  ...GOVERNANCE_REPLAY_CANARY_EVENT_TYPES,
  "procurement.bill_receipt_posted",
] as const

function matchesScopedSet(set: Set<string>, value: string) {
  return set.has("*") || set.has(String(value || "").trim())
}

function parseBoolean(value: string | undefined | null, fallback = false) {
  const normalized = String(value || "").trim().toLowerCase()
  if (!normalized) return fallback
  if (["1", "true", "yes", "on"].includes(normalized)) return true
  if (["0", "false", "no", "off"].includes(normalized)) return false
  return fallback
}

function parseInteger(value: string | undefined | null, fallback: number, min: number, max: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(Math.trunc(parsed), min), max)
}

function normalizeBaselineTimestamp(value: string | undefined | null) {
  const normalized = String(value || "").trim()
  if (!normalized) return null

  const timestamp = Date.parse(normalized)
  if (!Number.isFinite(timestamp)) return null

  return new Date(timestamp).toISOString()
}

function toEventTypeEnvSuffix(eventType: string) {
  return String(eventType || "")
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase()
}

function parseCsvSet(value: string | undefined | null) {
  return new Set(
    String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  )
}

function parseEventTypeSet(
  value: string | undefined | null,
  fallback: readonly string[]
) {
  const parsed = parseCsvSet(value)
  if (parsed.size > 0) return parsed
  return new Set(fallback)
}

export function resolveNotificationOutboxCanaryCompanyIds() {
  return parseCsvSet(process.env.NOTIFICATION_OUTBOX_CANARY_COMPANY_IDS)
}

export function resolveNotificationOutboxCanaryEventTypes() {
  return parseEventTypeSet(
    process.env.NOTIFICATION_OUTBOX_CANARY_EVENT_TYPES,
    GOVERNANCE_REPLAY_CANARY_EVENT_TYPES
  )
}

export function resolveNotificationOutboxAuthoritativeCompanyIds() {
  return parseCsvSet(process.env.NOTIFICATION_OUTBOX_AUTHORITATIVE_COMPANY_IDS)
}

export function resolveNotificationOutboxAuthoritativeEventTypes() {
  return parseCsvSet(process.env.NOTIFICATION_OUTBOX_AUTHORITATIVE_EVENT_TYPES)
}

export function resolveNotificationOutboxLegacyHotStandbyCompanyIds() {
  return parseCsvSet(process.env.NOTIFICATION_OUTBOX_LEGACY_HOT_STANDBY_COMPANY_IDS)
}

export function resolveNotificationOutboxLegacyHotStandbyEventTypes() {
  return parseCsvSet(process.env.NOTIFICATION_OUTBOX_LEGACY_HOT_STANDBY_EVENT_TYPES)
}

export function resolveNotificationOutboxDeadLetterPolicy() {
  return {
    enabled: parseBoolean(process.env.NOTIFICATION_OUTBOX_DLQ_AUTOMATION_ENABLED, false),
    maxAttempts: parseInteger(process.env.NOTIFICATION_OUTBOX_DLQ_MAX_ATTEMPTS, 3, 1, 20),
    retryBackoffSeconds: parseInteger(
      process.env.NOTIFICATION_OUTBOX_DLQ_RETRY_BACKOFF_SECONDS,
      300,
      0,
      86400
    ),
  }
}

export function isNotificationOutboxLegacyHotStandbyConfigured(input: {
  companyId: string
  eventType: string
}) {
  const standbyCompanies = resolveNotificationOutboxLegacyHotStandbyCompanyIds()
  const standbyEventTypes = resolveNotificationOutboxLegacyHotStandbyEventTypes()

  if (standbyCompanies.size === 0 || standbyEventTypes.size === 0) {
    return false
  }

  return (
    matchesScopedSet(standbyCompanies, input.companyId) &&
    matchesScopedSet(standbyEventTypes, input.eventType)
  )
}

export function resolveNotificationDispatcherMode(input: {
  companyId: string
  eventType: string
}): NotificationDispatcherMode {
  const authoritativeCompanies = resolveNotificationOutboxAuthoritativeCompanyIds()
  const authoritativeEventTypes = resolveNotificationOutboxAuthoritativeEventTypes()
  if (
    matchesScopedSet(authoritativeCompanies, input.companyId) &&
    matchesScopedSet(authoritativeEventTypes, input.eventType)
  ) {
    return "active_authoritative"
  }

  const canaryCompanies = resolveNotificationOutboxCanaryCompanyIds()
  const canaryEventTypes = resolveNotificationOutboxCanaryEventTypes()

  if (
    matchesScopedSet(canaryCompanies, input.companyId) &&
    matchesScopedSet(canaryEventTypes, input.eventType)
  ) {
    return "active_canary"
  }

  return "shadow_only"
}

export function shouldUseLegacyRuntimeNotificationDelivery(input: {
  companyId: string
  eventType: string
}) {
  const mode = resolveNotificationDispatcherMode(input)
  if (mode !== "active_authoritative") return true
  return isNotificationOutboxLegacyHotStandbyConfigured(input)
}

export function resolveNotificationOutboxBaselineCreatedAfter(eventType: string) {
  const specificKey = `NOTIFICATION_OUTBOX_BASELINE_${toEventTypeEnvSuffix(eventType)}`
  return (
    normalizeBaselineTimestamp(process.env[specificKey]) ||
    normalizeBaselineTimestamp(process.env.NOTIFICATION_OUTBOX_BASELINE_CREATED_AFTER)
  )
}

export function isSupportedNotificationOutboxCanaryEventType(
  value: string
): value is (typeof SUPPORTED_NOTIFICATION_OUTBOX_CANARY_EVENT_TYPES)[number] {
  return SUPPORTED_NOTIFICATION_OUTBOX_CANARY_EVENT_TYPES.includes(
    value as (typeof SUPPORTED_NOTIFICATION_OUTBOX_CANARY_EVENT_TYPES)[number]
  )
}
