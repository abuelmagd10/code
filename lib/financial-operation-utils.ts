import { createHash } from "crypto"

function normalizeParts(parts: Array<string | number | boolean | null | undefined>) {
  return parts
    .map((part) => {
      if (part == null) return "null"
      if (typeof part === "string") return part.trim() || "empty"
      return String(part)
    })
    .join(":")
}

export function resolveFinancialIdempotencyKey(
  headerValue: string | null | undefined,
  fallbackParts: Array<string | number | boolean | null | undefined>
) {
  if (headerValue && headerValue.trim()) {
    return headerValue.trim()
  }

  const digest = createHash("sha256")
    .update(normalizeParts(fallbackParts))
    .digest("hex")

  return `phase1:${digest}`
}

export function buildFinancialRequestHash(payload: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(payload ?? {}))
    .digest("hex")
}
