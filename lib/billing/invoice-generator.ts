/**
 * Invoice Generator - 7ESAB ERP v3.30.0
 *
 * High-level orchestrator:
 *   1. Reads the pricing snapshot stashed in Paymob's `extras` field
 *   2. Inserts a row into `billing_invoices` (invoice_number is auto-generated
 *      by DB trigger as INV-YYYY-NNNNNN)
 *   3. Renders the PDF via `renderInvoicePdf`
 *   4. Uploads it to Supabase Storage at `{company_id}/{invoice_number}.pdf`
 *   5. Updates the row with the storage path
 *
 * Designed to be idempotent: if an invoice already exists for the given
 * paymob_transaction_id, returns the existing one without regeneration.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { renderInvoicePdf, InvoiceData } from './invoice-pdf'

// ─────────────────────────────────────────
// Constants - 7esab brand info
// ─────────────────────────────────────────

const SELLER_INFO = {
  name: '7esab.com',
  addressLines: ['Cairo, Egypt'],
  email: 'info@7esab.com',
  website: 'https://7esab.com',
  vatNumber: process.env.SELLER_VAT_NUMBER || undefined,
}

const STORAGE_BUCKET = 'billing-invoices'

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

export interface PricingSnapshot {
  seats: number
  base_price_usd: number
  subtotal_usd: number
  total_discount_usd: number
  tax_rate: number
  tax_amount_usd: number
  total_usd: number
  charge_currency: string
  charge_exchange_rate: number
  charge_total_egp: number
  display_currency: string
  country_code: string
  // Optional breakdown fields (added if present in extras)
  volume_discount_percent?: number
  volume_discount_usd?: number
  annual_discount_percent?: number
  annual_discount_usd?: number
  coupon_discount_usd?: number
  coupon_code?: string | null
  exchange_rate?: number  // USD → display_currency
  subtotal_display?: number
  total_display?: number
}

export interface CreateInvoiceInput {
  companyId: string
  pricingSnapshot: PricingSnapshot
  billingPeriod: 'monthly' | 'annual'
  paymobTransactionId: string
  paidAt?: Date | string
  invoiceType?: 'subscription' | 'seat_addon'
}

export interface InvoiceResult {
  success: boolean
  invoiceId?: string
  invoiceNumber?: string
  pdfPath?: string
  idempotent?: boolean
  error?: string
}

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

function getAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !key) throw new Error('Supabase admin credentials missing')
  return createClient(url, key, { auth: { persistSession: false } })
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/**
 * Convert a USD amount to the display currency using the snapshot's rate.
 * Falls back to USD if no rate is available.
 */
function toDisplay(usdAmount: number, snapshot: PricingSnapshot): number {
  const rate = snapshot.exchange_rate && snapshot.exchange_rate > 0
    ? snapshot.exchange_rate
    : 1
  return round2(usdAmount * rate)
}

/**
 * Build InvoiceData from a pricing snapshot.
 * Display amounts use the snapshot's display currency.
 */
function buildInvoiceData(args: {
  invoiceNumber: string
  invoiceDate: Date
  companyName: string
  countryCode: string
  customerEmail?: string
  snapshot: PricingSnapshot
  billingPeriod: 'monthly' | 'annual'
  paymobTransactionId: string
  paidAt?: Date | string
  status: 'paid' | 'pending' | 'failed'
}): InvoiceData {
  const s = args.snapshot
  const displayCurrency = (s.display_currency || 'USD').toUpperCase()
  const monthsInPeriod = args.billingPeriod === 'annual' ? 12 : 1

  // If display amounts are present in the snapshot, use them; otherwise derive from USD
  const subtotal = s.subtotal_display ?? toDisplay(s.subtotal_usd, s)
  const totalDiscount = toDisplay(s.total_discount_usd, s)
  const taxableAmount = round2(subtotal - totalDiscount)
  const taxAmount = toDisplay(s.tax_amount_usd, s)
  const total = s.total_display ?? toDisplay(s.total_usd, s)

  // Per-discount display amounts (derived)
  const volumeDiscountAmount = s.volume_discount_usd != null ? toDisplay(s.volume_discount_usd, s) : 0
  const annualDiscountAmount = s.annual_discount_usd != null ? toDisplay(s.annual_discount_usd, s) : 0
  const couponDiscountAmount = s.coupon_discount_usd != null ? toDisplay(s.coupon_discount_usd, s) : 0

  // Period
  const periodStart = new Date(args.invoiceDate)
  const periodEnd = new Date(args.invoiceDate)
  periodEnd.setMonth(periodEnd.getMonth() + monthsInPeriod)

  // Unit price per seat for the displayed period (gross, before discounts)
  const unitPricePerSeat = s.seats > 0 ? round2(subtotal / s.seats) : 0

  const lineDescription = args.billingPeriod === 'annual'
    ? `Subscription — ${s.seats} seat${s.seats > 1 ? 's' : ''} × 12 months (annual prepay)`
    : `Subscription — ${s.seats} seat${s.seats > 1 ? 's' : ''} × 1 month`

  return {
    invoiceNumber: args.invoiceNumber,
    invoiceDate: args.invoiceDate,
    dueDate: null,
    status: args.status,

    seller: SELLER_INFO,
    buyer: {
      companyName: args.companyName,
      countryCode: args.countryCode || s.country_code || 'EG',
      email: args.customerEmail,
    },

    lineItems: [{
      description: lineDescription,
      quantity: s.seats,
      unitPrice: unitPricePerSeat,
      amount: subtotal,
    }],

    currency: displayCurrency,
    subtotal,
    volumeDiscountAmount,
    volumeDiscountPercent: s.volume_discount_percent ?? 0,
    annualDiscountAmount,
    annualDiscountPercent: s.annual_discount_percent ?? 0,
    couponDiscountAmount,
    couponCode: s.coupon_code ?? null,
    totalDiscount,
    taxableAmount,
    taxRate: s.tax_rate ?? 0,
    taxAmount,
    total,

    chargeCurrency: 'EGP',
    chargeExchangeRate: s.charge_exchange_rate,
    chargeTotalEgp: s.charge_total_egp,

    paymentMethod: 'Paymob',
    paymobTransactionId: args.paymobTransactionId,
    paidAt: args.paidAt ?? null,

    billingPeriod: args.billingPeriod,
    periodStart,
    periodEnd,

    notes: [],
  }
}

