/**
 * Compensating deletion of a journal entry, with the failure made visible.
 *
 * The problem this replaces
 * -------------------------
 * Six command services rolled back a partially-written journal entry inside a
 * catch block like this:
 *
 *     } catch (error) {
 *       if (journalEntryId) {
 *         await admin.from("journal_entry_lines").delete().eq("journal_entry_id", journalEntryId)
 *         await admin.from("journal_entries").delete().eq("id", journalEntryId)
 *       }
 *       throw error
 *     }
 *
 * supabase-js does not throw on a failed delete — it returns { error }. So if
 * the compensation failed, nothing happened, nothing was reported, and the
 * original error was rethrown on top of it. The caller sees the first failure
 * and has no idea the cleanup also failed.
 *
 * What survives that is a half-written journal entry in the ledger from an
 * operation that was supposed to have been undone. It will not balance against
 * anything, no document references it, and nobody is told.
 *
 * Why this logs instead of throwing
 * ---------------------------------
 * Throwing here would replace the ORIGINAL error — the reason the operation
 * failed in the first place — with a cleanup error, and the caller would lose
 * the diagnosis that actually matters. So the rollback failure is logged in a
 * fixed, greppable form and the caller still rethrows the original.
 *
 * The marker ROLLBACK_INCOMPLETE is deliberate: it is what to search the logs
 * for when a ledger entry appears that no document explains.
 */
type WriteResult = { error: { message: string } | null }

interface MinimalClient {
  from(table: string): {
    delete(): {
      eq(column: string, value: string): PromiseLike<WriteResult>
    }
  }
}

export interface RollbackOutcome {
  ok: boolean
  failures: string[]
}

/**
 * Deletes a journal entry's lines then its header, reporting either failure.
 *
 * Lines first, header second — the reverse order would leave lines pointing at
 * a header that no longer exists if the second delete failed.
 */
export async function rollbackJournalEntry(
  client: MinimalClient,
  journalEntryId: string,
  context: string
): Promise<RollbackOutcome> {
  const failures: string[] = []

  const { error: linesErr } = await client
    .from("journal_entry_lines")
    .delete()
    .eq("journal_entry_id", journalEntryId)

  if (linesErr) failures.push(`lines: ${linesErr.message}`)

  const { error: headerErr } = await client
    .from("journal_entries")
    .delete()
    .eq("id", journalEntryId)

  if (headerErr) failures.push(`header: ${headerErr.message}`)

  if (failures.length > 0) {
    console.error(
      `[ROLLBACK_INCOMPLETE] ${context}: journal entry ${journalEntryId} could not be removed ` +
        `after a failed operation. It is still in the ledger and no document explains it. ` +
        failures.join(" | ")
    )
    return { ok: false, failures }
  }

  return { ok: true, failures: [] }
}
