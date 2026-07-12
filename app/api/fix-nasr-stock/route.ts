import { NextResponse } from "next/server"

/**
 * ⛔️ RETIRED — one-off maintenance script disabled for security (2026-07-12).
 * Previously used the Supabase service-role key with NO authentication to
 * overwrite product stock. It had no callers. Permanently disabled.
 * This file can be safely deleted from disk.
 */
export async function POST() {
  return NextResponse.json({ error: "gone", message: "This maintenance endpoint has been retired." }, { status: 410 })
}

export async function GET() {
  return NextResponse.json({ error: "gone", message: "This maintenance endpoint has been retired." }, { status: 410 })
}
