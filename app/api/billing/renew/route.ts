/**
 * GET /api/billing/renew?token=xyz
 *
 * Public endpoint — no login required. Authenticates via signed renewal
 * token (HMAC-SHA256, 7-day TTL) embedded in the URL.
 *
 * Flow:
 *   1. Verify token → extract { companyId, seats, billingPeriod }
 *   2. Compute pricing via calculatePricing() using company's stored
 *      base_currency + country
 *   3. Create a fresh Paymob Unified Checkout intention
 *   4. 302-redirect the browser to the Paymob checkout URL
 *
 * The customer lands on Paymob payment page in one click. After they
 * pay, the existing Paymob webhook handles seat increase + invoice +
 * subscription reactivation as usual.
 *
 * NOTE: Whitelisted in lib/supabase/middleware.ts via /api/cron prefix
 * check is NOT enough — this is a different prefix. The middleware
 * already allows /api/billing/* as authenticated routes, so we must
 * either add /api/billing/renew explicitly to the public whitelist OR
 * accept that the user clicks the link, sees the login page, logs in,
 * then is redirected back. We pick the FORMER (add to whitelist) for
 * a true one-click experience.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyRenewalToken } from '@/lib/billing/renewal-token'
import { calculatePricing } from '@/lib/billing/pricing-engine'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function htmlError(message: string, status: number = 400): NextResponse {
  const html = `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"/>
<title>تعذّر التجديد</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#F3F4F6;color:#1F2937;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px}
.card{background:#fff;border-radius:14px;padding:32px;max-width:480px;box-shadow:0 1px 3px rgba(0,0,0,0.08);text-align:center}
h1{color:#DC2626;font-size:22px;margin:0 0 12px}
p{color:#4B5563;font-size:15px;line-height:1.6;margin:0 0 20px}
a{display:inline-block;background:#7C3AED;color:#fff;text-decoration:none;padding:10px 24px;border-radius:8px;font-weight:bold}
</style></head>
<body><div class="card">
<h1>⚠️ تعذّر تجديد الاشتراك</h1>
<p>${message}</p>
<a href="https://7esab.com/settings/billing">الانتقال إلى صفحة الفوترة</a>
</div></body></html>`
  return new NextResponse(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const token = url.searchParams.get('token')

    // ── 1. Verify token ──
    const payload = verifyRenewalToken(token)
    if (!payload) {
      return htmlError(
        'الرابط غير صالح أو منتهى الصلاحية. الروابط صالحة لمدة 7 أيام فقط من تاريخ الإرسال.',
        401
      )
    }

    // ── 2. Fetch company info ──
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )
    const { data: company } = await admin
      .from('companies')
      .select('id, name, base_currency, country, user_id')
      .eq('id', payload.cid)
      .maybeSingle()

    if (!company) {
      return htmlError('الشركة المرتبطة بهذا الرابط غير موجودة.', 404)
    }

    const displayCurrency = (company.base_currency as string) || 'USD'
    const countryCode = (company.country as string) || 'EG'

    // ── 3. Compute pricing ──
    let pricing
    try {
      pricing = await calculatePricing({
        seats: payload.seats,
        billingPeriod: payload.period,
        targetCurrency: displayCurrency,
        countryCode,
      })
    } catch (e: any) {
      console.error('[billing/renew] pricing failed:', e)
      return htmlError('تعذّر حساب السعر. يرجى المحاولة لاحقاً.', 500)
    }

    if (!pricing.chargeTotalEgp || pricing.chargeTotalEgp <= 0) {
      return htmlError('السعر المحسوب غير صالح.', 500)
    }

    // ── 4. Get user email for Paymob billing_data ──
    let userEmail = 'customer@7esab.com'
    let userName = 'مستخدم'
    if (company.user_id) {
      try {
        const { data: userData } = await admin.auth.admin.getUserById(company.user_id)
        userEmail = userData?.user?.email || userEmail
        userName = userData?.user?.user_metadata?.full_name || userName
      } catch { /* non-fatal */ }
    }

    // ── 5. Paymob env check ──
    const PAYMOB_SECRET_KEY = process.env.PAYMOB_SECRET_KEY
    const PAYMOB_PUBLIC_KEY = process.env.PAYMOB_PUBLIC_KEY
    const PAYMOB_INTEGRATION_ID = process.env.PAYMOB_INTEGRATION_ID
    const PAYMOB_INTEGRATION_ID_2 = process.env.PAYMOB_INTEGRATION_ID_2

    if (!PAYMOB_SECRET_KEY || !PAYMOB_PUBLIC_KEY || !PAYMOB_INTEGRATION_ID) {
      console.error('[billing/renew] Paymob env missing')
      return htmlError('مزود الدفع غير مهيأ — يرجى التواصل مع الدعم.', 500)
    }

    const paymentMethods: number[] = [parseInt(PAYMOB_INTEGRATION_ID)]
    if (PAYMOB_INTEGRATION_ID_2 && !isNaN(parseInt(PAYMOB_INTEGRATION_ID_2))) {
      paymentMethods.push(parseInt(PAYMOB_INTEGRATION_ID_2))
    }

    // ── 6. Build Paymob intention ──
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

    const amountCents = Math.round(pricing.chargeTotalEgp * 100)
    const itemDescription =
      payload.period === 'annual'
        ? `تجديد سنوى - ${payload.seats} مستخدم (خصم ${pricing.annualDiscountPercent}%)`
        : `تجديد شهرى - ${payload.seats} مستخدم`

    const intentionRes = await fetch('https://accept.paymob.com/v1/intention/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Token ${PAYMOB_SECRET_KEY}`,
      },
      body: JSON.stringify({
        amount: amountCents,
        currency: 'EGP',
        payment_methods: paymentMethods,
        items: [
          {
            name: `${payload.seats} مقعد - ${company.name || 'تجديد اشتراك'}`,
            amount: amountCents,
            description: itemDescription,
            quantity: 1,
          },
        ],
        billing_data: {
          email: userEmail,
          first_name: userName.split(' ')[0] || 'User',
          last_name: userName.split(' ')[1] || '.',
          phone_number: 'N/A',
          street: 'N/A',
          city: 'Cairo',
          country: 'EG',
        },
        extras: {
          company_id: payload.cid,
          user_id: company.user_id || null,
          additional_users: payload.seats,
          billing_period: payload.period,
          source: 'renewal_link',
          pricing_snapshot: {
            seats: pricing.seats,
            base_price_usd: pricing.basePriceUsd,
            subtotal_usd: pricing.subtotalUsd,
            volume_discount_percent: pricing.volumeDiscountPercent,
            volume_discount_usd: pricing.volumeDiscountUsd,
            annual_discount_percent: pricing.annualDiscountPercent,
            annual_discount_usd: pricing.annualDiscountUsd,
            coupon_discount_usd: pricing.couponDiscountUsd,
            coupon_code: pricing.couponApplied || null,
            total_discount_usd: pricing.totalDiscountUsd,
            tax_rate: pricing.taxRate,
            tax_amount_usd: pricing.taxAmountUsd,
            total_usd: pricing.totalUsd,
            exchange_rate: pricing.exchangeRate,
            subtotal_display: pricing.subtotalDisplay,
            total_display: pricing.totalDisplay,
            charge_currency: pricing.chargeCurrency,
            charge_exchange_rate: pricing.chargeExchangeRate,
            charge_total_egp: pricing.chargeTotalEgp,
            display_currency: pricing.targetCurrency,
            country_code: pricing.countryCode,
          },
        },
        notification_url: `${appUrl}/api/webhooks/paymob`,
        redirection_url: `${appUrl}/payment/result`,
      }),
    })

    if (!intentionRes.ok) {
      const errData = await intentionRes.json().catch(() => ({}))
      console.error('[billing/renew] Paymob intention failed:', errData)
      return htmlError(
        'تعذّر إنشاء جلسة الدفع. يرجى المحاولة لاحقاً أو التواصل مع الدعم.',
        502
      )
    }

    const intention = await intentionRes.json()
    if (!intention?.client_secret) {
      return htmlError('استجابة Paymob غير متوقعة.', 502)
    }

    const checkoutUrl = `https://accept.paymob.com/unifiedcheckout/?publicKey=${PAYMOB_PUBLIC_KEY}&clientSecret=${intention.client_secret}`

    // ── 7. Log + redirect to Paymob ──
    try {
      await admin.from('audit_logs').insert({
        action: 'renewal_link_used',
        company_id: payload.cid,
        target_table: 'billing_invoices',
        new_data: {
          seats: payload.seats,
          billing_period: payload.period,
          amount_egp: pricing.chargeTotalEgp,
          source: 'email_renewal_link',
        },
      })
    } catch { /* non-fatal */ }

    return NextResponse.redirect(checkoutUrl, { status: 302 })
  } catch (e: any) {
    console.error('[billing/renew] unhandled error:', e)
    return htmlError('حدث خطأ غير متوقع. يرجى المحاولة لاحقاً.', 500)
  }
}
