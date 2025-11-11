import { updateSession } from "@/lib/supabase/middleware"
import type { NextRequest } from "next/server"

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  // Exclude auth pages from proxy to prevent interference during login/signup
  matcher: ["/((?!_next/static|_next/image|favicon.ico|auth/.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
