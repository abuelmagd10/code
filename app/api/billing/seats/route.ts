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
    const { seats } = body

    if (!seats || seats < 1 || seats > 1000) {
      return apiError(HTTP_STATUS.BAD_REQUEST, "عدد المقاعد يجب أن يكون بين 1 و1000", "invalid_seats_count")
    }

    const billingPeriod = (body.billing_period === 'annual' ? 'annual' : 'monthly') as 'monthly' | 'annual'
    const couponCode = body.coupon || undefined

    // Get company info (currency + country for pricing)
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
    const displayCurrency = company?.base_currency || 'EGP'
    const countryCode = company?.country || 'EG'

    // ✅ v3.29.1: Use pricing engine to get final EGP amount (Paymob charges EGP only)
    const pricing = await calculatePricing({
      seats,
      billingPeriod,
      targetCurrency: displayCurrency,
      countryCode,
      couponCode,
    })

    // Paymob amount in piasters (1 EGP = 100 piasters)
    const amountCents = Math.round(pricing.chargeTotalEgp * 100)

    if (amountCents < 100) {
      return apiError(HTTP_STATUS.BAD_REQUEST, "المبلغ صغير جداً للدفع", "amount_too_small")
    }

    const PAYMOB_SECRET_KEY = process.env.PAYMOB_SECRET_KEY!
    const PAYMOB_PUBLIC_KEY = process.env.PAYMOB_PUBLIC_KEY!
    const PAYMOB_INTEGRATION_ID = process.env.PAYMOB_INTEGRATION_ID!
    const PAYMOB_INTEGRATION_ID_2 = process.env.PAYMOB_INTEGRATION_ID_2

    if (!PAYMOB_SECRET_KEY || !PAYMOB_PUBLIC_KEY || !PAYMOB_INTEGRATION_ID) {
      return internalError("مزود الدفع غير مهيأ — يرجى التواصل مع الدعم", "paymob_not_configured")
    }

    const paymentMethods: number[] = [parseInt(PAYMOB_INTEGRATION_ID)]
    if (PAYMOB_INTEGRATION_ID_2 && !isNaN(parseInt(PAYMOB_INTEGRATION_ID_2))) {
      paymentMethods.push(parseInt(PAYMOB_INTEGRATION_ID_2))
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")

    // Build description showing both currencies
    const itemDesc = displayCurrency === 'EGP'
      ? `${seats} مقعد × ${pricing.afterDiscountsDisplay / seats / pricing.monthsInPeriod} EGP/${billingPeriod === 'annual' ? 'سنة' : 'شهر'}`
      : `${seats} مقعد × $${pricing.basePriceUsd} USD (= ${pricing.chargeTotalEgp.toFixed(2)} EGP)`

    const intentionRes = await fetch("https://accept.paymob.com/v1/intention/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Token ${PAYMOB_SECRET_KEY}`,
      },
      body: JSON.stringify({
        amount: amountCents,
        currency: "EGP",  // ⚠️ Paymob merchant account is EGP-only
        payment_methods: paymentMethods,
        items: [{
          name: `${seats} مقعد إضافي - ${companyName}`,
          amount: amountCents,
          description: itemDesc,
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
          display_currency: displayCurrency,
          display_total: pricing.totalDisplay,
          charge_total_egp: pricing.chargeTotalEgp,
          exchange_rate_usd_to_egp: pricing.chargeExchangeRate,
          coupon_code: couponCode,
          volume_discount_percent: pricing.volumeDiscountPercent,
          tax_rate: pricing.taxRate,
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
      seats,
      billing_period: billingPeriod,
      // Display amounts (for user reference)
      display_currency: displayCurrency,
      display_total: pricing.totalDisplay,
      // Actual charge (Paymob)
      charge_currency: 'EGP',
      charge_total_egp: pricing.chargeTotalEgp,
      exchange_rate: pricing.chargeExchangeRate,
      // Discounts applied
      volume_discount_percent: pricing.volumeDiscountPercent,
      annual_discount_percent: pricing.annualDiscountPercent,
      coupon_applied: pricing.couponApplied,
      tax_rate: pricing.taxRate,
      checkout_url: `https://accept.paymob.com/unifiedcheckout/?publicKey=${PAYMOB_PUBLIC_KEY}&clientSecret=${intention.client_secret}`,
    })
  } catch (e: any) {
    return internalError("خطأ في إنشاء جلسة الدفع", e.message)
  }
}
