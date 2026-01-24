import { createBrowserClient } from "@supabase/ssr"

let supabaseClient: ReturnType<typeof createBrowserClient> | null = null
let isInitializing = false

export function createClient() {
  if (typeof window === "undefined") {
    throw new Error("Supabase client can only be created in the browser")
  }

  // ✅ إذا كان العميل موجوداً بالفعل، نعيده مباشرة
  if (supabaseClient) {
    return supabaseClient
  }

  // ✅ منع التهيئة المتعددة المتزامنة
  if (isInitializing) {
    // ✅ انتظار قصير ثم إعادة المحاولة (بدلاً من spin-lock)
    // في الواقع، createBrowserClient synchronous، لذا هذا لن يحدث
    // لكن نضيفه للاحتياط
    let attempts = 0
    while (isInitializing && attempts < 10) {
      // انتظار قصير جداً (microtask)
      attempts++
    }
    if (supabaseClient) {
      return supabaseClient
    }
  }

  // التحقق من وجود متغيرات البيئة الصحيحة
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  if (!supabaseUrl || !supabaseAnonKey || 
      supabaseUrl.includes('dummy') || supabaseAnonKey.includes('dummy')) {
    throw new Error('Supabase configuration is missing or contains dummy values. Please check your environment variables.')
  }

  isInitializing = true
  try {
    supabaseClient = createBrowserClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        global: {
          headers: {
            apikey: supabaseAnonKey,
          },
        },
      }
    )
    return supabaseClient
  } finally {
    isInitializing = false
  }
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
