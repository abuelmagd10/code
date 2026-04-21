/**
 * 🔒 API أوامر الشراء مع الحوكمة الإلزامية
 * 
 * GET /api/purchase-orders - جلب أوامر الشراء مع تطبيق الحوكمة
 * POST /api/purchase-orders - إنشاء أمر شراء جديد مع الحوكمة
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  enforceGovernance,
  applyGovernanceFilters,
  validateGovernanceData,
  addGovernanceData
} from "@/lib/governance-middleware"
import { PurchaseOrderNotificationService } from "@/lib/services/purchase-order-notification.service"

const PURCHASE_PRIVILEGED_ROLES = new Set([
  "super_admin",
  "admin",
  "general_manager",
  "gm",
  "owner",
  "generalmanager",
  "superadmin",
])

const normalizeRole = (role: unknown) => String(role || "").trim().toLowerCase().replace(/\s+/g, "_")

async function loadWarehouse(supabase: any, companyId: string, warehouseId: string | null) {
  if (!warehouseId) return null
  const { data, error } = await supabase
    .from("warehouses")
    .select("id, branch_id, cost_center_id")
    .eq("company_id", companyId)
    .eq("id", warehouseId)
    .maybeSingle()
  if (error) throw new Error(`Failed to validate warehouse: ${error.message}`)
  return data || null
}

async function loadCostCenter(supabase: any, companyId: string, costCenterId: string | null) {
  if (!costCenterId) return null
  const { data, error } = await supabase
    .from("cost_centers")
    .select("id, branch_id")
    .eq("company_id", companyId)
    .eq("id", costCenterId)
    .maybeSingle()
  if (error) throw new Error(`Failed to validate cost center: ${error.message}`)
  return data || null
}

async function resolvePurchaseBranchContext(supabase: any, governance: any, data: any) {
  let branchId = data.branch_id || governance.branchIds?.[0] || null
  let warehouseId = data.warehouse_id || null
  let costCenterId = data.cost_center_id || null

  const requestedWarehouse = await loadWarehouse(supabase, governance.companyId, warehouseId)
  if (!branchId && requestedWarehouse?.branch_id) {
    branchId = requestedWarehouse.branch_id
  }

  if (!branchId) {
    throw new Error("Governance Violation: branch_id is required for purchase orders")
  }

  if (!governance.branchIds?.includes(branchId)) {
    throw new Error("Governance Violation: Invalid branch_id")
  }

  const { data: branch, error: branchError } = await supabase
    .from("branches")
    .select("id, default_warehouse_id, default_cost_center_id")
    .eq("company_id", governance.companyId)
    .eq("id", branchId)
    .maybeSingle()

  if (branchError) {
    throw new Error(`Failed to validate branch defaults: ${branchError.message}`)
  }

  if (!branch) {
    throw new Error("Governance Violation: Branch not found")
  }

  let resolvedWarehouse = requestedWarehouse?.branch_id === branchId ? requestedWarehouse : null

  if (!resolvedWarehouse && branch.default_warehouse_id) {
    resolvedWarehouse = await loadWarehouse(supabase, governance.companyId, branch.default_warehouse_id)
    if (resolvedWarehouse?.branch_id !== branchId) {
      resolvedWarehouse = null
    }
  }

  if (!resolvedWarehouse) {
    const { data: fallbackWarehouse, error: fallbackWarehouseError } = await supabase
      .from("warehouses")
      .select("id, branch_id, cost_center_id")
      .eq("company_id", governance.companyId)
      .eq("branch_id", branchId)
      .eq("is_active", true)
      .order("is_main", { ascending: false })
      .order("name", { ascending: true })
      .limit(1)
      .maybeSingle()

    if (fallbackWarehouseError) {
      throw new Error(`Failed to resolve branch warehouse: ${fallbackWarehouseError.message}`)
    }

    resolvedWarehouse = fallbackWarehouse || null
  }

  if (!resolvedWarehouse?.id) {
    throw new Error("Governance Violation: Branch has no default warehouse")
  }

  warehouseId = resolvedWarehouse.id

  const requestedCostCenter = await loadCostCenter(supabase, governance.companyId, costCenterId)
  let resolvedCostCenter = requestedCostCenter?.branch_id === branchId ? requestedCostCenter : null

  if (!resolvedCostCenter && branch.default_cost_center_id) {
    resolvedCostCenter = await loadCostCenter(supabase, governance.companyId, branch.default_cost_center_id)
    if (resolvedCostCenter?.branch_id !== branchId) {
      resolvedCostCenter = null
    }
  }

  if (!resolvedCostCenter && resolvedWarehouse.cost_center_id) {
    resolvedCostCenter = await loadCostCenter(supabase, governance.companyId, resolvedWarehouse.cost_center_id)
    if (resolvedCostCenter?.branch_id !== branchId) {
      resolvedCostCenter = null
    }
  }

  if (!resolvedCostCenter) {
    const { data: fallbackCostCenter, error: fallbackCostCenterError } = await supabase
      .from("cost_centers")
      .select("id, branch_id")
      .eq("company_id", governance.companyId)
      .eq("branch_id", branchId)
      .eq("is_active", true)
      .order("cost_center_name", { ascending: true })
      .limit(1)
      .maybeSingle()

    if (fallbackCostCenterError) {
      throw new Error(`Failed to resolve branch cost center: ${fallbackCostCenterError.message}`)
    }

    resolvedCostCenter = fallbackCostCenter || null
  }

  if (!resolvedCostCenter?.id) {
    throw new Error("Governance Violation: Branch has no default cost center")
  }

  return {
    ...data,
    branch_id: branchId,
    warehouse_id: warehouseId,
    cost_center_id: resolvedCostCenter.id,
  }
}

/**
 * GET /api/purchase-orders
 * جلب أوامر الشراء مع تطبيق فلاتر الحوكمة
 */
