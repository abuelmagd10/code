/**
 * 🔒 API أوامر البيع مع الحوكمة الإلزامية
 * 
 * GET /api/sales-orders - جلب أوامر البيع مع تطبيق الحوكمة
 * POST /api/sales-orders - إنشاء أمر بيع جديد مع الحوكمة
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"
import {
  enforceGovernance,
  applyGovernanceFilters,
  validateGovernanceData,
  addGovernanceData
} from "@/lib/governance-middleware"

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

      // helper: استدعاء create_notification مباشراً عبر server-side supabase
      const sendNotification = async (params: {
        branchId?: string | null
        costCenterId?: string | null
        warehouseId?: string | null
        assignedToRole: string
        title: string
        message: string
        eventKey: string
        category: string
        referenceType?: string
        referenceId?: string
      }) => {
        const { error: notifErr } = await supabase.rpc('create_notification', {
          p_company_id: companyId,
          p_reference_type: params.referenceType || 'sales_order',
          p_reference_id: params.referenceId || newSalesOrder.id,
          p_title: params.title,
          p_message: params.message,
          p_created_by: createdById,
          p_branch_id: params.branchId ?? null,
          p_cost_center_id: params.costCenterId ?? null,
          p_warehouse_id: params.warehouseId ?? null,
          p_assigned_to_role: params.assignedToRole,
          p_assigned_to_user: null,
          p_priority: 'normal',
          p_event_key: params.eventKey,
          p_severity: 'info',
          p_category: params.category
        })
        if (notifErr) {
          console.error(`⚠️ [SALES_ORDER] Failed to notify ${params.assignedToRole}:`, notifErr.message)
        } else {
          console.log(`✅ [SALES_ORDER] Notified ${params.assignedToRole} successfully`)
        }
      }

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

      // 1️⃣ إشعار لمحاسب الفرع — يُوجَّه للفاتورة إن وُجدت، وإلا لأمر البيع
      const accountantRefType = autoInvoiceResult?.invoice_id ? 'invoice' : 'sales_order'
      const accountantRefId   = autoInvoiceResult?.invoice_id ?? newSalesOrder.id
      const accountantMsg     = autoInvoiceResult?.invoice_id
        ? `تم إنشاء فاتورة بيع جديدة رقم (${autoInvoiceResult.invoice_number}) في فرعكم وبانتظار المتابعة`
        : `تم إنشاء أمر بيع جديد في فرعكم رقم (${soNumber}) وبانتظار المتابعة`

      await sendNotification({
        branchId: branchIdForNotif,
        costCenterId: enhancedContext.cost_center_id || null,
        warehouseId: enhancedContext.warehouse_id || null,
        assignedToRole: 'accountant',
        title: autoInvoiceResult?.invoice_id ? 'فاتورة بيع جديدة في فرعكم' : 'أمر بيع جديد في فرعكم',
        message: accountantMsg,
        eventKey: `sales_order:${newSalesOrder.id}:created:accountant`,
        category: 'finance',
        referenceType: accountantRefType,
        referenceId: accountantRefId,
      })

      // 2️⃣ إشعار لمالك الشركة (جميع الفروع - بدون branch_id)
      await sendNotification({
        branchId: null,
        costCenterId: null,
        warehouseId: null,
        assignedToRole: 'owner',
        title: 'أمر بيع جديد',
        message: `تم إنشاء أمر بيع جديد رقم (${soNumber}) في فرع (${branchName})`,
        eventKey: `sales_order:${newSalesOrder.id}:created:owner`,
        category: 'sales'
      })

      // 3️⃣ إشعار للمدير العام (جميع الفروع - بدون branch_id)
      await sendNotification({
        branchId: null,
        costCenterId: null,
        warehouseId: null,
        assignedToRole: 'general_manager',
        title: 'أمر بيع جديد',
        message: `تم إنشاء أمر بيع جديد رقم (${soNumber}) في فرع (${branchName})`,
        eventKey: `sales_order:${newSalesOrder.id}:created:general_manager`,
        category: 'sales'
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

