/**
 * GET  /api/services/[id]/products
 * POST /api/services/[id]/products
 *
 * v3.74.673 — UNIFIED consumed-products source.
 *
 * The consumed products of a service are stored ONCE, in the bundle of the
 * service's catalog product (`product_bundle_items` where parent_product_id =
 * services.product_catalog_id). That bundle is the ONLY thing the booking
 * execution engine reads (get_booking_line_additions → bundle_mandatory /
 * bundle_optional). The old `service_products` table was a parallel store that
 * the engine ignored — anything saved there was NEVER deducted. This route now
 * reads/writes the bundle, so:
 *   - the section shows the products actually linked (also editable from the
 *     products page bundle editor), and
 *   - additions made here really get deducted on execution.
 *
 * Consumed materials are written with auto_deduct_inventory = true and
 * price_handling = 'included' (absorbed in the service price, not charged on
 * top). is_optional carries the mandatory/optional choice.
 *
 * GET  → { items:[{ product_id, quantity_per_service, is_optional, ... }], catalog_product_id, no_catalog? }
 * POST → replaces the bundle. Body: { items:[{ product_id, quantity_per_service, is_optional? }] }
 * Owner / admin / general_manager / manager only.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"

interface RouteParams {
  params: Promise<{ id: string }>
}

const WRITE_ROLES = ["owner", "admin", "general_manager", "manager"]

async function loadServiceCatalog(supabase: any, serviceId: string, companyId: string) {
  const { data: svc } = await supabase
    .from("services")
    .select("id, service_name, product_catalog_id")
    .eq("id", serviceId)
    .eq("company_id", companyId)
    .maybeSingle()
  return svc as { id: string; service_name: string; product_catalog_id: string | null } | null
}

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

    const svc = await loadServiceCatalog(supabase, serviceId, companyId)
    if (!svc) {
      return NextResponse.json({ success: false, error: "Service not found" }, { status: 404 })
    }

    // v3.74.676 — tell the UI whether THIS user may edit, so roles without
    // permission see the list read-only instead of a save that 403s.
    const { data: member } = await supabase
      .from("company_members")
      .select("role")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .maybeSingle()
    const canEdit = !!member && WRITE_ROLES.includes(String(member.role || ""))

    // No catalog product → no bundle can exist. Tell the UI so it can explain.
    if (!svc.product_catalog_id) {
      return NextResponse.json({
        success: true,
        service_id: serviceId,
        service_name: svc.service_name,
        catalog_product_id: null,
        no_catalog: true,
        can_edit: canEdit,
        items: [],
      })
    }

    const { data: rows, error: rowsErr } = await supabase
      .from("product_bundle_items")
      .select(`
        id, child_product_id, quantity, is_optional, auto_deduct_inventory, price_handling,
        created_at,
        child:products!product_bundle_items_child_product_id_fkey ( name, product_type, track_inventory )
      `)
      .eq("parent_product_id", svc.product_catalog_id)
      .eq("company_id", companyId)
      .order("created_at", { ascending: true })

    if (rowsErr) {
      return NextResponse.json({ success: false, error: rowsErr.message }, { status: 500 })
    }

    const items = (rows || []).map((r: any) => ({
      id: r.id,
      product_id: r.child_product_id,
      product_name: r.child?.name ?? null,
      product_type: r.child?.product_type ?? null,
      track_inventory: !!r.child?.track_inventory,
      quantity_per_service: Number(r.quantity),
      is_optional: !!r.is_optional,
      created_at: r.created_at,
    }))

    return NextResponse.json({
      success: true,
      service_id: serviceId,
      service_name: svc.service_name,
      catalog_product_id: svc.product_catalog_id,
      can_edit: canEdit,
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

    // Role check — same governance as before (management only).
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

    const svc = await loadServiceCatalog(supabase, serviceId, companyId)
    if (!svc) {
      return NextResponse.json({ success: false, error: "Service not found" }, { status: 404 })
    }
    const parentId = svc.product_catalog_id
    if (!parentId) {
      return NextResponse.json(
        { success: false, error: "الخدمة غير مرتبطة بصنف كتالوج، فلا يمكن ربط منتجات مستهلكة بها. اربط الخدمة بصنف أولاً." },
        { status: 400 },
      )
    }

    const body = await req.json().catch(() => ({} as any))
    const rawItems: any[] = Array.isArray(body?.items) ? body.items : []

    // Validate every item; reject the whole request if any row is bad.
    const cleaned: Array<{ product_id: string; quantity: number; is_optional: boolean }> = []
    for (const it of rawItems) {
      const pid = String(it?.product_id || "")
      const qty = Number(it?.quantity_per_service)
      if (!pid || !Number.isFinite(qty) || qty <= 0) {
        return NextResponse.json(
          { success: false, error: "كل سطر يحتاج منتجاً وكمية أكبر من صفر" },
          { status: 400 },
        )
      }
      if (pid === parentId) {
        return NextResponse.json(
          { success: false, error: "لا يمكن ربط صنف الخدمة بنفسه كمنتج مستهلك" },
          { status: 400 },
        )
      }
      cleaned.push({ product_id: pid, quantity: qty, is_optional: !!it?.is_optional })
    }

    // De-dupe.
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
        .select("id, item_type")
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
      // v3.74.674 — consumed items must be PRODUCTS, never services.
      const serviceHits = (existingProducts || []).filter((p: any) => String(p.item_type || "") === "service")
      if (serviceHits.length > 0) {
        return NextResponse.json(
          { success: false, error: "لا يمكن إضافة خدمة كمنتج مستهلك — اختر منتجات فقط (مشتراة/مصنعة/مواد خام)" },
          { status: 400 },
        )
      }
    }

    // Replace the bundle for this catalog product. Consumed materials are
    // auto-deducted and price-included (absorbed in the service price).
    const { error: delErr } = await supabase
      .from("product_bundle_items")
      .delete()
      .eq("parent_product_id", parentId)
      .eq("company_id", companyId)
    if (delErr) {
      return NextResponse.json({ success: false, error: delErr.message }, { status: 500 })
    }

    if (cleaned.length > 0) {
      const insertRows = cleaned.map((c, idx) => ({
        company_id:            companyId,
        parent_product_id:     parentId,
        child_product_id:      c.product_id,
        quantity:              c.quantity,
        is_optional:           c.is_optional,
        auto_deduct_inventory: true,
        price_handling:        "included",
        display_order:         idx,
        created_by:            user.id,
        updated_by:            user.id,
      }))
      const { error: insErr } = await supabase
        .from("product_bundle_items")
        .insert(insertRows)
      if (insErr) {
        return NextResponse.json({ success: false, error: insErr.message }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      service_id: serviceId,
      catalog_product_id: parentId,
      count: cleaned.length,
    })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || "Internal error" }, { status: 500 })
  }
}
