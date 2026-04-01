import { createServerClient } from "@supabase/ssr"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"

export async function createClient() {
  const cookieStore = await cookies()
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anon = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
        }
      },
    },
    global: {
      headers: {
        apikey: anon,
      },
    },
  })
}

/**
 * Service-role client — bypasses RLS entirely.
 * Use ONLY in server-side API routes AFTER verifying user identity and permissions separately.
 * NEVER expose this client or its key to the browser.
 */
export function createServiceClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured")
  return createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
}

