type SupabaseLike = any

export type ResolvedNotificationRecipient =
  | {
      kind: "role"
      role: string
      branchId?: string | null
      warehouseId?: string | null
      costCenterId?: string | null
    }
  | {
      kind: "user"
      userId: string
      role?: string | null
      branchId?: string | null
      warehouseId?: string | null
      costCenterId?: string | null
    }

export function buildNotificationRecipientScopeSegments(
  recipient: ResolvedNotificationRecipient
): string[] {
  if (recipient.kind === "role") {
    return [
      "role",
      recipient.role,
      recipient.branchId || "company",
      recipient.warehouseId || "all_warehouses",
      recipient.costCenterId || "all_cost_centers",
    ]
  }

  return [
    "user",
    recipient.userId,
    recipient.branchId || "company",
    recipient.warehouseId || "all_warehouses",
    recipient.costCenterId || "all_cost_centers",
  ]
}

export class NotificationRecipientResolverService {
  constructor(private readonly supabase: SupabaseLike) {}

  /**
   * v3.74.855 — **إرسالٌ واحد للإدارة العليا، لا ثلاثة.**
   *
   * `components/NotificationCenter.tsx` يعامل (owner / admin / general_manager)
   * **جمهوراً واحداً**: كلٌّ منهم يرى إشعارات الآخرين (`upperRoles`). فإرسالٌ
   * بدور لكلٍّ منها يعنى أن المالك يفتح جرسه فيجد **الرسالة نفسها ثلاث مرات**.
   *
   * أبلغ المالك بذلك من الاستعمال الحى فى ٨٥١، فأُصلحت ستة مسارات تصنيع
   * هناك — ثم أظهر فحصٌ يقرأ القاعدة **٢٢ حدثاً آخر بـ٤٥ نسخة زائدة** فى
   * الفواتير والحجوزات والدفعات وردّ العميل. وكلها تمرّ من هنا.
   *
   * ⇒ **من يكتب لجمهور يقرأ قاعدة الجمهور أولاً.** وعدد المرسَل إليهم يُقاس
   *   بعدد **من ستصلهم الرسالة**، لا بعدد الأدوار المذكورة.
   *
   * ولماذا `owner` تحديداً وليس `admin`؟ لأن قاعدة القراءة تُظهر إشعار أى دور
   * علوى للثلاثة، **ولأن المالك موجود دائماً** بينما قد لا يكون فى الشركة
   * admin ولا general_manager — وهو بالضبط عطب ٧٤.٢٠ المسجَّل أدناه: إرسالٌ
   * لأدوار لا أحد يشغلها = إشعار لا يصل أحداً.
   *
   * ⚠️ ولا تُضَف الأدوار الثلاثة معاً هنا مرة أخرى: `check:dup-notify` يقرأ
   *    قاعدة الإنتاج ويكسر البناء إن زاد عدد الأحداث المكرَّرة.
   */
  private static readonly SENIOR_MANAGEMENT_ROLE = "owner"

  resolveExecutiveRecipients(): ResolvedNotificationRecipient[] {
    return [
      {
        kind: "role",
        role: NotificationRecipientResolverService.SENIOR_MANAGEMENT_ROLE,
        branchId: null, warehouseId: null, costCenterId: null,
      },
    ]
  }

  resolveLeadershipRecipients(): ResolvedNotificationRecipient[] {
    return [
      {
        kind: "role",
        role: NotificationRecipientResolverService.SENIOR_MANAGEMENT_ROLE,
        branchId: null, warehouseId: null, costCenterId: null,
      },
    ]
  }

  /**
   * v3.74.20 — Canonical "high-level approver" recipient list for any workflow
   * whose Level-1 approver pool is {owner, admin, general_manager, manager}.
   *
   * Why this exists: every workflow that allows the owner to approve at Level-1
   * (sales_return_requests, payment_approvals, purchase_returns, bills, expenses,
   * customer_refunds, etc.) used to hardcode `['admin', 'general_manager', 'manager']`
   * — silently excluding `owner`. In small companies where only the owner exists
   * at the executive tier (no admin/general_manager hired), the approval
   * notification went to nobody and the workflow stalled with no inbox signal.
   *
   * Callers pass `branchId` to scope the manager recipient to the originating
   * branch (managers are branch-scoped). Owner/admin/general_manager remain
   * company-wide because their authority is not branch-bound.
   *
   * Note: branch accountants (when relevant) are added separately via
   * `resolveBranchAccountantRecipients` — they are recipients of approval
   * notifications by convention but are not Level-1 approvers.
   */
  resolveLevel1ApproverRecipients(
    branchId?: string | null,
    warehouseId?: string | null,
    costCenterId?: string | null
  ): ResolvedNotificationRecipient[] {
    return [
      // Owner / admin / general_manager are company-wide authorities — they
      // see every Level-1 request regardless of which branch raised it. We
      // intentionally do NOT scope these to branchId.
      //
      // v3.74.855 — ONE send for the three of them, not three. NotificationCenter
      // shows each of owner/admin/general_manager the others' notifications, so a
      // send per role delivered the same message three times to each of them. The
      // owner reported exactly that. They all still receive it, and all three are
      // still permitted to approve — only the duplication is gone.
      {
        kind: "role",
        role: NotificationRecipientResolverService.SENIOR_MANAGEMENT_ROLE,
        branchId: null, warehouseId: null, costCenterId: null,
      },
      // Manager is branch-scoped — only the manager of the branch that raised
      // the request gets the notification. Pass-through the warehouse and
      // cost-center hints in case the caller wants tighter scoping (most
      // callers leave them null).
      {
        kind: "role",
        role: "manager",
        branchId: branchId || null,
        warehouseId: warehouseId || null,
        costCenterId: costCenterId || null,
      },
    ]
  }

