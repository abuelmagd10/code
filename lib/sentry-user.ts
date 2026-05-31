/**
 * Helpers to attach user identity and company scope to every Sentry event,
 * so that when we look at an error in the dashboard we can immediately see
 *   - who hit it (auth.users.id + email)
 *   - which company it was for
 *   - which role they had
 *
 * Call `setSentryUser(...)` after AccessContext finishes loading.
 * Call `clearSentryUser()` on logout.
 */

import * as Sentry from "@sentry/nextjs"

export interface SentryActorScope {
  userId: string
  email?: string | null
  companyId?: string | null
  companyName?: string | null
  role?: string | null
  branchId?: string | null
}

export function setSentryUser(scope: SentryActorScope): void {
  if (!scope?.userId) return
  Sentry.setUser({
    id: scope.userId,
    email: scope.email || undefined,
  })
  Sentry.setTags({
    company_id: scope.companyId || "unknown",
    role: scope.role || "unknown",
    branch_id: scope.branchId || "unknown",
  })
  if (scope.companyName) {
    Sentry.setContext("company", {
      id: scope.companyId,
      name: scope.companyName,
    })
  }
}

export function clearSentryUser(): void {
  Sentry.setUser(null)
}
