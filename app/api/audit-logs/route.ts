import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { requireOwnerOrAdmin } from "@/lib/api-security";
import { apiError, apiSuccess, HTTP_STATUS, internalError, badRequestError, notFoundError } from "@/lib/api-error-handler";
import { getActiveCompanyId } from "@/lib/company";

export async function GET(request: NextRequest) {
  // Admin client to bypass RLS - created inside function to avoid build-time errors
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
        },
      }
    );

    // التحقق من المستخدم
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    // ✅ جلب معرف الشركة من query parameter أو من getActiveCompanyId
    const { searchParams } = new URL(request.url);
    let companyId = searchParams.get("company_id");

    if (!companyId) {
      companyId = await getActiveCompanyId(supabase);
    }

    if (!companyId) {
      return NextResponse.json({ error: "لم يتم العثور على الشركة" }, { status: 404 });
    }

    console.log('📋 [Audit Logs API] Fetching logs for company:', companyId);

    // ✅ جلب معلومات العضوية والدور للشركة النشطة
    const { data: member } = await admin
      .from("company_members")
      .select("company_id, role")
      .eq("user_id", user.id)
      .eq("company_id", companyId)
      .maybeSingle();

    if (!member) {
      return NextResponse.json({ error: "لم يتم العثور على الشركة" }, { status: 404 });
    }

    // التحقق من صلاحية الوصول (المالك والمدير والمدير العام فقط)
    if (!["owner", "admin", "manager"].includes(member.role)) {
      return NextResponse.json({ error: "غير مصرح لك بالوصول لسجل المراجعة" }, { status: 403 });
    }

    // جلب المعاملات من URL (searchParams already defined above)
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const action = searchParams.get("action"); // INSERT, UPDATE, DELETE, LOGIN, etc.
    const tableName = searchParams.get("table");
    const userId = searchParams.get("user_id");
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");
    const search = searchParams.get("search");
    const sortField = searchParams.get("sort_field") || "created_at";
    const sortOrder = searchParams.get("sort_order") || "desc";
    const branchId = searchParams.get("branch_id"); // فلتر الفرع
    const costCenterId = searchParams.get("cost_center_id"); // فلتر مركز التكلفة

    const offset = (page - 1) * limit;

    // التحقق من صحة حقل الترتيب
    const validSortFields = ["created_at", "user_name", "action", "target_table"];
    const actualSortField = validSortFields.includes(sortField) ? sortField : "created_at";
    const ascending = sortOrder === "asc";

    // بناء الاستعلام
    let query = admin
      .from("audit_logs")
      .select("*", { count: "exact" })
      .eq("company_id", member.company_id)
      .order(actualSortField, { ascending })
      .range(offset, offset + limit - 1);

    // تطبيق الفلاتر
    if (action) {
      query = query.eq("action", action);
    }
    if (tableName) {
      query = query.eq("target_table", tableName);
    }
    if (userId) {
      query = query.eq("user_id", userId);
    }
    if (startDate) {
      query = query.gte("created_at", startDate);
    }
    if (endDate) {
      query = query.lte("created_at", endDate + "T23:59:59");
    }
    if (search) {
      query = query.or(`record_identifier.ilike.%${search}%,user_email.ilike.%${search}%`);
    }
    if (branchId) {
      query = query.eq("branch_id", branchId);
    }
    if (costCenterId) {
      query = query.eq("cost_center_id", costCenterId);
    }

    const { data: logs, error, count } = await query;

    if (error) {
      console.error("Error fetching audit logs:", error);
      return NextResponse.json({ error: "خطأ في جلب السجلات" }, { status: 500 });
    }

    // جلب ملخص النشاط
    const { data: summary } = await admin
      .from("audit_logs")
      .select("action")
      .eq("company_id", member.company_id)
      .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    const activitySummary = {
      total: summary?.length || 0,
      inserts: summary?.filter(s => s.action === "INSERT").length || 0,
      updates: summary?.filter(s => s.action === "UPDATE").length || 0,
      deletes: summary?.filter(s => s.action === "DELETE").length || 0,
    };

    // جلب قائمة جميع أعضاء الشركة (وليس فقط من لديهم سجلات)
    const { data: companyMembers } = await admin
      .from("company_members")
      .select("user_id, email, role")
      .eq("company_id", member.company_id);

    // جلب بيانات المستخدمين من auth.users
    let uniqueUsers: { user_id: string; user_email: string; user_name: string }[] = [];

    if (companyMembers && companyMembers.length > 0) {
      // جلب بيانات المستخدمين من جدول auth.users
      const userIds = companyMembers.map(m => m.user_id);
      const { data: authUsers } = await admin.auth.admin.listUsers();

      uniqueUsers = companyMembers.map(m => {
        const authUser = authUsers?.users?.find(u => u.id === m.user_id);
        return {
          user_id: m.user_id,
          user_email: m.email || authUser?.email || "",
          user_name: authUser?.user_metadata?.full_name ||
            authUser?.user_metadata?.name ||
            m.email ||
            authUser?.email ||
            "مستخدم"
        };
      });
    }

    return NextResponse.json({
      logs,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
      summary: activitySummary,
      users: uniqueUsers,
    });
  } catch (error) {
    console.error("Audit logs error:", error);
    return NextResponse.json({ error: "خطأ في الخادم" }, { status: 500 });
  }
}

