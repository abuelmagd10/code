"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bell,
  Bot,
  CheckCircle2,
  Clock,
  Info,
  Lightbulb,
  ListChecks,
  Loader2,
  MessageSquare,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  X,
} from "lucide-react"
import type { AICopilotInteractivePayload } from "@/lib/ai/contracts"
import { buildERPQuestionBankPrompts } from "@/lib/ai/question-bank"
import type { AccountingPattern, PageGuide } from "@/lib/page-guides"
import type { PageSuggestion } from "@/lib/ai/cross-page-search"
import type { AIProactiveAlert } from "@/hooks/use-ai-alerts"

interface GuidePanelProps {
  isOpen: boolean
  onClose: () => void
  guide: PageGuide | null
  isLoading: boolean
  lang: "ar" | "en"
  pageKey: string | null
  showDontShowAgain: boolean
  isAlreadySeen: boolean
  onMarkSeen: () => void
  /** Proactive smart suggestions (v3.60.0 Phase 4) */
  alerts?: AIProactiveAlert[]
}

interface ChatMessage {
  id?: string
  role: "user" | "assistant"
  content: string
  fallbackUsed?: boolean
  fallbackReason?: string | null
  model?: string | null
  responseMeta?: AICopilotInteractivePayload | null
  relatedPages?: PageSuggestion[]
}

const MAX_OUTGOING_CHAT_HISTORY = 12
const MAX_OUTGOING_CHAT_CHARS = 3200

// ─── Friendly user-facing labels (no developer terminology) ───────────────
const L = {
  ar: {
    // Header
    panelTitle: "مساعدك الذكى",
    panelTitleWithPage: "مساعدك فى",
    welcomeHeadline: "أهلاً بك",
    welcomePageIntro: "هذه نظرة سريعة على هذه الصفحة لتبدأ بثقة:",

    // Welcome cards
    howToUse: "كيف تستخدم هذه الصفحة",
    tips: "نصائح مفيدة",
    accountingPattern: "ماذا يحدث محاسبياً هنا",
    financialEvent: "الحدث المالى",
    journalEntry: "القيد المحاسبى",
    balanceImpact: "أثره على المراكز المالية",
    debit: "مدين",
    credit: "دائن",
    assets: "الأصول",
    liabilities: "الخصوم",
    equity: "حقوق الملكية",
    pl: "الأرباح والخسائر",
    noEntries: "لا توجد قيود محاسبية لهذه العملية",

    // No guide
    noGuide: "لا يوجد دليل لهذه الصفحة بعد، لكن يمكنك سؤالى عن أى شىء يخصها.",

    // Auto-mode controls
    dontShow: "لا تُظهر الترحيب مرة أخرى لهذه الصفحة",
    close: "إغلاق",

    // Live panel
    livePanelTitle: "ملخص الصفحة الآن",
    pageMetrics: "أرقام الصفحة",
    smartAlerts: "ملاحظات تستحق الانتباه",
    suggestedActions: "ماذا تفعل الآن",
    predictedActions: "الخطوة التالية الذكية",
    quickPrompts: "أسئلة سريعة",
    permissionsLine: "صلاحياتك",

    // Chat empty state
    emptyStartTitle: "اسألنى ما تريد عن هذه الصفحة",
    emptyStartBody:
      "أستطيع شرح الخطوات، توضيح صلاحياتك، أو الإجابة على أى سؤال يخص هذا الجزء من النظام.",

    // Chat bubbles
    you: "أنت",
    assistant: "المساعد",

    // Input
    inputPlaceholder: "اكتب سؤالك هنا...",
    send: "إرسال",
    thinking: "أفكر فى ردى...",
    hint: "ردودى مبنية على هذه الصفحة وعلى صلاحياتك، ولا أُعدِّل أى بيانات أبداً.",

    // Errors / states
    errorSending: "لم أستطع إرسال رسالتك الآن، حاول مرة أخرى بعد لحظة.",
    sessionLoading: "جارٍ استرجاع محادثتك السابقة...",
    safeMode: "وضع آمن",
    safeModeNote: "هذا الرد محلى آمن لأن خدمة الذكاء الخارجية غير متاحة الآن.",

    // Header safety chip
    readOnlyChip: "للقراءة فقط",

    relatedPagesTitle: "ربما تقصد إحدى هذه الصفحات",
    goToPage: "افتح الصفحة",

    // Proactive alerts (v3.60.0 Phase 4)
    proactiveAlertsHeadline: "لاحظتُ بعض الأمور التى تحتاج مُتابَعَتك",
    proactiveActionOpen: "افتح الصفحة",
    severityCritical: "عاجِل",
    severityWarning: "تحذير",
    severityInfo: "للعِلم",
  },
  en: {
    panelTitle: "Your smart assistant",
    panelTitleWithPage: "Helping you on",
    welcomeHeadline: "Welcome",
    welcomePageIntro: "Here's a quick look at this page to get you started:",

    howToUse: "How to use this page",
    tips: "Helpful tips",
    accountingPattern: "What happens here financially",
    financialEvent: "Financial event",
    journalEntry: "Journal entry",
    balanceImpact: "Impact on financial position",
    debit: "Dr",
    credit: "Cr",
    assets: "Assets",
    liabilities: "Liabilities",
    equity: "Equity",
    pl: "Profit & Loss",
    noEntries: "No accounting entries for this operation",

    noGuide:
      "No page guide yet, but you can still ask me anything about this page.",

    dontShow: "Don't show this welcome again for this page",
    close: "Close",

    livePanelTitle: "This page right now",
    pageMetrics: "Page numbers",
    smartAlerts: "Worth your attention",
    suggestedActions: "What to do now",
    predictedActions: "Smart next step",
    quickPrompts: "Quick questions",
    permissionsLine: "Your access",

    emptyStartTitle: "Ask me anything about this page",
    emptyStartBody:
      "I can explain the workflow, clarify your permissions, or answer any question about this part of the system.",

    you: "You",
    assistant: "Assistant",

    inputPlaceholder: "Type your question here...",
    send: "Send",
    thinking: "Thinking about my reply...",
    hint: "My answers come from this page and your permissions. I never modify any data.",

    errorSending: "Couldn't send your message right now. Please try again in a moment.",
    sessionLoading: "Restoring your previous conversation...",
    safeMode: "Safe mode",
    safeModeNote:
      "This is a safe local reply because the external AI service is unavailable right now.",

    readOnlyChip: "Read-only",

    relatedPagesTitle: "You might be looking for",
    goToPage: "Open page",

    // Proactive alerts (v3.60.0 Phase 4)
    proactiveAlertsHeadline: "I noticed a few things that need follow-up",
    proactiveActionOpen: "Open page",
    severityCritical: "Urgent",
    severityWarning: "Warning",
    severityInfo: "FYI",
  },
}

