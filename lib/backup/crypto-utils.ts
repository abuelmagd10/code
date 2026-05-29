/**
 * Client-side AES-256-GCM encryption for backup files.
 *
 * Design:
 *   - All crypto happens in the browser via Web Crypto API (`window.crypto.subtle`).
 *     The server NEVER sees the user passphrase.
 *   - Passphrase -> 32-byte key via PBKDF2 (SHA-256, 250 000 iterations,
 *     16-byte random salt).
 *   - AES-256-GCM with 12-byte random IV. The authentication tag is part
 *     of the ciphertext (Web Crypto convention) so tampering is detected.
 *   - The wrapped file keeps a small `metadata_hint` outside the ciphertext
 *     so the user can see WHAT backup it is (company name, date, record count)
 *     without needing the passphrase. The hint contains NO sensitive data.
 *
 * If the user loses the passphrase the file is unrecoverable. This is by design.
 */

import type { BackupData } from "./types"

// ─── Public types ────────────────────────────────────────────────────────────

export interface EncryptedBackup {
  encrypted: true
  format: "ERB-BACKUP-AES256GCM-v1"
  kdf: {
    alg: "PBKDF2"
    hash: "SHA-256"
    iters: number
    salt_b64: string
  }
  cipher: {
    alg: "AES-256-GCM"
    iv_b64: string
    ct_b64: string
  }
  metadata_hint: {
    company_id: string
    company_name: string
    created_at: string
    total_records: number
    system_version: string
  }
}

export interface PassphraseStrength {
  score: 0 | 1 | 2 | 3 | 4
  label_ar: string
  label_en: string
  reasons_ar: string[]
  reasons_en: string[]
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PBKDF2_ITERS = 250_000
const SALT_BYTES = 16
const IV_BYTES = 12
const KEY_BITS = 256
const MIN_PASSPHRASE_LENGTH = 12

// ─── Base64 helpers (UTF-8 safe) ─────────────────────────────────────────────

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ""
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function utf8Encode(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

function utf8Decode(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes)
}

// ─── Crypto guards ───────────────────────────────────────────────────────────

function getSubtle(): SubtleCrypto {
  if (typeof window === "undefined" || !window.crypto?.subtle) {
    throw new Error(
      "Web Crypto API is not available in this environment. Encryption requires a modern browser over HTTPS."
    )
  }
  return window.crypto.subtle
}

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n)
  window.crypto.getRandomValues(out)
  return out
}

/**
 * TS 5.7 made `Uint8Array<ArrayBufferLike>` not assignable to `BufferSource`
 * because `ArrayBufferLike` includes `SharedArrayBuffer` (which lacks the new
 * `resizable`/`transfer` methods). Web Crypto APIs require plain `ArrayBuffer`.
 * This helper produces a definitely-ArrayBuffer-backed view in one place so
 * we do not sprinkle casts everywhere.
 */
function toBufferSource(view: Uint8Array): ArrayBuffer {
  // Slice copies into a fresh plain ArrayBuffer regardless of the source.
  const buf = new ArrayBuffer(view.byteLength)
  new Uint8Array(buf).set(view)
  return buf
}

// ─── PBKDF2 key derivation ───────────────────────────────────────────────────

async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  iters: number = PBKDF2_ITERS
): Promise<CryptoKey> {
  const subtle = getSubtle()
  const keyMaterial = await subtle.importKey(
    "raw",
    toBufferSource(utf8Encode(passphrase)),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  )
  return subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: toBufferSource(salt),
      iterations: iters,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: KEY_BITS },
    false,
    ["encrypt", "decrypt"]
  )
}

// ─── Encrypt / Decrypt ───────────────────────────────────────────────────────

/**
 * Encrypt a BackupData object with the user passphrase.
 * Returns a wrapped object safe to write to disk.
 */
export async function encryptBackup(
  data: BackupData,
  passphrase: string
): Promise<EncryptedBackup> {
  if (!passphrase || passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(
      `Passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters long.`
    )
  }
  const subtle = getSubtle()

  const salt = randomBytes(SALT_BYTES)
  const iv = randomBytes(IV_BYTES)
  const key = await deriveKey(passphrase, salt)

  const plaintext = utf8Encode(JSON.stringify(data))
  const ctBuf = await subtle.encrypt(
    { name: "AES-GCM", iv: toBufferSource(iv) },
    key,
    toBufferSource(plaintext)
  )
  const ct = new Uint8Array(ctBuf)

  return {
    encrypted: true,
    format: "ERB-BACKUP-AES256GCM-v1",
    kdf: {
      alg: "PBKDF2",
      hash: "SHA-256",
      iters: PBKDF2_ITERS,
      salt_b64: bytesToBase64(salt),
    },
    cipher: {
      alg: "AES-256-GCM",
      iv_b64: bytesToBase64(iv),
      ct_b64: bytesToBase64(ct),
    },
    metadata_hint: {
      company_id: data.metadata.company_id,
      company_name: data.metadata.company_name,
      created_at: data.metadata.created_at,
      total_records: data.metadata.total_records,
      system_version: data.metadata.system_version,
    },
  }
}

