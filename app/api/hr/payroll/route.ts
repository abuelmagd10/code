import { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createSSR } from "@/lib/supabase/server"
import { secureApiRequest } from "@/lib/api-security"
import { apiError, apiSuccess, HTTP_STATUS, internalError, badRequestError } from "@/lib/api-error-handler"

async function getAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  return url && serviceKey ? createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } }) : null
}

export async function POST(req: NextRequest) {
  try {
    // ✅ تحصين موحد: إنشاء وتشغيل دفعة المرتبات
    const { user, companyId, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requirePermission: { resource: "payroll", action: "write" },
      allowRoles: ["owner", "admin", "manager", "accountant"]
    })

    if (error) return error
    if (!companyId) {
      return apiError(
        HTTP_STATUS.NOT_FOUND,
        "لم يتم العثور على الشركة",
        "Company not found"
      )
    }

    const admin = await getAdmin()
    const ssr = await createSSR()
    const body = await req.json()
    const { year, month, adjustments } = body || {}
    if (!year || !month) {
      return badRequestError("السنة والشهر مطلوبة", ["year", "month"])
    }
    const client = admin || ssr

    const useHr = String(process.env.SUPABASE_USE_HR_SCHEMA || '').toLowerCase() === 'true'
    let { data: runExisting, error: runSelErr } = await client.from('payroll_runs').select('id').eq('company_id', companyId).eq('period_year', year).eq('period_month', month).maybeSingle()
    if (useHr && runSelErr && ((runSelErr as any).code === 'PGRST205' || String(runSelErr.message || '').toUpperCase().includes('PGRST205'))) {
      const clientHr = (client as any).schema ? (client as any).schema('hr') : client
      const res = await clientHr.from('payroll_runs').select('id').eq('company_id', companyId).eq('period_year', year).eq('period_month', month).maybeSingle()
      runExisting = res.data as any
      runSelErr = res.error as any
    }
    let runId = runExisting?.id
    if (!runId) {
      let insRun = await client.from('payroll_runs').insert({ company_id: companyId, period_year: year, period_month: month, approved_by: null }).select('id').single()
      if (useHr && insRun.error && ((insRun.error as any).code === 'PGRST205' || String(insRun.error.message || '').toUpperCase().includes('PGRST205'))) {
        const clientHr = (client as any).schema ? (client as any).schema('hr') : client
        insRun = await clientHr.from('payroll_runs').insert({ company_id: companyId, period_year: year, period_month: month, approved_by: null }).select('id').single()
      }
      if (insRun.error) {
        return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في إنشاء دفعة المرتبات", insRun.error.message)
      }
      runId = (insRun.data as any)?.id
    }

    let { data: emps, error: empErr } = await client.from('employees').select('id, base_salary').eq('company_id', companyId)
    if (useHr && empErr && ((empErr as any).code === 'PGRST205' || String(empErr.message || '').toUpperCase().includes('PGRST205'))) {
      const clientHr = (client as any).schema ? (client as any).schema('hr') : client
      const res = await clientHr.from('employees').select('id, base_salary').eq('company_id', companyId)
      emps = res.data as any
      empErr = res.error as any
    }
    let { data: att, error: attErr } = await client
      .from('attendance_records')
      .select('employee_id, status, day_date, late_minutes, overtime_minutes, early_leave_minutes')
      .eq('company_id', companyId)
      .gte('day_date', `${year}-${String(month).padStart(2, '0')}-01`)
      .lte('day_date', `${year}-${String(month).padStart(2, '0')}-31`)
    if (useHr && attErr && ((attErr as any).code === 'PGRST205' || String(attErr.message || '').toUpperCase().includes('PGRST205'))) {
      const clientHr = (client as any).schema ? (client as any).schema('hr') : client
      const res = await clientHr
        .from('attendance_records')
        .select('employee_id, status, day_date, late_minutes, overtime_minutes, early_leave_minutes')
        .eq('company_id', companyId)
        .gte('day_date', `${year}-${String(month).padStart(2, '0')}-01`)
        .lte('day_date', `${year}-${String(month).padStart(2, '0')}-31`)
      att = res.data as any
      attErr = res.error as any
    }

    let { data: attSettingsData } = await client.from('attendance_payroll_settings').select('*').eq('company_id', companyId).maybeSingle()
    const attSettings = attSettingsData || {
      deduct_late: true, late_deduction_type: 'exact_minutes', late_multiplier: 1.0,
      deduct_early_leave: true, early_leave_multiplier: 1.0,
      pay_overtime: true, overtime_multiplier: 1.5,
      deduct_absence: true, absence_day_deduction: 1.0
    }

    const adjByEmp: Record<string, { allowances: number; deductions: number; bonuses: number; advances: number; insurance: number }> = {}
    for (const a of (Array.isArray(adjustments) ? adjustments : [])) {
      const k = String((a as any).employee_id)
      const prev = adjByEmp[k] || { allowances: 0, deductions: 0, bonuses: 0, advances: 0, insurance: 0 }
      adjByEmp[k] = {
        allowances: prev.allowances + Number((a as any).allowances || 0),
        deductions: prev.deductions + Number((a as any).deductions || 0),
        bonuses: prev.bonuses + Number((a as any).bonuses || 0),
        advances: prev.advances + Number((a as any).advances || 0),
        insurance: prev.insurance + Number((a as any).insurance || 0),
      }
    }

    // ✅ جلب السلف الفورية (الصرف الفوري) غير المخصومة من قبل
    let { data: rawAdvances, error: advErr } = await client
      .from('commission_advance_payments')
      .select('employee_id, amount')
      .eq('company_id', companyId)
      .eq('status', 'paid')
      .or('deducted_in_payroll.is.null,deducted_in_payroll.eq.false')

    if (useHr && advErr && ((advErr as any).code === 'PGRST205' || String(advErr.message || '').toUpperCase().includes('PGRST205'))) {
      const clientHr = (client as any).schema ? (client as any).schema('hr') : client
      const res = await clientHr
        .from('commission_advance_payments')
        .select('employee_id, amount')
        .eq('company_id', companyId)
        .eq('status', 'paid')
        .or('deducted_in_payroll.is.null,deducted_in_payroll.eq.false')
      rawAdvances = res.data as any
      advErr = res.error as any
    }

    // إضافة مبالغ الصرف الفوري لخانة السلف في الراتب
    for (const adv of (rawAdvances || [])) {
      const k = String(adv.employee_id)
      const amt = Number(adv.amount || 0)
      if (!adjByEmp[k]) {
        adjByEmp[k] = { allowances: 0, deductions: 0, bonuses: 0, advances: 0, insurance: 0 }
      }
      adjByEmp[k].advances += amt
    }

    const attAggByEmp: Record<string, { absences: number, lateDeductionMins: number, overtimeMins: number, earlyLeaveMins: number }> = {}
    for (const r of (att || [])) {
      const st = String((r as any).status || '').toLowerCase()
      const k = String((r as any).employee_id)

      if (!attAggByEmp[k]) {
        attAggByEmp[k] = { absences: 0, lateDeductionMins: 0, overtimeMins: 0, earlyLeaveMins: 0 }
      }
      if (st === 'absent') {
        attAggByEmp[k].absences += 1
      }
      attAggByEmp[k].lateDeductionMins += Number((r as any).late_minutes || 0)
      attAggByEmp[k].overtimeMins += Number((r as any).overtime_minutes || 0)
      attAggByEmp[k].earlyLeaveMins += Number((r as any).early_leave_minutes || 0)
    }

    const rows: any[] = []
    for (const e of (emps || [])) {
      const id = String((e as any).id)
      const base = Number((e as any).base_salary || 0)
      const adj = adjByEmp[id] || { allowances: 0, deductions: 0, bonuses: 0, advances: 0, insurance: 0 }
      const attAgg = attAggByEmp[id] || { absences: 0, lateDeductionMins: 0, overtimeMins: 0, earlyLeaveMins: 0 }

      const daily = base / 30
      const hourly = daily / 8
      const minuteRate = hourly / 60

      let absenceDeduction = 0
      if (attSettings.deduct_absence) {
        absenceDeduction = daily * attAgg.absences * Number(attSettings.absence_day_deduction || 1)
      }

      let lateDeduction = 0
      if (attSettings.deduct_late) {
        lateDeduction = attAgg.lateDeductionMins * minuteRate * Number(attSettings.late_multiplier || 1)
      }

      let earlyLeaveDeduction = 0
      if (attSettings.deduct_early_leave) {
        earlyLeaveDeduction = attAgg.earlyLeaveMins * minuteRate * Number(attSettings.early_leave_multiplier || 1)
      }

      let overtimeAllowance = 0
      if (attSettings.pay_overtime) {
        overtimeAllowance = attAgg.overtimeMins * minuteRate * Number(attSettings.overtime_multiplier || 1.5)
      }

      // ✅ جلب ملخص العمولات للموظف (العمولات المكتسبة - السلف المصروفة)
      // ✅ إصلاح 3: تمرير payroll_run_id لحساب السلف بشكل صحيح عند إعادة الحساب
      let commissionEarned = 0
      let commissionAdvanceDeducted = 0
      try {
        const { data: commSummary } = await client.rpc('get_employee_commission_summary_for_payroll', {
          p_company_id: companyId,
          p_employee_id: id,
          p_period_year: year,
          p_period_month: month,
          p_payroll_run_id: runId // ✅ تمرير runId للتعامل مع إعادة الحساب
        })
        if (commSummary) {
          commissionEarned = Number(commSummary.net_earned || 0)
          commissionAdvanceDeducted = Number(commSummary.advance_paid || 0)
        }
      } catch (commErr) {
        console.log('Commission summary not available for employee:', id, commErr)
      }

      const netCommission = Math.max(commissionEarned - commissionAdvanceDeducted, 0)
      const totalAttendanceDeductions = absenceDeduction + lateDeduction + earlyLeaveDeduction
      const totalDeductions = Number(adj.deductions || 0) + Number(adj.advances || 0) + Number(adj.insurance || 0) + totalAttendanceDeductions
      const totalAllowances = Number(adj.allowances || 0) + overtimeAllowance

      const net = base + totalAllowances + Number(adj.bonuses || 0) + netCommission - totalDeductions
      rows.push({
        company_id: companyId,
        payroll_run_id: runId,
        employee_id: id,
        base_salary: base,
        allowances: totalAllowances,
        deductions: totalDeductions,
        bonuses: adj.bonuses || 0,
        advances: adj.advances || 0,
        insurance: adj.insurance || 0,
        commission: commissionEarned,
        commission_advance_deducted: commissionAdvanceDeducted,
        net_salary: net,
        breakdown: { absences: attAgg.absences, late_mins: attAgg.lateDeductionMins, overtime_mins: attAgg.overtimeMins, early_leave_mins: attAgg.earlyLeaveMins, daily_rate: daily, attendance_deductions_val: totalAttendanceDeductions, overtime_allowance_val: overtimeAllowance, commission_earned: commissionEarned, commission_advance_deducted: commissionAdvanceDeducted }
      })
    }

    if (rows.length > 0) {
      let del = await client.from('payslips').delete().eq('company_id', companyId).eq('payroll_run_id', runId)
      if (useHr && del.error && ((del.error as any).code === 'PGRST205' || String(del.error.message || '').toUpperCase().includes('PGRST205'))) {
        const clientHr = (client as any).schema ? (client as any).schema('hr') : client
        del = await clientHr.from('payslips').delete().eq('company_id', companyId).eq('payroll_run_id', runId)
      }
      if (del.error) {
        return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في حذف كشوف المرتبات السابقة", del.error.message)
      }
      let ins = await client.from('payslips').insert(rows)
      if (useHr && ins.error && ((ins.error as any).code === 'PGRST205' || String(ins.error.message || '').toUpperCase().includes('PGRST205'))) {
        const clientHr = (client as any).schema ? (client as any).schema('hr') : client
        ins = await clientHr.from('payslips').insert(rows)
      }
      if (ins.error) {
        return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في إنشاء كشوف المرتبات", ins.error.message)
      }

      // ✅ تحديث حالة سلف العمولات (تعليمها كمخصومة من المرتب)
      for (const row of rows) {
        if (row.commission_advance_deducted > 0) {
          try {
            await client.rpc('deduct_commission_advances_for_payroll', {
              p_company_id: companyId,
              p_employee_id: row.employee_id,
              p_payroll_run_id: runId,
              p_period_year: year,
              p_period_month: month
            })
          } catch (deductErr) {
            console.log('Error deducting commission advances for employee:', row.employee_id, deductErr)
          }
        }
      }
    }
    try {
      await (admin || ssr).from('audit_logs').insert({
        action: 'INSERT',
        target_table: 'payroll_runs',
        company_id: companyId,
        user_id: user!.id,
        record_id: runId,
        new_data: { year, month, count: rows.length }
      })
    } catch { }
    return apiSuccess({ ok: true, run_id: runId, count: rows.length })
  } catch (e: any) {
    return internalError("حدث خطأ أثناء معالجة المرتبات", e?.message)
  }
}