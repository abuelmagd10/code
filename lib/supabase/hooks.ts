"use client"

import { getClient } from "./client"

export function useSupabase() {
  return getClient()
}
