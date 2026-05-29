/**
 * Canonical JSON serialization + checksum.
 *
 * The original v1 code computed the checksum differently in export vs. validate,
 * which meant the checksum NEVER matched. This module fixes that by giving both
 * sides a deterministic canonical form to hash.
 */

import crypto from "crypto"

/**
 * Canonical stringify — produces the same byte sequence regardless of key
 * insertion order. Walks objects and sorts their keys alphabetically.
 * Arrays preserve order (since order is semantically meaningful in our data).
 */
export function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value))
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value
  if (Array.isArray(value)) return value.map(canonicalize)
  const obj = value as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(obj).sort()) {
    out[key] = canonicalize(obj[key])
  }
  return out
}

/**
 * SHA-256 of canonical(data). Used as the backup integrity checksum.
 */
export function checksumOfData(data: unknown): string {
  return crypto
    .createHash("sha256")
    .update(canonicalStringify(data))
    .digest("hex")
}
