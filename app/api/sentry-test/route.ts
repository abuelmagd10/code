import { NextResponse } from "next/server"
import * as Sentry from "@sentry/nextjs"

/**
 * GET /api/sentry-test
 *
 * Throws a controlled error to verify Sentry is capturing server-side events.
 *
 * Hardened in v3.62.8: in production the endpoint is completely 404 unless
 * the env var SENTRY_TEST_ENABLED is set to "1". This prevents anyone
 * (or an automated scanner) from spamming Sentry with fake errors.
 *
 * To re-enable for a verification window:
 *   1. Set SENTRY_TEST_ENABLED=1 on Vercel (production env)
 *   2. Hit /api/sentry-test?confirm=1
 *   3. Unset SENTRY_TEST_ENABLED immediately after verification
 */
export async function GET(request: Request) {
  // Hard gate: in production, require explicit env flag
  if (
    process.env.NODE_ENV === "production" &&
    process.env.SENTRY_TEST_ENABLED !== "1"
  ) {
    return new NextResponse("Not Found", { status: 404 })
  }

  // Even with the env flag, still require ?confirm=1 to avoid drive-by hits
  const url = new URL(request.url)
  const confirm = url.searchParams.get("confirm") === "1"
  if (!confirm) {
    return NextResponse.json(
      { message: "Append ?confirm=1 to trigger a test error." },
      { status: 200 }
    )
  }

  Sentry.captureMessage("Sentry test endpoint hit", "info")
  try {
    throw new Error(`Sentry server-side test error at ${new Date().toISOString()}`)
  } catch (err) {
    Sentry.captureException(err)
    return NextResponse.json(
      { message: "Server-side test error captured. Check Sentry dashboard." },
      { status: 200 }
    )
  }
}
