"use client"

import { useMemo } from "react"
import { usePathname } from "next/navigation"
import { useAIAssistant } from "@/hooks/use-ai-assistant"
import { useAIAlerts } from "@/hooks/use-ai-alerts"
import { FloatingHelpButton } from "./floating-help-button"
import { GuidePanel } from "./guide-panel"
import { EXCLUDED_PREFIXES } from "@/lib/page-guides"

/**
 * FloatingAIAssistant - the root orchestrator.
 *
 * Injected once globally into app/layout.tsx via next/dynamic (ssr: false).
 * Renders nothing on auth / excluded pages and when the assistant is disabled.
 *
 * Security: read-only display component. No financial operations.
 * v3.60.0 Phase 4: proactive alerts (badge + cards) - fully governed via
 *                  ai_current_user_allowed_resources().
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

  const isExcluded =
    !pathname ||
    pathname === "/" ||
    EXCLUDED_PREFIXES.some((p) => pathname.startsWith(p))

  const alertsEnabled =
    !isExcluded &&
    settings.ai_assistant_enabled &&
    settings.ai_mode !== "disabled" &&
    !!pageKey

  const { alerts, total: alertTotal } = useAIAlerts(lang, alertsEnabled)

  const topSeverity = useMemo<"critical" | "warning" | "info" | null>(() => {
    if (alerts.some((a) => a.severity === "critical")) return "critical"
    if (alerts.some((a) => a.severity === "warning")) return "warning"
    if (alerts.length > 0) return "info"
    return null
  }, [alerts])

  if (isExcluded) return null
  if (!settings.ai_assistant_enabled) return null
  if (settings.ai_mode === "disabled") return null
  if (!pageKey) return null

  const showPulse = settings.ai_mode === "auto" && !isAlreadySeen

  return (
    <>
      <FloatingHelpButton
        onClick={openGuide}
        lang={lang}
        showPulse={showPulse}
        alertCount={alertTotal}
        alertSeverity={topSeverity}
      />
      <GuidePanel
        isOpen={isOpen}
        onClose={closeGuide}
        guide={guide}
        isLoading={isLoadingGuide}
        lang={lang}
        pageKey={pageKey}
        showDontShowAgain={settings.ai_mode === "auto"}
        isAlreadySeen={isAlreadySeen}
        onMarkSeen={markCurrentPageSeen}
        alerts={alerts}
      />
    </>
  )
}
