import { NextRequest } from "next/server"
import { requireOwnerOrAdmin } from "@/lib/api-security"
import { apiError, apiSuccess, internalError, HTTP_STATUS } from "@/lib/api-error-handler"
import { getSeatStatus, SEAT_PRICE_EGP } from "@/lib/billing/seat-service"

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

    if (!seats || seats < 1 || seats > 50) {
      return apiError(HTTP_STATUS.BAD_REQUEST, "عدد المقاعد يجب أن يكون بين 1 و50", "invalid_seats_count")
    }

    const amountCents = seats * SEAT_PRICE_EGP * 100 // Paymob uses piasters
    const PAYMOB_SECRET_KEY = process.env.PAYMOB_SECRET_KEY!
    const PAYMOB_PUBLIC_KEY = process.env.PAYMOB_PUBLIC_KEY!
    const PAYMOB_INTEGRATION_ID = process.env.PAYMOB_INTEGRATION_ID!

    if (!PAYMOB_SECRET_KEY || !PAYMOB_PUBLIC_KEY) {
      return internalError("مزود الدفع غير مهيأ", "paymob_not_configured")
    }

    // Get user email and name from Supabase
    const { createClient } = await import("@supabase/supabase-js")
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data: userData } = await admin.auth.admin.getUserById(user.id)
    const { data: company } = await admin.from("companies").select("name").eq("id", companyId).single()

    const userEmail = userData?.user?.email || "customer@7esab.com"
    const userName = userData?.user?.user_metadata?.full_name || "مستخدم"
    const companyName = company?.name || "شركة"

    // Build Paymob Unified Checkout intention
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")

    const intentionRes = await fetch("https://accept.paymob.com/v1/intention/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Token ${PAYMOB_SECRET_KEY}`,
      },
      body: JSON.stringify({
        amount: amountCents,
        currency: "EGP",
        payment_methods: [parseInt(PAYMOB_INTEGRATION_ID)],
        items: [{
          name: `${seats} مقعد إضافي - ${companyName}`,
          amount: amountCents,
          description: `اشتراك شهري - ${seats} مستخدم إضافي × ${SEAT_PRICE_EGP} جنيه`,
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
        },
        notification_url: `${appUrl}/api/webhooks/paymob`,
        redirection_url: `${appUrl}/payment/result`,
      }),
    })

    if (!intentionRes.ok) {
      const errData = await intentionRes.json()
      console.error("[billing/seats] Paymob intention error:", errData)
      return internalError("فشل في إنشاء طلب الدفع", "paymob_intention_failed")
    }

    const intention = await intentionRes.json()

    return apiSuccess({
      client_secret: intention.client_secret,
      public_key: PAYMOB_PUBLIC_KEY,
      amount_egp: seats * SEAT_PRICE_EGP,
      seats,
      checkout_url: `https://accept.paymob.com/unifiedcheckout/?publicKey=${PAYMOB_PUBLIC_KEY}&clientSecret=${intention.client_secret}`,
    })
  } catch (e: any) {
    return internalError("خطأ في إنشاء جلسة الدفع", e.message)
  }
}
