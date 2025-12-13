import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createSSR } from "@/lib/supabase/server"

// حقول العنوان - مسموح تعديلها في جميع الحالات
const ADDRESS_FIELDS = ['address', 'governorate', 'city', 'country', 'detailed_address']

// الحالات التي تمنع تعديل البيانات الأساسية للعميل
const BLOCKING_INVOICE_STATUSES = ['sent', 'partially_paid', 'paid']

export async function POST(request: NextRequest) {
  try {
    const { customerId, companyId, data } = await request.json()

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

    // إنشاء client للاستعلامات
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
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

    // التحقق من العميل وجلب بياناته الحالية
    const { data: customer } = await db
      .from("customers")
      .select("*")
      .eq("id", customerId)
      .eq("company_id", companyId)
      .maybeSingle()

    if (!customer) {
      return NextResponse.json(
        { success: false, error: "Customer not found", error_ar: "العميل غير موجود" },
        { status: 404 }
      )
    }

    // تحديد الحقول المطلوب تعديلها
    const updateData = data || {}
    const requestedFields = Object.keys(updateData)

    // هل التعديل يحتوي على حقول غير العنوان؟
    const nonAddressFields = requestedFields.filter(field => !ADDRESS_FIELDS.includes(field))
    const isAddressOnlyUpdate = nonAddressFields.length === 0

    // ============================================
    // 🔒 فحص الفواتير النشطة (إذا كان التعديل على بيانات أساسية)
    // ============================================
    if (!isAddressOnlyUpdate) {
      // جلب الفواتير المرتبطة بالعميل
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

      // فحص إذا كانت هناك فواتير بحالات تمنع التعديل
      if (invoices && invoices.length > 0) {
        const blockingInvoices = invoices.filter((inv: any) =>
          BLOCKING_INVOICE_STATUSES.includes((inv.status || "").toLowerCase())
        )

        if (blockingInvoices.length > 0) {
          const statusMap: Record<string, string> = {
            sent: "مرسلة",
            partially_paid: "مدفوعة جزئياً",
            paid: "مدفوعة بالكامل"
          }

          const statusCounts: Record<string, number> = {}
          const invoiceNumbers: string[] = []

          blockingInvoices.forEach((inv: any) => {
            const status = (inv.status || "").toLowerCase()
            statusCounts[status] = (statusCounts[status] || 0) + 1
            if (invoiceNumbers.length < 5) {
              invoiceNumbers.push(inv.invoice_number)
            }
          })

          const statusSummary = Object.entries(statusCounts)
            .map(([status, count]) => `${statusMap[status] || status}: ${count}`)
            .join("، ")

          return NextResponse.json({
            success: false,
            can_edit: false,
            reason: "blocking_invoices",
            error: `Cannot edit customer data. Has ${blockingInvoices.length} active invoice(s). You can only edit the address.`,
            error_ar: `❌ لا يمكن تعديل بيانات هذا العميل لوجود ${blockingInvoices.length} فاتورة نشطة (${statusSummary}).\n\n📋 أرقام الفواتير: ${invoiceNumbers.join("، ")}${blockingInvoices.length > 5 ? " والمزيد..." : ""}\n\n✅ يمكنك تعديل العنوان فقط.\nبرجاء مراجعة الفواتير أولاً.`,
            blocking_invoices: blockingInvoices.slice(0, 10),
            total_blocking: blockingInvoices.length,
            address_only_allowed: true
          }, { status: 400 })
        }
      }

      // التحقق من الصلاحية للتعديل الكامل
      const isOwnerOrAdmin = ["owner", "admin"].includes(member.role || "")
      const isCreator = customer.created_by_user_id === user.id

      let hasRolePermission = false
      if (!isOwnerOrAdmin && !isCreator) {
        const { data: rolePerm } = await db
          .from("company_role_permissions")
          .select("can_update, all_access")
          .eq("company_id", companyId)
          .eq("role", member.role || "")
          .eq("resource", "customers")
          .maybeSingle()

        hasRolePermission = rolePerm?.can_update === true || rolePerm?.all_access === true
      }

      if (!isOwnerOrAdmin && !isCreator && !hasRolePermission) {
        return NextResponse.json(
          {
            success: false,
            error: "No permission to update this customer",
            error_ar: "ليس لديك صلاحية تعديل هذا العميل. يمكنك فقط تعديل العملاء الذين قمت بإنشائهم أو تعديل العنوان فقط."
          },
          { status: 403 }
        )
      }
    }

    // ============================================
    // 📝 تسجيل تعديل العنوان في Audit Log
    // ============================================
    const addressFieldsBeingUpdated = requestedFields.filter(field => ADDRESS_FIELDS.includes(field))
    if (addressFieldsBeingUpdated.length > 0) {
      // جمع القيم القديمة والجديدة للعنوان
      const oldAddressData: Record<string, any> = {}
      const newAddressData: Record<string, any> = {}

      for (const field of addressFieldsBeingUpdated) {
        oldAddressData[field] = customer[field] || null
        newAddressData[field] = updateData[field] || null
      }

      // تسجيل في audit_logs
      try {
        await db.from("audit_logs").insert({
          company_id: companyId,
          user_id: user.id,
          action: "customer_address_updated",
          entity_type: "customer",
          entity_id: customerId,
          old_values: {
            customer_id: customerId,
            customer_name: customer.name,
            ...oldAddressData
          },
          new_values: {
            customer_id: customerId,
            customer_name: customer.name,
            ...newAddressData
          },
          metadata: {
            modified_by: user.id,
            modified_at: new Date().toISOString(),
            fields_updated: addressFieldsBeingUpdated,
            is_address_only: isAddressOnlyUpdate
          }
        })
      } catch (auditError) {
        console.error("Failed to log address update to audit_logs:", auditError)
        // نستمر حتى لو فشل التسجيل في Audit Log
      }
    }

    // ============================================
    // ✅ تنفيذ التعديل
    // ============================================
    const { error: updateError } = await db
      .from("customers")
      .update(updateData)
      .eq("id", customerId)
      .eq("company_id", companyId)

    if (updateError) {
      return NextResponse.json({
        success: false,
        error: updateError.message,
        error_ar: `فشل في تعديل العميل: ${updateError.message}`
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: "Customer updated successfully",
      message_ar: isAddressOnlyUpdate ? "تم تعديل عنوان العميل بنجاح" : "تم تعديل بيانات العميل بنجاح",
      address_only: isAddressOnlyUpdate
    })

  } catch (error: any) {
    console.error("Error in customer update API:", error)
    return NextResponse.json({
      success: false,
      error: error?.message || "Internal server error",
      error_ar: "حدث خطأ داخلي في الخادم"
    }, { status: 500 })
  }
}

