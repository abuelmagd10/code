"use client"

import { getClient, isSupabaseConfigured } from "./client"

export function useSupabase() {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not properly configured')
  }
  return getClient()
}

export { isSupabaseConfigured }
