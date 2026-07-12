import { NextResponse } from "next/server"

/**
 * ⛔️ RETIRED — diagnostic endpoint disabled for security (2026-07-12).
 * Previously exposed any company's inventory via the service-role key with
 * NO authentication. No callers. Permanently disabled. Safe to delete.
 */
export async function POST() {
  return NextResponse.json({ error: "gone", message: "This diagnostic endpoint has been retired." }, { status: 410 })
}

export async function GET() {
  return NextResponse.json({ error: "gone", message: "This diagnostic endpoint has been retired." }, { status: 410 })
}
