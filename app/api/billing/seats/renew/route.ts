/**
 * POST /api/billing/seats/renew
 * v3.74.382 — Stage 5 of 6: seat license renewal.
 *
 * Owner picks one of three modes:
 *   1. mode='one'           + seat_license_ids: [singleId]
 *   2. mode='many'          + seat_license_ids: [id1, id2, ...]
 *   3. mode='all_expired'   (server resolves the list)
 *
 * For each, we:
 *   - validate the ids belong to the active company
 *   - run pricing through the same engine the buy flow uses
 *     (volume discount applies to the COUNT being renewed)
 *   - if total is zero (FREE coupon), call renewSeatLicenses directly
 *   - else build a Paymob intention with extras.action='renew' and
 *     extras.seat_license_ids so the webhook knows to renew instead
 *     of bumping total_paid_seats
 */
import { NextRequest } from "next/server"
import { requireOwnerOrAdmin } from "@/lib/api-security"
import { apiError, apiSuccess, internalError, HTTP_STATUS } from "@/lib/api-error-handler"
import {
  renewSeatLicenses,
  getExpiredSeatLicenseIds,
} from "@/lib/billing/seat-service"
import { calculatePricing } from "@/lib/billing/pricing-engine"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  try {
    const { user, companyId, member, error } = await requireOwnerOrAdmin(req)
    if (error) return error
    if (!companyId || !user) {
      return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على الشركة", "company_not_found")
    }

    // Owner-only (renewal is a billing operation; admin can view but
    // shouldn't initiate payment).
    if (member?.role !== "owner") {
      return apiError(HTTP_STATUS.FORBIDDEN, "المالك فقط يمكنه تجديد المقاعد", "owner_only_action")
    }

    const body = await req.json().catch(() => ({} as any))
    const mode = String(body?.mode || "").toLowerCase()
    let seatLicenseIds: string[] = Array.isArray(body?.seat_license_ids)
      ? body.seat_license_ids.filter((x: any) => typeof x === "string" && x.length > 0)
      : []
    const billingPeriod: "monthly" | "annual" =
      body?.billing_period === "annual" ? "annual" : "monthly"
    const coupon: string | undefined = typeof body?.coupon === "string" ? body.coupon : undefined

    // Resolve "all_expired" by asking the DB for the current list.
    if (mode === "all_expired") {
      seatLicenseIds = await getExpiredSeatLicenseIds(companyId)
      if (seatLicenseIds.length === 0) {
        return apiError(
          HTTP_STATUS.BAD_REQUEST,
          "لا يوجد مقاعد منتهية للتجديد",
          "no_expired_seats",
        )
      }
    }

    if (!Array.isArray(seatLicenseIds) || seatLicenseIds.length === 0) {
      return apiError(
        HTTP_STATUS.BAD_REQUEST,
        "اختر مقعداً واحداً على الأقل للتجديد",
        "no_seats_selected",
      )
    }

    // Safety: confirm every id belongs to this company. Anything that
    // doesn't is silently dropped (could be a stale UI selection after
    // a deletion). If nothing survives, the operation is rejected.
    const { createClient } = await import("@supabase/supabase-js")
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    )
    const { data: validRows } = await admin
      .from("company_seat_licenses")
      .select("id, seat_number")
      .eq("company_id", companyId)
      .in("id", seatLicenseIds)
    const validIds = (validRows || []).map((r) => r.id as string)
    if (validIds.length === 0) {
      return apiError(
        HTTP_STATUS.BAD_REQUEST,
        "المقاعد المختارة لا تنتمى للشركة الحالية",
        "invalid_seat_ids",
      )
    }

    const seatsCount = validIds.length

    // ── Pricing ──
    const { data: company } = await admin
      .from("companies")
      .select("name, base_currency, country")
      .eq("id", companyId)
      .single()
    const displayCurrency = (company?.base_currency as string) || "USD"
    const countryCode = (company?.country as string) || "EG"
    const companyName = company?.name || "شركة"

    let pricing
    try {
      pricing = await calculatePricing({
        seats: seatsCount,
        billingPeriod,
        targetCurrency: displayCurrency,
        countryCode,
        couponCode: coupon,
      })
    } catch (pricingErr: any) {
      console.error("[billing/seats/renew] pricing-engine error:", pricingErr)
      return internalError("تعذر حساب السعر — يرجى المحاولة لاحقاً", "pricing_failed")
    }

    // ── Free-grant path (coupon makes total 0) ──
    if (pricing.chargeTotalEgp === 0 && pricing.couponApplied) {
      const result = await renewSeatLicenses(
        companyId,
        validIds,
        billingPeriod,
        null,
        user.id,
      )
      if (!result.success) {
        return internalError(result.error || "تعذر تجديد المقاعد", "renew_failed")
      }
      return apiSuccess({
        free_grant: true,
        renewed: result.renewed_count,
        license_ids: result.license_ids,
        coupon_applied: pricing.couponApplied,
        billing_period: billingPeriod,
        redirect_url: "/settings/seats?renewed=success",
      })
    }

    if (!pricing.chargeTotalEgp || pricing.chargeTotalEgp <= 0) {
      return internalError("السعر المحسوب غير صالح", "invalid_calculated_price")
    }

    // ── Paymob intention (same shape as buy flow) ──
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

    const { data: userData } = await admin.auth.admin.getUserById(user.id)
    const userEmail = userData?.user?.email || "customer@7esab.com"
    const userName = userData?.user?.user_metadata?.full_name || "مستخدم"

    const amountCents = Math.round(pricing.chargeTotalEgp * 100)
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
    const itemDescription = billingPeriod === "annual"
      ? `تجديد سنوى - ${seatsCount} مقعد (خصم ${pricing.annualDiscountPercent}%)`
      : `تجديد شهرى - ${seatsCount} مقعد`

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
          name: `تجديد ${seatsCount} مقعد - ${companyName}`,
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
          // v3.74.382 — webhook differentiates buy vs renew on action.
          action: "renew",
          company_id: companyId,
          user_id: user.id,
          seat_license_ids: validIds,
          renew_count: seatsCount,
          billing_period: billingPeriod,
          coupon_code: pricing.couponApplied || null,
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
            // Renewal metadata for the invoice description
            invoice_kind: "renewal",
            renew_count: seatsCount,
          },
        },
        notification_url: `${appUrl}/api/webhooks/paymob`,
        redirection_url: `${appUrl}/payment/result`,
      }),
    })

    if (!intentionRes.ok) {
      const errData = await intentionRes.json()
      console.error("[billing/seats/renew] Paymob intention error:", JSON.stringify(errData))
      return internalError(`Paymob: ${JSON.stringify(errData)}`, "paymob_intention_failed")
    }

    const intention = await intentionRes.json()

    return apiSuccess({
      client_secret: intention.client_secret,
      public_key: PAYMOB_PUBLIC_KEY,
      amount_egp: pricing.chargeTotalEgp,
      amount_display: pricing.totalDisplay,
      display_currency: pricing.targetCurrency,
      renew_count: seatsCount,
      seat_license_ids: validIds,
      billing_period: billingPeriod,
      checkout_url: `https://accept.paymob.com/unifiedcheckout/?publicKey=${PAYMOB_PUBLIC_KEY}&clientSecret=${intention.client_secret}`,
    })
  } catch (e: any) {
    return internalError("خطأ فى إنشاء جلسة تجديد المقاعد", e.message)
  }
}
