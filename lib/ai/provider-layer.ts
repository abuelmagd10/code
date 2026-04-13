import type { AICopilotInteractivePayload } from "@/lib/ai/contracts"
import {
  buildGuideContextBlock,
  type AICopilotContext,
} from "@/lib/ai/context-builder"

export type AIProviderName = "ollama" | "openai" | "fallback"

export interface AIProviderMessage {
  role: "user" | "assistant"
  content: string
}

export interface AIProviderReplyRequest {
  context: AICopilotContext
  messages: AIProviderMessage[]
  userMessage: string
  interactivePayload: AICopilotInteractivePayload
  fallbackAnswer: string
}

export interface AIProviderReply {
  provider: AIProviderName
  answer: string
  usedModel: string
  fallbackUsed: boolean
  fallbackReason?: string | null
  toolName: string
  auditMeta: Record<string, unknown>
}

export interface AIProviderHealth {
  provider: AIProviderName
  configured: boolean
  healthy: boolean
  baseUrl: string | null
  model: string | null
  fallbackReason?: string | null
  details: Record<string, unknown>
}

const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434"
const DEFAULT_OLLAMA_MODEL = "llama3"
const DEFAULT_OLLAMA_TIMEOUT_MS = 120000
const DEFAULT_OLLAMA_KEEP_ALIVE = "30m"
const DEFAULT_OLLAMA_MAX_TOKENS = 220
const DEFAULT_OLLAMA_CONTEXT_TOKENS = 4096
const MAX_OLLAMA_FULL_TIMEOUT_MS = 20000
const MAX_OLLAMA_COMPACT_TIMEOUT_MS = 12000
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com"
const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini"
const LOCAL_FALLBACK_MODEL = "fallback:local-erp-copilot-v2"

export async function generateAIProviderReply(
  request: AIProviderReplyRequest
): Promise<AIProviderReply> {
  const provider = resolveAIProvider()
  const prompt = buildProviderPrompt(request)
  const fastPathReply = maybeBuildFastPathProviderReply(request)

  if (fastPathReply) {
    return fastPathReply
  }

  if (provider === "openai") {
    return generateWithOpenAI(request, prompt)
  }

  if (provider === "ollama") {
    return generateWithOllama(request, prompt)
  }

  return buildFallbackProviderReply(request, null)
}

export function resolveAIProvider(): AIProviderName {
  const configured = String(process.env.AI_PROVIDER || "")
    .trim()
    .toLowerCase()

  if (configured === "ollama" || configured === "openai" || configured === "fallback") {
    return configured
  }

  if (process.env.OLLAMA_BASE_URL || process.env.OLLAMA_MODEL) {
    return "ollama"
  }

  if (process.env.OPENAI_API_KEY) {
    return "openai"
  }

  return "fallback"
}

