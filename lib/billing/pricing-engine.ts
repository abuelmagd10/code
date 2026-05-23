/**
 * Pricing Engine - 7ESAB ERP v3.29.0
 *
 * Single source of truth for ALL pricing calculations:
 * - Base price: $10 USD per seat/month
 * - Multi-currency: live conversion using exchange_rates
 * - Volume discounts: 10/25/50+ seats
 * - Annual billing: -17% (2 months free)
 * - VAT: per-country, auto-calculated
 */

import { createClient } from '@supabase/supabase-js'
import { getExchangeRate } from '@/lib/currency-service'

// ─────────────────────────────────────────
// Constants
// ─────────────────────────────────────────

export const BASE_PRICE_USD = 10  // $10/seat/month (matches landing page)
export const BASE_CURRENCY = 'USD'
export const ANNUAL_DISCOUNT_PERCENT = 17  // ~2 months free

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

export interface PricingInput {
  seats: number
  billingPeriod: 'monthly' | 'annual'
  targetCurrency: string  // 'EGP', 'USD', 'EUR', etc.
  countryCode: string     // 'EG', 'SA', 'US', etc. (for VAT)
  couponCode?: string     // optional discount
}

export interface PricingBreakdown {
  // Inputs echo
  seats: number
  billingPeriod: 'monthly' | 'annual'
  targetCurrency: string
  countryCode: string

  // USD amounts (source of truth)
  basePriceUsd: number          // $10
  subtotalUsd: number           // seats × basePriceUsd × months
  volumeDiscountPercent: number
  volumeDiscountUsd: number
  annualDiscountPercent: number
  annualDiscountUsd: number
  couponDiscountPercent: number
  couponDiscountUsd: number
  totalDiscountUsd: number
  afterDiscountsUsd: number     // subtotal - all discounts
  taxRate: number
  taxAmountUsd: number
  totalUsd: number

  // Display amounts (in target currency, live FX rate applied)
  exchangeRate: number
  subtotalDisplay: number
  discountDisplay: number
  afterDiscountsDisplay: number
  taxAmountDisplay: number
  totalDisplay: number

  // Metadata
  monthsInPeriod: number  // 1 for monthly, 12 for annual
  couponApplied?: string
  couponValid?: boolean
  notes: string[]
}

interface VolumeTier {
  min_seats: number
  discount_percent: number
}

interface VatRate {
  country_code: string
  vat_rate: number
  vat_name: string
}

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !key) throw new Error('Supabase admin credentials missing')
  return createClient(url, key, { auth: { persistSession: false } })
}

/**
 * Round to 2 decimals (avoids floating-point junk)
 */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/**
 * Calculate volume discount for given seat count
 */
