import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { syncSubscriptionFromWebhook, type PaymobWebhookPayload } from '@/lib/billing/subscription-service'

const PAYMOB_HMAC = process.env.PAYMOB_HMAC!

// ─────────────────────────────────────────
// Verify Paymob HMAC signature
// ─────────────────────────────────────────
function verifyHmac(transaction: Record<string, any>, hmacKey: string, received: string): boolean {
  const hmacFields = [
    'amount_cents', 'created_at', 'currency', 'error_occured',
    'has_parent_transaction', 'id', 'integration_id', 'is_3d_secure',
    'is_auth', 'is_capture', 'is_refunded', 'is_standalone_payment',
    'is_voided', 'order', 'owner', 'pending',
    'source_data.pan', 'source_data.sub_type', 'source_data.type', 'success',
  ]

  const concatenated = hmacFields
    .map((field) => {
      const keys = field.split('.')
      let value: any = transaction
      for (const key of keys) value = value?.[key]
      return value !== undefined && value !== null ? String(value) : ''
    })
    .join('')

  const calculated = crypto.createHmac('sha512', hmacKey).update(concatenated).digest('hex')
  return calculated === received
}

// ─────────────────────────────────────────
// Extract extras from Paymob order
// Paymob stores extras in order.extra_description (JSON string) or flat
// ─────────────────────────────────────────
function extractExtras(transaction: any): {
  company_id?: string
  user_id?: string
  additional_users?: number
} {
  try {
    // NextGen API stores extras in order object
    const raw = transaction?.order?.extra_description
    if (raw) return typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch { }

  // Fallback: sometimes extras are at transaction.extra or order.extras
  const extras = transaction?.extras || transaction?.order?.extras || {}
  return extras
}

// ─────────────────────────────────────────
// POST /api/webhooks/paymob
// ─────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { hmac, obj: transaction } = body

    // 1. Verify HMAC
    if (!PAYMOB_HMAC) {
      console.error('[paymob-webhook] PAYMOB_HMAC not configured')
      return NextResponse.json({ error: 'webhook_not_configured' }, { status: 500 })
    }

    if (!verifyHmac(transaction, PAYMOB_HMAC, hmac)) {
      console.error('[paymob-webhook] Invalid HMAC signature')
      return NextResponse.json({ error: 'invalid_hmac' }, { status: 401 })
    }

    // 2. Extract extras (company_id, additional_users)
    const extras = extractExtras(transaction)
    const { company_id, user_id, additional_users } = extras

    if (!company_id) {
      console.warn('[paymob-webhook] Missing company_id in extras — ignoring')
      return NextResponse.json({ status: 'ignored', reason: 'no_company_id' })
    }

    // 3. Build payload for SubscriptionService
    const payload: PaymobWebhookPayload = {
      transaction_id: String(transaction.id),
      order_id:       String(transaction.order?.id || ''),
      company_id,
      additional_users: Number(additional_users || 0),
      amount_cents:   Number(transaction.amount_cents || 0),
      success:        Boolean(transaction.success),
      pending:        Boolean(transaction.pending),
      error_occured:  Boolean(transaction.error_occured),
    }

    // 4. Sync with subscription service (idempotent)
    const result = await syncSubscriptionFromWebhook(payload)

    console.log(`[paymob-webhook] Processed: action=${result.action}, success=${result.success}, idempotent=${result.idempotent ?? false}`)

    return NextResponse.json({
      status: 'ok',
      action: result.action,
      idempotent: result.idempotent ?? false,
    })
  } catch (err: any) {
    console.error('[paymob-webhook] Unhandled error:', err)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
