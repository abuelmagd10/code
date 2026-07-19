import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createSSR } from "@/lib/supabase/server"

// حقول العنوان - مسموح تعديلها في جميع الحالات
const ADDRESS_FIELDS = ['address', 'governorate', 'city', 'country', 'detailed_address']

// الحالات التي تمنع تعديل البيانات الأساسية للعميل
const BLOCKING_INVOICE_STATUSES = ['sent', 'partially_paid', 'paid']

// 🔐 حقول الحوكمة المحمية - لا يمكن تغييرها إلا بواسطة المالك أو المدير العام
const PROTECTED_GOVERNANCE_FIELDS = ['branch_id', 'cost_center_id', 'warehouse_id']

// 🔐 الأدوار المسموح لها بتغيير حقول الحوكمة
const GOVERNANCE_ADMIN_ROLES = ['owner', 'admin', 'general_manager', 'gm', 'generalmanager', 'super_admin', 'superadmin']

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

    const normalizedRole = String(member.role || 'staff').trim().toLowerCase().replace(/\s+/g, '_')
    const isGovernanceAdmin = GOVERNANCE_ADMIN_ROLES.includes(normalizedRole)

    // هل التعديل يحتوي على حقول غير العنوان؟
    //
    // v3.74.743 — a governance field the caller is authorised to change no
    // longer counts as "non-address" for the active-invoice gate below.
    //
    // Two rules were colliding. This route already grants Owner / General
    // Manager the right to reassign branch_id, and logs it (see immediately
    // below). But branch_id is not an address field, so isAddressOnlyUpdate
    // became false and the invoice check further down rejected the request
    // with "you can only edit the address" — refusing the very permission the
    // lines under this one had just granted.
    //
    // The effect was a customer whose branch was recorded wrongly could never
    // be corrected once it had an invoice. Neither the UI nor the API offered
    // any path, while both the database trigger and this route's own role check
    // said an owner may do it.
    //
    // The invoice gate exists to protect financial data — name, tax id, credit
    // terms. A branch reassignment changes none of those; documents keep the
    // branch they were raised in. So it belongs with the address exemption, but
    // only for the roles already permitted to make it.
    const permittedGovernanceFields = isGovernanceAdmin ? PROTECTED_GOVERNANCE_FIELDS : []
    const nonAddressFields = requestedFields.filter(
      field => !ADDRESS_FIELDS.includes(field) && !permittedGovernanceFields.includes(field)
    )
    const isAddressOnlyUpdate = nonAddressFields.length === 0

    // فحص إذا كان التعديل يحتوي على حقول حوكمة محمية
    const governanceFieldsInRequest = requestedFields.filter(field => PROTECTED_GOVERNANCE_FIELDS.includes(field))

    if (governanceFieldsInRequest.length > 0 && !isGovernanceAdmin) {
      // 🚫 منع تغيير حقول الحوكمة للمستخدمين غير المصرح لهم
      return NextResponse.json({
        success: false,
        error: `Cannot modify governance fields (${governanceFieldsInRequest.join(', ')}). Only Owner or General Manager can change branch assignment.`,
        error_ar: `🔐 لا يمكن تغيير حقول الحوكمة (${governanceFieldsInRequest.join(', ')}). فقط المالك أو المدير العام يمكنه تغيير تعيين الفرع.`,
        governance_violation: true,
        protected_fields: governanceFieldsInRequest
      }, { status: 403 })
    }

    // 🔐 إذا كان المستخدم مسموح له بتغيير الحوكمة، نسجل ذلك في Audit Log
    if (governanceFieldsInRequest.length > 0 && isGovernanceAdmin) {
      try {
        await db.from("audit_logs").insert({
          company_id: companyId,
          user_id: user.id,
          action: "customer_governance_changed",
          entity_type: "customer",
          entity_id: customerId,
          old_values: {
            customer_id: customerId,
            customer_name: customer.name,
            branch_id: customer.branch_id,
            cost_center_id: customer.cost_center_id,
            warehouse_id: customer.warehouse_id
          },
          new_values: {
            customer_id: customerId,
            customer_name: customer.name,
            branch_id: updateData.branch_id ?? customer.branch_id,
            cost_center_id: updateData.cost_center_id ?? customer.cost_center_id,
            warehouse_id: updateData.warehouse_id ?? customer.warehouse_id
          },
          metadata: {
            modified_by: user.id,
            modified_at: new Date().toISOString(),
            governance_fields_changed: governanceFieldsInRequest,
            admin_role: normalizedRole,
            reason: "Governance admin override"
          }
        })
      } catch (auditError) {
        console.error("Failed to log governance change to audit_logs:", auditError)
      }
    }

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
    // v3.74.743 — a governance change must be written as the USER, not as the
    // service role.
    //
    // protect_customer_branch_id() decides whether to allow the change by
    // reading auth.uid() and looking up that user's role. The service-role
    // client has no auth.uid(), so the trigger saw NULL, defaulted the role to
    // 'staff', and rejected the update — even for an owner. It also meant the
    // audit row the trigger writes would have had a null actor.
    //
    // So the third guard cancelled a permission the first two had granted. Each
    // was written sensibly on its own; together they made the owner's stated
    // right to reassign a branch impossible to exercise anywhere in the system.
    //
    // Governance changes now go through the session client. RLS still applies
    // (customers_update → can_modify_data), the trigger sees the real user, and
    // the audit entry names them. Everything else keeps using the service-role
    // client exactly as before.
    const writeClient = (governanceFieldsInRequest.length > 0 && isGovernanceAdmin) ? ssr : db

    const { error: updateError } = await writeClient
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

