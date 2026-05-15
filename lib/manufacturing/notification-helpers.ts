/**
 * Phase R8 — Warehouse-Specific Notification Routing
 *
 * بدلاً من إرسال الإشعار لكل مسؤولي المخزن في الشركة (assigned_to_role),
 * نُرسله فقط للمستخدمين المرتبطين بمخزن محدد (assigned_to_user).
 *
 * Fallback: إذا لم يكن هناك أي مستخدم مرتبط بالمخزن → نُرسل للدور كاملاً.
 */

const WAREHOUSE_STAFF_ROLES = ["store_manager", "warehouse_manager"]

interface NotifyWarehouseParams {
  admin:         ReturnType<typeof import("@/lib/supabase/server").createServiceClient>
  companyId:     string
  warehouseId:   string | null
  notifBase:     Record<string, unknown>
  eventKeyPrefix: string
  referenceId:   string
}

interface NotifyResult {
  notified: number
  failed:   number
  usedFallback: boolean
}

/**
 * إرسال الإشعار لمسؤولي المخزن المحدد فقط.
 * إذا كان warehouseId = null أو لا يوجد مستخدم مرتبط → fallback للـ role.
 */
export async function notifyWarehouseStaff(params: NotifyWarehouseParams): Promise<NotifyResult> {
  const { admin, companyId, warehouseId, notifBase, eventKeyPrefix, referenceId } = params

  if (!warehouseId) {
    return await _fallbackRoleNotify(admin, notifBase, eventKeyPrefix, referenceId)
  }

  try {
    const { data: staff } = await admin
      .from("company_members")
      .select("user_id")
      .eq("company_id", companyId)
      .eq("warehouse_id", warehouseId)
      .in("role", WAREHOUSE_STAFF_ROLES)

    if (!staff || staff.length === 0) {
      return await _fallbackRoleNotify(admin, notifBase, eventKeyPrefix, referenceId)
    }

    let notified = 0
    let failed = 0
    for (const s of staff) {
      try {
        await admin.rpc("create_notification", {
          ...notifBase,
          p_assigned_to_role: null,
          p_assigned_to_user: s.user_id,
          p_event_key: `${eventKeyPrefix}_user_${s.user_id}_${referenceId}`,
        })
        notified++
      } catch {
        failed++
      }
    }
    return { notified, failed, usedFallback: false }
  } catch {
    return await _fallbackRoleNotify(admin, notifBase, eventKeyPrefix, referenceId)
  }
}

async function _fallbackRoleNotify(
  admin: NotifyWarehouseParams["admin"],
  notifBase: Record<string, unknown>,
  eventKeyPrefix: string,
  referenceId: string
): Promise<NotifyResult> {
  let notified = 0
  let failed = 0
  for (const role of WAREHOUSE_STAFF_ROLES) {
    try {
      await admin.rpc("create_notification", {
        ...notifBase,
        p_assigned_to_role: role,
        p_assigned_to_user: null,
        p_event_key: `${eventKeyPrefix}_${role}_${referenceId}`,
      })
      notified++
    } catch {
      failed++
    }
  }
  return { notified, failed, usedFallback: true }
}
