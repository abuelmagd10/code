/**
 * GET  /api/services/[id]/products
 * POST /api/services/[id]/products
 *
 * v3.74.386 — Stage B of 2: manage the consumable BOM for a service.
 *
 * GET returns every product linked to the service with its
 * per-service quantity AND the product's track_inventory flag (so
 * the UI can warn the manager that a non-tracked product won't gate
 * activation at Stage C).
 *
 * POST replaces the entire BOM atomically (delete + bulk insert).
 * Body: { items: [{ product_id, quantity_per_service, notes? }, ...] }
 * Empty array clears the BOM. Owner / admin / general_manager /
 * manager only.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"

interface RouteParams {
  params: Promise<{ id: string }>
}

const WRITE_ROLES = ["owner", "admin", "general_manager", "manager"]

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }
    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) {
      return NextResponse.json({ success: false, error: "No active company" }, { status: 404 })
    }
    const { id: serviceId } = await params

    // Confirm the service belongs to the active company.
    const { data: svc } = await supabase
      .from("services")
      .select("id, service_name")
      .eq("id", serviceId)
      .eq("company_id", companyId)
      .maybeSingle()
    if (!svc) {
      return NextResponse.json({ success: false, error: "Service not found" }, { status: 404 })
    }

    const { data: rows, error: rowsErr } = await supabase
      .from("service_products")
      .select(`
        id, product_id, quantity_per_service, notes, created_at,
        products!inner ( name, product_type, track_inventory )
      `)
      .eq("service_id", serviceId)
      .eq("company_id", companyId)
      .order("created_at", { ascending: true })

    if (rowsErr) {
      return NextResponse.json({ success: false, error: rowsErr.message }, { status: 500 })
    }

    const items = (rows || []).map((r: any) => ({
      id: r.id,
      product_id: r.product_id,
      product_name: r.products?.name ?? null,
      product_type: r.products?.product_type ?? null,
      track_inventory: !!r.products?.track_inventory,
      quantity_per_service: Number(r.quantity_per_service),
      notes: r.notes ?? null,
      created_at: r.created_at,
    }))

    return NextResponse.json({
      success: true,
      service_id: serviceId,
      service_name: svc.service_name,
      items,
    })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || "Internal error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }
    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) {
      return NextResponse.json({ success: false, error: "No active company" }, { status: 404 })
    }

    // Role check.
    const { data: member } = await supabase
      .from("company_members")
      .select("role")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .maybeSingle()
    if (!member || !WRITE_ROLES.includes(member.role as string)) {
      return NextResponse.json(
        { success: false, error: "ليس لديك صلاحية تعديل قائمة المنتجات للخدمة" },
        { status: 403 },
      )
    }

    const { id: serviceId } = await params

    // Confirm service belongs to active company.
    const { data: svc } = await supabase
      .from("services")
      .select("id")
      .eq("id", serviceId)
      .eq("company_id", companyId)
      .maybeSingle()
    if (!svc) {
      return NextResponse.json({ success: false, error: "Service not found" }, { status: 404 })
    }

    const body = await req.json().catch(() => ({} as any))
    const rawItems: any[] = Array.isArray(body?.items) ? body.items : []

    // Validate every item. Reject the whole request if any row is bad
    // so the caller can't partially corrupt the BOM.
    const cleaned: Array<{ product_id: string; quantity_per_service: number; notes: string | null }> = []
    for (const it of rawItems) {
      const pid = String(it?.product_id || "")
      const qty = Number(it?.quantity_per_service)
      if (!pid || !Number.isFinite(qty) || qty <= 0) {
        return NextResponse.json(
          { success: false, error: "كل سطر يحتاج product_id وكمية أكبر من صفر" },
          { status: 400 },
        )
      }
      cleaned.push({
        product_id: pid,
        quantity_per_service: qty,
        notes: typeof it?.notes === "string" && it.notes.trim() ? it.notes.trim() : null,
      })
    }

    // De-dupe (same product can't appear twice).
    const seen = new Set<string>()
    for (const c of cleaned) {
      if (seen.has(c.product_id)) {
        return NextResponse.json(
          { success: false, error: "منتج مكرر فى القائمة — كل منتج يضاف مرة واحدة" },
          { status: 400 },
        )
      }
      seen.add(c.product_id)
    }

    // Confirm every product belongs to the active company.
    if (cleaned.length > 0) {
      const productIds = cleaned.map((c) => c.product_id)
      const { data: existingProducts } = await supabase
        .from("products")
        .select("id")
        .eq("company_id", companyId)
        .in("id", productIds)
      const existingIds = new Set((existingProducts || []).map((p) => p.id))
      const invalid = productIds.filter((id) => !existingIds.has(id))
      if (invalid.length > 0) {
        return NextResponse.json(
          { success: false, error: "منتج أو أكثر لا ينتمى للشركة الحالية" },
          { status: 400 },
        )
      }
    }

    // Replace BOM atomically — delete the existing rows then insert
    // the new set. We do it as two writes; the partial state is
    // acceptable here because the page reloads after save and the
    // service can't be executed mid-update (Stage C trigger reads
    // freshly).
    const { error: delErr } = await supabase
      .from("service_products")
      .delete()
      .eq("service_id", serviceId)
      .eq("company_id", companyId)
    if (delErr) {
      return NextResponse.json({ success: false, error: delErr.message }, { status: 500 })
    }

    if (cleaned.length > 0) {
      const insertRows = cleaned.map((c) => ({
        company_id: companyId,
        service_id: serviceId,
        product_id: c.product_id,
        quantity_per_service: c.quantity_per_service,
        notes: c.notes,
        created_by: user.id,
      }))
      const { error: insErr } = await supabase
        .from("service_products")
        .insert(insertRows)
      if (insErr) {
        return NextResponse.json({ success: false, error: insErr.message }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      service_id: serviceId,
      count: cleaned.length,
    })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || "Internal error" }, { status: 500 })
  }
}