export async function checkAIProviderHealth(): Promise<AIProviderHealth> {
  const provider = resolveAIProvider()

  if (provider === "ollama") {
    const baseUrl = getOllamaBaseUrl()
    const model = getOllamaModel()
    const tagsTimeoutMs = Math.min(getProviderTimeoutMs("ollama"), 15000)
    const probeTimeoutMs = Math.min(getProviderTimeoutMs("ollama"), 25000)

    try {
      const response = await fetch(`${baseUrl}/api/tags`, {
        method: "GET",
        headers: buildOllamaHeaders(),
        cache: "no-store",
        signal: AbortSignal.timeout(tagsTimeoutMs),
      })

      if (!response.ok) {
        return {
          provider,
          configured: true,
          healthy: false,
          baseUrl,
          model,
          fallbackReason: `ollama_http_${response.status}`,
          details: {
            status: response.status,
            statusText: response.statusText,
          },
        }
      }

      const data: any = await response.json()
      const models = Array.isArray(data?.models)
        ? data.models
            .map((item: any) => item?.name)
            .filter((name: unknown) => typeof name === "string")
        : []
      const probe = await requestOllamaCompletion({
        baseUrl,
        model,
        prompt:
          "Respond with exactly OK. Do not add punctuation or any extra words.",
        timeoutMs: probeTimeoutMs,
        promptVariant: "health",
        keepAlive: getOllamaKeepAlive(),
        maxTokens: 12,
        contextTokens: 512,
      })

      if (!probe.ok) {
        return {
          provider,
          configured: true,
          healthy: false,
          baseUrl,
          model,
          fallbackReason: probe.reason,
          details: {
            models,
            modelPresent: models.includes(model),
            probeVariant: probe.promptVariant,
            probeStatus: "failed",
            probeDurationMs: probe.durationMs,
            probeMessage: probe.message || null,
          },
        }
      }

      return {
        provider,
        configured: true,
        healthy: true,
        baseUrl,
        model,
        fallbackReason: null,
        details: {
          models,
          modelPresent: models.includes(model),
          probeVariant: probe.promptVariant,
          probeStatus: "ok",
          probeDurationMs: probe.durationMs,
          probeResponsePreview: limitText(probe.answer, 80),
        },
      }
    } catch (error: any) {
      return {
        provider,
        configured: true,
        healthy: false,
        baseUrl,
        model,
        fallbackReason:
          typeof error?.name === "string" && error.name === "TimeoutError"
            ? "ollama_timeout"
            : "ollama_connection_failed",
        details: {
          message: typeof error?.message === "string" ? error.message : null,
        },
      }
    }
  }

  if (provider === "openai") {
    const configured = Boolean(String(process.env.OPENAI_API_KEY || "").trim())
    return {
      provider,
      configured,
      healthy: configured,
      baseUrl: normalizeBaseUrl(process.env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL),
      model: String(process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL).trim(),
      fallbackReason: configured ? null : "openai_missing_api_key",
      details: {
        probe: "config_only",
      },
    }
  }

  return {
    provider: "fallback",
    configured: true,
    healthy: true,
    baseUrl: null,
    model: LOCAL_FALLBACK_MODEL,
    fallbackReason: null,
    details: {
      mode: "local_fallback_only",
    },
  }
}

async function generateWithOllama(
  request: AIProviderReplyRequest,
  prompt: string
): Promise<AIProviderReply> {
  const baseUrl = getOllamaBaseUrl()
  const model = getOllamaModel()
  const keepAlive = getOllamaKeepAlive()
  const maxTokens = getOllamaMaxTokens()
  const contextTokens = getOllamaContextTokens()
  const compactPrompt = buildCompactProviderPrompt(request)
  const preferCompactFirst = shouldPreferCompactOllamaPrompt(request, prompt)
  const promptAttempts = preferCompactFirst
    ? [{ prompt: compactPrompt, variant: "compact" as const }]
    : [
        { prompt, variant: "full" as const },
        { prompt: compactPrompt, variant: "compact" as const },
      ]

  let lastFailureReason: string | null = null

  for (const attempt of promptAttempts) {
    const result = await requestOllamaCompletion({
      baseUrl,
      model,
      prompt: attempt.prompt,
      timeoutMs: getOllamaRequestTimeoutMs(attempt.variant),
      promptVariant: attempt.variant,
      keepAlive,
      maxTokens: attempt.variant === "compact" ? Math.min(maxTokens, 160) : maxTokens,
      contextTokens: attempt.variant === "compact" ? Math.min(contextTokens, 2048) : contextTokens,
    })

    if (result.ok) {
      return {
        provider: "ollama",
        answer: result.answer,
        usedModel: `ollama:${model}`,
        fallbackUsed: false,
        fallbackReason: null,
        toolName: "ai.ollama.generate",
        auditMeta: {
          provider: "ollama",
          model,
          baseUrl,
          promptLength: attempt.prompt.length,
          promptVariant: result.promptVariant,
          durationMs: result.durationMs,
        },
      }
    }

    lastFailureReason = result.reason
    const shouldRetryCompact =
      attempt.variant === "full" &&
      (result.reason === "ollama_timeout" ||
        result.reason === "ollama_empty_response" ||
        result.reason === "ollama_http_500" ||
        result.reason === "ollama_http_502" ||
        result.reason === "ollama_http_503" ||
        result.reason === "ollama_http_504")

    if (!shouldRetryCompact) {
      break
    }
  }

  return buildFallbackProviderReply(request, lastFailureReason || "ollama_connection_failed")
}

