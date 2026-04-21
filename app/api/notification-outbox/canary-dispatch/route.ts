import { NextRequest, NextResponse } from "next/server"

import { apiGuard } from "@/lib/core/security/api-guard"
import {
  SUPPORTED_NOTIFICATION_OUTBOX_CANARY_EVENT_TYPES,
} from "@/lib/outbox/notification-outbox-activation-policy"
import { NotificationOutboxDispatcherService } from "@/lib/outbox/notification-outbox-dispatcher.service"
import { createServiceClient } from "@/lib/supabase/server"

const CANARY_CONTROL_ROLES = new Set(["owner", "admin", "general_manager"])

const asNullableString = (value: unknown) => {
  const normalized = String(value || "").trim()
  return normalized || null
}

const parseLimit = (value: unknown) => {
  const parsed = Number(value || 25)
  if (!Number.isFinite(parsed)) return 25
  return Math.min(Math.max(parsed, 1), 100)
}

const statusForCanaryDispatchError = (message: string) => {
  if (message.includes("OUTBOX_CANARY_EVENT_TYPE_NOT_SUPPORTED")) return 400
  if (message.includes("OUTBOX_CANARY_NOT_ALLOWED")) return 409
  return 500
}

async function parseOptionalJson(request: NextRequest) {
  try {
    const rawBody = await request.text()
    if (!rawBody.trim()) return {}
    return JSON.parse(rawBody)
  } catch {
    return {}
  }
}

export async function POST(request: NextRequest) {
  const { context, errorResponse } = await apiGuard(request, {
    resource: "reports",
    action: "approve",
  })
  if (errorResponse || !context) return errorResponse

  const memberRole = String(context.member?.role || "").toLowerCase()
  if (!CANARY_CONTROL_ROLES.has(memberRole)) {
    return NextResponse.json(
      {
        success: false,
        error: "OUTBOX_CANARY_FORBIDDEN: controlled activation is restricted to governance leadership roles",
      },
      { status: 403 }
    )
  }

  try {
    const body = await parseOptionalJson(request)
    const eventType = asNullableString(body?.event_type || body?.eventType)

    if (
      eventType &&
      !SUPPORTED_NOTIFICATION_OUTBOX_CANARY_EVENT_TYPES.includes(
        eventType as (typeof SUPPORTED_NOTIFICATION_OUTBOX_CANARY_EVENT_TYPES)[number]
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error: `OUTBOX_CANARY_EVENT_TYPE_NOT_SUPPORTED: ${eventType}`,
          supported_event_types: SUPPORTED_NOTIFICATION_OUTBOX_CANARY_EVENT_TYPES,
        },
        { status: 400 }
      )
    }

    const service = new NotificationOutboxDispatcherService(createServiceClient())
    const result = await service.dispatchCanary({
      companyId: context.companyId,
      eventType,
      limit: parseLimit(body?.limit),
      actorId: context.user.id,
    })

    return NextResponse.json({
      success: true,
      data: result,
      canary_scope: {
        company_id: context.companyId,
        actor_role: memberRole,
        supported_event_types: SUPPORTED_NOTIFICATION_OUTBOX_CANARY_EVENT_TYPES,
      },
    })
  } catch (error: any) {
    const message = String(
      error?.message || "Failed to execute notification outbox canary dispatch"
    )
    console.error("[NOTIFICATION_OUTBOX_CANARY_DISPATCH]", error)
    return NextResponse.json(
      {
        success: false,
        error: message,
        supported_event_types: SUPPORTED_NOTIFICATION_OUTBOX_CANARY_EVENT_TYPES,
      },
      { status: statusForCanaryDispatchError(message) }
    )
  }
}
