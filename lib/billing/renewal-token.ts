/**
 * Renewal Token - 7ESAB ERP v3.33.0
 *
 * Signed, time-bound tokens that authorize a one-click "Renew Now"
 * link from a subscription email — without requiring the user to be
 * logged in (the link survives session expiry / private browsing).
 *
 * Format:
 *   <payload_b64url>.<signature_b64url>
 * where payload = {company_id, seats, billing_period, exp}
 *
 * Signature: HMAC-SHA256 over the payload, using RENEWAL_TOKEN_SECRET.
 *
 * Security model:
 * - Token authorizes ONLY "create a checkout intention for THIS company
 *   at THIS plan". It does not log the user in or expose any data.
 * - 7-day expiry (covers the renewal window even after past_due).
 * - Single secret rotation invalidates ALL outstanding tokens at once.
 * - Final payment still requires the customer to authenticate with
 *   their own card via Paymob (3D Secure / OTP).
 */

import crypto from 'crypto'

// ─────────────────────────────────────────
// Types & constants
// ─────────────────────────────────────────

export interface RenewalTokenPayload {
  /** Company UUID this token can renew */
  cid: string
  /** Number of seats to renew (defaults to current seats) */
  seats: number
  /** Billing period to renew under */
  period: 'monthly' | 'annual'
  /** Unix epoch seconds — token invalid after this */
  exp: number
  /** Random nonce — defends against duplicate token detection */
  nonce: string
}

const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60  // 7 days

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

function getSecret(): string {
  const secret = process.env.RENEWAL_TOKEN_SECRET
  if (!secret || secret.length < 32) {
    throw new Error(
      'RENEWAL_TOKEN_SECRET env var is missing or too short (must be ≥32 chars)'
    )
  }
  return secret
}

function b64urlEncode(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf, 'utf8') : buf
  return b
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function b64urlDecode(s: string): Buffer {
  // Restore padding for Buffer.from
  const padded = s + '='.repeat((4 - (s.length % 4)) % 4)
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

function sign(payloadB64url: string, secret: string): string {
  return b64urlEncode(
    crypto.createHmac('sha256', secret).update(payloadB64url).digest()
  )
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

// ─────────────────────────────────────────
// Public API
// ─────────────────────────────────────────

/**
 * Generate a signed renewal token for a specific company + plan.
 * The token is opaque to the client and can be safely embedded in URLs.
 */
export function generateRenewalToken(args: {
  companyId: string
  seats: number
  billingPeriod: 'monthly' | 'annual'
  ttlSeconds?: number
}): string {
  const secret = getSecret()
  const payload: RenewalTokenPayload = {
    cid: args.companyId,
    seats: Math.max(1, Math.floor(args.seats)),
    period: args.billingPeriod === 'annual' ? 'annual' : 'monthly',
    exp: Math.floor(Date.now() / 1000) + (args.ttlSeconds ?? DEFAULT_TTL_SECONDS),
    nonce: crypto.randomBytes(8).toString('hex'),
  }
  const payloadB64 = b64urlEncode(JSON.stringify(payload))
  const sig = sign(payloadB64, secret)
  return `${payloadB64}.${sig}`
}

/**
 * Verify a renewal token. Returns the payload on success or null on
 * any failure (bad format, bad signature, expired, etc.).
 *
 * NEVER throws — callers can treat null as "unauthorized" safely.
 */
export function verifyRenewalToken(token: string | null | undefined): RenewalTokenPayload | null {
  if (!token || typeof token !== 'string') return null

  const parts = token.split('.')
  if (parts.length !== 2) return null

  const [payloadB64, providedSig] = parts
  if (!payloadB64 || !providedSig) return null

  let secret: string
  try {
    secret = getSecret()
  } catch {
    return null
  }

  // Verify signature (timing-safe)
  const expectedSig = sign(payloadB64, secret)
  if (!timingSafeEqual(providedSig, expectedSig)) return null

  // Decode payload
  let payload: RenewalTokenPayload
  try {
    payload = JSON.parse(b64urlDecode(payloadB64).toString('utf8'))
  } catch {
    return null
  }

  // Validate shape
  if (
    typeof payload.cid !== 'string' ||
    payload.cid.length < 10 ||
    typeof payload.seats !== 'number' ||
    payload.seats < 1 ||
    (payload.period !== 'monthly' && payload.period !== 'annual') ||
    typeof payload.exp !== 'number'
  ) {
    return null
  }

  // Check expiry
  if (Date.now() / 1000 > payload.exp) return null

  return payload
}

/**
 * Build the full renewal URL the customer clicks from their email.
 * Returns e.g. `https://7esab.com/api/billing/renew?token=xyz...`
 */
export function buildRenewalUrl(args: {
  companyId: string
  seats: number
  billingPeriod: 'monthly' | 'annual'
  appUrl?: string
}): string {
  const baseUrl =
    args.appUrl ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://7esab.com')

  const token = generateRenewalToken({
    companyId: args.companyId,
    seats: args.seats,
    billingPeriod: args.billingPeriod,
  })

  return `${baseUrl.replace(/\/$/, '')}/api/billing/renew?token=${encodeURIComponent(token)}`
}
