import { NextRequest, NextResponse } from "next/server"

import { apiGuard } from "@/lib/core/security/api-guard"
import { createServiceClient } from "@/lib/supabase/server"
import {
  NotificationOutboxShadowDispatcherService,
} from "@/lib/outbox/notification-outbox-shadow-dispatcher.service"
import type { NotificationOutboxDeliveryStatus } from "@/lib/outbox/domain-event-contract"

const getParam = (params: URLSearchParams, ...names: string[]) => {
  for (const name of names) {
    const value = params.get(name)
    if (value && value.trim()) return value.trim()
  }
  return null
}

const parseDeliveryStatus = (
  value: string | null
): NotificationOutboxDeliveryStatus | null => {
  if (!value) return null
  if (
    value === "pending" ||
    value === "processing" ||
    value === "dispatched" ||
    value === "failed" ||
    value === "dead_letter"
  ) {
    return value
  }

  return null
}

const parseBoolean = (value: string | null, fallback: boolean) => {
  if (!value) return fallback
  const normalized = value.trim().toLowerCase()
  if (["1", "true", "yes"].includes(normalized)) return true
  if (["0", "false", "no"].includes(normalized)) return false
  return fallback
}

export async function GET(request: NextRequest) {
  const { context, errorResponse } = await apiGuard(request, {
    resource: "reports",
    action: "read",
  })
  if (errorResponse || !context) return errorResponse

  try {
    const params = request.nextUrl.searchParams
    const limit = Number(params.get("limit") || 100)
    const service = new NotificationOutboxShadowDispatcherService(createServiceClient())
    const result = await service.simulate({
      companyId: context.companyId,
      eventType: getParam(params, "event_type", "eventType"),
      deliveryStatus: parseDeliveryStatus(getParam(params, "delivery_status", "deliveryStatus")),
      createdAfter: getParam(params, "created_after", "createdAfter", "baseline_created_after"),
      cursor: getParam(params, "cursor"),
      limit: Number.isFinite(limit) ? limit : 100,
      includeUnsupported: parseBoolean(
        getParam(params, "include_unsupported", "includeUnsupported"),
        true
      ),
    })

    return NextResponse.json({ success: true, data: result })
  } catch (error: any) {
    console.error("[NOTIFICATION_OUTBOX_SHADOW_DISPATCH]", error)
    return NextResponse.json(
      {
        success: false,
        error: String(
          error?.message || "Failed to simulate notification outbox shadow dispatch"
        ),
      },
      { status: 500 }
    )
  }
}
