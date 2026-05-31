import { NextResponse } from "next/server"
import * as Sentry from "@sentry/nextjs"

/**
 * GET /api/sentry-test
 *
 * Throws a controlled error to verify Sentry is capturing server-side events.
 * Disabled in production unless ?confirm=1 is passed.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const confirm = url.searchParams.get("confirm") === "1"

  if (process.env.NODE_ENV === "production" && !confirm) {
    return NextResponse.json(
      {
        message: "Append ?confirm=1 to trigger a test error in production.",
        production: true,
      },
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
