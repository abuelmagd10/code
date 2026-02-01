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
    
    // 7️⃣ التأكد من أن جميع الحقول المطلوبة موجودة
    if (!finalData.branch_id || !finalData.warehouse_id || !finalData.cost_center_id) {
      return NextResponse.json({ 
        error: "Missing required fields: branch_id, warehouse_id, and cost_center_id are required",
        error_ar: "الحقول المطلوبة مفقودة: يجب تحديد الفرع والمخزن ومركز التكلفة" 
      }, { status: 400 })
    }
    
    // 7️⃣ الإدخال في قاعدة البيانات
    const { data: newSalesOrder, error: insertError } = await supabase
      .from("sales_orders")
      .insert(finalData)
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

    // 8️⃣ إرسال الإشعارات بعد إنشاء أمر البيع بنجاح
    try {
      const { createNotification } = await import('@/lib/governance-layer')

      // جلب اسم الفرع للإشعارات
      let branchName = 'غير محدد'
      if (enhancedContext.branchId) {
        const { data: branchData } = await supabase
          .from('branches')
          .select('name, branch_name')
          .eq('id', enhancedContext.branchId)
          .maybeSingle()
        branchName = branchData?.name || branchData?.branch_name || 'غير محدد'
      }

      const soNumber = newSalesOrder.so_number || 'غير محدد'

      // 1️⃣ إشعار لمحاسب الفرع (نفس الشركة + نفس الفرع)
      await createNotification({
        companyId: enhancedContext.companyId,
        referenceType: 'sales_order',
        referenceId: newSalesOrder.id,
        title: 'أمر بيع جديد في فرعكم',
        message: `تم إنشاء أمر بيع جديد في فرعكم رقم (${soNumber}) وبانتظار المتابعة`,
        createdBy: enhancedContext.userId,
        branchId: enhancedContext.branchId,
        costCenterId: enhancedContext.costCenterId,
        warehouseId: enhancedContext.warehouseId,
        assignedToRole: 'accountant',
        priority: 'normal',
        eventKey: `sales_order:${newSalesOrder.id}:created:accountant`,
        severity: 'info',
        category: 'finance'
      })

      // 2️⃣ إشعار لمالك الشركة (نفس الشركة فقط - جميع الفروع)
      await createNotification({
        companyId: enhancedContext.companyId,
        referenceType: 'sales_order',
        referenceId: newSalesOrder.id,
        title: 'أمر بيع جديد',
        message: `تم إنشاء أمر بيع جديد رقم (${soNumber}) في فرع (${branchName})`,
        createdBy: enhancedContext.userId,
        // ✅ لا نحدد branchId هنا لأن المالك يرى جميع الفروع
        assignedToRole: 'owner',
        priority: 'normal',
        eventKey: `sales_order:${newSalesOrder.id}:created:owner`,
        severity: 'info',
        category: 'sales'
      })

      // 3️⃣ إشعار للمدير العام (نفس الشركة فقط - جميع الفروع)
      await createNotification({
        companyId: enhancedContext.companyId,
        referenceType: 'sales_order',
        referenceId: newSalesOrder.id,
        title: 'أمر بيع جديد',
        message: `تم إنشاء أمر بيع جديد رقم (${soNumber}) في فرع (${branchName})`,
        createdBy: enhancedContext.userId,
        // ✅ لا نحدد branchId هنا لأن المدير العام يرى جميع الفروع
        assignedToRole: 'general_manager',
        priority: 'normal',
        eventKey: `sales_order:${newSalesOrder.id}:created:general_manager`,
        severity: 'info',
        category: 'sales'
      })

      console.log('✅ [SALES_ORDER] Notifications sent successfully for SO:', soNumber)
    } catch (notifError: any) {
      // ✅ لا نفشل العملية إذا فشلت الإشعارات - نسجل الخطأ فقط
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

