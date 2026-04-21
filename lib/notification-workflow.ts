export type WorkflowNotificationSeverity = "info" | "warning" | "error" | "critical"

const NOTIFICATION_SEVERITY_MAP: Record<string, WorkflowNotificationSeverity> = {
  info: "info",
  success: "info",
  warning: "warning",
  warn: "warning",
  error: "error",
  critical: "critical",
}

export function normalizeNotificationSeverity(
  severity: string | null | undefined
): WorkflowNotificationSeverity {
  const normalized = String(severity || "").trim().toLowerCase()
  return NOTIFICATION_SEVERITY_MAP[normalized] || "info"
}

export function normalizeNotificationKeySegment(value: string | number | null | undefined) {
  const cleaned = String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")

  return cleaned || "na"
}

export function buildNotificationEventKey(
  ...segments: Array<string | number | null | undefined>
) {
  return segments.map(normalizeNotificationKeySegment).join(":")
}
