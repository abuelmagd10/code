/**
 * 🔒 API أوامر البيع مع الحوكمة الإلزامية
 * 
 * GET /api/sales-orders - جلب أوامر البيع مع تطبيق الحوكمة
 * POST /api/sales-orders - إنشاء أمر بيع جديد مع الحوكمة
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  enforceGovernance,
  applyGovernanceFilters,
} from "@/lib/governance-middleware"
import { SalesOrderNotificationService } from "@/lib/services/sales-order-notification.service"

// 🔐 الأدوار المميزة التي يمكنها فلترة الفروع
const PRIVILEGED_ROLES = ['owner', 'admin', 'general_manager']

/**
 * GET /api/sales-orders
 * جلب أوامر البيع مع تطبيق فلاتر الحوكمة
 */
export async function GET(request: NextRequest) {
  try {
    // 1️⃣ تطبيق الحوكمة (إلزامي)
    const governance = await enforceGovernance(request)

    // 🔐 قراءة branch_id من query parameters (للأدوار المميزة فقط)
    const { searchParams } = new URL(request.url)
    const requestedBranchId = searchParams.get('branch_id')
    const canFilterByBranch = PRIVILEGED_ROLES.includes(governance.role.toLowerCase())

    // 2️⃣ بناء الاستعلام مع فلاتر الحوكمة
    const supabase = await createClient()
    let query = supabase
      .from("sales_orders")
      .select(`
        *,
        customers:customer_id (id, name, phone, city),
        branches:branch_id (name)
      `)

    // 🔐 تطبيق فلترة الفروع حسب الصلاحيات
    if (canFilterByBranch && requestedBranchId) {
      // المستخدم المميز اختار فرعاً معيناً
      query = query.eq('company_id', governance.companyId)
      query = query.eq('branch_id', requestedBranchId)
    } else {
      // تطبيق الفلاتر العادية
      query = applyGovernanceFilters(query, governance)
    }
    query = query.order("created_at", { ascending: false })

    const { data: orders, error: dbError } = await query

    if (dbError) {
      console.error("[API /sales-orders] Database error:", dbError)
      return NextResponse.json({
        error: dbError.message,
        error_ar: "خطأ في جلب أوامر البيع"
      }, { status: 500 })
    }

    // v3.74.450 — mirror v3.74.449 on the sales side: enrich each SO
    // with the status of its latest discount_approval so the list
    // shows a "discount rejected" badge without opening the SO.
    let enrichedOrders: any[] = orders || []
    if (enrichedOrders.length > 0) {
      const soIds = enrichedOrders.map((o: any) => o.id)
      const { data: discountRows } = await supabase
        .from("discount_approvals")
        .select("document_id, status, requested_at")
        .eq("document_type", "sales_order")
        .in("document_id", soIds)
        .order("requested_at", { ascending: false })
      const latestByDoc: Record<string, string> = {}
      for (const r of (discountRows || []) as any[]) {
        if (!(r.document_id in latestByDoc)) {
          latestByDoc[r.document_id] = r.status
        }
      }
      enrichedOrders = enrichedOrders.map((o: any) => ({
        ...o,
        discount_approval_status: latestByDoc[o.id] ?? null,
      }))
    }

    return NextResponse.json({
      success: true,
      data: enrichedOrders,
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
    console.error("[API /sales-orders] Error:", error)
    return NextResponse.json({
      error: error.message,
      error_ar: "حدث خطأ غير متوقع"
    }, {
      status: error.message.includes('Unauthorized') ? 401 : 403
    })
  }
}

/**
 * POST /api/sales-orders
 * إنشاء أمر بيع جديد مع التحقق من الحوكمة واستخدام افتراضيات الفرع
 */
export async function POST(request: NextRequest) {
  try {
    // 1️⃣ تطبيق الحوكمة الأساسية (إلزامي)
    const governance = await enforceGovernance(request)

    const body = await request.json()

    // 2️⃣ تطبيق افتراضيات الفرع (Enterprise Pattern: User → Branch → Defaults)
    const { enforceBranchDefaults, validateBranchDefaults, buildSalesOrderData } = await import('@/lib/governance-branch-defaults')
    const supabase = await createClient()
    const enhancedContext = await enforceBranchDefaults(governance, body, supabase)

    // 3️⃣ بناء البيانات النهائية مع الحوكمة المحسنة
    const finalData = buildSalesOrderData(body, enhancedContext)

    // 4️⃣ التأكد من أن company_id موجود
    if (!finalData.company_id && governance.companyId) {
      finalData.company_id = governance.companyId
    }

    // 5️⃣ التحقق من صحة البيانات قبل الإدخال
    validateBranchDefaults(finalData, enhancedContext)

    // 6️⃣ التحقق من أن المستودع ومركز التكلفة ينتميان للفرع
    if (finalData.branch_id && finalData.warehouse_id) {
      const { data: warehouse, error: whError } = await supabase
        .from("warehouses")
        .select("branch_id")
        .eq("id", finalData.warehouse_id)
        .single()

      if (whError || !warehouse) {
        return NextResponse.json({
          error: "Warehouse not found",
          error_ar: "المخزن المحدد غير موجود"
        }, { status: 400 })
      }

      if (warehouse.branch_id !== finalData.branch_id) {
        return NextResponse.json({
          error: "Warehouse does not belong to the selected branch",
          error_ar: "المخزن المحدد لا ينتمي للفرع المختار"
        }, { status: 400 })
      }
    }

    if (finalData.branch_id && finalData.cost_center_id) {
      const { data: costCenter, error: ccError } = await supabase
        .from("cost_centers")
        .select("branch_id")
        .eq("id", finalData.cost_center_id)
        .single()

      if (ccError || !costCenter) {
        return NextResponse.json({
          error: "Cost center not found",
          error_ar: "مركز التكلفة المحدد غير موجود"
        }, { status: 400 })
      }

      if (costCenter.branch_id !== finalData.branch_id) {
        return NextResponse.json({
          error: "Cost center does not belong to the selected branch",
          error_ar: "مركز التكلفة المحدد لا ينتمي للفرع المختار"
        }, { status: 400 })
      }
    }

    // 6b️⃣ التحقق من أن شركة الشحن (إن وُجدت) مرتبطة بالفرع
    if (finalData.shipping_provider_id && finalData.branch_id) {
      const { validateShippingProviderForBranch } = await import('@/lib/shipping-provider-branch')
      const validation = await validateShippingProviderForBranch(supabase, {
        branch_id: finalData.branch_id,
        shipping_provider_id: finalData.shipping_provider_id,
        company_id: finalData.company_id || governance.companyId
      })
      if (!validation.valid) {
        return NextResponse.json({
          error: validation.error_ar || 'Invalid shipping provider for branch',
          error_ar: validation.error_ar
        }, { status: 400 })
      }
    }

    // v3.74.140 — Mandatory line-items guard. Same fix as PO (v3.74.139)
    // and Invoices (above). Without this, POST with items:[] silently
    // created a sales-order header with no items, and rows with
    // product_id=null / quantity=0 were inserted blindly.
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({
        success: false,
        error: "Cannot create a sales order without line items.",
        error_ar: "لا يمكن إنشاء أمر بيع بدون بنود. الرجاء إضافة منتج واحد على الأقل.",
      }, { status: 422 })
    }
    const invalidSoRows: number[] = []
    body.items.forEach((item: any, idx: number) => {
      const hasProduct = Boolean(item?.product_id)
      const qty = Number(item?.quantity) || 0
      const price = Number(item?.unit_price) || 0
      if (!hasProduct || qty <= 0 || price < 0) {
        invalidSoRows.push(idx + 1)
      }
    })
    if (invalidSoRows.length > 0) {
      return NextResponse.json({
        success: false,
        error: `Sales order has incomplete line items at row(s): ${invalidSoRows.join(", ")}.`,
        error_ar: `أمر البيع يحتوى على بنود ناقصة فى السطر/السطور: ${invalidSoRows.join("، ")}. كل بند يجب أن يحتوى على منتج، كمية أكبر من صفر، وسعر وحدة.`,
        invalid_rows: invalidSoRows,
      }, { status: 422 })
    }

    // 6c️⃣ التحقق من توفر المخزون (Stock Validation) — مع اسم المنتج في الخطأ
    if (body.items && Array.isArray(body.items) && body.items.length > 0) {
      const productItems = body.items.filter((i: any) => i.item_type !== 'service' && i.product_id);
      const productIds = productItems.map((i: any) => i.product_id);

      if (productIds.length > 0) {
        // جلب أسماء المنتجات لرسائل الخطأ
        const { data: productsData } = await supabase
          .from('products')
          .select('id, name')
          .in('id', productIds);
        const productNameMap: Record<string, string> = {};
        (productsData || []).forEach((p: any) => { productNameMap[p.id] = p.name; });

        const { data: txs, error: txError } = await supabase
          .from('inventory_transactions')
          .select('product_id, quantity_change')
          .eq('company_id', finalData.company_id || governance.companyId)
          .eq('warehouse_id', finalData.warehouse_id)
          .in('product_id', productIds)
          .or('is_deleted.is.null,is_deleted.eq.false');

        if (!txError && txs) {
          const stockMap: Record<string, number> = {};
          txs.forEach((tx: any) => {
            stockMap[tx.product_id] = (stockMap[tx.product_id] || 0) + Number(tx.quantity_change || 0);
          });

          for (const item of productItems) {
            const reqQty = Number(item.quantity || 0);
            const avail = Math.max(0, stockMap[item.product_id] || 0);
            const productName = productNameMap[item.product_id] || item.product_id;
            if (reqQty > avail) {
              return NextResponse.json({
                error: `Insufficient stock for "${productName}". Requested: ${reqQty}, Available: ${avail}`,
                error_ar: `المخزون غير كافٍ للمنتج: "${productName}". الكمية المطلوبة: ${reqQty}، المتاحة في المخزن: ${avail}`
              }, { status: 400 });
            }
          }
        }
      }
    }

    // 7️⃣ التأكد من أن جميع الحقول المطلوبة موجودة
    if (!finalData.branch_id || !finalData.warehouse_id || !finalData.cost_center_id) {
      return NextResponse.json({
        error: "Missing required fields: branch_id, warehouse_id, and cost_center_id are required",
        error_ar: "الحقول المطلوبة مفقودة: يجب تحديد الفرع والمخزن ومركز التكلفة"
      }, { status: 400 })
    }

    // 7️⃣ الإدخال في قاعدة البيانات
    // ✅ استخراج items قبل الإدراج (ليست عموداً في جدول sales_orders)
    const { items: _bodyItems, ...orderDataToInsert } = finalData

    // 🔐 Auto-fill created_by_user_id from governance context (Req: creator-level visibility)
    // matches /customers + /estimates pattern — staff/sales/employee only see their own
    if (!orderDataToInsert.created_by_user_id && governance.userId) {
      orderDataToInsert.created_by_user_id = governance.userId
    }

    // 7.5️⃣ Defensive bundle-completeness guard (Req 2 / Phase B.4.4)
    //   Refuses an SO that omits mandatory bundle children for any product
    //   the caller included. Protects non-UI callers from bypassing the
    //   BundleSelectionDialog. The DB pipeline is NOT modified.
    if (Array.isArray(_bodyItems) && _bodyItems.length > 0) {
      const { data: validation, error: validationErr } = await supabase.rpc(
        'bdl_validate_bundle_completeness',
        { p_items: _bodyItems, p_company_id: finalData.company_id || governance.companyId }
      )
      if (validationErr) {
        console.error("Bundle validation RPC error:", validationErr)
      } else if (validation && validation.complete === false) {
        return NextResponse.json({
          success: false,
          error:    'بعض الأصناف المرفقة الإلزامية ناقصة',
          error_ar: 'بعض الأصناف المرفقة الإلزامية ناقصة',
          code:     'BUNDLE_INCOMPLETE',
          details:  validation.missing ?? [],
        }, { status: 400 })
      }
    }

    // 7.6️⃣ Defensive stock-availability guard (Option B — Req 2 follow-up)
    //   Refuses an SO whose non-service items demand more than the target
    //   branch has available. Aggregates duplicates by product_id. Bundle
    //   children with included/free pricing still consume inventory and
    //   ARE checked. Services are skipped. DB pipeline is NOT modified.
    if (Array.isArray(_bodyItems) && _bodyItems.length > 0 && finalData.branch_id) {
      const scopedCompanyId = finalData.company_id || governance.companyId
      const aggregated: Record<string, number> = {}
      for (const it of _bodyItems) {
        if (!it?.product_id || it.item_type === 'service') continue
        aggregated[it.product_id] = (aggregated[it.product_id] || 0) + (Number(it.quantity) || 0)
      }
      const productIds = Object.keys(aggregated)
      if (productIds.length > 0) {
        // NOTE: querying the view directly (not the RPC) — see comment in
        // app/api/invoices/route.ts for the rationale.
        const { data: balanceRows, error: balErr } = await supabase
          .from('inventory_available_balance')
          .select('product_id, available_quantity')
          .eq('company_id', scopedCompanyId)
          .eq('branch_id', finalData.branch_id)
          .in('product_id', productIds)
        if (balErr) {
          console.error('[SO_STOCK_CHECK_ERR]', balErr)
        }
        const totals: Record<string, number> = {}
        productIds.forEach(pid => { totals[pid] = 0 })
        ;(balanceRows ?? []).forEach((r: any) => {
          totals[r.product_id] = (totals[r.product_id] || 0) + Math.max(0, Number(r.available_quantity) || 0)
        })

        // v3.74.556 + v3.74.557 — subtract reservations. Same set the DB
        // helper get_effective_available_stock uses:
        //   1) purchase returns in a pending workflow
        //   2) invoices sent but warehouse dispatch pending
        //   3) outbound inventory transfers not yet arrived
        // Aggregated by product across warehouses in the branch (matches
        // the granularity of the view above).
        const branchWarehouseIds = await (async () => {
          const { data: whs } = await supabase
            .from('warehouses')
            .select('id')
            .eq('company_id', scopedCompanyId)
            .eq('branch_id', finalData.branch_id)
          return (whs ?? []).map((w: any) => w.id as string)
        })()

        const pendingReturnQty: Record<string, number> = {}
        const pendingInvoiceQty: Record<string, number> = {}
        const pendingTransferQty: Record<string, number> = {}
        productIds.forEach(pid => {
          pendingReturnQty[pid] = 0
          pendingInvoiceQty[pid] = 0
          pendingTransferQty[pid] = 0
        })

        const { data: pendingReturnsRows } = await supabase
          .from('purchase_return_items')
          .select('product_id, quantity, purchase_returns!inner(company_id, branch_id, workflow_status)')
          .eq('purchase_returns.company_id', scopedCompanyId)
          .eq('purchase_returns.branch_id', finalData.branch_id)
          .in('product_id', productIds)
          .in('purchase_returns.workflow_status', [
            'pending_admin_approval', 'pending_approval',
            'pending_warehouse',      'partial_approval'
          ])
        for (const r of (pendingReturnsRows ?? []) as any[]) {
          pendingReturnQty[r.product_id] = (pendingReturnQty[r.product_id] || 0) + Number(r.quantity || 0)
        }

        if (branchWarehouseIds.length > 0) {
          const { data: pendingInvoiceRows } = await supabase
            .from('invoice_items')
            .select('product_id, quantity, invoices!inner(company_id, warehouse_id, warehouse_status, status)')
            .eq('invoices.company_id', scopedCompanyId)
            .in('invoices.warehouse_id', branchWarehouseIds)
            .eq('invoices.warehouse_status', 'pending')
            .in('invoices.status', ['sent', 'partially_paid', 'paid'])
            .in('product_id', productIds)
          for (const r of (pendingInvoiceRows ?? []) as any[]) {
            pendingInvoiceQty[r.product_id] = (pendingInvoiceQty[r.product_id] || 0) + Number(r.quantity || 0)
          }

          const { data: pendingTransferRows } = await supabase
            .from('inventory_transfer_items')
            .select('product_id, quantity_sent, inventory_transfers!inner(company_id, source_warehouse_id, status, deleted_at)')
            .eq('inventory_transfers.company_id', scopedCompanyId)
            .in('inventory_transfers.source_warehouse_id', branchWarehouseIds)
            .in('inventory_transfers.status', ['pending', 'approved', 'in_transit'])
            .is('inventory_transfers.deleted_at', null)
            .in('product_id', productIds)
          for (const r of (pendingTransferRows ?? []) as any[]) {
            pendingTransferQty[r.product_id] = (pendingTransferQty[r.product_id] || 0) + Number(r.quantity_sent || 0)
          }
        }

        const balances = productIds.map(pid => {
          const reserved = (pendingReturnQty[pid] || 0) + (pendingInvoiceQty[pid] || 0) + (pendingTransferQty[pid] || 0)
          return {
            product_id: pid,
            available: Math.max(0, (totals[pid] || 0) - reserved),
            reserved_by_pending_returns:  pendingReturnQty[pid] || 0,
            reserved_by_pending_invoices: pendingInvoiceQty[pid] || 0,
            reserved_by_pending_transfers: pendingTransferQty[pid] || 0,
          }
        })

        const insufficient = balances
          .map(b => {
            const requested = aggregated[b.product_id] ?? 0
            return { ...b, requested, shortage: requested - b.available }
          })
          .filter(b => b.requested > b.available)

        if (insufficient.length > 0) {
          return NextResponse.json({
            success: false,
            error:    'عجز في المخزون',
            error_ar: 'عجز في المخزون',
            code:     'INSUFFICIENT_STOCK',
            details:  insufficient.map(i => ({
              product_id:         i.product_id,
              requested_quantity: i.requested,
              available_quantity: i.available,
              shortage:           i.shortage,
            })),
          }, { status: 400 })
        }
      }
    }

    const { data: newSalesOrder, error: insertError } = await supabase
      .from("sales_orders")
      .insert(orderDataToInsert)
      .select()
      .single()

    if (insertError) {
      // تحسين رسالة الخطأ من قاعدة البيانات
      let errorMessage = insertError.message
      let errorAr = "فشل في إنشاء أمر البيع"

      if (insertError.message.includes('governance violation')) {
        if (insertError.message.includes('cannot be NULL')) {
          errorMessage = "Missing required governance fields"
          errorAr = "الحقول المطلوبة للحوكمة مفقودة: يجب تحديد الفرع والمخزن ومركز التكلفة"
        } else if (insertError.message.includes('warehouse_id must belong')) {
          errorMessage = "Warehouse does not belong to the selected branch"
          errorAr = "المخزن المحدد لا ينتمي للفرع المختار"
        } else if (insertError.message.includes('cost_center_id must belong')) {
          errorMessage = "Cost center does not belong to the selected branch"
          errorAr = "مركز التكلفة المحدد لا ينتمي للفرع المختار"
        }
      }

      return NextResponse.json({
        error: errorMessage,
        error_ar: errorAr,
        details: insertError.message
      }, { status: 400 })
    }

    // 7b️⃣ إدراج بنود أمر البيع (sales_order_items)
    if (_bodyItems && Array.isArray(_bodyItems) && _bodyItems.length > 0) {
      const itemsToInsert = _bodyItems.map((item: any) => {
        const rateFactor = 1 + (Number(item.tax_rate) || 0) / 100;
        const discountFactor = 1 - (Number(item.discount_percent) || 0) / 100;
        const base = Number(item.quantity) * Number(item.unit_price) * discountFactor;
        const netLine = orderDataToInsert.tax_inclusive ? (base / rateFactor) : base;

        return {
          sales_order_id: newSalesOrder.id,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          tax_rate: item.tax_rate || 0,
          discount_percent: item.discount_percent || 0,
          line_total: netLine,
          item_type: item.item_type || 'product',
        };
      });

      const { error: itemsError } = await supabase.from("sales_order_items").insert(itemsToInsert);

      if (itemsError) {
        console.error("⚠️ [SALES_ORDER] Error inserting items:", itemsError);
        // لا نتوقف عن التنفيذ لكن نُسجل الخطأ
      }
    }

    // 8️⃣ إنشاء الفاتورة أولاً ثم إرسال الإشعارات
    try {
      // ✅ جلب userId الفعلي من Supabase auth (enhancedContext.userId غير موجود في GovernanceContext)
      const { data: { user: authUser } } = await supabase.auth.getUser()
      const createdById = authUser?.id || ''

      if (!createdById) {
        console.warn('⚠️ [SALES_ORDER] Cannot send notifications: user ID not found')
      }

      // جلب اسم الفرع للإشعارات
      let branchName = 'غير محدد'
      const branchIdForNotif = enhancedContext.branch_id || enhancedContext.branchId || null
      if (branchIdForNotif) {
        const { data: branchData } = await supabase
          .from('branches')
          .select('name, branch_name')
          .eq('id', branchIdForNotif)
          .maybeSingle()
        branchName = branchData?.name || branchData?.branch_name || 'غير محدد'
      }

      const soNumber = newSalesOrder.so_number || 'غير محدد'
      const companyId = enhancedContext.companyId || enhancedContext.company_id || finalData.company_id

      // 8a️⃣ إنشاء فاتورة بيع مسودة تلقائياً أولاً (قبل الإشعارات)
      // ✅ يجب أن يكون قبل إشعار المحاسب حتى يُوجّه إلى الفاتورة وليس أمر البيع
      let autoInvoiceResult: { success: boolean; invoice_id?: string; invoice_number?: string; already_exists?: boolean } | null = null;
      try {
        const { data: rpcAutoInvoice, error: rpcAutoInvoiceErr } = await supabase.rpc(
          'create_auto_invoice_from_sales_order',
          { p_sales_order_id: newSalesOrder.id }
        );
        if (!rpcAutoInvoiceErr && rpcAutoInvoice?.success) {
          autoInvoiceResult = rpcAutoInvoice;
          console.log('✅ [SALES_ORDER] Auto invoice created:', rpcAutoInvoice.invoice_number)
        } else if (rpcAutoInvoiceErr) {
          console.error('⚠️ [SALES_ORDER] Auto invoice RPC error:', rpcAutoInvoiceErr.message)
        }
      } catch (autoInvErr: any) {
        console.error('⚠️ [SALES_ORDER] Auto invoice creation failed:', autoInvErr.message)
      }

      await new SalesOrderNotificationService(supabase).notifySalesOrderCreated({
        companyId,
        createdBy: createdById,
        salesOrderId: newSalesOrder.id,
        salesOrderNumber: soNumber,
        branchId: branchIdForNotif,
        costCenterId: enhancedContext.cost_center_id || null,
        warehouseId: enhancedContext.warehouse_id || null,
        branchName,
        linkedInvoiceId: autoInvoiceResult?.invoice_id || null,
        linkedInvoiceNumber: autoInvoiceResult?.invoice_number || null,
      })

      console.log('✅ [SALES_ORDER] Notifications sent successfully for SO:', soNumber)

    } catch (notifError: any) {
      console.error('⚠️ [SALES_ORDER] Failed to send notifications:', notifError)
    }

    return NextResponse.json({
      success: true,
      data: newSalesOrder,
      message: "Sales order created successfully",
      message_ar: "تم إنشاء أمر البيع بنجاح",
      governance: {
        enforced: true,
        companyId: enhancedContext.companyId,
        branchId: enhancedContext.branchId,
        warehouseId: enhancedContext.warehouseId,
        costCenterId: enhancedContext.costCenterId,
        role: enhancedContext.role,
        isAdmin: enhancedContext.isAdmin,
        branchDefaults: {
          warehouseId: enhancedContext.warehouseId,
          costCenterId: enhancedContext.costCenterId
        }
      }
    }, { status: 201 })

  } catch (error: any) {
    console.error("[API /sales-orders POST] Error:", error)
    return NextResponse.json({
      error: error.message,
      error_ar: error.message?.includes('Warehouse') || error.message?.includes('Cost center')
        ? error.message
        : "حدث خطأ غير متوقع"
    }, {
      status: error.message?.includes('Violation') || error.message?.includes('governance') ? 400 : 500
    })
  }
}
