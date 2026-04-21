import type { SupabaseClient } from "@supabase/supabase-js"

import {
  createDomainEvent,
  toNotificationOutboxInsertRecord,
  type CreateDomainEventInput,
  type DomainEvent,
  type DomainEventPayload,
} from "@/lib/outbox/domain-event-contract"

type SupabaseLike = Pick<SupabaseClient<any>, "from"> | any

export type EnqueueNotificationOutboxResult<TPayload extends DomainEventPayload = DomainEventPayload> = {
  event: DomainEvent<TPayload>
  inserted: boolean
  duplicate: boolean
}

export class NotificationOutboxService {
  constructor(private readonly supabase: SupabaseLike) {}

  async enqueue<TPayload extends DomainEventPayload>(
    input: CreateDomainEventInput<TPayload>
  ): Promise<EnqueueNotificationOutboxResult<TPayload>> {
    const event = createDomainEvent(input)

    const { error } = await this.supabase
      .from("notification_outbox_events")
      .insert(toNotificationOutboxInsertRecord(event))

    if (error) {
      if (error.code === "23505" && event.idempotencyKey) {
        return {
          event,
          inserted: false,
          duplicate: true,
        }
      }

      throw new Error(error.message || "Failed to enqueue notification outbox event")
    }

    return {
      event,
      inserted: true,
      duplicate: false,
    }
  }
}
