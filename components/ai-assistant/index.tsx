"use client"

import { usePathname } from "next/navigation"
import { useAIAssistant } from "@/hooks/use-ai-assistant"
import { FloatingHelpButton } from "./floating-help-button"
import { GuidePanel } from "./guide-panel"
import { EXCLUDED_PREFIXES } from "@/lib/page-guides"

/**
 * FloatingAIAssistant — the root orchestrator.
 *
 * Injected once globally into app/layout.tsx via next/dynamic (ssr: false).
 * Renders nothing on auth / excluded pages and when the assistant is disabled.
 *
 * Security: read-only display component. No financial operations.
 */
export default function FloatingAIAssistant() {
  const pathname = usePathname()

  const {
    settings,
    guide,
    isOpen,
    isLoadingGuide,
    isAlreadySeen,
    pageKey,
    openGuide,
    closeGuide,
    markCurrentPageSeen,
    lang,
  } = useAIAssistant()

  // ─── Guard: excluded pages ────────────────────────────────────────────────

  const isExcluded =
    !pathname ||
    pathname === "/" ||
    EXCLUDED_PREFIXES.some((p) => pathname.startsWith(p))

  if (isExcluded) return null

  // ─── Guard: assistant disabled or mode=disabled ───────────────────────────

  if (!settings.ai_assistant_enabled) return null
  if (settings.ai_mode === "disabled") return null

  // ─── Guard: no page key (unknown page) ───────────────────────────────────

  if (!pageKey) return null

  // Show pulse dot when in auto mode and page not yet seen
  const showPulse = settings.ai_mode === "auto" && !isAlreadySeen

  return (
    <>
      <FloatingHelpButton
        onClick={openGuide}
        lang={lang}
        showPulse={showPulse}
      />
      <GuidePanel
        isOpen={isOpen}
        onClose={closeGuide}
        guide={guide}
        isLoading={isLoadingGuide}
        lang={lang}
        showDontShowAgain={settings.ai_mode === "auto"}
        isAlreadySeen={isAlreadySeen}
        onMarkSeen={markCurrentPageSeen}
      />
    </>
  )
}
