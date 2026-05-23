import { NextRequest } from "next/server"
import { requireOwnerOrAdmin } from "@/lib/api-security"
import { apiError, apiSuccess, internalError, HTTP_STATUS } from "@/lib/api-error-handler"
import { getSeatStatus, SEAT_PRICE_EGP } from "@/lib/billing/seat-service"
import { calculatePricing } from "@/lib/billing/pricing-engine"

// ─────────────────────────────────────────
// GET /api/billing/seats
// Returns current seat status for the company
// ─────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { user, companyId, error } = await requireOwnerOrAdmin(req)
    if (error) return error
    if (!companyId) return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على الشركة", "company_not_found")

    const status = await getSeatStatus(companyId)
    return apiSuccess({ ...status, price_per_seat_egp: SEAT_PRICE_EGP })
  } catch (e: any) {
    return internalError("خطأ في جلب حالة المقاعد", e.message)
  }
}

// ─────────────────────────────────────────
// POST /api/billing/seats
// Initiates a Paymob checkout to purchase additional seats
// Pricing uses lib/billing/pricing-engine.ts (multi-currency + EGP charge)
// Actual seat increase happens in the webhook after payment confirmation
// ─────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { user, companyId, error } = await requireOwnerOrAdmin(req)
    if (error) return error
    if (!companyId || !user) {
      return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على الشركة", "company_not_found")
    }

    const body = await req.json()
    const { seats, billing_period, coupon } = body as {
      seats?: number
      billing_period?: "monthly" | "annual"
      coupon?: string
    }

    if (!seats || seats < 1 || seats > 1000) {
      return apiError(HTTP_STATUS.BAD_REQUEST, "عدد المقاعد يجب أن يكون بين 1 و1000", "invalid_seats_count")
    }

    const billingPeriod: "monthly" | "annual" =
      billing_period === "annual" ? "annual" : "monthly"

    const PAYMOB_SECRET_KEY = process.env.PAYMOB_SECRET_KEY!
    const PAYMOB_PUBLIC_KEY = process.env.PAYMOB_PUBLIC_KEY!
    const PAYMOB_INTEGRATION_ID = process.env.PAYMOB_INTEGRATION_ID!
    const PAYMOB_INTEGRATION_ID_2 = process.env.PAYMOB_INTEGRATION_ID_2 // optional second integration

    if (!PAYMOB_SECRET_KEY || !PAYMOB_PUBLIC_KEY || !PAYMOB_INTEGRATION_ID) {
      console.error("[billing/seats] Missing Paymob env vars:", {
        hasSecretKey: !!PAYMOB_SECRET_KEY,
        hasPublicKey: !!PAYMOB_PUBLIC_KEY,
        hasIntegrationId: !!PAYMOB_INTEGRATION_ID,
      })
      return internalError("مزود الدفع غير مهيأ — يرجى التواصل مع الدعم", "paymob_not_configured")
    }

    // Build list of payment methods (primary + optional secondary)
    const paymentMethods: number[] = [parseInt(PAYMOB_INTEGRATION_ID)]
    if (PAYMOB_INTEGRATION_ID_2 && !isNaN(parseInt(PAYMOB_INTEGRATION_ID_2))) {
      paymentMethods.push(parseInt(PAYMOB_INTEGRATION_ID_2))
    }

    // Get user email, name, and company info from Supabase
    const { createClient } = await import("@supabase/supabase-js")
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data: userData } = await admin.auth.admin.getUserById(user.id)
    const { data: company } = await admin
      .from("companies")
      .select("name, base_currency, country")
      .eq("id", companyId)
      .single()

    const userEmail = userData?.user?.email || "customer@7esab.com"
    const userName = userData?.user?.user_metadata?.full_name || "مستخدم"
    const companyName = company?.name || "شركة"
    const displayCurrency = (company?.base_currency as string) || "USD"
    const countryCode = (company?.country as string) || "EG"

    // ── Enterprise pricing v2.0 — live FX + VAT + volume + annual discounts ──
    // Source of truth for charged amount in EGP (Paymob requirement)
    let pricing
    try {
      pricing = await calculatePricing({
        seats,
        billingPeriod,
        targetCurrency: displayCurrency,
        countryCode,
        couponCode: coupon,
      })
    } catch (pricingErr: any) {
      console.error("[billing/seats] pricing-engine error:", pricingErr)
      return internalError("تعذر حساب السعر — يرجى المحاولة لاحقاً", "pricing_failed")
    }

    if (!pricing.chargeTotalEgp || pricing.chargeTotalEgp <= 0) {
      return internalError("السعر المحسوب غير صالح", "invalid_calculated_price")
    }

    // Paymob expects piasters (1 EGP = 100 piasters); round to int to avoid decimals
    const amountCents = Math.round(pricing.chargeTotalEgp * 100)

    // Build Paymob Unified Checkout intention
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")

    const itemDescription = billingPeriod === "annual"
      ? `اشتراك سنوي - ${seats} مستخدم (خصم ${pricing.annualDiscountPercent}%)`
      : `اشتراك شهري - ${seats} مستخدم`

    const intentionRes = await fetch("https://accept.paymob.com/v1/intention/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Token ${PAYMOB_SECRET_KEY}`,
      },
      body: JSON.stringify({
        amount: amountCents,
        currency: "EGP",
        payment_methods: paymentMethods,
        items: [{
          name: `${seats} مقعد - ${companyName}`,
          amount: amountCents,
          description: itemDescription,
          quantity: 1,
        }],
        billing_data: {
          email: userEmail,
          first_name: userName.split(" ")[0] || "User",
          last_name: userName.split(" ")[1] || ".",
          phone_number: "N/A",
          street: "N/A",
          city: "Cairo",
          country: "EG",
        },
        extras: {
          company_id: companyId,
          user_id: user.id,
          additional_users: seats,
          billing_period: billingPeriod,
          coupon_code: pricing.couponApplied || null,
          // Pricing snapshot — used by webhook to create accurate invoice
          pricing_snapshot: {
            seats: pricing.seats,
            base_price_usd: pricing.basePriceUsd,
            subtotal_usd: pricing.subtotalUsd,
            total_discount_usd: pricing.totalDiscountUsd,
            tax_rate: pricing.taxRate,
            tax_amount_usd: pricing.taxAmountUsd,
            total_usd: pricing.totalUsd,
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
      const errData = await intentionRes.json()
      console.error("[billing/seats] Paymob intention error:", JSON.stringify(errData))
      // DEBUG: expose Paymob error temporarily
      return internalError(
        `Paymob: ${JSON.stringify(errData)}`,
        "paymob_intention_failed"
      )
    }

    const intention = await intentionRes.json()

    return apiSuccess({
      client_secret: intention.client_secret,
      public_key: PAYMOB_PUBLIC_KEY,
      // Paymob always charges in EGP
      amount_egp: pricing.chargeTotalEgp,
      // Display amount in user's currency (for receipts/confirmations)
      amount_display: pricing.totalDisplay,
      display_currency: pricing.targetCurrency,
      seats,
      billing_period: billingPeriod,
      pricing: {
        subtotal_usd: pricing.subtotalUsd,
        total_discount_usd: pricing.totalDiscountUsd,
        tax_amount_usd: pricing.taxAmountUsd,
        total_usd: pricing.totalUsd,
        charge_total_egp: pricing.chargeTotalEgp,
        charge_exchange_rate: pricing.chargeExchangeRate,
        volume_discount_percent: pricing.volumeDiscountPercent,
        annual_discount_percent: pricing.annualDiscountPercent,
        coupon_applied: pricing.couponApplied || null,
        tax_rate: pricing.taxRate,
      },
      checkout_url: `https://accept.paymob.com/unifiedcheckout/?publicKey=${PAYMOB_PUBLIC_KEY}&clientSecret=${intention.client_secret}`,
    })
  } catch (e: any) {
    return internalError("خطأ في إنشاء جلسة الدفع", e.message)
  }
}
