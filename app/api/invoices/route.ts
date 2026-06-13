import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"
import { getRoleAccessLevel } from "@/lib/validation"
import { apiGuard, asyncAuditLog, ErrorHandler, ERPError } from "@/lib/core"

// 🔐 الأدوار المميزة التي يمكنها فلترة الفروع
const PRIVILEGED_ROLES = ['owner', 'admin', 'general_manager']

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // 🔐 قراءة branch_id من query parameters (للأدوار المميزة فقط)
    const { searchParams } = new URL(request.url)
    const requestedBranchId = searchParams.get('branch_id')

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) {
      return NextResponse.json({ error: "No company found" }, { status: 400 })
    }

    const { data: member } = await supabase
      .from("company_members")
      .select("role, branch_id, cost_center_id, warehouse_id")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .single()

    if (!member) {
      return NextResponse.json({ error: "User not found in company" }, { status: 403 })
    }

    const accessLevel = getRoleAccessLevel(member.role)
    const canFilterByBranch = PRIVILEGED_ROLES.includes(member.role.toLowerCase())

    let query = supabase
      .from("invoices")
      .select("*, customers(name, phone), branches(name)")
      .eq("company_id", companyId)

    // 🔐 تطبيق فلترة الفروع حسب الصلاحيات
    if (canFilterByBranch && requestedBranchId) {
      // المستخدم المميز اختار فرعاً معيناً
      query = query.eq("branch_id", requestedBranchId)
    } else if (accessLevel === 'own') {
      if (member.branch_id) {
        query = query.eq("branch_id", member.branch_id)
        query = query.or(`created_by_user_id.eq.${user.id},created_by_user_id.is.null`)
      } else {
        query = query.eq("created_by_user_id", user.id)
      }
    } else if (accessLevel === 'branch' && member.branch_id) {
      query = query.eq("branch_id", member.branch_id)
    }
    // else: المستخدم المميز بدون فلتر = جميع الفروع

    query = query.order("invoice_date", { ascending: false })

    const { data: invoices, error: dbError } = await query

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: invoices || [],
      meta: {
        total: (invoices || []).length,
        role: member.role,
        accessLevel: accessLevel
      }
    })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { context, errorResponse } = await apiGuard(req, {
      requireAuth: true,
      requireCompany: true,
      resource: "invoices",
      action: "write"
    })

    if (errorResponse) return errorResponse

    const { user, companyId, member } = context!
    const body = await req.json()
    const supabase = await createClient()

    // 1️⃣ Permissions Scope Evaluation
    const isCompanyLevelAdmin = ["owner", "admin", "manager"].includes(member.role)
    const isNormalRole = !isCompanyLevelAdmin

    // 2️⃣ Enforce role constraints
    let finalBranchId = body.branch_id || null
    let finalCostCenterId = body.cost_center_id || null
    let finalWarehouseId = body.warehouse_id || null

    if (isNormalRole) {
      finalBranchId = member.branch_id || finalBranchId
      finalCostCenterId = member.cost_center_id || finalCostCenterId
      finalWarehouseId = member.warehouse_id || finalWarehouseId
    }

    // Prepare invoice data and items for the RPC
    const invoiceData = {
      ...body,
      company_id: companyId,
      branch_id: finalBranchId,
      cost_center_id: finalCostCenterId,
      warehouse_id: finalWarehouseId,
      created_by_user_id: user.id
    }

    // Remove items from invoiceData so it can be passed as p_invoice_data cleanly
    const invoiceItems = invoiceData.items || []
    delete invoiceData.items

    // v3.74.140 — Mandatory line-items guard. Mirrors the PO fix in
    // v3.74.139. Without this, POST /api/invoices with items:[] (or rows
    // missing product_id / non-positive quantity) was reaching the
    // GL-writing RPC and the DB would happily create an invoice with no
    // line items and a zero-amount accounting entry. This is the most
    // sensitive write path in the system because it both touches AR and
    // posts to the general ledger; protecting it at the API layer ensures
    // no non-UI caller (mobile, scripts, third-party) can bypass the
    // browser-side checks in /invoices/new.
    if (!Array.isArray(invoiceItems) || invoiceItems.length === 0) {
      return NextResponse.json({
        success: false,
        error: "Cannot create an invoice without line items.",
        error_ar: "لا يمكن إنشاء فاتورة بدون بنود. الرجاء إضافة منتج واحد على الأقل.",
      }, { status: 422 })
    }
    const invalidInvoiceRows: number[] = []
    invoiceItems.forEach((item: any, idx: number) => {
      const hasProduct = Boolean(item?.product_id)
      const qty = Number(item?.quantity) || 0
      const price = Number(item?.unit_price) || 0
      if (!hasProduct || qty <= 0 || price < 0) {
        invalidInvoiceRows.push(idx + 1)
      }
    })
    if (invalidInvoiceRows.length > 0) {
      return NextResponse.json({
        success: false,
        error: `Invoice has incomplete line items at row(s): ${invalidInvoiceRows.join(", ")}. Each row must have a product, a positive quantity and a unit price.`,
        error_ar: `الفاتورة تحتوى على بنود ناقصة فى السطر/السطور: ${invalidInvoiceRows.join("، ")}. كل بند يجب أن يحتوى على منتج، كمية أكبر من صفر، وسعر وحدة.`,
        invalid_rows: invalidInvoiceRows,
      }, { status: 422 })
    }

    // 2.5️⃣ Defensive bundle-completeness guard (Req 2 / Phase B.4.5)
    //   Refuses an invoice that omits mandatory bundle children for any product
    //   the caller included. This protects the pipeline against non-UI callers
    //   (mobile / scripts / third-party) that would otherwise bypass the
    //   BundleSelectionDialog. The DB and accounting RPCs are NOT modified.
    if (Array.isArray(invoiceItems) && invoiceItems.length > 0) {
      const { data: validation, error: validationErr } = await supabase.rpc(
        'bdl_validate_bundle_completeness',
        { p_items: invoiceItems, p_company_id: companyId }
      )
      if (validationErr) {
        console.error("Bundle validation RPC error:", validationErr)
      } else if (validation && validation.complete === false) {
        return NextResponse.json({
          success: false,
          error:   'بعض الأصناف المرفقة الإلزامية ناقصة',
          code:    'BUNDLE_INCOMPLETE',
          details: validation.missing ?? [],
        }, { status: 400 })
      }
    }

    // 2.6️⃣ Defensive stock-availability guard (Option B — Req 2 follow-up)
    //   Refuses an invoice whose non-service items demand more than what's
    //   available in the target branch (including duplicated rows — we
    //   aggregate by product_id first). Bundle children with included/free
    //   pricing still consume inventory and ARE checked. Services are
    //   skipped. The DB pipeline is NOT modified.
    if (Array.isArray(invoiceItems) && invoiceItems.length > 0 && finalBranchId) {
      const aggregated: Record<string, number> = {}
      for (const it of invoiceItems) {
        if (!it?.product_id || it.item_type === 'service') continue
        aggregated[it.product_id] = (aggregated[it.product_id] || 0) + (Number(it.quantity) || 0)
      }
      const productIds = Object.keys(aggregated)
      if (productIds.length > 0) {
        // NOTE: we query the inventory_available_balance view directly
        // because the public.get_inventory_available_balance RPC has a
        // declared return-type mismatch (integer vs. bigint) that causes a
        // 42804 error at runtime. The view itself is correct and exposes
        // the same per-warehouse rows; we sum them per product.
        const { data: balanceRows, error: balErr } = await supabase
          .from('inventory_available_balance')
          .select('product_id, available_quantity')
          .eq('company_id', companyId)
          .eq('branch_id', finalBranchId)
          .in('product_id', productIds)
        if (balErr) {
          console.error('[INV_STOCK_CHECK_ERR]', balErr)
        }
        const totals: Record<string, number> = {}
        productIds.forEach(pid => { totals[pid] = 0 })
        ;(balanceRows ?? []).forEach((r: any) => {
          totals[r.product_id] = (totals[r.product_id] || 0) + Math.max(0, Number(r.available_quantity) || 0)
        })
        const balances = productIds.map(pid => ({ product_id: pid, available: totals[pid] }))

        const insufficient = balances
          .map(b => {
            const requested = aggregated[b.product_id] ?? 0
            return { ...b, requested, shortage: requested - b.available }
          })
          .filter(b => b.requested > b.available)

        if (insufficient.length > 0) {
          return NextResponse.json({
            success: false,
            error:   'عجز في المخزون',
            code:    'INSUFFICIENT_STOCK',
            details: insufficient.map(i => ({
              product_id:         i.product_id,
              requested_quantity: i.requested,
              available_quantity: i.available,
              shortage:           i.shortage,
            })),
          }, { status: 400 })
        }
      }
    }

    // 3️⃣ Call Atomic RPC (handles creation and synchronous accounting engine)
    const { data: rpcResult, error: rpcError } = await supabase.rpc('create_sales_invoice_atomic', {
      p_invoice_data: invoiceData,
      p_invoice_items: invoiceItems
    })

    if (rpcError || !rpcResult?.success) {
      console.error("RPC Error:", rpcError)
      return ErrorHandler.handle(new ERPError('ERR_SYSTEM', 'فشل في إنشاء الفاتورة', 500, rpcError?.message || 'Unknown RPC error'))
    }

    // 4️⃣ Async Audit Logging (Fire and Forget)
    asyncAuditLog({
      companyId,
      userId: user.id,
      userEmail: user.email,
      action: 'CREATE',
      table: 'invoices',
      recordId: rpcResult.invoice_id,
      recordIdentifier: 'Invoice Created via Atomic API',
      newData: {
        total_amount: body.total_amount,
        status: body.status,
        branch_id: finalBranchId,
        cost_center_id: finalCostCenterId,
        warehouse_id: finalWarehouseId
      },
      reason: 'Created sales invoice via atomic RPC'
    })

    return NextResponse.json({
      success: true,
      data: {
        id: rpcResult.invoice_id,
        ...invoiceData,
        items: invoiceItems
      }
    })

  } catch (error: any) {
    return ErrorHandler.handle(error)
  }
}