async function calculateVolumeDiscount(seats: number): Promise<number> {
  const admin = getAdminClient()
  const { data } = await admin
    .from('volume_discount_tiers')
    .select('min_seats, discount_percent')
    .eq('is_active', true)
    .lte('min_seats', seats)
    .order('discount_percent', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (data as VolumeTier | null)?.discount_percent || 0
}

/**
 * Get VAT rate for country
 */
async function getVatRate(countryCode: string): Promise<number> {
  const admin = getAdminClient()
  const { data } = await admin
    .from('country_vat_rates')
    .select('vat_rate')
    .eq('country_code', countryCode.toUpperCase())
    .eq('is_active', true)
    .maybeSingle()

  return (data as VatRate | null)?.vat_rate || 0
}

/**
 * Validate and apply coupon
 */
async function applyCoupon(
  code: string | undefined,
  billingPeriod: 'monthly' | 'annual'
): Promise<{ discount: number; valid: boolean; type: 'percent' | 'fixed_usd' }> {
  if (!code) return { discount: 0, valid: false, type: 'percent' }

  const admin = getAdminClient()
  const { data } = await admin
    .from('billing_coupons')
    .select('discount_type, discount_value, applies_to, max_uses, current_uses, valid_until')
    .eq('code', code.toUpperCase())
    .eq('is_active', true)
    .maybeSingle()

  if (!data) return { discount: 0, valid: false, type: 'percent' }

  // Validity checks
  const c = data as any
  if (c.valid_until && new Date(c.valid_until) < new Date()) {
    return { discount: 0, valid: false, type: 'percent' }
  }
  if (c.max_uses && c.current_uses >= c.max_uses) {
    return { discount: 0, valid: false, type: 'percent' }
  }
  if (c.applies_to === 'annual_only' && billingPeriod !== 'annual') {
    return { discount: 0, valid: false, type: 'percent' }
  }
  if (c.applies_to === 'monthly_only' && billingPeriod !== 'monthly') {
    return { discount: 0, valid: false, type: 'percent' }
  }

  return {
    discount: c.discount_value,
    valid: true,
    type: c.discount_type as 'percent' | 'fixed_usd',
  }
}

// ─────────────────────────────────────────
// Main pricing function
// ─────────────────────────────────────────

export async function calculatePricing(input: PricingInput): Promise<PricingBreakdown> {
  const { seats, billingPeriod, targetCurrency, countryCode, couponCode } = input

  if (seats < 1) {
    throw new Error('Seats must be at least 1')
  }

  const monthsInPeriod = billingPeriod === 'annual' ? 12 : 1
  const notes: string[] = []

  // ── Step 1: Base subtotal in USD ──
  const subtotalUsd = round2(BASE_PRICE_USD * seats * monthsInPeriod)

  // ── Step 2: Volume discount (applied first) ──
  const volumeDiscountPercent = await calculateVolumeDiscount(seats)
  const volumeDiscountUsd = round2((subtotalUsd * volumeDiscountPercent) / 100)
  if (volumeDiscountPercent > 0) {
    notes.push(`Volume discount: ${volumeDiscountPercent}% (${seats}+ seats)`)
  }

  // ── Step 3: Annual billing discount ──
  let annualDiscountUsd = 0
  let annualDiscountPercent = 0
  if (billingPeriod === 'annual') {
    annualDiscountPercent = ANNUAL_DISCOUNT_PERCENT
    annualDiscountUsd = round2(((subtotalUsd - volumeDiscountUsd) * ANNUAL_DISCOUNT_PERCENT) / 100)
    notes.push(`Annual prepay: ${ANNUAL_DISCOUNT_PERCENT}% off (~2 months free)`)
  }

  // ── Step 4: Coupon discount ──
  const coupon = await applyCoupon(couponCode, billingPeriod)
  let couponDiscountUsd = 0
  let couponDiscountPercent = 0
  if (coupon.valid) {
    const afterVolumeAndAnnual = subtotalUsd - volumeDiscountUsd - annualDiscountUsd
    if (coupon.type === 'percent') {
      couponDiscountPercent = coupon.discount
      couponDiscountUsd = round2((afterVolumeAndAnnual * coupon.discount) / 100)
    } else {
      couponDiscountUsd = round2(coupon.discount)
    }
    notes.push(`Coupon "${couponCode}": -$${couponDiscountUsd}`)
  } else if (couponCode) {
    notes.push(`Coupon "${couponCode}": invalid or expired`)
  }

  const totalDiscountUsd = round2(volumeDiscountUsd + annualDiscountUsd + couponDiscountUsd)
  const afterDiscountsUsd = round2(subtotalUsd - totalDiscountUsd)

  // ── Step 5: Tax (VAT) ──
  const taxRate = await getVatRate(countryCode)
  const taxAmountUsd = round2((afterDiscountsUsd * taxRate) / 100)
  if (taxRate > 0) {
    notes.push(`Tax (${countryCode}): ${taxRate}%`)
  }

  const totalUsd = round2(afterDiscountsUsd + taxAmountUsd)

  // ── Step 6: Convert to display currency ──
  let exchangeRate = 1
  if (targetCurrency.toUpperCase() !== 'USD') {
    try {
      const admin = getAdminClient()
      const rateResult: any = await getExchangeRate(admin, 'USD', targetCurrency.toUpperCase())
      const rate = typeof rateResult === 'number' ? rateResult : (rateResult?.rate ?? 1)
      exchangeRate = rate > 0 ? rate : 1
    } catch (e) {
      console.warn('[pricing-engine] Exchange rate fetch failed, using 1.0', e)
      exchangeRate = 1
      notes.push(`Warning: live exchange rate unavailable, showing in USD`)
    }
  }

  const subtotalDisplay = round2(subtotalUsd * exchangeRate)
  const discountDisplay = round2(totalDiscountUsd * exchangeRate)
  const afterDiscountsDisplay = round2(afterDiscountsUsd * exchangeRate)
  const taxAmountDisplay = round2(taxAmountUsd * exchangeRate)
  const totalDisplay = round2(totalUsd * exchangeRate)

  return {
    seats,
    billingPeriod,
    targetCurrency: targetCurrency.toUpperCase(),
    countryCode: countryCode.toUpperCase(),

    basePriceUsd: BASE_PRICE_USD,
    subtotalUsd,
    volumeDiscountPercent,
    volumeDiscountUsd,
    annualDiscountPercent,
    annualDiscountUsd,
    couponDiscountPercent,
    couponDiscountUsd,
    totalDiscountUsd,
    afterDiscountsUsd,
    taxRate,
    taxAmountUsd,
    totalUsd,

    exchangeRate,
    subtotalDisplay,
    discountDisplay,
    afterDiscountsDisplay,
    taxAmountDisplay,
    totalDisplay,

    monthsInPeriod,
    couponApplied: coupon.valid ? couponCode : undefined,
    couponValid: coupon.valid,
    notes,
  }
}

// ─────────────────────────────────────────
// Helper: Get price preview (without DB writes)
// Used by UI to show live pricing as user picks seats/period
// ─────────────────────────────────────────

export async function getPricePreview(
  seats: number,
  billingPeriod: 'monthly' | 'annual',
  targetCurrency: string,
  countryCode: string,
  couponCode?: string
): Promise<PricingBreakdown> {
  return calculatePricing({
    seats,
    billingPeriod,
    targetCurrency,
    countryCode,
    couponCode,
  })
}
