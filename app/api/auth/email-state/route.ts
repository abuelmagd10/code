/**
 * POST /api/auth/email-state
 * ---------------------------------------------------------------------------
 * يُخبر شاشة التحقق ما إذا كان البريد **مؤكَّداً بالفعل**، فتقول للعميل حالته
 * بدل أن تُعلن إرسال كود لم يُرسل.
 *
 * لماذا وُجد (٢٦ يوليو ٢٠٢٦)
 * ---------------------------
 * عميل حقيقى ظلّ ٢٥ دقيقة يضغط «إعادة إرسال الكود» ولم يفتح صفحة الدخول ولا
 * مرة. حسابه كان **مؤكَّداً منذ دقائق**، و`supabase.auth.resend` لا تُرجع خطأً
 * لحساب مؤكَّد ولا تُرسل شيئاً — فالشاشة كانت تُعلن «✓ بعتنا كود جديد» وهى لم
 * تُرسل. رسالة نجاح كاذبة تُقنع المستخدم أن الانتظار هو الحل.
 *
 * المقايضة، مذكورة صريحة
 * -----------------------
 * ليقول النظام الحالة بثقة يجب أن يفحص البريد على الخادم، فيصبح ممكناً معرفة
 * أن بريداً معيّناً مسجَّل (تعداد المستخدمين). قُلِّل الأثر بأمرين:
 *   • الدالة تُرجع **حالة واحدة**: مؤكَّد أو لا. والبريد **غير الموجود** وغير
 *     المؤكَّد **لا يُفرَّق بينهما** — فالمكشوف هو الحسابات المؤكَّدة وحدها.
 *   • **حدّ معدّل لكل IP** (٨ فى الدقيقة) يمنع المسح الجماعى للقوائم.
 * وقرار قبول هذه المقايضة اتخذه مالك المنتج بعد عرضها عليه.
 *
 * والدالة `auth_email_state` مسحوبة الصلاحية من anon و authenticated ومُتاحة
 * لمفتاح الخدمة فقط، فلا يمكن استدعاؤها من المتصفح مباشرة — هذا المسار هو
 * البوابة الوحيدة، وهو ما يحمل حدّ المعدّل.
 * ---------------------------------------------------------------------------
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const MAX_PER_MINUTE = 8

function clientIp(request: NextRequest): string {
  const fwd = request.headers.get("x-forwarded-for")
  if (fwd) return fwd.split(",")[0]!.trim()
  return request.headers.get("x-real-ip")?.trim() || "unknown"
}

export async function POST(request: NextRequest) {
  try {
    let email = ""
    try {
      const body = await request.json()
      email = String(body?.email ?? "").trim().toLowerCase()
    } catch {
      return NextResponse.json({ state: "unknown" }, { status: 400 })
    }

    if (!email.includes("@") || email.length > 320) {
      return NextResponse.json({ state: "unknown" }, { status: 400 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      // بلا مفتاح الخدمة لا نُخمِّن: تُترك الشاشة على رسالتها الغامضة الصادقة.
      return NextResponse.json({ state: "unknown" })
    }

    const admin = createClient(url, key, { auth: { persistSession: false } })

    // حدّ المعدّل قبل أى قراءة — فلا يُستغل المسار لمسح قوائم بريد.
    try {
      const { data: limit } = await admin.rpc("check_and_increment_rate_limit", {
        p_identifier: `ip:${clientIp(request)}`,
        p_route: "auth/email-state",
        p_max_requests: MAX_PER_MINUTE,
        p_window_seconds: 60,
      })
      if (limit && (limit as any).allowed === false) {
        return NextResponse.json({ state: "unknown" }, { status: 429 })
      }
    } catch {
      // فشل حدّ المعدّل لا يفتح الباب: نرفض بدل أن نسمح بلا حدّ.
      return NextResponse.json({ state: "unknown" }, { status: 503 })
    }

    const { data, error } = await admin.rpc("auth_email_state", { p_email: email })
    if (error) {
      return NextResponse.json({ state: "unknown" })
    }

    const state = data === "confirmed" ? "confirmed" : "pending"
    return NextResponse.json({ state })
  } catch {
    return NextResponse.json({ state: "unknown" })
  }
}
