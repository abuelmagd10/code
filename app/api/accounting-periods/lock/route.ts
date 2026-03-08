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
