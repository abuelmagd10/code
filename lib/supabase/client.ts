import { createBrowserClient } from "@supabase/ssr"

let supabaseClient: ReturnType<typeof createBrowserClient> | null = null
let isInitializing = false

export function createClient() {
  if (typeof window === "undefined") {
    throw new Error("Supabase client can only be created in the browser")
  }

  if (!supabaseClient && !isInitializing) {
    isInitializing = true
    try {
      supabaseClient = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      )
    } finally {
      isInitializing = false
    }
  }

  // Wait for initialization to complete if it's in progress
  while (isInitializing) {
    // Spin-lock until initialization is done
  }

  return supabaseClient!
}

// Get the existing client without creating a new one
export function getClient() {
  if (!supabaseClient && typeof window !== "undefined") {
    return createClient()
  }
  return supabaseClient
}
