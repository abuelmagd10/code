/**
 * 🔔 BookingNotificationService
 *
 * Sends in-app notifications for all booking lifecycle events.
 * Follows the canonical pattern of PurchaseOrderNotificationService.
 *
 * Rules:
 *  - Calls create_notification RPC directly (SECURITY DEFINER, idempotent via event_key)
 *  - Loads booking context internally from v_bookings_full (no extra DB reads at call sites)
 *  - Dispatch is fire-and-forget inside a try/catch — failures NEVER propagate to callers
 *  - category: 'sales' (booking revenue belongs to sales domain)
 *  - reference_type: 'booking' (maps to /bookings/<id> via notification-routing.ts)
 */

import {
  buildNotificationEventKey,
  normalizeNotificationSeverity,
} from "@/lib/notification-workflow"
import {
  NotificationRecipientResolverService,
  type ResolvedNotificationRecipient,
} from "@/lib/services/notification-recipient-resolver.service"

type SupabaseLike = any

// ─── Internal booking context (loaded once per operation) ───────────────────
interface BookingContext {
  booking_no:   string
  customer_name: string | null
  service_name: string | null
  service_type: string | null
  booking_date: string
  start_time:   string | null
  branch_id:    string | null
  branch_name:  string | null
  staff_user_id: string | null
  // v3.74.590 — التعيين المتعدد: كل الموظفين المرتبطين بالحجز
  assigned_staff_user_ids: string[] | null
  total_amount:  number
  paid_amount:   number
  invoice_id:    string | null
  cancellation_reason: string | null
}

// ─── Notification payload descriptor ────────────────────────────────────────
interface NotificationPayload {
  referenceType: string
  referenceId:   string
  title:         string
  message:       string
  priority:      "low" | "normal" | "high" | "urgent"
  severity:      "info" | "warning" | "error" | "critical"
  category:      "finance" | "inventory" | "sales" | "approvals" | "system"
  eventAction:   string
}

// ─── Public method params ────────────────────────────────────────────────────
export interface BookingEventParams {
  /** booking UUID */
  bookingId:   string
  companyId:   string
  /** user who triggered the action (auth.uid) */
  actorUserId: string
  /** optional pre-loaded context — service will look up if not provided */
  context?:    Partial<BookingContext>
}

export interface BookingCompletedParams extends BookingEventParams {
  invoiceId?: string | null
  invoiceNo?: string | null
}

export interface BookingCancelledParams extends BookingEventParams {
  cancellationReason?: string | null
}

export interface BookingRatedParams extends BookingEventParams {
  rating: number
}

export interface BookingPaymentParams extends BookingEventParams {
  amount:        number
  paymentMethod: string
}

export interface BookingReminderParams extends BookingEventParams {
  hoursBeforeService: number
}

// ─── Service ─────────────────────────────────────────────────────────────────
export class BookingNotificationService {
  constructor(private readonly supabase: SupabaseLike) {}

  // ── Context loader ──────────────────────────────────────────────────────────
  private async loadContext(bookingId: string, companyId: string): Promise<BookingContext | null> {
    const { data, error } = await this.supabase
      .from("v_bookings_full")
      .select([
        "booking_no", "customer_name", "service_name", "service_type",
        "booking_date", "start_time", "branch_id", "branch_name",
        "staff_user_id", "assigned_staff_user_ids", "total_amount", "paid_amount",
        "invoice_id", "cancellation_reason",
      ].join(","))
      .eq("id", bookingId)
      .eq("company_id", companyId)
      .maybeSingle()

    if (error) {
      console.error("⚠️ [BookingNotification] Failed to load context:", error.message)
      return null
    }
    return data as BookingContext | null
  }

  private mergeContext(loaded: BookingContext | null, override?: Partial<BookingContext>): BookingContext {
    const base: BookingContext = loaded ?? {
      booking_no:          "—",
      customer_name:       null,
      service_name:        null,
      service_type:        null,
      booking_date:        "—",
      start_time:          null,
      branch_id:           null,
      branch_name:         null,
      staff_user_id:       null,
      assigned_staff_user_ids: null,
      total_amount:        0,
      paid_amount:         0,
      invoice_id:          null,
      cancellation_reason: null,
    }
    return { ...base, ...override }
  }

