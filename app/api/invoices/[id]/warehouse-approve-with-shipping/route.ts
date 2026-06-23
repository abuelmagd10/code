/**
 * v3.74.305 — Warehouse approve + create shipment via shipping provider API.
 *
 * This is a strict super-set of /api/invoices/[id]/warehouse-approve, with
 * one extra step BEFORE the existing approval logic runs:
 *
 *   1. Read invoice + customer + provider.
 *   2. Validate the customer has a complete delivery address.
 *   3. Validate the provider is API-integrated (auth_type set & code is
 *      one of our supported adapters).
 *   4. Build a CreateShipmentRequest and call the provider's adapter.
 *   5. If the provider returns an error: STOP. We do NOT touch inventory,
 *      we do NOT post a COGS journal entry, and the invoice stays
 *      warehouse_status=pending. The caller (dispatch-approvals page)
 *      will surface a friendly explanation + offer the manual-approve
 *      fallback. This is the explicit contract the owner asked for: a
 *      failed Bosta call leaves the system in its prior, stable state.
 *   6. If the provider succeeds: insert the shipment row with the
 *      returned tracking_number + label_url, then call the SAME
 *      SalesInvoiceWarehouseCommandService.approveDelivery the regular
 *      approve route uses. Inventory + COGS happen there. Idempotency
 *      remains keyed on the same Idempotency-Key header.
 *
 * The new endpoint preserves all existing audit / archive behavior of
 * the regular approve route.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"
import {
  SalesInvoiceWarehouseCommandError,
  SalesInvoiceWarehouseCommandService,
} from "@/lib/services/sales-invoice-warehouse-command.service"
import { archiveApprovalNotificationsForRecord } from "@/lib/notifications/archive-on-action"
import { createShippingAdapter, type CreateShipmentRequest } from "@/lib/shipping/index"

// Adapters with real API integration. Provider codes outside this set
// fall through to ManualAdapter and the new button shouldn't have been
// shown at all — but we guard server-side too.
const API_INTEGRATED_PROVIDER_CODES = new Set(["bosta", "aramex"])

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: invoiceId } = await params

  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) {
      return NextResponse.json({ error: "Company context missing" }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))

    // ── Step 1: load invoice, customer, provider ──────────────────────
    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select(`
        id, invoice_number, total_amount, paid_amount, shipping_provider_id, customer_id, branch_id, warehouse_status,
        customers!invoices_customer_id_fkey(name, phone, address, city, country, area),
        shipping_providers:shipping_provider_id(*)
      `)
      .eq("id", invoiceId)
      .eq("company_id", companyId)
      .maybeSingle()

    if (invErr || !invoice) {
      return NextResponse.json({
        success: false,
        error: "الفاتورة غير موجودة",
        stage: "load_invoice",
      }, { status: 404 })
    }

    const provider: any = Array.isArray(invoice.shipping_providers)
      ? invoice.shipping_providers[0]
      : invoice.shipping_providers
    if (!provider?.id) {
      return NextResponse.json({
        success: false,
        error: "الفاتورة دى ما عليهاش شركة شحن. استخدم زرار الاعتماد العادى.",
        stage: "no_provider",
      }, { status: 400 })
    }

    const code = String(provider.provider_code || "").toLowerCase()
    if (!API_INTEGRATED_PROVIDER_CODES.has(code) || !provider.auth_type) {
      return NextResponse.json({
        success: false,
        error: "شركة الشحن دى مش مربوطة بـ API. استخدم زرار الاعتماد العادى.",
        stage: "manual_provider",
      }, { status: 400 })
    }

    // ── Step 2: validate customer address ────────────────────────────
    const customer: any = Array.isArray((invoice as any).customers)
      ? (invoice as any).customers[0]
      : (invoice as any).customers
    if (!customer?.name || !customer?.phone || !customer?.address || !customer?.city) {
      return NextResponse.json({
        success: false,
        error: "بيانات العميل ناقصة. اكمل الاسم والتليفون والمدينة والعنوان قبل إرسال الشحنة.",
        stage: "incomplete_customer",
        missing: {
          name: !customer?.name,
          phone: !customer?.phone,
          address: !customer?.address,
          city: !customer?.city,
        },
      }, { status: 400 })
    }

    // ── Step 3: call provider adapter ────────────────────────────────
    const adapter = createShippingAdapter(provider)
    // Sender / shipper info comes from the provider's extra_config if
    // present, otherwise reasonable defaults so the call doesn't fail
    // on a missing-field validation before it ever reaches the API.
    const shipperCfg = provider.extra_config || {}
    const createReq: CreateShipmentRequest = {
      shipper: {
        name:    shipperCfg.shipper_name    || "Sender",
        phone:   shipperCfg.shipper_phone   || customer.phone,
        address: shipperCfg.shipper_address || "",
        city:    shipperCfg.shipper_city    || "Cairo",
        country: shipperCfg.shipper_country || "Egypt",
      },
      consignee: {
        name:    customer.name,
        phone:   customer.phone,
        address: customer.address,
        city:    customer.city,
        country: customer.country || "Egypt",
      },
      shipment: {
        weight:     1,
        description: `فاتورة ${invoice.invoice_number}`,
        reference:   invoice.invoice_number,
        cod_amount:  Math.max(0, Number(invoice.total_amount || 0) - Number(invoice.paid_amount || 0)),
        pieces:      1,
      },
    }

    const apiResult = await adapter.createShipment(createReq)

    if (!apiResult.success) {
      // Provider rejected the request. DO NOT touch inventory or post
      // any journal entries. Return a structured error so the page can
      // show its modal.
      return NextResponse.json({
        success: false,
        error: apiResult.error?.message || "تعذّر إنشاء الشحنة فى شركة الشحن",
        stage: "provider_create_failed",
        provider_name: provider.provider_name,
        provider_code: provider.provider_code,
        provider_error_code: apiResult.error?.code,
      }, { status: 422 })
    }

    // ── Step 4: provider succeeded — insert the shipment row ──────────
    // Use service-role to bypass RLS; we already authorized the user.
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    const admin = createSupabaseClient(url, serviceKey, { auth: { persistSession: false } })

    // Generate a human-readable shipment number SHP-NNNN per company.
    const { data: lastShipment } = await admin
      .from("shipments")
      .select("shipment_number")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    let nextNum = 1
    if (lastShipment?.shipment_number) {
      const m = String(lastShipment.shipment_number).match(/(\d+)$/)
      if (m) nextNum = parseInt(m[1], 10) + 1
    }
    const shipment_number = `SHP-${String(nextNum).padStart(4, "0")}`

    const { data: shipmentRow, error: shipmentErr } = await admin
      .from("shipments")
      .insert({
        company_id: companyId,
        invoice_id: invoiceId,
        branch_id: invoice.branch_id,
        shipping_provider_id: provider.id,
        shipment_number,
        tracking_number: apiResult.tracking_number || null,
        awb_number: apiResult.awb_number || null,
        label_url: apiResult.label_url || null,
        tracking_url: apiResult.tracking_url || null,
        status: "created",
        recipient_name: customer.name,
        recipient_phone: customer.phone,
        recipient_address: customer.address,
        recipient_city: customer.city,
        recipient_country: customer.country || "Egypt",
        cod_amount: createReq.shipment.cod_amount || 0,
        api_attempts: 1,
        provider_response: apiResult.raw_response || null,
      })
      .select("id")
      .single()

    if (shipmentErr) {
      // Extremely rare path — the provider succeeded but we failed to
      // save the shipment. We don't try to reverse the provider call.
      // Surface a 500 so the user knows to NOT click again (the row in
      // Bosta already exists).
      return NextResponse.json({
        success: false,
        error: "الشحنة اتعملت فى شركة الشحن بس فشلنا فى حفظها عندنا. تواصل مع الدعم.",
        stage: "shipment_insert_failed",
        provider_tracking_number: apiResult.tracking_number,
      }, { status: 500 })
    }

    // Log the initial status event so the timeline isn't empty.
    await admin.from("shipment_status_logs").insert({
      company_id: companyId,
      shipment_id: shipmentRow.id,
      internal_status: "created",
      provider_status: "CREATED_VIA_API",
      source: "api_create",
      notes: `Created with ${provider.provider_name}`,
    }).select().maybeSingle()

    // ── Step 5: run the regular approval (inventory + COGS) ──────────
    const service = new SalesInvoiceWarehouseCommandService(supabase)
    try {
      const result = await service.approveDelivery(
        { companyId, userId: user.id },
        {
          invoiceId,
          notes: body?.notes || `تم الاعتماد + إنشاء شحنة ${shipment_number} عبر ${provider.provider_name}`,
          idempotencyKey: request.headers.get("Idempotency-Key"),
        }
      )

      // Match the regular endpoint's archive behavior so notifications
      // don't pile up.
      await archiveApprovalNotificationsForRecord({
        supabase,
        companyId,
        referenceType: "invoice",
        referenceId: invoiceId,
      })

      return NextResponse.json({
        ...result,
        success: true,
        shipment: {
          id: shipmentRow.id,
          shipment_number,
          tracking_number: apiResult.tracking_number,
          tracking_url: apiResult.tracking_url,
          label_url: apiResult.label_url,
          provider_name: provider.provider_name,
        },
      })
    } catch (svcError: any) {
      // Approval service rejected after Bosta already created the
      // shipment (e.g. stock shortage). The Bosta shipment exists; the
      // local approval doesn't. Mark the shipment with the error and
      // bubble up — the caller can show the shortages modal as today.
      await admin
        .from("shipments")
        .update({ status: "cancelled", error_message: svcError?.message || "approval_failed" })
        .eq("id", shipmentRow.id)

      if (svcError instanceof SalesInvoiceWarehouseCommandError) {
        const payload: Record<string, any> = {
          success: false,
          error: svcError.message,
          stage: "approval_failed_after_shipment_created",
          shipment_was_created: true,
          provider_tracking_number: apiResult.tracking_number,
        }
        const shortages = svcError.details?.shortages
        if (shortages && shortages.length > 0) {
          payload.shortages = shortages.map((s: any) => ({
            product_id: s.product_id,
            product_name: s.product_name || "",
            required_qty: s.requested,
            available_qty: s.available,
            uom: s.uom || "",
          }))
        }
        return NextResponse.json(payload, { status: svcError.status })
      }
      throw svcError
    }
  } catch (error: any) {
    console.error("Error in warehouse approve + shipping API:", error)
    return NextResponse.json({
      success: false,
      error: error?.message || "Unexpected error",
      stage: "unhandled",
    }, { status: 500 })
  }
}
