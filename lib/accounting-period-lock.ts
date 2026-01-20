/**
 * قفل الفترات المحاسبية - Accounting Period Lock
 * ERP-Grade Period Locking System
 * 
 * يمنع أي تعديل محاسبي بعد إقفال الفترة
 */

import { SupabaseClient } from "@supabase/supabase-js"

export interface PeriodLockCheckParams {
  companyId: string
  date: string // YYYY-MM-DD
}

export interface PeriodLockResult {
  isLocked: boolean
  periodId?: string
  periodName?: string
  error?: string
}

/**
 * التحقق من أن التاريخ غير مقفل
 * 
 * يبحث عن أي فترة:
 * - date BETWEEN period_start AND period_end
 * - AND (is_locked = true OR status = 'closed' OR status = 'locked')
 * 
 * إذا وُجدت → الفترة مقفلة
 */
export async function checkPeriodLock(
  supabase: SupabaseClient,
  params: PeriodLockCheckParams
): Promise<PeriodLockResult> {
  try {
    const { companyId, date } = params

    // ✅ البحث عن فترات تحتوي على التاريخ ومقفلة
    const { data: lockedPeriods, error } = await supabase
      .from("accounting_periods")
      .select("id, period_name, period_start, period_end, status, is_locked")
      .eq("company_id", companyId)
      .lte("period_start", date)
      .gte("period_end", date)
      .in("status", ["closed", "locked"])

    if (error) {
      return {
        isLocked: false,
        error: `خطأ في التحقق من قفل الفترة: ${error.message}`,
      }
    }

    // ✅ إذا كانت الفترة مغلقة، نتحقق من is_locked
    if (lockedPeriods && lockedPeriods.length > 0) {
      // إذا كان is_locked غير محدد، نعتبر الفترة مقفلة إذا كانت status = 'closed' أو 'locked'
      const isLocked = lockedPeriods.some(
        (p: any) => p.is_locked === true || p.status === "closed" || p.status === "locked"
      )

      if (isLocked) {
        const period = lockedPeriods[0]
        return {
          isLocked: true,
          periodId: period.id,
          periodName: period.period_name,
          error: `الفترة المحاسبية "${period.period_name}" مقفلة. لا يمكن إضافة أو تعديل القيود المحاسبية في هذه الفترة.`,
        }
      }
    }

    return {
      isLocked: false,
    }
  } catch (error: any) {
    return {
      isLocked: false,
      error: error.message || "حدث خطأ في التحقق من قفل الفترة",
    }
  }
}

/**
 * التحقق من أن التاريخ غير مقفل وإلا يرفع استثناء
 * 
 * @throws Error إذا كانت الفترة مقفلة
 */
export async function assertPeriodNotLocked(
  supabase: SupabaseClient,
  params: PeriodLockCheckParams
): Promise<void> {
  const result = await checkPeriodLock(supabase, params)

  if (result.isLocked) {
    throw new Error(result.error || "Accounting period is locked")
  }
}

/**
 * التحقق من أن نطاق التواريخ غير مقفل
 * 
 * يتحقق من كل تاريخ في النطاق
 */
export async function checkPeriodRangeLock(
  supabase: SupabaseClient,
  companyId: string,
  startDate: string,
  endDate: string
): Promise<PeriodLockResult> {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const current = new Date(start)

  // التحقق من كل تاريخ في النطاق
  while (current <= end) {
    const dateStr = current.toISOString().split("T")[0]
    const result = await checkPeriodLock(supabase, { companyId, date: dateStr })

    if (result.isLocked) {
      return result
    }

    current.setDate(current.getDate() + 1)
  }

  return { isLocked: false }
}

/**
 * قفل فترة محاسبية
 */
export async function lockPeriod(
  supabase: SupabaseClient,
  periodId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from("accounting_periods")
      .update({
        is_locked: true,
        status: "locked",
        closed_by: userId,
        closed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", periodId)

    if (error) {
      return {
        success: false,
        error: error.message,
      }
    }

    return { success: true }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "حدث خطأ في قفل الفترة",
    }
  }
}

/**
 * فتح فترة محاسبية (للمالك فقط)
 */
export async function unlockPeriod(
  supabase: SupabaseClient,
  periodId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // التحقق من أن المستخدم مالك
    const { data: period } = await supabase
      .from("accounting_periods")
      .select("company_id")
      .eq("id", periodId)
      .single()

    if (!period) {
      return {
        success: false,
        error: "الفترة غير موجودة",
      }
    }

    const { data: member } = await supabase
      .from("company_members")
      .select("role")
      .eq("company_id", period.company_id)
      .eq("user_id", userId)
      .single()

    if (!member || member.role !== "owner") {
      return {
        success: false,
        error: "غير مصرح - المالك فقط يمكنه فتح الفترة",
      }
    }

    const { error } = await supabase
      .from("accounting_periods")
      .update({
        is_locked: false,
        status: "open",
        closed_by: null,
        closed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", periodId)

    if (error) {
      return {
        success: false,
        error: error.message,
      }
    }

    return { success: true }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "حدث خطأ في فتح الفترة",
    }
  }
}