// POST - التراجع عن عملية
export async function POST(request: NextRequest) {
  try {
    // === تحصين أمني: استخدام requireOwnerOrAdmin ===
    const { user, companyId, member, error } = await requireOwnerOrAdmin(request);

    if (error) return error;
    if (!companyId || !member || !user) {
      return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على الشركة أو المستخدم", "Company or user not found");
    }
    // === نهاية التحصين الأمني ===

    const { logId, action } = await request.json();

    if (!logId || !action) {
      return badRequestError("معرف السجل والعملية مطلوبة", ["logId", "action"]);
    }

    // إنشاء admin client محليًا
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!url || !serviceKey) {
      return internalError("خطأ في إعدادات الخادم", "Server configuration error");
    }
    const admin = createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } });

    if (action === "revert") {
      // تنفيذ التراجع
      const { data, error } = await admin.rpc("revert_audit_log", {
        p_log_id: logId,
        p_user_id: user.id,
      });

      if (error) {
        console.error("Revert error:", error);
        return internalError("خطأ في التراجع: " + error.message, error.message);
      }

      return apiSuccess(data || {});
    }

    if (action === "revert_batch") {
      // التراجع الشامل - إلغاء جميع العمليات المرتبطة
      const { data, error } = await admin.rpc("revert_batch_operations", {
        p_log_id: logId,
        p_user_id: user.id,
      });

      if (error) {
        console.error("Batch revert error:", error);
        return internalError("خطأ في التراجع الشامل: " + error.message, error.message);
      }

      return apiSuccess(data || {});
    }

    if (action === "get_related") {
      // جلب السجلات المرتبطة
      const { data, error } = await admin.rpc("get_related_audit_logs", {
        p_log_id: logId,
      });

      if (error) {
        console.error("Get related error:", error);
        return internalError("خطأ في جلب السجلات المرتبطة", error.message);
      }

      return apiSuccess({ success: true, related: data || [] });
    }

    if (action === "delete") {
      // حذف سجل المراجعة
      const { error } = await admin
        .from("audit_logs")
        .delete()
        .eq("id", logId)
        .eq("company_id", companyId);

      if (error) {
        console.error("Delete error:", error);
        return internalError("خطأ في حذف السجل", error.message);
      }

      return apiSuccess({ success: true, message: "تم حذف السجل" });
    }

    return badRequestError("عملية غير صالحة. يجب أن تكون: revert, revert_batch, get_related, أو delete", ["action"]);
  } catch (error: any) {
    console.error("Audit log action error:", error);
    return internalError("حدث خطأ أثناء معالجة طلب audit log", error?.message || "unknown_error");
  }
}