function maybeBuildFastPathProviderReply(
  request: AIProviderReplyRequest
): AIProviderReply | null {
  const normalized = normalizeForHeuristics(request.userMessage)
  const shortQuestion = normalized.length > 0 && normalized.length <= 180
  const answerReadyLocally = request.fallbackAnswer.trim().length > 0 && request.fallbackAnswer.length <= 2600
  const quickGuidanceIntent = includesAny(normalized, [
    "من انت",
    "من انتي",
    "ما هي امكانياتك",
    "ما هى امكانياتك",
    "ما امكانياتك",
    "ما هى اكنياتك",
    "ما الذي يمكنني فعله",
    "ما الصلاحيات",
    "ما القيود",
    "ما الاعتمادات",
    "اشرح لي خطوات",
    "اشرح لي الخطوات",
    "اشرح لي دوره البيع",
    "اشرح لي دورة البيع",
    "اشرح لي دوره الشراء",
    "اشرح لي دورة الشراء",
    "كيف يمكنك مساعدتي",
    "كيف تساعدني",
    "ما الذي يوجد",
    "ما الموجود",
    "ماذا يوجد",
    "محتويات الصفحة",
    "ما معنى",
    "what can you do",
    "how can you help",
    "what can i do here",
    "what approvals",
    "what constraints",
    "explain the workflow",
    "explain the sales cycle",
    "explain the purchase cycle",
    "what is on this page",
    "page contents",
    "what does this mean",
  ])

  if (!shortQuestion || !answerReadyLocally || !quickGuidanceIntent) {
    return null
  }

  return {
    provider: "fallback",
    answer: request.fallbackAnswer,
    usedModel: "local-fastpath:local-erp-copilot-v2",
    fallbackUsed: false,
    fallbackReason: null,
    toolName: "ai.local_fast_path.generate",
    auditMeta: {
      provider: "fallback",
      fastPath: true,
      fastPathReason: "guided_local_answer",
      promptLength: request.fallbackAnswer.length,
      userMessageLength: request.userMessage.length,
    },
  }
}

