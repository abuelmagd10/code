import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createSSR } from "@/lib/supabase/server"
import { secureApiRequest } from "@/lib/api-security"
import { apiError, apiSuccess, HTTP_STATUS, internalError, badRequestError } from "@/lib/api-error-handler"

async function getAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  return url && serviceKey ? createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } }) : null
}

export async function PUT(req: NextRequest) {
  try {
    // === تحصين أمني: استخدام secureApiRequest ===
    const { user, companyId, member, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requirePermission: { resource: "payroll", action: "update" },
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
    const { runId, entryId, amount, paymentAccountId, description } = body || {}
    if (!runId || !entryId || (!amount && !paymentAccountId && typeof description === 'undefined')) {
      return badRequestError("بيانات ناقصة: runId, entryId و (amount أو paymentAccountId أو description) مطلوبة", ["runId", "entryId"])
    }
    const client = admin

    const { data: rec } = await client.from('bank_reconciliation_lines').select('id').eq('journal_entry_line_id', entryId).limit(1)
    if (Array.isArray(rec) && rec.length > 0) {
      return apiError(HTTP_STATUS.CONFLICT, "القيد مربوط بمطابقة مصرفية", "Entry is reconciled")
    }

    if (description) {
      const updEntry = await client.from('journal_entries').update({ description }).eq('company_id', companyId).eq('id', entryId)
      if (updEntry.error) {
        return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في تحديث وصف القيد", updEntry.error.message)
      }
    }

    if (paymentAccountId || typeof amount !== 'undefined') {
      const { data: lines } = await client.from('journal_entry_lines').select('id, account_id, debit_amount, credit_amount').eq('journal_entry_id', entryId)
      const debitLine = (lines||[]).find((l:any)=> Number(l.debit_amount||0)>0)
      const creditLine = (lines||[]).find((l:any)=> Number(l.credit_amount||0)>0)
      if (!debitLine || !creditLine) {
        return apiError(HTTP_STATUS.NOT_FOUND, "سطور القيد غير موجودة", "Journal entry lines not found")
      }
      const amt = typeof amount !== 'undefined' ? Number(amount||0) : Number(creditLine.credit_amount||0)
      const updDebit = await client.from('journal_entry_lines').update({ debit_amount: amt }).eq('id', debitLine.id)
      if (updDebit.error) {
        return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في تحديث سطر المدين", updDebit.error.message)
      }
      const updCredit = await client.from('journal_entry_lines').update({ credit_amount: amt, account_id: paymentAccountId || creditLine.account_id }).eq('id', creditLine.id)
      if (updCredit.error) {
        return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في تحديث سطر الدائن", updCredit.error.message)
      }
    }

    try { await admin.from('audit_logs').insert({ action: 'UPDATE', target_table: 'journal_entries', company_id: companyId, user_id: user.id, record_id: entryId, new_data: { runId, entryId } }) } catch {}
    return apiSuccess({ ok: true })
  } catch (e: any) {
    return internalError("حدث خطأ أثناء تحديث دفعة المرتبات", e?.message)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    // === تحصين أمني: استخدام secureApiRequest ===
    const { user, companyId, member, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requirePermission: { resource: "payroll", action: "delete" },
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
    const { entryId } = body || {}
    if (!entryId) {
      return badRequestError("معرف القيد مطلوب", ["entryId"])
    }
    const client = admin

    const { data: rec } = await client.from('bank_reconciliation_lines').select('id').eq('journal_entry_line_id', entryId).limit(1)
    if (Array.isArray(rec) && rec.length > 0) {
      return apiError(HTTP_STATUS.CONFLICT, "القيد مربوط بمطابقة مصرفية", "Entry is reconciled")
    }

    const delLines = await client.from('journal_entry_lines').delete().eq('journal_entry_id', entryId)
    if (delLines.error) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في حذف سطور القيد", delLines.error.message)
    }
    const delEntry = await client.from('journal_entries').delete().eq('company_id', companyId).eq('id', entryId)
    if (delEntry.error) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في حذف القيد", delEntry.error.message)
    }
    try { await admin.from('audit_logs').insert({ action: 'DELETE', target_table: 'journal_entries', company_id: companyId, user_id: user.id, record_id: entryId }) } catch {}
    return apiSuccess({ ok: true })
  } catch (e: any) {
    return internalError("حدث خطأ أثناء حذف دفعة المرتبات", e?.message)
  }
}

export async function GET(req: NextRequest) {
  try {
    // === تحصين أمني: استخدام secureApiRequest ===
    const { user, companyId, member, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requirePermission: { resource: "payroll", action: "read" },
      allowRoles: ['owner', 'admin', 'manager', 'accountant']
    })

    if (error) return error
    if (!companyId) return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على الشركة", "Company not found")
    // === نهاية التحصين الأمني ===

    const admin = await getAdmin()
    if (!admin) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في إعدادات الخادم", "Server configuration error")
    }

    const { searchParams } = new URL(req.url)
    const year = Number(searchParams.get('year') || 0)
    const month = Number(searchParams.get('month') || 0)
    if (!year || !month) {
      return badRequestError("السنة والشهر مطلوبان", ["year", "month"])
    }
    const client = admin

    const { data: run } = await client.from('payroll_runs').select('id').eq('company_id', companyId).eq('period_year', year).eq('period_month', month).maybeSingle()
    if (!run?.id) return apiSuccess([])
    const { data, error: dataError } = await client
      .from('journal_entries')
      .select('id, entry_date, description, journal_entry_lines!inner(id, account_id, debit_amount, credit_amount)')
      .eq('company_id', companyId)
      .eq('reference_type', 'payroll_payment')
      .eq('reference_id', run.id)
    
    if (dataError) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في جلب دفعات المرتبات", dataError.message)
    }

    const rows = Array.isArray(data) ? data : []
    const mapped = rows.map((r: any) => {
      const lines = Array.isArray(r.journal_entry_lines) ? r.journal_entry_lines : []
      const amount = lines.reduce((s: number, l: any) => s + Number(l.credit_amount || 0), 0)
      const payLine = lines.find((l: any) => Number(l.credit_amount || 0) > 0)
      return { id: r.id, entry_date: r.entry_date, description: r.description, amount, account_id: payLine?.account_id }
    })
    return apiSuccess(mapped)
  } catch (e: any) {
    return internalError("حدث خطأ أثناء جلب دفعات المرتبات", e?.message)
  }
}