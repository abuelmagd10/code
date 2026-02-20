import { NextRequest } from "next/server"
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
    const { user, companyId, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requirePermission: { resource: "payroll", action: "write" },
      allowRoles: ['owner', 'admin', 'manager', 'accountant']
    })

    if (error) return error
    if (!companyId || !user) return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على الشركة أو المستخدم", "Company or user not found")

    const admin = await getAdmin()
    if (!admin) return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في إعدادات الخادم", "Server configuration error")

    const body = await req.json()
    const { year, month, paymentAccountId, paymentDate } = body || {}

    if (!year || !month || !paymentAccountId) {
      return badRequestError("السنة والشهر وحساب الدفع مطلوبة", ["year", "month", "paymentAccountId"])
    }

    // ── Idempotency Key من الـ header (يمنع Double Submission)
    const idempotencyKey = req.headers.get('Idempotency-Key') || null

    // ── جلب دفعة الرواتب
    const useHr = String(process.env.SUPABASE_USE_HR_SCHEMA || '').toLowerCase() === 'true'
    let { data: run, error: runErr } = await admin.from('payroll_runs')
      .select('id, status')
      .eq('company_id', companyId)
      .eq('period_year', year)
      .eq('period_month', month)
      .maybeSingle()

    if (useHr && runErr && ((runErr as any).code === 'PGRST205' || String(runErr.message || '').toUpperCase().includes('PGRST205'))) {
      const clientHr = (admin as any).schema ? (admin as any).schema('hr') : admin
      const res = await clientHr.from('payroll_runs').select('id, status').eq('company_id', companyId).eq('period_year', year).eq('period_month', month).maybeSingle()
      run = res.data as any
      runErr = res.error as any
    }

    if (runErr) return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في جلب دفعة المرتبات", runErr.message)
    if (!run?.id) return notFoundError("دفعة المرتبات", "Payroll run not found")

    // منع إعادة الصرف إذا كانت مدفوعة مسبقاً
    if (run.status === 'paid') {
      return apiError(HTTP_STATUS.BAD_REQUEST, "تم صرف هذه الرواتب مسبقاً", "Payroll already paid")
    }

    // ── التحقق من حساب الدفع
    const { data: payAcc } = await admin.from('chart_of_accounts')
      .select('id, account_type')
      .eq('company_id', companyId)
      .eq('id', paymentAccountId)
      .maybeSingle()

    if (!payAcc?.id) return notFoundError("حساب الدفع", "Payment account not found")
    if (!['asset'].includes(String(payAcc.account_type || ''))) {
      return apiError(HTTP_STATUS.BAD_REQUEST, "نوع حساب الدفع غير صحيح. يجب أن يكون حساب أصول", "Invalid payment account type")
    }

    // ── جلب حساب المصاريف 6110
    const { data: expAcc } = await admin.from('chart_of_accounts')
      .select('id')
      .eq('company_id', companyId)
      .eq('account_code', '6110')
      .maybeSingle()

    if (!expAcc?.id) {
      return apiError(HTTP_STATUS.BAD_REQUEST, "حساب المصروفات 6110 غير موجود", "Expense account 6110 missing")
    }

    const dateStr = typeof paymentDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(paymentDate)
      ? paymentDate
      : new Date().toISOString().slice(0, 10)

    // ── استدعاء RPC الذري (Phase 2: Atomic + Period Lock + Idempotency)
    const { data: rpcResult, error: rpcErr } = await admin.rpc('post_payroll_atomic', {
      p_company_id:         companyId,
      p_payroll_run_id:     run.id,
      p_payment_account_id: paymentAccountId,
      p_expense_account_id: expAcc.id,
      p_payment_date:       dateStr,
      p_year:               year,
      p_month:              month,
      p_created_by:         user.id,
      p_idempotency_key:    idempotencyKey
    })

    if (rpcErr) {
      const msg = rpcErr.message || ''
      if (msg.includes('PERIOD_LOCKED')) {
        return apiError(HTTP_STATUS.BAD_REQUEST,
          msg.replace('PERIOD_LOCKED: ', ''),
          'Period is locked')
      }
      if (msg.includes('NO_PAYSLIPS')) {
        return apiError(HTTP_STATUS.BAD_REQUEST, "لا توجد كشوف مرتبات للصرف", "No payslips to pay")
      }
      if (msg.includes('IDEMPOTENCY_IN_FLIGHT')) {
        return apiError(HTTP_STATUS.BAD_REQUEST, "العملية جارية بالفعل، انتظر اكتمالها", "Operation in flight")
      }
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في صرف المرتبات", msg)
    }

    const result = rpcResult as any

    // ── Audit Log
    try {
      await admin.from('audit_logs').insert({
        action: 'payroll_paid',
        target_table: 'journal_entries',
        company_id: companyId,
        user_id: user.id,
        record_id: result?.entry_id,
        new_data: { year, month, total: result?.total, entry_id: result?.entry_id, idempotent: result?.idempotent }
      })
    } catch {}

    return apiSuccess({
      ok: true,
      total: result?.total,
      entry_id: result?.entry_id,
      idempotent: result?.idempotent || false,
      message: result?.message
    })

  } catch (e: any) {
    return internalError("حدث خطأ أثناء صرف المرتبات", e?.message)
  }
}
