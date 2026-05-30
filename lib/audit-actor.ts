/**
 * Resolves a human-friendly identity for audit_logs rows.
 *
 * Order of preference for the display name:
 *   1. user_metadata.full_name
 *   2. user_metadata.name
 *   3. local-part of the email (everything before '@')
 *   4. the raw email
 *
 * Returns { user_email, user_name } ready to spread into an audit_logs insert.
 */
export function resolveActorInfo(user: {
  email?: string | null
  user_metadata?: Record<string, unknown> | null
} | null | undefined): { user_email: string | null; user_name: string | null } {
  if (!user) return { user_email: null, user_name: null }
  const email = user.email ?? null
  const meta = user.user_metadata || {}
  const fullName = typeof meta.full_name === "string" ? meta.full_name.trim() : ""
  const name = typeof meta.name === "string" ? meta.name.trim() : ""
  const emailPrefix = email ? email.split("@")[0] : ""
  const display = fullName || name || emailPrefix || email || null
  return { user_email: email, user_name: display }
}
