import { NextResponse } from "next/server"

/**
 * ⛔️ RETIRED — schema diagnostic disabled for security (2026-07-12).
 * Previously ran service-role schema/function introspection with NO
 * authentication. No callers. Permanently disabled. Safe to delete.
 */
export async function GET() {
  return NextResponse.json({ error: "gone", message: "This diagnostic endpoint has been retired." }, { status: 410 })
}

export async function POST() {
  return NextResponse.json({ error: "gone", message: "This diagnostic endpoint has been retired." }, { status: 410 })
}
