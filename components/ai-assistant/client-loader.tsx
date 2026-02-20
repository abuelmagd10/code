"use client"

import dynamic from "next/dynamic"

// dynamic with ssr:false must live inside a Client Component.
// This thin wrapper is imported by app/layout.tsx (Server Component).
const FloatingAIAssistant = dynamic(
  () => import("@/components/ai-assistant"),
  { ssr: false }
)

export function AIAssistantClientLoader() {
  return <FloatingAIAssistant />
}
