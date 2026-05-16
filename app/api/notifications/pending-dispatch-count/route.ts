/**
 * GET /api/notifications/pending-dispatch-count
 * يُعيد عدد Material Issues بحالة management_approved (Stage 2 — بانتظار المخزن)
 * يستخدمه Sidebar Badge لمسؤولي المخازن
 */
import { NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ count: 0 }, { status: 200 })
    }

    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) {
      return NextResponse.json({ count: 0 }, { status: 200 })
    }

    const admin = createServiceClient()
    const { data, error } = await admin.rpc("get_pending_dispatch_count", {
      p_company_id: companyId,
      p_user_id:    user.id,
    })

    if (error) {
      console.error("[pending-dispatch-count]", error.message)
      return NextResponse.json({ count: 0 }, { status: 200 })
    }

    return NextResponse.json({ count: Number(data ?? 0) }, { status: 200 })
  } catch {
    return NextResponse.json({ count: 0 }, { status: 200 })
  }
}
