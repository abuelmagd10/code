import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// Admin client to bypass RLS
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
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

    // جلب معرف الشركة والتحقق من الدور
    const { data: member } = await admin
      .from("company_members")
      .select("company_id, role")
      .eq("user_id", user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: "لم يتم العثور على الشركة" }, { status: 404 });
    }

    // التحقق من صلاحية الوصول (المالك والمدير فقط)
    if (!["owner", "admin"].includes(member.role)) {
      return NextResponse.json({ error: "غير مصرح لك بالوصول لسجل المراجعة" }, { status: 403 });
    }

    // جلب المعاملات من URL
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const action = searchParams.get("action"); // INSERT, UPDATE, DELETE
    const tableName = searchParams.get("table");
    const userId = searchParams.get("user_id");
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");
    const search = searchParams.get("search");

    const offset = (page - 1) * limit;

    // بناء الاستعلام
    let query = admin
      .from("audit_logs")
      .select("*", { count: "exact" })
      .eq("company_id", member.company_id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // تطبيق الفلاتر
    if (action) {
      query = query.eq("action", action);
    }
    if (tableName) {
      query = query.eq("table_name", tableName);
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

    // جلب قائمة المستخدمين
    const { data: users } = await admin
      .from("audit_logs")
      .select("user_id, user_email, user_name")
      .eq("company_id", member.company_id)
      .limit(100);

    const uniqueUsers = users ? 
      Array.from(new Map(users.map(u => [u.user_id, u])).values()) : [];

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

