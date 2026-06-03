/**
 * archive-on-action.ts — v3.74.18
 *
 * One-line helper every approve/reject handler in the project calls AFTER
 * the workflow record's status has been updated successfully. It archives
 * every notification (category='approvals') that was assigned to anyone
 * regarding this workflow record so the user inbox shows only the latest
 * stage for each record.
 *
 * Why explicit calls instead of magic:
 *   - The archive trigger is "the user took the requested action", not
 *     "the database matched some event_key after 30 seconds". That's the
 *     semantic Ahmed asked for in v3.74.18.
 *   - Only category='approvals' notifications are touched. Informational,
 *     billing, renewal, etc. notifications are untouched.
 *
 * Failures are intentionally swallowed: the workflow has already committed.
 * Archiving is a UX cleanup, not a correctness guarantee. A failure here
 * leaves the notification in place (which is the v3.74.17 safety-net
 * scenario) and the create_notification time-window protection will still
 * catch a subsequent resubmission.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export interface ArchiveOnActionArgs {
  /**
   * Any Supabase client. Anon, server, or service-role all work — the RPC
   * is SECURITY DEFINER.
   */
  supabase: Pick<SupabaseClient, "rpc">
  /** The company that owns the workflow record */
  companyId: string
  /**
   * The notification's `reference_type` for this workflow. Must match the
   * exact string the workflow uses when CREATING notifications. Examples:
   *   'expense', 'sales_return_request', 'inventory_transfer'
   */
  referenceType: string
  /** The workflow record id (matches notifications.reference_id) */
  referenceId: string
}

export async function archiveApprovalNotificationsForRecord(
  args: ArchiveOnActionArgs
): Promise<number> {
  try {
    const { data, error } = await args.supabase.rpc(
      "archive_approval_notifications_for_record",
      {
        p_company_id: args.companyId,
        p_reference_type: args.referenceType,
        p_reference_id: args.referenceId,
      }
    )
    if (error) {
      // Non-fatal — log and move on. The workflow change is already committed.
      console.warn(
        `[archiveApprovalNotificationsForRecord] failed for ${args.referenceType}=${args.referenceId}:`,
        error.message
      )
      return 0
    }
    return Number(data ?? 0)
  } catch (e: any) {
    console.warn(
      `[archiveApprovalNotificationsForRecord] threw for ${args.referenceType}=${args.referenceId}:`,
      e?.message || e
    )
    return 0
  }
}
