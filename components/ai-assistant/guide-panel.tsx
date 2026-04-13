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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  AlertTriangle,
  BookOpen,
  Bot,
  CheckCircle2,
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
}

interface ChatMessage {
  id?: string
  role: "user" | "assistant"
  content: string
  fallbackUsed?: boolean
  fallbackReason?: string | null
  model?: string | null
  responseMeta?: AICopilotInteractivePayload | null
}

const MAX_OUTGOING_CHAT_HISTORY = 12
const MAX_OUTGOING_CHAT_CHARS = 3200

const L = {
  ar: {
    loading: "جاري تحميل الدليل...",
    noGuide: "لا يوجد دليل لهذه الصفحة حالياً.",
    guideTab: "الدليل",
    copilotTab: "المساعد",
    howToUse: "كيفية الاستخدام",
    tips: "نصائح مهمة",
    dontShow: "لا تُظهر مرة أخرى لهذه الصفحة",
    close: "إغلاق",
    aiGuide: "دليل الصفحة",
    aiCopilot: "مساعد ERP",
    accountingPattern: "النمط المحاسبي لهذه الصفحة",
    financialEvent: "الحدث المالي",
    journalEntry: "القيد المحاسبي",
    balanceImpact: "التأثير على الميزانية",
    debit: "مدين",
    credit: "دائن",
    assets: "الأصول",
    liabilities: "الخصوم",
    equity: "حقوق الملكية",
    pl: "الأرباح والخسائر",
    noEntries: "لا قيود محاسبية لهذه العملية",
    copilotDescription:
      "مساعد ERP محلي مجاني للقراءة فقط يشرح لك الخطوات والصلاحيات والاعتمادات داخل النظام الحالي.",
    copilotSafeTitle: "محرك محلي آمن",
    copilotSafeBody:
      "يمكن تشغيل هذا المساعد عبر Ollama محلياً أو عبر طبقة fallback داخلية آمنة. لن ينفذ أي عملية مالية أو مخزنية أو اعتماد، ودوره هنا هو الشرح والتوجيه فقط.",
    copilotEmptyTitle: "ابدأ بسؤال متعلق بهذه الصفحة",
    copilotEmptyBody:
      "يمكنك سؤاله عن خطوات العمل، الاعتمادات المطلوبة، أو معنى الحالة الحالية داخل النظام.",
    copilotPromptExplain: "اشرح لي خطوات العمل في هذه الصفحة",
    copilotPromptPermissions: "ما الذي يمكنني فعله هنا حسب صلاحيتي الحالية؟",
    copilotPromptApprovals: "ما الاعتمادات أو القيود المرتبطة بهذه العملية؟",
    copilotInputPlaceholder: "اكتب سؤالك هنا...",
    copilotSend: "إرسال",
    copilotThinking: "جاري التفكير...",
    copilotHint:
      "سيستخدم دليل الصفحة الحالي وسياق صلاحياتك للإجابة دون تنفيذ أي تعديل فعلي.",
    copilotError:
      "تعذر إرسال الرسالة حالياً. حاول مرة أخرى بعد لحظة.",
    you: "أنت",
    assistant: "المساعد",
    fallback: "رد بديل آمن",
    fallbackReasonTitle: "سبب وضع الرد البديل",
    pageContext: "سياق الصفحة",
    copilotLiveTitle: "المشهد الحي",
    copilotMetrics: "مؤشرات الصفحة",
    copilotInsights: "تنبيهات ذكية",
    copilotActions: "إجراءات مقترحة",
    copilotPredictions: "الخطوة التالية المتوقعة",
    copilotPrompts: "اقتراحات سريعة",
    copilotHistoryLoading: "جاري تحميل الجلسة السابقة...",
    copilotNoSession: "لا توجد جلسة سابقة لهذه الصفحة بعد.",
    copilotSendPrompt: "إرسال هذا السؤال",
  },
  en: {
    loading: "Loading guide...",
    noGuide: "No guide available for this page yet.",
    guideTab: "Guide",
    copilotTab: "Copilot",
    howToUse: "How to Use",
    tips: "Important Tips",
    dontShow: "Don't show again for this page",
    close: "Close",
    aiGuide: "Page Guide",
    aiCopilot: "ERP Copilot",
    accountingPattern: "Accounting Pattern for This Page",
    financialEvent: "Financial Event",
    journalEntry: "Journal Entry",
    balanceImpact: "Balance Sheet Impact",
    debit: "Dr",
    credit: "Cr",
    assets: "Assets",
    liabilities: "Liabilities",
    equity: "Equity",
    pl: "Profit & Loss",
    noEntries: "No accounting entries for this operation",
    copilotDescription:
      "A free local read-only ERP copilot that explains workflow steps, permissions, and approval paths in the current system.",
    copilotSafeTitle: "Safe local engine",
    copilotSafeBody:
      "This copilot can run through local Ollama models or a safe internal fallback layer. It will not execute financial or inventory actions and will not approve anything. It only explains the correct process.",
    copilotEmptyTitle: "Start with a page-specific question",
    copilotEmptyBody:
      "Ask about workflow steps, required approvals, or what the current status means inside this ERP.",
    copilotPromptExplain: "Explain the workflow on this page",
    copilotPromptPermissions: "What can I do here with my current permissions?",
    copilotPromptApprovals: "What approvals or constraints apply to this process?",
    copilotInputPlaceholder: "Type your question here...",
    copilotSend: "Send",
    copilotThinking: "Thinking...",
    copilotHint:
      "The answer is grounded in the current page guide and your governance context, without changing any data.",
    copilotError:
      "The message could not be sent right now. Please try again in a moment.",
    you: "You",
    assistant: "Copilot",
    fallback: "Safe fallback",
    fallbackReasonTitle: "Fallback reason",
    pageContext: "Page context",
    copilotLiveTitle: "Live scene",
    copilotMetrics: "Page metrics",
    copilotInsights: "Smart alerts",
    copilotActions: "Suggested actions",
    copilotPredictions: "Predicted next step",
    copilotPrompts: "Quick prompts",
    copilotHistoryLoading: "Loading the previous session...",
    copilotNoSession: "No previous conversation exists for this page yet.",
    copilotSendPrompt: "Send this question",
  },
}

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
}: GuidePanelProps) {
  const t = L[lang]
  const dir = lang === "ar" ? "rtl" : "ltr"
  const [activeTab, setActiveTab] = useState<"guide" | "copilot">("guide")
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [copilotError, setCopilotError] = useState<string | null>(null)
  const [copilotBootstrap, setCopilotBootstrap] =
    useState<AICopilotInteractivePayload | null>(null)
  const [isHydratingCopilot, setIsHydratingCopilot] = useState(false)
  const [hasHydratedCopilot, setHasHydratedCopilot] = useState(false)
  const endRef = useRef<HTMLDivElement | null>(null)
  const assistantScrollAreaClass =
    "flex-1 overflow-y-scroll pr-3 [scrollbar-gutter:stable] notification-scrollbar"

  const suggestedPrompts = useMemo(
    () => buildSuggestedPrompts(lang, guide?.title, pageKey),
    [guide?.title, lang, pageKey]
  )

  useEffect(() => {
    setActiveTab("guide")
    setConversationId(null)
    setMessages([])
    setInput("")
    setCopilotError(null)
    setIsSending(false)
    setCopilotBootstrap(null)
    setHasHydratedCopilot(false)
    setIsHydratingCopilot(false)
  }, [pageKey, lang])

  useEffect(() => {
    if (activeTab !== "copilot") return
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [activeTab, isSending, messages])

  useEffect(() => {
    if (!isOpen || activeTab !== "copilot" || !pageKey || hasHydratedCopilot) return

    let cancelled = false

    const loadConversation = async () => {
      setIsHydratingCopilot(true)
      setCopilotError(null)

      try {
        const response = await fetch(
          `/api/ai/chat?pageKey=${encodeURIComponent(pageKey)}&language=${lang}`
        )
        const result = await response.json()

        if (!response.ok) {
          throw new Error(
            typeof result?.error === "string" && result.error.trim()
              ? result.error
              : t.copilotError
          )
        }

        if (cancelled) return

        setConversationId(
          typeof result?.conversationId === "string" ? result.conversationId : null
        )
        setMessages(
          Array.isArray(result?.messages)
            ? result.messages
                .filter((message: any) => message?.role === "user" || message?.role === "assistant")
                .map((message: any) => ({
                  id: typeof message?.id === "string" ? message.id : undefined,
                  role: message.role,
                  content: typeof message?.content === "string" ? message.content : "",
                  fallbackUsed: message?.messageKind === "fallback",
                  responseMeta: asInteractivePayload(message?.responseMeta),
                }))
            : []
        )
        setCopilotBootstrap(asInteractivePayload(result?.bootstrap))
        setHasHydratedCopilot(true)
      } catch (error: any) {
        if (!cancelled) {
          setCopilotError(
            typeof error?.message === "string" && error.message.trim()
              ? error.message
              : t.copilotError
          )
        }
      } finally {
        if (!cancelled) {
          setIsHydratingCopilot(false)
        }
      }
    }

    void loadConversation()

    return () => {
      cancelled = true
    }
  }, [activeTab, hasHydratedCopilot, isOpen, lang, pageKey, t.copilotError])

  const activeCopilotPayload = useMemo(() => {
    const lastAssistant = [...messages]
      .reverse()
      .find((message) => message.role === "assistant" && message.responseMeta)

    return lastAssistant?.responseMeta ?? copilotBootstrap
  }, [copilotBootstrap, messages])

  const handleSend = async (forcedQuestion?: string) => {
    const question = truncateChatContent(forcedQuestion ?? input)
    if (!question || !pageKey || isSending) return

    setIsSending(true)
    setCopilotError(null)

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
            : t.copilotError
        )
      }

      const answer =
        typeof result?.message?.content === "string"
          ? result.message.content
          : ""

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
          model:
            typeof result?.meta?.model === "string" ? result.meta.model : null,
          responseMeta: asInteractivePayload(result?.meta?.interactivePayload),
        },
      ])
      setInput("")
      setCopilotBootstrap((current) =>
        asInteractivePayload(result?.meta?.interactivePayload) ?? current
      )
      setHasHydratedCopilot(true)
    } catch (error: any) {
      setCopilotError(
        typeof error?.message === "string" && error.message.trim()
          ? error.message
          : t.copilotError
      )
    } finally {
      setIsSending(false)
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
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
                <p className="mb-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
                  {activeTab === "guide" ? t.aiGuide : t.aiCopilot}
                </p>
                <SheetTitle className="text-base leading-tight">
                  {isLoading ? (
                    <Skeleton className="h-5 w-40" />
                  ) : (
                    guide?.title ?? t.noGuide
                  )}
                </SheetTitle>
              </div>
            </div>
            <SheetDescription className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
              {activeTab === "guide"
                ? guide?.description || t.noGuide
                : t.copilotDescription}
            </SheetDescription>
          </SheetHeader>

          <div className="flex min-h-0 flex-1 flex-col px-6 py-5">
            <Tabs
              value={activeTab}
              onValueChange={(value) => setActiveTab(value as "guide" | "copilot")}
              className="flex min-h-0 flex-1 flex-col gap-4"
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="guide" className="gap-2">
                  <BookOpen className="h-4 w-4" />
                  {t.guideTab}
                </TabsTrigger>
                <TabsTrigger value="copilot" className="gap-2">
                  <Bot className="h-4 w-4" />
                  {t.copilotTab}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="guide" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className={assistantScrollAreaClass}>
                  <div className="space-y-6 pb-4">
                    {isLoading ? (
                      <LoadingSkeleton />
                    ) : !guide ? (
                      <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                        {t.noGuide}
                      </p>
                    ) : (
                      <>
                        {guide.steps.length > 0 && (
                          <section>
                            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-200">
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                              {t.howToUse}
                            </h3>
                            <ol className="space-y-2.5">
                              {guide.steps.map((step, index) => (
                                <li key={index} className="flex gap-3 text-sm">
                                  <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                                    {index + 1}
                                  </span>
                                  <span className="leading-relaxed text-gray-700 dark:text-gray-300">
                                    {step}
                                  </span>
                                </li>
                              ))}
                            </ol>
                          </section>
                        )}

                        {guide.tips.length > 0 && (
                          <section>
                            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-200">
                              <Lightbulb className="h-4 w-4 text-amber-500" />
                              {t.tips}
                            </h3>
                            <ul className="space-y-2">
                              {guide.tips.map((tip, index) => (
                                <li
                                  key={index}
                                  className="flex gap-2.5 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2.5 text-sm dark:border-amber-800/40 dark:bg-amber-900/20"
                                >
                                  <span className="mt-0.5 flex-shrink-0 text-amber-500">•</span>
                                  <span className="leading-relaxed text-amber-800 dark:text-amber-200">
                                    {tip}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </section>
                        )}

                        {guide.accounting_pattern && (
                          <AccountingPatternSection
                            pattern={guide.accounting_pattern}
                            t={t}
                          />
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-3 border-t border-gray-100 pt-4 dark:border-slate-800">
                  {showDontShowAgain && guide && (
                    <label className="flex cursor-pointer items-center gap-2.5">
                      <Checkbox
                        id="dont-show-again"
                        checked={isAlreadySeen}
                        onCheckedChange={(checked) => {
                          if (checked) onMarkSeen()
                        }}
                      />
                      <span className="select-none text-xs text-gray-500 dark:text-gray-400">
                        {t.dontShow}
                      </span>
                    </label>
                  )}

                  <Button variant="outline" size="sm" className="w-full gap-2" onClick={onClose}>
                    <X className="h-3.5 w-3.5" />
                    {t.close}
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="copilot" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 dark:border-blue-800/40 dark:bg-blue-900/20">
                  <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-blue-700 dark:text-blue-300">
                    <ShieldCheck className="h-4 w-4" />
                    {t.copilotSafeTitle}
                  </div>
                  <p className="text-xs leading-relaxed text-blue-900 dark:text-blue-100">
                    {t.copilotSafeBody}
                  </p>
                </div>

                <div className={`mt-4 ${assistantScrollAreaClass}`}>
                  <div className="space-y-4 pb-4">
                    {isHydratingCopilot && <CopilotBootstrapSkeleton labels={t} />}

                    {activeCopilotPayload && (
                      <CopilotInteractivePanel
                        labels={t}
                        lang={lang}
                        payload={activeCopilotPayload}
                        onPromptSelect={(prompt) => void handleSend(prompt)}
                      />
                    )}

                    {messages.length === 0 ? (
                      <div className="space-y-4 rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-4 dark:border-slate-700 dark:bg-slate-900/50">
                        <div className="flex items-start gap-3">
                          <div className="rounded-xl bg-white p-2 shadow-sm dark:bg-slate-800">
                            <MessageSquare className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                          </div>
                          <div className="space-y-1">
                            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                              {t.copilotEmptyTitle}
                            </h3>
                            <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                              {t.copilotEmptyBody}
                            </p>
                            {guide?.title && (
                              <Badge variant="outline" className="mt-1">
                                {t.pageContext}: {guide.title}
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="space-y-2">
                          {suggestedPrompts.map((prompt) => (
                            <button
                              key={prompt}
                              type="button"
                              onClick={() => void handleSend(prompt)}
                              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-start text-sm text-gray-700 transition hover:border-blue-200 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:text-gray-200 dark:hover:border-blue-800 dark:hover:bg-blue-950/30"
                            >
                              {prompt}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      messages.map((message, index) => (
                        <ChatBubble
                          key={`${message.role}-${index}`}
                          lang={lang}
                          labels={t}
                          message={message}
                        />
                      ))
                    )}

                    {isSending && (
                      <div className="flex justify-start">
                        <div className="flex max-w-[88%] items-start gap-3">
                          <Avatar className="mt-0.5 size-8 border border-blue-200 bg-blue-100 dark:border-blue-800 dark:bg-blue-900/40">
                            <AvatarFallback className="bg-transparent text-blue-700 dark:text-blue-300">
                              <Bot className="h-4 w-4" />
                            </AvatarFallback>
                          </Avatar>
                          <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              {t.copilotThinking}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    <div ref={endRef} />
                  </div>
                </div>

                <div className="space-y-3 border-t border-gray-100 pt-4 dark:border-slate-800">
                  {copilotError && (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300">
                      {copilotError}
                    </div>
                  )}

                  <Textarea
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    placeholder={t.copilotInputPlaceholder}
                    disabled={!pageKey || isSending}
                    className="min-h-24 resize-none"
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault()
                        void handleSend()
                      }
                    }}
                  />

                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                      {t.copilotHint}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={onClose}>
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
                        {isSending ? t.copilotThinking : t.copilotSend}
                      </Button>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function CopilotInteractivePanel({
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
  const summary = typeof payload.summary === "string" ? payload.summary : ""
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
    <div className="space-y-4 rounded-2xl border border-blue-100 bg-white/90 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-950/70">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-sm font-semibold text-blue-700 dark:text-blue-300">
          <Sparkles className="h-4 w-4" />
          {labels.copilotLiveTitle}
        </div>
        <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
          {summary}
        </p>
      </div>

      {metrics.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            <TrendingUp className="h-3.5 w-3.5" />
            {labels.copilotMetrics}
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
            {labels.copilotInsights}
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
            {labels.copilotActions}
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
            {labels.copilotPredictions}
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
            {labels.copilotPrompts}
          </div>
          <div className="flex flex-wrap gap-2">
            {quickPrompts.slice(0, 5).map((prompt) => (
              <button
                key={`${prompt.category}-${prompt.label}`}
                type="button"
                onClick={() => onPromptSelect(prompt.prompt)}
                className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200"
                title={labels.copilotSendPrompt}
              >
                {prompt.label}
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        <span className="font-semibold text-slate-700 dark:text-slate-200">
          {lang === "ar" ? "الحوكمة:" : "Governance:"}
        </span>{" "}
        {governanceSummary.split("\n")[0]}
      </div>
    </div>
  )
}

function InsightCard({ insight }: { insight: AICopilotInteractivePayload["insights"][number] }) {
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

function CopilotBootstrapSkeleton({ labels }: { labels: Labels }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/50">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
        <Loader2 className="h-4 w-4 animate-spin" />
        {labels.copilotHistoryLoading}
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

function buildSuggestedPrompts(
  language: "ar" | "en",
  guideTitle?: string,
  pageKey?: string | null
): string[] {
  const base =
    language === "ar"
      ? [
      guideTitle
        ? `اشرح لي خطوات العمل في صفحة ${guideTitle}`
        : "اشرح لي خطوات العمل في هذه الصفحة",
      "ما الذي يمكنني فعله هنا حسب صلاحيتي الحالية؟",
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

type Labels = typeof L["ar"]

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
              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                {labels.fallback}
              </Badge>
            )}

            {!isUser && message.model && message.model !== "fallback" && (
              <Badge variant="outline" className="text-[10px]">
                {message.model}
              </Badge>
            )}
          </div>

          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {message.content}
          </p>
          {!isUser && message.fallbackUsed && message.fallbackReason && (
            <p className="mt-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
              {labels.fallbackReasonTitle}: {message.fallbackReason}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

interface AccountingPatternSectionProps {
  pattern: AccountingPattern
  t: Labels
}

function AccountingPatternSection({ pattern, t }: AccountingPatternSectionProps) {
  const impactRows: Array<{ key: keyof AccountingPattern["impact"]; label: string }> = [
    { key: "assets", label: t.assets },
    { key: "liabilities", label: t.liabilities },
    { key: "equity", label: t.equity },
    { key: "pl", label: t.pl },
  ]

  const isNoEntry =
    pattern.entries.length === 1 &&
    pattern.entries[0].side === "debit" &&
    (pattern.entries[0].account.startsWith("لا ") ||
      pattern.entries[0].account.toLowerCase().startsWith("no "))

  return (
    <section className="border-t border-purple-100 pt-5 dark:border-purple-900/40">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-200">
        <TrendingUp className="h-4 w-4 text-purple-500" />
        {t.accountingPattern}
      </h3>

      <div className="mb-4 rounded-lg border border-purple-100 bg-purple-50 px-3.5 py-3 dark:border-purple-800/40 dark:bg-purple-900/20">
        <p className="mb-1 text-xs font-semibold text-purple-600 dark:text-purple-400">
          {t.financialEvent}
        </p>
        <p className="text-sm leading-relaxed text-purple-900 dark:text-purple-100">
          {pattern.event}
        </p>
      </div>

      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {t.journalEntry}
      </p>
      {isNoEntry ? (
        <p className="mb-4 px-1 text-sm italic text-gray-400 dark:text-gray-500">
          {t.noEntries}
        </p>
      ) : (
        <div className="mb-4 overflow-hidden rounded-lg border border-gray-200 dark:border-slate-700">
          {pattern.entries.map((entry, index) => (
            <div
              key={index}
              className={`flex items-center gap-3 px-3 py-2 text-sm ${
                index % 2 === 0
                  ? "bg-white dark:bg-slate-900"
                  : "bg-gray-50 dark:bg-slate-800/60"
              }`}
            >
              <span
                className={`w-10 flex-shrink-0 rounded px-1.5 py-0.5 text-center text-xs font-bold ${
                  entry.side === "debit"
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                    : "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
                }`}
              >
                {entry.side === "debit" ? t.debit : t.credit}
              </span>
              <span className="leading-snug text-gray-700 dark:text-gray-300">
                {entry.account}
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {t.balanceImpact}
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
              <dd className="leading-snug text-gray-700 dark:text-gray-300">{value}</dd>
            </div>
          )
        })}
      </dl>
    </section>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-4 w-28" />
        {[1, 2, 3, 4].map((index) => (
          <div key={index} className="flex gap-3">
            <Skeleton className="h-6 w-6 rounded-full" />
            <Skeleton className="h-4 flex-1" />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        {[1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-10 w-full rounded-lg" />
        ))}
      </div>
      <div className="space-y-2 border-t border-purple-100 pt-4 dark:border-purple-900/40">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="mt-2 h-4 w-28" />
        {[1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-8 w-full rounded" />
        ))}
      </div>
    </div>
  )
}
