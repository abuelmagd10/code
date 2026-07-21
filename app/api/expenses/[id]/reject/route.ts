/**
 * v3.74.779 — reject an expense on the server.
 *
 * Rejection previously had NO server-side authorization at all. The page hid
 * the button from anyone who was not an approver, and that was the entire
 * control: any authenticated member could reject any expense by calling
 * PostgREST directly. The role check now lives in the database function, where
 * hiding a button cannot substitute for it.
 *
 * Notifications remain in the page, unchanged — see the approve route for why.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) {
      return NextResponse.json({ error: "Company context missing" }, { status: 400 })
    }

    let reason = ""
    try {
      const body = await request.json()
      reason = String(body?.reason ?? "").trim()
    } catch {
      // Empty or unparseable body — the function rejects a blank reason anyway,
      // so fall through and let it answer consistently.
    }

    const { data, error } = await supabase.rpc("reject_expense_atomic", {
      p_expense_id: id,
      p_company_id: companyId,
      p_reason: reason,
      p_actor_id: user.id,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const result = (data ?? {}) as Record<string, any>
    if (!result.success) {
      const status = result.error === "FORBIDDEN" ? 403
        : result.error === "EXPENSE_NOT_FOUND" ? 404
        : 400
      return NextResponse.json(
        { error: result.error, message: result.message ?? result.error },
        { status }
      )
    }

    return NextResponse.json({
      success: true,
      message: result.already_rejected ? "المصروف مرفوض بالفعل" : "تَمَّ رفض المصروف",
      ...result,
    })
  } catch (error: any) {
    console.error("[EXPENSE_REJECT]", error)
    return NextResponse.json({ error: error?.message ?? "Unexpected error" }, { status: 500 })
  }
}
