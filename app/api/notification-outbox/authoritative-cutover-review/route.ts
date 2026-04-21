import { NextRequest, NextResponse } from "next/server"

import { apiGuard } from "@/lib/core/security/api-guard"
import {
  isSupportedNotificationOutboxCanaryEventType,
  SUPPORTED_NOTIFICATION_OUTBOX_CANARY_EVENT_TYPES,
} from "@/lib/outbox/notification-outbox-activation-policy"
import { NotificationOutboxAuthoritativeCutoverReviewService } from "@/lib/outbox/notification-outbox-authoritative-cutover-review.service"
import { createServiceClient } from "@/lib/supabase/server"

const CUTOVER_REVIEW_ROLES = new Set(["owner", "admin", "general_manager"])

const getParam = (params: URLSearchParams, ...names: string[]) => {
  for (const name of names) {
    const value = params.get(name)
    if (value && value.trim()) return value.trim()
  }
  return null
}

const parseLimit = (value: string | null) => {
  const parsed = Number(value || 200)
  if (!Number.isFinite(parsed)) return 200
  return Math.min(Math.max(parsed, 1), 500)
}

const parseProcessingStuckMinutes = (value: string | null) => {
  const parsed = Number(value || 15)
  if (!Number.isFinite(parsed)) return 15
  return Math.min(Math.max(parsed, 1), 1440)
}

const statusForCutoverReviewError = (message: string) => {
  if (message.includes("OUTBOX_AUTHORITATIVE_CUTOVER_EVENT_TYPE_NOT_SUPPORTED")) {
    return 400
  }
  return 500
}

export async function GET(request: NextRequest) {
  const { context, errorResponse } = await apiGuard(request, {
    resource: "reports",
    action: "read",
  })
  if (errorResponse || !context) return errorResponse

  const memberRole = String(context.member?.role || "").toLowerCase()
  if (!CUTOVER_REVIEW_ROLES.has(memberRole)) {
    return NextResponse.json(
      {
        success: false,
        error:
          "OUTBOX_AUTHORITATIVE_CUTOVER_REVIEW_FORBIDDEN: authoritative cutover review is restricted to governance leadership roles",
      },
      { status: 403 }
    )
  }

  try {
    const params = request.nextUrl.searchParams
    const eventType = getParam(params, "event_type", "eventType")

    if (eventType && !isSupportedNotificationOutboxCanaryEventType(eventType)) {
      return NextResponse.json(
        {
          success: false,
          error: `OUTBOX_AUTHORITATIVE_CUTOVER_EVENT_TYPE_NOT_SUPPORTED: ${eventType}`,
          supported_event_types: SUPPORTED_NOTIFICATION_OUTBOX_CANARY_EVENT_TYPES,
        },
        { status: 400 }
      )
    }

    const service = new NotificationOutboxAuthoritativeCutoverReviewService(createServiceClient())
    const result = await service.evaluate({
      companyId: context.companyId,
      eventType,
      createdAfter: getParam(params, "created_after", "createdAfter", "baseline_created_after"),
      limit: parseLimit(getParam(params, "limit")),
      processingStuckMinutes: parseProcessingStuckMinutes(
        getParam(params, "processing_stuck_minutes", "processingStuckMinutes")
      ),
    })

    return NextResponse.json({
      success: true,
      data: result,
      cutover_review_scope: {
        company_id: context.companyId,
        actor_role: memberRole,
        supported_event_types: SUPPORTED_NOTIFICATION_OUTBOX_CANARY_EVENT_TYPES,
      },
    })
  } catch (error: any) {
    const message = String(
      error?.message || "Failed to evaluate notification outbox authoritative cutover review"
    )
    console.error("[NOTIFICATION_OUTBOX_AUTHORITATIVE_CUTOVER_REVIEW]", error)
    return NextResponse.json(
      {
        success: false,
        error: message,
        supported_event_types: SUPPORTED_NOTIFICATION_OUTBOX_CANARY_EVENT_TYPES,
      },
      { status: statusForCutoverReviewError(message) }
    )
  }
}
