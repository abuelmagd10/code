import { NextResponse } from "next/server"

/**
 * ⛔️ RETIRED — debug endpoint disabled for security (2026-07-12).
 * Previously built a raw SQL string passed to rpc('sql') and lacked a
 * financial_reports permission check. No API callers. Permanently disabled.
 * Balance-sheet auditing remains available via /api/balance-sheet-audit.
 * Safe to delete this file.
 */
export async function GET() {
  return NextResponse.json({ error: "gone", message: "This debug endpoint has been retired." }, { status: 410 })
}

export async function POST() {
  return NextResponse.json({ error: "gone", message: "This debug endpoint has been retired." }, { status: 410 })
}
