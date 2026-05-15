import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"
import { getApprovalHistory, type ApprovalReferenceType } from "@/lib/manufacturing/approval-history"

const VALID_REF_TYPES: ApprovalReferenceType[] = [
  "bom_version",
  "routing",
  "production_order",
  "material_issue",
  "product_receive",
]

/**
 * GET /api/manufacturing/approval-history
 * ?reference_type=bom_version&reference_id=UUID
 *
 * Returns the full approval history for a given record.
 * Used by BOM/Route/PO/MI pages to render the approval timeline.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) return NextResponse.json({ error: "No active company" }, { status: 400 })

    const sp = req.nextUrl.searchParams
    const referenceType = sp.get("reference_type") as ApprovalReferenceType | null
    const referenceId   = sp.get("reference_id")

    if (!referenceType || !VALID_REF_TYPES.includes(referenceType)) {
      return NextResponse.json(
        { error: `reference_type must be one of: ${VALID_REF_TYPES.join(", ")}` },
        { status: 400 }
      )
    }
    if (!referenceId) {
      return NextResponse.json({ error: "reference_id is required" }, { status: 400 })
    }

    const history = await getApprovalHistory(supabase, companyId, referenceType, referenceId)

    return NextResponse.json({ history })
  } catch (err: any) {
    console.error("[approval-history GET]", err)
    return NextResponse.json({ error: err.message ?? "Internal error" }, { status: 500 })
  }
}