  /**
   * إشعار «للعلم» للإدارة العليا — إرسالٌ واحد أصلاً، فلم يكن مصدر تكرار.
   *
   * v3.74.855 — وُحِّد مع الثابت رغم ذلك: كان يُرسل لـ`admin` صراحةً، ويصل
   * الثلاثة بحكم قاعدة القراءة. لكن **مصدر حقيقة واحد أفضل من اثنين
   * متطابقين بالصدفة**: لو غُيّر الجمهور يوماً، يُغيَّر فى موضع واحد.
   * والأنسب `owner` لأنه موجود دائماً (درس ٧٤.٢٠) وغير مُقيَّد بفرع.
   */
  resolveLeadershipVisibilityRecipients(
    branchId?: string | null,
    warehouseId?: string | null,
    costCenterId?: string | null
  ): ResolvedNotificationRecipient[] {
    return [
      {
        kind: "role",
        role: NotificationRecipientResolverService.SENIOR_MANAGEMENT_ROLE,
        branchId: branchId || null,
        warehouseId: warehouseId || null,
        costCenterId: costCenterId || null,
      },
    ]
  }

  resolveRoleRecipients(
    roles: string[],
    branchId?: string | null,
    warehouseId?: string | null,
    costCenterId?: string | null
  ): ResolvedNotificationRecipient[] {
    return roles.map((role) =>
      this.resolveBranchRoleRecipient(role, branchId || null, warehouseId || null, costCenterId || null)
    )
  }

  resolveBranchRoleRecipient(role: string, branchId?: string | null, warehouseId?: string | null, costCenterId?: string | null): ResolvedNotificationRecipient {
    return {
      kind: "role",
      role,
      branchId: branchId || null,
      warehouseId: warehouseId || null,
      costCenterId: costCenterId || null,
    }
  }

  resolveBranchAccountantRecipients(branchId?: string | null, costCenterId?: string | null): ResolvedNotificationRecipient[] {
    return [this.resolveBranchRoleRecipient("accountant", branchId || null, null, costCenterId || null)]
  }

  resolveUserRecipient(userId: string, role?: string | null, branchId?: string | null, warehouseId?: string | null, costCenterId?: string | null): ResolvedNotificationRecipient {
    return {
      kind: "user",
      userId,
      role: role || null,
      branchId: branchId || null,
      warehouseId: warehouseId || null,
      costCenterId: costCenterId || null,
    }
  }

  resolveInvoiceOriginatorRecipient(userId?: string | null, branchId?: string | null, costCenterId?: string | null): ResolvedNotificationRecipient[] {
    if (!userId) return []
    return [this.resolveUserRecipient(userId, null, branchId || null, null, costCenterId || null)]
  }

  buildRecipientScopeSegments(recipient: ResolvedNotificationRecipient): string[] {
    return buildNotificationRecipientScopeSegments(recipient)
  }

  async resolveWarehouseRecipientsForBranch(companyId: string, branchId?: string | null): Promise<ResolvedNotificationRecipient[]> {
    if (!branchId) {
      return [this.resolveBranchRoleRecipient("store_manager", null, null, null)]
    }

    const { data, error } = await this.supabase
      .from("company_members")
      .select("user_id, role, branch_id, warehouse_id, cost_center_id")
      .eq("company_id", companyId)
      .eq("branch_id", branchId)
      .in("role", ["warehouse_manager", "store_manager"])

    if (error || !Array.isArray(data) || data.length === 0) {
      return [this.resolveBranchRoleRecipient("store_manager", branchId, null, null)]
    }

    return data.map((member: any) =>
      this.resolveUserRecipient(
        String(member.user_id),
        String(member.role || ""),
        member.branch_id || branchId,
        member.warehouse_id || null,
        member.cost_center_id || null
      )
    )
  }

  async resolveWarehouseRecipients(
    companyId: string,
    branchId?: string | null,
    warehouseId?: string | null
  ): Promise<ResolvedNotificationRecipient[]> {
    const recipients = await this.resolveWarehouseRecipientsForBranch(companyId, branchId || null)

    if (!warehouseId) {
      return recipients
    }

    const filtered = recipients.filter((recipient) => {
      if (recipient.kind !== "user") return true
      return !recipient.warehouseId || recipient.warehouseId === warehouseId
    })

    if (filtered.length > 0) {
      return filtered
    }

    return [this.resolveBranchRoleRecipient("store_manager", branchId || null, warehouseId, null)]
  }
}
