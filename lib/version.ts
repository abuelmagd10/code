/**
 * Application version — the canonical string updated on each release.
 *
 * Why a hand-edited constant instead of reading package.json?
 *   - package.json version stayed at the Next.js default ("0.1.0") and is
 *     not bumped per release in this repo (git tags / commits are the SSOT).
 *   - Importing JSON in Next.js client bundles inflates the chunk and
 *     forces resolveJsonModule on every consumer.
 *   - A plain const works at build-time and runtime, in server + client.
 *
 * On each release, bump this AND the `git commit` version together. The
 * release script `push_v3.X.Y.ps1` greps for this string as a safety check.
 */
export const APP_VERSION = "3.74.402"

/**
 * Parse "major.minor.patch" into numeric parts. Bad input yields zeros.
 */
export function parseVersion(v: string): { major: number; minor: number; patch: number } {
  const parts = String(v || "").split(".")
  const num = (i: number) => {
    const n = parseInt(parts[i] ?? "0", 10)
    return Number.isFinite(n) ? n : 0
  }
  return { major: num(0), minor: num(1), patch: num(2) }
}

/**
 * Backup compatibility check:
 *   - Major version MUST match exactly (breaking schema changes are a hard stop).
 *   - Backup minor MUST be <= current minor (we can read older backups, not newer).
 *   - Patch differences are always allowed.
 *
 * Legacy backups from before v3.61.1 stamped a hardcoded "1.0.0" in
 * system_version. Treat that as a one-time backward-compat path.
 */
export function isBackupVersionCompatible(
  backupVersion: string,
  currentVersion: string
): { compatible: boolean; reason: string } {
  // Legacy hardcoded value before A5 fix — accept once with a warning.
  if (backupVersion === "1.0.0") {
    return {
      compatible: true,
      reason:
        "نسخة قديمة بإصدار 1.0.0 — مقبولة للتوافق العكسى. يُنصح بإعادة تصدير نسخة جديدة بعد الاستعادة.",
    }
  }

  const b = parseVersion(backupVersion)
  const c = parseVersion(currentVersion)

  if (b.major !== c.major) {
    return {
      compatible: false,
      reason: `Major version mismatch — backup is ${b.major}.x but system is ${c.major}.x. Schema is incompatible.`,
    }
  }
  if (b.minor > c.minor) {
    return {
      compatible: false,
      reason: `Backup is from a newer minor version (${backupVersion}). Update the system before restoring.`,
    }
  }
  return { compatible: true, reason: "Compatible" }
}
