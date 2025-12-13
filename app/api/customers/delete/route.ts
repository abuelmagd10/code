import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createSSR } from "@/lib/supabase/server"

// الحالات التي تمنع حذف العميل
const BLOCKING_INVOICE_STATUSES = ['sent', 'partially_paid', 'paid']

export async function POST(request: NextRequest) {
  try {
    const { customerId, companyId } = await request.json()

    if (!customerId || !companyId) {
      return NextResponse.json(
        { success: false, error: "Missing customerId or companyId", error_ar: "معرف العميل أو الشركة مفقود" },
        { status: 400 }
      )
    }

    // إنشاء Supabase client للمصادقة
    const ssr = await createSSR()

    // التحقق من تسجيل الدخول
    const { data: { user }, error: authError } = await ssr.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized", error_ar: "غير مصرح - يرجى تسجيل الدخول مرة أخرى" },
        { status: 401 }
      )
    }

    // إنشاء client للاستعلامات - نستخدم admin إذا كان متاحاً، وإلا نستخدم ssr
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""

    // استخدام admin client إذا كان متاحاً، وإلا استخدام ssr
    const db = (url && serviceKey)
      ? createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } })
      : ssr

    // التحقق من عضوية المستخدم في الشركة
    const { data: member, error: memberError } = await db
      .from("company_members")
      .select("role")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .maybeSingle()

    if (memberError) {
      console.error("Error checking membership:", memberError, { companyId, userId: user.id })
      return NextResponse.json(
        { success: false, error: `Failed to verify membership: ${memberError.message}`, error_ar: `فشل في التحقق من العضوية: ${memberError.message}` },
        { status: 500 }
      )
    }

    if (!member) {
      return NextResponse.json(
        { success: false, error: "Not a member of this company", error_ar: "لست عضواً في هذه الشركة" },
        { status: 403 }
      )
    }

    // التحقق من العميل نفسه - هل منشئه هو المستخدم الحالي؟
    const { data: customer } = await db
      .from("customers")
      .select("id, name, created_by_user_id")
      .eq("id", customerId)
      .eq("company_id", companyId)
      .maybeSingle()

    if (!customer) {
      return NextResponse.json(
        { success: false, error: "Customer not found", error_ar: "العميل غير موجود" },
        { status: 404 }
      )
    }

    // التحقق من الصلاحية:
    // 1. owner و admin يمكنهم حذف أي عميل
    // 2. الموظف يمكنه حذف العملاء الذين أنشأهم فقط
    // 3. أو إذا كانت صلاحية الحذف ممنوحة له في جدول الصلاحيات
    const isOwnerOrAdmin = ["owner", "admin"].includes(member.role || "")
    const isCreator = customer.created_by_user_id === user.id

    // التحقق من جدول الصلاحيات
    let hasRolePermission = false
    if (!isOwnerOrAdmin && !isCreator) {
      const { data: rolePerm } = await db
        .from("company_role_permissions")
        .select("can_delete, all_access")
        .eq("company_id", companyId)
        .eq("role", member.role || "")
        .eq("resource", "customers")
        .maybeSingle()

      hasRolePermission = rolePerm?.can_delete === true || rolePerm?.all_access === true
    }

    if (!isOwnerOrAdmin && !isCreator && !hasRolePermission) {
      return NextResponse.json(
        {
          success: false,
          error: "No permission to delete this customer",
          error_ar: "ليس لديك صلاحية حذف هذا العميل. يمكنك فقط حذف العملاء الذين قمت بإنشائهم."
        },
        { status: 403 }
      )
    }

    // ============================================
    // 🔒 التحقق من الفواتير المرتبطة بالعميل
    // ============================================

    // 1. جلب جميع الفواتير المرتبطة بالعميل
    const { data: invoices, error: invoicesError } = await db
      .from("invoices")
      .select("id, invoice_number, status")
      .eq("customer_id", customerId)
      .eq("company_id", companyId)

    if (invoicesError) {
      return NextResponse.json(
        { success: false, error: "Failed to check invoices", error_ar: "فشل في فحص الفواتير" },
        { status: 500 }
      )
    }

    // 2. فحص حالات الفواتير
    if (invoices && invoices.length > 0) {
      // فحص إذا كانت هناك فواتير بحالات تمنع الحذف
      const blockingInvoices = invoices.filter((inv: any) => 
        BLOCKING_INVOICE_STATUSES.includes((inv.status || "").toLowerCase())
      )

      if (blockingInvoices.length > 0) {
        // تجميع الفواتير حسب الحالة
        const statusCounts: Record<string, number> = {}
        const invoiceNumbers: string[] = []
        
        blockingInvoices.forEach((inv: any) => {
          const status = (inv.status || "").toLowerCase()
          statusCounts[status] = (statusCounts[status] || 0) + 1
          if (invoiceNumbers.length < 5) {
            invoiceNumbers.push(inv.invoice_number)
          }
        })

        const statusMap: Record<string, string> = {
          sent: "مرسلة",
          partially_paid: "مدفوعة جزئياً",
          paid: "مدفوعة بالكامل"
        }

        const statusSummary = Object.entries(statusCounts)
          .map(([status, count]) => `${statusMap[status] || status}: ${count}`)
          .join("، ")

        return NextResponse.json({
          success: false,
          can_delete: false,
          reason: "blocking_invoices",
          error: `Cannot delete customer. Has ${blockingInvoices.length} invoice(s) with blocking status: ${invoiceNumbers.join(", ")}${blockingInvoices.length > 5 ? " and more..." : ""}`,
          error_ar: `لا يمكن حذف هذا العميل لوجود ${blockingInvoices.length} فاتورة مرتبطة به (${statusSummary}).\nأرقام الفواتير: ${invoiceNumbers.join("، ")}${blockingInvoices.length > 5 ? " والمزيد..." : ""}\nبرجاء مراجعة الفواتير أولاً.`,
          blocking_invoices: blockingInvoices.slice(0, 10),
          total_blocking: blockingInvoices.length
        }, { status: 400 })
      }

      // 3. إذا كانت جميع الفواتير مسودة، يجب حذفها أولاً
      const draftInvoices = invoices.filter((inv: any) => 
        (inv.status || "").toLowerCase() === "draft"
      )

      if (draftInvoices.length > 0) {
        return NextResponse.json({
          success: false,
          can_delete: false,
          reason: "has_draft_invoices",
          error: `Customer has ${draftInvoices.length} draft invoice(s). Please delete them first.`,
          error_ar: `العميل لديه ${draftInvoices.length} فاتورة مسودة. يرجى حذفها أولاً قبل حذف العميل.`,
          draft_invoices: draftInvoices.slice(0, 10),
          total_drafts: draftInvoices.length
        }, { status: 400 })
      }
    }

    // ============================================
    // 🔒 التحقق من أوامر البيع المرتبطة بالعميل
    // ============================================
    const { data: salesOrders } = await db
      .from("sales_orders")
      .select("id, order_number, status")
      .eq("customer_id", customerId)
      .eq("company_id", companyId)

    if (salesOrders && salesOrders.length > 0) {
      // فحص إذا كانت هناك أوامر بيع غير مسودة
      const activeSalesOrders = salesOrders.filter((so: any) =>
        (so.status || "").toLowerCase() !== "draft"
      )

      if (activeSalesOrders.length > 0) {
        const orderNumbers = activeSalesOrders.slice(0, 5).map((so: any) => so.order_number)
        return NextResponse.json({
          success: false,
          can_delete: false,
          reason: "has_active_sales_orders",
          error: `Customer has ${activeSalesOrders.length} active sales order(s): ${orderNumbers.join(", ")}`,
          error_ar: `العميل لديه ${activeSalesOrders.length} أمر بيع نشط: ${orderNumbers.join("، ")}.\nيرجى إلغاء أوامر البيع أولاً.`,
          total_orders: activeSalesOrders.length
        }, { status: 400 })
      }
    }

    // ============================================
    // 🔒 التحقق من المدفوعات المرتبطة بالعميل
    // ============================================
    const { data: payments } = await db
      .from("payments")
      .select("id, amount")
      .eq("customer_id", customerId)
      .eq("company_id", companyId)

    if (payments && payments.length > 0) {
      return NextResponse.json({
        success: false,
        can_delete: false,
        reason: "has_payments",
        error: `Customer has ${payments.length} payment record(s). Cannot delete.`,
        error_ar: `العميل لديه ${payments.length} سجل مدفوعات. لا يمكن الحذف.`,
        total_payments: payments.length
      }, { status: 400 })
    }

    // ============================================
    // ✅ تنفيذ الحذف - جميع الشروط مستوفاة
    // ============================================
    const { error: deleteError, count } = await db
      .from("customers")
      .delete({ count: 'exact' })
      .eq("id", customerId)
      .eq("company_id", companyId)

    if (deleteError) {
      return NextResponse.json({
        success: false,
        error: deleteError.message,
        error_ar: `فشل في حذف العميل: ${deleteError.message}`
      }, { status: 500 })
    }

    if (count === 0) {
      return NextResponse.json({
        success: false,
        error: "Customer not found or already deleted",
        error_ar: "العميل غير موجود أو تم حذفه مسبقاً"
      }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      message: "Customer deleted successfully",
      message_ar: "تم حذف العميل بنجاح"
    })

  } catch (error: any) {
    console.error("Error in customer delete API:", error)
    return NextResponse.json({
      success: false,
      error: error?.message || "Internal server error",
      error_ar: "حدث خطأ داخلي في الخادم"
    }, { status: 500 })
  }
}