// ─────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────

/**
 * Create a billing_invoices row + generate and upload its PDF.
 * Idempotent on `paymob_transaction_id`.
 */
export async function createInvoiceForPayment(
  input: CreateInvoiceInput
): Promise<InvoiceResult> {
  const admin = getAdminClient()
  const snapshot = input.pricingSnapshot

  // ── 1. Idempotency check ──
  const { data: existing } = await admin
    .from('billing_invoices')
    .select('id, invoice_number, pdf_url')
    .eq('paymob_transaction_id', input.paymobTransactionId)
    .maybeSingle()

  if (existing?.id) {
    return {
      success: true,
      invoiceId: existing.id,
      invoiceNumber: existing.invoice_number,
      pdfPath: existing.pdf_url ?? undefined,
      idempotent: true,
    }
  }

  // ── 2. Fetch company info ──
  const { data: company, error: companyErr } = await admin
    .from('companies')
    .select('id, name, country, base_currency, user_id')
    .eq('id', input.companyId)
    .single()

  if (companyErr || !company) {
    return { success: false, error: 'company_not_found' }
  }

  // Customer email: fetch from auth.users (owner)
  let customerEmail: string | undefined
  if (company.user_id) {
    try {
      const { data: userData } = await admin.auth.admin.getUserById(company.user_id)
      customerEmail = userData?.user?.email
    } catch { /* non-fatal */ }
  }

  // ── 3. Insert billing_invoices row ──
  // invoice_number is auto-generated by DB trigger (INV-YYYY-NNNNNN)
  const displayCurrency = (snapshot.display_currency || 'USD').toUpperCase()
  const subtotalDisplay = snapshot.subtotal_display ?? round2(snapshot.subtotal_usd * (snapshot.exchange_rate || 1))
  const totalDiscountDisplay = round2(snapshot.total_discount_usd * (snapshot.exchange_rate || 1))
  const taxAmountDisplay = round2(snapshot.tax_amount_usd * (snapshot.exchange_rate || 1))
  const totalDisplay = snapshot.total_display ?? round2(snapshot.total_usd * (snapshot.exchange_rate || 1))

  const { data: invoiceRow, error: insertErr } = await admin
    .from('billing_invoices')
    .insert({
      company_id: input.companyId,
      invoice_type: input.invoiceType ?? 'subscription',
      currency: displayCurrency,
      subtotal: subtotalDisplay,
      discount_amount: totalDiscountDisplay,
      tax_rate: snapshot.tax_rate,
      tax_amount: taxAmountDisplay,
      total: totalDisplay,
      total_usd: snapshot.total_usd,
      exchange_rate_used: snapshot.exchange_rate ?? 1,
      status: 'paid',
      seats_count: snapshot.seats,
      billing_period: input.billingPeriod,
      volume_discount_percent: snapshot.volume_discount_percent ?? 0,
      paymob_transaction_id: input.paymobTransactionId,
      paid_at: input.paidAt ?? new Date().toISOString(),
      metadata: {
        pricing_snapshot: snapshot,
        charge_currency: 'EGP',
        charge_exchange_rate: snapshot.charge_exchange_rate,
        charge_total_egp: snapshot.charge_total_egp,
      },
    })
    .select('id, invoice_number')
    .single()

  if (insertErr || !invoiceRow) {
    return { success: false, error: `invoice_insert_failed: ${insertErr?.message ?? 'unknown'}` }
  }

  // ── 4. Render PDF ──
  let pdfBuffer: Buffer
  try {
    const invoiceData = buildInvoiceData({
      invoiceNumber: invoiceRow.invoice_number,
      invoiceDate: new Date(input.paidAt ?? Date.now()),
      companyName: company.name || 'Customer',
      countryCode: company.country || snapshot.country_code || 'EG',
      customerEmail,
      snapshot,
      billingPeriod: input.billingPeriod,
      paymobTransactionId: input.paymobTransactionId,
      paidAt: input.paidAt,
      status: 'paid',
    })
    pdfBuffer = await renderInvoicePdf(invoiceData)
  } catch (renderErr: any) {
    console.error('[invoice-generator] PDF render failed:', renderErr)
    // We keep the invoice row but flag pdf as missing — can regenerate later
    return {
      success: true,
      invoiceId: invoiceRow.id,
      invoiceNumber: invoiceRow.invoice_number,
      error: `pdf_render_failed: ${renderErr.message ?? renderErr}`,
    }
  }

  // ── 5. Upload to Supabase Storage ──
  const pdfPath = `${input.companyId}/${invoiceRow.invoice_number}.pdf`
  const { error: uploadErr } = await admin.storage
    .from(STORAGE_BUCKET)
    .upload(pdfPath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    })

  if (uploadErr) {
    console.error('[invoice-generator] PDF upload failed:', uploadErr)
    return {
      success: true,
      invoiceId: invoiceRow.id,
      invoiceNumber: invoiceRow.invoice_number,
      error: `pdf_upload_failed: ${uploadErr.message}`,
    }
  }

  // ── 6. Update row with pdf_url (we store the storage path; signed URL is generated on demand) ──
  await admin
    .from('billing_invoices')
    .update({ pdf_url: pdfPath })
    .eq('id', invoiceRow.id)

  return {
    success: true,
    invoiceId: invoiceRow.id,
    invoiceNumber: invoiceRow.invoice_number,
    pdfPath,
    idempotent: false,
  }
}