/**
 * Decrypt a previously encrypted backup. Throws if the passphrase is wrong
 * (GCM authentication tag mismatch) or the file is tampered with.
 */
export async function decryptBackup(
  wrapped: EncryptedBackup,
  passphrase: string
): Promise<BackupData> {
  if (!isEncryptedBackup(wrapped)) {
    throw new Error("File is not a valid encrypted backup.")
  }
  const subtle = getSubtle()

  const salt = base64ToBytes(wrapped.kdf.salt_b64)
  const iv = base64ToBytes(wrapped.cipher.iv_b64)
  const ct = base64ToBytes(wrapped.cipher.ct_b64)
  const key = await deriveKey(passphrase, salt, wrapped.kdf.iters)

  let ptBuf: ArrayBuffer
  try {
    ptBuf = await subtle.decrypt(
      { name: "AES-GCM", iv: toBufferSource(iv) },
      key,
      toBufferSource(ct)
    )
  } catch {
    // GCM throws on auth failure — almost always wrong passphrase
    throw new Error("WRONG_PASSPHRASE")
  }

  const json = utf8Decode(new Uint8Array(ptBuf))
  const data = JSON.parse(json) as BackupData
  if (!data || !data.metadata || !data.data) {
    throw new Error("Decrypted content is not a valid backup.")
  }
  return data
}

/**
 * Type guard — does this look like a wrapped EncryptedBackup?
 */
export function isEncryptedBackup(obj: unknown): obj is EncryptedBackup {
  if (!obj || typeof obj !== "object") return false
  const o = obj as Record<string, unknown>
  return (
    o.encrypted === true &&
    typeof o.format === "string" &&
    o.format === "ERB-BACKUP-AES256GCM-v1" &&
    !!o.kdf &&
    !!o.cipher &&
    !!o.metadata_hint
  )
}

// ─── Passphrase strength estimator (no external library) ─────────────────────

/**
 * Lightweight strength score 0..4, plus bilingual reason hints.
 * Not a substitute for a full zxcvbn check, but adequate to push users away
 * from "password123" and toward something usable.
 */
export function estimatePassphraseStrength(p: string): PassphraseStrength {
  const len = (p || "").length
  let score = 0
  const reasons_ar: string[] = []
  const reasons_en: string[] = []

  if (len >= MIN_PASSPHRASE_LENGTH) score++
  else reasons_ar.push(`يجب ${MIN_PASSPHRASE_LENGTH} أحرف على الأقل`),
       reasons_en.push(`Must be at least ${MIN_PASSPHRASE_LENGTH} characters`)

  if (len >= 16) score++
  else reasons_ar.push("يُستحسن 16 حرفاً أو أكثر"),
       reasons_en.push("Aim for 16+ characters")

  const hasLower = /[a-z]/.test(p)
  const hasUpper = /[A-Z]/.test(p)
  const hasDigit = /\d/.test(p)
  const hasSymbol = /[^A-Za-z0-9]/.test(p)
  const classes = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length

  if (classes >= 3) score++
  else if (classes >= 2) {
    reasons_ar.push("استخدم 3 أنواع على الأقل (أحرف صغيرة + كبيرة + أرقام أو رموز)")
    reasons_en.push("Use at least 3 character types (lower + upper + digit/symbol)")
  } else {
    reasons_ar.push("استخدم أنواعاً مختلفة من الأحرف")
    reasons_en.push("Use different character types")
  }

  if (classes === 4) score++

  // Penalty: obvious sequences / single repeated char
  if (/^(.)\1+$/.test(p) || /(.)\1{3,}/.test(p)) {
    score = Math.max(0, score - 1)
    reasons_ar.push("تجنب تكرار الحرف نفسه")
    reasons_en.push("Avoid repeating the same character")
  }
  const lower = p.toLowerCase()
  if (lower.includes("password") || lower.includes("12345") || lower.includes("qwerty")) {
    score = Math.max(0, score - 1)
    reasons_ar.push("تجنب الكلمات/التسلسلات الشائعة")
    reasons_en.push("Avoid common words/sequences")
  }

  const clamped = Math.max(0, Math.min(4, score)) as 0 | 1 | 2 | 3 | 4
  const labels_ar = ["ضعيفة جداً", "ضعيفة", "متوسطة", "قوية", "ممتازة"]
  const labels_en = ["Very weak", "Weak", "Fair", "Strong", "Excellent"]

  return {
    score: clamped,
    label_ar: labels_ar[clamped],
    label_en: labels_en[clamped],
    reasons_ar,
    reasons_en,
  }
}

export const PASSPHRASE_MIN_LENGTH = MIN_PASSPHRASE_LENGTH
