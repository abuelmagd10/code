import { NextRequest, NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { secureApiRequest, serverError, badRequestError } from "@/lib/api-security-enhanced"

export async function GET(req: NextRequest) {
  try {
    const authSupabase = await createServerClient()
    const { companyId, branchId, member, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requireBranch: true,
      requirePermission: { resource: "reports", action: "read" },
      supabase: authSupabase,
    })
    if (error) return error
    if (!companyId) return badRequestError("معرف الشركة مطلوب")

    const supabase = await createServerClient()
    const { searchParams } = new URL(req.url)
    const from      = searchParams.get("from")       || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
    const to        = searchParams.get("to")         || new Date().toISOString().slice(0, 10)
    const serviceId = searchParams.get("service_id") || "all"

    let query = supabase
      .from("v_branch_occupancy_rate")
      .select("service_id,service_name,capacity,slot_minutes,booking_date,active_bookings,max_capacity,occupancy_pct")
      .eq("company_id", companyId)
      .gte("booking_date", from)
      .lte("booking_date", to)
      .order("booking_date", { ascending: true })

    if (member.role === "manager" && branchId) {
      query = query.eq("branch_id", branchId)
    }

    if (serviceId !== "all") {
      query = query.eq("service_id", serviceId)
    }

    const { data, error: qErr } = await query
    if (qErr) return serverError(`خطأ في جلب البيانات: ${qErr.message}`)

    const rows = data ?? []

    // Summary per service
    const serviceMap = new Map<string, {
      service_id: string; service_name: string; capacity: number
      total_days: number; total_active: number; avg_occupancy: number
      daily: { date: string; active_bookings: number; occupancy_pct: number }[]
    }>()

    for (const r of rows) {
      const key = r.service_id ?? r.service_name
      const existing = serviceMap.get(key)
      const day = { date: r.booking_date, active_bookings: Number(r.active_bookings), occupancy_pct: Number(r.occupancy_pct) }
      if (!existing) {
        serviceMap.set(key, {
          service_id:    r.service_id,
          service_name:  r.service_name,
          capacity:      Number(r.capacity),
          total_days:    1,
          total_active:  Number(r.active_bookings),
          avg_occupancy: Number(r.occupancy_pct),
          daily:         [day],
        })
      } else {
        existing.total_days    += 1
        existing.total_active  += Number(r.active_bookings)
        existing.avg_occupancy  = (existing.avg_occupancy * (existing.total_days - 1) + Number(r.occupancy_pct)) / existing.total_days
        existing.daily.push(day)
      }
    }

    const services = Array.from(serviceMap.values()).map((s) => ({
      ...s,
      avg_occupancy: +s.avg_occupancy.toFixed(1),
    }))

    const summary = {
      total_services:   services.length,
      avg_occupancy:    services.length > 0
        ? +(services.reduce((s, r) => s + r.avg_occupancy, 0) / services.length).toFixed(1)
        : 0,
      total_active_bookings: rows.reduce((s, r) => s + Number(r.active_bookings), 0),
    }

    return NextResponse.json({ success: true, data: services, raw: rows, summary })
  } catch (e: any) {
    return serverError(`خطأ في تقرير نسبة الإشغال: ${e?.message || "unknown"}`)
  }
}