// ─────────────────────────────────────────
// Get a signed URL for an existing invoice PDF
// ─────────────────────────────────────────

export async function getInvoiceSignedUrl(
  invoiceId: string,
  expiresInSeconds: number = 300
): Promise<{ url?: string; error?: string }> {
  const admin = getAdminClient()

  const { data: invoice, error } = await admin
    .from('billing_invoices')
    .select('id, company_id, pdf_url, invoice_number')
    .eq('id', invoiceId)
    .maybeSingle()

  if (error || !invoice) return { error: 'invoice_not_found' }
  if (!invoice.pdf_url) return { error: 'pdf_not_generated_yet' }

  const { data, error: signErr } = await admin.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(invoice.pdf_url, expiresInSeconds, {
      download: `${invoice.invoice_number}.pdf`,
    })

  if (signErr || !data?.signedUrl) {
    return { error: signErr?.message || 'sign_url_failed' }
  }

  return { url: data.signedUrl }
}

/**
 * Regenerate a PDF for an existing invoice (useful for template updates
 * or if upload failed on first try).
 */
export async function regenerateInvoicePdf(invoiceId: string): Promise<InvoiceResult> {
  const admin = getAdminClient()

  const { data: invoice, error } = await admin
    .from('billing_invoices')
    .select('*, companies(name, country, user_id)')
    .eq('id', invoiceId)
    .maybeSingle()

  if (error || !invoice) {
    return { success: false, error: 'invoice_not_found' }
  }

  const snapshot = (invoice.metadata as any)?.pricing_snapshot as PricingSnapshot | undefined
  if (!snapshot) {
    return { success: false, error: 'snapshot_missing' }
  }

  const company = invoice.companies as { name?: string; country?: string; user_id?: string } | null

  let customerEmail: string | undefined
  if (company?.user_id) {
    try {
      const { data: userData } = await admin.auth.admin.getUserById(company.user_id)
      customerEmail = userData?.user?.email
    } catch { /* non-fatal */ }
  }

  const invoiceData = buildInvoiceData({
    invoiceNumber: invoice.invoice_number,
    invoiceDate: new Date(invoice.paid_at || invoice.created_at),
    companyName: company?.name || 'Customer',
    countryCode: company?.country || snapshot.country_code || 'EG',
    customerEmail,
    snapshot,
    billingPeriod: (invoice.billing_period as 'monthly' | 'annual') || 'monthly',
    paymobTransactionId: invoice.paymob_transaction_id || '',
    paidAt: invoice.paid_at,
    status: invoice.status === 'paid' ? 'paid' : invoice.status === 'failed' ? 'failed' : 'pending',
  })

  let pdfBuffer: Buffer
  try {
    pdfBuffer = await renderInvoicePdf(invoiceData)
  } catch (renderErr: any) {
    return { success: false, error: `pdf_render_failed: ${renderErr.message ?? renderErr}` }
  }

  const pdfPath = `${invoice.company_id}/${invoice.invoice_number}.pdf`
  const { error: uploadErr } = await admin.storage
    .from(STORAGE_BUCKET)
    .upload(pdfPath, pdfBuffer, { contentType: 'application/pdf', upsert: true })

  if (uploadErr) {
    return { success: false, error: `pdf_upload_failed: ${uploadErr.message}` }
  }

  await admin
    .from('billing_invoices')
    .update({ pdf_url: pdfPath, updated_at: new Date().toISOString() })
    .eq('id', invoiceId)

  return {
    success: true,
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoice_number,
    pdfPath,
  }
}
