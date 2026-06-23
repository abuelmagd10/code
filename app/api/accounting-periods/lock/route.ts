import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { apiGuard } from '@/lib/core/security/api-guard';
import { ErrorHandler } from '@/lib/core/errors/error-handler';
import { asyncAuditLog } from '@/lib/core/audit/async-audit-engine';

/**
 * POST /api/accounting-periods/lock
 * إغلاق فترة محاسبية (owner و admin فقط)
 */
export async function POST(req: NextRequest) {
  // 1. Security Guard: Auth + Company Isolation + RBAC
  const { context, errorResponse } = await apiGuard(req, {
    requireAuth: true,
    requireCompany: true
  });
  if (errorResponse) return errorResponse;

  // 2. Role Check (Owner or Admin only for financial period locking)
  const memberRole = context!.member?.role;
  if (!['owner', 'admin'].includes(memberRole)) {
    return ErrorHandler.handle(
      ErrorHandler.forbidden('إغلاق الفترات المالية متاح للمالك والمدير فقط'),
      context!.correlationId
    );
  }

  try {
    const body = await req.json();
    const { period_id, notes } = body;

    if (!period_id) {
      return ErrorHandler.handle(
        ErrorHandler.validation('period_id مطلوب'),
        context!.correlationId
      );
    }

    // 3. Execute via Admin client (requires Service Role for RPC bypass of RLS)
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !serviceKey) {
      return ErrorHandler.handle(new Error('Server not configured'), context!.correlationId);
    }

    const admin = createClient(url, serviceKey);

    // v3.74.298 — FX revaluation guard. If the period contains any open
    // foreign-currency invoice or bill and no fx_period_end_revaluation
    // journal entry was booked inside the period, refuse the lock so
    // the closing balance sheet doesn't carry stale FC valuations.
    // Owner can pass body.force === true to override (rare but
    // sometimes legitimate, e.g. all FC amounts are immaterial).
    const force = body.force === true
    if (!force) {
      const { data: periodRow } = await admin
        .from('accounting_periods')
        .select('period_start, period_end')
        .eq('id', period_id)
        .eq('company_id', context!.companyId)
        .maybeSingle()

      if (periodRow?.period_start && periodRow?.period_end) {
        const { data: companyRow } = await admin
          .from('companies')
          .select('base_currency')
          .eq('id', context!.companyId)
          .maybeSingle()
        const baseCur = String(companyRow?.base_currency || 'EGP').toUpperCase()

        const { data: openInvs } = await admin
          .from('invoices')
          .select('id, total_amount, paid_amount, original_currency')
          .eq('company_id', context!.companyId)
          .lte('invoice_date', periodRow.period_end)
          .neq('original_currency', baseCur)
          .limit(500)
        const openInvoicesCount = (openInvs || []).filter(
          (r: any) => Number(r.total_amount || 0) > Number(r.paid_amount || 0)
        ).length

        const { data: openBills } = await admin
          .from('bills')
          .select('id, total_amount, paid_amount, original_currency')
          .eq('company_id', context!.companyId)
          .lte('bill_date', periodRow.period_end)
          .neq('original_currency', baseCur)
          .limit(500)
        const openBillsCount = (openBills || []).filter(
          (r: any) => Number(r.total_amount || 0) > Number(r.paid_amount || 0)
        ).length

        const totalOpenFx = openInvoicesCount + openBillsCount
        if (totalOpenFx > 0) {
          const { count: revalCount } = await admin
            .from('journal_entries')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', context!.companyId)
            .eq('reference_type', 'fx_period_end_revaluation')
            .gte('entry_date', periodRow.period_start)
            .lte('entry_date', periodRow.period_end)

          if ((revalCount ?? 0) === 0) {
            return ErrorHandler.handle(
              ErrorHandler.validation(
                `عندك ${totalOpenFx} مستند بعملة أجنبية مفتوح فى الفترة دى (${openInvoicesCount} فاتورة عميل، ${openBillsCount} فاتورة مشتريات) ولسة ما اتعملش إعادة تقييم. ` +
                `افتح "الإعدادات → إعادة تقييم العملات"، شغّل التقييم لتاريخ ${periodRow.period_end}، ثم ارجع لإقفال الفترة. ` +
                `لو الأرصدة غير جوهرية، ابعت force=true لتجاوز هذا الفحص.`
              ),
              context!.correlationId
            )
          }
        }
      }
    }

    const { data, error } = await admin.rpc('close_accounting_period', {
      p_period_id: period_id,
      p_company_id: context!.companyId, // ✅ تمرير companyId لضمان عزل الشركات على مستوى RPC
      p_user_id: context!.user.id,
      p_notes: notes || null
    });

    if (error) {
      throw error;
    }

    // 4. Async Audit Log
    asyncAuditLog({
      correlationId: context!.correlationId,
      companyId: context!.companyId,
      userId: context!.user.id,
      userEmail: context!.user.email,
      action: 'UPDATE',
      table: 'accounting_periods',
      recordId: period_id,
      recordIdentifier: period_id,
      newData: { status: 'closed', notes },
      reason: 'Close Accounting Period'
    });

    return NextResponse.json({ success: true, data }, { status: 200 });

  } catch (error: any) {
    return ErrorHandler.handle(error, context!.correlationId);
  }
}
