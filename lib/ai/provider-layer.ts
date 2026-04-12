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
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com"
const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini"
const LOCAL_FALLBACK_MODEL = "fallback:local-erp-copilot-v2"

export async function generateAIProviderReply(
  request: AIProviderReplyRequest
): Promise<AIProviderReply> {
  const provider = resolveAIProvider()
  const prompt = buildProviderPrompt(request)

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

    try {
      const response = await fetch(`${baseUrl}/api/tags`, {
        method: "GET",
        headers: buildOllamaHeaders(),
        cache: "no-store",
        signal: AbortSignal.timeout(getProviderTimeoutMs()),
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

  try {
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: buildOllamaHeaders(),
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          temperature: 0.2,
        },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(getProviderTimeoutMs()),
    })

    if (!response.ok) {
      return buildFallbackProviderReply(
        request,
        `ollama_http_${response.status}`
      )
    }

    const data: any = await response.json()
    const answer =
      typeof data?.response === "string" ? data.response.trim() : ""

    if (!answer) {
      return buildFallbackProviderReply(request, "ollama_empty_response")
    }

    return {
      provider: "ollama",
      answer,
      usedModel: `ollama:${model}`,
      fallbackUsed: false,
      fallbackReason: null,
      toolName: "ai.ollama.generate",
      auditMeta: {
        provider: "ollama",
        model,
        baseUrl,
        promptLength: prompt.length,
      },
    }
  } catch (error: any) {
    const reason =
      typeof error?.name === "string" && error.name === "TimeoutError"
        ? "ollama_timeout"
        : "ollama_connection_failed"

    return buildFallbackProviderReply(request, reason)
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
    .slice(-6)
    .map((message) => `${message.role === "user" ? "User" : "Assistant"}: ${message.content}`)
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

  const guideBlock = buildGuideContextBlock(context.guide, context.language)

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
      `السياق الحي:\n${context.liveContext.summary}`,
      `الحوكمة الحالية:\n${context.governanceSummary}`,
      `مؤشرات الصفحة:\n${metricsBlock}`,
      `تنبيهات ذكية:\n${insightsBlock}`,
      `إجراءات مقترحة:\n${nextActionsBlock}`,
      `الخطوة التالية المتوقعة:\n${predictedBlock}`,
      `دليل الصفحة:\n${guideBlock}`,
      history ? `آخر المحادثة:\n${history}` : "لا توجد محادثة سابقة مهمة.",
      `السؤال الحالي:\n${userMessage}`,
      `إجابة مرجعية محلية منضبطة يمكنك تحسين صياغتها دون الخروج عن مضمونها:\n${fallbackAnswer}`,
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
    `Live context:\n${context.liveContext.summary}`,
    `Current governance:\n${context.governanceSummary}`,
    `Page metrics:\n${metricsBlock}`,
    `Smart alerts:\n${insightsBlock}`,
    `Suggested actions:\n${nextActionsBlock}`,
    `Predicted next step:\n${predictedBlock}`,
    `Page guide:\n${guideBlock}`,
    history ? `Recent conversation:\n${history}` : "No important previous conversation.",
    `Current question:\n${userMessage}`,
    `Grounded local reference answer you may refine without changing its meaning:\n${fallbackAnswer}`,
    "Respond now with a useful, natural, and relatively concise answer while preserving accuracy and governance.",
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

function getProviderTimeoutMs() {
  const raw = Number.parseInt(String(process.env.AI_PROVIDER_TIMEOUT_MS || "30000"), 10)
  return Number.isFinite(raw) && raw >= 1000 ? raw : 30000
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
