"use client"

import { getClient, isSupabaseConfigured } from "./client"

export function useSupabase() {
  // في بيئة البناء (build time)، نعيد null بدلاً من رمي خطأ
  // لأن الصفحات التي تستخدم "use client" قد يتم تقييمها أثناء البناء
  if (typeof window === 'undefined') {
    // نحن في بيئة الخادم (SSR أو build time)
    // نعيد كائن وهمي لتجنب الأخطاء أثناء البناء
    return null as any
  }

  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not properly configured')
  }
  return getClient()
}

export { isSupabaseConfigured }
