import { createBrowserClient } from "@supabase/ssr"

let supabaseClient: ReturnType<typeof createBrowserClient> | null = null
let isInitializing = false

export function createClient() {
  if (typeof window === "undefined") {
    throw new Error("Supabase client can only be created in the browser")
  }

  // التحقق من وجود متغيرات البيئة الصحيحة
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  if (!supabaseUrl || !supabaseAnonKey || 
      supabaseUrl.includes('dummy') || supabaseAnonKey.includes('dummy')) {
    throw new Error('Supabase configuration is missing or contains dummy values. Please check your environment variables.')
  }

  if (!supabaseClient && !isInitializing) {
    isInitializing = true
    try {
      supabaseClient = createBrowserClient(
        supabaseUrl,
        supabaseAnonKey,
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

// Check if Supabase is properly configured
export function isSupabaseConfigured(): boolean {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  return !!(supabaseUrl && supabaseAnonKey && 
           !supabaseUrl.includes('dummy') && !supabaseAnonKey.includes('dummy'))
}