export async function GET(request: NextRequest) {
  try {
    // 1️⃣ تطبيق الحوكمة (إلزامي)
    const governance = await enforceGovernance()

    const supabase = await createClient()

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status") || undefined

    // 2️⃣ بناء الاستعلام مع فلاتر الحوكمة
    let query = supabase
      .from("purchase_orders")
      .select(`
        *,
        suppliers:supplier_id (id, name, phone, city)
      `)

    if (status && status !== "all") {
      query = query.eq("status", status)
    }

    // 3️⃣ تطبيق فلاتر الحوكمة (إلزامي)
    query = applyGovernanceFilters(query, governance)
    query = query.order("created_at", { ascending: false })

    const { data: orders, error: dbError } = await query

    if (dbError) {
      console.error("[API /purchase-orders] Database error:", dbError)
      return NextResponse.json({
        error: dbError.message,
        error_ar: "خطأ في جلب أوامر الشراء"
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: orders || [],
      meta: {
        total: (orders || []).length,
        role: governance.role,
        governance: {
          companyId: governance.companyId,
          branchIds: governance.branchIds,
          warehouseIds: governance.warehouseIds,
          costCenterIds: governance.costCenterIds
        }
      }
    })

  } catch (error: any) {
    console.error("[API /purchase-orders] Unexpected error:", error)
    return NextResponse.json({
      error: error.message,
      error_ar: "حدث خطأ غير متوقع"
    }, {
      status: error.message.includes('Unauthorized') ? 401 : 403
    })
  }
}

/**
 * POST /api/purchase-orders
 * إنشاء أمر شراء جديد مع التحقق من الحوكمة
 */
export async function POST(request: NextRequest) {
  try {
    // 1️⃣ تطبيق الحوكمة (إلزامي)
    const governance = await enforceGovernance()

    const body = await request.json()
    const commandItems = Array.isArray(body.items) ? body.items : []
    const purchaseOrderPayload = {
      supplier_id: body.supplier_id,
      po_date: body.po_date,
      due_date: body.due_date || null,
      notes: body.notes || null,
      subtotal: body.subtotal,
      tax_amount: body.tax_amount,
      total: body.total,
      total_amount: body.total_amount,
      discount_type: body.discount_type,
      discount_value: body.discount_value,
      discount_position: body.discount_position,
      tax_inclusive: body.tax_inclusive,
      shipping: body.shipping,
      shipping_tax_rate: body.shipping_tax_rate,
      adjustment: body.adjustment,
      status: body.status,
      currency: body.currency,
      exchange_rate: body.exchange_rate,
      branch_id: body.branch_id || null,
      cost_center_id: body.cost_center_id || null,
      warehouse_id: body.warehouse_id || null,
      created_by_user_id: body.created_by_user_id || null,
    }

    const supabase = await createClient()

    // 2️⃣ إضافة بيانات الحوكمة تلقائياً ثم تثبيت سياق الفرع
    let dataWithGovernance = addGovernanceData(purchaseOrderPayload, governance)
    dataWithGovernance = await resolvePurchaseBranchContext(supabase, governance, dataWithGovernance)

    // 3️⃣ التحقق من صحة البيانات (إلزامي)
    validateGovernanceData(dataWithGovernance, governance)

    // --- Product Branch Isolation Check ---
    if (commandItems.length > 0) {
      const productIds = commandItems.map((item: any) => item.product_id).filter(Boolean);
      if (productIds.length > 0) {
        const { data: productsData, error: productsError } = await supabase
          .from("products")
          .select("id, branch_id")
          .in("id", productIds);

        if (productsError) {
           return NextResponse.json({ error: "Failed to validate products" }, { status: 500 });
        }

        const isAdmin = PURCHASE_PRIVILEGED_ROLES.has(normalizeRole(governance.role));
        const docBranchId = dataWithGovernance.branch_id;

        if (!isAdmin && docBranchId) {
          for (const product of productsData || []) {
            if (product.branch_id && product.branch_id !== docBranchId) {
              return NextResponse.json({
                error: `Product Branch Isolation Violation: Product ${product.id} (branch ${product.branch_id}) cannot be added to document (branch ${docBranchId})`,
                error_ar: "غير مصرح باستخدام منتجات من فروع أخرى"
              }, { status: 403 });
            }
          }
        }
      }
    }
    // ------------------------------------

    const normalizedRole = normalizeRole(governance.role)
    const canCreateLinkedBill = PURCHASE_PRIVILEGED_ROLES.has(normalizedRole)
    const shouldCreateLinkedBill = Boolean(body.createLinkedBill) && canCreateLinkedBill

    // 4️⃣ الإدخال في قاعدة البيانات
    const { data: newOrder, error: insertError } = await supabase
      .from("purchase_orders")
      .insert(dataWithGovernance)
      .select()
      .single()

    if (insertError) {
      return NextResponse.json({
        error: insertError.message,
        error_ar: "فشل في إنشاء أمر الشراء"
      }, { status: 500 })
    }

    // --- Insert Items if provided ---
    const createdItems = commandItems
    if (commandItems.length > 0) {
      const itemsToInsert = commandItems.map((item: any) => ({
        ...item,
        purchase_order_id: newOrder.id
      }));
      const { error: itemsError } = await supabase.from("purchase_order_items").insert(itemsToInsert);
      if (itemsError) {
        console.error("Failed to insert items:", itemsError);
      }
    }

    let linkedBillId: string | null = null

    if (shouldCreateLinkedBill) {
      const { data: linkedBill, error: linkedBillError } = await supabase
        .from("bills")
        .insert({
          company_id: governance.companyId,
          supplier_id: dataWithGovernance.supplier_id,
          bill_date: dataWithGovernance.po_date,
          due_date: dataWithGovernance.due_date || null,
          subtotal: dataWithGovernance.subtotal,
          tax_amount: dataWithGovernance.tax_amount,
          total_amount: dataWithGovernance.total_amount || dataWithGovernance.total,
          discount_type: dataWithGovernance.discount_type,
          discount_value: dataWithGovernance.discount_value,
          discount_position: dataWithGovernance.discount_position,
          tax_inclusive: dataWithGovernance.tax_inclusive,
          shipping: dataWithGovernance.shipping,
          shipping_tax_rate: dataWithGovernance.shipping_tax_rate,
          shipping_provider_id: body.shipping_provider_id || null,
          adjustment: dataWithGovernance.adjustment,
          status: "draft",
          currency_code: dataWithGovernance.currency || "EGP",
          exchange_rate: dataWithGovernance.exchange_rate || 1,
          purchase_order_id: newOrder.id,
          branch_id: dataWithGovernance.branch_id,
          warehouse_id: dataWithGovernance.warehouse_id,
          cost_center_id: dataWithGovernance.cost_center_id,
        })
        .select("id")
        .single()

      if (linkedBillError) {
        console.error("Failed to create linked bill:", linkedBillError)
      } else if (linkedBill?.id) {
        linkedBillId = linkedBill.id

        const { error: poLinkError } = await supabase
          .from("purchase_orders")
          .update({ bill_id: linkedBillId })
          .eq("id", newOrder.id)

        if (poLinkError) {
          console.error("Failed to link purchase order to bill:", poLinkError)
        }

        if (createdItems.length > 0) {
          const billItems = createdItems.map((item: any) => ({
            bill_id: linkedBillId,
            product_id: item.product_id || null,
            quantity: item.quantity,
            unit_price: item.unit_price,
            tax_rate: item.tax_rate,
            discount_percent: item.discount_percent || 0,
            item_type: item.item_type || 'product',
            line_total: item.line_total,
          }))

          const { error: billItemsError } = await supabase.from("bill_items").insert(billItems)
          if (billItemsError) {
            console.error("Failed to insert linked bill items:", billItemsError)
          }
        }
      }
    }

    // 5️⃣ إضافة سجل تدقيق (Enterprise Requirement)
    const { data: { user } } = await supabase.auth.getUser()
    if (user && governance.companyId) {
      await supabase.from("audit_logs").insert({
        company_id: governance.companyId,
        user_id: user.id,
        action: "po_created",
        entity_type: "purchase_order",
        entity_id: newOrder.id,
        new_values: newOrder,
        created_at: new Date().toISOString()
      })
    }

    if (!canCreateLinkedBill) {
      const { data: supplier } = await supabase
        .from("suppliers")
        .select("name")
        .eq("id", dataWithGovernance.supplier_id)
        .maybeSingle()

      try {
        await new PurchaseOrderNotificationService(supabase).notifyApprovalRequested({
          companyId: governance.companyId,
          poId: newOrder.id,
          poNumber: newOrder.po_number,
          supplierName: supplier?.name || "Unknown Supplier",
          amount: Number(newOrder.total_amount || newOrder.total || 0),
          currency: newOrder.currency || "EGP",
          branchId: dataWithGovernance.branch_id,
          costCenterId: dataWithGovernance.cost_center_id,
          createdBy: newOrder.created_by_user_id || user?.id || "",
          appLang: body.appLang === "en" ? "en" : "ar",
          isResubmission: false,
        })
      } catch (notificationError) {
        console.error("Failed to dispatch purchase order approval notification:", notificationError)
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        ...newOrder,
        bill_id: linkedBillId || newOrder.bill_id || null,
      },
      linkedBillId,
      message: "Purchase order created successfully",
      message_ar: "تم إنشاء أمر الشراء بنجاح",
      governance: {
        enforced: true,
        companyId: governance.companyId,
        branchId: dataWithGovernance.branch_id,
        warehouseId: dataWithGovernance.warehouse_id,
        costCenterId: dataWithGovernance.cost_center_id
      }
    }, { status: 201 })

  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      error_ar: "حدث خطأ غير متوقع"
    }, {
      status: error.message.includes('Violation') ? 403 : 500
    })
  }
}