  // ── Staff recipients ────────────────────────────────────────────────────────
  // v3.74.590 — الحجز قد يكون معيّناً لعدة موظفين (booking_staff_assignments
  // عبر v_bookings_full.assigned_staff_user_ids) إضافة إلى staff_user_id
  // الفردى. كل نقاط إشعار الموظف تمر من هنا لضمان وصول الإشعار للجميع
  // بلا تكرار.
  private staffRecipients(
    ctx: BookingContext,
    resolver: NotificationRecipientResolverService
  ): ResolvedNotificationRecipient[] {
    const ids = new Set<string>()
    if (ctx.staff_user_id) ids.add(ctx.staff_user_id)
    for (const id of ctx.assigned_staff_user_ids ?? []) {
      if (id) ids.add(id)
    }
    return Array.from(ids).map(id => resolver.resolveUserRecipient(id, null, ctx.branch_id))
  }

  // ── Label helpers ───────────────────────────────────────────────────────────
  private formatBookingLabel(ctx: BookingContext): string {
    const parts: string[] = [`رقم ${ctx.booking_no}`]
    if (ctx.customer_name) parts.push(`العميل: ${ctx.customer_name}`)
    if (ctx.service_name)  parts.push(`الخدمة: ${ctx.service_name}`)
    if (ctx.booking_date)  parts.push(`التاريخ: ${ctx.booking_date}`)
    if (ctx.start_time)    parts.push(`الوقت: ${ctx.start_time.slice(0, 5)}`)
    return parts.join(" | ")
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 1. Booking Created (draft)
  //    → Manager of the branch
  // ══════════════════════════════════════════════════════════════════════════
  async notifyBookingCreated(p: BookingEventParams): Promise<void> {
    const loaded = await this.loadContext(p.bookingId, p.companyId)
    const ctx    = this.mergeContext(loaded, p.context)
    const label  = this.formatBookingLabel(ctx)
    const resolver = new NotificationRecipientResolverService(this.supabase)

    const payload: NotificationPayload = {
      referenceType: "booking",
      referenceId:   p.bookingId,
      title:         "حجز جديد تم إنشاؤه",
      message:       `تم إنشاء حجز جديد بحالة مسودة — ${label}`,
      priority:      "normal",
      severity:      "info",
      category:      "sales",
      eventAction:   "created",
    }

    const recipients: ResolvedNotificationRecipient[] = [
      ...resolver.resolveRoleRecipients(["manager"], ctx.branch_id, null, null),
    ]

    await this.dispatch(p, ctx, recipients, payload, "⚠️ [BookingNotification] notifyBookingCreated failed:")
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 2. Booking Confirmed (draft → confirmed)
  //    → Assigned staff member (if any), Manager
  // ══════════════════════════════════════════════════════════════════════════
  async notifyBookingConfirmed(p: BookingEventParams): Promise<void> {
    const loaded = await this.loadContext(p.bookingId, p.companyId)
    const ctx    = this.mergeContext(loaded, p.context)
    const label  = this.formatBookingLabel(ctx)
    const resolver = new NotificationRecipientResolverService(this.supabase)

    const payload: NotificationPayload = {
      referenceType: "booking",
      referenceId:   p.bookingId,
      title:         "تأكيد الحجز",
      message:       `تم تأكيد الحجز — ${label}`,
      priority:      "normal",
      severity:      "info",
      category:      "sales",
      eventAction:   "confirmed",
    }

    // v3.74.590 — كل الموظفين المعينين على الحجز يستلمون إشعار التأكيد
    const recipients: ResolvedNotificationRecipient[] = this.staffRecipients(ctx, resolver)

    await this.dispatch(p, ctx, recipients, payload, "⚠️ [BookingNotification] notifyBookingConfirmed failed:")
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 3. Booking Started (confirmed → in_progress)
  //    → Manager (for awareness)
  // ══════════════════════════════════════════════════════════════════════════
  async notifyBookingStarted(p: BookingEventParams): Promise<void> {
    const loaded = await this.loadContext(p.bookingId, p.companyId)
    const ctx    = this.mergeContext(loaded, p.context)
    const label  = this.formatBookingLabel(ctx)
    const resolver = new NotificationRecipientResolverService(this.supabase)

    const payload: NotificationPayload = {
      referenceType: "booking",
      referenceId:   p.bookingId,
      title:         "بدأت الخدمة",
      message:       `انطلقت الخدمة — ${label}`,
      priority:      "low",
      severity:      "info",
      category:      "sales",
      eventAction:   "started",
    }

    const recipients = resolver.resolveRoleRecipients(["manager"], ctx.branch_id, null, null)

    await this.dispatch(p, ctx, recipients, payload, "⚠️ [BookingNotification] notifyBookingStarted failed:")
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 4. Booking Completed (in_progress → completed) + invoice created
  //    → Accountant (branch) — high priority (invoice needs processing)
  //    → Staff member — acknowledgement
  // ══════════════════════════════════════════════════════════════════════════
  async notifyBookingCompleted(p: BookingCompletedParams): Promise<void> {
    const loaded = await this.loadContext(p.bookingId, p.companyId)
    const ctx    = this.mergeContext(loaded, p.context)
    const label  = this.formatBookingLabel(ctx)
    const resolver = new NotificationRecipientResolverService(this.supabase)

    const invoiceNo  = p.invoiceNo ?? ctx.invoice_id ?? "—"
    const invoicePart = invoiceNo !== "—" ? ` | فاتورة: ${invoiceNo}` : ""

    const accountantPayload: NotificationPayload = {
      referenceType: "booking",
      referenceId:   p.bookingId,
      title:         "حجز مكتمل — فاتورة صادرة",
      message:       `اكتمل الحجز وتم إصدار الفاتورة — ${label}${invoicePart}`,
      priority:      "high",
      severity:      "info",
      category:      "sales",
      eventAction:   "completed_accountant",
    }

    const staffPayload: NotificationPayload = {
      referenceType: "booking",
      referenceId:   p.bookingId,
      title:         "اكتمال الحجز",
      message:       `تم إتمام الحجز بنجاح — ${label}`,
      priority:      "normal",
      severity:      "info",
      category:      "sales",
      eventAction:   "completed_staff",
    }

    // Accountant at branch
    const accountantRecipients = resolver.resolveBranchAccountantRecipients(ctx.branch_id, null)
    await this.dispatch(p, ctx, accountantRecipients, accountantPayload, "⚠️ [BookingNotification] notifyBookingCompleted (accountant) failed:")

    // Staff members — v3.74.590: يشمل كل المعينين على الحجز
    const staffRecipients = this.staffRecipients(ctx, resolver)
    if (staffRecipients.length > 0) {
      await this.dispatch(
        p,
        ctx,
        staffRecipients,
        staffPayload,
        "⚠️ [BookingNotification] notifyBookingCompleted (staff) failed:"
      )
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 5. Booking Cancelled (→ cancelled)
  //    → Staff member, Manager (high priority — may need refund)
  // ══════════════════════════════════════════════════════════════════════════
  async notifyBookingCancelled(p: BookingCancelledParams): Promise<void> {
    const loaded = await this.loadContext(p.bookingId, p.companyId)
    const ctx    = this.mergeContext(loaded, {
      ...p.context,
      cancellation_reason: p.cancellationReason ?? loaded?.cancellation_reason ?? null,
    })
    const label  = this.formatBookingLabel(ctx)
    const resolver = new NotificationRecipientResolverService(this.supabase)

    const depositWarning = ctx.paid_amount > 0
      ? ` | مبلغ مدفوع مسبقاً: ${ctx.paid_amount} (يجب معالجة الاسترداد)`
      : ""
    const reasonPart = ctx.cancellation_reason
      ? ` | السبب: ${ctx.cancellation_reason}`
      : ""

    const payload: NotificationPayload = {
      referenceType: "booking",
      referenceId:   p.bookingId,
      title:         "إلغاء حجز",
      message:       `تم إلغاء الحجز — ${label}${reasonPart}${depositWarning}`,
      priority:      "high",
      severity:      "warning",
      category:      "sales",
      eventAction:   "cancelled",
    }

    const recipients: ResolvedNotificationRecipient[] = [
      ...resolver.resolveRoleRecipients(["manager"], ctx.branch_id, null, null),
    ]

    // Notify staff members personally — v3.74.590: كل المعينين
    recipients.push(...this.staffRecipients(ctx, resolver))

    await this.dispatch(p, ctx, recipients, payload, "⚠️ [BookingNotification] notifyBookingCancelled failed:")
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 6. No-Show (confirmed → no_show)
  //    → Manager (high priority — potential lost revenue)
  // ══════════════════════════════════════════════════════════════════════════
  async notifyBookingNoShow(p: BookingEventParams): Promise<void> {
    const loaded = await this.loadContext(p.bookingId, p.companyId)
    const ctx    = this.mergeContext(loaded, p.context)
    const label  = this.formatBookingLabel(ctx)
    const resolver = new NotificationRecipientResolverService(this.supabase)

    const payload: NotificationPayload = {
      referenceType: "booking",
      referenceId:   p.bookingId,
      title:         "غياب العميل (No-Show)",
      message:       `لم يحضر العميل — ${label}`,
      priority:      "high",
      severity:      "warning",
      category:      "sales",
      eventAction:   "no_show",
    }

    const recipients = resolver.resolveRoleRecipients(["manager"], ctx.branch_id, null, null)

    await this.dispatch(p, ctx, recipients, payload, "⚠️ [BookingNotification] notifyBookingNoShow failed:")
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 7. Payment Added (deposit / partial payment)
  //    → Accountant at branch
  // ══════════════════════════════════════════════════════════════════════════
  async notifyBookingPaymentAdded(p: BookingPaymentParams): Promise<void> {
    const loaded = await this.loadContext(p.bookingId, p.companyId)
    const ctx    = this.mergeContext(loaded, p.context)
    const label  = this.formatBookingLabel(ctx)
    const resolver = new NotificationRecipientResolverService(this.supabase)

    const payload: NotificationPayload = {
      referenceType: "booking",
      referenceId:   p.bookingId,
      title:         "دفعة جديدة على حجز",
      message:       `دفعة بقيمة ${p.amount} (${p.paymentMethod}) — ${label}`,
      priority:      "normal",
      severity:      "info",
      category:      "sales",
      eventAction:   "payment_added",
    }

    const recipients = resolver.resolveBranchAccountantRecipients(ctx.branch_id, null)

    await this.dispatch(p, ctx, recipients, payload, "⚠️ [BookingNotification] notifyBookingPaymentAdded failed:")
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 8. Low Rating (rating < 3 stars)
  //    → Owner + Admin + Manager (urgent — needs immediate attention)
  // ══════════════════════════════════════════════════════════════════════════
  async notifyLowRating(p: BookingRatedParams): Promise<void> {
    if (p.rating >= 3) return  // Only fire for low ratings

    const loaded = await this.loadContext(p.bookingId, p.companyId)
    const ctx    = this.mergeContext(loaded, p.context)
    const label  = this.formatBookingLabel(ctx)
    const resolver = new NotificationRecipientResolverService(this.supabase)

    const stars = "⭐".repeat(p.rating) + "☆".repeat(5 - p.rating)

    const payload: NotificationPayload = {
      referenceType: "booking",
      referenceId:   p.bookingId,
      title:         `تقييم منخفض ${stars}`,
      message:       `تقييم ${p.rating}/5 — ${label}`,
      priority:      "urgent",
      severity:      "warning",
      category:      "sales",
      eventAction:   "low_rating",
    }

    const recipients: ResolvedNotificationRecipient[] = [
      ...resolver.resolveLeadershipRecipients(),                                          // owner, admin, GM
      ...resolver.resolveRoleRecipients(["manager"], ctx.branch_id, null, null),          // branch manager
    ]

    await this.dispatch(p, ctx, recipients, payload, "⚠️ [BookingNotification] notifyLowRating failed:")
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 9. Booking Reminder (24h / 1h before service)
  //    → Assigned staff member
  //    Called from cron endpoint (/api/cron/booking-reminders)
  // ══════════════════════════════════════════════════════════════════════════
  async notifyBookingReminder(p: BookingReminderParams): Promise<void> {
    const loaded = await this.loadContext(p.bookingId, p.companyId)
    const ctx    = this.mergeContext(loaded, p.context)
    const label  = this.formatBookingLabel(ctx)
    const resolver = new NotificationRecipientResolverService(this.supabase)

    const windowLabel = p.hoursBeforeService === 1
      ? "خلال ساعة"
      : `خلال ${p.hoursBeforeService} ساعة`

    const payload: NotificationPayload = {
      referenceType: "booking",
      referenceId:   p.bookingId,
      title:         `تذكير بحجز — ${windowLabel}`,
      message:       `لديك حجز ${windowLabel} — ${label}`,
      priority:      "high",
      severity:      "info",
      category:      "sales",
      eventAction:   `reminder_${p.hoursBeforeService}h`,
    }

    // v3.74.590 — التذكير يصل لكل الموظفين المعينين على الحجز
    const recipients: ResolvedNotificationRecipient[] = this.staffRecipients(ctx, resolver)

    if (recipients.length === 0) {
      // Fallback: notify branch manager
      recipients.push(...resolver.resolveRoleRecipients(["manager"], ctx.branch_id, null, null))
    }

    await this.dispatch(p, ctx, recipients, payload, "⚠️ [BookingNotification] notifyBookingReminder failed:")
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Internal: dispatch to all recipients (silent failures per recipient)
  // ══════════════════════════════════════════════════════════════════════════
  private async dispatch(
    p: BookingEventParams,
    ctx: BookingContext,
    recipients: ResolvedNotificationRecipient[],
    payload: NotificationPayload,
    warnLabel: string
  ): Promise<void> {
    for (const recipient of recipients) {
      try {
        await this.createNotification(p, ctx, recipient, payload)
      } catch (err: any) {
        console.error(warnLabel, err?.message || err)
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Internal: single notification INSERT via create_notification RPC
  // ══════════════════════════════════════════════════════════════════════════
  private async createNotification(
    p: BookingEventParams,
    ctx: BookingContext,
    recipient: ResolvedNotificationRecipient,
    payload: NotificationPayload
  ): Promise<void> {
    const resolver = new NotificationRecipientResolverService(this.supabase)
    const scopeSegments = resolver.buildRecipientScopeSegments(recipient)

    const eventKey = buildNotificationEventKey(
      "booking",
      payload.referenceId,
      payload.eventAction,
      ...scopeSegments
    )

    const { error } = await this.supabase.rpc("create_notification", {
      p_company_id:       p.companyId,
      p_reference_type:   payload.referenceType,
      p_reference_id:     payload.referenceId,
      p_title:            payload.title,
      p_message:          payload.message,
      p_created_by:       p.actorUserId,
      p_branch_id:        recipient.kind === "role" ? (recipient.branchId ?? ctx.branch_id ?? null) : (recipient.branchId ?? null),
      p_cost_center_id:   null,
      p_warehouse_id:     null,
      p_assigned_to_role: recipient.kind === "role" ? recipient.role : null,
      p_assigned_to_user: recipient.kind === "user" ? recipient.userId : null,
      p_priority:         payload.priority,
      p_event_key:        eventKey,
      p_severity:         normalizeNotificationSeverity(payload.severity),
      p_category:         payload.category,
    })

    if (error) {
      throw new Error(error.message || "create_notification RPC failed")
    }
  }
}
