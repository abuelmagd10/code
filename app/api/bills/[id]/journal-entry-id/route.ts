/**
 * GET /api/bills/[id]/journal-entry-id
 * يعيد معرف قيد اليومية المرتبط بفاتورة المشتريات (reference_id = bill id)
 * باستخدام service role لتجاوز RLS — بعد التحقق من الحوكمة على مستوى الفاتورة/الفرع.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { enforceGovernance } from "@/lib/governance-middleware"

function getAdminClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  if (!url || !serviceKey) return null
  return createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } })
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: billId } = await params
    const governance = await enforceGovernance()

    const admin = getAdminClient()
    if (!admin) {
      return NextResponse.json(
        { error: "Server configuration: missing service role" },
        { status: 500 }
      )
    }

    const { data: bill, error: billErr } = await admin
      .from("bills")
      .select("id, company_id, branch_id")
      .eq("id", billId)
      .eq("company_id", governance.companyId)
      .maybeSingle()

    if (billErr || !bill) {
      return NextResponse.json({ error: "Bill not found" }, { status: 404 })
    }

    if (
      governance.branchIds.length > 0 &&
      bill.branch_id &&
      !governance.branchIds.includes(bill.branch_id)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { data: je, error: jeErr } = await admin
      .from("journal_entries")
      .select("id")
      .eq("company_id", governance.companyId)
      .eq("reference_id", billId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (jeErr) {
      return NextResponse.json({ error: jeErr.message }, { status: 500 })
    }

    return NextResponse.json({ journal_entry_id: je?.id ?? null })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    const status = msg.includes("Unauthorized") ? 401 : 403
    return NextResponse.json({ error: msg }, { status })
  }
}
