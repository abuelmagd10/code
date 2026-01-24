import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createSSR } from "@/lib/supabase/server"
import { secureApiRequest } from "@/lib/api-security"
import { apiError, apiSuccess, HTTP_STATUS, internalError, badRequestError, notFoundError } from "@/lib/api-error-handler"

async function getAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  return url && serviceKey ? createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } }) : null
}

export async function POST(req: NextRequest) {
  try {
    // === تحصين أمني: استخدام secureApiRequest ===
    const { user, companyId, member, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requirePermission: { resource: "payroll", action: "write" },
      allowRoles: ['owner', 'admin', 'manager', 'accountant']
    })

    if (error) return error
    if (!companyId || !user) return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على الشركة أو المستخدم", "Company or user not found")
    // === نهاية التحصين الأمني ===

    const admin = await getAdmin()
    if (!admin) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في إعدادات الخادم", "Server configuration error")
    }

    const body = await req.json()
    const { year, month, paymentAccountId, paymentDate } = body || {}
    if (!year || !month || !paymentAccountId) {
      return badRequestError("السنة والشهر وحساب الدفع مطلوبة", ["year", "month", "paymentAccountId"])
    }

    const client = admin

    const useHr = String(process.env.SUPABASE_USE_HR_SCHEMA || '').toLowerCase() === 'true'
    let { data: run, error: runErr } = await client.from('payroll_runs').select('id').eq('company_id', companyId).eq('period_year', year).eq('period_month', month).maybeSingle()
    if (useHr && runErr && ((runErr as any).code === 'PGRST205' || String(runErr.message || '').toUpperCase().includes('PGRST205'))) {
      const clientHr = (client as any).schema ? (client as any).schema('hr') : client
      const res = await clientHr.from('payroll_runs').select('id').eq('company_id', companyId).eq('period_year', year).eq('period_month', month).maybeSingle()
      run = res.data as any
      runErr = res.error as any
    }
    if (runErr) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في جلب دفعة المرتبات", runErr.message)
    }
    if (!run?.id) {
      return notFoundError("دفعة المرتبات", "Payroll run not found")
    }

    let { data: slips, error: slipsErr } = await client.from('payslips').select('net_salary').eq('company_id', companyId).eq('payroll_run_id', run.id)
    if (useHr && slipsErr && ((slipsErr as any).code === 'PGRST205' || String(slipsErr.message || '').toUpperCase().includes('PGRST205'))) {
      const clientHr = (client as any).schema ? (client as any).schema('hr') : client
      const res = await clientHr.from('payslips').select('net_salary').eq('company_id', companyId).eq('payroll_run_id', run.id)
      slips = res.data as any
      slipsErr = res.error as any
    }
    if (slipsErr) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في جلب كشوف المرتبات", slipsErr.message)
    }
    const total = (slips || []).reduce((s: number, r: any) => s + Number(r.net_salary || 0), 0)
    if (total <= 0) {
      return apiError(HTTP_STATUS.BAD_REQUEST, "لا توجد كشوف مرتبات للصرف", "No payslips to pay")
    }

    const { data: payAcc } = await client.from('chart_of_accounts').select('id, account_type, sub_type').eq('company_id', companyId).eq('id', paymentAccountId).maybeSingle()
    if (!payAcc?.id) {
      return notFoundError("حساب الدفع", "Payment account not found")
    }
    if (!['asset'].includes(String(payAcc.account_type || ''))) {
      return apiError(HTTP_STATUS.BAD_REQUEST, "نوع حساب الدفع غير صحيح. يجب أن يكون حساب أصول", "Invalid payment account type")
    }

    const { data: expAcc } = await client.from('chart_of_accounts').select('id').eq('company_id', companyId).eq('account_code', '6110').maybeSingle()
    if (!expAcc?.id) {
      return apiError(HTTP_STATUS.BAD_REQUEST, "حساب المصروفات 6110 غير موجود", "Expense account 6110 missing")
    }

    const dateStr = typeof paymentDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(paymentDate) ? paymentDate : new Date().toISOString().slice(0,10)
    const { data: entry, error: entryErr } = await client.from('journal_entries').insert({ company_id: companyId, entry_date: dateStr, description: `صرف مرتبات ${year}-${String(month).padStart(2,'0')}`, reference_type: 'payroll_payment', reference_id: run.id }).select().maybeSingle()
    if (entryErr) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في إنشاء القيد المحاسبي", entryErr.message)
    }

    const lines = [
      { journal_entry_id: entry?.id, account_id: expAcc.id, debit_amount: total, credit_amount: 0, description: '6110 مرتبات موظفين' },
      { journal_entry_id: entry?.id, account_id: paymentAccountId, debit_amount: 0, credit_amount: total, description: 'صرف من الحساب' },
    ]
    const { error: linesErr } = await client.from('journal_entry_lines').insert(lines)
    if (linesErr) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في إنشاء سطور القيد", linesErr.message)
    }

    try { await admin.from('audit_logs').insert({ action: 'payroll_paid', target_table: 'journal_entries', company_id: companyId, user_id: user.id, record_id: entry?.id, new_data: { year, month, total, entry_id: entry?.id } }) } catch {}
    return apiSuccess({ ok: true, total, entry_id: entry?.id })
  } catch (e: any) {
    return internalError("حدث خطأ أثناء صرف المرتبات", e?.message)
  }
}