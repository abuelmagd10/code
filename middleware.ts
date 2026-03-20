import { updateSession } from "@/lib/supabase/middleware"
import { logger } from "@/lib/logger"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

export async function middleware(request: NextRequest) {
  const startTime = Date.now()
  const { pathname } = request.nextUrl

  // Run session update (auth refresh)
  const response = await updateSession(request)

  // Log API requests only (skip static/UI routes)
  if (pathname.startsWith('/api/')) {
    const durationMs = Date.now() - startTime
    const statusCode = response instanceof NextResponse
      ? response.status
      : 200

    // Extract identifiers from request headers (set by governance middleware)
    const companyId = request.headers.get('x-company-id') ?? undefined
    const userId = request.headers.get('x-user-id') ?? undefined

    logger.apiRequest({
      route: pathname,
      method: request.method,
      statusCode,
      durationMs,
      companyId,
      userId,
    })

    // Add response time header for debugging
    if (response instanceof NextResponse) {
      response.headers.set('X-Response-Time', `${durationMs}ms`)
    }
  }

  return response
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest\\.json|sw\\.js|sw-register\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"
  ],
}