type Labels = typeof L["ar"]

export function GuidePanel({
  isOpen,
  onClose,
  guide,
  isLoading,
  lang,
  pageKey,
  showDontShowAgain,
  isAlreadySeen,
  onMarkSeen,
  alerts,
}: GuidePanelProps) {
  const proactiveAlerts = Array.isArray(alerts) ? alerts : []
  const t = L[lang]
  const dir = lang === "ar" ? "rtl" : "ltr"

  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const [liveBootstrap, setLiveBootstrap] =
    useState<AICopilotInteractivePayload | null>(null)
  const [isHydratingChat, setIsHydratingChat] = useState(false)
  const [hasHydratedChat, setHasHydratedChat] = useState(false)

  const endRef = useRef<HTMLDivElement | null>(null)
  const scrollAreaClass =
    "flex-1 overflow-y-scroll pr-3 [scrollbar-gutter:stable] notification-scrollbar"

  const suggestedPrompts = useMemo(
    () => buildSuggestedPrompts(lang, guide?.title, pageKey),
    [guide?.title, lang, pageKey]
  )

  // Reset everything when the page or language changes
  useEffect(() => {
    setConversationId(null)
    setMessages([])
    setInput("")
    setChatError(null)
    setIsSending(false)
    setLiveBootstrap(null)
    setHasHydratedChat(false)
    setIsHydratingChat(false)
  }, [pageKey, lang])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (!isOpen) return
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [isOpen, isSending, messages])

  // Hydrate previous conversation when panel opens
  useEffect(() => {
    if (!isOpen || !pageKey || hasHydratedChat) return

    let cancelled = false

    const loadConversation = async () => {
      setIsHydratingChat(true)
      setChatError(null)

      try {
        const response = await fetch(
          `/api/ai/chat?pageKey=${encodeURIComponent(pageKey)}&language=${lang}`
        )
        const result = await response.json()

        if (!response.ok) {
          throw new Error(
            typeof result?.error === "string" && result.error.trim()
              ? result.error
              : t.errorSending
          )
        }

        if (cancelled) return

        setConversationId(
          typeof result?.conversationId === "string" ? result.conversationId : null
        )
        setMessages(
          Array.isArray(result?.messages)
            ? result.messages
                .filter(
                  (message: any) =>
                    message?.role === "user" || message?.role === "assistant"
                )
                .map((message: any) => ({
                  id: typeof message?.id === "string" ? message.id : undefined,
                  role: message.role,
                  content: typeof message?.content === "string" ? message.content : "",
                  fallbackUsed: message?.messageKind === "fallback",
                  responseMeta: asInteractivePayload(message?.responseMeta),
                }))
            : []
        )
        setLiveBootstrap(asInteractivePayload(result?.bootstrap))
        setHasHydratedChat(true)
      } catch (error: any) {
        if (!cancelled) {
          setChatError(
            typeof error?.message === "string" && error.message.trim()
              ? error.message
              : t.errorSending
          )
        }
      } finally {
        if (!cancelled) {
          setIsHydratingChat(false)
        }
      }
    }

    void loadConversation()

    return () => {
      cancelled = true
    }
  }, [hasHydratedChat, isOpen, lang, pageKey, t.errorSending])

  const activeLivePayload = useMemo(() => {
    const lastAssistant = [...messages]
      .reverse()
      .find((message) => message.role === "assistant" && message.responseMeta)

    return lastAssistant?.responseMeta ?? liveBootstrap
  }, [liveBootstrap, messages])

  const handleSend = async (forcedQuestion?: string) => {
    const question = truncateChatContent(forcedQuestion ?? input)
    if (!question || !pageKey || isSending) return

    setIsSending(true)
    setChatError(null)

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: conversationId || undefined,
          pageKey,
          language: lang,
          message: question,
          messages: buildOutgoingChatHistory(messages),
        }),
      })

      const result = await response.json()
      if (!response.ok) {
        throw new Error(
          typeof result?.error === "string" && result.error.trim()
            ? result.error
            : t.errorSending
        )
      }

      const answer =
        typeof result?.message?.content === "string" ? result.message.content : ""

      setConversationId(
        typeof result?.conversationId === "string" ? result.conversationId : null
      )
      setMessages((current) => [
        ...current,
        { role: "user", content: question },
        {
          role: "assistant",
          content: answer,
          fallbackUsed: Boolean(result?.meta?.fallbackUsed),
          fallbackReason:
            typeof result?.meta?.fallbackReason === "string"
              ? result.meta.fallbackReason
              : null,
          model: typeof result?.meta?.model === "string" ? result.meta.model : null,
          responseMeta: asInteractivePayload(result?.meta?.interactivePayload),
        },
      ])
      setInput("")
      setLiveBootstrap(
        (current) =>
          asInteractivePayload(result?.meta?.interactivePayload) ?? current
      )
      setHasHydratedChat(true)

      // Cross-page knowledge search runs in parallel (silent on failure).
      void (async () => {
        try {
          const url = `/api/ai/find-page?q=${encodeURIComponent(question)}` +
            `&pageKey=${encodeURIComponent(pageKey)}&language=${lang}`
          const r = await fetch(url)
          if (!r.ok) return
          const payload = await r.json()
          const matches: PageSuggestion[] = Array.isArray(payload?.matches)
            ? payload.matches
            : []
          if (matches.length === 0) return
          setMessages((current) => {
            const next = [...current]
            for (let i = next.length - 1; i >= 0; i--) {
              if (next[i].role === "assistant") {
                next[i] = { ...next[i], relatedPages: matches }
                break
              }
            }
            return next
          })
        } catch {
          // Silent: this is a non-essential enhancement
        }
      })()
    } catch (error: any) {
      setChatError(
        typeof error?.message === "string" && error.message.trim()
          ? error.message
          : t.errorSending
      )
    } finally {
      setIsSending(false)
    }
  }

  const closeActiveConversation = async (id: string | null) => {
    if (!id) return

    try {
      await fetch("/api/ai/chat", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "close",
          conversationId: id,
          pageKey,
        }),
      })
    } catch {
      // Closing the drawer should not block the UI if the audit close call fails.
    }
  }

  const handleClose = () => {
    const activeConversationId = conversationId
    setConversationId(null)
    setMessages([])
    setInput("")
    setChatError(null)
    setIsSending(false)
    setLiveBootstrap(null)
    setHasHydratedChat(false)
    setIsHydratingChat(false)
    void closeActiveConversation(activeConversationId)
    onClose()
  }

  const headlineTitle = guide?.title
    ? `${t.panelTitleWithPage} ${guide.title}`
    : t.panelTitle

  const hasGuideContent =
    !!guide && (guide.steps.length > 0 || guide.tips.length > 0 || !!guide.accounting_pattern)

  const showInitialEmptyState =
    !isLoading && !isHydratingChat && messages.length === 0 && !hasGuideContent

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent
        side={lang === "ar" ? "left" : "right"}
        className="flex w-full flex-col overflow-hidden p-0 sm:max-w-lg"
        dir={dir}
      >
        <div className="flex h-full flex-col">
          <SheetHeader className="border-b border-gray-100 px-6 pb-4 pt-6 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/30">
                <Sparkles className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex items-center gap-2">
                  <p className="text-xs font-medium text-blue-600 dark:text-blue-400">
                    {t.panelTitle}
                  </p>
                  <Badge
                    variant="outline"
                    className="border-emerald-200 bg-emerald-50 px-2 py-0 text-[10px] font-medium text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-950/30 dark:text-emerald-300"
                  >
                    <ShieldCheck className="me-1 h-2.5 w-2.5" />
                    {t.readOnlyChip}
                  </Badge>
                </div>
                <SheetTitle className="text-base leading-tight">
                  {isLoading ? (
                    <Skeleton className="h-5 w-40" />
                  ) : (
                    headlineTitle
                  )}
                </SheetTitle>
              </div>
            </div>
            {guide?.description && (
              <SheetDescription className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                {guide.description}
              </SheetDescription>
            )}
          </SheetHeader>

          <div className="flex min-h-0 flex-1 flex-col px-6 py-5">
            <div className={scrollAreaClass}>
              <div className="space-y-4 pb-4">
                {/* Proactive alerts (v3.60.0 Phase 4) — first thing the user sees */}
                {proactiveAlerts.length > 0 && messages.length === 0 && (
                  <ProactiveAlertsBlock
                    labels={t}
                    lang={lang}
                    alerts={proactiveAlerts}
                    onClose={handleClose}
                  />
                )}

                {/* Welcome / Guide cards (rendered as if from assistant) */}
                {isLoading ? (
                  <WelcomeLoadingSkeleton labels={t} />
                ) : (
                  hasGuideContent && (
                    <WelcomeBlock
                      labels={t}
                      lang={lang}
                      guide={guide}
                      showDontShowAgain={showDontShowAgain}
                      isAlreadySeen={isAlreadySeen}
                      onMarkSeen={onMarkSeen}
                    />
                  )
                )}

                {/* Live insights panel (metrics/insights/actions) */}
                {isHydratingChat && messages.length === 0 && (
                  <LivePanelSkeleton labels={t} />
                )}

                {activeLivePayload && (
                  <LiveInsightsPanel
                    labels={t}
                    lang={lang}
                    payload={activeLivePayload}
                    onPromptSelect={(prompt) => void handleSend(prompt)}
                  />
                )}

                {/* No guide + no messages — neutral empty state */}
                {showInitialEmptyState && (
                  <EmptyStartCard
                    labels={t}
                    pageTitle={guide?.title}
                    suggestedPrompts={suggestedPrompts}
                    onPromptSelect={(prompt) => void handleSend(prompt)}
                  />
                )}

                {/* Chat messages */}
                {messages.map((message, index) => (
                  <ChatBubble
                    key={`${message.role}-${index}`}
                    lang={lang}
                    labels={t}
                    message={message}
                  />
                ))}

                {/* Suggested prompts after welcome block when no chat yet */}
                {!isHydratingChat &&
                  hasGuideContent &&
                  messages.length === 0 && (
                    <SuggestedPromptsRow
                      labels={t}
                      suggestedPrompts={suggestedPrompts}
                      onPromptSelect={(prompt) => void handleSend(prompt)}
                    />
                  )}

                {/* Typing indicator */}
                {isSending && <TypingIndicator labels={t} />}

                <div ref={endRef} />
              </div>
            </div>

            <div className="space-y-3 border-t border-gray-100 pt-4 dark:border-slate-800">
              {chatError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300">
                  {chatError}
                </div>
              )}

              <Textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={t.inputPlaceholder}
                disabled={!pageKey || isSending}
                className="min-h-20 resize-none"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault()
                    void handleSend()
                  }
                }}
              />

              <div className="flex items-center justify-between gap-3">
                <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                  {t.hint}
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handleClose}>
                    <X className="h-3.5 w-3.5" />
                    {t.close}
                  </Button>
                  <Button
                    size="sm"
                    className="gap-2"
                    onClick={() => void handleSend()}
                    disabled={!pageKey || isSending || !input.trim()}
                  >
                    {isSending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    {isSending ? t.thinking : t.send}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ─── Welcome Block (renders guide content as a friendly assistant message) ──

function WelcomeBlock({
  labels,
  lang,
  guide,
  showDontShowAgain,
  isAlreadySeen,
  onMarkSeen,
}: {
  labels: Labels
  lang: "ar" | "en"
  guide: PageGuide | null
  showDontShowAgain: boolean
  isAlreadySeen: boolean
  onMarkSeen: () => void
}) {
  if (!guide) return null

  return (
    <div className="flex justify-start">
      <div className="flex w-full max-w-[95%] items-start gap-3">
        <Avatar className="mt-0.5 size-8 flex-shrink-0 border border-emerald-200 bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-900/30">
          <AvatarFallback className="bg-transparent text-emerald-700 dark:text-emerald-300">
            <Bot className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 space-y-3">
          <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <p className="mb-1.5 text-[11px] font-medium text-gray-500 dark:text-gray-400">
              {labels.assistant}
            </p>
            <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-200">
              {labels.welcomeHeadline}
              {guide.title ? ` — ${guide.title}` : ""}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
              {labels.welcomePageIntro}
            </p>
          </div>

          {guide.steps.length > 0 && <StepsCard labels={labels} steps={guide.steps} />}
          {guide.tips.length > 0 && <TipsCard labels={labels} tips={guide.tips} />}
          {guide.accounting_pattern && (
            <AccountingPatternCard
              labels={labels}
              lang={lang}
              pattern={guide.accounting_pattern}
            />
          )}

          {showDontShowAgain && (
            <label className="flex cursor-pointer items-center gap-2.5 px-1">
              <Checkbox
                id="dont-show-again"
                checked={isAlreadySeen}
                onCheckedChange={(checked) => {
                  if (checked) onMarkSeen()
                }}
              />
              <span className="select-none text-xs text-gray-500 dark:text-gray-400">
                {labels.dontShow}
              </span>
            </label>
          )}
        </div>
      </div>
    </div>
  )
}

function StepsCard({ labels, steps }: { labels: Labels; steps: string[] }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-200">
        <CheckCircle2 className="h-4 w-4 text-green-500" />
        {labels.howToUse}
      </h3>
      <div className="space-y-2.5">
        {steps.map((step, index) => (
          <div key={index} className="flex gap-3 text-sm">
            <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
              {index + 1}
            </span>
            <span className="leading-relaxed text-gray-700 dark:text-gray-300">
              {step}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

function TipsCard({ labels, tips }: { labels: Labels; tips: string[] }) {
  return (
    <section className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 shadow-sm dark:border-amber-800/40 dark:bg-amber-900/20">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
        <Lightbulb className="h-4 w-4 text-amber-500" />
        {labels.tips}
      </h3>
      <div className="space-y-2">
        {tips.map((tip, index) => (
          <div key={index} className="flex gap-2.5 text-sm">
            <span className="mt-0.5 flex-shrink-0 text-amber-500">•</span>
            <span className="leading-relaxed text-amber-800 dark:text-amber-200">
              {tip}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

function AccountingPatternCard({
  labels,
  lang: _lang,
  pattern,
}: {
  labels: Labels
  lang: "ar" | "en"
  pattern: AccountingPattern
}) {
  const impactRows: Array<{
    key: keyof AccountingPattern["impact"]
    label: string
  }> = [
    { key: "assets", label: labels.assets },
    { key: "liabilities", label: labels.liabilities },
    { key: "equity", label: labels.equity },
    { key: "pl", label: labels.pl },
  ]

  const isNoEntry =
    pattern.entries.length === 1 &&
    pattern.entries[0].side === "debit" &&
    (pattern.entries[0].account.startsWith("لا ") ||
      pattern.entries[0].account.toLowerCase().startsWith("no "))

  return (
    <section className="rounded-2xl border border-purple-100 bg-purple-50/40 px-4 py-3 shadow-sm dark:border-purple-900/40 dark:bg-purple-950/20">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-purple-900 dark:text-purple-200">
        <TrendingUp className="h-4 w-4 text-purple-500" />
        {labels.accountingPattern}
      </h3>

      <div className="mb-3 rounded-lg border border-purple-200 bg-white px-3 py-2 dark:border-purple-800/40 dark:bg-slate-900">
        <p className="mb-1 text-xs font-semibold text-purple-600 dark:text-purple-400">
          {labels.financialEvent}
        </p>
        <p className="text-sm leading-relaxed text-purple-900 dark:text-purple-100">
          {pattern.event}
        </p>
      </div>

      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {labels.journalEntry}
      </p>
      {isNoEntry ? (
        <p className="mb-3 px-1 text-sm italic text-gray-400 dark:text-gray-500">
          {labels.noEntries}
        </p>
      ) : (
        <div className="mb-3 overflow-hidden rounded-lg border border-purple-200 dark:border-purple-800/40">
          {pattern.entries.map((entry, index) => (
            <div
              key={index}
              className={`flex items-center gap-3 px-3 py-2 text-sm ${
                index % 2 === 0
                  ? "bg-white dark:bg-slate-900"
                  : "bg-purple-50/60 dark:bg-slate-800/60"
              }`}
            >
              <span
                className={`w-10 flex-shrink-0 rounded px-1.5 py-0.5 text-center text-xs font-bold ${
                  entry.side === "debit"
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                    : "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
                }`}
              >
                {entry.side === "debit" ? labels.debit : labels.credit}
              </span>
              <span className="leading-snug text-gray-700 dark:text-gray-300">
                {entry.account}
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {labels.balanceImpact}
      </p>
      <dl className="space-y-1.5">
        {impactRows.map(({ key, label }) => {
          const value = pattern.impact[key]
          if (!value) return null
          return (
            <div key={key} className="flex gap-2 text-sm">
              <dt className="w-28 flex-shrink-0 font-medium text-gray-500 dark:text-gray-400">
                {label}
              </dt>
              <dd className="leading-snug text-gray-700 dark:text-gray-300">
                {value}
              </dd>
            </div>
          )
        })}
      </dl>
    </section>
  )
}

// ─── Live Insights Panel (metrics / alerts / actions) ───────────────────────

function LiveInsightsPanel({
  labels,
  lang,
  payload,
  onPromptSelect,
}: {
  labels: Labels
  lang: "ar" | "en"
  payload: AICopilotInteractivePayload
  onPromptSelect: (prompt: string) => void
}) {
  const summary = sanitizeUserFacingText(
    typeof payload.summary === "string" ? payload.summary : ""
  )
  const governanceSummary =
    typeof payload.governanceSummary === "string" ? payload.governanceSummary : ""
  const metrics = Array.isArray(payload.metrics) ? payload.metrics : []
  const insights = Array.isArray(payload.insights) ? payload.insights : []
  const nextActions = Array.isArray(payload.nextActions) ? payload.nextActions : []
  const predictedActions = Array.isArray(payload.predictedActions)
    ? payload.predictedActions
    : []
  const quickPrompts = Array.isArray(payload.quickPrompts) ? payload.quickPrompts : []

  return (
    <div className="space-y-4 rounded-2xl border border-blue-100 bg-white/95 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-950/70">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-sm font-semibold text-blue-700 dark:text-blue-300">
          <Sparkles className="h-4 w-4" />
          {labels.livePanelTitle}
        </div>
        {summary && (
          <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
            {summary}
          </p>
        )}
      </div>

      {metrics.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            <TrendingUp className="h-3.5 w-3.5" />
            {labels.pageMetrics}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {metrics.slice(0, 6).map((metric) => (
              <div
                key={`${metric.label}-${metric.value}`}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
              >
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {metric.label}
                </p>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {metric.value}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {insights.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            {labels.smartAlerts}
          </div>
          <div className="space-y-2">
            {insights.slice(0, 3).map((insight, index) => (
              <InsightCard key={`${insight.title}-${index}`} insight={insight} />
            ))}
          </div>
        </section>
      )}

      {nextActions.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            <ListChecks className="h-3.5 w-3.5" />
            {labels.suggestedActions}
          </div>
          <div className="space-y-2">
            {nextActions.slice(0, 2).map((action) => (
              <button
                key={action.title}
                type="button"
                onClick={() => onPromptSelect(action.prompt)}
                className="w-full rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-start transition hover:border-emerald-300 hover:bg-emerald-100/70 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/40"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                    {action.title}
                  </p>
                  <Badge variant="outline" className="text-[10px]">
                    {typeof action.confidenceScore === "number"
                      ? `${Math.round(action.confidenceScore)}%`
                      : action.severity}
                  </Badge>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-emerald-900/80 dark:text-emerald-100/80">
                  {action.summary}
                </p>
              </button>
            ))}
          </div>
        </section>
      )}

      {predictedActions.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            <Target className="h-3.5 w-3.5" />
            {labels.predictedActions}
          </div>
          <div className="space-y-2">
            {predictedActions.slice(0, 2).map((prediction) => (
              <button
                key={prediction.title}
                type="button"
                onClick={() => prediction.prompt && onPromptSelect(prediction.prompt)}
                className="w-full rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-start transition hover:border-amber-300 hover:bg-amber-100/70 dark:border-amber-900/40 dark:bg-amber-950/20 dark:hover:bg-amber-950/40"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                    {prediction.title}
                  </p>
                  {typeof prediction.confidenceScore === "number" && (
                    <Badge variant="outline" className="text-[10px]">
                      {Math.round(prediction.confidenceScore)}%
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-amber-900/80 dark:text-amber-100/80">
                  {prediction.summary}
                </p>
              </button>
            ))}
          </div>
        </section>
      )}

      {quickPrompts.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            <MessageSquare className="h-3.5 w-3.5" />
            {labels.quickPrompts}
          </div>
          <div className="flex flex-wrap gap-2">
            {quickPrompts.slice(0, 5).map((prompt) => (
              <button
                key={`${prompt.category}-${prompt.label}`}
                type="button"
                onClick={() => onPromptSelect(prompt.prompt)}
                className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200"
              >
                {prompt.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {(() => {
        const cleanedGovernance = sanitizeUserFacingText(
          governanceSummary.split("\n")[0] || ""
        )
        if (!cleanedGovernance) return null
        return (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              {labels.permissionsLine}:
            </span>{" "}
            {cleanedGovernance}
          </div>
        )
      })()}
    </div>
  )
}

function InsightCard({
  insight,
}: {
  insight: AICopilotInteractivePayload["insights"][number]
}) {
  const styles =
    insight.severity === "critical"
      ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-200"
      : insight.severity === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200"
        : "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/40 dark:bg-sky-950/20 dark:text-sky-200"

  return (
    <div className={`rounded-xl border px-3 py-2 ${styles}`}>
      <p className="text-sm font-semibold">{insight.title}</p>
      <p className="mt-1 text-xs leading-relaxed">{insight.summary}</p>
    </div>
  )
}

// ─── Suggested prompts (chips row) ───────────────────────────────────────

function SuggestedPromptsRow({
  labels,
  suggestedPrompts,
  onPromptSelect,
}: {
  labels: Labels
  suggestedPrompts: string[]
  onPromptSelect: (prompt: string) => void
}) {
  if (suggestedPrompts.length === 0) return null

  return (
    <section className="space-y-2 rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        <MessageSquare className="h-3.5 w-3.5" />
        {labels.quickPrompts}
      </div>
      <div className="flex flex-wrap gap-2">
        {suggestedPrompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onPromptSelect(prompt)}
            className="rounded-full border border-blue-200 bg-white px-3 py-1.5 text-xs text-blue-700 transition hover:border-blue-300 hover:bg-blue-50 dark:border-blue-900/40 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-blue-950/30"
          >
            {prompt}
          </button>
        ))}
      </div>
    </section>
  )
}

// ─── Empty start card (no guide, no messages) ──────────────────────────

function EmptyStartCard({
  labels,
  pageTitle,
  suggestedPrompts,
  onPromptSelect,
}: {
  labels: Labels
  pageTitle?: string
  suggestedPrompts: string[]
  onPromptSelect: (prompt: string) => void
}) {
  return (
    <div className="space-y-4 rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-4 dark:border-slate-700 dark:bg-slate-900/50">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-white p-2 shadow-sm dark:bg-slate-800">
          <MessageSquare className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            {labels.emptyStartTitle}
          </h3>
          <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-400">
            {pageTitle ? labels.noGuide : labels.emptyStartBody}
          </p>
        </div>
      </div>

      {suggestedPrompts.length > 0 && (
        <div className="space-y-2">
          {suggestedPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => onPromptSelect(prompt)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-start text-sm text-gray-700 transition hover:border-blue-200 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:text-gray-200 dark:hover:border-blue-800 dark:hover:bg-blue-950/30"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Chat bubble ─────────────────────────────────────────────────────────

function ChatBubble({
  message,
  labels,
  lang,
}: {
  message: ChatMessage
  labels: Labels
  lang: "ar" | "en"
}) {
  const isUser = message.role === "user"

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`flex max-w-[88%] items-start gap-3 ${
          isUser ? "flex-row-reverse" : ""
        }`}
      >
        <Avatar
          className={`mt-0.5 size-8 border ${
            isUser
              ? "border-blue-200 bg-blue-100 dark:border-blue-800 dark:bg-blue-900/40"
              : "border-emerald-200 bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-900/30"
          }`}
        >
          <AvatarFallback
            className={`bg-transparent ${
              isUser
                ? "text-blue-700 dark:text-blue-300"
                : "text-emerald-700 dark:text-emerald-300"
            }`}
          >
            {isUser ? lang.toUpperCase().slice(0, 1) : <Bot className="h-4 w-4" />}
          </AvatarFallback>
        </Avatar>

        <div
          className={`rounded-2xl border px-4 py-3 shadow-sm ${
            isUser
              ? "border-blue-200 bg-blue-600 text-white dark:border-blue-700 dark:bg-blue-700"
              : "border-gray-200 bg-white text-gray-900 dark:border-slate-700 dark:bg-slate-900 dark:text-gray-100"
          }`}
        >
          <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px] font-medium">
            <span className={isUser ? "text-blue-100" : "text-gray-500 dark:text-gray-400"}>
              {isUser ? labels.you : labels.assistant}
            </span>

            {!isUser && message.fallbackUsed && (
              <Badge
                variant="outline"
                className="border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
              >
                {labels.safeMode}
              </Badge>
            )}
          </div>

          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {isUser ? message.content : sanitizeUserFacingText(message.content)}
          </p>
          {!isUser && message.fallbackUsed && (
            <p className="mt-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
              {labels.safeModeNote}
            </p>
          )}
          {!isUser && message.relatedPages && message.relatedPages.length > 0 && (
            <RelatedPagesBlock labels={labels} pages={message.relatedPages} />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Related pages block (cross-page knowledge search) ──────────────────

function RelatedPagesBlock({
  labels,
  pages,
}: {
  labels: Labels
  pages: PageSuggestion[]
}) {
  return (
    <div className="mt-3 space-y-2 rounded-xl border border-blue-200 bg-blue-50/60 px-3 py-2.5 dark:border-blue-900/40 dark:bg-blue-950/30">
      <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">
        {labels.relatedPagesTitle}
      </p>
      <div className="space-y-1.5">
        {pages.map((page) => (
          <a
            key={page.pageKey}
            href={page.route}
            className="block rounded-lg border border-blue-200 bg-white px-3 py-2 transition hover:border-blue-300 hover:bg-blue-50 dark:border-blue-800/60 dark:bg-slate-900 dark:hover:bg-blue-950/50"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                {page.title}
              </span>
              <span className="text-[10px] text-blue-600 dark:text-blue-400">
                {labels.goToPage}
              </span>
            </div>
            {page.snippet && (
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
                {page.snippet}
              </p>
            )}
          </a>
        ))}
      </div>
    </div>
  )
}

// ─── Typing indicator ───────────────────────────────────────────────────

function TypingIndicator({ labels }: { labels: Labels }) {
  return (
    <div className="flex justify-start">
      <div className="flex max-w-[88%] items-start gap-3">
        <Avatar className="mt-0.5 size-8 border border-emerald-200 bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-900/30">
          <AvatarFallback className="bg-transparent text-emerald-700 dark:text-emerald-300">
            <Bot className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
        <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {labels.thinking}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Skeletons ──────────────────────────────────────────────────────────

function WelcomeLoadingSkeleton({ labels: _labels }: { labels: Labels }) {
  return (
    <div className="flex justify-start">
      <div className="flex w-full max-w-[95%] items-start gap-3">
        <Skeleton className="mt-0.5 h-8 w-8 flex-shrink-0 rounded-full" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  )
}

function LivePanelSkeleton({ labels }: { labels: Labels }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/50">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
        <Loader2 className="h-4 w-4 animate-spin" />
        {labels.sessionLoading}
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-16 w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function buildSuggestedPrompts(
  language: "ar" | "en",
  guideTitle?: string,
  pageKey?: string | null
): string[] {
  const base =
    language === "ar"
      ? [
          guideTitle
            ? `اشرح لى خطوات العمل فى صفحة ${guideTitle}`
            : "اشرح لى خطوات العمل فى هذه الصفحة",
          "ما الذى يمكننى فعله هنا حسب صلاحيتى الحالية؟",
          "ما الاعتمادات أو القيود المرتبطة بهذه العملية؟",
        ]
      : [
          guideTitle
            ? `Explain the workflow on the ${guideTitle} page`
            : "Explain the workflow on this page",
          "What can I do here with my current permissions?",
          "What approvals or governance constraints apply here?",
        ]

  const modulePrompts = buildERPQuestionBankPrompts({
    language,
    pageKey,
    includeGlobal: false,
    includeAdvanced: true,
    limit: 3,
  }).map((item) => item.prompt)

  return Array.from(new Set([...base, ...modulePrompts])).slice(0, 6)
}

function truncateChatContent(value: string, maxLength = MAX_OUTGOING_CHAT_CHARS) {
  return value.replace(/\r\n/g, "\n").trim().slice(0, maxLength)
}

function buildOutgoingChatHistory(messages: ChatMessage[]) {
  return messages
    .slice(-MAX_OUTGOING_CHAT_HISTORY)
    .map((message) => ({
      role: message.role,
      content: truncateChatContent(message.content),
    }))
    .filter((message) => message.content.length > 0)
}

/**
 * Clean text coming from the backend (governanceSummary, summary, etc.)
 * before showing it to the end user:
 * - strip raw UUIDs (e.g. company / branch / warehouse IDs)
 * - rewrite developer phrases ("الطبقة المحلية"/"local layer") to natural language
 * - collapse extra whitespace and dangling punctuation left after stripping IDs
 */
function sanitizeUserFacingText(input: string): string {
  if (!input) return ""

  let out = input

  // 1) Remove UUIDs
  out = out.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    ""
  )

  // 2) Replace developer phrases with friendlier language
  const replacements: Array<[RegExp, string]> = [
    [/الطبقة المحلية تحافظ على/g, "نحافظ على"],
    [/الطبقة المحلية/g, "المساعد"],
    [/the local layer( still)? preserves?/gi, "we preserve"],
    [/the local layer/gi, "the assistant"],
    [/governance summary/gi, "permissions"],
    [/fallback layer/gi, "safe mode"],
  ]
  for (const [pattern, replacement] of replacements) {
    out = out.replace(pattern, replacement)
  }

  // 3) Remove labels that contain only IDs after stripping (e.g. "الشركة: ")
  out = out.replace(
    /(?:الشركة|الفرع|المخزن|مركز التكلفة|company|branch|warehouse|cost\s+center)\s*[:：]\s*(?=[,،;؛]|$)/gi,
    ""
  )

  // 4) Collapse leftover separators and whitespace
  out = out.replace(/\s+/g, " ")
  out = out.replace(/\s*[,،;؛]\s*[,،;؛]+/g, ",")
  out = out.replace(/^\s*[,،;؛.\-]+/, "")
  out = out.replace(/[,،;؛\-]+\s*$/, "")
  out = out.trim()

  return out
}

function asInteractivePayload(value: unknown): AICopilotInteractivePayload | null {
  if (!value || typeof value !== "object") return null

  const candidate = value as Partial<AICopilotInteractivePayload>
  if (
    typeof candidate.domain !== "string" ||
    typeof candidate.summary !== "string" ||
    typeof candidate.governanceSummary !== "string" ||
    !Array.isArray(candidate.metrics) ||
    !Array.isArray(candidate.insights) ||
    !Array.isArray(candidate.nextActions) ||
    !Array.isArray(candidate.predictedActions) ||
    !Array.isArray(candidate.quickPrompts)
  ) {
    return null
  }

  return candidate as AICopilotInteractivePayload
}


// ─── Proactive Alerts Block (v3.60.0 Phase 4) ─────────────────────────────────

function ProactiveAlertsBlock({
  labels,
  lang,
  alerts,
  onClose,
}: {
  labels: Labels
  lang: "ar" | "en"
  alerts: AIProactiveAlert[]
  onClose: () => void
}) {
  if (alerts.length === 0) return null

  const Arrow = lang === "ar" ? ArrowLeft : ArrowRight

  const order: Record<string, number> = { critical: 0, warning: 1, info: 2 }
  const sorted = [...alerts].sort(
    (a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9)
  )

  return (
    <div className="flex justify-start">
      <div className="flex w-full max-w-[95%] items-start gap-3">
        <Avatar className="mt-0.5 size-8 flex-shrink-0 border border-blue-200 bg-blue-100 dark:border-blue-800 dark:bg-blue-900/30">
          <AvatarFallback className="bg-transparent text-blue-700 dark:text-blue-300">
            <Bell className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 space-y-3">
          <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <p className="mb-1.5 text-[11px] font-medium text-gray-500 dark:text-gray-400">
              {labels.assistant}
            </p>
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              {labels.proactiveAlertsHeadline}
            </p>
          </div>

          <section className="space-y-2">
            {sorted.map((alert) => (
              <ProactiveAlertCard
                key={alert.key}
                labels={labels}
                alert={alert}
                Arrow={Arrow}
                onClose={onClose}
              />
            ))}
          </section>
        </div>
      </div>
    </div>
  )
}

function ProactiveAlertCard({
  labels,
  alert,
  Arrow,
  onClose,
}: {
  labels: Labels
  alert: AIProactiveAlert
  Arrow: typeof ArrowLeft
  onClose: () => void
}) {
  const isCritical = alert.severity === "critical"
  const isWarning = alert.severity === "warning"

  const containerCls = isCritical
    ? "border-rose-200 bg-rose-50 dark:border-rose-900/40 dark:bg-rose-950/30"
    : isWarning
      ? "border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30"
      : "border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-950/30"

  const iconCls = isCritical
    ? "text-rose-600 dark:text-rose-300"
    : isWarning
      ? "text-amber-600 dark:text-amber-300"
      : "text-blue-600 dark:text-blue-300"

  const chipCls = isCritical
    ? "bg-rose-600 text-white"
    : isWarning
      ? "bg-amber-500 text-white"
      : "bg-blue-600 text-white"

  const chipLabel = isCritical
    ? labels.severityCritical
    : isWarning
      ? labels.severityWarning
      : labels.severityInfo

  const Icon = isCritical ? AlertTriangle : isWarning ? Clock : Info

  const handleNavigate = () => {
    if (!alert.actionUrl) return
    onClose()
    if (typeof window !== "undefined") {
      window.location.href = alert.actionUrl
    }
  }

  return (
    <div
      className={[
        "rounded-2xl border px-4 py-3 shadow-sm transition-shadow",
        containerCls,
      ].join(" ")}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className={"h-4 w-4 " + iconCls} />
          <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            {alert.title}
          </h4>
        </div>
        <span
          className={[
            "rounded-full px-2 py-0.5 text-[10px] font-semibold",
            chipCls,
          ].join(" ")}
        >
          {chipLabel}
        </span>
      </div>

      <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-200">
        {alert.message}
      </p>

      {alert.actionUrl && (
        <div className="mt-2.5 flex justify-end">
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs"
            onClick={handleNavigate}
          >
            <span>{labels.proactiveActionOpen}</span>
            <Arrow className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  )
}