async function generateWithOpenAI(
  request: AIProviderReplyRequest,
  prompt: string
): Promise<AIProviderReply> {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim()
  if (!apiKey) {
    return buildFallbackProviderReply(request, "openai_missing_api_key")
  }

  const baseUrl = normalizeBaseUrl(
    process.env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL
  )
  const model = String(process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL).trim()

  try {
    const response = await fetch(`${baseUrl}/v1/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: prompt,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(getProviderTimeoutMs()),
    })

    if (!response.ok) {
      return buildFallbackProviderReply(
        request,
        `openai_http_${response.status}`
      )
    }

    const data: any = await response.json()
    const answer = extractOpenAIText(data)

    if (!answer) {
      return buildFallbackProviderReply(request, "openai_empty_response")
    }

    return {
      provider: "openai",
      answer,
      usedModel: `openai:${model}`,
      fallbackUsed: false,
      fallbackReason: null,
      toolName: "ai.openai.generate",
      auditMeta: {
        provider: "openai",
        model,
        baseUrl,
        promptLength: prompt.length,
      },
    }
  } catch (error: any) {
    const reason =
      typeof error?.name === "string" && error.name === "TimeoutError"
        ? "openai_timeout"
        : "openai_connection_failed"

    return buildFallbackProviderReply(request, reason)
  }
}

function buildFallbackProviderReply(
  request: AIProviderReplyRequest,
  fallbackReason: string | null
): AIProviderReply {
  return {
    provider: "fallback",
    answer: request.fallbackAnswer,
    usedModel: LOCAL_FALLBACK_MODEL,
    fallbackUsed: Boolean(fallbackReason),
    fallbackReason,
    toolName: fallbackReason
      ? "ai.fallback.generate"
      : "ai.fallback.local_generate",
    auditMeta: {
      provider: "fallback",
      fallbackReason,
      promptLength: buildProviderPrompt(request).length,
    },
  }
}

function buildProviderPrompt(request: AIProviderReplyRequest) {
  const { context, messages, userMessage, interactivePayload, fallbackAnswer } = request
  const history = messages
    .slice(-4)
    .map(
      (message) =>
        `${message.role === "user" ? "User" : "Assistant"}: ${limitText(message.content, 280)}`
    )
    .join("\n")

  const metricsBlock =
    interactivePayload.metrics.length > 0
      ? interactivePayload.metrics
          .slice(0, 8)
          .map((metric) => `- ${metric.label}: ${metric.value}`)
          .join("\n")
      : context.language === "ar"
        ? "- لا توجد مؤشرات حية متاحة حالياً."
        : "- No live metrics are currently available."

  const insightsBlock =
    interactivePayload.insights.length > 0
      ? interactivePayload.insights
          .slice(0, 4)
          .map((insight) => `- ${insight.title}: ${insight.summary}`)
          .join("\n")
      : context.language === "ar"
        ? "- لا توجد تنبيهات حية حالياً."
        : "- No live alerts are currently available."

  const nextActionsBlock =
    interactivePayload.nextActions.length > 0
      ? interactivePayload.nextActions
          .slice(0, 3)
          .map((action) => `- ${action.title}: ${action.summary}`)
          .join("\n")
      : context.language === "ar"
        ? "- لا توجد إجراءات مقترحة حالياً."
        : "- No suggested actions are currently available."

  const predictedBlock =
    interactivePayload.predictedActions.length > 0
      ? interactivePayload.predictedActions
          .slice(0, 3)
          .map((item) => `- ${item.title}: ${item.summary}`)
          .join("\n")
      : context.language === "ar"
        ? "- لا توجد خطوة متوقعة واضحة حالياً."
        : "- No clear predicted next step is currently available."

  const guideBlock = limitText(
    buildGuideContextBlock(context.guide, context.language),
    1600
  )
  const liveSummary = limitText(context.liveContext.summary, 700)
  const governanceSummary = limitText(context.governanceSummary, 900)
  const referenceAnswer = limitText(fallbackAnswer, 1800)
  const normalizedUserMessage = limitText(userMessage, 900)

  if (context.language === "ar") {
    return [
      "أنت مساعد ERP محلي يعمل داخل طبقة حوكمة صارمة.",
      "يجب أن تبقى كل الإجابات للقراءة فقط.",
      "ممنوع تماماً أن تدعي أنك نفذت أي عملية أو اعتمدت أو عدلت أي بيانات.",
      "يجب أن تعتمد فقط على السياق التالي، وألا تختلق أي بيانات غير موجودة.",
      "إذا كان السؤال اجتماعياً أو تحية، رد بشكل طبيعي ومهني ثم اشرح باختصار كيف يمكنك المساعدة داخل الصفحة الحالية.",
      "إذا كان السؤال عن الصلاحيات، ركز على ما يمكن للمستخدم فعله وفق الدور والصلاحيات الحالية.",
      "إذا كان السؤال عن الخطوات، استخدم دليل الصفحة أولاً ثم اربطه بالبيانات الحية والحوكمة.",
      "أجب بالعربية الواضحة والمنظمة، وتجنب تكرار نفس القالب إذا لم يكن مناسبًا.",
      "اجعل الإجابة مختصرة نسبيًا ومباشرة، ولا تتجاوز ما يحتاجه المستخدم.",
      `السياق الحي:\n${liveSummary}`,
      `الحوكمة الحالية:\n${governanceSummary}`,
      `مؤشرات الصفحة:\n${metricsBlock}`,
      `تنبيهات ذكية:\n${insightsBlock}`,
      `إجراءات مقترحة:\n${nextActionsBlock}`,
      `الخطوة التالية المتوقعة:\n${predictedBlock}`,
      `دليل الصفحة:\n${guideBlock}`,
      history ? `آخر المحادثة:\n${history}` : "لا توجد محادثة سابقة مهمة.",
      `السؤال الحالي:\n${normalizedUserMessage}`,
      `إجابة مرجعية محلية منضبطة يمكنك تحسين صياغتها دون الخروج عن مضمونها:\n${referenceAnswer}`,
      "أجب الآن بإجابة مفيدة، طبيعية، ومختصرة نسبيًا، مع الحفاظ على الدقة والحوكمة.",
    ].join("\n\n")
  }

  return [
    "You are a local ERP copilot operating under strict governance.",
    "All answers must remain read-only.",
    "Never claim that you executed, approved, posted, or modified any real data.",
    "Use only the grounded ERP context below and do not invent data.",
    "If the question is social or a greeting, answer naturally and then explain briefly how you can help on the current page.",
    "If the question is about permissions, focus on what the current role and permissions allow.",
    "If the question is about workflow, use the page guide first and then connect it to live ERP context and governance.",
    "Answer in clear professional English and avoid repeating the same template when it is not relevant.",
    "Keep the answer relatively concise and directly useful.",
    `Live context:\n${liveSummary}`,
    `Current governance:\n${governanceSummary}`,
    `Page metrics:\n${metricsBlock}`,
    `Smart alerts:\n${insightsBlock}`,
    `Suggested actions:\n${nextActionsBlock}`,
    `Predicted next step:\n${predictedBlock}`,
    `Page guide:\n${guideBlock}`,
    history ? `Recent conversation:\n${history}` : "No important previous conversation.",
    `Current question:\n${normalizedUserMessage}`,
    `Grounded local reference answer you may refine without changing its meaning:\n${referenceAnswer}`,
    "Respond now with a useful, natural, and relatively concise answer while preserving accuracy and governance.",
  ].join("\n\n")
}

function buildCompactProviderPrompt(request: AIProviderReplyRequest) {
  const { context, userMessage, interactivePayload, fallbackAnswer } = request
  const guideTitle =
    context.guide?.title ||
    (context.language === "ar" ? "الصفحة الحالية" : "the current page")
  const topMetrics =
    interactivePayload.metrics.length > 0
      ? interactivePayload.metrics
          .slice(0, 3)
          .map((metric) => `- ${metric.label}: ${metric.value}`)
          .join("\n")
      : context.language === "ar"
        ? "- لا توجد مؤشرات إضافية."
        : "- No additional metrics."
  const topInsights =
    interactivePayload.insights.length > 0
      ? interactivePayload.insights
          .slice(0, 2)
          .map((insight) => `- ${insight.title}: ${insight.summary}`)
          .join("\n")
      : context.language === "ar"
        ? "- لا توجد تنبيهات حية."
        : "- No live alerts."
  const referenceAnswer = limitText(fallbackAnswer, 1200)
  const governanceSummary = limitText(context.governanceSummary, 420)
  const normalizedUserMessage = limitText(userMessage, 600)

  if (context.language === "ar") {
    return [
      "أنت مساعد ERP محلي داخل طبقة حوكمة صارمة.",
      "الرد للقراءة فقط ولا تدعِ تنفيذ أي إجراء.",
      "أجب بالعربية الطبيعية في فقرة أو فقرتين قصيرتين أو نقاط قليلة جدًا.",
      `الصفحة الحالية: ${guideTitle}`,
      `الحوكمة: ${governanceSummary}`,
      `أهم المؤشرات:\n${topMetrics}`,
      `أهم التنبيهات:\n${topInsights}`,
      `السؤال:\n${normalizedUserMessage}`,
      `إجابة مرجعية منضبطة:\n${referenceAnswer}`,
      "أعد صياغة الإجابة بشكل أوضح وأقصر وأكثر طبيعية دون اختلاق أي بيانات جديدة.",
    ].join("\n\n")
  }

  return [
    "You are a local ERP copilot operating under strict governance.",
    "Remain read-only and never claim execution of any real action.",
    "Answer in one or two short paragraphs or a very small bullet list.",
    `Current page: ${guideTitle}`,
    `Governance: ${governanceSummary}`,
    `Top metrics:\n${topMetrics}`,
    `Top alerts:\n${topInsights}`,
    `Question:\n${normalizedUserMessage}`,
    `Grounded reference answer:\n${referenceAnswer}`,
    "Rewrite the answer to be clearer, shorter, and more natural without inventing any new data.",
  ].join("\n\n")
}

function extractOpenAIText(data: any) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim()
  }

  if (!Array.isArray(data?.output)) {
    return ""
  }

  const parts: string[] = []
  for (const item of data.output) {
    if (!Array.isArray(item?.content)) continue
    for (const content of item.content) {
      if (typeof content?.text === "string" && content.text.trim()) {
        parts.push(content.text.trim())
      }
    }
  }

  return parts.join("\n\n").trim()
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "")
}

function getOllamaBaseUrl() {
  return normalizeBaseUrl(process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL)
}

function getOllamaModel() {
  return String(process.env.OLLAMA_MODEL || DEFAULT_OLLAMA_MODEL).trim()
}

function getProviderTimeoutMs(provider?: AIProviderName) {
  const fallbackMs = provider === "ollama" ? DEFAULT_OLLAMA_TIMEOUT_MS : 30000
  const raw = Number.parseInt(
    String(process.env.AI_PROVIDER_TIMEOUT_MS || fallbackMs),
    10
  )
  return Number.isFinite(raw) && raw >= 1000 ? raw : fallbackMs
}

function getOllamaRequestTimeoutMs(promptVariant: "full" | "compact" | "health") {
  const configured = getProviderTimeoutMs("ollama")

  if (promptVariant === "health") {
    return Math.min(configured, 25000)
  }

  if (promptVariant === "compact") {
    return Math.min(configured, MAX_OLLAMA_COMPACT_TIMEOUT_MS)
  }

  return Math.min(configured, MAX_OLLAMA_FULL_TIMEOUT_MS)
}

function getOllamaKeepAlive() {
  return String(process.env.OLLAMA_KEEP_ALIVE || DEFAULT_OLLAMA_KEEP_ALIVE).trim()
}

function getOllamaMaxTokens() {
  const raw = Number.parseInt(
    String(process.env.OLLAMA_MAX_TOKENS || DEFAULT_OLLAMA_MAX_TOKENS),
    10
  )
  return Number.isFinite(raw) && raw >= 32 ? raw : DEFAULT_OLLAMA_MAX_TOKENS
}

function getOllamaContextTokens() {
  const raw = Number.parseInt(
    String(process.env.OLLAMA_CONTEXT_TOKENS || DEFAULT_OLLAMA_CONTEXT_TOKENS),
    10
  )
  return Number.isFinite(raw) && raw >= 512 ? raw : DEFAULT_OLLAMA_CONTEXT_TOKENS
}

function buildOllamaHeaders() {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }

  const token = String(
    process.env.OLLAMA_API_KEY || process.env.OLLAMA_AUTH_TOKEN || ""
  ).trim()
  if (!token) {
    return headers
  }

  const headerName = String(process.env.OLLAMA_AUTH_HEADER || "").trim()
  if (headerName) {
    headers[headerName] = token
    return headers
  }

  headers.Authorization = `Bearer ${token}`
  return headers
}

async function requestOllamaCompletion(params: {
  baseUrl: string
  model: string
  prompt: string
  timeoutMs: number
  promptVariant: "full" | "compact" | "health"
  keepAlive: string
  maxTokens: number
  contextTokens: number
}): Promise<
  | {
      ok: true
      answer: string
      promptVariant: "full" | "compact" | "health"
      durationMs: number
    }
  | {
      ok: false
      reason: string
      promptVariant: "full" | "compact" | "health"
      durationMs: number
      message?: string
    }
> {
  const startedAt = Date.now()

  try {
    const response = await fetch(`${params.baseUrl}/api/generate`, {
      method: "POST",
      headers: buildOllamaHeaders(),
      body: JSON.stringify({
        model: params.model,
        prompt: params.prompt,
        stream: false,
        keep_alive: params.keepAlive,
        options: {
          temperature: params.promptVariant === "health" ? 0 : 0.2,
          num_predict: params.maxTokens,
          num_ctx: params.contextTokens,
        },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(params.timeoutMs),
    })

    const durationMs = Date.now() - startedAt

    if (!response.ok) {
      return {
        ok: false,
        reason: `ollama_http_${response.status}`,
        promptVariant: params.promptVariant,
        durationMs,
        message: response.statusText,
      }
    }

    const data: any = await response.json()
    const answer =
      typeof data?.response === "string" ? data.response.trim() : ""

    if (!answer) {
      return {
        ok: false,
        reason: "ollama_empty_response",
        promptVariant: params.promptVariant,
        durationMs,
      }
    }

    return {
      ok: true,
      answer,
      promptVariant: params.promptVariant,
      durationMs,
    }
  } catch (error: any) {
    return {
      ok: false,
      reason:
        typeof error?.name === "string" && error.name === "TimeoutError"
          ? "ollama_timeout"
          : "ollama_connection_failed",
      promptVariant: params.promptVariant,
      durationMs: Date.now() - startedAt,
      message: typeof error?.message === "string" ? error.message : undefined,
    }
  }
}

function shouldPreferCompactOllamaPrompt(
  request: AIProviderReplyRequest,
  fullPrompt: string
) {
  const normalized = normalizeForHeuristics(request.userMessage)
  const isGreetingOrCapability = includesAny(normalized, [
    "من انت",
    "من انتي",
    "مساء الخير",
    "صباح الخير",
    "مرحبا",
    "اهلا",
    "hello",
    "good morning",
    "good evening",
    "what can you do",
    "كيف يمكنك",
    "كيف تساعد",
    "امكاني",
    "قدرات",
  ])

  return (
    isGreetingOrCapability ||
    fullPrompt.length >= 3600 ||
    request.messages.length >= 8
  )
}

function normalizeForHeuristics(value: string) {
  return value
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[ؤئ]/g, "ء")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function includesAny(text: string, values: string[]) {
  return values.some((value) => text.includes(value))
}

function limitText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}
